// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { Podium } from '../core/podium';
import { formatEuro } from '../core/format';
import { node } from './dom';

/** The podium as an ordered list in ranking order (screen readers read 1st, 2nd, 3rd); CSS places 2nd left, 1st centre, 3rd right. */
export function renderPodium(p: Podium, compact: boolean): HTMLElement {
  const ol = node('ol', `podium podium-${Math.min(p.entries.length, 3)}${compact ? ' compact' : ''}`);
  ol.setAttribute('aria-label', 'Classement des offres');
  p.entries.forEach((e, i) => {
    const li = node('li', `pod pod-r${Math.min(e.rank, 3)} pod-pos-${i + 1}${e.winner ? ' pod-winner' : ''}`);
    const card = node('div', 'pod-card');
    card.append(node('span', 'pod-rank', e.rankLabel), node('span', 'pod-name', e.name), node('span', 'pod-total', formatEuro(e.totalMicro)));
    card.append(e.winner ? node('span', 'badge', 'Le moins cher') : node('span', 'pod-gap', e.gapText));
    const step = node('div', 'pod-step');
    step.setAttribute('aria-hidden', 'true');
    step.append(node('span', undefined, String(e.rank)));
    li.append(card, step);
    ol.append(li);
  });
  return ol;
}

/** The savings sentence under the podium. */
export function renderPodiumGain(p: Podium): HTMLElement {
  const para = node('p', 'podium-gain');
  const icon = node('span', 'podium-gain-icon', '💡');
  icon.setAttribute('aria-hidden', 'true');
  para.append(icon, document.createTextNode(` ${p.sentence}`));
  return para;
}
