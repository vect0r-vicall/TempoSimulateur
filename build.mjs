// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// Build: esbuild bundles src/main.ts into a classic IIFE script; copies static files.
import { build } from 'esbuild';
import { rm, mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';

import { CSP, HEADERS, NGINX_SNIPPET } from './scripts/policy.mjs';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  sourcemap: false,
  legalComments: 'none',
  outfile: 'dist/app.js',
  logLevel: 'warning',
});

const html = await readFile('src/index.html', 'utf8');
if (!html.includes('__CSP__')) throw new Error('src/index.html: __CSP__ placeholder missing');
await writeFile('dist/index.html', html.replace('__CSP__', CSP));
await copyFile('src/app.css', 'dist/app.css');
await copyFile('favicon.svg', 'dist/favicon.svg');
await copyFile('src/robots.txt', 'dist/robots.txt');
await copyFile('src/sitemap.xml', 'dist/sitemap.xml');
await writeFile('dist/_headers', HEADERS);
await writeFile('nginx.conf.snippet', NGINX_SNIPPET);
console.log('build ok: dist/{index.html,app.js,app.css,favicon.svg,robots.txt,sitemap.xml,_headers}');
