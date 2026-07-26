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
index.html                              markup and controls
src/state.js                             physics core — no DOM dependency
src/matrix-grid.js                       SVG renderer + sr-only accessible table
src/bloch-sphere.js                      Bloch sphere SVG renderer + sr-only description
src/circuit-diagram.js                   circuit diagram SVG renderer + sr-only description
src/export.js                            builds the export payload — no DOM dependency
src/i18n.js                              translate()/fallback lookup — no DOM dependency
src/app.js                               control wiring
src/styles.css                           light/dark themes via CSS variables
locales/en.js                            source-of-truth English string bundle (static import)
schema/bell-state-export.schema.json     JSON Schema (draft 2020-12) for the export payload
test/state.test.js                       Node-runnable physics tests (incl. property-based invariants)
test/matrix-grid.test.js                 tests for matrix-grid.js's pure math helpers
test/bloch-sphere.test.js                tests for bloch-sphere.js's pure vector-math helpers
test/export.test.js                      tests for export.js's payload shape and values
test/i18n.test.js                        tests for i18n.js's lookup/fallback/interpolation
```

## Architecture

### state.js (pure, no DOM)
- `densityMatrix({ psi, negative, theta, dephasing })` — builds 4x4 real symmetric rho
  - `psi=false` → Phi family {00,11}; `psi=true` → Psi family {01,10}
  - `theta` in radians: amplitude balance (PI/4 = equal = maximally entangled)
  - `dephasing` 0–1: damps off-diagonal by `(1 - p)`, leaves diagonal unchanged
- `concurrence(rho)` — entanglement measure 0–1; for this family = `2 * |coherence|`
- `purity(rho)` — `Tr(rho^2)`; 1 for pure, 0.5 for fully dephased mixture
- `classifyState({ conc, pur, dephasing, theta })` → one of 5 kebab-case regime
  keys (`fully-dephased`, `product-state`, `maximally-entangled`, `pure-partial`,
  `partially-dephased`). Pure branching logic, deliberately no prose — see
  `locales/en.js` for the strings and `src/i18n.js` for the lookup
- `bellFromInput(q0, q1)` → `{ negative, psi }` — maps H+CNOT input bits to Bell state
- `stateLabel({ psi, negative })` → Unicode ket string

### matrix-grid.js
- `createMatrixGrid(container)` — builds SVG scaffolding (axis labels, grid lines) once
- Returns `draw(rho)` function — only redraws cells (efficient for slider drags)
- `magnitudeOpacity(value)` → `0.1 + 0.52 * min(1, |v|/0.5)` — floor keeps tiny values visible
- Every cell gets a printed numeric value (`.cell-value`, 2 decimals), all 16
  cells, not just nonzero ones. Text fill switches ink/paper at
  `magnitudeOpacity(value) <= 0.5` to stay legible against the cell's own
  fill — see the README Accessibility section for the contrast math behind
  that threshold before changing it.
- Negative entries additionally get a `sign-bar` underline near the cell's
  bottom edge (moved there so it doesn't collide with the centered value text)
- The SVG is `aria-hidden="true"`: a 16-cell opacity heatmap has no useful
  native ARIA semantics. The accessible equivalent is a visually-hidden
  (`.sr-only`) `<table>` built by `buildMatrixTable`/`renderMatrixRows` in the
  same file, with proper `<th scope="row">`/`<th scope="col">` headers,
  updated every `draw()` call. Any new SVG visual added to this project should
  follow the same pattern (see README Accessibility).
- `magnitudeOpacity` and `describe` are exported (in addition to `createMatrixGrid`)
  specifically so their math/formatting logic gets direct unit tests, per the
  100%-math-coverage rule below — see `test/matrix-grid.test.js`

### app.js
- `model` object holds `{ q0, q1, theta, dephasing }`
- `render()` is the single update path: computes rho → draw → update all DOM readouts
- Toggle buttons (q0/phase, q1/family) are coupled pairs writing the same two bits
- The `#reading` interpretation text is `classifyState(...)` (state.js) piped
  through `translate(activeLocale, en, ...)` (i18n.js) — see "Added: i18n
  foundation" below before touching either

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
- Each sphere's `<svg>` is `aria-hidden="true"`; a `.sr-only` paragraph per
  qubit (updated every `draw()` call) states rx/ry/rz numerically — same
  aria-hidden + sr-only-equivalent pattern as `matrix-grid.js` (see README
  Accessibility)

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

