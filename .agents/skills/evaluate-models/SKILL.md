---
name: evaluate-models
description: Evaluate supplied Skyttel models and recommend a model using comparable evidence.
disable-model-invocation: true
---

# Evaluate models

Determine whether the models supplied by the user meet Skyttel's requirements
and whether the evidence supports choosing them over the application model.
Evaluate correctness first, then response time and cost. Deliver a
recommendation backed by reproducible results in `model-evaluation` issues,
one per evaluated model, effort and modality.

## Establish the comparison

Use the user's models, intended text or voice use, and payment authorization.
Ask for missing models or payment authorization before making paid calls.
Apply a spending limit only when the user specifies one, using its stated
scope. An authorized run without a specified budget has no cost ceiling.
Resolve the provider for each supplied model; ask the user when it is unclear.
Confirm that the selected providers are supported and their required credentials
are available to this session. If a key or token is missing, stop paid execution
and explain how to configure it using the credential guidance in
[run support](references/run-support.md).
Identify the model currently used by the application from its effective
configuration. Its corresponding result in a `model-evaluation` issue is the
baseline for comparison. Reuse that result; run the application model or any
previously tested model again only when the user explicitly supplies it.

Test each supplied model at its requested effort directly. A supplied high
profile starts at high; lower-effort results are not prerequisites. Explore
other efforts only when the user requests an effort survey.

Read the reference for each requested modality before selecting profiles or
creating issues:

- Text: [text evaluation](references/text-evaluation.md) covers profile setup,
  scenario coverage, effort surveys and timing.
- Voice: [voice evaluation](references/voice-evaluation.md) covers backend
  selection, approved audio, session handling, evidence and timing.

Load both references when both modalities are requested. Reusing recorded text
evidence to select a voice backend requires only the voice reference.

Search open and closed `model-evaluation` issues in `viscalyx/skyttel`,
including corrections. Identify comparable results by catalog, fixture, commit,
profile, scoring configuration, modality, limits and repetitions. Explain gaps
that prevent a comparison. One complete passing repetition qualifies a model
for its evaluated modality. Run additional repetitions only when the user
requests them; every planned check must pass. Reuse earlier complete passing
results under this rule, preserving original records and linking a policy
correction when their recorded qualification changes.

## Gather evidence

Before paid execution, read [run support](references/run-support.md) for the
runner interface, local verification, provider verification and cost accounting.
Create one issue for each supplied model, effort and modality using the title and
description templates in [issue templates](references/issue-templates.md).
Evaluating the same model at low and high effort creates two separate issues.
Execute and account for each model independently so a stopped model does not
prevent the others from completing. Reuse completed results when evaluating
another model.
Use `scripts/model-evaluation/evaluate.ts` to exercise the real application
against the checked-in catalog. The runner owns scenario ordering, fixtures,
audio, timing and result collection; keep those consistent across runs.

Use the existing catalog, approved fixtures and scoring controls as the
evaluation contract. Scenario authoring and audio creation or modification
are separate tasks. If required fixtures are missing, invalid or unreviewed,
stop the affected evaluation and report what needs attention.
Preserve real MCP writes, receipts and history. A failed calibration or unknown
charge stops paid comparison. Record failures and missing evidence as observed;
never retry a verdict to improve it or count an unrun attempt as successful.
Account for every paid layer; enforce any user-specified budget across its
authorized scope.

## Deliver a decision

Publish each model's versioned results on its issue, using
the publication guidance in [run support](references/run-support.md). Compare
qualified models with the application's recorded baseline.
Recommend a model when correctness and the comparison rules support it;
otherwise explain which evidence is missing. Report regressions and costs
alongside any response-time improvement. Leave production model selection to
the user.

The work is complete when every model issue accounts for its selected attempts
and contains the recommendation, evidence and limitations, actual spending,
remaining budget when applicable and work needed to finish qualification.
A stopped model still needs that report; it remains an incomplete evaluation.
Link the model issues in the final response so the user can select individual
follow-up runs.
