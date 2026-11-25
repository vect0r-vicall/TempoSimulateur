// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure interaction controller of the weather fieldset (FR-055..FR-058): no DOM, no timers, no network of its own.
 *  Everything the panel does besides drawing is decided here from events; the UI only forwards DOM events and renders the ports. */
import { createLiveSearch } from './livesearch';
import { DailyTemp, Place, dayHasData } from './weather';
import type { Period } from './period';

export type PlacesOutcome = { ok: true; places: Place[] } | { ok: false; message: string; aborted?: true };
export type TempsOutcome = { ok: true; days: DailyTemp[]; missing: number } | { ok: false; message: string };

export interface PanelPorts {
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  now(): number;
  sanitise(text: string): string | null;
  search(query: string, signal: AbortSignal): Promise<PlacesOutcome>;
  loadTemps(place: Place, period: Period): Promise<TempsOutcome>;
  setEnabled(on: boolean): void;
  setStatus(text: string, error: boolean): void;
  showResults(places: Place[], selected: Place | null): void;
  clearResults(): void;
  setFieldText(text: string): void;
  focusField(): void;
  focusResults(): void;
  /** Daily temperatures to overlay, or null to remove the overlay. */
  setWeather(days: DailyTemp[] | null): void;
}

export interface WeatherController {
  tick(checked: boolean): void;
  input(text: string, composing: boolean): void;
  compositionEnd(text: string): void;
  enter(text: string, composing: boolean): void;
  arrowDown(): void;
  escapeField(): void;
  escapeList(): void;
  choose(place: Place): void;
  periodChanged(p: Period | null): void;
}

export function createWeatherController(p: PanelPorts): WeatherController {
  let enabled = false;
  let place: Place | null = null;
  let period: Period | null = null;
  let loadToken = 0;
  let chosen = false; // the field text is a chosen place label, not something the user typed
  let hasResults = false;
  let searchMsg = false; // the status line currently shows a search message (not the load result)

  const say = (text: string, error = false, fromSearch = false) => {
    p.setStatus(text, error);
    searchMsg = fromSearch && text !== '';
  };
  const clearList = () => {
    hasResults = false;
    p.clearResults();
  };

  async function load(): Promise<void> {
    const tok = ++loadToken;
    if (!enabled || !place) return;
    if (!period) {
      p.setWeather(null);
      say('Chargez d\'abord un fichier d\'index : la météo sera chargée pour sa période.');
      return;
    }
    say('Chargement de la météo…');
    const r = await p.loadTemps(place, period);
    if (tok !== loadToken || !enabled) return; // stale response
    if (!r.ok) {
      p.setWeather(null);
      say(r.message, true);
      return;
    }
    p.setWeather(r.days);
    const n = r.days.filter(dayHasData).length;
    say(r.missing > 0 || n < r.days.length
      ? `${n} jours de météo chargés (données manquantes pour les autres jours)`
      : `${n} jours de météo chargés`);
  }

  function showResult(r: PlacesOutcome): void {
    if (!enabled) return;
    if (!r.ok) {
      if (r.aborted) return;
      clearList();
      say(r.message, true, true);
      return;
    }
    if (r.places.length === 0) {
      clearList();
      say('Aucun lieu trouvé.', false, true);
      return;
    }
    say(`${r.places.length} lieu${r.places.length > 1 ? 'x' : ''} trouvé${r.places.length > 1 ? 's' : ''} : choisissez-en un.`, false, true);
    hasResults = true;
    p.showResults(r.places, place);
  }

  const live = createLiveSearch<PlacesOutcome>({
    schedule: p.schedule,
    cancel: p.cancel,
    now: p.now,
    sanitise: p.sanitise,
    search: p.search,
    isOk: (r) => r.ok,
    onIdle: () => {
      clearList();
      if (searchMsg) say('');
    },
    onLoading: () => {
      clearList();
      say('Recherche…', false, true);
    },
    onResult: (_q, r) => showResult(r),
    onError: () => {
      if (enabled) say('Service météo injoignable. Vérifiez votre connexion et réessayez.', true, true);
    },
  });

  /** Close the list and forget the search state, so the same query can be searched again. */
  function dismiss(): void {
    live.reset();
    clearList();
    if (searchMsg) say('');
  }

  return {
    tick(checked) {
      enabled = checked;
      live.reset();
      loadToken++;
      chosen = false; // the field keeps its text, but nothing is selected any more
      p.setEnabled(checked);
      if (!checked) {
        place = null;
        clearList();
        say('');
        p.setWeather(null);
      }
    },
    input(text, composing) {
      if (!enabled || composing) return; // IME buffer (romaji, pinyin...) is never sent
      chosen = false;
      live.input(text);
    },
    compositionEnd(text) {
      if (!enabled) return;
      chosen = false;
      live.input(text);
    },
    enter(text, composing) {
      if (!enabled || composing || chosen) return;
      live.submit(text);
    },
    arrowDown() {
      if (!hasResults) return;
      live.reset(); // a pending timer must not clear the list under the user's focus
      p.focusResults();
    },
    escapeField() {
      dismiss();
    },
    escapeList() {
      dismiss();
      p.focusField();
    },
    choose(pl) {
      if (!enabled) return;
      live.reset();
      place = pl;
      chosen = true;
      p.setFieldText(pl.label);
      clearList();
      p.focusField();
      void load();
    },
    periodChanged(pr) {
      const same = !!pr && !!period && pr.from === period.from && pr.to === period.to;
      period = pr;
      if (!same && enabled && place) void load();
    },
  };
}
