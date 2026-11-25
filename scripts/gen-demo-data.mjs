// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Deterministic SYNTHETIC demo data generator (seeded PRNG, fixed seed).
// `node scripts/gen-demo-data.mjs` writes tests/demo-data/mes-index-elec-demo.csv and ma-puissance-max-demo.csv
// in the EDF export formats the parsers accept. The consumption profile below is invented (24 made-up
// numbers); nothing comes from real data and nothing is read from outside the repository.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const fr = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export const DEMO = {
  seed: 731205,
  firstReading: '2022-10-03',
  lastHchpReading: '2024-03-12', // boundary day: old counters have no mapping to the new ones
  firstTempoReading: '2024-03-13',
  lastReading: '2026-06-18',
  missing: ['2023-05-22', '2025-01-08', '2025-01-10'],
  maxVA: 8210,
};

// Invented profile (kWh per day by month Jan..Dec, HC share by month): a made-up household, not a measurement.
const KWH_BY_MONTH = [31, 28, 23, 17, 14, 12, 12, 11, 15, 18, 24, 29];
const HC_SHARE = [0.42, 0.44, 0.46, 0.48, 0.5, 0.5, 0.52, 0.52, 0.5, 0.46, 0.44, 0.42];

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

const seasons = JSON.parse(readFileSync(join(root, 'src/data/tempo-calendar.json'), 'utf8'));
function colourOf(d) {
  const y = +d.slice(0, 4), mo = +d.slice(5, 7);
  const sy = mo >= 9 ? y : y - 1;
  const c = seasons[`${sy}-${sy + 1}`]?.[num(d) - Math.round(Date.UTC(sy, 8, 1) / MS)];
  if (c !== 'B' && c !== 'W' && c !== 'R') throw new Error(`calendar colour unknown for ${d}`);
  return c;
}

const HEADER =
  "Date de relevé de l'index;Type d'index;Index Heures pleines (kWh);Index Heures creuses (kWh);" +
  'Index Heures Creuses Bleu (kWh);Index Heures Pleines Bleu (kWh);Index Heures Creuses Blanc (kWh);' +
  'Index Heures Pleines Blanc (kWh);Index Heures Creuses Rouge (kWh);Index Heures Pleines Rouge (kWh)';
const TYPE = 'Index transmis par le distributeur';

export function buildDemo() {
  const rnd = mulberry32(DEMO.seed);
  const start = num(DEMO.firstReading);
  const end = num(DEMO.lastReading);
  const bound = num(DEMO.lastHchpReading);
  // float cumulative consumption per bucket; counter = start + round(cum) => never decreases, no drift
  const hchp = { base: [18400, 12100], cum: [0, 0] }; // HP, HC
  const tempo = { base: [0, 0, 0, 0, 0, 0], cum: [0, 0, 0, 0, 0, 0] }; // BHC BHP WHC WHP RHC RHP
  const reading = (b) => b.base.map((v, i) => v + Math.round(b.cum[i]));
  const rows = [];
  for (let n = start; n <= end; n++) {
    const d = iso(n);
    if (n <= bound) rows.push({ date: d, cells: [...reading(hchp), '', '', '', '', '', ''] });
    else {
      if (n === bound + 1) tempo.base = [hchp.base[1] + Math.round(hchp.cum[1]) + 37, hchp.base[0] + Math.round(hchp.cum[0]) + 41, 0, 0, 0, 0];
      rows.push({ date: d, cells: ['', '', ...reading(tempo)] });
    }
    if (n === end || n === bound) continue; // consumption of day d = index(d+1) - index(d); none for the boundary day
    const dt = new Date(n * MS);
    const m = dt.getUTCMonth();
    const wk = dt.getUTCDay();
    const noise = Math.min(1.4, Math.max(0.7, Math.exp(0.15 * gauss(rnd))));
    let total = KWH_BY_MONTH[m] * (wk === 0 || wk === 6 ? 1.12 : 1) * noise;
    if (n > bound) {
      const c = colourOf(d);
      total *= c === 'R' ? 0.7 : c === 'W' ? 0.9 : 1;
    }
    const hc = total * HC_SHARE[m] * (0.95 + 0.1 * rnd());
    const hp = total - hc;
    if (n < bound) {
      hchp.cum[0] += hp;
      hchp.cum[1] += hc;
    } else {
      // the meter changes colour at 06:00: night HC (00:00-06:00, ~6/10 of HC) belongs to the previous colour
      const cD = colourOf(d), cP = colourOf(iso(n - 1));
      const slot = { B: 0, W: 2, R: 4 };
      tempo.cum[slot[cP]] += hc * 0.6;
      tempo.cum[slot[cD]] += hc * 0.4;
      tempo.cum[slot[cD] + 1] += hp;
    }
  }
  const kept = rows.filter((r) => !DEMO.missing.includes(r.date));
  const indexLines = kept.map((r) => `${fr(r.date)};${TYPE};${r.cells.join(';')}`).reverse(); // newest first
  const index = ['', 'Récapitulatif de mes index', '', HEADER, ...indexLines].join('\n') + '\n';

  // peak file: daily Pmax in [2500..8210], global maximum exactly 8210 VA
  const prnd = mulberry32(DEMO.seed ^ 0x1b873593);
  const daily = [];
  for (let n = start; n < end; n++) {
    const m = new Date(n * MS).getUTCMonth();
    const winter = [0, 1, 2, 10, 11].includes(m);
    const v = 2500 + Math.round((winter ? 0.35 + 0.65 * prnd() : prnd() * prnd()) * (7500 - 2500));
    daily.push([iso(n), Math.min(7900, v)]);
  }
  daily[Math.floor(daily.length * 0.37)][1] = DEMO.maxVA;
  const monthly = new Map();
  const annual = new Map();
  for (const [d, v] of daily) {
    monthly.set(d.slice(0, 7), Math.max(monthly.get(d.slice(0, 7)) ?? 0, v));
    annual.set(d.slice(0, 4), Math.max(annual.get(d.slice(0, 4)) ?? 0, v));
  }
  const desc = (m) => [...m].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const peak =
    '\nRécapitulatif de ma Puissance max\n\n\nPuissance max quotidienne\n\nDate de la puissance max;Puissance max (VA)\n' +
    desc(new Map(daily)).map(([d, v]) => `${fr(d)};${v}`).join('\n') +
    '\n\n\nPuissance max mensuelle\n\nDate de la puissance max;Puissance max mensuelle (VA) recalculée à partir des Pmax journalières disponibles\n' +
    desc(monthly).map(([k, v]) => `${k.slice(5)}/${k.slice(0, 4)};${v}`).join('\n') +
    '\n\n\nPuissance max annuelle\n\nDate de la puissance max;Puissance max annuelle (VA) recalculée\n' +
    desc(annual).map(([k, v]) => `${k};${v}`).join('\n') +
    '\n';
  return { index: Buffer.from(index, 'latin1'), peak: Buffer.from(peak, 'latin1') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { index, peak } = buildDemo();
  const dir = join(root, 'tests/demo-data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mes-index-elec-demo.csv'), index);
  writeFileSync(join(dir, 'ma-puissance-max-demo.csv'), peak);
  console.log('demo data written to tests/demo-data/ (synthetic, deterministic)');
}
