// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/**
 * Pure chart-view model: which range/granularity the chart card shows, drill-down targets,
 * the "Aller à" option list. No DOM, no clock.
 */
import type { Period } from './period';
import type { Granularity } from './scene';
import { frDate } from './format';

export type DrillView = { kind: 'year'; year: string } | { kind: 'month'; month: string };
/** period: follows the selected period at the given granularity; year: MONTH view of a calendar year;
 *  month: DAY view of a calendar month. */
export type View = { kind: 'period'; gran: Granularity } | DrillView;

export const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function monthLabel(month: string): string {
  return `${FR_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}
function lastDay(month: string): string {
  const n = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return `${month}-${String(n).padStart(2, '0')}`;
}
function clamp(from: string, to: string, priced: Period): Period | null {
  const f = from < priced.from ? priced.from : from;
  const t = to > priced.to ? priced.to : to;
  return f <= t ? { from: f, to: t } : null;
}

/** Range shown by a view: the calendar year/month intersected with the priced range (NOT the selected period). */
export function viewRange(view: View, priced: Period, period: Period): Period | null {
  if (view.kind === 'period') return period;
  if (view.kind === 'year') return clamp(`${view.year}-01-01`, `${view.year}-12-31`, priced);
  return clamp(`${view.month}-01`, lastDay(view.month), priced);
}
export function viewGranularity(view: View): Granularity {
  return view.kind === 'period' ? view.gran : view.kind === 'year' ? 'month' : 'day';
}
/** One level up: day view -> month view of its year -> period-based year view. */
export function viewBack(view: View): View {
  if (view.kind === 'month') return { kind: 'year', year: view.month.slice(0, 4) };
  return { kind: 'period', gran: 'year' };
}
export function viewTitle(view: View, period: Period): string {
  if (view.kind === 'year') return `Vue : ${view.year}`;
  if (view.kind === 'month') return `Vue : ${monthLabel(view.month)}`;
  return `Vue : période sélectionnée (du ${frDate(period.from)} au ${frDate(period.to)})`;
}

export interface GotoOption { value: string; label: string }
export interface GotoModel {
  /** Disabled hint option shown while nothing is selected (null when an item is selected). */
  placeholder: GotoOption | null;
  options: GotoOption[];
  /** Value to select: '' (placeholder) or the option of the current view. */
  selected: string;
}

/**
 * Options of the "Aller à" select, which depend on the current view:
 * - period-based views (years / months / days of the selected period): the imported YEARS;
 * - month view of a given year: the imported MONTHS of that year;
 * - day view of a month: the imported months of that month's year (current month selected).
 */
export function gotoModel(view: View, priced: Period): GotoModel {
  if (view.kind === 'period') {
    const options: GotoOption[] = [];
    for (let y = Number(priced.from.slice(0, 4)); y <= Number(priced.to.slice(0, 4)); y++) {
      options.push({ value: `y:${y}`, label: String(y) });
    }
    return { placeholder: { value: '', label: 'Choisir une année…' }, options, selected: '' };
  }
  const year = view.kind === 'year' ? view.year : view.month.slice(0, 4);
  const options: GotoOption[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (clamp(`${key}-01`, lastDay(key), priced)) options.push({ value: `m:${key}`, label: monthLabel(key) });
  }
  return view.kind === 'year'
    ? { placeholder: { value: '', label: 'Choisir un mois…' }, options, selected: '' }
    : { placeholder: null, options, selected: `m:${view.month}` };
}
/** View targeted by an option value ('y:YYYY' -> month view of the year, 'm:YYYY-MM' -> day view of the month); null when empty or malformed. */
export function parseGotoValue(value: string): View | null {
  let m = /^y:(\d{4})$/.exec(value);
  if (m) return { kind: 'year', year: m[1]! };
  m = /^m:(\d{4}-(0[1-9]|1[0-2]))$/.exec(value);
  if (m) return { kind: 'month', month: m[1]! };
  return null;
}
