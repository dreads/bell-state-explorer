OPENQASM 3;
include "stdgates.inc";

// Bell state circuit, exported from the Bell State Density Matrix Explorer.
//
// Generated:       @@GENERATED_AT@@
// App state:       q0=@@Q0_INPUT@@, q1=@@Q1_INPUT@@  ->  @@BELL_LABEL_ASCII@@
//                  @@BELL_EQUATION@@
// Local rotation:  Ry(@@ALPHA0_DEG@@ deg) on q0, Ry(@@ALPHA1_DEG@@ deg) on q1
//
// Vendor-neutral form of the same ideal circuit as qiskit.py in this same
// export-templates/ directory: any provider whose toolchain imports OpenQASM
// 3 gate-model circuits can run this directly. As with the Qiskit export,
// this reproduces the IDEAL, UNITARY circuit only -- the app's "dephasing"
// slider is a density-matrix channel with no gate equivalent and is
// intentionally not reproduced here. Real-device counts only tell you the
// outcome PROBABILITIES (this circuit's measured diagonal), not the
// coherences -- recovering those needs state tomography, and real device
// noise is not interchangeable with the app's dephasing value. See
// doc/quantum-export-research.md in the source repository
// (https://github.com/dreads/bell-state-explorer) for the full reasoning.
//
// BIT-ORDER WARNING: most OpenQASM 3 runtimes report the classical register
// `c` back in the same little-endian convention as Qiskit -- c[1]c[0], i.e.
// the RIGHTMOST character of a printed bitstring is qubit 0. This app's
// basis labels ("00", "01", "10", "11") read q0 then q1, left to right.
// Reverse a returned bitstring before comparing it to the app's outcome
// labels.

qubit[2] q;
bit[2] c;

// State prep: sets the starting computational basis state to |q0 q1>, which
// H + CNOT below turns into the Bell state named above. A line is commented
// out (rather than omitted) when its input bit is 0, so the file always
// shows the full circuit shape regardless of which Bell state was exported.
@@X0_LINE@@
@@X1_LINE@@
h q[0];
cx q[0], q[1];

// Local rotation, applied after Bell-state preparation. An angle of 0 is a
// harmless identity operation, so both lines are always emitted.
ry(@@ALPHA0_RAD@@) q[0];
ry(@@ALPHA1_RAD@@) q[1];

c[0] = measure q[0];
c[1] = measure q[1];
