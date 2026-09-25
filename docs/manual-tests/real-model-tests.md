# Real model evaluations

This guide is for developers checking Swedish instructions against a real
model. The separate Playwright suite uses the configured production model,
`gpt-5.6-terra` with low reasoning, through the production Responses adapter.
It starts a disposable local Skyttel installation with fictional household
data and real HTTP, OAuth, MCP SDK and SQLite. Only identity-provider login
is substituted. It does not open an existing household or use the normal
development database.

## Run explicitly

These tests make billable provider requests. Set `OPENAI_API_KEY` in the
private process environment or an ignored private environment file. Do not
put the value in a shell command, source file or report. The runner does not
search for credentials or load private files automatically.

With the key already available in the environment:

```sh
npm run build
SKYTTEL_REAL_MODEL_TESTS=1 npm run test:real-model
```

With a key in an existing private `.env.local` file, explicitly load it:

```sh
npm run build
SKYTTEL_REAL_MODEL_TESTS=1 node --env-file=.env.local \
  node_modules/@playwright/test/cli.js test \
  --config=playwright.real-model.config.ts
```

An absent key or absent opt-in flag fails the run. Provider failures,
incomplete responses and exhausted request limits also fail; they are not
counted as successful language checks. The normal integration and unit
suites do not discover these tests or contact a real model.

Discovery needs no key and makes no provider requests:

```sh
npx playwright test --config=playwright.real-model.config.ts --list
npx vitest run tests/unit/server/model-mcp-harness.test.ts
```

The second command checks the harness with a synthetic model. In particular,
it deliberately supplies a model that saves after a negative instruction
and verifies that the harness exposes the unwanted tool call and real saved
state. This is harness verification, not evidence of model comprehension.

## What the language check measures

AI-12 sends a Swedish summary request, a negative save instruction, a
hypothetical question, a deferred instruction and a quoted instruction to
the real model. The model receives instructions from actual MCP
initialization and discovers the current tool schemas. The client does not
apply Skyttel's first-party save-intent filter or hide save tools.

Each non-saving turn must finish without `prepare_save` or `save_draft`.
The test independently checks unchanged map, draft, history and save
operations. A final instruction corrects the person's name and saves the
whole draft. The test requires actual proposal and save calls, the corrected
saved value, an empty draft and one matching durable receipt. Restart must
preserve that result. Model prose alone cannot pass the test.

AI-08 asks the model to continue the fictional family draft, resolve the
person's conflicting name, preserve the earlier login-address proposal,
correct the subscription price and save the whole draft. Assertions require
the corrected price, the right person and address, a single whole-draft
receipt and unchanged unrelated objects and relationships. Restart must
preserve the result. This evaluates instruction-following on existing
family data; it does not ask the model to invent or reconstruct that family
from scratch.

Each conversation allows at most 32 provider requests, at most 12 per turn,
and two minutes per turn. The run uses one worker and no retries. These
limits bound the test; they are not a monetary spending cap. Use
Playwright's `--repeat-each` option when collecting multiple independent
outcomes, and report failures rather than rerunning until one passes.

## Evidence and limits

The JSON report is `test-results/real-model/results.json`. Its attached
`real-model-evidence` contains the fictional prompts, replies, actual tool
calls and results, model configuration, UTC timestamp and bounded usage
metadata. Playwright also records the Git commit and working diff. No model
key, OAuth token or request header is attached. Temporary databases are
removed after the test. Browser traces, video and screenshots are disabled.

A successful run verifies those inputs for that model and this MCP SDK
client. It does not establish arbitrary Swedish language understanding or
the behavior of a different model. ChatGPT and Codex may use different
models, instructions and client behavior. Their functional checks can be
automated against those clients where supported; real account sign-in,
MFA and any human consent step remain separate. Human judgement of wording
and usability is also separate from the state and tool-call assertions.
