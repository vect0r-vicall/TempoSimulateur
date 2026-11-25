// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { OFFER_LABEL } from '../core/pricing';
import { Tariffs, TariffOffer } from '../core/tariffs';
import { formatCentsPerKwh, formatEuro, frDate, frLongDate } from '../core/format';
import { el, node } from './dom';

const NOT_OFFERED = 'Non proposé pour cette puissance dans cette grille';
const CALENDAR_LINE = 'Couleurs des jours Tempo (périodes en Heures pleines/creuses) : RTE, via api-couleur-tempo.fr (relais non officiel)';

function offerRow(o: TariffOffer): HTMLTableRowElement {
  const tr = node('tr');
  const th = node('th', undefined, OFFER_LABEL[o.offer]);
  th.scope = 'row';
  tr.append(th);
  if (!o.available) {
    const td = node('td', 'tariff-na', NOT_OFFERED);
    td.colSpan = 2;
    tr.append(td);
    return tr;
  }
  tr.append(node('td', 'num', formatEuro(o.monthlySubscriptionMicro)));
  const td = node('td');
  const dl = node('dl', 'tariff-prices');
  for (const p of o.prices) {
    const item = node('div');
    item.append(node('dt', undefined, p.label), node('dd', undefined, formatCentsPerKwh(p.microPerKwh)));
    dl.append(item);
  }
  td.append(dl);
  tr.append(td);
  return tr;
}

export function renderTariffs(t: Tariffs | null): void {
  const root = el<HTMLElement>('tariffs');
  root.replaceChildren();
  if (!t) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.append(
    node('h2', undefined, 'Tarifs appliqués'),
    node('p', 'hint', `Puissance souscrite : ${t.kva} kVA · prix TTC · abonnement en € par mois · kWh en centimes d'euro`),
  );
  for (const s of t.sections) {
    const sec = node('div', 'tariff-section');
    sec.append(node('h3', undefined, `Du ${frDate(s.from)} au ${frDate(s.to)} — grille du ${frLongDate(s.effective)}`));
    if (s.reusedBeyondLast) sec.append(node('p', 'notice', 'Prix reconduits au-delà de la dernière grille connue'));
    sec.append(node('p', 'tariff-source', `Source : ${s.source.label} (fichier ${s.source.file})`));
    if (s.offers.length === 0) {
      sec.append(node('p', 'hint', 'Cochez au moins une offre pour afficher ses tarifs.'));
    } else {
      const wrap = node('div', 'table-wrap');
      const table = node('table', 'tariff-table');
      table.append(node('caption', 'visually-hidden', `Tarifs de la grille du ${frLongDate(s.effective)} pour ${t.kva} kVA`));
      const head = node('tr');
      for (const [txt, cls] of [['Offre', ''], ['Abonnement (€/mois)', 'num'], ['Prix du kWh', '']] as const) {
        const th = node('th', cls || undefined, txt);
        th.scope = 'col';
        head.append(th);
      }
      const thead = node('thead');
      thead.append(head);
      const tbody = node('tbody');
      for (const o of s.offers) tbody.append(offerRow(o));
      table.append(thead, tbody);
      wrap.append(table);
      sec.append(wrap);
    }
    root.append(sec);
  }
  if (t.calendarEstimate) root.append(node('p', 'tariff-source', CALENDAR_LINE));
}
