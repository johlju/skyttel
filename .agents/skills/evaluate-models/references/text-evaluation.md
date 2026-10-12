# Text evaluation

Evaluate the supplied backend model and effort against the complete text
catalog. Apply the shared execution and reporting rules in
[run support](run-support.md).

## Configure and verify

Supply one selected profile ID in `EvaluationPlan.textProfiles`, leave `voice`
false and omit `voiceProfile`. Run all 14 text scenarios through the
application's text path, including summary scenarios. Use the catalog's ordered
utterances and score the application's collected text answer.

Before payment, run the focused text and summary evaluation tests through npm
and include their evidence in `localVerification`.

## Effort surveys

For a requested effort survey, schedule each effort in its own issue.
Explicitly supplied profiles run directly at their requested effort.
Within a survey, escalate a supplied model to medium, then high, only
after a confirmed behavior failure in a complete lower-effort round. Repeat
all text scenarios at each effort. Errors, timeouts, inconclusive judgments
and budget stops provide no basis for escalation or retries.

## Timing

Start response timing at text submission. Use the shared completion boundary
and report call durations alongside correctness and cost.
