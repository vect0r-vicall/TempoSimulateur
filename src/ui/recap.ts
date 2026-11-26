// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { Analysis, Recap } from '../core/recap';
import { OFFER_LABEL } from '../core/pricing';
import { ESTIMATE_NOTICE } from '../core/assumptions';
import { formatEuro, frDate, frDateList } from '../core/format';
import { consumptionText } from '../core/kwh';
import { PeriodInfo } from '../core/types';
import { el, node } from './dom';
import { renderPodium, renderPodiumGain } from './podium';

export function renderRecap(a: Analysis, r: Recap): void {
  const root = el<HTMLElement>('recap-body');
  root.replaceChildren();
  const cheapest = r.rows.filter((x) => x.cheapest);
  el<HTMLElement>('recap-summary').textContent = r.podium
    ? r.podium.summary
    : r.compared >= 2 && cheapest.length > 0
      ? `Offre la moins chère : ${cheapest.map((x) => OFFER_LABEL[x.offer]).join(', ')}, ${formatEuro(cheapest[0]!.totalMicro)}.`
      : '';
  root.append(node('h2', undefined, `Coût du ${frDate(a.period.from)} au ${frDate(a.period.to)}`));

  if (r.rows.length === 0) {
    root.append(node('p', 'hint', 'Cochez au moins une offre pour afficher le récapitulatif.'));
  } else {
    // with a podium only the unavailable offers stay in the list (with their reason); without one the flat list is unchanged
    if (r.podium) root.append(renderPodium(r.podium, false), renderPodiumGain(r.podium));
    const list = node('ul', 'offers');
    for (const row of r.rows) {
      if (r.podium && row.available) continue;
      const hl = row.cheapest && r.compared >= 2;
      const li = node('li', row.available ? (hl ? 'offer cheapest' : 'offer') : 'offer unavailable');
      li.append(node('span', 'offer-name', OFFER_LABEL[row.offer]));
      if (row.available) {
        li.append(node('span', 'offer-total', formatEuro(row.totalMicro)));
        if (hl) li.append(node('span', 'badge', 'Le moins cher'));
      } else {
        li.append(node('span', 'offer-total', 'Indisponible'));
        li.append(node('span', 'offer-reason', row.reason));
      }
      list.append(li);
    }
    if (list.childElementCount > 0) root.append(list);
  }

  const stats = node('ul', 'stats');
  const stat = (n: number, label: string) => {
    const li = node('li');
    li.append(node('span', 'num', String(n)), node('span', 'lbl', label));
    return li;
  };
  stats.append(stat(r.pricedDays, 'jours valorisés'), stat(r.estimatedDays, 'jours estimés'), stat(r.excludedDays, 'jours exclus'));
  root.append(stats);
  root.append(node('p', 'recap-kwh', `Consommation sur la période : ${consumptionText(r.kwh)}`));

  if (r.calendarEstimate) root.append(node('p', 'notice', `Attention, ${ESTIMATE_NOTICE}.`));
}

export function renderPeriods(periods: PeriodInfo[], excluded: string[]): void {
  const root = el<HTMLElement>('periods');
  root.replaceChildren(node('h2', undefined, 'Périodes de contrat détectées'));
  const ul = node('ul');
  for (const p of periods) {
    const kind = p.kind === 'tempo' ? 'Tempo' : 'Heures pleines / creuses';
    ul.append(node('li', undefined, `${kind} : relevés du ${frDate(p.from)} au ${frDate(p.to)} (${p.days} jour${p.days > 1 ? 's' : ''} valorisé${p.days > 1 ? 's' : ''})`));
  }
  root.append(ul);
  if (excluded.length > 0) {
    root.append(node('p', 'hint', `Jours exclus dans le fichier (changement de contrat) : ${frDateList(excluded)}`));
  }
}
