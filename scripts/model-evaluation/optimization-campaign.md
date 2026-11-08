# Application optimization evaluation preparation

This contract is for evaluation maintainers preparing and reporting a paid
comparison. Preparation does not authorize payment. A run requires its own
explicit authorization and recorded scope. Local controlled tests
verify evaluator contracts; they do not establish model or voice quality.

## Versions and reproducibility

Compare the original application at
`8529cf04d6e5e1c42373bd7c14f46ca75185588c` with the proposed application at
`2f4dd4ad694aa0030ef2b1d6f64b00e8abacc073`. Keep both in clean worktrees.
Both use sequential work mode. The common evaluator is a separate clean,
committed revision containing the final combined preparation. Freeze its full
commit after composition, then generate the preparation manifest with the
driver. Do not use an evaluator worktree's application as the proposed version.

The manifest freezes exact bytes of the catalog, judge controls, audio manifest,
profiles, comparison plans and context module. The runner independently checks
the loaded evaluator commit, application commits, clean source, common scoring
contract and alternating order before calibration. The original application
uses consent version 3; the proposed application uses version 4. The existing
adapter reads each version from its own committed source. Controlled HTTP and
SQLite preparation exercises both; no compatibility shim is necessary.

The four result combinations are Terra/high/text, Terra/high/voice,
Sol/high/text and Sol/high/voice. Each contains both application versions. Exact
backend IDs are `terra-6.1-high-668` and `sol-6.1-high-668`; their models are
`gpt-6.1-terra` and `gpt-6.1-sol`. Preserve the historical `terra-high` alias,
which identifies another model. Do not substitute it. Both exact backends use
high effort, default service tier, a 1,050,000-token context and the verified
128,000-token maximum output, including reasoning. The 922,000-token normal
input reservation is context minus maximum output, not a separately published
input limit. The common Sol/high judge retains its 4,096-token output cap.

`optimization-campaign-profiles.json` records current official source URLs,
retrieval date, source SHA-256, exact rates and remaining billing gaps. Source
snapshots belong in private evidence. Account access remains untested. Check
credentials by presence only; keep secrets out of manifests and reports.

## Ordinary comparison

The catalog contains 70 text scenarios with 82 declared steps: 60 everyday
entries, eight advanced diagnostic scenarios and two long-conversation
scenarios. The everyday group includes 59 ordinary tasks and one public Stop
interaction. Eight existing voice scenarios retain their 14 ordinary steps
and approved audio; the new text examples have no voice qualification.
Use the same isolated start data, complete state, save receipts, history and
assistance policy for both versions. Keep all mandatory correctness checks
in advanced groups too.

`everyday-source.json` preserves all 60 numbered source entries, their exact
utterances, conditional answers and scenario IDs. Its prompt-only SHA-256
does not depend on an editable status document. Similar entries remain
separate. The catalog embeds the mapping and source-file digest; campaign
preparation also freezes the source file. Changed catalogs, grouping, targets
or scoring contracts require fresh evidence; old timings are not comparable.

Each new entry provides complete starting facts through the same authenticated
map routes and real SQLite/MCP state as the shared fixture. Expected deltas
are independent of generated model output. New object IDs bind to stated
names and types, or a uniquely remaining new object of the declared type.
Existing IDs stay stable. Explicit semantic fields allow equivalent names
or property wording, with exact preserved properties, bounded counts, kinds
and known values. The judge receives the complete observed map and independent
state contract, including the declared meaning of these fields. Unlisted
entities, properties, relationships, type changes and saves remain failures.
Only independently enumerated whole-state alternatives are accepted; no
match fails and ambiguous matches remain inconclusive.

Necessary unanswered questions preserve the exact request and remain
unfinished with no successful completion time. Only a uniquely necessary
matching scripted answer may continue the task. No answer is invented.
The Stop entry uses the existing cancellation proof and allowed atomic states:
successful Stop handling retains the ordinary task outcome `aborted`, with
no successful completion time. Report Stop control success separately, place
it last when unknown canceled-provider billing can stop further payment, and
exclude its interrupted task from ordinary wait comparisons.

