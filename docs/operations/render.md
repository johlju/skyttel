# Deploy and recover Skyttel on Render

This guide walks a first-time Render operator through setup, verification,
and recovery. You need access to the Render workspace, permission to manage
GitHub repository environments, and accounts that can register Google and
Microsoft sign-in applications. The [production authentication guide](authentication.md)
explains those accounts and registrations from the beginning. Keep the
deployment and authentication guides open while you work.

Complete the first deployment while someone is available to check it. After
setup, an approved merge to `main` publishes a verified image and deploys it
automatically. No second approval is required. A stable tag publishes a
release but does not replace production.

If this installation already contains household data, start with
[updating an existing installation](#updating-an-existing-installation).

## Setup checklist

Use this inventory to prepare for the first deployment and track progress.
Gather the access below before starting. The walkthrough creates or verifies
the remaining items in order; you do not need their values in advance.

### Gather before starting

- [ ] **Render access:** permission to manage the workspace, web service,
      persistent disk, and billing for paid resources; a monitored email
      address for the dedicated deployment account.
- [ ] **GitHub access:** permission to manage the upstream repository's
      `production` environment, read releases, and rerun workflow jobs.
- [ ] **Release verification tools or help:** an authenticated GitHub CLI
      (`gh`), Node.js, `jq`, and the repository's release scripts, or a
      maintainer who can verify the release and provide its deployment values.
- [ ] **Provider registration access:** Google and Microsoft accounts with
      the permissions described in
      [authentication prerequisites](authentication.md#before-you-start).
- [ ] **People for sign-in checks:** the intended first administrator and a
      controlled nonmember account. The administrator or another intended
      household user needs both a Google and a personal Microsoft account
      for linking. Include a work or school Microsoft account if the
      household will use one.
- [ ] **Private storage and contact details:** a password manager or secret
      store, a private place for verification records, and an operator email
      address monitored for failure notifications.
- [ ] **Optional domain access:** permission to edit DNS for a custom domain.
      This is unnecessary if you use the assigned `onrender.com` address.

### Collect during setup

Keep values and completion notes in your private setup record. Store secrets
in the password manager or secret store. After each expected result, a
**Checklist update** names the items you can mark complete. Mark optional
items as unnecessary when you skip them.

<!-- markdownlint-disable MD013 -->
| Item | What to gather or confirm | Ready after |
| :-- | :-- | :-- |
| Deployment account | Dedicated Render login, account recovery details in a password vault, and the deployment workspace and role. | [Account setup](#prepare-the-deployment-account) |
| Workspace and release environment | Render workspace and GitHub `production` environment restricted to `main`. | [Step 1](#1-prepare-the-workspace-and-github-environment) |
| Release identity | Verified `image`, `digest`, `tag`, `fullVersion`, `commit`, complete `image@digest` reference, and retained signed release evidence. | [Step 2](#2-select-the-published-image) |
| Service and disk | One paid web service and one persistent disk mounted at `/data`. | [Step 3](#3-create-the-render-web-service-and-disk) |
| Private image access | Optional GHCR username and classic token with `read:packages`, saved as a Render registry credential. | [Private image setup](#if-the-image-is-private) |
| Custom domain | Optional hostname with verified DNS and an issued HTTPS certificate. | [Custom domain setup](#optional-add-a-custom-domain) |
| Address and service ID | Final public `SKYTTEL_ORIGIN` and `RENDER_SERVICE_ID` beginning with `srv-`. | [Step 4](#record-the-chosen-address) |
| Provider registrations | Google project and Microsoft registration details, both callback URLs, both client IDs and secrets, Microsoft secret expiry and renewal reminder, and Google publishing settings for the intended audience. | [Step 4](#record-the-chosen-address) |
| Application secret | A securely stored, stable `BETTER_AUTH_SECRET`. | [Step 4](#record-the-chosen-address) |
| First administrator | `SKYTTEL_FIRST_ADMIN_PROVIDER` and verified `SKYTTEL_FIRST_ADMIN_SUBJECT`, applied to the service. | Provider in [step 4](#record-the-chosen-address); verified subject in [step 6](#6-verify-the-first-live-application) |
| Render configuration | All application environment variables saved and deployed, including `SKYTTEL_DATABASE_PATH=/data/skyttel.sqlite`, `HOST=0.0.0.0`, and `PORT=3000`. | [Step 5](#5-enter-the-application-configuration-in-render) |
| Live access checks | Matching release identity, household access, Google and personal Microsoft sign-in, linked accounts, rejected nonmember access, and recorded check outcomes. | [Step 6](#6-verify-the-first-live-application) |
| Setup access closed | Production terminal sessions closed and any temporary keys or helper access removed. | [Terminal cleanup](#use-and-close-the-production-terminal) |
| Deployment credentials | `RENDER_API_KEY` as a GitHub environment secret; matching service ID and origin as environment variables. | [Step 7](#7-give-github-permission-to-deploy) |
| Failure notifications | Render and GitHub destinations configured and both controlled failure notifications received. | [Step 8](#8-enable-failure-notifications) |
| Deployment evidence | Successful `deployment.json`, checked against the release identity and retained with the release evidence. | [Step 9](#9-retry-the-github-deployment-and-read-its-result) |
| Restart evidence | Confirmation that the same image, household content, and private drafts survive a service restart; recorded outcome and version identity. | [Step 10](#10-check-persistence-through-a-normal-restart) |
<!-- markdownlint-enable MD013 -->

The initial subject `not-configured` is temporary. Keep **First administrator**
open until step 6 verifies the real identity, and **Restart evidence** open
until step 10 confirms persistence on this deployment.

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

### Prepare the deployment account

This Render account supplies the API key that GitHub uses in step 7. Reserve
it for Skyttel: Render API keys can access every workspace their account
belongs to. Selecting a workspace in the dashboard does not limit the key.
See [Render API authentication](https://api-docs.render.com/reference/authentication).

The deployment workspace must also be reserved for Skyttel. Inviting a
separate account to a workspace containing other applications gives it
access to those applications too.

> [!IMPORTANT]
> A Hobby workspace cannot invite another account. For a new deployment,
> the dedicated account can own the Hobby workspace from the start. To add
> it to a workspace owned by another account, use Pro or higher. Keep the
> existing service and disk, and review the workspace plan charge before
> upgrading. See [Render workspace membership](https://render.com/docs/team-members#manage-team-members).

1. If your current Render account is already reserved for this deployment,
   use it. Otherwise, open a separate browser profile or private window and
   [sign up for Render](https://dashboard.render.com/register) with an email
   address you control and monitor. You can use email and a unique password;
   save the login details in a password vault. If the destination workspace
   requires Google login, use the Google account matching the invited email
   address instead.
1. In the dedicated account, open **Account Settings → Account Security**
   and enable two-factor authentication. Save its recovery information in
   your password vault. See [Render login settings](https://render.com/docs/login-settings).
1. If the dedicated account will own a new workspace, use the Hobby workspace
   Render creates for it and continue with the access check below.
1. If it needs access to another account's existing workspace, sign in as
   that workspace's Admin in your usual browser. Open the
   workspace's **Billing** page and, if it uses Hobby, select **Update Plan**
   to upgrade to Pro after reviewing the charge. Then open
   **Settings → Team members → + Invite members** and enter the dedicated
   account's email address. Choose **Developer** for an unprotected service,
   or **Admin** if you use or plan to use a protected project environment.
   Accept the invitation while signed in to the dedicated account.
1. Check the dedicated account's workspace access. It should have access to
   the Skyttel deployment and no unrelated services or workspaces containing
   other applications. For an existing deployment, confirm that the same
   service and disk remain in the original workspace. Record the account
   email, workspace, and role in your private setup record.

The role choice follows this deployment workflow's need to read service
configuration, update the saved image, and deploy it. Reading environment
variables requires an Admin in a protected environment, so its deployment
account also needs that role. See
[Render role permissions](https://render.com/docs/team-members#role-permissions)
and [protected environments](https://render.com/docs/projects#protected-environments).

Expected result: a dedicated Render account can access the deployment
workspace with the required role, and you can recover its login when needed.

Checklist update: **Deployment account** is ready. Create its API key in
step 7 after the live application checks succeed.

### Prepare the workspace and repository settings

Use the workspace's Admin account for the remaining setup. On Hobby, this
is also the dedicated deployment account. If you invite a separate account,
sign in to it again when creating the API key in step 7.

1. Sign in to the [Render dashboard](https://dashboard.render.com/) and
   select the Skyttel workspace from the account setup above. Use Hobby when
   the dedicated account owns the workspace, or retain Pro or higher when
   you invite it as an additional member. The web service and disk still
   require paid resources; review the displayed charges before creating
   them. See
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
environment restricted to `main`.

Checklist update: **Workspace and release environment** are ready.

If repository settings are unavailable, ask a repository administrator to
complete the GitHub steps. GitHub's
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
   Record its `image`, `digest`, `tag`, `fullVersion`, and `commit` values.
   Use `tag`, including its leading `v`, as `release_tag` in the release
   verification procedure below. Keep `fullVersion` for the application
   version check in step 6; it can include `+...` build metadata that is
   absent from the tag.
1. Join `image`, an `@`, and the complete `digest` value. The result has
   this form; replace the example text with the actual digest:

   ```text
   ghcr.io/viscalyx/skyttel@sha256:REPLACE_WITH_THE_COMPLETE_DIGEST
   ```

   This is the image reference that Render accepts. The `oci://` prefix
   shown by GitHub's verification command is not part of this value.

1. Follow the
   [release verification procedure](container-releases.md#review-a-published-release)
   before using the image. The registry check reports
   `✓ Verification succeeded!` and lists the matching attestation.
1. After verification succeeds, run the separate command under
   [Print deployment values](container-releases.md#print-deployment-values).
   That command prints **Image URL**, **Application version**, and
   **Source commit**. Copy the complete value after `Image URL:` for step 3.
   If you cannot run the command-line checks, ask a maintainer to verify
   this exact release and provide those three values. Retain its signed
   release evidence and keep the registry image available for future
   restarts and recovery.

Expected result: successful verification and a saved image reference in the
`ghcr.io/viscalyx/skyttel@sha256:...` form, plus its application version and
source commit.

Checklist update: **Release identity** is ready, including the release tag
and retained verification evidence.

Keep the workflow run open for the retry in step 9.

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
   services require explicit deployment requests. There is no **Auto-Deploy**
   setting to configure for this image service; GitHub requests each verified
   release through the Render API.

Expected result: one paid web service with one persistent disk. Its first
startup may still fail until you supply the remaining configuration.

Checklist update: **Service and disk** are ready. Apply any missing database,
host, and port settings with the rest of the configuration in step 5.

Render's [web service guide](https://render.com/docs/web-services) and
[persistent disk guide](https://render.com/docs/disks) describe these controls.
See [Render's deployment guide](https://render.com/docs/deploys#automatic-deploys)
for the difference between Git-triggered and image-service deployments.

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

Expected result: Render has a registry credential that can read the private
image when you connect it to the service.

Checklist update: **Private image access** is ready. Mark it unnecessary
if the image is public.

This GitHub token lets Render download the image. It is separate from the
Render API key created in step 7. Keep the registry credential valid for
later restarts as well as the first deployment. See
[Render image credentials](https://render.com/docs/deploying-an-image) and
[GitHub registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry).

## 4. Record the address and prepare sign-in

Choose either the assigned `onrender.com` address or a custom domain before
registering Google and Microsoft callbacks. To keep the assigned address,
skip to [record the chosen address](#record-the-chosen-address).

### Optional: add a custom domain

You need a domain you control and access to its DNS settings. DNS records
tell browsers where to send requests for a hostname. An unused subdomain,
such as `skyttel.example.com`, lets you use Skyttel alongside an existing
website on `example.com`.

1. On the Render web service page, open **Settings** and find
   **Custom Domains**. Choose **Add Custom Domain**, enter the hostname
   without `https://` or a path, then **Save**.
1. Keep Render's DNS instructions open. In your domain's DNS provider,
   open the DNS settings for the domain. For a subdomain such as
   `skyttel.example.com`, add a **CNAME** record named `skyttel` that points
   to this service's actual `onrender.com` hostname. Copy the target from
   Render without `https://` or a path; do not guess it from the service name.
1. Change only records for the selected hostname. Remove conflicting
   records there, including any **AAAA** record, as Render directs. For a
   root domain such as `example.com`, follow Render's
   [root-domain DNS instructions](https://render.com/docs/configure-other-dns#configuring-root-domains).
   Use the provider-specific instructions for
   [Cloudflare](https://render.com/docs/configure-cloudflare-dns) or
   [Namecheap](https://render.com/docs/configure-namecheap-dns) where applicable.
1. Return to **Settings → Custom Domains** in Render and click **Verify**
   beside the domain. DNS changes can take time to propagate; if verification
   is pending, wait and retry. Render automatically issues and renews the
   HTTPS certificate after verification.
1. Confirm Render shows the domain as verified and its certificate as issued.
   Use the final hostname that serves the application directly. If Render
   redirects between the root domain and `www`, choose the destination
   hostname: Skyttel's deployment checks do not follow redirects.

Expected result: the custom hostname is configured in Render, with DNS
verified and an HTTPS certificate issued.

Checklist update: **Custom domain** is ready. Mark it unnecessary if you
keep the assigned `onrender.com` address.

The application can still be unavailable until you enter authentication
settings in step 5; check its health in step 6. If certificate issuance
stalls, follow Render's
[custom-domain troubleshooting and certificate requirements](https://render.com/docs/custom-domains).

Render keeps the assigned `onrender.com` address when you add a custom
domain. Use the one chosen origin consistently for sign-in and deployment
checks. Continue below with the custom address.

### Record the chosen address

1. Copy the chosen public HTTPS address: either the verified custom domain,
   such as `https://skyttel.example.com`, or the assigned address shown on
   the service page, including its actual `onrender.com` hostname. Remove
   any trailing slash. This is your `SKYTTEL_ORIGIN`; use the same value in
   Render's environment and GitHub's `production` environment in step 7.
1. Record the service ID. In the Render dashboard URL for this service,
   copy the segment beginning with `srv-`. This is `RENDER_SERVICE_ID`;
   it is different from the service name and public address. Save it for
   GitHub's `production` environment in step 7.
1. Complete sections 1–3 of
   [production authentication](authentication.md#1-choose-the-production-address).
   Use this service's actual HTTPS origin for both callback URLs. That guide
   covers Google publishing choices, Microsoft directory requirements,
   registration, and private credential storage. Return here with
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, and
   `MICROSOFT_CLIENT_SECRET` saved privately. Both providers are required
   for startup.
1. Choose the intended first administrator's provider: `google` or
   `microsoft`. Record this as `SKYTTEL_FIRST_ADMIN_PROVIDER` in your private
   setup record. For an existing household, retain its configured provider.
1. For a new installation, record `not-configured` as the initial
   `SKYTTEL_FIRST_ADMIN_SUBJECT`. You will replace this temporary value with
   the verified identifier obtained through sign-in on this production
   service in step 6. No local installation is required. For an existing
   household, retain its configured subject.
1. Generate a random authentication secret of at least 32 characters with
   a password manager. Alternatively, run `openssl rand -base64 48` in a
   private terminal. Use the generated value for `BETTER_AUTH_SECRET` in
   step 5; this is the checklist's **Application secret**. Save the value in
   a password vault so you can retrieve it when needed, and keep it unchanged
   across deployments.

Expected result: your private setup record contains `SKYTTEL_ORIGIN`,
`RENDER_SERVICE_ID`, the Google client ID (`GOOGLE_CLIENT_ID`) and secret
(`GOOGLE_CLIENT_SECRET`), the Microsoft client ID (`MICROSOFT_CLIENT_ID`)
and secret (`MICROSOFT_CLIENT_SECRET`), `SKYTTEL_FIRST_ADMIN_PROVIDER`,
the initial `SKYTTEL_FIRST_ADMIN_SUBJECT`, and `BETTER_AUTH_SECRET` for
the following configuration steps.

Checklist update: **Address and service ID**, **Provider registrations**, and
**Application secret** are ready. **First administrator** has a recorded
provider and initial subject; its verified subject remains open until step 6.

For a later domain change, follow the
[domain transition procedure](authentication.md#change-the-public-domain)
and update the GitHub `production` environment's `SKYTTEL_ORIGIN` as well.

## 5. Enter the application configuration in Render

1. On the Render service page, open **Environment**.
1. Under **Environment Variables**, choose **Add Environment Variable** for
   each row below. Edit any existing entry instead of creating a duplicate.
   Enter values without surrounding quotes or extra spaces.

   <!-- markdownlint-disable MD013 -->
   | Key | Value |
   | :-- | :-- |
   | `SKYTTEL_ORIGIN` | The public address from step 4, including `https://` but without a trailing slash or path, for example `https://skyttel.example.com`. |
   | `SKYTTEL_DATABASE_PATH` | `/data/skyttel.sqlite` |
   | `SKYTTEL_FIRST_ADMIN_PROVIDER` | `google` or `microsoft`, matching the intended administrator's login. |
   | `SKYTTEL_FIRST_ADMIN_SUBJECT` | For a new installation, `not-configured` until the production lookup in step 6. After lookup, replace it with the verified identifier. Retain the existing value for an established household. |
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
sign-in schema, and accepts traffic.

Checklist update: **Render configuration** is ready. **First administrator**
and **Live access checks** still require step 6.

Render's
[environment variable guide](https://render.com/docs/configure-environment-variables)
explains the save options. The deployment API key belongs in GitHub in
step 7; it is not an application environment variable.

> [!IMPORTANT]
> With `not-configured`, a healthy service can authenticate people but cannot
> create its first household. Complete the production administrator lookup
> in step 6, replace the subject, and use **Save and deploy** again. Do not
> substitute an email address or select an arbitrary signed-in account.

## 6. Verify the first live application

1. Open your public origin with `/healthz` appended. Expect
   `{"status":"ok"}`.
1. Open `/api/version` at the same origin. Compare `version` and `commit`
   with the release's `fullVersion` and `commit`. Confirm that
   `database.status` is `ready`.
1. In a private or incognito browser window, open `/api/bootstrap`. Expect
   `status` to be `anonymous` and `providers` to include both `google` and
   `microsoft`.
1. Open the public origin itself and confirm the sign-in page loads.
   For a new installation, follow
   [identify the first administrator](authentication.md#5-identify-the-first-administrator-on-the-running-service)
   on this running service. Use the terminal instructions below for the
   lookup, then return to **Environment**, replace the subject, and use
   **Save and deploy**. Wait for readiness and finish household creation in
   that procedure. For an existing installation, have an authorized user
   sign in and confirm the existing household opens.
1. Complete the [production sign-in checks](authentication.md#6-verify-production-sign-in)
   using this deployment and its actual provider registrations. Include
   personal Microsoft sign-in and linked logins reaching the same household.
   Perform the restart check when you reach step 10 below.
1. Follow [close setup access](authentication.md#close-setup-access), including
   the terminal access options below. Keep personal identities and provider
   responses private; record only check outcomes in shared evidence.

Expected result: the exact released application is healthy and real sign-in
works.

Checklist update: **First administrator** and **Live access checks** are
complete after the production lookup, household setup, and all required
sign-in checks succeed. **Setup access closed** is complete after the cleanup
below. Keep **Restart evidence** open until step 10.

A **Live** status or visible sign-in page alone is insufficient. Resolve
failures before enabling automatic updates.

### Use and close the production terminal

1. On the **running web service's** page, open **Shell**. A paid web service
   supports this terminal; the free instance type does not. You do not need
   to register a personal SSH key for the dashboard procedure.
2. Use the [administrator lookup](authentication.md#5-identify-the-first-administrator-on-the-running-service)
   in that terminal. It reads the live database. Do not use a temporary
   shell instance, a one-off job, or a pre-deploy command, which cannot
   provide this lookup on the running service's disk.
3. Type `exit` when finished, close the terminal tab, and clear copied
   identity values from the clipboard. Redeployment also closes active SSH
   sessions. Do not leave a helper's session open after setup.

If you prefer your own SSH terminal, follow
[Render's SSH setup](https://render.com/docs/ssh) and use the connection
command for this running service. The image supplies the runtime user's
private `.ssh` directory required by Render. It contains no keys, does not
start an SSH server, and does not add an application port. Render manages
access. Deleting the directory in a running container is not an access
control and will not persist across deployments.

To restrict future terminal access after setup:

- If you added a temporary SSH key, remove it from your Render
  **Account settings → SSH Public Keys** after closing its session.
  Removing a key does not disable Dashboard Shell.
- If your workspace has temporary helpers, an Admin can use
  **Settings → Team members** → the member's **•••** → **Remove team member**.
  Keep the operator account needed for maintenance. Team membership requires
  a Pro or higher workspace; a Hobby workspace has no extra team members.
- To limit service terminals and secret settings to workspace Admins, put
  the service in a Render project environment. From the project page, open
  that environment's **••• → All settings → Permissions → Edit**, choose
  **Protected**, then **Save**. If necessary, first create the project and
  use the existing service's **••• → Move** to place it in that environment.
  Keep the same service and disk. Check that the account used for automatic
  deployment retains the required access before continuing.

Expected result: setup sessions are closed and any temporary SSH keys or
helper access are removed. The operator retains maintenance access.

Checklist update: **Setup access closed** is complete. Record any optional
restriction on future terminal access separately from closing sessions.

> [!NOTE]
> Closing a session does not revoke permission to open another one.
> A protected Render environment limits terminal access to Admins; it does
> not disable Admin access. These controls do not provide a complete
> terminal shutdown. Keep Render account access restricted to the operators
> who need it.

See [Render's terminal controls](https://render.com/docs/ssh),
[protected environments](https://render.com/docs/projects#protected-environments),
and [member permissions](https://render.com/docs/team-members).

## 7. Give GitHub permission to deploy

1. Sign in to the dedicated Render account from
   [prepare the deployment account](#prepare-the-deployment-account).
   Confirm you are using that account before creating the API key. Its
   access should still be limited to this deployment.
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
| `SKYTTEL_ORIGIN` | The same public address configured in Render, including `https://` but without a trailing slash or path, for example `https://skyttel.example.com`. |
<!-- markdownlint-enable MD013 -->

Expected result: `production` contains one deployment secret and two
variables, with access still restricted to `main`.

Checklist update: **Deployment credentials** are ready, with the same
**Address and service ID** recorded in step 4. Step 9 verifies deployment.

Store the API key as a secret, never as a plain variable. The workflow's
GitHub token can read release artifacts and create deployment statuses; it
cannot publish images from the deployment job.

## 8. Enable failure notifications

1. Sign in to Render as the workspace Admin again if you switch to a
   separate deployment account in step 7. In the workspace, open
   **Integrations → Notifications**. Choose the operator's email destination
   and **Only failure** or **All**.
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

Checklist update: **Failure notifications** are complete after both controlled
failure notifications arrive at the monitored destinations.

GitHub can report a failed deployment even when Render shows **Live**, for
example when the application's verification checks fail.

## 9. Retry the GitHub deployment and read its result

1. Return to **Actions → Container release** and the run from step 2.
   Choose a main push whose plan summary requires Render deployment. If a
   newer push changes production inputs, use that run instead. Later
   documentation or devcontainer changes alone do not prevent a retry.
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

Expected result: GitHub records a successful, verified deployment.

Checklist update: **Deployment evidence** is complete after you check and
retain the successful report with its matching **Release identity**.

See
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

Checklist update: **Restart evidence** is complete after the health, image,
household content, and private draft checks pass and you record the outcome.

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
   to the configured Render service automatically when the push changes
   production inputs. Documentation, tests, release tooling, and devcontainer
   changes alone publish without deploying. The plan summary records this
   decision; see the [production input list](container-releases.md#triggers-and-version-identity).
1. Wait for `deploy` to succeed, then inspect the deployment report using
   step 9. If it fails, follow the diagnosis procedure below before retrying.
1. Confirm application health, version, and existing household access using
   step 6. Perform any additional checks required by the upgrade notes.

## Diagnose failure before retry

Open the GitHub deployment report and Render's **Deploys** and **Logs**
pages. Compare the saved image reference, the live deployment's resolved
digest, and `/api/version`. If the application cannot respond, its version
and database readiness are unknown.

For `unsafe_service_configuration`, read the failed field names and expected
and observed values in the GitHub job log. The report retains the same
details in `configurationFailures`. Arbitrary API strings and command
contents are redacted. This check stops before requesting a Render
deployment, so Render can still show the previous deployment as **Live**.
For older reports without these details, a maintainer must read the current
service configuration through the authenticated Render API; the original
configuration response cannot be recovered from the report.

For request failures, the job error and summary identify the deployment phase,
the API or application endpoint, and the HTTP status or network error code.
The `render-deployment-<attempt>` artifact contains:

- `deployment.json`: the original failure, failed request, completed checks,
  final observations, and request history. Failures during evidence collection
  or GitHub status recording do not replace the original request failure.
- `requests.ndjson`: one JSON record for each completed request, with its UTC
  timestamp, phase, method, endpoint, status, and elapsed milliseconds. The job
  also prints these records as requests complete, so they remain available if
  execution stops before the final report is written.

To retrieve the evidence with GitHub CLI, replace the run ID, job ID, and
attempt number with those shown in the failed run:

```bash
gh run view RUN_ID --repo viscalyx/skyttel --job JOB_ID --log
gh run download RUN_ID --repo viscalyx/skyttel \
  --name render-deployment-ATTEMPT --dir deployment-evidence
```

Use the failed request timestamp and deployment ID to find the corresponding
events in the service's Render **Logs** and **Deploys** pages. Render runtime
logs require your Render access; they are not copied to GitHub. Public evidence
excludes response bodies, credentials, arbitrary error messages, and household
content. A missing HTTP status means no response headers were received. For a
response read or JSON error, the record retains the received HTTP status.

Render can report a deployment as **Live** while its public endpoint still
returns a temporary gateway error. Application checks allow up to 12 attempts
per request, with five seconds between attempts, for HTTP 502, 503, 504 and
temporary connection failures. Each request has a 15-second timeout. All
attempts remain in the request evidence. The job still requires the expected
release identity, a ready database and successful smoke checks. Persistent
errors fail the job; deployment writes are never automatically retried.

An older job can fail on its first temporary gateway error even when Render
finishes the deployment. Compare its requested release with the current
`/api/version`, confirm `/healthz` and database readiness, and inspect the
saved and live image evidence before retrying. When those identities agree,
retrying verifies the existing deployment without restarting it. Rerunning an
older job uses its original verification script.

If the job stops before the deploy step starts, use the job log to diagnose
the earlier failed step. There may be no deployment artifact in that case.

Older deployment scripts can reject an image service because its API
response contains `autoDeploy: "yes"`. This field does not enable automatic
deployment for image services and needs no dashboard change. Use a release
run from the current main branch with the corrected checks; rerunning the
older job uses its original script.

<!-- markdownlint-disable MD013 -->
| Symptom or report reason | Next action |
| :-- | :-- |
| Render cannot download the image | Check the complete digest reference and, for private images, the registry credential's package access. |
| `configuration_invalid` | Find the variable name in the startup event, correct it in Render **Environment**, then use **Save and deploy**. |
| Sign-in fails | Compare the actual public origin and both registered callback URLs. Check credentials and follow [production sign-in troubleshooting](authentication.md#troubleshoot-sign-in). |
| `unsafe_service_configuration` | Check one image web service, one instance, no autoscaling, disk at `/data`, `/healthz`, and empty command overrides. Ask a maintainer to inspect the Render API if a setting is not visible in the dashboard. |
| `database_not_on_persistent_disk` | Explicitly set `SKYTTEL_DATABASE_PATH` to `/data/skyttel.sqlite` and confirm the `/data` disk is attached. |
| `database_initialization_failed` | Inspect the safe reason in private logs. Check free disk space and write permission for UID/GID 1000; ask a maintainer to repair permissions if needed. Preserve the existing database. |
| A migration or deployment is still running | Wait. A GitHub timeout does not cancel Render. Do not cancel the migration or start a competing deployment. |
| `previous_deployment_requires_diagnosis` or an image mismatch | Reconcile the failed or canceled deployment, saved image, running image, and database state in an attended maintenance window before retrying. |
| `superseded` | Use the latest main release run whose push changes production inputs. The older candidate is intentionally skipped. |
| `main_comparison_incomplete` | A maintainer must inspect the source comparison. Missing or potentially truncated evidence cannot authorize an older release. Use the latest eligible release when production inputs differ. |
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

Configure the [daily image security monitor](security-monitoring.md) after
the first accepted deployment. It checks the running digest and retained
rollback image, maintains one current status issue, and requires verified
delivery to the selected operator. Check fresh monitoring evidence before
approving a production update.

Release checks use disposable containers with synthetic household content.
They verify restart and replacement on the same disk, including private
drafts, objects, history, and save receipts. Archive recovery and explicit
owner reassignment preserve private encoded images, personal positions and
view settings through container restarts. An injected failed migration
checks that existing content remains.

Deployment controller tests simulate Render failures and competing releases.
These checks do not establish real Render or identity-provider behavior;
the first live deployment and real-provider verification above remain
separate operator checks.

## Disk loss and recovery

Persistent disk protects ordinary restarts and deployments. It does not
protect against loss of the disk. No extra automatic backup is configured.
The portable recovery path is a complete versioned household export and
import into a new installation. Follow the [recovery and move runbook](recovery.md)
for an empty destination disk, verified image, fresh sign-in, explicit
historical-owner assignment, restart checks and a single active cutover.
Keep your own private exports outside the running disk. Data since the last
usable export can be lost in a major failure, and recovery can require
several days. Server secrets, memberships and new login associations remain
separate from household export. An app-code rollback does not restore data.
