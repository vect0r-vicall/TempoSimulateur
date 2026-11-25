// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { KVA_LIST, OFFER_IDS, OFFER_LABEL, OfferId } from '../core/pricing';
import { Period } from '../core/period';
import { el, node } from './dom';

export interface ControlsHandlers {
  onPeriod(start: string, end: string): void;
  onKva(kva: number): void;
  onOffers(selected: OfferId[]): void;
}

export interface Controls {
  setRange(min: string, max: string): void;
  setPeriod(p: Period): void;
  setKva(kva: number, note: string): void;
  setKvaNote(note: string): void;
  setMessage(text: string, error: boolean): void;
  selected(): OfferId[];
}

export function createControls(h: ControlsHandlers): Controls {
  const root = el<HTMLElement>('controls');
  root.replaceChildren();

  const mkDate = (id: string, label: string) => {
    const wrap = node('div', 'field');
    const lab = node('label', undefined, label);
    lab.htmlFor = id;
    const input = node('input');
    input.type = 'date';
    input.id = id;
    wrap.append(lab, input);
    return { wrap, input };
  };
  const start = mkDate('period-start', 'Début');
  const end = mkDate('period-end', 'Fin');
  const dates = node('div', 'row');
  dates.append(start.wrap, end.wrap);
  const msg = node('p', 'period-msg');
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  const periodSet = node('fieldset', 'group');
  periodSet.append(node('legend', undefined, 'Période'), dates, msg);

  const kvaWrap = node('div', 'field');
  const kvaLab = node('label', undefined, 'Puissance souscrite');
  kvaLab.htmlFor = 'kva';
  const kva = node('select');
  kva.id = 'kva';
  for (const k of KVA_LIST) {
    const o = node('option', undefined, `${k} kVA`);
    o.value = String(k);
    kva.append(o);
  }
  const kvaNote = node('span', 'kva-note');
  kvaWrap.append(kvaLab, kva, kvaNote);
  const kvaSet = node('fieldset', 'group');
  kvaSet.append(node('legend', undefined, 'Abonnement'), kvaWrap);

  const boxes = new Map<OfferId, HTMLInputElement>();
  const offersSet = node('fieldset', 'group');
  offersSet.append(node('legend', undefined, 'Offres comparées'));
  for (const o of OFFER_IDS) {
    const lab = node('label', 'check');
    const cb = node('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = o;
    boxes.set(o, cb);
    lab.append(cb, node('span', undefined, OFFER_LABEL[o]));
    offersSet.append(lab);
  }
  root.append(periodSet, kvaSet, offersSet);

  const selected = (): OfferId[] => OFFER_IDS.filter((o) => boxes.get(o)!.checked);
  const onDate = () => h.onPeriod(start.input.value, end.input.value);
  start.input.addEventListener('change', onDate);
  end.input.addEventListener('change', onDate);
  kva.addEventListener('change', () => h.onKva(Number(kva.value)));
  for (const cb of boxes.values()) cb.addEventListener('change', () => h.onOffers(selected()));

  return {
    setRange(min, max) {
      for (const i of [start.input, end.input]) {
        i.min = min;
        i.max = max;
      }
    },
    setPeriod(p) {
      start.input.value = p.from;
      end.input.value = p.to;
    },
    setKva(k, note) {
      kva.value = String(k);
      kvaNote.textContent = note;
    },
    setKvaNote(note) {
      kvaNote.textContent = note;
    },
    setMessage(text, error) {
      msg.textContent = text;
      msg.className = error ? 'period-msg error' : 'period-msg';
    },
    selected,
  };
}
