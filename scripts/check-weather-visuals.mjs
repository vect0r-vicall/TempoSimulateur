// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-14 [AC-37..AC-42, FR-046..FR-050]: weather visuals: SVG icon kinds and table, min/max/mean temperature lines,
// coloured tooltip segments (plain text invariant), CSS tokens and contrast. Pure scene + source assertions, no network. exit 0 pass, 1 failed.
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const W = await import('../.build-test/core/weather.mjs');
const { buildScene } = await import('../.build-test/core/scene.mjs');
const { priceOffers } = await import('../.build-test/core/pricing.mjs');
const { WMO_CODES, WEATHER_ICON_KINDS, weatherIconKind, aggregateTemps, smoothTrend, segsText } = W;

const MS = 86400000;
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const SIZE = { width: 960, height: 420 };
const ALL = ['tempo', 'hchp', 'base'];
const days = [];
for (let i = 0; i < 365; i++) days.push({ date: iso(num('2025-03-15') + i), kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false });
const offers = priceOffers(days, 9);
const full = { from: days[0].date, to: days[364].date };
const apr = { from: '2025-04-01', to: '2025-04-30' };
const seasonal = days.map((d, i) => { const m = 12 + 10 * Math.sin((i / 365) * 2 * Math.PI); return { date: d.date, mean: m, min: m - 5, max: m + 6, code: WMO_CODES[i % WMO_CODES.length], windKmh: 8, windDeg: 200 }; });

// ---- 1. icon kinds: exhaustive mapping ----
eq(WEATHER_ICON_KINDS.length, 9, 'nine icon kinds');
ok(WMO_CODES.length === 28 && WMO_CODES.every((c) => WEATHER_ICON_KINDS.includes(weatherIconKind(c))), 'all 28 WMO codes map to a known icon kind');
ok(WEATHER_ICON_KINDS.every((k) => WMO_CODES.some((c) => weatherIconKind(c) === k)), 'every icon kind is used by at least one WMO code');
eq([0, 1, 2, 3, 45, 48, 51, 55, 56, 61, 65, 66, 71, 77, 80, 82, 85, 95, 96, 99].map(weatherIconKind),
  ['clear', 'partly', 'partly', 'cloud', 'fog', 'fog', 'rain', 'rain', 'sleet', 'rain', 'heavy-rain', 'sleet', 'snow', 'snow', 'rain', 'heavy-rain', 'snow', 'storm', 'storm', 'storm'], 'spot mapping of codes to kinds');
eq([weatherIconKind(null), weatherIconKind(undefined), weatherIconKind(4), weatherIconKind(-1), weatherIconKind(NaN)], ['', '', '', '', ''], 'null/unknown code gives no icon kind');

// ---- 2. icon table (src/ui/icons.ts is pure data: transpile and import it) ----
const iconSrc = readFileSync('src/ui/icons.ts', 'utf8');
const js = (await transform(iconSrc.replace(/^import .*$/m, ''), { loader: 'ts', format: 'esm' })).code;
const T = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
eq(Object.keys(T.ICONS).sort(), [...WEATHER_ICON_KINDS].sort(), 'icon table has exactly one entry per kind');
const flat = (els) => els.flatMap((e) => [e, ...flat(e.kids ?? [])]);
const allEls = Object.values(T.ICONS).flatMap(flat);
ok(Object.values(T.ICONS).every((els) => els.length >= 1), 'every icon draws something');
ok(allEls.every((e) => ['path', 'circle', 'line', 'rect', 'g'].includes(e.tag)), 'icons use only path, circle, line, rect, g');
eq([...new Set(allEls.map((e) => e.tag))].sort(), ['circle', 'g', 'line', 'path'], 'element names actually used (all allowed)');
ok(allEls.every((e) => !('style' in e.attrs) && !('href' in e.attrs) && !('xlink:href' in e.attrs) && !Object.keys(e.attrs).some((k) => /^on/i.test(k))), 'icon elements carry no style, href or event attribute');
ok(allEls.every((e) => e.tag === 'g' || (e.cls && /^wx-[a-z]+$/.test(e.cls))), 'every drawn icon element is class based (wx-*)');
ok(allEls.filter((e) => e.tag !== 'path').every((e) => Object.entries(e.attrs).every(([k, v]) => k === 'transform' || Number.isFinite(v))), 'numeric icon attributes are finite');
ok(allEls.filter((e) => e.tag === 'path').every((e) => /^[MmLlHhVvCcSsQqTtAaZz0-9 .,\-]+$/.test(e.attrs.d)), 'path data uses path commands and numbers only');
ok(!/<image|<use|xlink|href|foreignObject/i.test(iconSrc + readFileSync('src/ui/svg.ts', 'utf8')), 'no <image>, <use>, href or foreignObject in the drawing sources');
ok(T.ICON_SIZE === 24 && T.ICON_H === 20, 'shared 24 x 20 coordinate window');

