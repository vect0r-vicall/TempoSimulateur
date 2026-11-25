// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Text lines of the always-visible assumptions box (FR-024), pure so that checks can read them. */
import { Analysis } from './recap';
import { frDateList, frDate } from './format';
import { lastGridEffective } from './pricing';

export type KvaSource = 'default' | 'inferred' | 'manual';

export const CALENDAR_CREDIT = 'Couleurs Tempo : RTE, via api-couleur-tempo.fr (relais non officiel)';
export const ESTIMATE_NOTICE = 'estimation : coût Tempo calculé avec la couleur du calendrier';

export function kvaSourceLabel(source: KvaSource, kva: number, suggested: number | null): string {
  if (source === 'inferred' && suggested !== null) return `au moins ${suggested} kVA (déduit du pic de puissance)`;
  if (source === 'manual') return `${kva} kVA choisi manuellement`;
  return `${kva} kVA par défaut : à vérifier`;
}

export function assumptionLines(a: Analysis | null, source: KvaSource, kva: number, suggested: number | null): string[] {
  const lines = [
    'Heures creuses supposées de 22h00 à 06h00 (les heures creuses réelles de votre contrat sont inconnues).',
  ];
  if (a && a.hchpDays > 0) {
    lines.push(`Sur ${a.hchpDays} jours en Heures pleines / creuses, ${ESTIMATE_NOTICE}.`);
  } else {
    lines.push('Sur une période Heures pleines / creuses, le coût Tempo est une estimation faite avec la couleur du calendrier.');
  }
  if (a && a.excludedDays.length > 0) {
    lines.push(`Jours exclus aux changements de contrat, ni valorisés ni facturés : ${frDateList(a.excludedDays)}.`);
  } else {
    lines.push('Un jour de changement de contrat serait exclu (ni valorisé ni facturé) ; aucun dans la période affichée.');
  }
  if (a) lines.push(`Jours estimés (relevé manquant, consommation répartie) : ${a.estimatedDays}.`);
  lines.push(`Puissance souscrite : ${kvaSourceLabel(source, kva, suggested)}.`);
  lines.push(`Au-delà de la dernière grille tarifaire connue (${frDate(lastGridEffective())}), ses prix sont reconduits.`);
  lines.push(CALENDAR_CREDIT);
  return lines;
}
