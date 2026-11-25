// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-17 [AC-53..AC-56, FR-059..FR-062]: consumption (kWh) in the chart tooltip, the main recap and the view recap.
// Pure core on SYNTHETIC data (plus, with TEMPO_DEMO_DATA=1, the committed synthetic demo export). exit 0 pass, 1 failed, >=2 error.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { demoCsv } from './data-paths.mjs';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const { buildScene } = await import('../.build-test/core/scene.mjs');
const { analyse, buildRecap } = await import('../.build-test/core/recap.mjs');
const V = await import('../.build-test/core/view.mjs');
const { viewRecap } = await import('../.build-test/core/viewrecap.mjs');
const F = await import('../.build-test/core/format.mjs');
const K = await import('../.build-test/core/kwh.mjs');
const { parseIndexCsv } = await import('../.build-test/core/csv.mjs');

const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const SIZE = { width: 960, height: 420 };
const ALL = ['tempo', 'hchp', 'base'];
const NB = ' ', NNB = ' ';
const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NNB); // independent re-implementation of the grouping

// ---- French formatting ----
eq([0, 7, 999, 1000, 1234567].map(F.formatKwh), [`0${NB}kWh`, `7${NB}kWh`, `999${NB}kWh`, `1${NNB}000${NB}kWh`, `1${NNB}234${NNB}567${NB}kWh`], 'formatKwh: integers, thousands separator U+202F as formatEuro, no-break space before kWh');
eq([F.formatKwh(1234.5), F.formatKwh(0.1 + 0.2), F.formatKwhNumber(12.04)], [`1${NNB}234,5${NB}kWh`, `0,3${NB}kWh`, '12,0'], 'formatKwh: decimals only for non-integers, no float drift in the digits');
eq(F.formatEuro(1234567890).charAt(1), NNB, 'sanity: formatEuro uses the same thousands separator');

// ---- synthetic import: HC/HP era, Tempo era, a gap (estimated days) and an excluded boundary day ----
const days = [];
const EXCLUDED = '2025-06-10';
for (let n = num('2024-09-10'); n <= num('2026-02-20'); n++) {
  const date = iso(n);
  if (date === EXCLUDED) continue; // boundary day: not priced
  const estimated = date >= '2025-03-03' && date <= '2025-03-06'; // reading gap spread over 4 days
  if (date < '2025-06-10') days.push({ date, kind: 'hchp', kwh: { hc: 3 + (n % 5), hp: 5 + (n % 7) }, estimated });
  else days.push({ date, kind: 'tempo', kwh: { bleuHC: n % 4, bleuHP: 2 + (n % 6), blancHC: n % 3, blancHP: n % 2, rougeHC: n % 2, rougeHP: 1 + (n % 3) }, estimated: false });
}
const imp = { days, excluded: [EXCLUDED] };
const priced = { from: days[0].date, to: days.at(-1).date };
const period = { from: '2025-02-10', to: '2025-12-20' }; // partial first and last months, contains the excluded day and the gap
const analyseFor = (p) => analyse(imp, p, 9);

// independent recomputation from the raw day list (no use of kwh.ts, pricing.ts or scene.ts)
const HCK = ['hc', 'bleuHC', 'blancHC', 'rougeHC'], HPK = ['hp', 'bleuHP', 'blancHP', 'rougeHP'];
function expectBucket(from, to, keyOf) {
  const m = new Map();
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    const e = m.get(keyOf(d.date)) ?? { total: 0, hc: 0, hp: 0, n: 0 };
    for (const [k, v] of Object.entries(d.kwh)) { e.total += v; if (HCK.includes(k)) e.hc += v; if (HPK.includes(k)) e.hp += v; }
    e.n++;
    m.set(keyOf(d.date), e);
  }
  return m;
}
const KEYS = { year: (d) => d.slice(0, 4), month: (d) => d.slice(0, 7), day: (d) => d };
const lineRe = /^Consommation : ([\d\u202f]+)\u00a0kWh(?: \(HC ([\d\u202f]+)\u00a0kWh, (\d+)\u00a0% · HP ([\d\u202f]+)\u00a0kWh, (\d+)\u00a0%\))?$/;
const consLine = (g) => g.tip.find((l) => l.startsWith('Consommation'));
const pct = (e) => Math.round((100 * e.hc) / (e.hc + e.hp));
const expectedLine = (e) => `Consommation : ${grp(e.total)}${NB}kWh (HC ${grp(e.hc)}${NB}kWh, ${pct(e)}${NB}% · HP ${grp(e.hp)}${NB}kWh, ${100 - pct(e)}${NB}%)`;

