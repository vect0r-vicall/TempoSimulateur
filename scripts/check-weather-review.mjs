// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-12 [AC-25, AC-28, AC-29, FR-034, FR-035, FR-038, FR-040]: regressions found in the weather overlay review
// (flat-series ticks, window-derived day cap, no fake axis, format characters, trend legibility, body cap, fetch occurrences, status region, HTTP 400).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };

const W = await import('../.build-test/core/weather.mjs');
const N = await import('../.build-test/net/weather.mjs');
const { buildScene, tempTicks } = await import('../.build-test/core/scene.mjs');
const { priceOffers } = await import('../.build-test/core/pricing.mjs');

const MS = 86400000;
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);

// 1. near-flat / hostile temperature ranges never hang nor throw (run in a child process with a timeout: a hang is a failure)
{
  const code = `
    const { buildScene, tempTicks } = await import(${JSON.stringify(new URL('../.build-test/core/scene.mjs', import.meta.url).href)});
    const { priceOffers } = await import(${JSON.stringify(new URL('../.build-test/core/pricing.mjs', import.meta.url).href)});
    const MS = 86400000, n0 = Math.round(Date.UTC(2025, 2, 15) / MS);
    const days = []; for (let i = 0; i < 365; i++) days.push({ date: new Date((n0 + i) * MS).toISOString().slice(0, 10), kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false });
    const period = { from: days[0].date, to: days[364].date }; const offers = priceOffers(days, 9);
    const mk = (f) => days.map((d, i) => { const m = f(i); return { date: d.date, mean: m, min: m, max: m }; });
    let n = 0, noise = 0;
    for (const f of [() => 0.1, () => 0.3, () => -0.7, (i) => 0.1 + (i % 2) * 1e-15, (i) => 20 + Math.sin(i * 12.9898) * 1e-9, (i) => { noise++; return 5.5 + ((i * 7919) % 3) * 1e-12; }]) {
      for (const g of ['year', 'month', 'day']) {
        const sc = buildScene(offers, ['tempo', 'hchp', 'base'], g === 'day' ? { from: '2025-04-01', to: '2025-04-30' } : period, g, { width: 960, height: 420 }, mk(f));
        const t = sc.weather.ticks;
        if (t.length < 3 || t.length > 5 || !t.every((x, i) => Number.isFinite(x.y) && (i === 0 || x.value > t[i - 1].value))) { console.error('bad ticks', g, JSON.stringify(t)); process.exit(1); }
        n++;
      }
    }
    for (const [lo, hi] of [[0.1, 0.10000000000000002], [NaN, 1], [1, NaN], [Infinity, -Infinity], [-1e308, 1e308], [1e-300, 2e-300], [5, 5]]) {
      const t = tempTicks(lo, hi);
      if (!Array.isArray(t) || t.length < 2 || !t.every((v) => Number.isFinite(v))) { console.error('bad tempTicks', lo, hi, t); process.exit(1); }
    }
    console.log('cases ' + n);
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 8000, encoding: 'utf8' });
  ok(r.status === 0, `flat/near-flat/extreme/NaN series: ticks sane, no hang, no throw (status ${r.status}, signal ${r.signal}) ${r.stderr.slice(0, 200)}`);
  const s = W.smoothTrend([0.1, 0.1, 0.1, 0.1]);
  ok(s.every((v) => v === 0.1), 'smoothTrend keeps a constant series exactly constant');
  const t = tempTicks(0.1, 0.1 + 1e-12);
  ok(t.length >= 3 && t.length <= 5, 'tempTicks near-flat range widened like a flat one');
}

// 2. day cap derives from the requested window
{
  const series = (a, b) => { const time = []; for (let n = num(a); n <= num(b); n++) time.push(iso(n)); return { daily: { time, temperature_2m_mean: time.map(() => 1), temperature_2m_min: time.map(() => 0), temperature_2m_max: time.map(() => 2) } }; };
  const long = series('2022-01-01', '2025-04-15'); // 1201 days
  ok(long.daily.time.length > 800 && W.parseWeatherResponse(long, '2022-01-01', '2025-04-15').ok, '1200+ day window parses');
  const big = series('2000-01-01', '2024-12-31'); // 25 years
  ok(W.parseWeatherResponse(big, '2000-01-01', '2024-12-31').ok, '25-year window parses');
  const longer = series('2022-01-01', '2025-04-16');
  ok(!W.parseWeatherResponse(longer, '2022-01-01', '2025-04-15').ok, 'response longer than its window is rejected');
  ok(!W.parseWeatherResponse(series('2022-01-01', '2022-01-05'), '2022-01-01', '2022-01-03').ok, 'response with days outside the window is rejected');
  const huge = series('1990-01-01', '2020-12-31');
  ok(!W.parseWeatherResponse(huge, '1990-01-01', '2020-12-31').ok, 'window above the hard ceiling (25*366+1 days) is rejected');
  ok(W.HARD_MAX_DAYS === 25 * 366 + 1, 'hard ceiling is 25*366+1');
  // whole-period scenario of the demo export length (synthetic payload, ~3 years) through the network module
  N.clearWeatherCache();
  const body = JSON.stringify(series('2023-02-10', '2026-03-20'));
  const f = async () => new Response(body, { status: 200 });
  const r = await N.fetchDailyTemps(48.9, 2.3, '2023-02-10', '2026-03-20', f);
  ok(r.ok && r.days.length > 1100, 'fetchDailyTemps accepts a whole-period (>800 days) response');
  N.clearWeatherCache();
}

// 3. no temperature for the visible buckets: no fake axis, no trend, no legend entry, a note instead
{
  const days = [];
  for (let i = 0; i < 365; i++) days.push({ date: iso(num('2025-03-15') + i), kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false });
  const period = { from: days[0].date, to: days[364].date };
  const offers = priceOffers(days, 9);
  const outside = [{ date: '2023-01-01', mean: 5, min: 1, max: 9 }]; // weather exists but not for these buckets
  for (const wx of [outside, [], days.map((d) => ({ date: d.date, mean: null, min: null, max: null }))]) {
    const sc = buildScene(offers, ['tempo', 'hchp', 'base'], period, 'month', { width: 960, height: 420 }, wx);
    ok(sc.weather && sc.weather.ticks.length === 0 && sc.weather.segments.length === 0 && sc.weather.legend.length === 0 && sc.weather.unit === '', 'no value: no degC ticks, no trend, no legend entry');
    ok(sc.weather.note === 'Météo non chargée pour cette vue', 'no value: French note present');
  }
  const good = buildScene(offers, ['tempo'], period, 'month', { width: 960, height: 420 }, days.map((d) => ({ date: d.date, mean: 9, min: 8, max: 10 })));
  ok(good.weather.note === '' && good.weather.legend.length === 3 && good.weather.ticks.length >= 3, 'with values: legend entry, ticks, no note');
  const svg = readFileSync('src/ui/svg.ts', 'utf8'), chart = readFileSync('src/ui/chart.ts', 'utf8');
  ok(/ticks\.length === 0 && w\.segments\.length === 0/.test(svg), 'svg layer draws no weather group without ticks or segments');
  ok(/scene\.weather\?\.legend/.test(chart) && /scene\.weather\?\.note/.test(chart), 'chart layer gates the legend entry on the legend text and shows the note');
}

// 4. format characters stripped, empty-after-cleaning name invalid
{
  const place = (name, extra = {}) => ({ results: [{ name, latitude: 1, longitude: 2, ...extra }] });
  const r = W.parseGeocodingResponse(place('Pa‮ris​⁦', { country: '‮france‏' }));
  ok(r.ok && r.places[0].label === 'Paris, france', `bidi/zero-width characters stripped (${r.ok ? r.places[0].label : r.reason})`);
  ok(!/[​-‏‪-‮⁦-⁩]/.test(r.ok ? r.places[0].label : ''), 'no format character survives in the label');
  ok(!W.parseGeocodingResponse(place('‮​⁩')).ok, 'name empty after cleaning is invalid');
}

// 5/8. CSS: trend legibility (halo token in both themes, opacity .9) and live region not display:none
{
  const css = readFileSync('src/app.css', 'utf8');
  const line = /\.trend-line\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  ok(/opacity:\s*\.9\b/.test(line), 'trend line opacity .9');
  ok(/\.trend-halo\s*\{[^}]*stroke:\s*var\(--trend-halo\)/.test(css) && (css.match(/--trend-halo:/g) ?? []).length === 2, 'halo stroke uses a token defined for light and dark');
  ok(/\.swatch \.trend-halo/.test(css), 'legend swatch carries the halo');
  ok(/trend-halo/.test(readFileSync('src/ui/svg.ts', 'utf8')) && /trend-halo/.test(readFileSync('src/ui/chart.ts', 'utf8')), 'chart and legend draw the halo path');
  ok(!/\.weather-status:empty\s*\{[^}]*display:\s*none/.test(css), 'status live region is not display:none when empty');
  const ui = readFileSync('src/ui/weather.ts', 'utf8');
  ok(/setAttribute\('role', 'status'\)/.test(ui) && !/aria-live/.test(ui), 'status region keeps role=status only');
}

// 6. body cap: content-length header refused before reading
{
  N.clearWeatherCache();
  let read = false;
  const res = new Response('{}', { status: 200, headers: { 'content-length': String(N.MAX_BODY_CHARS + 1) } });
  res.text = async () => { read = true; return '{}'; };
  const r = await N.searchPlaces('Paris', async () => res);
  ok(!r.ok && /volumineuse/.test(r.message) && !read, 'huge content-length refused before the body is read');
  const small = await N.searchPlaces('Paris', async () => new Response('{"results":[]}', { status: 200, headers: { 'content-length': '14' } }));
  ok(small.ok, 'normal content-length accepted');
}

// 7. fetch occurrences (not lines) in the source scan, obfuscation pattern
{
  const src = readFileSync('src/net/weather.ts', 'utf8');
  const tmp = mkdtempSync(join(tmpdir(), 'tempo-scan-'));
  try {
    mkdirSync(join(tmp, 'src/net'), { recursive: true });
    mkdirSync(join(tmp, 'dist'));
    cpSync('src', join(tmp, 'src'), { recursive: true });
    cpSync('dist/app.js', join(tmp, 'dist/app.js'));
    const run = () => spawnSync(process.execPath, [join(process.cwd(), 'scripts/check-forbidden-apis.mjs')], { cwd: tmp, encoding: 'utf8' });
    ok(run().status === 0, 'scan passes on the real tree copy');
    const line = src.split('\n').find((l) => /\bfetch\b/.test(l.replace(/\/\/.*$/, '')) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    ok(!!line, 'found the fetch line in src/net/weather.ts');
    writeFileSync(join(tmp, 'src/net/weather.ts'), src.replace(line, `${line} void fetch(url, init);`));
    const r = run();
    ok(r.status === 1 && /exactly one occurrence/.test(r.stderr), 'second fetch on the SAME line fails the scan');
    writeFileSync(join(tmp, 'src/net/weather.ts'), src + "\nexport const sneaky = (u: string) => (globalThis as any)['fet' + 'ch'](u);\n");
    ok(run().status === 1, 'bracket access built by concatenation fails the scan');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const dist = readFileSync('scripts/check-dist.mjs', 'utf8');
  ok(/jsCount/.test(dist) && /\(l\.match\(\/\\bfetch\\b\/g\)/.test(dist), 'check-dist counts fetch occurrences in the bundle');
}

// 9. HTTP 400 has its own French message, provider text never shown
{
  N.clearWeatherCache();
  const mk = (status) => async () => new Response(JSON.stringify({ error: true, reason: 'Parameter start_date is out of range' }), { status });
  const r400 = await N.fetchDailyTemps(10, 10, '2025-01-01', '2025-01-03', mk(400));
  const r500 = await N.fetchDailyTemps(10, 10, '2025-01-01', '2025-01-03', mk(500));
  ok(!r400.ok && r400.message === 'Requête météo refusée (paramètres ou période non acceptés).', '400 message distinguished');
  ok(!r500.ok && r500.message === 'Le service météo a refusé la requête.' && r500.message !== r400.message, 'other HTTP errors keep the generic message');
  ok(!/Parameter|range/.test(r400.message + r500.message), 'provider English text not displayed');
}

process.exit(failures ? 1 : 0);
