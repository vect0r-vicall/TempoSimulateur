// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-10 [AC-24..AC-29, FR-033..FR-040]: weather overlay, pure core + network module with an injected fake fetch.
// No real network, no clock. exit 0 pass, 1 assertion failed, >=2 error.
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const W = await import('../.build-test/core/weather.mjs');
const N = await import('../.build-test/net/weather.mjs');
const { parseWeatherResponse, parseGeocodingResponse, aggregateTemps, smoothTrend, roundCoord, formatTemp, tempTooltipLine } = W;

// ---- formatting ----
const NB = ' ', MINUS = '−';
eq(formatTemp(12.3), `12,3${NB}°C`, 'formatTemp comma + unit');
eq(formatTemp(-4.1), `${MINUS}4,1${NB}°C`, 'formatTemp true minus');
eq(formatTemp(0), `0,0${NB}°C`, 'formatTemp zero');
eq(formatTemp(-0.04), `0,0${NB}°C`, 'formatTemp no negative zero');
eq(tempTooltipLine({ mean: 12.3, min: -4.1, max: 31, covered: 5, total: 5 }), `Température : moy. 12,3${NB}°C · min ${MINUS}4,1 · max 31,0`, 'tooltip full');
eq(tempTooltipLine({ mean: 12.3, min: -4.1, max: 31, covered: 3, total: 5 }), `Température : moy. 12,3${NB}°C · min ${MINUS}4,1 · max 31,0 (3/5 jours)`, 'tooltip partial coverage');
eq(tempTooltipLine({ mean: null, min: null, max: null, covered: 0, total: 5 }), 'Température : donnée indisponible', 'tooltip none');

// ---- rounding ----
eq([roundCoord(48.8566), roundCoord(-2.349), roundCoord(-0.04), roundCoord(45.25)], [48.9, -2.3, 0, 45.3], 'roundCoord 0.1 degree');

// ---- aggregation ----
const days = [
  { date: '2025-01-01', mean: 2, min: -1, max: 5 },
  { date: '2025-01-02', mean: 4, min: 0, max: 9 },
  { date: '2025-01-03', mean: null, min: null, max: null },
  { date: '2025-01-04', mean: 6, min: 1, max: 7 },
];
eq(aggregateTemps(days, ['2025-01-01', '2025-01-02']), { mean: 3, min: -1, max: 9, covered: 2, total: 2 }, 'aggregate full');
eq(aggregateTemps(days, ['2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05']), { mean: 5, min: 0, max: 9, covered: 2, total: 4 }, 'aggregate partial (null day + absent day)');
eq(aggregateTemps(days, ['2025-01-03']), { mean: null, min: null, max: null, covered: 0, total: 1 }, 'aggregate none');
eq(aggregateTemps(new Map(days.map((d) => [d.date, d])), ['2025-01-01']).mean, 2, 'aggregate accepts a Map');

// ---- smoothing ----
eq(smoothTrend([]), [], 'smooth empty');
eq(smoothTrend([5]), [5], 'smooth single');
eq(smoothTrend([0, 3, 9]), [1.5, 4, 6], 'smooth window 3, edges adapted');
eq(smoothTrend([0, null, 6, 9]), [0, null, 7.5, 7.5], 'smooth skips nulls, keeps them null');
eq(smoothTrend([null, null]), [null, null], 'smooth all null');

// ---- parseWeatherResponse ----
const good = { daily: { time: ['2025-01-01', '2025-01-02', '2025-01-03'], temperature_2m_mean: [1, 2, null], temperature_2m_min: [0, 1, null], temperature_2m_max: [3, 4, null] } };
const pw = parseWeatherResponse(good, '2025-01-01', '2025-01-03');
ok(pw.ok && pw.days.length === 3 && pw.missing === 1 && pw.days[2].mean === null, 'parse good payload, null day counted missing');
const clone = () => JSON.parse(JSON.stringify(good));
const bads = {
  'not an object': null, 'array root': [], 'no daily': {}, 'daily not object': { daily: [] },
  'length mismatch': (() => { const j = clone(); j.daily.temperature_2m_max.pop(); return j; })(),
  'time not array': (() => { const j = clone(); j.daily.time = 'x'; return j; })(),
  'date not YYYY-MM-DD': (() => { const j = clone(); j.daily.time[0] = '2025-1-1'; return j; })(),
  'impossible date': (() => { const j = clone(); j.daily.time[0] = '2025-02-30'; return j; })(),
  'date type': (() => { const j = clone(); j.daily.time[0] = 20250101; return j; })(),
  'date before window': (() => { const j = clone(); j.daily.time[0] = '2024-12-31'; return j; })(),
  'date after window': (() => { const j = clone(); j.daily.time[2] = '2025-01-04'; return j; })(),
  'duplicate date': (() => { const j = clone(); j.daily.time[1] = '2025-01-01'; return j; })(),
  'oversized': { daily: { time: Array.from({ length: 5000 }, () => '2025-01-01'), temperature_2m_mean: [], temperature_2m_min: [], temperature_2m_max: [] } },
};
for (const [k, v] of Object.entries(bads)) ok(parseWeatherResponse(v, '2025-01-01', '2025-01-03').ok === false, `parse rejects: ${k}`);
ok(parseWeatherResponse(good, '2025-01-03', '2025-01-01').ok === false, 'parse rejects inverted window');
{
  const j = clone(); j.daily.temperature_2m_mean = [NaN, 'warm', 99]; j.daily.temperature_2m_min = [-91, Infinity, 5]; j.daily.temperature_2m_max = [null, {}, 60];
  const r = parseWeatherResponse(j, '2025-01-01', '2025-01-03');
  ok(r.ok && r.days[0].mean === null && r.days[0].min === null && r.days[1].mean === null && r.days[1].min === null && r.days[2].mean === null && r.days[2].max === 60 && r.missing === 2, 'NaN/string/out-of-range values become missing');
}

