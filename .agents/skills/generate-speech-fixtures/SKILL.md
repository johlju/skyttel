---
name: generate-speech-fixtures
description: >-
  Generate speech fixtures for Skyttel scenarios. Use when adding scenario
  audio, replacing defective recordings, adjusting a clip's pacing, or
  installing reviewed WAV files.
---

# Generate speech fixtures

Produce reusable speech recordings that clearly express the scenario's
intended utterance at a natural pace. Deliver reviewed WAV files with enough
provenance to reproduce them and identify which audio an evaluation uses.
A checksum establishes file identity; listening establishes correct speech.

## Establish the input

Identify the requested scenarios, voices and changes. Read their utterances
in `scripts/model-evaluation/catalog.json` and the installed audio manifest
in `scripts/model-evaluation/audio/manifest.json`. Preserve approved recordings
and individual pacing overrides outside the requested scope.

Use the catalog's exact text and expectations when replacing defective audio.
For a new scenario, establish its intended text and expected behavior first.
When the user requests different wording, update the catalog so text and voice
share the input. Historical recordings and results retain their original text.

## Generate the selected variants

Use [generation support](references/generation.md) for the current generator,
provider configuration, commands, reuse rules and cost accounting. Resolve
the provider and required credentials before payment. Require authorization
for billable calls; apply a cost ceiling only when the user specifies one.

Reuse complete matching recordings. Generate replacements in a fresh ignored
directory, preserving previous bytes and request records. Record the effective
recipe for each variant, including any clip-specific speed override.

## Review and install

Provide playable links alongside the exact reference text. Have a
Swedish-speaking listener assess every new clip for natural pace and clear
meaning, especially names, amounts, email addresses, negations and corrections.
Automatic transcription can flag discrepancies but cannot replace listening.
Approval of sample clips does not approve other clips from the same recipe.

Record approval or rejection per voice, step and exact SHA-256, with reviewer
and date. Keep rejected recordings for diagnosis. Replace faulty speech with
reviewed audio; preserve the intended scenario expectations.

Install only approved bytes. Preserve their sample rate through validation,
playback and timing. If resampling is needed, review the resulting files;
changing only the WAV header changes playback speed. Update the manifest with
file paths, text, hashes, frame counts, format, recipe and review evidence.
Record a replacement's individual speed and provenance without changing the
defaults for other clips.

Run the relevant audio-integrity, timing and evaluation tests through npm.
Verify that listening links serve the installed bytes. Update the listening
page and any report describing the changed scenarios or recordings.
Historical evaluation evidence retains the audio hashes actually used.

## Deliver the fixture set

Account for every requested variant: installed and approved, rejected, or
awaiting listening review. Provide its location, effective settings and review
status, plus new generation costs separately from reused audio and evaluation
costs. State any remaining work before the recordings can be used.

When preparing a model evaluation, hand off the reviewed manifest and any
unresolved audio defects. Voice order, diagnostic replays and qualification
belong to [voice evaluation](../evaluate-models/references/voice-evaluation.md).
