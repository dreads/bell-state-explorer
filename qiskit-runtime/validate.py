"""validate.py

Branch-validation entrypoint. No network, no hardware: loads the payload,
confirms it transpiles to a generic ISA target, and confirms it has
qubits/clbits. This is the cheap check that runs on every branch push and PR
-- see WORKFLOWS.md for the black-box env-var contract this and its siblings
(test_integration.py, run.py) all honor.

Malformed payloads (bad QASM, missing build_circuit, untagged/duplicately-
tagged notebook, no measurements) are caught here via PayloadError -- raised
by payload.load_circuit() itself -- and reported as a clean non-zero exit,
not a stack trace mid-pipeline.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_aer import AerSimulator

from payload import PayloadError, load_circuit

QC_PAYLOAD_PATH = os.environ.get("QC_PAYLOAD_PATH", "circuits/hello_noise.qasm")
QC_RESULT_PATH = os.environ.get("QC_RESULT_PATH", "result.json")


def _write_result(result: dict) -> None:
    path = Path(QC_RESULT_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2))


def _fail(reason: str) -> int:
    print(f"FAIL: {reason}", file=sys.stderr)
    _write_result({
        "mode": "validate",
        "payload_path": QC_PAYLOAD_PATH,
        "passed": False,
        "error": reason,
    })
    return 1


def main() -> int:
    try:
        circuit = load_circuit(QC_PAYLOAD_PATH)
    except PayloadError as e:
        return _fail(str(e))

    if circuit.num_qubits == 0 or circuit.num_clbits == 0:
        return _fail("circuit has no qubits/clbits")

    # No real hardware/network here -- transpiling against a local
    # AerSimulator's generic target only confirms the circuit is
    # ISA-transpilable at all. It is a structural check, not a stand-in for
    # the real device's instruction set (that happens for real in
    # test_integration.py / run.py, against a real backend).
    try:
        pm = generate_preset_pass_manager(optimization_level=1, backend=AerSimulator())
        pm.run(circuit)
    except Exception as e:  # noqa: BLE001 - surface a clean pipeline error
        return _fail(f"circuit does not transpile: {e}")

    print(
        f"PASS: {QC_PAYLOAD_PATH} loads and transpiles "
        f"({circuit.num_qubits} qubits, {circuit.num_clbits} clbits)"
    )
    _write_result({
        "mode": "validate",
        "payload_path": QC_PAYLOAD_PATH,
        "num_qubits": circuit.num_qubits,
        "num_clbits": circuit.num_clbits,
        "passed": True,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
