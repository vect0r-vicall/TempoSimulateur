// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Opt-in weather fieldset of the Paramètres block: DOM wiring only, the behaviour lives in core/weatherpanel.ts. No request is made until the box is ticked AND at least 2 characters were typed (live search, 400 ms after the last keystroke, or Enter) or a place is chosen. */
import { WeatherController, createWeatherController } from '../core/weatherpanel';
import { DailyTemp } from '../core/weather';
import { fetchDailyTemps, sanitiseQuery, searchPlaces } from '../net/weather';
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
  const box = node('div', 'weather-box');
  const checkLab = node('label', 'check');
  const cb = node('input');
  cb.type = 'checkbox';
  cb.checked = false;
  checkLab.append(cb, node('span', undefined, 'Afficher la météo (requêtes vers Open-Meteo)'));
  const note = node('p', 'weather-note',
    'Une fois cochée, la saisie du lieu (après une courte pause, ou tout de suite avec Entrée) et la période affichée sont envoyées à Open-Meteo, service tiers qui voit ' +
    'votre adresse IP et une position approximative (0,1°) ; rien de votre fichier d\'électricité n\'est envoyé.');

  const field = node('div', 'field weather-field');
  const lab = node('label', undefined, 'Lieu (ville ou code postal)');
  lab.htmlFor = 'weather-place';
  lab.classList.add('disabled');
  const input = node('input');
  input.type = 'text';
  input.id = 'weather-place';
  input.maxLength = 60;
  input.autocomplete = 'off';
  input.disabled = true;
  const list = node('ul', 'weather-places');
  list.setAttribute('aria-label', 'Lieux trouvés');
  const status = node('p', 'weather-status');
  status.setAttribute('role', 'status');
  field.append(lab, input, list, status);
  const credit = node('p', 'weather-credit', 'Données météo : Open-Meteo.com (CC BY 4.0)');
  credit.hidden = true;
  const info = node('div', 'weather-info');
  info.append(checkLab, note, credit);
  box.append(info, field);

  const set = node('fieldset', 'group weather-group');
  set.append(node('legend', undefined, 'Météo (facultatif)'), box);
  root.append(set);

  const items = () => Array.from(list.querySelectorAll('button'));

  const ctl: WeatherController = createWeatherController({
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
    sanitise: sanitiseQuery,
    search: (q, signal) => searchPlaces(q, undefined, signal),
    loadTemps: (pl, per) => fetchDailyTemps(pl.latitude, pl.longitude, per.from, per.to),
    setEnabled: (on) => {
      cb.checked = on;
      input.disabled = !on;
      lab.classList.toggle('disabled', !on);
      credit.hidden = !on;
    },
    setStatus: (text, error) => {
      status.textContent = text;
      status.className = error ? 'weather-status error' : 'weather-status';
    },
    showResults: (places, selected) => {
      list.replaceChildren();
      for (const pl of places) {
        const li = node('li');
        const b = node('button', undefined, pl.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(!!selected && selected.label === pl.label && selected.latitude === pl.latitude && selected.longitude === pl.longitude));
        b.addEventListener('click', () => ctl.choose(pl));
        li.append(b);
        list.append(li);
      }
    },
    clearResults: () => list.replaceChildren(),
    setFieldText: (t) => { input.value = t; },
    focusField: () => input.focus(),
    focusResults: () => items()[0]?.focus(),
    setWeather: (days) => h.onData(days),
  });

  cb.addEventListener('change', () => ctl.tick(cb.checked));
  input.addEventListener('input', (ev) => ctl.input(input.value, (ev as InputEvent).isComposing === true));
  input.addEventListener('compositionend', () => ctl.compositionEnd(input.value));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ctl.enter(input.value, ev.isComposing);
    } else if (ev.key === 'ArrowDown') {
      if (items().length > 0) {
        ev.preventDefault();
        ctl.arrowDown();
      }
    } else if (ev.key === 'Escape') {
      ctl.escapeField();
    }
  });
  list.addEventListener('keydown', (ev) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === 'ArrowDown' && i >= 0) {
      ev.preventDefault();
      all[Math.min(i + 1, all.length - 1)]?.focus();
    } else if (ev.key === 'ArrowUp' && i >= 0) {
      ev.preventDefault();
      if (i === 0) input.focus();
      else all[i - 1]?.focus();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ctl.escapeList();
    }
  });

  return {
    setPeriod: (p) => ctl.periodChanged(p),
  };
}
