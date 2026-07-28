/**
 * Renders the app's current state into a runnable circuit program for an
 * external quantum SDK/vendor, from a checked-in static template
 * (export-templates/*) plus simple @@TOKEN@@ substitution -- no runtime
 * code generation. See doc/quantum-export-research.md for why only the
 * ideal unitary circuit (X + H + CNOT + Ry(x)Ry) is exported and dephasing
 * is deliberately left out.
 *
 * EXPORT_TARGETS is a flat registry: adding a new vendor/format is one more
 * template file in export-templates/ plus one more entry here, no changes
 * to buildPlaceholders/renderTemplate/loadCircuitExport.
 */

import { bellFromInput, stateLabel, stateEquation } from './state.js';

export const EXPORT_TARGETS = [
  {
    id: 'qiskit',
    label: 'Qiskit (Python)',
    templatePath: 'export-templates/qiskit.py',
    filename: (slug) => `bell-state-${slug}-qiskit.py`,
    mimeType: 'text/x-python',
  },
  {
    id: 'openqasm2',
    label: 'OpenQASM 2.0',
    templatePath: 'export-templates/openqasm2.qasm',
    filename: (slug) => `bell-state-${slug}.qasm`,
    mimeType: 'text/plain',
  },
];

export function getExportTarget(id) {
  const target = EXPORT_TARGETS.find((t) => t.id === id);
  if (!target) throw new Error(`Unknown circuit export target: "${id}"`);
  return target;
}

/** e.g. "phi-plus", "psi-minus" -- used for both the filename slug and the
 * ASCII label baked into the exported program's header comment. */
function bellSlug({ psi, negative }) {
  return `${psi ? 'psi' : 'phi'}-${negative ? 'minus' : 'plus'}`;
}

function toDegrees(radians) {
  return String(Math.round((radians * 180) / Math.PI));
}

/** Fixed-decimal, never scientific notation, so the value is always a valid
 * numeric literal in both Python and OpenQASM. */
function formatRadians(radians) {
  return Number(radians).toFixed(10);
}

function xLine(bit, qubitIndex) {
  return bit
    ? `x q[${qubitIndex}];`
    : `// x q[${qubitIndex}];  (no-op: q${qubitIndex} input bit is 0)`;
}

/**
 * Pure: computes every @@TOKEN@@ -> string value pair from the app's model,
 * independent of which template consumes them (a template only uses the
 * subset of tokens it contains; unused keys are harmless).
 *
 * @param {{q0:number, q1:number, rotation0:number, rotation1:number}} model
 * @param {Date} [now]
 */
export function buildPlaceholders(model, now = new Date()) {
  const { q0, q1, rotation0, rotation1 } = model;
  const { psi, negative } = bellFromInput(q0, q1);
  const alpha0 = rotation0 || 0;
  const alpha1 = rotation1 || 0;

  return {
    GENERATED_AT: now.toISOString(),
    Q0_INPUT: String(q0),
    Q1_INPUT: String(q1),
    ALPHA0_RAD: formatRadians(alpha0),
    ALPHA1_RAD: formatRadians(alpha1),
    ALPHA0_DEG: toDegrees(alpha0),
    ALPHA1_DEG: toDegrees(alpha1),
    BELL_LABEL_ASCII: `${psi ? 'Psi' : 'Phi'}${negative ? '-' : '+'}`,
    BELL_LABEL_KET: stateLabel({ psi, negative }),
    BELL_EQUATION: stateEquation({ psi, negative }),
    X0_LINE: xLine(q0, 0),
    X1_LINE: xLine(q1, 1),
  };
}

const TOKEN_PATTERN = /@@([A-Z0-9_]+)@@/g;

/**
 * Substitutes every @@TOKEN@@ in `template` with `placeholders[TOKEN]`.
 * Throws if the template references a token with no matching placeholder --
 * this is a template/placeholder-map bug (e.g. a typo in either), not a
 * situation to silently paper over by leaving the raw token in the output.
 */
export function renderTemplate(template, placeholders) {
  const missing = new Set();
  const rendered = template.replace(TOKEN_PATTERN, (match, key) => {
    if (!(key in placeholders)) {
      missing.add(key);
      return match;
    }
    return placeholders[key];
  });
  if (missing.size > 0) {
    throw new Error(`renderTemplate: no placeholder value for ${Array.from(missing).join(', ')}`);
  }
  return rendered;
}

/**
 * Fetches the target's template and returns the rendered file ready to
 * download. Unlike locale-loader.js's fetch functions (which degrade
 * silently to English on failure, since a locale is a nice-to-have), a
 * failed circuit-export fetch throws: the user explicitly asked for a file
 * and getting nothing back with no explanation would be confusing, so the
 * caller (app.js) is expected to catch this and show an error.
 */
export async function loadCircuitExport(targetId, model, { fetchImpl = fetch, now = new Date() } = {}) {
  const target = getExportTarget(targetId);
  const response = await fetchImpl(target.templatePath);
  if (!response.ok) {
    throw new Error(`Failed to load export template "${target.templatePath}" (${response.status})`);
  }
  const templateText = await response.text();
  const placeholders = buildPlaceholders(model, now);
  const content = renderTemplate(templateText, placeholders);
  const { psi, negative } = bellFromInput(model.q0, model.q1);

  return {
    content,
    filename: target.filename(bellSlug({ psi, negative })),
    mimeType: target.mimeType,
    label: target.label,
  };
}
