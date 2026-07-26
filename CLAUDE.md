# Bell State Density Matrix Explorer

Interactive visualization of the two-qubit density matrix for Bell states.
No build step, no dependencies. Plain ES modules, static files.

## Running locally

```bash
npm run serve   # serves on http://localhost:8000
npm test        # 12 physics unit tests
```

## File structure

```
index.html                 markup and controls
src/state.js                physics core — no DOM dependency
src/matrix-grid.js          SVG renderer
src/bloch-sphere.js         Bloch sphere SVG renderer
src/circuit-diagram.js      circuit diagram SVG renderer
src/app.js                  control wiring
src/styles.css              light/dark themes via CSS variables
test/state.test.js          Node-runnable physics tests (incl. property-based invariants)
test/matrix-grid.test.js    tests for matrix-grid.js's pure math helpers
test/bloch-sphere.test.js   tests for bloch-sphere.js's pure vector-math helpers
```

## Architecture

### state.js (pure, no DOM)
- `densityMatrix({ psi, negative, theta, dephasing })` — builds 4x4 real symmetric rho
  - `psi=false` → Phi family {00,11}; `psi=true` → Psi family {01,10}
  - `theta` in radians: amplitude balance (PI/4 = equal = maximally entangled)
  - `dephasing` 0–1: damps off-diagonal by `(1 - p)`, leaves diagonal unchanged
- `concurrence(rho)` — entanglement measure 0–1; for this family = `2 * |coherence|`
- `purity(rho)` — `Tr(rho^2)`; 1 for pure, 0.5 for fully dephased mixture
- `bellFromInput(q0, q1)` → `{ negative, psi }` — maps H+CNOT input bits to Bell state
- `stateLabel({ psi, negative })` → Unicode ket string

### matrix-grid.js
- `createMatrixGrid(container)` — builds SVG scaffolding (axis labels, grid lines) once
- Returns `draw(rho)` function — only redraws cells (efficient for slider drags)
- `magnitudeOpacity(value)` → `0.1 + 0.52 * min(1, |v|/0.5)` — floor keeps tiny values visible
- Negative entries get a `sign-bar` rect knocked out of the cell fill
- `magnitudeOpacity` and `describe` are exported (in addition to `createMatrixGrid`)
  specifically so their math/formatting logic gets direct unit tests, per the
  100%-math-coverage rule below — see `test/matrix-grid.test.js`

### app.js
- `model` object holds `{ q0, q1, theta, dephasing }`
- `render()` is the single update path: computes rho → draw → update all DOM readouts
- Toggle buttons (q0/phase, q1/family) are coupled pairs writing the same two bits
- `interpret()` returns a plain-English description of the current quantum state

### styles.css
- All colors via CSS custom properties (`--ink`, `--paper`, `--rule`, etc.)
- Dark mode via `@media (prefers-color-scheme: dark)`
- `.cell` fill is `var(--ink)`; `.sign-bar` fill is `var(--paper)` (creates knockout effect)
- Layout: two-column grid (SVG left, controls right), collapses to single column at 46rem

## Physics conventions

Bell states from H + CNOT circuit:
| q0 | q1 | State | Description |
|----|-----|-------|-------------|
| 0  | 0   | Phi+  | correlated, positive phase |
| 0  | 1   | Psi+  | anticorrelated, positive phase |
| 1  | 0   | Phi-  | correlated, negative phase |
| 1  | 1   | Psi-  | anticorrelated, negative phase |

Basis order in rows/cols: 00, 01, 10, 11 (indices 0–3).

## Added: Bloch sphere panel

`src/bloch-sphere.js` — renders two Bloch spheres (q0, q1) using orthographic SVG projection.
- `createBlochSpheres(container)` → `draw(vec0, vec1)` where each vec is `[rx, ry, rz]`
- `state.js` exports `partialTrace0(rho)`, `partialTrace1(rho)`, `blochVector(rho2)`
- For our real-valued states: rx=0, ry=0 always; rz = cos(2θ) for q0, ±cos(2θ) for q1
- At θ=45°: both vectors at origin (individually maximally mixed, entangled globally)
- Dephasing does NOT move the Bloch vectors (partial trace wipes out the coherences)
- `#bloch-spheres` div in index.html below the main `.layout`
- CSS: `--bloch-vec`, `--bloch-sphere`, `.bloch-sphere-fill`, `.bloch-panel`, `.bloch-label`
- The pure vector-math helpers (`norm`, `cross`, `perp`, `circleD`, `headD`) are
  exported alongside `createBlochSpheres` so they get direct unit tests
  (`test/bloch-sphere.test.js`) without needing a DOM — same rationale as
  `matrix-grid.js`'s exported helpers above

## Added: Local rotation (Ry gate)

`state.js` exports `applyLocalRotation(rho, alpha)` — applies Rᵧ(α)⊗I to the 4×4 density matrix.
- Uses private `mat4mul` and `transpose4` helpers (4×4 real matrix multiply / transpose)
- `alpha` in radians; returns `rho` unchanged when alpha < 1e-10
- U = Rᵧ(α)⊗I in |00⟩,|01⟩,|10⟩,|11⟩ basis: block-diagonal [[c,0,-s,0],[0,c,0,-s],[s,0,c,0],[0,s,0,c]]

Render flow in `app.js`:
1. `baseRho = densityMatrix(...)` — Bell state with dephasing
2. `rho = applyLocalRotation(baseRho, model.localRotation)` — local rotation applied after
3. `concurrence(baseRho)` — uses Bell-state-specific formula; valid because local unitaries preserve entanglement
4. `purity(rho)` — Tr(ρ²), valid for any state

Circuit diagram: Ry gate group dims to opacity 0.28 when alpha≈0 (identity). Draw function takes `{ q0, q1, label, alpha }`.

Slider: `#local-rotation` 0–360°, model stores radians. `#local-rotation-value` shows degrees.

Key physics: at θ=45° (maximal entanglement), Bloch vectors don't move regardless of α. Below 45°, q0's Bloch vector sweeps the x-z plane.

## Planned extension directions

From README — areas where the codebase is designed to grow:

1. **Amplitude damping** — relaxation toward |00>; moves diagonal unlike dephasing
2. **Complex phases** — second grid for imaginary part, or per-cell phase channel
3. **Circuit diagram** — SVG above the matrix showing H + CNOT gates
4. **Rotated basis measurement** — shows interference distinguishing superposition from mixture

## Code conventions

- Vanilla ES modules, no transpilation
- SVG created via `document.createElementNS` with helper `el(name, attrs)`
- Tests use Node's built-in `assert` — no test framework
- Always create tests for math. We want 100% coverage. This applies to any
  exported pure-math helper, not just `src/state.js` — e.g. `magnitudeOpacity`
  in `matrix-grid.js` and the vector helpers in `bloch-sphere.js` are exported
  for exactly this reason even though their primary callers are SVG renderers.
- `npm run test:coverage` (Node 20+, uses `--experimental-test-coverage`)
  measures this goal directly; `npm test` alone does not check coverage.
- Prefer property-based tests (randomized sampling over a seeded PRNG, e.g.
  `mulberry32` in `test/state.test.js`) for invariants that should hold across
  the whole parameter space (trace, positive-semi-definiteness, rotation
  group properties), in addition to fixed-value example tests.
- No classes; module-level functions with explicit parameter objects
- CSS classes named semantically (`.cell`, `.sign-bar`, `.tick`, `.readout`)