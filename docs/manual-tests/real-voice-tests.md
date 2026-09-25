# Automated Swedish speech check

This opt-in Playwright check sends a fictional recorded Swedish request
through the application's actual WebRTC connection, Live provider, Terra
delegation, MCP and SQLite. Only sign-in and the physical microphone are
substituted. It does not inject transcripts or provider replies.

## Prepare and run

Prepare a PCM WAV recording containing 35 seconds of initial silence,
followed by this spoken request and five seconds of final silence:

> Behåll Lo-förslaget, rätta priset för Familjens Molnmusik till 189 kronor
> per månad och spara hela utkastet.

The initial silence allows the real connection to finish before the
request plays. Keep the recording outside the repository and use only
the fictional words above. A synthetic speech recording also works.
Set `SKYTTEL_TEST_SPEECH_WAV` to its absolute path, without `%`.
Chromium plays it once using its
[file audio capture option](https://chromium.googlesource.com/chromium/src/+/10300ac7da93a7e322274f1e/media/audio/fake_audio_input_stream.cc).

Supply `OPENAI_API_KEY` through the process's private environment and set
`SKYTTEL_REAL_VOICE_TEST=1` to enable billable real-provider calls. The
command fails if these prerequisites are missing; it does not silently
substitute providers or skip the test. Do not run it in pull request CI.

```sh
npm run build
npm run test:real-voice
```

The test uses temporary application storage and synthetic sign-in. It
checks the changed price, resolved family draft, preserved unsent form
text, one durable receipt, nonzero received audio energy, closed media
resources and the same receipt after restart. Traces, screenshots and
video are disabled. The supplied recording remains yours to remove.

## Interpreting the result

The JSON report at `test-results/real-voice/results.json` records the Git
commit and working diff. A successful run attaches the recording hash,
Chromium version, timestamp and synthetic receipt. Record the actual
result. Discovery or missing-key failures are not a successful live run.
Provider or model failures are failures, without automatic paid retries.

This checks one recorded family request, not every dialect or phrase.
Received audio does not establish what a person actually hears through
their chosen speakers. Human assessment of intelligibility, comfort and
physical equipment remains separate; the controlled voice suite covers
reproducible errors, interruption and microphone controls.
