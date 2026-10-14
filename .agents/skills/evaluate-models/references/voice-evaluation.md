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
- **Accepted — correct clarification:** an extra question is necessary,
  relevant and answerable; clear independent changes and factual answers are
  complete, state and save safety hold, and required guidance reaches both
  backend and speech. Identify the unresolved work and the question that
  enables it. A matching recorded answer is optional for this assessment.
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
steps separately. A fully passing run completes every prescribed scenario
without extra clarification. Report acceptance with clarifications separately,
with explicit scope and any unverified continuation; all designated dialog
tests must still complete before claiming full qualification. Link evidence
for each interpretation and date policy corrections to earlier results.

## Evidence and timing

Private observations retain fragment/delegation/request IDs, offsets, arrival
times, actual backend text, MCP calls/results, commentary and output
transcripts. Keep backend text and spoken transcript as separate sources for
judging; required content must appear in its designated source.

Start response timing at reference-audio end and use the shared completion
boundary. Preserve negative voice times. Report the two-second quiet
observation separately from response time.
