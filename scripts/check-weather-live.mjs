// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-15 [AC-43..AC-47, FR-051..FR-054]: live place search. Pure state machine with fake timers/clock and a fake search,
// network module (places cache, AbortSignal) with a fake fetchFn, UI source assertions. No real network, no real timers.
// exit 0 pass, 1 assertion failed, >=2 error.
import { readFileSync } from 'node:fs';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);

const L = await import('../.build-test/core/livesearch.mjs');
const N = await import('../.build-test/net/weather.mjs');
const { createLiveSearch, DEBOUNCE_MS } = L;
ok(DEBOUNCE_MS === 400, 'debounce delay is 400 ms');
ok(N.sanitiseQuery('p') === null && N.sanitiseQuery(' a ') === null && N.sanitiseQuery('pa') === 'pa' && N.sanitiseQuery('x'.repeat(61)) === null && N.MIN_QUERY === 2, 'real sanitiser: 1 character rejected, 2 accepted, > 60 rejected');

// ---- fake world: manual clock, timers, controllable search ----
function world() {
  const w = { t: 0, timers: [], nextId: 1, calls: [], events: [], pending: [] };
  const deps = {
    schedule: (fn, ms) => { const id = w.nextId++; w.timers.push({ id, at: w.t + ms, fn }); return id; },
    cancel: (id) => { w.timers = w.timers.filter((x) => x.id !== id); },
    now: () => w.t,
    sanitise: (s) => { const q = s.replace(/\s+/g, ' ').trim(); return q.length >= 2 && q.length <= 60 ? q : null; },
    search: (q, signal) => new Promise((resolve, reject) => { const c = { q, signal, resolve, reject, at: w.t }; w.calls.push(c); w.pending.push(c); }),
    isOk: (r) => r.ok,
    onIdle: () => w.events.push(['idle']),
    onLoading: (q) => w.events.push(['loading', q]),
    onResult: (q, r) => w.events.push(['result', q, r.ok ? r.tag : 'ERR']),
    onError: (q) => w.events.push(['error', q]),
  };
  w.advance = (ms) => {
    const end = w.t + ms;
    for (;;) {
      const next = w.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      w.timers = w.timers.filter((x) => x !== next);
      w.t = next.at;
      next.fn();
    }
    w.t = end;
  };
  w.flush = () => new Promise((r) => setTimeout(r, 0)); // real microtask turn only, no timing assertion depends on it
  w.live = createLiveSearch(deps);
  return w;
}
const res = (tag) => ({ ok: true, tag });

