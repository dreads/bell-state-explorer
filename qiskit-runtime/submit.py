"""submit.py

Shows exactly what crosses the wire to IBM Quantum, and proves that a payload
in ANY of the three formats (.qasm/.py/.ipynb) is submitted identically.

IMPORTANT clarification about "submit the notebook":
  You do NOT upload the .ipynb (or .py or .qasm) file to IBM. There is no
  program-upload endpoint anymore (upload_program is deprecated; the custom-
  program model was replaced by primitives). What you submit is a transpiled
  ISA *circuit* as a Sampler PUB. The notebook is an AUTHORING format that
  lives in your repo; the pipeline resolves it to a circuit locally, transpiles
  it, and submits the circuit. The payload IBM sees is the circuit,
  never the file.

So "save a notebook and submit that with the payload" holds up as:
  save .ipynb in the repo  ->  loader extracts the circuit  ->  transpile to
  the target backend's ISA  ->  submit as a Sampler PUB  ->  RuntimeJobV2.

This module has two functions:
  build_pub(payload_path, backend)  -> the (isa_circuit,) PUB, for any format
  submit_blocking(...)              -> the real submission (guarded; not run in
                                       CI validation, requires credentials)
"""

from __future__ import annotations

import time
from pathlib import Path

from qiskit import transpile
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager

from payload import load_circuit


def build_pub(payload_path: str | Path, backend):
    """Resolve any payload format to a transpiled ISA-circuit PUB.

    This is format-agnostic: .qasm, .py, and .ipynb all funnel through
    load_circuit() and produce the same PUB shape. `backend` may be a real
    IBM backend or an Aer simulator; transpilation targets whichever is given.
    """
    circuit = load_circuit(payload_path)
    pm = generate_preset_pass_manager(optimization_level=1, backend=backend)
    isa_circuit = pm.run(circuit)
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

    pub = build_pub(payload_path, backend)

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
