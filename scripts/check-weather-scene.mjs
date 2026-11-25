// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-11 [AC-29, FR-037, FR-038]: pure weather overlay geometry in the chart scene (tooltip line, trend, degC axis).
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(g === w, `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const { buildScene, tempTicks } = await import('../.build-test/core/scene.mjs');
const { priceOffers } = await import('../.build-test/core/pricing.mjs');

const MS = 86400000;
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const SIZE = { width: 960, height: 420 };
const ALL = ['tempo', 'hchp', 'base'];
const days = [];
for (let i = 0; i < 365; i++) days.push({ date: iso(num('2025-03-15') + i), kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false });
const period = { from: days[0].date, to: days[364].date };
const offers = priceOffers(days, 9);
const temps = (f) => days.map((d, i) => { const m = f(i, d.date); return m === null ? { date: d.date, mean: null, min: null, max: null } : { date: d.date, mean: m, min: m - 3, max: m + 4 }; });
const holes = temps((i) => (i >= 5 && i < 8 ? null : 10));
const seasonal = temps((i) => 12 + 10 * Math.sin((i / 365) * 2 * Math.PI));

// regression: no weather -> same scene as before (no extra line, plot unchanged, no overlay)
const none = buildScene(offers, ALL, period, 'month', SIZE);
const nullW = buildScene(offers, ALL, period, 'month', SIZE, null);
ok(JSON.stringify(none) === JSON.stringify(nullW), 'weather undefined and null give the identical scene');
eq(none.weather, null, 'no weather: scene.weather null');
eq(none.plot.w, SIZE.width - 62 - 12, 'no weather: plot width unchanged (right margin 12)');
ok(none.groups.every((g) => g.tip.length === 5 && !g.aria.includes('Température')), 'no weather: tooltip lines and aria unchanged');

// with weather
const sc = buildScene(offers, ALL, period, 'month', SIZE, seasonal);
ok(sc.plot.w < none.plot.w, 'weather: right margin added (plot narrower)');
ok(sc.groups.every((g) => g.tip.length === none.groups[0].tip.length + 3 && /^Température : moy\./.test(g.tip[g.tip.length - 3]) && /^Vent : /.test(g.tip.at(-2)) && /^Précipitations : /.test(g.tip.at(-1))), 'weather: three extra tooltip lines per group (temperature, wind, precipitation)');
ok(sc.groups.every((g) => g.tip.length <= 9), 'weather: tooltip fits MAX_TIP_LINES');
const hv = buildScene(offers, ALL, period, 'month', SIZE, holes);
ok(hv.groups[0].tip.at(-3).endsWith('(14/17 jours)') && !hv.groups[5].tip.at(-3).includes('jours)'), 'partial coverage shows (14/17 jours), full coverage shows no suffix');
ok(sc.groups.every((g) => g.aria.includes('Température')), 'weather: aria-label carries the temperature sentence');
ok(!sc.groups[0].tip.at(-3).includes('jours)'), 'partial month (17 days in period) fully covered: no suffix, bucket limited to the period');
const w = sc.weather;
ok(w && w.segments.length === 1 && w.segments[0].length === 13, 'trend: one segment of 13 points');
ok(w.segments[0].every((p) => p.x >= sc.plot.x && p.x <= sc.plot.x + sc.plot.w && p.y >= sc.plot.y - 1e-6 && p.y <= sc.plot.y + sc.plot.h + 1e-6), 'trend points inside the plot');
ok(w.segments[0].every((p, i, a) => i === 0 || p.x > a[i - 1].x), 'trend x ascending');
ok(w.ticks.length >= 3 && w.ticks.length <= 5, `degC ticks 3..5 (${w.ticks.map((t) => t.label).join(' ')})`);
ok(w.ticks.every((t, i, a) => i === 0 || (t.value > a[i - 1].value && t.y < a[i - 1].y)), 'degC ticks monotone (value up, y up the page)');
ok(w.ticks.every((t) => t.y >= sc.plot.y - 1e-6 && t.y <= sc.plot.y + sc.plot.h + 1e-6), 'degC ticks inside the plot');
eq(w.unit, '°C', 'unit label');
// intentional expectation change (CHECK-14): the single mean entry became three entries (mean, min, max)
ok(JSON.stringify(w.legend.map((e) => e.label)) === JSON.stringify(['Température moyenne', 'Température minimale', 'Température maximale']), 'legend entries'); 

// nulls: a gap in the middle splits the line, leading nulls are skipped
const gap = buildScene(offers, ALL, period, 'month', SIZE, temps((i, d) => (d >= '2025-08-01' && d < '2025-10-01' ? null : 10 + (i % 7))));
ok(gap.weather.segments.length === 2, `null months break the line into 2 segments (got ${gap.weather.segments.length})`);
ok(gap.groups.some((g) => g.tip.at(-3) === 'Température : donnée indisponible'), 'fully missing bucket says donnée indisponible');
const allNull = buildScene(offers, ALL, period, 'month', SIZE, temps(() => null));
// intentional expectation change (review): the former all-null assertion locked in a fake degC axis
ok(allNull.weather.segments.length === 0 && allNull.weather.ticks.length === 0 && allNull.weather.legend.length === 0 && allNull.weather.note === 'Météo non chargée pour cette vue', 'all-null: no trend, no degC axis, no legend entry, a note instead');
const empty = buildScene(offers, ALL, period, 'month', SIZE, []);
ok(empty.weather.segments.length === 0 && empty.groups.every((g) => g.tip.at(-3) === 'Température : donnée indisponible'), 'empty weather array handled');

// single bucket (year view, one-year period inside 2025) and all-equal temperatures
const one = days.slice(0, 100);
const p1 = { from: one[0].date, to: one[99].date };
const flat = buildScene(priceOffers(one, 9), ALL, p1, 'year', SIZE, one.map((d) => ({ date: d.date, mean: 5, min: 5, max: 5 })));
eq(flat.groups.length, 1, 'single bucket');
ok(flat.weather.segments.length === 1 && flat.weather.segments[0].length === 1, 'single bucket: one single-point segment');
ok(flat.weather.ticks.length >= 3 && flat.weather.ticks.every((t) => Number.isFinite(t.y) && t.y >= flat.plot.y - 1e-6 && t.y <= flat.plot.y + flat.plot.h + 1e-6), 'all-equal temperatures: finite ticks inside the plot (no division by zero)');
ok(Number.isFinite(flat.weather.segments[0][0].y), 'all-equal: finite trend y');

// day view: single day buckets, temperature line is for that day
const dv = buildScene(offers, ALL, { from: '2025-04-01', to: '2025-04-30' }, 'day', SIZE, seasonal);
eq(dv.groups.length, 30, 'day view 30 groups');
ok(dv.groups.every((g) => /^Température : moy\. [−\d,]+\s°C · min [−\d,]+ · max [−\d,]+$/.test(g.tip.at(-3))), 'day view tooltip has a full-coverage temperature line');

// ticks helper
for (const [lo, hi] of [[-5.5, 28.2], [0, 0], [3, 3.2], [-40, -10], [10, 1000]]) {
  const t = tempTicks(lo, hi);
  ok(t.length >= 3 && t.length <= 5 && t[0] <= lo + 1e-9 && t.at(-1) >= hi - 1e-9 && t.every((v, i, a) => i === 0 || v > a[i - 1]), `tempTicks(${lo}, ${hi}) = ${t.join(' ')}`);
}
const neg = buildScene(offers, ALL, period, 'month', SIZE, temps(() => -4)).weather.ticks;
ok(neg.some((t) => t.label.startsWith('−')) && !neg.some((t) => t.label.startsWith('-')), 'negative ticks use the true minus');
process.exit(failures ? 1 : 0);
