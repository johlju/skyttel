# Prepare an external assistant test

## Manual local Codex CLI setup

The agreed first experiment in
[issue #96](https://github.com/viscalyx/skyttel/issues/96) uses Codex CLI inside
the devcontainer and Google login in the host browser. It needs no public
tunnel, new subscription, or provider secret. This is a manual experiment;
do not run it in CI or add real credentials to pull request workflows.
Execution status: **not yet run**. The installed CLI used to prepare these
instructions is `codex-cli 0.156.1`; its help includes `--no-browser`.

The separate, nonblocking
[manual verification issue #97](https://github.com/viscalyx/skyttel/issues/97)
retains personal account actions and human assessment. Automated scenarios
do not require manual repetition. The full procedure below remains useful
for investigating a particular real client.

The developer prepares the local server and CLI commands below. The tester
performs login, household selection, consent, reads, revocation, reconnection,
and cleanup in [manual case AI-07](../assistants.md#ai-07-manuellt-codex-cli-prov-med-google-i-devcontainern).
Record actual execution separately from this plan. Existing synthetic-provider
tests do not establish real Google or Codex compatibility.

### Prerequisites and addresses

- Use an existing Codex subscription login in the devcontainer. Skyttel's
  Google login and MCP consent are separate from that Codex login.
- Follow the [Google development setup](../../development/devcontainer.md#set-up-local-sign-in).
  The web client **Skyttel local development** needs both port-5173 and
  port-3301 Google callbacks. Use the existing Google administrator subject.
- Keep both Google and Microsoft credential pairs in the private development
  environment file: `SKYTTEL_DEV_ENV_FILE`, or `.devcontainer/.env` by default.
  Startup requires both pairs, although this case tests only Google.
- Keep port 3301 free in the container and on the host. VS Code already
  forwards it with the same host port. Use a fresh private browser window so
  ordinary development sessions do not carry into the disposable installation.

<!-- markdownlint-disable MD013 -->
| Purpose | Address |
| --- | --- |
| Host browser origin | `http://localhost:3301` |
| Codex MCP endpoint inside the container | `http://localhost:3301/mcp` |
| Protected resource discovery | `http://localhost:3301/.well-known/oauth-protected-resource` |
| OAuth issuer | `http://localhost:3301/api/auth` |
| Authorization-server discovery | `http://localhost:3301/.well-known/oauth-authorization-server/api/auth` |
| Client registration | `http://localhost:3301/api/auth/oauth2/register` |
| Authorization | `http://localhost:3301/api/auth/oauth2/authorize` |
| Token exchange | `http://localhost:3301/api/auth/oauth2/token` |
| Skyttel consent page | `http://localhost:3301/assistant-consent` |
| Google browser callback | `http://localhost:3301/api/auth/callback/google` |
| Codex callback | Exact loopback address produced by the current CLI login |
<!-- markdownlint-enable MD013 -->

Codex reaches discovery, registration, token exchange, and MCP directly inside
the container. The host browser reaches Skyttel through VS Code's forwarded
port and uses Google for sign-in. With `--no-browser`, the tester copies the
final Codex callback address into the waiting CLI instead of forwarding a
second callback port. That address contains a short-lived authorization code;
paste it only into the local login prompt, not into a conversation or report.
Google's registration receives only the Google callback, not the Codex one.

### Start an isolated compiled application

Run this whole block from `/workspace` in terminal A. It uses a new temporary
directory, so `db:setup` cannot reset the ordinary development database.
The subshell clears inherited provider and administrator settings so the
private development environment file is authoritative, then explicitly
overrides the database and origin. It generates a temporary Skyttel
authentication secret without printing it; the existing Google and
Microsoft secrets are reused.

```sh
(
  set -e
  unset GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
  unset MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET
  unset SKYTTEL_FIRST_ADMIN_PROVIDER SKYTTEL_FIRST_ADMIN_SUBJECT
  SKYTTEL_DEV_ENV_FILE="${SKYTTEL_DEV_ENV_FILE:-/workspace/.devcontainer/.env}"
  export SKYTTEL_DEV_ENV_FILE
  export SKYTTEL_ORIGIN=http://localhost:3301
  export HOST=127.0.0.1 PORT=3301 NODE_ENV=development
  SKYTTEL_CASE_DIR="$(mktemp -d /tmp/skyttel-codex-development.XXXXXX)"
  export SKYTTEL_DATABASE_PATH="$SKYTTEL_CASE_DIR/skyttel.sqlite"
  trap 'rm -rf -- "$SKYTTEL_CASE_DIR"' EXIT
  SKYTTEL_CASE_SECRET="$(openssl rand -base64 48)"
  export BETTER_AUTH_SECRET="$SKYTTEL_CASE_SECRET"
  npm run db:setup
  npm run dev:prodlike
)
```

Keep terminal A running until the manual case and connection cleanup finish.
The command builds and serves the complete app, including MCP and OAuth.
Its exit trap deletes this run's temporary directory, including SQLite files
and temporary export archives. The path comes only from the `mktemp` above.
It does not edit the private environment file. After an interrupted run,
remove any remaining test connection credentials before starting again.

In terminal B, check readiness and the available CLI login options:

```sh
curl --fail http://localhost:3301/healthz
codex --version
codex mcp login --help
```

Expect `{"status":"ok"}` and a CLI with `--no-browser` support. A readiness
response proves startup only. If the port is occupied, identify the process;
do not redirect the case to an unrelated running installation.

### Commands for the manual case

For a guided run, start this in terminal B after terminal A is ready:

```sh
bash scripts/manual-codex-case.sh
```

The wizard runs the CLI commands below and pauses for the browser steps in
AI-07. Keep that case open for its expected results. It does not collect
credentials, write configuration, or determine the test outcome. If you stop
early, follow the cleanup instructions below. The commands remain available
for running the same case without the wizard.

Use the dedicated server name `skyttel_development_case`, unused by ordinary
client configuration. These per-command overrides avoid adding a permanent
server to the shared Codex configuration. From terminal B in `/workspace`,
start login when the manual case calls for it:

```sh
codex \
  -c 'mcp_servers.skyttel_development_case.url="http://localhost:3301/mcp"' \
  mcp login skyttel_development_case --no-browser \
  --oauth-client-registration dcr --scopes skyttel:read
```

Open the printed authorization URL in the host's private browser window.
After the case's Google login and Skyttel consent steps, copy the browser's
complete final callback URL into the waiting CLI. The browser may show a
connection error because that loopback listener is inside the container.
The CLI must report successful login before continuing. Start the interactive
client with the same server override:

```sh
codex \
  -c 'mcp_servers.skyttel_development_case.url="http://localhost:3301/mcp"'
```

Inspect actual MCP tool calls and results during the case. Shell commands,
repository fixture reads, and answers from conversation history are not MCP
evidence. If Codex cannot call the tool, record that result instead of asking
it to find the answer in local files.

OAuth compatibility is still unverified. In particular, Skyttel requires a
native OAuth client registration for HTTP loopback callbacks; the installed
CLI's automatic registration must satisfy that requirement. If discovery,
registration, callback handling, or token exchange fails, record the case as
blocked and retain only a redacted error description. Do not bypass login or
consent, or report a passed test. Diagnose compatibility separately.
The CLI command options above come from installed help; OpenAI also documents
[HTTP MCP and OAuth support](https://learn.chatgpt.com/docs/extend/mcp).

### Cleanup and evidence

After the final reconnection check, revoke its connection in Skyttel and exit
the interactive Codex session. In terminal B, remove only this MCP login:

```sh
codex \
  -c 'mcp_servers.skyttel_development_case.url="http://localhost:3301/mcp"' \
  mcp logout skyttel_development_case
```

Close the private browser window, then press Ctrl+C in terminal A. The exit
trap removes the disposable database. Keep the existing provider client,
callback registrations, private environment files, and normal Codex login.
If server startup or login fails, still remove any credentials created for
this test server and stop terminal A. This workflow starts no public tunnel.

Record date, commit, Codex version, local origin, provider, observed tool-call
results, cleanup outcome, and passed, failed, blocked, or not-run status.
Do not include credentials, callback query strings, cookies, personal identity
values, or full conversation logs in public evidence. A successful result
establishes only the local Codex CLI and Google path. ChatGPT web, Codex desktop,
Microsoft login, and the deployed HTTPS endpoint need their own evidence.
The [installation verifier](../../operations/security-monitoring.md#automated-live-verification)
checks HTTPS and deployment state automatically. Issue #97 tracks personal
account actions and human assessment without requiring a repeat of the
automated application scenarios.

## Real text-client verification

Real ChatGPT web and Codex app connections remain unverified. The existing
local MCP prototype is not production evidence. The agreed first development
test in [issue #96](https://github.com/viscalyx/skyttel/issues/96) is the manual
local Codex CLI setup above, not a ChatGPT website or Codex desktop test.
The following HTTPS procedure remains separate. No tunnel or public exposure
is established by the local CLI plan.

Use an installation containing only fictional household data. A
devcontainer is sufficient for an initial real-client experiment if the
chosen transport makes both MCP and OAuth reachable. Configure
`SKYTTEL_ORIGIN` to the browser-visible HTTPS origin and expose the full
app under that same origin, including metadata, `/api/auth`, the consent
page and `/mcp`. Update the Google/Microsoft application's exact callback
URLs for that origin using [installation guidance](../../operations/installation.md).
Do not copy development provider substitutes into a deployed login.

OpenAI also documents Secure MCP Tunnel for a private MCP upstream.
It does not automatically make a local OAuth authorization server
reachable. The choice must resolve that route as well; forwarding only
`/mcp` cannot complete this app's OAuth flow.
[OpenAI: Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels),
[OpenAI: connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Once the chosen environment is available:

1. Open the HTTPS Skyttel URL and verify real provider login to a fictional
   household. Record the running commit and environment.
2. In ChatGPT web, enable the account's available developer mode and add
   the MCP URL with OAuth. Complete Skyttel's user, household and AI
   choices. Ask it to read one fictional object and your private draft.
3. In the host's Codex configuration, add the same HTTPS endpoint under
   `[mcp_servers.skyttel]` with `url = "https://HOST/mcp"`. Complete OAuth
   from that client's authentication control or `codex mcp login skyttel`.
   Repeat the same reads in the desktop app. Use the exact callback
   displayed by the installed client if manual registration is needed.
4. Revoke the connection in Skyttel while the client is open. Confirm a
   new read fails, then reconnect explicitly. Repeat with administrator
   revocation of a fictional member. Verify other members' drafts remain
   inaccessible and administration tools are absent.
5. Record date, client version, account/workspace eligibility, origin,
   commit, login provider, results and remaining limitations. Do not
   publish tokens, authorization codes, user content or cookies.

The client configuration instructions follow
[OpenAI's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).
Client registration details and available account controls must be checked
against the actual installed clients. A successful tunnel experiment is
recorded separately from verification of the deployed production HTTPS
endpoint. Use the procedure for client-specific troubleshooting. The
separate, nonblocking issue #97 retains personal sign-in, consent and
human assessment only; it does not require a manual rerun of automated
application scenarios. Closing an implementation issue does not establish
successful verification of an external client.
