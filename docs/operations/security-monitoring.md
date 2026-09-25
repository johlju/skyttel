# Monitor deployed image security

This guide is for the operator who maintains the Render installation and
the maintainer who reviews security updates. The operator owns the daily
scan and alarm destination. The maintainer investigates findings privately,
reviews exceptions, and delivers fixes through the normal release chain.
GitHub Actions and GitHub notifications supply the monitoring; no separate
paid monitoring service is required.

## Configure the recipient and verify delivery

The selected operator is GitHub account `johlju`. In the repository's
**Settings → Environments → production**, add the environment variable
`SECURITY_MONITOR_RECIPIENT` with that value. Keep the existing
`RENDER_SERVICE_ID` variable and `RENDER_API_KEY` secret configured as in
the [Render deployment guide](render.md). The token used by the workflow
needs permission to read deployments and GHCR packages and to write issues.
The production environment must allow `main` without an additional approval.

The recipient must be assignable to repository issues and must configure
GitHub notifications for assignments and mentions. Choose an inbox, email,
or mobile destination that the recipient actually monitors. Configure
GitHub Actions failure notifications too: an unavailable issue API cannot
deliver its own failure alert. See
[GitHub notification settings](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications).

After this workflow reaches `main`:

1. Open **Actions → Deployed image security → Run workflow** on `main`.
1. Select **Send a controlled delivery check to the configured operator**.
1. Check that the run produces `deployed-image-security/status.json` and
   the single **Production image security status** issue assigned to
   `johlju`. The controlled comment contains no synthetic vulnerability.
1. Have the recipient confirm that the message reaches the chosen inbox,
   email, or mobile destination. In a private operator record, save the
   recipient, destination, run and issue links, receipt time, and confirmer.
