# Evaluation run support

Shared execution and reporting rules for either modality. Use the selected
modality's reference from `SKILL.md` alongside these rules.

## Prepare a paid run

Read `scripts/model-evaluation/catalog.json`, `judge-controls.json` and
`profiles.json` for the approved scenarios, controls and provider profiles.
Use the catalog's exact ordered utterances, full fixture and whole-state
expectations. Older model tests supply diagnostics, not this catalog's oracle.

Resolve each model's provider from the user's selection or verified provider
metadata. Ask the user when the choice is ambiguous. Inspect the runner's
adapters and profile schema to confirm support for every selected provider,
including the content judge. If an integration is missing, stop and explain
the missing capability; preserve the user's selection.

Verify model IDs, supported effort settings, context/input/output limits,
service tier and all applicable input/cache-read/cache-write/output prices
against that provider's official documentation. Refresh `profiles.json` when
needed. Record unavailable profiles without substituting a model or provider.

Use the selected model's verified maximum output for backend and summary
evaluation calls unless the user requests a lower limit. Output includes
reasoning as well as visible text. Record any lower limit and classify a
response truncated by it as configuration-limited evidence. Preserve the
selected judge's recorded output limit for comparable scoring; record and
recalibrate any change to that profile.

### Credentials

Find each provider adapter's credential configuration and verify that the
required key or token is readable by the evaluation process. Check presence
without printing its value. If it is missing, stop before any paid call and
explain the provider-specific setup: where to obtain the credential, the exact
environment variable or secret setting the adapter reads, and how to make it
available to this session.

Use the private environment-file workflow in
[`docs/development/devcontainer.md`](../../../../docs/development/devcontainer.md)
when the adapter reads environment variables. Load the configured file into
the evaluation process, or explain which environment reload or session restart
is needed. Give instructions for the selected provider rather than an assumed
provider. Keep credential values out of chat, reports and committed files.

If the provider rejects requests because of quota, credits or an enforced
account spending limit, stop paid execution and explain the provider's error
and the account setting needed to restore API access. Record untested models
as unrun and preserve the rejected request's evidence and cost accounting.

### Spending

Credentials and opt-in flags are configuration. Require explicit authorization
for billable calls. Apply a dollar ceiling only when the user specifies a
budget; otherwise execute the authorized scope without a cost ceiling.
For a specified budget, record its scope: per model run or combined campaign.
Include prior calls and outstanding holds within that scope. A per-run ceiling
covers calibration, backend, summary, voice and counting for that model's entire
run, rather than a new allowance for each scenario. Report campaign spending
separately; preserve historical ledgers when the authorization scope changes.
Verify prior consumption from original usage evidence. Account for a documented
conservative reservation in full, distinguishing it from estimated actual
spending. Unknown charges retain their holds and must be resolved before new
payment.

Use conservative whole-context reservations for every request, including
summaries. Exact counting is optional: verify the complete outgoing payload and
its fee before supplying `EvaluationPlan.counting`, then reserve and settle
counting fees through the same ledger. Missing counting support or fee evidence
does not block a run that uses whole-context reservations. With a specified
budget, a request must fit using its verified exact count or conservative
maximum. Byte-based estimates and assumed cache hits cannot establish that it
fits.

Run focused evaluation application, budget, provider and report tests through
npm before payment, plus the selected modality's checks. Require real isolated
SQLite/MCP save receipts and history, plus observed rejected unsolicited saves.
Record commands and evidence in `localVerification`.

## Use the runner

Before payment, create each model issue using
[issue templates](issue-templates.md). Each issue represents one model, effort
and modality at a specific evaluation revision. Keep a separate directory and
ledger for each model run.

Call `evaluateModels` through `npm run test:env -- tsx` using a temporary
agent-written driver. Set modality-specific profiles as described in the
selected reference. Supply the application's `baselineProfiles`,
a separately verified `judgeProfile`, authorization, verified prior spending,
local verification and eligible recorded `references`. Include prior spending
in `priorUsd` only when it belongs to the authorized scope; explain that scope
in `priorSource`. Supply `limitUsd` only for a user-specified budget; omit it
for an authorized run without a ceiling. Read `EvaluationPlan`
in `scripts/model-evaluation/evaluate.ts` for the current interface. Keep raw
requests, observations, reports and the persistent atomic ledger in ignored
`model-evaluation-results/<run-id>` artifacts. Keep raw transcripts and
credentials private.

The judge is a separate model that assesses semantic response requirements
that fixed application-state checks cannot decide. Choose and record its model
and effort in the run configuration. Its calibration must pass before its
verdicts can support a comparison. Check recorded references against the current
`judgeSha256`, which identifies the judge provider, model, effort, instructions
and controls.
The runner executes every checked-in judge control first, using one call to
the selected judge per control and requiring all expected outcomes.
A control deviation, missing usage or failed local gate stops comparison.

Preserve the application, assistant, MCP, write guards and SQLite. Select one
backend/summary profile and its context capacity per run. Summary scenarios use
the internal ordinary-summary hook, preserve eight neutral historical posts
and prove that the price turns are outside the tail. Keep context limits and
usage authentic; summaries come from the selected model.

