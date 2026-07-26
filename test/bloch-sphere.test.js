import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, cross, perp, circleD, headD } from '../src/bloch-sphere.js';

const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} not within ${tol} of ${b}`);

const dot = ([ax, ay, az], [bx, by, bz]) => ax * bx + ay * by + az * bz;
const mag = (v) => Math.hypot(...v);

test('norm returns a unit vector for any nonzero input', () => {
  for (const v of [[3, 0, 0], [1, 1, 1], [-2, 5, -7], [0.001, 0, 0]]) {
    close(mag(norm(v)), 1);
  }
});

test('norm preserves direction (result is a positive scalar multiple of the input)', () => {
  const v = [2, -4, 1];
  const n = norm(v);
  close(n[0] / v[0], n[1] / v[1]);
  close(n[1] / v[1], n[2] / v[2]);
  assert.ok(n[0] / v[0] > 0);
});

test('norm returns the zero vector for a near-zero input', () => {
  assert.deepEqual(norm([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(norm([1e-13, 1e-13, 0]), [0, 0, 0]);
});

test('cross product is orthogonal to both inputs', () => {
  const a = [1, 2, 3];
  const b = [-2, 0, 4];
  const c = cross(a, b);
  close(dot(c, a), 0);
  close(dot(c, b), 0);
});

test('cross of orthogonal unit axes gives the third unit axis', () => {
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(cross([0, 1, 0], [0, 0, 1]), [1, 0, 0]);
});

test('perp returns a unit vector orthogonal to n, on and off the fallback axis', () => {
  for (const n of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.707]]) {
    const p = perp(n);
    close(mag(p), 1);
    close(dot(p, n), 0);
  }
});

test('circleD emits a closed SVG path with 60 segments', () => {
  const d = circleD([0, 0, 1]);
  assert.ok(d.startsWith('M'));
  assert.ok(d.trim().endsWith('Z'));
  assert.equal((d.match(/L/g) || []).length, 60);
});

test('circleD traces a different path for different normals', () => {
  assert.notEqual(circleD([0, 0, 1]), circleD([1, 0, 0]));
});

test('headD returns an empty path when the segment is too short to draw an arrowhead', () => {
  assert.equal(headD(0, 0, 0.5, 0, 6), '');
});

test('headD returns a three-point triangle path for a normal-length segment', () => {
  const d = headD(0, 0, 10, 0);
  const points = d.match(/-?\d+\.\d/g) || [];
  assert.equal(d[0], 'M');
  assert.ok(d.trim().endsWith('Z'));
  assert.equal(points.length, 6);
});
