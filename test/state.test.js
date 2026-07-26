import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  densityMatrix,
  concurrence,
  purity,
  outcomeProbabilities,
  bellFromInput,
  inputFromBell,
  stateLabel,
  stateEquation,
  partialTrace0,
  partialTrace1,
  blochVector,
  applyLocalRotation,
} from '../src/state.js';

const BELL = { psi: false, negative: false, theta: Math.PI / 4, dephasing: 0 };
const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} not within ${tol} of ${b}`);

// Deterministic PRNG (mulberry32) so randomized/property-based tests below are
// reproducible — same seed always exercises the same points in parameter space.
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomRho = (rand) =>
  densityMatrix({
    psi: rand() < 0.5,
    negative: rand() < 0.5,
    theta: (rand() * Math.PI) / 2,
    dephasing: rand(),
  });

const randomAngle = (rand) => (rand() - 0.5) * 4 * Math.PI;

// v^T rho v for a real vector v. Sampling this over many random v at many
// random rho is a standard black-box check for positive-semi-definiteness:
// a symmetric matrix is PSD iff this is non-negative for every v.
function quadForm(rho, v) {
  let sum = 0;
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      sum += v[r] * rho[r][c] * v[c];
    }
  }
  return sum;
}

test('pure Bell state has four entries of one half', () => {
  const rho = densityMatrix(BELL);
  close(rho[0][0], 0.5);
  close(rho[3][3], 0.5);
  close(rho[0][3], 0.5);
  close(rho[3][0], 0.5);
  close(rho[1][1], 0);
  close(rho[2][2], 0);
});

test('trace is one across the parameter space', () => {
  for (const theta of [0, 0.3, Math.PI / 4, 1.2, Math.PI / 2]) {
    for (const dephasing of [0, 0.25, 0.5, 1]) {
      const rho = densityMatrix({ psi: false, negative: false, theta, dephasing });
      const trace = rho[0][0] + rho[1][1] + rho[2][2] + rho[3][3];
      close(trace, 1);
    }
  }
});

test('negative phase flips only the off-diagonal sign', () => {
  const plus = densityMatrix(BELL);
  const minus = densityMatrix({ ...BELL, negative: true });
  close(minus[0][0], plus[0][0]);
  close(minus[3][3], plus[3][3]);
  close(minus[0][3], -plus[0][3]);
});

test('psi family populates the inner block', () => {
  const rho = densityMatrix({ ...BELL, psi: true });
  close(rho[1][1], 0.5);
  close(rho[2][2], 0.5);
  close(rho[0][0], 0);
  close(rho[3][3], 0);
});

test('dephasing leaves the diagonal untouched', () => {
  const clean = densityMatrix(BELL);
  const dirty = densityMatrix({ ...BELL, dephasing: 0.5 });
  close(dirty[0][0], clean[0][0]);
  close(dirty[3][3], clean[3][3]);
  close(dirty[0][3], 0.25);
});

test('full dephasing destroys entanglement but keeps populations', () => {
  const rho = densityMatrix({ ...BELL, dephasing: 1 });
  close(concurrence(rho), 0);
  close(rho[0][0], 0.5);
  close(purity(rho), 0.5);
});

test('maximally entangled state has concurrence one and purity one', () => {
  const rho = densityMatrix(BELL);
  close(concurrence(rho), 1);
  close(purity(rho), 1);
});

test('product state is pure but unentangled', () => {
  for (const theta of [0, Math.PI / 2]) {
    const rho = densityMatrix({ ...BELL, theta });
    close(concurrence(rho), 0);
    close(purity(rho), 1);
  }
});

test('partial imbalance gives intermediate concurrence at full purity', () => {
  const rho = densityMatrix({ ...BELL, theta: Math.PI / 8 });
  const c = concurrence(rho);
  assert.ok(c > 0 && c < 1, `concurrence ${c} should be strictly between 0 and 1`);
  close(purity(rho), 1);
});

test('purity never exceeds one', () => {
  for (let t = 0; t <= 90; t += 5) {
    for (let p = 0; p <= 100; p += 10) {
      const rho = densityMatrix({
        psi: false,
        negative: false,
        theta: (t * Math.PI) / 180,
        dephasing: p / 100,
      });
      assert.ok(purity(rho) <= 1 + 1e-9, `purity exceeded one at theta=${t}, p=${p}`);
    }
  }
});

test('matrix is symmetric', () => {
  const rho = densityMatrix({ psi: true, negative: true, theta: 0.7, dephasing: 0.3 });
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      close(rho[r][c], rho[c][r]);
    }
  }
});

test('input bits map to the four Bell states bijectively', () => {
  const seen = new Set();
  for (const q0 of [0, 1]) {
    for (const q1 of [0, 1]) {
      const bell = bellFromInput(q0, q1);
      seen.add(stateLabel(bell));
      assert.deepEqual(inputFromBell(bell), { q0, q1 });
    }
  }
  assert.equal(seen.size, 4);
});

test('stateLabel renders the four Bell kets', () => {
  assert.equal(stateLabel({ psi: false, negative: false }), '|Φ⁺⟩');
  assert.equal(stateLabel({ psi: false, negative: true }), '|Φ⁻⟩');
  assert.equal(stateLabel({ psi: true, negative: false }), '|Ψ⁺⟩');
  assert.equal(stateLabel({ psi: true, negative: true }), '|Ψ⁻⟩');
});

test('stateEquation renders the canonical formula for the four Bell states', () => {
  assert.equal(stateEquation({ psi: false, negative: false }), '|Φ⁺⟩ = (|00⟩ + |11⟩)/√2');
  assert.equal(stateEquation({ psi: false, negative: true }), '|Φ⁻⟩ = (|00⟩ − |11⟩)/√2');
  assert.equal(stateEquation({ psi: true, negative: false }), '|Ψ⁺⟩ = (|01⟩ + |10⟩)/√2');
  assert.equal(stateEquation({ psi: true, negative: true }), '|Ψ⁻⟩ = (|01⟩ − |10⟩)/√2');
});

test('concurrence picks the populated block regardless of family', () => {
  const phi = densityMatrix({ ...BELL, psi: false });
  const psi = densityMatrix({ ...BELL, psi: true });
  close(concurrence(phi), 1);
  close(concurrence(psi), 1);
});

test('outcome probabilities sum to one and match the diagonal', () => {
  const rho = densityMatrix({ ...BELL, theta: Math.PI / 6, dephasing: 0.4 });
  const outcomes = outcomeProbabilities(rho);
  assert.deepEqual(
    outcomes.map((o) => o.label),
    ['00', '01', '10', '11']
  );
  const total = outcomes.reduce((sum, o) => sum + o.probability, 0);
  close(total, 1);
  outcomes.forEach((o, k) => close(o.probability, rho[k][k]));
});

test('partial trace of a maximally entangled state is maximally mixed', () => {
  const rho = densityMatrix(BELL);
  for (const trace of [partialTrace0(rho), partialTrace1(rho)]) {
    close(trace[0][0], 0.5);
    close(trace[1][1], 0.5);
    close(trace[0][1], 0);
    close(trace[1][0], 0);
  }
});

test('partial trace of a product state is pure', () => {
  const rho = densityMatrix({ ...BELL, theta: 0 });
  const t0 = partialTrace0(rho);
  const t1 = partialTrace1(rho);
  close(t0[0][0], 1);
  close(t0[1][1], 0);
  close(t1[0][0], 1);
  close(t1[1][1], 0);
});

test('bloch vector is at the origin for a maximally entangled qubit', () => {
  const rho = densityMatrix(BELL);
  const [rx, ry, rz] = blochVector(partialTrace0(rho));
  close(rx, 0);
  close(ry, 0);
  close(rz, 0);
});

test('bloch vector points to the pole for a product state', () => {
  const rho = densityMatrix({ ...BELL, theta: 0 });
  const [rx0, ry0, rz0] = blochVector(partialTrace0(rho));
  close(rx0, 0);
  close(ry0, 0);
  close(rz0, 1);
});

test('applyLocalRotation is a no-op below the alpha threshold', () => {
  const rho = densityMatrix(BELL);
  assert.equal(applyLocalRotation(rho, 1e-11), rho);
});

test('applyLocalRotation preserves trace and purity for either qubit', () => {
  for (const qubit of [0, 1]) {
    for (const alpha of [0.3, Math.PI / 2, 2.1, Math.PI]) {
      const base = densityMatrix({ psi: false, negative: false, theta: 0.4, dephasing: 0.2 });
      const rotated = applyLocalRotation(base, alpha, qubit);
      const trace = rotated[0][0] + rotated[1][1] + rotated[2][2] + rotated[3][3];
      close(trace, 1);
      close(purity(rotated), purity(base));
    }
  }
});

test('applyLocalRotation on qubit 0 sweeps only q0 Bloch vector', () => {
  const base = densityMatrix({ psi: false, negative: false, theta: 0, dephasing: 0 });
  const rotated = applyLocalRotation(base, Math.PI / 2, 0);
  const [rx0, , rz0] = blochVector(partialTrace0(rotated));
  const [rx1, , rz1] = blochVector(partialTrace1(rotated));
  close(rx0, 1);
  close(rz0, 0);
  close(rx1, 0);
  close(rz1, 1);
});

test('applyLocalRotation on qubit 1 sweeps only q1 Bloch vector', () => {
  const base = densityMatrix({ psi: false, negative: false, theta: 0, dephasing: 0 });
  const rotated = applyLocalRotation(base, Math.PI / 2, 1);
  const [rx0, , rz0] = blochVector(partialTrace0(rotated));
  const [rx1, , rz1] = blochVector(partialTrace1(rotated));
  close(rx0, 0);
  close(rz0, 1);
  close(rx1, 1);
  close(rz1, 0);
});

// --- Property-based / invariant tests ---
// These sweep randomized points in parameter space rather than fixed values,
// so they catch bugs that only show up away from the specific cases above.

test('rho is positive-semi-definite across randomized parameters and rotations', () => {
  const rand = mulberry32(42);
  for (let trial = 0; trial < 40; trial += 1) {
    const base = randomRho(rand);
    const rho = applyLocalRotation(
      applyLocalRotation(base, randomAngle(rand), 0),
      randomAngle(rand), 1,
    );
    for (let s = 0; s < 15; s += 1) {
      const v = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const q = quadForm(rho, v);
      assert.ok(q > -1e-9, `quadratic form ${q} negative at trial ${trial}, sample ${s}`);
    }
  }
});

test('rho stays symmetric under randomized local rotations', () => {
  const rand = mulberry32(55);
  for (let trial = 0; trial < 30; trial += 1) {
    const base = randomRho(rand);
    const rho = applyLocalRotation(
      applyLocalRotation(base, randomAngle(rand), 0),
      randomAngle(rand), 1,
    );
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        close(rho[r][c], rho[c][r], 1e-9);
      }
    }
  }
});

test('trace remains one across randomized parameters and local rotations', () => {
  const rand = mulberry32(2024);
  for (let trial = 0; trial < 60; trial += 1) {
    const base = randomRho(rand);
    const rho = applyLocalRotation(
      applyLocalRotation(base, randomAngle(rand), 0),
      randomAngle(rand), 1,
    );
    const trace = rho[0][0] + rho[1][1] + rho[2][2] + rho[3][3];
    close(trace, 1, 1e-9);
  }
});

test('concurrence stays within [0, 1] across randomized parameters', () => {
  const rand = mulberry32(123);
  for (let trial = 0; trial < 60; trial += 1) {
    const c = concurrence(randomRho(rand));
    assert.ok(c >= -1e-9 && c <= 1 + 1e-9, `concurrence ${c} out of [0, 1]`);
  }
});

test('applyLocalRotation(-alpha) undoes applyLocalRotation(alpha), for either qubit', () => {
  // A rotation's inverse being its negation is a defining property of an
  // orthogonal one-parameter rotation group (which Ry(alpha) is meant to be).
  const rand = mulberry32(7);
  for (let trial = 0; trial < 20; trial += 1) {
    const base = randomRho(rand);
    for (const qubit of [0, 1]) {
      const alpha = randomAngle(rand);
      const rotated = applyLocalRotation(base, alpha, qubit);
      const restored = applyLocalRotation(rotated, -alpha, qubit);
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          close(restored[r][c], base[r][c], 1e-9);
        }
      }
    }
  }
});

test('applyLocalRotation composes additively: Ry(a) then Ry(b) equals Ry(a+b)', () => {
  const rand = mulberry32(99);
  for (let trial = 0; trial < 20; trial += 1) {
    const base = randomRho(rand);
    for (const qubit of [0, 1]) {
      const a = randomAngle(rand);
      const b = randomAngle(rand);
      const sequential = applyLocalRotation(applyLocalRotation(base, a, qubit), b, qubit);
      const combined = applyLocalRotation(base, a + b, qubit);
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          close(sequential[r][c], combined[r][c], 1e-9);
        }
      }
    }
  }
});

test('rotating qubit 0 and qubit 1 independently commutes', () => {
  // Ry on q0 and Ry on q1 act on disjoint tensor factors, so applying them in
  // either order must produce the same state.
  const rand = mulberry32(314);
  for (let trial = 0; trial < 20; trial += 1) {
    const base = randomRho(rand);
    const a = randomAngle(rand);
    const b = randomAngle(rand);
    const first = applyLocalRotation(applyLocalRotation(base, a, 0), b, 1);
    const second = applyLocalRotation(applyLocalRotation(base, b, 1), a, 0);
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        close(first[r][c], second[r][c], 1e-9);
      }
    }
  }
});