const rangeOf = { year: period, month: period, day: { from: '2025-11-20', to: '2025-12-20' } };
for (const gran of ['year', 'month', 'day']) {
  const per = rangeOf[gran];
  const a = analyseFor(per);
  const scene = buildScene(a.offers, ALL, per, gran, SIZE, undefined, a.rawDays); // the app path: kWh from the raw priced days
  eq(buildScene(a.offers, ALL, per, gran, SIZE).groups.map((g) => g.tip), scene.groups.map((g) => g.tip), `${gran}: offers-only fallback gives the same tooltips when an HC/HP offer is available`);
  const exp = expectBucket(per.from, per.to, KEYS[gran]);
  ok(scene.groups.length > 0 && scene.groups.every((g) => exp.has(g.key) || g.key === EXCLUDED), `${gran}: every group has priced days (or is the excluded day)`);
  const bad = scene.groups.filter((g) => {
    const e = exp.get(g.key);
    return consLine(g) !== (e ? expectedLine(e) : `Consommation : 0${NB}kWh`);
  });
  eq(bad.map((g) => g.key), [], `${gran}: every bucket line equals the independent recomputation`);
  // position: title, 3 offers, consommation (the HC/HP share is folded into it: no separate share line)
  ok(scene.groups.every((g) => g.tip.indexOf(consLine(g)) === 4 && !g.tip.some((l) => /^Heures creuses \d+|des kWh/.test(l)) && g.tip.length === 5), `${gran}: line 4 is the merged consumption/share line and ends the weather-off tooltip (5 lines, no separate share line)`);
  ok(scene.groups.every((g) => g.aria.includes(`${consLine(g)}.`) && !g.aria.includes('tt-')), `${gran}: aria-label carries the plain consumption sentence`);
  ok(scene.groups.every((g) => g.tipRich[4].map((s) => s.text).join('') === g.tip[4] && g.tipRich[4].filter((s) => s.cls).every((s) => s.cls === 'tt-kwh') && g.tipRich[4][0].cls === undefined), `${gran}: rich segments concat equals plain, only tt-kwh classes, neutral label`);
  // HC + HP = total (parsed back from the text)
  ok(scene.groups.every((g) => { const m = lineRe.exec(consLine(g)); if (!m) return false; const n = (s) => Number(s.replaceAll(NNB, '')); return !m[2] || (n(m[2]) + n(m[4]) === n(m[1]) && Number(m[3]) + Number(m[5]) === 100); }), `${gran}: HC + HP equals the total and the two percentages sum to 100 in every line`);
  // totals consistent across views
  const sum = [...exp.values()].reduce((s, e) => s + e.total, 0);
  eq(a.kwh.total, sum, `${gran}: analysis total equals the independent sum over the period`);
  eq(a.kwh.hc + a.kwh.hp, a.kwh.total, `${gran}: analysis HC + HP equals its total`);
}

