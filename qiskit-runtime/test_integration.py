"""test_integration.py

The nightly device-health sensor (see WORKFLOWS.md and the accompanying
paper's Part 4). Connects to real IBM Cloud, verifies the connection, pulls
a real backend's live calibration, builds a local Aer noise model from it,
and simulates the payload circuit locally against that model -- asserting
a correlation floor. This is the check that faceplanted in issue #16 when
scheduled inside a device's post-calibration stabilization window; see
nightly.yml for the fix.

**This never submits a hardware job.** Reading calibration is a
backend-inspection API call, not a job submission -- the whole value of this
check is sensing device health for free, without spending QPU time. The
circuit itself is resolved via QC_PAYLOAD_PATH -- payload.load_circuit() --
so this exercises the exact same circuit a scientist checked in, not a
circuit hardcoded here.

Env contract (see WORKFLOWS.md): QC_PAYLOAD_PATH, QC_BACKEND, QC_INSTANCE,
QC_CHANNEL, QC_SHOTS, QC_CORRELATION_THRESHOLD, QC_RESULT_PATH,
QISKIT_IBM_TOKEN. Writes QC_RESULT_PATH and exits 0/1; never scrapes stdout
for results downstream (see the workflow files).

Any failure along the way (bad credentials, unreachable instance, unknown
backend name, payload error) is caught and reported through report.py's
interpret_execution() as a clean pipeline error, distinct from a genuine
low-correlation result -- see doc/quantum-pipeline-faq.md for why that
distinction matters to anyone reading this who isn't the one who wrote it.

Transpiles locally (Qiskit's own pass manager, not IBM's cloud transpiler
service) to the Aer noise-model backend's ISA before simulating -- this
needs to happen fast and offline every night, and the noise model itself is
already a local object (AerSimulator.from_backend()), so there's no cloud
round-trip to make here. The cloud transpiler service is reserved for the
real-hardware path in run.py/submit.py, where the actual target is a real
IBM backend, not a local noise model built from one.

Plain assert + sys.exit, no test framework -- mirrors this repo's own
"Node's built-in assert, no test framework" convention (see root CLAUDE.md's
Code conventions section) rather than adding pytest as a dependency.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_aer import AerSimulator

from payload import load_circuit
from report import circuit_complexity, interpret_execution, write_result

QC_PAYLOAD_PATH = os.environ.get("QC_PAYLOAD_PATH", "circuits/hello_noise.qasm")
QC_BACKEND = os.environ.get("QC_BACKEND", "ibm_marrakesh")
QC_INSTANCE = os.environ.get("QC_INSTANCE")
QC_CHANNEL = os.environ.get("QC_CHANNEL", "ibm_quantum_platform")
QC_SHOTS = int(os.environ.get("QC_SHOTS", "4096"))
QC_CORRELATION_THRESHOLD = float(os.environ.get("QC_CORRELATION_THRESHOLD", "0.9"))
QC_RESULT_PATH = os.environ.get("QC_RESULT_PATH", "result.json")
QISKIT_IBM_TOKEN = os.environ.get("QISKIT_IBM_TOKEN")


def verify_cloud_connection(service) -> int:
    """Cheap, genuine round-trip to the IBM Cloud Runtime API: listing job
    history only requires a valid token + instance CRN to authenticate, and
    succeeds regardless of which backends that instance's plan can see. This
    is what actually proves "we talked to real IBM Cloud", independent of
    and prior to any backend selection, so a credential/instance problem
    surfaces here with a clear cause instead of downstream as a confusing
    backend-matching error."""
    return len(list(service.jobs(limit=1)))


def _fail(reason: str) -> int:
    print(f"FAIL: {reason}", file=sys.stderr)
    write_result({
        "mode": "simulator",
        "payload_path": QC_PAYLOAD_PATH,
        "backend_pinned": QC_BACKEND,
        "passed": False,
        "job_id": None,
        "error": reason,
        "interpretation": interpret_execution(
            mode="simulator", passed=False, p_correlated=None,
            threshold=QC_CORRELATION_THRESHOLD, complexity=None, error=reason,
        ),
    }, QC_RESULT_PATH)
    return 1


def main() -> int:
    from qiskit_ibm_runtime import QiskitRuntimeService

    try:
        # Loading from a raw token (not qiskit_ibm_runtime's saved-account
        # file) is deliberate -- the token comes from QISKIT_IBM_TOKEN, a CI
        # secret, never from a local account file. The library itself emits
        # a WARNING log line to this effect (_discover_account) -- that is
        # expected, not a bug, and is left visible in CI output on purpose.
        service = QiskitRuntimeService(
            channel=QC_CHANNEL, token=QISKIT_IBM_TOKEN, instance=QC_INSTANCE
        )

        recent_jobs_visible = verify_cloud_connection(service)
        connection_verified = True

        # Pin the specific device we're monitoring -- unlike run.py's
        # hardware path, this deliberately does NOT fall back to
        # least_busy: the nightly check's whole point is tracking one
        # named device's health over time.
        real_backend = service.backend(QC_BACKEND)
        calibration_pulled_at = datetime.now(timezone.utc).isoformat()
        backend = AerSimulator.from_backend(real_backend)
        backend_label = f"aer-noise[{real_backend.name}]"

        circuit = load_circuit(QC_PAYLOAD_PATH)
        complexity = circuit_complexity(circuit)
        pm = generate_preset_pass_manager(optimization_level=1, backend=backend)
        isa_circuit = pm.run(circuit)

        from qiskit_ibm_runtime import SamplerV2 as Sampler

        sampler = Sampler(mode=backend)
        job = sampler.run([isa_circuit], shots=QC_SHOTS)
        result = job.result()
        counts = result[0].data.c.get_counts()
    except Exception as e:  # noqa: BLE001 - surface a clean pipeline error
        return _fail(f"{type(e).__name__}: {e}")

    total = sum(counts.values())
    p_correlated = (counts.get("00", 0) + counts.get("11", 0)) / total
    passed = p_correlated >= QC_CORRELATION_THRESHOLD
    submitted_at = datetime.now(timezone.utc).isoformat()

    backend_summary = (
        f"{backend_label} (cloud connection verified, "
        f"{recent_jobs_visible} recent job(s) visible), shots: {total}"
    )
    print(f"backend: {backend_summary}")
    print(f"counts: {counts}")
    print(f"p(00) + p(11) = {p_correlated:.4f} (threshold {QC_CORRELATION_THRESHOLD})")

    interpretation = interpret_execution(
        mode="simulator",
        passed=passed,
        p_correlated=p_correlated,
        threshold=QC_CORRELATION_THRESHOLD,
        complexity=complexity,
    )
    print(interpretation)

    write_result({
        "mode": "simulator",
        "payload_path": QC_PAYLOAD_PATH,
        "backend_label": backend_label,
        "backend_pinned": QC_BACKEND,
        "connection_verified": connection_verified,
        "recent_jobs_visible": recent_jobs_visible,
        "shots": total,
        "counts": {k: v for k, v in counts.items()},
        **complexity,
        "p00_plus_p11": p_correlated,
        "threshold": QC_CORRELATION_THRESHOLD,
        "passed": passed,
        "job_id": None,
        "submitted_at": submitted_at,
        "calibration_pulled_at": calibration_pulled_at,
        "interpretation": interpretation,
    }, QC_RESULT_PATH)

    if not passed:
        print("FAIL: measured correlation below threshold", file=sys.stderr)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
