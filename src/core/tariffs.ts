// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure model of the 'Tarifs appliqués' card (FR-030): the EDF prices actually used, per price grid. No DOM. */
import { GRIDS, Grid } from '../data/grids';
import { OFFER_IDS, OFFER_LABEL, OfferId, gridFor } from './pricing';
import { dayNum, isoOf } from './days';
import { formatCentsPerKwhHtva, formatEuroPerYearHt, formatPercent, frLongDate } from './format';
import { Period } from './period';
import { Analysis } from './recap';

export interface TariffPrice { label: string; microPerKwh: number }
export interface TariffOffer {
  offer: OfferId;
  available: boolean; // false: no row for this kVA in this grid
  monthlySubscriptionMicro: number; // 0 when unavailable (never shown)
  prices: TariffPrice[]; // empty when unavailable
}
export interface TariffSource { label: string }
/** One printed table of a grid (all kVA rows); cells are integer micro-euros, subscription first. */
export interface GridTable {
  offer: OfferId;
  caption: string;
  columns: { label: string; unit: 'eur' | 'cents' }[]; // after the kVA column
  rows: { kva: number; selected: boolean; cells: number[] }[];
}
export interface TariffFact { label: string; value: string }
export interface TariffSection {
  effective: string; // grid date
  from: string;
  to: string;
  reusedBeyondLast: boolean;
  source: TariffSource;
  offers: TariffOffer[];
  fullGrid: GridTable[]; // complete Tempo, HC/HP and Base tables, every kVA row as printed
  facts: TariffFact[]; // taxes, majorations, Base extinction: only what this grid prints
}
export interface Tariffs {
  kva: number;
  sections: TariffSection[];
  calendarEstimate: boolean; // Tempo prices applied to HC/HP days through the RTE calendar
}

/** Data-derived text shown with the straight apostrophe used everywhere else in the UI (grids.ts keeps the printed U+2019). */
const HINT_CLOSED = 'Cliquer pour afficher';
const HINT_OPEN = 'Cliquer pour masquer';
/** Visible hint next to the title of the collapsible 'Tarifs appliqués' card. */
export function tariffsToggleHint(open: boolean): string {
  return open ? HINT_OPEN : HINT_CLOSED;
}

export function plain(text: string): string {
  return text.replaceAll('\u2019', "'");
}

/** Source line of a grid, derived from its audience and applicability date (never a file name). */
export function tariffSource(grid: Pick<Grid, 'audience' | 'appliesFrom'>): TariffSource {
  return { label: `EDF — grille de prix « Tarif Bleu » (${plain(grid.audience)}), applicable au ${frLongDate(grid.appliesFrom)}, prix TTC` };
}

/** Complete printed tables of a grid; the row of `kva` is flagged. */
export function fullGridTables(grid: Grid, kva: number): GridTable[] {
  const sub = { label: 'Abonnement (€ TTC/mois)', unit: 'eur' as const };
  const kwh = (label: string) => ({ label, unit: 'cents' as const });
  const row = (r: { kva: number }, cells: number[]) => ({ kva: r.kva, selected: r.kva === kva, cells });
  const cap = (offer: OfferId) => `Option ${OFFER_LABEL[offer]} — grille du ${frLongDate(grid.effective)}, toutes les puissances`;
  return [
    {
      offer: 'tempo', caption: cap('tempo'),
      columns: [sub, kwh('Bleu HC (c€ TTC/kWh)'), kwh('Bleu HP (c€ TTC/kWh)'), kwh('Blanc HC (c€ TTC/kWh)'),
        kwh('Blanc HP (c€ TTC/kWh)'), kwh('Rouge HC (c€ TTC/kWh)'), kwh('Rouge HP (c€ TTC/kWh)')],
      rows: grid.tempo.map((r) => row(r, [r.sub, r.bleuHC, r.bleuHP, r.blancHC, r.blancHP, r.rougeHC, r.rougeHP])),
    },
    {
      offer: 'hchp', caption: cap('hchp'),
      columns: [sub, kwh('Heures pleines (c€ TTC/kWh)'), kwh('Heures creuses (c€ TTC/kWh)')],
      rows: grid.hchp.map((r) => row(r, [r.sub, r.hp, r.hc])),
    },
    {
      offer: 'base', caption: cap('base'),
      columns: [sub, kwh('Prix du kWh (c€ TTC/kWh)')],
      rows: grid.base.map((r) => row(r, [r.sub, r.kwh])),
    },
  ];
}

