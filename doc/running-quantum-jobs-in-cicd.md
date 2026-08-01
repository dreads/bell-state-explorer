# Running quantum jobs through CI/CD, as a newcomer

*A working journal of wiring a Qiskit circuit into GitHub Actions on IBM Cloud — written by someone who knows CI/CD and is learning quantum as they go. I am not a physicist. Where I say something a physicist would wince at, please tell me; I have left questions in the margins on purpose.*

---

## The situation

A data scientist on our team wrote a quantum circuit. They want it run on real quantum hardware. Nobody else here knows anything about quantum computing. We trust the person who wrote it — mostly, in the way you trust a colleague whose work you cannot personally check.

What we *do* know is CI/CD. We know GitHub Actions. We know branches, pull requests, reviews, merges, secrets, and cron. So the question I set out to answer was narrow and practical: **how do you take an opaque circuit from a colleague and get it onto a quantum computer safely, using the delivery machinery we already trust for everything else?**

This is that story, roughly in the order it actually happened. It is deliberately a beginner's account. The circuit itself — a Bell state, two qubits, a Hadamard and a CNOT — is almost the simplest interesting thing you can run, and that is the point. The circuit is a placeholder for "some quantum thing we don't understand." The interesting part is the pipeline around it.

The scientist checks a circuit into a branch. We want it validated. When the branch is approved and merged, we want the job to run. Later we discover that running during business hours costs too much, so we add a nightly job. Simple to state. Each step taught me something I did not expect.

> **A note on what "we trust him, kinda" really means.** That phrase carried more weight than I first gave it. It does not mean "run whatever he writes." It means the trust has to be *named and attributable* rather than ambient — every circuit change, every approval, every submission tied to a specific identity in a durable record. Most of the second half of this document is about that.

---

## Part 1 — Validate the circuit on a branch

The first job is the one everyone reaches for: run something on every push to a branch so a bad change gets caught before review. In normal software this is a test suite. What is the equivalent for a quantum circuit?

My first instinct was wrong. I assumed "validate the circuit" meant "run it on the quantum computer and check the answer." That is expensive, slow, and — I learned — usually unnecessary for catching the things that actually break. You do not need real hardware to catch a malformed circuit, a transpilation failure, or a circuit that has drifted from what it is supposed to compute.

### What the scientist actually checks in

Before the validation itself, I had to decide what the payload even *is* — what file the scientist commits to the branch. This mattered more than I expected, because the people who write circuits do not all work the same way. Some think in Qiskit and want to write Python. Some have an OpenQASM file exported from somewhere else. Some live in a notebook and would rather hand me that.

Rather than force one format, the pipeline accepts three, and treats them as interchangeable:

- **An OpenQASM 2.0 file** (`.qasm`) — the circuit as portable assembly-like source.
- **A Qiskit source file** (`.py`) — a small module exposing a function that returns the circuit.
- **A Jupyter notebook** (`.ipynb`) — with one code cell tagged as the circuit; the rest of the notebook is scratch and is ignored.

A small loader resolves whichever of the three the scientist committed into the same in-memory circuit object, and *everything downstream depends only on that object.* The validation job, the nightly job, and the hardware-submission job never know or care which format was used. This is the same insulation principle as the Make boundary I describe below: the authoring format is the scientist's concern, not the pipeline's. I validated that all three formats produce a structurally identical circuit and — importantly — an identical thing to submit, so the choice of format genuinely does not change what runs.

One deliberate detail on the notebook path, because it has a sharp edge. Accepting a `.py` or `.ipynb` means the pipeline runs code the scientist wrote. For the notebook I resolve this by executing *only* the single cell tagged as the circuit, never the whole notebook — so exploratory cells, half-finished experiments, and stray imports never run in CI. That this is safe at all rests on the accountability model in Part 5: the payload lives in the repo under signed commits and review, so "we run their code" is bounded by "their code is named, attributable, and reviewed before it can run."

So the branch-validation job does **not** touch a real quantum processor. It does three cheaper things:

