// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Bundles TS entry points into .build-test/ (ESM, node) then runs every scripts/check-*.mjs that exists.
// Checks import bundles like: import('../.build-test/core/csv.mjs') (one bundle per src/core/*.ts and src/data/*.ts).
import { build } from 'esbuild';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('.build-test', { recursive: true, force: true });
const entries = [];
for (const dir of ['src/core', 'src/data', 'src/net']) {
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.ts')) entries.push(`${dir}/${f}`);
}
await build({
  entryPoints: entries,
  outdir: '.build-test',
  outbase: 'src',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
});
console.log(`bundled ${entries.length} entry points into .build-test/`);

const ORDER = ['import', 'pricing', 'tariffs', 'chart', 'viewrecap', 'shortcuts', 'weather', 'weather-scene', 'weather-review', 'weather-details', 'forbidden-apis', 'dist', 'data'];
const present = readdirSync('scripts').filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => f.slice(6, -4));
const names = [...ORDER.filter((n) => present.includes(n)), ...present.filter((n) => !ORDER.includes(n)).sort()];
for (const n of ORDER) if (!present.includes(n)) console.log(`skip: scripts/check-${n}.mjs not present yet`);

let failed = 0;
for (const n of names) {
  console.log(`\n== check-${n} ==`);
  const r = spawnSync(process.execPath, [`scripts/check-${n}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`check-${n} FAILED (exit ${r.status})`); }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