{ // nothing happens without input; no call before the delay
  const w = world();
  w.advance(5000);
  ok(w.calls.length === 0, 'no call without any input');
  w.live.input('pa');
  w.advance(399);
  ok(w.calls.length === 0, 'no call before 400 ms');
  w.advance(1);
  ok(w.calls.length === 1 && w.calls[0].q === 'pa', 'one call exactly at 400 ms after the last keystroke');
}
{ // rapid typing coalesces into one call with the last text
  const w = world();
  for (const t of ['pa', 'par', 'pari', 'paris']) { w.live.input(t); w.advance(100); }
  ok(w.calls.length === 0, 'rapid typing (100 ms gaps) fires nothing meanwhile');
  w.advance(300);
  ok(w.calls.length === 1 && w.calls[0].q === 'paris', 'rapid typing coalesces into ONE call with the last text');
}
{ // < 2 chars: no call, clears the list, cancels pending timer and in-flight
  const w = world();
  w.live.input('p'); w.advance(1000);
  ok(w.calls.length === 0 && w.events.some((e) => e[0] === 'idle'), '1 character: no call, list cleared (idle)');
  w.live.input('paris'); w.advance(100);
  w.live.input('p');
  ok(w.timers.length === 0, 'going below 2 characters clears the debounce timer');
  w.advance(1000);
  ok(w.calls.length === 0, 'and nothing fires later');
  w.live.input('lyon'); w.advance(400);
  const c = w.calls[0];
  w.live.input('');
  ok(c.signal.aborted, 'clearing the field aborts the in-flight request');
  w.events.length = 0;
  c.resolve(res('late')); await w.flush();
  ok(!w.events.some((e) => e[0] === 'result'), 'its late result is dropped after the field was cleared');
  w.live.input('   '); w.live.input('a');
  ok(w.calls.length === 1, 'whitespace-only / 1 char never calls');
}
{ // Enter fires immediately and cancels the timer
  const w = world();
  w.live.input('par'); w.advance(50);
  w.live.submit('par');
  ok(w.calls.length === 1 && w.calls[0].q === 'par' && w.timers.length === 0, 'Enter fires immediately and cancels the pending timer');
  w.advance(1000);
  ok(w.calls.length === 1, 'no second call from the cancelled timer');
  const v = world();
  v.live.submit('p');
  ok(v.calls.length === 0, 'Enter with 1 character fires nothing');
}
{ // superseded result is dropped, in-flight request is aborted
  const w = world();
  w.live.input('par'); w.advance(400);
  w.live.input('lyon'); w.advance(400);
  ok(w.calls.length === 2 && w.calls[0].signal.aborted && !w.calls[1].signal.aborted, 'a new query aborts the previous request (one in flight)');
  w.calls[1].resolve(res('lyon')); await w.flush();
  w.calls[0].resolve(res('stale-par')); await w.flush();
  const results = w.events.filter((e) => e[0] === 'result');
  eq(results, [['result', 'lyon', 'lyon']], 'the stale result of the superseded query is dropped (token)');
}
{ // untick (reset): timer cleared, in-flight dropped
  const w = world();
  w.live.input('paris'); w.advance(100);
  w.live.reset();
  ok(w.timers.length === 0, 'untick clears the debounce timer');
  w.advance(2000);
  ok(w.calls.length === 0, 'type then untick within 400 ms: zero calls');
  w.live.input('paris'); w.advance(400);
  const c = w.calls[0];
  w.live.reset();
  ok(c.signal.aborted, 'untick aborts the in-flight request');
  c.resolve(res('late')); await w.flush();
  ok(!w.events.some((e) => e[0] === 'result'), 'untick: its late result is dropped');
}
{ // identical consecutive query does not refire; failure allows retry
  const w = world();
  w.live.input('paris'); w.advance(400);
  w.calls[0].resolve(res('paris')); await w.flush();
  w.live.input('paris'); w.advance(2000);
  w.live.input('  paris '); w.advance(2000);
  w.live.submit('paris');
  ok(w.calls.length === 1, 'identical consecutive sanitised query (also with Enter, extra spaces) does not refire');
  w.live.input('lyon'); w.advance(400);
  ok(w.calls.length === 2, 'a different query fires');
  w.calls[1].resolve({ ok: false, message: 'x' }); await w.flush();
  w.live.input('lyon'); w.advance(400);
  ok(w.calls.length === 3, 'after a failed result the same query may be retried');
}
{ // errors surface; rejections too, only for the latest
  const w = world();
  w.live.input('paris'); w.advance(400);
  w.calls[0].resolve({ ok: false, message: 'Service météo injoignable.' }); await w.flush();
  eq(w.events.filter((e) => e[0] === 'result'), [['result', 'paris', 'ERR']], 'a failed result is surfaced to the UI');
  const v = world();
  v.live.input('paris'); v.advance(400);
  v.calls[0].reject(new Error('boom')); await v.flush();
  ok(v.events.some((e) => e[0] === 'error' && e[1] === 'paris'), 'a rejected search is surfaced as an error');
  const u = world();
  u.live.input('paris'); u.advance(400);
  u.live.input('lyon'); u.advance(400);
  u.calls[0].reject(new Error('old')); await u.flush();
  ok(!u.events.some((e) => e[0] === 'error'), 'a superseded rejection is dropped');
}
{ // loading state announced before the call; rate safety by construction
  const w = world();
  w.live.input('paris'); w.advance(400);
  eq(w.events[0], ['loading', 'paris'], 'loading state reported when the request starts');
  // Enter within 400 ms of the previous request is spaced, never faster than one request per 400 ms
  w.live.submit('lyon');
  ok(w.calls.length === 1, 'Enter right after a request does not fire a second one immediately');
  w.advance(399);
  ok(w.calls.length === 1, '... not before 400 ms have elapsed since the previous request');
  w.advance(1);
  ok(w.calls.length === 2 && w.calls[1].at - w.calls[0].at >= 400, '... but exactly when 400 ms have elapsed');
  // fuzz: random typing / Enter / reset never makes two requests closer than 400 ms
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const f = world();
  const words = ['pa', 'par', 'paris', 'lyon', 'nice', 'x', '', 'lille', 'brest'];
  for (let i = 0; i < 400; i++) {
    const a = rnd(10), t = words[rnd(words.length)];
    if (a < 6) f.live.input(t); else if (a < 8) f.live.submit(t); else if (a < 9) f.live.reset();
    f.advance(rnd(500));
  }
  f.advance(2000);
  let minGap = Infinity;
  for (let i = 1; i < f.calls.length; i++) minGap = Math.min(minGap, f.calls[i].at - f.calls[i - 1].at);
  ok(f.calls.length > 5 && minGap >= 400, `fuzz: ${f.calls.length} calls, minimum spacing ${minGap} ms >= 400 ms`);
}

