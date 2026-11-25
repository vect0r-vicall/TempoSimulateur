// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-8 [AC-21, FR-031]: recap of the range the chart shows (pure model), synthetic data only.
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(g === w, `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const { buildScene } = await import('../.build-test/core/scene.mjs');
const { analyse, buildRecap } = await import('../.build-test/core/recap.mjs');
const V = await import('../.build-test/core/view.mjs');
const { viewRecap } = await import('../.build-test/core/viewrecap.mjs');
const { formatEuro } = await import('../.build-test/core/format.mjs');

const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const SIZE = { width: 960, height: 420 };
const ALL = ['tempo', 'hchp', 'base'];

// synthetic import: 2024-09-10 .. 2026-02-20 of HC/HP days (varying kWh), one estimated day, one excluded day
const days = [];
for (let n = num('2024-09-10'); n <= num('2026-02-20'); n++) {
  const date = iso(n);
  if (date === '2025-11-12') continue; // excluded boundary day
  days.push({ date, kind: 'hchp', kwh: { hc: 3 + (n % 5), hp: 5 + (n % 7) }, estimated: date === '2025-11-05' });
}
const imp = { days, excluded: ['2025-11-12'] };
const priced = { from: days[0].date, to: days.at(-1).date };
const period = { from: '2025-02-01', to: '2026-01-31' };
const a = analyse(imp, period, 9);
const analyseFor = (p) => analyse(imp, p, 9);

const sumBars = (scene, offer) => scene.groups.reduce((s, g) => s + g.bars.find((b) => b.offer === offer).totalMicro, 0);
const views = [
  { v: { kind: 'period', gran: 'year' }, title: 'Total de la période sélectionnée' },
  { v: { kind: 'period', gran: 'month' }, title: 'Total de la période sélectionnée' },
  { v: { kind: 'period', gran: 'day' }, title: 'Total de la période sélectionnée', shortPeriod: true },
  { v: { kind: 'year', year: '2025' }, title: "Total de l'année 2025" },
  { v: { kind: 'year', year: '2024' }, title: "Total de l'année 2024" }, // clipped to imported days
  { v: { kind: 'month', month: '2025-11' }, title: 'Total de novembre 2025' },
  { v: { kind: 'month', month: '2026-02' }, title: 'Total de février 2026' }, // partial month (imported until 02-20)
];
for (const { v, title, shortPeriod } of views) {
  const per = shortPeriod ? { from: '2025-11-01', to: '2025-11-30' } : period;
  const range = V.viewRange(v, priced, per);
  const an = v.kind === 'period' ? analyse(imp, per, 9) : analyseFor(range);
  const scene = buildScene(an.offers, ALL, range, V.viewGranularity(v), SIZE);
  const rec = viewRecap(v, an, ALL);
  const tag = JSON.stringify(v);
  eq(rec.title, title, `title ${tag}`);
  eq(rec.rows.map((r) => r.offer).join(','), 'tempo,hchp,base', `rows in offer order ${tag}`);
  for (const r of rec.rows) {
    if (!r.available) continue;
    eq(r.totalMicro, sumBars(scene, r.offer), `${r.offer} total = sum of bars ${tag}`);
    eq(r.totalText, formatEuro(r.totalMicro), `${r.offer} text uses formatEuro ${tag}`);
  }
}

// calendar year clipped to imported days; month view of the partial month
const y24 = viewRecap({ kind: 'year', year: '2024' }, analyseFor(V.viewRange({ kind: 'year', year: '2024' }, priced, period)), ALL);
eq(y24.pricedDays, num('2024-12-31') - num('2024-09-10') + 1, 'year 2024 counts only imported days');
const f26 = viewRecap({ kind: 'month', month: '2026-02' }, analyseFor(V.viewRange({ kind: 'month', month: '2026-02' }, priced, period)), ALL);
eq(f26.pricedDays, 20, 'partial month counts imported days only');

// period-based view total = main recap total
const main = buildRecap(a, ALL);
const pv = viewRecap({ kind: 'period', gran: 'month' }, a, ALL);
ok(main.rows.every((r, i) => r.totalMicro === pv.rows[i].totalMicro && r.cheapest === (pv.rows[i].cheapest && pv.compared >= 2)), 'period view totals = main recap totals');
eq(pv.pricedDays, main.pricedDays, 'period view priced days = main recap');

// elision for every month (independent expectations, not derived from the implementation)
{
  const expected = ["Total de janvier 2025", "Total de février 2025", "Total de mars 2025", "Total d'avril 2025", "Total de mai 2025", "Total de juin 2025",
    "Total de juillet 2025", "Total d'août 2025", "Total de septembre 2025", "Total d'octobre 2025", "Total de novembre 2025", "Total de décembre 2025"];
  expected.forEach((title, i) => {
    eq(viewRecap({ kind: 'month', month: `2025-${String(i + 1).padStart(2, '0')}` }, a, ALL).title, title, `month title ${i + 1}`);
  });
}

// counts text: estimated/excluded only when non-zero
eq(viewRecap({ kind: 'month', month: '2025-04' }, a, ALL).title, "Total d'avril 2025", 'elision before a vowel (avril)');
eq(viewRecap({ kind: 'month', month: '2025-08' }, a, ALL).title, "Total d'août 2025", 'elision (août)');
eq(viewRecap({ kind: 'month', month: '2025-10' }, a, ALL).title, "Total d'octobre 2025", 'elision (octobre)');
const nov = viewRecap({ kind: 'month', month: '2025-11' }, analyseFor({ from: '2025-11-01', to: '2025-11-30' }), ALL);
eq(nov.estimatedDays, 1, 'november: 1 estimated day');
eq(nov.excludedDays, 1, 'november: 1 excluded day');
eq(nov.daysText, '29 jours valorisés, 1 jour estimé, 1 jour exclu', 'days text with estimated and excluded');
const dec = viewRecap({ kind: 'month', month: '2025-12' }, analyseFor({ from: '2025-12-01', to: '2025-12-31' }), ALL);
eq(dec.daysText, '31 jours valorisés', 'days text without estimated/excluded');
ok(!dec.daysText.includes('estimé') && !dec.daysText.includes('exclu'), 'zero counts omitted');
eq(viewRecap({ kind: 'month', month: '2026-02' }, analyseFor({ from: '2026-02-20', to: '2026-02-20' }), ALL).daysText, '1 jour valorisé', 'singular');

// cheapest badge: exactly one cheapest, only when >= 2 compared
ok(dec.rows.filter((r) => r.cheapest).length === 1, 'one cheapest among three offers');
const cheapestMicro = Math.min(...dec.rows.map((r) => r.totalMicro));
ok(dec.rows.find((r) => r.cheapest).totalMicro === cheapestMicro, 'cheapest has the minimum total');
const single = viewRecap({ kind: 'period', gran: 'year' }, a, ['hchp']);
eq(single.rows.length, 1, 'single selected offer: one row');
ok(!single.rows[0].cheapest, 'no badge with a single offer');
eq(viewRecap({ kind: 'period', gran: 'year' }, a, []).rows.length, 0, 'no selected offer: no rows');
// tie: identical totals both get the badge

const fake = { ...a, offers: { ...a.offers, hchp: { ...a.offers.hchp, totalMicro: a.offers.base.totalMicro } } };
const tie = viewRecap({ kind: 'period', gran: 'year' }, fake, ['hchp', 'base']);
ok(tie.rows.every((r) => r.cheapest), 'ties: every cheapest offer carries the badge');

// kVA 3: Tempo unavailable (reuses the pricing reason), others compared
const a3 = analyse(imp, period, 3);
const r3 = viewRecap({ kind: 'period', gran: 'year' }, a3, ALL);
const t3 = r3.rows.find((r) => r.offer === 'tempo');
ok(!t3.available && t3.totalText === 'indisponible' && t3.reason.length > 0 && !t3.cheapest, `kVA 3: tempo unavailable (${t3.reason})`);
const av3 = r3.rows.filter((r) => r.available);
eq(r3.compared, av3.length, 'kVA 3: compared = available offers');
ok(r3.rows.filter((r) => r.cheapest).length === (av3.length >= 2 ? 1 : 0) && !r3.rows[0].cheapest, 'kVA 3: badge only on an available offer, only when >= 2 compared');
eq(r3.rows[0].reason, a3.offers.tempo.reason, 'reason text is the pricing reason');
ok(r3.summary.includes('Total de la période sélectionnée') && r3.summary.includes('indisponible'), 'summary names title and unavailability');

// ---- temperature line of the viewed range (FR-063, AC-58) ----
{
  const NB = '\u00A0';
  const { viewTemperatureText } = await import('../.build-test/core/viewrecap.mjs');
  // 2025-03: daily means 1..31, min = mean - 2, max = mean + 3 (independent expectations)
  const wx = [];
  for (let n = num('2025-03-01'); n <= num('2025-03-31'); n++) { const m = n - num('2025-03-01') + 1; wx.push({ date: iso(n), mean: m, min: m - 2, max: m + 3 }); }
  const mar = { from: '2025-03-01', to: '2025-03-31' };
  eq(viewTemperatureText(mar, wx), `Température : moy. 16,0${NB}°C · min −1,0 · max 34,0`, 'month: mean of daily means, min of mins, max of maxes');
  eq(viewTemperatureText(mar, null), '', 'overlay off (null): no line');
  eq(viewTemperatureText(mar, undefined), '', 'overlay off (undefined): no line');
  eq(viewTemperatureText({ from: '2025-03-01', to: '2025-04-15' }, wx), `Température : moy. 16,0${NB}°C · min −1,0 · max 34,0 (31/46 jours)`, 'partial coverage shows (N/M jours)');
  eq(viewTemperatureText({ from: '2025-06-01', to: '2025-06-30' }, wx), 'Température : donnée indisponible', 'range outside the loaded weather: donnée indisponible');
  // year view: whole year range, partial coverage
  const yr = V.viewRange({ kind: 'year', year: '2025' }, priced, period);
  eq(viewTemperatureText(yr, wx), `Température : moy. 16,0${NB}°C · min −1,0 · max 34,0 (31/${num(yr.to) - num(yr.from) + 1} jours)`, 'year view: same aggregation over the viewed year');
  // wired in the recap: line, summary, and no effect on the other fields
  const wxm = wx.map((d) => ({ ...d }));
  const mv = { kind: 'month', month: '2025-03' };
  const am = analyseFor(V.viewRange(mv, priced, period));
  const withW = viewRecap(mv, am, ALL, wxm), without = viewRecap(mv, am, ALL);
  eq(withW.tempText, viewTemperatureText(V.viewRange(mv, priced, period), wxm), 'recap tempText = viewTemperatureText of the view range');
  eq(without.tempText, '', 'recap without weather: empty tempText');
  eq(withW.summary, `${without.summary} ${withW.tempText}.`, 'summary = the summary without weather + the temperature sentence');
  ok(!without.summary.includes('Température'), 'summary without weather has no temperature');
  eq(JSON.stringify({ ...withW, tempText: '', tempSegs: [], summary: '' }), JSON.stringify({ ...without, tempText: '', tempSegs: [], summary: '' }), 'weather changes nothing but tempText, tempSegs and summary');
  // custom period view
  const pvw = viewRecap({ kind: 'period', gran: 'month' }, analyse(imp, { from: '2025-03-01', to: '2025-03-31' }, 9), ALL, wx);
  eq(pvw.tempText, `Température : moy. 16,0${NB}°C · min −1,0 · max 34,0`, 'custom-period view aggregates over the period');
  // coloured segments (same classes and tokens as the tooltip)
  {
    const segs = withW.tempSegs;
    eq(segs.map((x) => x.text).join(''), withW.tempText, 'tempSegs concatenate to tempText');
    eq(JSON.stringify(segs.filter((x) => x.cls).map((x) => x.cls)), JSON.stringify(['tt-mean', 'tt-min', 'tt-max']), 'mean, min and max values carry tt-mean, tt-min, tt-max; labels are neutral');
    eq(without.tempSegs.length, 0, 'no segments without weather');
    const css = (await import('node:fs')).readFileSync('src/app.css', 'utf8');
    ok(/\.view-recap-days \.tt-mean\s*\{[^}]*--t-mean-text/.test(css) && /\.view-recap-days \.tt-min\s*\{[^}]*--t-min-text/.test(css) && /\.view-recap-days \.tt-max\s*\{[^}]*--t-max-text/.test(css), 'CSS: recap line uses the existing contrast-checked temperature text tokens (no new colour)');
  }
  // DOM wiring (source check)
  const chartSrc = (await import('node:fs')).readFileSync('src/ui/chart.ts', 'utf8');
  ok(/viewRecap\(view, a, inp\.selected, inp\.weather\)/.test(chartSrc) && /vrTemp\.replaceChildren\(\.\.\.rec\.tempSegs/.test(chartSrc) && /vrTemp\.hidden = rec\.tempText === ''/.test(chartSrc), 'chart renders the line from the recap and hides it without weather');
}

process.exit(failures ? 1 : 0);
