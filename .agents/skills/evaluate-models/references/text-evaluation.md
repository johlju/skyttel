# Text evaluation

Evaluate the supplied backend model and effort against the text catalog.
Apply [qualification by scenario group](qualification.md) and the shared
execution rules in [run support](run-support.md).

## Configure and verify

Supply one selected profile ID in `EvaluationPlan.textProfiles`, leave `voice`
false and omit `voiceProfile`. Run the selected catalog through the
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

Use the delivered-response boundary in
[application-version comparison](application-comparison.md) for text timing,
including queue and assisted exchanges. Report successful completion only
after required state and the entire required response are verified. Keep
first-useful response and observed failure times separate.
