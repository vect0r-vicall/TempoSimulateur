// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure recap of the range the chart currently shows (period / calendar year / calendar month). No DOM. */
import type { Analysis, Recap } from './recap';
import { buildRecap } from './recap';
import type { OfferId } from './pricing';
import { OFFER_LABEL } from './pricing';
import { formatEuro } from './format';
import { Consumption, consumptionText } from './kwh';
import { View, monthLabel } from './view';
import { DailyTemp, Seg, aggregateTemps, segsText, tempTooltipSegments } from './weather';
import { dayNum, isoOf } from './days';

export interface ViewRecapRow {
  offer: OfferId;
  label: string;
  available: boolean;
  reason: string;
  totalMicro: number;
  totalText: string; // '1 234,56 €' or 'indisponible'
  cheapest: boolean; // badge shown: cheapest of at least two compared offers
}
export interface ViewRecap {
  title: string;
  rows: ViewRecapRow[];
  compared: number;
  pricedDays: number;
  estimatedDays: number;
  excludedDays: number;
  kwh: Consumption;
  kwhText: string; // 'Consommation : 4 321 kWh (HC 40 % / HP 60 %)'
  daysText: string; // 'N jours valorisés' (+ estimated / excluded only when non-zero)
  tempText: string; // 'Température : moy. 12,3 °C · min −4,1 · max 31,0' over the viewed days ('' when the weather overlay is off)
  tempSegs: Seg[]; // the same line as coloured segments (tt-mean / tt-min / tt-max like the tooltip); [] when the overlay is off
  summary: string; // one sentence for screen readers
}

export function viewRecapTitle(view: View): string {
  if (view.kind === 'year') return `Total de l'année ${view.year}`;
  if (view.kind === 'month') {
    const m = monthLabel(view.month);
    return /^[aeiouhéèêîôû]/i.test(m) ? `Total d'${m}` : `Total de ${m}`; // élision : d'avril, d'août, d'octobre
  }
  return 'Total de la période sélectionnée';
}

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Temperature line of the viewed range `[from, to]` as coloured segments: mean of the daily means, min of the mins, max of the maxes, '(N/M jours)' when partial.
 *  Same aggregation and wording as the chart tooltip; [] without weather (overlay off). */
export function viewTemperatureSegments(range: { from: string; to: string }, weather: DailyTemp[] | null | undefined): Seg[] {
  if (!weather) return [];
  const dates: string[] = [];
  for (let n = dayNum(range.from); n <= dayNum(range.to); n++) dates.push(isoOf(n));
  return tempTooltipSegments(aggregateTemps(weather, dates));
}
export const viewTemperatureText = (range: { from: string; to: string }, weather: DailyTemp[] | null | undefined): string => segsText(viewTemperatureSegments(range, weather));

/** `a` MUST be the analysis of the range the chart shows for `view` (same object the scene is built from). `weather` (optional) adds the temperature line. */
export function viewRecap(view: View, a: Analysis, selected: OfferId[], weather?: DailyTemp[] | null): ViewRecap {
  const r: Recap = buildRecap(a, selected);
  const rows = r.rows.map((x) => ({
    offer: x.offer,
    label: OFFER_LABEL[x.offer],
    available: x.available,
    reason: x.reason,
    totalMicro: x.totalMicro,
    totalText: x.available ? formatEuro(x.totalMicro) : 'indisponible',
    cheapest: x.cheapest && r.compared >= 2,
  }));
  const parts = [`${plural(r.pricedDays, 'jour')} valorisé${r.pricedDays > 1 ? 's' : ''}`];
  if (r.estimatedDays > 0) parts.push(`${plural(r.estimatedDays, 'jour')} estimé${r.estimatedDays > 1 ? 's' : ''}`);
  if (r.excludedDays > 0) parts.push(`${plural(r.excludedDays, 'jour')} exclu${r.excludedDays > 1 ? 's' : ''}`);
  const daysText = parts.join(', ');
  const kwhText = `Consommation : ${consumptionText(r.kwh)}`;
  const title = viewRecapTitle(view);
  const tempSegs = viewTemperatureSegments(a.period, weather);
  const tempText = segsText(tempSegs);
  const body = rows.map((x) => `${x.label} ${x.totalText}${x.cheapest ? ' (le moins cher)' : ''}`).join(', ');
  return {
    title,
    rows,
    compared: r.compared,
    pricedDays: r.pricedDays,
    estimatedDays: r.estimatedDays,
    excludedDays: r.excludedDays,
    kwh: r.kwh,
    kwhText,
    daysText,
    tempText,
    tempSegs,
    summary: rows.length ? `${title} : ${body}. ${daysText}. ${kwhText}.${tempText ? ` ${tempText}.` : ''}` : `${title} : aucune offre sélectionnée.`,
  };
}
