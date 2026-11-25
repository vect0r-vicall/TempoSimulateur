// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-1 [AC-1, AC-2, AC-12]: exit 0 pass, 1 assertion failed, >=2 error.
import { existsSync, readFileSync } from 'node:fs';
import { buildFixtures, SYNTH } from './gen-fixtures.mjs';
import { demoCsv } from './data-paths.mjs';

let failures = 0;
const isoPlus = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const eq2 = (got, want, msg) => ok(got === want, `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
const ok = (cond, msg) => {
  if (!cond) { failures++; console.error('FAIL: ' + msg); } else console.log('ok: ' + msg);
};

try {
  const { parseIndexCsv, ImportError } = await import('../.build-test/core/csv.mjs');
  const fx = buildFixtures();
  const E = SYNTH.expected;

  // AC-1 on synthetic shape
  for (const name of ['good.csv', 'good-crlf-bom.csv', 'unordered.csv']) {
    const r = parseIndexCsv(fx[name]);
    ok(r.days.length === E.pricedDays, `${name}: ${r.days.length} priced days (expect ${E.pricedDays})`);
    ok(r.estimatedCount === E.estimatedDays && r.days.filter((d) => d.estimated).length === E.estimatedDays, `${name}: ${E.estimatedDays} estimated days`);
    ok(JSON.stringify(r.excluded) === JSON.stringify(E.excluded), `${name}: excluded ${JSON.stringify(r.excluded)}`);
    ok(r.periods.length === 2 && r.periods[0].kind === 'hchp' && r.periods[1].kind === 'tempo', `${name}: 2 periods hchp then tempo`);
    ok(r.periods[0].to === SYNTH.boundaryReading && r.periods[1].from === SYNTH.tempoFirst, `${name}: period dates`);
    ok(r.days.every((d, i) => i === 0 || r.days[i - 1].date < d.date), `${name}: days ascending`);
    ok(!r.days.some((d) => d.date === SYNTH.boundaryReading), `${name}: boundary day not priced`);
  }
  // values vs truth
  const r = parseIndexCsv(fx['good.csv']);
  const order = { hchp: ['hp', 'hc'], tempo: ['bleuHC', 'bleuHP', 'blancHC', 'blancHP', 'rougeHC', 'rougeHP'] };
  let exact = true, pairs = true;
  for (let i = 0; i < r.days.length; i++) {
    const d = r.days[i];
    const t = fx.truth.get(d.date);
    const got = order[d.kind].map((k) => d.kwh[k]);
    if (!d.estimated) { if (got.join() !== t.join()) { exact = false; console.error('mismatch', d.date, got, t); } }
    else if (i + 1 < r.days.length && r.days[i + 1].estimated && (r.days.filter((x) => x.estimated).indexOf(d) % 2 === 0)) {
      const n = r.days[i + 1];
      const t2 = fx.truth.get(n.date);
      const g2 = order[n.kind].map((k) => n.kwh[k]);
      for (let k = 0; k < got.length; k++) {
        if (got[k] + g2[k] !== t[k] + t2[k] || got[k] < g2[k] || got[k] - g2[k] > 1) pairs = false;
      }
    }
  }
  ok(exact, 'non-estimated days equal the generated truth');
  ok(pairs, 'gap pairs: sum preserved, earliest day gets the remainder');

  // AC-2
  const fails = (name, re, extra) => {
    try { parseIndexCsv(fx[name]); ok(false, `${name} must be refused`); }
    catch (e) {
      ok(e instanceof ImportError, `${name}: ImportError`);
      ok(re.test(e.message), `${name}: message "${e.message.slice(0, 80)}"`);
      if (extra) extra(e.message);
    }
  };
  fails('decreasing.csv', new RegExp(`Ligne ${fx['decreasing.expectLine']}\\b`));
  fails('duplicate.csv', /Ligne \d+.*double/);
  fails('nul.csv', /binaire|nul/i);
  fails('big.csv', /volumineux/);
  fails('unknown-format.csv', /non reconnu/);
  // AC-12
  const x = parseIndexCsv(fx['xss-type.csv']);
  ok(x.days.length === E.pricedDays, 'xss in a non-parsed cell: file loads; payload is never surfaced in result');
  ok(!JSON.stringify(x).includes('<img'), 'result carries no cell content');
  const payload = '<img src=x onerror=alert(1)>' + 'A'.repeat(60);
  fails('xss-date.csv', /Ligne \d+/, (m) => {
    ok(m.includes('<img src=x onerror'), 'error quotes the content as text');
    ok(!m.includes('A'.repeat(20)) && m.length < 200, 'quoted content truncated to 40 chars');
    ok(!m.includes(payload), 'full payload not echoed');
  });

  // ---- review hardening: date bounds, gaps, span, per-day delta, quotes, periods labels, atomic ingest ----
  const H2 = 'Date de relevé;Index Heures pleines (kWh);Index Heures creuses (kWh)';
  const HT = 'Date;Index Heures Creuses Bleu;Index Heures Pleines Bleu;Index Heures Creuses Blanc;Index Heures Pleines Blanc;Index Heures Creuses Rouge;Index Heures Pleines Rouge';
  const csvOf = (head, rows) => new Uint8Array(Buffer.from([head, ...rows].join('\n') + '\n'));
  const refuse = (bytes, re, name) => {
    const t0 = Date.now();
    try { parseIndexCsv(bytes); ok(false, `${name} must be refused`); }
    catch (e) { ok(e instanceof ImportError && re.test(e.message), `${name}: ${e.message}`); }
    ok(Date.now() - t0 < 1000, `${name}: refused quickly`);
  };
  refuse(csvOf(H2, ['01/01/0100;10;10', '31/12/9999;20;20']), /Ligne 2 .*hors plage/, '2-row file 0100..9999 (year bound, line 2 or 3)');
  refuse(csvOf(H2, ['01/01/1999;10;10', '02/01/1999;20;20']), /Ligne 2 .*année 1999/, 'year 1999');
  refuse(csvOf(H2, ['01/01/2100;10;10', '01/01/2101;20;20']), /Ligne 3 .*année 2101/, 'year 2101');
  refuse(csvOf(H2, ['01/01/2020;10;10', '05/02/2021;20;20']), /Ligne 3 .*400 jours/, 'gap of 401 days between consecutive readings');
  ok(parseIndexCsv(csvOf(H2, ['01/01/2020;10;10', '04/02/2021;20;20'])).days.length === 400, 'gap of exactly 400 days accepted');
  {
    const rows = [];
    for (let n = Date.UTC(2000, 0, 1); n <= Date.UTC(2026, 0, 1); n += 300 * 86400000) {
      const d = new Date(n); const i = rows.length;
      rows.push(`${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()};${i};${i}`);
    }
    refuse(csvOf(H2, rows), /25 ans/, 'total span above 25 years');
  }
  refuse(csvOf(H2, ['01/01/2020;0;0', '02/01/2020;100001;0']), /Ligne 3 .*100\s?000 kWh par jour/, 'per-day delta above 100000 kWh');
  ok(parseIndexCsv(csvOf(H2, ['01/01/2020;0;0', '02/01/2020;100000;0'])).days.length === 1, 'per-day delta of exactly 100000 kWh accepted');
  // quotes stripped on header and cells
  const q = parseIndexCsv(csvOf('"Date de relevé";"Index Heures pleines (kWh)";"Index Heures creuses (kWh)"', ['"01/01/2020";"10";"10"', '"02/01/2020";"15";"12"']));
  ok(q.days.length === 1 && q.days[0].kwh.hp === 5 && q.days[0].kwh.hc === 2, 're-saved CSV with quoted cells is read');
  // periods: reading-date labels and priced-day counts sum to the total
  for (const name of ['good.csv', 'unordered.csv']) {
    const rp = parseIndexCsv(fx[name]);
    ok(rp.periods.reduce((t, p) => t + p.days, 0) === rp.days.length, `${name}: priced days per period sum to ${rp.days.length}`);
  }
  // atomic ingest: a file with no priced day leaves the session untouched
  const { newSession, ingestFile } = await import('../.build-test/core/session.mjs');
  const sess = newSession();
  ingestFile(sess, fx['good.csv'], 'first.csv');
  const prevIndex = sess.index;
  const noPriced = csvOf(H2.replace(';Index Heures creuses (kWh)', ';Index Heures creuses (kWh);' + HT.split(';').slice(1).join(';')), ['01/01/2020;1;1;;;;;;', '02/01/2020;;;1;1;1;1;1;1']);
  let atomicErr = null;
  try { ingestFile(sess, noPriced, 'second.csv'); } catch (e) { atomicErr = e; }
  ok(atomicErr && atomicErr.constructor.name === 'ImportError' && /Aucun jour valorisable/.test(atomicErr.message), `no priced day => French ImportError (${atomicErr && atomicErr.message})`);
  ok(sess.index === prevIndex && sess.indexName === 'first.csv', 'failed ingest keeps previous data and file name');
  ingestFile(sess, fx['good.csv'], 'a\u202Eb' + 'x'.repeat(80) + '.csv');
  ok(!/[\u202A-\u202E\u2066-\u2069]/.test(sess.indexName) && sess.indexName.length <= 60, 'displayed file name: bidi stripped, <= 60 chars');

  // opt-in demo data (committed synthetic files, TEMPO_DEMO_DATA=1): exact expectations computed independently
  const demo = demoCsv('index');
  if (demo && existsSync(demo)) {
    const MSD = 86400000;
    const dn = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MSD);
    const bytes = new Uint8Array(readFileSync(demo));
    const rr = parseIndexCsv(bytes);
    // independent reading of the raw file
    const raw = Buffer.from(bytes).toString('latin1').split('\n').filter((l) => /^\d{2}\/\d{2}\/\d{4};/.test(l));
    const rd = raw.map((l) => {
      const f = l.split(';');
      return { date: `${f[0].slice(6)}-${f[0].slice(3, 5)}-${f[0].slice(0, 2)}`, v: f.slice(2).map((x) => (x === '' ? null : Number(x))) };
    }).reverse();
    const first = rd[0].date, last = rd[rd.length - 1].date;
    ok(first === '2022-10-03' && last === '2026-06-18', `demo: readings ${first}..${last}`);
    ok(rd.every((x, i) => i === 0 || x.date > rd[i - 1].date), 'demo: raw rows strictly ascending once reversed (file is newest first)');
    const missingExpected = ['2023-05-22', '2025-01-08', '2025-01-10'];
    const have = new Set(rd.map((x) => x.date));
    ok(missingExpected.every((d) => !have.has(d)), 'demo: the 3 missing readings are absent');
    const hchpRows = rd.filter((x) => x.v[0] !== null), tempoRows = rd.filter((x) => x.v[2] !== null);
    const boundary = hchpRows[hchpRows.length - 1].date;
    ok(boundary === '2024-03-12' && tempoRows[0].date === '2024-03-13' && hchpRows.length + tempoRows.length === rd.length, 'demo: HC/HP rows until 2024-03-12, Tempo rows from 2024-03-13');
    eq2(rr.periods.length, 2, 'demo: 2 periods');
    ok(rr.periods[0].kind === 'hchp' && rr.periods[0].from === '2022-10-03' && rr.periods[0].to === '2024-03-12', 'demo: period 1 dates');
    ok(rr.periods[1].kind === 'tempo' && rr.periods[1].from === '2024-03-13' && rr.periods[1].to === '2026-06-18', 'demo: period 2 dates');
    ok(JSON.stringify(rr.excluded) === '["2024-03-12"]', `demo: excluded ${JSON.stringify(rr.excluded)}`);
    eq2(rr.estimatedCount, 6, 'demo: estimatedCount');
    eq2(rr.days.filter((x) => x.estimated).length, 6, 'demo: 6 estimated days flagged');
    const expectDays = dn(last) - dn(first) - 1; // calendar days between first and last reading, minus the boundary day
    eq2(rr.days.length, expectDays, 'demo: priced day count = span - boundary day');
    ok(rr.days.every((x, i) => i === 0 || x.date > rr.days[i - 1].date), 'demo: days strictly ascending, no duplicate');
    ok(new Set(rr.days.map((x) => x.date)).size === rr.days.length && !rr.days.some((x) => x.date === boundary), 'demo: no duplicate date, boundary not priced');
    ok(rr.days[0].date === '2022-10-03' && rr.days[rr.days.length - 1].date === '2026-06-17', 'demo: first and last priced days');
    eq2(rr.periods[0].days + rr.periods[1].days, rr.days.length, 'demo: period day counts sum to total');
    // totals per bucket = counter difference of the file, per period
    const ord = { hchp: ['hp', 'hc'], tempo: ['bleuHC', 'bleuHP', 'blancHC', 'blancHP', 'rougeHC', 'rougeHP'] };
    for (const [kind, rows, off] of [['hchp', hchpRows, 0], ['tempo', tempoRows, 2]]) {
      ord[kind].forEach((k, i) => {
        const want = rows[rows.length - 1].v[off + i] - rows[0].v[off + i];
        const got = rr.days.filter((x) => x.kind === kind).reduce((t, x) => t + x.kwh[k], 0);
        eq2(got, want, `demo: ${kind} ${k} total kWh = counter difference`);
      });
    }
    // every non-estimated day equals the raw counter difference with the next reading
    const byDate = new Map(rd.map((x) => [x.date, x]));
    let exactDays = 0, badDays = 0;
    for (const x of rr.days) {
      if (x.estimated) continue;
      const a = byDate.get(x.date), b = byDate.get(isoPlus(x.date, 1));
      const off = x.kind === 'hchp' ? 0 : 2;
      const diff = ord[x.kind].map((_, i) => b.v[off + i] - a.v[off + i]);
      if (diff.join() === ord[x.kind].map((k) => x.kwh[k]).join()) exactDays++; else badDays++;
    }
    ok(badDays === 0 && exactDays === rr.days.length - 6, `demo: ${exactDays} non-estimated days equal the raw counter differences`);
    ok(rr.days.every((x) => Object.values(x.kwh).every((v) => Number.isInteger(v) && v >= 0)), 'demo: all kWh are non-negative integers');
  } else console.log('skip: set TEMPO_DEMO_DATA=1');
} catch (e) {
  console.error(e);
  process.exit(2);
}
process.exit(failures ? 1 : 0);
