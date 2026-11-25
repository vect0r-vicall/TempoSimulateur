// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Scene -> SVG DOM. Only createElementNS, presentation attributes and CSS classes (no style attribute). */
import { Scene } from '../core/scene';
import { DrillView } from '../core/view';
import { Seg } from '../core/weather';
import { ICONS, ICON_H, ICON_SIZE, IconEl } from './icons';

const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, cls?: string, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : v);
  if (cls) e.setAttribute('class', cls);
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface SvgChart {
  svg: SVGSVGElement;
  groups: SVGGElement[];
  hideTip(): void;
}

function iconEl(d: IconEl): SVGElement {
  const e = s(d.tag, d.attrs, d.cls);
  for (const k of d.kids ?? []) e.append(iconEl(k));
  return e;
}

const MAX_TIP_LINES = 9; // longest tooltip: title + 3 offers + consumption + weather + temperature + wind + precipitation = 9

/** Right-hand degC axis and smoothed trend line (drawn under the bars' hit areas, never interactive). */
function s_weather(scene: Scene): SVGGElement | null {
  const w = scene.weather;
  if (!w || (w.ticks.length === 0 && w.segments.length === 0)) return null;
  const { plot } = scene;
  const g = s('g', {}, 'weather');
  g.setAttribute('aria-hidden', 'true');
  const ax = plot.x + plot.w;
  for (const t of w.ticks) g.append(s('text', { x: ax + 8, y: t.y + 4, 'text-anchor': 'start' }, 'tick tick-temp', t.label));
  g.append(s('text', { x: ax + 8, y: plot.y - 8, 'text-anchor': 'start' }, 'tick tick-temp unit', w.unit));
  // drawn min, max, then mean on top
  const series: Array<[string, typeof w.segments]> = [['t-min', w.minSegments], ['t-max', w.maxSegments], ['t-mean', w.segments]];
  for (const [id, segs] of series) {
    for (const seg of segs) {
      const d = seg.length === 1
        ? `M${seg[0]!.x} ${seg[0]!.y}l0 0`
        : seg.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join('');
      for (const cls of ['trend-halo', `trend-line ${id}`]) g.append(s('path', { d, fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, cls));
    }
  }
  return g;
}

/** Hover/focus only shows the SVG tooltip; click or Enter/Space on a group calls onDrill. */
export function renderSvg(scene: Scene, onDrill: (target: DrillView, viaKeyboard: boolean) => void): SvgChart {
  const { width, height, plot } = scene;
  const day = scene.granularity === 'day';
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'xMidYMid meet', focusable: 'false' }, 'chart-svg');
  svg.setAttribute('role', day ? 'img' : 'group');
  svg.setAttribute('aria-label', scene.summary);
  if (day) {
    svg.classList.add('is-day');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('focusable', 'true');
  }

  // hatch for HP parts (colour-blind aid) and dots for unknown colour
  const defs = s('defs');
  const hatch = s('pattern', { id: 'hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(s('line', { x1: 0, y1: 0, x2: 0, y2: 5, 'stroke-width': 2 }, 'hatch-line'));
  const dots = s('pattern', { id: 'dots', width: 5, height: 5, patternUnits: 'userSpaceOnUse' });
  dots.append(s('circle', { cx: 2.5, cy: 2.5, r: 1 }, 'dot'));
  defs.append(hatch, dots);
  svg.append(defs);

  // grid + value axis
  const grid = s('g', {}, 'axis');
  for (const t of scene.ticks) {
    grid.append(s('line', { x1: plot.x, x2: plot.x + plot.w, y1: t.y, y2: t.y }, t.value === 0 ? 'axis-base' : 'grid-line'));
    grid.append(s('text', { x: plot.x - 8, y: t.y + 4, 'text-anchor': 'end' }, 'tick', t.label));
  }
  svg.append(grid);

  const groupEls: SVGGElement[] = [];
  const gLayer = s('g', {}, 'groups');
  const labels = s('g', {}, 'axis-labels');
  scene.groups.forEach((g, gi) => {
    const ge = s('g', {}, g.drill ? 'grp clickable' : 'grp');
    if (day) ge.setAttribute('aria-hidden', 'true');
    else {
      ge.setAttribute('tabindex', '0');
      ge.setAttribute('role', g.drill ? 'button' : 'group');
      ge.setAttribute('aria-label', g.aria);
    }
    ge.append(s('rect', { x: g.x, y: plot.y, width: g.w, height: plot.h + 22, fill: 'transparent' }, 'grp-hit'));
    for (const b of g.bars) {
      const be = s('g', {}, 'bar');
      // the group's aria-label summarises its bars; no nested role=img (presentational children)
      be.setAttribute('aria-hidden', 'true');
      b.segments.forEach((sg, si) => {
        const r = s('rect', { x: b.x, y: sg.y, width: b.w, height: Math.max(0, sg.h) }, `seg ${sg.cls}`);
        r.setAttribute('data-i', String(si));
        be.append(r);
        if (!day && sg.tone === 'HP' && sg.h > 1) be.append(s('rect', { x: b.x, y: sg.y, width: b.w, height: sg.h, fill: 'url(#hatch)' }, 'overlay'));
        if (!day && sg.colour === 'U' && sg.h > 1) be.append(s('rect', { x: b.x, y: sg.y, width: b.w, height: sg.h, fill: 'url(#dots)' }, 'overlay'));
      });
      if (!day && b.label.mode !== 'none' && b.totalMicro > 0) {
        be.append(s('text', { x: b.x + b.w / 2, y: b.y - 3, 'text-anchor': 'middle' }, 'bar-tag', b.label.text));
      }
      ge.append(be);
    }
    if (g.glyph) {
      const { x, y, size, kind } = g.glyph;
      const gl = s('svg', { x: x - size / 2, y, width: size, height: (size * ICON_H) / ICON_SIZE, viewBox: `0 2 ${ICON_SIZE} ${ICON_H}` }, `wx-icon wx-${kind}`);
      gl.setAttribute('aria-hidden', 'true');
      for (const d of ICONS[kind]) gl.append(iconEl(d));
      ge.append(gl);
    }
    if (g.ratio) {
      const r = g.ratio;
      ge.append(s('rect', { x: r.x, y: r.y, width: r.hcW, height: r.h }, 'ratio seg-ratio-hc'));
      ge.append(s('rect', { x: r.x + r.hcW, y: r.y, width: r.w - r.hcW, height: r.h }, 'ratio seg-ratio-hp'));
    }
    ge.addEventListener('mouseenter', () => showTip(gi));
    ge.addEventListener('mouseleave', hideTip);
    ge.addEventListener('focus', () => showTip(gi));
    ge.addEventListener('blur', hideTip);
    const target = g.drill;
    if (target) {
      ge.addEventListener('click', () => onDrill(target, false));
      ge.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onDrill(target, true);
        }
      });
    }
    gLayer.append(ge);
    groupEls.push(ge);
    if (g.axisLabel) {
      labels.append(s('text', { x: g.cx, y: plot.y + plot.h + 28, 'text-anchor': 'middle' }, 'xlabel', g.axisLabel));
      if (g.axisSub) labels.append(s('text', { x: g.cx, y: plot.y + plot.h + 42, 'text-anchor': 'middle' }, 'xlabel sub', g.axisSub));
    }
  });
  svg.append(gLayer, labels);
  const wx = s_weather(scene);
  if (wx) svg.append(wx);

  // tooltip (SVG, text only)
  const tip = s('g', { transform: 'translate(0 0)' }, 'tip');
  tip.setAttribute('aria-hidden', 'true');
  const bg = s('rect', { x: 0, y: 0, width: 10, height: 10, rx: 6 }, 'tip-bg');
  tip.append(bg);
  const lines: SVGTextElement[] = [];
  for (let i = 0; i < MAX_TIP_LINES; i++) {
    const t = s('text', { x: 8, y: 16 + i * 15 }, i === 0 ? 'tip-text title' : 'tip-text');
    lines.push(t);
    tip.append(t);
  }
  svg.append(tip);

  function showTip(gi: number): void {
    const g = scene.groups[gi]!;
    const txt = g.tip.slice(0, MAX_TIP_LINES);
    lines.forEach((t, i) => {
      t.textContent = ''; // only the plain text and tspans carrying a CSS class
      for (const seg of (g.tipRich[i] ?? []) as Seg[]) {
        if (seg.cls) t.append(s('tspan', {}, seg.cls, seg.text));
        else t.append(document.createTextNode(seg.text));
      }
    });
    const w = Math.ceil(Math.max(...txt.map((x) => x.length)) * 6.6 + 16);
    const h = txt.length * 15 + 8;
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    let x = g.cx + 14;
    if (x + w > width - 4) x = g.cx - w - 14;
    if (x < 4) x = 4;
    tip.setAttribute('transform', `translate(${Math.round(x)} ${Math.round(plot.y + 4)})`);
    tip.setAttribute('class', 'tip on');
  }
  function hideTip(): void {
    tip.setAttribute('class', 'tip');
  }
  return { svg, groups: groupEls, hideTip };
}
