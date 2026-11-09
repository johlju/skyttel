# Advanced text and context-boundary evaluation preparation

This plan is for maintainers preparing a supplementary model evaluation.
It defines the selected work, evidence rules and cost proposal. Preparation
does not authorize paid requests. All planned provider trials remain unrun.
The [preparation snapshot](advanced-context-evaluation-plan.json) freezes
the source identities, selected scenarios, profiles and supplemental fixture.
The [historical evidence](advanced-context-historical-evidence.json) retains
original diagnostic facts and source digests separately.

## Source freeze and scope

Use the separate application and evaluator source revisions in the
snapshot, sequential text mode, one repetition per selected scenario, and
fresh isolated SQLite state for each independent dialog. The evaluator
revision is the latest commit affecting its source paths. Documentation-only
commits do not change that revision; execution also records the actual HEAD.
The snapshot hashes the catalog, fixtures, provider
profiles, judge instructions and controls, and relevant evaluator modules.
The catalog supplies base data and named start variants; do not substitute
production household data. Freeze actual rendered requests and initial
state with each run as well as these source identities.

Use `gpt-6.1-terra` and `gpt-6.1-sol`, both at `high` effort and `default`
service tier, through the exact profiles in the snapshot. Do not use the
historical `terra-high` alias. The common judge is `gpt-6.1-sol/high` with
4,096 maximum output tokens. Application calls retain the 128,000 output
limit. The current judge has **68 controls**; older campaign prose naming
43 or 45 controls must not determine a new run's count or cost.

This is an unpaid preparation freeze, not an execution authorization.
A driver or fixture change
requires a new evaluator commit and refreshed affected hashes before
payment. Keep the application commit explicit if only the evaluator changes.
Build and test through repository npm scripts in a clean execution worktree.

Excluded: voice, overlap comparisons, old/new application comparisons,
repetition-based speed claims, and reruns of the 60 ordinary scenarios.
Changes in source or scoring cannot qualify those historical results on a
new revision.

## Historical failure diagnosis

The historical evidence records sanitized facts and source digests from
application
revision `43f02c43bae00b39856d9c4e63d4ba0c00ccf6f0`. Original verdicts,
requests and diagnostic artifacts remain unchanged.

- `save-last`: the draft contains the requested changes, but there is no
  save receipt. Three independent batch checks allow their changes; the
  final `save_draft` check returns `clarify`. Its input includes the exact
  user request, interpreted scope, map, draft and `wholeDraft: true`.
  No concrete question reaches the user. This identifies the failing
  decision path, but does not establish a deterministic omitted-input
  defect or justify weakening the save checks. Capture the same inputs
  and decisions in the new run before considering a generic product fix.
- `unknown-user`: the raw content verdict is `pass`, but the separate
  retention assessment is `correctness_failure`, with
  `unfinished_instructions`. The public view has a relevant endpoint
  question and an empty `pendingParts` array. The generic scope-clarification
  repair has local evidence; new real-model evidence remains required.
- `no-user`: the original ordinary response criterion rejects a relevant
  question about consent to an alternative property. The clarification
  assessment accepts that question and observes a retained pending request.
  The current catalog aligns the two criteria. A valid question with no
  approved answer remains unfinished; it is not completed map work.

These distinctions follow the decisions on
[whole-draft saving](../adr/0005-utkast-sparas-samlat.md) and
[pending conversation parts](../adr/0010-vantande-delar-i-samtal.md).

## Phase A: bounded catalog subset

Terra runs these ten scenarios in catalog order:

1. `late-price-correction`
2. `save-last`
3. `relationship-direction`
4. `questions-and-changes`
5. `custom-type-date`
6. `unknown-user`
7. `no-user`
8. `uncertain-user`
9. `summary-last-price`
10. `long-conversation-question`

Sol runs only `save-last`, `unknown-user` and `no-user`. Use the current
full catalog's fixtures and exact selected entries. Enable existing
conditional replies, at most one uniquely matching declared reply for a
step. Preserve direct and assisted results separately. Do not invent a
reply for `unknown-user` or `no-user`; neither has a declared reply.

