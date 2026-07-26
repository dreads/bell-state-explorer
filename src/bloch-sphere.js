import { interpolate } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// English defaults so this module works standalone even with no locale
// layer wired up; app.js passes the active locale's resolved strings on
// every draw() once one exists.
const DEFAULT_STRINGS = {
  origin: 'Bloch vector for {qubit}: at the origin (maximally mixed, no information about this qubit alone).',
  vector: 'Bloch vector for {qubit}: x = {x}, y = {y}, z = {z}, magnitude = {magnitude}.',
};

const W = 180;
const H = 200;
const R = 58;          // sphere radius in SVG units
const CX = W / 2;     // sphere centre x
const CY = 108;        // sphere centre y (shifted down to leave room for z-label)

// Orthographic projection basis: x→lower-right, y→lower-left, z→up
// Each vector is the 2D [screenX, screenY] displacement per unit in that 3D axis.
// x and y are mirror images of each other (equal weight, opposite sign on
// screenX) so the sphere reads as symmetric left-to-right; the 0.65/0.37
// split is not a true isometric ratio, just a by-eye pick that keeps all
// three axes visually distinct without any one foreshortening to a point.
const BX = [0.65, 0.37];
const BY = [-0.65, 0.37];
const BZ = [0.0, -1.0];

function proj(x, y, z) {
  return [
    CX + (BX[0] * x + BY[0] * y + BZ[0] * z) * R,
    CY + (BX[1] * x + BY[1] * y + BZ[1] * z) * R,
  ];
}

export function norm([x, y, z]) {
  const m = Math.hypot(x, y, z);
  return m < 1e-12 ? [0, 0, 0] : [x / m, y / m, z / m];
}

export function cross([ax, ay, az], [bx, by, bz]) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/**
 * A unit vector perpendicular to n, used as one in-plane axis when drawing a
 * great circle. Crossing with [1,0,0] fails when n is nearly parallel to it
 * (result collapses toward zero), so fall back to [0,1,0] in that case —
 * n can't be nearly parallel to both.
 */
export function perp(n) {
  return norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function svgText(x, y, str, attrs = {}) {
  const t = el('text', {
    x: x.toFixed(1),
    y: y.toFixed(1),
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    ...attrs,
  });
  t.textContent = str;
  return t;
}

/**
 * SVG path `d` for a great circle in the plane whose normal is normalVec.
 * Builds an orthonormal in-plane basis {u, v} for that plane (perp() picks
 * one axis, cross(n, u) picks the other), then walks the unit circle in
 * that basis and projects each point to 2D — this is what lets one function
 * draw all three axis-aligned great circles from a single normal vector.
 */
export function circleD(normalVec) {
  const n = norm(normalVec);
  const u = perp(n);
  const v = norm(cross(n, u));
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * 2 * Math.PI;
    const c = Math.cos(t), s = Math.sin(t);
    const [sx, sy] = proj(
      c * u[0] + s * v[0],
      c * u[1] + s * v[1],
      c * u[2] + s * v[2],
    );
    d += `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)} `;
  }
  return d + 'Z';
}

/** Filled arrowhead triangle at (x2, y2) pointing toward it from (x1, y1). */
export function headD(x1, y1, x2, y2, size = 6) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return '';
  const ux = dx / len, uy = dy / len;
  const w = size * 0.42;
  const bx = x2 - ux * size, by = y2 - uy * size;
  return (
    `M${x2.toFixed(1)},${y2.toFixed(1)} ` +
    `L${(bx + uy * w).toFixed(1)},${(by - ux * w).toFixed(1)} ` +
    `L${(bx - uy * w).toFixed(1)},${(by + ux * w).toFixed(1)} Z`
  );
}

function addAxis(svg, from3, to3, labelPos3, labelStr) {
  const [x1, y1] = proj(...from3);
  const [x2, y2] = proj(...to3);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  // Shorten line to leave room for arrowhead
  const t = len > 5 ? 1 - 5 / len : 0;
  svg.appendChild(el('line', {
    x1: x1.toFixed(1), y1: y1.toFixed(1),
    x2: (x1 + dx * t).toFixed(1), y2: (y1 + dy * t).toFixed(1),
    stroke: 'var(--ink-faint)', 'stroke-width': '1',
  }));
  svg.appendChild(el('path', { d: headD(x1, y1, x2, y2, 5), fill: 'var(--ink-faint)' }));
  const [lx, ly] = proj(...labelPos3);
  svg.appendChild(svgText(lx, ly, labelStr, {
    'font-size': '11',
    fill: 'var(--ink-faint)',
    'font-family': 'var(--font-body)',
  }));
}

