import { BASIS } from './state.js';
import { interpolate } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 44;
const CELL = 62;
const SIZE = PAD + CELL * 4;
const EPSILON = 0.004;

// English defaults so this module works standalone (as the existing tests
// rely on) even with no locale layer wired up. app.js passes the active
// locale's resolved strings here on every draw() once one exists.
const DEFAULT_STRINGS = {
  svgTitle: 'Density matrix',
  svgDescIntro:
    'Four by four grid with the numeric value printed in every cell. Fill darkness also encodes magnitude, and a thin underline marks a negative entry.',
  tableCaption: 'Density matrix values by row and column basis state',
  entryTemplate: 'row {row} column {col} equals {value}',
  summaryTemplate: 'Nonzero entries: {entries}.',
  joinText: '; ',
  allZero: 'All entries are zero.',
};

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

/**
 * The SVG grid is marked aria-hidden (see createMatrixGrid) because a 16-cell
 * fill-opacity heatmap has no meaningful native ARIA table semantics. This
 * visually-hidden HTML table is the accessible equivalent screen readers
 * actually navigate — same values, proper row/column <th scope> headers.
 */
function buildMatrixTable(strings) {
  const table = document.createElement('table');
  table.className = 'sr-only';

  const caption = document.createElement('caption');
  caption.textContent = strings.tableCaption;
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  BASIS.forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  return { table, tbody, caption };
}

function renderMatrixRows(tbody, rho) {
  const frag = document.createDocumentFragment();
  BASIS.forEach((rowLabel, r) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = rowLabel;
    tr.appendChild(th);
    BASIS.forEach((_, c) => {
      const td = document.createElement('td');
      td.textContent = rho[r][c].toFixed(2);
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  tbody.replaceChildren(frag);
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
    // A 16-cell fill-opacity heatmap doesn't translate to useful ARIA
    // semantics on its own; the sr-only <table> built below is the real
    // accessible path, so the visual is hidden from the accessibility tree
    // to avoid a screen reader announcing raw SVG structure instead.
    'aria-hidden': 'true',
  });

  const title = el('title', {});
  title.textContent = DEFAULT_STRINGS.svgTitle;
  svg.appendChild(title);

  const desc = el('desc', {});
  desc.textContent = DEFAULT_STRINGS.svgDescIntro;
  svg.appendChild(desc);

  axisLabels(svg);

  const cells = el('g', { class: 'cells' });
  svg.appendChild(cells);

  gridLines(svg);
  container.appendChild(svg);

  const { table, tbody, caption } = buildMatrixTable(DEFAULT_STRINGS);
  container.appendChild(table);

  return function draw(rho, strings = DEFAULT_STRINGS) {
    title.textContent = strings.svgTitle;
    caption.textContent = strings.tableCaption;
    const frag = document.createDocumentFragment();

    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const value = rho[r][c];
        const x = PAD + CELL * c;
        const y = PAD + CELL * r;

        if (Math.abs(value) >= EPSILON) {
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
            // A thin underline near the cell's bottom edge, independent of the
            // centered value label above it, so a negative sign is visible
            // without relying on reading the text (colorblind/low-vision cue).
            frag.appendChild(
              el('rect', {
                x: x + CELL * 0.25,
                y: y + CELL * 0.74,
                width: CELL * 0.5,
                height: CELL * 0.08,
                class: 'sign-bar',
              })
            );
          }
        }

        // Text color must stay legible against its own cell's fill, which
        // ranges from near-paper (opacity 0.1) to a medium tint (opacity
        // 0.62, never full ink). Switching at the 0.5 mark keeps contrast
        // above ~4:1 across that whole range (see README Accessibility).
        const useInk = magnitudeOpacity(value) <= 0.5;
        frag.appendChild(
          Object.assign(
            el('text', {
              x: x + CELL / 2,
              y: y + CELL / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              class: `cell-value ${useInk ? 'cell-value-ink' : 'cell-value-paper'}`,
            }),
            { textContent: value.toFixed(2) }
          )
        );
      }
    }

    cells.replaceChildren(frag);
    desc.textContent = describe(rho, strings);
    renderMatrixRows(tbody, rho);
  };
}

export function describe(rho, strings = DEFAULT_STRINGS) {
  const parts = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if (Math.abs(rho[r][c]) < EPSILON) continue;
      parts.push(interpolate(strings.entryTemplate, { row: BASIS[r], col: BASIS[c], value: rho[r][c].toFixed(2) }));
    }
  }
  return parts.length
    ? interpolate(strings.summaryTemplate, { entries: parts.join(strings.joinText) })
    : strings.allZero;
}