// ---- parseGeocodingResponse ----
const place = (o = {}) => ({ name: 'Lyon', latitude: 45.75, longitude: 4.85, country: 'France', admin1: 'Auvergne-Rhône-Alpes', postcodes: ['69001'], ...o });
{
  const r = parseGeocodingResponse({ results: [place(), place({ name: 'Lyon', admin1: undefined })] });
  ok(r.ok && r.places.length === 2 && r.places[0].label === 'Lyon, Auvergne-Rhône-Alpes, France' && r.places[1].label === 'Lyon, France', 'geocoding labels');
  eq(parseGeocodingResponse({ generationtime_ms: 1 }), { ok: true, places: [] }, 'geocoding without results = empty list');
  ok(!parseGeocodingResponse({ results: Array.from({ length: 6 }, () => place()) }).ok, 'geocoding rejects > 5 results');
  ok(!parseGeocodingResponse({ results: [place({ latitude: 91 })] }).ok, 'geocoding rejects latitude out of range');
  ok(!parseGeocodingResponse({ results: [place({ longitude: NaN })] }).ok, 'geocoding rejects NaN longitude');
  ok(!parseGeocodingResponse({ results: [place({ latitude: '45' })] }).ok, 'geocoding rejects string latitude');
  ok(!parseGeocodingResponse({ results: 'x' }).ok && !parseGeocodingResponse(null).ok, 'geocoding rejects bad shape');
  const l = parseGeocodingResponse({ results: [place({ name: '<b>' + 'x'.repeat(500) + '\n' })] });
  ok(l.ok && l.places[0].label.length <= 240 && !/[<>\n]/.test(l.places[0].label), 'geocoding label stripped and truncated');
}

// ---- network module with a fake fetch ----
const resp = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const fake = (handler) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls.length); }; f.calls = calls; return f; };

{ // search: URL, options, sanitisation
  const f = fake(() => resp({ results: [place()] }));
  const r = await N.searchPlaces('  Lyon   69001 ', f);
  ok(r.ok && r.places.length === 1, 'searchPlaces success');
  const u = new URL(f.calls[0].url);
  ok(u.origin === 'https://geocoding-api.open-meteo.com' && u.pathname === '/v1/search', 'search origin and path exact');
  eq([u.searchParams.get('name'), u.searchParams.get('count'), u.searchParams.get('language'), u.searchParams.get('format')], ['Lyon 69001', '5', 'fr', 'json'], 'search params and trimmed query');
  const i = f.calls[0].init;
  ok(i.method === 'GET' && i.credentials === 'omit' && i.referrerPolicy === 'no-referrer' && i.signal instanceof AbortSignal && !('body' in i), 'search: GET, credentials omit, no-referrer, abort signal, no body');
  for (const q of ['', ' a ', 'x'.repeat(61)]) {
    const g = fake(() => resp({}));
    const rr = await N.searchPlaces(q, g);
    ok(!rr.ok && g.calls.length === 0 && /caractères/.test(rr.message), `search rejects query of length ${q.length} without any request`);
  }
  const g = fake(() => resp({ results: [] }));
  await N.searchPlaces('a&b=c#d é', g);
  const gu = new URL(g.calls[0].url);
  ok(gu.searchParams.get('name') === 'a&b=c#d é' && gu.searchParams.get('b') === null && gu.hash === '', 'query is URL-encoded, no parameter injection');
}

