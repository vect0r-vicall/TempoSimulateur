// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-7 [AC-20, FR-030]: pure 'Tarifs appliqués' model + French formatting. Synthetic periods only.
// Expected prices are read independently from the GRIDS export (not from parser output of the model).
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL: ' + msg); } else console.log('ok: ' + msg); };
const eq = (got, want, msg) => ok(JSON.stringify(got) === JSON.stringify(want), `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);

try {
  const { buildTariffs, tariffSource } = await import('../.build-test/core/tariffs.mjs');
  const { formatCentsPerKwh, formatEuro, frLongDate } = await import('../.build-test/core/format.mjs');
  const { GRIDS } = await import('../.build-test/data/grids.mjs');
  const ALL = ['tempo', 'hchp', 'base'];

  // independent reading: parse the generated source text as JSON (strip header and TS wrapper)
  const text = readFileSync(new URL('../src/data/grids.ts', import.meta.url), 'utf8');
  const arr = JSON.parse(text.slice(text.indexOf('export const GRIDS: Grid[] = ') + 'export const GRIDS: Grid[] = '.length).replace(/;\s*$/, ''));
  const gridText = (eff) => arr.find((g) => g.effective === eff);
  const t9 = (eff) => gridText(eff).tempo.find((r) => r.kva === 9);
  ok(arr.length === GRIDS.length, 'text parse and export agree on grid count');

  // 1 section inside one grid
  let t = buildTariffs({ from: '2026-03-01', to: '2026-06-30' }, 9, ALL);
  eq(t.sections.length, 1, 'period inside one grid -> 1 section');
  eq([t.sections[0].effective, t.sections[0].from, t.sections[0].to, t.sections[0].reusedBeyondLast], ['2026-02-01', '2026-03-01', '2026-06-30', false], 'section dates');
  eq(t.sections[0].offers.map((o) => o.offer), ['tempo', 'hchp', 'base'], 'offers in fixed order');

  // straddling 2026-07-31 / 2026-08-01
  t = buildTariffs({ from: '2026-07-15', to: '2026-08-15' }, 9, ALL);
  eq(t.sections.length, 2, 'straddling period -> 2 sections');
  eq(t.sections.map((s) => [s.effective, s.from, s.to]), [['2026-02-01', '2026-07-15', '2026-07-31'], ['2026-08-01', '2026-08-01', '2026-08-15']], 'ranges');
  eq(t.sections.map((s) => s.reusedBeyondLast), [false, true], 'only the last grid is reused');
  for (const [i, eff] of [[0, '2026-02-01'], [1, '2026-08-01']]) {
    const tempo = t.sections[i].offers.find((o) => o.offer === 'tempo');
    const want = t9(eff);
    eq(tempo.monthlySubscriptionMicro, want.sub, `tempo subscription ${eff}`);
    eq(tempo.prices.map((p) => p.microPerKwh), [want.bleuHC, want.bleuHP, want.blancHC, want.blancHP, want.rougeHC, want.rougeHP], `tempo prices ${eff}`);
    eq(tempo.prices.map((p) => p.label), ['Bleu — heures creuses', 'Bleu — heures pleines', 'Blanc — heures creuses', 'Blanc — heures pleines', 'Rouge — heures creuses', 'Rouge — heures pleines'], 'tempo labels');
    const hc = t.sections[i].offers.find((o) => o.offer === 'hchp');
    const wh = gridText(eff).hchp.find((r) => r.kva === 9);
    eq(hc.prices, [{ label: 'Heures pleines', microPerKwh: wh.hp }, { label: 'Heures creuses', microPerKwh: wh.hc }], `hchp prices ${eff}`);
    const b = t.sections[i].offers.find((o) => o.offer === 'base');
    const wb = gridText(eff).base.find((r) => r.kva === 9);
    eq(b.prices, [{ label: 'Prix du kWh', microPerKwh: wb.kwh }], `base price ${eff}`);
    eq(b.monthlySubscriptionMicro, wb.sub, `base subscription ${eff}`);
  }
  ok(t9('2026-02-01').rougeHP !== t9('2026-08-01').rougeHP, 'Tempo prices differ between the two grids');
  eq(t.sections[0].offers.find((o) => o.offer === 'base').prices[0].microPerKwh, 192700, 'base 20260201 = 192700 (hand value)');

  // beyond the last grid
  t = buildTariffs({ from: '2026-10-01', to: '2026-12-31' }, 9, ALL);
  eq(t.sections.length, 1, 'after last grid -> 1 section');
  eq([t.sections[0].effective, t.sections[0].reusedBeyondLast], ['2026-08-01', true], 'reusedBeyondLast');
  // exactly on the last grid day: not "beyond"
  eq(buildTariffs({ from: '2026-08-01', to: '2026-08-01' }, 9, ALL).sections[0].reusedBeyondLast, false, 'single day on grid date is not reused');

  // several years -> one section per grid, chronological, contiguous
  t = buildTariffs({ from: '2022-02-01', to: '2026-12-31' }, 9, ALL);
  eq(t.sections.length, GRIDS.length, 'multi-year -> one section per grid');
  eq(t.sections.map((s) => s.effective), arr.map((g) => g.effective), 'chronological');
  ok(t.sections.every((s, i) => i === 0 || s.from > t.sections[i - 1].to), 'sections do not overlap');

  // before first grid: ignored
  eq(buildTariffs({ from: '2022-01-10', to: '2022-02-02' }, 9, ALL).sections.map((s) => [s.from, s.to]), [['2022-02-01', '2022-02-02']], 'days before the first grid ignored');

  // unavailable at 3 kVA in an old grid
  t = buildTariffs({ from: '2022-03-01', to: '2022-03-31' }, 3, ALL);
  const wantTempo3 = gridText('2022-02-01').tempo.find((r) => r.kva === 3);
  const wantHchp3 = gridText('2022-02-01').hchp.find((r) => r.kva === 3);
  const o3 = (n) => t.sections[0].offers.find((o) => o.offer === n);
  ok(!wantTempo3 && !wantHchp3, 'source text confirms no 3 kVA Tempo/HC-HP row in 20220201');
  eq([o3('tempo').available, o3('tempo').prices.length, o3('hchp').available], [false, 0, false], 'Tempo/HC-HP unavailable at 3 kVA');
  eq(o3('base').available, true, 'Base available at 3 kVA');

  // selected offers filter
  t = buildTariffs({ from: '2026-03-01', to: '2026-03-31' }, 9, ['base', 'tempo']);
  eq(t.sections[0].offers.map((o) => o.offer), ['tempo', 'base'], 'selection filter keeps fixed order');
  eq(buildTariffs({ from: '2026-03-01', to: '2026-03-31' }, 9, []).sections[0].offers.length, 0, 'no offer -> no rows');
  eq(buildTariffs({ from: '2026-03-01', to: '2026-03-31' }, 9, ALL).calendarEstimate, false, 'no analysis -> no calendar credit');

  // source label / file name
  eq(tariffSource('2026-02-01'), {
    label: 'EDF — grille de prix « Tarif Bleu » (clients particuliers), applicable au 1er février 2026, prix TTC',
    file: 'tarifs-20260201.pdf',
  }, 'source for 2026-02-01');
  eq(tariffSource('2025-08-01').file, 'tarifs-20250801.pdf', 'file name 2025-08-01');
  eq([frLongDate('2025-08-01'), frLongDate('2024-12-15')], ['1er août 2025', '15 décembre 2024'], 'long dates');

  // formatting
  eq(formatCentsPerKwh(192700), '19,27 c€/kWh', 'kWh format');
  eq(formatCentsPerKwh(1740000 / 10), '17,40 c€/kWh', 'kWh format trailing zero');
  eq(formatCentsPerKwh(729500), '72,95 c€/kWh', 'kWh format rouge HP');
  eq(formatCentsPerKwh(95000), '9,50 c€/kWh', 'kWh format < 10');
  eq(formatEuro(19560000), '19,56\u00a0€', 'subscription format (non-breaking space, as formatEuro)');
} catch (e) {
  console.error('ERROR: ' + (e && e.stack ? e.stack : e));
  process.exit(2);
}
process.exit(failures ? 1 : 0);
