// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-3 [AC-8, AC-9, FR-014..FR-017]: pure chart scene, synthetic data (+ demo CSV when TEMPO_DEMO_DATA is set).
import { existsSync, readFileSync } from 'node:fs';
import { demoCsv } from './data-paths.mjs';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(g === w, `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const { buildScene, niceTicks, barLabel, LABEL_FONT } = await import('../.build-test/core/scene.mjs');
const { priceOffers } = await import('../.build-test/core/pricing.mjs');
const { analyse } = await import('../.build-test/core/recap.mjs');
const { buildLegend } = await import('../.build-test/core/legend.mjs');
const V = await import('../.build-test/core/view.mjs');
const { tempoColourOf } = await import('../.build-test/data/tempo-calendar.mjs');

const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const SIZE = { width: 960, height: 420 };
const ALL = ['tempo', 'hchp', 'base'];

// synthetic: 365 days starting mid-month: 365 days of HC/HP days (hc 4, hp 6 kWh)
const mk = (from, n, kind = 'hchp') => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = iso(num(from) + i);
    out.push(kind === 'hchp'
      ? { date, kind, kwh: { hc: 4, hp: 6 }, estimated: false }
      : { date, kind, kwh: { bleuHC: 4, bleuHP: 6 }, estimated: false });
  }
  return out;
};
const days = mk('2025-03-15', 365);
const period = { from: days[0].date, to: days[364].date };
const offers = priceOffers(days, 9);

let sc = buildScene(offers, ALL, period, 'month', SIZE);
eq(sc.groups.length, 13, 'month granularity over 365 days: 13 groups');
ok(sc.groups.every((g) => g.bars.length === 3), 'each group has 3 bars');
ok(sc.groups[0].partial && sc.groups[12].partial && !sc.groups[5].partial, 'first/last month partial, middle not');
ok(sc.groups[0].label.includes('partielle') && sc.groups[0].axisLabel.endsWith('*'), 'partial month labelled');
eq(sc.granularity, 'month', 'effective granularity month');
ok(sc.groups.every((g) => g.ratio && g.ratio.hcShare === 40 && g.ratio.hpShare === 60), 'ratio strip 40/60 each group');
ok(sc.groups.every((g) => Math.abs(g.ratio.hcW - g.ratio.w * 0.4) < 1e-6), 'ratio strip widths');

// stack order: sub first (bottom = largest y), then energy; Tempo red day carries colour R
const tempoBar = sc.groups[3].bars.find((b) => b.offer === 'tempo');
eq(tempoBar.segments[0].id, 'sub', 'tempo stack starts with subscription');
ok(tempoBar.segments[0].tone === 'SUB', 'subscription neutral tone');
const ids = tempoBar.segments.map((s) => s.id);
const rank = ['sub', 'B-HC', 'B-HP', 'W-HC', 'W-HP', 'R-HC', 'R-HP', 'U-HC', 'U-HP'];
ok(ids.every((id, i) => i === 0 || rank.indexOf(ids[i - 1]) < rank.indexOf(id)), `tempo segment order ${ids.join(',')}`);
ok(tempoBar.segments.every((s, i, a) => i === 0 || Math.abs(s.y + s.h - a[i - 1].y) < 1e-6), 'segments contiguous bottom to top');
const hchpBar = sc.groups[3].bars.find((b) => b.offer === 'hchp');
eq(hchpBar.segments.map((s) => s.id).join(','), 'sub,H-HC,H-HP', 'hchp stack sub, HC, HP');
const baseBar = sc.groups[3].bars.find((b) => b.offer === 'base');
eq(baseBar.segments.map((s) => s.id).join(','), 'sub,base', 'base stack sub, base');
ok(sc.groups.every((g) => g.bars.every((b) => b.segments.reduce((a, s) => a + s.micro, 0) === b.totalMicro)), 'segments sum to bar total');
ok(sc.groups.every((g) => g.bars.every((b) => b.x >= g.x && b.x + b.w <= g.x + g.w + 1e-6)), 'bars inside their group cell');

// a red day (Tempo-era synthetic: rougeHP kWh) is split by colour
const mixed = [
  { date: '2026-01-10', kind: 'tempo', kwh: { bleuHC: 2, bleuHP: 3, rougeHC: 1, rougeHP: 4 }, estimated: false },
  { date: '2026-01-11', kind: 'tempo', kwh: { blancHC: 2, blancHP: 3 }, estimated: false },
];
const mo = priceOffers(mixed, 9);
const msc = buildScene(mo, ['tempo'], { from: '2026-01-10', to: '2026-01-11' }, 'month', SIZE);
const mt = msc.groups[0].bars[0];
eq(mt.segments.map((s) => s.id).join(','), 'sub,B-HC,B-HP,W-HC,W-HP,R-HC,R-HP', 'mixed-colour month split by colour');
ok(mt.segments.find((s) => s.id === 'R-HP').colour === 'R' && mt.segments.find((s) => s.id === 'B-HP').colour === 'B', 'colour keys on segments');
{
  const r = msc.groups[0].ratio;
  eq(r.hcKwh, 5, 'tempo-era ratio: sum of *HC kWh');
  eq(r.hpKwh, 10, 'tempo-era ratio: sum of *HP kWh');
  eq(r.hcShare, 33, 'tempo-era HC share 33 %');
}
// HC/HP-period red calendar day -> Tempo segment red
let redDay = null;
for (let n = num('2026-01-01'); n < num('2026-04-01') && !redDay; n++) if (tempoColourOf(iso(n)) === 'R') redDay = iso(n);
ok(redDay !== null, `calendar has a red day (${redDay})`);
const rd = priceOffers([{ date: redDay, kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false }], 9);
const rsc = buildScene(rd, ALL, { from: redDay, to: redDay }, 'day', SIZE);
const rt = rsc.groups[0].bars.find((b) => b.offer === 'tempo');
ok(rt.segments.some((s) => s.colour === 'R' && s.tone === 'HP') && rt.segments.some((s) => s.colour === 'R' && s.tone === 'HC'), 'red calendar day: Tempo HC and HP segments carry colour R');
ok(rt.aria.includes('estimée'), 'estimate mentioned in aria-label');

// unknown colour (estimate, colour null) -> grey
const fake = {
  tempo: { offer: 'tempo', available: true, reason: '', totalMicro: 1000, calendarEstimateDays: 1, days: [
    { date: '2026-02-01', totalMicro: 1000, subMicro: 400, energyMicro: { hc: 200, hp: 400 }, kwh: { hc: 1, hp: 2 }, estimate: true, colour: null, gapEstimated: false }] },
  hchp: { offer: 'hchp', available: false, reason: 'x', totalMicro: 0, days: [], calendarEstimateDays: 0 },
  base: { offer: 'base', available: false, reason: 'y', totalMicro: 0, days: [], calendarEstimateDays: 0 },
};
const fsc = buildScene(fake, ALL, { from: '2026-02-01', to: '2026-02-01' }, 'month', SIZE);
eq(fsc.groups[0].bars[0].segments.map((s) => s.id).join(','), 'sub,U-HC,U-HP', 'unknown colour -> grey segments');

// unavailable offer: no bars, legend note
const un = { ...offers, tempo: { ...offers.tempo, available: false, reason: 'Couleur Tempo inconnue.', days: [], totalMicro: 0 } };
sc = buildScene(un, ALL, period, 'month', SIZE);
ok(sc.groups.every((g) => g.bars.length === 2 && !g.bars.some((b) => b.offer === 'tempo')), 'unavailable offer produces no bars');
ok(sc.notes.some((n) => n.includes('Tempo') && n.includes('indisponible')), 'unavailable offer noted');
sc = buildScene(un, ['tempo'], period, 'month', SIZE);
ok(sc.empty !== '' && sc.groups.length === 0, 'only unavailable offers selected: empty scene with message');
sc = buildScene(offers, [], period, 'month', SIZE);
ok(sc.empty.includes('offre'), 'no offer selected: empty message');

// year granularity
sc = buildScene(offers, ALL, period, 'year', SIZE);
eq(sc.groups.length, 2, 'year granularity: 2 groups (2025, 2026)');
ok(sc.groups.every((g) => g.partial), 'both years partial');
ok(sc.groups.every((g) => g.bars.length === 3), 'year: 3 bars each');

// day granularity and the 400-day rule
sc = buildScene(offers, ALL, period, 'day', SIZE);
eq(sc.granularity, 'day', 'day allowed at 365 days');
eq(sc.groups.length, 365, 'day: 365 groups');
const d400 = mk('2025-01-01', 400);
const p400 = { from: d400[0].date, to: d400[399].date };
sc = buildScene(priceOffers(d400, 9), ALL, p400, 'day', SIZE);
ok(sc.dayAllowed && sc.granularity === 'day', 'day allowed at exactly 400 days');
const d401 = mk('2025-01-01', 401);
const p401 = { from: d401[0].date, to: d401[400].date };
sc = buildScene(priceOffers(d401, 9), ALL, p401, 'day', SIZE);
ok(!sc.dayAllowed && sc.granularity === 'month', 'day disabled at 401 days, month used');
ok(/jour/.test(sc.dayMessage) && /400/.test(sc.dayMessage), 'French explanatory message');

// axis
const t = niceTicks(173.4);
ok(t[0] === 0 && t[t.length - 1] >= 173.4 && t.length >= 3 && t.length <= 8, `nice ticks ${t.join(',')}`);
sc = buildScene(offers, ALL, period, 'month', SIZE);
ok(sc.ticks.every((k) => k.label.endsWith('€')) && sc.ticks.length === t.length || sc.ticks.length > 2, 'ticks labelled in euros');
ok(sc.groups.every((g) => g.bars.every((b) => b.y >= sc.plot.y - 1e-6)), 'bars stay within the plot');

// French aria with euros
const g = sc.groups[3];
ok(/€/.test(g.aria) && /Consommation : [\d\u202f]+\u00a0kWh \(HC [\d\u202f]+\u00a0kWh, \d+\u00a0% · HP [\d\u202f]+\u00a0kWh, \d+\u00a0%\)/.test(g.aria) && !/des kWh/.test(g.aria) && !g.tip.some((l) => /^Heures creuses \d+/.test(l)), `group aria French with euros and the merged consumption/share sentence (no separate share line): ${g.aria}`);
ok(g.bars.every((b) => /€/.test(b.aria) && /total/.test(b.aria)), 'bar aria contains euros');
ok(g.bars.some((b) => b.aria.startsWith('Heures creuses / Heures pleines')) && g.bars.some((b) => b.aria.startsWith('Tempo')), 'aria names the offer');
ok(/Graphique en barres/.test(sc.summary) && /€/.test(sc.summary), 'summary French with euros');


// ---- FR-025 drill-down targets and view ranges (synthetic: 2025-03-15 .. 2026-03-14) ----
const priced = { from: days[0].date, to: days[364].date };
sc = buildScene(offers, ALL, period, 'year', SIZE);
ok(sc.groups.every((x, i) => x.drill && x.drill.kind === 'year' && x.drill.year === ['2025', '2026'][i]), 'year groups drill to the month view of their year');
ok(sc.groups.every((x) => x.aria.includes('Entrée pour détailler')), 'year group aria carries the drill hint');
sc = buildScene(offers, ALL, period, 'month', SIZE);
ok(sc.groups.every((x) => x.drill && x.drill.kind === 'month' && x.drill.month === x.key), 'month groups drill to the day view of their month');
ok(sc.groups.every((x) => x.aria.includes('Entrée pour détailler')), 'month group aria carries the drill hint');
sc = buildScene(offers, ALL, period, 'day', SIZE);
ok(sc.groups.every((x) => x.drill === null && !x.aria.includes('détailler')), 'day groups are not clickable');
const subPeriod = { from: '2025-06-01', to: '2025-06-30' };
eq(JSON.stringify(V.viewRange({ kind: 'period', gran: 'month' }, priced, subPeriod)), JSON.stringify(subPeriod), 'period view = selected period');
eq(JSON.stringify(V.viewRange({ kind: 'year', year: '2025' }, priced, subPeriod)), JSON.stringify({ from: '2025-03-15', to: '2025-12-31' }), 'year view = calendar year clamped to the priced range, not the period');
eq(JSON.stringify(V.viewRange({ kind: 'year', year: '2026' }, priced, subPeriod)), JSON.stringify({ from: '2026-01-01', to: '2026-03-14' }), 'year view upper clamp');
eq(JSON.stringify(V.viewRange({ kind: 'month', month: '2025-11' }, priced, subPeriod)), JSON.stringify({ from: '2025-11-01', to: '2025-11-30' }), 'month view = calendar month');
eq(JSON.stringify(V.viewRange({ kind: 'month', month: '2025-03' }, priced, subPeriod)), JSON.stringify({ from: '2025-03-15', to: '2025-03-31' }), 'month view clamped to priced range');
eq(V.viewRange({ kind: 'year', year: '2019' }, priced, subPeriod), null, 'year outside the data: no range');
eq(V.viewGranularity({ kind: 'year', year: '2025' }), 'month', 'year view draws months');
eq(V.viewGranularity({ kind: 'month', month: '2025-11' }), 'day', 'month view draws days');
eq(V.viewBack({ kind: 'month', month: '2025-11' }).year, '2025', 'Retour from a day view goes to the month view of its year');
eq(V.viewBack({ kind: 'year', year: '2025' }).kind, 'period', 'Retour from a month view goes back to the period-based view');
eq(V.viewTitle({ kind: 'year', year: '2025' }, period), 'Vue : 2025', 'view title (year)');
eq(V.viewTitle({ kind: 'month', month: '2025-11' }, period), 'Vue : novembre 2025', 'view title (month)');
ok(V.viewTitle({ kind: 'period', gran: 'month' }, period).includes('période sélectionnée'), 'view title (period)');
// drill range is independent of the selected period: a December month view of a 1-month period still has 31 day groups
{
  const dec = V.viewRange({ kind: 'month', month: '2025-12' }, priced, subPeriod);
  const a = analyse({ days, excluded: [] }, dec, 9);
  const dsc = buildScene(a.offers, ALL, dec, V.viewGranularity({ kind: 'month', month: '2025-12' }), SIZE);
  eq(dsc.groups.length, 31, 'drill-down day view: 31 days of the chosen month');
  const y = V.viewRange({ kind: 'year', year: '2025' }, priced, subPeriod);
  const ysc = buildScene(analyse({ days, excluded: [] }, y, 9).offers, ALL, y, 'month', SIZE);
  eq(ysc.groups.length, 10, 'drill-down month view: Mar..Dec 2025 (10 months)');
}

// ---- FR-026 "Aller à": options depend on the current view ----
{
  const labels = (m) => m.options.map((o) => o.label).join(',');
  // period-based views (any granularity): years only
  for (const gran of ['year', 'month', 'day']) {
    const m = V.gotoModel({ kind: 'period', gran }, priced);
    eq(labels(m), '2025,2026', `period/${gran} view: only the imported years`);
    eq(m.placeholder.label, 'Choisir une année…', `period/${gran} view: year placeholder`);
    eq(m.selected, '', `period/${gran} view: nothing selected`);
    ok(m.options.every((o) => /^y:\d{4}$/.test(o.value)), `period/${gran} view: year values only`);
  }
  // month view of a year: that year's imported months only
  const y25 = V.gotoModel({ kind: 'year', year: '2025' }, priced);
  eq(y25.options.length, 10, '2025 month view: Mar..Dec 2025 only (10 months)');
  eq(y25.options[0].label, 'mars 2025', 'first month of 2025 is mars 2025 (French label)');
  eq(y25.options[9].label, 'décembre 2025', 'last month of 2025');
  ok(y25.options.every((o) => /^m:2025-/.test(o.value)), '2025 month view: no month of another year');
  eq(y25.placeholder.label, 'Choisir un mois…', '2025 month view: month placeholder');
  eq(y25.selected, '', '2025 month view: nothing selected');
  const y26 = V.gotoModel({ kind: 'year', year: '2026' }, priced);
  eq(y26.options.map((o) => o.label).join(','), 'janvier 2026,février 2026,mars 2026', '2026 month view: imported months of 2026 only');
  // day view of a month: months of its year, current month selected, no placeholder
  const d = V.gotoModel({ kind: 'month', month: '2025-11' }, priced);
  eq(d.options.length, 10, 'day view of nov. 2025: months of 2025');
  eq(d.selected, 'm:2025-11', 'day view: current month selected');
  eq(d.placeholder, null, 'day view: no placeholder');
  // values: unique and round-trip to views
  const all = [...V.gotoModel({ kind: 'period', gran: 'year' }, priced).options, ...y25.options, ...y26.options];
  ok(all.every((o) => V.parseGotoValue(o.value) !== null), 'every option value maps to a view');
  eq(V.parseGotoValue('y:2025').kind, 'year', 'y: value -> month view of the year');
  eq(V.parseGotoValue('m:2025-11').kind, 'month', 'm: value -> day view of the month');
  eq(V.parseGotoValue(''), null, 'placeholder value maps to nothing');
  eq(V.parseGotoValue('period'), null, 'old period value no longer a destination');
  eq(V.parseGotoValue('m:2025-13'), null, 'malformed value rejected');
}

// ---- FR-027 no readout line: tooltip lines still exist, aria labels kept ----
ok(buildScene(offers, ALL, period, 'month', SIZE).groups.every((x) => x.tip.length >= 4 && x.aria.length > 20), 'tooltip lines and aria-labels present for every group');

// ---- FR-028 bar labels: full / short / none by width ----
{
  eq(barLabel('tempo', 80).text, 'Tempo', 'wide bar: Tempo (full)');
  eq(barLabel('hchp', 80).text, 'HC/HP', 'wide bar: HC/HP (full)');
  eq(barLabel('base', 80).text, 'Base', 'wide bar: Base (full)');
  eq(barLabel('tempo', 80).mode, 'full', 'mode full');
  const need = (t) => t.length * LABEL_FONT * 0.62;
  ok(barLabel('tempo', need('Tempo') - 1).mode !== 'full', 'bar narrower than the estimated text width: not full');
  ok(barLabel('tempo', need('Tempo') + 6).mode === 'full', 'bar just wide enough: full');
  eq(barLabel('tempo', 16).text, 'T', 'narrow bar: T');
  eq(barLabel('hchp', 16).text, 'H', 'narrow bar: H');
  eq(barLabel('base', 16).text, 'B', 'narrow bar: B');
  eq(barLabel('base', 16).mode, 'short', 'mode short');
  eq(barLabel('base', 5).mode, 'none', 'tiny bar: nothing');
  eq(barLabel('base', 5).text, '', 'tiny bar: empty text');
  // labels never exceed their bar width, so neighbours cannot overlap
  for (const g of ['year', 'month', 'day']) {
    const s2 = buildScene(offers, ALL, period, g, SIZE);
    ok(s2.groups.every((x) => x.bars.every((b) => b.label.mode === 'none' || b.label.text.length * LABEL_FONT * 0.62 <= b.w)), `${g}: labels fit inside their bar width`);
  }
  ok(buildScene(offers, ALL, period, 'year', SIZE).groups[0].bars.every((b) => b.label.mode === 'full'), 'year view (wide bars): full labels');
  ok(buildScene(offers, ALL, period, 'month', SIZE).groups[3].bars.every((b) => b.label.mode === 'short'), 'month view (narrow bars): one-letter labels');
}

// ---- FR-029 legend model (pure data) ----
{
  const opt = { hatchHP: true, unknownColour: false, ratio: true };
  const L = buildLegend(['tempo', 'hchp', 'base'], offers, opt);
  eq(L.map((b) => b.id).join(','), 'tempo,hchp,base,ratio', 'one block per selected offer in bar order, then ratio block');
  eq(L[0].entries.map((e) => e.label).join(' / '), 'Abonnement / Bleu heures creuses / Bleu heures pleines / Blanc heures creuses / Blanc heures pleines / Rouge heures creuses / Rouge heures pleines', 'Tempo block entries');
  eq(L[1].entries.map((e) => e.label).join(' / '), 'Abonnement / Heures creuses / Heures pleines', 'HC/HP block entries');
  eq(L[2].entries.map((e) => e.label).join(' / '), 'Abonnement / Énergie', 'Base block entries');
  eq(L.slice(0, 3).map((b) => b.tag).join(''), 'THB', 'block tags T/H/B');
  ok(L.slice(0, 3).every((b) => b.title.length > 0), 'blocks have headings');
  eq(L[3].title, 'Répartition des kWh', 'ratio block title');
  eq(L[3].entries.map((e) => e.label).join(' / '), 'Heures creuses / Heures pleines', 'ratio block entries');
  ok(L[0].entries.filter((e) => e.hatch).map((e) => e.id).join() === 'B-HP,W-HP,R-HP', 'HP swatches carry the hatch overlay');
  ok(L[0].entries.every((e) => e.cls === `seg-${e.id}`), 'swatch classes match the bar segment classes');
  ok(!L[0].entries.some((e) => e.dots), 'no unknown-colour swatch unless such segments exist');
  const noHatch = buildLegend(['tempo'], offers, { ...opt, hatchHP: false, ratio: false });
  eq(noHatch.length, 1, 'only selected offers: one block');
  ok(noHatch[0].entries.every((e) => !e.hatch), 'day view: no hatch on swatches');
  const unk = buildLegend(['tempo'], offers, { ...opt, unknownColour: true });
  ok(unk[0].entries.some((e) => e.id === 'U-HC' && e.dots) && unk[0].entries.some((e) => e.id === 'U-HP' && e.dots && e.hatch), 'unknown-colour grey swatches with dots when present');
  const sub = buildLegend(['base', 'tempo'], offers, { ...opt, ratio: false });
  eq(sub.map((b) => b.id).join(','), 'tempo,base', 'blocks follow the offer order, not the selection order');
  const unavail = buildLegend(['tempo', 'base'], { ...offers, tempo: { ...offers.tempo, available: false, reason: 'Couleur Tempo inconnue.' } }, { ...opt, ratio: false });
  ok(unavail[0].entries.length === 0 && unavail[0].note.includes('Couleur Tempo inconnue') && unavail[1].entries.length === 2, 'unavailable offer keeps its note inside its block');
  // scene integration
  const s3 = buildScene(offers, ['tempo', 'base'], period, 'month', SIZE);
  eq(s3.legend.map((b) => b.id).join(','), 'tempo,base,ratio', 'scene legend: selected offers + ratio');
  ok(s3.legend[0].entries.some((e) => e.hatch), 'month scene legend: hatch on HP');
  ok(!buildScene(offers, ALL, period, 'day', SIZE).legend[0].entries.some((e) => e.hatch), 'day scene legend: no hatch');
  const fs2 = buildScene(fake, ALL, { from: '2026-02-01', to: '2026-02-01' }, 'month', SIZE);
  ok(fs2.legend[0].entries.some((e) => e.id === 'U-HC'), 'scene with unknown-colour segments lists the grey swatch');
  ok(!s3.legend[0].entries.some((e) => e.id === 'U-HC'), 'scene without unknown colour: no grey swatch');
}

// opt-in demo data (committed synthetic files, TEMPO_DEMO_DATA=1)
const csv = demoCsv('index');
if (csv && existsSync(csv)) {
  const { parseIndexCsv } = await import('../.build-test/core/csv.mjs');
  const { defaultPeriod } = await import('../.build-test/core/period.mjs');
  const imp = parseIndexCsv(new Uint8Array(readFileSync(csv)));
  const p = defaultPeriod(imp.days);
  const a = analyse(imp, p, 9);
  const rs = buildScene(a.offers, ALL, p, 'month', SIZE);
  ok(rs.groups.length >= 12 && rs.groups.length <= 13, `demo default period: 12..13 month groups (${rs.groups.length})`);
  // independent count of distinct calendar months in the default period
  const months = new Set(imp.days.filter((x) => x.date >= p.from && x.date <= p.to).map((x) => x.date.slice(0, 7)));
  ok(rs.groups.length === months.size && months.size === 13, `demo default period: one group per calendar month (${months.size} months)`);
} else console.log('skip: set TEMPO_DEMO_DATA=1');

// month axis labels must never overlap: thinned when groups are narrow (3 years in a 1200-unit chart)
{
  const long = mk('2023-11-10', 1100);
  const lp = { from: long[0].date, to: long[1099].date };
  for (const width of [1200, 960, 520]) {
    const ls = buildScene(priceOffers(long, 9), ALL, lp, 'month', { width, height: 420 });
    const shown = ls.groups.filter((g) => g.axisLabel);
    const minGap = Math.min(...shown.slice(1).map((g, i) => g.cx - shown[i].cx));
    ok(ls.groups.length > 30 && shown.length >= 2 && minGap >= 38, `month labels do not overlap at width ${width} (${shown.length}/${ls.groups.length} shown, min gap ${Math.round(minGap)})`);
    ok(ls.groups[0].axisLabel !== '' && ls.groups[0].axisSub !== '', `first month and its year stay labelled at width ${width}`);
  }
  const few = buildScene(offers, ALL, period, 'month', SIZE);
  ok(few.groups.every((g) => g.axisLabel), 'few months: every label shown');
}

// day axis: day numbers + month captions, never overlapping (30 days up to the longest allowed period)
{
  for (const n of [14, 30, 90, 200, 400]) {
    const dd = mk('2025-11-10', n);
    const dp = { from: dd[0].date, to: dd[n - 1].date };
    for (const width of [1200, 960, 520]) {
      const ds = buildScene(priceOffers(dd, 9), ALL, dp, 'day', { width, height: 420 });
      if (ds.granularity !== 'day') continue;
      const nums = ds.groups.filter((g) => g.axisLabel);
      const caps = ds.groups.filter((g) => g.axisSub);
      const gap = (a) => Math.min(...a.slice(1).map((g, i) => g.cx - a[i].cx));
      ok(nums.length >= 1 && (nums.length < 2 || gap(nums) >= 20), `day numbers do not overlap (${n} days, width ${width}: ${nums.length} shown, min gap ${nums.length > 1 ? Math.round(gap(nums)) : '-'})`);
      const need = (a, b) => ((a.axisSub.length + b.axisSub.length) * 6.4) / 2;
      ok(caps.slice(1).every((g, i) => g.cx - caps[i].cx >= need(caps[i], g)), `month captions do not overlap (${n} days, width ${width}: ${caps.length} shown)`);
      ok(ds.groups[0].axisSub !== '' || n >= 90, `view start is captioned when there is room (${n} days, width ${width})`);
      ok(ds.groups.every((g) => !g.axisLabel || /^\d{1,2}$/.test(g.axisLabel)), 'day labels are plain day numbers');
    }
  }
  const d14 = buildScene(priceOffers(mk('2025-11-10', 14), 9), ALL, { from: '2025-11-10', to: '2025-11-23' }, 'day', SIZE);
  ok(d14.groups.every((g) => g.axisLabel), '14 days: every day numbered');
  ok(d14.groups[0].axisSub === 'nov. 2025', `14 days: caption "${d14.groups[0].axisSub}"`);
}

process.exit(failures ? 1 : 0);
