# Bell state density matrix explorer

An interactive visualisation of the two-qubit density matrix for Bell states,
with controls for dephasing, amplitude balance, and local single-qubit rotation.

Two qubits go through a Hadamard and a CNOT, producing one of the four Bell states 
depending on the input bits. The 4×4 density matrix is rendered as a greyscale grid 
where diagonal entries are measurement probabilities and off-diagonal entries are 
coherences. Sliders control dephasing, amplitude balance (θ), and single-qubit 
rotations on each qubit, with concurrence and purity displayed as live readouts. 

The tool deliberately steps one gate beyond Bell states to demonstrate a core
result in quantum information: **maximally entangled states are completely
immune to local operations at the single-qubit level.** Everything in the
interface is designed to make that result visible and interactive.

Below is an illustration of the concept, including color:

![dephasing_bell_state.jpg](doc/dephasing_bell_state.jpg)

Experts might notice that this explorer only works with the real number parts 
for simplicity, so hues indicating variations in phase have been omitted. 

## Running locally

```bash
npm run serve
```

Then open <http://localhost:8000>. Any static server works; the ES module
imports mean opening `index.html` directly from the filesystem will not.

## Tests

```bash
npm test
```

Tests cover the physics in `src/state.js` (trace preservation, symmetry,
positive-semi-definiteness, the effect of dephasing on populations versus
coherences, the rotation-group properties of the local rotation gate, and the
bijection between input bits and Bell states) plus the pure math in
`src/matrix-grid.js` and `src/bloch-sphere.js`. Property-based tests use a
seeded PRNG so failures are reproducible.

```bash
npm run test:coverage
```

Runs the same suite with Node's built-in coverage reporter
(`--experimental-test-coverage`, requires Node 20+) to check the 100%
math-coverage goal.

## Deploying to GitHub Pages

1. Push to a GitHub repository with `main` as the default branch.
2. In the repository, go to Settings → Pages.
3. Under "Build and deployment", set Source to **GitHub Actions**.
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` runs the
   tests, then publishes the repository root.

The site appears at `https://<user>.github.io/<repo>/`. Because every path in
`index.html` is relative, it works from a subdirectory without configuration.

## Circuit diagram

The circuit diagram panel shows the two-gate sequence that produces each Bell
state from a pair of classical input bits.

```
q0: |q0⟩ ──[H]──●──
                 |    ──  |Bell state⟩
q1: |q1⟩ ───────⊕──
```

**Hadamard gate (H)** is applied to q0. It takes a basis state and places it
into an equal superposition:

```
|0⟩  →  (|0⟩ + |1⟩) / √2
|1⟩  →  (|0⟩ − |1⟩) / √2
```

After H, q0 is genuinely in both states simultaneously — not a classical
coin flip but a coherent superposition that can interfere. The minus sign in
the second line is what produces the phase difference between Φ⁺/Φ⁻ and Ψ⁺/Ψ⁻.

**CNOT gate** uses q0 as the control (●) and q1 as the target (⊕). It flips
q1 if and only if q0 is \|1⟩. When the control is already in superposition,
this conditional flip correlates the two qubits in a way that cannot be
described by any product state — that correlation is entanglement.

The input ket labels update as you toggle the input buttons, and the output
label updates to the corresponding Bell state. The circuit itself never
changes; only the input changes.

**Local rotation Rᵧ(α)** appears after the CNOT, controlled by the Local
rotation slider:

```
q0: |q0⟩ ──[H]──●──[Rᵧ(α)]──
                 |               ── (locally rotated state)
q1: |q1⟩ ───────⊕─────────────
```

This gate is not part of the Bell state preparation — it sits outside the
bracket that produces the Bell state and is labelled separately in the diagram
so the boundary is always visible. The states it produces are no longer Bell
states; they are *locally equivalent* to Bell states, which is a distinct
class. The reason for including this gate is not to make new states but to
probe the Bell state: to ask what an observer holding only q0 can learn by
acting on it.

