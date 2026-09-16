# Develop and verify the first installation

Use Node.js 24 LTS and the committed npm lockfile. Native `better-sqlite3`
installation requires a supported prebuilt binary or Python, a C/C++ compiler,
and Make. The Docker build supplies these tools in its build stage.

## Install and build

```sh
npm ci
npm run typecheck
npm run lint:docs
npm run build
```

For a local production build, configure `.env.local` according to the
[installation guide](../operations/installation.md), then start the application
with that environment loaded:

```sh
node --env-file=.env.local dist/server/index.js
```

The database directory must be writable. The server serves the Vite client
build and the API from the same origin.

## Isolated application checks

```sh
npx playwright install chromium
npm test
```

The suite drives the running application through the browser and public HTTP
endpoints, uses real SQLite databases in temporary directories, and supplies
only synthetic users and households. Each installation has independent
storage and a configured first administrator. The test identity substitute
is composed only by the test runner. Its source is outside the production
entry point and Docker build context.

These checks cover installation setup, server-side access decisions,
independent installations, same-email identities, current membership,
revoked access, and restart persistence. Browser checks include recoverable
startup errors, keyboard operation, and a narrow
mobile viewport. Tests must never use live provider credentials, real
households, or production storage. Keep generated traces and reports local;
their inputs must remain synthetic.

Run a focused test file while changing a feature, and run typechecking again
after changing the shared contract. Run the full suite after completing the
change. Rebuild before a focused browser test so it uses the latest client:

```sh
npm run build
npm run test:integration -- tests/integration/bootstrap.spec.ts
```

Do not replace SQLite with an in-memory repository mock. Membership fixtures
arrange scenarios for administration features that belong to later issues;
all assertions observe the public HTTP interface, not internal database rows.

Verification status on 2026-09-16: all 12 application tests pass from a clean
export of the staged implementation on macOS ARM64 with Node.js 24.19.0,
Playwright 1.63.0, and Chromium 153. Typechecking, Markdown lint, spelling,
and the dependency audit also pass. Browser viewport emulation covers keyboard
use and widths of 320 pixels; it does not verify a physical iPhone or iPad.

## Production-container checks

With a running Docker daemon:

```sh
npm run test:container
```

This builds the production Dockerfile, runs it with disposable storage and
synthetic configuration, checks readiness and its unprivileged runtime user,
checks that test authentication is unavailable, and exercises restart and
failed-migration behavior. The production image contains built application
files, migrations, and production dependencies. It has no test entry point.

The persistence fixture completes the deterministic provider callback and
creates a household through the public API before copying a closed SQLite
snapshot into its disposable volume. The test then checks authenticated
household access before and after a production-container restart. The setup
step gives that synthetic snapshot to UID/GID 1000; the application always
runs as the normal image user.

Temporary test containers and volumes are removed after the check. These
checks do not deploy to Render and do not certify a provider registration,
ingress configuration, disk service, or a different CPU architecture.

Verification status on 2026-09-16: this workflow passes with Node.js 24.21.0
on `linux/arm64`. It confirms initial startup, UID/GID 1000, unavailable test
login routes, anonymous access denial, persisted authenticated household
access after restart, and failed migration without readiness. Real Google
and personal Microsoft account sign-in remain pending the separate checks
below.

## Verify real identity providers separately

Use a private verification installation with its own persistent disk, secret,
and provider registrations. Register the correct callback URLs and authorize
Google test accounts if its consent screen requires them. Do not post tokens,
subjects, personal email addresses, screenshots with identity details, or
household data in public evidence.

1. Configure a controlled Google identity as first administrator. Complete the
   actual Google redirect and consent flow, create a synthetic household,
   sign out, and sign in again.
2. Restart the production container and confirm that the same household and
   provider identity are retained.
3. Repeat in a separate installation with a personal Microsoft account as
   first administrator. An organizational Microsoft account alone does not
   verify personal-account support.
4. Confirm that another authenticated identity cannot create or access the
   household, including direct API requests. If using matching email
   addresses across providers, confirm they do not merge automatically.
5. Verify logout, denied consent, and a provider error. Confirm that the page
   gives a usable retry path and technical logs contain no secret or identity
   detail.

Record the date, image digest, provider, Microsoft account category, scenarios,
and pass/fail result in private release evidence. State explicitly which
checks are deterministic and which use a real provider. Until these live
checks run, provider compatibility remains unverified; passing the automated
suite is not a claim of live Google or Microsoft sign-in success.
