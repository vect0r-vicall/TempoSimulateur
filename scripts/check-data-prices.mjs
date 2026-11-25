#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-6 part A: price table sanity, spot values, api-couleur-tempo cross-check,
// and (when PDFs present) an independent re-parse of the PDFs. Plain Node, no TS imports.
// Exit 0 pass / 1 assertion failure / >=2 error.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfDir } from './data-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = pdfDir() || '';
const fails = [];
const ok = (c, msg) => { if (!c) fails.push(msg); };

function run() {
  const src = readFileSync(join(root, 'src/data/grids.ts'), 'utf8');
  const marker = 'export const GRIDS: Grid[] = ';
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('GRIDS marker not found in grids.ts');
  const GRIDS = JSON.parse(src.slice(at + marker.length).trim().replace(/;$/, ''));

  // api-couleur-tempo.fr /api/tarifs 2026-08-01 (EUR/kWh), hardcoded (no network)
  const API = { bleuHC: .1356, bleuHP: .1654, blancHC: .1536, blancHP: .1921, rougeHC: .1615, rougeHP: .7295 };

  const dates = ['2022-02-01','2022-08-01','2023-02-01','2023-08-01','2024-02-01','2025-02-01','2025-08-01','2026-02-01','2026-08-01'];
  ok(GRIDS.length === 9, 'grid count ' + GRIDS.length);
  ok(JSON.stringify(GRIDS.map((g) => g.effective)) === JSON.stringify(dates), 'effective dates/order');

  const expHc = (d) => (d === '2026-08-01' ? 9 : 8);
  const expTempo = (d) => (d < '2023-02-01' ? 6 : d < '2026-08-01' ? 7 : 8);
  const fieldsBase = ['kva','sub','kwh'], fieldsHc = ['kva','sub','hp','hc'];
  const fieldsT = ['kva','sub','bleuHC','bleuHP','blancHC','blancHP','rougeHC','rougeHP'];
  const posInt = (v) => Number.isInteger(v) && v > 0;

  for (const g of GRIDS) {
    const t = g.effective;
    ok(g.base.length === 9, `${t} base rows ${g.base.length}`);
    ok(g.hchp.length === expHc(t), `${t} hchp rows ${g.hchp.length}`);
    ok(g.tempo.length === expTempo(t), `${t} tempo rows ${g.tempo.length}`);
    for (const [name, rows, fields] of [['base', g.base, fieldsBase], ['hchp', g.hchp, fieldsHc], ['tempo', g.tempo, fieldsT]]) {
      rows.forEach((r, i) => {
        for (const f of fields) ok(posInt(r[f]), `${t} ${name}[${i}].${f} invalid ${r[f]}`);
        ok(Object.keys(r).length === fields.length, `${t} ${name}[${i}] extra/missing fields`);
        if (i > 0) {
          ok(r.kva > rows[i - 1].kva, `${t} ${name} kva not ascending at ${i}`);
          ok(r.sub >= rows[i - 1].sub, `${t} ${name} sub decreasing at kva ${r.kva}`);
        }
      });
    }
    for (const r of g.hchp) ok(r.hc < r.hp, `${t} hchp ${r.kva} hc>=hp`);
    for (const r of g.tempo) {
      ok(r.bleuHC < r.bleuHP && r.blancHC < r.blancHP && r.rougeHC < r.rougeHP, `${t} tempo ${r.kva} HC>=HP`);
      ok(r.bleuHC < r.blancHC && r.blancHC < r.rougeHC, `${t} tempo ${r.kva} HC blue<white<red`);
      ok(r.bleuHP < r.blancHP && r.blancHP < r.rougeHP, `${t} tempo ${r.kva} HP blue<white<red`);
    }
  }

  const G = (d) => GRIDS.find((g) => g.effective === d);
  const row = (rows, kva) => rows.find((r) => r.kva === kva);
  // spot values 2026-02
  const g26 = G('2026-02-01');
  const b3 = row(g26.base, 3), h6 = row(g26.hchp, 6), t6 = row(g26.tempo, 6);
  ok(b3 && b3.sub === 12030000 && b3.kwh === 194000, 'spot Base 3kVA 2026-02');
  ok(h6 && h6.sub === 15650000 && h6.hp === 206500 && h6.hc === 157900, 'spot HC 6kVA 2026-02');
  ok(t6 && t6.sub === 15590000 && t6.bleuHC === 132500 && t6.bleuHP === 161200 && t6.blancHC === 149900 &&
     t6.blancHP === 187100 && t6.rougeHC === 157500 && t6.rougeHP === 706000, 'spot Tempo 6kVA 2026-02');
  ok(row(G('2026-02-01').base, 9)?.sub === 19560000 && row(G('2026-02-01').base, 9)?.kwh === 192700, 'spot Base 9kVA 2026-02');
  ok(row(G('2026-02-01').base, 6)?.kwh === 194000, 'Base 6kVA kWh 2026-02 equals 3kVA');

  // api-couleur-tempo cross-check on 2026-08-01
  for (const r of G('2026-08-01').tempo) for (const k of Object.keys(API))
    ok(r[k] === Math.round(API[k] * 1e6), `api mismatch 2026-08-01 tempo ${r.kva} ${k}: ${r[k]} vs ${API[k]}`);

  // independent PDF re-parse
  let compared = 0;
  if (existsSync(PDF_DIR)) {
    for (const g of GRIDS) {
      const f = join(PDF_DIR, `tarifs-${g.effective.replaceAll('-', '')}.pdf`);
      if (!existsSync(f)) continue;
      const txt = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
      const want = reparse(txt);
      const have = {
        base: g.base.map((r) => [r.kva, r.sub, r.kwh]),
        hc: g.hchp.map((r) => [r.kva, r.sub, r.hp, r.hc]),
        tempo: g.tempo.map((r) => [r.kva, r.sub, r.bleuHC, r.bleuHP, r.blancHC, r.blancHP, r.rougeHC, r.rougeHP]),
      };
      for (const k of ['base', 'hc', 'tempo']) {
        ok(JSON.stringify(want[k]) === JSON.stringify(have[k]),
          `${g.effective} ${k} differs from independent PDF parse\n  pdf : ${JSON.stringify(want[k])}\n  ts  : ${JSON.stringify(have[k])}`);
      }
      compared++;
    }
    console.log(`independent PDF re-parse: ${compared}/9 grids compared`);
  } else console.log('PDFs not present: independent re-parse skipped');
}

