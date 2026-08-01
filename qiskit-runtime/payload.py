"""payload.py

Resolve a data scientist's checked-in payload to a qiskit.QuantumCircuit,
regardless of which of the three accepted formats they used:

  .qasm   OpenQASM 2.0 source        -> parsed with QuantumCircuit.from_qasm_file
  .py     Qiskit source module       -> import, call build_circuit()
  .ipynb  Jupyter notebook           -> extract the cell tagged "circuit",
                                        exec it, call build_circuit()

Everything downstream (validate.py, test_integration.py, run.py) depends ONLY
on the QuantumCircuit this returns. Nothing downstream knows or cares which
format the payload was in. That is the whole point: the scientist picks the
authoring format; the pipeline is format-agnostic.

Security note: for .py and .ipynb we execute scientist-authored code. That is
inherent to accepting those formats and is acceptable here because the payload
lives in the repo under signed commits and code review (see the accountability
model in the paper). For .ipynb we execute ONLY the single cell tagged
"circuit", never the whole notebook, which bounds what runs to the one cell
that is under contract. We never fetch or execute anything off-disk.
"""

from __future__ import annotations

import json
import importlib.util
from pathlib import Path

from qiskit import QuantumCircuit

CIRCUIT_CELL_TAG = "circuit"
BUILDER_NAME = "build_circuit"


class PayloadError(ValueError):
    """Raised when a payload cannot be resolved to a circuit."""


def load_circuit(path: str | Path) -> QuantumCircuit:
    """Resolve a payload file to a QuantumCircuit by dispatching on extension."""
    p = Path(path)
    if not p.exists():
        raise PayloadError(f"payload not found: {p}")

    suffix = p.suffix.lower()
    if suffix == ".qasm":
        qc = _from_qasm(p)
    elif suffix == ".py":
        qc = _from_py(p)
    elif suffix == ".ipynb":
        qc = _from_ipynb(p)
    else:
        raise PayloadError(
            f"unsupported payload type '{suffix}' (expected .qasm, .py, or .ipynb)"
        )

    _require_measurements(qc, p)
    return qc


# --- format handlers --------------------------------------------------------

def _from_qasm(p: Path) -> QuantumCircuit:
    try:
        return QuantumCircuit.from_qasm_file(str(p))
    except Exception as e:  # noqa: BLE001 - surface a clean pipeline error
        raise PayloadError(f"failed to parse OpenQASM 2.0 payload {p}: {e}") from e


def _from_py(p: Path) -> QuantumCircuit:
    spec = importlib.util.spec_from_file_location("payload_module", str(p))
    if spec is None or spec.loader is None:
        raise PayloadError(f"could not load python payload {p}")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as e:  # noqa: BLE001
        raise PayloadError(f"error importing python payload {p}: {e}") from e
    return _call_builder(getattr(module, BUILDER_NAME, None), p)


def _from_ipynb(p: Path) -> QuantumCircuit:
    try:
        nb = json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001
        raise PayloadError(f"could not read notebook payload {p}: {e}") from e

    tagged = [
        cell
        for cell in nb.get("cells", [])
        if cell.get("cell_type") == "code"
        and CIRCUIT_CELL_TAG in cell.get("metadata", {}).get("tags", [])
    ]
    if len(tagged) == 0:
        raise PayloadError(
            f"notebook {p} has no code cell tagged '{CIRCUIT_CELL_TAG}'"
        )
    if len(tagged) > 1:
        raise PayloadError(
            f"notebook {p} has {len(tagged)} cells tagged "
            f"'{CIRCUIT_CELL_TAG}'; expected exactly 1"
        )

    source = tagged[0].get("source", [])
    code = "".join(source) if isinstance(source, list) else str(source)

    namespace: dict = {}
    try:
        exec(compile(code, f"{p}::circuit-cell", "exec"), namespace)  # noqa: S102
    except Exception as e:  # noqa: BLE001
        raise PayloadError(f"error executing tagged cell in {p}: {e}") from e
    return _call_builder(namespace.get(BUILDER_NAME), p)


# --- helpers ----------------------------------------------------------------

def _call_builder(builder, p: Path) -> QuantumCircuit:
    if builder is None or not callable(builder):
        raise PayloadError(
            f"payload {p} must define a callable '{BUILDER_NAME}()'"
        )
    qc = builder()
    if not isinstance(qc, QuantumCircuit):
        raise PayloadError(
            f"'{BUILDER_NAME}()' in {p} returned {type(qc).__name__}, "
            f"expected QuantumCircuit"
        )
    return qc


def _require_measurements(qc: QuantumCircuit, p: Path) -> None:
    has_measure = any(instr.operation.name == "measure" for instr in qc.data)
    if not has_measure:
        raise PayloadError(
            f"circuit from {p} has no measurements; the sampler needs "
            f"classical readout to return counts"
        )


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("usage: python payload.py <path-to-payload>")
        raise SystemExit(2)
    circuit = load_circuit(sys.argv[1])
    print(f"loaded circuit '{circuit.name}': "
          f"{circuit.num_qubits} qubits, {circuit.num_clbits} clbits, "
          f"{len(circuit.data)} instructions")
    print(circuit.draw(output="text"))
