// hello_noise.qasm
// OpenQASM 2.0 "hello world" noise-detection circuit.
//
// Purpose: produce a cheap, known signal for pipeline testing. This is NOT a
// physics experiment. It prepares a 2-qubit Bell state (H on q0, CNOT q0->q1),
// then measures. On an ideal simulator the result is ~50% "00" and ~50% "11"
// with essentially no "01"/"10" -- perfect correlation, p(00)+p(11) ~= 1.0.
//
// The point: when this same circuit is run against a noise model built from a
// real backend's live calibration, the correlation degrades. How far it drops
// below 1.0 is the "signal" the pipeline reads as a proxy for device health.
// A collapse toward p(00)+p(11) ~= 0.5 means the entanglement signal did not
// survive the modeled noise (see the nightly-sensor discussion in the paper).
//
// This file is the "payload" a data scientist checks into a branch. The
// pipeline accepts this .qasm, an equivalent .py, or an equivalent .ipynb and
// resolves all three to the same circuit before running.
//
// Same canonical Phi+ Bell circuit (H on q0, CNOT q0->q1, no input-bit state
// prep) this pipeline's own device-health check runs -- same gates, same
// qubit order, same register names. One known-good signal, not two.

OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0], q[1];

measure q[0] -> c[0];
measure q[1] -> c[1];
