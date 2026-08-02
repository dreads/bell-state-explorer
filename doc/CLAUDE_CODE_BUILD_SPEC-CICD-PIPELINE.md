# Build spec: quantum-job CI/CD pipeline for `bell-state-explorer`

**Audience:** this is written to Claude Code (or any coding agent) as a standalone build instruction. It assumes no access to the conversation that produced it. Everything needed to build is here. Read it fully before writing code.

**Context in one paragraph.** The repo `dreads/bell-state-explorer` currently contains a browser-based Bell-state density-matrix visualizer (JS/HTML, no quantum backend). We are adding a Python + GitHub Actions pipeline that takes a circuit payload from a data scientist — checked into the repo as an OpenQASM 2.0 `.qasm`, a Qiskit `.py`, or a Jupyter `.ipynb` — validates it on branch push (cheaply, no hardware), runs it on real IBM Quantum hardware on merge to `main` (real spend, gated), and runs a nightly job that doubles as a device-health sensor. The payload is a repo artifact; nothing is uploaded to IBM as a "program" (that model is deprecated — see Hard Constraint 6). The pipeline must keep the CI/DevOps concern cleanly separated from both the physics code and the payload format, and must maintain a non-collapsed, three-identity accountability trail. The accompanying paper (`running-quantum-jobs-in-cicd.md`) narrates the *why*; this file specifies the *what* to build. A payload layer (`payload.py`, `submit.py`, and three sample payloads) is **already built and validated** and shipped alongside this spec — treat those files as provided, not to be regenerated.

---

## Hard constraints (these are fixed; do not "improve" them away)