// partial buckets: first month (from 10 Feb) and last month (to 20 Dec) only count days inside the period
{
  const a = analyseFor(period);
  const sc = buildScene(a.offers, ALL, period, 'month', SIZE);
  const first = sc.groups[0], last = sc.groups.at(-1);
  ok(first.partial && last.partial && first.key === '2025-02' && last.key === '2025-12', 'partial first and last month detected');
  const e = expectBucket('2025-02-10', '2025-02-28', KEYS.month).get('2025-02');
  const full = expectBucket('2025-02-01', '2025-02-28', KEYS.month).get('2025-02');
  ok(e.total < full.total && consLine(first) === expectedLine(e), 'partial first month: only the days of the period (10..28 Feb)');
  const el = expectBucket('2025-12-01', '2025-12-20', KEYS.month).get('2025-12');
  eq(consLine(last), expectedLine(el), 'partial last month: only 1..20 Dec');
  // gap/estimated days are included like their costs
  const march = sc.groups.find((g) => g.key === '2025-03');
  eq(consLine(march), expectedLine(expectBucket('2025-03-01', '2025-03-31', KEYS.month).get('2025-03')), 'month containing the estimated (gap) days counts them');
  ok(days.filter((d) => d.estimated).length === 4 && a.estimatedDays === 4, 'the 4 estimated days are inside the period');
  // boundary excluded day: no kWh, same set of days as the costs
  const june = sc.groups.find((g) => g.key === '2025-06');
  eq(consLine(june), expectedLine(expectBucket('2025-06-01', '2025-06-30', KEYS.month).get('2025-06')), 'month with the excluded boundary day counts only its priced days');
  ok(!days.some((d) => d.date === EXCLUDED) && a.excludedDays.includes(EXCLUDED) && a.offers.hchp.days.length === a.pricedDays, 'the excluded day is not priced and not in the energy');
  const dsc = buildScene(analyseFor({ from: '2025-06-05', to: '2025-06-15' }).offers, ALL, { from: '2025-06-05', to: '2025-06-15' }, 'day', SIZE);
  eq(consLine(dsc.groups.find((g) => g.key === EXCLUDED)), `Consommation : 0${NB}kWh`, 'day view: the excluded day shows 0 kWh, like its 0,00 € costs');
  eq(dsc.groups.find((g) => g.key === EXCLUDED).bars.map((b) => b.totalMicro), [0, 0, 0], 'day view: the excluded day costs nothing (same days as the kWh)');
}

// 3 kVA: only Base is priced, yet the tooltip split must equal the recap split (consumption is a data property, not an offer property)
function kva3Block(label, imp3, per3) {
  const a3 = analyse(imp3, per3, 3);
  ok(a3.offers.base.available && !a3.offers.hchp.available && !a3.offers.tempo.available, `${label}: at 3 kVA only Base is priced`);
  ok(a3.rawDays.length === a3.pricedDays && a3.pricedDays > 0, `${label}: Analysis.rawDays are the priced days`);
  for (const gran of ['year', 'month']) {
    const sc = buildScene(a3.offers, ALL, per3, gran, SIZE, undefined, a3.rawDays);
    const tip = sc.groups.map((g) => g.tip.find((l) => l.startsWith('Consommation')));
    ok(tip.every((l) => lineRe.test(l) && /HC .* HP /.test(l)), `${label} ${gran}: every tooltip line carries the HC/HP split at 3 kVA`);
    const sum = (i) => sc.groups.reduce((t, g) => t + Number(lineRe.exec(g.tip.find((l) => l.startsWith('Consommation')))[i].replaceAll(NNB, '')), 0);
    eq([sum(1), sum(2), sum(4)], [a3.kwh.total, a3.kwh.hc, a3.kwh.hp], `${label} ${gran}: tooltip total/HC/HP sum equals the recap's`);
    const rec = K.consumptionText(buildRecap(a3, ['base']).kwh);
    const pc = Math.round((100 * a3.kwh.hc) / (a3.kwh.hc + a3.kwh.hp));
    ok(rec.endsWith(`(HC ${pc}${NB}% / HP ${100 - pc}${NB}%)`), `${label} ${gran}: recap split present too at 3 kVA`);
    // the per-offer fallback has no split for Base alone: the split must come from rawDays, never from an offer
    const fb = buildScene(a3.offers, ALL, per3, gran, SIZE);
    ok(fb.groups.every((g) => !/HC /.test(g.tip.find((l) => l.startsWith('Consommation')))), `${label} ${gran}: offers-only fallback (Base alone) shows no split, so the split above is read from rawDays`);
    // forged raw days (kWh doubled) must show up in the tooltip: proves it reads rawDays, not an offer
    const forged = a3.rawDays.map((d) => ({ ...d, kwh: Object.fromEntries(Object.entries(d.kwh).map(([k, v]) => [k, 2 * v])) }));
    const fsc = buildScene(a3.offers, ALL, per3, gran, SIZE, undefined, forged);
    const ft = (i) => fsc.groups.reduce((t, g) => t + Number(lineRe.exec(g.tip.find((l) => l.startsWith('Consommation')))[i].replaceAll(NNB, '')), 0);
    eq([ft(1), ft(2), ft(4)], [2 * a3.kwh.total, 2 * a3.kwh.hc, 2 * a3.kwh.hp], `${label} ${gran}: tooltip follows the raw days passed in (mutation guard: reading an offer would fail)`);
  }
  const ds = buildScene(a3.offers, ALL, { from: per3.from, to: per3.from }, 'day', SIZE, undefined, a3.rawDays.slice(0, 1));
  ok(ds.groups.length === 1 && /HC .* HP /.test(ds.groups[0].tip[2]), `${label} day: split at 3 kVA`);
}
kva3Block('synthetic', imp, period);

