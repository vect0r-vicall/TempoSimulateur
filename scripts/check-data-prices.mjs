#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-6 part A: price table sanity, spot values, api-couleur-tempo cross-check,
// and (when PDFs present) an independent re-parse of the PDFs. Plain Node, no TS imports.
// Exit 0 pass / 1 assertion failure / >=2 error.
//
// EXACT PINS (no PDF needed): every grid is pinned below by (a) the SHA-256 of the canonical JSON
// (sorted keys, JSON.stringify) of {effective, base, hchp, tempo} and (b) the literal expected values of
// title, audience, appliesFrom, baseExtinction (incl. legalBasis), surcharges, taxes (excise label/alias/value,
// TCFE maximum, CTA flag, VAT). All of them are public EDF tariff figures. A change of any price or datum in
// src/data/grids.ts therefore fails plain `npm test`. Changing a pin is only legitimate after regenerating
// grids.ts from the nine PDFs (scripts/gen-prices.mjs) AND re-running this check with TEMPO_PDF_DIR set
// (independent PDF re-parse, 9/9 grids compared); then update the pin from the regenerated file.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfDir } from './data-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = pdfDir() || '';
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));

const PIN = {
  '2022-02-01': {
    sha256: '3953f81ed013150e76405bfed7886dc518b90a5a02e238aa33e0808498d9bf55',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2022-02-01',
    baseExtinction: {"fromKva":18,"toKva":36,"legalBasis":"Arrêté du 12 août 2010 relatif aux tarifs réglementés de vente de l’électricité"},
    surcharges: {"selfProducerInjection":3720000,"noLinky":null,"noIndexTransmission12Months":null,"noIndexFrom":null},
    taxes: {"exciseLabel":"CSPE","exciseAlias":null,"exciseMicroPerKwh":1000,"tcfeMaxMicroPerKwh":6630,"cta":{"forMajorityOfClients":false},"vat":{"subscription":5.5,"cta":5.5,"consumption":20}},
  },
  '2022-08-01': {
    sha256: 'bc5c5bb6fa75ff2595fadc0cc4814e48e7910d5302fda2861a35e9d04f8ac801',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2022-08-01',
    baseExtinction: {"fromKva":18,"toKva":36,"legalBasis":"Arrêté du 12 août 2010 relatif aux tarifs réglementés de vente de l’électricité"},
    surcharges: {"selfProducerInjection":3720000,"noLinky":null,"noIndexTransmission12Months":null,"noIndexFrom":null},
    taxes: {"exciseLabel":"CSPE","exciseAlias":null,"exciseMicroPerKwh":1000,"tcfeMaxMicroPerKwh":6630,"cta":{"forMajorityOfClients":false},"vat":{"subscription":5.5,"cta":5.5,"consumption":20}},
  },
  '2023-02-01': {
    sha256: '3c86a896edcf1d1af6c03d2ee35d15a25783a6b852810b38c054693b4494205b',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2023-02-01',
    baseExtinction: {"fromKva":18,"toKva":36,"legalBasis":"Arrêté du 12 août 2010 relatif aux tarifs réglementés de vente de l’électricité"},
    surcharges: {"selfProducerInjection":8280000,"noLinky":null,"noIndexTransmission12Months":50880000,"noIndexFrom":"2022-01-01"},
    taxes: {"exciseLabel":"CSPE","exciseAlias":"TICFE","exciseMicroPerKwh":1000,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":5.5,"cta":5.5,"consumption":20}},
  },
  '2023-08-01': {
    sha256: '4ef32d62090bfa1d1be2716d913587b60ba4fa414dbfd08c30fd393aa803b39c',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2023-08-01',
    baseExtinction: {"fromKva":18,"toKva":36,"legalBasis":"Arrêté du 12 août 2010 relatif aux tarifs réglementés de vente de l’électricité"},
    surcharges: {"selfProducerInjection":8880000,"noLinky":null,"noIndexTransmission12Months":54240000,"noIndexFrom":"2022-01-01"},
    taxes: {"exciseLabel":"Accise","exciseAlias":"CSPE","exciseMicroPerKwh":1000,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":5.5,"cta":5.5,"consumption":20}},
  },
  '2024-02-01': {
    sha256: '1382639d02c80f620092cee6cdcf1fb73eb36aae0e302e6c98207d2f4988f66b',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2024-02-01',
    baseExtinction: {"fromKva":18,"toKva":36,"legalBasis":"Arrêté du 12 août 2010 relatif aux tarifs réglementés de vente de l’électricité"},
    surcharges: {"selfProducerInjection":8880000,"noLinky":null,"noIndexTransmission12Months":54240000,"noIndexFrom":"2022-01-01"},
    taxes: {"exciseLabel":"Accise","exciseAlias":"CSPE","exciseMicroPerKwh":21000,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":5.5,"cta":5.5,"consumption":20}},
  },
  '2025-02-01': {
    sha256: '761a5c0c50f573ba001b303feae35b57f01116fbb3f1ab876141c501bbcd70b3',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2025-02-01',
    baseExtinction: {"fromKva":9,"toKva":36,"legalBasis":null},
    surcharges: {"selfProducerInjection":9720000,"noLinky":null,"noIndexTransmission12Months":61200000,"noIndexFrom":"2022-01-01"},
    taxes: {"exciseLabel":"Accise","exciseAlias":"CSPE","exciseMicroPerKwh":33700,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":5.5,"cta":5.5,"consumption":20}},
  },
  '2025-08-01': {
    sha256: '1ccb5166e58c319169233cf5117722cf31a8ed81db1dc64b5662afb2ef507283',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2025-08-01',
    baseExtinction: {"fromKva":9,"toKva":36,"legalBasis":null},
    surcharges: {"selfProducerInjection":9600000,"noLinky":38900000,"noIndexTransmission12Months":24840000,"noIndexFrom":null},
    taxes: {"exciseLabel":"Accise","exciseAlias":"CSPE","exciseMicroPerKwh":29980,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":20,"cta":20,"consumption":20}},
  },
  '2026-02-01': {
    sha256: '8e1450b0d25472a3dfffe24fff0719a53a5272ecc076a9158c20b21b66b7ae64',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2026-02-01',
    baseExtinction: {"fromKva":9,"toKva":36,"legalBasis":null},
    surcharges: {"selfProducerInjection":9600000,"noLinky":38900000,"noIndexTransmission12Months":24840000,"noIndexFrom":null},
    taxes: {"exciseLabel":"Accise","exciseAlias":"CSPE","exciseMicroPerKwh":30850,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":20,"cta":20,"consumption":20}},
  },
  '2026-08-01': {
    sha256: '16eb77c6cc997749e742358531c6d3737017e352fd78cb8e5ff7a127e8e45047',
    title: "Grille de prix de l’offre de fourniture d’électricité « Tarif Bleu »",
    audience: "clients particuliers",
    appliesFrom: '2026-08-01',
    baseExtinction: {"fromKva":9,"toKva":36,"legalBasis":null},
    surcharges: {"selfProducerInjection":9840000,"noLinky":40080000,"noIndexTransmission12Months":25620000,"noIndexFrom":null},
    taxes: {"exciseLabel":"Accise","exciseAlias":"CSPE","exciseMicroPerKwh":30620,"tcfeMaxMicroPerKwh":null,"cta":{"forMajorityOfClients":true},"vat":{"subscription":20,"cta":null,"consumption":20}},
  },
};


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

  // structure/sanity of the extra data (always checked; no PDF needed)
  const TOP = ['effective','title','audience','appliesFrom','base','hchp','tempo','baseExtinction','surcharges','taxes'];
  const isMicro = (v) => v === null || (Number.isInteger(v) && v > 0);
  for (const g of GRIDS) {
    const t = g.effective;
    ok(JSON.stringify(Object.keys(g)) === JSON.stringify(TOP), `${t} top-level fields`);
    ok(g.appliesFrom === t, `${t} appliesFrom ${g.appliesFrom}`);
    ok(/Tarif Bleu/.test(g.title) && g.audience === 'clients particuliers', `${t} title/audience`);
    const e = g.baseExtinction;
    ok(e && Number.isInteger(e.fromKva) && Number.isInteger(e.toKva), `${t} baseExtinction missing`);
    if (e) {
      ok(e.toKva === 36 && e.fromKva === (t < '2025-02-01' ? 18 : 9), `${t} extinction range ${e.fromKva}-${e.toKva}`);
      ok(g.base.some((r) => r.kva === e.fromKva) && g.base.some((r) => r.kva === e.toKva), `${t} extinction bounds are Base rows`);
      ok(e.legalBasis === null || /^Arrêté du 12 août 2010/.test(e.legalBasis), `${t} legalBasis`);
      ok((e.legalBasis === null) === (t >= '2025-02-01'), `${t} legalBasis presence per era`);
    }
    const s = g.surcharges;
    ok(JSON.stringify(Object.keys(s)) === JSON.stringify(['selfProducerInjection','noLinky','noIndexTransmission12Months','noIndexFrom']), `${t} surcharges fields`);
    for (const k of ['selfProducerInjection','noLinky','noIndexTransmission12Months']) ok(isMicro(s[k]), `${t} surcharges.${k} invalid ${s[k]}`);
    ok(Number.isInteger(s.selfProducerInjection) && s.selfProducerInjection < 20e6, `${t} injection surcharge plausible`);
    ok((s.noLinky === null) === (t < '2025-08-01'), `${t} noLinky presence per era`);
    ok((s.noIndexTransmission12Months === null) === (t < '2023-02-01'), `${t} noIndex presence per era`);
    ok(s.noIndexFrom === null || (s.noIndexFrom === '2022-01-01' && t >= '2023-02-01' && t < '2025-08-01'), `${t} noIndexFrom`);
    for (const k of ['noLinky','noIndexTransmission12Months']) ok(s[k] === null || s[k] < 100e6, `${t} ${k} plausible`);
    const x = g.taxes;
    ok(JSON.stringify(Object.keys(x)) === JSON.stringify(['exciseLabel','exciseAlias','exciseMicroPerKwh','tcfeMaxMicroPerKwh','cta','vat']), `${t} taxes fields`);
    ok(x.exciseLabel === (t < '2023-08-01' ? 'CSPE' : 'Accise'), `${t} excise label`);
    ok(Number.isInteger(x.exciseMicroPerKwh) && x.exciseMicroPerKwh >= 1000 && x.exciseMicroPerKwh <= 50000, `${t} excise plausible ${x.exciseMicroPerKwh}`);
    ok(isMicro(x.tcfeMaxMicroPerKwh) && (x.tcfeMaxMicroPerKwh === null) === (t >= '2023-02-01'), `${t} tcfe presence`);
    ok(x.cta && typeof x.cta.forMajorityOfClients === 'boolean', `${t} cta`);
    ok(x.vat.consumption === 20, `${t} VAT consumption`);
    ok(x.vat.subscription === (t < '2025-08-01' ? 5.5 : 20), `${t} VAT subscription ${x.vat.subscription}`);
    ok(x.vat.cta === null ? t === '2026-08-01' : x.vat.cta === x.vat.subscription, `${t} VAT cta`);
  }
  // exact pins (see header)
  ok(JSON.stringify(Object.keys(PIN)) === JSON.stringify(dates), 'pin set covers exactly the nine grids');
  for (const g of GRIDS) {
    const p = PIN[g.effective];
    if (!p) continue;
    const sha = createHash('sha256').update(canon({ effective: g.effective, base: g.base, hchp: g.hchp, tempo: g.tempo })).digest('hex');
    ok(sha === p.sha256, `${g.effective} price tables differ from the pinned SHA-256 (got ${sha})`);
    for (const k of ['title', 'audience', 'appliesFrom', 'baseExtinction', 'surcharges', 'taxes']) {
      ok(canon(g[k]) === canon(p[k]), `${g.effective} ${k} differs from its pin: got ${canon(g[k])}, pinned ${canon(p[k])}`);
    }
  }
  const accise = Object.fromEntries(GRIDS.map((g) => [g.effective, g.taxes.exciseMicroPerKwh]));
  ok(JSON.stringify(Object.values(accise)) === JSON.stringify([1000,1000,1000,1000,21000,33700,29980,30850,30620]), 'excise per grid era');

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
      const wx = reparseExtras(txt);
      const hx = {
        title: g.title, audience: g.audience, appliesFrom: g.appliesFrom,
        ext: g.baseExtinction && [g.baseExtinction.fromKva, g.baseExtinction.toKva, g.baseExtinction.legalBasis],
        inj: g.surcharges.selfProducerInjection, noLinky: g.surcharges.noLinky, noIdx: g.surcharges.noIndexTransmission12Months,
        noIdxFrom: g.surcharges.noIndexFrom,
        excise: [g.taxes.exciseLabel, g.taxes.exciseAlias, g.taxes.exciseMicroPerKwh], tcfe: g.taxes.tcfeMaxMicroPerKwh,
        cta: g.taxes.cta && g.taxes.cta.forMajorityOfClients,
        vat: [g.taxes.vat.subscription, g.taxes.vat.cta, g.taxes.vat.consumption],
      };
      for (const k of Object.keys(hx)) {
        ok(JSON.stringify(wx[k]) === JSON.stringify(hx[k]),
          `${g.effective} ${k} differs from independent PDF parse\n  pdf : ${JSON.stringify(wx[k])}\n  ts  : ${JSON.stringify(hx[k])}`);
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

// Independent re-parse of the non-table data, line oriented (no code shared with gen-prices.mjs).
// Each datum is read from the lines that mention it; repeated occurrences must agree.
function reparseExtras(txt) {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const joined = lines.join(' ');
  const dec = (s, n) => { const [a, b = ''] = s.split(','); return Number(a + b.padEnd(n, '0')); };
  const lastNum = (l) => { const m = /(\d+,\d+)\s*$/.exec(l); return m ? m[1] : null; };
  const pick = (re, n) => { const v = [...new Set(lines.filter((l) => re.test(l)).map(lastNum).filter(Boolean))]; return v.length === 1 ? dec(v[0], n) : v.length ? 'CONFLICT' : null; };
  const out = {};
  const iA = lines.findIndex((l) => /^Applicable au /.test(l));
  out.title = lines.slice(0, iA).join(' ');
  const mo = { janvier: 1, 'février': 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12 };
  const [, d, mon, y] = /^Applicable au (\d+)\S* (\S+) (\d{4})/.exec(lines[iA]);
  out.appliesFrom = [y, String(mo[mon]).padStart(2, '0'), d.padStart(2, '0')].join('-');
  out.audience = lines.find((l) => /^OFFRE POUR LES /.test(l)).slice('OFFRE POUR LES '.length).toLowerCase();
  const em = /puissances de (\d+) à (\d+) kVA inclus/.exec(joined);
  const lg = /(Arrêté du [^,]*? relatif aux tarifs réglementés de vente de l’électricité)/.exec(joined);
  out.ext = em ? [+em[1], +em[2], lg ? lg[1] : null] : null;
  out.inj = pick(/producteurs individuels avec injection/, 6);
  out.noLinky = pick(/absence de compteur Linky/, 6);
  // the 2023-2025 wording splits the label over 3 lines; the amount sits on the middle one
  const iMid = lines.findIndex((l) => /pas mis à disposition d’index/.test(l));
  const a = pick(/absence de transmission d’index/, 6);
  const b = iMid >= 0 ? dec(lastNum(lines[iMid]), 6) : null;
  out.noIdx = a !== null ? a : b;
  out.noIdxFrom = /à partir du 1 ?er janvier 2022/.test(joined) ? '2022-01-01' : null;
  const exLine = lines.find((l) => /^- (l’Accise|la Contribution (au|aux charges de) Service Public)/i.test(l));
  const exVal = /d’un montant de (\d+,\d+) cts/.exec(exLine);
  out.excise = [/Accise/.test(exLine) ? 'Accise' : 'CSPE',
    /Anciennement CSPE/.test(joined) ? 'CSPE' : /également appelée Taxe Intérieure/.test(joined) ? 'TICFE' : null, dec(exVal[1], 4)];
  const tl = lines.find((l) => /TCFE\), d’un montant maximum/.test(l));
  out.tcfe = tl ? dec(/maximum de (\d+,\d+) cts/.exec(tl)[1], 4) : null;
  const cl = lines.find((l) => /Contribution Tarifaire d’Acheminement/.test(l));
  out.cta = cl ? /majorité des clients/.test(cl) : null;
  const vl = /TVA au taux de ([\d,]+)% pour l’abonnement(,| et la CTA,) et au taux de ([\d,]+)%/.exec(joined);
  const num = (x) => Number(x.replace(',', '.'));
  out.vat = [num(vl[1]), vl[2] === ',' ? null : num(vl[1]), num(vl[3])];
  return out;
}

try { run(); } catch (e) { console.error('ERROR', e); process.exit(2); }
if (fails.length) { console.error('check-data-prices FAILED:\n' + fails.join('\n')); process.exit(1); }
console.log('check-data-prices OK');
