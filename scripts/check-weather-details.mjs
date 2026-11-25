// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-13 [AC-30..AC-36, FR-035, FR-041..FR-047]: daily weather hint (WMO code) and wind (mean speed + dominant direction).
// Pure core, network URL/validation with a fake fetch, pure scene (glyphs, tooltip lines). No real network. exit 0 pass, 1 failed.
import { readFileSync } from 'node:fs';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const W = await import('../.build-test/core/weather.mjs');
const N = await import('../.build-test/net/weather.mjs');
const { buildScene, GLYPH_MIN_W } = await import('../.build-test/core/scene.mjs');
const { priceOffers } = await import('../.build-test/core/pricing.mjs');
const gw = (sc) => sc.plot.w / sc.groups.length;
const { parseWeatherResponse, aggregateWind, weatherLabel, weatherIconKind, compassFr, formatWind, windTooltipLine, weatherTooltipLine, WMO_CODES, dayHasData, displayCode, aggregatePrecip, formatPrecip, precipSegments, RAIN_CODES, RAIN_MM_THRESHOLD, PRECIP_MAX } = W;
const NB = '\u00A0';

// ---- labels and icon kinds (CHECK-13 expectation change: glyph characters became icon kinds; exhaustive mapping in CHECK-14) ----
eq(WMO_CODES.length, 28, 'known WMO set has 28 codes');
ok(WMO_CODES.every((c) => weatherLabel(c) !== '' && weatherIconKind(c) !== ''), 'every known code has a label and an icon kind');
eq([0, 1, 2, 3, 45, 53, 63, 66, 73, 81, 95].map(weatherLabel), ['Ciel dégagé', 'Peu nuageux', 'Nuageux', 'Couvert', 'Brouillard', 'Bruine', 'Pluie', 'Pluie verglaçante', 'Neige', 'Averses', 'Orage'], 'French labels');
eq([weatherLabel(null), weatherLabel(undefined), weatherLabel(4), weatherIconKind(null), weatherIconKind(7)], ['', '', '', '', ''], 'null/unknown code gives no label, no icon kind');
eq(weatherTooltipLine(63), 'Météo : Pluie', 'weather tooltip line');
eq(weatherTooltipLine(null), 'Météo : donnée indisponible', 'weather tooltip line without code');

// ---- compass ----
const names = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est', 'est-sud-est', 'sud-est', 'sud-sud-est', 'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];
eq(names.map((_, i) => compassFr(i * 22.5)), names, '16 compass points at their exact angles');
eq([compassFr(0), compassFr(360), compassFr(11.2), compassFr(11.3), compassFr(348.7), compassFr(348.8), compassFr(-10), compassFr(290)], ['nord', 'nord', 'nord', 'nord-nord-est', 'nord-nord-ouest', 'nord', 'nord', 'ouest-nord-ouest'], 'compass sector edges, wrap and negatives');
eq(compassFr(NaN), '', 'compass NaN');

// ---- formatWind ----
eq(formatWind(11.4, 225), `Vent : moy. 11${NB}km/h · du sud-ouest`, 'wind line with direction');
eq(formatWind(11.6, 290), `Vent : moy. 12${NB}km/h · de l'ouest-nord-ouest`, 'elision for ouest/est');
eq(formatWind(8, 90), `Vent : moy. 8${NB}km/h · de l'est`, 'elision est');
eq(formatWind(8, null), `Vent : moy. 8${NB}km/h`, 'speed only: no direction');
eq(formatWind(0, 90), `Vent : moy. 0${NB}km/h`, 'zero wind: no direction');
eq(formatWind(0.4, 90), `Vent : moy. 0${NB}km/h`, 'speed rounding to 0: no direction');
eq(formatWind(null, 90), 'Vent : donnée indisponible', 'no speed: unavailable');
eq(formatWind(11, 0, 3, 5), `Vent : moy. 11${NB}km/h · du nord (3/5 jours)`, 'partial coverage suffix');