Terra has 15 declared steps, including two summary transitions, 13 ordinary
messages and up to five conditional messages. Sol has three ordinary
messages and up to one conditional message. Calibrate the judge for each
model run before candidate work; stop on any failed calibration. Do not
silently repeat a failed verdict or restart a partially attempted dialog.

Acceptance requires correct whole state, preserved unrelated facts,
authorized saving with receipt/history, and truthful required response
content. A necessary clarification must preserve actionable pending work
and all constraints. Report safe waiting separately from completed work.
Lost instructions, unauthorized saving and wrong changes remain failures.
The two long catalog cases exercise summary/background behavior; they
cannot establish an actual provider context boundary.

## Phase B: application boundary and unfinished work

The supplemental `context-limit.ts` path combines ordinary public messages,
a fixed early codeword, independently checked pending work and a declared
continuation. It uses at most 16 growth messages and one recall after the
first natural summary or context-generation increase. Recall alone does
not prove preserved work. Run one isolated dialog per model with this
fixed contract:

1. Start with the `known-cloud-user` variant and send the exact catalog
   `unknown-user` request. Require a relevant question, unchanged state,
   zero saves and the exact request in active pending work.
2. Send the existing codeword seed and deterministic numbered growth
   messages through the ordinary message route. After every turn verify
   unchanged map/draft/history, no save, and preserved pending request,
   identity and constraints. Do not inject history, force a summary,
   lower output limits or modify the application's context settings.
3. Stop growth at the first natural transition, terminal failure, budget
   stop or 16 growth messages. On a successful transition, ask for the
   original codeword once and verify the pending request independently.
4. If the application remains usable and the pending request is intact,
   send this predeclared diagnostic clarification once: "Låt det nya
   sambandet gå till Lo Berg. Behåll alla befintliga samband och spara
   inte." Require exactly the requested new connection from Norrsken
   Molnlagring to Lo Berg, with the requested Används av meaning, existing
   connections preserved, no save and verified completion of that pending
   part. Freeze its explicit state oracle before execution. This is a
   new supplemental dialog, not a retroactive catalog follow-up.

Maximum for this campaign: 20 user messages per model, no retries.
A terminal failure
prevents dependent recall/continuation. A clear safe pause with intact work
is accepted handling but has no successful task-completion time. Failure
to retain work is a correctness failure even if the pause is understandable.

Report the observed application transition and provider input usage.
The existing 95-percent capacity threshold is a classification policy,
not proof of a physical maximum. Missing usage or an early summary leaves
the physical boundary unverified. Reaching the turn or spending cap without
a transition is inconclusive. Controlled tests exercise the normal summary
threshold with synthetic usage reports; they cannot establish real provider
capacity or model quality.

## Phase C: separate provider rejection probe

Run only after application evidence and after resolving the counting fee.
Use one bounded captured complete application request per model through
`context-probe.ts`, preserving model, reasoning, output limit, tools, schema
and cache policy. Hash the outgoing payload and count that exact input with
the documented counting contract. Verify payload parity and account/model
support; do not replace counting with byte estimates or local tokenization.

Reserve counting and oversized generation separately. Only an explicit
provider `context_length_exceeded` response with request identity establishes
an observed rejection. One oversized rejection does not locate the exact
largest accepted request, prove retained work or establish successful
latency. Unexpected success or another error remains a distinct outcome;
there is no automatic binary search or retry in this plan.

The [provider-source review](context-boundary-provider-prerequisites.md)
records dated findings about generic exact Responses counting and leaves
its fee unresolved. It is not fresh verification.
This phase is blocked and has no approved or complete numeric budget.

## Cost proposal and limits

Current preparation incurs **$0 in provider charges**. The proposed amounts
are spending stop limits, not expected bills or requests to spend them.
The complete proposal contains four phase/model runs: Terra's ten catalog
scenarios once, Sol's three once, and one supplemental growing dialog for
each model. Each run has its own 68-control calibration, at most 272 controls
across all four runs. These are not repeated statistical trials.

