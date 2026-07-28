OPENQASM 2.0;
include "qelib1.inc";

// Bell state circuit, exported from the Bell State Density Matrix Explorer.
//
// Generated:       @@GENERATED_AT@@
// App state:       q0=@@Q0_INPUT@@, q1=@@Q1_INPUT@@  ->  @@BELL_LABEL_ASCII@@
//                  @@BELL_EQUATION@@
// Local rotation:  Ry(@@ALPHA0_DEG@@ deg) on q0, Ry(@@ALPHA1_DEG@@ deg) on q1
//
// Vendor-neutral form of the same ideal circuit as qiskit.py in this same
// export-templates/ directory: OpenQASM 2.0 (not 3 -- OpenQASM 3 import is
// still inconsistently supported across vendor tooling; IBM Quantum
// Composer in particular has thrown parse errors on it in practice) is the
// long-established interchange format nearly every gate-model provider's
// toolchain accepts directly. As with the Qiskit export, this reproduces
// the IDEAL, UNITARY circuit only -- the app's "dephasing" slider is a
// density-matrix channel with no gate equivalent and is intentionally not
// reproduced here. Real-device counts only tell you the outcome
// PROBABILITIES (this circuit's measured diagonal), not the coherences --
// recovering those needs state tomography, and real device noise is not
// interchangeable with the app's dephasing value. See
// doc/quantum-export-research.md in the source repository
// (https://github.com/dreads/bell-state-explorer) for the full reasoning.
//
// BIT-ORDER WARNING: Qiskit and most OpenQASM 2.0 toolchains report the
// classical register `c` back little-endian -- c[1]c[0], i.e. the
// RIGHTMOST character of a printed bitstring is qubit 0. This app's basis
// labels ("00", "01", "10", "11") read q0 then q1, left to right. Reverse
// a returned bitstring before comparing it to the app's outcome labels.

qreg q[2];
creg c[2];

// State prep: sets the starting computational basis state to |q0 q1>, which
// H + CNOT below turns into the Bell state named above. A line is commented
// out (rather than omitted) when its input bit is 0, so the file always
// shows the full circuit shape regardless of which Bell state was exported.
@@X0_LINE@@
@@X1_LINE@@
h q[0];
cx q[0],q[1];

// Local rotation, applied after Bell-state preparation. An angle of 0 is a
// harmless identity operation, so both lines are always emitted. ry() is
// defined in qelib1.inc, included above.
ry(@@ALPHA0_RAD@@) q[0];
ry(@@ALPHA1_RAD@@) q[1];

measure q[0] -> c[0];
measure q[1] -> c[1];
