// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { ImportError, ImportResult } from './types';
import { Reading, classifyRow, parseHeader, quote, splitCells, Columns } from './periods';
import { buildDays, buildPeriods, dayNum } from './days';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20000;
export const MAX_GAP_DAYS = 400;
export const MAX_SPAN_DAYS = 25 * 366;

/** Strict UTF-8 first (BOM allowed), else Latin-1. */
export function decodeBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    }
    text = parts.join('');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseIndexCsv(bytes: Uint8Array): ImportResult {
  if (bytes.length > MAX_BYTES) {
    throw new ImportError('Fichier trop volumineux (5 Mo maximum). Rien n\'a été chargé.');
  }
  if (bytes.indexOf(0) >= 0) {
    throw new ImportError('Fichier binaire refusé (caractère nul détecté). Rien n\'a été chargé.');
  }
  const lines = decodeBytes(bytes).split('\n');

  // skip the preamble up to the header
  let cols: Columns | null = null;
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.replace(/\r$/, '');
    if (l.trim() === '') continue;
    cols = parseHeader(splitCells(l));
    if (cols) {
      headerIdx = i;
      break;
    }
  }
  if (!cols) {
    throw new ImportError('Format non reconnu : en-tête d\'index EDF introuvable (colonnes Heures pleines/creuses ou Tempo).');
  }

  const readings: Reading[] = [];
  let rows = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const l = lines[i]!.replace(/\r$/, '');
    if (l.trim() === '') continue;
    if (++rows > MAX_ROWS) {
      throw new ImportError(`Trop de lignes (${MAX_ROWS.toLocaleString('fr-FR')} maximum). Rien n'a été chargé.`);
    }
    readings.push(classifyRow(splitCells(l), cols, i + 1));
  }
  if (readings.length < 2) {
    throw new ImportError('Au moins deux relevés d\'index sont nécessaires.');
  }

  readings.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1]!;
    const cur = readings[i]!;
    if (prev.date === cur.date) {
      const [d, m, y] = [cur.date.slice(8), cur.date.slice(5, 7), cur.date.slice(0, 4)];
      throw new ImportError(`Ligne ${Math.max(prev.line, cur.line)} : date en double ${quote(`${d}/${m}/${y}`)} (déjà ligne ${Math.min(prev.line, cur.line)}).`);
    }
  }

  for (let i = 1; i < readings.length; i++) {
    const gap = dayNum(readings[i]!.date) - dayNum(readings[i - 1]!.date);
    if (gap > MAX_GAP_DAYS) {
      throw new ImportError(`Ligne ${readings[i]!.line} : plus de ${MAX_GAP_DAYS} jours (${gap}) sans relevé avant cette date. Fichier refusé.`);
    }
  }
  const last = readings[readings.length - 1]!;
  if (dayNum(last.date) - dayNum(readings[0]!.date) > MAX_SPAN_DAYS) {
    throw new ImportError(`Ligne ${last.line} : le fichier couvre plus de 25 ans. Fichier refusé.`);
  }

  // Atomic: everything is validated here, before the caller commits anything.
  const { days, excluded, estimatedCount } = buildDays(readings);
  if (days.length === 0) {
    throw new ImportError('Aucun jour valorisable dans ce fichier.');
  }
  return { days, periods: buildPeriods(readings, days), excluded, estimatedCount };
}
export { ImportError } from './types';