1. **Structural checks.** Does the circuit build? Does it transpile to the instruction set the target hardware actually supports (an "ISA circuit," in Qiskit's language)? A circuit can be perfectly valid abstractly and still use gates a given device cannot execute — transpilation is where that surfaces. This is also where a malformed payload — broken OpenQASM, a notebook with no tagged circuit cell, a circuit with no measurements — fails early and cleanly, before anything expensive.
2. **Local simulation.** Run the circuit on a local statevector or noise-model simulator and check the output distribution is what we expect. For a Bell state, the expected result is roughly half `00` and half `11`, and essentially no `01` or `10`. That correlation is the fingerprint of the circuit doing its job.
3. **A correlation assertion.** Reduce the whole thing to one pass/fail number. For our Bell circuit I use `p(00) + p(11)` and assert it exceeds a threshold. A healthy Bell state pushes that number toward 1.0. A broken circuit — or a noisy simulation — collapses it toward 0.5, which is what you get from four equally likely outcomes, i.e. no entanglement signal at all.

That last number turned out to be the single most useful thing in the whole pipeline, and I did not anticipate it in advance. More on that in Part 4.

### The DevOps concern: I should not have to understand the physics to run the pipeline

Here is a real constraint I hit immediately. The scientist's code is driven by a `Makefile`. I did not choose Make; it was already there, and rewriting someone else's build because I personally dislike it is not my call. But I also do not want the CI configuration to depend on the internals of that Makefile. The moment my workflow YAML has to know *how* the circuit is built, I have coupled the delivery pipeline to physics code I cannot maintain.

So I drew a hard line — a contract — between the two roles:

- **The DevOps side (me) passes inputs in.** Backend name, threshold, shot count, instance, channel, and execution mode go in as environment variables and workflow inputs. Nothing else.
- **The quantum side (the scientist's code, behind Make) passes one clean signal out.** An exit code for pass/fail, plus a machine-readable result file — a small JSON blob with the measured numbers — written to a known path. My workflow reads *that*, not scraped log text.

If the existing implementation cannot honor that contract, we change the implementation to fit the contract, rather than letting Make's shape leak into the workflow. The person writing CI never edits a Makefile, and the person writing circuits never edits YAML. That boundary held up through everything that followed, and I would now call it the most important early decision.

> **Margin question.** Is a single scalar (`p(00) + p(11)`) too crude a gate for circuits more complex than a Bell state? For richer circuits I assume you would assert against expectation values of specific observables instead. I would genuinely like to hear how people gate correctness for circuits where "the expected distribution" is not obvious by inspection.

---

## Part 2 — Run the job on merge (this is the part that spends money)

When the branch is approved and merged to `main`, the scientist wants the job to actually run — on real quantum hardware this time. This is the heart of the whole exercise, because this is the step where an opaque circuit, written by someone whose work we cannot check, executes against a paid resource on infrastructure we do not own.

I want to be honest that this is where I felt least comfortable, and where I think the interesting governance questions live.

### What actually gets submitted (and what does not)

I had a wrong mental model going in, and I want to correct it here because I suspect others share it. I assumed that "running the job on hardware" meant *uploading* the circuit — the notebook, or the script — to IBM, where it would live as some named program I could invoke by ID. That is not how it works, and it used to be closer to how it worked, which is exactly why the confusion is easy.

IBM did once have a model where you uploaded a program, got back a program ID, and invoked it later by that ID. That model is deprecated and gone. It was also never generally available — it was gated to certain plan tiers. It has been replaced by a different approach: you do not upload a program at all. You take your circuit, compile it locally to the target device's instruction set, and submit *the compiled circuit itself* to one of IBM's predefined execution primitives. There is no persistent server-side program of yours living in the cloud.

The practical consequence for the pipeline is clarifying, and it changed how I think about where the "program" even lives:

- **The payload file is a repository artifact, not a cloud upload.** The `.qasm`/`.py`/`.ipynb` the scientist committed never goes to IBM. It lives in Git, under version control and review. That file *is* the durable program — and it is more durable than a program ID would be, because a program ID can be deprecated out from under you, which is precisely what happened to the old model.
- **What crosses the wire is the compiled circuit.** The pipeline resolves the payload to a circuit locally, compiles it to the device's instruction set locally, and sends that circuit as the unit of work. The notebook is an authoring format; the compiled circuit is the wire format. "Save a notebook and submit it" really means: notebook in Git, pipeline extracts and compiles the circuit, the circuit is submitted.
- **The persistent handles on IBM's side are the instance and the job ID.** Not a program. The instance (identified by a cloud resource name) is the execution context your credentials point at; each submission produces a job ID that persists as the record of that run. Those are the durable cloud-side things, and they are what the accountability trail in Part 5 hangs on.

I am spelling this out because if you come to this expecting to "deploy your quantum program" the way you deploy a service, you will look for an upload step that no longer exists and lose time discovering it is gone. The circuit is the artifact; your repo is where it lives; the job ID is the receipt.

### Blocking first, because it is simpler and correct

There are two broad ways to run a job that takes real wall-clock time in CI:

- **Blocking (synchronous):** submit the job, then hold the workflow open and poll until it finishes, with a timeout. The run's success or failure *is* the job's success or failure. Simple to reason about. The cost is a workflow that sits and waits, consuming a runner minute-for-minute while the job sits in a queue.
- **Asynchronous:** submit the job, record its ID, and let the workflow exit immediately. A separate process — another workflow, a scheduled reaper, a webhook consumer — collects the result later. More moving parts, but the runner is not held hostage to queue time.

For one circuit, on merge, I built **blocking**, and I would defend that choice for anyone at this stage. Qiskit Runtime hands you a job object when you submit through the Sampler primitive; you poll it to completion and read the result. The whole thing fits in a single workflow step with a timeout guard. It is the naive choice and it is also the right one until volume forces the issue. Complexity you do not yet need is complexity working against you.

### When blocking stops being the answer

Blocking breaks down along predictable lines, and it is worth naming them so you can see the wall before you hit it:

- **Queue time dominates.** If jobs routinely sit in a device queue for a long time, you are paying for idle runner minutes to watch a spinner. That is the first real pressure toward async.
- **Volume grows.** One circuit blocking is fine. Fifty circuits each blocking a runner is a self-inflicted outage.
- **The job outlives the runner.** GitHub-hosted runners have time limits. A job that could exceed them cannot be run to completion in a single blocking step — full stop.

The asynchronous upgrade path, when you get there, has a recognizable shape: the submit step writes the job ID to durable storage and exits. A decoupled workflow — triggered on a schedule, or by a callback — reaps finished jobs, records results, and reports. When submission volume gets high enough that you need backpressure and retries, a **message queue** is the natural seam: submissions become messages, a worker pool drains them at whatever rate the hardware and your budget allow, and results flow back onto another queue. You could equally reach for a durable workflow engine or the provider's own job-tracking as the backbone; a queue is the classic choice, not the only one.

I did **not** build the async path for this first version, on purpose. But I designed the boundary so it drops in later without reshaping everything: because the submit step already produces a job ID and a result file rather than assuming it can see the answer synchronously, moving the "read the answer" half into a separate workflow is an extension, not a rewrite. If I had baked "submit and read in one breath" into the core, I would be rewriting instead of extending. (Handoff note: the companion build spec specifies blocking as the target and async as a documented, ready-to-implement next step — not something to build blindly on day one.)

> **Margin question.** For teams already running quantum workloads at scale — what actually pushed you off blocking, and what did you reach for? I am guessing queue time, not runner limits, is the usual trigger, but I would like to know if that intuition is wrong.

---

## Part 3 — The configuration model: two axes people keep collapsing

Once real hardware and real money entered the picture, I had to decide how environments, credentials, and "simulator vs. real hardware" relate. I got this wrong in my head at first, and untangling it was probably the most useful conceptual moment in the project — so I want to lay out the mistake, not just the answer.

### The mistake: binding "simulator-ness" to the environment

The obvious design is: *dev runs on a simulator, prod runs on real hardware.* Environment name decides everything. It is clean until it is not.

The problem is that this collapses two genuinely independent things:

- **Where the work runs** — a local simulator, or a real quantum processor.
- **Which credentials and quota it runs under** — a free/open plan with no real spend, or a paid instance with real money and real audit weight behind it.

Environment (dev/test/prod) is really a proxy for the *second* axis — who is allowed to spend, and how much. It is not fundamentally about simulator-vs-hardware. The moment you hardcode "dev means simulator" into the environment's identity, the first person who wants a real-hardware smoke test from a non-prod environment — which they will want, right before an expensive prod run — is fighting the abstraction.

### The fix: environment carries identity and permission; a separate switch carries sim-vs-hardware

The cleaner model keeps the axes apart:

- **Environment** carries *credentials and approval gates*. Who can spend, and what has to happen before they can.
- **A separate execution-target setting** carries *simulator vs. real hardware*. Its default is set per environment — dev defaults to simulator, prod defaults to hardware — but it is an overridable default, not an identity.
- **Backend name** is its own independent input. Even simulator mode needs to know *which device's calibration* to model; hardware mode needs to know *which device* to pin, or whether to fall back to "least busy." Orthogonal to both of the above.

The truth table that falls out:

| Environment | Default execution target | Credential | Approval gate | What actually happens |
|---|---|---|---|---|
| dev | simulator | free / open instance | none | Local noise-model simulation from the named backend's live calibration; zero hardware spend |
| dev (overridden) | hardware | free / open instance | none | Real submission, but on the low- or no-cost instance — bounded blast radius |
| prod | hardware | paid instance | required reviewers | Real job on pinned hardware, after a human approves the spend |

The reason I now prefer this over the simpler "one credential, gate on branch name" approach comes straight back to "we trust him, kinda." With a single credential and no environment gate, the only thing between a merged pull request and real spend is application logic *I* would have to write and maintain — a check that refuses to submit unless it is running on `main`. With two GitHub Environments, the spend gate is platform-native: the paid credential is simply unreachable without passing an approval, and there is no bypass in my code to get wrong. For a team that openly admits it does not understand what is being run, moving the safety boundary *out* of code the newcomers are writing and *into* the platform's permission model is the more defensible design. That is the whole argument in one sentence.

### Why two credential pairs, specifically

This is where it stops being about spend and starts being about accountability, which deserves its own section. The short version: dev and prod each get their *own* token-and-instance pair, backed by distinct identities on the provider side — not two differently-named secrets sharing one underlying identity. The reason is in Part 5.

> **Margin question.** Does a `test`/`staging` environment that runs on *real* hardware, cheaply, with no approval — a pre-prod hardware rehearsal — earn its place immediately, or is it premature? I left it out of the first version and treated it as a documented future seam, because a three-way split of hardware environments felt like more than this stage needs. I am not certain that is right.

---

## Part 4 — The nightly job, and the night it turned red

Running during business hours costs too much — both in money and in contention with whatever else wants the hardware during peak times. So the plan was ordinary: add a `schedule:` trigger, run the job overnight when demand and cost are lower. In CI/CD terms this is the most boring thing imaginable. A cron line. I have written a hundred of them.

Then the nightly run went red, and it taught me the single most interesting thing in this entire project.

### What the failure looked like

The job failed in well under a minute. Here is the shape of what came back:

```
qiskit_runtime_service._discover_account: WARNING: Loading account with the given token. A saved account will not be used.
FAIL: measured correlation below threshold
backend: aer-noise[ibm_marrakesh] (cloud connection verified, 1 recent job(s) visible), shots: 4096
counts: {'11': 978, '10': 1024, '00': 1051, '01': 1043}
p(00) + p(11) = 0.4954 (threshold 0.9)
```

Read that carefully, because the details rewrote my understanding of what the job was even doing.

First: `aer-noise[ibm_marrakesh]`. This run was **not** executing on the physical processor. It was running locally on a simulator, using a **noise model derived from `ibm_marrakesh`'s live calibration data.** The pipeline authenticated, confirmed the cloud connection was live (it even reports a recent job as visible), pulled the device's current calibration, built a simulated model of how noisy that device is *right now*, and ran the Bell circuit against that model.

Second: the counts are almost perfectly uniform — roughly a quarter each across `00`, `01`, `10`, `11`. So `p(00) + p(11)` came out to `0.4954`, against a threshold of `0.9`. The entanglement signal was gone. Not degraded — gone. The simulated correlation had collapsed to what four-way-random noise looks like.

Third, and this is the part I keep turning over: **the failure was surfaced by connecting and pulling calibration, not by running on the quantum computer.** It cost essentially nothing in hardware time. We learned the device was in a bad state without spending a cent of quota to find out.

### Why it happened — the maintenance window

The cause, once I dug in, was mundane and specific: **the device was mid-recalibration.** The Heron-generation processors go through calibration cycles, and for a window afterward the device is stabilizing. The freshly-pulled calibration during that window was degraded enough that even the *simulated* correlation — the model built from those numbers — collapsed to noise. Our nightly cron had been scheduled squarely inside that window.

The fix was almost insultingly simple: **move the schedule earlier, out of the recalibration window, into a clean two-hour band where the device is stable.** A one-line change to a cron expression. But the lesson underneath it was not simple at all, and it changed how I think about the whole pipeline.

### The thing I did not expect: the nightly attempt is a free sensor

Here is what dawned on me. That nightly job, which I had built purely as "run the workload cheaply overnight," was accidentally doing something more valuable than running the workload. **Just by connecting and pulling calibration, it was measuring the health of the device** — its noise, the correlation it could sustain, its availability — every single night, for free, without consuming quota.

So the proposal I want to put on the table, and this is explicitly *me thinking out loud and asking whether it holds*: what if we treat the nightly connection as a **deliberate data-gathering pass** rather than just a cheap execution slot? Every night, authenticate, pull calibration, build the noise model, record the correlation floor and availability. Over time you accumulate a picture of when the device is healthy and when it is not — a cheap, standing sensor for device quality, built entirely out of the connection step, spending no hardware time at all. The failed run is not just a red build; it is a data point.

That reframing — from "the nightly job runs the circuit" to "the nightly job senses the device, and running the circuit is almost a side effect" — is the idea I am most curious whether experienced people will find naive or useful. I honestly cannot tell yet.

> **Margin question.** Is "correlation floor from a calibration-derived noise model" a meaningful proxy for device health over time, or am I reading signal into what is really just calibration jitter? And is there prior art for using the *connection-and-calibration-pull* as a monitoring signal, separate from actually running jobs? If this is a known pattern with a name, I would love a pointer.

---

### Sidebar: a cheaper road to "is the signal surviving?" — a respectful thought after reading the Google below-threshold work

While trying to understand what "correlation below threshold" even means, I read the Google Quantum AI paper on quantum error correction below the surface code threshold — the Willow work, with Sivak among the many authors. I want to be clear up front: this is genuinely excellent, careful science by people who understand this vastly better than I do, and nothing here is a criticism. I am a newcomer reacting to it, and I want to plant a small thought, not correct anyone.

What their work establishes, as I understand it, is that a logical qubit built from a surface code crosses *below threshold*: as you scale the code up, the logical error rate drops instead of rising — the signal survives and improves with scale, rather than drowning. They demonstrate this with a full apparatus: a distance-7 code, a real-time decoder, careful measurement of error-per-cycle. It is a landmark, and it took an enormous engineering effort to show cleanly.

Here is the thought I keep coming back to, entirely as speculation. Their result answers a very deep version of a question that, in a much shallower and cruder form, my little nightly job is also asking: *is this device in a regime where the quantum signal survives, or where noise has drowned it?* They answer it rigorously, at the logical-qubit level, with a decoder and a code. My nightly job answers a pale shadow of it — "does a simulated Bell correlation, built from tonight's calibration, clear a floor?" — with nothing but a connection and a threshold.

I am not for a second suggesting these are equivalent. They are not remotely equivalent. But it makes me wonder whether some of the *practical* question — "cheaply sense whether a device is currently in a good-enough regime to bother running on" — might eventually be reachable by much lighter means than a full QEC apparatus. Not the deep science; the operational early-warning. A correlation floor pulled from live calibration is almost embarrassingly cheap next to a real-time decoder, and yet on the night it went red, it *did* correctly tell us the device was in a bad state before we spent anything.

So this is a seed I want to hand to people who actually know — perhaps someone inside IBM, watching their own devices' calibration streams. Is there a cheap, standing, connection-only signal that usefully approximates "is this device worth running on tonight," derivable from the calibration data that is already flowing, without any of the heavy machinery? I suspect the answer is more interesting than my toy version, and I would love to be shown how. Please treat this as a question from someone learning, not a claim.

---

## Part 5 — Accountability: do not collapse the identity model

This is the part I care most about getting right, and the part where I most want the audience's help, because it sits at the intersection of CI/CD (which I know) and governance and quantum (which I am learning).

Return to "we trust him, kinda." Suppose the worst reasonable case: someone in our organization fumbles an approval and lets a job go out that should not have. Maybe the circuit was changed to something it should not be. Maybe an approval was rubber-stamped. When that happens — not if, when, at some organization, eventually — I want the traceability story already written. I want to be able to say exactly *who wrote what, who approved it, and whose identity actually ran it,* from records that do not all live in one system under one team's control.

The failure mode I am most anxious to avoid is **collapsing those identities into one.** If everything runs under a single shared token, then "who ran this job" has exactly one answer for every job ever, and the trail is worthless the moment you need it. So the model I built keeps three distinct identities, in three independent systems, and never merges them:

**1. Who authored or changed the circuit.**
Git authorship, with signed commits. The scientist's identity, cryptographically attached to the artifact itself. This is what makes "we trust him" *attributable* instead of ambient — the trust is named, and every change to the circuit is tied to a signature. If a circuit becomes something it should not be, the commit history says who made it so.

**2. Who approved the spend.**
The GitHub Environment required-reviewer record. When the run-on-merge job targets the prod environment, GitHub physically pauses it until a designated human approves. That approval is logged. **But** — and this matters — that record is a claim *by GitHub*, living in your CI platform's logs, under your organization's control, and mutable by a sufficiently privileged insider. It is necessary. It is not, by itself, sufficient. Anyone building this should be clear-eyed that a CI platform attesting to its own approvals is not the same as an independent attestation.

**3. Whose provider-side identity actually submitted the job.**
This is the piece that makes the trail robust, and it is where IBM Cloud's identity management does real work. The submission must run under an **IBM Cloud IAM Service ID** — a non-human identity meant exactly for an application (here, the CI runner) to authenticate as — carrying a **scoped Service ID API key**, not a human's personal token and not a broad organization-wide token. Because it is the provider's own identity system, IBM's audit records — independent of GitHub entirely — capture which identity submitted which job against which instance.

Concretely, on IBM Cloud, the relevant machinery is real and quantum-aware:

- **Service IDs** exist precisely to let an application outside IBM Cloud authenticate to IBM Cloud services without being a person. A Service ID API key authenticates the runner as that service identity. The key can be scoped narrowly, and can even be issued for limited use, which bounds the blast radius if it leaks.
- **Access groups** scope *which service instances* a given identity can reach, and quantum actions are first-class IAM actions — an administrator can write policy around actions like `quantum-computing.job.delete`. So "which identity may submit or delete a quantum job, on which instance" is enforced by IBM, as policy, not by my application logic.
- **Activity Tracker** captures audit records for API calls made against IBM Cloud resources, in the standardized Cloud Auditing Data Federation (CADF) format. This is the provider-side, out-of-your-control trail: it records that a specific Service ID submitted a specific job at a specific time against a specific instance, regardless of what your CI logs say — and in a standard schema, not a proprietary one.

Now put the three together for the bad-day scenario. A job went out that should not have. The story is not "we hope GitHub's logs are intact." It is:

- The **signed commit** shows author A wrote (or altered) the circuit.
- The **GitHub environment log** shows reviewer R approved the merge that triggered it.
- **IBM's Activity Tracker** shows Service-ID-prod submitted job X at time Y against instance Z.

Three independent systems, three identities, one correlatable trail. Any two of them can be cross-checked against the third. Collapse any two — one shared token, or approval and submission under the same identity — and you lose the ability to cross-check, which is the entire value.

**This is also the real reason for two credential pairs.** Distinct Service IDs per environment mean the *provider-side* audit trail can distinguish "this ran under the gated prod identity" from "this ran under the ungated dev identity" **without trusting GitHub at all.** The identity boundary is enforced at IBM, mirrored at GitHub, and the two have to agree with each other. Two differently-named secrets sharing one underlying identity would look fine in GitHub and be invisible in IBM's trail — exactly the collapse I am trying to avoid. The two pairs are not about spend limits; they are about keeping the accountability trail legible on the side you do not control.

---

### Sidebar: quantum jobs as an ordinary — but expensive — attack surface. A question for governance people.

I want to raise something carefully, because I am not sure it is being talked about in the right frame, and I would rather ask than assert.

Almost the entire current conversation about "quantum" and "security" is about one thing: the cryptographic threat. A future, cryptographically-relevant quantum computer breaking today's public-key encryption; "harvest now, decrypt later"; the migration to post-quantum cryptography. This is real, it is regulatory, bodies like NIST and CISA are driving hard timelines, and it is thoroughly covered. I am not adding anything to it.

The thing I have *not* seen discussed much is almost the inverse, and it is far more mundane. It is not "quantum breaks our crypto." It is: **a quantum-cloud credential is just an API credential with a compute resource and a dollar-denominated blast radius attached, and our CI/CD is the thing holding it.** We are wiring quantum compute into our delivery pipelines with roughly the same casual trust we would give a linter — and unlike a linter, *nobody approving the job can read what it does.* The circuit is opaque to the reviewer. The cost of a fumbled approval is not a bad deploy you roll back in minutes; it is real spend against a credential, executing whatever the circuit actually encoded, on hardware you do not own and cannot inspect.

I want to be precise about what I am and am not claiming, because it would be easy to dress this up as the cryptographic threat and lose the thread. I am *not* claiming quantum jobs break credentials or crypto. I am asking a narrower operational question: as quantum submission pipelines proliferate inside ordinary engineering orgs, are we giving the *pipeline itself* — the credential, the approval gate, the opaque-workload problem — the same governance scrutiny we would give any other system that can spend money and run code we cannot read? My honest impression is that we are not, mostly because the whole topic is filed under "quantum, i.e. someone else's problem for now," when the CI/CD exposure is a today problem for anyone who could be handed this task.

That impression is exactly the accountability model in Part 5: keep the three identities separate so that when — not if — someone fumbles an approval, the trail survives on infrastructure outside your own control. But I am a newcomer, and I would genuinely like to hear from people who do governance for a living:

- Is this already a recognized category that I simply have not found the literature for? If so, please point me at it.
- Is the three-identity, don't-collapse-the-trail model the right shape, or am I over- or under-building?
- Is "opaque expensive workload approved by someone who cannot read it" a problem that existing controls already cover, or a genuine gap worth naming before these pipelines are everywhere?

I would rather start this conversation a little too early, and be told it is already handled, than have it start after the first expensive mistake. Please tell me what I am missing.

---

## What I would tell someone starting tomorrow

Compressed, in the order that mattered:

- **Validation does not need real hardware.** Structural checks, transpilation, and local simulation catch the things that actually break. Reduce correctness to one scalar you can gate on.
- **Let the scientist pick their format; make the pipeline format-agnostic.** Accept the circuit as OpenQASM, a Qiskit script, or a notebook, and resolve all three to one circuit object behind a loader. Everything downstream depends on the object, not the format. If you accept notebooks, run only the one tagged circuit cell, never the whole notebook.
- **Draw a hard contract between the CI role and the quantum code.** Inputs in as env vars and workflow inputs; one clean signal out as an exit code plus a machine-readable result file. The person writing YAML should never edit the build; the person writing circuits should never edit YAML. This survives everything.
- **You do not upload a program; you submit a compiled circuit.** The payload file lives in your repo as the durable artifact; what goes to IBM is the locally-compiled circuit, and the job ID is your receipt. Do not go looking for a program-upload step — the old program-ID model is deprecated and gone.
- **Block first. Go async only when queue time or volume forces it** — and design the submit step to produce a job ID and a result file from day one, so async is an extension and not a rewrite. A message queue is the classic seam, not the only one.
- **Keep two axes separate:** environment carries credentials and approval; a separate switch carries simulator-vs-hardware; backend is its own input. Do not bind "simulator-ness" to the environment name.
- **Put the spend gate in the platform, not in your code.** A GitHub Environment with required reviewers makes the paid credential unreachable without approval, with no bypass logic to get wrong.
- **Avoid device maintenance windows.** Schedule around recalibration. We learned this the hard way when a nightly cron landed mid-recalibration and the correlation collapsed to noise.
- **The nightly connection is a free sensor.** Pulling calibration measures device health without spending quota. Consider treating it as deliberate data-gathering, not just a cheap run slot.
- **Do not collapse the identity model.** Author (signed commit), approver (GitHub environment log), and submitter (IBM Service ID, recorded in Activity Tracker) must stay three separate identities in three independent systems. That is what makes the trail survive a bad day.

And the two things I am least sure about, restated as open questions: whether the nightly calibration pull is a meaningful standing health signal or just noise, and whether the CI/CD exposure of quantum pipelines is a governance gap worth naming now or one that is already handled. I am hoping this document reaches someone who knows.

---

## Where to publish this, and how to get the right eyes on it

Since the piece deliberately sits across three audiences — DevOps practitioners, quantum-curious engineers, and governance/security people — no single venue reaches all of them, and I would tune the framing per venue rather than cross-post identically:

**For the DevOps / platform-engineering audience.** A hands-on writeup like this does well on a personal or engineering blog surfaced through the usual aggregators — Hacker News, `r/devops`, Lobsters, `dev.to`. The hook for this crowd is "CI/CD for an unfamiliar expensive workload," not the physics; lead with the pipeline and the two-axis config, and let the quantum be the interesting backdrop. The maintenance-window faceplant and the blocking-vs-async decision are the parts that will resonate here.

**For the quantum-computing practitioner audience.** IBM's own Qiskit community channels (the Qiskit Slack, the IBM Quantum community forum, and IBM's developer/Qiskit blog if you want to pitch a guest or community post) are where people who could actually answer the Sivak-sidebar question and the nightly-sensor question live. This is also the most likely path to the "someone inside IBM" reader the sidebar is aimed at. The Quantum Computing Stack Exchange is a good place to pose the narrow technical questions (the correlation-floor-as-health-signal one especially) on their own. Medium's quantum-focused publications reach a broader, less specialist slice.

**For the governance / security audience.** The attack-surface sidebar is the part most likely to travel here, and it wants a different framing than the rest — foreground the opaque-expensive-workload and don't-collapse-the-trail argument, background the physics. LinkedIn reaches this crowd surprisingly well for exactly this kind of "here is an emerging operational question" piece, as do security-practitioner communities and newsletters. Given the current "Year of Quantum Security" attention, an editor at a security trade outlet might take a short opinion piece built around just that sidebar — but pitch it honestly as *the operational/CI angle*, explicitly distinct from the post-quantum-cryptography story everyone is already covering, or it will get pattern-matched to the wrong conversation and dismissed.

**Practical suggestion on structure.** Consider publishing the full journal once (blog + the practitioner aggregators), then spinning the two sidebars out as standalone shorter posts aimed squarely at the quantum and governance audiences respectively, each linking back to the full piece. The sidebars are the parts most likely to start the conversations you actually want, and they will each land harder as focused standalone pieces than buried in a long journal. Whichever venue you choose, keep the humble-question framing — the piece is trying to *start discussions*, and the openness is what will draw the people who can answer.