**Why Rᵧ and not Rx or Rz?** Bell states have real-valued amplitudes, and Rᵧ
has a real matrix — all entries are sines and cosines with no imaginary
components. Applying Rᵧ therefore keeps the density matrix real throughout,
which is why the Bloch vector y-component is always zero in this tool: it
equals `Tr(ρ σᵧ)`, which involves imaginary off-diagonal entries that are
never present in a real matrix. Rᵧ also sweeps Bloch vectors through the
x-z plane, which is exactly where they can move from their starting position
on the z-axis — making the effect visible. Rx would introduce complex-valued
density matrix entries and pull vectors into the y-direction, requiring the
imaginary part of the matrix to be tracked and rendered. Rz keeps z-axis
vectors on the z-axis (it adds a phase but no visible displacement), so it
would not illustrate the local-operation effect that motivates the control.

## How to read the matrix

Rows and columns are ordered 00, 01, 10, 11 in both directions.

Fill darkness encodes magnitude. A knocked-out horizontal bar marks a negative
entry. Blank cells are exactly zero.

Diagonal entries are the probabilities of each measurement outcome in the
computational basis. Off-diagonal entries are coherences: the phase relationship
between the two branches of the superposition. A classical mixture has the same
diagonal but no off-diagonal terms, which is why dephasing leaves measurement
statistics unchanged while destroying entanglement.

## Controls

The four toggles sit on two underlying bits, so `q0` and `phase` are the same
switch, as are `q1` and `Φ/Ψ family`. This mirrors the H + CNOT circuit: the
control qubit's input bit sets the relative phase, the target qubit's sets
whether the outcomes are correlated or anticorrelated.

| Input | Output |
| --- | --- |
| \|00⟩ | \|Φ⁺⟩ |
| \|01⟩ | \|Ψ⁺⟩ |
| \|10⟩ | \|Φ⁻⟩ |
| \|11⟩ | \|Ψ⁻⟩ |

**Dephasing** damps the off-diagonal terms by a factor of `1 - p` and leaves the
diagonal alone. At `p = 1` the state is a classical correlated mixture.

**Balance θ** sets the state to `cos θ |aa⟩ + sin θ |bb⟩`. At 45° the amplitudes
are equal and the state is maximally entangled. At 0° or 90° it collapses to a
product state — still pure, but with nothing to entangle.

**Rotate q0 α** applies Rᵧ(α) to q0 after the Bell state is generated.
Rᵧ(α) is a rotation of q0's Bloch vector in the x-z plane by angle α. At
α = 0 the state is an unmodified Bell state. At α ≠ 0 the state is no longer
a Bell state, though it remains locally equivalent to one. Watch the Bloch
sphere for q0 while turning this slider — what happens depends entirely on
Balance θ, and the contrast between θ = 45° and any other value is the point
of the control.

**Rotate q1 β** applies an independent Rᵧ(β) to q1 after the Bell state is
generated. It behaves symmetrically to the q0 rotation: at θ = 45° the Bloch
vector for q1 is pinned at the origin regardless of β, while at other values
of θ the vector responds and traces the x-z plane. Running both sliders
simultaneously demonstrates that no combination of single-qubit operations
can move either Bloch vector when the state is maximally entangled.

## Bloch spheres

A Bloch sphere represents the state of a single qubit as a point in or on a
unit sphere. Pure states sit on the surface; mixed states sit inside; the
maximally mixed state — equal probability of 0 and 1, no phase information —
sits at the centre.

The poles have a direct physical meaning:

| Position | State |
| --- | --- |
| North pole | \|0⟩ with certainty |
| South pole | \|1⟩ with certainty |
| Equator | equal superposition, phase varies around the equator |
| Centre | maximally mixed — no information survives |

The two panels show q0 and q1 individually. Because the full state is a
two-qubit state, each panel shows the **reduced density matrix** — the result
of tracing out (averaging over) the other qubit. This is the quantum analogue
of looking at one variable in a joint probability distribution while ignoring
the other.

**How the controls move the vectors**

