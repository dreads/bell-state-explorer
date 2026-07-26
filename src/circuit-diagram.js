const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 680;
const H = 90;
const Y0 = 28;             // q0 wire
const Y1 = 62;             // q1 wire
const X_WIRE_START = 80;
const X_H = 178;           // H gate centre
const X_CNOT = 308;        // CNOT centre
const X_WIRE_END = 630;
// These four x-positions are kept in left-to-right circuit order (bracket <
// out-label < Ry) so the diagram always reads as: gates that prepare the
// Bell state, then the boundary marking it as complete, then the label,
// then the optional local rotation that acts on it afterward. X_RY sits
// well clear of X_BRACKET so the Ry gate never visually appears "inside"
// the Bell-state preparation it is deliberately drawn outside of.
const X_BRACKET = 415;     // Bell-state output bracket
const X_OUT = 460;         // Bell-state label
const X_RY = 555;          // Rᵧ gate centre (local rotation, after Bell state)
const GATE_W = 34;
const RY_GATE_W = 48;
const GATE_H = 28;
const XOR_R = 12;

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function txt(x, y, str, attrs = {}) {
  const t = el('text', {
    x,
    y,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    ...attrs,
  });
  t.textContent = str;
  return t;
}

export function createCircuitDiagram(container) {
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    class: 'circuit-svg',
    // A gate diagram's meaning comes from left-to-right spatial layout,
    // which doesn't survive translation to ARIA roles; the sr-only
    // paragraph below (updated in draw()) is the accessible equivalent.
    'aria-hidden': 'true',
  });

  // Wires
  svg.appendChild(el('line', { x1: X_WIRE_START, y1: Y0, x2: X_WIRE_END, y2: Y0, class: 'circuit-wire' }));
  svg.appendChild(el('line', { x1: X_WIRE_START, y1: Y1, x2: X_WIRE_END, y2: Y1, class: 'circuit-wire' }));

  // H gate
  svg.appendChild(el('rect', {
    x: X_H - GATE_W / 2, y: Y0 - GATE_H / 2,
    width: GATE_W, height: GATE_H,
    class: 'circuit-gate',
  }));
  svg.appendChild(txt(X_H, Y0, 'H', { class: 'circuit-gate-label' }));

  // CNOT: vertical line from control to XOR edge
  svg.appendChild(el('line', {
    x1: X_CNOT, y1: Y0, x2: X_CNOT, y2: Y1 - XOR_R,
    class: 'circuit-wire',
  }));

  // CNOT control dot
  svg.appendChild(el('circle', { cx: X_CNOT, cy: Y0, r: 5, class: 'circuit-control' }));

  // CNOT target: XOR symbol (circle with cross)
  svg.appendChild(el('circle', { cx: X_CNOT, cy: Y1, r: XOR_R, class: 'circuit-xor' }));
  svg.appendChild(el('line', {
    x1: X_CNOT - XOR_R, y1: Y1, x2: X_CNOT + XOR_R, y2: Y1,
    class: 'circuit-wire',
  }));
  svg.appendChild(el('line', {
    x1: X_CNOT, y1: Y1 - XOR_R, x2: X_CNOT, y2: Y1 + XOR_R,
    class: 'circuit-wire',
  }));

  // Bracket marking the Bell-state preparation boundary
  const TICK = 8;
  svg.appendChild(el('line', { x1: X_BRACKET, y1: Y0, x2: X_BRACKET, y2: Y1, class: 'circuit-bracket' }));
  svg.appendChild(el('line', { x1: X_BRACKET, y1: Y0, x2: X_BRACKET + TICK, y2: Y0, class: 'circuit-bracket' }));
  svg.appendChild(el('line', { x1: X_BRACKET, y1: Y1, x2: X_BRACKET + TICK, y2: Y1, class: 'circuit-bracket' }));

  // Rᵧ(α) gate on q0 — local operation, sits visibly after the Bell-state bracket
  const ryGroup0 = el('g');
  ryGroup0.appendChild(el('rect', {
    x: X_RY - RY_GATE_W / 2, y: Y0 - GATE_H / 2,
    width: RY_GATE_W, height: GATE_H,
    class: 'circuit-gate',
  }));
  ryGroup0.appendChild(txt(X_RY, Y0, 'Ry', { class: 'circuit-gate-label' }));
  svg.appendChild(ryGroup0);

  // Rᵧ(β) gate on q1 — independent local operation on q1
  const ryGroup1 = el('g');
  ryGroup1.appendChild(el('rect', {
    x: X_RY - RY_GATE_W / 2, y: Y1 - GATE_H / 2,
    width: RY_GATE_W, height: GATE_H,
    class: 'circuit-gate',
  }));
  ryGroup1.appendChild(txt(X_RY, Y1, 'Ry', { class: 'circuit-gate-label' }));
  svg.appendChild(ryGroup1);

  // Wire qubit name labels
  svg.appendChild(txt(14, Y0, 'q0', { class: 'circuit-qubit-label' }));
  svg.appendChild(txt(14, Y1, 'q1', { class: 'circuit-qubit-label' }));

  // Dynamic elements
  const inLabel0 = txt(50, Y0, '|0⟩', { class: 'circuit-ket' });
  const inLabel1 = txt(50, Y1, '|0⟩', { class: 'circuit-ket' });
  const outLabel = txt(X_OUT, (Y0 + Y1) / 2, '|Φ⁺⟩', { class: 'circuit-ket circuit-out' });

  svg.appendChild(inLabel0);
  svg.appendChild(inLabel1);
  svg.appendChild(outLabel);

  container.appendChild(svg);

  const description = document.createElement('p');
  description.className = 'sr-only';
  container.appendChild(description);

  const toDegrees = (radians) => Math.round((radians * 180) / Math.PI);

  return function draw({ q0, q1, label, alpha0, alpha1 }) {
    inLabel0.textContent = `|${q0}⟩`;
    inLabel1.textContent = `|${q1}⟩`;
    outLabel.textContent = label;
    // Dim each Ry gate when its angle is zero (acting as identity)
    ryGroup0.setAttribute('opacity', Math.abs(alpha0) < 0.005 ? '0.28' : '1');
    ryGroup1.setAttribute('opacity', Math.abs(alpha1) < 0.005 ? '0.28' : '1');

    description.textContent =
      `Circuit: q0 starts at |${q0}⟩ and q1 starts at |${q1}⟩. ` +
      `A Hadamard gate on q0 is followed by a CNOT with q0 as control and ` +
      `q1 as target, preparing the Bell state ${label}. ` +
      `After that, an Rᵧ rotation of ${toDegrees(alpha0)} degrees is applied ` +
      `to q0 and ${toDegrees(alpha1)} degrees to q1.`;
  };
}
