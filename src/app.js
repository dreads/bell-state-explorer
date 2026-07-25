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
} from './state.js';
import { createMatrixGrid } from './matrix-grid.js';
import { createBlochSpheres } from './bloch-sphere.js';
import { createCircuitDiagram } from './circuit-diagram.js';

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

function interpret({ conc, pur, dephasing, theta }) {
  const nearZero = (x) => Math.abs(x) < 0.02;
  if (nearZero(conc) && dephasing > 0.98) {
    return 'Fully dephased. The coherences are gone, so this is a classical correlated mixture with the same measurement statistics but no entanglement.';
  }
  if (nearZero(conc) && (nearZero(theta) || nearZero(theta - Math.PI / 2))) {
    return 'All amplitude sits on one basis state. Still a pure state, but a product state with nothing to entangle.';
  }
  if (conc > 0.98 && pur > 0.98) {
    return 'A maximally entangled Bell state. Equal populations, full coherence between them.';
  }
  if (pur > 0.98) {
    return 'Pure but only partially entangled. Unequal amplitudes weaken the correlation without introducing any mixedness.';
  }
  return 'Partially dephased. The coherence terms have shrunk while the populations hold, so entanglement is decaying toward a classical mixture.';
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
  dom.reading.textContent = interpret({
    conc,
    pur,
    dephasing: model.dephasing,
    theta: model.theta,
  });

  drawBloch(
    blochVector(partialTrace0(rho)),
    blochVector(partialTrace1(rho)),
  );
  drawCircuit({ q0: model.q0, q1: model.q1, label, alpha0: model.rotation0, alpha1: model.rotation1 });
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
}

document.addEventListener('DOMContentLoaded', init);

export { model, inputFromBell };
