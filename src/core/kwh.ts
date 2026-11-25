// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure energy aggregation and French wording. kWh are whole integers in the model (index counters), summed with integer arithmetic only. */
import { Seg } from './weather';
import { formatKwh, formatPercent } from './format';

export interface Consumption { total: number; hc: number; hp: number }

/** Sums per-day kWh maps (Bucket keys or 'base'): total = every key, hc/hp = keys ending in HC/HP ('hc'/'hp' included). */
export function sumConsumption(days: Iterable<{ kwh: Partial<Record<string, number>> }>): Consumption {
  const c: Consumption = { total: 0, hc: 0, hp: 0 };
  for (const d of days) {
    for (const [k, raw] of Object.entries(d.kwh)) {
      const v = raw ?? 0;
      c.total += v;
      if (k === 'hc' || k.endsWith('HC')) c.hc += v;
      else if (k === 'hp' || k.endsWith('HP')) c.hp += v;
    }
  }
  return c;
}

const hasSplit = (c: Consumption): boolean => c.hc + c.hp > 0;
/** Integer percent of HC (the HP share is 100 - it), same rounding as the chart's ratio. */
export const hcPercent = (c: Consumption): number => Math.round((100 * c.hc) / (c.hc + c.hp));

/** Tooltip line 'Consommation : 1 318 kWh (HC 664 kWh, 50 % · HP 654 kWh, 50 %)'; the split only when HC/HP data exists. */
export function consumptionSegments(c: Consumption): Seg[] {
  const out: Seg[] = [{ text: 'Consommation : ' }, { text: formatKwh(c.total), cls: 'tt-kwh' }];
  if (hasSplit(c)) {
    const hc = hcPercent(c);
    out.push({ text: ' (HC ' }, { text: formatKwh(c.hc), cls: 'tt-kwh' }, { text: `, ${formatPercent(hc)} · HP ` }, { text: formatKwh(c.hp), cls: 'tt-kwh' }, { text: `, ${formatPercent(100 - hc)})` });
  }
  return out;
}

/** Recap sentence body: '4 321 kWh (HC 40 % / HP 60 %)'; the split only when HC/HP data exists. */
export function consumptionText(c: Consumption): string {
  return hasSplit(c) ? `${formatKwh(c.total)} (HC ${formatPercent(hcPercent(c))} / HP ${formatPercent(100 - hcPercent(c))})` : formatKwh(c.total);
}