// Independent minimal pass: classify each purely-numeric line by its token count.
function reparse(txt) {
  const out = { base: [], hc: [], tempo: [] };
  let inTempo = false;
  const toMicro = (s, scale) => { const [a, b = '0'] = s.split(','); return Math.round(Number(a + '.' + b) * scale); };
  for (const raw of txt.split(/\r?\n/)) {
    if (/Option Tempo/.test(raw)) inTempo = true;
    // keep only numeric tokens: header words can share a line with a row (e.g. Base 3 kVA)
    const toks = raw.trim().split(/\s+/).filter((x) => /^\d+(,\d+)?$/.test(x));
    const n = toks.length;
    if (n < 3 || !/^\d+$/.test(toks[0])) continue;
    // numeric-only line: integers allowed only at kVA positions (0, and 3 on a Base+HC line)
    const kvaAt = (n === 7 && !inTempo) ? [0, 3] : [0];
    if (!toks.every((x, i) => (kvaAt.includes(i) ? /^\d+$/.test(x) : /^\d+,\d\d$/.test(x)))) continue;
    const S = (i) => toMicro(toks[i], 1e6), K = (i) => toMicro(toks[i], 1e4);
    if (inTempo) { if (n === 8) out.tempo.push([+toks[0], S(1), K(2), K(3), K(4), K(5), K(6), K(7)]); continue; }
    if (n === 3) out.base.push([+toks[0], S(1), K(2)]);
    else if (n === 4) out.hc.push([+toks[0], S(1), K(2), K(3)]);
    else if (n === 7) { out.base.push([+toks[0], S(1), K(2)]); out.hc.push([+toks[3], S(4), K(5), K(6)]); }
  }
  return out;
}

try { run(); } catch (e) { console.error('ERROR', e); process.exit(2); }
if (fails.length) { console.error('check-data-prices FAILED:\n' + fails.join('\n')); process.exit(1); }
console.log('check-data-prices OK');
