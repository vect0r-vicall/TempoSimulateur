// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-7 [AC-20, FR-030]: pure 'Tarifs appliqués' model + French formatting. Synthetic periods only.
// Expected prices are read independently from the GRIDS export (not from parser output of the model).
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL: ' + msg); } else console.log('ok: ' + msg); };
const eq = (got, want, msg) => ok(JSON.stringify(got) === JSON.stringify(want), `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);

try {
  const { buildTariffs, tariffSource, gridFacts, fullGridTables } = await import('../.build-test/core/tariffs.mjs');
  const { formatCentsPerKwh, formatEuro, frLongDate } = await import('../.build-test/core/format.mjs');
  const F = await import('../.build-test/core/format.mjs');
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
  const g0 = GRIDS.find((g) => g.effective === '2026-02-01');
  eq(tariffSource(g0), {
    label: 'EDF — grille de prix « Tarif Bleu » (clients particuliers), applicable au 1er février 2026, prix TTC',
  }, 'source for 2026-02-01 (label only, no file name)');
  ok(!/fichier|\.pdf|tarifs-\d/i.test(JSON.stringify(buildTariffs({ from: '2022-02-01', to: '2026-12-31' }, 9, ALL).sections.map((x) => x.source))), 'no fichier/.pdf text in any source');
  ok(tariffSource({ ...g0, audience: 'clients professionnels' }).label !== tariffSource(g0).label && /clients professionnels/.test(tariffSource({ ...g0, audience: 'clients professionnels' }).label), 'source label follows grid.audience');
  ok(/applicable au 1er août 2025,/.test(tariffSource({ ...g0, appliesFrom: '2025-08-01' }).label) && tariffSource({ ...g0, appliesFrom: '2025-08-01' }).label !== tariffSource(g0).label, 'source label follows grid.appliesFrom');
  ok(!/\u2019/.test(tariffSource({ ...g0, audience: 'l\u2019audience' }).label), 'typographic apostrophe normalised in source label');
  ok(Object.keys(tariffSource(g0)).join() === 'label', 'source model has only a label');
  eq([frLongDate('2025-08-01'), frLongDate('2024-12-15')], ['1er août 2025', '15 décembre 2024'], 'long dates');

  // full grid tables: every kVA row of the grid, selected kVA flagged, values equal to the grid text
  for (const kva of [9, 6, 3]) {
    t = buildTariffs({ from: '2022-02-01', to: '2026-12-31' }, kva, ['base']);
    for (const sec of t.sections) {
      const gt = gridText(sec.effective);
      eq(sec.fullGrid.map((x) => x.offer), ['tempo', 'hchp', 'base'], `full grid tables order ${sec.effective}`);
      const by = (o) => sec.fullGrid.find((x) => x.offer === o);
      eq(by('base').rows.map((r) => r.kva), gt.base.map((r) => r.kva), `all Base kVA rows ${sec.effective}`);
      eq(by('hchp').rows.map((r) => r.kva), gt.hchp.map((r) => r.kva), `all HC kVA rows ${sec.effective}`);
      eq(by('tempo').rows.map((r) => r.kva), gt.tempo.map((r) => r.kva), `all Tempo kVA rows ${sec.effective}`);
      eq(by('base').rows.map((r) => r.cells), gt.base.map((r) => [r.sub, r.kwh]), `Base cells ${sec.effective}`);
      eq(by('hchp').rows.map((r) => r.cells), gt.hchp.map((r) => [r.sub, r.hp, r.hc]), `HC cells ${sec.effective}`);
      eq(by('tempo').rows.map((r) => r.cells), gt.tempo.map((r) => [r.sub, r.bleuHC, r.bleuHP, r.blancHC, r.blancHP, r.rougeHC, r.rougeHP]), `Tempo cells ${sec.effective}`);
      for (const tb of sec.fullGrid) {
        eq(tb.rows.filter((r) => r.selected).map((r) => r.kva), tb.rows.some((r) => r.kva === kva) ? [kva] : [], `selected flag ${tb.offer} ${kva} kVA ${sec.effective}`);
        ok(tb.rows.every((r) => r.cells.length === tb.columns.length), `column count ${tb.offer} ${sec.effective}`);
      }
    }
  }
  eq(buildTariffs({ from: '2026-03-01', to: '2026-03-31' }, 9, []).sections[0].fullGrid.length, 3, 'full grid shown even with no offer selected');
  eq(fullGridTables(arr[0], 3).map((x) => x.caption.split(' — ')[0]), ['Option Tempo', 'Option Heures creuses / Heures pleines', 'Option Base'], 'table captions use the offer labels');
  eq(fullGridTables(arr[0], 3).find((x) => x.offer === 'hchp').rows.some((r) => r.selected), false, '3 kVA: no HC row to flag in 2022-02');

  // taxes and majorations lines: present when printed, omitted when null
  const L = (eff) => Object.fromEntries(gridFacts(GRIDS.find((g) => g.effective === eff)).map((f) => [f.label, f.value]));
  const nb = '\u00a0';
  let f = L('2026-02-01');
  eq(f["Accise sur l'électricité (anciennement CSPE)"], `3,085 c€/kWh${nb}HTVA`, 'accise 2026-02');
  eq(f["TVA sur l'abonnement"], `20${nb}%`, 'VAT subscription 2026-02');
  eq(f['Majoration pour les auto-producteurs individuels avec injection'], `9,60${nb}€${nb}/${nb}an${nb}HT`, 'injection 2026-02');
  eq(f["Majoration de l'abonnement : absence de compteur Linky (hors impossibilité technique d'installation)"], `38,90${nb}€${nb}/${nb}an${nb}HT`, 'noLinky 2026-02');
  eq(f['Puissances Base en extinction'], 'de 9 à 36 kVA (non souscriptibles)', 'extinction 9-36');
  ok(!("Base de l'extinction" in f), 'no legal basis line when null');
  f = L('2022-02-01');
  eq(Object.keys(f).filter((k) => /TCFE|CSPE/.test(k)).length, 2, 'TCFE + CSPE printed in 2022-02');
  eq(f["Taxes sur la consommation finale d'électricité (TCFE), montant maximum"], `0,663 c€/kWh${nb}HTVA`, 'TCFE 2022 (trailing zero trimmed)');
  eq(f["TVA sur l'abonnement"], `5,5${nb}%`, 'VAT 5,5 % 2022');
  eq(f['TVA sur les consommations et les autres taxes'], `20${nb}%`, 'VAT 20 % 2022');
  eq(Object.keys(f).filter((k) => /Linky/.test(k)).length, 0, 'no Linky line in 2022 (omitted, not 0)');
  eq(f['Puissances Base en extinction'], 'de 18 à 36 kVA (non souscriptibles)', 'extinction 18-36 in 2022');
  ok(/Arrêté du 12 août 2010/.test(f["Base de l'extinction"]), 'legal basis 2022');
  ok(!/\u2019/.test(JSON.stringify(f)), 'no typographic apostrophe in 2022 facts');
  ok(/l'électricité$/.test(f["Base de l'extinction"]), 'legal basis uses the straight apostrophe');
  eq(Object.keys(f).filter((k) => /aussi appelée TICFE/.test(k)).length, 0, 'no TICFE alias in 2022');
  f = L('2023-02-01');
  eq(Object.keys(f).filter((k) => /Linky/.test(k)).length, 1, 'one Linky line in 2023-02 (no-index only)');
  ok(!Object.keys(f).some((k) => /TCFE/.test(k)), 'no TCFE line from 2023');
  f = L('2026-08-01');
  ok(!('TVA sur la CTA' in f), 'no CTA VAT line in 2026-08 (not printed)');
  ok(Object.values(f).every((v) => !/(^|[^\d,])0(,00?)?(\s|\u00a0|$)/.test(v) || /kVA|c€/.test(v)), 'no zero values shown');
  ok(Object.values(L('2024-02-01')).length > 0 && Object.keys(L('2024-02-01')).some((k) => /Accise/.test(k)), 'accise 2024-02 shown');
  for (const g of GRIDS) {
    const n = gridFacts(g).length;
    ok(n >= 6, `facts present for ${g.effective} (${n})`);
    ok(buildTariffs({ from: g.effective, to: g.effective }, 9, ALL).sections[0].facts.length === n, `section facts = gridFacts ${g.effective}`);
  }

  // formatting
  eq(F.formatCentsPerKwhHtva(30850), `3,085 c€/kWh${nb}HTVA`, 'HTVA 3,085');
  eq(F.formatCentsPerKwhHtva(1000), `0,10 c€/kWh${nb}HTVA`, 'HTVA 0,10');
  eq(F.formatCentsPerKwhHtva(29980), `2,998 c€/kWh${nb}HTVA`, 'HTVA 2,998');
  eq(F.formatCentsPerKwhHtva(33700), `3,37 c€/kWh${nb}HTVA`, 'HTVA 3,37');
  eq(F.formatCentsPerKwhHtva(6630), `0,663 c€/kWh${nb}HTVA`, 'HTVA 0,663');
  eq(F.formatEuroPerYearHt(9600000), `9,60${nb}€${nb}/${nb}an${nb}HT`, 'EUR per year HT');
  eq(F.formatEuroPerYearHt(50880000), `50,88${nb}€${nb}/${nb}an${nb}HT`, 'EUR per year HT 50,88');
  eq([F.formatPercent(20), F.formatPercent(5.5)], [`20${nb}%`, `5,5${nb}%`], 'percent');
  eq([F.formatCentsNumber(192700), F.formatEuroNumber(19560000)], ['19,27', '19,56'], 'plain numbers');
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