### circuit-diagram.js
- `createCircuitDiagram(container)` — builds the static H + CNOT + Rᵧ⊗Rᵧ gate
  layout once. Returns `draw({ q0, q1, label, alpha0, alpha1 })`, called every
  render with the current input bits, Bell-state label, and both rotation
  angles (radians)
- Ry gate groups dim to opacity 0.28 when their angle is ~0 (acting as identity)
- `<svg>` is `aria-hidden="true"`; a `.sr-only` paragraph (updated every
  `draw()` call) states the same information in prose, converting the
  rotation angles to degrees to match the visible slider readouts

## Added: Accessibility (aria-hidden + sr-only pattern)

Target is WCAG 2.2 AA (full rationale in README's Accessibility section — read
that before changing anything here). The convention every SVG visual in this
project follows:

- The `<svg>` itself gets `aria-hidden="true"` — spatial/visual encodings
  (fill opacity, vector orientation, gate position) have no faithful ARIA
  mapping, so don't attempt one.
- A plain-language equivalent (a `.sr-only` `<table>` for the matrix grid, a
  `.sr-only` `<p>` per Bloch sphere, a `.sr-only` `<p>` for the circuit
  diagram) is rendered alongside it and updated every `draw()` call.
- None of these are `aria-live` — they're available on navigation, not
  announced on every slider tick (matches `#grid`'s existing `aria-live="off"`).
  The one exception is `#reading` (`role="status"`), a deliberate concise
  live summary.
- **Any new SVG visual added to this project must follow this same pattern.**
- The matrix grid's per-cell text color (ink vs. paper) switches at
  `magnitudeOpacity(value) <= 0.5`, derived from an actual WCAG contrast
  calculation against this app's `--ink`/`--paper` tokens — recheck that
  threshold if those tokens change (see README for the numbers).

## Added: State export (JSON Schema)

`src/export.js` — `buildExportPayload(model, now = new Date())`, pure/no-DOM.
Assembles settings (radians, matching `state.js`'s own convention) plus every
derived measurement (density matrix, concurrence, purity, outcome
probabilities, both Bloch vectors, Bell-state label/equation) into an object
conforming to `schema/bell-state-export.schema.json` (JSON Schema draft
2020-12). `SCHEMA_VERSION`/`SCHEMA_URL` are exported constants; bump
`SCHEMA_VERSION` and the schema file together on any breaking shape change.

`#export-state` button in `index.html` (next to Reset); `app.js`'s
`exportState()` calls `buildExportPayload(model)` and triggers a download via
Blob + a temporary anchor — browser-only, not unit tested. The payload shape
itself is checked in `test/export.test.js` by hand (exact key sets and types)
rather than through a schema-validation library, since this project has no
dependencies — keep that test in sync with the schema file, neither currently
enforces the other automatically.

## Added: i18n foundation (Phase 0)

This is the first slice of a larger internationalization/localization plan
(full assessment and architecture proposal delivered as a report, not
committed to this repo as a doc — ask if you need it re-summarized). Only
what's described here is actually wired up today:

- `state.js`'s `classifyState(...)` replaces the old `app.js` `interpret()`:
  same branching logic, but returns a key instead of composed English prose.
- `locales/en.js` is the source-of-truth string bundle — currently just the
  five `interpret.*` keys, holding byte-identical text to the old hardcoded
  strings (verified by a DOM-stub regression check; nothing user-visible
  changed).
- `src/i18n.js`'s `translate(bundle, fallbackBundle, key, params)` does a
  dot-path lookup with `{placeholder}` interpolation and **silent per-key
  fallback** to `fallbackBundle` — this is the mechanism that lets a partial
  or outdated third-party locale bundle keep working forever without the
  maintainer touching it.
- `app.js` has a single `activeLocale` const (currently always `en`) marked
  as the seam where locale selection/loading will plug in later.

**Not yet built** (proposed, not started): loading additional locale bundles
(JSON, fetched on demand, vs. `en`'s static import), a `locales/manifest.json`
discovery list, automatic `navigator.languages` detection + manual override,
a language-picker control, a JSON Schema for locale bundle shape, the
verified/community two-tier badge, `dir="rtl"`/logical-CSS-property work, or
migrating the other composed-prose strings (`matrix-grid.js`'s `describe()`,
`bloch-sphere.js`'s and `circuit-diagram.js`'s sr-only templates) to this
same mechanism. Do not assume any of that exists — check before building on
top of it.

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