// ---- network module: places cache and abort ----
const place = { name: 'Lyon', latitude: 45.75, longitude: 4.85, country: 'France', admin1: 'Auvergne-Rhône-Alpes' };
const resp = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const fake = (handler) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls.length); }; f.calls = calls; return f; };
{
  N.clearWeatherCache();
  const f = fake(() => resp({ results: [place] }));
  const r1 = await N.searchPlaces('Lyon', f);
  const r2 = await N.searchPlaces('  lyon ', f);
  const r3 = await N.searchPlaces('LYON', f);
  ok(r1.ok && r2.ok && r3.ok && f.calls.length === 1, 'places cache: same lowercase sanitised query is served without a second request');
  await N.searchPlaces('Nice', f);
  ok(f.calls.length === 2, 'a different query requests again');
  N.clearWeatherCache();
  await N.searchPlaces('Lyon', f);
  ok(f.calls.length === 3, 'clearWeatherCache clears the places cache too');
  const bad = fake(() => resp({ reason: 'x' }, 400));
  await N.searchPlaces('Metz', bad); await N.searchPlaces('Metz', bad);
  ok(bad.calls.length === 2, 'failures are not cached');
  N.clearWeatherCache();
}
{ // abort
  const f = fake((_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))));
  const ctl = new AbortController();
  const p = N.searchPlaces('Lyon', f, ctl.signal);
  ok(f.calls.length === 1 && f.calls[0].init.signal instanceof AbortSignal && f.calls[0].init.signal !== ctl.signal, 'the request carries a merged signal (own timeout signal), not the raw external one');
  ctl.abort();
  const r = await p;
  ok(!r.ok && r.aborted === true && /annul/.test(r.message) && !/injoignable|délai/.test(r.message), 'AbortSignal aborts the request: French non-error "annulé" result flagged aborted');
  const g = fake(() => resp({ results: [place] }));
  const pre = new AbortController(); pre.abort();
  const r2 = await N.searchPlaces('Lyon', g, pre.signal);
  ok(!r2.ok && r2.aborted === true && g.calls.length === 0, 'pre-aborted signal: no request at all');
  const h = fake(() => resp({ results: [place] }));
  const r3 = await N.searchPlaces('Lyon', h, new AbortController().signal);
  const i = h.calls[0].init;
  ok(r3.ok && i.method === 'GET' && i.credentials === 'omit' && i.referrerPolicy === 'no-referrer' && i.cache === 'no-store' && i.redirect === 'error', 'net options unchanged with a signal');
  N.clearWeatherCache();
  const t = fake(() => { throw new TypeError('net'); });
  const r4 = await N.searchPlaces('Lyon', t, new AbortController().signal);
  ok(!r4.ok && !r4.aborted && /injoignable/.test(r4.message), 'a real network error with an unaborted signal is still an error');
  N.clearWeatherCache();
}

// ---- UI / page sources ----
const ui = readFileSync('src/ui/weather.ts', 'utf8') + readFileSync('src/core/weatherpanel.ts', 'utf8'); // wiring + controller (behaviour is tested in CHECK-16)
const html = readFileSync('src/index.html', 'utf8');
const css = readFileSync('src/app.css', 'utf8');
const ctl = readFileSync('src/ui/controls.ts', 'utf8');
ok(!/Rechercher/.test(ui) && !/node\('button'[^)]*Rechercher/.test(ui), 'no "Rechercher" button in the weather UI');
ok(/createLiveSearch/.test(ui) && /'input'/.test(ui) && /ev\.key === 'Enter'/.test(ui) && /submit\(/.test(ui), 'UI wires input events and Enter to the live search');
ok(/ArrowDown/.test(ui) && /ArrowUp/.test(ui) && /Escape/.test(ui), 'keyboard: ArrowDown/ArrowUp/Escape handled');
ok(/'Recherche…'/.test(ui) && /Aucun lieu trouvé\./.test(ui), 'status texts Recherche… and Aucun lieu trouvé.');
ok(/r\.aborted/.test(ui), 'UI ignores aborted results');
ok(/setFieldText\(pl\.label\)/.test(ui), 'choosing a place fills the field with its label');
ok(/saisie du lieu \(après une courte pause, ou tout de suite avec Entrée\)/.test(ui) && /Open-Meteo/.test(ui) && /adresse IP/.test(ui) && /position approximative/.test(ui) && /rien de votre fichier/.test(ui) && /la période affichée/.test(ui),
  'privacy note: typed text after a short pause, period, IP, approximate position, nothing from the file');
ok(!/style\s*=|\.style\b|setAttribute\('style'/.test(ui + ctl), 'no inline style in the controls / weather UI');
ok(/<h2 id="controls-title">Param&egrave;tres<\/h2>/.test(html) && /aria-labelledby="controls-title"/.test(html), 'block heading "Paramètres" with its aria-labelledby');
ok(!/<h2[^>]*>\s*\d\.\s/.test(html), 'no numbered step prefix left on any heading');
ok(/@media \(min-width: 700px\)\s*\{\s*\.controls \{ grid-template-columns:/.test(css), 'controls grid with a 700 px breakpoint (single column below)');
ok(!/setTimeout|clearTimeout/.test(readFileSync('src/core/livesearch.ts', 'utf8')) && !/document\.|window\./.test(readFileSync('src/core/livesearch.ts', 'utf8')), 'live-search core is pure (no timers, no DOM)');
const bundle = (() => { try { return readFileSync('dist/app.js', 'utf8'); } catch { return ''; } })();
if (bundle) ok((bundle.match(/\bfetch\b/g) ?? []).length === 1, 'bundle still has exactly one fetch occurrence');

process.exit(failures ? 1 : 0);
