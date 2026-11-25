#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Generates src/data/grids.ts from the EDF Tarif Bleu PDF grids (pdftotext -layout).
// Usage: node scripts/gen-prices.mjs [pdfDir]   (or env TEMPO_PDF_DIR)
//
// Printed items EXCLUDED ON PURPOSE (non-tariff text, never needed to price a bill): the electricity origin
// mix (percentages), EDF address, capital, RCS and phone number, the chèque énergie text, the CGV article
// references, and the taxes.edf.com mention. Everything else printed as a price, tax, majoration or Base
// extinction note is generated (see check-data-prices.mjs for the exact pins).
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfDir } from './data-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] || pdfDir();
if (!dir) { console.error('Usage: node scripts/gen-prices.mjs <dir with tarifs-YYYYMMDD.pdf> (or set TEMPO_PDF_DIR / TEMPO_DATA_DIR)'); process.exit(2); }

// "19,56" -> integer micro-euros of that decimal value times `scale` (exact, string based)
function micro(s, scale) {
  const m = /^(\d+),(\d{1,2})$/.exec(s);
  if (!m) throw new Error('bad number ' + JSON.stringify(s));
  return (Number(m[1]) * 100 + Number(m[2].padEnd(2, '0'))) * (scale / 100);
}
const SUB = 1e6;   // EUR/month -> micro-EUR
const KWH = 1e4;   // cents/kWh -> micro-EUR/kWh

const NUM = '(\\d+,\\d\\d)';
const reBase = new RegExp(`^\\s*(\\d+)\\s+${NUM}\\s+${NUM}\\s*$`);
const reHc = new RegExp(`^\\s*(\\d+)\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s*$`);
const reTempo = new RegExp(`^\\s*(\\d+)\\s+${NUM}(?:\\s+${NUM}){6}\\s*$`);
const COL = 75; // Base table is left of this column, HC table right of it

function parse(text, file) {
  const lines = text.split('\n');
  const iTempo = lines.findIndex((l) => /Option Tempo/.test(l));
  if (iTempo < 0) throw new Error(file + ': no Tempo section');
  const base = [], hchp = [], tempo = [];
  for (const line of lines.slice(0, iTempo)) {
    const left = line.slice(0, COL), right = line.slice(COL);
    let m = reBase.exec(left);
    if (m) base.push({ kva: +m[1], sub: micro(m[2], SUB), kwh: micro(m[3], KWH) });
    m = reHc.exec(right);
    if (m) hchp.push({ kva: +m[1], sub: micro(m[2], SUB), hp: micro(m[3], KWH), hc: micro(m[4], KWH) });
  }
  for (const line of lines.slice(iTempo)) {
    if (/Majoration/.test(line)) break;
    const t = line.trim().split(/\s+/);
    if (t.length === 8 && reTempo.test(line)) {
      const v = t.slice(2).map((x) => micro(x, KWH));
      tempo.push({ kva: +t[0], sub: micro(t[1], SUB), bleuHC: v[0], bleuHP: v[1],
        blancHC: v[2], blancHP: v[3], rougeHC: v[4], rougeHP: v[5] });
    }
  }
  return { base, hchp, tempo };
}

// "3,085" -> integer = decimal value x 10^decimals (exact, string based). Used for every extra datum.
function fixed(s, decimals) {
  const m = /^(\d+)(?:,(\d+))?$/.exec(s);
  if (!m || (m[2] || '').length > decimals) throw new Error('bad number ' + JSON.stringify(s));
  return Number(m[1] + (m[2] || '').padEnd(decimals, '0'));
}
const EUR_YEAR = (s) => fixed(s, 6);          // EUR/an HT -> micro-EUR
const CKWH = (s) => fixed(s, 4);              // cts EUR/kWh HTVA -> micro-EUR/kWh
const MONTHS = { janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12 };

// Every figure printed more than once (e.g. surcharges repeated after the Tempo table) must agree.
function unique(vals, what, file) {
  const set = [...new Set(vals)];
  if (set.length > 1) throw new Error(`${file}: conflicting ${what}: ${set.join(' / ')}`);
  return set.length ? set[0] : null;
}

