# Model evaluation issues

Create one `model-evaluation` issue per model and effort level, recording its
modality. A model evaluated at low and high effort gets two separate issues.
For voice, include the selected backend profile in the model identity and link
the text evidence supporting its selection, or the user's explicit selection.
Fill the description before
payment and update its conclusion, result and spending fields when execution
ends. Keep versioned evidence in comments; link it from the description.

A valid failure belongs in evaluation history. A later explicit rerun gets a
new issue linked to its predecessor; completed models keep their recorded
results. Close a finished issue while retaining its label, whether the model
passes or fails. Leave an interrupted evaluation open with its missing work.
For evaluator defects or calibration failures, follow the exclusion guidance in
[run support](run-support.md).

## Title template

`Model evaluation: <provider>/<model> | <effort> | <text or voice>`

Use `not applicable` for models without an effort setting. For voice, write
`<voice model> + <backend model>` in the model field and the backend's effort
in the effort field. Include both providers when they differ.
Keep the title stable; the description carries the current outcome.

## Description template

Copy the following structure and replace placeholders with concrete values.
Use `pending` for uncollected results and `not applicable` for unused settings.
Put the conclusion first: one short sentence, at most two lines, stating whether
the model is qualified, still incomplete or unsuitable, and the decisive reason.
For a diagnostic, state what improved and what still prevents qualification.
Keep counts and technical evidence in the result section below.

```markdown
## Conclusion

<One short sentence: overall verdict and reason; pending before execution.>

## Goal

Evaluate <model/profile> against Skyttel's requirements and compare the result
with the application's recorded model. Correctness comes before time and cost.

## Model and scope

- Run: <run-id>, started <UTC timestamp>
- Provider and model: <provider>, <exact model ID>
- Effort, service tier and limits: <settings>
- Modality: <text or voice; voice model and backend profile when applicable>
- Scenarios and repetitions: <complete catalog; one unless more are requested>
- Conditional replies: <enabled or disabled; declared branches and policy>
- Application model: <effective profile and recorded result issue, or missing>
- Related results: <comparable issues; explicit rerun predecessor if present>
- Voice backend selection: <linked text evidence and reason, explicit user
  selection, or not applicable>

## Reproducibility

- Code: <commit>
- Catalog and fixtures: <source and hashes; audio hashes for voice>
- Scoring: <judge provider/model/effort, configuration hash and controls>
- Provider verification: <official model, limits, pricing and counting sources>
- Local verification: <commands and evidence links>

## Spending authorization

- Authorized scope and optional ceiling: <selected work; USD and budget scope
  if specified, otherwise no cost ceiling>
- Authorization: <user instruction and date>
- Prior spending and holds within scope: <USD and original evidence>
- Conservative reservations and completion estimate: <USD or unknown; reason>
- Actual run spending: pending
- Outstanding holds and remaining budget: <pending; budget not applicable
  when no ceiling is specified>
- Campaign spending outside this scope: <USD and evidence, or not applicable>

## Result and decision

- Status: pending
- Attempts: <pass/fail/inconclusive/error/aborted/not run counts, or pending>
- Assistance: <extra replies, completion after help, question necessity and
  additional time/cost; preserve the unassisted outcomes>
- Qualification: <qualified, failed or incomplete; one complete passing round
  qualifies, every explicitly requested round must pass>
- Response time and costs: <comparable results and regressions, or unavailable>
- Recommendation: pending
- Evidence: <links to versioned records in comments>
- Limitations and remaining work: <missing evidence and specific follow-up>
```

Account for every selected attempt in the result. Link reusable model results
without scheduling them again. Preserve original evidence and publish a linked
correction when a description changes the interpretation of an earlier result.
