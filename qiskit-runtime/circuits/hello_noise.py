"""hello_noise.py

Qiskit source-file form of the "hello world" noise-detection payload.
Equivalent to circuits/hello_noise.qasm and circuits/hello_noise.ipynb.

This is one of the three payload formats a data scientist may check in. The
pipeline's loader (payload.py) imports this module and calls build_circuit()
to obtain the circuit, so a scientist who prefers writing Qiskit directly can
do so without touching OpenQASM.

Contract for the .py payload format:
  - The module MUST expose a callable named `build_circuit()` that takes no
    required arguments and returns a qiskit.QuantumCircuit with measurements.
  - The circuit must include classical measurement so the sampler returns
    bitstring counts.

Keep this dependency-free beyond qiskit (no DOM, no I/O, no network) so it is
trivially importable in CI.
"""

from qiskit import QuantumCircuit


def build_circuit() -> QuantumCircuit:
    """Return the 2-qubit Bell 'hello world' noise-detection circuit."""
    qc = QuantumCircuit(2, 2, name="hello_noise")
    qc.h(0)
    qc.cx(0, 1)
    qc.measure(0, 0)
    qc.measure(1, 1)
    return qc


if __name__ == "__main__":
    # Allow a scientist to eyeball the circuit locally: `python hello_noise.py`
    print(build_circuit().draw(output="text"))