// ---- aggregateWind ----
const D = (date, v, a) => ({ date, mean: null, min: null, max: null, windKmh: v, windDeg: a });
{
  const r = aggregateWind([D('2025-01-01', 10, 350), D('2025-01-02', 10, 10)], ['2025-01-01', '2025-01-02']);
  ok(r.deg !== null && (r.deg < 1e-6 || r.deg > 360 - 1e-6) && compassFr(r.deg) === 'nord', `circular wrap: 350 and 10 give north, not south (${r.deg})`);
  eq([r.speed, r.covered, r.total], [10, 2, 2], 'wrap: mean speed and coverage');
}
{
  const r = aggregateWind([D('2025-01-01', 30, 90), D('2025-01-02', 10, 180)], ['2025-01-01', '2025-01-02']);
  ok(Math.abs(r.deg - (Math.atan2(30, -10) * 180 / Math.PI)) < 1e-6 && r.deg > 90 && r.deg < 135, `speed-weighted: strong east wins over weak south (${r.deg.toFixed(2)})`);
  eq(r.speed, 20, 'weighted: mean speed is the plain mean');
}
eq(aggregateWind([D('2025-01-01', 10, 0), D('2025-01-02', 10, 180)], ['2025-01-01', '2025-01-02']).deg, null, 'opposite winds: resultant ~0, no direction');
eq(aggregateWind([D('2025-01-01', 0, 90)], ['2025-01-01']), { speed: 0, deg: null, covered: 1, total: 1 }, 'zero wind: speed 0, no direction');
eq(aggregateWind([D('2025-01-01', null, 90), D('2025-01-02', 6, null)], ['2025-01-01', '2025-01-02', '2025-01-03']), { speed: 6, deg: null, covered: 1, total: 3 }, 'nulls and absent day: only known speeds counted, direction without speed ignored');
eq(aggregateWind([], ['2025-01-01']), { speed: null, deg: null, covered: 0, total: 1 }, 'empty weather');
eq(aggregateWind([D('2025-01-01', 5, 45)], []), { speed: null, deg: null, covered: 0, total: 0 }, 'empty bucket');
eq(aggregateWind(new Map([['2025-01-01', D('2025-01-01', 7, 270)]]), ['2025-01-01']).deg, 270, 'Map input, single direction kept');
eq(windTooltipLine({ speed: null, deg: null, covered: 0, total: 4 }), 'Vent : donnée indisponible', 'bucket tooltip without data');
eq(aggregateWind([{ date: '2025-01-01', mean: 1, min: 0, max: 2 }], ['2025-01-01']).speed, null, 'DailyTemp without wind fields (older shape) = no wind');

// ---- validation ----
const base = () => ({ daily: {
  time: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
  temperature_2m_mean: [1, 2, 3, null], temperature_2m_min: [0, 1, 2, null], temperature_2m_max: [3, 4, 5, null],
  weather_code: [53, 3, 63, null], wind_speed_10m_mean: [8.0, 12.5, 0, null], wind_direction_10m_dominant: [290, 360, 45, null],
} });
const pw = parseWeatherResponse(base(), '2025-01-01', '2025-01-04');
ok(pw.ok && pw.days[0].code === 53 && pw.days[0].windKmh === 8 && pw.days[0].windDeg === 290 && pw.days[1].windDeg === 0 && pw.days[2].windKmh === 0, 'parse: code, wind, direction (360 -> 0, zero wind kept)');
ok(pw.ok && pw.days[3].code === null && pw.days[3].windKmh === null && pw.days[3].windDeg === null && pw.missing === 1, 'parse: all-null day counts as missing');
{
  const j = base(); j.daily.temperature_2m_mean = [null, null, null, null]; j.daily.temperature_2m_min = [null, null, null, null]; j.daily.temperature_2m_max = [null, null, null, null];
  const r = parseWeatherResponse(j, '2025-01-01', '2025-01-04');
  ok(r.ok && r.missing === 1 && dayHasData(r.days[0]), 'a day with only code/wind is not missing (missing = ALL fields null)');
}
{
  const j = base(); j.daily.weather_code = [4, 53.5, '63', 100]; j.daily.wind_speed_10m_mean = [-1, 301, NaN, 'x']; j.daily.wind_direction_10m_dominant = [-0.1, 360.5, Infinity, {}];
  const r = parseWeatherResponse(j, '2025-01-01', '2025-01-04');
  ok(r.ok && r.days.every((d) => d.code === null && d.windKmh === null && d.windDeg === null), 'invalid code / speed / direction values become null');
  const k = base(); k.daily.wind_speed_10m_mean = [300, 0.0, 1, 2]; k.daily.wind_direction_10m_dominant = [0, 359.9, 180, 1];
  const r2 = parseWeatherResponse(k, '2025-01-01', '2025-01-04');
  ok(r2.ok && r2.days[0].windKmh === 300 && r2.days[0].windDeg === 0 && r2.days[1].windDeg === 359.9, 'boundary values accepted (300 km/h, 0 and 359.9 degrees)');
}
for (const f of ['weather_code', 'wind_speed_10m_mean', 'wind_direction_10m_dominant']) {
  const miss = base(); delete miss.daily[f];
  const r = parseWeatherResponse(miss, '2025-01-01', '2025-01-04');
  ok(r.ok && r.days.every((d) => d[f === 'weather_code' ? 'code' : f === 'wind_speed_10m_mean' ? 'windKmh' : 'windDeg'] === null) && r.days[0].mean === 1, `omitted ${f}: all null for that field, not a failure`);
  const short = base(); short.daily[f].pop();
  ok(parseWeatherResponse(short, '2025-01-01', '2025-01-04').ok === false, `${f} with a wrong length rejects the payload`);
  const notArr = base(); notArr.daily[f] = 'x';
  ok(parseWeatherResponse(notArr, '2025-01-01', '2025-01-04').ok === false, `${f} present but not an array rejects the payload`);
}
{
  const j = base(); delete j.daily.weather_code; delete j.daily.wind_speed_10m_mean; delete j.daily.wind_direction_10m_dominant;
  const r = parseWeatherResponse(j, '2025-01-01', '2025-01-04');
  ok(r.ok && r.missing === 1, 'temperature-only payload (old shape) still parses with the old missing count');
}

