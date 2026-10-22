# Install and operate Skyttel

Skyttel runs as one Node.js application with SQLite on persistent local disk.
Run one application instance for each installation. A short interruption during
an update is expected. Each installation has its own database, authentication
secret, provider credentials, and configured first administrator.

## Supported runtime

- Node.js 24 LTS for running directly from a build.
- The production image includes the runtime and dependencies. It runs as
  the `node` user, UID/GID 1000.
- Docker Engine with Docker Compose v2 for the local container workflow.
- A writable persistent filesystem for SQLite; use a local disk, not a shared
  network filesystem. The image stores its database in `/data/skyttel.sqlite`.

SQLite runs inside the application; no separate database service is required.
For production on Render, follow the [deployment runbook](render.md) to
configure the persistent disk, automatic digest deployment and recovery.
For provider registration and first administrator setup on the running
production service, use [production authentication](authentication.md).

## Configure the installation

For production, enter these settings through the host's private environment
controls. The [authentication guide](authentication.md) explains where each
identity setting comes from. It uses production sign-in and the production
database to identify the first administrator.

For a local container installation, copy the example and edit only
the local file. Keep an existing `.env.local` if one is already present:

```sh
cp -n .env.example .env.local
chmod 600 .env.local
openssl rand -base64 48
```

Put the generated value in `BETTER_AUTH_SECRET`. Keep this value stable across
restarts. Use a different value for every installation. The example contains
no usable secret or personal identity. Do not commit the local file or put
secrets, provider identifiers, household information, or tokens in issues or
technical logs.

The examples include a shared development authority generation. It is only
for development, including the compiled development mode. Before using an
env file in QA, staging, production or any other non-development
installation, replace that generation with a unique UUID from
`node -p 'crypto.randomUUID()'`. Operators are responsible for this step;
the application does not reject the shared development value. Keep the
installation's unique generation stable across ordinary restarts.

<!-- markdownlint-disable MD013 -->
| Variable | Required value |
| :-- | :-- |
| `SKYTTEL_ORIGIN` | Public HTTPS origin without a path, for example `https://skyttel.example.com`. Loopback HTTP is accepted for local development. |
| `SKYTTEL_DATABASE_PATH` | Writable SQLite file path. Compose sets `/data/skyttel.sqlite` inside its named volume. |
| `SKYTTEL_FIRST_ADMIN_PROVIDER` | `google` or `microsoft`. |
| `SKYTTEL_FIRST_ADMIN_SUBJECT` | The designated person's immutable provider account identifier. Never an email address or display name. |
| `BETTER_AUTH_SECRET` | A randomly generated secret of at least 32 characters. |
| `SKYTTEL_AUTHORITY_GENERATION` | A unique UUID held in private host settings outside the database and restored volume. Generate it with `node -p 'crypto.randomUUID()'`. Keep it stable for ordinary restart; change it before each controlled database or disk restore. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credentials for the installation's Google web application. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Credentials for the installation's Microsoft web application. |
| `OPENAI_API_KEY` | Optional server-only project key for Skyttel's text and voice assistants. Without it, manual map work remains available. |
| `PORT` | Optional; defaults to `3000`. Compose uses port `3000`. |
| `HOST` | Optional; defaults to `0.0.0.0`. |
<!-- markdownlint-enable MD013 -->

Both providers must be configured. Invalid or incomplete configuration stops
startup before the application accepts traffic.

Read the [operator upgrade notes](operator-upgrade-notes.md) before updating
an existing installation. They describe required preparation and data changes.

For whole database or disk recovery, follow the
[controlled restore procedure](database-restore.md). Its independent restore
declaration and trusted permanent-erasure review are required before
reopening. A copy of the database cannot provide its own restore barrier.

## Configure authentication client addresses

Before starting production, explicitly set `SKYTTEL_CLIENT_ADDRESS_MODE`.
Missing production configuration stops startup with `configuration_invalid`
and the field name, without its value. Development defaults to `direct`;
compiled local development also selects `direct` unless configured otherwise.

