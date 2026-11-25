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
