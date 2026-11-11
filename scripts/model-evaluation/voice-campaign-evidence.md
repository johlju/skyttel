# Current-application voice preparation

Evaluation maintainers use this record to resolve preparation blockers before
requesting approval for paid voice evaluation. Preparation is not a voice
quality result. No paid execution is authorized by this document.

## Source verification: 2026-11-11

The official model pages confirm Responses tool calling and high effort for
[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
and [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
Both specify 1,050,000 context tokens, 922,000 maximum input tokens and
128,000 maximum output tokens. Keep the full backend and summary output
allowance. The judge has a separately declared 4,096-token output limit.

Standard prices in USD per million tokens are:

- Terra: input 1, cache read 0.05, 30-minute cache write 1.25, output 5.
- Sol: input 2, cache read 0.10, 30-minute cache write 2.50, output 10.

Above 272,000 input tokens, the whole request has twice the input and cache
rates and 1.5 times the output rate. These are API prices, not subscription
allowances. Backend, summary, calibration and content assessment each consume
their own requests. Count reasoning output and actual cache writes; assume
no cache hit. See the model pages and
[pricing](https://developers.openai.com/api/docs/pricing).

[GPT-Live](https://developers.openai.com/api/docs/models/gpt-live-1)
supports the Live endpoint at USD 0.05 per minute, billed per second.
Listening and speaking share the session charge; do not charge each twice.
Silence, backend work and assessment waits while connected also consume
session time. The model page does not establish the existing profile's
128,000-token context value; that value remains unverified.

[Voice cost documentation](https://developers.openai.com/api/docs/guides/voice-latency-cost)
describes 15 seconds charged at WebRTC creation and credited against running
duration. It does not specify the final credit/refund for a session that runs
less than 15 seconds. Do not infer either a 15-second minimum or a refund.
Do not add 15 seconds to an established longer session's duration.
[Session usage documentation](https://developers.openai.com/api/docs/guides/live-conversations)
requires cumulative usage and final usage at closure. Interrupted sessions,
failed creations and missing final usage need retained reservations and a stop,
not a zero-cost settlement. The short-session ambiguity remains a blocker.

[Whisper](https://developers.openai.com/api/docs/models/whisper-1)
lists USD 0.006 per minute. The
[transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
supports verbose word/segment evidence and optional duration usage, but does
not establish the billing quantum or rounding direction. A duration field
is not evidence that fractional seconds are billed without rounding.
The billing quantum remains a blocker. The
[speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
and [deprecations](https://developers.openai.com/api/docs/deprecations)
document timestamp compatibility until shutdown on February 26, 2027.
Account access is untested; do not substitute another transcription model.

## Selection and readiness

[The versioned selection](voice-campaign-selection.json) declares eight everyday
scenarios, one long-conversation scenario and four complex scenarios. It covers
creation, reading, relationships, undo, saving and clarification safety.
This is a limited behavioral sample, not qualification of all 60 everyday cases.
Reuse exact catalog fixtures, ordinary steps and every possible declared reply.
Missing approved audio must remain visible even for scenarios not currently
marked for voice. Audio generation and listening approval are separate work;
paid generation requires its own authorization.

The local audio audit covers 33 scenario/utterance references, including
overlap and optional replies. All references have installed audio with matching
hashes, reference text, format and listening approval. The five additional
everyday recordings are `everyday-01-request`, `everyday-09-request`,
`everyday-25-request`, `everyday-29-request` and `everyday-30-request`.
Those five scenarios are not enabled for voice in the general catalog.
The explicit preparation selection enables voice on copies of those scenarios;
the shared catalog remains unchanged. Missing audio still blocks execution.
Do not silently omit these scenarios or treat the selection as an executable plan.

Use one repetition per model on the current locked application revision.
Keep Terra high and Sol high independent. The separate overlap experiment
uses success, clarification and early stop in both modes on that same revision.
Do not reuse the historical five-repetition or old/new-application plans.
Keep sequential mode as the default. One observation cannot establish a stable
ranking or a general percentage improvement.

## Cost and execution gate

A defensible total estimate is unavailable until billing semantics, selected
audio and session assumptions are resolved. Unknown amounts are null, never
zero. Per-call whole-context reservations are conservative holds, not expected
spending or a user budget. Include fresh judge calibration unless original
eligible calibration evidence is explicitly bound to the plan.

The current control set contains 68 cases. Whole-context holds are USD 3.265
per Terra backend/summary call, USD 6.53 per Sol backend/summary call and
USD 4.67144 per judge call. Fresh calibration therefore reserves USD 317.65792
per independent run. These amounts are neither predicted charges nor spending
limits. Historical descriptions of 43 controls do not describe this selection.

Keep these cost layers separate: listening, backend, summary, speaking,
rendered-recording transcription and content assessment. Listening and speaking
refer to the same shared Live bill. Include all calibration controls, candidate
assessments, extra replies, reconnects, canceled and discarded work. Preserve
unattributed or missing usage and stop before more paid work.

Before approval, bind application and evaluator commits, source hashes,
fixtures, selection, exact audio hashes and listening approvals, profiles,
judge instructions/controls and clarification policy. Refresh this evidence
after any affecting change. Retain recordings, device clocks, independent
transcription and content judgments under `voice-rendered-v1`. Failed,
aborted, inconclusive and unrun attempts have no successful completion time.
Report direct and assisted completion separately, including the whole exchange.

The existing `optimizationPlaybackAssessor()` gate remains closed. Neither
credentials nor a preparation artifact makes it safe to execute. Resolve the
documented gaps and test the concrete voice plan before asking for payment
approval. Publish real outcomes separately for each model/voice combination
only after authorized execution.

## Produce the unpaid preparation artifact

Run from the intended clean evaluator checkout, replacing the placeholder with
its full commit SHA. The application and evaluator use that same revision.
The command accepts no credentials and has no execute mode:

```sh
npm run --silent test:env -- tsx \
  scripts/model-evaluation/voice-campaign.ts <evaluator-commit>
```

Keep the returned JSON under ignored `model-evaluation-results/`. It contains
the exact primary and overlap scenarios, profiles, source and fixture hashes,
audio checks, calibration holds and blockers. The SHA is a declared identity;
the execution runner must independently verify a clean matching checkout.
`status: blocked` and `authorized: false` are deliberate. These review plans
are not executable `EvaluationPlan` objects. Billing verification, assessor
calibration, approved audio and local evidence must be resolved and bound
before constructing an authorized runner configuration. The old
`run-overlap.ts` configuration remains a historical comparison workflow;
do not use its five repetitions or thresholds for this observational campaign.

## Approved everyday fixtures

The [listening page](audio/voice-campaign-listening.html) serves the five
installed Marin recordings at speed 1.15 in 24 kHz mono PCM. Their manifest
entries bind the user's 2026-11-11 listening approval to each exact SHA-256,
with generator recipe and per-clip cost. Their combined generation charge is
USD 0.004347, separate from evaluation costs. The recordings are synthetic.

For an explicitly authorized replacement, use the generator with the relevant
IDs below. Explicit selection can prepare any catalog utterance; omitting
`--step` retains the existing voice-only default. Each replacement needs
listening approval of its exact hash before installation. Preserve all other
approved files.

- `everyday-01-request`: Vi har skaffat Disney+. Lägg till det.
- `everyday-09-request`: Alex använder Spotify.
- `everyday-25-request`: Vad kostar Spotify?
- `everyday-29-request`: Ångra den senaste ändringen.
- `everyday-30-request`: Spara mina ändringar.

The [synthesis model](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)
lists USD 0.60 per million input tokens and USD 12 per million output audio
tokens. Its [Speech API compatibility](https://developers.openai.com/api/docs/guides/text-to-speech)
continues until January 6, 2027. Verify access again before future generation.
Estimate generation separately from evaluation, using explicit input/output
assumptions, and reconcile returned usage. This document grants no authorization
for additional generation or evaluation.
