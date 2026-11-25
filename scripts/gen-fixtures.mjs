// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Synthetic fixtures generator. `node scripts/gen-fixtures.mjs` writes fixtures/*.csv;
// check-import.mjs imports buildFixtures() and works in memory (no disk dependency).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const fr = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export const SYNTH = {
  firstReading: '2024-01-01',
  boundaryReading: '2024-03-10', // last HC/HP reading
  tempoFirst: '2024-03-11',
  lastReading: '2024-05-31',
  missing: ['2024-02-10', '2024-04-10', '2024-04-12'],
  expected: { pricedDays: 150, estimatedDays: 6, excluded: ['2024-03-10'], periods: 2 },
};

const HEADER =
  'Date de relevé de l\'index;Type d\'index;Index Heures pleines (kWh);Index Heures creuses (kWh);' +
  'Index Heures Creuses Bleu (kWh);Index Heures Pleines Bleu (kWh);Index Heures Creuses Blanc (kWh);' +
  'Index Heures Pleines Blanc (kWh);Index Heures Creuses Rouge (kWh);Index Heures Pleines Rouge (kWh)';
const TYPE = 'Index transmis par le distributeur';

/** Returns { rows: [{date, cells[8]}], truth: Map<date, number[8]> } (true daily kWh). */
function model() {
  const start = num(SYNTH.firstReading);
  const end = num(SYNTH.lastReading);
  const bound = num(SYNTH.boundaryReading);
  const idx = [27000, 21000, 9000, 11000, 0, 0, 0, 0]; // hp, hc | bleuHC, bleuHP, blancHC, blancHP, rougeHC, rougeHP
  const rows = [];
  const truth = new Map();
  for (let n = start; n <= end; n++) {
    const d = iso(n);
    const tempo = n > bound;
    const row = { date: d, tempo, vals: tempo ? idx.slice(2) : idx.slice(0, 2) };
    rows.push(row);
    // daily consumption of day d (index(d+1)-index(d)); odd numbers so gap splits have remainders
    const inc = tempo
      ? [3 + (n % 4), 5 + (n % 5), n % 9 === 0 ? 2 : 0, n % 9 === 0 ? 3 : 0, n % 40 === 0 ? 1 : 0, n % 40 === 0 ? 4 : 0]
      : [6 + (n % 7), 4 + (n % 3)];
    truth.set(d, inc);
    if (n + 1 === bound + 1) {
      // switch: tempo counters start at their own values, not derived from old ones
      idx[0] += inc[0]; idx[1] += inc[1];
      idx[2] = 9100; idx[3] = 11100; idx[4] = 0; idx[5] = 0; idx[6] = 0; idx[7] = 0;
    } else if (!tempo) {
      idx[0] += inc[0]; idx[1] += inc[1];
    } else {
      for (let k = 0; k < 6; k++) idx[2 + k] += inc[k];
    }
  }
  return { rows, truth };
}

function line(row) {
  const cells = row.tempo ? ['', '', ...row.vals] : [...row.vals, '', '', '', '', '', ''];
  return `${fr(row.date)};${TYPE};${cells.join(';')}`;
}

const enc = (s) => new Uint8Array(Buffer.from(s, 'latin1'));

function csvOf(lines, { eol = '\n', preamble = true } = {}) {
  const head = preamble ? ['', 'Récapitulatif de mes index', '', HEADER] : [HEADER];
  return [...head, ...lines].join(eol) + eol;
}

export function buildFixtures() {
  const { rows, truth } = model();
  const kept = rows.filter((r) => !SYNTH.missing.includes(r.date));
  const lines = kept.map(line).reverse(); // newest first, like the EDF export
  const good = csvOf(lines);
  const firstDataLine = 5; // physical line of first data row (newest)
  const out = {};
  out['good.csv'] = enc(good);
  out['good-crlf-bom.csv'] = new Uint8Array(Buffer.from('﻿' + csvOf(lines, { eol: '\r\n' }), 'utf8'));
  out['unordered.csv'] = enc(csvOf([...lines.filter((_, i) => i % 2 === 0), ...lines.filter((_, i) => i % 2 === 1)]));

  // decreasing index on a known physical line: lower the counter of the reading at index k (newest-first)
  const k = 95; // line 100 = firstDataLine + 95
  const decLines = [...lines];
  const r = kept[kept.length - 1 - k];
  const dec = { ...r, vals: r.vals.map((v) => v - 40) };
  decLines[k] = line(dec);
  out['decreasing.csv'] = enc(csvOf(decLines));
  out['decreasing.expectLine'] = firstDataLine + k;

  const dupLines = [...lines];
  dupLines.splice(10, 0, lines[10]);
  out['duplicate.csv'] = enc(csvOf(dupLines));

  const nulLines = [...lines];
  nulLines[20] = nulLines[20].replace(TYPE, 'Index\0transmis');
  out['nul.csv'] = enc(csvOf(nulLines));

  out['big.csv'] = new Uint8Array(5 * 1024 * 1024 + 1).fill(97);

  const xssType = [...lines];
  xssType[5] = xssType[5].replace(TYPE, '<img src=x onerror=alert(1)>');
  out['xss-type.csv'] = enc(csvOf(xssType));

  const xssDate = [...lines];
  xssDate[5] = '<img src=x onerror=alert(1)>' + 'A'.repeat(60) + xssDate[5].slice(10);
  out['xss-date.csv'] = enc(csvOf(xssDate));

  out['unknown-format.csv'] = enc('a;b\n1;2\n');
  out.truth = truth;
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = buildFixtures();
  mkdirSync('fixtures', { recursive: true });
  for (const [name, data] of Object.entries(f)) {
    if (data instanceof Uint8Array) writeFileSync(`fixtures/${name}`, data);
  }
  console.log('fixtures written to fixtures/ (check-import works in memory and does not need them)');
}