// base-only (no HC/HP data): total only
{
  const a = analyseFor(period);
  const base = { ...a.offers, tempo: { ...a.offers.tempo, available: false, days: [] }, hchp: { ...a.offers.hchp, available: false, days: [] } };
  const sc = buildScene(base, ALL, period, 'month', SIZE);
  const exp = expectBucket(period.from, period.to, KEYS.month);
  ok(sc.groups.every((g) => consLine(g) === `Consommation : ${grp(exp.get(g.key).total)}${NB}kWh` && g.tip.length === 3 && g.tip[1].startsWith('Base : ')), 'base only: title, Base offer, total without HC/HP split (no share line either)');
  ok(sc.groups.every((g) => g.tipRich[2].map((s) => s.text).join('') === g.tip[2]), 'base only: rich line equals plain');
}

// ---- recaps: main recap and view recap ----
{
  const a = analyseFor(period);
  const r = buildRecap(a, ALL);
  const exp = [...expectBucket(period.from, period.to, KEYS.month).values()];
  const tot = exp.reduce((s, e) => s + e.total, 0), hc = exp.reduce((s, e) => s + e.hc, 0), hp = exp.reduce((s, e) => s + e.hp, 0);
  eq([r.kwh.total, r.kwh.hc, r.kwh.hp], [tot, hc, hp], 'main recap carries the independent period total and split');
  const pc = Math.round((100 * hc) / (hc + hp));
  eq(K.consumptionText(r.kwh), `${grp(tot)}${NB}kWh (HC ${pc}${NB}% / HP ${100 - pc}${NB}%)`, 'recap text: total and HC/HP percentages');
  eq(buildRecap(a, []).kwh.total, tot, 'recap consumption does not depend on the offer selection');
  eq(K.consumptionText({ total: 12, hc: 0, hp: 0 }), `12${NB}kWh`, 'recap text without HC/HP data: total only');
  const sc = buildScene(a.offers, ALL, period, 'month', SIZE);
  eq(sc.groups.reduce((s, g) => s + Number(/^Consommation : ([\d ]+)/.exec(consLine(g))[1].replaceAll(NNB, '')), 0), tot, 'period total = sum of the month totals shown in the tooltips');
  // view recap for period / year / month views
  for (const v of [{ kind: 'period', gran: 'month' }, { kind: 'year', year: '2025' }, { kind: 'year', year: '2024' }, { kind: 'month', month: '2025-03' }, { kind: 'month', month: '2026-02' }]) {
    const range = V.viewRange(v, priced, period);
    const an = v.kind === 'period' ? a : analyseFor(range);
    const vr = viewRecap(v, an, ALL);
    const e = [...expectBucket(range.from, range.to, KEYS.day).values()];
    const t = e.reduce((s, x) => s + x.total, 0), h = e.reduce((s, x) => s + x.hc, 0), p = e.reduce((s, x) => s + x.hp, 0);
    eq(vr.kwhText, `Consommation : ${grp(t)}${NB}kWh (HC ${Math.round((100 * h) / (h + p))}${NB}% / HP ${100 - Math.round((100 * h) / (h + p))}${NB}%)`, `view recap ${JSON.stringify(v)}: text`);
    ok(vr.summary.includes(vr.kwhText) && vr.kwh.total === t, `view recap ${JSON.stringify(v)}: summary sentence includes it`);
  }
  // year view total = sum of its months' tooltip lines
  const yr = V.viewRange({ kind: 'year', year: '2025' }, priced, period);
  const ysc = buildScene(analyseFor(yr).offers, ALL, yr, 'month', SIZE);
  const msum = ysc.groups.reduce((s, g) => s + Number(/^Consommation : ([\d ]+)/.exec(consLine(g))[1].replaceAll(NNB, '')), 0);
  eq(viewRecap({ kind: 'year', year: '2025' }, analyseFor(yr), ALL).kwh.total, msum, 'year view recap = sum of its month tooltips');
}

