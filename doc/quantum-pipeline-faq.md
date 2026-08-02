# Quantum pipeline FAQ (for anyone who isn't writing the circuits)

Short version: we run a small quantum circuit through automated checks, the
same way we'd run any other CI pipeline. If you landed here because you saw
a word like "noise," "threshold," or "FAIL" somewhere — a GitHub Actions
summary, a Slack message, a hallway conversation — this page exists to
answer the obvious next questions before you have to track someone down to
ask them.

### Does this have anything to do with quantum computers breaking encryption?

No. That's a real, separate, well-covered topic (post-quantum cryptography,
"harvest now, decrypt later") with its own migration timelines driven by
NIST and others. This pipeline doesn't touch cryptography at all — it runs
a physics circuit and checks whether the result looks the way it's supposed
to. Different technology, different conversation.

### I saw "noise" or "correlation below threshold" in a result — is that a security alert?

No. "Noise" here means ordinary physical imperfection in a quantum device —
comparable to static on a phone line, not a security anomaly. "Threshold"
means a specific number we compare a measurement against, nothing more.
Neither word is being used in a security-monitoring sense anywhere in this
pipeline.

If you've also seen headlines about quantum computers achieving
"error correction below threshold" — that's real, separate, genuinely
significant research from groups like Google Quantum AI, about whether a
*logical* qubit built from many physical ones gets *more* reliable as you
add more of them. Our pipeline doesn't do error correction and doesn't
claim to relate to that work — it just happens to reuse the common English
word "threshold" for an unrelated, much simpler comparison. Same word,
unrelated ideas.

### A result said FAIL — is something broken?

Depends which kind, and every result now says which kind in plain language
(look for the "interpretation" line before the raw numbers). There are
three different things that can produce a red result, and they mean very
different things:

1. **Pipeline error.** The circuit file didn't load, credentials didn't
   work, or something disconnected. Nothing about quantum physics ran at
   all. This is an ordinary bug to fix, like any failed CI job.
2. **A drop on our small reference check.** We run a tiny, well-understood
   2-qubit circuit nightly specifically because we know what a healthy
   result looks like. If *that* one drops, it's worth someone looking at —
   possibly the device is having a rough day — but it is not evidence
   anything in our systems is wrong, and it costs nothing to check (see
   below).
3. **A drop on a larger, real circuit.** Bigger, deeper circuits naturally
   produce more noise on today's hardware — that's expected physics, not a
   sign of trouble. A number that would be alarming on the tiny reference
   circuit can be completely normal on a bigger one. This is the case most
   likely to be misread, which is exactly why every result now says which
   of these three categories it falls into instead of just "FAIL."

### How much does this cost, and who signs off on it?

Two different automated checks cost nothing: a branch check that never
touches real hardware, and a nightly check that only reads a device's
public calibration data (no job is ever queued). The only thing that
actually spends money is a real hardware submission after code is merged,
and that requires a named, accountable reviewer to explicitly approve it
first — the credential to spend money is unreachable without that approval.
Separately, a different named reviewer has to approve the circuit change
itself before it can even be merged. Both approvals are permanently
recorded and attributable to a specific person. Full detail:
`qiskit-runtime/WORKFLOWS.md`.

### Where do I go for the actual detail?

- `qiskit-runtime/WORKFLOWS.md` — the technical contract: what runs, when,
  under what credentials, and why.
- `doc/running-quantum-jobs-in-cicd.md` — the longer narrative of how this
  pipeline was built, including the mistakes made along the way.
