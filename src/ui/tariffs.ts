// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { OFFER_LABEL } from '../core/pricing';
import { Tariffs, TariffOffer, TariffSection, GridTable } from '../core/tariffs';
import { formatCentsNumber, formatCentsPerKwh, formatEuro, formatEuroNumber, frDate, frLongDate } from '../core/format';
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

function gridTable(t: GridTable): HTMLElement {
  const wrap = node('div', 'table-wrap');
  const table = node('table', 'tariff-table grid-table');
  table.append(node('caption', undefined, t.caption));
  const head = node('tr');
  const first = node('th', undefined, 'Puissance (kVA)');
  first.scope = 'col';
  head.append(first);
  for (const c of t.columns) {
    const th = node('th', 'num', c.label);
    th.scope = 'col';
    head.append(th);
  }
  const thead = node('thead');
  thead.append(head);
  const tbody = node('tbody');
  for (const r of t.rows) {
    const tr = node('tr', r.selected ? 'is-selected' : undefined);
    if (r.selected) tr.setAttribute('aria-current', 'true');
    const th = node('th', undefined, String(r.kva));
    th.scope = 'row';
    tr.append(th);
    r.cells.forEach((v, i) => tr.append(node('td', 'num', t.columns[i]!.unit === 'eur' ? formatEuroNumber(v) : formatCentsNumber(v))));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function fullGridDetails(s: TariffSection, kva: number, open: boolean): HTMLElement {
  const d = node('details', 'tariff-details');
  d.dataset.effective = s.effective;
  d.open = open;
  d.append(node('summary', undefined, `Grille complète du ${frLongDate(s.effective)} (toutes les puissances)`));
  d.append(node('p', 'hint', `Prix TTC tels qu'imprimés dans la grille du ${frLongDate(s.effective)} ; la ligne de votre puissance (${kva} kVA) est surlignée lorsqu'elle figure dans la table.`));
  for (const t of s.fullGrid) d.append(gridTable(t));
  return d;
}

function factsList(s: TariffSection): HTMLElement | null {
  if (s.facts.length === 0) return null;
  const box = node('div', 'tariff-facts');
  box.append(node('h4', undefined, 'Taxes et majorations'));
  const dl = node('dl', 'tariff-facts-list');
  for (const f of s.facts) {
    const item = node('div');
    item.append(node('dt', undefined, f.label), node('dd', undefined, f.value));
    dl.append(item);
  }
  box.append(dl);
  return box;
}

export function renderTariffs(t: Tariffs | null): void {
  const root = el<HTMLElement>('tariffs');
  // keep the opened grids open across re-renders (kVA / offer / period changes)
  const opened = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>('details[open]')).map((d) => d.dataset.effective));
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
    sec.append(node('p', 'tariff-source', `Source : ${s.source.label}.`));
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
    sec.append(fullGridDetails(s, t.kva, opened.has(s.effective)));
    const facts = factsList(s);
    if (facts) sec.append(facts);
    root.append(sec);
  }
  if (t.calendarEstimate) root.append(node('p', 'tariff-source', CALENDAR_LINE));
}