// ---- 3. scene geometry: icon box ----
const day = buildScene(offers, ALL, apr, 'day', SIZE, seasonal);
ok(day.groups.every((g) => g.glyph && g.glyph.size > 0 && g.glyph.size <= 20 && g.glyph.y >= 0 && g.glyph.y + (g.glyph.size * 5) / 6 <= day.plot.y && g.glyph.x === g.cx), 'day icons: box inside the band above the plot, centred, width <= 20');
ok(day.groups.every((g) => g.glyph.size <= day.plot.w / day.groups.length), 'icon side never exceeds its cell');
const dense = buildScene(offers, ALL, { from: '2025-04-01', to: '2025-07-09' }, 'day', SIZE, seasonal); // 100 days, cells ~8.5
ok(dense.groups.every((g) => g.glyph === null) && dense.weather.glyphNote === '', 'cells below GLYPH_MIN_W: no icon, no legend note');

// mid-density: 12 <= cell < 21 viewBox units (61..70 days): icon side = min(20, cell - 1), neighbours never overlap
for (const n of [61, 65, 70]) {
  const mid = buildScene(offers, ALL, { from: '2025-04-01', to: iso(num('2025-04-01') + n - 1) }, 'day', SIZE, seasonal);
  const cell = mid.plot.w / mid.groups.length;
  const gl = mid.groups.map((g) => g.glyph);
  ok(cell >= 12 && cell < 21, `${n} days: cell ${cell.toFixed(2)} in [12, 21)`);
  ok(gl.every((g) => g && g.size > 0 && g.size <= Math.min(20, cell - 1) + 1e-9), `${n} days: icon side <= min(20, cell - 1)`);
  ok(gl.slice(1).every((g, i) => gl[i].x + gl[i].size / 2 <= g.x - g.size / 2 + 1e-9), `${n} days: neighbouring icon x-ranges are disjoint`);
}
const d80 = buildScene(offers, ALL, { from: '2025-04-01', to: iso(num('2025-04-01') + 79) }, 'day', SIZE, seasonal);
ok(d80.groups.length === 80 && d80.groups.every((g) => g.glyph === null) && d80.weather.glyphNote === '', '80 days: no icon drawn');