Phase A's historical illustration totals about $2.82 across both models.
Phase B has no reliable total-cost estimate: each ordinary message can cause
several model calls, while the context carried by later calls grows.
The $25 cap can stop a dialog before its 20-message bound or a transition.
No part of this proposal is an approved ceiling.

All amounts are USD at public Standard rates, excluding taxes and account
incentives. The provider-source review supplies dated citations, rates,
cache-write semantics and long-context multipliers. Each request over
272,000 input tokens uses the higher rates for the whole request.

Conservative normal per-call reservations are $3.265 for Terra backend,
$6.53 for Sol backend, and $4.67144 for the judge. These reserve 922,000
input tokens and the applicable output limit, using the worst 30-minute
cache-write rate. A reservation is not expected spending.

Historical Standard-rate attempt charges provide a small-work reference:
the ten Sol advanced/long scenarios total $2.0219358 backend and $0.7387235
judge, excluding calibration. The three Sol targets total $0.426059 backend
and $0.196134 judge. Forty-five calibration controls total $0.148104;
scaling the same mean to 68 gives $0.2238016 per new run. These figures
include failures and come from a different source/scoring revision.

Under an explicit same-token-and-call assumption, substituting Terra's
half-price backend gives approximately **$1.97** for its ten-scenario run,
and **$0.85** for the three-scenario Sol run, including that calibration
allowance. These are planning examples, not forecasts or guarantees.
Propose a **$25 cap per model for Phase A** to leave room for uncertainty
and conservative reservations. The user has not approved these caps.

For comparison, the existing evaluator's conservative estimate uses 48
backend calls per possible utterance and up to three judge calls per
utterance, plus 68 controls. It reports $3,390.87568 for Terra and $1,627.4752
for Sol. These technical estimates greatly exceed the proposed caps and
are not completion promises; actual calls reserve incrementally. Summary
transitions and future supplemental work must remain in the ledger even
where a message-count estimate does not separately describe them.

Context growth needs its own budget. An illustrative 1,024-call workload
with 500,000 input tokens and 1,000 output tokens per call, all charged as
long-context 30-minute writes, costs **$1,287.68 Terra / $2,575.36 Sol**.
More calls per turn, summaries and judging add cost; measured cache reuse
can reduce it. This example is not an estimate of where a boundary occurs.

The simplified Phase B diagnostic uses **at most 16 growth messages** and
**at most $25 per model**, including its own 68-control calibration and every
work, checking, summary and judgment call. Recall and continuation run only
if a natural transition occurs within that short dialog. Otherwise the
boundary remains unverified; this is a pending-work preservation diagnostic,
not a promised boundary measurement. The general controlled harness retains
coverage for its 2,048-growth-message safety bound, but that stress scope is
not the paid campaign proposal.

The proposed A+B ceilings total **$100**, across four runs capped at $25
each. Expected Phase A cost remains the much smaller historical illustration;
Phase B has no reliable completion-cost estimate. All ceilings remain
unapproved. The execution gate rejects any per-run ceiling above $25.
If the desired evidence needs more than $25, simplify or redesign the test;
do not raise its ceiling or automatically split/repeat it to evade the limit.

For Phase C, with exact oversized input count `N > 272000`, reserve
`N * 2.5 / 1000000 + 0.96` for Terra generation and
`N * 5 / 1000000 + 1.92` for Sol generation, plus each verified counting
fee. For example, `N = 1100000` requires $3.71 / $7.42 plus counting.
The actual supplemented payload may be much larger. Do not allocate a
fee of zero or assume that rejected requests are free.

Each phase/model needs a persistent ledger with its explicit cap. All
spending and open holds count toward it. Failure to reserve stops before
dispatch. Missing usage retains the full hold and stops new paid work
across the authorized campaign until reconciled. No phase may borrow from
another phase's cap. Reconciliation preserves missing individual usage
and all original outcomes; it cannot manufacture successful results.

