# Run Skyttel tests

Prepare dependencies and Chromium with the
[development environment guide](devcontainer.md). Run these commands from
the repository root. Automated tests create temporary databases and
synthetic identities; they need no provider credentials or running
`npm run dev:all` process.

Test runners use one worker locally and in CI to limit peak CPU and memory
usage. Playwright runs tests sequentially. Vitest runs files sequentially
and runs its graphics, server and client projects one after another. Node
workflow gate tests run one file at a time. This reduces resource contention
at the cost of longer test runs.

Builds and test commands also share an operating-system lock across the
user's worktrees. A second command exits with status 75 and identifies the
active command; rerun it after that command finishes. The lock is released
when the process exits, including after interruption. Use the npm scripts
instead of launching test runners directly. These commands require Python 3
on Linux or macOS; Python is included in the devcontainer.

## Model evaluation history

A **scenario** is a fixed starting map and a sequence of requests with
expected results. An **evaluation run** executes selected scenarios with
specified model profiles and repetitions. Its **run issue** is a GitHub
issue labelled `model-evaluation`; **result history** is the collection of
those issues and their versioned result comments, including corrections.

The comparison baseline is the model currently configured in the application
and its corresponding result in a labelled run issue. Every evaluation follows
the same workflow and creates a separate run issue for each model, effort level
and modality.

Invoke `$evaluate-models` with one or more models, the intended comparison
and the required payment authorization. A spending limit is optional; provide
one only when a cost ceiling is wanted.
One complete passing repetition qualifies the model for the evaluated modality.
Additional repetitions run only when requested, and every planned check must
pass. Previously tested models are compared using their recorded results and
run again only when explicitly supplied for the new
run. A supplied effort is tested directly; testing high does not require
testing low or medium first. Other efforts are explored only for a requested
effort survey. A stopped or incomplete run remains useful evidence but cannot
establish a model's qualification.

Optional catalog replies can exercise clarification without replacing the
base result. Enable them explicitly with `EvaluationPlan.followUps` and use
the same policy for compared models. The runner sends a reply only after a
matching question and a safe, declared waiting state. It records completion
after help separately from the original verdict, including extra time and
cost. A successful follow-up does not by itself establish qualification.
Voice runs require reviewed audio for every possible reply before payment.

Model calls and test steps have no fixed processing deadline. Record elapsed
time for each call and response; assess correctness before speed and cost.
The user decides whether the measured speed is reasonable for its cost.
User cancellation and transport failures still stop work.

Identify the API provider for each model; specify it when the model name is
ambiguous. Required credentials must be available to the evaluation process.
Missing credentials stop paid execution with provider-specific setup guidance.

Find past runs with the repository's issue-tracker search for the
`model-evaluation` label, including open and closed runs.
Read the run manifest before comparing results: catalog, application commit,
scoring configuration, modality and repetition plan must match. Review profile
settings, limits and prices. Read every correction
comment and the final recommendation. Raw provider requests and transcripts
stay in ignored local artifacts; the issue carries shareable results.

For a single provider integration regression, use the real-model or real-voice
suites below. Use `$evaluate-models` for catalog qualification and model
comparison. Both workflows require explicit authorization for billable calls.

## CI font profile

CI uses the bundled DejaVu Sans regular and bold fonts for system-font
matching. The same profile runs locally on Linux, including the
devcontainer, without installing fonts or changing application styles:

```sh
npm run test:unit:ci -- --project graphics
npm run test:unit:ci -- --coverage
npm run build
npm run test:integration:ci -- tests/integration/assistant-map.spec.ts
```

The profile checks that Fontconfig selects the bundled font before running
tests. It controls font selection, not differences in GPU, architecture or
operating-system scheduling. Use the devcontainer for this profile on
macOS. Ordinary test commands retain the local environment's fonts.

## Unit tests

Run the complete Vitest suite:

```sh
npm run test:unit
```

Run one file, or filter its test names with a regular expression:

```sh
npm run test:unit -- tests/unit/server/config.test.ts
npm run test:unit -- tests/unit/server/config.test.ts -t 'default listener'
```

For repeated edits, start watch mode and leave the terminal running:

```sh
npm run test:env -- vitest watch tests/unit/server/config.test.ts
```

Vitest reruns affected tests after changes. Press Ctrl+C to stop watching.
The npm `test:unit` script uses `vitest run`, so it exits after one run.

