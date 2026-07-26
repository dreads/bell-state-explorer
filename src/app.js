import {
  densityMatrix,
  concurrence,
  purity,
  bellFromInput,
  inputFromBell,
  stateLabel,
  stateEquation,
  partialTrace0,
  partialTrace1,
  blochVector,
  applyLocalRotation,
  classifyState,
} from './state.js';
import { createMatrixGrid } from './matrix-grid.js';
import { createBlochSpheres } from './bloch-sphere.js';
import { createCircuitDiagram } from './circuit-diagram.js';
import { buildExportPayload } from './export.js';
import { translate } from './i18n.js';
import { loadManifest, loadLocaleBundle, detectLocale } from './locale-loader.js';
import en from '../locales/en.js';

const LOCALE_STORAGE_KEY = 'bell-state-locale';

// `en` is always the fallback bundle, so any locale — including a partial
// PR-contributed one — degrades to English per-key rather than breaking.
// `activeLocale` starts as `en` so the first paint is never blank while
// initLocale() resolves a saved preference or auto-detected match.
let activeLocale = en;

const model = {
  q0: 0,
  q1: 0,
  theta: Math.PI / 4,
  dephasing: 0,
  rotation0: 0,
  rotation1: 0,
};

const dom = {};
let draw;
let drawBloch;
let drawCircuit;
let bellRows;

function query() {
  [
    'grid',
    'q0',
    'q1',
    'phase',
    'family',
    'dephasing',
    'dephasing-value',
    'theta',
    'theta-value',
    'state-label',
    'concurrence',
    'purity',
    'bell-state-list',
    'reading',
    'bloch-spheres',
    'circuit-diagram',
    'local-rotation',
    'local-rotation-value',
    'local-rotation-1',
    'local-rotation-1-value',
    'reset',
    'export-state',
    'locale-picker',
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });
}

function toggleBit(which) {
  model[which] = model[which] === 1 ? 0 : 1;
  render();
}

/**
 * Both toggle pairs write the same two bits, so pressing "phase" moves q0 and
 * vice versa. Buttons carry aria-pressed so the coupling is announced too.
 */
function setPair(button, pressed, label) {
  button.textContent = label;
  button.setAttribute('aria-pressed', String(pressed));
}

/** Add `bundle` as a picker option if it isn't already listed (covers a
 * locale that was auto-detected or manually loaded but never made it into
 * locales/manifest.json). */
function ensureOption(bundle) {
  const select = dom['locale-picker'];
  const exists = Array.from(select.options).some((o) => o.value === bundle.meta.code);
  if (!exists) {
    const option = document.createElement('option');
    option.value = bundle.meta.code;
    option.textContent = bundle.meta.endonym || bundle.meta.englishName || bundle.meta.code;
    select.appendChild(option);
  }
}

function applyLocale(bundle) {
  activeLocale = bundle;
  document.documentElement.lang = bundle.meta.code;
  document.documentElement.dir = bundle.meta.direction;
  ensureOption(bundle);
  dom['locale-picker'].value = bundle.meta.code;
  render();
}

function populatePicker(manifestEntries) {
  const select = dom['locale-picker'];
  const existing = new Set(Array.from(select.options).map((o) => o.value));
  manifestEntries.forEach((entry) => {
    if (existing.has(entry.code)) return;
    const option = document.createElement('option');
    option.value = entry.code;
    option.textContent = entry.endonym || entry.englishName || entry.code;
    select.appendChild(option);
  });
}

async function onLocaleChange(code) {
  if (code === 'en') {
    applyLocale(en);
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    return;
  }
  const bundle = await loadLocaleBundle(code);
  if (!bundle) {
    dom['locale-picker'].value = activeLocale.meta.code;
    return;
  }
  applyLocale(bundle);
  localStorage.setItem(LOCALE_STORAGE_KEY, code);
}

/**
 * Populates the picker from locales/manifest.json, then resolves the active
 * locale: an explicit saved preference wins over auto-detection, which in
 * turn is tried independently of the manifest (see locale-loader.js) so a
 * bundle file copied straight into locales/ is found even with no manifest
 * entry at all. Runs after the first synchronous English render, so a slow
 * or failed fetch never blocks the initial paint.
 */
async function initLocale() {
  const manifest = await loadManifest();
  populatePicker(manifest);

  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && saved !== 'en') {
    const bundle = await loadLocaleBundle(saved);
    if (bundle) {
      applyLocale(bundle);
      return;
    }
  }
  if (saved === 'en') return;

  const detected = await detectLocale(navigator.languages || [navigator.language]);
  if (detected) applyLocale(detected.bundle);
}