/**
 * Create two Bloch sphere panels (q0, q1) inside container.
 * Returns a draw(vec0, vec1) function where each vec is [rx, ry, rz].
 */
export function createBlochSpheres(container) {
  const drawFns = {};

  ['q0', 'q1'].forEach((qubit) => {
    const panel = document.createElement('div');
    panel.className = 'bloch-panel';

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      // Orientation/rotation of a 3D vector doesn't have a native ARIA
      // equivalent; hidden from the accessibility tree in favor of the
      // sr-only paragraph below (same pattern as matrix-grid.js).
      'aria-hidden': 'true',
    });

    // Sphere fill
    svg.appendChild(el('circle', { cx: CX, cy: CY, r: R, class: 'bloch-sphere-fill' }));

    // Three great circles (equatorial, x-z plane, y-z plane) — dashed
    const gcAttrs = {
      fill: 'none',
      stroke: 'var(--ink-faint)',
      'stroke-width': '1',
      'stroke-dasharray': '3,3',
    };
    svg.appendChild(el('path', { ...gcAttrs, d: circleD([0, 0, 1]) }));
    svg.appendChild(el('path', { ...gcAttrs, d: circleD([0, 1, 0]) }));
    svg.appendChild(el('path', { ...gcAttrs, d: circleD([1, 0, 0]) }));

    // Sphere outline
    svg.appendChild(el('circle', {
      cx: CX, cy: CY, r: R,
      fill: 'none', stroke: 'var(--rule-strong)', 'stroke-width': '0.75',
    }));

    // Axes: z (up), x (lower-right), y (lower-left)
    addAxis(svg, [0, 0, -1.28], [0, 0, 1.28], [0, 0, 1.55], 'z');
    addAxis(svg, [-1.28, 0, 0], [1.28, 0, 0], [1.55, 0, 0], 'x');
    addAxis(svg, [0, -1.28, 0], [0, 1.28, 0], [0, 1.55, 0], 'y');

    // Pole labels
    const [nx, ny] = proj(0, 0, 1);
    const [sx, sy] = proj(0, 0, -1);
    const poleAttrs = { 'font-size': '10', fill: 'var(--ink-faint)', 'font-family': 'var(--font-data)' };
    svg.appendChild(svgText(nx + 15, ny, '|0⟩', poleAttrs));
    svg.appendChild(svgText(sx + 15, sy, '|1⟩', poleAttrs));

    // Bloch vector group — replaced on every draw
    const vecG = el('g');
    svg.appendChild(vecG);

    const labelEl = document.createElement('p');
    labelEl.className = 'bloch-label';
    labelEl.textContent = qubit;

    const vectorText = document.createElement('p');
    vectorText.className = 'sr-only';

    panel.appendChild(svg);
    panel.appendChild(labelEl);
    panel.appendChild(vectorText);
    container.appendChild(panel);

    drawFns[qubit] = ([rx, ry, rz], strings = DEFAULT_STRINGS) => {
      vecG.replaceChildren();

      const magnitude = Math.hypot(rx, ry, rz);
      vectorText.textContent =
        magnitude < 0.008
          ? interpolate(strings.origin, { qubit })
          : interpolate(strings.vector, {
              qubit,
              x: rx.toFixed(2),
              y: ry.toFixed(2),
              z: rz.toFixed(2),
              magnitude: magnitude.toFixed(2),
            });

      if (magnitude < 0.008) return;

      const [ox, oy] = proj(0, 0, 0);
      const [ex, ey] = proj(rx, ry, rz);
      const dx = ex - ox, dy = ey - oy;
      const len = Math.hypot(dx, dy);
      const t = len > 7 ? 1 - 7 / len : 0;

      vecG.appendChild(el('line', {
        x1: ox.toFixed(1), y1: oy.toFixed(1),
        x2: (ox + dx * t).toFixed(1), y2: (oy + dy * t).toFixed(1),
        stroke: 'var(--bloch-vec)', 'stroke-width': '2.5',
      }));
      vecG.appendChild(el('path', {
        d: headD(ox, oy, ex, ey, 7),
        fill: 'var(--bloch-vec)',
      }));
    };
  });

  return (vec0, vec1, strings = DEFAULT_STRINGS) => {
    drawFns.q0(vec0, strings);
    drawFns.q1(vec1, strings);
  };
}