These are pinned by real artifacts in the repo (an existing failing Actions run and issue #16). New code must be **consistent** with them:

1. Quantum code lives in a subdirectory `qiskit-runtime/` with its own `requirements.txt`, a `Makefile`, and `test_integration.py`.
2. The CI invocation path is exactly: `actions/checkout@v4` → `actions/setup-python@v5` → `pip install -r qiskit-runtime/requirements.txt` → `make -C qiskit-runtime <target>`.
3. The nightly integration check authenticates to IBM Cloud, **verifies the connection and pulls live calibration**, builds an **Aer noise model from a real backend's calibration** (labelled in output like `aer-noise[ibm_marrakesh]`), simulates the Bell circuit **locally**, and asserts a correlation floor. It does **not** spend QPU time. Its failure line looks like:
   ```
   FAIL: measured correlation below threshold
   backend: aer-noise[ibm_marrakesh] (cloud connection verified, 1 recent job(s) visible), shots: 4096
   counts: {'11': 978, '10': 1024, '00': 1051, '01': 1043}
   p(00) + p(11) = 0.4954 (threshold 0.9)
   ```
4. There is a `schedule:` (cron) trigger. Issue #16 requires it to be scheduled **out of the device recalibration window** — the fix was "move it earlier into a clean 2-hour band." The cron must be documented as maintenance-window-aware, with the offending/for-avoidance window in a comment.
5. Current IBM Quantum / Qiskit Runtime API facts to build against (verified current as of mid-2026):
   - Use `qiskit-ibm-runtime` with `QiskitRuntimeService`.
   - Channel string is `channel="ibm_quantum_platform"` (the older `ibm_quantum` channel is legacy; `ibm_cloud` also exists).
   - Use **V2 primitives**: `SamplerV2` (import as `Sampler`). Submit **PUBs** — a Sampler PUB is `(circuit, parameter_values?, shots?)`.
   - Circuits must be transpiled to **ISA circuits** (`generate_preset_pass_manager` against the target backend) before submission to real hardware.
   - Submitting via `sampler.run([...])` returns a `RuntimeJobV2`. Poll it with `.status()` / `.result()`; it exposes `.job_id()`.
   - Backend selection: pin by name via `service.backend("ibm_marrakesh")`, or fall back to `service.least_busy(operational=True, simulator=False)`.
   - Local/simulator path: build an Aer noise model from a real backend's properties (`AerSimulator.from_backend(backend)` or an explicit `NoiseModel.from_backend(backend)`), then run locally. This is what makes the "pull calibration, simulate, assert floor" nightly check possible without spending QPU time.
   - Resilience/DD options (optional, for the hardware path): `sampler.options.dynamical_decoupling.enable`, resilience levels — expose but do not require.
6. **There is no program-upload path, and the payload file is a repo artifact — not something uploaded to IBM.** The old custom-program model (`QiskitRuntimeService.upload_program()` returning a program ID, invoked later by ID) is deprecated and was replaced by the primitives; `backend.run()` is likewise deprecated in favor of primitives. Do **not** build anything that uploads a program, mints a program ID, or expects a persistent server-side program. Concretely:
   - The scientist's payload (`.qasm`/`.py`/`.ipynb`) lives in the **repo**, under version control, signed commits, and review. That file is the durable "program" — more durable than a program ID, which can be (and just was) deprecated out from under you.
   - The pipeline resolves the payload to a `QuantumCircuit` **locally**, transpiles it to the target backend's ISA **locally**, and submits the **circuit** as a Sampler PUB. The `.ipynb`/`.py`/`.qasm` file itself is never sent to IBM. What crosses the wire is the transpiled circuit, nothing else.
   - "Save a notebook and submit it" therefore means: notebook in Git → loader extracts the circuit → transpile → submit as a PUB → `RuntimeJobV2`. The notebook is an **authoring format**; the circuit is the **wire format**.
   - The persistent cloud-side handles are the **instance** (CRN, via `QC_INSTANCE`) as the execution context and the **`RuntimeJobV2` job id** as the per-run record — not a program. Do not reach for IBM Cloud Object Storage for job execution; it is only relevant to the optional nightly-health-dataset stretch goal.
   - Do not spend an hour discovering `upload_program()` is gone: it is gone, on purpose. The design above is the replacement.

Do not scrape stdout for results anywhere. Results cross the CI boundary as a JSON file (see the contract below).

---

## The central design: the black-box contract between CI and physics

**Problem being solved:** the repo uses Make. The DevOps engineer must not have to understand Make or the physics to operate the pipeline. So `qiskit-runtime/` is a black box with a stable, documented contract. If the current implementation cannot honor the contract, **change the implementation to fit the contract** — never leak Make's internals into the workflow YAML.

### Inputs (CI → physics), all via environment variables

| Env var | Meaning | Example |
|---|---|---|
| `QC_PAYLOAD_PATH` | path to the scientist's checked-in circuit payload — `.qasm`, `.py`, or `.ipynb` (see the payload contract below) | `qiskit-runtime/circuits/hello_noise.ipynb` |
| `QC_EXECUTION_TARGET` | `simulator` or `qpu` | `simulator` |
| `QC_BACKEND` | device to pin (for `qpu`) or to model (for `simulator`); empty = `least_busy` in qpu mode | `ibm_marrakesh` |
| `QC_INSTANCE` | IBM Cloud instance CRN / identifier to run under | `ibm-q/.../...` |
| `QC_CHANNEL` | Qiskit Runtime channel | `ibm_quantum_platform` |
| `QC_SHOTS` | shot count | `4096` |
| `QC_CORRELATION_THRESHOLD` | pass/fail floor for `p(00)+p(11)` | `0.9` |
| `QC_JOB_TIMEOUT_SEC` | max wall-clock to block on a real job before failing | `1800` |
| `QISKIT_IBM_TOKEN` | the Service ID API key (secret; see accountability) | — |
| `QC_RESULT_PATH` | where physics writes the result JSON | `qiskit-runtime/result.json` |

Defaults live in the `Makefile` (so `make` works standalone) and are overridden by the workflow. The workflow passes values; it never edits the Makefile.

`QC_PAYLOAD_PATH` is the DevOps-facing knob for "which circuit are we running." The workflow author points it at whatever file the scientist checked in and never needs to know which of the three formats it is — the payload loader (below) resolves all three to one `QuantumCircuit`, and every downstream entrypoint (`validate.py`, `test_integration.py`, `run.py`) operates on that circuit. This is the same insulation principle as the Make boundary: the format is the scientist's concern, not the pipeline's.

### Output (physics → CI): exit code + result JSON

- **Exit code:** `0` = pass (assertion met), non-zero = fail. This is what gates the workflow step.
- **Result file** at `QC_RESULT_PATH`, machine-readable, e.g.:
  ```json
  {
    "mode": "simulator",
    "backend_label": "aer-noise[ibm_marrakesh]",
    "backend_pinned": "ibm_marrakesh",
    "connection_verified": true,
    "recent_jobs_visible": 1,
    "shots": 4096,
    "counts": {"00": 1051, "01": 1043, "10": 1024, "11": 978},
    "p00_plus_p11": 0.4954,
    "threshold": 0.9,
    "passed": false,
    "job_id": null,
    "submitted_at": "2026-07-31T08:50:01Z",
    "calibration_pulled_at": "2026-07-31T08:50:00Z"
  }
  ```
  For the `qpu` path, `mode: "qpu"`, `job_id` is the real `RuntimeJobV2` id, `backend_label` is the device name, and `counts` come from the hardware result.

The workflow reads this JSON for the job summary and artifact upload. It must never parse log lines.

---

## Files to create

### `qiskit-runtime/requirements.txt`
Pin current versions (these are what the payload layer was validated against):
```
qiskit>=2.5
qiskit-ibm-runtime>=0.48
qiskit-aer>=0.17
```
Note: the `validate` and `integration-test` targets only need `qiskit` + `qiskit-aer`; `qiskit-ibm-runtime` is imported lazily inside `submit.py` and is only required for the `run` (hardware) path.

### `qiskit-runtime/Makefile`
Line count matters only in that `integration-test` is a real target. Provide at least these targets, each reading the env contract with sane defaults:

- `validate` — structural + transpilation checks only, no network, no hardware. Fast. Used by branch validation.
- `integration-test` — the calibration-pull + Aer-noise-model + correlation-floor check. **Simulator target; connects to pull calibration but spends no QPU time.** This is the nightly job and the one that faceplanted in #16.
- `run` — the real hardware submission (`qpu` mode), blocking with timeout. Used by run-on-merge.

Defaults in the Makefile (overridable by env):
```makefile
QC_PAYLOAD_PATH     ?= circuits/hello_noise.qasm
QC_EXECUTION_TARGET ?= simulator
QC_BACKEND          ?= ibm_marrakesh
QC_CHANNEL          ?= ibm_quantum_platform
QC_SHOTS            ?= 4096
QC_CORRELATION_THRESHOLD ?= 0.9
QC_JOB_TIMEOUT_SEC  ?= 1800
QC_RESULT_PATH      ?= result.json
```
Each target just invokes the corresponding Python entrypoint with the env passed through. Keep the Makefile thin — it is glue, not logic.

### The payload layer (ALREADY BUILT AND VALIDATED — treat as provided, do not regenerate)

These five files exist and have been validated in a real Qiskit 2.5.1 / Aer 0.17.2 / qiskit-ibm-runtime 0.48.0 environment. They replace the earlier single-`circuit.py` idea. Drop them into `qiskit-runtime/` as-is; the entrypoints below consume them.

- **`qiskit-runtime/payload.py`** — the multi-format loader. `load_circuit(path)` dispatches on extension and returns one `QuantumCircuit`:
  - `.qasm` → `QuantumCircuit.from_qasm_file` (OpenQASM 2.0).
  - `.py` → import the module, call its `build_circuit()`.
  - `.ipynb` → parse the notebook JSON, find the single code cell tagged `circuit` in its metadata, `exec` **only that cell**, call `build_circuit()`. The rest of the notebook is never executed.
  - Enforces the payload contract and raises `PayloadError` on any violation (missing file, unsupported extension, missing/duplicate `circuit` cell, missing/non-callable `build_circuit`, wrong return type, **no measurements** in the circuit).
- **`qiskit-runtime/circuits/hello_noise.qasm`**, **`.py`**, **`.ipynb`** — the same 2-qubit Bell "hello world" noise-detection payload in all three formats. Cheap known signal for pipeline testing (ideal `p(00)+p(11)≈1.0`; degrades under a real backend's noise model). Validated to produce structurally identical circuits and identical submittable PUBs across all three formats.

**The payload contract (document this in `WORKFLOWS.md` for the scientist):**
- `.qasm`: valid OpenQASM 2.0 with measurements.
- `.py`: module exposing a no-arg `build_circuit() -> QuantumCircuit` with measurements.
- `.ipynb`: exactly one code cell tagged `circuit` (Jupyter cell metadata `"tags": ["circuit"]`) defining a no-arg `build_circuit() -> QuantumCircuit` with measurements; all other cells are ignored.

**Why executing payload code is acceptable:** `.py`/`.ipynb` payloads mean running scientist-authored code. That is inherent to accepting those formats and is bounded by (a) the payload living in-repo under signed commits and review — the accountability model — and (b) the `.ipynb` loader executing only the one contracted cell, never the whole notebook. The loader never fetches or executes anything off-disk. Keep this property; do not "improve" the notebook loader into a full-notebook executor.

### `qiskit-runtime/validate.py`
No network. `load_circuit(QC_PAYLOAD_PATH)`, run `generate_preset_pass_manager` against a *fake*/local target (or a generic target) to confirm it transpiles, assert it has qubits, clbits, and measurements. Exit 0/1. Writes a minimal result JSON with `mode: "validate"` and the resolved payload path. This is also where a malformed payload (bad QASM, missing `build_circuit`, untagged notebook) is caught early — surface `PayloadError` as a clean non-zero exit.

### `qiskit-runtime/test_integration.py`
The important one. Behavior:
1. Load `QiskitRuntimeService(channel=QC_CHANNEL, token=QISKIT_IBM_TOKEN, instance=QC_INSTANCE)`. Emit the `_discover_account` reality: we are loading from a token, not a saved account.
2. Verify connection: list backends / recent jobs; capture `connection_verified` and `recent_jobs_visible`.
3. Pull the real backend (`service.backend(QC_BACKEND)`) and its **calibration/properties**.
4. Build an Aer noise model from that backend (`AerSimulator.from_backend(backend)`), record `calibration_pulled_at`.
5. `load_circuit(QC_PAYLOAD_PATH)`, transpile it to that backend's ISA, simulate locally against the noise model for `QC_SHOTS`.
6. Compute `p(00)+p(11)`, compare to `QC_CORRELATION_THRESHOLD`.
7. Write result JSON (label backend as `aer-noise[<name>]`), print the human FAIL/PASS line matching the format in Hard Constraint #3, exit 0/1.

**This must not submit a hardware job.** The whole value is that it senses device health for free by pulling calibration.

### `qiskit-runtime/submit.py` (ALREADY BUILT AND VALIDATED — treat as provided)
Provides the submission primitives, validated against the current runtime client:
- `build_pub(payload_path, backend)` — resolves any payload format via `load_circuit`, transpiles to the backend's ISA with `generate_preset_pass_manager`, returns the `(isa_circuit,)` Sampler PUB. Validated to produce an identical PUB across `.qasm`/`.py`/`.ipynb`.
- `submit_blocking(payload_path, *, token, instance, channel, backend_name, shots, timeout_sec)` — lazily imports `qiskit-ibm-runtime` (so CI validation needs neither the client nor credentials), loads the service, resolves the backend (pin `backend_name` or `least_busy(operational=True, simulator=False)`), builds the PUB, submits via `SamplerV2(mode=backend)`, blocks with a timeout, and returns `(job_id, counts)` — or `(job_id, None)` on timeout with the job left running for later reaping.

### `qiskit-runtime/run.py`
The real hardware path (`qpu` mode). Thin wrapper over `submit.py` that owns the env contract and result JSON:
1. Read the env contract (`QC_PAYLOAD_PATH`, `QC_BACKEND`, `QC_INSTANCE`, `QC_CHANNEL`, `QC_SHOTS`, `QC_JOB_TIMEOUT_SEC`, `QISKIT_IBM_TOKEN`).
2. Call `submit.submit_blocking(...)`. Backend resolution and PUB-building live in `submit.py`; do not duplicate them here.
3. On timeout, write result JSON with the `job_id` and `timed_out: true`, exit non-zero (the job keeps running on IBM's side — do not cancel unless a flag says to; the id is preserved for async reaping later).
4. On completion, compute `p(00)+p(11)` from counts, write result JSON with the real `job_id`, the resolved backend/instance, `$GITHUB_SHA`, and `$GITHUB_RUN_ID` (see accountability), exit 0/1 on the threshold.

`submit.py` already keeps the "submit" (`build_pub` + `SamplerV2.run`) and "read result" halves **separable**. The async upgrade (below) reuses `build_pub` and the submit call as-is and moves result-reading into a separate reaper. Do not fuse them back together in `run.py`.

---

## Workflows to create (`.github/workflows/`)

### 1. `validate.yml` — branch validation, no hardware
- Trigger: `on: push` (all branches except `main`) and `on: pull_request`.
- Env: `QC_PAYLOAD_PATH` from a repo variable (points at the scientist's checked-in payload; defaults to the sample `circuits/hello_noise.qasm`).
- Steps: checkout@v4 → setup-python@v5 → `pip install -r qiskit-runtime/requirements.txt` → `make -C qiskit-runtime validate`.
- No environment, no secrets, no network to IBM required for `validate`. Upload `result.json` as an artifact and echo it to `$GITHUB_STEP_SUMMARY`.

### 2. `run-on-merge.yml` — real hardware, gated, blocking
- Trigger: `on: push` to `main` (i.e., after merge).
- **`environment: prod`** — this is the spend gate. The prod environment must have required reviewers configured (documented in README; can't be set from YAML alone).
- Env: `QC_PAYLOAD_PATH` (repo variable), `QC_EXECUTION_TARGET=qpu`, `QC_BACKEND` from a repo/env variable (pinnable), `QC_INSTANCE` + `QISKIT_IBM_TOKEN` from the **prod** environment secrets, `QC_JOB_TIMEOUT_SEC` set.
- Steps: checkout → setup-python → pip install → `make -C qiskit-runtime run`.
- Upload result JSON (with `job_id`) as artifact; write to step summary. The `job_id` in the artifact is the handoff point for async reaping.

### 3. `nightly.yml` — the free device-health sensor
- Trigger: `on: schedule:` with a cron **outside the maintenance/recalibration window**. Include a comment citing issue #16 and naming the avoided window, e.g.:
  ```yaml
  on:
    schedule:
      # Runs 02:00 UTC. Deliberately NOT in the device recalibration window.
      # See issue #16: a nightly run inside the post-calibration stabilization
      # window pulled degraded calibration and the simulated correlation
      # collapsed to ~0.5 (noise). Keep this in a clean 2-hour band.
      - cron: "0 2 * * *"
  ```
- **`environment: dev`** — free/open instance credentials, no required reviewers (this run spends no QPU time; it only pulls calibration).
- Env: `QC_PAYLOAD_PATH` (repo variable — the same payload the scientist checked in, or a fixed health-probe circuit), `QC_EXECUTION_TARGET=simulator`, `QC_BACKEND=ibm_marrakesh` (the device we monitor), tight `QC_CORRELATION_THRESHOLD` (e.g. `0.9`) since this is the "is the device healthy" check, `QC_INSTANCE` + `QISKIT_IBM_TOKEN` from **dev** environment.
- Steps: checkout → setup-python → pip install → `make -C qiskit-runtime integration-test`.
- **Persist the result as a health data point.** At minimum upload the timestamped `result.json` artifact. Optionally (document as a stretch) append to a health log (commit to a `health/` branch, or push to an external store) so the correlation floor and availability accumulate over time into the "free sensor" dataset the paper proposes. Do not build external storage integrations unless asked; the artifact is the floor.

---

## The two-axis configuration model (implement exactly this; do not collapse)

Two independent axes. Keep them independent in code and config:

- **Axis A — execution target:** `QC_EXECUTION_TARGET ∈ {simulator, qpu}`. Decided by a variable, defaulted per environment (dev→simulator, prod→qpu), overridable per run. **Not** bound to the environment's identity.
- **Axis B — credentials + approval:** carried by the **GitHub Environment** (`dev` vs `prod`). The environment holds the token+instance secret pair and the approval gate. This is the *only* thing that decides who can spend and what must happen first.
- **Independent input — backend:** `QC_BACKEND` is its own knob (pin a device, or empty→least_busy). Orthogonal to both axes.

Truth table the implementation must produce:

| Environment | Default target | Credential | Gate | Effect |
|---|---|---|---|---|
| dev | simulator | free/open instance | none | calibration-pull + local sim, zero QPU spend |
| dev (override target=qpu) | qpu | free/open instance | none | real submit on cheap instance, bounded blast radius |
| prod | qpu | paid instance | required reviewers | real submit on pinned hardware after human approval |

**Do not** implement "if environment==dev use simulator" as a hardcoded branch. Read `QC_EXECUTION_TARGET`; let the environment *default* it.

---

## Accountability model (implement exactly this; do NOT collapse the identities)

Three distinct identities, three independent systems. This is a first-class requirement, not a nice-to-have.

1. **Author identity — signed commits.** Document (in README/CONTRIBUTING) that circuit changes must be signed. Optionally add a branch-protection note requiring signed commits on `main`. The commit signature is the durable record of who wrote/changed the circuit.

2. **Approver identity — GitHub Environment required reviewers.** The `prod` environment must require reviewers so run-on-merge pauses for human approval before the paid credential is injected. This record lives in GitHub. Note explicitly in docs that this is a claim *by GitHub*, under org control — necessary but not independently sufficient.

3. **Submitter identity — IBM Cloud IAM Service ID.** The token in `QISKIT_IBM_TOKEN` **must be a Service ID API key**, not a human personal token and not a broad org token. Requirements:
   - Distinct Service IDs (and thus distinct key+instance pairs) for `dev` and `prod`. This is *why* there are two credential pairs — so IBM's own audit trail distinguishes gated-prod from ungated-dev submissions **without trusting GitHub**.
   - Scope each Service ID via **access groups** to only the instance(s) it needs; quantum actions are IAM actions (e.g. `quantum-computing.job.*`), so submit/delete permissions are provider-enforced policy.
   - Prefer narrowly-scoped, rotatable keys; note that Service ID API keys can be limited-use to bound blast radius.
   - Document that **IBM Cloud Activity Tracker** (CADF-standard events) is the provider-side, out-of-GitHub audit trail: it records which Service ID submitted which job against which instance, and should be enabled on the account.

Store the correlation between the three in the run: the `run.py` result JSON should capture `job_id`, `submitted_at`, and the backend/instance; combined with the git SHA (available as `$GITHUB_SHA`) and the GitHub run/approval metadata, the three trails are cross-referenceable. Write the `$GITHUB_SHA` and `$GITHUB_RUN_ID` into the result JSON for `run.py` so a single artifact ties author→approval→submission.

**Anti-requirement:** never run any environment under a single shared token. Never let approval and submission share an identity. Never make the two credential pairs two names for one underlying Service ID.

---

## Async upgrade path (DO NOT build now — specify only, leave ready)

Build blocking (`run.py` above). Leave async as a documented, drop-in extension that reuses the separated submit/read halves:

- **Submit stays as-is:** `run.py`'s submit function writes `job_id` to durable storage (artifact today; a real store later) and exits without waiting.
- **Add a reaper workflow** (future): triggered on `schedule:` or by callback, reads outstanding `job_id`s, polls each `RuntimeJobV2`, records results, reports. This is where results are read.
- **Message queue as the scaling seam** (future): when submission volume needs backpressure/retries, submissions become messages, a worker pool drains them at a rate bounded by hardware/budget, results flow onto a result queue. A durable workflow engine or the provider's job tracking are alternatives; a queue is the classic choice.

The only thing the *current* build must guarantee for this to be a clean extension: **submit and read are separate functions, and submit already emits a job id + result file.** Do not fuse them for the blocking version's convenience.

---

## Build order (suggested)

1. Drop in the **already-built payload layer** (`payload.py`, `submit.py`, `circuits/hello_noise.{qasm,py,ipynb}`) — do not regenerate. Sanity-check `python payload.py circuits/hello_noise.ipynb` resolves a circuit.
2. `validate.py` + `qiskit-runtime/Makefile` (`validate` target, with `QC_PAYLOAD_PATH` default) + `validate.yml`. Get a green branch check with zero network, loading the circuit via `load_circuit(QC_PAYLOAD_PATH)`.
3. `test_integration.py` + `integration-test` target + `nightly.yml`. Reproduce the calibration-pull + noise-model + correlation-floor behavior and the exact FAIL-line format, loading the circuit via `load_circuit(QC_PAYLOAD_PATH)`. Make the cron maintenance-window-aware with the #16 comment.
4. `run.py` + `run` target + `run-on-merge.yml` with `environment: prod`. Thin wrapper over `submit.submit_blocking`; blocking with timeout; submit/read stay separated. Write SHA + run id into result JSON.
5. Docs: README section on configuring the `dev`/`prod` environments, required reviewers on `prod`, the two Service IDs, signed commits, and enabling Activity Tracker. A `WORKFLOWS.md` describing the black-box contract, the payload contract (the three formats + the `.ipynb` `circuit`-tag rule), the "no program-upload; notebook-is-repo-artifact" fact, and the two-axis model.
6. Leave the async section as docs only.

## Acceptance checks

- All three payload formats (`.qasm`/`.py`/`.ipynb`) load via `payload.load_circuit()` to a structurally identical circuit and an identical submittable PUB. *(Already validated for the sample payloads; must hold for whatever the scientist checks in.)*
- The `.ipynb` loader executes **only** the cell tagged `circuit` and ignores all other cells (including ones that would error if run).
- A malformed payload (bad QASM, missing `build_circuit`, untagged/duplicately-tagged notebook, no measurements) fails `validate` with a clean non-zero exit, not a stack trace mid-pipeline.
- `QC_PAYLOAD_PATH` selects the circuit for all three targets; no circuit is hardcoded in `validate.py`/`test_integration.py`/`run.py`.
- Nothing uploads a program or mints a program ID; the payload file is never sent to IBM — only the transpiled circuit (PUB) is. `upload_program()` appears nowhere.
- Branch push runs `validate` with no IBM network and no secrets. ✅ green possible offline (only `qiskit` + `qiskit-aer` needed; `qiskit-ibm-runtime` imported lazily).
- `test_integration.py` connects, pulls calibration, builds Aer noise model, simulates, and produces the exact FAIL-line format when the floor isn't met; **never** submits a hardware job.
- `nightly.yml` cron is outside the recalibration window and comments why (cites #16).
- `run-on-merge.yml` targets `environment: prod`, blocks with timeout, and cannot reach the paid token without the environment's required-reviewer approval.
- Config reads `QC_EXECUTION_TARGET` as a variable defaulted per environment — no hardcoded "dev==simulator" branch.
- Every environment uses a distinct Service ID key+instance pair; no shared token anywhere; result JSON for `run.py` ties git SHA + run id + job id together.
- Submit and read are separable functions (in `submit.py`); `run.py` does not fuse them.
- The DevOps-facing surface (workflow YAML) never references Make internals; it only passes the env contract and reads `result.json`.
