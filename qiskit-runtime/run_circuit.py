"""Builds the canonical Bell-state (Phi+) circuit and submits it via Qiskit
Runtime's SamplerV2 -- either to a local AerSimulator (no auth needed) or,
in "cloud" mode, to a local AerSimulator seeded with a real IBM backend's
noise snapshot (auth needed, but nothing is queued on IBM's side).

IBM retired cloud-hosted simulator backends on 2024-05-15 (see
https://quantum.cloud.ibm.com/docs/en/guides/local-simulators), so
`QiskitRuntimeService.least_busy(simulator=True, ...)` can never match
anything anymore -- that's the source of the
`QiskitBackendNotFoundError: 'No backend matches the criteria.'` this
replaced. IBM's own documented replacement is local noise-aware simulation:
fetch a real QPU's calibration data and run `AerSimulator.from_backend(...)`
locally. Fetching calibration data is a backend-inspection API call, not a
job submission, so this still costs zero queue time/quota -- it preserves
the "never submits a job to a real QPU from CI" constraint from CLAUDE.md,
just via a different mechanism (local execution) than before (filtering
QPUs out of backend selection).

Mode is selected automatically: QISKIT_IBM_TOKEN present -> cloud, absent ->
local. This is what lets the same code run as a zero-secret pull_request
check and as the scheduled cloud integration test -- see
../.github/workflows/qiskit-runtime-*.yml and CLAUDE.md's "Added: CI/CD"
section.

Bit-order note: Qiskit reports counts little-endian (rightmost character is
qubit 0) -- same convention already called out for the app's own circuit
exports in export-templates/qiskit.py and export-templates/openqasm2.qasm.
For this canonical Phi+ case (q0=0, q1=0) it doesn't change the result since
'00' and '11' read the same either way, but don't assume that generalizes if
this script is ever extended to other Bell states.
"""
import os

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_ibm_runtime import SamplerV2 as Sampler

SHOTS = 4096
CORRELATED_THRESHOLD = 0.9  # p('00') + p('11') must clear this to pass


def build_phi_plus_circuit():
    q = QuantumRegister(2, "q")
    c = ClassicalRegister(2, "c")
    qc = QuantumCircuit(q, c)
    qc.h(0)
    qc.cx(0, 1)
    qc.measure(q, c)
    return qc


def verify_cloud_connection(service):
    """Cheap, genuine round-trip to the IBM Cloud Runtime API: listing job
    history only requires a valid token + instance CRN to authenticate, and
    succeeds (returning zero or more jobs) regardless of which backends --
    simulator or QPU -- that instance's plan can see. This is what actually
    proves "we talked to real IBM Cloud", independent of and prior to any
    backend selection, so a credential/instance problem surfaces here with
    a clear cause instead of downstream as a confusing backend-matching
    error."""
    return len(list(service.jobs(limit=1)))


def select_backend():
    token = os.environ.get("QISKIT_IBM_TOKEN")
    if not token:
        from qiskit_aer import AerSimulator

        return AerSimulator(), "local-aer"

    from qiskit_aer import AerSimulator
    from qiskit_ibm_runtime import QiskitRuntimeService

    instance = os.environ.get("QISKIT_IBM_INSTANCE")
    service = QiskitRuntimeService(
        channel="ibm_quantum_platform", token=token, instance=instance
    )

    job_count = verify_cloud_connection(service)

    # No cloud simulators exist anymore, so pick a real, operational QPU --
    # simulator=False is explicit, not a leftover default -- purely to read
    # its calibration snapshot. The circuit itself still never touches
    # IBM's queue: AerSimulator.from_backend() runs entirely locally.
    real_backend = service.least_busy(operational=True, simulator=False)
    backend = AerSimulator.from_backend(real_backend)
    name = f"aer-noise[{real_backend.name}] (cloud connection verified, {job_count} recent job(s) visible)"
    return backend, name


def run_bell_state(shots=SHOTS):
    circuit = build_phi_plus_circuit()
    backend, backend_name = select_backend()

    pm = generate_preset_pass_manager(backend=backend, optimization_level=1)
    isa_circuit = pm.run(circuit)

    sampler = Sampler(mode=backend)
    job = sampler.run([isa_circuit], shots=shots)
    result = job.result()
    counts = result[0].data.c.get_counts()

    total = sum(counts.values())
    p_correlated = (counts.get("00", 0) + counts.get("11", 0)) / total

    return {
        "backend": backend_name,
        "shots": total,
        "counts": counts,
        "p_correlated": p_correlated,
    }


if __name__ == "__main__":
    summary = run_bell_state()
    print(f"backend:       {summary['backend']}")
    print(f"shots:         {summary['shots']}")
    print(f"counts:        {summary['counts']}")
    print(f"p(00) + p(11): {summary['p_correlated']:.4f}")
    status = "PASS" if summary["p_correlated"] >= CORRELATED_THRESHOLD else "FAIL"
    print(f"result:        {status} (threshold {CORRELATED_THRESHOLD})")
