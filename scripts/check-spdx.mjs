// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-18: every comment-capable source file carries the SPDX licence and copyright lines near its top (after a shebang or a
// doctype), the lines hold nothing else (no email), and the generators emit them so regenerated files keep them. JSON, CSV,
// Markdown, the lockfile, .gitignore and tsconfig cannot carry a comment or are documentation/data: they are covered by the
// README Licence section.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };

const LICENSE_TEXT = 'SPDX-License-Identifier: AGPL-3.0-or-later';
const COPYRIGHT_TEXT = 'SPDX-FileCopyrightText: 2026 Victor Allombert';
const lineRe = (text) => new RegExp(`^(?:\\/\\/|\\/\\*|#|<!--)\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\*\\/|-->)?$`);
const LICENSE_RE = lineRe(LICENSE_TEXT);
const COPYRIGHT_RE = lineRe(COPYRIGHT_TEXT);
/** Extensions that can hold a comment: every tracked or new file with one of them needs the header. */
const EXT = new Set(['.ts', '.mts', '.js', '.cjs', '.mjs', '.css', '.html', '.yml', '.yaml', '.svg', '.snippet', '.sh']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.build-test', '.git']);

/** True when both SPDX lines appear, as whole comment lines, in the first 8 lines. */
export function hasHeader(text) {
  const head = text.split('\n').slice(0, 8).map((l) => l.trim());
  return head.some((l) => LICENSE_RE.test(l)) && head.some((l) => COPYRIGHT_RE.test(l));
}

// self-test of the matcher (a check that cannot fail checks nothing)
const H = `${LICENSE_TEXT}\n`;
ok(hasHeader(`// ${LICENSE_TEXT}\n// ${COPYRIGHT_TEXT}\ncode`), 'self-test: slash comments accepted');
ok(hasHeader(`/* ${LICENSE_TEXT} */\n/* ${COPYRIGHT_TEXT} */\n`), 'self-test: block comments accepted');
ok(hasHeader(`#!/usr/bin/env node\n// ${LICENSE_TEXT}\n// ${COPYRIGHT_TEXT}\n`), 'self-test: header after a shebang accepted');
ok(hasHeader(`<!doctype html>\n<!-- ${LICENSE_TEXT} -->\n<!-- ${COPYRIGHT_TEXT} -->\n`), 'self-test: header after a doctype accepted');
ok(hasHeader(`# ${LICENSE_TEXT}\n# ${COPYRIGHT_TEXT}\n`), 'self-test: hash comments accepted');
ok(!hasHeader('export const a = 1;\n'), 'self-test: missing header rejected');
ok(!hasHeader(`// ${H}`), 'self-test: copyright line missing rejected');
ok(!hasHeader(`// ${LICENSE_TEXT}\n// ${COPYRIGHT_TEXT} <someone@example.org>\n`), 'self-test: an email after the name is rejected');
ok(!hasHeader(`// ${LICENSE_TEXT}X\n// ${COPYRIGHT_TEXT}\n`), 'self-test: a longer licence identifier is rejected');
ok(!hasHeader(`// SPDX-License-Identifier: GPL-3.0-only\n// ${COPYRIGHT_TEXT}\n`), 'self-test: another licence is rejected');
ok(!hasHeader(`const x = '${LICENSE_TEXT} ${COPYRIGHT_TEXT}';\n`), 'self-test: lines that are not comments are rejected');
ok(!hasHeader(`${'\n'.repeat(8)}// ${LICENSE_TEXT}\n// ${COPYRIGHT_TEXT}\n`), 'self-test: a header pushed below line 8 is rejected');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
/** Tracked plus new, non-ignored files (so a file not yet committed is checked too); a plain walk without git. */
function listFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    return walk('.').map((p) => p.replace(/^\.\//, ''));
  }
}
const files = [...new Set(listFiles())].filter((f) => EXT.has(extname(f)) && existsSync(f));
ok(files.length >= 40, `scanned ${files.length} source files (a vacuous scan would find few)`);
const missing = files.filter((f) => !hasHeader(readFileSync(f, 'utf8')));
ok(missing.length === 0, `every source file carries the SPDX header${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);

// generated outputs keep the header across regeneration because their generators emit it
const emits = [
  ['scripts/gen-prices.mjs', 'const out = `// ' + LICENSE_TEXT],
  ['scripts/gen-calendar.mjs', '`// ' + LICENSE_TEXT],
  ['scripts/policy.mjs', 'NGINX_SNIPPET = `# ' + LICENSE_TEXT],
];
for (const [f, needle] of emits) ok(!existsSync(f) || readFileSync(f, 'utf8').includes(needle), `${f} emits the SPDX header into its generated output`);

process.exit(failures ? 1 : 0);
