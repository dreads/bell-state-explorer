"""run.py

The real hardware path (qpu mode), run on merge to main after the prod
environment's required-reviewer approval (see run-on-merge.yml). Thin
wrapper over submit.py: owns the env contract and the result JSON, but does
not duplicate backend resolution or PUB-building -- those stay in
submit.py's build_pub()/submit_blocking() so the async upgrade path
(documented in WORKFLOWS.md, not built yet) can reuse them unchanged.

Loads the circuit once more here (in addition to submit.py's own internal
load) purely to report its qubit/depth complexity alongside the result --
a cheap local parse, no network -- so a low correlation number on a real,
larger circuit isn't read the same way as one on the tiny reference circuit.
See report.py and doc/quantum-pipeline-faq.md.

Accountability: the result JSON carries $GITHUB_SHA and $GITHUB_RUN_ID
alongside the real job_id, so a single artifact ties author (signed commit
SHA) to submission (IBM job id) -- see WORKFLOWS.md's accountability
section. The submitter identity itself (which Service ID actually
authenticated) is recorded by IBM Cloud Activity Tracker, outside this
repo entirely.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

from payload import load_circuit
from report import circuit_complexity, interpret_execution, write_result
from submit import submit_blocking

QC_PAYLOAD_PATH = os.environ.get("QC_PAYLOAD_PATH", "circuits/hello_noise.qasm")
QC_BACKEND = os.environ.get("QC_BACKEND") or None
QC_INSTANCE = os.environ.get("QC_INSTANCE")
QC_CHANNEL = os.environ.get("QC_CHANNEL", "ibm_quantum_platform")
QC_SHOTS = int(os.environ.get("QC_SHOTS", "4096"))
QC_CORRELATION_THRESHOLD = float(os.environ.get("QC_CORRELATION_THRESHOLD", "0.9"))
QC_JOB_TIMEOUT_SEC = int(os.environ.get("QC_JOB_TIMEOUT_SEC", "1800"))
QC_RESULT_PATH = os.environ.get("QC_RESULT_PATH", "result.json")
QISKIT_IBM_TOKEN = os.environ.get("QISKIT_IBM_TOKEN")

GITHUB_SHA = os.environ.get("GITHUB_SHA")
GITHUB_RUN_ID = os.environ.get("GITHUB_RUN_ID")


def _fail(reason: str) -> int:
    print(f"FAIL: {reason}", file=sys.stderr)
    write_result({
        "mode": "qpu",
        "payload_path": QC_PAYLOAD_PATH,
        "backend_pinned": QC_BACKEND,
        "instance": QC_INSTANCE,
        "passed": False,
        "job_id": None,
        "error": reason,
        "github_sha": GITHUB_SHA,
        "github_run_id": GITHUB_RUN_ID,
        "interpretation": interpret_execution(
            mode="qpu", passed=False, p_correlated=None,
            threshold=QC_CORRELATION_THRESHOLD, complexity=None, error=reason,
        ),
    }, QC_RESULT_PATH)
    return 1


def main() -> int:
    try:
        complexity = circuit_complexity(load_circuit(QC_PAYLOAD_PATH))
    except Exception as e:  # noqa: BLE001 - surface a clean pipeline error
        return _fail(f"{type(e).__name__}: {e}")

    submitted_at = datetime.now(timezone.utc).isoformat()
    try:
        job_id, counts = submit_blocking(
            QC_PAYLOAD_PATH,
            token=QISKIT_IBM_TOKEN,
            instance=QC_INSTANCE,
            channel=QC_CHANNEL,
            backend_name=QC_BACKEND,
            shots=QC_SHOTS,
            timeout_sec=QC_JOB_TIMEOUT_SEC,
        )
    except Exception as e:  # noqa: BLE001 - surface a clean pipeline error
        return _fail(f"{type(e).__name__}: {e}")

    if counts is None:
        # Timed out. The job keeps running on IBM's side -- we do not cancel
        # it -- job_id is preserved here for later (manual, or future async
        # reaper) lookup.
        print(f"TIMEOUT: job {job_id} did not complete within {QC_JOB_TIMEOUT_SEC}s")
        write_result({
            "mode": "qpu",
            "payload_path": QC_PAYLOAD_PATH,
            "backend_pinned": QC_BACKEND,
            "instance": QC_INSTANCE,
            "shots": QC_SHOTS,
            **complexity,
            "job_id": job_id,
            "timed_out": True,
            "passed": False,
            "submitted_at": submitted_at,
            "github_sha": GITHUB_SHA,
            "github_run_id": GITHUB_RUN_ID,
            "interpretation": interpret_execution(
                mode="qpu", passed=False, p_correlated=None,
                threshold=QC_CORRELATION_THRESHOLD, complexity=complexity,
                timed_out=True,
            ),
        }, QC_RESULT_PATH)
        return 1

    total = sum(counts.values())
    p_correlated = (counts.get("00", 0) + counts.get("11", 0)) / total
    passed = p_correlated >= QC_CORRELATION_THRESHOLD

    print(f"backend: {QC_BACKEND or 'least_busy'}, shots: {total}, job_id: {job_id}")
    print(f"counts: {counts}")
    print(f"p(00) + p(11) = {p_correlated:.4f} (threshold {QC_CORRELATION_THRESHOLD})")

    interpretation = interpret_execution(
        mode="qpu",
        passed=passed,
        p_correlated=p_correlated,
        threshold=QC_CORRELATION_THRESHOLD,
        complexity=complexity,
    )
    print(interpretation)

    write_result({
        "mode": "qpu",
        "payload_path": QC_PAYLOAD_PATH,
        "backend_pinned": QC_BACKEND,
        "instance": QC_INSTANCE,
        "shots": total,
        "counts": {k: v for k, v in counts.items()},
        **complexity,
        "p00_plus_p11": p_correlated,
        "threshold": QC_CORRELATION_THRESHOLD,
        "passed": passed,
        "job_id": job_id,
        "timed_out": False,
        "submitted_at": submitted_at,
        "github_sha": GITHUB_SHA,
        "github_run_id": GITHUB_RUN_ID,
        "interpretation": interpretation,
    }, QC_RESULT_PATH)

    if not passed:
        print("FAIL: measured correlation below threshold", file=sys.stderr)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
