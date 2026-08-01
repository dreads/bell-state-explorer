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
src/circuit-export.js                    renders export-templates/* into a runnable circuit file — no DOM dependency
src/i18n.js                              translate()/fallback lookup — no DOM dependency
src/locale-loader.js                     locale discovery/fetch, fetch injectable — no DOM dependency
src/app.js                               control wiring
src/styles.css                           light/dark themes via CSS variables
locales/en.json                          source-of-truth English bundle (fetched, same as every other locale)
locales/en-US.json, en-UK.json           regional English bundles (fetched)
locales/es.json                          contributed Spanish bundle
locales/manifest.json                    picker option list only — not used for detection
locales/qaa.json, qab.json, qac.json     mock/test-only locales, commented out by default
schema/bell-state-export.schema.json     JSON Schema (draft 2020-12) for the export payload
schema/locale-bundle.schema.json         JSON Schema (draft 2020-12) for PR-contributed locale bundles
export-templates/qiskit.py               checked-in static Qiskit program with @@TOKEN@@ placeholders
export-templates/openqasm2.qasm          checked-in static OpenQASM 2.0 program with @@TOKEN@@ placeholders
doc/quantum-export-research.md           viability research behind the circuit-export feature
scripts/check-i18n-coverage.js           npm run lint:i18n — hardcoded-string scanner, wired into GHA
test/state.test.js                       Node-runnable physics tests (incl. property-based invariants)
test/matrix-grid.test.js                 tests for matrix-grid.js's pure math helpers
test/bloch-sphere.test.js                tests for bloch-sphere.js's pure vector-math helpers
test/export.test.js                      tests for export.js's payload shape and values
test/circuit-export.test.js              tests for circuit-export.js's placeholders/rendering/loader
test/circuit-export-syntax.test.js       build-time validation that rendered templates are well-formed
test/i18n.test.js                        tests for i18n.js's lookup/fallback/interpolation
test/locale-loader.test.js               tests for locale-loader.js (candidate expansion, fetch orchestration)
test/locale-bundles.test.js              shape-validates every locales/*.json bundle
qiskit-runtime/                          separate Python subproject, see its own README/WORKFLOWS.md + CI/CD section below
doc/running-quantum-jobs-in-cicd.md      research narrative behind the qiskit-runtime/ CI/CD pipeline
doc/CLAUDE_CODE_BUILD_SPEC-CICD-PIPELINE.md  standalone build spec for that pipeline
.github/CODEOWNERS                       requires named-owner review on circuit/pipeline paths before merge
.github/workflows/deploy.yml             npm test + lint:i18n, then deploy to GitHub Pages
.github/workflows/validate.yml           branch validation for the quantum payload, no network/secrets
.github/workflows/nightly.yml            scheduled device-health check (environment: dev)
.github/workflows/run-on-merge.yml       real-hardware submission on push to main (environment: prod)
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
  `locales/en.json` for the strings and `src/i18n.js` for the lookup
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
  through `translate(activeLocale.strings, en.strings, ...)` (i18n.js)
- `#locale-picker`, `applyLocale()`, `initLocale()` — see "Added: i18n
  foundation" below before touching any of this

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

## Added: i18n foundation (Phase 0 + 1)

Full assessment and architecture rationale delivered as a report, not
committed to this repo as a doc — ask if you need it re-summarized. Only
English ships as a maintained locale; **any other locale is contributed by
PR** — this project has no live/user-submitted content pipeline, no
"verified" vs "community" distinction, and no build step for locale files.

- `state.js`'s `classifyState(...)` replaces the old `app.js` `interpret()`:
  same branching logic, but returns a key instead of composed English prose.
  `stateEquationBody({psi,negative})` splits the "(|00⟩ + |11⟩)/√2" half out
  of `stateEquation()` so the bell-row list can display it separately.
- **Every user-visible/accessibility-relevant string in the app is now
  externalized** (not just `interpret.*`) — `locales/en.json`'s `strings` tree
  has five namespaces: `interpret`, `ui` (static chrome + app.js's small
  templates), `matrixGrid`, `blochSphere`, `circuitDiagram`. Math/ket
  notation, basis labels (`00`/`01`/`10`/`11`), axis letters, gate labels
  (`H`/`Ry`), and `q0`/`q1` identifiers stay hardcoded by design — they're
  notation, not language. `meta.targetsVersion` (bump on any shape change) is
  a plain literal for other bundles' `meta.targetsVersion` to reference —
  informational only, never enforced at runtime.
- **`locales/en.json` is the single source of truth for English** — fetched
  the same way as every other locale, via `app.js`'s `ensureEnglish()`
  (`loadLocaleBundle('en')`, cached as a singleton promise). There is no
  separate `.js` copy to keep in sync (this project used to ship one as a
  static import specifically to avoid a network round-trip on first paint;
  that duplication was removed in favor of a single JSON source, mirroring
  [nv-mag-explorer](https://github.com/dreads/nv-mag-explorer), which reused
  this project's i18n system). The tradeoff: `init()` now `await`s
  `ensureEnglish()` once, before the very first `render()` — unlike
  nv-mag-explorer's static page (no model/`render()`, so its default-English
  DOM needs no JS and can fetch English lazily), this app's readouts and
  sr-only descriptions are computed by `render()` with no HTML text to fall
  back on, so first paint waits on that one same-origin JSON fetch.
- **Static HTML text**: tag an element `data-i18n="namespace.key"` in
  `index.html` and it's picked up automatically — no per-string JS wiring.
  `app.js`'s `applyStaticText()` walks every `[data-i18n]` element plus
  handles `document.title` and `meta[name="description"]` specially (they
  don't use `textContent`). Called once in `init()` and again on every
  `applyLocale()`. Elements whose text depends on model state (buttons,
  readouts) are deliberately **not** tagged — they're driven by `render()`
  via the `t(key, params)` helper instead, so the two mechanisms never touch
  the same element.
- `app.js`'s `t(key, params)` is a shorthand for
  `translate(activeLocale.strings, englishBundle.strings, key, params)`;
  `resolveStrings(namespace, keys)` resolves a flat key list into the
  `{ key: text }` bag the three renderer modules' `draw()` functions expect.
- **matrix-grid.js / bloch-sphere.js / circuit-diagram.js** each take an
  optional `strings` parameter on their `draw()` (default = a `DEFAULT_STRINGS`
  object with the current English text), so all three keep working
  standalone — exactly how the existing tests call them — with zero locale
  wiring. `app.js` always passes `resolveStrings(...)` explicitly. Templates
  are filled with `i18n.js`'s `interpolate()` (imported directly — it's a
  pure string helper with no DOM/locale coupling, so reusing it here doesn't
  compromise these modules' independence). `matrix-grid.js`'s `describe()`
  keeps its fragment-loop logic in code but now builds each fragment from
  `strings.entryTemplate`/joins with `strings.joinText`/wraps with
  `strings.summaryTemplate`, falling back to `strings.allZero` — the
  branching logic stayed in JS, only the phrase templates moved to locale keys.
- The four bell-row list items in `index.html` are empty `<span>`s populated
  once at init by `populateBellRows()` from `stateLabel()`/`stateEquationBody()`
  — no more hardcoded duplicate of what those functions already compute.
- `src/i18n.js`'s `translate(bundle, fallbackBundle, key, params)` does a
  dot-path lookup with `{placeholder}` interpolation and **silent per-key
  fallback** to `fallbackBundle` — a partial or outdated PR-contributed
  bundle keeps working forever without maintainer intervention; it just
  shows English for whatever key it doesn't have.
- `src/locale-loader.js`: `expandCandidates(languages)` (pure — expands each
  BCP-47 tag with its base language, e.g. `pt-BR` → `[pt-BR, pt]`) plus
  `loadManifest`/`loadLocaleBundle`/`detectLocale` (async, `fetch` injectable
  for testing). **`detectLocale` probes `locales/<code>.json` directly for
  each candidate from `navigator.languages`, independent of the manifest** —
  a bundle file copied straight into `locales/` on a local build is found
  and used with zero manifest edits. `detectLocale` stops and returns `null`
  (use `en`) as soon as `"en"` is reached in the candidate list.
- `locales/manifest.json`: a flat array of `{ code, endonym, englishName }`.
  This is **only** consulted to populate the language-picker's option list
  (there's no directory-listing API on static hosting) — it plays no role in
  auto-detection. Adding a locale via PR = add `locales/<code>.json` + one
  array entry here. `loadManifest` (only this function) strips full-line
  `//` comments before parsing, so entries can be toggled by hand — see the
  mock locales below for the exact convention.
- Three **mock/test-only** locales — `locales/{qaa,qab,qac}.json` — exist
  for manual QA and are commented out in the manifest by default. `qaa`/`qab`
  are complete bundles covering all five namespaces (`qaa` long/accented LTR
  text to stress layout, `qab` `direction: "rtl"` with constructed
  placeholder words to exercise dir-mirroring and the renderer sr-only
  templates); `qac` is deliberately partial (a handful of `interpret`/`ui`
  keys only) to demonstrate the per-key English fallback live in the
  browser, now across namespaces, not just `interpret`. Codes use the
  `qaa`–`qtz` range ISO 639-2 reserves for private/local use, so they can
  never collide with a real contributed language. To try one: uncomment its
  line in `locales/manifest.json`, restart `npm run serve`, hard-reload.
- `schema/locale-bundle.schema.json` (draft 2020-12, same convention as the
  export schema): validates a bundle's `meta`/`strings` shape. `strings.*`
  properties are all optional (no `required` list) — a bundle is valid
  whether complete or partial, by design.
- `app.js`: `#locale-picker` `<select>` in `index.html`'s header.
  `applyLocale(bundle)` sets `activeLocale`, `document.documentElement.lang`
  /`.dir` from `bundle.meta`, adds a picker option if missing, and
  re-renders. `init()` is now `async`: it `await`s `ensureEnglish()` before
  the first `render()`, then calls `initLocale()` — which resolves a saved
  `localStorage` preference, else `detectLocale(navigator.languages)`, and
  populates the picker from the manifest — all independently, so a slow or
  failed fetch of a *non-English* locale never blocks the initial paint
  (English itself was already awaited by then).
- `scripts/check-i18n-coverage.js` (`npm run lint:i18n`, zero dependencies,
  wired into the GHA workflow after `npm test`): flags index.html text-bearing
  tags without `data-i18n`/`data-i18n-exempt`, `<title>`/meta-description
  drift from `locales/en.json`, `data-i18n` values that don't resolve to a real
  key (typo catcher), and hardcoded `.textContent = "literal"` assignments in
  `src/*.js`. It's a heuristic, not a parser — false positives get a
  `data-i18n-exempt` next to the markup, not a script tweak. It reads
  `locales/en.json` itself via `fs.readFileSync` + `JSON.parse` (this is a
  plain Node script, not a browser module, so it has no need for `fetch`).
- `test/locale-bundles.test.js` hand-validates every `locales/*.json` (shape,
  required meta, valid `direction`, no unknown section/key vs `locales/en.json`,
  all-string values) — this is what "tested" means in the contribution
  process below, enforced by `npm test`.

**Contributing a locale — two paths:**
1. **Into the shipped app**: open a PR adding `locales/<code>.json` (validate
   it by hand against `schema/locale-bundle.schema.json`) plus one entry in
   `locales/manifest.json`. It must pass `npm test` (shape-checked by
   `test/locale-bundles.test.js`) and `npm run lint:i18n`, and the contributor
   should have manually verified it renders correctly locally (uncomment it,
   `npm run serve`, check in a browser) before opening the PR — the maintainer
   reviews the PR as code, not as a translation.
2. **Local-only, no PR**: drop `locales/<code>.json` straight into a local
   checkout's `locales/` folder. It's auto-detected if it matches a
   `navigator.languages` preference (`detectLocale`, no manifest edit
   needed), or reachable from the picker by adding one line to your own
   local `locales/manifest.json`. This never touches the shared repo.

**Not yet built**: `dir="rtl"`-driven CSS logical-property fixes (the
`.slider-row output` / `.reading` physical properties, and the `.layout`
3-column grid order — see the report), an LTR-lock wrapper for the matrix
grid and circuit diagram SVGs, and `Intl.NumberFormat` at the display
boundary. A "simple English" reading-level variant was considered and
explicitly deferred, not built. Do not assume any of that exists — check
before building on top of it.

## Added: Circuit export (Qiskit / OpenQASM 2.0)

`src/circuit-export.js` (pure, no DOM) — renders the app's current state into
a runnable circuit program for an external SDK/vendor, from a checked-in
static template in `export-templates/` plus `@@TOKEN@@` substitution.
**No runtime code generation**: the templates are real, well-formed programs
checked into the repo; the JS only fills in the values that vary per app
state. Full reasoning (why only the ideal unitary circuit is exported, what a
fair sim/hardware comparison requires, the Qiskit/OpenQASM bit-order gotcha)
is in `doc/quantum-export-research.md` — read that before changing any of
this, not just this summary.

- `EXPORT_TARGETS` is a flat registry: `{ id, label, templatePath, filename,
  mimeType }`. Adding a vendor/format is one more template file plus one
  more entry here — no changes to `buildPlaceholders`/`renderTemplate`/
  `loadCircuitExport`. Currently two targets: `qiskit` (Python,
  `export-templates/qiskit.py`) and `openqasm2` (vendor-neutral,
  `export-templates/openqasm2.qasm` — accepted by nearly every gate-model
  provider's toolchain, which is why it covers "other IDEs/hardware" more
  cheaply than adding vendor SDKs one at a time; see the research doc).
  **OpenQASM 2.0, not 3**: 3 was the original choice but OpenQASM 3 import
  support proved inconsistent in practice — IBM Quantum Composer threw parse
  errors on it — so the vendor-neutral target was downgraded to the older,
  far more universally supported 2.0. If OpenQASM 3 support matures broadly
  later, that's a case for *adding* a third target, not reverting this one.
- **Only the ideal, unitary circuit is exported** — state prep (X) + H +
  CNOT + `Rᵧ(α0)`⊗`Rᵧ(α1)`. The app's `dephasing` slider is applied in
  `state.js` as a direct multiplication of off-diagonal density-matrix
  entries — a quantum channel, not a gate — so there is no unitary that
  reproduces it, and it is deliberately left out rather than approximated.
  Both templates say this explicitly in their own header comment/docstring,
  independent of any doc that references them.
- `buildPlaceholders(model, now)` is pure — computes every `@@TOKEN@@` ->
  string value pair (input bits, rotation angles in both radians and
  degrees, Bell-state label/equation, conditional X-gate lines for
  OpenQASM 2.0) from the model, independent of which template consumes them.
- `renderTemplate(template, placeholders)` is pure — global substitution,
  throws if the template references a token with no placeholder value
  (typo guard, not a silent pass-through).
- `loadCircuitExport(targetId, model, { fetchImpl, now })` fetches the
  target's template (fetch injectable, same convention as
  `locale-loader.js`) and returns the rendered `{ content, filename,
  mimeType, label }`. **Unlike locale-loader.js's silent degrade-to-English
  on a failed fetch**, this throws on failure — the user explicitly asked
  for a file, so `app.js`'s `exportCircuit()` catches it and shows
  `ui.exportCircuitError` rather than doing nothing.
- `app.js`: `#circuit-export-target` `<select>` (options populated from
  `EXPORT_TARGETS` — vendor/format names are proper nouns, not translated,
  same rationale as the language picker's own-language `<option>`) and
  `#export-circuit` button, in a `.export-circuit-fieldset` at the bottom of
  `<main>`, below the matrix/Bloch/sidebar `.layout` and above the footer.
- Bit-order caveat baked into both templates' comments: Qiskit/most OpenQASM
  toolchains report measurement counts little-endian (rightmost character is
  qubit 0), while this app's basis labels read q0 then q1 left to right —
  get this backwards and outcomes silently swap for any non-symmetric θ.
- **Build-time validation** (`test/circuit-export-syntax.test.js`, part of
  `npm test`): renders both templates across all four Bell states plus a
  rotated case and checks the *rendered* output is well-formed, not just
  that substitution ran. `qiskit.py` is checked with a real parser — shells
  out to the system's `python3 -c "import ast; ast.parse(...)"` (stdin, no
  temp files); skips gracefully if `python3` isn't found locally, but
  GitHub Actions' `ubuntu-latest` runner ships `python3`, so CI always runs
  it for real. `openqasm2.qasm` has no zero-dependency real parser
  available, so it gets a structural heuristic (starts with `OPENQASM 2.0;`,
  balanced braces, every statement line ends in `;`/`{`/`}`) in the same
  "deliberately conservative, not a full parser" spirit as
  `scripts/check-i18n-coverage.js` — documented as a heuristic, not oversold
  as equivalent to the Python check.

## Added: CI/CD (quantum-job pipeline in `qiskit-runtime/`)

Independent of the app itself: `qiskit-runtime/` is a separate Python
subproject (own `requirements.txt`, not part of the zero-dependency static
site) implementing a full pipeline for taking a data scientist's quantum
circuit — checked into the repo, not uploaded anywhere — from a branch push
through validation, a free nightly device-health check, and (after human
approval) a real run on IBM Quantum hardware. It grew out of an earlier
single-script cross-check of `src/state.js`'s Phi+ math against a simulated
execution; that script (`run_circuit.py`) has been retired in favor of the
payload-driven design below. Full design rationale — the black-box
env-var contract, the payload-format contract, why there's no program-upload
step, the two-axis config model, the three-identity accountability model —
is in `qiskit-runtime/WORKFLOWS.md`; the research narrative behind it is
`doc/running-quantum-jobs-in-cicd.md`; the original build instructions are
`doc/CLAUDE_CODE_BUILD_SPEC-CICD-PIPELINE.md`. This section is a summary —
read `WORKFLOWS.md` before changing any of this, not just this summary.

- **The payload is a repo artifact, never uploaded.** A scientist checks in
  a circuit as `.qasm` (OpenQASM 2.0), `.py` (a module exposing
  `build_circuit() -> QuantumCircuit`), or `.ipynb` (one code cell tagged
  `circuit`, rest of the notebook ignored). `qiskit-runtime/payload.py`'s
  `load_circuit(path)` resolves any of the three to the same
  `QuantumCircuit`; every entrypoint below depends only on that object.
  There is no `upload_program()` anywhere in this codebase — what crosses
  the wire to IBM is the locally-transpiled circuit, submitted as a
  `SamplerV2` PUB (`qiskit-runtime/submit.py`'s `build_pub`/
  `submit_blocking`), never the payload file itself.
- **Three entrypoints, one env-var contract, one JSON result file.**
  `validate.py` (no network — structural/transpile check only),
  `test_integration.py` (connects to IBM Cloud, pulls a real backend's live
  calibration, builds a local Aer noise model, simulates the payload
  circuit against it, asserts `p(00)+p(11)` clears
  `QC_CORRELATION_THRESHOLD` — **never submits a hardware job**), and
  `run.py` (the real hardware path — thin wrapper over `submit.py`,
  blocking with a timeout). All three read the same `QC_*` env vars
  (`QC_PAYLOAD_PATH`, `QC_BACKEND`, `QC_INSTANCE`, `QC_CHANNEL`, `QC_SHOTS`,
  `QC_CORRELATION_THRESHOLD`, `QC_JOB_TIMEOUT_SEC`, `QC_RESULT_PATH`) and
  write the same result-JSON shape at `QC_RESULT_PATH` — the workflow YAML
  never scrapes log lines, never touches Make internals, and never hardcodes
  which circuit runs. Defaults live in `qiskit-runtime/Makefile`, which is
  intentionally thin — glue over the Python entrypoints, not logic.
- **Cloud simulators are gone; `test_integration.py` uses IBM's documented
  replacement.** IBM retired cloud-hosted simulator backends on 2024-05-15
  (see https://quantum.cloud.ibm.com/docs/en/guides/local-simulators), so
  `test_integration.py` pins a real backend by name (`service.backend(QC_BACKEND)`,
  default `ibm_marrakesh`) purely to read its calibration and hand it to
  `AerSimulator.from_backend()`; the circuit still runs entirely locally.
  Reading calibration is a backend-inspection call, not a job submission, so
  this preserves "never submits a job to a real QPU from the nightly check."
  Connectivity is verified independently first
  (`service.jobs(limit=1)`, a cheap round-trip that only needs a valid
  token + instance CRN) — an instance's CRN may be scoped to QPU access only
  with no simulator entitlement, a case this project hit directly, so
  proving "the token and instance actually authenticate" is decoupled from
  "and this account can also see backend X."
- **`instance` is a CRN** (Cloud Resource Name), found on the IBM Quantum
  Platform dashboard's Instances tab. Current channel is
  `ibm_quantum_platform` (replaced the older `ibm_quantum`/`ibm_cloud`
  channel split — re-verify against IBM's docs before assuming this is
  still current, same caution `doc/quantum-export-research.md` already
  calls out for this fast-moving API surface).
- **Three independent GHA workflows, split by trigger and secret exposure:**
  - `.github/workflows/validate.yml` — trigger: `push` (all branches except
    `main`) + `pull_request`. References no secrets, safe on PRs from forks.
    Runs `make -C qiskit-runtime validate` only — no network to IBM. Meant
    to be added as a **required status check** (Settings -> Branches ->
    branch protection for `main` -> "Require status checks to pass", a
    one-time manual repo-settings step).
  - `.github/workflows/nightly.yml` — trigger: daily `schedule` (02:00 UTC,
    deliberately outside the target device's post-calibration stabilization
    window — see issue #16 and the cron comment in the workflow file) +
    `workflow_dispatch`, gated with `if: github.repository_owner == 'dreads'`.
    Runs `make -C qiskit-runtime integration-test` under `environment: dev`
    (free/open instance credentials, no required reviewers — this run never
    spends QPU time).
  - `.github/workflows/run-on-merge.yml` — trigger: `push` to `main`,
    **`paths:`-filtered** to `qiskit-runtime/circuits/**` and
    `payload.py`/`submit.py`/`run.py` (plus manual `workflow_dispatch`) —
    deliberately *not* a bare push-to-main trigger, so real-hardware spend
    tracks circuit changes rather than merge cadence; an unrelated merge
    must not fire a paid job. Runs `make -C qiskit-runtime run` under
    `environment: prod`, which **must have required reviewers configured**
    (Settings -> Environments, can't be set from YAML alone) — the actual
    spend gate for real hardware submission.
- **Two gates of approval, not one — see `WORKFLOWS.md` for the full
  detail.** `.github/CODEOWNERS` (checked into the repo, requires a named
  owner's review before a circuit-touching PR can merge — needs "Require
  review from Code Owners" enabled in branch protection to take effect) and
  the `prod` environment's required-reviewer setting (config-only, gates
  the *run*, not the merge) answer different questions — "is this diff
  sound" vs. "should this spend money right now" — and neither substitutes
  for the other.
- **Two-axis config, three-identity accountability — see `WORKFLOWS.md` for
  the full detail.** Execution target (`simulator`/`qpu`) and environment
  (`dev`/`prod`, which carries credentials + approval) are kept
  independent, never collapsed into "dev means simulator." Author (signed
  commits), approver (CODEOWNERS + the `prod` environment's
  required-reviewer log, above), and submitter (a per-environment IBM
  Cloud IAM Service ID, audited via Activity Tracker) stay three separate
  identities in three independent systems — `run.py`'s result JSON ties
  `$GITHUB_SHA` + `$GITHUB_RUN_ID` +
  the real `job_id` together so the three trails are cross-referenceable.
- **Docker is local-dev-only.** `qiskit-runtime/Dockerfile` pins the exact
  Python/Qiskit versions for local rehearsal (`docker build` /
  `docker run`, see its README) so you can iterate without touching host
  Python. No GHA workflow uses this image or builds/pushes it — the
  runners are already isolated ephemeral containers, so adding an
  image-build step to CI itself would be pure overhead with no reproducibility
  benefit upstream's own CI doesn't already get for free.
- **Cost/quota discipline**: nightly cadence + simulator-only for `dev`,
  spend gated behind human approval for `prod`, is the ceiling for
  automatic cloud usage this project should incur without a deliberate
  decision to widen it (real QPU on a tighter cadence, a `test`/`staging`
  environment) — don't change either without accounting for the
  cost/queue-time tradeoff this section exists to document.
- **Async submission is documented, not built.** `submit.py` already keeps
  "submit" (`build_pub` + `SamplerV2.run`) and "read result" separable so a
  future reaper workflow can poll outstanding `job_id`s without a rewrite —
  see `WORKFLOWS.md`'s async section. Do not fuse them back together for
  `run.py`'s convenience.

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
- **Never hardcode a user-visible or accessibility-relevant string.** Every
  such string goes through the i18n system: `data-i18n="namespace.key"` for
  static HTML, `t(key, params)` (app.js) / `translate()`+`interpolate()`
  (renderer modules) for anything computed at render time. This is exactly
  as non-negotiable as the "100% test coverage on math" rule above — a
  hardcoded string today is invisible dead weight for every future locale.
  Genuinely non-translatable content (math/ket notation, `q0`/`q1`
  identifiers, basis labels) is the one exception — mark it
  `data-i18n-exempt` in HTML rather than leaving it silently untagged, so
  the exemption is deliberate and discoverable, not indistinguishable from
  an oversight. Run `npm run lint:i18n` before committing any UI change —
  see "Added: i18n foundation" below for what it checks and its limits.