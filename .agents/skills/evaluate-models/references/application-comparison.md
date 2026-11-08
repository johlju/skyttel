# Application-version comparison

Use this contract to compare application changes within the same model and
effort. Select text or voice for each run. Voice uses its independently assessed
rendered-audio contract and separate plan; never combine modality thresholds.
Keep model selection separate from application changes.
Require the user's authorization before paid execution.

## Prepare the comparison

Select baseline and candidate as clean local Git worktrees. Record each full
commit and directory in `EvaluationPlan.applicationComparison`. The runner
verifies the worktree and loads that revision's real installation and server.
Prepare dependencies and run applicable local checks through each revision's
npm scripts. Run the common evaluator from a clean committed checkout. Its
loaded module location must identify the supplied evaluator commit; another
clean directory cannot establish that provenance. Keep its test evidence explicit.
Load it only after committing its complete executing state. Use immutable
application paths for the process; a path imported at one commit cannot be
reused for a different commit because module caches could retain old code.
Use the same checked-in catalog, starting map and draft, fixture identities,
profile limits and prices, judge configuration, assistance policy and audio.
An incompatible revision is an untested configuration; preserve it and explain
the gap before payment.

Use the checked-in optimization plan for the initial wait-time comparison.
Read `scripts/model-evaluation/optimization-comparison-plan.json` for its
models, effort, repetitions, target scenarios and acceptance limits. For voice,
apply the overrides in `optimization-voice-comparison-plan.json`; only scenarios
with approved voice fixtures belong to that plan. Keep unavailable recordings
untested rather than substituting text or generating unapproved speech.
Reverse baseline/candidate order on alternate repetitions. Run each selected
model separately at the plan's effort. Verify the exact model identity;
registry aliases can identify a different model. Supply a separately verified
backend profile when the selected model lacks a current registry entry.
Missing support, access or verified pricing leaves that selection untested.

Use an explicit custom plan for future comparisons. Record repetitions,
target scenarios, acceptance thresholds and a maximum permitted relative
range. Keep all planned correctness checks; a speed-only subset cannot
establish qualification.

Apply the selected plan's `maximumRelativeRange` to each version's everyday
scenario: divide its maximum-minus-minimum duration by its median. Greater
variation is inconclusive, even when the median meets a speed threshold.

Completion: both revisions, the exact model profile and complete shared
conditions are identified, local checks pass, and the plan is recorded before
any paid attempt.

## Measure and interpret

The text contract is `text-delivery-v2`: start immediately before submission
and finish after the completed request's entire HTTP response is delivered
and parsed. Include queue wait. Record observed response time separately from
successful completion time; only verified correct state and required content
qualify the latter. First useful response excludes activity/status labels.
Keep raw `firstResponseMs` separate from certified usefulness. When earlier
prose has unverified usefulness, leave `firstUsefulMs` unknown. Report
`firstVerifiedUsefulMs` as a verified completed response or necessary question;
it does not prove that no earlier partial response was useful.
The endpoint observes a client receiving the response, not browser paint.
Synthetic summary preparation remains a separately identified technical step.

For voice, configure the same exact Live/backend combination and verified
recording assessor for both committed applications. Use the source-speech end
and actual output-device/rendered recording evidence in
[voice evaluation](voice-evaluation.md#evidence-and-timing). The common renderer,
audio hashes, listening/speaking conditions, assessor profile and its uncertainty
policy belong in the comparison contract. An output transcript alone cannot
qualify a voice duration. Keep voice results and acceptance ratios separate from
text results, even when both use the same backend and effort.

Keep the first request's origin through a necessary clarification. Assisted
completion includes the whole exchange, including selection/routing delay;
preserve the original attempt and individual replies. Report direct and
assisted completion separately. Failed, canceled, inconclusive and unrun work
has no successful completion time. Publish every planned individual outcome,
median, minimum and maximum.
Treat canceled and expired application requests as terminal unsuccessful
outcomes before scoring or selecting another clarification. Retain their
observed status and partial effects; cancellation does not undo committed work.

Use the declared immediate-scripted-reply policy for assistance. Record
first-send-to-last-delivery wall time and measured harness-only gaps separately.
Exclude scoring, scripted-reply selection and fixture bookkeeping between
turns from assisted application wait. Keep every turn's delivered duration and
application queue/selection wait. Do not attribute the judge's execution to
user/application wait or invent a human reply delay.

Compare only matching comparison-contract identifiers. The identifier covers
measurement and common evaluator revisions, catalog/start data, approved audio, exact backend and
judge configurations, assistance policy and acceptance plan. Older records
without it are not directly comparable.

Apply mandatory correctness gates in every scenario group before accepting
speed. Compare candidate-to-baseline median ratios with the selected plan's
`targetMaximumRatio` for targets and `otherMaximumRatio` for other everyday
scenarios, separately for each model and modality. Report advanced capability
limits and regressions separately. Insufficient repetitions, missing evidence
or excessive variation yields an inconclusive comparison. Small repetition
sets supply initial evidence, not a statistically secure ranking.

Report model and MCP counts and durations, context bytes, input/output and
reasoning tokens, costs, and provider cached tokens. Separate backend work,
summary and judge calls. Keep read-cache observations separate from provider
cache tokens; an unobserved read-cache count is unknown. Label missing fields
as null and state their limits. Diagnostic improvements do not replace full
user-wait measurement.
Publish each MCP metric's `scope`, `limitation` and `complete` fields with its
counts and durations. Use the emitted boundary when explaining diagnostics.

Context bytes count serialized instructions, input, tools and response-format
configuration. This observed byte count is not a token estimate. Provider usage
supplies token counts; missing usage cannot establish zero tokens or cost.

Completion: every planned attempt is accounted for, all correctness gates
and timing comparability checks are applied, and the report names accepted,
rejected or inconclusive results with evidence and limitations. Implemented
measurement support alone establishes no performance improvement.