Use `--project server`, `--project client` or `--project graphics` to select
one configured project. Graphics tests use headless Chromium with WebGL 2:

```sh
npm run test:unit -- --project graphics
npm run test:unit:coverage
```

Coverage checks every TypeScript and TSX file under `src`. The thresholds
are 85% for statements, lines and functions, and 90% for branches. The
coverage command prints its summary and writes an HTML report under
`coverage/`. Unit tests do not need an application build first.

## Integration tests

Playwright starts isolated application installations and drives the browser
and public HTTP endpoints against real SQLite. External provider responses
are controlled. Rebuild before running browser tests so their client bundle
matches the current source:

```sh
npm run build
npm run test:integration
```

Run one spec, or select tests by a title fragment or case ID:

```sh
npm run build
npm run test:integration -- tests/integration/bootstrap.spec.ts
npm run test:integration -- --grep 'ACCESS-01'
```

List selected tests without executing them:

```sh
npm run test:integration -- tests/integration/bootstrap.spec.ts --list
```

Validate manual-case references against integration, Chromium browser and
server-suite discovery:

```sh
npm run test:manual-mapping
npm run test:manual-mapping -- --area docs/manual-tests/map.md
```

Repeat `--area` to validate several files during a coordinated migration.
The full command checks every functional integration test and every browser
test with a stable case ID has one manual counterpart. Existing browser
component tests without IDs and technical server tests remain supporting
coverage. New references select a runner and suite; legacy references keep
selecting integration tests. Discovery expands definitions without executing
test bodies or hooks, application requests or paid-provider suites.
This checks structure; compare the actions and outcomes to assess whether a
manual case and its counterpart protect the same scenario. Controlled browser
responses demonstrate UI behavior; persistence and restart assertions must
exercise a real server. Record such supporting evidence separately for browser
replacements and keep those boundaries explicit when moving coverage.

`npm test` builds the application, then runs all unit and integration tests.
The ordinary suites do not make billable provider calls. Keep their inputs
synthetic and do not point fixtures at an existing household database.

## Investigate browser failures

Playwright retains traces for failures under `test-results/`. Generate an
HTML report for a focused run and open it on port 9324:

```sh
npm run build
npm run test:integration -- tests/integration/bootstrap.spec.ts --reporter=html
npm run test:report
```

In the devcontainer, open the forwarded port from VS Code's **Ports** panel.
The report contains the failed assertion, error context, retained trace and
failure screenshot. The default diagnostics reporter also writes runner
output, including fixture-server console output, to
`test-results/diagnostics/runner.log`. A custom `--reporter` overrides the
default reporters; include `./tests/support/diagnostics-reporter.ts` to
retain this log. Stop the report server with Ctrl+C when finished. Fixture
inputs must contain only synthetic data.

The reporter also writes `test-results/diagnostics/resources.jsonl` every
five seconds and at each failure. Each timestamp identifies active tests
and records host CPU use, memory and pressure, cgroup CPU quotas and
throttling counters, memory limits and OOM counters, and the runner's
worker/browser process tree with CPU use and resident memory. The journal
is written during execution, so samples remain if a worker crashes before
it can attach its own diagnostics. Missing Linux fields are recorded as
unavailable. Host memory and CPU totals describe the host; cgroup limits
and counters describe the recorded cgroup directory.

Browser tests using the shared fixture attach `browser-diagnostics` JSON
on failure. It contains browser errors and crashes, failed HTTP requests,
pending request paths, worker heap usage, renderer long tasks, WebGL context
loss/restoration events, GPU identity and browser process CPU times. The
page snapshot records map canvas and region geometry, document readiness
and focus. It omits request headers, bodies and URL queries. Browser
inspection has a two-second deadline and records an unavailable result
when the renderer cannot respond.

Correlate the resource journal and browser events with the retained trace.
OOM counter changes, rising resident memory, CPU saturation and throttling
provide different evidence from an application error or an incomplete page
transition. Background scenarios wait up to 30 seconds for the canvas after
returning from settings; functional test deadlines remain separate from
the background profiler's response and frame budgets.

CI runs unit coverage and the complete integration suite in separate,
independent jobs. Workflow gates, lint, type checks, build validation and
container checks remain in the `application` job. That required check
also verifies that both test jobs succeeded.