*Balance θ* is the most direct control. The Bloch vector length is
`|cos 2θ|`, so it reaches the pole at θ = 0° or 90° and collapses to the
centre at θ = 45°. That collapse is the most important thing the spheres show:
at maximum entanglement the global two-qubit state is perfectly pure, yet each
individual qubit is completely random. All the information lives in the
correlations between the qubits, not in either qubit alone. Entanglement made
visible.

*Φ / Ψ family toggle* (q1 button) controls whether the two qubits are
correlated (both 00 or both 11 in the Φ family) or anti-correlated (01 or 10
in the Ψ family). Switching families flips q1's Bloch vector to the opposite
pole while leaving q0 unchanged.

*Phase toggle* (q0 button or phase button) sets the relative sign between the
two superposition branches. It does not appear in either Bloch sphere at all —
the partial trace that produces the individual qubit state washes out any
global phase. Phase is a two-qubit property, invisible to either qubit alone.

*Dephasing* also leaves the Bloch vectors stationary. Dephasing damps the
off-diagonal terms of the two-qubit density matrix, but the individual qubit
populations (the diagonal terms) are untouched, and it is the populations
alone that determine the Bloch vector under partial trace. You can watch
entanglement decay in the density matrix — the off-diagonal cells fading —
while the Bloch spheres show nothing happening. That contrast is the
difference between coherence (a property of the joint state) and the marginal
state of each qubit.

**Local rotation and the immunity of entanglement**

The local rotation slider is the sharpest demonstration in the tool. Set
Balance θ to 45° and move Local rotation α through its full range. The
two-qubit density matrix changes — the off-diagonal entries rotate in the
complex plane — but the Bloch spheres do not move. The vectors stay fixed at
the origin.

This is not a coincidence of the particular gate chosen. **Maximally entangled
states are completely immune to local operations at the single-qubit level.**
No gate applied to q0 alone — no rotation, no measurement, no transformation
of any kind — can change what an observer of q0 sees. The reduced density
matrix of q0 is the maximally mixed state I/2 regardless of what is done
locally, because all information about the joint state is stored in the
correlations between the two qubits, not in either qubit alone.

Now reduce θ below 45°. The immunity breaks. The Bloch vector for q0 begins
to respond to the rotation, sweeping through the x-z plane. The further θ
moves from 45°, the longer the vector and the more visibly it rotates. At
θ = 0° the state is a product state with no entanglement and the vector
traces a full circle as α varies.

The x and y components that appear under local rotation represent the
off-diagonal entries of q0's reduced density matrix — the single-qubit
coherence. For pure Bell states these are always zero because the superposition
in the two-qubit state is between terms that differ in both qubits
simultaneously; partial trace washes those cross terms out. The Bloch vectors
are confined to the z-axis until local rotation breaks the symmetry, and only
because the state is no longer maximally entangled.

**Connecting Bloch spheres to the matrix**

The density matrix diagonal gives the probability of each two-qubit outcome:
p(00), p(01), p(10), p(11). The Bloch vector z-component for q0 is
`p(0●) − p(1●)`, the difference between the probability of measuring q0 as 0
versus 1 regardless of q1. At θ = 45° those probabilities are equal, the
difference is zero, and the vector vanishes. At θ = 0° all weight is on \|00⟩
or \|01⟩, so p(0●) = 1, and the q0 vector reaches the north pole. The spheres
are a geometric summary of information already present in the diagonal of the
density matrix.

## Readouts

**Concurrence** measures entanglement from 0 (separable) to 1 (maximal). For
this family of states it is exactly twice the magnitude of the coherence.

**Purity** is `Tr(ρ²)`, which is 1 for a pure state and 0.5 for the fully
dephased mixture here. The two quantities are independent: an imbalanced pure
state has purity 1 and concurrence below 1.

## Accessibility

This tool targets **WCAG 2.2 Level AA**. That target, and the reasoning
below, is documented here deliberately: it's a learning tool, and a learning
tool that only teaches sighted, non-screen-reader users has failed at its own
purpose for exactly the audience most likely to need a non-visual explanation
of an inherently visual subject.