// ---- 4. min / max / mean series ----
const valueOf = (sc, y) => { const lo = sc.weather.ticks[0], hi = sc.weather.ticks.at(-1); return lo.value + ((sc.plot.y + sc.plot.h - y) / sc.plot.h) * (hi.value - lo.value); };
const bucketDates = (g) => { const out = []; for (let n = num(g.firstDate); n <= num(g.lastDate); n++) out.push(iso(n)); return out; };
const expected = (sc, data, pick) => smoothTrend(sc.groups.map((g) => aggregateTemps(data, bucketDates(g))).map(pick));
const checkSeries = (sc, data, label) => {
  for (const [key, pick] of [['segments', (a) => a.mean], ['minSegments', (a) => a.min], ['maxSegments', (a) => a.max]]) {
    const want = expected(sc, data, pick);
    const got = sc.weather[key].flat().map((p) => valueOf(sc, p.y));
    const wantVals = want.filter((v) => v !== null);
    ok(got.length === wantVals.length && got.every((v, i) => Math.abs(v - wantVals[i]) < 1e-6), `${label}: ${key} equals smoothTrend of the per-bucket aggregate`);
  }
  const lo = sc.weather.ticks[0].value, hi = sc.weather.ticks.at(-1).value;
  const all = ['segments', 'minSegments', 'maxSegments'].flatMap((k) => sc.weather[k].flat().map((p) => valueOf(sc, p.y)));
  ok(all.every((v) => v >= lo - 1e-6 && v <= hi + 1e-6), `${label}: degC axis ${lo}..${hi} covers every min/max/mean point`);
  ok(['segments', 'minSegments', 'maxSegments'].every((k) => sc.weather[k].flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.y >= sc.plot.y - 1e-6 && p.y <= sc.plot.y + sc.plot.h + 1e-6)), `${label}: all points finite and inside the plot`);
};
const sm = buildScene(offers, ALL, full, 'month', SIZE, seasonal);
checkSeries(sm, seasonal, 'month seasonal');
ok(valueOf(sm, Math.min(...sm.weather.minSegments.flat().map((p) => p.y))) > sm.weather.ticks[0].value - 1e-6, 'min line stays within the axis (sanity)');
ok(sm.weather.maxSegments.flat().every((p, i) => p.y <= sm.weather.minSegments.flat()[i].y + 1e-6), 'consistent data: max line never below min line');
ok(sm.weather.ticks[0].value <= 7 - 5 - 4 && sm.weather.ticks.at(-1).value >= 22, `axis widened to the min/max range (${sm.weather.ticks.map((t) => t.label).join(' ')})`);
const holes = seasonal.map((d, i) => (i % 40 < 12 ? { ...d, mean: null, min: i % 80 < 12 ? null : d.min, max: null } : d));
checkSeries(buildScene(offers, ALL, full, 'month', SIZE, holes), holes, 'month with holes');
const neg = days.map((d) => ({ date: d.date, mean: -12, min: -20, max: -3 }));
const sn = buildScene(offers, ALL, full, 'month', SIZE, neg);
checkSeries(sn, neg, 'negative temperatures');
ok(sn.weather.ticks.every((t) => /^−?\d/.test(t.label)) && sn.weather.ticks[0].value <= -20, 'negative axis reaches the minimum');
const flat0 = days.map((d) => ({ date: d.date, mean: 5, min: 5, max: 5 }));
const sf = buildScene(offers, ALL, full, 'month', SIZE, flat0);
checkSeries(sf, flat0, 'flat series');
ok(sf.weather.ticks.length >= 3, 'flat series: widened axis keeps 3+ ticks');
const onlyMin = days.map((d) => ({ date: d.date, mean: null, min: 2, max: null }));
const so = buildScene(offers, ALL, full, 'month', SIZE, onlyMin);
ok(so.weather.segments.length === 0 && so.weather.minSegments.length === 1 && so.weather.maxSegments.length === 0 && so.weather.legend.length === 3, 'only min available: only the min line is drawn');
const nul = buildScene(offers, ALL, full, 'month', SIZE, days.map((d) => ({ date: d.date, mean: null, min: null, max: null })));
ok(nul.weather.segments.length + nul.weather.minSegments.length + nul.weather.maxSegments.length === 0 && nul.weather.ticks.length === 0 && nul.weather.legend.length === 0 && nul.weather.note !== '', 'no temperature at all: no lines, no axis, no legend, a note (NO_DATA)');
const gap = seasonal.map((d) => (d.date >= '2025-08-01' && d.date < '2025-10-01' ? { ...d, mean: null, min: null, max: null } : d));
const sg = buildScene(offers, ALL, full, 'month', SIZE, gap);
ok(['segments', 'minSegments', 'maxSegments'].every((k) => sg.weather[k].length === 2), 'null months break all three lines into 2 segments');
eq(sm.weather.legend, [{ cls: 't-mean', label: 'Température moyenne' }, { cls: 't-min', label: 'Température minimale' }, { cls: 't-max', label: 'Température maximale' }], 'legend entries');
const tooltipAgg = aggregateTemps(seasonal, bucketDates(sm.groups[2]));
ok(sm.groups[2].tip.some((l) => l.includes(`min ${W.formatTemp(tooltipAgg.min).replace(/\s°C$/, '')}`) && l.includes(`max ${W.formatTemp(tooltipAgg.max).replace(/\s°C$/, '')}`)), 'tooltip min/max are the same bucket aggregates as the lines (min of mins, max of maxes)');