- `direct`: use the actual socket peer and ignore all forwarded-address
  headers. Use this only without ingress; a proxy's clients would share
  its counter. Do not set header, trust or peer variables in this mode.
- `header`: set `SKYTTEL_CLIENT_ADDRESS_HEADER` to one authoritative
  single-address header. Multiple addresses, ports, brackets, zone
  identifiers, empty or malformed values are rejected. There is no
  fallback to another header or to the socket peer.

For `header` mode, choose one `SKYTTEL_CLIENT_ADDRESS_TRUST` value:

- `peers`: set `SKYTTEL_CLIENT_ADDRESS_PEERS` to a comma-separated list of
  ingress IP addresses or CIDRs. Skyttel checks the actual socket peer
  before accepting the header. A fictional example is `192.0.2.10/32`
  with an authoritative `X-Real-IP` header. Use verified ingress ranges
  under your control, never sampled addresses or all private networks.
- `protected-origin`: explicitly declare that deployment controls protect
  every path to the origin. Public clients must only reach ingress that
  overwrites the selected header. All other callers must be blocked or
  belong to your trusted administrative boundary. Skyttel cannot verify
  this declaration from HTTP headers. Leave
  `SKYTTEL_CLIENT_ADDRESS_PEERS` unset with this choice.

Incomplete or conflicting settings stop startup. A header name alone does
not establish trust. `X-Skyttel-Client-Address` is reserved; caller-supplied
values are discarded. If ingress sends a multi-hop `X-Forwarded-For` chain,
configure it to also supply an authoritative single-address header derived
from a verified sender or proxy chain. It must overwrite client input.
Skyttel ignores the unrelated chain, including forged leading entries.
Never select the leftmost entry or assume a fixed hop count. See
[Better Auth's trust guidance](https://better-auth.com/docs/concepts/rate-limit).

### Verify and diagnose the boundary

Keep the origin-access inventory and probe results private. Include every
public hostname, direct port, private-network caller and administrative
route. Review ownership and trust before adding services or changing
exposure. An untrusted caller with origin access requires enforceable
sender or network protection before enabling header trust. See
[Render requirements](render.md#client-address-trust-on-render).

On an isolated installation, check public routes, alternate routes and
direct origin access. Verify that forged selected headers and forwarding
entries cannot change the counter. Independent IPv4 clients must have
separate counters even with multi-hop forwarding. Clients sharing a public
IPv4 address or IPv6 `/64` can share a counter; equivalent IPv6 and
IPv4-mapped IPv6 forms cannot bypass it. An address controls abuse limits,
never identity or household access.

Missing or invalid required data returns generic HTTP 503 before
authentication work, including login initiation. The server emits
`auth_client_address_unavailable` at most once per minute per process.
Its reason is `missing_peer`, `untrusted_peer`, `missing_header` or
`invalid_header`, without addresses, raw headers or request contents.
Check the selected source and origin protection; do not disable the
limiter or switch to direct mode to hide an ingress fault. Health checks
remain available. HTTP 429 means actual rate exhaustion; endpoint-specific
limits remain unchanged.

Use fictional addresses in disposable tests. For a necessary live probe,
use temporary private instrumentation, restrict access and duration, and
remove it immediately afterward. Do not publish addresses, deployment
identifiers, diagnostic URLs or topology details. Confirm normal health
and removal of the probe before reopening normal traffic.

## Enable the built-in assistants

Create a project API key in the
[OpenAI API dashboard](https://platform.openai.com/api-keys). Keep project
access and billing under the operator's control. Put `OPENAI_API_KEY` in the
server's private environment and restart with the same persistent disk and
authentication secret. Text and voice use the same key. Never put it in a
`VITE_` variable, browser setting, image layer, screenshot or test report.

Voice needs the production HTTPS origin for microphone access. Permit
outbound HTTPS and WebSocket connections to OpenAI from the server, and
WebRTC media connectivity from the user's browser. Each user must give the
conversation consent for the household before text or voice starts, and
can save it so that later conversations start directly.
Starting voice requests microphone access; browser autoplay restrictions
may require **Starta ljudet**.

Before opening access, check the real providers with invented household
information using the [text](../manual-tests/text-assistant.md) and
[voice](../manual-tests/voice-assistant.md) acceptance cases. Automated
provider substitutes do not establish real model or device behavior.

## Recover assistant access

A missing key leaves normal map editing and external MCP clients available.
An invalid key, quota problem or provider outage reports an assistant error.
Correct or rotate the key in the server's private settings and restart with
the same disk and authentication secret. Keep provider error bodies,
requests and credentials out of shared diagnostics.

When voice startup shows **Felreferens**, find the matching `diagnosticId`
in the server's `voice_start_failed` log entry. Check `code` and, when
present, `providerStatus` and `providerRequestId`. The `stage` distinguishes
session creation (`create`) from the server control connection (`sideband`).
Use these fields to investigate credentials, model access, quota or network
failures without collecting microphone audio or household content.

The public error group is `startup`, `interrupted` or `administration`; the
browser maps it to a short conversation notice. Existing detailed error
codes remain in startup responses and logs. A runtime failure records
`voice_interrupted` with `diagnosticId`, `stage: session`, `code` and `group`.
Its diagnostic ID is the voice attempt ID also used by usage records and
is returned with the failed session in polling responses. Match the shown
reference to that log entry to distinguish connection loss, provider
failure and expiration. These records contain no provider error body,
audio or household content.

A denied microphone, blocked audio or broken voice connection leaves text
and forms usable. Check browser permissions, secure origin and network
access, then start a fresh voice connection. Voice does not reconnect
automatically. After an application restart, start a new assistant session.
A saved conversation consent remains. A consent given only for the visit
lasts until the page is reloaded.

Stopping a session or losing a connection does not undo a completed save.
Skyttel automatically checks uncertain saves when contact returns. It
reads the terminal receipt or completes only the original durably
registered operation, keeping its owner, household, content version, draft
version and operation ID. Recovery requires household authorization but
no conversation consent or provider connection. An active conversation
save settles before recovery completes it.

Only a failed check exposes **Kontrollera om utkastet sparades**. If that
check continues failing, investigate normal household access and database
availability. Conflicting or rejected attempts remain unsaved, with their
draft preserved; recovery never creates a replacement save. Keep the
existing database and receipts; do not reset them to clear an uncertain
result. No schema migration or new runtime configuration is required.

## Register identity providers

Follow [production authentication](authentication.md) for provider accounts,
registration, publishing choices, credentials, and checks on the deployed
service. On Render, follow the [deployment sequence](render.md).

Use a Google OAuth web application and a Microsoft Entra web application.
Register the exact callbacks for the installation's origin:

```text
https://skyttel.example.com/api/auth/callback/google
https://skyttel.example.com/api/auth/callback/microsoft
```

Use the provider's web application client secret on the server, never in
browser configuration.

The Microsoft registration must allow personal Microsoft accounts as well as
accounts in organizational directories. Skyttel uses the `common` authority.
Check the registration's supported account types; changing the authority
alone does not enable personal accounts. See the official
[Google setup](https://better-auth.com/docs/authentication/google),
[Microsoft setup](https://better-auth.com/docs/authentication/microsoft), and
[Microsoft audience guidance](https://learn.microsoft.com/entra/identity-platform/msal-client-application-configuration).

Before a production credential expires, follow
[provider secret renewal](authentication.md#renew-provider-secrets).
Create and verify a replacement in the same registration before removing the
old credential, and reload the application's environment after changing it.

## Designate the first administrator

Use Google's verified `sub` identifier or Microsoft's verified `oid` identifier
used by Better Auth 1.7. Obtain it through the provider's
authenticated identity flow and keep it private. Email addresses and names
do not authorize installation setup. See
[Google's identifier guidance](https://developers.google.com/identity/openid-connect/openid-connect)
and [Better Auth's Microsoft account identifiers](https://better-auth.com/docs/authentication/microsoft#account-identifiers).

For a new production installation, first deploy with the intended provider
and `not-configured` as the subject. Then follow
[identify the first administrator on the running service](authentication.md#5-identify-the-first-administrator-on-the-running-service).
The procedure uses the intended person's production sign-in and a private,
read-only lookup on that service's database. It selects the specific
authenticated user rather than assuming that the first account is correct.
Replace the placeholder and deploy the changed environment before creating
the household. No separate local installation is needed for production setup.

Only the configured provider and identifier can create the installation's
first household. Once the household exists, current membership controls
access. Changing the first-administrator configuration does not transfer an
existing household or restore a removed member's access.

Provider accounts attach to a stable Skyttel user. Matching email addresses
do not link accounts automatically. Users can explicitly link Google and
Microsoft from **Inloggningssätt** by verifying both identities; either
linked provider then reaches the same user and household. See the
[login-linking steps](../user-guide/access.md#koppla-google-och-microsoft).

## Build, start, and restart

For a new installation, use an empty database location. Ordinary startup
applies schema migrations automatically. Check the
[operator upgrade notes](operator-upgrade-notes.md) before an update for
required preparation and data changes.

For the local Compose workflow, after filling every required value:

```sh
docker compose build
docker compose up -d
docker compose ps
curl --fail http://localhost:3000/healthz
```

Open [local Skyttel](http://localhost:3000), log in as the designated
administrator, and create the household. The health response is
`{"status":"ok"}` only after configuration, database initialization, and all
versioned migrations succeed.

```sh
docker compose restart skyttel
curl --fail http://localhost:3000/healthz
```

Wait for readiness, then return in the same browser and check the household.
The named volume retains household records, identities, and sessions across
container restarts and replacements. `docker compose down` keeps that volume;
adding `--volumes` deletes it and its household data.

Before updating, read the [operator upgrade notes](operator-upgrade-notes.md)
and follow any release-specific retention requirements. For ordinary updates
that retain existing map content, download a
[complete household export](../user-guide/household-export.md) and retain its
identity for investigation. Keep the same volume and secret across ordinary
updates; any required login maintenance follows the
[controlled login procedure](login-upgrade.md). Do not run old
and new application versions against the same SQLite volume at the same
time. This transition supports roll forward only. Keep access closed and
install a corrected newer image if checks fail. An export restores
household content through a compatible application; it does not restore
authentication state. See [recovery and moving](recovery.md).

## Deploy on a container host

The same image can run on a normal container host, including Render. Supply
configuration through the host's secret settings and attach persistent disk
at `/data`. Make the mounted directory writable by UID/GID 1000 before
starting the application. A host-mounted directory can replace the ownership
provided by the image. Keep the database, WAL, and shared-memory files on the
same persistent disk.

Set the public HTTPS origin and register its provider callback URIs. Route
HTTPS through the host's ingress to the application's `PORT`, and use
`/healthz` as the readiness check. The example Compose service binds only to
loopback for local use; configure ingress separately for remote access. Run
exactly one instance and allow a deployment interruption.

## Startup failures and storage

A failed migration or inaccessible database exits with failure and no ready
listener. A fixed error event such as `database_initialization_failed` appears
in the technical log with a safe reason such as `database_unavailable` or
`migration_failed`. Configuration failures identify the affected variable
name. Private values, paths, SQL, and exception details do not appear. Keep the
service out of traffic and check disk availability, write permission, free
space, and the deployed migration files. Correct the cause and restart. Do not
delete the database or edit migration history to force a healthy state.

Skyttel provides complete versioned household export and import, without
extra automatic backup. Keep your own private exports outside the running
disk. [Restore or move the household](recovery.md) into a new installation
with fresh access and explicit historical-owner assignments. Persistent disk
protects ordinary restarts; it does not protect against loss of the disk.
Everything since the latest usable export can be lost in a major failure,
and recovery can require several days.

## Verify before opening access

Check the deployed HTTPS origin, provider callbacks, fresh sign-in with both
providers, and household access after a restart. Include a personal Microsoft
account and verify that linked logins reach the same household. Follow the
[production sign-in checks](authentication.md#6-verify-production-sign-in)
for the full procedure. A successful health check or automated test run does
not verify the installation's real provider registrations.