1. Verify a controlled Actions failure notification through the same
   operator procedure in the [deployment guide](render.md#8-enable-failure-notifications).

`accepted-by-github` means that GitHub accepted the issue or comment. It
does not prove delivery to a person. Synthetic tests do not prove it either.
Recipient delivery remains unverified until the operator records receipt.
Repeat the check after recipient, notification, token, or access changes.

## Read the daily status

The workflow runs daily at 06:23 UTC and can also be started manually. It
reads Render's saved image and filters deployments for the actual live
image, then requires a
matching successful GitHub production deployment record. It scans that
exact GHCR digest and the previous distinct successfully deployed digest,
which is the retained rollback image. Failed deployments and duplicate
retries do not select a rollback image. The first accepted deployment has
no predecessor. No image is built, deployed, or replaced by monitoring.

A manually changed Render image or a missing accepted deployment record
gives unknown status. Reconcile it with the verified release and deployment
procedure; do not select a convenient tag or candidate scan as substitute
evidence. A live-image change during scanning also makes the run unknown.
The workflow checks Render again after scans and serializes its own runs.
It does not delay a release or replace a queued production deployment.
A failed newer deployment cannot hide the older live image. If the saved
service setting differs from that live image, both known retained images
are still scanned, but the overall status requires investigation. The live
selection uses Render's documented
[deployment status filter](https://api-docs.render.com/reference/list-deploys).

Download the `deployed-image-security` artifact from the latest run. Each
completed scan includes its running or rollback role, full image digest,
deployment record, commit, version, scan time, Grype and Syft versions,
database schema version and build time, and policy outcome:

- `passed`: current evidence passes the release container policy. This can
  include a valid reviewed exception; it is not a promise of no risk.
- `blocked`: High or Critical findings lack a valid exact-image exception,
  or an exception requires review. Unfixed findings also block. Exceptions
  have an owner, reviewer, evidence, and expiry of at most 30 days.
- `unknown`: required evidence, current database update check, image access,
  tool execution, deployment identity, or alarm delivery failed. Earlier
  findings remain unresolved. A missing report or one older than 36 hours
  also means unknown current status, regardless of an older green run.

The database update check is mandatory on every scan. The release policy's
five-day maximum database age also applies. The shared policy reads the
same reviewed exception records as releases and reevaluates expiry each day.
Every record must be valid and match a High or Critical finding on a retained
image. Separate exact-image exceptions can cover running and rollback images.
Remove unmatched records, including exceptions for images no longer retained;
they block monitoring even when both scans have no High or Critical findings.
The status artifact contains only allowlisted metadata and opaque finding
fingerprints. Raw scanner output, package findings, credentials, and provider
responses are not published in workflow logs or artifacts.

### Automated live verification

From a trusted checkout with `npm ci` complete, supply `GH_TOKEN`,
`RENDER_API_KEY`, `RENDER_SERVICE_ID`, and `SKYTTEL_ORIGIN` through your
private shell environment. Use the installation's public HTTPS origin.
The GitHub token needs read access to Actions artifacts and deployments;
the Render token needs access to read the service and deployments. Then run:

```sh
node scripts/security/verify-installation.mjs
```

This command only reads existing evidence. It checks that monitoring is
enabled, the latest scheduled run succeeds within 36 hours, and no newer
failed or unfinished run hides behind an earlier success. It downloads the
latest run's own status artifact and compares its running and rollback
images with Render and accepted GitHub deployments. Missing, expired,
stale, blocked, unknown, or mismatched evidence fails the command.

It also checks the deployed HTTPS health, version, database readiness,
anonymous provider availability, and application page. It rechecks the
deployment and latest monitoring run before returning success. These
checks overlap the release deployment verification and make that evidence
available without rerunning a deployment job. Save the JSON output with
the version's verification record; exit status zero means these checks pass.

The command does not start a scan, change the installation, restart a
service, or send a notification. A missing scheduled run requires waiting
for and then verifying the scheduled workflow; a manual run alone is
insufficient. Run the separate restart and real sign-in checks from the
[Render guide](render.md#10-check-persistence-through-a-normal-restart).
The output always marks human notification delivery as `unverified`.
Complete the [recipient delivery check](#configure-the-recipient-and-verify-delivery)
and keep its actual receipt confirmation separately.

## Respond to findings and failures

New findings or unknown status open or reopen one persistent status issue.
Repeated findings update that issue's current body without daily duplicate
issues or mentions. Changed findings or policy status send a new mention.
The issue stays open while either retained image is blocked or unknown and
closes only after both pass. A successful scan of a newly built image does
not resolve a finding in a retained image.

Use [private vulnerability reporting](https://github.com/viscalyx/skyttel/security/advisories/new)
for package findings, exploit details, or installation-specific information.
Do not put household data, credentials, or raw scanner reports in the public
status issue. Reproduce the exact digest scan in a trusted environment when
private investigation needs details. Keep raw output in private storage.
Use the [security policy](security-checks.md) for assessment
and time-limited exceptions. Do not extend exceptions automatically.

The maintainer fixes source or dependencies in a reviewed pull request.
After manual merge, the normal release chain verifies and deploys the new
image. Run monitoring again and check both retained images. The previous
image can remain blocked as the rollback target after the running image is
fixed; it stays visible until it is covered by a valid exception or replaced
in the retained set by a later successfully deployed release. Monitoring
never performs an automatic rollback. Database compatibility is a separate
requirement for any recovery image.

If issue delivery fails, the scan exits unsuccessfully and records unknown
status with `notification: failed`. Use Actions failure notifications and
the latest run to restore permissions or recipient settings, then rerun.
If the runner cannot start or checkout fails, there may be no status artifact;
this also requires investigation, never a clean status assumption.

## Maintenance and retention

Every week, the maintainer reviews Dependabot proposals, scanner releases,
base image updates, open findings, and exception expiry. Standalone scanner
versions and their archive checksums must be updated together with the
release scanner versions through normal review and testing.

At least monthly, and before approving a merge that deploys production,
the operator checks the most recent successful daily scan against the actual
running and rollback digests, confirms it is no older than 36 hours, and
checks the current status issue. Investigate any intervening failure.
Run a fresh scan before proceeding when evidence is stale or unknown.

GitHub can disable scheduled workflows in inactive public repositories.
Open **Actions → Deployed image security**, select **Enable workflow** if
disabled, and run it manually. Verify the next scheduled run appears and
that the operator still receives notifications. If the workflow file is
missing from `main`, restore it through a reviewed change. See
[scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Retain the running image and its previous distinct accepted deployment in
GHCR, their GitHub deployment records, signed release evidence, and latest
successful scan evidence. Keep any additional planned recovery material
under the same protection. General cleanup of temporary build files must
exclude this retained set. Scan artifacts request 90 days of Actions
retention; copy needed evidence to private operator storage before expiry.
Do not delete an image or its deployment record to silence an alarm.

The maintenance scope covers the running installation and retained
rollback image. Fixes are delivered through a new verified release for
the running installation; recovery still requires a compatible image and
database.

## Verification boundaries

`npm run test:gates` uses synthetic deployment and scanner responses to
exercise digest selection, repeated and new findings, exception validity
and expiry, missing evidence, stale databases, production drift, and alarm
failure. It also tests the read-only verification command with synthetic
HTTP responses and real status archives, including stale or failed scheduled
runs and mismatched live images. These tests do not establish real Render,
GHCR, scheduled workflow, or human notification delivery. Run the read-only
verification on the configured installation for live evidence, and record
actual notification receipt using the procedure above.
