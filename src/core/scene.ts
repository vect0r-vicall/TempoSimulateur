// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/**
 * Pure chart scene (no DOM): groups of side-by-side stacked bars with geometry in viewBox units.
 * The DOM layer (ui/svg.ts) only maps this scene to SVG elements.
 */
import { DayOfferCost, OFFER_IDS, OFFER_LABEL, OfferId, Offers } from './pricing';
import { Period } from './period';
import { dayNum, isoOf } from './days';
import { formatEuro, frDate } from './format';
import { DrillView } from './view';
import { LegendBlock, OFFER_BAR_NAME, OFFER_TAG, buildLegend } from './legend';
import { DailyTemp, aggregateTemps, aggregateWind, smoothTrend, tempTooltipLine, weatherGlyph, weatherLabel, weatherTooltipLine, windTooltipLine } from './weather';

export type Granularity = 'year' | 'month' | 'day';
export type SegColour = 'B' | 'W' | 'R' | 'U';

/** Longest period (in days) for which the day granularity is offered. */
export const MAX_DAY_PERIOD = 400;

export interface Segment {
  id: string; // 'sub' | 'B-HC' | ... | 'U-HP' | 'H-HC' | 'H-HP' | 'base'
  cls: string; // CSS class suffix: seg-<id>
  colour: SegColour | null; // Tempo colour key (U = unknown), null for non-Tempo parts
  tone: 'SUB' | 'HC' | 'HP' | 'BASE';
  label: string; // French
  micro: number;
  kwh: number;
  y: number;
  h: number;
}
/** Font size (viewBox units) of the bar label; keep in sync with .bar-tag in app.css. */
export const LABEL_FONT = 10;
const LABEL_CHAR_W = 0.62; // conservative per-character width, in font sizes
const LABEL_MARGIN = 6; // total horizontal margin so neighbouring labels never touch

export type LabelMode = 'full' | 'short' | 'none';
export interface BarLabel { mode: LabelMode; text: string }
/** Offer name above a bar: full name if it fits the bar width, else the one-letter tag, else nothing. */
export function barLabel(offer: OfferId, barWidth: number): BarLabel {
  const fits = (t: string) => t.length * LABEL_FONT * LABEL_CHAR_W + LABEL_MARGIN <= barWidth;
  const full = OFFER_BAR_NAME[offer];
  if (fits(full)) return { mode: 'full', text: full };
  const short = OFFER_TAG[offer];
  if (fits(short)) return { mode: 'short', text: short };
  return { mode: 'none', text: '' };
}

