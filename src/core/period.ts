// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Period selection on UTC civil dates (YYYY-MM-DD strings); the browser clock is never used. */
import { dayNum, isoOf } from './days';
import { frDate } from './format';
import { DayConsumption } from './types';

export interface Period { from: string; to: string }
export type PeriodOutcome =
  | { ok: true; period: Period; clamped: boolean; message: string }
  | { ok: false; error: string };

export function isValidIso(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function pricedRange(days: DayConsumption[]): Period | null {
  if (days.length === 0) return null;
  return { from: days[0]!.date, to: days[days.length - 1]!.date };
}

/** The 365 days ending on the last priced day, clamped to the first priced day. */
export function defaultPeriod(days: DayConsumption[]): Period | null {
  const r = pricedRange(days);
  if (!r) return null;
  const from = isoOf(dayNum(r.to) - 364);
  return { from: from < r.from ? r.from : from, to: r.to };
}

/** Validates and clamps a requested period to the priced range. */
export function resolvePeriod(days: DayConsumption[], start: string, end: string): PeriodOutcome {
  const r = pricedRange(days);
  if (!r) return { ok: false, error: 'Aucune donnée chargée.' };
  if (!isValidIso(start)) return { ok: false, error: 'Date de début invalide. Période précédente conservée.' };
  if (!isValidIso(end)) return { ok: false, error: 'Date de fin invalide. Période précédente conservée.' };
  if (start > end) return { ok: false, error: 'La date de début est postérieure à la date de fin. Période précédente conservée.' };
  const from = start < r.from ? r.from : start;
  const to = end > r.to ? r.to : end;
  if (from > to) {
    return {
      ok: false,
      error: `Aucune donnée sur cette période (données du ${frDate(r.from)} au ${frDate(r.to)}). Période précédente conservée.`,
    };
  }
  if (!days.some((d) => d.date >= from && d.date <= to)) {
    return {
      ok: false,
      error: `Aucun jour valorisé entre le ${frDate(from)} et le ${frDate(to)} (jour de changement de contrat exclu). Période précédente conservée.`,
    };
  }
  const clamped = from !== start || to !== end;
  return {
    ok: true,
    period: { from, to },
    clamped,
    message: clamped ? `Période ajustée aux données disponibles : du ${frDate(from)} au ${frDate(to)}.` : '',
  };
}

export type ShortcutId = 'all' | 'year' | 'two-years';
export const SHORTCUT_IDS: readonly ShortcutId[] = ['all', 'year', 'two-years'];
const SHORTCUT_DAYS: Record<ShortcutId, number | null> = { all: null, year: 365, 'two-years': 730 };

export interface ShortcutPeriod extends Period {
  /** True when the requested length exceeds the imported data and the start was moved to the first priced day. */
  clamped: boolean;
  /** Calendar days from the first to the last priced day, both included. */
  availableDays: number;
}

/**
 * Period shortcut windows. Each ends on the LAST priced day (never the clock): 'all' is the full priced range,
 * 'year' the 365 days ending there (= defaultPeriod), 'two-years' the 730 days. Longer than the data: clamped
 * to the first priced day. Null when there is no priced day.
 */
export function shortcutPeriods(days: DayConsumption[]): Record<ShortcutId, ShortcutPeriod> | null {
  const r = pricedRange(days);
  if (!r) return null;
  const availableDays = dayNum(r.to) - dayNum(r.from) + 1;
  const make = (id: ShortcutId): ShortcutPeriod => {
    const len = SHORTCUT_DAYS[id];
    if (len === null || len >= availableDays) return { from: r.from, to: r.to, clamped: len !== null && len > availableDays, availableDays };
    return { from: isoOf(dayNum(r.to) - (len - 1)), to: r.to, clamped: false, availableDays };
  };
  return { all: make('all'), year: make('year'), 'two-years': make('two-years') };
}

/** Shortcuts whose window equals the applied period (several when the data is short). */
export function pressedShortcuts(days: DayConsumption[], period: Period | null): ShortcutId[] {
  const sp = shortcutPeriods(days);
  if (!sp || !period) return [];
  return SHORTCUT_IDS.filter((id) => sp[id].from === period.from && sp[id].to === period.to);
}

/** French notice shown on the period message line when a shortcut window was clamped; '' otherwise. */
export function shortcutMessage(sp: ShortcutPeriod): string {
  return sp.clamped
    ? `Les données importées ne couvrent que ${sp.availableDays} jour${sp.availableDays > 1 ? 's' : ''} : période ajustée du ${frDate(sp.from)} au ${frDate(sp.to)}.`
    : '';
}