/** Taxes, majorations and Base extinction printed by a grid. Items the grid does not print are omitted (never 0). */
export function gridFacts(grid: Grid): TariffFact[] {
  const out: TariffFact[] = [];
  const t = grid.taxes;
  if (t.exciseMicroPerKwh !== null) {
    const label = t.exciseLabel === 'Accise'
      ? "Accise sur l'électricité (anciennement CSPE)"
      : `Contribution au service public de l'électricité (CSPE${t.exciseAlias ? `, aussi appelée ${plain(t.exciseAlias)}` : ''})`;
    out.push({ label, value: formatCentsPerKwhHtva(t.exciseMicroPerKwh) });
  }
  if (t.tcfeMaxMicroPerKwh !== null) {
    out.push({ label: "Taxes sur la consommation finale d'électricité (TCFE), montant maximum", value: formatCentsPerKwhHtva(t.tcfeMaxMicroPerKwh) });
  }
  if (t.cta) {
    out.push({ label: "Contribution tarifaire d'acheminement (CTA)",
      value: t.cta.forMajorityOfClients ? 'Incluse dans le prix (correspondant à la majorité des clients)' : 'Incluse dans le prix' });
  }
  if (t.vat.subscription !== null) out.push({ label: "TVA sur l'abonnement", value: formatPercent(t.vat.subscription) });
  if (t.vat.cta !== null) out.push({ label: 'TVA sur la CTA', value: formatPercent(t.vat.cta) });
  if (t.vat.consumption !== null) out.push({ label: 'TVA sur les consommations et les autres taxes', value: formatPercent(t.vat.consumption) });
  const s = grid.surcharges;
  if (s.selfProducerInjection !== null) {
    out.push({ label: 'Majoration pour les auto-producteurs individuels avec injection', value: formatEuroPerYearHt(s.selfProducerInjection) });
  }
  if (s.noLinky !== null) {
    out.push({ label: "Majoration de l'abonnement : absence de compteur Linky (hors impossibilité technique d'installation)", value: formatEuroPerYearHt(s.noLinky) });
  }
  if (s.noIndexTransmission12Months !== null) {
    const from = s.noIndexFrom ? `, à partir du ${frLongDate(s.noIndexFrom)}` : '';
    out.push({
      label: s.noIndexFrom
        ? `Majoration pour les consommateurs non équipés d'un compteur Linky et n'ayant pas mis d'index de consommation à disposition du gestionnaire de réseau depuis plus de 12 mois${from}`
        : "Majoration de l'abonnement : absence de transmission d'index de consommation depuis plus de 12 mois",
      value: formatEuroPerYearHt(s.noIndexTransmission12Months),
    });
  }
  if (grid.baseExtinction) {
    const e = grid.baseExtinction;
    out.push({ label: 'Puissances Base en extinction', value: `de ${e.fromKva} à ${e.toKva} kVA (non souscriptibles)` });
    if (e.legalBasis) out.push({ label: "Base de l'extinction", value: plain(e.legalBasis) });
  }
  return out;
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
      source: tariffSource(g),
      offers: sel.map((o) => offerPrices(g, o, kva)),
      fullGrid: fullGridTables(g, kva),
      facts: gridFacts(g),
    });
  }
  const calendarEstimate = !!a && sel.includes('tempo') && a.offers.tempo.available && a.offers.tempo.calendarEstimateDays > 0;
  return { kva, sections, calendarEstimate };
}