// ---- weather-off regression and weather slot ----
{
  const a = analyseFor({ from: '2025-04-01', to: '2025-04-30' });
  const per = { from: '2025-04-01', to: '2025-04-30' };
  const off = buildScene(a.offers, ALL, per, 'day', SIZE);
  ok(JSON.stringify(off) === JSON.stringify(buildScene(a.offers, ALL, per, 'day', SIZE, null)), 'weather off: identical scene for undefined and null');
  ok(off.weather === null && off.groups.every((g) => g.glyph === null && g.tip.length === 5 && !g.aria.includes('Température')), 'weather off: only the consumption line was added (share folded into it)');
  const wx = days.filter((d) => d.date >= per.from && d.date <= per.to).map((d, i) => ({ date: d.date, mean: 10, min: 7, max: 14, code: 3, windKmh: 10, windDeg: 90 + i }));
  for (const gran of ['year', 'month', 'day']) {
    const p2 = gran === 'day' ? per : period;
    const an = analyseFor(p2);
    const w = gran === 'day' ? wx : days.filter((d) => d.date >= p2.from && d.date <= p2.to).map((d) => ({ date: d.date, mean: 10, min: 7, max: 14, code: null, windKmh: 5, windDeg: 0 }));
    const sOff = buildScene(an.offers, ALL, p2, gran, SIZE), sOn = buildScene(an.offers, ALL, p2, gran, SIZE, w);
    ok(sOn.groups.every((g, i) => JSON.stringify(g.tip.slice(0, 5)) === JSON.stringify(sOff.groups[i].tip) && g.tip[4].startsWith('Consommation') && /^Température : /.test(g.tip.at(-3)) && /^Vent : /.test(g.tip.at(-2)) && /^Précipitations : /.test(g.tip.at(-1))
      && (gran !== 'day' || g.tip[5].startsWith('Météo : ')) && g.tip.length === (gran === 'day' ? 9 : 8)), `${gran} with weather: consumption right after the offer lines and before Météo/Température/Vent`);
    ok(sOn.groups.every((g) => g.tipRich.length === g.tip.length && g.tipRich.every((s, i) => s.map((x) => x.text).join('') === g.tip[i])), `${gran} with weather: tipRich invariant`);
  }
}

