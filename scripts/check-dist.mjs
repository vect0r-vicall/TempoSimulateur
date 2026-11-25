// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-5 [AC-11]: meta CSP first in head, connect-src exactly the two Open-Meteo origins, exactly five dist files, _headers content.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

import { CSP, HEADER_CSP, OTHER_HEADERS, NGINX_SNIPPET, CONNECT_ORIGINS } from './policy.mjs';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };

if (!existsSync('dist')) { console.error('dist/ missing: run npm run build'); process.exit(2); }
const files = readdirSync('dist').sort();
ok(JSON.stringify(files) === JSON.stringify(['_headers', 'app.css', 'app.js', 'favicon.svg', 'index.html']), `dist has exactly the five files (${files.join(', ')})`);

const html = readFileSync('dist/index.html', 'utf8');
const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const first = /<\s*(\w+)[^>]*>/.exec(head.replace(/<!--[\s\S]*?-->/g, ''));
ok(first && first[1].toLowerCase() === 'meta' && /http-equiv=["']Content-Security-Policy["']/i.test(first[0]), 'CSP meta is the first element of head');
const content = /http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]*)"/i.exec(html)?.[1];
ok(content === CSP, 'CSP meta content exact');
ok(CSP.includes("require-trusted-types-for 'script'") && CSP.includes("default-src 'none'"), 'policy.mjs CSP has trusted types and default-src none');
// connect-src exactly the two Open-Meteo origins, every other directive unchanged (no loosening).
const EXPECTED_ORIGINS = ['https://archive-api.open-meteo.com', 'https://geocoding-api.open-meteo.com'];
const EXPECTED_DIRECTIVES = ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", `connect-src ${EXPECTED_ORIGINS.join(' ')}`, "base-uri 'none'", "form-action 'none'", "object-src 'none'", "require-trusted-types-for 'script'"];
const directives = (c) => c.split(';').map((x) => x.trim()).filter(Boolean);
const connectOf = (c) => directives(c).filter((d) => d.startsWith('connect-src'));
ok(JSON.stringify(CONNECT_ORIGINS) === JSON.stringify(EXPECTED_ORIGINS), 'policy.mjs CONNECT_ORIGINS are exactly the two Open-Meteo origins');
ok(JSON.stringify(directives(CSP)) === JSON.stringify(EXPECTED_DIRECTIVES), 'policy.mjs CSP directives are exactly the expected list (connect-src pinned, nothing else loosened)');
ok(!/\*|unsafe-|https?:\/\/(?!(archive|geocoding)-api\.open-meteo\.com(\s|;|$))/.test(CSP.replace(/connect-src [^;]*/, (m) => m.replace(/https:\/\/(archive|geocoding)-api\.open-meteo\.com/g, ''))), 'CSP has no wildcard, no unsafe-*, no other origin');
const hostileCsp = ["default-src 'none'; connect-src *", "default-src 'none'; connect-src https://archive-api.open-meteo.com https://evil.example"];
for (const c of hostileCsp) ok(JSON.stringify(directives(c)) !== JSON.stringify(EXPECTED_DIRECTIVES), `self-test: hostile CSP rejected (${c})`);
ok(/<meta[^>]*name=["']referrer["'][^>]*content=["']no-referrer["']/i.test(html), 'meta referrer no-referrer');
ok(connectOf(content ?? '').length === 1 && directives(content ?? '').join('; ') === EXPECTED_DIRECTIVES.join('; ') && !/unsafe-inline|unsafe-eval/.test(html), 'meta CSP: single connect-src with the two origins, no unsafe-*');
ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'no inline script');
ok(!/<script[^>]*\bsrc=["']https?:/i.test(html) && !/(href|src)=["'](https?:)?\/\//i.test(html), 'no external resource');
ok(!/<style[\s>]/i.test(html) && !/\sstyle\s*=/i.test(html), 'no inline style');
ok(!/\son\w+\s*=/i.test(html), 'no inline event handler');
ok(/<link[^>]*rel=["']icon["'][^>]*href=["']favicon\.svg["']/i.test(html), 'favicon link');
ok(/<noscript>[\s\S]*<\/noscript>/i.test(html), 'noscript present');
ok(/<html[^>]*lang=["']fr["']/i.test(html), 'lang=fr');

// No navigation / prefetch / injection vectors in the page (each pattern is proven on a hostile string).
const HTML_BAD = [
  [/<a[\s>]/i, '<a href=x>'], [/<form[\s>]/i, '<form action=x>'], [/<iframe[\s>]/i, '<iframe src=x>'],
  [/<frame[\s>]/i, '<frame src=x>'], [/<embed[\s>]/i, '<embed src=x>'], [/<object[\s>]/i, '<object data=x>'],
  [/<base[\s>]/i, '<base href=x>'],
  [/<meta[^>]*http-equiv=["']?refresh/i, '<meta http-equiv="refresh" content="0;url=x">'],
  [/<link[^>]*rel=["']?(prefetch|preload|preconnect|dns-prefetch)/i, '<link rel="dns-prefetch" href=x>'],
  [/<link[^>]*rel=["']?(prefetch|preload|preconnect|dns-prefetch)/i, '<link rel=preload href=x>'],
];
for (const [re, hostile] of HTML_BAD) ok(re.test(hostile), `self-test: ${re} fires on ${hostile}`);
for (const [re] of HTML_BAD) ok(!re.test(html), `dist/index.html does not match ${re}`);

const h = readFileSync('dist/_headers', 'utf8');
const hCsp = /Content-Security-Policy: ([^\n]*)/.exec(h)?.[1] ?? '';
ok(JSON.stringify(directives(hCsp)) === JSON.stringify([...EXPECTED_DIRECTIVES, "frame-ancestors 'none'"]), '_headers CSP: connect-src exactly the two origins, frame-ancestors none, nothing else');
ok(h.includes(`Content-Security-Policy: ${CSP}; frame-ancestors 'none'`) && HEADER_CSP === `${CSP}; frame-ancestors 'none'`, '_headers CSP with frame-ancestors none');
for (const [k, v] of OTHER_HEADERS) ok(h.includes(`  ${k}: ${v}\n`), `_headers ${k}: ${v}`);
for (const [k, v] of [['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'], ['Cross-Origin-Opener-Policy', 'same-origin'], ['X-Frame-Options', 'DENY'], ['Cache-Control', 'no-cache']]) {
  ok(h.includes(`${k}: ${v}`), `_headers literal ${k}: ${v}`);
}
const ng = readFileSync('nginx.conf.snippet', 'utf8');
ok(ng === NGINX_SNIPPET, 'nginx.conf.snippet equals the generated policy');
ok(ng.includes(`add_header Content-Security-Policy "${CSP}; frame-ancestors 'none'" always;`), 'nginx CSP identical to _headers');
const nCsp = /add_header Content-Security-Policy "([^"]*)"/.exec(ng)?.[1] ?? '';
ok(JSON.stringify(directives(nCsp)) === JSON.stringify([...EXPECTED_DIRECTIVES, "frame-ancestors 'none'"]), 'nginx CSP: connect-src exactly the two origins, nothing else');
// Bundle: exactly one line uses the network API (the allowlisted module, FR-018).
const js = readFileSync('dist/app.js', 'utf8').split('\n').filter((l) => /\bfetch\b/.test(l));
const jsCount = js.reduce((n, l) => n + (l.match(/\bfetch\b/g) ?? []).length, 0);
ok(jsCount === 1 && js.every((l) => /\bfetch\(\s*\w+\s*,\s*\w+\s*\)/.test(l)), `dist/app.js: exactly one fetch occurrence, the allowlisted module call site (found ${jsCount})`);
ok(/^\s*connect-src/.test('connect-src x') && connectOf("default-src 'none'; connect-src a").length === 1, 'self-test: connectOf parses');
ok(/autoindex off;/.test(ng) && /\(GET\|HEAD\)/.test(ng) && /Permissions-Policy/.test(ng) && /Cross-Origin-Opener-Policy "same-origin"/.test(ng) && /X-Frame-Options "DENY"/.test(ng) && /Cache-Control "no-cache"/.test(ng), 'nginx: autoindex off, GET/HEAD only, extra headers');
process.exit(bad ? 1 : 0);