export interface Bar {
  offer: OfferId;
  short: string;
  label: BarLabel;
  x: number;
  w: number;
  y: number; // top of the stack
  totalMicro: number;
  segments: Segment[]; // bottom to top
  aria: string;
}
export interface Ratio {
  hcShare: number; // integer percent, hcShare + hpShare = 100
  hpShare: number;
  hcKwh: number;
  hpKwh: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hcW: number;
}
/** Day-view weather symbol drawn above the plot, centred on its day (decorative, aria-hidden in the DOM). */
export interface DayGlyph { x: number; y: number; text: string }
/** Minimum day-cell width (viewBox units) for the symbols to be drawn without overlapping each other. */
export const GLYPH_MIN_W = 14;
export interface Group {
  key: string;
  label: string; // full French label
  axisLabel: string; // short label for the axis ('' when thinned out)
  axisSub: string; // second axis line (year) or ''
  partial: boolean;
  firstDate: string;
  lastDate: string;
  x: number; // full cell
  w: number;
  cx: number;
  bars: Bar[];
  ratio: Ratio | null;
  aria: string;
  tip: string[];
  glyph: DayGlyph | null; // day view only, null without a weather code or when cells are too narrow
  drill: DrillView | null; // click/Enter target (year -> its months, month -> its days); null at day level
}
export interface Tick { value: number; y: number; label: string }
export interface WeatherScene {
  /** Smoothed bucket-mean trend, split into runs of consecutive buckets with data (nulls break the line). */
  segments: Array<Array<{ x: number; y: number }>>;
  ticks: Tick[]; // degC ticks for the right-hand axis (ascending value, y inside the plot)
  unit: string;
  legend: string; // '' when there is no temperature to show (no legend entry)
  note: string; // non-empty French note when the weather has no value for the visible buckets
  glyphNote: string; // 'Symboles : météo du jour' only when at least one day symbol is drawn, else ''
}
export interface Scene {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  granularity: Granularity; // effective
  requested: Granularity;
  dayAllowed: boolean;
  dayMessage: string; // non-empty when the day option is disabled
  empty: string; // non-empty French message when there is nothing to draw
  groups: Group[];
  ticks: Tick[];
  axisMaxMicro: number;
  legend: LegendBlock[];
  notes: string[];
  summary: string;
  weather: WeatherScene | null; // null unless a weather overlay was requested and the scene has groups
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const COLOUR_NAME: Record<SegColour, string> = { B: 'bleu', W: 'blanc', R: 'rouge', U: 'couleur inconnue' };
const TONE_NAME: Record<'HC' | 'HP', string> = { HC: 'heures creuses', HP: 'heures pleines' };
const TEMPO_ORDER = ['B-HC', 'B-HP', 'W-HC', 'W-HP', 'R-HC', 'R-HP', 'U-HC', 'U-HP'];

export function periodLength(p: Period): number {
  return dayNum(p.to) - dayNum(p.from) + 1;
}
export function dayAllowed(p: Period): boolean {
  return periodLength(p) <= MAX_DAY_PERIOD;
}

interface Part { id: string; colour: SegColour | null; tone: Segment['tone']; order: number }

function classify(offer: OfferId, key: string): Part | null {
  if (offer === 'base') return { id: 'base', colour: null, tone: 'BASE', order: 1 };
  const tone = key.endsWith('HC') || key === 'hc' ? 'HC' : key.endsWith('HP') || key === 'hp' ? 'HP' : null;
  if (!tone) return null;
  if (offer === 'hchp') return { id: `H-${tone}`, colour: null, tone, order: tone === 'HC' ? 1 : 2 };
  const prefix = key.slice(0, -2);
  const colour: SegColour = prefix === 'bleu' ? 'B' : prefix === 'blanc' ? 'W' : prefix === 'rouge' ? 'R' : 'U';
  const id = `${colour}-${tone}`;
  return { id, colour, tone, order: TEMPO_ORDER.indexOf(id) + 1 };
}

function segLabel(offer: OfferId, p: Part): string {
  if (p.tone === 'BASE') return 'Base : énergie';
  const tone = TONE_NAME[p.tone as 'HC' | 'HP'];
  if (offer === 'tempo' && p.colour) return `Tempo ${COLOUR_NAME[p.colour]} : ${tone}`;
  return `HC/HP : ${tone}`;
}

export function niceTicks(maxEuro: number): number[] {
  if (!(maxEuro > 0)) return [0, 1];
  const raw = maxEuro / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const n = Math.ceil(maxEuro / step - 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Math.round(i * step * 1e6) / 1e6);
  return out;
}

/** 3..5 nice degC ticks covering [lo, hi]; a flat range is widened so nothing divides by zero. */
export function tempTicks(lo: number, hi: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 0; }
  if (!(hi - lo >= 1e-3)) { lo = (lo + hi) / 2 - 1; hi = lo + 2; } // flat or nearly flat: widen
  let raw = (hi - lo) / 3;
  for (let guard = 0; guard < 40; guard++) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const first = Math.floor(lo / step + 1e-9);
    const last = Math.ceil(hi / step - 1e-9);
    if (!Number.isFinite(step) || step <= 0) break;
    if (last - first + 1 <= 5) {
      const out: number[] = [];
      for (let i = first; i <= last; i++) out.push(Math.round(i * step * 1e6) / 1e6);
      return out;
    }
    raw = step * 1.01;
  }
  return [-1, 0, 1];
}

function tempTickLabel(v: number): string {
  const s = String(Math.abs(v)).replace('.', ',');
  return v < 0 ? `−${s}` : s;
}

function tickLabel(v: number): string {
  return Number.isInteger(v) ? `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €` : formatEuro(Math.round(v * 1e6));
}

function keyOf(date: string, g: Granularity): string {
  return g === 'year' ? date.slice(0, 4) : g === 'month' ? date.slice(0, 7) : date;
}

function monthDays(key: string): number {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
}

interface Agg {
  sub: number;
  estimateDays: number;
  parts: Map<string, { part: Part; micro: number; kwh: number }>;
}

