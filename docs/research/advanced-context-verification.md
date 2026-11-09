# Advanced context preparation verification

This handoff is for maintainers reviewing unpaid evaluator preparation.
It accompanies the [run plan](advanced-context-evaluation-plan.md),
[source freeze](advanced-context-evaluation-plan.json) and
[execution proposal](advanced-context-execution-proposal.json).
All verification uses controlled transports. No real-model or real-voice
suite, authenticated provider probe or counting endpoint is part of it.

## Scope and evidence

Comparison baseline: `fa53b628882bac3db69c84c56a0ed90750158cb8`.
The approved test seams are campaign preflight/execution and the public
application context runner with controlled provider transports. The tests
use ordinary authenticated routes, isolated SQLite state and normal
application summary thresholds. Synthetic usage reports exercise natural
summary triggering without lowering context or output limits.

Coverage includes authorization and freeze refusal, exact subset selection,
all calibration controls, phase/model cap isolation, uncertainty stops for
calibration, interpretation, checking, work, summaries and judging, and
single-use execution directories. Supplemental checks cover exact unsaved
continuation, wrong endpoints, unrelated mutations, unauthorized saves,
false completion, lost or replaced pending identity, lost constraints,
missing state or usage, cancellation and an absent transition.

Recall failure remains separate from preserved pending work and verified
continuation. Safe waiting has no successful completion time. Continuation
completion timing covers its submitted request through the observed terminal
application response; total dialog timing includes growth and evaluator
overhead. No controlled outcome establishes real-model quality or a physical
provider context limit.

## Commands

Run through the repository npm scripts and shared process lock:

<!-- markdownlint-disable MD013 -->
```sh
npm run typecheck
npm run lint
npm run lint:docs
npm run test:unit -- tests/unit/server/evaluation-advanced-campaign.test.ts tests/unit/server/evaluation-pending-context.test.ts tests/unit/server/evaluation-context-limit.test.ts tests/unit/server/evaluation-context-probe.test.ts tests/unit/server/evaluation-budget.test.ts tests/unit/server/evaluation-application.test.ts tests/unit/server/evaluation-follow-ups.test.ts tests/unit/server/evaluation-retained-work.test.ts tests/unit/server/evaluation-judge.test.ts tests/unit/server/evaluation-provider.test.ts
npm run test:env -- tsx scripts/model-evaluation/run-advanced.ts preflight docs/research/advanced-context-evaluation-plan.json
```
<!-- markdownlint-enable MD013 -->

Controlled verification: **184 tests pass across the ten suites above**.
After enforcing the $25 ceiling and shortening the paid diagnostic, the
following targeted run passes **32 tests across three suites**, including
all campaign tests and existing plan/revision contracts:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:unit -- tests/unit/server/evaluation-advanced-campaign.test.ts tests/unit/server/evaluation-plans.test.ts tests/unit/server/evaluation-versions.test.ts
```
<!-- markdownlint-enable MD013 -->

After the review-stage evidence-sanitization refactor, all **33 tests in
four affected suites pass**:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:unit -- tests/unit/server/evaluation-advanced-campaign.test.ts tests/unit/server/evaluation-plans.test.ts tests/unit/server/evaluation-versions.test.ts tests/unit/server/evaluation-private-records.test.ts
```
<!-- markdownlint-enable MD013 -->

Final typecheck passes. Repository lint passes with 83 existing warnings;
the changed source files are warning-free. Unpaid preflight passes against
the committed snapshot: 68 judge controls, four possible phase/model runs,
16 growth messages and 20 total user messages per supplemental dialog.

The full `npm run lint:docs` run is interrupted because it traverses the
large archived evaluation corpus. The following scoped Markdown and
spelling checks pass on all three changed Markdown documents:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:env -- node --input-type=module <<'JS'
import { lint } from 'markdownlint/sync';
const files = ['docs/research/advanced-context-evaluation-plan.md', 'docs/research/advanced-context-verification.md', 'docs/research/context-boundary-provider-prerequisites.md'];
const result = lint({ files, config: { default: true, MD060: { style: 'compact' } } });
if (Object.values(result).some((errors) => errors.length)) process.exitCode = 1;
JS
npm run test:env -- cspell --no-progress docs/research/advanced-context-evaluation-plan.md docs/research/advanced-context-verification.md docs/research/context-boundary-provider-prerequisites.md
```
<!-- markdownlint-enable MD013 -->

The source revision and file hashes are in the snapshot. Documentation-only
commits preserve that evaluator source identity. The application revision
remains `fa53b628882bac3db69c84c56a0ed90750158cb8`.

## Integration selection

The cumulative change is evaluator tooling, controlled technical server
tests and preparation documentation. No production application source,
integration scenario, shared installation helper, dependency or runtime
configuration changes. Inspection of `playwright.config.ts`, npm scripts,
the shared test-environment runner and integration imports finds no
integration consumer of the changed evaluator modules.

The integration selection is empty for both normal and production-like
runtimes. No integration run is required to verify this scope. The controlled
server suites above exercise the affected public HTTP application adapter.
Reassessment after the passing runs and ceiling changes preserves this
empty selection: no integration dependency changes. Earlier passing context,
budget, judge, follow-up and application-adapter results remain valid; the
changed campaign paths and shared evidence projection have fresh passing
evidence from the targeted runs.
Any further affecting change requires reassessment.

## Remaining gates

`authorized` remains false and there is no approved ceiling. The maintainer
must review exact phases, per-model caps of at most $25, source identities,
dated rates and
controlled evidence before separately authorizing execution. Credentials and
opt-in flags alone cannot clear this gate. The simplified campaign allows
at most 16 growth messages per model.
No proposed dollar amount promises that natural growth reaches a boundary.
Evidence requiring more than $25 needs a simpler test design, never a
higher ceiling or an automatic repeat.

Phase C remains blocked on a verified counting fee, exact complete-payload
counting, payload parity and separate authorization. An unresolved fee is
unknown, never zero. Original historical verdicts and diagnostics remain
unchanged, and the broader evaluation remains open for real execution and
conclusions.

## Review

The two-axis review compares the cumulative change to the baseline above.
Standards: no documented-rule violations; the duplicated sanitized provider
projection is consolidated and the follow-up review has no remaining
findings. Spec: no findings, including against the $25 ceiling and shortened
context diagnostic. The final source freeze is refreshed after that refactor.