// ---- 5. tooltip segments ----
const CLASSES = new Set([undefined, 'tt-mean', 'tt-min', 'tt-max', 'tt-wind', 'tt-strong', 'tt-kwh']);
const checkTip = (sc, label) => {
  const bad = sc.groups.filter((g) => g.tipRich.length !== g.tip.length || g.tipRich.some((segs, i) => segsText(segs) !== g.tip[i] || segs.length === 0 || segs.some((x) => typeof x.text !== 'string' || x.text === '' || !CLASSES.has(x.cls))));
  ok(bad.length === 0, `${label}: tipRich concatenation equals the plain tip for every line of every group`);
};
checkTip(day, 'day view'); checkTip(sm, 'month view'); checkTip(buildScene(offers, ALL, full, 'year', SIZE, seasonal), 'year view'); checkTip(buildScene(offers, ALL, full, 'month', SIZE), 'weather off');
const g0 = day.groups[0];
const tl = g0.tipRich.find((s) => s[0].text.startsWith('Température'));
eq(tl.map((x) => x.cls), [undefined, 'tt-mean', undefined, 'tt-min', undefined, 'tt-max'], 'temperature line: neutral label, mean, min, max coloured, neutral separators');
ok(tl[0].text === 'Température : ' && tl[2].text === ' · ', 'label and separators are separate neutral segments');
const wl = g0.tipRich.find((s) => s[0].text.startsWith('Vent'));
ok(wl[0].cls === undefined && wl.slice(1).filter((x) => x.cls).every((x) => x.cls === 'tt-wind') && wl.some((x) => x.cls === 'tt-wind'), 'wind line: neutral label, teal values');
const ml = g0.tipRich.find((s) => s[0].text.startsWith('Météo'));
eq(ml.map((x) => x.cls), [undefined, 'tt-strong'], 'weather line: neutral label, bold word');
ok(!JSON.stringify(g0.aria).includes('tt-') && /Température : moy\. /.test(g0.aria), 'aria-label stays plain text');
const part = buildScene(offers, ALL, full, 'month', SIZE, seasonal.map((d, i) => (i < 5 ? { ...d, mean: null, min: null, max: null } : d)));
ok(part.groups[0].tip.some((l) => /\(\d+\/\d+ jours\)$/.test(l)) && part.groups[0].tipRich.some((s) => /jours\)$/.test(s.at(-1).text) && s.at(-1).cls === undefined), 'partial coverage suffix is a neutral segment');

// ---- 6. weather off regression ----
const off = buildScene(offers, ALL, apr, 'day', SIZE);
ok(JSON.stringify(off) === JSON.stringify(buildScene(offers, ALL, apr, 'day', SIZE, null)) && off.weather === null && off.groups.every((g) => g.glyph === null && g.tip.length === 5 && g.tipRich.length === 5), 'weather off: scene has no overlay, no icon, 5 tooltip lines (title, 3 offers, consommation), same for undefined and null');
ok(off.plot.w === SIZE.width - 62 - 12, 'weather off: plot unchanged');

