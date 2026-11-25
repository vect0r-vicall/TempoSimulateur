// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/**
 * Pricing engine. Integer micro-euros (µEUR) everywhere; nothing here reads the clock.
 *
 * Exported types (for the chart, S7):
 *  - OfferId            'tempo' | 'hchp' | 'base'
 *  - PartKey            energy part key: a Bucket ('hp','hc','bleuHC',...) or 'base'
 *  - DayOfferCost       cost of ONE day for ONE offer:
 *       date            YYYY-MM-DD
 *       totalMicro      subMicro + sum(energyMicro)
 *       subMicro        daily subscription = Math.round(monthly µEUR / days in month)
 *       energyMicro     energy cost per part: base -> {base}; hchp -> {hc,hp};
 *                       tempo -> {bleuHC,bleuHP,blancHC,blancHP,rougeHC,rougeHP} (only non-zero-kWh keys not required)
 *       kwh             kWh per part, same keys as energyMicro (HC/HP ratio = kwh.hc / kwh.hp, or sums of *HC / *HP
 *                       for tempo; for base the single part is the total kWh)
 *       estimate        true when the Tempo colour comes from the embedded calendar (day of an 'hchp' period)
 *       colour          'B'|'W'|'R' calendar colour when estimate is true, else null (Tempo-era days: colours are
 *                       given by the bucket keys themselves)
 *       gapEstimated    the day's kWh were spread over a reading gap
 *  - OfferResult        per offer: available, reason (French, when unavailable), totalMicro, days (only when available),
 *                       calendarEstimateDays (count of days with estimate = true)
 *  - Offers             Record<OfferId, OfferResult>
 * The `days` arrays of the available offers are aligned on the same ascending date list.
 */
import { GRIDS, Grid } from '../data/grids';
import { tempoColourOf } from '../data/tempo-calendar';
import { Bucket, DayConsumption } from './types';
import { frDate } from './format';

export type OfferId = 'tempo' | 'hchp' | 'base';
export type PartKey = Bucket | 'base';
export type Colour = 'B' | 'W' | 'R';

export const OFFER_IDS: OfferId[] = ['tempo', 'hchp', 'base'];
export const OFFER_LABEL: Record<OfferId, string> = {
  tempo: 'Tempo',
  hchp: 'Heures creuses / Heures pleines',
  base: 'Base',
};
export const KVA_LIST = [3, 6, 9, 12, 15, 18, 24, 30, 36];

export interface DayOfferCost {
  date: string;
  totalMicro: number;
  subMicro: number;
  energyMicro: Partial<Record<PartKey, number>>;
  kwh: Partial<Record<PartKey, number>>;
  estimate: boolean;
  colour: Colour | null;
  gapEstimated: boolean;
}

export interface OfferResult {
  offer: OfferId;
  available: boolean;
  reason: string;
  totalMicro: number;
  days: DayOfferCost[];
  calendarEstimateDays: number;
}
export type Offers = Record<OfferId, OfferResult>;

/** Latest grid with effective <= date; undefined before the first grid. */
export function gridFor(date: string): Grid | undefined {
  let found: Grid | undefined;
  for (const g of GRIDS) {
    if (g.effective <= date) found = g;
    else break;
  }
  return found;
}

export function lastGridEffective(): string {
  return GRIDS[GRIDS.length - 1]!.effective;
}

export function daysInMonth(date: string): number {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
}

type TempoBucket = 'bleuHC' | 'bleuHP' | 'blancHC' | 'blancHP' | 'rougeHC' | 'rougeHP';
const TEMPO_BUCKET_OF: Record<Colour, [TempoBucket, TempoBucket]> = {
  B: ['bleuHC', 'bleuHP'],
  W: ['blancHC', 'blancHP'],
  R: ['rougeHC', 'rougeHP'],
};
const TEMPO_BUCKETS: TempoBucket[] = ['bleuHC', 'bleuHP', 'blancHC', 'blancHP', 'rougeHC', 'rougeHP'];

function sumKwh(kwh: Partial<Record<Bucket, number>>, suffix: 'HC' | 'HP'): number {
  let s = 0;
  for (const [k, v] of Object.entries(kwh)) if (k.endsWith(suffix)) s += v ?? 0;
  return s;
}

