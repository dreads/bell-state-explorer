# Qiskit Runtime integration

Separate Python subproject, deliberately outside `src/` — the main app
stays a zero-dependency static site (see repo root `CLAUDE.md`). This is
CI/DevOps tooling that takes a data scientist's circuit payload — checked
into this repo as OpenQASM 2.0, a Qiskit script, or a notebook — validates
it cheaply on every branch, runs it for real on IBM Quantum hardware after
merge to `main`, and runs a nightly job that doubles as a free device-health
sensor. Full rationale (why no program-upload, the two-axis config model,
the accountability model) lives in `WORKFLOWS.md`; this README covers
running it locally and setting up the GitHub side. If you got here because
a result looked alarming and you don't write the circuits yourself, see
`../doc/quantum-pipeline-faq.md` instead — it's written for that.

## The payload

`circuits/hello_noise.{qasm,py,ipynb}` is the sample payload, in all three
accepted formats — see `WORKFLOWS.md` for the format contract. It's a
2-qubit Bell (Phi+) circuit: H on q0, CNOT q0->q1, measure both. On an ideal
simulator `p(00) + p(11) ~= 1.0`; that correlation degrading is the signal
this pipeline reads as a proxy for device health.

`payload.py`'s `load_circuit(path)` resolves any of the three formats to
the same `QuantumCircuit`. Point `QC_PAYLOAD_PATH` at your own payload to
run something other than the sample.

## Three entrypoints

| Command | What it does | Needs credentials? | Spends QPU time? |
|---|---|---|---|
| `make validate` | Structural + transpilation check only | no | no |
| `make integration-test` | Pulls a real backend's live calibration, simulates locally, asserts a correlation floor | yes | no |
| `make run` | Submits to real hardware, blocks for the result | yes | **yes** |

```bash
make install
make validate              # no credentials needed
```

To run the calibration-pull check or a real hardware submission locally
(uses your own IBM Cloud quota):

```bash
export QISKIT_IBM_TOKEN=<your Service ID API key>
export QC_INSTANCE=<your instance CRN>
make integration-test      # pulls calibration, simulates locally, no spend
make run                   # submits to real hardware -- this one costs money
```

See `WORKFLOWS.md` for the full `QC_*` env-var contract and defaults.

### Via Docker

Pins the exact Python/Qiskit versions CI uses, without touching your host
Python. Local rehearsal only — the GitHub Actions workflows install
dependencies directly on `ubuntu-latest`, they don't use this image.

```bash
docker build -t qiskit-runtime-dev .
docker run --rm qiskit-runtime-dev                                    # make validate
docker run --rm -e QISKIT_IBM_TOKEN -e QC_INSTANCE qiskit-runtime-dev  # cloud-connected targets
```

## Setting up the GitHub side

### 1. Two GitHub Environments: `dev` and `prod`

Settings -> Environments -> New environment, twice.

- **`dev`** — no required reviewers. Holds the free/open-instance
  `QISKIT_IBM_TOKEN` + `QC_INSTANCE` secret pair. Used by `nightly.yml`,
  which never spends QPU time.
- **`prod`** — **add required reviewers** (Environments -> prod ->
  "Required reviewers"). This is the actual spend gate: without it,
  `run-on-merge.yml` can reach the paid credential with no human in the
  loop. Holds the paid-instance `QISKIT_IBM_TOKEN` + `QC_INSTANCE` pair.

### 2. Two distinct IBM Cloud IAM Service IDs

Not two secrets sharing one identity — two actual Service IDs on IBM
Cloud, each with its own scoped API key and its own instance. This is what
lets IBM's own Activity Tracker distinguish a gated-prod submission from an
ungated-dev one, independent of anything GitHub's logs say. See
`WORKFLOWS.md`'s accountability section for why this matters.

- IBM Cloud console -> **Manage -> Access (IAM) -> Service IDs** -> create
  one for `dev`, one for `prod`.
- Scope each via an **access group** to only the instance it needs.
- Generate an API key per Service ID; store it as that environment's
  `QISKIT_IBM_TOKEN` secret. Store the corresponding instance CRN
  (Quantum Platform dashboard -> Instances tab) as `QC_INSTANCE`.
- Prefer narrowly-scoped, rotatable, limited-use keys.

### 3. Require CODEOWNERS review on circuit/pipeline paths

`.github/CODEOWNERS` already scopes `qiskit-runtime/circuits/**` and
`payload.py`/`submit.py`/`run.py` to a named owner — but it's inert until
branch protection enforces it: Settings -> Branches -> branch protection
rule for `main` -> enable "Require review from Code Owners". Update the
`@dreads` owner in that file to whoever is actually accountable for
reviewing circuit changes as the team grows. This is deliberately separate
from the `prod` environment's required reviewers in step 1 — see
`WORKFLOWS.md`'s accountability section for why both gates matter.

### 4. Branch protection: require `validate` on `main`

`validate.yml`'s `validate` job needs to run at least once before it's
selectable. Then: Settings -> Branches -> branch protection rule for `main`
-> "Require status checks to pass" -> add it.

### 5. Signed commits

Circuit changes should be signed — the commit signature is the durable
"who wrote this" record `WORKFLOWS.md`'s accountability model relies on.
Consider requiring signed commits on `main` in the same branch protection
rule.

### 6. Enable IBM Cloud Activity Tracker

Account-level setting on IBM Cloud. Once on, it records (in CADF format)
which Service ID submitted which job against which instance — the
provider-side audit trail that doesn't depend on trusting GitHub. See
`WORKFLOWS.md`.

## Cost / quota

`validate` and `integration-test` are free — the latter authenticates and
pulls calibration (two lightweight IBM Cloud API calls) but never queues a
job. Only `run` (and therefore `run-on-merge.yml`, gated behind `prod`'s
required reviewers) spends real QPU time and money.

## Repository variables

`QC_PAYLOAD_PATH` and `QC_BACKEND` are read as repo/environment variables
(Settings -> Secrets and variables -> Actions -> Variables) by all three
workflows, falling back to the sample payload and `ibm_marrakesh` if unset.
Point `QC_PAYLOAD_PATH` at a scientist's checked-in payload once it exists;
no workflow file needs to change.
