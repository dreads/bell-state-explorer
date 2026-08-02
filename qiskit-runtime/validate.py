"""validate.py

Branch-validation entrypoint. No network, no hardware: loads the payload,
confirms it transpiles to a generic ISA target, and confirms it has
qubits/clbits. This is the cheap check that runs on every branch push and PR
-- see WORKFLOWS.md for the black-box env-var contract this and its siblings
(test_integration.py, run.py) all honor.

The transpile check here is a *local*, cheap sanity check only -- Qiskit's
own local pass manager against a generic AerSimulator target, catching
"this circuit uses gates no real device could ever support" before anything
expensive. It is deliberately not the same mechanism as the real hardware
path: run.py converts to a specific backend's ISA via IBM's cloud-hosted
Qiskit Transpiler Service (see submit.py), which needs credentials and
network that this check -- run on every PR, including forks -- must not
require.

Malformed payloads (bad QASM, missing build_circuit, untagged/duplicately-
tagged notebook, no measurements) are caught here via PayloadError -- raised
by payload.load_circuit() itself -- and reported as a clean non-zero exit,
not a stack trace mid-pipeline.
"""
from __future__ import annotations

import os
import sys

from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_aer import AerSimulator

from payload import PayloadError, load_circuit
from report import circuit_complexity, interpret_validate, write_result

QC_PAYLOAD_PATH = os.environ.get("QC_PAYLOAD_PATH", "circuits/hello_noise.qasm")
QC_RESULT_PATH = os.environ.get("QC_RESULT_PATH", "result.json")


def _fail(reason: str) -> int:
    print(f"FAIL: {reason}", file=sys.stderr)
    write_result({
        "mode": "validate",
        "payload_path": QC_PAYLOAD_PATH,
        "passed": False,
        "error": reason,
        "interpretation": interpret_validate(passed=False, error=reason, complexity=None),
    }, QC_RESULT_PATH)
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
    # test_integration.py against a real backend's noise model, and in
    # run.py via IBM's cloud transpiler service).
    try:
        pm = generate_preset_pass_manager(optimization_level=1, backend=AerSimulator())
        pm.run(circuit)
    except Exception as e:  # noqa: BLE001 - surface a clean pipeline error
        return _fail(f"circuit does not transpile: {e}")

    complexity = circuit_complexity(circuit)
    print(
        f"PASS: {QC_PAYLOAD_PATH} loads and transpiles "
        f"({complexity['num_qubits']} qubits, depth {complexity['depth']})"
    )
    write_result({
        "mode": "validate",
        "payload_path": QC_PAYLOAD_PATH,
        "passed": True,
        **complexity,
        "interpretation": interpret_validate(passed=True, error=None, complexity=complexity),
    }, QC_RESULT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
