# Circuit export: viability research

This is the research the user asked for before building `src/circuit-export.js`:
can the app export a circuit that a person can actually run — on a local
simulator, on someone else's simulator, or on real quantum hardware — and get
back numbers that are meaningfully comparable to what this app already shows?
Answer: yes for a **subset** of what the app displays, with real constraints
that the exported code and its comments need to be honest about. This doc is
the reasoning behind those constraints; it's what the "why" comments in
`export-templates/*.py` / `*.qasm` point back to.

**Caveat on currency**: SDK APIs, vendor plan names, and which endpoints are
free vs. paid change often in this space. The claims below reflect general,
fairly stable facts about the ecosystem (gate-model circuits, OpenQASM as an
interchange format, how measurement and tomography work) rather than
version-pinned API details. Before writing the IBM Cloud walkthrough doc,
re-verify current specifics (current `qiskit-ibm-runtime` API surface, current
plan/access model) against IBM's own docs rather than trusting this file for
that.

## What can actually be reproduced outside the app

The app's state is built from four ingredients: `psi`/`negative` (which Bell
state), `theta` (amplitude balance), `dephasing`, and the two local `Rᵧ`
rotations. Of these, **three are ordinary unitary gates** — state prep (X),
Hadamard, CNOT, and `Rᵧ(α)` are all standard gates on every gate-model
platform. `dephasing` is different: `state.js`'s `densityMatrix()` applies it
as a direct multiplication of the off-diagonal density-matrix entries by
`(1 - p)`. That's a *quantum channel*, not a unitary — there is no single gate
you can drop into a circuit to produce it. It's meaningful as a compact,
tunable teaching visualization, but it doesn't correspond to a gate a real
device (or a noiseless statevector simulator) executes.

This is why the decision for this feature was: **export the ideal, unitary
circuit only** (X + H + CNOT + Rᵧ⊗Rᵧ), with `dephasing` left out and called
out explicitly in the exported file's own comments. The alternative — baking
an `AerSimulator` noise model into the export to *approximate* dephasing —
was considered and rejected for now: it only helps the local-simulator
comparison (real hardware noise is intrinsic to the device and can't be
dialed to match an arbitrary synthetic `p`), and it would make the exported
program's behavior depend on Qiskit's noise-model API staying stable, which
is a heavier maintenance commitment than the rest of this project takes on
for a single slider.

## Why "vendor-neutral" is realistic: OpenQASM 3

Every major gate-model vendor's SDK is ultimately a wrapper that builds a
circuit and hands it to *some* execution backend. Qiskit is IBM's SDK, but the
circuit itself — X, H, CNOT, Rᵧ, measure — is universal. **OpenQASM 3** is the
IETF/Qiskit-originated, now broadly-adopted textual IR for exactly this: a
gate-model circuit with no vendor-specific execution semantics attached.
Multiple providers' toolchains (Amazon Braket's SDK, IonQ's API surface,
Qiskit itself) accept OpenQASM 3 as an import format for gate-based circuits,
which is *why* it was picked as this feature's second export target instead
of, say, hand-writing separate Cirq or pyQuil templates: one vendor-neutral
template covers a much larger set of "other IDEs/hardware" than any single
additional vendor SDK would, for the same maintenance cost as maintaining one
more template file. Concretely check each vendor's current import path before
relying on it (e.g. Braket's OpenQASM 3 support and IonQ's accepted circuit
formats have each evolved over time), but the *shape* of the claim — "OpenQASM
3 in, gate-model circuit out, vendor-agnostic" — is stable.

This is also exactly why the registry in `src/circuit-export.js` is a flat
array of `{ id, label, templatePath, filename }` entries rather than
anything Qiskit-specific: adding a third target (Cirq, pyQuil, a vendor's
native JSON circuit format) is one more template file plus one more registry
entry, not a change to the rendering pipeline.

## Comparing simulator numbers to the app: straightforward

