"""report.py

Turns a raw pass/fail + correlation number into something a non-expert can
read without extra context -- same motivation as the main app's
src/state.js `classifyState()`: physics math in, a plain-language sentence
out. Exists because "FAIL: measured correlation below threshold" reads as
an alarm regardless of whether it means "the pipeline is broken," "this
device needs attention," or "this circuit is bigger than the toy reference
and some correlation loss here is normal" -- three very different facts
that used to render identically (same word, same red X). See
doc/quantum-pipeline-faq.md for the non-technical version of this same
distinction -- this module exists to point people there before they have
to ask.

Used by validate.py, test_integration.py, and run.py; kept out of those
files because interpretation and step-summary formatting is real, shared
logic worth writing once, not boilerplate worth repeating three times.
"""
from __future__ import annotations

import json
from pathlib import Path

# A circuit at or below this size/depth is "reference scale" -- roughly
# hello_noise's own shape (H + CNOT + measure on 2 qubits). Below this,
# correlation loss is exactly the device-health signal the nightly/run
# checks exist to catch. Above it, some correlation loss is expected
# physics on current hardware, not a red flag by itself -- see
# doc/quantum-pipeline-faq.md.
REFERENCE_MAX_QUBITS = 2
REFERENCE_MAX_DEPTH = 3

FAQ_POINTER = (
    "Confused by this result? See doc/quantum-pipeline-faq.md -- "
    "\"noise\" and \"threshold\" mean something narrower here than they "
    "might in a headline you've read elsewhere."
)


def circuit_complexity(circuit) -> dict:
    """Qubit/clbit/depth/gate-count summary -- the context a bare
    correlation number needs to be read correctly. Computed from the
    logical circuit as loaded, before any ISA conversion (routing/ancilla
    overhead from transpiling to a specific backend isn't what the
    scientist wrote, so it shouldn't be what gets reported as "the
    circuit's" complexity)."""
    return {
        "num_qubits": circuit.num_qubits,
        "num_clbits": circuit.num_clbits,
        "depth": circuit.depth(),
        "gate_count": len(circuit.data),
    }


def is_reference_scale(complexity: dict) -> bool:
    return (
        complexity["num_qubits"] <= REFERENCE_MAX_QUBITS
        and complexity["depth"] <= REFERENCE_MAX_DEPTH
    )


def interpret_validate(*, passed: bool, error: str | None, complexity: dict | None) -> str:
    if not passed:
        return (
            f"Pipeline error, not a device or noise signal: {error}. "
            "Nothing ran on any backend -- this is a payload problem to "
            "fix (bad file, bad circuit), not evidence of hardware trouble."
        )
    return (
        f"Payload loads and transpiles cleanly ({complexity['num_qubits']} "
        f"qubits, depth {complexity['depth']}). Structural check only -- "
        "no hardware, no noise involved."
    )


def interpret_execution(
    *,
    mode: str,
    passed: bool,
    p_correlated: float | None,
    threshold: float,
    complexity: dict | None,
    error: str | None = None,
    timed_out: bool = False,
) -> str:
    """mode is 'simulator' (the nightly device-health check) or 'qpu'
    (a real hardware run)."""
    if error:
        return (
            f"Pipeline error, not a device or noise signal: {error}. "
            "Nothing was measured -- this needs fixing (payload, "
            "credentials, or connectivity), it is not a statement about "
            "device health or noise."
        )
    if timed_out:
        return (
            "The job did not finish within the timeout and is still "
            "running on IBM's side. Not a noise or correlation result -- "
            "a wall-clock issue only; the job ID is preserved to check "
            "later, nothing was cancelled."
        )

    where = (
        "a locally-simulated noise model built from live calibration"
        if mode == "simulator"
        else "real quantum hardware"
    )

    if passed:
        return (
            f"Correlation cleared the floor ({p_correlated:.4f} >= "
            f"{threshold}) on {where}. Routine, healthy result -- nothing "
            "to act on."
        )

    if complexity is not None and is_reference_scale(complexity):
        return (
            f"Correlation ({p_correlated:.4f}) fell below the floor "
            f"({threshold}) on the small reference circuit "
            f"({complexity['num_qubits']} qubits, depth "
            f"{complexity['depth']}) on {where} -- this is the "
            "device-health signal doing its job. Worth a look (device "
            "drift, a connectivity issue), not evidence of anything "
            "broken in the pipeline itself."
        )

    qubit_note = f"{complexity['num_qubits']} qubits, depth {complexity['depth']}" if complexity else "an unknown size"
    return (
        f"Correlation ({p_correlated:.4f}) fell below the floor "
        f"({threshold}) on {where}, on a circuit substantially larger "
        f"than the reference scale ({qubit_note}). Some correlation loss "
        "is EXPECTED at this size on current hardware -- this is not "
        "automatically a regression. Compare against this same circuit's "
        "own past results before treating it as a problem."
    )


def render_step_summary(result: dict) -> str:
    """Markdown for $GITHUB_STEP_SUMMARY -- what someone skims in the
    Actions tab with zero other context. Leads with the plain-language
    interpretation, not the raw numbers; raw numbers and the full JSON
    are still present, just below the fold."""
    mode = result.get("mode", "unknown")
    passed = result.get("passed")
    icon = "✅" if passed else ("⏳" if result.get("timed_out") else "⚠️")

    lines = [
        f"## {icon} Quantum payload result -- mode: `{mode}`",
        "",
        result.get("interpretation", "(no interpretation available)"),
        "",
    ]

    details = []
    if "num_qubits" in result:
        details.append(f"Circuit: {result['num_qubits']} qubits, depth {result.get('depth', '?')}")
    if "p00_plus_p11" in result:
        details.append(f"Correlation: {result['p00_plus_p11']:.4f} (threshold {result.get('threshold')})")
    if result.get("job_id"):
        details.append(f"Job ID: `{result['job_id']}`")
    backend = result.get("backend_label") or result.get("backend_pinned")
    if backend:
        details.append(f"Backend: {backend}")
    for d in details:
        lines.append(f"- {d}")
    if details:
        lines.append("")

    lines.append(f"_{FAQ_POINTER}_")
    lines.append("")
    lines.append(
        "<details><summary>Raw result JSON</summary>\n\n```json\n"
        + json.dumps(result, indent=2)
        + "\n```\n</details>"
    )
    return "\n".join(lines)


def write_result(result: dict, result_path: str) -> None:
    """Writes the machine-readable JSON at result_path, and a
    human-readable markdown summary alongside it (same stem,
    .summary.md) for workflows to feed into $GITHUB_STEP_SUMMARY."""
    path = Path(result_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2))

    summary_path = path.with_suffix(".summary.md")
    summary_path.write_text(render_step_summary(result))
