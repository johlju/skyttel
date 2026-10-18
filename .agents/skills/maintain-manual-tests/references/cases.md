# Manual cases

## Case writing

Resolve [area template](../templates/area.md) links from the destination under
`docs/manual-tests/`.

- Write concrete Swedish UI actions and observable outcomes. State the
  failure purpose of each bounded variant.
- Keep technical assertions (requests, identifiers, receipt replay, archive
  inspection, pixels, and geometry) in automation or separately runnable
  preparation. Separate preparation commands, required inputs, expected setup,
  and reset steps from the UI procedure.
- Reuse existing fault tools at the actual failure boundary. A lost reply after
  a committed transaction requires control of response delivery; taking the
  browser offline alone does not establish that failure.
- Verify current controls, content, and outcomes in both manual cases and
  matching specs. When retiring UI, describe and assert the resulting workflow
  and remove checks whose sole purpose is confirming the old element's absence.
  Keep functional absence checks for filtering, permissions, and state
  transitions such as closing a dialog.

## Mapping and identity

### Test placement

Keep integration tests as manual user journeys: concrete actions through the
public UI, a user goal and outcomes a person can observe. Require a matching
manual case before adding or expanding an integration scenario. Use bounded
variants that protect distinct user behavior; test shared behavior once.

Place standalone HTTP, archive, numeric rendering, resource and stress checks
in unit/server tests, technical browser tests or measurement scripts. Use real
Chromium for rendering checks and tag technical browser tests
`{ tags: ['technical'] }`. A technical tag does not make a test suitable for
the integration suite. Move existing technical-only integration tests to the
appropriate suite when working on their coverage.

Keep fixture setup and observation helpers separate from the journey. Automated
assertions may verify its visible outcomes, such as a preserved placement or
an unchanged image; internal-state assertions do not replace the UI journey.

### Counterparts

Give each ordinary case one discovered functional counterpart. Compare its UI
actions and protected outcomes with the test's actual actions and assertions;
a request-only check cannot establish browser-form behavior. Isolated fixtures
may differ from manual data when roles, state, and access boundaries are
equivalent. Exact test-title transcription in manual prose is optional.

Technical evidence cannot serve as an ordinary manual counterpart.
Use actual Chromium tests in Vitest's `graphics` project for browser
counterparts. They perform the documented scenario through public controls
with production styles. Distinguish controlled browser responses from actual
HTTP persistence and restart evidence in visible prose and `reference`.
Browser coverage with controlled responses does not prove durable server state.
Vitest's `server` project provides supporting evidence, never an ordinary UI
counterpart.
Existing browser component tests without case IDs remain supporting coverage;
give every ordinary browser counterpart its stable case ID.

### Identity lifecycle

Keep one stable ID per ordinary scenario and discovered functional test.
Prefix the counterpart test title with `CASE-ID:`; generated scenarios each need
their own ID. Functional title IDs must be unique and agree with their manual
case.

Preserve IDs across renames and moves. Split distinct surviving workflows into
new IDs, update index and links together, and record retired IDs with their
survivor or accepted coverage loss in the affected area. Retired IDs remain
unavailable for reuse.

### Metadata

Place one JSON block fenced as `manual-mapping` beneath each `### CASE-ID: ...`
heading. Enclose only the fenced block in an HTML comment (`<!--` and `-->`)
to hide metadata in rendered Markdown. Keep required configuration,
preparation, steps, outcomes, and human observations in visible case prose.
Use the template's ordinary or human-observation branch. Supply:

- `reference`: selected configuration and bounded variants, including their
  failure purpose where several variants share one discovered test.
- `outcomes`: a nonempty array of protected observable results.
- Exactly one `counterpart` object or `humanObservation` object.
- `counterpart`: repository-relative `spec` path and exactly one `caseId` or
  `title`. A `title` selects an exact discovered name; use
  `describe title > test title` when a describe path disambiguates it.
  A `caseId` selects the stable ID prefix. Either selector must resolve to one
  test after generated definitions expand.
- Explicit references include `runner` and `suite`:
  `playwright` / `integration`, `vitest` / `browser`, or `vitest` / `server`.
  Omission of both selects legacy Playwright integration discovery.
  Supply both fields for new counterparts
  and discoverable evidence; real-provider evidence omits them. Runner and
  suite identify evidence strength within the existing mapping system.
  Browser discovery uses the `graphics` Chromium project; server discovery
  uses the `server` project, including process HTTP tests under
  `tests/unit/server/`. A server selector is valid only as evidence.
- `humanObservation`: `kind` and a concrete `observation` the human must
  perform. Kinds are `screen-reader`, `physical-microphone-audio`,
  `os-permission`, `physical-input`, `visual-symbol-recognition`, and
  `external-client`.
  Name the actual speech, device, permission, physical action, symbol meaning,
  or external-account/client compatibility required. Paid or nondeterministic
  execution alone is not a human exception.
- Optional `evidence` array: each item has `kind` (`overlap`, `technical`, or
  `real-provider`), a `spec`, exactly one `title` or `caseId`, and `purpose`.
  Integration/browser overlap and technical browser/server references resolve
  by discovery using the same runner, suite and selector fields.
  Real-provider references verify the file and selector structure without
  loading or executing that separate suite; keep runner and suite omitted.
  Record actual provider execution separately from human observation and
  synthetic integration.

Evidence never adds a second ordinary counterpart. Human-observation cases may
cite nearby automation as evidence without claiming it performs the human
observation.

For example, a moved browser workflow keeps its ID and identifies the new suite:

```json
{
  "runner": "vitest",
  "suite": "browser",
  "spec": "tests/browser/workflow.test.tsx",
  "caseId": "CASE-01"
}
```

Separate HTTP evidence uses `runner: "vitest"`, `suite: "server"`, its
`tests/unit/server/` spec path, an exact `title` and an evidence `purpose`.
Discovery expands real definitions without running test bodies or hooks.
It excludes the client project and paid-provider suites. Mapping validation
checks structure and identity; review the actions and assertions for functional
equivalence before accepting a moved or consolidated counterpart.
