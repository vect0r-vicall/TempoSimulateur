// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { DayConsumption, ImportError, PeriodInfo } from './types';
import { Reading, bucketsOf } from './periods';

const MS_DAY = 86400000;
export const MAX_DAY_KWH = 100000;

export function dayNum(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function isoOf(n: number): string {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

/** Detected contract periods: runs of consecutive readings with the same kind. */
export function buildPeriods(readings: Reading[], days: DayConsumption[]): PeriodInfo[] {
  const out: PeriodInfo[] = [];
  for (const r of readings) {
    const last = out[out.length - 1];
    if (last && last.kind === r.kind) {
      last.to = r.date;
    } else {
      out.push({ kind: r.kind, from: r.date, to: r.date, days: 1 });
    }
  }
  // p.from/p.to are reading dates; p.days = priced days of this period (reading dates in [from, to))
  for (const p of out) p.days = days.filter((d) => d.kind === p.kind && d.date >= p.from && d.date < p.to).length;
  return out;
}

/**
 * Consumption of day D = index(D+1) - index(D), both readings in the same period.
 * `readings` must be sorted ascending with unique dates.
 */
export function buildDays(readings: Reading[]): { days: DayConsumption[]; excluded: string[]; estimatedCount: number } {
  const days: DayConsumption[] = [];
  const excluded: string[] = [];
  let estimatedCount = 0;
  for (let i = 0; i + 1 < readings.length; i++) {
    const a = readings[i]!;
    const b = readings[i + 1]!;
    const na = dayNum(a.date);
    const span = dayNum(b.date) - na;
    if (a.kind !== b.kind) {
      for (let d = 0; d < span; d++) excluded.push(isoOf(na + d));
      continue;
    }
    const buckets = bucketsOf(a.kind);
    const perDay: Array<Record<string, number>> = Array.from({ length: span }, () => ({}));
    for (const k of buckets) {
      const va = a.values[k]!;
      const vb = b.values[k]!;
      const delta = vb - va;
      if (delta / span > MAX_DAY_KWH) {
        throw new ImportError(`Ligne ${b.line} : consommation de plus de ${MAX_DAY_KWH.toLocaleString('fr-FR')} kWh par jour. Fichier refusé.`);
      }
      if (delta < 0) {
        throw new ImportError(`Ligne ${b.line} : l'index décroît (${va} → ${vb}). Remplacement de compteur ? Fichier refusé.`);
      }
      // integer largest-remainder: earliest days get the remainder
      const base = Math.floor(delta / span);
      const rem = delta - base * span;
      for (let d = 0; d < span; d++) perDay[d]![k] = base + (d < rem ? 1 : 0);
    }
    for (let d = 0; d < span; d++) {
      days.push({ date: isoOf(na + d), kind: a.kind, kwh: perDay[d]!, estimated: span > 1 });
    }
    if (span > 1) estimatedCount += span;
  }
  return { days, excluded, estimatedCount };
}