// ---- network: exact URL and unchanged options ----
const resp = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
{
  N.clearWeatherCache();
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return resp(base()); };
  const r = await N.fetchDailyTemps(48.8566, 2.3522, '2025-01-01', '2025-01-04', f);
  ok(r.ok && r.days.length === 4 && r.days[0].code === 53, 'fetchDailyTemps returns the new fields');
  const u = new URL(calls[0].url);
  eq(u.searchParams.get('daily'), 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_mean,wind_direction_10m_dominant,precipitation_sum', 'daily variables in the required order');
  eq([...u.searchParams.keys()], ['latitude', 'longitude', 'start_date', 'end_date', 'daily', 'timezone'], 'no other query parameter');
  ok(!/gust|wind_speed_10m_max|wind_gusts/.test(calls[0].url), 'no gusts or max wind requested');
  const i = calls[0].init;
  ok(u.origin === 'https://archive-api.open-meteo.com' && i.method === 'GET' && i.credentials === 'omit' && i.referrerPolicy === 'no-referrer' && i.cache === 'no-store' && i.redirect === 'error' && i.signal instanceof AbortSignal, 'request options unchanged');
  N.clearWeatherCache();
  const bad = await N.fetchDailyTemps(10, 10, '2025-01-01', '2025-01-04', async () => { const j = base(); j.daily.weather_code.pop(); return resp(j); });
  ok(!bad.ok && /invalide/.test(bad.message), 'wrong-length weather_code array gives the French invalid-response message');
  N.clearWeatherCache();
}

// ---- scene ----
const MS = 86400000;
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const SIZE = { width: 960, height: 420 };
const ALL = ['tempo', 'hchp', 'base'];
const days = [];
for (let i = 0; i < 365; i++) days.push({ date: iso(num('2025-03-15') + i), kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false });
const offers = priceOffers(days, 9);
const wx = (f) => days.map((d, i) => ({ date: d.date, mean: 10, min: 7, max: 14, ...f(i, d.date) }));
const full = wx((i) => ({ code: WMO_CODES[i % WMO_CODES.length], windKmh: 5 + (i % 20), windDeg: (i * 37) % 360 }));
const apr = { from: '2025-04-01', to: '2025-04-30' };