function render() {
  const { psi, negative } = bellFromInput(model.q0, model.q1);
  // Compute Bell state (with dephasing), then apply local rotation to q0.
  // Concurrence is evaluated on the pre-rotation state because the Bell-state
  // formula is only valid for that structure; local unitaries preserve entanglement.
  const baseRho = densityMatrix({
    psi,
    negative,
    theta: model.theta,
    dephasing: model.dephasing,
  });
  const rho = applyLocalRotation(
    applyLocalRotation(baseRho, model.rotation0, 0),
    model.rotation1, 1,
  );

  draw(rho);

  setPair(dom.q0, model.q0 === 1, `q0 = ${model.q0}`);
  setPair(dom.q1, model.q1 === 1, `q1 = ${model.q1}`);
  setPair(dom.phase, negative, `phase ${negative ? '−' : '+'}`);
  setPair(dom.family, psi, `${psi ? 'Ψ' : 'Φ'} family`);

  const degrees = Math.round((model.theta * 180) / Math.PI);
  const percent = Math.round(model.dephasing * 100);
  const rot0Deg = Math.round((model.rotation0 * 180) / Math.PI);
  const rot1Deg = Math.round((model.rotation1 * 180) / Math.PI);
  dom['theta-value'].textContent = `${degrees}°`;
  dom['dephasing-value'].textContent = `${percent}%`;
  dom['local-rotation-value'].textContent = `${rot0Deg}°`;
  dom['local-rotation-1-value'].textContent = `${rot1Deg}°`;

  const conc = concurrence(baseRho);  // Bell-state formula; entanglement is rotation-invariant
  const pur = purity(rho);

  const label = stateLabel({ psi, negative });
  dom['state-label'].textContent = stateEquation({ psi, negative });
  dom.concurrence.textContent = conc.toFixed(2);
  dom.purity.textContent = pur.toFixed(2);

  const bellKey = `${psi ? 'psi' : 'phi'}-${negative ? 'minus' : 'plus'}`;
  bellRows.forEach((row) => {
    row.classList.toggle('current', row.dataset.state === bellKey);
  });
  const regimeKey = classifyState({ conc, pur, dephasing: model.dephasing, theta: model.theta });
  dom.reading.textContent = translate(activeLocale.strings, en.strings, `interpret.${regimeKey}`);

  drawBloch(
    blochVector(partialTrace0(rho)),
    blochVector(partialTrace1(rho)),
  );
  drawCircuit({ q0: model.q0, q1: model.q1, label, alpha0: model.rotation0, alpha1: model.rotation1 });
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportState() {
  const payload = buildExportPayload(model);
  const { psi, negative } = bellFromInput(model.q0, model.q1);
  const bellKey = `${psi ? 'psi' : 'phi'}-${negative ? 'minus' : 'plus'}`;
  const timestamp = payload.exportedAt.replace(/[:.]/g, '-');
  downloadJson(`bell-state-${bellKey}-${timestamp}.json`, payload);
}

function init() {
  query();
  draw = createMatrixGrid(dom.grid);
  drawBloch = createBlochSpheres(dom['bloch-spheres']);
  drawCircuit = createCircuitDiagram(dom['circuit-diagram']);
  bellRows = dom['bell-state-list'].querySelectorAll('.bell-row');

  dom.q0.addEventListener('click', () => toggleBit('q0'));
  dom.phase.addEventListener('click', () => toggleBit('q0'));
  dom.q1.addEventListener('click', () => toggleBit('q1'));
  dom.family.addEventListener('click', () => toggleBit('q1'));

  dom.dephasing.addEventListener('input', (e) => {
    model.dephasing = Number(e.target.value) / 100;
    render();
  });

  dom.theta.addEventListener('input', (e) => {
    model.theta = (Number(e.target.value) * Math.PI) / 180;
    render();
  });

  dom['local-rotation'].addEventListener('input', (e) => {
    model.rotation0 = (Number(e.target.value) * Math.PI) / 180;
    render();
  });

  dom['local-rotation-1'].addEventListener('input', (e) => {
    model.rotation1 = (Number(e.target.value) * Math.PI) / 180;
    render();
  });

  dom['export-state'].addEventListener('click', exportState);

  dom['locale-picker'].addEventListener('change', (e) => onLocaleChange(e.target.value));

  dom.reset.addEventListener('click', () => {
    model.q0 = 0;
    model.q1 = 0;
    model.theta = Math.PI / 4;
    model.dephasing = 0;
    model.rotation0 = 0;
    model.rotation1 = 0;

    dom.dephasing.value = '0';
    dom.theta.value = '45';
    dom['local-rotation'].value = '0';
    dom['local-rotation-1'].value = '0';

    render();
  });

  render();
  initLocale();
}

document.addEventListener('DOMContentLoaded', init);

export { model, inputFromBell };
