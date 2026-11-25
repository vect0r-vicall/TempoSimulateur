// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { Bucket, ImportError, PeriodKind } from './types';

export const HCHP_BUCKETS: Bucket[] = ['hp', 'hc'];
export const TEMPO_BUCKETS: Bucket[] = ['bleuHC', 'bleuHP', 'blancHC', 'blancHP', 'rougeHC', 'rougeHP'];

export function bucketsOf(kind: PeriodKind): Bucket[] {
  return kind === 'hchp' ? HCHP_BUCKETS : TEMPO_BUCKETS;
}

export interface Reading {
  date: string; // YYYY-MM-DD
  line: number; // physical 1-based line in the file
  kind: PeriodKind;
  values: Partial<Record<Bucket, number>>;
}

export interface Columns {
  date: number;
  buckets: Map<number, Bucket>;
}

/** Lower-case, accents removed. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Splits a CSV line on ';' and strips one pair of surrounding double quotes from every cell (re-saved files). */
export function splitCells(line: string): string[] {
  return line.split(';').map((c) => {
    const t = c.trim();
    return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : c;
  });
}

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** Truncate quoted file content for error messages. */
export function quote(s: string): string {
  const t = s.length > 40 ? s.slice(0, 39) + '…' : s;
  return '« ' + t + ' »';
}

function bucketOfHeader(h: string): Bucket | null {
  const creuse = h.includes('creuse');
  const pleine = h.includes('pleine');
  if (creuse === pleine) return null;
  const colour = h.includes('bleu') ? 'bleu' : h.includes('blanc') ? 'blanc' : h.includes('rouge') ? 'rouge' : '';
  const hc = creuse;
  if (colour === '') return hc ? 'hc' : 'hp';
  return (colour + (hc ? 'HC' : 'HP')) as Bucket;
}

/** Returns the column mapping, or null if the line is not a recognised header. */
export function parseHeader(cells: string[]): Columns | null {
  const folded = cells.map(fold);
  const date = folded.findIndex((h) => h.includes('date'));
  if (date < 0) return null;
  const buckets = new Map<number, Bucket>();
  const seen = new Set<Bucket>();
  folded.forEach((h, i) => {
    if (i === date) return;
    const b = bucketOfHeader(h);
    if (b && !seen.has(b)) {
      seen.add(b);
      buckets.set(i, b);
    }
  });
  const hchp = HCHP_BUCKETS.every((b) => seen.has(b));
  const tempo = TEMPO_BUCKETS.every((b) => seen.has(b));
  if (!hchp && !tempo) return null;
  return { date, buckets };
}

/** Contract period of a row = the non-empty column group. */
export function classifyRow(cells: string[], cols: Columns, line: number): Reading {
  const values: Partial<Record<Bucket, number>> = {};
  const present = new Set<Bucket>();
  for (const [i, b] of cols.buckets) {
    const raw = (cells[i] ?? '').trim();
    if (raw === '') continue;
    if (!/^\d{1,12}$/.test(raw)) {
      throw new ImportError(`Ligne ${line} : valeur d'index invalide ${quote(raw)}.`);
    }
    values[b] = Number(raw);
    present.add(b);
  }
  const hchpN = HCHP_BUCKETS.filter((b) => present.has(b)).length;
  const tempoN = TEMPO_BUCKETS.filter((b) => present.has(b)).length;
  if (hchpN > 0 && tempoN > 0) {
    throw new ImportError(`Ligne ${line} : index Heures pleines/creuses et index Tempo renseignés ensemble.`);
  }
  let kind: PeriodKind;
  if (hchpN === HCHP_BUCKETS.length) kind = 'hchp';
  else if (tempoN === TEMPO_BUCKETS.length) kind = 'tempo';
  else if (hchpN + tempoN === 0) throw new ImportError(`Ligne ${line} : aucun index renseigné.`);
  else throw new ImportError(`Ligne ${line} : colonnes d'index incomplètes.`);
  const date = parseFrDate(cells[cols.date] ?? '', line);
  return { date, line, kind, values };
}

export function parseFrDate(raw: string, line: number): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (m) {
    const [y, mo, d] = [Number(m[3]), Number(m[2]), Number(m[1])];
    if (y < MIN_YEAR || y > MAX_YEAR) {
      throw new ImportError(`Ligne ${line} : année ${y} hors plage (${MIN_YEAR} à ${MAX_YEAR}). Fichier refusé.`);
    }
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  throw new ImportError(`Ligne ${line} : date invalide ${quote(raw.trim())} (JJ/MM/AAAA attendu).`);
}
