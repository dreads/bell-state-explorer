"""submit.py

Shows exactly what crosses the wire to IBM Quantum, and proves that a payload
in ANY of the three formats (.qasm/.py/.ipynb) is submitted identically.

IMPORTANT clarification about "submit the notebook":
  You do NOT upload the .ipynb (or .py or .qasm) file to IBM. There is no
  program-upload endpoint anymore (upload_program is deprecated; the custom-
  program model was replaced by primitives). What you submit is an ISA
  *circuit* as a Sampler PUB. The notebook is an AUTHORING format that lives
  in your repo; the pipeline resolves it to a circuit locally, converts it
  to the target backend's ISA, and submits that circuit. The payload IBM
  sees is the circuit, never the file.

ISA conversion here is deliberately NOT a local Qiskit pass manager. It's
IBM's cloud-hosted Qiskit Transpiler Service (the `qiskit-ibm-transpiler`
package) -- the actual conversion for a real hardware submission is IBM's
to do, not this pipeline's. (validate.py and test_integration.py each still
use a local pass manager for their own, separate purposes -- a cheap
no-network sanity check and a same-process noise-model simulation,
respectively -- neither is "the real conversion" this module does for an
actual hardware run.) The Transpiler Service API is one of the faster-moving
parts of IBM's stack; re-verify parameter names against current docs before
assuming this call shape is still accurate.

So "save a notebook and submit that with the payload" holds up as:
  save .ipynb in the repo  ->  loader extracts the circuit  ->  IBM's cloud
  transpiler service converts it to the target backend's ISA  ->  submit as
  a Sampler PUB  ->  RuntimeJobV2.

This module has two functions:
  build_pub(payload_path, *, backend_name, token)  -> the (isa_circuit,) PUB
  submit_blocking(...)                             -> the real submission
                                                       (guarded; not run in
                                                       CI validation, requires
                                                       credentials)
"""

from __future__ import annotations

import time
from pathlib import Path

from payload import load_circuit


def build_pub(payload_path: str | Path, *, backend_name: str, token: str):
    """Resolve any payload format to an ISA-circuit PUB, converted by IBM's
    cloud Qiskit Transpiler Service -- not a local pass manager.

    This is format-agnostic: .qasm, .py, and .ipynb all funnel through
    load_circuit() and produce the same PUB shape. `backend_name` is the
    concrete device the circuit will run on (already resolved by the
    caller, including any least_busy() fallback); the conversion targets
    that device's real ISA.
    """
    from qiskit_ibm_transpiler import TranspilerService

    circuit = load_circuit(payload_path)
    cloud_transpiler = TranspilerService(
        backend_name=backend_name,
        token=token,
        optimization_level=3,
        ai=False,  # plain ISA conversion; not opting into IBM's AI-routing passes
    )
    isa_circuit = cloud_transpiler.run(circuit)
    # A SamplerV2 PUB is a tuple; for a plain measured circuit it is (circuit,).
    return (isa_circuit,)


def submit_blocking(
    payload_path: str | Path,
    *,
    token: str,
    instance: str,
    channel: str = "ibm_quantum_platform",
    backend_name: str | None = None,
    shots: int = 4096,
    timeout_sec: int = 1800,
):
    """Submit the payload's circuit to real hardware and block for the result.

    Deliberately imports qiskit-ibm-runtime lazily so that CI validation (which
    never calls this) does not require the runtime client or any credentials.
    Returns (job_id, counts). Separated from result-reading is left for the
    async path; here we block for simplicity.
    """
    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2 as Sampler

    service = QiskitRuntimeService(channel=channel, token=token, instance=instance)
    backend = (
        service.backend(backend_name)
        if backend_name
        else service.least_busy(operational=True, simulator=False)
    )

    pub = build_pub(payload_path, backend_name=backend.name, token=token)

    sampler = Sampler(mode=backend)
    sampler.options.default_shots = shots
    job = sampler.run([pub])
    job_id = job.job_id()

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if job.status() in ("DONE", "ERROR", "CANCELLED"):
            break
        time.sleep(5)
    else:
        # timed out; job keeps running on IBM's side, id preserved for reaping
        return job_id, None

    result = job.result()
    # SamplerV2: counts live under the first PUB result's classical register.
    pub_result = result[0]
    counts = pub_result.data.c.get_counts()
    return job_id, counts
