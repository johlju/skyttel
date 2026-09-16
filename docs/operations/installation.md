# Install and operate Skyttel

Skyttel runs as one Node.js application with SQLite on persistent local disk.
Run one application instance for each installation. A short interruption during
an update is expected. Each installation has its own database, authentication
secret, provider credentials, and configured first administrator.

## Supported runtime

- Node.js 24 LTS, with exact JavaScript dependencies in `package-lock.json`.
- The production image uses Node.js 24.21.0 on Debian Bookworm slim, pinned by
  its multi-platform image digest. It runs as the `node` user, UID/GID 1000.
- Docker Engine with Docker Compose v2 for the local container workflow.
- A writable persistent filesystem for SQLite; use a local disk, not a shared
  network filesystem. The image stores its database in `/data/skyttel.sqlite`.

The application uses TypeScript, React, Vite, React Router, Hono, Better Auth,
and `better-sqlite3`. SQLite runs inside the application; no database service is
required. See the
[technology decision](https://github.com/viscalyx/skyttel/issues/12#issuecomment-5691771132)
and [access decision](https://github.com/viscalyx/skyttel/issues/6#issuecomment-5654275475).

## Configure the installation

Copy the blank example and edit only the local file:

```sh
cp .env.example .env.local
chmod 600 .env.local
openssl rand -base64 48
```

Put the generated value in `BETTER_AUTH_SECRET`. Keep this value stable across
restarts. Use a different value for every installation. The example contains
no usable secret or personal identity. Do not commit the local file or put
secrets, provider identifiers, household information, or tokens in issues or
technical logs.

<!-- markdownlint-disable MD013 -->
| Variable | Required value |
| :-- | :-- |
| `SKYTTEL_ORIGIN` | Public HTTPS origin without a path, for example `https://skyttel.example.com`. Loopback HTTP is accepted for local development. |
| `SKYTTEL_DATABASE_PATH` | Writable SQLite file path. Compose sets `/data/skyttel.sqlite` inside its named volume. |
| `SKYTTEL_FIRST_ADMIN_PROVIDER` | `google` or `microsoft`. |
| `SKYTTEL_FIRST_ADMIN_SUBJECT` | The designated person's immutable provider account identifier. Never an email address or display name. |
| `BETTER_AUTH_SECRET` | A randomly generated secret of at least 32 characters. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credentials for the installation's Google web application. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Credentials for the installation's Microsoft web application. |
| `PORT` | Optional; defaults to `3000`. Compose uses port `3000`. |
| `HOST` | Optional; defaults to `0.0.0.0`. |
<!-- markdownlint-enable MD013 -->

Both providers must be configured. Invalid or incomplete configuration stops
startup before the application accepts traffic.

## Register identity providers

Create a Google OAuth web application and a Microsoft Entra web application.
Register these exact redirect URIs, substituting the installation's origin:

```text
https://skyttel.example.com/api/auth/callback/google
https://skyttel.example.com/api/auth/callback/microsoft
```

For local verification register the corresponding
`http://localhost:3000/api/auth/callback/google` and
`http://localhost:3000/api/auth/callback/microsoft` URIs. Google consent-screen
access must include the intended test users while the provider application is
in testing mode. Use the provider's web application client secret on the
server, never in browser configuration.

The Microsoft registration must allow personal Microsoft accounts as well as
accounts in organizational directories. Skyttel uses the `common` authority.
Check the registration's supported account types; changing the authority
alone does not enable personal accounts. See the official
[Google setup](https://better-auth.com/docs/authentication/google),
[Microsoft setup](https://better-auth.com/docs/authentication/microsoft), and
[Microsoft audience guidance](https://learn.microsoft.com/entra/identity-platform/msal-client-application-configuration).

## Designate the first administrator

Use Google's verified `sub` identifier or Microsoft's verified `oid` identifier
used by Better Auth 1.7. Obtain it through the provider's
authenticated identity flow and keep it private. Email addresses and names
do not authorize installation setup. See
[Google's identifier guidance](https://developers.google.com/identity/openid-connect/openid-connect)
and [Better Auth's Microsoft account identifiers](https://better-auth.com/docs/authentication/microsoft#account-identifiers).

If the identifier is not available, obtain it through a private local setup:

1. Set the intended provider and use `not-configured` as a deliberately
   unmatched `SKYTTEL_FIRST_ADMIN_SUBJECT`. Keep the local Compose service bound
   to loopback and register the local callback URI with that provider.
2. Build and start the service with the commands below. Let only the intended
   administrator complete sign-in. The page denies household access while
   the configured identifier is unmatched; this is expected.
3. In a private terminal, inspect the authenticated provider identifier:

   ```sh
   docker compose exec -T skyttel node --input-type=module <<'JS'
   import Database from 'better-sqlite3';
   const db = new Database(process.env.SKYTTEL_DATABASE_PATH, {
     readonly: true,
   });
   console.table(db.prepare('SELECT providerId, accountId FROM account').all());
   db.close();
   JS
   ```

4. There must be exactly one expected provider account in this fresh
   installation. If there is more than one, stop and confirm which identity
   belongs to the intended administrator before configuring access. Copy its
   `accountId` into `SKYTTEL_FIRST_ADMIN_SUBJECT` and its `providerId` into
   `SKYTTEL_FIRST_ADMIN_PROVIDER` in the private local configuration.
5. Reload the changed environment with
   `docker compose up -d --force-recreate`, then return to the application.
   A plain container restart does not reload a changed Compose environment.

Run this lookup without terminal recording or shared logging. Do not redirect,
publish, or attach its output to an issue. It contains a real private identity
identifier; it is operator inspection, not an application log. The placeholder
must be replaced before household creation.

Only the configured provider and identifier can create the installation's
first household. Once the household exists, current membership controls
access. Changing the first-administrator configuration does not transfer an
existing household or restore a removed member's access.

Provider accounts attach to a stable Skyttel user. Automatic account linking
is disabled: a second provider with the same email address cannot take over
the first provider's user or household. Explicit linking is separate future
work; use the original provider to return to the household.

Provider email addresses do not select a Skyttel user. Each provider identity
gets a separate user with a random internal ID. The authentication library's
required email field contains an opaque internal address derived from the
provider and immutable identifier, not a contact address. This prevents a
different identity from reserving the administrator's email before setup.
Never send email to that internal address. Future contact-address and explicit
linking features must keep this identity boundary intact.

## Build, start, and restart

After filling every required configuration value:

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

To update, build the new image, keep the same volume and secret, and run
`docker compose up -d` again. Do not run old and new application versions
against the same SQLite volume at the same time. Arbitrary downgrades after
schema changes are not supported.

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

SQLite uses WAL journaling and full synchronization. Migrations run before
the listener opens, and household creation uses a short transaction.

A failed migration or inaccessible database exits with failure and no ready
listener. A fixed error event such as `database_initialization_failed` appears
in the technical log with a safe reason such as `database_unavailable` or
`migration_failed`. Configuration failures identify the affected variable
name. Private values, paths, SQL, and exception details do not appear. Keep the
service out of traffic and check disk availability, write permission, free
space, and the deployed migration files. Correct the cause and restart. Do not
delete the database or edit migration history to force a healthy state.

This delivery does not provide automated backups, household export/import,
or a data recovery interface. Those require separate work. Persistent disk
protects ordinary restarts; it does not protect against loss of the disk.

## Verification limits

Run the [automated verification workflow](../development/testing.md) before
delivery. Deterministic identity tests do not establish that Google or
Microsoft accepts the real registration. Complete the separate provider
checks described there before treating a deployment as ready for users.