Running the exported circuit through a **noiseless statevector simulator**
(Qiskit's `Statevector`/`AerSimulator`, or any OpenQASM-3-consuming
simulator) reproduces the app's `θ`/rotation math exactly, because both sides
are computing the same unitary evolution. `test/circuit-export.test.js` and
`test/state.test.js` already pin down that math on the app side; a user
running the exported file's `statevector_report()` should see the same
density matrix (up to global phase, which doesn't affect ρ) as the app's
matrix grid, for the same `q0`/`q1`/rotation inputs. This is a genuinely
useful reproducibility check and was the original motivation for
`src/export.js`'s JSON export — the circuit export extends the same idea to
"reproduce it independently," just via an actual circuit instead of a
hand-checked formula.

## Comparing real-hardware numbers to the app: only partially, and only for probabilities

This is the part that needs to be stated carefully, because it's the part
most likely to mislead someone building the IBM Cloud follow-up doc.

**Real hardware doesn't return a density matrix.** It returns measurement
*counts* — how many of N shots landed on each computational-basis outcome.
That maps directly onto only the **diagonal** of the app's density matrix
(`outcomeProbabilities` in `src/export.js`'s payload / the diagonal cells in
the matrix grid). Comparing "app says p(00)=0.5, p(11)=0.5" against "hardware
counts gave 48%/52%" is a fair, meaningful comparison, and it's exactly what
`export-templates/qiskit.py`'s `sampled_report()` is set up to produce.

**The off-diagonal coherences are invisible to a single measurement basis.**
To recover them — to actually reconstruct a density matrix from a real
device and compare it to the app's off-diagonal cells — requires **quantum
state tomography**: repeating the circuit while measuring in multiple bases
per qubit (typically the Pauli X/Y/Z bases, so 3×3 = 9 measurement settings
for two qubits, or more with redundancy for error mitigation), then solving
for the density matrix that's maximally consistent with all those
measurement statistics (linear inversion or maximum-likelihood estimation).
This is well-understood and Qiskit ships tooling for it
(`qiskit-experiments`' state tomography experiment), but it is meaningfully
more code and a real conceptual step up from "run the circuit and read
counts." **It's out of scope for the checked-in export template** — the
template is a static, well-formed program matching the circuit, not a
tomography pipeline — but it's the honest answer to "how would you get a
comparable ρ from real hardware," and worth a pointer/optional appendix in
the eventual IBM Cloud doc rather than silently pretending counts alone give
you the whole matrix.

**Real device noise is not the app's `dephasing` slider, even qualitatively
they're not interchangeable.** A real device has its own T1/T2 decoherence,
gate infidelity, and readout error, all baked into its physical
characteristics — you cannot set a device's "effective dephasing" to some
chosen `p` the way the slider does. Running the exported ideal circuit on
real hardware **will** show *some* decay away from the ideal statistics
(purity below 1, some population leaking into "impossible" outcomes for a
perfect Bell circuit like 01/10 for Φ⁺), and that's a genuinely interesting,
real thing to show side-by-side with the app's dephasing behavior — "here's
what decoherence looks like when it's not a knob you control" — but it must
not be presented as reproducing a *specific* dephasing value from the slider.
The exported template's docstring says this explicitly so the generated file
carries the caveat with it, independent of any doc that references it.

## Bit-ordering: the sharpest footgun in this comparison

Qiskit reports measurement counts as bitstrings ordered `c[n-1]...c[1]c[0]`
— **little-endian**, rightmost character is qubit/clbit 0. This app's basis
labels (`"00"`, `"01"`, `"10"`, `"11"`, used throughout `state.js`,
`matrix-grid.js`, and the export schema) read **q0 then q1, left to right**.
A Qiskit count of `"01"` (10 in the app's ordering: clbit1=0, clbit0=1) is
this app's `"10"` outcome, not its `"01"` outcome. Get this backwards and
every comparison silently swaps the Ψ family with itself in a way that's easy
not to notice for `θ=45°` (probabilities are symmetric) but wrong for any
asymmetric `θ`. `export-templates/qiskit.py` reverses the bitstring before
printing specifically so its printed output is already in the app's
ordering; the comment there exists so a reader who *doesn't* use that
helper function still knows to do the reversal themselves. OpenQASM 3's own
`bit[2] c` result ordering follows the same little-endian convention when
read back by most tooling, so the same caveat applies to
`export-templates/openqasm3.qasm`.

## Recommended shape for the eventual IBM Cloud walkthrough doc

Not built now — this is scoping for that later request, so it isn't
forgotten:

1. Set the app to a specific state (e.g. `θ=45°`, no rotation, Φ⁺) and screenshot/export its JSON (`src/export.js`) as the "ground truth" to compare against.
2. Export the Qiskit template for that same state, run `statevector_report()` locally — show it matches the JSON export's density matrix.
3. Run `sampled_report()` against `AerSimulator` — show shot noise around the same probabilities.
4. Run `sampled_report()` against a real IBM backend via `qiskit-ibm-runtime` (the user has already done a basic Hadamard job, so the account/credential setup is presumably already solved) — compare *outcome probabilities only* against the app's diagonal, with the noise caveat above stated plainly.
5. Optionally, as an advanced appendix: point at `qiskit-experiments` state tomography for readers who want the full ρ comparison, without making it a requirement of the main walkthrough.

## Summary

- Export the ideal unitary circuit (X, H, CNOT, Rᵧ⊗Rᵧ) only; dephasing has no gate equivalent and is called out in-file, not silently dropped.
- Qiskit (Python) + OpenQASM 3 as a second, vendor-neutral target together cover "other IDEs/hardware" better than chasing individual vendor SDKs one at a time; the registry in `src/circuit-export.js` makes adding a third target cheap later.
- Statevector-simulator comparison against the app is exact and directly useful.
- Real-hardware comparison is valid **only for outcome probabilities** (the diagonal); the coherences require state tomography, which is out of scope for the shipped template.
- Real device noise is not a stand-in for the `dephasing` slider — interesting to show side by side, wrong to present as equivalent.
- Bit ordering must be reversed when comparing Qiskit/OpenQASM measurement output to this app's basis labels.