The three SVG visuals (density matrix, Bloch spheres, circuit diagram) each
encode meaning spatially — fill opacity, vector orientation, gate position —
with no direct ARIA role that captures it. Rather than force partial,
misleading ARIA labeling onto a complex graphic, each one is marked
`aria-hidden="true"` and paired with a plain-language equivalent that a
screen reader actually navigates:

- **Density matrix** — every one of the 16 cells now prints its own value
  (2 decimals), not just fill opacity, so sighted low-vision users aren't
  relying on subtle shading differences either. A visually-hidden
  (`.sr-only`) `<table>` with proper `<th scope="row">`/`<th scope="col">`
  headers mirrors the same 16 numbers for screen readers.
- **Bloch spheres** — a `.sr-only` paragraph per qubit states the rx/ry/rz
  components and magnitude in words.
- **Circuit diagram** — a `.sr-only` paragraph describes the current input
  kets, the gate sequence, the output Bell state, and both rotation angles
  in degrees.

This is the same pattern IBM's Carbon Design System uses for its chart
components: a complex visualization stays purely visual, and an equivalent
data table or description carries the same information to assistive
technology. None of this content is `aria-live` — like the existing `#grid`
container, updates are available on demand when navigated to, rather than
interrupting with an announcement on every slider tick. The one deliberate
exception is `#reading` (`role="status"`), a concise plain-language summary
meant to be announced.

The cell-text color switches between the page's `--ink` and `--paper` tokens
at `magnitudeOpacity(value) <= 0.5`, chosen from an actual WCAG relative-
luminance calculation against this app's real color tokens (worked out in
detail while implementing it) so contrast stays close to 4.5:1 across the
fill range, dipping to a documented ~4.1:1 only in a narrow mid-magnitude
band. If the `--ink`/`--paper` values ever change, recheck that threshold.

**Maintaining this**: any new visual added to this project must ship with an
equivalent accessible text representation using this same
`aria-hidden` + `.sr-only`-equivalent pattern, and any new on-visual text must
be checked against WCAG 2.2 AA contrast (4.5:1 normal text, 3:1 for text at
least 18pt, or 14pt bold) before merging. This is not optional polish — it's
the difference between the tool teaching everyone or teaching only some
people.

## Exporting

The **Export current state** button (next to Reset) downloads a JSON
snapshot of everything on screen: the raw settings (`q0`, `q1`, `theta`,
`dephasing`, both rotation angles — in radians, matching `src/state.js`'s own
convention) and every derived measurement (the full density matrix,
concurrence, purity, outcome probabilities, both Bloch vectors, and the
Bell-state label/equation).

The format is described by `schema/bell-state-export.schema.json`, written
against [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema)
— the current IETF-track JSON Schema specification, which IBM engineers are
among the editors of. Every export includes a `$schema` field pointing at
that file's canonical URL, so any standard JSON Schema validator can check an
exported file without extra configuration.

The point of this is reproducibility: for a learning tool, being able to
hand an exported file to an instructor, a peer, or an independent script that
re-implements the same formulas (in Python, Mathematica, whatever) and get
back "yes, these numbers are actually right" is the entire value of the
feature. A learning tool whose numbers can't be checked is just an assertion.

**Maintaining this**: any change to the exported shape (new field, renamed
field, changed unit) must update `schema/bell-state-export.schema.json` in
the same change, and bump `schemaVersion` in `src/export.js` on breaking
changes. This project has no dependencies, so `test/export.test.js` checks
the exported shape by hand (exact key sets, types) rather than through a
schema-validation library — keep that test in sync with the schema too, since
neither one currently enforces the other automatically.

## Exporting a runnable circuit

Below the main layout, the **Export circuit** panel downloads the current
state as an actual program you can run — not just a JSON snapshot of the
numbers. Pick a format (currently **Qiskit** or **OpenQASM 2.0**) and
**Download circuit code** produces a file parameterized for the current Bell
state and local rotation angles.

