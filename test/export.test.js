import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportPayload, SCHEMA_VERSION, SCHEMA_URL } from '../src/export.js';

const BELL_MODEL = { q0: 0, q1: 0, theta: Math.PI / 4, dephasing: 0, rotation0: 0, rotation1: 0 };
const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} not within ${tol} of ${b}`);

test('buildExportPayload has the top-level shape required by the JSON Schema', () => {
  const payload = buildExportPayload(BELL_MODEL, new Date('2026-01-01T00:00:00.000Z'));
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['$schema', 'bellState', 'exportedAt', 'measurements', 'schemaVersion', 'settings'].sort()
  );
  assert.equal(payload.$schema, SCHEMA_URL);
  assert.equal(payload.schemaVersion, SCHEMA_VERSION);
  assert.match(payload.schemaVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(payload.exportedAt, '2026-01-01T00:00:00.000Z');
});

test('settings block has exactly the six schema-required fields with correct types', () => {
  const { settings } = buildExportPayload(BELL_MODEL);
  assert.deepEqual(
    Object.keys(settings).sort(),
    ['dephasing', 'q0', 'q1', 'rotation0Radians', 'rotation1Radians', 'thetaRadians'].sort()
  );
  assert.equal(typeof settings.q0, 'number');
  assert.equal(typeof settings.q1, 'number');
  assert.equal(typeof settings.thetaRadians, 'number');
  assert.equal(typeof settings.dephasing, 'number');
  assert.equal(typeof settings.rotation0Radians, 'number');
  assert.equal(typeof settings.rotation1Radians, 'number');
});

test('bellState block has exactly the four schema-required fields with correct types', () => {
  const { bellState } = buildExportPayload(BELL_MODEL);
  assert.deepEqual(Object.keys(bellState).sort(), ['equation', 'label', 'negative', 'psi'].sort());
  assert.equal(typeof bellState.label, 'string');
  assert.equal(typeof bellState.equation, 'string');
  assert.equal(typeof bellState.psi, 'boolean');
  assert.equal(typeof bellState.negative, 'boolean');
});

test('measurements block has exactly the six schema-required fields, correctly shaped', () => {
  const { measurements } = buildExportPayload(BELL_MODEL);
  assert.deepEqual(
    Object.keys(measurements).sort(),
    ['blochVectorQ0', 'blochVectorQ1', 'concurrence', 'densityMatrix', 'outcomeProbabilities', 'purity'].sort()
  );
  assert.equal(measurements.densityMatrix.length, 4);
  measurements.densityMatrix.forEach((row) => assert.equal(row.length, 4));
  assert.equal(typeof measurements.concurrence, 'number');
  assert.equal(typeof measurements.purity, 'number');
  assert.equal(measurements.outcomeProbabilities.length, 4);
  measurements.outcomeProbabilities.forEach((o) => {
    assert.equal(typeof o.label, 'string');
    assert.equal(typeof o.probability, 'number');
  });
  assert.equal(measurements.blochVectorQ0.length, 3);
  assert.equal(measurements.blochVectorQ1.length, 3);
});

test('a maximally entangled Phi+ export matches known physics values', () => {
  const payload = buildExportPayload(BELL_MODEL);
  assert.equal(payload.bellState.label, '|Φ⁺⟩');
  close(payload.measurements.concurrence, 1);
  close(payload.measurements.purity, 1);
  close(payload.measurements.densityMatrix[0][0], 0.5);
  close(payload.measurements.densityMatrix[3][3], 0.5);
  close(payload.measurements.densityMatrix[0][3], 0.5);
  payload.measurements.blochVectorQ0.forEach((v) => close(v, 0));
  payload.measurements.blochVectorQ1.forEach((v) => close(v, 0));
});

test('export reflects local rotation applied after Bell-state preparation', () => {
  const rotated = buildExportPayload({ ...BELL_MODEL, theta: 0, rotation0: Math.PI / 2 });
  close(rotated.measurements.blochVectorQ0[0], 1);
  close(rotated.measurements.blochVectorQ0[2], 0);
});

test('concurrence is reported from the pre-rotation state and is rotation-invariant', () => {
  const unrotated = buildExportPayload(BELL_MODEL);
  const rotated = buildExportPayload({ ...BELL_MODEL, rotation0: 1.3, rotation1: 2.1 });
  close(unrotated.measurements.concurrence, rotated.measurements.concurrence);
});