function shareMap(days: DayOfferCost[] | null, g: Granularity): Map<string, { hc: number; hp: number }> {
  const out = new Map<string, { hc: number; hp: number }>();
  if (!days) return out;
  for (const d of days) {
    const k = keyOf(d.date, g);
    const e = out.get(k) ?? { hc: 0, hp: 0 };
    for (const [key, v] of Object.entries(d.kwh)) {
      if (key.endsWith('HC') || key === 'hc') e.hc += v ?? 0;
      else if (key.endsWith('HP') || key === 'hp') e.hp += v ?? 0;
    }
    out.set(k, e);
  }
  return out;
}

export function buildScene(
  offers: Offers,
  selected: OfferId[],
  period: Period,
  requested: Granularity,
  size: { width: number; height: number },
  weather?: DailyTemp[] | null,
): Scene {
  const allowDay = dayAllowed(period);
  const dayMessage = allowDay
    ? ''
    : `Le détail par jour est limité aux périodes de ${MAX_DAY_PERIOD} jours au plus (période choisie : ${periodLength(period)} jours). Affichage par mois.`;
  const gran: Granularity = requested === 'day' && !allowDay ? 'month' : requested;
  const sel = OFFER_IDS.filter((o) => selected.includes(o));
  const avail = sel.filter((o) => offers[o].available);
  const notes: string[] = [];
  for (const o of sel) {
    if (!offers[o].available) notes.push(`${OFFER_LABEL[o]} : indisponible, aucune barre (${offers[o].reason})`);
  }

  const M = { l: 62, r: weather ? 52 : 12, t: 22, b: 54 };
  const { width, height } = size;
  const plot = { x: M.l, y: M.t, w: Math.max(50, width - M.l - M.r), h: Math.max(80, height - M.t - M.b) };
  const base: Scene = {
    width, height, plot, granularity: gran, requested, dayAllowed: allowDay, dayMessage, empty: '',
    groups: [], ticks: [], axisMaxMicro: 0, legend: [], notes, summary: '', weather: null,
  };
  const noBars = { hatchHP: false, unknownColour: false, ratio: false };
  if (sel.length === 0) return { ...base, empty: 'Cochez au moins une offre pour afficher le graphique.' };
  if (avail.length === 0) return { ...base, legend: buildLegend(sel, offers, noBars), empty: 'Aucune offre sélectionnée n\'est disponible sur cette période.' };

  // groups from the calendar span of the period
  const order: string[] = [];
  const info = new Map<string, { first: string; last: string }>();
  for (let n = dayNum(period.from); n <= dayNum(period.to); n++) {
    const date = isoOf(n);
    const k = keyOf(date, gran);
    const e = info.get(k);
    if (e) e.last = date;
    else {
      info.set(k, { first: date, last: date });
      order.push(k);
    }
  }
  const cell = new Map<string, Map<OfferId, Agg>>();
  for (const k of order) cell.set(k, new Map());
  for (const o of avail) {
    for (const d of offers[o].days) {
      const k = keyOf(d.date, gran);
      const m = cell.get(k);
      if (!m) continue;
      let agg = m.get(o);
      if (!agg) {
        agg = { sub: 0, estimateDays: 0, parts: new Map() };
        m.set(o, agg);
      }
      agg.sub += d.subMicro;
      if (d.estimate) agg.estimateDays++;
      for (const [key, v] of Object.entries(d.energyMicro)) {
        const part = classify(o, key);
        if (!part) continue;
        const p = agg.parts.get(part.id) ?? { part, micro: 0, kwh: 0 };
        p.micro += v ?? 0;
        p.kwh += d.kwh[key as keyof typeof d.kwh] ?? 0;
        agg.parts.set(part.id, p);
      }
    }
  }

  // value axis
  let maxMicro = 0;
  const totals = new Map<string, Map<OfferId, number>>();
  for (const k of order) {
    const t = new Map<OfferId, number>();
    for (const [o, agg] of cell.get(k)!) {
      let sum = agg.sub;
      for (const p of agg.parts.values()) sum += p.micro;
      t.set(o, sum);
      if (sum > maxMicro) maxMicro = sum;
    }
    totals.set(k, t);
  }
  const tickVals = niceTicks(maxMicro / 1e6);
  const axisMax = tickVals[tickVals.length - 1]! * 1e6;
  const yOf = (micro: number) => plot.y + plot.h - (micro / axisMax) * plot.h;
  const ticks: Tick[] = tickVals.map((v) => ({ value: v, y: yOf(v * 1e6), label: tickLabel(v) }));

  // ratio source: HC/HP offer first, then Tempo
  const ratioOffer = (['hchp', 'tempo'] as OfferId[]).find((o) => offers[o].available);
  const shares = shareMap(ratioOffer ? offers[ratioOffer].days : null, gran);

  const byDate = weather ? new Map(weather.map((d) => [d.date, d])) : null;
  const bucketMeans: Array<number | null> = [];
  const gw = plot.w / order.length;
  const pad = gran === 'day' ? 0 : gw * 0.12;
  const gap = gran === 'day' ? 0 : 2;
  let anyUnknown = false;
  const groups: Group[] = [];
  let anyPartial = false;
  let anyRatio = false;
  let anyGlyph = false;
  let prevYear = '';

  order.forEach((k, i) => {
    let tempText = '';
    let glyph: DayGlyph | null = null;
    const { first, last } = info.get(k)!;
    let partial = false;
    let label: string;
    let axisLabel = '';
    let axisSub = '';
    if (gran === 'year') {
      partial = first !== `${k}-01-01` || last !== `${k}-12-31`;
      label = k;
      axisLabel = k;
    } else if (gran === 'month') {
      partial = first !== `${k}-01` || last !== `${k}-${String(monthDays(k)).padStart(2, '0')}`;
      const mi = Number(k.slice(5, 7)) - 1;
      label = `${MONTHS[mi]} ${k.slice(0, 4)}`;
      axisLabel = MONTHS[mi]!;
      if (k.slice(0, 4) !== prevYear) axisSub = k.slice(0, 4);
      prevYear = k.slice(0, 4);
    } else {
      label = frDate(k);
      if (k.endsWith('-01')) {
        axisLabel = MONTHS[Number(k.slice(5, 7)) - 1]!;
        if (k.slice(0, 4) !== prevYear) axisSub = k.slice(0, 4);
        prevYear = k.slice(0, 4);
      }
    }
    if (partial) anyPartial = true;
    const fullLabel = partial ? `${label} (période partielle)` : label;
    if (partial && axisLabel) axisLabel += '*';

    const gx = plot.x + i * gw;
    const inner = gw - 2 * pad;
    const bw = Math.min(64, (inner - gap * (avail.length - 1)) / avail.length);
    const used = bw * avail.length + gap * (avail.length - 1);
    const bx0 = gx + (gw - used) / 2;
    const bars: Bar[] = [];
    const lines: string[] = [];
    avail.forEach((o, bi) => {
      const agg = cell.get(k)!.get(o);
      const segments: Segment[] = [];
      let cum = 0;
      const push = (id: string, colour: SegColour | null, tone: Segment['tone'], lab: string, micro: number, kwh: number) => {
        if (!(micro > 0)) return;
        const y1 = yOf(cum + micro);
        const y0 = yOf(cum);
        segments.push({ id, cls: `seg-${id}`, colour, tone, label: lab, micro, kwh, y: y1, h: y0 - y1 });
        cum += micro;
        if (colour === 'U') anyUnknown = true;
      };
      if (agg) {
        push('sub', null, 'SUB', 'Abonnement', agg.sub, 0);
        const ps = [...agg.parts.values()].sort((a, b) => a.part.order - b.part.order);
        for (const p of ps) push(p.part.id, p.part.colour, p.part.tone, segLabel(o, p.part), p.micro, p.kwh);
      }
      const total = totals.get(k)!.get(o) ?? 0;
      let aria = `${OFFER_LABEL[o]}, ${fullLabel} : total ${formatEuro(total)}, dont abonnement ${formatEuro(agg ? agg.sub : 0)}`;
      if (agg && agg.estimateDays > 0) aria += `, couleur Tempo estimée sur ${agg.estimateDays} jour${agg.estimateDays > 1 ? 's' : ''}`;
      bars.push({
        offer: o, short: OFFER_TAG[o], label: barLabel(o, bw), x: bx0 + bi * (bw + gap), w: bw, y: yOf(total), totalMicro: total, segments, aria: `${aria}.`,
      });
      lines.push(`${OFFER_LABEL[o]} : ${formatEuro(total)}`);
    });

    let ratio: Ratio | null = null;
    const sh = shares.get(k);
    if (sh && sh.hc + sh.hp > 0) {
      const hcShare = Math.round((100 * sh.hc) / (sh.hc + sh.hp));
      ratio = {
        hcShare, hpShare: 100 - hcShare, hcKwh: sh.hc, hpKwh: sh.hp,
        x: bx0, y: plot.y + plot.h + 6, w: used, h: 6, hcW: (used * hcShare) / 100,
      };
      anyRatio = true;
    }
    const shareText = ratio ? `Heures creuses ${ratio.hcShare} %, heures pleines ${ratio.hpShare} % des kWh` : '';
    if (shareText) lines.push(shareText);
    if (byDate) {
      const dates: string[] = [];
      for (let n = dayNum(first); n <= dayNum(last); n++) dates.push(isoOf(n));
      const agg = aggregateTemps(byDate, dates);
      bucketMeans.push(agg.mean);
      const tl = tempTooltipLine(agg);
      lines.push(tl);
      tempText = `${tl}.`;
      const wl = windTooltipLine(aggregateWind(byDate, dates));
      lines.push(wl);
      tempText += ` ${wl}.`;
      if (gran === 'day') {
        const code = byDate.get(first)?.code ?? null;
        const wtl = weatherTooltipLine(code);
        lines.splice(lines.length - 2, 0, wtl);
        tempText = `${wtl}. ${tempText}`;
        const text = weatherGlyph(code);
        if (text && gw >= GLYPH_MIN_W) { glyph = { x: gx + gw / 2, y: plot.y - 6, text }; anyGlyph = true; }
      }
    }
    const drill: DrillView | null = gran === 'year' ? { kind: 'year', year: k } : gran === 'month' ? { kind: 'month', month: k } : null;
    const aria =
      `${fullLabel} : ${bars.map((b) => `${OFFER_LABEL[b.offer]} ${formatEuro(b.totalMicro)}`).join(', ')}.${shareText ? ` ${shareText}.` : ''}` +
      (tempText ? ` ${tempText}` : '') + (drill ? ' Entrée pour détailler.' : '');
    groups.push({
      key: k, label: fullLabel, axisLabel, axisSub, partial, firstDate: first, lastDate: last,
      x: gx, w: gw, cx: gx + gw / 2, bars, ratio, aria, tip: [fullLabel, ...lines], glyph, drill,
    });
  });

  if (anyPartial) notes.push('* période partielle : seuls les jours de la plage affichée sont comptés.');
  const legend = buildLegend(sel, offers, { hatchHP: gran !== 'day', unknownColour: anyUnknown, ratio: anyRatio });
  const unit = gran === 'year' ? 'année' : gran === 'month' ? 'mois' : 'jour';
  const summary =
    `Graphique en barres du coût par ${unit}, du ${frDate(period.from)} au ${frDate(period.to)}. ` +
    avail.map((o) => `${OFFER_LABEL[o]} : ${formatEuro(offers[o].totalMicro)} au total`).join(' ; ') +
    `. ${groups.length} ${groups.length > 1 ? 'groupes' : 'groupe'}.`;
  let weatherScene: WeatherScene | null = null;
  if (byDate) {
    const NO_DATA: WeatherScene = { segments: [], ticks: [], unit: '', legend: '', note: 'Météo non chargée pour cette vue', glyphNote: '' };
    try {
      const trend = smoothTrend(bucketMeans).map((v) => (v !== null && Number.isFinite(v) ? v : null));
      const vals = trend.filter((v): v is number => v !== null);
      if (vals.length === 0) weatherScene = NO_DATA;
      else {
        const tt = tempTicks(Math.min(...vals), Math.max(...vals));
        const lo = tt[0]!, hi = tt[tt.length - 1]!;
        const yT = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
        const segments: WeatherScene['segments'] = [];
        let run: Array<{ x: number; y: number }> = [];
        trend.forEach((v, i) => {
          if (v === null) {
            if (run.length) segments.push(run);
            run = [];
          } else run.push({ x: groups[i]!.cx, y: yT(v) });
        });
        if (run.length) segments.push(run);
        weatherScene = { segments, ticks: tt.map((v) => ({ value: v, y: yT(v), label: tempTickLabel(v) })), unit: '°C', legend: 'Tendance de la température (moyenne)', note: '', glyphNote: '' };
      }
    } catch {
      weatherScene = NO_DATA; // the overlay must never break the chart
    }
    if (anyGlyph) weatherScene = { ...weatherScene!, glyphNote: 'Symboles : météo du jour' };
  }
  return { ...base, groups, ticks, axisMaxMicro: axisMax, legend, notes, summary, weather: weatherScene };
}
