# Deploy and recover Skyttel on Render

This guide walks a first-time Render operator through setup, verification,
and recovery. You need access to the Render workspace, permission to manage
GitHub repository environments, and access to the Google and Microsoft app
registrations used for sign-in. Keep both dashboards open while you work.

Complete the first deployment while someone is available to check it. After
setup, an approved merge to `main` publishes a verified image and deploys it
automatically. No second approval is required. A stable tag publishes a
release but does not replace production.

If this installation already contains household data, start with
[updating an existing installation](#updating-an-existing-installation).

## Understand the names

- A **workspace** groups your Render services and billing settings.
- A **web service** runs Skyttel and gives it a public HTTPS address.
- A **container image** contains the application and its runtime. Skyttel
  publishes images to GitHub Container Registry, abbreviated **GHCR**.
- An **image digest** identifies one exact image. Its reference contains
  `@sha256:` followed by 64 characters. Use that reference when deploying.
- A **persistent disk** keeps the SQLite database across service restarts
  and replacements. Skyttel uses one disk mounted at `/data`.
- An **origin** is the public address without a trailing slash or path,
  for example `https://skyttel.example.com`.
- GitHub's **production environment** holds deployment credentials.
  Render's **Environment** page holds the application's configuration.
  These are different places with different values.

## 1. Prepare the workspace and GitHub environment

1. Sign in to the [Render dashboard](https://dashboard.render.com/) and
   select or create the workspace that will contain Skyttel. Use the Hobby
   workspace plan. The web service and disk still require paid resources;
   review the displayed charges before creating them. See
   [Render pricing](https://render.com/pricing).
1. Open [the Skyttel repository](https://github.com/viscalyx/skyttel), then
   **Settings → Environments**. Configure the upstream repository where the
   release workflow runs, rather than a development fork.
1. Select `production`, or choose **New environment**, enter `production`,
   and choose **Configure environment**.
1. Under **Deployment branches and tags**, select **Selected branches and
   tags**. Add a branch rule for `main`. Do not allow tags or other branches,
   and do not add required reviewers. The protected branch supplies the
   approval before deployment.
1. Leave the deployment secret and variables empty for now. You will add
   them after the Render service works.

Expected result: the Render workspace exists and GitHub has a `production`
environment restricted to `main`. If repository settings are unavailable,
ask a repository administrator to complete the GitHub steps. GitHub's
[environment instructions](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
explain the settings and permission requirements.

## 2. Select the published image

1. In GitHub, open **Actions → Container release** and select the run for
   the latest commit on `main`. Wait for `plan`, `checks`, `candidate`, and
   `publish` to succeed.
1. The `deploy` job can fail at this stage because the service credentials
   are not configured. This does not remove the published image. Continue
   only if publication succeeds; a build, test, or security failure needs
   to be resolved first.
1. Open the corresponding GitHub release under **Releases**. Expand
   **Assets**, download `release.json`, and open it in a text editor.
   Record its `image`, `digest`, `fullVersion`, and `commit` values.
1. Join `image`, an `@`, and the complete `digest` value. The result has
   this form; replace the example text with the actual digest:

   ```text
   ghcr.io/viscalyx/skyttel@sha256:REPLACE_WITH_THE_COMPLETE_DIGEST
   ```

1. Follow the
   [release verification procedure](../development/container-releases.md#review-a-published-release)
   before using the image. If you cannot run its command-line checks, ask a
   maintainer to verify this exact release and provide the verified image
   reference. Retain its signed release evidence and keep the registry
   image available for future restarts and recovery.

Expected result: you have a verified image reference and its matching
version and commit. Keep the workflow run open for the retry in step 9.

## 3. Create the Render web service and disk

1. In Render, choose **New → Web Service**.
1. Choose **Existing Image** as the source. Paste the verified reference
   into **Image URL**, then choose **Connect**. If the image is private,
   add the registry credential described below before connecting.
1. Enter a service name, for example `skyttel`. Choose **Frankfurt** as the
   region and a paid instance type, such as **Starter**. The free instance
   type cannot use the required persistent disk.
1. Expand **Advanced**. Set **Health Check Path** to `/healthz`. Leave the
   Docker command and pre-deploy command empty; the image already knows
   how to start Skyttel and run its database migrations.
1. Add a persistent disk with mount path `/data`. Choose an initial size
   appropriate for the installation, for example 1 GB for a small initial
   household. Review its charge. Disk size can increase later, but cannot
   decrease.
1. Add `SKYTTEL_DATABASE_PATH` with value `/data/skyttel.sqlite`, `HOST`
   with value `0.0.0.0`, and `PORT` with value `3000` if the creation form
   offers environment variables.
1. Choose **Create Web Service** or **Deploy**, as shown by the form.
   Render starts a deployment immediately. Until you complete step 5,
   startup can fail with `configuration_invalid` because sign-in settings
   are missing. The service page remains available for configuration.
1. On the service page, open **Disks** and confirm the disk is mounted at
   `/data`. If you could not add it in the creation form, add it here;
   attaching it starts another deployment.
1. Keep exactly one service instance. Do not enable autoscaling. Image
   services do not use Git-triggered automatic deployments; if an
   **Auto-Deploy** setting is shown, set it to **No**.

Expected result: one paid web service with one persistent disk. Its first
startup may still fail until you supply the remaining configuration.
Render's [web service guide](https://render.com/docs/web-services) and
[persistent disk guide](https://render.com/docs/disks) describe these controls.

The disk must be writable by the image's UID/GID 1000 user. If startup later
reports a disk permission failure, use the troubleshooting section; do not
switch to temporary storage. A separate database service is unnecessary.
The disk is available to the running application, but not to a pre-deploy
command, so migrations must remain part of application startup.

### If the image is private

In the image form, choose **Credential → Add credential**. Give it a name,
select GHCR as the registry, and enter a GitHub username and personal access
token for an account allowed to read the package. Use a token with only
`read:packages` access. GitHub requires a personal access token **(classic)**
for registry authentication; authorize it for organization SSO if required.
Public images do not require this credential.

This GitHub token lets Render download the image. It is separate from the
Render API key created in step 7. Keep the registry credential valid for
later restarts as well as the first deployment. See
[Render image credentials](https://render.com/docs/deploying-an-image) and
[GitHub registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry).

## 4. Record the address and prepare sign-in

1. Copy the public HTTPS address shown on the Render service page. Use the
   assigned address, including its actual `onrender.com` hostname; do not
   guess it from the service name. Remove any trailing slash. This is your
   `SKYTTEL_ORIGIN`.
1. Record the service ID. In the Render dashboard URL for this service,
   copy the segment beginning with `srv-`. This is `RENDER_SERVICE_ID`;
   it is different from the service name and public address.
1. Follow the
   [provider registration walkthrough](first-time-use.md) to create the
   Google and Microsoft app registrations. That walkthrough describes a
   local installation: for Render, use your public HTTPS origin wherever
   it asks for the application origin or callback address. Both providers
   must be configured before Skyttel starts.
1. Register these callback URLs, replacing `YOUR-SERVICE.onrender.com`
   with the actual hostname from your public address:

   ```text
   https://YOUR-SERVICE.onrender.com/api/auth/callback/google
   https://YOUR-SERVICE.onrender.com/api/auth/callback/microsoft
   ```

1. Store both client IDs and client secrets privately. Follow
   [designate the first administrator](installation.md#designate-the-first-administrator)
   to obtain the intended administrator's stable provider identifier.
   This is Google's `sub` or Microsoft's `oid`, not an email address or
   the application's client ID. The linked guide includes a private local
   lookup procedure if you do not already have this identifier.
1. Generate a random authentication secret of at least 32 characters with
   a password manager. Alternatively, run `openssl rand -base64 48` in a
   private terminal. Store it securely and keep it unchanged across
   deployments.

Expected result: the public origin, service ID, both provider credentials,
first administrator's provider and identifier, and authentication secret are
ready. If you later adopt a custom domain, update the public origin and
provider callback registrations together.

## 5. Enter the application configuration in Render

1. On the Render service page, open **Environment**.
1. Under **Environment Variables**, choose **Add Environment Variable** for
   each row below. Edit any existing entry instead of creating a duplicate.
   Enter values without surrounding quotes or extra spaces.

   <!-- markdownlint-disable MD013 -->
   | Key | Value |
   | :-- | :-- |
   | `SKYTTEL_ORIGIN` | The public HTTPS origin from step 4, without a trailing slash. |
   | `SKYTTEL_DATABASE_PATH` | `/data/skyttel.sqlite` |
   | `SKYTTEL_FIRST_ADMIN_PROVIDER` | `google` or `microsoft`, matching the administrator's identifier. |
   | `SKYTTEL_FIRST_ADMIN_SUBJECT` | The private provider identifier obtained in step 4. |
   | `BETTER_AUTH_SECRET` | The random secret generated in step 4. Keep it stable. |
   | `GOOGLE_CLIENT_ID` | The Google web application's client ID. |
   | `GOOGLE_CLIENT_SECRET` | The Google web application's client secret. |
   | `MICROSOFT_CLIENT_ID` | The Microsoft application's client ID. |
   | `MICROSOFT_CLIENT_SECRET` | The Microsoft application's client secret value. |
   | `HOST` | `0.0.0.0` |
   | `PORT` | `3000` |
   <!-- markdownlint-enable MD013 -->

1. Choose **Save and deploy** to apply the configuration. If you choose
   **Save only**, follow it with **Manual Deploy → Deploy latest reference**.
   A plain service restart does not apply pending environment changes.
1. Open **Deploys** and wait for the deployment to become **Live**. Open
   **Logs** if it fails, and use the troubleshooting section below.

Expected result: Skyttel starts, migrates its database, verifies its
sign-in schema, and accepts traffic. Render's
[environment variable guide](https://render.com/docs/configure-environment-variables)
explains the save options. The deployment API key belongs in GitHub in
step 7; it is not an application environment variable.

## 6. Verify the first live application

1. Open your public origin with `/healthz` appended. Expect
   `{"status":"ok"}`.
1. Open `/api/version` at the same origin. Compare `version` and `commit`
   with the release's `fullVersion` and `commit`. Confirm that
   `database.status` is `ready`.
1. In a private or incognito browser window, open `/api/bootstrap`. Expect
   `status` to be `anonymous` and `providers` to include both `google` and
   `microsoft`.
1. Open the public origin itself. Confirm the sign-in page loads. For a
   new installation, sign in as the designated first administrator and
   create the household. For an existing installation, have an authorized
   user sign in and confirm access to the existing household.
1. Complete the
   [real-provider checks](../development/testing.md#verify-real-identity-providers-separately),
   including personal Microsoft account support and linked logins reaching
   the same household. Keep personal identities and provider responses
   private; record only the check outcomes in shared evidence.

Expected result: the exact released application is healthy and real sign-in
works. A **Live** status or visible sign-in page alone is insufficient.
Resolve failures before enabling automatic updates.

## 7. Give GitHub permission to deploy

1. Use a dedicated Render account whose access is limited to this
   deployment workspace. Its API key inherits the account's access; do
   not use an account with unrelated services.
1. Open Render **Account Settings → API Keys** and create a key named for
   this deployment, such as `Skyttel GitHub deployment`. Copy it into
   private storage when shown; Render only shows the full key once. See
   [Render API authentication](https://render.com/docs/api#1-create-an-api-key).
1. Return to the upstream GitHub repository's
   **Settings → Environments → production**.
1. Under **Environment secrets**, choose **Add environment secret**. Use
   `RENDER_API_KEY` as the name and paste the Render API key as its value.
1. Under **Environment variables**, add the following two entries:

<!-- markdownlint-disable MD013 -->
| Name | Value |
| :-- | :-- |
| `RENDER_SERVICE_ID` | The service ID beginning with `srv-` from step 4. |
| `SKYTTEL_ORIGIN` | The same public HTTPS origin configured in Render. |
<!-- markdownlint-enable MD013 -->

Expected result: `production` contains one deployment secret and two
variables, with access still restricted to `main`. Store the API key as a
secret, never as a plain variable. The workflow's GitHub token can read
release artifacts and create deployment statuses; it cannot publish images
from the deployment job.

## 8. Enable failure notifications

1. In the Render workspace, open **Integrations → Notifications**. Choose
   the operator's email destination and **Only failure** or **All**.
1. On the service's **Settings** page, check **Notifications** for a
   service-specific override. Ensure it does not disable failure messages.
   See [Render notifications](https://render.com/docs/notifications).
1. In GitHub, open your account's **Settings → Notifications**. Under
   **System → Actions**, select **Email** and, optionally,
   **Only notify for failed workflows**, then save. Configure the account
   that triggers releases: these notifications cover runs that account
   triggers. See
   [GitHub Actions notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)
   and [who receives run notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).
1. Verify both destinations with a controlled failed check before relying
   on them. Arrange this with a maintainer without disrupting household
   data or an active migration.

Expected result: the operator can receive both Render and GitHub failures.
GitHub can report a failed deployment even when Render shows **Live**, for
example when the application's verification checks fail.

## 9. Retry the GitHub deployment and read its result

1. Return to **Actions → Container release** and the run from step 2.
   Confirm its commit is still the latest commit on `main`. If a newer
   release exists, use that run instead; older candidates are skipped.
1. Choose **Re-run jobs → Re-run failed jobs**. The `deploy` job now has
   the credentials it needs. A retry verifies an already live matching
   image without another restart, or deploys the requested new image.
1. Wait for `deploy` to succeed. Read its summary, then open the workflow
   run's **Artifacts** section and download `render-deployment-<attempt>`.
1. Extract the artifact and open `deployment.json`. Confirm `outcome` is
   `success`, `health` is `ok`, and `database` is `ready`. Check the requested
   version, commit, and digest against the release. The `savedImage` and
   `observedDeploy.digest` must identify the same requested image, with
   `observedDeploy.status` equal to `live`.

Expected result: GitHub records a successful, verified deployment. See
[rerunning GitHub jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
if the retry control is unavailable. Retain the report with the release
evidence beyond the workflow's 90-day artifact retention period.

The report combines Render's resolved image digest with the application's
compiled version, commit, and database schema identity. An image cannot
embed its own final digest. Successful checks also cover the anonymous
bootstrap, application page, and final service identity. Public endpoints
contain no household names, content, or identities.

## 10. Check persistence through a normal restart

1. Have an authorized user save an object and a private draft. Note what
   should remain, without copying household content into shared evidence.
1. Confirm no deployment is running. In Render, open **Deploys**, then
   choose **Manual Deploy → Restart service**. Expect a short interruption
   because this service uses a persistent disk.
1. Repeat the health and version checks in step 6. Compare the saved image
   reference and live deployment digest again. You can rerun the GitHub
   `deploy` job for the same latest release to produce another verification
   report without replacing an already matching image.
1. Have the user sign in and confirm that household content and drafts
   remain. Record pass/fail and the version identity.

Expected result: the same image runs with the existing household data.
Render documents the control under
[restarting a service](https://render.com/docs/deploys#restarting-a-service).

Future merges to `main` deploy automatically. Only the release workflow may
make unattended changes: do not run deploy hooks, another workflow,
Blueprint auto-sync, or dashboard deployments concurrently. The workflow
serializes changes and does not cancel an active migration.

Old browser sessions cannot write with an outdated build identity. Tell
users to copy unsent form text before reloading. An interrupted save has an
unknown result until its receipt is checked; reloading does not establish
that unsent text or an interrupted save was stored.

## Updating an existing installation

Keep the existing service, persistent disk, and authentication secret.

1. Read the [operator upgrade notes](operator-upgrade-notes.md) and complete
   any required preparation before approving a merge to `main`.
1. After the merge, open **Actions → Container release** for that commit.
   The workflow publishes the verified image and deploys its exact digest
   to the configured Render service automatically.
1. Wait for `deploy` to succeed, then inspect the deployment report using
   step 9. If it fails, follow the diagnosis procedure below before retrying.
1. Confirm application health, version, and existing household access using
   step 6. Perform any additional checks required by the upgrade notes.

## Diagnose failure before retry

Open the GitHub deployment report and Render's **Deploys** and **Logs**
pages. Compare the saved image reference, the live deployment's resolved
digest, and `/api/version`. If the application cannot respond, its version
and database readiness are unknown.

<!-- markdownlint-disable MD013 -->
| Symptom or report reason | Next action |
| :-- | :-- |
| Render cannot download the image | Check the complete digest reference and, for private images, the registry credential's package access. |
| `configuration_invalid` | Find the variable name in the startup event, correct it in Render **Environment**, then use **Save and deploy**. |
| Sign-in fails | Compare the actual public origin and both registered callback URLs. Check provider credentials and follow the real-provider verification guide. |
| `unsafe_service_configuration` | Check one image web service, one instance, no autoscaling or auto-deploy, disk at `/data`, `/healthz`, and empty command overrides. Ask a maintainer to inspect the Render API if a setting is not visible in the dashboard. |
| `database_not_on_persistent_disk` | Explicitly set `SKYTTEL_DATABASE_PATH` to `/data/skyttel.sqlite` and confirm the `/data` disk is attached. |
| `database_initialization_failed` | Inspect the safe reason in private logs. Check free disk space and write permission for UID/GID 1000; ask a maintainer to repair permissions if needed. Preserve the existing database. |
| A migration or deployment is still running | Wait. A GitHub timeout does not cancel Render. Do not cancel the migration or start a competing deployment. |
| `previous_deployment_requires_diagnosis` or an image mismatch | Reconcile the failed or canceled deployment, saved image, running image, and database state in an attended maintenance window before retrying. |
| `superseded` | Use the release run for the current head of `main`. The older candidate is intentionally skipped. |
<!-- markdownlint-enable MD013 -->

Release build, test, or security failures do not call Render. After a
deployment begins, the application and database can change independently.
Migrations are transactional, but a successful startup followed by a failed
application check can leave a newer schema. Never assume a failed rollout
left both code and database at their previous state.

Resolve the cause before retrying. Do not delete migration history,
initialize a new empty database, or replace the disk to clear a failure.
Inspect migration state on the existing disk with a maintainer when needed.
Share sanitized reason codes and version identity, not databases, household
screenshots, cookies, credentials, raw provider responses, or full logs.

### Recover with older code only when compatible

1. Have a maintainer establish that the older image supports the current
   database schema and migration checksums. Read the release guidance and
   test compatibility on synthetic data. If compatibility is unknown,
   keep access closed and repair forward.
1. Verify the older image's release evidence. Wait for any active
   deployment to finish, then update the saved image reference under the
   service's **Settings** to the verified digest.
1. Choose **Manual Deploy → Deploy latest reference** so the saved
   reference and requested deployment agree.
1. Verify the live digest, database readiness, application page, anonymous
   bootstrap, and real household access using the checks above.
1. Retry the GitHub release job only after the service and database state
   are reconciled and the intended next release is safe to deploy.

Deploying older code does not restore the database. Do not use a rollback
button as a substitute for establishing schema compatibility. An image
override on a deploy hook does not update the saved service reference and
can select an older image on a later deployment. For maintainer-assisted
recovery, see Render's
[update service API](https://api-docs.render.com/reference/update-service)
and [deploy API](https://api-docs.render.com/reference/create-deploy).

## What automated checks cover

Release checks use disposable containers with synthetic household content.
They verify restart and replacement on the same disk, including private
drafts, objects, history, and save receipts. An injected failed migration
checks that existing content remains. Personal-view persistence will join
this check when that feature arrives.

Deployment controller tests simulate Render failures and competing releases.
These checks do not establish real Render or identity-provider behavior;
the first live deployment and real-provider verification above remain
separate operator checks.

## Disk loss and future recovery

Persistent disk protects ordinary restarts and deployments. It does not
protect against loss of the disk. No extra automatic backup is configured.
The planned portable recovery path is complete versioned household export
and reimport; it is not implemented yet. Until it exists, do not present a
code rollback as data recovery. Data since the last usable export can be
lost in a major failure, and extended downtime can be necessary. Server
secrets and fresh login associations remain separate from household export.