This is checked-in, static code, not something generated at runtime: each
format is one well-formed template in `export-templates/` (`qiskit.py`,
`openqasm2.qasm`) with `@@TOKEN@@` placeholders that `src/circuit-export.js`
fills in. Adding a third format later is one more template file plus one
registry entry, not a change to the rendering logic. The vendor-neutral
target is OpenQASM **2.0**, not 3 — OpenQASM 3 import support is still
inconsistent across vendor tooling (IBM Quantum Composer in particular threw
parse errors on it in practice), while 2.0 is the long-established format
nearly every gate-model provider accepts directly.

**Only the ideal, unitary circuit is exported** — state prep, Hadamard,
CNOT, and the two `Rᵧ` rotations. The **dephasing** slider is intentionally
left out: in `src/state.js` it's applied as a direct multiplication of the
density matrix's off-diagonal entries, a quantum channel with no equivalent
gate, so there's nothing to export for it. The downloaded file says this
explicitly in its own header comment, along with a warning about Qiskit's
little-endian bit ordering (measurement counts read q1-then-q0, the
opposite of this app's basis labels) — the single easiest way to get a
hardware comparison quietly backwards.

The full reasoning behind these decisions — what a fair simulator/hardware
comparison actually requires (spoiler: state tomography for the coherences,
not just measurement counts), which formats other vendors' toolchains
accept, and a recommended shape for writing up a real run — is in
[`doc/quantum-export-research.md`](doc/quantum-export-research.md).

**Maintaining this**: `test/circuit-export.test.js` covers placeholder
values, template rendering, and the fetch-based loader.
`test/circuit-export-syntax.test.js` build-validates the *rendered* output
of both templates — a real Python syntax check (`ast.parse` via the
system's `python3`) for `qiskit.py`, and a structural heuristic (balanced
braces, terminated statements) for `openqasm2.qasm`, since no
zero-dependency OpenQASM parser exists. Any template edit should keep
passing both.

## CI/CD: Qiskit Runtime integration

`qiskit-runtime/` is a separate Python subproject — not part of the app's
zero-dependency static site — that runs the app's canonical Φ⁺ Bell state
through [`qiskit-ibm-runtime`](https://github.com/Qiskit/qiskit-ibm-runtime)
as a real cross-check of `src/state.js`'s math against an actual (simulated)
execution, and as a working example of wiring CI to IBM Quantum Cloud's API.
See `qiskit-runtime/README.md` for local usage.

One script, two modes, both execute locally: `run_circuit.py` runs against a
plain local `AerSimulator` when no `QISKIT_IBM_TOKEN` is set (no auth, no
network). When it is set, it authenticates for real against IBM Cloud
(`service.jobs(limit=1)`, a cheap round-trip that proves the token/instance
actually work), reads a real QPU's calibration snapshot via
`least_busy(operational=True, simulator=False)`, and runs the circuit
locally against `AerSimulator.from_backend(...)` seeded with that snapshot —
IBM retired cloud-hosted simulator backends on 2024-05-15, so there's no
cloud simulator left to submit to; this is IBM's own documented replacement.
Both GitHub Actions workflows below call the identical
`make -C qiskit-runtime integration-test`; only the environment differs:

- **`.github/workflows/qiskit-runtime-pr-check.yml`** runs on every pull
  request, references no secrets, and only ever exercises the local
  simulator — safe on PRs from forks. Its `local-sim-check` job is meant to
  be added as a required branch-protection status check for `main` (Settings
  → Branches), which is a one-time manual repo setting, not something a
  workflow file can turn on by itself.
- **`.github/workflows/qiskit-runtime-cloud-integration.yml`** runs daily
  plus on manual dispatch, gated to this repo's owner, and never submits a
  job to a real QPU's queue — reading calibration data is a
  backend-inspection call, not a job submission — to keep cost and queue
  time predictable. It needs two repo secrets: `QISKIT_IBM_TOKEN` (your IBM
  Cloud API key) and `QISKIT_IBM_INSTANCE` (your Qiskit Runtime instance's
  CRN, found on the IBM Quantum Platform dashboard's Instances tab).

`qiskit-runtime/Dockerfile` exists purely for local rehearsal — pinning the
same Python/Qiskit versions CI uses so you can iterate without touching your
host Python. Neither workflow builds or uses that image; both install
dependencies directly on `ubuntu-latest`, the same way
`Qiskit/qiskit-ibm-runtime`'s own CI does.

## Internationalization

Only English ships as a maintained locale today. Every other language is
added by a contributor, not the maintainer — this app was built so that
adding a language never requires the maintainer to speak it, review its
grammar, or touch app logic at all.

**The rule this depends on**: no user-visible or accessibility-relevant
string may be hardcoded, anywhere. Static text in `index.html` gets a
`data-i18n="namespace.key"` attribute; anything computed at render time goes
through `t(key, params)` (in `app.js`) or `translate()`/`interpolate()` (in
the renderer modules). This is enforced two ways:

- `npm run lint:i18n` (`scripts/check-i18n-coverage.js`, zero dependencies)
  scans for untagged static text, hardcoded `.textContent` literals, drift
  between `index.html`'s `<title>`/meta description and `locales/en.json`, and
  `data-i18n` values that don't resolve to a real key. It runs in CI on every
  push (see `.github/workflows/deploy.yml`) and fails the build if it finds
  anything.
- `test/locale-bundles.test.js` (part of `npm test`) shape-validates every
  `locales/*.json` bundle against what `locales/en.json` actually defines —
  catching typos and malformed metadata before they reach a screen reader or
  a user.

`locales/en.json` is the single source of truth for English — there's no
separate `.js` copy to keep in sync. It's fetched the same way every other
locale is (`app.js`'s `ensureEnglish()`), just awaited once up front, before
the first `render()`, since this app's readouts and sr-only descriptions are
computed by JS with no static HTML text to fall back on while that fetch is
in flight.

Genuinely non-translatable content — bra-ket notation, `q0`/`q1`, the
picker's own "English" option — is marked `data-i18n-exempt` rather than
left silently untagged, so the exception is a deliberate, visible decision
in the markup, not indistinguishable from someone forgetting to tag a string.

### Adding a language

**To add it to this repository**, open a PR:

1. Add `locales/<code>.json`, following `schema/locale-bundle.schema.json`
   ([JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema),
   same convention as the export schema). It doesn't need to be complete —
   any key you skip falls back to English automatically, forever, for
   everyone — but it does need to be **tested**: uncomment it in
   `locales/manifest.json`, run it locally (`npm run serve`), and confirm it
   actually renders correctly in a browser before opening the PR.
2. Add one entry to `locales/manifest.json` so it shows up in the language
   picker.
3. Make sure `npm test` and `npm run lint:i18n` both pass.

The maintainer reviews this as code — shape, not grammar. Nobody is on the
hook for verifying translation quality in every language that gets added.

**To use a language only locally**, without a PR: drop `locales/<code>.json`
into your own checkout's `locales/` folder. If it matches one of your
browser's language preferences, it's picked up automatically — detection
probes `locales/<code>.json` directly and doesn't consult the manifest at
all. To reach it from the picker instead, add a line to your own local
`locales/manifest.json`. Either way, nothing here touches the shared repo.

### Trying it out

Three mock/test-only locales — `locales/{qaa,qab,qac}.json` — exist
specifically to exercise this mechanism by hand: `qaa` (long, accented Latin
text, stresses layout), `qab` (`direction: "rtl"`, exercises the picker's
right-to-left handling), and `qac` (deliberately incomplete, to watch the
English fallback happen live). They're commented out in
`locales/manifest.json` by default — uncomment a line, restart
`npm run serve`, hard-reload, and pick it from the language picker. Their
codes (`qaa`–`qtz`) are the range ISO 639-2 reserves for private/local use,
so they can never collide with a real contributed language.

## Structure

```
index.html                             markup and controls
src/state.js                            density matrix, concurrence, purity, partial trace, local rotation, classifyState — no DOM
src/matrix-grid.js                      density matrix SVG rendering + sr-only accessible table
src/bloch-sphere.js                     individual qubit Bloch sphere rendering + sr-only description
src/circuit-diagram.js                  H + CNOT circuit diagram + sr-only description
src/export.js                           builds the schema-conforming export payload — no DOM
src/circuit-export.js                   renders export-templates/* into a runnable circuit file — no DOM
src/i18n.js                             translate()/interpolate()/fallback lookup — no DOM
src/locale-loader.js                    locale discovery/fetch, fetch injectable — no DOM
src/app.js                              control wiring
src/styles.css                          light and dark themes
locales/en.json                         source-of-truth English bundle (fetched, same as every other locale)
locales/en-US.json, en-UK.json          regional English bundles (fetched)
locales/es.json                         contributed Spanish bundle
locales/manifest.json                   language-picker option list (not used for auto-detection)
locales/qaa.json, qab.json, qac.json    mock/test-only locales, commented out by default
schema/bell-state-export.schema.json    JSON Schema (draft 2020-12) for exported state
schema/locale-bundle.schema.json        JSON Schema (draft 2020-12) for contributed locale bundles
export-templates/qiskit.py              checked-in static Qiskit program with @@TOKEN@@ placeholders
export-templates/openqasm2.qasm         checked-in static OpenQASM 2.0 program with @@TOKEN@@ placeholders
doc/quantum-export-research.md          viability research behind the circuit-export feature
scripts/check-i18n-coverage.js          npm run lint:i18n — hardcoded-string scanner, runs in CI
test/state.test.js                      physics tests
test/matrix-grid.test.js                matrix-grid.js math helper tests
test/bloch-sphere.test.js               bloch-sphere.js vector math tests
test/export.test.js                     export payload shape/value tests
test/circuit-export.test.js             circuit-export.js placeholders/rendering/loader tests
test/circuit-export-syntax.test.js      build-time validation that rendered templates are well-formed
test/i18n.test.js                       i18n.js lookup/fallback/interpolation tests
test/locale-loader.test.js              locale-loader.js candidate-expansion/fetch-orchestration tests
test/locale-bundles.test.js             shape-validates every locales/*.json bundle
qiskit-runtime/                         separate Python subproject — see "CI/CD: Qiskit Runtime integration" above
.github/workflows/deploy.yml            npm test + lint:i18n, then deploy to GitHub Pages
.github/workflows/qiskit-runtime-pr-check.yml           local-simulator-only PR check, no secrets
.github/workflows/qiskit-runtime-cloud-integration.yml  daily real-IBM-Cloud integration test
```

`src/state.js`, `src/export.js`, `src/circuit-export.js`, `src/i18n.js`, and
`src/locale-loader.js` have no DOM dependency, so they can be imported in
Node, tested, or reused elsewhere.

## Known issues

- `render()` in `src/app.js` is a single long function that computes state,
  updates every DOM readout, and redraws all three visualizations. This
  matches the documented "single update path" design, but the function has
  grown enough (rotation math, readout formatting, Bell-row highlighting,
  Bloch/circuit redraws) that splitting it into named steps (e.g. compute
  state, update readouts, update visuals) would improve readability. Not
  done yet — flagged here as a future refactor rather than undertaken
  alongside unrelated changes.

## Extending

Some directions the current structure supports:

- Amplitude damping alongside dephasing (relaxation toward \|00⟩ rather than
  loss of coherence). This moves the diagonal, unlike dephasing, and would
  visibly displace the Bloch vectors toward the south pole.
- Complex phases in the density matrix. Adding Rx or Rz rotations, or
  starting from states with complex amplitudes, produces non-zero imaginary
  off-diagonal entries and a non-zero Bloch vector y-component. Rendering
  this would require a second grid for the imaginary part (or a hue channel
  in each cell) and removing the ry = 0 simplification from `blochVector()`.
- Measurement in a rotated basis, showing the interference that distinguishes a
  superposition from a mixture.

## License

MIT
