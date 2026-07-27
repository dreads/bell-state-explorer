import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_TARGETS,
  getExportTarget,
  buildPlaceholders,
  renderTemplate,
  loadCircuitExport,
} from '../src/circuit-export.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const BASE_MODEL = { q0: 0, q1: 0, theta: Math.PI / 4, dephasing: 0, rotation0: 0, rotation1: 0 };

test('EXPORT_TARGETS is a non-empty registry of well-shaped targets', () => {
  assert.ok(EXPORT_TARGETS.length >= 2);
  EXPORT_TARGETS.forEach((target) => {
    assert.equal(typeof target.id, 'string');
    assert.equal(typeof target.label, 'string');
    assert.equal(typeof target.templatePath, 'string');
    assert.equal(typeof target.filename('phi-plus'), 'string');
    assert.equal(typeof target.mimeType, 'string');
  });
  const ids = EXPORT_TARGETS.map((t) => t.id);
  assert.deepEqual(ids, [...new Set(ids)], 'target ids must be unique');
});

test('getExportTarget finds a known target and throws on an unknown one', () => {
  assert.equal(getExportTarget('qiskit').id, 'qiskit');
  assert.throws(() => getExportTarget('nope'), /Unknown circuit export target/);
});

test('buildPlaceholders encodes all four Bell states correctly', () => {
  const cases = [
    { q0: 0, q1: 0, ascii: 'Phi+', ket: '|Φ⁺⟩' },
    { q0: 0, q1: 1, ascii: 'Psi+', ket: '|Ψ⁺⟩' },
    { q0: 1, q1: 0, ascii: 'Phi-', ket: '|Φ⁻⟩' },
    { q0: 1, q1: 1, ascii: 'Psi-', ket: '|Ψ⁻⟩' },
  ];
  cases.forEach(({ q0, q1, ascii, ket }) => {
    const p = buildPlaceholders({ ...BASE_MODEL, q0, q1 }, NOW);
    assert.equal(p.Q0_INPUT, String(q0));
    assert.equal(p.Q1_INPUT, String(q1));
    assert.equal(p.BELL_LABEL_ASCII, ascii);
    assert.equal(p.BELL_LABEL_KET, ket);
  });
});

test('buildPlaceholders formats rotation angles in both radians and degrees', () => {
  const p = buildPlaceholders({ ...BASE_MODEL, rotation0: Math.PI / 2, rotation1: Math.PI }, NOW);
  assert.equal(p.ALPHA0_RAD, (Math.PI / 2).toFixed(10));
  assert.equal(p.ALPHA1_RAD, Math.PI.toFixed(10));
  assert.equal(p.ALPHA0_DEG, '90');
  assert.equal(p.ALPHA1_DEG, '180');
});

test('buildPlaceholders defaults missing rotations to zero without throwing', () => {
  const p = buildPlaceholders({ q0: 0, q1: 0 }, NOW);
  assert.equal(p.ALPHA0_RAD, (0).toFixed(10));
  assert.equal(p.ALPHA1_RAD, (0).toFixed(10));
});

test('buildPlaceholders emits an active X line only for a set input bit', () => {
  const bothZero = buildPlaceholders({ ...BASE_MODEL, q0: 0, q1: 0 }, NOW);
  assert.match(bothZero.X0_LINE, /^\/\//);
  assert.match(bothZero.X1_LINE, /^\/\//);

  const bothOne = buildPlaceholders({ ...BASE_MODEL, q0: 1, q1: 1 }, NOW);
  assert.equal(bothOne.X0_LINE, 'x q[0];');
  assert.equal(bothOne.X1_LINE, 'x q[1];');
});

test('buildPlaceholders stamps GENERATED_AT from the injected clock', () => {
  const p = buildPlaceholders(BASE_MODEL, NOW);
  assert.equal(p.GENERATED_AT, NOW.toISOString());
});

test('renderTemplate substitutes every token present in the placeholder map', () => {
  const template = 'Q0=@@Q0_INPUT@@ label=@@BELL_LABEL_ASCII@@';
  const rendered = renderTemplate(template, { Q0_INPUT: '0', BELL_LABEL_ASCII: 'Phi+' });
  assert.equal(rendered, 'Q0=0 label=Phi+');
});

test('renderTemplate leaves ordinary code untouched (no accidental collisions)', () => {
  const template = 'd = {0: "x"}  # not a token, has no @@ delimiters';
  assert.equal(renderTemplate(template, {}), template);
});

test('renderTemplate throws when a template token has no placeholder value', () => {
  assert.throws(
    () => renderTemplate('value=@@MISSING_TOKEN@@', {}),
    /no placeholder value for MISSING_TOKEN/,
  );
});

function fakeFetch(routes) {
  return async (url) => {
    if (!(url in routes)) return { ok: false, status: 404 };
    return { ok: true, text: async () => routes[url] };
  };
}

test('loadCircuitExport renders the fetched template and derives filename/label', async () => {
  const template = 'input q0=@@Q0_INPUT@@ q1=@@Q1_INPUT@@ ry0=@@ALPHA0_RAD@@';
  const fetchImpl = fakeFetch({ 'export-templates/qiskit.py': template });
  const result = await loadCircuitExport('qiskit', { ...BASE_MODEL, q0: 1, q1: 0 }, { fetchImpl, now: NOW });

  assert.equal(result.content, `input q0=1 q1=0 ry0=${(0).toFixed(10)}`);
  assert.equal(result.filename, 'bell-state-phi-minus-qiskit.py');
  assert.equal(result.label, 'Qiskit (Python)');
  assert.equal(result.mimeType, 'text/x-python');
});

test('loadCircuitExport produces a distinct filename per Bell state', async () => {
  const fetchImpl = fakeFetch({ 'export-templates/openqasm3.qasm': 'x' });
  const phiPlus = await loadCircuitExport('openqasm3', { ...BASE_MODEL, q0: 0, q1: 0 }, { fetchImpl, now: NOW });
  const psiMinus = await loadCircuitExport('openqasm3', { ...BASE_MODEL, q0: 1, q1: 1 }, { fetchImpl, now: NOW });
  assert.equal(phiPlus.filename, 'bell-state-phi-plus.qasm');
  assert.equal(psiMinus.filename, 'bell-state-psi-minus.qasm');
});

test('loadCircuitExport throws when the template fetch fails', async () => {
  const fetchImpl = fakeFetch({});
  await assert.rejects(
    () => loadCircuitExport('qiskit', BASE_MODEL, { fetchImpl, now: NOW }),
    /Failed to load export template/,
  );
});

test('loadCircuitExport throws for an unknown target id before ever fetching', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: false }; };
  await assert.rejects(
    () => loadCircuitExport('cirq', BASE_MODEL, { fetchImpl, now: NOW }),
    /Unknown circuit export target/,
  );
  assert.equal(called, false);
});

test('the real checked-in templates render without leftover tokens or missing-placeholder errors', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

  for (const target of EXPORT_TARGETS) {
    const templateText = fs.readFileSync(path.join(root, target.templatePath), 'utf8');
    const placeholders = buildPlaceholders(BASE_MODEL, NOW);
    const rendered = renderTemplate(templateText, placeholders);
    assert.doesNotMatch(rendered, /@@[A-Z0-9_]+@@/, `${target.templatePath} left an unsubstituted @@TOKEN@@`);
  }
});
