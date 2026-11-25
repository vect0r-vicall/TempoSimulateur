// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Loaded-file slots (one per kind) and the kVA choice rule; pure, shared by the UI and the checks. */
import { ImportError, ImportResult } from './types';
import { parseIndexCsv } from './csv';
import { FileKind, PeakResult, detectFileKind, parsePeakCsv } from './peak';
import { KvaSource } from './assumptions';
import { displayName } from './format';

export const DEFAULT_KVA = 6;

export interface Session {
  index: ImportResult | null;
  indexName: string;
  peak: PeakResult | null;
  peakName: string;
}

export function newSession(): Session {
  return { index: null, indexName: '', peak: null, peakName: '' };
}

/**
 * Parses a file of either kind into its slot (a second file of the same kind replaces the first).
 * On error (ImportError, French message) the session is left untouched.
 */
export function ingestFile(s: Session, bytes: Uint8Array, name: string): FileKind {
  const kind = detectFileKind(bytes);
  if (kind === 'unknown') {
    throw new ImportError('Format non reconnu : fichier d\'index EDF ou de puissance max attendu.');
  }
  if (kind === 'index') {
    const parsed = parseIndexCsv(bytes); // throws before any assignment: atomic
    s.index = parsed;
    s.indexName = displayName(name);
  } else {
    const parsed = parsePeakCsv(bytes);
    s.peak = parsed;
    s.peakName = displayName(name);
  }
  return kind;
}

/** kVA rule: a manual choice wins; else the peak-file suggestion ('au moins'); else 6 ('à vérifier'). */
export function chooseKva(peak: PeakResult | null, manual: number | null): { kva: number; source: KvaSource } {
  if (manual !== null) return { kva: manual, source: 'manual' };
  if (peak) return { kva: peak.suggestedKva, source: 'inferred' };
  return { kva: DEFAULT_KVA, source: 'default' };
}