Reserve complete request maxima before each paid call. Account for failures,
interruptions, reasoning and cache writes. Unknown usage retains its hold and
stops new calls. Any user-specified ceiling stays fixed within its ledger;
a changed scope uses a separate ledger.

## Preserve and publish evidence

Private observations retain request IDs, actual backend text, MCP calls/results
and the selected modality's delivery evidence. Label missing or ambiguous links;
diagnostics cannot establish success without the required evidence.

Stream private calls and observations to the runner's JSONL gzip files as they
arrive. Decompress concatenated gzip members to read the original records.
Keep full MCP payloads on disk and identity/timing metadata in memory.
Admission refused before any provider call is `not_run`, with no behavior
verdict or completion time. A stop after paid execution begins is `aborted`;
retain its charges and observed error time.

Judge each step once in one tool-free call covering all requirements.
Score the application's collected answer. Provider prose discarded by the
application is diagnostic evidence, not a delivered answer.
Give the judge the actual state, receipt and history snapshot from the fixed
checks; use those facts to ground confirmations. Historical summaries describe
earlier context. Required response content must appear in its designated source.
Missing required content in complete text fails; incomplete collection without
proof is inconclusive. Stop dependent steps after fail, error, aborted or
inconclusive outcomes, except for the declared clarification path below.
Unrun steps have no judge result.

### Conditional clarification

When requested, set `EvaluationPlan.followUps` to true. The catalog's optional
replies are shared across models and selected by the meaning of an explicit
question, using the calibrated judge. Record this policy before payment;
compare runs with the same catalog, controls and assistance policy.

Preserve the base attempt's verdict. A follow-up may continue a failed state
check only when required response content passes and the complete state matches
the branch's declared waiting state. That state must preserve independent work
and save safety. Send one uniquely matched reply at most once for that step,
in the same conversation. Check completion against the original target before
continuing ordinary steps. Missing, ambiguous or unsupported questions stop
the path; adding replies is scenario maintenance for a later run.

Report unassisted outcomes and assisted completion separately, including the
question, selected reply, additional calls, elapsed time and costs. A successful
reply does not erase an unnecessary question or qualify a failed base round.
Assess question necessity from recognized input and available facts. Include
waiting and routing time in assisted completion time; never substitute it for
the base attempt's timing. For voice, verify every possible reply's reviewed
audio before payment, and require the question in both backend and voice.

### Timing

Timing starts at the selected modality's input boundary and finishes at the
later of correct state and the final required response fragment. Report startup,
first backend/result and individual MCP timings. Failed attempts retain observed
stop/error times without successful completion times.

Allow model calls and accepted tasks to finish without processing deadlines,
including SDK and response-header/body timers. Preserve user cancellation,
transport failures and any user-specified spending ceiling. Record each call's
start, end and elapsed time, and each completed step's response time.
Present correctness first, then speed, then cost. Leave the decision about
acceptable speed for its cost to the user; elapsed time alone is no failure.

Use `publicEvaluationText` from
`scripts/model-evaluation/public-output.ts` on issue titles, descriptions and
agent-written commentary before publication. Provider session IDs become stable
SHA-256 references; raw IDs belong in private artifacts.
Use `scripts/model-evaluation/publication.ts` to prepare result comments. It
sanitizes ordinary and oversized records before sizing, hashing or compression.
Preserve every returned record's versioned public JSON; oversized records use
lossless `gzip+base64` transport with a SHA-256 of that public JSON. Group related
records into readable comments when useful; keep every comment within the
publication size limit.

Before using transported results, collect every part with the same hash in
part order, join the payloads, decode base64 and decompress gzip. Verify the
SHA-256 of the restored UTF-8 bytes before parsing the original record.
Transport parts represent storage, not additional evaluation attempts.
After publication, retrieve comments and verify ordinary JSON or restored
transported JSON against the sanitized local records. For older artifacts,
apply `publicEvaluationText` before comparison.
For multiline GitHub text, write an exact temporary file with an editing tool,
then issue a separate literal
`gh ... --body-file /absolute/path` command. Verify real newlines in the issue
body and retrieved comments. Publish corrections as new comments referencing
the original records.

When application, evaluator or fixture defects prevent a run from fairly
assessing the model, explain the cause and affected evidence, remove its
`model-evaluation` label and close the issue.
Treat a calibration stop before candidate testing the same way. Retain the
records and charges for diagnosis and spending reconciliation. Report the
required correction; start a new run only after the cause is resolved.
Keep valid candidate failures in evaluation history.

Present correctness first. Use one repetition by default. Qualification requires
every fixed/content check to pass in the complete selected catalog; all
repetitions requested by the user must pass. Report equally weighted scenario
medians, min/max, each repetition's total, costs and regressions. Label
comparisons in text as well as red/yellow/green. Show response-time differences
and their costs so the user can decide whether the improvement warrants a switch.
A failed reference and qualified candidate may support a correctness
recommendation without comparable speed. Compare timing only for matching
repetition plans.
Report the repetition count; qualification does not establish a statistically
certain ranking.

Even on stop, report missing attempts, remaining budget when applicable, a new
conservative completion estimate, comparison limitations and a recommendation.
Identify an unfinished evaluation as incomplete. Preserve original evidence
when applying the current qualification rule to earlier complete passing runs;
publish the changed interpretation as a linked policy correction.
