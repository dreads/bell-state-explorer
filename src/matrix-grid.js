import { BASIS } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 44;
const CELL = 62;
const SIZE = PAD + CELL * 4;
const EPSILON = 0.004;

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

/**
 * Fill opacity encodes magnitude. Floor of 0.10 keeps very small but nonzero
 * entries visible rather than fading into the background.
 */
export function magnitudeOpacity(value) {
  return 0.1 + 0.52 * Math.min(1, Math.abs(value) / 0.5);
}

function axisLabels(svg) {
  BASIS.forEach((label, k) => {
    const centre = PAD + CELL * k + CELL / 2;
    const col = el('text', {
      x: centre,
      y: PAD - 18,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      class: 'tick',
    });
    col.textContent = label;
    svg.appendChild(col);

    const row = el('text', {
      x: PAD - 14,
      y: centre,
      'text-anchor': 'end',
      'dominant-baseline': 'central',
      class: 'tick',
    });
    row.textContent = label;
    svg.appendChild(row);
  });
}

function gridLines(svg) {
  const g = el('g', { class: 'gridlines' });
  g.appendChild(el('rect', { x: PAD, y: PAD, width: CELL * 4, height: CELL * 4 }));
  for (let k = 1; k < 4; k += 1) {
    const at = PAD + CELL * k;
    g.appendChild(el('line', { x1: at, y1: PAD, x2: at, y2: PAD + CELL * 4 }));
    g.appendChild(el('line', { x1: PAD, y1: at, x2: PAD + CELL * 4, y2: at }));
  }
  svg.appendChild(g);
}

/**
 * Create the static scaffolding once. Returns a function that redraws only the
 * cells, so slider drags do not rebuild axis labels and grid lines.
 */
export function createMatrixGrid(container) {
  const svg = el('svg', {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    width: '100%',
    role: 'img',
  });

  const title = el('title', {});
  title.textContent = 'Density matrix';
  svg.appendChild(title);

  const desc = el('desc', {});
  desc.textContent =
    'Four by four grid. Fill darkness encodes the magnitude of each entry; a knocked-out bar marks a negative entry; blank cells are zero.';
  svg.appendChild(desc);

  axisLabels(svg);

  const cells = el('g', { class: 'cells' });
  svg.appendChild(cells);

  gridLines(svg);
  container.appendChild(svg);

  return function draw(rho) {
    const frag = document.createDocumentFragment();

    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const value = rho[r][c];
        if (Math.abs(value) < EPSILON) continue;

        const x = PAD + CELL * c;
        const y = PAD + CELL * r;

        frag.appendChild(
          el('rect', {
            x,
            y,
            width: CELL,
            height: CELL,
            class: 'cell',
            'fill-opacity': magnitudeOpacity(value).toFixed(3),
          })
        );

        if (value < 0) {
          frag.appendChild(
            el('rect', {
              x: x + CELL * 0.24,
              y: y + CELL * 0.44,
              width: CELL * 0.52,
              height: CELL * 0.13,
              class: 'sign-bar',
            })
          );
        }
      }
    }

    cells.replaceChildren(frag);
    desc.textContent = describe(rho);
  };
}

export function describe(rho) {
  const parts = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if (Math.abs(rho[r][c]) < EPSILON) continue;
      parts.push(`row ${BASIS[r]} column ${BASIS[c]} equals ${rho[r][c].toFixed(2)}`);
    }
  }
  return parts.length ? `Nonzero entries: ${parts.join('; ')}.` : 'All entries are zero.';
}
