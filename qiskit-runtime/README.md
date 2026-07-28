# Qiskit Runtime integration

Separate Python subproject, deliberately outside `src/` -- the main app
stays a zero-dependency static site (see repo root `CLAUDE.md`); this is
CI/devops tooling that runs a real Bell-state circuit through
[`qiskit-ibm-runtime`](https://github.com/Qiskit/qiskit-ibm-runtime) to
cross-check `src/state.js`'s Phi+ math against an actual (simulated)
quantum execution. Full rationale lives in `CLAUDE.md`'s
"Added: CI/CD (Qiskit Runtime integration)" section -- read that first.

## Two modes, one script

`run_circuit.py` builds the canonical Phi+ circuit (H + CNOT) and submits it
via `SamplerV2`. Which backend it uses is decided automatically:

- **`QISKIT_IBM_TOKEN` unset** -> local `AerSimulator`, no auth, no network.
- **`QISKIT_IBM_TOKEN` set** -> real IBM Cloud, via
  `QiskitRuntimeService.least_busy(simulator=True, operational=True)` --
  dynamic discovery of whichever cloud simulator backend has the shortest
  queue right now, never a hardcoded backend name.

`test_integration.py` calls the same function and asserts
`p('00') + p('11')` clears `CORRELATED_THRESHOLD` (0.9).

## Running locally

```bash
make install
make integration-test        # local AerSimulator, no credentials needed
```

To exercise the real cloud path locally (uses your own IBM Cloud quota):

```bash
export QISKIT_IBM_TOKEN=<your 44-char API key>
export QISKIT_IBM_INSTANCE=<your instance CRN>
make integration-test
```

### Via Docker

Pins the exact Python/Qiskit versions CI uses, without touching your host
Python. This image is for local rehearsal only -- the GitHub Actions
workflows install dependencies directly on `ubuntu-latest`, they don't use
this Dockerfile.

```bash
docker build -t qiskit-runtime-dev .
docker run --rm qiskit-runtime-dev                      # local sim
docker run --rm -e QISKIT_IBM_TOKEN -e QISKIT_IBM_INSTANCE qiskit-runtime-dev   # cloud
```

## Cost / quota

Local mode is free and instant. Cloud mode consumes your IBM Cloud Qiskit
Runtime quota even when targeting a simulator backend, depending on your
plan -- the scheduled workflow (`.github/workflows/qiskit-runtime-cloud-integration.yml`)
runs daily and is simulator-only by design (never targets a real QPU); see
CLAUDE.md if you want to change that cadence.

## Where the CRN/token come from

IBM Quantum Platform dashboard -> **Instances** tab lists each instance with
its CRN (`QISKIT_IBM_INSTANCE`). The API key (`QISKIT_IBM_TOKEN`) is on the
dashboard's main page. Both are stored as GitHub Actions repo secrets for
the cloud workflow -- see CLAUDE.md for the secret names expected.
