// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { assumptionLines, KvaSource } from '../core/assumptions';
import { Analysis } from '../core/recap';
import { el, node } from './dom';

export function renderAssumptions(a: Analysis | null, source: KvaSource, kva: number, suggested: number | null): void {
  const root = el<HTMLElement>('assumptions');
  root.replaceChildren(node('h2', undefined, 'Hypothèses et limites'));
  const ul = node('ul');
  for (const line of assumptionLines(a, source, kva, suggested)) ul.append(node('li', undefined, line));
  root.append(ul);
}
