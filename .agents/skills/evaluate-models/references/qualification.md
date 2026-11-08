# Qualification by scenario group

Use the catalog's groups consistently in plans, judging and reports:

- `everyday`: short questions, simple changes and short follow-up dialogs.
- `long_conversation`: simple requests after extensive conversation text.
- `complex`: long instructions, many changes or simultaneous constraints.

Record conversation length and instruction length as separate dimensions.
Keep advanced scenarios in the catalog. Report each group independently;
use everyday results for the main recommendation and timing comparison.
The extended neutral history is a controlled conversation fixture. Forced
summary coverage does not establish any real model's context limit; report
actual context-limit measurements separately when the run requires them.

## Correctness and capability

Require correct names, relationship directions, object and relationship types,
household and draft ownership, access, and explicit save permission in every
group. Incorrect changes, invented facts, unauthorized saves and lost
instructions block a recommendation regardless of the group's timing.

Count an advanced inability as a capability limit only with evidence of all
three conditions: the limitation is explained, information is preserved, and
the exact unfinished instructions remain available. Use the scenario's declared
alternate state and response contract. Keep its original failure and a separate
assessment; assign no successful completion time. An unexplained failure is
never a safe inability.

## Clarification and completion

Assess whether an extra question is necessary from the current request,
recognized speech and available facts. Record the reason and judgment evidence
separately from the original automated outcome. A question may be correct
handling while the task remains unfinished. Unnecessary questions fail.

Use the declared conditional reply and verify the original target before
counting assisted completion. Report direct and assisted completion separately.
Include the full exchange's additional waiting, calls and costs. Preserve
failed, aborted, inconclusive and unrun attempts without successful completion
times. A selected reply alone proves neither necessity nor completion.

Declare `safeInability` on a conditional reply when an advanced limit can follow
clarification. Specify its complete permitted state after independent work and
nonempty `preservedRequests` for the unfinished instructions and clarified
constraints. The original request remains required. Verify these exact requests
in active pending work; historical transcript alone is insufficient. Keep this
contract separate from the parent's alternate state. Missing retained-work
evidence yields an inconclusive assessment.

## Scope and publication

Read `qualified` as the original unassisted catalog outcome. Read
`finalQualified` with `qualificationScope`, `fullCatalogQualified`, group
results and correctness failures. Everyday qualification covers only everyday
use; it does not qualify an incomplete advanced group. Identify every safe
inability, untested part and regression. Compare timing only for matching
qualification scopes and scenario sets.

State the scope in the issue's conclusion and result section. Keep original
observations, automated outcomes, assessments and completed dialogs distinct.
Publish policy corrections as new linked evidence; preserve earlier records.