// ---- 7. fuzz ----
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const maybe = (p, f) => (rnd() < p ? null : f());
let thrown = 0;
for (let n = 0; n < 400; n++) {
  const mode = pick(['year', 'month', 'day']);
  const len = pick([3, 30, 120, 365]);
  const start = Math.floor(rnd() * (365 - len + 1));
  const period = { from: days[start].date, to: days[start + len - 1].date };
  const data = days.filter(() => rnd() > 0.15).map((d) => {
    const base = rnd() * 60 - 25;
    return { date: d.date, mean: maybe(0.3, () => base), min: maybe(0.3, () => base - rnd() * 8), max: maybe(0.3, () => base + rnd() * 8), code: maybe(0.3, () => pick(WMO_CODES)), windKmh: maybe(0.3, () => rnd() * 80), windDeg: maybe(0.3, () => rnd() * 360) };
  });
  try {
    const sc = buildScene(priceOffers(days.slice(start, start + len), 9), ALL, period, mode, SIZE, data);
    const bad = sc.groups.some((g) => g.tipRich.length !== g.tip.length || g.tipRich.some((s, i) => segsText(s) !== g.tip[i])) ||
      (sc.weather && ['segments', 'minSegments', 'maxSegments'].some((k) => sc.weather[k].flat().some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) ||
      (sc.weather && sc.weather.ticks.length > 0 && sc.weather.ticks.some((t) => !Number.isFinite(t.y))) ||
      sc.groups.some((g) => g.glyph && !(g.glyph.kind && g.glyph.size > 0));
    if (bad) { thrown++; console.error('fuzz invariant broken', n, mode, len); }
  } catch (e) { thrown++; console.error('fuzz threw', n, mode, len, e.message); }
}
ok(thrown === 0, 'fuzz: 400 random partial/negative/null cases, no throw, finite geometry, tipRich invariant');

// ---- 8. CSS tokens in both themes, contrast, class based DOM ----
const css = readFileSync('src/app.css', 'utf8');
// each token is declared exactly twice, in order: light (:root) then dark (prefers-color-scheme: dark)
const tokVals = (name) => [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
const TOKENS = ['--t-min', '--t-max', '--t-mean', '--t-min-text', '--t-max-text', '--t-mean-text', '--t-wind-text', '--wx-sun', '--wx-sun-edge', '--wx-cloud', '--wx-cloud-edge', '--wx-rain', '--wx-snow', '--wx-snow-edge', '--wx-bolt', '--wx-bolt-edge', '--wx-fog', '--trend-halo', '--card'];
ok(TOKENS.every((t) => tokVals(t).length === 2), 'every colour token is defined exactly twice: light theme and dark theme');
const tok = (theme, name) => tokVals(name)[theme === 'light' ? 0 : 1];
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const name of ['light', 'dark']) {
  const card = tok(name, '--card');
  for (const t of ['--t-min-text', '--t-max-text', '--t-mean-text', '--t-wind-text']) ok(contrast(tok(name, t), card) >= 4.5, `${name}: ${t} contrast on the tooltip background >= 4.5 (${contrast(tok(name, t), card).toFixed(2)})`);
  for (const t of ['--t-min', '--t-max', '--t-mean']) ok(contrast(tok(name, t), card) >= 2, `${name}: line colour ${t} stays visible on the card (${contrast(tok(name, t), card).toFixed(2)})`);
}
ok(/\.trend-line\.t-mean\s*\{[^}]*var\(--t-mean\)[^}]*stroke-width:\s*2\b/.test(css) && /\.trend-line\.t-min\s*\{[^}]*var\(--t-min\)/.test(css) && /\.trend-line\.t-max\s*\{[^}]*var\(--t-max\)/.test(css) && /\.trend-line\s*\{[^}]*stroke-width:\s*1\.5/.test(css), 'CSS: mean 2px, min/max 1.5px, token colours');
ok(/\.tip-text \.tt-mean\s*\{[^}]*--t-mean-text/.test(css) && /\.tip-text \.tt-min\s*\{[^}]*--t-min-text/.test(css) && /\.tip-text \.tt-max\s*\{[^}]*--t-max-text/.test(css) && /\.tip-text \.tt-wind\s*\{[^}]*--t-wind-text/.test(css), 'CSS: tooltip tspan classes use the text tokens');
const svgSrc = readFileSync('src/ui/svg.ts', 'utf8'), chartSrc = readFileSync('src/ui/chart.ts', 'utf8');
ok(/'tspan'/.test(svgSrc) && /createTextNode/.test(svgSrc) && !/innerHTML|setAttribute\('style'/.test(svgSrc + chartSrc), 'svg.ts builds tspans/text nodes only (no innerHTML, no style attribute)');
ok(/t-min/.test(svgSrc) && /t-max/.test(svgSrc) && /t-mean/.test(svgSrc) && /scene\.weather\.legend/.test(chartSrc), 'lines drawn per series class; legend built from the scene entries');
process.exit(failures ? 1 : 0);