function parseExtras(text, file) {
  const flat = text.replace(/[ \t]+/g, ' ');
  const head = flat.slice(0, flat.indexOf('Applicable au'));
  const title = head.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  const ap = /Applicable au (\d+)(?:er)? (\S+) (\d{4})/.exec(flat);
  if (!ap || !MONTHS[ap[2]]) throw new Error(file + ': no applicability date');
  const appliesFrom = `${ap[3]}-${String(MONTHS[ap[2]]).padStart(2, '0')}-${ap[1].padStart(2, '0')}`;
  const aud = /OFFRE POUR LES ([A-ZÉ ]+)/.exec(flat);
  if (!aud) throw new Error(file + ': no audience');
  const audience = aud[1].trim().toLowerCase();

  // surcharges (EUR/an HT, printed once after Base/HC and again after Tempo in most grids)
  const all = (re) => [...flat.matchAll(re)].map((m) => EUR_YEAR(m[1]));
  const selfProducerInjection = unique(all(/auto[ -]?producteurs individuels avec injection \(€\/an HT\) ?: ?(\d+,\d\d)/g), 'injection surcharge', file);
  const noLinky = unique(all(/absence de compteur Linky[^\n]*\(€\/an HT\) ?: ?(\d+,\d\d)/g), 'no-Linky surcharge', file);
  const noIndex = unique([
    ...all(/absence de transmission d’index de consommation depuis plus de 12 mois \(€\/an HT\) ?: ?(\d+,\d\d)/g),
    ...all(/pas mis à disposition d’index[^\n]*?(\d+,\d\d)\s*\n\s*distribution ENEDIS depuis plus de 12 mois/g),
  ], 'no-index surcharge', file);
  const noIndexFrom = /à partir du 1 ?er janvier 2022/.test(flat) ? '2022-01-01' : null;

  const ext = /les puissances de (\d+) à (\d+) kVA inclus de l’option Base/.exec(flat);
  const legal = /(Arrêté du \d+ \S+ \d{4} relatif aux tarifs réglementés de vente de l’électricité)/.exec(flat);
  const baseExtinction = ext ? { fromKva: +ext[1], toKva: +ext[2], legalBasis: legal ? legal[1] : null } : null;

  const ex = /(Accise sur l’électricité|Contribution (?:au|aux charges de) Service Public de l['’]Électricité \(CSPE\)|Contribution (?:au|aux charges de) Service Public de l['’]Electricité \(CSPE\))\S* ?, d’un montant de (\d+,\d+) cts € \/kWh HTVA/i.exec(flat);
  if (!ex) throw new Error(file + ': no accise/CSPE line');
  const tc = /Taxes sur la Consommation Finale d’Électricité \(TCFE\), d’un montant maximum de (\d+,\d+) cts € \/kWh HTVA/.exec(flat);
  const cta = /Contribution Tarifaire d’Acheminement \(CTA\)(, correspondant à la majorité des clients)?/.exec(flat);
  const vat = /TVA au taux de (\d+(?:,\d+)?)% pour l’abonnement( et la CTA)?, et au taux de (\d+(?:,\d+)?)% pour les consommations/.exec(flat);
  if (!vat) throw new Error(file + ': no VAT line');
  const pct = (s) => Number(s.replace(',', '.'));
  const alias = /Anciennement CSPE/.test(flat) ? 'CSPE' : /CSPE est également appelée Taxe Intérieure sur la Consommation Finale d’Electricité \(TICFE\)/.test(flat) ? 'TICFE' : null;
  const taxes = {
    exciseLabel: /^Accise/i.test(ex[1]) ? 'Accise' : 'CSPE',
    exciseAlias: alias,
    exciseMicroPerKwh: CKWH(ex[2]),
    tcfeMaxMicroPerKwh: tc ? CKWH(tc[1]) : null,
    cta: cta ? { forMajorityOfClients: !!cta[1] } : null,
    vat: { subscription: pct(vat[1]), cta: vat[2] ? pct(vat[1]) : null, consumption: pct(vat[3]) },
  };
  return { title, audience, appliesFrom, baseExtinction,
    surcharges: { selfProducerInjection, noLinky, noIndexTransmission12Months: noIndex, noIndexFrom }, taxes };
}

const files = readdirSync(dir).filter((f) => /^tarifs-\d{8}\.pdf$/.test(f)).sort();
if (files.length !== 9) throw new Error(`expected 9 PDFs in ${dir}, found ${files.length}`);
const GRIDS = files.map((f) => {
  const d = f.slice(7, 15);
  const text = execFileSync('pdftotext', ['-layout', join(dir, f), '-'], { encoding: 'utf8' });
  const effective = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const { base, hchp, tempo } = parse(text, f);
  const x = parseExtras(text, f);
  if (x.appliesFrom !== effective) throw new Error(`${f}: printed date ${x.appliesFrom} differs from file date`);
  return { effective, title: x.title, audience: x.audience, appliesFrom: x.appliesFrom, base, hchp, tempo,
    baseExtinction: x.baseExtinction, surcharges: x.surcharges, taxes: x.taxes };
});

const out = `// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Generated by scripts/gen-prices.mjs from the EDF Tarif Bleu PDF grids. DO NOT EDIT.
// Units: integer micro-euros. sub = EUR TTC/month x 1e6; kWh prices = cents TTC/kWh x 1e4 (= EUR/kWh x 1e6).
// Extra data (as printed in each PDF): surcharges = EUR/an HT x 1e6; taxes.*MicroPerKwh = cts EUR/kWh HTVA x 1e4;
// VAT in percent; null = the grid does not print the item (never 0).
export interface Grid { effective: string; // YYYY-MM-DD
  title: string; audience: string; appliesFrom: string; // printed title, audience, "Applicable au" date (YYYY-MM-DD)
  base: {kva:number; sub:number; kwh:number}[];
  hchp: {kva:number; sub:number; hp:number; hc:number}[];
  tempo: {kva:number; sub:number; bleuHC:number; bleuHP:number; blancHC:number; blancHP:number; rougeHC:number; rougeHP:number}[];
  baseExtinction: {fromKva:number; toKva:number; legalBasis:string|null} | null; // Base powers 'mises en extinction'
  surcharges: {selfProducerInjection:number|null; noLinky:number|null; noIndexTransmission12Months:number|null; noIndexFrom:string|null};
  taxes: {exciseLabel:'CSPE'|'Accise'; exciseAlias:string|null; exciseMicroPerKwh:number|null; tcfeMaxMicroPerKwh:number|null;
    cta:{forMajorityOfClients:boolean} | null; vat:{subscription:number|null; cta:number|null; consumption:number|null}} }
export const GRIDS: Grid[] = ${JSON.stringify(GRIDS, null, 1)};
`;
mkdirSync(join(root, 'src/data'), { recursive: true });
writeFileSync(join(root, 'src/data/grids.ts'), out);
for (const g of GRIDS) console.log(g.effective, 'base', g.base.length, 'hchp', g.hchp.length, 'tempo', g.tempo.length);