{ // regression: weather off
  const off = buildScene(offers, ALL, apr, 'day', SIZE);
  eq(JSON.stringify(off), JSON.stringify(buildScene(offers, ALL, apr, 'day', SIZE, null)), 'weather off: identical scene for undefined and null');
  ok(off.weather === null && off.groups.every((g) => g.glyph === null && g.tip.length === 5 && !g.aria.includes('Vent') && !g.aria.includes('Météo')), 'weather off: no glyph, no weather/wind line, no weather aria');
}
{ // day view
  const sc = buildScene(offers, ALL, apr, 'day', SIZE, full);
  eq(sc.groups.length, 30, 'day view 30 groups');
  ok(sc.groups.every((g) => g.glyph && g.glyph.kind === weatherIconKind(full.find((d) => d.date === g.firstDate).code)), 'every day with a code has its icon kind');
  ok(sc.groups.every((g) => g.glyph.x === g.cx && g.glyph.x >= sc.plot.x && g.glyph.x <= sc.plot.x + sc.plot.w), 'glyph x centred on the day, inside the plot width');
  ok(sc.groups.every((g) => g.glyph.y >= 0 && g.glyph.y + (g.glyph.size * 5) / 6 <= sc.plot.y && g.glyph.size <= gw(sc) && g.glyph.size <= 20), 'icon box sits in the band above the plot, no wider than its cell (no collision with bars, lines or halo)');
  const t = sc.weather.segments.flat();
  ok(t.every((p) => p.y >= sc.plot.y) && sc.groups.every((g) => g.bars.every((b) => b.y >= sc.plot.y - 1e-6)), 'trend and bars stay at or below the plot top, below the glyph band');
  ok(sc.groups.every((g) => g.tip.length === 9), 'day tooltip: title + 3 offers + consommation (with HC/HP share) + météo + température + vent + précipitations = 9 lines');
  const g0 = sc.groups[0], d0 = full.find((d) => d.date === g0.firstDate);
  eq(g0.tip.slice(-4, -1), [`Météo : ${weatherLabel(displayCode(d0.code, d0.precipMm))}`, g0.tip.at(-3), formatWind(d0.windKmh, d0.windDeg)], 'day tooltip: Météo line, then temperature, then wind, then precipitation');
  ok(/^Température : /.test(g0.tip.at(-3)), 'temperature line precedes the wind line');
  ok(sc.groups.every((g) => g.aria.includes('Météo : ') && g.aria.includes('Vent : moy.')), 'aria-label carries the weather label and the wind sentence');
  eq(sc.weather.glyphNote, 'Symboles : météo du jour', 'legend note when glyphs are drawn');
  const longest = Math.max(...sc.groups.flatMap((g) => g.tip.map((l) => l.length)));
  ok(longest * 6.3 + 16 < SIZE.width / 2, `longest tooltip line (${longest} chars) fits the tooltip width logic`);
}
{ // suffix width and aria in the worst realistic case
  const w = formatWind(100, 292.5, 12, 17);
  ok(w.length <= 'Température : moy. 12,3 °C · min −4,1 · max 31,0 (12/17 jours)'.length, `longest wind line (${w}) is not longer than the temperature line the tooltip already fits`);
}
{ // partial data
  const part = wx((i, d) => ({ code: i % 3 === 0 ? 61 : null, windKmh: i % 2 ? 9 : null, windDeg: i % 2 ? 200 : null }));
  const sc = buildScene(offers, ALL, apr, 'day', SIZE, part);
  const none = sc.groups.find((g) => !g.glyph && g.tip.at(-2) === 'Vent : donnée indisponible');
  ok(none && none.tip.includes('Météo : donnée indisponible'), 'day without code and wind: no glyph, "donnée indisponible" lines');
  ok(sc.groups.filter((g) => !g.glyph).length > 0 && sc.groups.filter((g) => g.glyph).length > 0, 'glyphs only on days that have a code');
  const nocode = buildScene(offers, ALL, apr, 'day', SIZE, wx(() => ({ code: null })));
  ok(nocode.groups.every((g) => g.glyph === null) && nocode.weather.glyphNote === '', 'no code anywhere: no glyph, no legend note');
  const tempOnly = buildScene(offers, ALL, apr, 'day', SIZE, days.map((d) => ({ date: d.date, mean: 3, min: 1, max: 5 })));
  ok(tempOnly.groups.every((g) => g.glyph === null) && tempOnly.weather.glyphNote === '' && tempOnly.groups.every((g) => /^Vent : donnée indisponible$/.test(g.tip.at(-2))), 'old temperature-only data degrades cleanly');
}
{ // narrow cells: glyphs would overlap, so none are drawn and no legend note
  const wide = buildScene(offers, ALL, { from: '2025-03-15', to: '2026-03-14' }, 'day', SIZE, full);
  ok(wide.plot.w / wide.groups.length < GLYPH_MIN_W && wide.groups.every((g) => g.glyph === null) && wide.weather.glyphNote === '', 'cells narrower than GLYPH_MIN_W: no glyphs, no note');
}
{ // month and year views: temperature + wind lines, no weather line, no glyph
  for (const gran of ['month', 'year']) {
    const sc = buildScene(offers, ALL, { from: '2025-03-15', to: '2026-03-14' }, gran, SIZE, full);
    ok(sc.groups.every((g) => g.glyph === null && !g.tip.some((l) => l.startsWith('Météo :')) && /^Température : /.test(g.tip.at(-3)) && /^Vent : moy\./.test(g.tip.at(-2))), `${gran} view: temperature + wind lines, no Météo line, no glyph`);
    ok(sc.groups.every((g) => !g.aria.includes('Météo :')) && sc.groups.every((g) => g.aria.includes('Vent :')), `${gran} view: aria has the wind sentence and no weather label`);
    eq(sc.weather.glyphNote, '', `${gran} view: no glyph legend note`);
  }
  const part = buildScene(offers, ALL, { from: '2025-03-15', to: '2025-04-30' }, 'month', SIZE, wx((i) => ({ windKmh: i < 10 ? 10 : null, windDeg: i < 10 ? 100 : null })));
  ok(/\(10\/17 jours\)$/.test(part.groups[0].tip.at(-2)), 'month wind line carries the partial coverage suffix');
  const circ = buildScene(offers, ALL, { from: '2025-04-01', to: '2025-04-02' }, 'month', SIZE, wx((i, d) => ({ windKmh: 10, windDeg: d === '2025-04-01' ? 350 : 10 })));
  ok(/du nord$/.test(circ.groups[0].tip.at(-2)), `month wind direction wraps through north (${circ.groups[0].tip.at(-2)})`);
}


