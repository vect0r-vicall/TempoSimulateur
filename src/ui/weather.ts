// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Opt-in weather fieldset (block 2). No request is made until the box is ticked AND a search/choice is made by the user. */
import { DailyTemp, Place } from '../core/weather';
import { fetchDailyTemps, searchPlaces } from '../net/weather';
import { Period } from '../core/period';
import { node } from './dom';

export interface WeatherHandlers {
  /** Daily temperatures to overlay, or null when the overlay is off / unavailable. */
  onData(days: DailyTemp[] | null): void;
}
export interface WeatherPanel {
  /** The applied period changed (or a file was loaded): refetch only when enabled and a place is selected. */
  setPeriod(p: Period | null): void;
}

export function createWeather(root: HTMLElement, h: WeatherHandlers): WeatherPanel {
  let period: Period | null = null;
  let place: Place | null = null;
  let searchToken = 0;
  let loadToken = 0;

  const box = node('div', 'weather-box');
  const checkLab = node('label', 'check');
  const cb = node('input');
  cb.type = 'checkbox';
  cb.checked = false;
  checkLab.append(cb, node('span', undefined, 'Afficher la météo (requêtes vers Open-Meteo)'));
  const note = node('p', 'weather-note',
    'En cochant cette case, le lieu saisi et la période affichée sont envoyés à Open-Meteo, un service tiers qui voit votre adresse IP ' +
    'et des coordonnées approximatives (arrondies à 0,1 degré). Rien de votre fichier d\'électricité n\'est envoyé.');

  const row = node('div', 'weather-search');
  const field = node('div', 'field');
  const lab = node('label', undefined, 'Lieu (ville ou code postal)');
  lab.htmlFor = 'weather-place';
  const input = node('input');
  input.type = 'text';
  input.id = 'weather-place';
  input.maxLength = 60;
  input.autocomplete = 'off';
  input.disabled = true;
  field.append(lab, input);
  const btn = node('button', undefined, 'Rechercher');
  btn.type = 'button';
  btn.disabled = true;
  row.append(field, btn);

  const list = node('ul', 'weather-places');
  list.setAttribute('aria-label', 'Lieux trouvés');
  const status = node('p', 'weather-status');
  status.setAttribute('role', 'status');
  const credit = node('p', 'weather-credit', 'Données météo : Open-Meteo.com (CC BY 4.0)');
  credit.hidden = true;
  box.append(checkLab, note, row, list, status, credit);

  const set = node('fieldset', 'group');
  set.append(node('legend', undefined, 'Météo (facultatif)'), box);
  root.append(set);

  const say = (text: string, error = false) => {
    status.textContent = text;
    status.className = error ? 'weather-status error' : 'weather-status';
  };

  async function load(): Promise<void> {
    const tok = ++loadToken;
    if (!cb.checked || !place) return;
    if (!period) {
      h.onData(null);
      say('Chargez d\'abord un fichier d\'index : la météo sera chargée pour sa période.');
      return;
    }
    say('Chargement de la météo…');
    const r = await fetchDailyTemps(place.latitude, place.longitude, period.from, period.to);
    if (tok !== loadToken || !cb.checked) return; // stale response
    if (!r.ok) {
      h.onData(null);
      say(r.message, true);
      return;
    }
    h.onData(r.days);
    const n = r.days.filter((d) => d.mean !== null || d.min !== null || d.max !== null).length;
    say(r.missing > 0 || n < r.days.length
      ? `${n} jours de météo chargés (données manquantes pour les autres jours)`
      : `${n} jours de météo chargés`);
  }

  async function search(): Promise<void> {
    if (!cb.checked) return;
    const tok = ++searchToken;
    list.replaceChildren();
    say('Recherche en cours…');
    const r = await searchPlaces(input.value);
    if (tok !== searchToken || !cb.checked) return;
    if (!r.ok) {
      say(r.message, true);
      return;
    }
    if (r.places.length === 0) {
      say('Aucun lieu trouvé.');
      return;
    }
    say(`${r.places.length} lieu${r.places.length > 1 ? 'x' : ''} trouvé${r.places.length > 1 ? 's' : ''} : choisissez-en un.`);
    const buttons: HTMLButtonElement[] = [];
    for (const p of r.places) {
      const li = node('li');
      const b = node('button', undefined, p.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        place = p;
        for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
        void load();
      });
      buttons.push(b);
      li.append(b);
      list.append(li);
    }
  }

  cb.addEventListener('change', () => {
    const on = cb.checked;
    searchToken++;
    loadToken++;
    input.disabled = !on;
    btn.disabled = !on;
    credit.hidden = !on;
    if (!on) {
      place = null;
      list.replaceChildren();
      say('');
      h.onData(null);
    }
  });
  btn.addEventListener('click', () => void search());
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void search();
    }
  });

  return {
    setPeriod(p) {
      const same = !!p && !!period && p.from === period.from && p.to === period.to;
      period = p;
      if (!same && cb.checked && place) void load();
    },
  };
}
