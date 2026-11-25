// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/**
 * Chart card: view title + Retour, granularity toggle, "Aller à" select, legend blocks, SVG.
 * The controller owns the view state; drill-down ranges are computed from the priced range and
 * re-analysed with the same kVA, independently of the recap's selected period.
 */
import { Analysis } from '../core/recap';
import { OfferId } from '../core/pricing';
import { Period } from '../core/period';
import { Granularity, Scene, buildScene, dayAllowed } from '../core/scene';
import { LegendBlock, LegendEntry } from '../core/legend';
import { DailyTemp } from '../core/weather';
import { View, viewBack, viewGranularity, viewRange, viewTitle, gotoModel, parseGotoValue, DrillView } from '../core/view';
import { frDate } from '../core/format';
import { viewRecap } from '../core/viewrecap';
import { el, node } from './dom';
import { renderSvg } from './svg';

const GRANS: { id: Granularity; label: string }[] = [
  { id: 'year', label: 'Année' },
  { id: 'month', label: 'Mois' },
  { id: 'day', label: 'Jour' },
];
const MIN_WIDTH = 520;
const NS = 'http://www.w3.org/2000/svg';

export interface ChartInput {
  a: Analysis; // analysis of the selected period
  selected: OfferId[];
  priced: Period; // imported (priced) day range
  analyseFor(p: Period): Analysis; // same kVA, other range (drill-down views)
  weather?: DailyTemp[] | null; // opt-in daily temperatures; null/absent = overlay off
}
export interface Chart {
  render(input: ChartInput): void;
  /** Back to the period-based view (period changed, new file). */
  resetView(): void;
}

function swatch(e: LegendEntry): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 28 18');
  svg.setAttribute('class', 'swatch');
  svg.setAttribute('aria-hidden', 'true');
  const mk = (fill?: string) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', '1');
    r.setAttribute('y', '1');
    r.setAttribute('width', '26');
    r.setAttribute('height', '16');
    r.setAttribute('rx', '3');
    if (fill) {
      r.setAttribute('fill', fill);
      r.setAttribute('class', 'overlay');
    } else r.setAttribute('class', `seg ${e.cls}`);
    return r;
  };
  svg.append(mk());
  // same overlays as the bars (patterns live in the chart SVG defs, same document)
  if (e.hatch) svg.append(mk('url(#hatch)'));
  if (e.dots) svg.append(mk('url(#dots)'));
  return svg;
}

function weatherLegend(label: string): HTMLElement {
  const box = node('section', 'legend-block');
  const h = node('h3', 'legend-title');
  h.append(node('span', undefined, 'Météo'));
  const sw = document.createElementNS(NS, 'svg');
  sw.setAttribute('viewBox', '0 0 28 18');
  sw.setAttribute('class', 'swatch');
  sw.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', 'M2 13L10 6L18 11L26 4');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('class', 'trend-line');
  const halo = line.cloneNode(false) as SVGPathElement;
  halo.setAttribute('class', 'trend-halo');
  sw.append(halo, line);
  const li = node('li', 'legend-item');
  li.append(sw, node('span', undefined, label));
  const ul = node('ul', 'legend-list');
  ul.append(li);
  box.append(h, ul);
  return box;
}

function legendBlock(b: LegendBlock): HTMLElement {
  const box = node('section', b.id === 'ratio' ? 'legend-block ratio-block' : 'legend-block');
  const h = node('h3', 'legend-title');
  h.append(node('span', undefined, b.title));
  if (b.tag) {
    const tag = node('span', 'legend-tag', b.tag);
    tag.title = `Étiquette de barre : ${b.tag}`;
    h.append(tag);
  }
  box.append(h);
  if (b.entries.length) {
    const ul = node('ul', 'legend-list');
    for (const e of b.entries) {
      const li = node('li', 'legend-item');
      li.append(swatch(e), node('span', undefined, e.label));
      ul.append(li);
    }
    box.append(ul);
  }
  if (b.note) box.append(node('p', 'legend-note', b.note));
  return box;
}

