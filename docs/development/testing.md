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
startup errors, denied Google and Microsoft consent with successful retry,
keyboard operation, and a narrow
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

Verification status on 2026-09-16: all 14 application tests and all 31 workflow
gate tests pass on macOS ARM64 with Node.js 24.19.0,
Playwright 1.63.0, and Chromium 153. Typechecking, Markdown lint, spelling,
and the dependency audit also pass. Browser viewport emulation covers keyboard
use and widths of 320 pixels; it does not verify a physical iPhone or iPad.

## Pull request gates

The Operator Upgrade Gate checks every pull request to `main` except those
authored by `dependabot[bot]`. For other pull requests, select exactly one
operator-impact declaration in the pull request template.
`Operator notes updated` requires a meaningful addition or correction under
`## Unreleased` in the committed operator notes.
Formatting, source markers, removal-only changes, and release history do not
count as updated guidance. `No operator notes needed` still requires a valid
notes document. The gate verifies the declaration and notes structure;
reviewers assess whether the guidance covers the actual operational impact.

The SSDLC Gate requires the template's security-review checkbox for changes
to application code, persistence, dependencies, deployment, authentication,
security documentation, or development and CI security controls. Ordinary
documentation-only changes can pass without the checkbox. Dependabot pull
requests skip both gates. The workflows check the pull request author, so
the exemption also applies when a maintainer edits a Dependabot pull request.
A checked box records the author's assessment and does not replace security
review or security testing.

Both gates rerun when a pull request opens, receives commits, reopens, changes
its description, or becomes ready for review. They use `pull_request_target`,
check out the exact trusted base revision, and read pull request metadata and
committed notes through GitHub's API with read-only permissions. They do not
install dependencies or execute code from the pull request. API failures or
incomplete evidence fail the check.

The workflows and their scripts must first reach `main` before these gates
can run. After a successful initial run, maintainers can select the
`operator-upgrade-gate` and `ssdlc-gate` checks in the `main` branch rules to
require them before merging. The workflow files alone do not change branch
protection. Editing a pull request description reruns the gates after setup.
See GitHub's [pull request target documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
for the execution context.

Run the dependency-free gate tests with Node.js 24:

```sh
npm run test:gates
```

Application CI runs these tests too. They use synthetic pull request data
and simulated GitHub responses, including fork notes, missing guidance,
checkbox declarations, renamed files, pagination, and API failures. To check
a real pull request, use the read-only GitHub API mode with a suitable token
in the environment; keep the token out of command arguments and logs:

```sh
export GITHUB_REPOSITORY=viscalyx/skyttel
node scripts/release/operator-upgrade-gate.mjs --github-pr 66
node scripts/security/ssdlc-gate.mjs --github-pr 66
```

Both commands read `GITHUB_TOKEN`. An unchecked SSDLC declaration on a
security-sensitive change must fail until the assessment is complete.

## Dependency updates

`.github/dependabot.yml` enables weekly version-update checks for the root
npm project and GitHub Actions. Each dependency gets a separate pull request.
The configuration takes effect on `main`. GitHub supplies the Dependabot
update workflow, so no custom workflow file is needed. See GitHub's
[Dependabot configuration guide](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates).

Review each update and let application CI validate it. Dependabot pull
requests skip the Operator Upgrade and SSDLC gates, so their descriptions
do not need the template declarations. Reviewers must still assess operational
impact and commit meaningful operator notes when needed. Updates do not merge
automatically.

The source project's nested npm projects and devcontainer configuration do
not exist in Skyttel, so they are not included. Runtime Node.js and Docker
image updates remain coordinated maintenance: keep `.node-version`, the
`package.json` engine range, and both pinned Dockerfile base references
compatible, then run the production-container checks.

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
and personal Microsoft account sign-in have separate verification evidence
below.

## Verify real identity providers separately

If you are new to provider registration, start with the
[first-time setup walkthrough](../operations/first-time-use.md).

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
checks are deterministic and which use a real provider. Passing the automated
suite alone is not a claim of live Google or Microsoft sign-in success.

### Live-provider verification scope on 2026-09-16

Real Google and personal Microsoft sign-in pass in two sequential local
verification installations at `http://localhost:3000`. Each installation has
its own persistent SQLite volume, first-administrator configuration, and
authentication secret. Both use the dedicated local provider registrations.
The live production image contains the application code from commit
`c047bd05c5753d5cf5c35618070d667a022d5680`, with Node.js 24.21.0 on Linux ARM64.
Its image digest is:

```text
sha256:30bd93a317a878f369dbd861e6c929b7b8b69b2a45a13863f06569e3796a3fbb
```

The installation operator performs the browser sign-ins and confirms the
displayed outcomes. Local checks verify readiness, the personal Microsoft
account category, and public HTTP access decisions. The evidence covers:

- Google and Microsoft callbacks returning an authenticated account with
  household access denied before first-administrator configuration.
- Household creation by each configured administrator, sign-out, return
  sign-in, and access to the same household after a container restart.
- A personal Microsoft account confirmed by the consumer tenant in the
  provider-validated ID token, without displaying the token or claim values.
- Denied Microsoft access to the Google household. HTTP checks reuse sessions
  established by the real provider flows, keeping cookie material in memory.
  The Google member can read its household; the Microsoft nonmember receives
  `403` on direct household reads and creation attempts. Anonymous reads and
  creation receive `401`, and an unassigned household identifier receives
  `403` for the Google member. Response bodies and private identifiers are
  excluded from public evidence.
- Application output from both containers contains only fixed event names;
  no configured private values appear in standard output or standard error.

Microsoft evidence includes an initial generic retry screen before a
permissions dialog and a successful subsequent consent and sign-in attempt.
The cause of the first failure is undetermined. It does not establish a live
consent-cancellation result. Explicit denied consent for both providers,
same-email isolation, membership revocation, forged callbacks, and provider
outages have deterministic application-test coverage.

The live checks cover local HTTP callbacks and browser use on the operator's
computer. They do not verify a public HTTPS deployment, every account policy,
or physical mobile devices. Private credentials, identity values, session
material, and household records remain outside Git and public evidence.
