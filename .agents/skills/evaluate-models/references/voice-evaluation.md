# Voice evaluation

Evaluate the voice model with a selected backend model and effort against the
voice catalog, using approved recordings. Apply
[qualification by scenario group](qualification.md) and the shared execution
rules in [run support](run-support.md).

## Select the backend

Select the backend model and effort from the supplied models' text evidence
before creating the voice issue. Reuse recorded text results or complete the
requested text evaluations first. Choose the candidate whose correctness,
response time and cost support the comparison, and record the linked text
result and selection reason. If the text evidence supports no candidate,
report the gap and defer automatic voice selection. A user-supplied voice
backend can be evaluated directly, with its qualification state reported.
Record the voice model and backend profile together; use the application's
recorded voice result as the comparison reference.

## Configure and verify

Supply an empty `EvaluationPlan.textProfiles` list, set `voice: true` and supply
an explicit `voiceProfile`. Set `voiceProfile.backend` to the selected text
profile and `voiceProfile.id` to the identity of that voice/backend combination.
Supply `playbackAssessorProfile` after verifying its exact transcription model,
word/segment timestamp support, usage fields, billing quantum and price against
primary documentation. Set conservative alignment/confidence limits and a finite
candidate-call limit. Record the profile's sources and verification date. Include
recognition and candidate semantic-judgment calls in the authorized scope and
same budget ledger; available credentials do not authorize these calls.
Check the official [transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create),
[timestamp support](https://developers.openai.com/api/docs/guides/speech-to-text)
and [deprecations](https://developers.openai.com/api/docs/deprecations) before
selecting the assessor. The current adapter requires `whisper-1` verbose word
and segment evidence plus duration usage. Missing support or availability leaves
the selection untested; do not substitute server transcripts.
Verify support for the voice provider's adapter and credentials; record its model,
limits and pricing in the profile. Include the supporting text result or the
user's explicit backend selection in the issue description.

Run every selected scenario marked for voice. Before payment, run focused audio
and voice integrity tests through npm and include their evidence in
`localVerification`.
Record the selected `referenceVoice` and verify its checked-in audio's SHA-256,
frame count, reference text and PCM mono 16-bit format. Confirm that listening
approval covers those exact audio hashes and that no known audio defects remain.
Use each file's declared sample rate for playback and timing.

## Run dialogs

Keep ordinary dialogs connected through recording assessment, close before
summary, then reopen after summary installation. Use the actual audio path rather than
replacement speech or injected delegations/transcripts.

Use the approved Marin recordings for every scenario and conditional reply.
Set `referenceVoice` to `marin`. Preserve each attempt's outcome; investigate
failures using its evidence and record any explicitly requested rerun separately.

Replay the complete affected scenario from its original isolated fixture,
including preceding utterances. Continue ordinary multi-step conversations
within an attempt; stop dependent steps after failure. Replaying a follow-up
against already changed state does not provide a comparable result.

Include remaining active dialog time in reservations before each paid call.
Account for open judge waits and close active voice sessions promptly on stop.

## Behavioral assessment

Assess the actual recognized utterance, available map and tool evidence,
backend answer, spoken answer and resulting state. Report these outcomes:

- **Passed:** the entire prescribed scenario completes, including any
  clarification already written into its ordinary steps, without extra
  clarification. For step counts, identify these as passing steps rather than
  claiming that their whole scenario passed.
- **Accepted — correct clarification, unfinished:** an extra question is
  necessary, relevant and answerable; clear independent changes and factual answers are
  complete, state and save safety hold, and required guidance reaches both
  backend and speech. Identify the unresolved work and the question that
  enables it. A matching recorded answer is optional for assessing this
  response; completion remains unverified until the full exchange succeeds.
- **Completed after extra clarification:** an approved additional reply leads
  to verified completion. Retain the accepted clarification and its cost;
  distinguish this assisted result from a scenario that passed directly.
- **Failed:** incorrect changes, invented identities, unnecessary questions,
  missing independent answers or required guidance, or unsafe saves.
- **Unassessed:** missing evidence or unrun work.

Accept a correct clarification as reasonable handling of the user's input.
Expecting a cooperative user's answer to enable progress is a stated assumption;
completion after that answer remains unverified until exercised. An accepted
question is a valid endpoint for assessing the current response. Reserve
end-to-end completion claims for observed complete dialogs.

Record recognition errors in names and addresses as accepted limitations when
the assistant handles them safely with a relevant clarification. Count these
separately from failures, with reference speech, recognized text, affected work
and the assistant's response. A limitation remains visible even in a qualified
run; zero failures does not mean zero limitations.

For each clarification, record the scenario/step ID, model and effort, whether
it belongs to the ordinary dialog or is extra, reference wording and recognized
wording relevant to the ambiguity, and the actual backend and spoken questions.
Include the blocked work, why the question is justified, any selected reply and
its outcome. Keep these entries in the issue, using stable step IDs to compare
recurring ambiguities across runs while accounting for catalog/audio revisions.
Recommend additional replies when repeated questions make them useful; adding
scenarios or reviewed audio remains separate work.

When evaluating continuation, use an approved catalog follow-up that answers
the actual question under the conditional clarification policy in
[run support](run-support.md#conditional-clarification).
Keep representative dialog tests for forwarding and applying answers, renewed
save permission and context transitions. Full reply coverage for every possible
extra question is unnecessary. Declare which tests require end-to-end completion
before execution; retain every prescribed ordinary step. A stopped dependent
step stays unrun, even when the preceding question is accepted.

Preserve raw catalog checks and automated qualification separately from this
behavioral assessment. Report counts for complete scenarios and individual
steps separately. Report unassisted catalog qualification, completed assisted
dialogs and safe advanced inability separately. State everyday and advanced
qualification scopes using the shared group policy; every designated dialog
in that scope must complete. Link evidence
for each interpretation and date policy corrections to earlier results.

## Evidence and timing

Use `voice-rendered-v1` for user wait. Start at the last nonzero PCM frame of
the unchanged approved input fixture. Exclude only exact digital trailing zeros;
retain the fixture's full drain time, frame count, hash and bracketed input-clock
interval. Backend VAD and received input transcripts cannot establish this origin.

Record the actual negotiated WebRTC remote stream through the common evaluator
WebAudio renderer with one destination. Keep mute, volume, pause, interruption
and output-error behavior visible. Declare the renderer/worklet instrumentation
and its overhead for both compared versions. Never create a parallel speaker or
replace the speech transport. Chromium's RTC media-element source can record
silence despite inbound media; an advancing clock alone is insufficient proof.

Retain bounded PCM WAV recordings and their hashes privately, with native frame
positions, device-clock samples and interruption/error evidence. Quiet periods
only select candidates. Server completion, transcript receipt and a first quiet
gap cannot certify that the complete required response played.

Transcribe only the rendered recording, without expected words or provider
transcripts as hints. Validate usage, word/segment evidence and confidence under
the explicit assessor profile. Have the calibrated semantic judge independently
assess two separate requirements in each candidate call: useful content and the
complete required final response or complete necessary question/safe inability.
Useful content can be a correct relevant partial result before the whole answer;
status, intent, irrelevant content and unverified success claims never qualify.
Keep backend text separate. Unknown recognition,
missing timing, dropped audio or uncertain completeness remains inconclusive.
New audio during offline assessment invalidates the older completion candidate;
retain already verified useful content from its rendered recording. Continue
observation within the declared session and candidate bounds; never promote an
interim status to successful completion.
Live supplies no sample-exact required-response identity. Treat completeness
and request attribution as independent semantic assessments of the recording
and current application facts. Preserve ambiguity as inconclusive; do not claim
that the protocol proves the absence of all future or unsolicited speech.

Finish at the later of correct state and the conservative rendered end interval's
upper bound, including the declared recognition alignment margin. The interval
must be covered by actual output-device clock samples. Word timestamps are
approximate; report uncertainty and avoid sample-exact or physical-audibility
claims. Clamp a completed response preceding input end to zero user wait; retain
the underlying signed observed interval separately.
Use [Web Audio output timestamps](https://www.w3.org/TR/webaudio-1.0/#dom-audiocontext-getoutputtimestamp)
for the actual rendering graph. Captured media or receiver statistics alone
do not establish output-device playback.

Exclude offline recognition/judging wall time from user wait; retain its calls,
usage, cost and unknown holds. Keep queue wait when request-correlated, raw first
response observations and verified usefulness separate. Report the first useful
sample's conservative rendered end as an upper bound, not its first word onset.
Retain each candidate's useful verdict and device-clock interval. An earlier
inconclusive candidate leaves `firstUsefulMs` unknown; `firstVerifiedUsefulMs`
still identifies the first certified useful boundary. Preserve usefulness if a
later tail fails, without granting successful completion. Keep both semantic
requirements in the common comparison identity and existing finite candidate
call reservations. Interrupted, muted, paused,
failed, canceled, expired or unfinished output has no successful duration. Retain
partial state, recordings and every dependent unrun outcome.

For assisted completion, retain the first speech-end origin, each delivered
question/answer and final response. Include subsequent scripted input speech and
application routing/queue waits. Report wall duration and measured between-turn
evaluator gaps separately, excluding those gaps from application wait under the
common immediate-scripted-reply policy. Apply the same rendering, listening,
speaking, fixtures, assessor and judge conditions across application versions;
see [application comparison](application-comparison.md).
