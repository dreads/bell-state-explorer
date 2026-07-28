"""Integration/smoke test for the Phi+ Bell-state circuit via Qiskit Runtime.

Mode (plain local AerSimulator vs. a local AerSimulator seeded with a real
IBM backend's noise snapshot, after a genuine IBM Cloud auth round-trip) is
decided by run_circuit.select_backend() based on QISKIT_IBM_TOKEN -- see
that module's docstring. This lets the same test run as a zero-secret
pull_request check and as the scheduled cloud integration test; only the
environment differs.

Plain assert + sys.exit, no test framework -- mirrors this repo's own
"Node's built-in assert, no test framework" convention (see CLAUDE.md's
Code conventions section) rather than adding pytest as a dependency for a
single test.
"""
import sys

from run_circuit import CORRELATED_THRESHOLD, run_bell_state


def main():
    summary = run_bell_state()
    print(f"backend: {summary['backend']}, shots: {summary['shots']}")
    print(f"counts: {summary['counts']}")
    print(
        f"p(00) + p(11) = {summary['p_correlated']:.4f} "
        f"(threshold {CORRELATED_THRESHOLD})"
    )

    if summary["p_correlated"] < CORRELATED_THRESHOLD:
        print("FAIL: measured correlation below threshold", file=sys.stderr)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
