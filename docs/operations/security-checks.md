# Security checks and manual acceptance

This guide is for maintainers and developers changing Skyttel. Every change,
including a maintainer or Dependabot change, needs a pull request, current
application checks, security checks, and manual acceptance before merge.
The maintainer accepts by pressing merge after reviewing the diff and reports.
An extra reviewer is not required. Automatic merging is disabled and the main
ruleset has no bypass actors.

## Required results

`Application checks` runs typechecking, lint, gate failure tests, unit tests,
browser tests, and production-container tests. The existing HTTP and browser
fixtures run isolated installations with real temporary SQLite files. Only
external identity providers are substituted. Authorization failures block.

The reusable `Security checks` workflow adds:

- CodeQL for TypeScript/JavaScript and Actions, with security-extended queries.
  The local SARIF policy rejects security severity 7 or higher and error-level
  findings, including existing findings. Uploading a report alone cannot pass.
- Dependency review on pull requests and `npm audit --audit-level=high` on
  every run, including development dependencies and unfixed vulnerabilities.
- Trivy configuration scanning with High and Critical failures.
- Gitleaks scanning of the fetched Git history with redacted output. Any
  detected secret blocks. Exact synthetic fixture values are allowlisted only
  in their test files and the disposable ZAP setup; no file or historical
  commit is exempted.
  GitHub secret scanning and push protection are also
  required repository settings; push protection alone is not a CI result.
- Syft SPDX JSON for the final production image and Grype against that same
  local image. The report's image ID must match the independently captured
  image configuration hash from the exported Docker archive. The SBOM must
  contain packages and describe the same image manifest. High and Critical block
  even without a fix. The vulnerability database must be at most five days old.
- ZAP baseline against a ready production container with disposable SQLite
  storage and synthetic settings. Baseline exit 0 or 2 is evaluated using its
  JSON report; High-risk alerts block, lower risks remain visible in reports.
  Exit 1, tool errors, missing reports, malformed reports, or no scanned site
  block. This unauthenticated baseline complements the authenticated access
  tests; it does not verify real identity-provider accounts or hosted TLS.

Both aggregate gates run even when prerequisites fail. Only explicit success
for every named job passes. Missing, failed, cancelled, or skipped jobs block.
Reports are retained for 14 days. Secret scan output is redacted and is not
uploaded as an artifact. Public evidence must use fictional data.

The `main` ruleset requires `application` and `security-gate` from GitHub
Actions. A missing workflow therefore cannot count as successful. Check the
repository settings from a trusted maintainer checkout:

```sh
node scripts/security/repository-settings.mjs
```

Use `--apply` to enable secret scanning and push protection, disable automatic
merging, and update the existing main ruleset while preserving unrelated rules.
The workflows do not carry repository-administration credentials. Enable
private vulnerability reporting in repository settings as well; sensitive
reports belong in the private channel linked in [SECURITY.md](../../SECURITY.md).

## Temporary container exceptions

Remediate first. `.github/security-exceptions.json` starts empty. An exception
applies only to one Grype vulnerability ID, package name, installed version,
package type, and image ID. It must record an owner, rationale, HTTPS evidence,
reviewer, a nonempty `actionPlan`, creation time, and expiry no more than 30 days
after creation. The action plan states how the owner will remediate the finding
and when to review progress, including how to track an unavailable upstream fix.
The current time must fall within that interval. Expired, malformed, duplicate,
wildcard, or unmatched records fail even if another finding is excepted.

Propose an exception in a pull request with fresh scan evidence. The named
reviewer must examine applicability, residual risk, and available fixes before
manually accepting the change. A reviewer field is an audit record, not an
automated proof of approval. Never add scanner ignores to hide findings.
An image change requires a new exact scope and a new risk decision. Remove an
exception after remediation; never automatically extend its expiry.

Other scanner findings have no exception mechanism: remediation is required.
Secrets, authorization failures, missing checks, and tool errors cannot be
excepted. Run the CLI against fresh evidence to validate a proposed record:

```sh
node scripts/security/check-results.mjs grype reports .github/security-exceptions.json
```

## Versions and updates

External Actions use full commit hashes with readable release comments. The
production Node 24 base uses Alpine 3.24 with both a version and digest. Build
and runtime use the same base. Runtime removes unused npm, Yarn, and the OS
package manager and its dependencies, retaining the certificate trust store.
Native SQLite is installed for this base during the build; never copy a
development installation's native modules into the production image.
Dependabot checks npm, Actions, and the production Dockerfile weekly. Review
update diffs, lifecycle scripts, native compilation, and test evidence before
merging. No update is
automatically accepted.

The initial scanner choices are CodeQL Action 4.38.1, dependency review 5.0.0,
Trivy setup Action 0.2.4 with Trivy 0.74.0, Syft 1.52.0 via SBOM Action 0.24.2,
Grype 0.119.0 via scan Action 7.4.2, Gitleaks 8.30.1, and ZAP 2.17.0. These
are explicit upstream releases; Gitleaks and ZAP images also have digest pins.
CodeQL's CLI bundle follows its pinned Action. Review upstream release notes
and advisory changes when updating; scanner success is not proof of safety.

Dependabot updates Action hashes and Docker base references. Standalone tool
versions and scanner image digests require a weekly maintainer review and a
normal pull request. Confirm the upstream tag resolves to the committed hash
or digest and rerun the gate failure tests and security workflow. Keep Node
on supported LTS; update `.node-version`, package engine constraints, both
Docker base stages, and devcontainer profiles together. `packageManager` is
the npm version source. A Node, npm, operating-system, or CPU change requires
review of native dependencies and a production-container test.

Dependabot PRs [#67](https://github.com/viscalyx/skyttel/pull/67) and
[#68](https://github.com/viscalyx/skyttel/pull/68) demonstrate updates to pinned
Action hashes with readable version comments. After the Docker configuration
reaches main, verify the first genuine Dependabot Docker PR changes both
matching base references, retains version and digest pins, and passes checks.
Record its PR link before considering that external acceptance step complete.

## New features and releases

Add behavior and access scenarios to the existing unit/HTTP/browser suites;
the required application job picks them up. Include unauthenticated access,
wrong-household access, removed membership, and relevant mutation boundaries.
Use isolated SQLite and synthetic identities. Keep failures observable through
public behavior. Add every new scanner job to the scanner gate's explicit
required list and `needs` list. Run `npm run test:gates` for deliberate failure,
skipped-result, absent-report, and exception-expiry cases.

The [container release chain](container-releases.md) calls
`.github/workflows/ci.yml` and requires its successful completion before
publication. Main pushes and stable tags start trusted release runs. The
publication job holds its own credentials and publishes the exact candidate
archive after container tests, scanning, and signature verification. It does
not rebuild that image after scanning. Release evidence has separate
retention from ordinary check reports. After successful main publication,
the [Render deployment job](render.md) uses separate credentials
to deploy and verify that digest. Stable tags do not change production.
The [daily image monitor](security-monitoring.md) scans the
actual running and retained rollback digests. It shares the release
container policy and reports unknown status when required evidence or
notification delivery fails. Its synthetic failure cases run with
`npm run test:gates`.

## Upstream references

- [CodeQL result severity](https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/triage-alerts-in-pull-requests)
- [Grype scan Action inputs](https://github.com/anchore/scan-action)
- [ZAP baseline exit codes and reports](https://www.zaproxy.org/docs/docker/baseline-scan/)
- [Official Node image variants and native-library compatibility](https://github.com/nodejs/docker-node#nodealpine)
