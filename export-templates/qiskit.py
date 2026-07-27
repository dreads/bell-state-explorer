"""
Bell state circuit, exported from the Bell State Density Matrix Explorer.

Generated:    @@GENERATED_AT@@
App state:    q0=@@Q0_INPUT@@, q1=@@Q1_INPUT@@  ->  @@BELL_LABEL_ASCII@@  (@@BELL_LABEL_KET@@)
              @@BELL_EQUATION@@
Local rotation: Ry(@@ALPHA0_DEG@@ deg) on q0, Ry(@@ALPHA1_DEG@@ deg) on q1

WHAT THIS DOES AND DOES NOT REPRODUCE
--------------------------------------
This file reproduces the IDEAL, UNITARY part of the circuit shown in the app:
state prep (X) + Hadamard + CNOT + Ry(alpha0) (x) Ry(alpha1). It does NOT
reproduce the app's "dephasing" slider. Dephasing in the app is applied as a
direct multiplication of the density matrix's off-diagonal entries by
(1 - p) -- a quantum channel, not a gate -- so there is no unitary you can
drop into this circuit to recreate it. Running this circuit on real hardware
will show SOME decoherence from the device's own physical noise, but that
number is not the app's dephasing value and the two should not be compared
as if they were. See doc/quantum-export-research.md in the source repository
(https://github.com/dreads/bell-state-explorer) for the full reasoning, and
for what a fair simulator/hardware comparison does and doesn't require.

BIT-ORDER WARNING
------------------
Qiskit reports measurement counts as bitstrings ordered c[n-1]...c[1]c[0]
(little-endian: the RIGHTMOST character is qubit/clbit 0). This app's basis
labels ("00", "01", "10", "11") read q0 then q1, LEFT to right. sample_report()
below reverses each bitstring before printing so its output already matches
the app's ordering -- if you write your own reporting code instead, remember
to do the same reversal, or "01" and "10" will silently swap.

REQUIREMENTS
-------------
  pip install qiskit qiskit-aer
  # for real hardware runs:
  pip install qiskit-ibm-runtime
"""

from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Statevector, DensityMatrix
from qiskit_aer import AerSimulator

# --- Values from the app's current state -----------------------------------
Q0_INPUT = @@Q0_INPUT@@        # classical input bit for q0 (H+CNOT control)
Q1_INPUT = @@Q1_INPUT@@        # classical input bit for q1 (H+CNOT target)
ALPHA0_RAD = @@ALPHA0_RAD@@    # local Ry angle on q0, applied after the Bell state, radians
ALPHA1_RAD = @@ALPHA1_RAD@@    # local Ry angle on q1, applied after the Bell state, radians
SHOTS = 4096


def build_circuit():
    """H + CNOT prepares the Bell state selected by Q0_INPUT/Q1_INPUT; the
    two Ry gates are the app's local-rotation sliders, applied afterward."""
    qc = QuantumCircuit(2, 2, name="bell_state")
    if Q0_INPUT:
        qc.x(0)
    if Q1_INPUT:
        qc.x(1)
    qc.h(0)
    qc.cx(0, 1)
    if abs(ALPHA0_RAD) > 1e-10:
        qc.ry(ALPHA0_RAD, 0)
    if abs(ALPHA1_RAD) > 1e-10:
        qc.ry(ALPHA1_RAD, 1)
    return qc


def statevector_report(qc):
    """Noiseless statevector simulation: this should match the app's own
    density matrix exactly (up to global phase, which doesn't affect rho)."""
    sv = Statevector.from_instruction(qc)
    dm = DensityMatrix(sv)
    print("Ideal statevector simulation (noiseless, matches the app's math):")
    print(dm.data.real.round(4))
    print(f"Purity: {dm.purity().real:.4f}")
    return dm


def sampled_report(qc, backend, label):
    """Adds measurement and runs on `backend` (a local simulator or a real
    device). Only the diagonal of the app's density matrix -- the outcome
    probabilities -- is comparable to this output; see the bit-order warning
    above and doc/quantum-export-research.md for why the coherences are not
    recoverable from counts alone."""
    meas = qc.copy()
    meas.measure([0, 1], [0, 1])
    transpiled = transpile(meas, backend)
    result = backend.run(transpiled, shots=SHOTS).result()
    counts = result.get_counts()
    print(f"\nMeasured counts on {label} ({SHOTS} shots):")
    for bitstring, count in sorted(counts.items()):
        app_order = bitstring[::-1]  # little-endian Qiskit -> app's q0-then-q1 order
        print(f"  {app_order}: {count} ({count / SHOTS:.4f})")
    return counts


if __name__ == "__main__":
    circuit = build_circuit()
    print(circuit.draw(output="text"))
    print()

    statevector_report(circuit)
    sampled_report(circuit, AerSimulator(), "AerSimulator (local, noiseless sampling)")

    # To run on real IBM Quantum hardware instead of the local simulator,
    # get a backend from QiskitRuntimeService and pass it to sampled_report:
    #
    #   from qiskit_ibm_runtime import QiskitRuntimeService
    #   service = QiskitRuntimeService()
    #   backend = service.least_busy(operational=True, simulator=False)
    #   sampled_report(circuit, backend, backend.name)
    #
    # Real hardware only returns measurement counts, never a density matrix.
    # Compare its outcome PROBABILITIES to the app's diagonal only; recovering
    # the coherences would require state tomography (see
    # doc/quantum-export-research.md), which this template deliberately does
    # not attempt.
