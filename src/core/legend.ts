// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure legend model: one block per selected offer (same order as the bars) plus an optional ratio block. */
import { OFFER_IDS, OFFER_LABEL, OfferId, Offers } from './pricing';

export interface LegendEntry {
  id: string; // segment id ('sub', 'B-HC', ...); the swatch uses CSS class seg-<id>
  cls: string;
  label: string; // French
  hatch: boolean; // HP segment: hatch overlay, as on the bars at month/year level
  dots: boolean; // unknown Tempo colour: dots overlay
}
export interface LegendBlock {
  id: string; // offer id or 'ratio'
  title: string;
  tag: string; // bar tag (T/H/B), '' for the ratio block and for offers without a bar
  entries: LegendEntry[];
  note: string; // non-empty for unavailable offers and for the ratio block
}
export interface LegendOpts {
  hatchHP: boolean; // bars carry the hatch overlay (month/year views)
  unknownColour: boolean; // the view contains grey 'unknown colour' Tempo segments
  ratio: boolean; // the view draws the HC/HP ratio strip
}

/** Bar tag (short letter) and bar label (full name) per offer. */
export const OFFER_TAG: Record<OfferId, string> = { tempo: 'T', hchp: 'H', base: 'B' };
export const OFFER_BAR_NAME: Record<OfferId, string> = { tempo: 'Tempo', hchp: 'HC/HP', base: 'Base' };

const COLOURS: { key: 'B' | 'W' | 'R'; name: string }[] = [
  { key: 'B', name: 'Bleu' },
  { key: 'W', name: 'Blanc' },
  { key: 'R', name: 'Rouge' },
];

function entry(id: string, label: string, o: LegendOpts, extra: { hp?: boolean; dots?: boolean } = {}): LegendEntry {
  return { id, cls: `seg-${id}`, label, hatch: !!extra.hp && o.hatchHP, dots: !!extra.dots };
}

export function buildLegend(selected: OfferId[], offers: Offers, o: LegendOpts): LegendBlock[] {
  const blocks: LegendBlock[] = [];
  for (const id of OFFER_IDS.filter((x) => selected.includes(x))) {
    const res = offers[id];
    if (!res.available) {
      blocks.push({ id, title: OFFER_LABEL[id], tag: '', entries: [], note: `Indisponible, aucune barre : ${res.reason}` });
      continue;
    }
    const entries: LegendEntry[] = [entry('sub', 'Abonnement', o)];
    if (id === 'tempo') {
      for (const c of COLOURS) {
        entries.push(entry(`${c.key}-HC`, `${c.name} heures creuses`, o));
        entries.push(entry(`${c.key}-HP`, `${c.name} heures pleines`, o, { hp: true }));
      }
      if (o.unknownColour) {
        entries.push(entry('U-HC', 'Couleur inconnue, heures creuses', o, { dots: true }));
        entries.push(entry('U-HP', 'Couleur inconnue, heures pleines', o, { hp: true, dots: true }));
      }
    } else if (id === 'hchp') {
      entries.push(entry('H-HC', 'Heures creuses', o));
      entries.push(entry('H-HP', 'Heures pleines', o, { hp: true }));
    } else {
      entries.push(entry('base', 'Énergie', o));
    }
    blocks.push({ id, title: OFFER_LABEL[id], tag: OFFER_TAG[id], entries, note: '' });
  }
  if (o.ratio) {
    blocks.push({
      id: 'ratio',
      title: 'Répartition des kWh',
      tag: '',
      entries: [
        { id: 'ratio-hc', cls: 'seg-ratio-hc', label: 'Heures creuses', hatch: false, dots: false },
        { id: 'ratio-hp', cls: 'seg-ratio-hp', label: 'Heures pleines', hatch: false, dots: false },
      ],
      note: 'La fine bande sous chaque groupe montre la part des kWh consommés en heures creuses et en heures pleines.',
    });
  }
  return blocks;
}
