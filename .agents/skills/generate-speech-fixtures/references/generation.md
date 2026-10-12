# Speech generation support

Use `scripts/model-evaluation/generate-speech.ts` from the repository root.
Its `speechRecipe` defines the default synthesis model, voices, instructions,
speeds, PCM format and pricing. The current adapter uses OpenAI; synthesis
models are independent of the backend models being evaluated.
Read the installed manifest for approved per-clip overrides when replacing
or reproducing existing audio.

## Provider and payment

Verify model availability, supported settings and prices against the
provider's official sources before generation. If the provider is unclear,
ask the user. If a requested provider lacks an adapter, explain what is
missing before attempting a paid call. A provider change needs a recorded
recipe and a new listening review.

The current adapter reads `OPENAI_API_KEY`. Check its presence without
printing it. If it is missing, stop and explain how to supply it through the
repository's [private environment-file workflow](../../../../docs/development/devcontainer.md)
or the session environment. Credentials and invocation flags configure access;
the user's authorization permits payment.

## Generate

Generate into an ignored directory:

```sh
npm run test:env -- tsx scripts/model-evaluation/generate-speech.ts \
  --env-file .devcontainer/.env --output tmp/voice-samples
```

Omit `--env-file` when the key is already in the environment. Use a fresh
output directory for an intentional replacement. Select only the needed
utterances and voices:

- `--step <catalog-step-id>` selects an utterance; repeat for several.
  This includes IDs of optional catalog follow-ups. Omitting it selects all
  voice utterances, including those replies. Summary transitions have no audio.
- `--voice <name>` selects a voice; repeat for several. Omitting it selects
  the recipe's voices.
- `--speed <value>` overrides speed for the selected output batch. For an
  individual pacing correction, select both its step and voice.

The script reuses complete matching artifacts without another paid request.
A changed request, corrupted audio or unfinished request stops generation.
Investigate preserved records before resuming. A failed or unknown charge
is not permission to retry. Preserve the original usage evidence and resolve
unknown charges before another paid attempt. Model processing has no deadline;
there are no automatic retries.

## Verify the artifacts

Check the generated manifest and each request/result record for complete
audio, exact input text, effective settings, format, duration and hash.
Reconcile costs with returned usage; separate new calls from reused files.
Keep raw provider event streams and request identifiers private. Review and
installation follow the [skill](../SKILL.md).

## Current adapter sources

- [Speech API and voice options](https://developers.openai.com/api/docs/guides/text-to-speech)
- [Synthesis model and pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)
- [Availability and deprecations](https://developers.openai.com/api/docs/deprecations)

Accepted recordings remain reusable without calling the synthesis provider.