On a failed CI job, download its `unit-test-diagnostics-<attempt>`,
`integration-test-diagnostics-<attempt>` or
`application-test-diagnostics-<attempt>` artifact from that workflow run.
These retain failure artifacts and test command logs for seven days. Unit
and container logs live separately from Playwright output. Vitest failure
screenshots under `.vitest/attachments/` are included. Logs include
fixture-server output; no live provider or household data belongs in these
ordinary checks.

For interactive reruns in a host browser, start Playwright's UI on the same
forwarded port after stopping any report server:

```sh
npm run build
npm run test:integration -- --ui --ui-host=0.0.0.0 --ui-port=9324
```

Keep the forwarded port private. Select the affected spec or test in the UI
and inspect its actions and assertions. Rebuild after changing application
client code before rerunning. If your environment has a graphical display,
`--debug` instead opens the Playwright Inspector with a visible browser.

### Interactive fixture processes

To investigate browser behavior with controlled provider responses, build
the application and launch one disposable fixture from the repository root:

```sh
npm run build
node --import tsx scripts/manual-text-assistant.ts
```

Use `scripts/manual-voice.ts` for voice controls, `scripts/manual-costs.ts`
for usage and costs, or `scripts/manual-export.ts` for an active download.
Each starts an isolated application with synthetic identities and a new
temporary database. They need no provider key. Voice and cost fixtures use
silent media; they do not test physical microphones, speakers or real speech.

Keep the process open. Its `ready` event prints an `origin` and temporary
`directory`. Forward that port privately to the same host port and open the
exact `http://127.0.0.1:PORT` origin in a fresh browser profile. Google signs
in as the synthetic Alex. Create fictional data when the fixture is empty.
Enter `help` in the launcher terminal to list its controls. The export
launcher uses `pause`, `inspect`, `resume` and `quit` instead of `help`.
Enter `quit` or press Ctrl+C and wait for `closed` before removing the port
forward and closing the browser. Verify the printed temporary directory is
gone. After a forced stop, stop any surviving process before removing only
that launcher's printed directory.

The cost integration tests launch `manual-costs.ts` directly. Other suites
use test helpers directly; starting these interactive processes is optional
and is not a prerequisite for Playwright or personal account confirmations.

For the headed delivery-control fixtures, choose an installed Chrome with
`--chrome`. This selects Playwright's `chrome` channel and prints the browser
version; it fails if Chrome is unavailable instead of substituting Chromium.
Without the option these fixtures use Playwright Chromium. Build first, then
run one launcher on a desktop with a graphical display:

```sh
node --import tsx scripts/manual-draft-save.ts --chrome
node --import tsx scripts/manual-draft-removal.ts --chrome
node --import tsx scripts/manual-conflict-continuity.ts --chrome
```

Use only one launcher at a time and enter `quit` when finished. `--headless`
is available for automated preparation checks; those checks do not execute
assistive technology or physical devices. These disposable loopback fixtures
use synthetic authentication. Physical phones require an ordinary test
installation with configured HTTPS, provider sign-in and household membership.

### Physical-device manual preparation

