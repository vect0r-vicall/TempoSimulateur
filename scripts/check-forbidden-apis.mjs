// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-4 [AC-10]: scan src/ (*.ts, *.html) and dist/app.js for FR-018 patterns, comments stripped.
// The ONLY exception: the `fetch` pattern is allowed in the single module src/net/weather.ts (FR-018), where it must occur
// on exactly one line; in dist/app.js (bundle) on at most one line (zero until the UI imports the module). Every other pattern has no exception.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  /\bfetch\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/, /\bEventSource\b/, /\bWorker\b/,
  /\bSharedWorker\b/, /\bimportScripts\b/, /\bcookie\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/,
  /\beval\b/, /\bFunction\b/, /\bdocument\s*\.\s*write(ln)?\b/, /\binnerHTML\b/, /\bouterHTML\b/,
  /\binsertAdjacentHTML\b/, /\bwindow\s*\.\s*open\b/, /\bsetTimeout\s*\(\s*['"`]/, /\bsetInterval\s*\(\s*['"`]/,
  // exfiltration / navigation / sandbox-escape channels the CSP does not cover
  /\blocation\b/, /\bnavigator\b/, /\bRTCPeerConnection\b/, /\bWebTransport\b/, /\bimport\s*\(/,
  /\bnew\s+Image\b/, /\bAudio\b/, /\bpostMessage\b/, /\bcreateObjectURL\b/, /\bBroadcastChannel\b/,
  /\bglobalThis\b/, /\bReflect\b/, /\.constructor\b/,
  /\b(window|self|globalThis|top|parent|frames)\s*\[/,
  /createElement\(\s*['"](script|a|form|iframe|link|meta|embed|object|base)['"]/,
  /createElementNS\(\s*[^,)]+,\s*['"](script|a|foreignObject|iframe)['"]/,
];

// Self-test: every pattern must fire on at least one hostile line (a dead pattern fails the check).
const HOSTILE = [
  'fetch(u)', 'new XMLHttpRequest()', 'new WebSocket(u)', 'navigator.sendBeacon(u)', 'new EventSource(u)', 'new Worker(u)',
  'new SharedWorker(u)', 'importScripts(u)', 'document.cookie', 'localStorage.x', 'sessionStorage.x', 'indexedDB.open()',
  'eval(x)', 'new Function(x)', 'document.write(x)', 'el.innerHTML = x', 'el.outerHTML = x', 'el.insertAdjacentHTML(a, b)',
  'window.open(u)', 'setTimeout("x", 1)', 'setInterval(`x`, 1)',
  'location.href = u', 'navigator.x', 'new RTCPeerConnection()', 'new WebTransport(u)', 'import("x")', 'new Image().src = u',
  'new Audio(u)', 'w.postMessage(d)', 'URL.createObjectURL(b)', 'new BroadcastChannel("c")', 'globalThis.x', 'Reflect.get(a, b)',
  '(0).constructor.constructor("x")()', 'window["fe" + "tch"]', 'self["x"]', 'globalThis["x"]',
  "document.createElement('script')", 'document.createElement("a")', "document.createElement('form')", "document.createElement('iframe')",
  "document.createElement('link')", "document.createElement('meta')", "document.createElement('embed')", "document.createElement('object')",
  "document.createElement('base')", "document.createElementNS(NS, 'a')",
];
for (const re of PATTERNS) {
  if (!HOSTILE.some((h) => re.test(h))) { console.error(`FAIL self-test: ${re} matches no hostile sample`); process.exit(1); }
}
if (!HOSTILE.every((h) => PATTERNS.some((re) => re.test(h)))) { console.error('FAIL self-test: a hostile sample matches no pattern'); process.exit(1); }

/** Strip // and block comments, honouring string, template and regex literals. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let prev = ''; // last significant char
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      out += src.slice(i, j + 1); i = j + 1; prev = '/'; continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

const FETCH_RE = PATTERNS[0];
const FETCH_ALLOWLIST = ['src/net/weather.ts'];
const norm = (f) => f.split('\\').join('/');
/** Patterns that apply to file f: all of them, except `fetch` in the allowlisted module and in the bundle. */
function patternsFor(f) {
  return norm(f) === 'dist/app.js' || FETCH_ALLOWLIST.includes(norm(f)) ? PATTERNS.filter((re) => re !== FETCH_RE) : PATTERNS;
}
// Self-test of the allowlist: fetch still flagged elsewhere, every other API still flagged in the allowlisted file.
if (!patternsFor('src/main.ts').includes(FETCH_RE) || !patternsFor('src/net/other.ts').includes(FETCH_RE) || !patternsFor('src/core/weather.ts').includes(FETCH_RE)) {
  console.error('FAIL self-test: fetch must stay forbidden outside the allowlisted module'); process.exit(1);
}
for (const h of HOSTILE.filter((x) => !FETCH_RE.test(x))) {
  if (!patternsFor('src/net/weather.ts').some((re) => re.test(h))) { console.error(`FAIL self-test: ${h} not flagged in allowlisted file`); process.exit(1); }
}

const files = [];
if (existsSync('src')) files.push(...walk('src').filter((f) => /\.(ts|js|mjs|html|css)$/.test(f)));
if (!existsSync('dist/app.js')) { console.error('dist/app.js missing: run npm run build first'); process.exit(2); }
files.push('dist/app.js');

let bad = 0;
for (const f of files) {
  const exempt = patternsFor(f).length !== PATTERNS.length;
  let fetchLines = 0;
  let text = readFileSync(f, 'utf8');
  text = f.endsWith('.html') ? text.replace(/<!--[\s\S]*?-->/g, '') : f.endsWith('.css') ? text.replace(/\/\*[\s\S]*?\*\//g, '') : stripComments(text);
  text.split('\n').forEach((l, i) => {
    if (exempt && FETCH_RE.test(l)) fetchLines++;
    for (const re of patternsFor(f)) if (re.test(l)) { bad++; console.error(`FAIL ${f}:${i + 1}: ${re} -> ${l.trim().slice(0, 100)}`); }
  });
  const max = 1, min = f === 'dist/app.js' ? 0 : 1; // the bundle only contains the module once the UI imports it
  if (exempt && (fetchLines > max || fetchLines < min)) { bad++; console.error(`FAIL ${f}: expected ${min === max ? 'exactly one' : 'at most one'} line using fetch, found ${fetchLines}`); }
}
if (bad) process.exit(1);
console.log(`ok: no forbidden API in ${files.length} files`);