// ---- precipitation (rain only above 1 mm, precipitation in the tooltip) ----
{
  eq(RAIN_MM_THRESHOLD, 1, 'rain threshold is 1 mm');
  const pb = () => { const j = base(); j.daily.precipitation_sum = [0.4, 2.5, PRECIP_MAX, null]; return j; };
  const pp = parseWeatherResponse(pb(), '2025-01-01', '2025-01-04');
  ok(pp.ok && pp.days.map((d) => d.precipMm).join() === [0.4, 2.5, PRECIP_MAX, null].join(), 'parse: precipitation_sum kept, null stays null');
  const bp = pb(); bp.daily.precipitation_sum = [-1, PRECIP_MAX + 1, NaN, 'x'];
  const pbad = parseWeatherResponse(bp, '2025-01-01', '2025-01-04');
  ok(pbad.ok && pbad.days.every((d) => d.precipMm === null), 'parse: negative, too large, NaN and non-number precipitation become null');
  const bl = pb(); bl.daily.precipitation_sum = [1, 2];
  ok(!parseWeatherResponse(bl, '2025-01-01', '2025-01-04').ok, 'parse: wrong-length precipitation_sum is rejected');
  const absent = parseWeatherResponse(base(), '2025-01-01', '2025-01-04');
  ok(absent.ok && absent.days.every((d) => d.precipMm === null), 'parse: absent precipitation_sum gives null (old payloads stay valid)');
  ok(dayHasData({ date: '2025-01-01', mean: null, min: null, max: null, precipMm: 0 }), 'a day with only a precipitation value has data');

  // displayCode: liquid-precipitation codes need more than 1 mm
  eq([...RAIN_CODES], [51, 53, 55, 61, 63, 65, 80, 81, 82], 'liquid-precipitation codes are exactly drizzle, rain and showers (FR-062)');
  ok(RAIN_CODES.every((c) => displayCode(c, 1) === 3 && displayCode(c, 0) === 3 && displayCode(c, 0.99) === 3), 'liquid codes with <= 1 mm (1 mm included) are shown as Couvert (3)');
  ok(RAIN_CODES.every((c) => displayCode(c, 1.01) === c && displayCode(c, 12) === c), 'liquid codes with > 1 mm keep their code');
  ok(RAIN_CODES.every((c) => displayCode(c, null) === c && displayCode(c, undefined) === c), 'unknown precipitation keeps the provider code');
  ok([0, 1, 2, 3, 45, 48, 56, 57, 66, 67, 71, 73, 75, 77, 85, 86, 95, 96, 99].every((c) => displayCode(c, 0) === c), 'fog, freezing, snow and storm codes are never changed');
  ok(displayCode(null, 5) === null && displayCode(undefined, 5) === null, 'no code gives null');
  eq(weatherIconKind(displayCode(53, 0.3)), 'cloud', 'light drizzle day shows the cloud icon');
  eq(weatherIconKind(displayCode(53, 3)), 'rain', 'wet drizzle day keeps the rain icon');

  // aggregation and formatting
  const pd = [{ date: '2025-01-01', precipMm: 0.4 }, { date: '2025-01-02', precipMm: 2.5 }, { date: '2025-01-03', precipMm: null }].map((d) => ({ mean: null, min: null, max: null, ...d }));
  const ag = aggregatePrecip(pd, ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-09']);
  ok(Math.abs(ag.mm - 2.9) < 1e-9 && ag.covered === 2 && ag.total === 4, 'aggregate: sum of the daily values, covered/total');
  const none0 = aggregatePrecip(pd, ['2025-01-03', '2025-02-01']);
  ok(none0.mm === null && none0.covered === 0 && none0.total === 2, 'aggregate: no value gives null');
  eq(aggregatePrecip([{ date: '2025-01-01', mean: null, min: null, max: null, precipMm: 0 }], ['2025-01-01']).mm, 0, 'aggregate: a dry day is 0, not missing');
  eq([formatPrecip(0), formatPrecip(2.94), formatPrecip(12.34), formatPrecip(1234.56)], [`0,0${NB}mm`, `2,9${NB}mm`, `12,3${NB}mm`, `1234,6${NB}mm`], 'format: comma, one decimal, no-break space');
  eq(precipSegments(12.3).map((x) => x.text).join(''), `Précipitations : 12,3${NB}mm`, 'precipitation line');
  eq(precipSegments(2.9, 2, 4).map((x) => x.text).join(''), `Précipitations : 2,9${NB}mm (2/4 jours)`, 'precipitation line with partial coverage');
  eq(precipSegments(null, 0, 4).map((x) => x.text).join(''), 'Précipitations : donnée indisponible', 'precipitation line without data');

  // scene: day view
  const wet = { from: '2025-04-01', to: '2025-04-03' };
  const dry = wx((i, d) => ({ code: 53, windKmh: 5, windDeg: 90, precipMm: d === '2025-04-01' ? 0.4 : d === '2025-04-02' ? 2.5 : null }));
  const ds = buildScene(offers, ALL, wet, 'day', SIZE, dry);
  const byKey = new Map(ds.groups.map((g) => [g.firstDate, g]));
  const a = byKey.get('2025-04-01'), b = byKey.get('2025-04-02'), c = byKey.get('2025-04-03');
  ok(a.tip.includes('Météo : Couvert') && a.glyph.kind === 'cloud', 'day with drizzle and 0,4 mm: Couvert and cloud icon, not rain');
  ok(b.tip.includes('Météo : Bruine') && b.glyph.kind === 'rain', 'day with drizzle and 2,5 mm: keeps Bruine and the rain icon');
  ok(c.tip.includes('Météo : Bruine') && c.glyph.kind === 'rain', 'day with drizzle and unknown precipitation: keeps the provider code');
  eq([a.tip.at(-1), b.tip.at(-1), c.tip.at(-1)], [`Précipitations : 0,4${NB}mm`, `Précipitations : 2,5${NB}mm`, 'Précipitations : donnée indisponible'], 'day tooltip ends with the precipitation line');
  ok(ds.groups.every((g) => g.tipRich.length === g.tip.length && g.tipRich.every((r, i) => r.map((x) => x.text).join('') === g.tip[i])), 'tipRich concatenation equals tip with the precipitation line');
  ok(a.aria.includes(`Précipitations : 0,4${NB}mm`), 'aria-label carries the precipitation sentence');
  // month view: sum over the bucket, with partial coverage
  const ms = buildScene(offers, ALL, { from: '2025-04-01', to: '2025-04-30' }, 'month', SIZE, dry);
  eq(ms.groups[0].tip.at(-1), `Précipitations : 2,9${NB}mm (2/30 jours)`, 'month tooltip sums the days with a value and shows the coverage');
  ok(!ms.groups[0].tip.some((l) => l.startsWith('Météo :')), 'month view still has no Météo line');
}

// ---- DOM layer source: decorative glyph, no style attribute ----
{
  const svg = readFileSync('src/ui/svg.ts', 'utf8');
  ok(/wx-icon/.test(svg) && /aria-hidden/.test(svg.slice(svg.indexOf('wx-icon'), svg.indexOf('wx-icon') + 300)) && !/setAttribute\('style'/.test(svg), 'icon svg is class based and aria-hidden, no style attribute');
  ok(/MAX_TIP_LINES = 9/.test(svg), 'MAX_TIP_LINES covers the 9-line day tooltip');
  ok(/legend-note', scene\.weather\.glyphNote/.test(readFileSync('src/ui/chart.ts', 'utf8')), 'legend note drawn from scene.weather.glyphNote');
}
process.exit(failures ? 1 : 0);
