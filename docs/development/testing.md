# Develop and test Skyttel

Use Node.js 24 LTS, npm 12, and the committed npm lockfile.
`packageManager` pins the npm release used by development, CI, and builds.
Native `better-sqlite3` installation requires a supported prebuilt binary or
Python, a C/C++ compiler, and Make. The Docker build supplies these tools in
its build stage.

The [devcontainer guide](devcontainer.md) provides the complete Linux
development environment, client/server startup, persistent development data,
and tool configuration. Run checks explicitly after starting the container.

## Install and build

```sh
node scripts/install-repository-npm.mjs
npm ci
npm run typecheck
npm run lint
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

## Application unit tests and lint

Vitest exercises public application functions, rendered React screens, and
HTTP handlers. SQLite-backed behavior uses temporary real databases;
external provider responses and browser network requests use synthetic
fixtures. Coverage includes every TypeScript and TSX file under `src`,
including entry points. Tests do not reach into private application helpers.
Coverage gates require 85% of statements, lines, and functions, and 90% of
branches.

```sh
npm run test:unit
npm run test:unit -- tests/unit/server/config.test.ts
npm run test:unit:coverage
npm run lint
npm run lint:fix
```

Biome checks application and test code, scripts, CSS, and root configuration.
The project keeps single quotes and semicolons. Markdown lint and cSpell
remain separate checks. CI enforces these checks and the application suites.

## Isolated application checks

```sh
npx playwright install chromium
npm test
```

`npm test` builds the application and runs Vitest followed by Playwright.
The Playwright suite drives the application through the browser and public HTTP
endpoints, uses real SQLite databases in temporary directories, and supplies
only synthetic users and households. Each installation has independent
storage and a configured first administrator. Provider sign-in uses a test
substitute; verify real registrations separately as described below.

These checks cover installation setup, server-side access decisions,
independent installations, same-email identities, current membership,
revoked access, and restart persistence. Browser checks include recoverable
startup errors, denied Google and Microsoft consent with successful retry,
keyboard operation, and a narrow mobile viewport. Tests must never use live
provider credentials, real households, or production storage. Keep generated
traces and reports local; their inputs must remain synthetic.

Run a focused test file while changing a feature, and run typechecking again
after changing the shared contract. Run the full suite after completing the
change. Rebuild before a focused browser test so it uses the latest client:

```sh
npm run build
npm run test:integration -- tests/integration/bootstrap.spec.ts
```

Do not replace SQLite with an in-memory repository mock. Arrange membership
scenarios with fixtures and assert through the public HTTP interface.

The Playwright suite covers keyboard use and widths of 320 pixels through
browser viewport emulation. This does not verify a physical iPhone or iPad.
Run `npm run check` for typechecking, Biome, documentation checks, workflow
gate tests, the build, Vitest coverage, and Playwright. Production image
changes also require the separate `npm run test:container` check.

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
its description, or becomes ready for review. They evaluate committed notes
and the pull request description using the gate scripts on the base branch.
Changes to those scripts in a pull request do not affect its own gate run.
API failures or incomplete evidence fail the check.

After a successful gate run, maintainers can select the
`operator-upgrade-gate` and `ssdlc-gate` checks in the `main` branch rules to
require them before merging. The workflow files alone do not change branch
protection.
See GitHub's [pull request target documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
for the execution context.

Run the dependency-free gate tests with Node.js 24:

```sh
npm run test:gates
```

Application CI runs these tests too. To check a real pull request, use the
read-only GitHub API mode with a suitable token in the environment; keep the
token out of command arguments and logs:

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

Use `npm run purge:install` explicitly during dependency maintenance. It
empties `node_modules`, clears the npm cache, and regenerates the lockfile
with native optional packages available. The mounted `node_modules`
directory itself stays in place. Select dependency versions before running
the command; it does not change version declarations. Inspect both manifest
and lockfile changes, then run `npm run check`.

npm 12 requires reviewed dependency installation scripts. The committed
`allowScripts` entries approve exact versions, and `.npmrc` rejects
unreviewed scripts. Review changed lifecycle scripts before updating an
approval. Use `npm ci` for ordinary setup and CI; purge is never automatic.

Review each update and let application CI validate it. Dependabot pull
requests skip the Operator Upgrade and SSDLC gates, so their descriptions
do not need the template declarations. Reviewers must still assess operational
impact and commit meaningful operator notes when needed. Updates do not merge
automatically.

After updating Playwright, install its matching Chromium browser with
`npx playwright install chromium`. Keep `.node-version`, the `package.json`
engine range, and both production Dockerfile base references compatible.
For development tool updates and rebuild checks, follow the
[devcontainer guide](devcontainer.md#tools-and-updates). Run the
production-container checks when production inputs change.

## Devcontainer development

Follow the [devcontainer guide](devcontainer.md) to prepare the environment
and start the application. When changing the development configuration,
rebuild and start the container, check the tools, and confirm that existing
development data remains available. Run the application checks explicitly;
container startup does not run them.

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

The check also verifies authenticated household access before and after a
production-container restart using synthetic identities and data.

Temporary test containers and volumes are removed after the check. These
checks do not deploy to Render and do not certify a provider registration,
ingress configuration, disk service, or a different CPU architecture.

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

Verify the deployed HTTPS origin and callback URLs before release. Local
HTTP checks do not verify hosted ingress or provider policies for that
deployment. Test physical mobile devices separately when they are part of
the release's target platforms; browser viewport emulation is insufficient.
