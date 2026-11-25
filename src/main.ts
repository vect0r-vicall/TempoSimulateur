// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
import { parseIndexCsv, MAX_BYTES } from './core/csv';
import { ImportError } from './core/types';
import { Session, chooseKva, ingestFile, newSession } from './core/session';
import { Period, defaultPeriod, pressedShortcuts, pricedRange, resolvePeriod, shortcutMessage, shortcutPeriods } from './core/period';
import { Analysis, analyse, buildRecap } from './core/recap';
import { OFFER_IDS, OfferId } from './core/pricing';
import { KvaSource, kvaSourceLabel } from './core/assumptions';
import { Controls, createControls } from './ui/controls';
import { initDropzone } from './ui/dropzone';
import { Chart, initChart } from './ui/chart';
import { buildTariffs } from './core/tariffs';
import { renderTariffs } from './ui/tariffs';
import { renderAssumptions } from './ui/assumptions';
import { renderPeriods, renderRecap } from './ui/recap';
import { el, node } from './ui/dom';

interface State {
  session: Session;
  period: Period | null;
  manualKva: number | null;
  kva: number;
  kvaSource: KvaSource;
  selected: OfferId[];
}

const state: State = {
  session: newSession(),
  period: null,
  manualKva: null,
  kva: chooseKva(null, null).kva,
  kvaSource: 'default',
  selected: [...OFFER_IDS],
};
let controls: Controls;
let chart: Chart;

function setStatus(text: string, cls: '' | 'error' | 'ok'): void {
  const s = el<HTMLElement>('status');
  s.textContent = text;
  s.className = cls ? `status ${cls}` : 'status';
}

function renderLoaded(): void {
  const ul = el<HTMLElement>('loaded');
  ul.replaceChildren();
  const { index, indexName, peak, peakName } = state.session;
  if (index) ul.append(node('li', undefined, `Index : ${indexName}`));
  if (peak) ul.append(node('li', undefined, `Puissance max : ${peakName} (pic ${peak.maxVA} VA)`));
}

function kvaNote(): string {
  return kvaSourceLabel(state.kvaSource, state.kva, state.session.peak ? state.session.peak.suggestedKva : null);
}

function update(): void {
  const section = el<HTMLElement>('analysis');
  const suggested = state.session.peak ? state.session.peak.suggestedKva : null;
  const index = state.session.index;
  controls.setShortcuts(!!index && !!state.period, index ? pressedShortcuts(index.days, state.period) : []);
  if (!index || !state.period) {
    section.hidden = true;
    renderTariffs(null);
    renderAssumptions(null, state.kvaSource, state.kva, suggested);
    return;
  }
  section.hidden = false;
  const a: Analysis = analyse(index, state.period, state.kva);
  controls.setKvaNote(kvaNote());
  renderRecap(a, buildRecap(a, state.selected));
  renderPeriods(index.periods, index.excluded);
  renderAssumptions(a, state.kvaSource, state.kva, suggested);
  renderTariffs(buildTariffs(state.period, state.kva, state.selected, a));
  const priced = pricedRange(index.days);
  if (priced) chart.render({ a, selected: state.selected, priced, analyseFor: (p) => analyse(index, p, state.kva) });
}

function applyKva(): void {
  const c = chooseKva(state.session.peak, state.manualKva);
  state.kva = c.kva;
  state.kvaSource = c.source;
  controls.setKva(state.kva, kvaNote());
}

async function handleFile(file: File): Promise<void> {
  if (file.size > MAX_BYTES) {
    setStatus('Fichier trop volumineux (5 Mo maximum). Rien n\'a été chargé.', 'error');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = ingestFile(state.session, bytes, file.name);
    if (kind === 'index') {
      const imp = state.session.index!;
      const range = pricedRange(imp.days);
      const def = defaultPeriod(imp.days);
      if (!range || !def) throw new ImportError('Aucun jour valorisable dans ce fichier.');
      state.period = def;
      chart.resetView();
      controls.setRange(range.from, range.to);
      controls.setPeriod(def);
      controls.setMessage('', false);
      setStatus('Fichier d\'index chargé localement.', 'ok');
    } else {
      setStatus('Fichier de puissance max chargé localement.', 'ok');
    }
    applyKva();
    renderLoaded();
    update();
  } catch (e) {
    if (e instanceof ImportError) setStatus(e.message, 'error');
    else setStatus('Lecture impossible : fichier illisible.', 'error');
  }
}

/** Single path for every period change (date inputs and shortcuts); `notice` replaces an empty resolve message. */
function applyPeriod(start: string, end: string, notice: string): void {
  const index = state.session.index;
  if (!index) return;
  const r = resolvePeriod(index.days, start, end);
  if (!r.ok) {
    controls.setMessage(r.error, true);
    if (state.period) controls.setPeriod(state.period);
    return;
  }
  state.period = r.period;
  chart.resetView();
  controls.setPeriod(r.period);
  controls.setMessage(r.message || notice, false);
  update();
}

function init(): void {
  controls = createControls({
    onPeriod(start, end) {
      applyPeriod(start, end, '');
    },
    onShortcut(id) {
      const index = state.session.index;
      const sp = index ? shortcutPeriods(index.days) : null;
      if (sp) applyPeriod(sp[id].from, sp[id].to, shortcutMessage(sp[id]));
    },
    onKva(kva) {
      state.manualKva = kva;
      applyKva();
      update();
    },
    onOffers(selected) {
      state.selected = selected;
      update();
    },
  });
  chart = initChart();
  controls.setKva(state.kva, kvaNote());
  let queue: Promise<void> = Promise.resolve();
  initDropzone((f) => {
    queue = queue.then(() => handleFile(f));
  });
  update();
}

init();
