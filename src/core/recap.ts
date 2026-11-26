// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Analysis of an import for one period/kVA, and the recap of the selected offers. */
import { DayConsumption, ImportResult } from './types';
import { OFFER_IDS, OfferId, OfferResult, Offers, priceOffers } from './pricing';
import { Period } from './period';
import { Consumption, sumConsumption } from './kwh';
import { Podium, buildPodium } from './podium';

export interface Analysis {
  period: Period;
  kva: number;
  pricedDays: number;
  estimatedDays: number; // days whose kWh were spread over a reading gap
  excludedDays: string[]; // period-boundary days inside the period (not priced, not charged)
  hchpDays: number; // priced days belonging to an HC/HP period
  kwh: Consumption; // energy of the priced days of the period (same days as the offers' costs)
  rawDays: DayConsumption[]; // the priced days themselves: the chart's per-bucket kWh are read from them, never from an offer
  offers: Offers; // per-day, per-offer cost structure (see pricing.ts)
}

export function analyse(imp: ImportResult, period: Period, kva: number): Analysis {
  const days = imp.days.filter((d) => d.date >= period.from && d.date <= period.to);
  return {
    period,
    kva,
    pricedDays: days.length,
    estimatedDays: days.filter((d) => d.estimated).length,
    excludedDays: imp.excluded.filter((d) => d >= period.from && d <= period.to),
    hchpDays: days.filter((d) => d.kind === 'hchp').length,
    kwh: sumConsumption(days),
    rawDays: days,
    offers: priceOffers(days, kva),
  };
}

export interface RecapRow {
  offer: OfferId;
  available: boolean;
  reason: string;
  totalMicro: number;
  cheapest: boolean;
  calendarEstimateDays: number;
}
export interface Recap {
  rows: RecapRow[]; // selected offers only, in OFFER_IDS order
  compared: number; // number of selected available offers
  pricedDays: number;
  estimatedDays: number;
  excludedDays: number;
  kwh: Consumption;
  calendarEstimate: boolean; // a selected available Tempo offer priced days with the calendar colour
  podium: Podium | null; // ranking of the available offers (null below two); the savings sentence is approximate when days are estimated
}

export function buildRecap(a: Analysis, selected: OfferId[]): Recap {
  const sel = OFFER_IDS.filter((o) => selected.includes(o));
  const results: OfferResult[] = sel.map((o) => a.offers[o]);
  const avail = results.filter((r) => r.available);
  const min = avail.length ? Math.min(...avail.map((r) => r.totalMicro)) : 0;
  const rows = results.map((r) => ({
    offer: r.offer,
    available: r.available,
    reason: r.reason,
    totalMicro: r.totalMicro,
    cheapest: r.available && r.totalMicro === min,
    calendarEstimateDays: r.calendarEstimateDays,
  }));
  const calendarEstimate = results.some((r) => r.offer === 'tempo' && r.available && r.calendarEstimateDays > 0);
  return {
    rows,
    compared: avail.length,
    pricedDays: a.pricedDays,
    estimatedDays: a.estimatedDays,
    excludedDays: a.excludedDays.length,
    kwh: a.kwh,
    calendarEstimate,
    podium: buildPodium(rows, calendarEstimate || a.estimatedDays > 0),
  };
}
