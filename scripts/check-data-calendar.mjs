#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-6 part B: Tempo calendar validation. Exit 0 pass, 1 assertion, >=2 error.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoCsv } from './data-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = process.env.TEMPO_INDEX_CSV || demoCsv('index') || '';
const fails = [];
// Counter/calendar mismatches are reported as WARNINGS (count only, no date); the check fails only if
// the mismatch ratio exceeds MAX_MISMATCH_RATIO of the checked days.
const MAX_MISMATCH_RATIO = 0.02;
const fail = (m) => { fails.push(m); console.log('FAIL', m); };

try {
  const seasons = JSON.parse(readFileSync(join(root, 'src/data/tempo-calendar.json'), 'utf8'));
  const DAY = 86400000;
  const dow = (t) => new Date(t).getUTCDay();
  const keys = Object.keys(seasons).sort();
  if (!keys.length || keys[0] !== '2022-2023') fail(`first season must be 2022-2023, got ${keys[0]}`);
  const todayT = Date.UTC(...(() => { const n = new Date(); return [n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()]; })());
  const colours = new Map();

  for (const key of keys) {
    const m = /^(\d{4})-(\d{4})$/.exec(key);
    if (!m || +m[2] !== +m[1] + 1) { fail(`bad season key ${key}`); continue; }
    const y = +m[1];
    const s = seasons[key];
    if (!/^[BWR?]+$/.test(s)) { fail(`${key}: invalid characters`); continue; }
    const start = Date.UTC(y, 8, 1), end = Date.UTC(y + 1, 7, 31);
    const days = (end - start) / DAY + 1;
    if (s.length !== days) fail(`${key}: length ${s.length} != ${days}`);
    const complete = end < todayT;
    const cnt = { B: 0, W: 0, R: 0, '?': 0 };
    for (let i = 0; i < s.length; i++) {
      const t = start + i * DAY, c = s[i], d = dow(t), mo = new Date(t).getUTCMonth() + 1;
      cnt[c]++;
      const iso = new Date(t).toISOString().slice(0, 10);
      colours.set(iso, c);
      if (c === 'R' && !(mo >= 11 || mo <= 3)) fail(`${key}: red outside 1 Nov-31 Mar on ${iso}`);
      if (c === 'R' && (d === 0 || d === 6)) fail(`${key}: red on weekend ${iso}`);
      if (c === 'W' && d === 0) fail(`${key}: white on Sunday ${iso}`);
    }
    if (complete) {
      const expB = days === 366 ? 301 : 300;
      if (cnt.B !== expB || cnt.W !== 43 || cnt.R !== 22) fail(`${key}: ${cnt.B}/${cnt.W}/${cnt.R} != ${expB}/43/22`);
      if (cnt['?']) fail(`${key}: ${cnt['?']} unknown days in complete season`);
    } else if (cnt.R > 22 || cnt.W > 43) fail(`${key}: partial season exceeds quotas`);
    console.log(`${key} ${complete ? 'complete' : 'partial '} days=${days} B=${cnt.B} W=${cnt.W} R=${cnt.R} ?=${cnt['?']}`);
  }
  // season continuity
  for (let i = 1; i < keys.length; i++) if (+keys[i].slice(0, 4) !== +keys[i - 1].slice(0, 4) + 1) fail(`gap before ${keys[i]}`);

  // Counter cross-check
  if (!existsSync(CSV)) {
    console.log('skip: set TEMPO_DEMO_DATA=1 (counter cross-check skipped)');
  } else {
    const txt = new TextDecoder('latin1').decode(readFileSync(CSV));
    const rows = new Map();
    for (const line of txt.split(/\r?\n/)) {
      const f = line.split(';');
      const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f[0] || '');
      if (!dm || f.length < 10) continue;
      const iso = `${dm[3]}-${dm[2]}-${dm[1]}`;
      const nums = f.slice(4, 10).map((x) => (x.trim() === '' ? null : Number(x)));
      rows.set(iso, nums);
    }
    const NAMES = ['B', 'B', 'W', 'W', 'R', 'R']; // BHC BHP WHC WHP RHC RHP
    const prev = (iso) => new Date(Date.parse(iso) - DAY).toISOString().slice(0, 10);
    const next = (iso) => new Date(Date.parse(iso) + DAY).toISOString().slice(0, 10);
    let checked = 0, mism = [], skipped = 0;
    const sortedRows = [...rows].sort();
    // Tempo era start derived from the data: first row with all six colour counters populated.
    const eraStart = (sortedRows.find(([, a]) => a.every((x) => x !== null)) || [null])[0];
    for (const [iso, a] of sortedRows) {
      if (eraStart === null || iso < eraStart) continue;
      const b = rows.get(next(iso));
      if (!b || a.some((x) => x === null) || b.some((x) => x === null)) { skipped++; continue; }
      const kwh = { B: 0, W: 0, R: 0 };
      b.forEach((v, i) => { const dlt = v - a[i]; if (dlt < 0) { fail(`${iso}: decreasing counter ${i}`); return; } kwh[NAMES[i]] += dlt; });
      const cal = colours.get(iso), calPrev = colours.get(prev(iso));
      if (!cal || cal === '?') { skipped++; continue; }
      checked++;
      const dom = Object.entries(kwh).sort((x, y) => y[1] - x[1])[0];
      for (const c of ['B', 'W', 'R']) {
        if (kwh[c] > 0 && c !== cal && c !== calPrev) { mism.push(`${iso} cal=${cal}/prev=${calPrev} kWh=${JSON.stringify(kwh)}`); break; }
      }
      if (dom[1] > 0 && dom[0] !== cal && !mism.some((x) => x.startsWith(iso)) && dom[0] !== calPrev) mism.push(`${iso} dominant ${dom[0]} != ${cal}`);
    }
    console.log(`counter cross-check: ${checked} days checked, ${skipped} skipped, ${mism.length} mismatches`);
    if (mism.length) console.log(`WARN ${mism.length} day(s) where counters and calendar disagree`);
    if (CSV === demoCsv('index')) {
      // synthetic demo data follows the calendar by construction: no tolerance
      if (mism.length !== 0) fail(`demo data: ${mism.length} mismatching day(s), expected 0`);
      if (checked < 780) fail(`demo data: only ${checked} days cross-checked`);
    }
    if (checked && mism.length / checked > MAX_MISMATCH_RATIO) fail(`counter mismatch ratio ${(mism.length / checked * 100).toFixed(1)}% exceeds ${MAX_MISMATCH_RATIO * 100}%`);
  }
} catch (e) {
  console.error('ERROR', e);
  process.exit(2);
}
if (fails.length) { console.log(`${fails.length} assertion(s) failed`); process.exit(1); }
console.log('OK');
