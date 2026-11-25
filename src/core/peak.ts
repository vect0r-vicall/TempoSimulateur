// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Optional peak-power export ('Puissance max') and file-kind detection. */
import { ImportError } from './types';
import { MAX_BYTES, MAX_ROWS, decodeBytes } from './csv';
import { fold, parseHeader, quote, splitCells } from './periods';

export const STANDARD_KVA = [3, 6, 9, 12, 15, 18, 24, 30, 36];

export interface PeakResult {
  maxVA: number;
  suggestedKva: number; // smallest standard size >= maxVA/1000, 36 above
  days: number; // daily rows read
}
export type FileKind = 'index' | 'peak' | 'unknown';

export function suggestKva(maxVA: number): number {
  const kva = maxVA / 1000;
  return STANDARD_KVA.find((k) => k >= kva) ?? 36;
}

function checkBytes(bytes: Uint8Array): void {
  if (bytes.length > MAX_BYTES) {
    throw new ImportError('Fichier trop volumineux (5 Mo maximum). Rien n\'a été chargé.');
  }
  if (bytes.indexOf(0) >= 0) {
    throw new ImportError('Fichier binaire refusé (caractère nul détecté). Rien n\'a été chargé.');
  }
}

/**
 * 'index' when a recognised EDF index header is found, 'peak' when a line contains 'puissance max',
 * else 'unknown'. Throws a French ImportError for files > 5 MB or containing NUL bytes.
 */
export function detectFileKind(bytes: Uint8Array): FileKind {
  checkBytes(bytes);
  const lines = decodeBytes(bytes).split('\n');
  let peak = false;
  const limit = Math.min(lines.length, 200);
  for (let i = 0; i < limit; i++) {
    const l = lines[i]!.replace(/\r$/, '');
    if (l.trim() === '') continue;
    if (parseHeader(splitCells(l))) return 'index';
    if (fold(l).includes('puissance max')) peak = true;
  }
  return peak ? 'peak' : 'unknown';
}

export function parsePeakCsv(bytes: Uint8Array): PeakResult {
  checkBytes(bytes);
  const lines = decodeBytes(bytes).split('\n');
  if (lines.length > MAX_ROWS + 100) {
    throw new ImportError(`Trop de lignes (${MAX_ROWS.toLocaleString('fr-FR')} maximum). Rien n'a été chargé.`);
  }
  let i = 0;
  let found = false;
  for (; i < lines.length; i++) {
    const cells = lines[i]!.replace(/\r$/, '').split(';').map(fold);
    if (cells.length >= 2 && cells[0]!.includes('puissance max') && cells[1]!.startsWith('puissance max (va)')) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new ImportError('Format non reconnu : bloc « Puissance max quotidienne » introuvable.');
  }
  let max = 0;
  let days = 0;
  for (i++; i < lines.length; i++) {
    const l = lines[i]!.replace(/\r$/, '');
    if (l.trim() === '') break; // end of the daily block
    const cells = l.split(';');
    const d = (cells[0] ?? '').trim();
    const v = (cells[1] ?? '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) break; // next block title
    if (v === '') continue; // day without measure
    if (!/^\d{1,9}$/.test(v)) {
      throw new ImportError(`Ligne ${i + 1} : puissance invalide ${quote(v)}.`);
    }
    days++;
    if (Number(v) > max) max = Number(v);
  }
  if (days === 0) throw new ImportError('Aucune puissance max quotidienne exploitable dans ce fichier.');
  if (max === 0) throw new ImportError('Aucune puissance max exploitable : toutes les valeurs quotidiennes sont à 0 VA.');
  return { maxVA: max, suggestedKva: suggestKva(max), days };
}