// ---- DOM layer sources, CSS, width logic ----
{
  const svg = readFileSync('src/ui/svg.ts', 'utf8'), css = readFileSync('src/app.css', 'utf8');
  const lines = Number(/MAX_TIP_LINES = (\d+)/.exec(svg)[1]);
  ok(lines >= 9, `MAX_TIP_LINES (${lines}) covers the 9-line day tooltip`);
  ok(/\.tip-text \.tt-kwh\s*\{\s*font-weight: 700; \}/.test(css), 'CSS: tt-kwh is bold and inherits the tooltip text colour (no new colour token)');
  const a = analyseFor({ from: '2024-01-01', to: '2025-12-31' });
  const sc = buildScene(a.offers, ALL, { from: '2024-09-10', to: '2025-12-20' }, 'year', SIZE);
  const longest = Math.max(...sc.groups.flatMap((g) => g.tip.map((l) => l.length)));
  ok(longest * 6.3 + 16 < SIZE.width / 2, `longest tooltip line (${longest} chars) fits the tooltip width logic`);
  const ui = readFileSync('src/ui/recap.ts', 'utf8') + readFileSync('src/ui/chart.ts', 'utf8');
  ok(/Consommation sur la période : \$\{consumptionText/.test(ui) && /vrKwh\.textContent = rec\.kwhText/.test(ui), 'DOM layer renders the recap line and the view recap line (textContent)');
}

// ---- demo export: independent computation from the raw CSV text ----
function demoBlock() {
  const f = demoCsv('index');
  if (!f) { console.log('skip: set TEMPO_DEMO_DATA=1'); return; }
  const text = new TextDecoder('latin1').decode(readFileSync(f));
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => /^Date de relev/.test(l));
  const head = lines[hi].split(';');
  const rows = [];
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim()) continue;
    const c = l.split(';');
    const date = `${c[0].slice(6, 10)}-${c[0].slice(3, 5)}-${c[0].slice(0, 2)}`;
    const v = {};
    for (let i = 2; i < head.length; i++) if (c[i] !== undefined && c[i] !== '') v[i] = Number(c[i]);
    rows.push({ date, v });
  }
  rows.sort((x, y) => (x.date < y.date ? -1 : 1));
  let total = 0, hc = 0, hp = 0;
  for (let i = 0; i + 1 < rows.length; i++) {
    const A = rows[i], B = rows[i + 1];
    if (Object.keys(A.v).join() !== Object.keys(B.v).join()) continue; // contract change: boundary days excluded
    for (const k of Object.keys(A.v)) {
      const d = B.v[k] - A.v[k];
      total += d;
      if (/creuses/i.test(head[k])) hc += d; else hp += d;
    }
  }
  const dImp = parseIndexCsv(readFileSync(f));
  const full = { from: dImp.days[0].date, to: dImp.days.at(-1).date };
  const a = analyse(dImp, full, 9);
  eq([a.kwh.total, a.kwh.hc, a.kwh.hp], [total, hc, hp], 'demo: whole-period total and HC/HP equal the independent CSV computation');
  ok(total > 0 && a.excludedDays.length > 0, 'demo: non-trivial total and excluded boundary days');
  kva3Block('demo', dImp, full);
  const sc = buildScene(a.offers, ALL, full, 'month', SIZE);
  eq(sc.groups.reduce((s, g) => s + Number(/^Consommation : ([\d ]+)/.exec(consLine(g))[1].replaceAll(NNB, '')), 0), total, 'demo: sum of month tooltips equals the CSV total');
  const yr = buildScene(a.offers, ALL, full, 'year', SIZE);
  eq(yr.groups.reduce((s, g) => s + Number(/^Consommation : ([\d ]+)/.exec(consLine(g))[1].replaceAll(NNB, '')), 0), total, 'demo: sum of year tooltips equals the CSV total');
}

// ---- time-zone independence: child processes with other TZ print the same signature ----
const sig = () => {
  const a = analyseFor(period);
  const s = [];
  for (const gran of ['year', 'month', 'day']) s.push(buildScene(analyseFor(rangeOf[gran]).offers, ALL, rangeOf[gran], gran, SIZE).groups.map((g) => g.tip[4] + g.aria.length));
  s.push(K.consumptionText(buildRecap(a, ALL).kwh), viewRecap({ kind: 'month', month: '2025-03' }, analyseFor(V.viewRange({ kind: 'month', month: '2025-03' }, priced, period)), ALL).kwhText);
  return JSON.stringify(s);
};
if (!process.env.TEMPO_KWH_CHILD) {
  demoBlock();
  const mine = sig();
  for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'UTC']) {
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { env: { ...process.env, TZ: tz, TEMPO_KWH_CHILD: '1', TEMPO_DEMO_DATA: '' }, encoding: 'utf8' });
    ok(r.status === 0, `TZ=${tz}: whole check passes`);
    ok((r.stdout.split('\n').find((l) => l.startsWith('SIG ')) || '').slice(4) === mine, `TZ=${tz}: consumption lines and recap strings identical`);
  }
} else console.log('SIG ' + sig());
process.exitCode = failures ? 1 : 0;