{ // archive success, rounding, cache
  N.clearWeatherCache();
  const f = fake(() => resp(good));
  const r = await N.fetchDailyTemps(48.8566, 2.3522, '2025-01-01', '2025-01-03', f);
  ok(r.ok && r.days.length === 3 && r.missing === 1, 'fetchDailyTemps success');
  const u = new URL(f.calls[0].url);
  ok(u.origin === 'https://archive-api.open-meteo.com' && u.pathname === '/v1/archive', 'archive origin and path exact');
  eq([u.searchParams.get('latitude'), u.searchParams.get('longitude'), u.searchParams.get('start_date'), u.searchParams.get('end_date'), u.searchParams.get('daily'), u.searchParams.get('timezone')],
    ['48.9', '2.4', '2025-01-01', '2025-01-03', 'temperature_2m_mean,temperature_2m_max,temperature_2m_min', 'auto'], 'archive params, coordinates rounded to 0.1');
  ok(!/48\.85|2\.35/.test(f.calls[0].url), 'precise coordinates never sent');
  const i = f.calls[0].init;
  ok(i.method === 'GET' && i.credentials === 'omit' && i.referrerPolicy === 'no-referrer', 'archive: GET, credentials omit, no-referrer');
  const r2 = await N.fetchDailyTemps(48.86, 2.35, '2025-01-01', '2025-01-03', f);
  ok(r2.ok && f.calls.length === 1, 'cache hit (same rounded key) does not call fetchFn again');
  await N.fetchDailyTemps(48.86, 2.35, '2025-01-01', '2025-01-02', fake(() => resp({ daily: { time: ['2025-01-01'], temperature_2m_mean: [1], temperature_2m_min: [0], temperature_2m_max: [2] } })));
  const f3 = fake(() => resp(good));
  await N.fetchDailyTemps(48.86, 2.35, '2025-01-01', '2025-01-03', f3);
  ok(f3.calls.length === 0, 'cache keyed by start/end too (other window did not clobber)');
  N.clearWeatherCache();
}

{ // failures: never throws, French message, not cached
  N.clearWeatherCache();
  const cases = [
    ['HTTP 400 reason', fake(() => resp({ error: true, reason: 'Parameter start_date is out of range' }, 400)), /refus/],
    ['non-JSON', fake(() => resp('<html>oops')), /invalide/],
    ['oversize body', fake(() => resp(' '.repeat(1_000_001))), /volumineuse/],
    ['network error', fake(() => { throw new TypeError('x'); }), /injoignable/],
    ['bad schema', fake(() => resp({ daily: { time: ['2025-01-01'], temperature_2m_mean: [] } })), /invalide/],
    ['out-of-window date', fake(() => resp({ daily: { time: ['2030-01-01'], temperature_2m_mean: [1], temperature_2m_min: [1], temperature_2m_max: [1] } })), /invalide/],
  ];
  for (const [name, f, re] of cases) {
    let r;
    try { r = await N.fetchDailyTemps(10, 10, '2025-01-01', '2025-01-03', f); } catch (e) { r = { threw: e }; }
    ok(r && r.ok === false && !r.threw && re.test(r.message), `fetchDailyTemps ${name}: ok=false, French message`);
  }
  const f = fake(() => resp(good));
  await N.fetchDailyTemps(10, 10, '2025-01-01', '2025-01-03', fake(() => resp('x')));
  const rr = await N.fetchDailyTemps(10, 10, '2025-01-01', '2025-01-03', f);
  ok(rr.ok && f.calls.length === 1, 'failures are not cached');
  for (const bad of [[NaN, 1, '2025-01-01', '2025-01-02'], [91, 1, '2025-01-01', '2025-01-02'], [1, 1, '2025-02-30', '2025-03-01'], [1, 1, '2025-01-05', '2025-01-02']]) {
    const g = fake(() => resp(good));
    const r = await N.fetchDailyTemps(...bad, g);
    ok(!r.ok && g.calls.length === 0, `invalid arguments ${JSON.stringify(bad)} rejected without any request`);
  }
  const s = await N.searchPlaces('Paris', fake(() => resp({ results: Array.from({ length: 9 }, () => place()) })));
  ok(!s.ok && /invalide/.test(s.message), 'searchPlaces rejects > 5 results');
  const s2 = await N.searchPlaces('Paris', fake(() => resp({ reason: 'x' }, 400)));
  ok(!s2.ok && /refus/.test(s2.message), 'searchPlaces HTTP 400');
}

{ // timeout: fake honours the abort signal; run with the real timer (10 s) shortened by firing abort through a never-settling fetch is too slow, so wait on the real timeout
  N.clearWeatherCache();
  const t0 = Date.now();
  const f = fake((_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))));
  const r = await N.searchPlaces('Lyon', f);
  ok(!r.ok && /délai/.test(r.message) && Date.now() - t0 >= N.TIMEOUT_MS - 200 && Date.now() - t0 < N.TIMEOUT_MS + 3000, `timeout aborts the request after ~${N.TIMEOUT_MS} ms with a French message`);
}

process.exit(failures ? 1 : 0);
