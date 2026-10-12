# Voice evaluation

Evaluate the voice model with a selected backend model and effort against the
complete voice catalog, using approved recordings. Apply the shared execution
and reporting rules in [run support](run-support.md).

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
Verify support for the voice provider's adapter and credentials; record its model,
limits and pricing in the profile. Include the supporting text result or the
user's explicit backend selection in the issue description.

Run all eight voice scenarios. Before payment, run focused audio and voice
integrity tests through npm and include their evidence in `localVerification`.
Record the selected `referenceVoice` and verify its checked-in audio's SHA-256,
frame count, reference text and PCM mono 16-bit format. Confirm that listening
approval covers those exact audio hashes and that no known audio defects remain.
Use each file's declared sample rate for playback and timing.

## Run dialogs

Keep ordinary dialogs connected, close before final judging and summary, then
reopen after summary installation. Use the actual audio path rather than
replacement speech or injected delegations/transcripts.

Declare voice order and outcome policy before payment. The default is Marin
first, then Cedar as a diagnostic investigation of a failed scenario. Select
the variant with `EvaluationPlan.referenceVoice` or `runVoiceScenario`'s
`referenceVoice` option. Keep the first verdict and record each alternate
attempt's voice, audio hash, cost and outcome separately from qualification.
An alternate success does not replace a failure or establish qualification.
Use a different acceptance policy only when the user explicitly selects it.

Replay the complete affected scenario from its original isolated fixture,
including preceding utterances. Continue ordinary multi-step conversations
within an attempt; stop dependent steps after failure. Replaying a follow-up
against already changed state does not provide a comparable result.

Include remaining active dialog time in reservations before each paid call.
Account for open judge waits and close active voice sessions promptly on stop.

## Evidence and timing

Assess clarifications against the actual recognized utterance and the available
map and tool evidence. A necessary, relevant follow-up that preserves clear
independent changes and avoids invented facts or unauthorized saves is correct
behavior. Report it as awaiting clarification, separately from task completion.
Distinguish genuine ambiguity from unnecessary questions when the available
evidence already resolves the request.

Use an approved catalog follow-up when it answers the actual question. If no
matching follow-up exists, report a coverage gap and leave completion unassessed.
For optional replies, use the conditional clarification policy in
[run support](run-support.md#conditional-clarification).
Preserve raw catalog checks and add the interpretation alongside them; a
justified question alone neither fails the model nor qualifies the whole task.
Continue to report independent errors, including missing required guidance,
incorrect changes and unsafe saves.

Private observations retain fragment/delegation/request IDs, offsets, arrival
times, actual backend text, MCP calls/results, commentary and output
transcripts. Keep backend text and spoken transcript as separate sources for
judging; required content must appear in its designated source.

Start response timing at reference-audio end and use the shared completion
boundary. Preserve negative voice times. Report the two-second quiet
observation separately from response time.
