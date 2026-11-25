// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure model of the 'Tarifs appliqués' card (FR-030): the EDF prices actually used, per price grid. No DOM. */
import { GRIDS, Grid } from '../data/grids';
import { OFFER_IDS, OfferId, gridFor } from './pricing';
import { dayNum, isoOf } from './days';
import { frLongDate } from './format';
import { Period } from './period';
import { Analysis } from './recap';

export interface TariffPrice { label: string; microPerKwh: number }
export interface TariffOffer {
  offer: OfferId;
  available: boolean; // false: no row for this kVA in this grid
  monthlySubscriptionMicro: number; // 0 when unavailable (never shown)
  prices: TariffPrice[]; // empty when unavailable
}
export interface TariffSource { label: string; file: string }
export interface TariffSection {
  effective: string; // grid date
  from: string;
  to: string;
  reusedBeyondLast: boolean;
  source: TariffSource;
  offers: TariffOffer[];
}
export interface Tariffs {
  kva: number;
  sections: TariffSection[];
  calendarEstimate: boolean; // Tempo prices applied to HC/HP days through the RTE calendar
}

export function tariffSource(effective: string): TariffSource {
  return {
    label: `EDF — grille de prix « Tarif Bleu » (clients particuliers), applicable au ${frLongDate(effective)}, prix TTC`,
    file: `tarifs-${effective.replace(/-/g, '')}.pdf`,
  };
}

function offerPrices(grid: Grid, offer: OfferId, kva: number): TariffOffer {
  const none: TariffOffer = { offer, available: false, monthlySubscriptionMicro: 0, prices: [] };
  if (offer === 'base') {
    const r = grid.base.find((x) => x.kva === kva);
    if (!r) return none;
    return { offer, available: true, monthlySubscriptionMicro: r.sub, prices: [{ label: 'Prix du kWh', microPerKwh: r.kwh }] };
  }
  if (offer === 'hchp') {
    const r = grid.hchp.find((x) => x.kva === kva);
    if (!r) return none;
    return {
      offer, available: true, monthlySubscriptionMicro: r.sub,
      prices: [{ label: 'Heures pleines', microPerKwh: r.hp }, { label: 'Heures creuses', microPerKwh: r.hc }],
    };
  }
  const r = grid.tempo.find((x) => x.kva === kva);
  if (!r) return none;
  return {
    offer, available: true, monthlySubscriptionMicro: r.sub,
    prices: [
      { label: 'Bleu — heures creuses', microPerKwh: r.bleuHC },
      { label: 'Bleu — heures pleines', microPerKwh: r.bleuHP },
      { label: 'Blanc — heures creuses', microPerKwh: r.blancHC },
      { label: 'Blanc — heures pleines', microPerKwh: r.blancHP },
      { label: 'Rouge — heures creuses', microPerKwh: r.rougeHC },
      { label: 'Rouge — heures pleines', microPerKwh: r.rougeHP },
    ],
  };
}

export function buildTariffs(period: Period, kva: number, selected: OfferId[], a?: Analysis | null): Tariffs {
  const sel = OFFER_IDS.filter((o) => selected.includes(o));
  const sections: TariffSection[] = [];
  const last = GRIDS[GRIDS.length - 1]!;
  for (let i = 0; i < GRIDS.length; i++) {
    const g = GRIDS[i]!;
    const next = GRIDS[i + 1];
    const start = period.from > g.effective ? period.from : g.effective;
    const endGrid = next ? isoOf(dayNum(next.effective) - 1) : period.to;
    const end = period.to < endGrid ? period.to : endGrid;
    if (start > end || gridFor(start) !== g) continue;
    sections.push({
      effective: g.effective,
      from: start,
      to: end,
      reusedBeyondLast: g === last && period.to > g.effective,
      source: tariffSource(g.effective),
      offers: sel.map((o) => offerPrices(g, o, kva)),
    });
  }
  const calendarEstimate = !!a && sel.includes('tempo') && a.offers.tempo.available && a.offers.tempo.calendarEstimateDays > 0;
  return { kva, sections, calendarEstimate };
}
