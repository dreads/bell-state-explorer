import { test } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeOpacity, describe } from '../src/matrix-grid.js';

const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} not within ${tol} of ${b}`);

function zeros() {
  return [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
}

test('magnitudeOpacity has a floor of 0.1 at zero magnitude', () => {
  close(magnitudeOpacity(0), 0.1);
});

test('magnitudeOpacity reaches its ceiling of 0.62 at |value| = 0.5', () => {
  close(magnitudeOpacity(0.5), 0.62);
  close(magnitudeOpacity(-0.5), 0.62);
});

test('magnitudeOpacity clamps rather than exceeding the ceiling beyond 0.5', () => {
  close(magnitudeOpacity(1), 0.62);
  close(magnitudeOpacity(-2), 0.62);
});

test('magnitudeOpacity is symmetric in the sign of value', () => {
  for (const value of [0.1, 0.25, 0.4]) {
    close(magnitudeOpacity(value), magnitudeOpacity(-value));
  }
});

test('magnitudeOpacity scales linearly between the floor and ceiling', () => {
  close(magnitudeOpacity(0.25), 0.1 + 0.52 * 0.5);
});

test('describe reports an all-zero matrix as such', () => {
  assert.equal(describe(zeros()), 'All entries are zero.');
});

test('describe lists each nonzero entry with its row and column basis labels', () => {
  const rho = zeros();
  rho[0][3] = 0.5;
  rho[3][0] = 0.5;
  assert.equal(
    describe(rho),
    'Nonzero entries: row 00 column 11 equals 0.50; row 11 column 00 equals 0.50.'
  );
});

test('describe omits entries below the display epsilon', () => {
  const rho = zeros();
  rho[1][2] = 0.001;
  assert.equal(describe(rho), 'All entries are zero.');
});