type Miss = { first: string; last: string } | undefined;
function note(m: Miss, date: string): Miss {
  return m ? { first: m.first, last: date } : { first: date, last: date };
}
function range(m: NonNullable<Miss>): string {
  return m.first === m.last ? `le ${frDate(m.first)}` : `du ${frDate(m.first)} au ${frDate(m.last)}`;
}

/** Prices every given day for the three offers at one kVA. */
export function priceOffers(days: DayConsumption[], kva: number): Offers {
  const out = {} as Offers;
  for (const offer of OFFER_IDS) {
    const costs: DayOfferCost[] = [];
    let noGrid: Miss;
    let noRow: Miss;
    let noColour: Miss;
    let total = 0;
    let estDays = 0;
    for (const d of days) {
      const grid = gridFor(d.date);
      if (!grid) {
        noGrid = note(noGrid, d.date);
        continue;
      }
      const dim = daysInMonth(d.date);
      let sub = 0;
      const energy: Partial<Record<PartKey, number>> = {};
      const kwh: Partial<Record<PartKey, number>> = {};
      let estimate = false;
      let colour: Colour | null = null;
      if (offer === 'base') {
        const row = grid.base.find((r) => r.kva === kva);
        if (!row) {
          noRow = note(noRow, d.date);
          continue;
        }
        let tot = 0;
        for (const v of Object.values(d.kwh)) tot += v ?? 0;
        sub = Math.round(row.sub / dim);
        kwh.base = tot;
        energy.base = tot * row.kwh;
      } else if (offer === 'hchp') {
        const row = grid.hchp.find((r) => r.kva === kva);
        if (!row) {
          noRow = note(noRow, d.date);
          continue;
        }
        const hp = d.kind === 'tempo' ? sumKwh(d.kwh, 'HP') : (d.kwh.hp ?? 0);
        const hc = d.kind === 'tempo' ? sumKwh(d.kwh, 'HC') : (d.kwh.hc ?? 0);
        sub = Math.round(row.sub / dim);
        kwh.hp = hp;
        kwh.hc = hc;
        energy.hp = hp * row.hp;
        energy.hc = hc * row.hc;
      } else {
        const row = grid.tempo.find((r) => r.kva === kva);
        if (!row) {
          noRow = note(noRow, d.date);
          continue;
        }
        sub = Math.round(row.sub / dim);
        if (d.kind === 'tempo') {
          for (const b of TEMPO_BUCKETS) {
            const k = d.kwh[b] ?? 0;
            kwh[b] = k;
            energy[b] = k * row[b];
          }
        } else {
          const c = tempoColourOf(d.date);
          if (c === null) {
            noColour = note(noColour, d.date);
            continue;
          }
          const [hcB, hpB] = TEMPO_BUCKET_OF[c];
          kwh[hcB] = d.kwh.hc ?? 0;
          kwh[hpB] = d.kwh.hp ?? 0;
          energy[hcB] = (d.kwh.hc ?? 0) * row[hcB];
          energy[hpB] = (d.kwh.hp ?? 0) * row[hpB];
          estimate = true;
          colour = c;
          estDays++;
        }
      }
      let t = sub;
      for (const v of Object.values(energy)) t += v ?? 0;
      total += t;
      costs.push({ date: d.date, totalMicro: t, subMicro: sub, energyMicro: energy, kwh, estimate, colour, gapEstimated: d.estimated });
    }
    const reasons: string[] = [];
    const label = OFFER_LABEL[offer];
    if (noGrid) reasons.push(`Aucune grille tarifaire applicable ${range(noGrid)}.`);
    if (noRow) reasons.push(`Pas de tarif ${label} pour ${kva} kVA ${range(noRow)}.`);
    if (noColour) reasons.push(`Couleur Tempo inconnue ${range(noColour)} (calendrier incomplet).`);
    if (!Number.isSafeInteger(total)) reasons.push('Total trop grand pour être calculé exactement.');
    const available = reasons.length === 0 && costs.length > 0;
    if (!available && reasons.length === 0) reasons.push('Aucun jour à valoriser.');
    out[offer] = {
      offer,
      available,
      reason: reasons.join(' '),
      totalMicro: available ? total : 0,
      days: available ? costs : [],
      calendarEstimateDays: available ? estDays : 0,
    };
  }
  return out;
}
