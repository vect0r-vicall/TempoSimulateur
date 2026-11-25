// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-16 [AC-48..AC-52, FR-055..FR-058]: interaction rules of the weather panel.
// Part A: the pure controller (src/core/weatherpanel.ts) with fake timers and fake ports.
// Part B: the REAL src/ui/weather.ts bundled and driven through a minimal fake DOM, fake timers and a fake fetch (no browser, no network).
// exit 0 pass, 1 assertion failed, >=2 error.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(w)})`);
const flush = () => new Promise((r) => setImmediate(r));

const { createWeatherController } = await import('../.build-test/core/weatherpanel.mjs');

const P1 = { label: 'Paris, Île-de-France, France', latitude: 48.85, longitude: 2.35 };
const P2 = { label: 'Parisx, Texas, États-Unis', latitude: 33.66, longitude: -95.55 };
const PER = { from: '2025-01-01', to: '2025-01-03' };
const PER2 = { from: '2025-01-01', to: '2025-01-10' };
const day = (d) => ({ date: d, mean: 10, min: 5, max: 15 });

// ================= Part A: pure controller =================
function world() {
  const w = { t: 0, timers: [], nextId: 1, searches: [], loads: [], status: '', statusErr: false, list: [], log: [], enabled: false, field: null, weather: 'unset' };
  const ports = {
    schedule: (fn, ms) => { const id = w.nextId++; w.timers.push({ id, at: w.t + ms, fn }); return id; },
    cancel: (id) => { w.timers = w.timers.filter((x) => x.id !== id); },
    now: () => w.t,
    sanitise: (s) => { const q = s.replace(/\s+/g, ' ').trim(); return q.length >= 2 && q.length <= 60 ? q : null; },
    search: (q, signal) => new Promise((resolve) => { w.searches.push({ q, signal, resolve }); }),
    loadTemps: (place, period) => new Promise((resolve) => { w.loads.push({ place, period, resolve }); }),
    setEnabled: (on) => { w.enabled = on; },
    setStatus: (t, e) => { w.status = t; w.statusErr = e; },
    showResults: (places) => { w.list = places; w.log.push('show'); },
    clearResults: () => { w.list = []; w.log.push('clear'); },
    setFieldText: (t) => { w.field = t; w.log.push('field'); },
    focusField: () => w.log.push('focusField'),
    focusResults: () => w.log.push('focusResults'),
    setWeather: (d) => { w.weather = d; w.log.push('weather'); },
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
  w.count = (e) => w.log.filter((x) => x === e).length;
  w.c = createWeatherController(ports);
  return w;
}
/** ticked, typed 'par', result shown (2 places). */
async function withList() {
  const w = world();
  w.c.tick(true);
  w.c.input('paris', false); w.advance(400);
  w.searches[0].resolve({ ok: true, places: [P1, P2] }); await flush();
  return w;
}

{ // no search on tick alone
  const w = world();
  w.c.tick(true);
  w.advance(10000);
  ok(w.searches.length === 0 && w.timers.length === 0 && w.enabled, 'tick alone (also after 10 s): no search, no timer, field enabled');
  w.c.input('p', false); w.advance(1000);
  ok(w.searches.length === 0, '1 character: no search');
  w.c.input('pa', false); w.advance(399);
  ok(w.searches.length === 0, 'no search before 400 ms');
  w.advance(1);
  ok(w.searches.length === 1 && w.searches[0].q === 'pa', 'one search 400 ms after typing');
}
{ // typing while unticked does nothing
  const w = world();
  w.c.input('paris', false); w.c.enter('paris', false); w.advance(2000);
  ok(w.searches.length === 0 && w.timers.length === 0, 'input/Enter while unticked: nothing');
}
{ // untick cancels the timer
  const w = world();
  w.c.tick(true); w.c.input('paris', false); w.advance(100);
  w.c.tick(false);
  ok(w.timers.length === 0, 'untick cancels the pending timer');
  w.advance(2000);
  ok(w.searches.length === 0 && !w.enabled, 'type then untick within 400 ms: zero searches, field disabled');
}
{ // untick cancels in-flight, drops late result, clears list/status/overlay, keeps field text
  const w = await withList();
  w.c.input('lyon', false); w.advance(400);
  const s = w.searches[1];
  w.c.tick(false);
  ok(s.signal.aborted, 'untick aborts the in-flight search');
  eq([w.list.length, w.status, w.weather], [0, '', null], 'untick clears the list and the status and removes the overlay');
  const before = w.log.length;
  s.resolve({ ok: true, places: [P1] }); await flush();
  ok(w.log.length === before && w.list.length === 0, 'its late result is dropped');
  ok(!w.log.includes('field'), 'untick never rewrites the field text');
}
{ // retick: no auto search, Enter searches the kept text
  const w = await withList();
  w.c.tick(false);
  w.c.tick(true); w.advance(5000);
  ok(w.searches.length === 1, 'retick with kept text: no search on tick alone');
  w.c.enter('paris', false);
  ok(w.searches.length === 2 && w.searches[1].q === 'paris', 'Enter after retick searches the kept text (same query allowed again)');
}
{ // choose: resets machine, focuses field, keeps status, Enter does not search
  const w = await withList();
  w.c.periodChanged(PER);
  w.c.input('parisx', false); // timer pending after the list was shown
  ok(w.timers.length === 1, 'precondition: a debounce timer is pending');
  w.c.input('pariz', false); w.advance(400); // in flight again
  const inflight = w.searches[1];
  w.c.input('parizz', false); // another pending timer
  w.c.choose(P1);
  ok(w.timers.length === 0, 'choose cancels the pending debounce timer');
  ok(inflight.signal.aborted, 'choose aborts the in-flight search');
  ok(w.field === P1.label && w.list.length === 0, 'choose fills the field with the label and closes the list');
  ok(w.log.at(-1) !== undefined && w.log.includes('focusField'), 'choose moves focus back to the field');
  eq(w.status, 'Chargement de la météo…', 'choose starts the temperature load');
  inflight.resolve({ ok: true, places: [P2] }); await flush();
  w.advance(5000);
  ok(w.list.length === 0 && w.status === 'Chargement de la météo…', 'late search result and timers do not reopen the list nor overwrite the status');
  w.loads[0].resolve({ ok: true, days: [day('2025-01-01'), day('2025-01-02'), day('2025-01-03')], missing: 0 }); await flush();
  eq(w.status, '3 jours de météo chargés', 'load result status');
  w.advance(5000); await flush();
  eq([w.status, w.list.length, w.searches.length], ['3 jours de météo chargés', 0, 2], 'status kept and no new search after choosing');
  w.c.enter(P1.label, false);
  ok(w.searches.length === 2 && w.timers.length === 0, 'Enter right after choosing sends nothing (the label is not typed text)');
  w.c.input(P1.label + 'x', false); w.c.enter(P1.label + 'x', false);
  ok(w.searches.length === 3 && w.searches[2].q === P1.label + 'x', 'editing the field re-arms the search (Enter sends the edited text)');
}
{ // same query searchable again after choose / Escape
  const w = await withList();
  w.c.choose(P1);
  w.c.input('paris', false); w.advance(400);
  ok(w.searches.length === 2 && w.searches[1].q === 'paris', 'same query is searched again after a choice');
  w.searches[1].resolve({ ok: true, places: [P1] }); await flush();
  ok(w.list.length === 1, 'and its list is shown');
  w.c.escapeField();
  ok(w.list.length === 0 && w.status === '', 'Escape in the field clears the list and the search status');
  w.c.input('paris', false); w.advance(400);
  ok(w.searches.length === 3, 'same query is searched again after Escape');
  w.searches[2].resolve({ ok: true, places: [P1] }); await flush();
  w.c.escapeList();
  ok(w.list.length === 0 && w.status === '' && w.log.at(-1) === 'focusField', 'Escape in the list clears it, clears the status and refocuses the field');
  w.c.input('paris', false); w.advance(400);
  ok(w.searches.length === 4, 'same query is searched again after Escape from the list');
}
{ // Escape keeps a load status
  const w = await withList();
  w.c.periodChanged(PER); w.c.choose(P1);
  w.loads[0].resolve({ ok: true, days: [day('2025-01-01')], missing: 0 }); await flush();
  w.c.escapeField();
  eq(w.status, '1 jours de météo chargés', 'Escape does not erase the load status');
}
{ // IME
  const w = world();
  w.c.tick(true);
  w.c.input('p', true); w.c.input('pa', true); w.c.input('par', true); w.advance(3000);
  ok(w.searches.length === 0 && w.timers.length === 0, 'composing input events: no timer, no search');
  w.c.enter('par', true);
  ok(w.searches.length === 0, 'Enter while composing sends nothing');
  w.c.compositionEnd('パリ'); w.advance(399);
  ok(w.searches.length === 0, 'compositionEnd is debounced');
  w.advance(1);
  ok(w.searches.length === 1 && w.searches[0].q === 'パリ', 'search runs 400 ms after compositionEnd with the validated text');
  const v = world();
  v.c.compositionEnd('paris'); v.advance(2000);
  ok(v.searches.length === 0, 'compositionEnd while unticked: nothing');
}
{ // ArrowDown keeps the list when the timer would fire
  const w = await withList();
  const clears = w.count('clear');
  w.c.input('parisx', false);
  w.c.arrowDown();
  ok(w.log.at(-1) === 'focusResults' && w.timers.length === 0, 'ArrowDown moves focus to the list and cancels the pending timer');
  w.advance(5000);
  ok(w.count('clear') === clears && w.list.length === 2 && w.searches.length === 1, 'the list survives the would-be timer: not cleared, no new search');
  const v = world();
  v.c.tick(true); v.c.input('paris', false);
  v.c.arrowDown();
  ok(!v.log.includes('focusResults') && v.timers.length === 1, 'ArrowDown without a list does nothing (timer kept)');
}
{ // period changes
  const w = world();
  w.c.periodChanged(PER);
  ok(w.loads.length === 0, 'period change while unticked and no place: no load');
  w.c.tick(true); w.c.periodChanged(PER2);
  ok(w.loads.length === 0, 'period change ticked but no place chosen: no load');
  w.c.input('paris', false); w.advance(400);
  w.searches[0].resolve({ ok: true, places: [P1] }); await flush();
  w.c.choose(P1);
  ok(w.loads.length === 1 && w.loads[0].period.to === PER2.to, 'choosing loads the current period');
  w.c.periodChanged({ ...PER2 });
  ok(w.loads.length === 1, 'same period: no reload');
  w.c.periodChanged(PER);
  ok(w.loads.length === 2, 'new period with a chosen place: reload');
  // stale loads dropped
  w.loads[0].resolve({ ok: true, days: [day('x')], missing: 0 }); await flush();
  ok(w.weather === 'unset' || w.weather === null, 'stale load result dropped');
  w.loads[1].resolve({ ok: true, days: [day('2025-01-01'), { date: '2025-01-02', mean: null, min: null, max: null }], missing: 1 }); await flush();
  eq(w.status, '1 jours de météo chargés (données manquantes pour les autres jours)', 'latest load shown with the missing-days wording');
  w.c.periodChanged(PER2);
  w.c.tick(false);
  w.loads[2].resolve({ ok: true, days: [day('2025-01-01')], missing: 0 }); await flush();
  ok(w.weather === null && w.status === '', 'load finishing after untick is dropped');
  w.c.tick(true);
  w.c.periodChanged(PER);
  ok(w.loads.length === 3, 'after untick the place is forgotten: period change does not load');
}
{ // load error and missing period
  const w = world();
  w.c.tick(true); w.c.input('paris', false); w.advance(400);
  w.searches[0].resolve({ ok: true, places: [P1] }); await flush();
  w.c.choose(P1);
  eq(w.status, 'Chargez d\'abord un fichier d\'index : la météo sera chargée pour sa période.', 'no period yet: explicit message, no load');
  w.c.periodChanged(PER);
  w.loads[0].resolve({ ok: false, message: 'boom' }); await flush();
  ok(w.status === 'boom' && w.statusErr && w.weather === null, 'load error shown in error style, overlay removed');
}
{ // search statuses
  const w = world();
  w.c.tick(true); w.c.input('zzz', false); w.advance(400);
  eq(w.status, 'Recherche…', 'status while loading');
  w.searches[0].resolve({ ok: true, places: [] }); await flush();
  eq(w.status, 'Aucun lieu trouvé.', 'empty answer');
  w.c.input('abc', false); w.advance(400);
  w.searches[1].resolve({ ok: false, message: 'Recherche annulée.', aborted: true }); await flush();
  eq(w.status, 'Recherche…', 'aborted result ignored');
  w.c.input('a', false);
  eq(w.status, '', 'below 2 characters clears the search status');
}

// ================= Part B: the real UI wiring through a fake DOM =================
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.l = {}; this.attrs = {}; this._text = ''; this.className = ''; this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.cls = new Set(); this.classList = { toggle: (c, on) => { on ? this.cls.add(c) : this.cls.delete(c); }, add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c) }; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(t) { this._text = t; this.children = []; fix(); }
  append(...k) { for (const c of k) { if (typeof c === 'string') this._text += c; else { c.parent = this; this.children.push(c); } } }
  replaceChildren(...k) { this.children = []; this.append(...k); fix(); }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  querySelectorAll(sel) { const out = []; const walk = (e) => { for (const c of e.children) { if (c.tag === sel) out.push(c); walk(c); } }; walk(this); return out; }
  contains(x) { return x === this || this.children.some((c) => c.contains(x)); }
  focus() { doc.activeElement = this; }
  fire(type, ev = {}) { const e = { key: '', isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...ev }; for (const f of this.l[type] ?? []) f(e); return e; }
}
const body = { tag: 'BODY' };
const doc = { activeElement: body, createElement: (t) => new El(t) };
function fix() { if (doc.activeElement !== body && !(root?.contains(doc.activeElement))) doc.activeElement = body; }
let root = null;
globalThis.document = doc;
// fake clock and fetch (no real timers, no real network)
const clock = { t: 0, timers: [], id: 1 };
globalThis.setTimeout = (fn, ms) => { const id = clock.id++; clock.timers.push({ id, at: clock.t + ms, fn }); return id; };
globalThis.clearTimeout = (id) => { clock.timers = clock.timers.filter((x) => x.id !== id); };
Date.now = () => clock.t;
const advance = async (ms) => {
  const end = clock.t + ms;
  for (;;) {
    const n = clock.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!n) break;
    clock.timers = clock.timers.filter((x) => x !== n);
    clock.t = n.at; n.fn(); await flush();
  }
  clock.t = end; await flush();
};
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  const u = new URL(String(url));
  const text = u.hostname.startsWith('geocoding')
    ? JSON.stringify({ results: [{ name: 'Paris', latitude: 48.853, longitude: 2.349, admin1: 'Île-de-France', country: 'France' }, { name: 'Parisx', latitude: 33.66, longitude: -95.55, admin1: 'Texas', country: 'États-Unis' }] })
    : JSON.stringify({ daily: { time: ['2025-01-01', '2025-01-02', '2025-01-03'], temperature_2m_mean: [1, 2, 3], temperature_2m_min: [0, 1, 2], temperature_2m_max: [2, 3, 4], weather_code: [1, 1, 1], wind_speed_10m_mean: [5, 5, 5], wind_direction_10m_dominant: [90, 90, 90] } });
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => text };
};
const tmp = mkdtempSync(join(tmpdir(), 'wp-'));
let ui;
try {
  await build({ entryPoints: ['src/ui/weather.ts'], outfile: join(tmp, 'weather-ui.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'silent' });
  ui = await import(join(tmp, 'weather-ui.mjs'));
} finally { rmSync(tmp, { recursive: true, force: true }); }

root = new El('div');
const data = [];
const panel = ui.createWeather(root, { onData: (d) => data.push(d) });
panel.setPeriod(PER);
const find = (pred) => { const out = []; const walk = (e) => { for (const c of e.children) { if (pred(c)) out.push(c); walk(c); } }; walk(root); return out[0]; };
const cb = find((e) => e.tag === 'input' && e.type === 'checkbox');
const inp = find((e) => e.tag === 'input' && e.type === 'text');
const lab = find((e) => e.tag === 'label' && e.htmlFor === 'weather-place');
const list = find((e) => e.tag === 'ul');
const status = find((e) => e.attrs.role === 'status');
const geoCount = () => fetched.filter((u) => u.includes('geocoding')).length;
const archCount = () => fetched.filter((u) => u.includes('archive')).length;
const buttons = () => list.querySelectorAll('button');
const type = (t) => { inp.value = t; inp.fire('input', { isComposing: false }); };
const tick = (on) => { cb.checked = on; cb.fire('change'); };

ok(inp.disabled && lab.cls.has('disabled') && fetched.length === 0, 'UI: field disabled and label muted while unticked, no request at load');
tick(true); await advance(5000);
ok(!inp.disabled && !lab.cls.has('disabled') && fetched.length === 0, 'UI: tick alone sends nothing and enables the field');
type('paris'); await advance(399);
ok(geoCount() === 0, 'UI: no request before 400 ms');
await advance(1);
ok(geoCount() === 1 && buttons().length === 2 && /2 lieux trouvés/.test(status.textContent), 'UI: one request after the pause, list and status shown');
// ArrowDown into the list while a timer is pending
type('parisx');
let e = inp.fire('keydown', { key: 'ArrowDown' });
ok(e.defaultPrevented && doc.activeElement === buttons()[0], 'UI: ArrowDown moves the focus to the first result');
await advance(5000);
ok(buttons().length === 2 && doc.activeElement === buttons()[0] && geoCount() === 1, 'UI: the would-be timer neither clears the list nor steals the focus');
// choose by keyboard (click on the focused button, as Enter does)
buttons()[0].fire('click');
ok(doc.activeElement === inp, 'UI: focus is back on the place field after choosing');
ok(inp.value === P1.label && buttons().length === 0, 'UI: field holds the label, list closed');
await advance(1000);
ok(archCount() === 1 && /3 jours de météo chargés/.test(status.textContent), 'UI: temperatures loaded, status kept');
e = inp.fire('keydown', { key: 'Enter' });
await advance(2000);
ok(e.defaultPrevented && geoCount() === 1 && /3 jours/.test(status.textContent), 'UI: Enter after choosing sends nothing and keeps the status');
// Escape in the field
type('paris'); await advance(400);
ok(buttons().length === 2 && /2 lieux trouvés/.test(status.textContent), 'UI: same query gives its list again after a choice (served by the places cache)');
inp.fire('keydown', { key: 'Escape' });
ok(buttons().length === 0 && status.textContent === '', 'UI: Escape in the field clears the list and the status');
type('paris'); await advance(400);
ok(buttons().length === 2 && /2 lieux trouvés/.test(status.textContent), 'UI: same query gives its list again after Escape');
// Escape from the list
inp.fire('keydown', { key: 'ArrowDown' });
ok(doc.activeElement === buttons()[0], 'UI: ArrowDown again');
buttons()[0].parent.parent.fire('keydown', { key: 'Escape' });
ok(doc.activeElement === inp && buttons().length === 0 && status.textContent === '', 'UI: Escape from the list refocuses the field and clears list and status');
// IME
const g0 = geoCount(); // 1 (places cache serves repeated queries)
inp.value = 'ri'; inp.fire('input', { isComposing: true });
inp.value = 'rio'; inp.fire('input', { isComposing: true });
e = inp.fire('keydown', { key: 'Enter', isComposing: true });
await advance(3000);
ok(geoCount() === g0, 'UI: composing input and Enter during composition send nothing');
inp.value = 'リオ'; inp.fire('compositionend');
await advance(400);
ok(geoCount() === g0 + 1 && fetched.at(-1).includes(encodeURIComponent('リオ')), 'UI: validated text is searched after compositionend');
// untick
type('lyon'); await advance(100);
tick(false); await advance(3000);
ok(geoCount() === g0 + 1 && inp.disabled && inp.value === 'lyon' && buttons().length === 0 && status.textContent === '', 'UI: untick cancels the timer, clears list and status, keeps the field text');
tick(true); await advance(3000);
ok(geoCount() === g0 + 1, 'UI: retick sends nothing');
inp.fire('keydown', { key: 'Enter' }); await advance(10);
ok(geoCount() === g0 + 2, 'UI: Enter after retick searches the kept text');

process.exit(failures ? 1 : 0);