Use an ordinary, disposable test installation at a DNS name reachable from
the desktop, iPhone and iPad, for example `https://skyttel-test.example.com`.
Build or deploy the commit being checked using the
[installation runbook](../operations/installation.md#build-start-and-restart)
or the [Render runbook](../operations/render.md). Configure its public
`SKYTTEL_ORIGIN`, persistent test database, authentication secret and both
providers using [production authentication](../operations/authentication.md).
Register both callbacks at that exact HTTPS origin. The HTTPS ingress needs
a certificate trusted by every device and must forward the application's
requests and WebSocket connections. A forwarded loopback fixture and its
synthetic provider do not supply this preparation.

1. On each device's actual network, open the installation's `/healthz`
   address. Expect `{"status":"ok"}` without a certificate warning or a
   desktop-only forwarding requirement. Then open the HTTPS application.
2. Complete a fresh real-provider sign-in as the designated test
   administrator and create the disposable household through the app.
   For an existing test household, verify current administrator membership
   under **Inställningar → Administrera tillgång**. Use the same verified
   Skyttel account on the desktop and phones when the case reads that
   user's private proposals. Matching display names do not share a draft.
   Another participant needs an accepted invitation and current membership
   before opening the household's full address.
3. Prepare the area's fictional data through ordinary forms or browser
   export/import. Imports retain access membership; they do not grant it.
   An imported private draft from another installation does not become the
   real test user's draft automatically. Either explicitly restore its
   verified owner through the existing recovery workflow or import a
   baseline with empty drafts and recreate private proposals through forms.
4. Before each case/device, restore that case's baseline, recreate its
   private proposals as the same test user and close other test tabs.
   Clear this HTTPS origin's browser site data on the target device, sign
   in again and open the household's full address. This resets browser
   search, filters, form text and presentation state without treating a
   server restart as a data reset. Recheck the prepared saved and proposed
   meanings in the target browser before enabling the actual assistive
   technology or starting the physical-input observation.
5. Record the commit, HTTPS origin, device, OS, browser, assistive technology
   and actual zoom. Report real sign-in and physical observations only
   when performed. A local synthetic smoke establishes neither. No model
   or voice key is needed for ordinary forms and reading. Open the text
   view without starting a conversation when a case needs unsent text.
6. After the final case, sign out on every device, clear the test origin's
   site data and remove the private fictional archives. Stop the disposable
   installation and remove only its test database/storage using the host's
   documented cleanup; remove test-only DNS/ingress and provider callbacks
   if they were created for this run. Retain the ordinary installation's
   data and settings when using a separately provisioned test instance.

### Delivery controls for an ordinary HTTPS test installation

Use `scripts/manual-transport.ts` to control delivery to a fictional test
household in an ordinary installation. Run it on the application host with
Node and the repository dependencies available. The application must already
use the public HTTPS origin, real provider callbacks and ordinary membership.
Keep its configured origin unchanged. Start the built application first.

```sh
npx tsx scripts/manual-transport.ts \
  --origin https://skyttel-test.example.com \
  --upstream http://127.0.0.1:3300 \
  --household TEST_HOUSEHOLD_ID --port 4318
```

Replace the origin, application port and household ID with this test
installation's values. In the existing HTTPS ingress, temporarily route this
test origin to `127.0.0.1:4318`. Preserve the original `Host`, `Origin`, cookies
and WebSocket upgrade headers. Keep both application and transport listeners
private. The browser continues to use the same HTTPS origin; the transport
does not provide certificates, authentication or membership. Verify fresh
provider sign-in, HTTP reads and conversation WebSocket connectivity before
arming a rule. A wrong `Host` produces HTTP 421.

The terminal accepts one rule at a time:

```text
arm stage:before
status
release
arm save:drop-after
```

Routes are `stage`, `save`, `resolve`, `discard`, `read` and `recover`.
Only the configured household's matching requests consume a rule. `before`
holds a request before forwarding; `after` holds its actual completed
response. `drop-before` drops without forwarding; `drop-after` forwards and
drops the completed response. `release` delivers held traffic; `drop` loses
it. `clear` cancels an unconsumed rule. A held or active delivery must finish
before another rule can be armed. `status` reports only control state.
Events contain the route, phase and actual response status, without request
bodies, credentials or household values. Other traffic passes through.

Restore the ingress to the original application listener before entering
`quit` or sending Ctrl+C. Closing the transport terminates held deliveries;
recover their outcomes through the ordinary application afterward. The
transport never deletes application data. Remove this temporary route after
testing. Loopback Playwright checks verify real HTTP and SQLite effects;
they do not verify a hosted certificate, physical devices or screen readers.

### Offline map fixtures

For interactive upgrade or household-isolation debugging, the helper
`scripts/prepare-manual-map.ts` prepares synthetic data from verified test
identities. Complete [local sign-in](devcontainer.md#set-up-local-sign-in)
first. Stop ordinary development and keep ports 3300 and 5173 free.
Start a disposable installation from the repository root:

```sh
umask 077
SKYTTEL_MANUAL_MAP_DIR=$(mktemp -d /tmp/skyttel-manual-map-XXXXXX)
printf 'SKYTTEL_DATABASE_PATH=%s/verified.sqlite\n' \
  "$SKYTTEL_MANUAL_MAP_DIR" > "$SKYTTEL_MANUAL_MAP_DIR/case.env"
env -u SKYTTEL_DATABASE_PATH \
  node --env-file="$SKYTTEL_MANUAL_MAP_DIR/case.env" scripts/develop.mjs
```

In a new browser profile, sign in as the configured administrator and create
Linden. Choose one preparation below; use a fresh directory for the other.
Obtain the selected user's ID in that user's browser Console:

```js
(await (await fetch('/api/bootstrap')).json()).user.id
```

Copy only that ID, never cookies or provider tokens. Stop the server before
running the helper. It refuses an ordinary development database and requires
an identity established by the actual provider login.

#### Legacy contract upgrade

Use the administrator's ID and run in the same terminal:

```sh
SKYTTEL_MANUAL_USER_ID='paste-Alex-user-id'
node --import tsx scripts/prepare-manual-map.ts \
  legacy-contracts "$SKYTTEL_MANUAL_MAP_DIR" "$SKYTTEL_MANUAL_USER_ID"
printf 'SKYTTEL_DATABASE_PATH=%s/legacy.sqlite\n' \
  "$SKYTTEL_MANUAL_MAP_DIR" > "$SKYTTEL_MANUAL_MAP_DIR/legacy.env"
env -u SKYTTEL_DATABASE_PATH \
  node --env-file="$SKYTTEL_MANUAL_MAP_DIR/legacy.env" scripts/develop.mjs
```

The helper creates a separate `legacy.sqlite` and refuses an existing file.
Startup upgrades it. Sign in again as the same administrator. For a restart,
repeat only the last server command; do not rerun the helper or `db:setup`.

#### A second household on the same installation

Before stopping the original `verified.sqlite` installation, sign in as a
different real test identity in a separate browser profile. Do not invite
that user to Linden. Obtain that user's ID, stop the server and run:

```sh
SKYTTEL_MANUAL_USER_ID='paste-Robin-user-id'
node --import tsx scripts/prepare-manual-map.ts \
  second-household "$SKYTTEL_MANUAL_MAP_DIR" "$SKYTTEL_MANUAL_USER_ID"
env -u SKYTTEL_DATABASE_PATH \
  node --env-file="$SKYTTEL_MANUAL_MAP_DIR/case.env" scripts/develop.mjs
```

The helper creates Eken for the selected user, who must have no membership.
Reload both profiles. After later accepting an invitation to Linden, open
Linden's full address explicitly if that user still lands in Eken.
For a restart, repeat only the last server command with the same database.

#### Remove the offline fixture

Stop the server, close the browser profiles, then run in the same terminal:

```sh
rm -r -- "${SKYTTEL_MANUAL_MAP_DIR:?}"
unset SKYTTEL_MANUAL_MAP_DIR SKYTTEL_MANUAL_USER_ID
```

Resume ordinary development with `npm run dev:all`. These preparations are
optional debugging tools; integration tests create their own fixtures.

## Complete the development checks

After focused tests pass, run the development checks:

```sh
npm run check
```

This runs typechecking, Biome, documentation checks, workflow gate tests,
manual-case mapping, the build and unit-test coverage. Run Playwright
integration tests separately:

```sh
npm run test:integration
```

Neither command runs the optional container or real-provider checks below.

Run an individual check while correcting its findings:

```sh
npm run typecheck
npm run lint
npm run lint:fix
npm run lint:docs
npm run test:gates
```

`lint:fix` applies Biome's fixes. Review the resulting changes and rerun the
relevant check. Markdown lint and spelling checks are separate from Biome.

## Container and environment changes

With a running Docker daemon, run the check matching the changed inputs:

```sh
npm run test:container
npm run test:devcontainer
```

`test:container` builds the production image with disposable storage and
synthetic configuration. It checks startup, permissions, migrations and
persistence across restarts, then removes its test containers and volumes.
It does not deploy the image or verify a live provider registration.

`test:devcontainer` checks both development profiles using isolated storage,
including restart and container recreation. See the
[state and rebuild guidance](devcontainer.md#state-and-rebuilds) when changing
development configuration.

Run `npm run measure:map` separately from other suites. Its
[measurement plan](../manual-tests/large-map-performance.md) defines the
dataset, network conditions, readiness boundaries and report options.

## Optional checks with real providers

These commands require explicit private configuration:

- `npm run test:real-model`: model interpretation through MCP. Follow the
  [model evaluation guide](../manual-tests/real-model-tests.md).
- `npm run test:real-voice`: recorded Swedish speech through WebRTC, Live
  and the application's text model. Follow the
  [speech evaluation guide](../manual-tests/real-voice-tests.md).
- `npm run test:installation`: read-only checks of HTTPS, deployed version
  and security monitoring against actual Render images. Follow the
  [monitoring guide](../operations/security-monitoring.md#automated-live-verification).

Missing configuration fails these commands. It is not a passed or skipped
verification. Record the tested commit and actual result separately from
discovery and tests using provider substitutes. Ordinary CI does not use
live accounts or call paid providers.