## Unpaid commands and execution gates

Run commands from the repository root through the shared npm process lock.
The committed snapshot is reproducible from its source revision and hashes:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:env -- tsx scripts/model-evaluation/run-advanced.ts preflight docs/research/advanced-context-evaluation-plan.json
```
<!-- markdownlint-enable MD013 -->

After a source change, commit the implementation, then create a fresh freeze
at a new path. `prepare` refuses to overwrite existing evidence:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:env -- tsx scripts/model-evaluation/run-advanced.ts prepare /tmp/advanced-context-freeze.json
```
<!-- markdownlint-enable MD013 -->

`prepare` and `preflight` perform no provider dispatch or token counting.
Preflight compares the complete freeze, including scenario order, bounds,
profiles, controls, fixtures and source hashes. A stale freeze fails closed.
The hashes include application source, migrations, evaluator source,
installation helpers, dependency manifest/lock and TypeScript configuration.
Execution additionally requires a clean committed evaluator loaded by the
current process. Changes require a new freeze and authorization review.

The [execution proposal](advanced-context-execution-proposal.json) retains
`authorized: false`, no approved ceilings and a null authorization source.
The proposed caps above are discussion inputs only. Credentials, opt-in
flags and an authorization of unpaid preparation cannot clear the gate.
A maintainer must separately approve concrete phase/model IDs, each ceiling,
the freeze hash and an absolute new output directory before creating an
execution authorization containing these fields:

- `authorized: true` and a nonempty `authorizationSource` identifying that
  explicit approval.
- `freezeSha256`, `directory`, and `issue` for local evidence attribution.
- `runs`: selected `A-terra`, `A-sol`, `B-terra`, `B-sol` entries, each with
  its own positive `limitUsd`. There are no default approved ceilings.
- `localVerification`: `passed: true`, exact `commands`, and an `evidence`
  reference to the matching controlled verification.

Only after that separate approval, the execution entry point is:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:env -- tsx scripts/model-evaluation/run-advanced.ts run /tmp/advanced-context-freeze.json /tmp/advanced-context-authorization.json
```
<!-- markdownlint-enable MD013 -->

Each output directory is single-use. Existing output refuses execution;
there is no automatic retry, restart, budget increase or cap borrowing.
A stopped ledger stops later selected runs. Unknown usage retains its full
reservation, including when a response fails or disappears. Reconciliation
and any new execution require separate review; a new directory alone is not
permission to repeat an attempted dialog. Phase C is not an accepted run ID.

## Evidence and handoff

`campaign.json` retains the freeze and execution revisions, authorization
scope, each run's ledger, observed outcomes and unrun selection. Each Phase A
subdirectory uses ordinary evaluator reports, complete catalog fixtures,
normal correctness checks, calibration and separate direct/assisted results.
Each Phase B subdirectory records calibration and supplemental turn evidence:
request identities/hashes, state checks, pending work, receipts/history,
transitions, timing, input usage, call IDs, costs and missing data.

Raw calls and observations are private gzip JSONL files with mode `0600`.
Review sanitized reports before sharing; keep raw requests, responses and
errors private. Nothing in these commands publishes or changes issue state.
Failed, aborted and unrun work remains evidence. Controlled results are
labelled `controlled` and never establish measured model quality.

The [verification handoff](advanced-context-verification.md) records exact
commands, controlled results and remaining gates. Recall, preserved work,
safe waiting and verified continuation are separate observations. Safe
waiting has no successful completion time. A growth or spending cap cannot
convert an inconclusive result into a model pass or prove a physical limit.

The concrete review proposal is A at $25 per model and the simplified B
diagnostic at $25 per model, $100 combined without borrowing, all still
unapproved. Review the frozen
scope, dated rates and local evidence before granting any execution approval.
The broader evaluation remains open for authorization, real-model execution
and conclusions; completing this preparation does not complete it.