export function initChart(): Chart {
  const root = el<HTMLElement>('chart');
  root.replaceChildren();
  let periodGran: Granularity = 'month';
  let view: View = { kind: 'period', gran: periodGran };
  let last: ChartInput | null = null;
  let lastWidth = 0;

  root.append(node('h2', undefined, 'Graphique des coûts'));

  const head = node('div', 'chart-view');
  const title = node('p', 'chart-view-title');
  title.tabIndex = -1;
  const back = node('button', 'back-btn', 'Retour');
  back.type = 'button';
  back.addEventListener('click', () => {
    view = viewBack(view);
    draw();
    title.focus();
  });
  head.append(title, back);
  const differs = node('p', 'notice chart-differs');

  // totals of the range the chart shows (same analysis as the scene)
  const vr = node('section', 'view-recap');
  const vrTitle = node('h3', 'view-recap-title');
  vrTitle.id = 'view-recap-title';
  vr.setAttribute('aria-labelledby', 'view-recap-title');
  const vrList = node('ul', 'view-offers');
  const vrDays = node('p', 'view-recap-days');
  vr.append(vrTitle, vrList, vrDays);
  const vrStatus = node('p', 'visually-hidden');
  vrStatus.setAttribute('role', 'status');
  vrStatus.setAttribute('aria-live', 'polite');

  const bar = node('div', 'chart-toolbar');
  const toggle = node('div', 'seg-toggle');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Granularité du graphique');
  const buttons = new Map<Granularity, HTMLButtonElement>();
  for (const g of GRANS) {
    const b = node('button', 'toggle-btn', g.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      periodGran = g.id;
      view = { kind: 'period', gran: g.id };
      draw();
    });
    buttons.set(g.id, b);
    toggle.append(b);
  }
  const goto = node('div', 'field goto');
  const gotoLabel = node('label', undefined, 'Aller à');
  gotoLabel.htmlFor = 'chart-goto';
  const select = node('select');
  select.id = 'chart-goto';
  select.addEventListener('change', () => {
    const v = parseGotoValue(select.value);
    if (v) view = v;
    draw();
  });
  goto.append(gotoLabel, select);
  bar.append(toggle, goto);

  const msg = node('p', 'chart-msg');
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  const hint = node('p', 'hint chart-hint', 'Cliquez sur une barre (ou Entrée sur un groupe) pour le détailler.');
  const legend = node('div', 'legend');
  const wrap = node('div', 'chart-wrap');
  const summary = node('p', 'visually-hidden');
  const notes = node('p', 'chart-notes');
  root.append(head, differs, vr, vrStatus, bar, msg, hint, wrap, summary, notes, legend);

  function fillOptions(priced: Period): void {
    const model = gotoModel(view, priced);
    const mk = (o: { value: string; label: string }) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      return opt;
    };
    select.replaceChildren();
    if (model.placeholder) {
      const ph = mk(model.placeholder);
      ph.disabled = true;
      select.append(ph);
    }
    for (const o of model.options) select.append(mk(o));
    select.value = model.selected;
  }

  function drill(target: DrillView, viaKeyboard: boolean): void {
    view = target;
    draw();
    if (viaKeyboard) back.focus();
  }

  function draw(): void {
    if (!last) return;
    const inp = last;
    let range = viewRange(view, inp.priced, inp.a.period);
    if (!range) {
      view = { kind: 'period', gran: periodGran };
      range = inp.a.period;
    }
    const isPeriod = view.kind === 'period';
    fillOptions(inp.priced);
    const a = isPeriod ? inp.a : inp.analyseFor(range);
    const cw = wrap.clientWidth;
    const width = Math.max(MIN_WIDTH, Math.min(1200, cw > 0 ? cw : 960));
    const height = Math.round(Math.max(280, Math.min(460, width * 0.44)));
    lastWidth = width;
    const scene: Scene = buildScene(a.offers, inp.selected, range, viewGranularity(view), { width, height }, inp.weather);

    title.textContent = viewTitle(view, inp.a.period);
    back.hidden = isPeriod;
    differs.hidden = isPeriod;
    differs.textContent = isPeriod
      ? ''
      : `Cette vue n'est pas limitée à la période sélectionnée (du ${frDate(inp.a.period.from)} au ${frDate(inp.a.period.to)}) : le récapitulatif général de la page continue de décrire cette période.`;

    const rec = viewRecap(view, a, inp.selected);
    vrTitle.textContent = rec.title;
    vrList.replaceChildren();
    for (const r of rec.rows) {
      const li = node('li', !r.available ? 'view-offer unavailable' : r.cheapest ? 'view-offer cheapest' : 'view-offer');
      li.append(node('span', 'view-offer-name', r.label), node('span', 'view-offer-total', r.totalText));
      if (r.cheapest) li.append(node('span', 'badge', 'Le moins cher'));
      if (!r.available) li.append(node('span', 'offer-reason', r.reason));
      vrList.append(li);
    }
    vrDays.textContent = rec.daysText;
    vr.hidden = rec.rows.length === 0;
    if (vrStatus.textContent !== rec.summary) vrStatus.textContent = rec.summary; // avoid re-announcing identical text

    const dayOk = dayAllowed(inp.a.period);
    const dayMessage = isPeriod ? scene.dayMessage : '';
    for (const g of GRANS) {
      const b = buttons.get(g.id)!;
      const disabled = g.id === 'day' && !dayOk;
      const on = isPeriod && scene.granularity === g.id;
      b.disabled = disabled;
      b.title = disabled ? scene.dayMessage || 'Le détail par jour est limité aux périodes plus courtes.' : '';
      b.setAttribute('aria-pressed', String(on));
      b.className = on ? 'toggle-btn on' : 'toggle-btn';
    }
    msg.textContent = dayMessage;
    msg.className = dayMessage ? 'chart-msg notice' : 'chart-msg';
    hint.hidden = scene.granularity === 'day';
    legend.replaceChildren();
    wrap.replaceChildren();
    summary.textContent = scene.summary;
    notes.textContent = scene.notes.join(' ');
    for (const b of scene.legend) legend.append(legendBlock(b));
    if (scene.weather?.legend) legend.append(weatherLegend(scene.weather.legend));
    if (scene.weather?.note) legend.append(node('p', 'legend-note weather-missing', scene.weather.note));
    if (scene.empty) {
      wrap.append(node('p', 'hint', scene.empty));
      return;
    }
    wrap.append(renderSvg(scene, drill).svg);
  }

  let pending = false;
  window.addEventListener('resize', () => {
    if (pending || !last) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      const cw = wrap.clientWidth;
      if (cw > 0 && Math.max(MIN_WIDTH, Math.min(1200, cw)) !== lastWidth) draw();
    });
  });

  return {
    render(input) {
      last = input;
      draw();
    },
    resetView() {
      view = { kind: 'period', gran: periodGran };
    },
  };
}
