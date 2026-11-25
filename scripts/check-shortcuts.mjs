// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-9 [AC-23, FR-032]: period shortcuts (pure model), synthetic data only. exit 0 pass, 1 assertion failed, >=2 error.
// Demo block (TEMPO_DEMO_DATA=1) uses the committed synthetic demo export only.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { demoCsv } from './data-paths.mjs';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const mk = (from, to, skip = []) => {
  const out = [];
  for (let n = num(from); n <= num(to); n++) if (!skip.includes(iso(n))) out.push({ date: iso(n), kind: 'hchp', kwh: { hc: 3, hp: 5 }, estimated: false });
  return out;
};

try {
  const P = await import('../.build-test/core/period.mjs');
  const { shortcutPeriods, pressedShortcuts, shortcutMessage, defaultPeriod, resolvePeriod } = P;

  // ---- multi-year synthetic data: boundary excluded day (first priced day is kept) and a gap in the middle ----
  const multi = mk('2023-03-05', '2026-02-20', ['2024-06-10', '2025-01-15', '2025-01-16', '2025-01-17']);
  const sp = shortcutPeriods(multi);
  eq(sp.all, { from: '2023-03-05', to: '2026-02-20', clamped: false, availableDays: num('2026-02-20') - num('2023-03-05') + 1 }, 'multi: whole = full priced range');
  eq(sp.year, { from: '2025-02-21', to: '2026-02-20', clamped: false, availableDays: sp.all.availableDays }, 'multi: last year = 365 days ending on the last priced day');
  eq(num(sp.year.to) - num(sp.year.from) + 1, 365, 'multi: last year spans 365 calendar days');
  eq(sp['two-years'], { from: '2024-02-22', to: '2026-02-20', clamped: false, availableDays: sp.all.availableDays }, 'multi: last 2 years = 730 days (2024 leap year inside)');
  eq(num(sp['two-years'].to) - num(sp['two-years'].from) + 1, 730, 'multi: last 2 years spans 730 calendar days');
  const dp = defaultPeriod(multi);
  eq({ from: sp.year.from, to: sp.year.to }, dp, 'multi: last year equals defaultPeriod');
  ok(['all', 'year', 'two-years'].every((id) => shortcutMessage(sp[id]) === ''), 'multi: no clamp message');
  // every window resolves to itself through resolvePeriod (same path as a manual edit)
  for (const id of ['all', 'year', 'two-years']) {
    const r = resolvePeriod(multi, sp[id].from, sp[id].to);
    ok(r.ok && !r.clamped && r.period.from === sp[id].from && r.period.to === sp[id].to, `multi: ${id} applies unchanged through resolvePeriod`);
  }
  // excluded end boundary: the last priced day is the one returned, not the raw reading date
  const endExcl = mk('2024-01-01', '2024-12-31', ['2024-12-31']);
  eq(shortcutPeriods(endExcl).all.to, '2024-12-30', 'last priced day (not the excluded boundary) ends every window');
  eq(shortcutPeriods(endExcl).year.to, '2024-12-30', 'year window also ends on the last priced day');

  // ---- clamping ----
  const eight = mk('2025-06-01', '2026-01-31'); // 245 days
  const s8 = shortcutPeriods(eight);
  eq(s8.all.availableDays, 245, '8 months: availableDays');
  eq(s8.all.clamped, false, '8 months: whole is never clamped');
  eq(s8.year, { from: '2025-06-01', to: '2026-01-31', clamped: true, availableDays: 245 }, '8 months: year clamped to the first priced day');
  eq(s8['two-years'], { from: '2025-06-01', to: '2026-01-31', clamped: true, availableDays: 245 }, '8 months: 2 years clamped');
  eq(shortcutMessage(s8.year), 'Les données importées ne couvrent que 245 jours : période ajustée du 01/06/2025 au 31/01/2026.', '8 months: French message');
  eq(shortcutMessage(s8.all), '', '8 months: no message for whole');
  eq(pressedShortcuts(eight, { from: '2025-06-01', to: '2026-01-31' }), ['all', 'year', 'two-years'], '8 months: all three pressed (same window)');
  ok(resolvePeriod(eight, s8.year.from, s8.year.to).ok, '8 months: clamped window still applies (not an error)');
  eq(defaultPeriod(eight), { from: s8.year.from, to: s8.year.to }, '8 months: year equals defaultPeriod');

  const exact = mk('2025-02-21', '2026-02-20'); // exactly 365 days
  const s365 = shortcutPeriods(exact);
  eq(s365.all.availableDays, 365, '365 days: availableDays');
  eq(s365.year.clamped, false, '365 days: year fits exactly, not clamped');
  eq(s365.year.from, s365.all.from, '365 days: year = whole');
  eq(s365['two-years'], { from: '2025-02-21', to: '2026-02-20', clamped: true, availableDays: 365 }, '365 days: 2 years clamped');
  eq(shortcutMessage(s365.year), '', '365 days: no message for year');
  eq(shortcutMessage(s365['two-years']).startsWith('Les données importées ne couvrent que 365 jours'), true, '365 days: message for 2 years');
  eq(pressedShortcuts(exact, s365.all), ['all', 'year', 'two-years'], '365 days: all pressed');

  const exact730 = mk('2024-02-22', '2026-02-20');
  eq(shortcutPeriods(exact730)['two-years'].clamped, false, '730 days: two-years fits exactly');
  eq(shortcutPeriods(mk('2024-02-23', '2026-02-20'))['two-years'].clamped, true, '729 days: two-years clamped');
  eq(shortcutPeriods(mk('2026-02-20', '2026-02-20')).all, { from: '2026-02-20', to: '2026-02-20', clamped: false, availableDays: 1 }, 'single day: whole');

  eq(shortcutMessage(shortcutPeriods(mk('2026-02-20', '2026-02-20')).year), 'Les données importées ne couvrent que 1 jour : période ajustée du 20/02/2026 au 20/02/2026.', 'single day: singular message');

  // ---- none ----
  eq(shortcutPeriods([]), null, 'no priced day: null');
  eq(pressedShortcuts([], { from: '2025-01-01', to: '2025-12-31' }), [], 'no priced day: nothing pressed');

  // ---- pressed matching ----
  eq(pressedShortcuts(multi, sp.year), ['year'], 'pressed: year only');
  eq(pressedShortcuts(multi, sp.all), ['all'], 'pressed: whole only');
  eq(pressedShortcuts(multi, sp['two-years']), ['two-years'], 'pressed: 2 years only');
  eq(pressedShortcuts(multi, { from: '2025-02-22', to: '2026-02-20' }), [], 'pressed: manual edit of the start unpresses');
  eq(pressedShortcuts(multi, { from: sp.year.from, to: '2026-02-19' }), [], 'pressed: manual edit of the end unpresses');
  eq(pressedShortcuts(multi, null), [], 'pressed: no period');

  // ---- independent of the clock / time zone: same results in child processes with other TZ ----
  if (!process.env.TEMPO_SHORTCUTS_CHILD) {
    const mine = JSON.stringify([sp, s8, s365]);
    for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'UTC']) {
      const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { env: { ...process.env, TZ: tz, TEMPO_SHORTCUTS_CHILD: '1', TEMPO_DEMO_DATA: '' }, encoding: 'utf8' });
      ok(r.status === 0, `TZ=${tz}: whole check passes`);
      const line = (r.stdout.split('\n').find((l) => l.startsWith('SIG ')) || '').slice(4);
      ok(line === mine, `TZ=${tz}: shortcut results identical`);
    }
  } else {
    console.log('SIG ' + JSON.stringify([sp, s8, s365]));
  }

  // ---- demo block: exact ranges from an independent scan of the raw committed demo CSV ----
  const demoIdx = demoCsv('index');
  if (demoIdx && !process.env.TEMPO_SHORTCUTS_CHILD) {
    const { newSession, ingestFile } = await import('../.build-test/core/session.mjs');
    const dates = readFileSync(demoIdx, 'latin1').split(/\r?\n/)
      .map((l) => /^(\d{2})\/(\d{2})\/(\d{4});/.exec(l)).filter(Boolean)
      .map((m) => `${m[3]}-${m[2]}-${m[1]}`).sort();
    const first = dates[0];
    const lastDay = iso(num(dates[dates.length - 1]) - 1); // a day is priced from its reading to the next one
    eq([first, lastDay], ['2022-10-03', '2026-06-17'], 'demo: raw scan first reading / last priced day');
    const s = newSession();
    ingestFile(s, new Uint8Array(readFileSync(demoIdx)), 'index');
    const dsp = shortcutPeriods(s.index.days);
    const total = num(lastDay) - num(first) + 1;
    eq(dsp.all, { from: first, to: lastDay, clamped: false, availableDays: total }, 'demo: whole = raw first reading .. last priced day');
    eq(dsp.year, { from: iso(num(lastDay) - 364), to: lastDay, clamped: false, availableDays: total }, 'demo: last year = 365 days');
    eq(dsp.year.from, '2025-06-18', 'demo: last year starts 2025-06-18');
    eq(dsp['two-years'], { from: iso(num(lastDay) - 729), to: lastDay, clamped: false, availableDays: total }, 'demo: last 2 years = 730 days');
    eq(dsp['two-years'].from, '2024-06-18', 'demo: last 2 years starts 2024-06-18');
    eq({ from: dsp.year.from, to: dsp.year.to }, defaultPeriod(s.index.days), 'demo: last year equals defaultPeriod');
    ok(total > 730, `demo: ${total} days cover the 2-year window`);
    for (const id of ['all', 'year', 'two-years']) {
      const r = resolvePeriod(s.index.days, dsp[id].from, dsp[id].to);
      ok(r.ok && !r.clamped, `demo: ${id} resolves unchanged`);
    }
    eq(pressedShortcuts(s.index.days, defaultPeriod(s.index.days)), ['year'], 'demo: default period presses only the year shortcut');
  } else if (!process.env.TEMPO_SHORTCUTS_CHILD) console.log('skip: demo block (set TEMPO_DEMO_DATA=1)');
} catch (e) {
  console.error('ERROR', e);
  process.exit(2);
}
process.exit(failures ? 1 : 0);
