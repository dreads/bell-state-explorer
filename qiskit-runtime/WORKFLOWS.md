# WORKFLOWS.md — the CI/physics contract for `qiskit-runtime/`

This is the DevOps-facing reference for `qiskit-runtime/`. If you're editing
`.github/workflows/validate.yml`, `nightly.yml`, or `run-on-merge.yml`, or
you're the data scientist checking in a circuit, this is the doc to read.
The narrative *why* is in `../doc/running-quantum-jobs-in-cicd.md`; this file
is the *what* — a stable contract, kept deliberately short.

## The payload contract

A circuit lives in the repo as one of three formats. `payload.py`'s
`load_circuit(path)` resolves any of them to the same `QuantumCircuit`, and
every entrypoint below (`validate.py`, `test_integration.py`, `run.py`)
depends only on that object — none of them know or care which format was
used.

| Format | Contract |
|---|---|
| `.qasm` | Valid OpenQASM 2.0, with measurements. |
| `.py` | Module exposing a no-arg `build_circuit() -> QuantumCircuit`, with measurements. |
| `.ipynb` | Exactly one code cell tagged `circuit` (cell metadata `"tags": ["circuit"]`) defining a no-arg `build_circuit() -> QuantumCircuit` with measurements. All other cells are ignored — the loader executes **only** the tagged cell, never the rest of the notebook. |

A malformed payload (bad QASM, missing `build_circuit`, an untagged or
duplicately-tagged notebook, a circuit with no measurements) raises
`PayloadError` and fails `validate` cleanly — not a stack trace mid-pipeline.

`qiskit-runtime/circuits/hello_noise.{qasm,py,ipynb}` is the sample payload,
present in all three forms, validated to produce structurally identical
circuits and identical submittable PUBs across all three. It's also the
exact circuit the nightly device-health check runs — one known-good signal,
not two circuits that happen to agree by coincidence.

## No program upload — ever

There is no "upload your circuit to IBM and get a program ID back" step.
That model is deprecated and gone. What actually happens:

- The payload file (`.qasm`/`.py`/`.ipynb`) lives in **this repo**, under
  version control and review. It is never sent to IBM.
- The pipeline resolves it to a `QuantumCircuit` locally, transpiles it to
  the target backend's ISA locally, and submits **the compiled circuit**
  as a Sampler PUB (`(isa_circuit,)`).
- The only things that persist on IBM's side are the **instance** (the CRN
  your credentials point at) and, per submission, a **`RuntimeJobV2` job
  id**. Neither is a program. `upload_program()` appears nowhere in this
  codebase, on purpose.

## The black-box contract between CI and physics

The workflow YAML (DevOps's concern) and the Python under `qiskit-runtime/`
(the physics/pipeline concern) talk to each other through exactly two
surfaces: environment variables in, an exit code + JSON file out. If a
change to this directory can't honor that, change the implementation —
never let `Makefile` internals leak into a workflow file.

**Inputs**, all via env vars (defaults live in `Makefile`, so `make <target>`
works standalone; workflows override them, never edit the Makefile):

| Env var | Meaning |
|---|---|
| `QC_PAYLOAD_PATH` | path to the checked-in circuit payload |
| `QC_EXECUTION_TARGET` | `simulator` or `qpu` |
| `QC_BACKEND` | device to pin/model; empty in `run.py` falls back to `least_busy` |
| `QC_INSTANCE` | IBM Cloud instance CRN |
| `QC_CHANNEL` | Qiskit Runtime channel (`ibm_quantum_platform`) |
| `QC_SHOTS` | shot count |
| `QC_CORRELATION_THRESHOLD` | pass/fail floor for `p(00)+p(11)` |
| `QC_JOB_TIMEOUT_SEC` | max wall-clock to block on a real job |
| `QISKIT_IBM_TOKEN` | Service ID API key (secret) |
| `QC_RESULT_PATH` | where the result JSON is written |

**Output:** exit code (`0` = pass, non-zero = fail) plus a JSON file at
`QC_RESULT_PATH`, e.g.:

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

Workflows read this file for the job summary and artifact upload. They
never scrape log lines.

## Three entrypoints, three jobs

| Entrypoint | Make target | Network? | Hardware spend? | Runs from |
|---|---|---|---|---|
| `validate.py` | `make validate` | none | none | `validate.yml`, on every push/PR |
| `test_integration.py` | `make integration-test` | yes (calibration pull only) | none | `nightly.yml`, scheduled |
| `run.py` | `make run` | yes | yes, real QPU | `run-on-merge.yml`, on push to `main` |

`test_integration.py` is the free device-health sensor: it authenticates,
verifies the connection, pulls a real backend's live calibration, builds a
local Aer noise model from it, and simulates the payload circuit against
that model — asserting a correlation floor. It **never** submits a job to
a QPU's queue.

## Two independent axes — don't collapse them

- **Execution target** (`QC_EXECUTION_TARGET ∈ {simulator, qpu}`) — where
  the work runs. Defaulted per environment, overridable per run.
- **Environment** (`dev` vs `prod`, a GitHub Environment) — who can spend,
  and what has to happen first. Carries the credential pair and, for
  `prod`, the required-reviewer approval gate.
- **Backend** (`QC_BACKEND`) — its own independent input, orthogonal to
  both: even simulator mode needs to know which device's calibration to
  model.

| Environment | Default target | Credential | Gate | Effect |
|---|---|---|---|---|
| dev | simulator | free/open instance | none | calibration-pull + local sim, zero spend |
| dev (override target=qpu) | qpu | free/open instance | none | real submit, cheap instance, bounded blast radius |
| prod | qpu | paid instance | required reviewers | real submit on pinned hardware, after human approval |

Do not hardcode "if environment == dev, use simulator" anywhere — read
`QC_EXECUTION_TARGET` and let the environment supply its *default*.

## Accountability — three identities, never collapsed

1. **Author** — signed git commits. Who wrote or changed the circuit.
2. **Approver** — the `prod` GitHub Environment's required-reviewer record.
   A claim by GitHub, under this org's control — necessary, not
   independently sufficient.
3. **Submitter** — an IBM Cloud IAM **Service ID**, never a human personal
   token. `dev` and `prod` each get their own Service ID (distinct key +
   instance pair), so IBM's own Activity Tracker (CADF audit events)
   distinguishes a gated-prod submission from an ungated-dev one
   independently of anything GitHub says.

`run.py`'s result JSON carries `job_id`, `submitted_at`, the backend/instance,
`$GITHUB_SHA`, and `$GITHUB_RUN_ID` — combined, a single artifact
correlates author → approval → submission across all three systems. Never
run any environment under a shared token; never let approval and submission
share an identity.

## Async — documented, not built

`run.py` blocks: it submits and polls to completion (or timeout) in one
step. The submit and read halves are already separate functions in
`submit.py` (`build_pub`, `submit_blocking`) specifically so a future
reaper workflow can poll outstanding `job_id`s on its own schedule without
a rewrite. Not built yet — see the paper's Part 2 for the reasoning on when
this becomes necessary (queue time, volume, or runner time limits).
