"""run.py

The real hardware path (qpu mode), run on merge to main after the prod
environment's required-reviewer approval (see run-on-merge.yml). Thin
wrapper over submit.py: owns the env contract and the result JSON, but does
not duplicate backend resolution or PUB-building -- those stay in
submit.py's build_pub()/submit_blocking() so the async upgrade path
(documented in WORKFLOWS.md, not built yet) can reuse them unchanged.

Accountability: the result JSON carries $GITHUB_SHA and $GITHUB_RUN_ID
alongside the real job_id, so a single artifact ties author (signed commit
SHA) to submission (IBM job id) -- see WORKFLOWS.md's accountability
section. The submitter identity itself (which Service ID actually
authenticated) is recorded by IBM Cloud Activity Tracker, outside this
repo entirely.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

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


def _write_result(result: dict) -> None:
    path = Path(QC_RESULT_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2))


def main() -> int:
    submitted_at = datetime.now(timezone.utc).isoformat()
    job_id, counts = submit_blocking(
        QC_PAYLOAD_PATH,
        token=QISKIT_IBM_TOKEN,
        instance=QC_INSTANCE,
        channel=QC_CHANNEL,
        backend_name=QC_BACKEND,
        shots=QC_SHOTS,
        timeout_sec=QC_JOB_TIMEOUT_SEC,
    )

    if counts is None:
        # Timed out. The job keeps running on IBM's side -- we do not cancel
        # it -- job_id is preserved here for later (manual, or future async
        # reaper) lookup.
        print(f"TIMEOUT: job {job_id} did not complete within {QC_JOB_TIMEOUT_SEC}s")
        _write_result({
            "mode": "qpu",
            "payload_path": QC_PAYLOAD_PATH,
            "backend_pinned": QC_BACKEND,
            "instance": QC_INSTANCE,
            "shots": QC_SHOTS,
            "job_id": job_id,
            "timed_out": True,
            "passed": False,
            "submitted_at": submitted_at,
            "github_sha": GITHUB_SHA,
            "github_run_id": GITHUB_RUN_ID,
        })
        return 1

    total = sum(counts.values())
    p_correlated = (counts.get("00", 0) + counts.get("11", 0)) / total
    passed = p_correlated >= QC_CORRELATION_THRESHOLD

    print(f"backend: {QC_BACKEND or 'least_busy'}, shots: {total}, job_id: {job_id}")
    print(f"counts: {counts}")
    print(f"p(00) + p(11) = {p_correlated:.4f} (threshold {QC_CORRELATION_THRESHOLD})")

    _write_result({
        "mode": "qpu",
        "payload_path": QC_PAYLOAD_PATH,
        "backend_pinned": QC_BACKEND,
        "instance": QC_INSTANCE,
        "shots": total,
        "counts": {k: v for k, v in counts.items()},
        "p00_plus_p11": p_correlated,
        "threshold": QC_CORRELATION_THRESHOLD,
        "passed": passed,
        "job_id": job_id,
        "timed_out": False,
        "submitted_at": submitted_at,
        "github_sha": GITHUB_SHA,
        "github_run_id": GITHUB_RUN_ID,
    })

    if not passed:
        print("FAIL: measured correlation below threshold", file=sys.stderr)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