A separately authorized readiness round may select the proposed application,
Sol/high/text and repetition `[1]`, preserving all 70 scenarios and placing
Stop last. Stop after that first round: no retry, repetition or full campaign
is implied. This checks readiness only and provides no version comparison,
median speed claim or full text/voice qualification. Keep failed everyday
cases in the everyday group and investigate their outcomes.

For the full comparison, each model and modality uses five repetitions in this
version order:
original/proposed, proposed/original, original/proposed, proposed/original,
original/proposed. Each combination uses one persistent ledger including its
45 calibration controls and all repetitions of both versions. Derive planned
attempt counts from the frozen scenario selection and repetition plan.
Conditional replies and separate context supplements add attempts.
Dependent work after failure remains unrun; planned counts are not successes.

Text target scenarios are `everyday-question`, `everyday-change` and
`everyday-follow-up`. The voice target is `change-price-payment` only.
The technical wording of `relationship-direction`
keeps it as an advanced diagnostic. Accept speed only after mandatory
correctness passes.
For each model and modality separately, target median ratios must be at most
0.8 and other everyday ratios at most 1.1. Relative min/max range divided by
median must be at most 0.2 in both versions. Missing evidence or excessive
variation is inconclusive. Five repetitions do not establish a statistically
certain ranking. Report advanced groups separately from these thresholds.

Enable the catalog's conditional replies. Preserve each direct verdict; select
one uniquely matching approved reply at most once and verify the entire waiting
state and response before sending it. Additional instructions, prompt tuning,
verdict retries and invented replies are outside the contract. Clarification
does not repair an independent failure. Report direct and assisted completion
separately, including extra calls, cost, wall time and evaluator gaps. A correct
voice question can be accepted handling while completion remains unverified.

Measure text from submission to correct state and the complete required answer.
Voice includes final rendered audio and independent captured-audio assessment.
First text, tool success or a backend answer alone cannot establish full wait.
Failed, aborted, inconclusive and unrun attempts have no successful completion
time. Preserve observed stop/error time and all charges. Record actual model
and MCP counts/durations, input/cache/output/reasoning tokens and context usage;
separate work, summary, content judging and voice recognition costs. Never infer
cache reuse from repeated prompts: use observed cache-read/write usage.

Use only the existing approved Marin audio and conditional replies. Verify all
21 manifest clips against their text, SHA-256, PCM format, frames, declared
sample rate and existing listening provenance. Integrity verification does not
create new listening approval. Ordinary dialogs remain connected; close before
final judging and summary, then reopen after summary installation.

## Actual context limits

The existing summary hook and eight neutral retained posts test summary
behavior. They do not establish an actual model boundary.

`context-limit.ts` provides a separate bounded ordinary-message growth fixture
and concrete authenticated application adapter. It preserves real SQLite/MCP,
uses at most 2,048 growth messages of at most 3,900 characters each, and tests
recall of a declared early sentinel after a natural context transition. Every
turn checks unchanged state and saving safety. Growth stops at the first
observed summary or context-generation increase, including during the seed,
and attempts at most one recall. A terminal failure stops immediately without
dependent turns. Failed or unverified recall remains inconclusive. With
verified recall, input usage below 95 percent of capacity or missing usage is
configuration-limited; usage at or above that threshold establishes only an
application boundary. Classification includes usage observed during the
transition turn. This supplement retains all outcomes, provider-measured input,
request identities, natural summary calls and context generation. Byte
estimates, low-usage summaries and controlled usage never establish a physical
provider boundary. The physical maximum stays unverified.

The separate provider capability probe preserves a captured full application
request and appends deterministic bounded history. It requires an exact count
of that entire outgoing payload, with independently verified counting fee,
before provider dispatch. Its reservation uses the counted oversized input
and maximum output under the applicable worst input/cache-write and output
rates. It does not use the normal 922,000-input hold or change the published
context limit. The probe can establish an observed provider context rejection
only from an explicit provider `context_length_exceeded` response and request
identity. It cannot establish application correctness or successful latency.

