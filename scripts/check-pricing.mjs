// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-2 [AC-3, AC-4, AC-5, AC-6, AC-7, AC-14, EC-16/17/25]: exit 0 pass, 1 assertion failed, >=2 error.
import { existsSync, readFileSync } from 'node:fs';
import { buildFixtures } from './gen-fixtures.mjs';
import { demoCsv } from './data-paths.mjs';

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) { failures++; console.error('FAIL: ' + msg); } else console.log('ok: ' + msg);
};
const eq = (got, want, msg) => ok(got === want, `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);

const day = (date, kind, kwh, estimated = false) => ({ date, kind, kwh, estimated });
const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);

try {
  const { priceOffers } = await import('../.build-test/core/pricing.mjs');
  const { defaultPeriod, resolvePeriod } = await import('../.build-test/core/period.mjs');
  const { analyse, buildRecap } = await import('../.build-test/core/recap.mjs');
  const { parsePeakCsv, detectFileKind } = await import('../.build-test/core/peak.mjs');
  const { newSession, ingestFile, chooseKva } = await import('../.build-test/core/session.mjs');
  const { assumptionLines, ESTIMATE_NOTICE, CALENDAR_CREDIT } = await import('../.build-test/core/assumptions.mjs');
  const { tempoColourOf } = await import('../.build-test/data/tempo-calendar.mjs');
  const { formatEuro } = await import('../.build-test/core/format.mjs');

  // ---- hand-computed reference days at 9 kVA (grid numbers from the PDFs, micro-euro) ----
  // 20260201: base 192700/kWh sub 19560000 | hchp hp 206500 hc 157900 sub 19560000
  //           tempo sub 19380000 bleu HC 132500 HP 161200, blanc HC 149900 HP 187100, rouge HC 157500 HP 706000
  // 20260801: base 198500 sub 19880000 | hchp hp 214200 hc 158900 sub 19880000
  //           tempo sub 19700000 bleu HC 135600 HP 165400, rouge HC 161500 HP 729500
  const one = (d, kva) => priceOffers([d], kva);

  // AC-3: 10 kWh Base on 2026-03-01 (31 days)
  const mar = day('2026-03-01', 'hchp', { hp: 6, hc: 4 });
  let r = one(mar, 9);
  eq(r.base.totalMicro, 10 * 192700 + 630968, 'base 2026-03-01 = 10 x 192700 + round(19560000/31)');
  eq(r.base.days[0].subMicro, 630968, 'base subscription part');
  eq(r.base.days[0].energyMicro.base, 1927000, 'base energy part (1,927 EUR)');
  eq(r.hchp.totalMicro, 6 * 206500 + 4 * 157900 + 630968, 'hchp 2026-03-01');
  const colour = tempoColourOf('2026-03-01');
  const hcP = { B: 132500, W: 149900, R: 157500 }[colour];
  const hpP = { B: 161200, W: 187100, R: 706000 }[colour];
  eq(r.tempo.totalMicro, 4 * hcP + 6 * hpP + Math.round(19380000 / 31), `tempo 2026-03-01 with calendar colour ${colour}`);
  ok(r.tempo.days[0].estimate && r.tempo.days[0].colour === colour && r.tempo.calendarEstimateDays === 1, 'hchp-period day: tempo flagged estimate with calendar colour');
  ok(!r.base.days[0].estimate && !r.hchp.days[0].estimate, 'base/hchp not flagged estimate');

  // tempo-period day on both sides of the grid switch
  const kw = { bleuHC: 3, bleuHP: 5, blancHC: 0, blancHP: 0, rougeHC: 0, rougeHP: 2 };
  const jul = day('2026-07-31', 'tempo', kw);
  const aug = day('2026-08-01', 'tempo', kw);
  r = one(jul, 9);
  eq(r.base.totalMicro, 10 * 192700 + 630968, 'base 2026-07-31 uses grid 20260201');
  eq(r.hchp.totalMicro, 7 * 206500 + 3 * 157900 + 630968, 'hchp 2026-07-31 (HP = sum of *HP buckets) grid 20260201');
  eq(r.tempo.totalMicro, 3 * 132500 + 5 * 161200 + 2 * 706000 + 625161, 'tempo 2026-07-31 grid 20260201');
  ok(!r.tempo.days[0].estimate && r.tempo.calendarEstimateDays === 0, 'tempo-era day not flagged');
  eq(r.tempo.days[0].kwh.bleuHP, 5, 'kwh per bucket exposed');
  r = one(aug, 9);
  eq(r.base.totalMicro, 10 * 198500 + 641290, 'base 2026-08-01 uses grid 20260801');
  eq(r.hchp.totalMicro, 7 * 214200 + 3 * 158900 + 641290, 'hchp 2026-08-01 grid 20260801');
  eq(r.tempo.totalMicro, 3 * 135600 + 5 * 165400 + 2 * 729500 + 635484, 'tempo 2026-08-01 grid 20260801');
  const both = priceOffers([jul, aug], 9);
  eq(both.base.totalMicro, 2557968 + 2626290, 'two days across the grid switch sum');
  eq(both.base.days[0].subMicro + both.base.days[0].energyMicro.base, both.base.days[0].totalMicro, 'total = sub + energy parts');
  // zero-kWh day: subscription only
  eq(one(day('2026-03-01', 'hchp', { hp: 0, hc: 0 }), 9).base.totalMicro, 630968, '0 kWh day = subscription only');
  // last grid reused after 2026-08-01
  eq(one(day('2026-12-31', 'tempo', kw), 9).base.totalMicro, 10 * 198500 + Math.round(19880000 / 31), 'last grid reused after its date');
  // before the first grid
  r = one(day('2021-01-01', 'hchp', { hp: 1, hc: 1 }), 9);
  ok(!r.base.available && /2021/.test(r.base.reason) || /01\/01\/2021/.test(r.base.reason), 'day before first grid: unavailable with date');

  // AC-4: unavailability
  r = one(aug, 3);
  ok(!r.tempo.available && r.tempo.totalMicro === 0 && /3 kVA/.test(r.tempo.reason) && /01\/08\/2026/.test(r.tempo.reason), `tempo unavailable at 3 kVA: ${r.tempo.reason}`);
  ok(r.hchp.available && r.base.available, 'hchp (3 kVA row in 20260801) and base available at 3 kVA on 2026-08-01');
  r = priceOffers([jul, aug], 3);
  ok(!r.hchp.available && /31\/07\/2026/.test(r.hchp.reason), `HC 3 kVA unavailable before 2026-08: ${r.hchp.reason}`);
  r = priceOffers([mar], 24);
  ok(!r.tempo.available && /24 kVA/.test(r.tempo.reason), 'Tempo 24 kVA unavailable before 2026-08');
  r = priceOffers([jul, aug], 24);
  ok(!r.tempo.available && /31\/07\/2026/.test(r.tempo.reason) && r.hchp.available, `mixed period 24 kVA: tempo unavailable (${r.tempo.reason})`);
  eq(priceOffers([aug], 24).tempo.available, true, 'Tempo 24 kVA available from 2026-08');

  // unknown calendar colour on an hchp day => Tempo unavailable
  eq(tempoColourOf('2026-12-31'), null, 'calendar unknown for 2026-12-31');
  r = priceOffers([day('2026-12-31', 'hchp', { hp: 5, hc: 5 })], 9);
  ok(!r.tempo.available && /31\/12\/2026/.test(r.tempo.reason) && r.hchp.available && r.base.available, `unknown colour => Tempo unavailable: ${r.tempo.reason}`);

  // ---- recap: unavailable excluded from sum and cheapest ----
  const imp = (days, excluded = []) => ({ days, periods: [], excluded, estimatedCount: days.filter((d) => d.estimated).length });
  const p2 = { from: '2026-07-31', to: '2026-08-01' };
  let a = analyse(imp([jul, aug]), p2, 24);
  let rc = buildRecap(a, ['tempo', 'hchp', 'base']);
  const tRow = rc.rows.find((x) => x.offer === 'tempo');
  ok(!tRow.available && tRow.reason !== '' && !tRow.cheapest && tRow.totalMicro === 0, 'recap: tempo unavailable, not cheapest, 0 in sum');
  const avail = rc.rows.filter((x) => x.available);
  const min = Math.min(...avail.map((x) => x.totalMicro));
  ok(avail.length === 2 && avail.every((x) => x.cheapest === (x.totalMicro === min)) && rc.compared === 2, 'recap: cheapest among available only');
  eq(rc.rows.find((x) => x.offer === 'base').totalMicro, a.offers.base.totalMicro, 'recap total = offer total');
  rc = buildRecap(a, ['base', 'tempo']);
  ok(rc.rows.length === 2 && rc.compared === 1, 'recap: only selected offers');
  rc = buildRecap(a, []);
  eq(rc.rows.length, 0, 'recap: no offer selected => empty');
  // tie => both cheapest
  const fake = { ...a, offers: { ...a.offers, hchp: { ...a.offers.base, offer: 'hchp' } } };
  rc = buildRecap(fake, ['hchp', 'base']);
  ok(rc.rows.every((x) => x.cheapest), 'recap: tie => all tied are cheapest');
  // counts and excluded
  a = analyse(imp([jul, day('2026-08-02', 'tempo', kw, true)], ['2026-08-01', '2026-09-09']), { from: '2026-07-31', to: '2026-08-02' }, 9);
  rc = buildRecap(a, ['tempo', 'hchp', 'base']);
  ok(rc.pricedDays === 2 && rc.estimatedDays === 1 && rc.excludedDays === 1, 'recap counts: priced/estimated/excluded (only in-period excluded)');
  ok(!rc.calendarEstimate, 'tempo-era only period: no calendar estimate notice');
  // AC-5: mixed hchp + tempo periods
  a = analyse(imp([mar, day('2026-03-02', 'hchp', { hp: 1, hc: 1 }), jul]), { from: '2026-03-01', to: '2026-07-31' }, 9);
  rc = buildRecap(a, ['tempo']);
  ok(rc.calendarEstimate && a.offers.tempo.calendarEstimateDays === 2 && a.hchpDays === 2, 'hchp days priced for Tempo => estimate notice flagged');
  rc = buildRecap(a, ['base', 'hchp']);
  ok(!rc.calendarEstimate, 'estimate notice only when Tempo is selected');
  const lines = assumptionLines(a, 'default', 6, null).join('\n');
  ok(lines.includes('22h00 à 06h00') && lines.includes(ESTIMATE_NOTICE) && lines.includes('à vérifier') && lines.includes(CALENDAR_CREDIT) && lines.includes('reconduits') && lines.includes('Jours estimés'), 'AC-14 assumptions lines');
  ok(CALENDAR_CREDIT === 'Couleurs Tempo : RTE, via api-couleur-tempo.fr (relais non officiel)' && !/http|<a/.test(CALENDAR_CREDIT), 'calendar credit is plain text');
  ok(assumptionLines(analyse(imp([jul], ['2024-03-10']), { from: '2024-03-01', to: '2026-12-31' }, 9), 'inferred', 9, 9).join('\n').includes('au moins 9 kVA (déduit du pic de puissance)'), 'kVA inferred label');

  // ---- period ----
  const synth = [];
  for (let n = num('2023-03-05'); n <= num('2025-06-30'); n++) synth.push(day(iso(n), 'hchp', { hp: 1, hc: 1 }));
  const dp = defaultPeriod(synth);
  ok(dp.from === '2024-07-01' && dp.to === '2025-06-30', `default period ${dp.from}..${dp.to}`);
  eq(num(dp.to) - num(dp.from) + 1, 365, 'default period is 365 days');
  const short = synth.slice(0, 100);
  ok(defaultPeriod(short).from === short[0].date, 'default period clamped to first priced day');
  let o = resolvePeriod(synth, '2023-01-01', '2024-01-10');
  ok(o.ok && o.clamped && o.period.from === '2023-03-05' && o.period.to === '2024-01-10' && /05\/03\/2023/.test(o.message) && /10\/01\/2024/.test(o.message), 'clamped period states the effective range');
  o = resolvePeriod(synth, '2024-01-01', '2024-03-01');
  ok(o.ok && !o.clamped && o.message === '', 'unclamped period');
  for (const [s, e, re, name] of [
    ['2024-03-01', '2024-01-01', /postérieure/, 'start > end'],
    ['2020-01-01', '2020-02-01', /Aucune donnée/, 'empty intersection'],
    ['2030-01-01', '2030-02-01', /Aucune donnée/, 'empty intersection (after)'],
    ['', '2024-01-01', /début invalide/, 'empty start'],
    ['2024-02-30', '2024-03-01', /début invalide/, 'impossible date'],
    ['2024-01-01', 'abc', /fin invalide/, 'invalid end'],
  ]) {
    o = resolvePeriod(synth, s, e);
    ok(!o.ok && re.test(o.error) && /conservée|Aucune donnée/.test(o.error), `${name}: ${o.error}`);
  }

  // resolvePeriod: only the excluded boundary day inside the clamped range => refused, previous period kept
  {
    const gapDays = [day('2024-03-08', 'hchp', { hp: 1, hc: 1 }), day('2024-03-12', 'tempo', kw)];
    o = resolvePeriod(gapDays, '2024-03-09', '2024-03-11');
    ok(!o.ok && /Aucun jour valorisé/.test(o.error) && /conservée/.test(o.error), `no priced day in range: ${o.error}`);
    o = resolvePeriod(gapDays, '2024-03-08', '2024-03-11');
    ok(o.ok, 'range containing a priced day stays valid');
  }
  // unsafe integer total => offer unavailable
  {
    const huge = [day('2026-03-01', 'hchp', { hp: 2 ** 50, hc: 0 })];
    r = priceOffers(huge, 9);
    ok(!r.base.available && !r.hchp.available && !r.tempo.available && /trop grand/.test(r.base.reason) && r.base.totalMicro === 0, 'total beyond 2^53 => all offers unavailable (French reason)');
  }
  // typography and list caps
  {
    const { frDateList, displayName } = await import('../.build-test/core/format.mjs');
    ok(ESTIMATE_NOTICE.startsWith('estimation : coût Tempo'), 'ESTIMATE_NOTICE uses the French space before the colon');
    const al = assumptionLines(analyse(imp([mar, day('2026-03-02', 'hchp', { hp: 1, hc: 1 })]), { from: '2026-03-01', to: '2026-03-02' }, 9), 'default', 6, null);
    ok(al.some((l) => l.startsWith('Sur 2 jours en Heures pleines / creuses, estimation : coût Tempo') && (l.match(/:/g) || []).length === 1), 'periods message rewritten, single colon');
    const many = Array.from({ length: 300 }, (_, i) => iso(num('2024-01-01') + i));
    const txt = frDateList(many);
    ok(txt.startsWith('300 jours (01/01/2024, 02/01/2024') && (txt.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length === 10, `date list capped to 10 dates: ${txt}`);
    ok(frDateList(['2024-03-10']) === '1 jour (10/03/2024)', 'single date list');
    const ex = assumptionLines(analyse({ ...imp([jul]), excluded: many }, { from: '2024-01-01', to: '2026-12-31' }, 9), 'default', 6, null).find((l) => l.startsWith('Jours exclus'));
    ok(ex && /300 jours/.test(ex) && (ex.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length === 10, 'assumptions: excluded list capped at 10 dates');
    ok(displayName('a\u202Eb\u2066c\u2069') === 'abc' && displayName('x'.repeat(100)).length === 60, 'displayName strips bidi and truncates');
  }

  // ---- peak file ----
  const peakCsv = (rows) =>
    Buffer.from(
      '\nRécapitulatif de ma Puissance max\n\n\nPuissance max quotidienne\n\nDate de la puissance max;Puissance max (VA)\n' +
        rows.map(([d, v]) => `${d};${v}`).join('\n') +
        '\n\n\nPuissance max mensuelle\n\nDate de la puissance max;Puissance max mensuelle (VA) recalculée à partir des Pmax journalières disponibles\n01/2026;99000\n\n\nPuissance max annuelle\n\nDate de la puissance max;Puissance max annuelle (VA) recalculée\n2026;99000\n',
      'latin1',
    );
  const P = (v) => new Uint8Array(peakCsv([['23/11/2026', v], ['22/11/2026', 100]]));
  let pk = parsePeakCsv(P(8200));
  ok(pk.maxVA === 8200 && pk.suggestedKva === 9, 'peak 8200 VA => 9 kVA (daily block only, monthly 99000 ignored)');
  eq(parsePeakCsv(P(37000)).suggestedKva, 36, 'peak 37000 VA => 36');
  eq(parsePeakCsv(P(3000)).suggestedKva, 3, 'peak 3000 VA => 3');
  eq(parsePeakCsv(P(3001)).suggestedKva, 6, 'peak 3001 VA => 6');
  eq(parsePeakCsv(P(24001)).suggestedKva, 30, 'peak 24001 VA => 30');
  eq(chooseKva(null, null).kva, 6, 'no peak file => 6 kVA');
  eq(chooseKva(null, null).source, 'default', 'no peak file => source default (à vérifier)');
  ok(chooseKva(pk, null).kva === 9 && chooseKva(pk, null).source === 'inferred', 'peak => pre-selected 9 kVA, inferred');
  ok(chooseKva(pk, 15).kva === 15 && chooseKva(pk, 15).source === 'manual', 'manual change wins');
  ok(/à vérifier/.test(assumptionLines(null, 'default', 6, null).join()), 'default kVA labelled à vérifier');
  const throwsFr = (fn, re, name) => {
    try { fn(); ok(false, `${name} must throw`); } catch (e) { ok(e instanceof Error && e.constructor.name === 'ImportError' && re.test(e.message), `${name}: ${e.message}`); }
  };
  throwsFr(() => parsePeakCsv(new Uint8Array(peakCsv([['23/11/2026', 0], ['22/11/2026', 0]]))), /0 VA/, 'peak max 0 VA => no exploitable power (not 3 kVA)');
  throwsFr(() => parsePeakCsv(new Uint8Array(6 * 1024 * 1024)), /volumineux/, 'peak > 5 MB');
  throwsFr(() => parsePeakCsv(new Uint8Array([65, 0, 66])), /nul/i, 'peak NUL');
  throwsFr(() => parsePeakCsv(new Uint8Array(Buffer.from('Puissance max\nfoo;bar\n'))), /non reconnu/, 'peak without daily block');
  throwsFr(() => detectFileKind(new Uint8Array(6 * 1024 * 1024)), /volumineux/, 'detect > 5 MB');

  // ---- detectFileKind and session ----
  const fx = buildFixtures();
  eq(detectFileKind(fx['good.csv']), 'index', 'detectFileKind index');
  eq(detectFileKind(fx['good-crlf-bom.csv']), 'index', 'detectFileKind index (CRLF/BOM)');
  eq(detectFileKind(P(5000)), 'peak', 'detectFileKind peak');
  eq(detectFileKind(new Uint8Array(Buffer.from('a;b\n1;2\n'))), 'unknown', 'detectFileKind unknown');
  const s = newSession();
  throwsFr(() => ingestFile(s, new Uint8Array(Buffer.from('a;b\n1;2\n')), 'x.csv'), /non reconnu/, 'unknown file refused');
  ingestFile(s, P(8200), 'peak1.csv'); // peak first (EC-17)
  ok(s.peak && s.peak.suggestedKva === 9 && s.index === null, 'peak dropped first is kept');
  ingestFile(s, fx['good.csv'], 'index1.csv');
  ok(s.index && s.index.days.length > 0 && s.peak && s.peak.suggestedKva === 9, 'index arrives after peak: both kept');
  ingestFile(s, P(2500), 'peak2.csv');
  ok(s.peak.maxVA === 2500 && s.peakName === 'peak2.csv' && s.index && s.indexName === 'index1.csv', 'second peak file replaces the first');
  const before = s.index;
  ingestFile(s, fx['good.csv'], 'index2.csv');
  ok(s.indexName === 'index2.csv' && s.index !== before, 'second index file replaces the first');
  throwsFr(() => ingestFile(s, fx['decreasing.csv'], 'bad.csv'), /Ligne/, 'bad index refused');
  ok(s.indexName === 'index2.csv', 'failed ingest leaves the session untouched');

  // formatting
  eq(formatEuro(1234567890), '1 234,57 €', 'formatEuro');

  // ---- opt-in demo data (committed synthetic files, TEMPO_DEMO_DATA=1) ----
  const demoIdx = demoCsv('index');
  const demoPeak = demoCsv('peak');
  if (demoIdx && demoPeak && existsSync(demoIdx) && existsSync(demoPeak)) {
    const ds = newSession();
    ingestFile(ds, new Uint8Array(readFileSync(demoPeak)), 'peak');
    ingestFile(ds, new Uint8Array(readFileSync(demoIdx)), 'index');
    // peak: global maximum 8210 VA => 9 kVA (independent scan of the daily block of the raw file)
    const rawPeak = readFileSync(demoPeak, 'latin1').split('\n');
    const dailyEnd = rawPeak.findIndex((l, k) => k > 6 && l.trim() === '');
    const vals = rawPeak.slice(7, dailyEnd).map((l) => Number(l.split(';')[1]));
    ok(vals.length > 1000 && Math.max(...vals) === 8210 && Math.min(...vals) >= 2500, `demo peak: ${vals.length} daily rows in [2500..8210]`);
    eq(ds.peak.maxVA, 8210, 'demo peak: parsePeakCsv maxVA');
    eq(ds.peak.days, vals.length, 'demo peak: daily rows read');
    eq(ds.peak.suggestedKva, 9, 'demo peak: suggestKva => 9');
    eq(chooseKva(ds.peak, null).kva, 9, 'demo peak: kVA 9 pre-selected');
    // default period: 365 days ending on the last priced day (= day before the last reading, 2026-06-18)
    const days = ds.index.days;
    const d = defaultPeriod(days);
    const lastDay = iso(num('2026-06-18') - 1);
    eq(lastDay, '2026-06-17', 'demo: last priced day is the day before the last reading');
    eq(days[days.length - 1].date, lastDay, 'demo: last priced day in the import');
    eq(d.to, lastDay, 'demo: default period ends on the last priced day');
    eq(d.from, iso(num(lastDay) - 364), 'demo: default period starts 364 days earlier');
    eq(num(d.to) - num(d.from) + 1, 365, 'demo: default period is 365 days');
    const inP = days.filter((x) => x.date >= d.from && x.date <= d.to);
    eq(inP.length, 365, 'demo: 365 priced days in the default period (no boundary day inside)');
    ok(inP.every((x) => x.kind === 'tempo'), 'demo: default period only covers the Tempo contract period');
    const ra = analyse(ds.index, d, ds.peak.suggestedKva);
    const rr = buildRecap(ra, ['tempo', 'hchp', 'base']);
    eq(rr.rows.length, 3, 'demo: recap has 3 offers');
    ok(rr.rows.every((x) => x.available), 'demo: 3 offers available at 9 kVA');
    for (const row of rr.rows) {
      const sum = ra.offers[row.offer].days.reduce((t, x) => t + x.totalMicro, 0);
      eq(row.totalMicro, sum, `demo: ${row.offer} recap total = sum of per-day costs`);
      eq(ra.offers[row.offer].days.length, 365, `demo: ${row.offer} priced 365 days`);
      ok(ra.offers[row.offer].days.every((x) => x.totalMicro > 0), `demo: ${row.offer} every day has a positive cost`);
    }
    const totals = rr.rows.map((x) => x.totalMicro);
    const minT = Math.min(...totals);
    ok(rr.rows.every((x) => x.cheapest === (x.totalMicro === minT)), 'demo: cheapest offer = minimum recap total');
    ok(rr.rows.filter((x) => x.cheapest).length >= 1 && rr.compared === 3, 'demo: at least one cheapest offer, 3 compared');
    // independent base total: sum of kWh x base price + subscription, recomputed from the per-day structure
    const baseKwh = inP.reduce((t, x) => t + Object.values(x.kwh).reduce((a, b) => a + b, 0), 0);
    eq(ra.offers.base.days.reduce((t, x) => t + Object.values(x.kwh).reduce((a, b) => a + b, 0), 0), baseKwh, 'demo: base days carry the file kWh');
    ok(ra.offers.base.days.every((x) => x.subMicro > 0), 'demo: base subscription charged every day');
    // Tempo estimate: none when the period only covers Tempo-era days
    eq(ra.offers.tempo.calendarEstimateDays, 0, 'demo: default period => no Tempo calendar estimate');
    ok(!rr.calendarEstimate, 'demo: default period => no estimate notice');
    // whole file: Tempo estimate flagged exactly for the HC/HP-period days
    const full = { from: days[0].date, to: lastDay };
    const hchpCount = num('2024-03-12') - num('2022-10-03'); // 2022-10-03 .. 2024-03-11
    const fa = analyse(ds.index, full, 9);
    eq(fa.hchpDays, hchpCount, 'demo: whole file has the expected number of HC/HP-period days');
    eq(fa.offers.tempo.calendarEstimateDays, hchpCount, 'demo: Tempo estimate flagged exactly for the HC/HP-period days');
    eq(fa.offers.tempo.days.filter((x) => x.estimate).length, hchpCount, 'demo: per-day estimate flags match');
    ok(fa.offers.tempo.days.every((x) => x.estimate === (x.date <= '2024-03-11')), 'demo: estimate flag only on days before the boundary');
    ok(!fa.offers.base.days.some((x) => x.estimate) && !fa.offers.hchp.days.some((x) => x.estimate), 'demo: base/hchp never flagged');
    ok(buildRecap(fa, ['tempo']).calendarEstimate, 'demo: whole file => estimate notice');
  } else console.log('skip: set TEMPO_DEMO_DATA=1');
} catch (e) {
  console.error(e);
  process.exit(2);
}
process.exit(failures ? 1 : 0);
