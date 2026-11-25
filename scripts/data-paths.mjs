// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Locates optional local inputs for the checks. No path is guessed: everything is explicit.
// PDFs: the public EDF price grids (not private). Set TEMPO_PDF_DIR=<dir with tarifs-YYYYMMDD.pdf>
// (or TEMPO_DATA_DIR=<parent dir containing grilles/>) to enable the PDF re-parse check.
// CSVs: only the committed SYNTHETIC demo files in tests/demo-data/, and only when TEMPO_DEMO_DATA is set (opt-in).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function pdfDir() {
  if (process.env.TEMPO_PDF_DIR) return process.env.TEMPO_PDF_DIR;
  const d = process.env.TEMPO_DATA_DIR;
  return d && existsSync(join(d, 'grilles')) ? join(d, 'grilles') : null;
}

// kind: 'index' | 'peak'. Returns the committed demo file path, or null unless TEMPO_DEMO_DATA is set.
export function demoCsv(kind) {
  if (!process.env.TEMPO_DEMO_DATA) return null;
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'demo-data');
  const f = join(root, kind === 'index' ? 'mes-index-elec-demo.csv' : 'ma-puissance-max-demo.csv');
  return existsSync(f) ? f : null;
}
