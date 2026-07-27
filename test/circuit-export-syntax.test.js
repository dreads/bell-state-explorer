import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPORT_TARGETS, buildPlaceholders, renderTemplate } from '../src/circuit-export.js';

/**
 * Build-time validation that what a user actually downloads is well-formed,
 * not just that @@TOKEN@@ substitution ran cleanly (test/circuit-export.test.js
 * already covers that). Renders each checked-in template across a set of
 * representative app states and checks the *rendered* output parses/reads
 * as valid code in its target language.
 */

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOW = new Date('2026-01-01T00:00:00.000Z');

const REPRESENTATIVE_MODELS = [
  { q0: 0, q1: 0, rotation0: 0, rotation1: 0 },        // Phi+, identity rotation
  { q0: 0, q1: 1, rotation0: 0, rotation1: 0 },        // Psi+
  { q0: 1, q1: 0, rotation0: 0, rotation1: 0 },        // Phi-
  { q0: 1, q1: 1, rotation0: 0, rotation1: 0 },        // Psi-
  { q0: 0, q1: 0, rotation0: 1.2345, rotation1: -0.7 }, // exercises non-zero Ry angles
];

function renderedFor(target, model) {
  const templateText = fs.readFileSync(path.join(ROOT, target.templatePath), 'utf8');
  return renderTemplate(templateText, buildPlaceholders(model, NOW));
}

// --- Python (Qiskit) ---------------------------------------------------
// A real syntax check via the system's python3, not a heuristic: ast.parse
// either succeeds or raises SyntaxError, so a non-zero exit is unambiguous.
// No npm dependency is added for this — python3 isn't part of this project's
// own dependency graph, it's the runtime the exported file targets.

function pythonAvailable() {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function assertValidPythonSyntax(source, label) {
  try {
    execFileSync('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], {
      input: source,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    assert.fail(`${label}: rendered Python failed to parse:\n${stderr}`);
  }
}

test('rendered qiskit.py is valid Python for every representative app state', (t) => {
  if (!pythonAvailable()) {
    t.skip('python3 not found on this machine — this check always runs in CI (ubuntu-latest ships python3)');
    return;
  }
  const target = EXPORT_TARGETS.find((tgt) => tgt.id === 'qiskit');
  REPRESENTATIVE_MODELS.forEach((model) => {
    const rendered = renderedFor(target, model);
    assertValidPythonSyntax(rendered, `qiskit.py (q0=${model.q0}, q1=${model.q1}, rot=${model.rotation0}/${model.rotation1})`);
  });
});

// --- OpenQASM 3 ----------------------------------------------------------
// No zero-dependency OpenQASM 3 parser is available, so this is a
// structural heuristic in the same spirit as scripts/check-i18n-coverage.js:
// deliberately conservative, catches the mistakes a template edit is
// actually likely to introduce, not a substitute for a real grammar check.

function assertPlausibleOpenQasm3(source, label) {
  assert.match(source, /^OPENQASM 3;/, `${label}: must start with "OPENQASM 3;"`);
  assert.doesNotMatch(source, /@@[A-Z0-9_]+@@/, `${label}: left an unsubstituted @@TOKEN@@`);

  const opens = (source.match(/{/g) || []).length;
  const closes = (source.match(/}/g) || []).length;
  assert.equal(opens, closes, `${label}: unbalanced { }`);

  source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'))
    .forEach((line) => {
      assert.match(line, /[;{}]$/, `${label}: statement doesn't end with ';', '{' or '}': "${line}"`);
    });
}

test('rendered openqasm3.qasm is structurally plausible for every representative app state', () => {
  const target = EXPORT_TARGETS.find((tgt) => tgt.id === 'openqasm3');
  REPRESENTATIVE_MODELS.forEach((model) => {
    const rendered = renderedFor(target, model);
    assertPlausibleOpenQasm3(rendered, `openqasm3.qasm (q0=${model.q0}, q1=${model.q1}, rot=${model.rotation0}/${model.rotation1})`);
  });
});