Run capability probes last, separately from everyday timing, once per model
and application source request. Exact counting fee/support is unresolved, so
no probe is executable yet. Missing usage on a rejected request retains the
full hold and stops new payment; rejection is never assumed free. Preserve
unrun probes and any unresolved charge in the final report. A text backend
probe does not establish the separate Live context limit. Actual Live-boundary
execution remains unrun and requires a further approved-audio growth contract;
do not turn ordinary summary evidence into a substitute claim.

## Cost and execution gates

All prices are USD. For normal backend/summary requests, conservative maximum
holds are $3.265 Terra and $6.53 Sol. The judge maximum is $4.67144 per call;
45-control calibration has a $210.21480 maximum hold basis per independent
run. These are conservative reservations, not expected or actual charges and
not a user spending ceiling. Actual costs use verified provider usage. Calls
vary with checking, clarification, summaries and partial failures; do not
multiply by an invented fixed model-call count. Four comparison runs include
172 calibration calls before candidate attempts. Capability counting and probes
are additional paid layers and require their own explicit cost basis.

The proposed application explicitly selects a 30-minute cache lifetime. The
original application and judge omit that setting and explicit breakpoint
lifetimes; the official provider default is 30 minutes for these models. The
recorded cache-write rate is the total 1.25-times input rate, with the documented
long-context multiplier. Reject any later configuration using 12-hour writes
until its prices and reservations are updated.

Voice uses `gpt-live-1`, Marin output and the same backend in both versions, at
$0.05/minute billed by second. Session creation bills 15 seconds credited
against running duration; never add another 15 seconds to an established
session. The final short-session credit semantics remain unresolved. Failed
creation or missing final usage retains the hold and stops payment.

Independent playback recognition uses `whisper-1` at $0.006/minute. The official
examples do not establish a universal billing quantum. The exact profile keeps
the quantum null and the executable voice builder refuses it. Preserve the
recognizer identity; do not guess a quantum or substitute a different model.
Confidence and alignment settings are evaluation policy requiring calibration,
not facts established by pricing documentation.

No arbitrary cost ceiling applies. Supply one only if the user specifies it,
with its scope. Every ledger includes calibration, backend, summary, judging,
voice, recognition, paid counting and outstanding holds within its authorized
scope. Unknown usage, failed calibration or an unknown fee stops execution.
Historical results have different catalogs/scoring/source and cannot replace
the planned comparison. Earlier authorization does not authorize this campaign.

## Commands and reporting

Run all commands from the final clean common evaluator worktree. Replace the
commit and directory arguments with the frozen final identities. The output
preparation file must not exist; the driver writes with exclusive creation.

```bash
npm_config_cache=/workspace/tmp/npm-cache npm run test:env -- tsx scripts/model-evaluation/campaign-driver.ts prepare model-evaluation-results/optimization-preparation.json EVALUATOR_COMMIT ORIGINAL_WORKTREE PROPOSED_WORKTREE
```

Copy `optimization-execution-template.json` to private storage and fill one
exact profile/modality, a separately created result issue, its directory,
verified prior consumption and final local verification. Set authorization and
its source only after explicit approval for this comparison. Loading a private
environment file or setting opt-in flags grants no authorization. Then use:

```bash
npm_config_cache=/workspace/tmp/npm-cache npm run test:env -- tsx scripts/model-evaluation/campaign-driver.ts run model-evaluation-results/optimization-preparation.json PRIVATE_EXECUTION_JSON
```

The driver checks the frozen preparation before dispatch. The evaluator checks
clean source and calibrates before candidate work. Voice remains blocked by
the documented billing gaps. Never use a controlled test's synthetic price or
provider profile for paid execution.

Publish one result issue per model/effort/modality after authorization, with
sanitized versioned evidence and retrieved-content verification. Preserve all
attempts and unknown costs. Each description needs a readable conclusion,
correctness, before/after medians and ranges, percentage change, actual cost,
advanced limitations and unrun work. Separate automated product checks,
remaining human assessment and actual observed model/voice quality. Until the
required real runs and publication finish, the comparison is incomplete.
