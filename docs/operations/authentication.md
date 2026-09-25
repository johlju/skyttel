# Set up production authentication

Use this guide to enable Google and Microsoft sign-in for a deployed Skyttel
household. It assumes no experience with either provider's registration
dashboard. The main path is a private household; public distribution has
additional Google requirements described below.

Complete setup and verification on the actual production service, with its
production database and provider registrations. You do not need a developer
environment or a separate verification installation. Developers who need
local sign-in should use the [development setup](../development/devcontainer.md).

## Before you start

You need access to:

- The host's service settings and a private terminal on the running service.
- A Google account that can create a Google Cloud project.
- A Microsoft Entra directory where you can register an application.
- The intended first administrator and their Google or Microsoft account.
- A password manager or secret store for credentials and renewal dates.

Both providers must be configured before Skyttel starts, even if the first
administrator uses only one. Register separate production applications;
keep development credentials and localhost callbacks in developer setups.

On Render, start with [deployment steps 1–3](render.md#1-prepare-the-workspace-and-github-environment).
Then use [step 4](render.md#4-record-the-address-and-prepare-sign-in) to obtain
the public address. This guide covers provider registration and identity
checks; the Render guide covers environment entry and deployment. On other
hosts, use the [installation requirements](installation.md#deploy-on-a-container-host).

## Understand the names

- A **provider** is Google or Microsoft, which checks the person's identity.
- A **project** in Google Cloud groups the sign-in settings. Creating it
  does not host Skyttel or move household data to Google Cloud.
- A Microsoft Entra **tenant** is a directory that holds app registrations.
  A personal Microsoft login alone does not give registration permissions.
- An **app registration**, called an **OAuth client** by Google, identifies
  the Skyttel application to the provider.
- A **client ID** identifies that application, not the administrator.
- A **client secret** is a password used by Skyttel's server. Keep it private.
- An **origin** is the public HTTPS address without a path or trailing slash.
- A **redirect URI**, or **callback URL**, is the exact address where the
  provider returns the browser after sign-in.
- A **scope** is a permission requested from the provider. Skyttel needs
  basic identity information, not mail, files, or calendar access.

## 1. Choose the production address

Copy the actual HTTPS address from your host, for example
`https://YOUR-SERVICE.onrender.com`. If using a custom domain, configure its
DNS and HTTPS on the host first. On Render, follow the
[optional custom-domain setup](render.md#optional-add-a-custom-domain).
Choose one address that people will use and that serves Skyttel directly,
without redirecting to another hostname. Save this origin privately as
`SKYTTEL_ORIGIN`.

Throughout this guide, replace `https://skyttel.example.com` with that
origin. The two callback addresses are:

```text
https://skyttel.example.com/api/auth/callback/google
https://skyttel.example.com/api/auth/callback/microsoft
```

Use HTTPS, the exact hostname, and no trailing slash on either callback.
Do not use localhost, a wildcard, or the bare origin as a callback.

## 2. Register Google sign-in

### Create a project and describe the application

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in.
   Complete the welcome steps and review the terms before accepting them.
2. Open the project selector, choose **New Project**, and name it
   `Skyttel production`. For a personal account, select **No organization**
   if offered. Click **Create**, then select the new project.
3. Open **Google Auth Platform** → **Branding**. Use the console search if
   you cannot find the menu. Select **Get started** if setup is new.
4. Enter `Skyttel` as the app name and select a **User support email** that
   you monitor. Under **Audience**, select **External** so personal Google
   accounts can sign in.
5. Enter a monitored address under **Contact Information**. Review the
   displayed policy, then complete the form with **Continue** → **Create**
   if you agree. If setup already exists, review the same settings instead.

Expected result: the selected project has **Branding**, **Audience**,
**Clients**, and **Data Access** pages. See Google's
[project instructions](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
and [Auth Platform introduction](https://support.google.com/cloud/answer/15544987?hl=en).

### Choose the audience and publishing status

For a private household using only Skyttel's basic identity scopes, open
**Audience** and keep **External** with publishing status **Testing**.
This is Google's setting, not a requirement to use a test server.

Google exempts requests for only `openid`, `email`, and `profile` from the
usual test-user restriction, testing warning, and seven-day authorization
expiry. Adding household members under **Test users** is optional for this
scope combination. It does not limit who can reach Skyttel or grant access
to the household. Skyttel's administrator setup and memberships control that
access. See Google's [audience rules](https://support.google.com/cloud/answer/15549945?hl=en).

> [!IMPORTANT]
> A live household server and Google's definition of a production app are
> different. Google's personal-use category covers fewer than 100 people,
> all personally known to you. If you offer the app outside that category,
> review the public-use requirements below before opening access. Basic
> sign-in scopes do not exempt every app from branding requirements.

### If you offer the app outside a private household

Review [Google's production policy](https://developers.google.com/identity/protocols/oauth2/policies)
for your audience. Where its production requirements apply, prepare a public
homepage that describes the application, links to privacy and terms pages,
and uses a domain you own and can verify. A page that only offers sign-in is
not sufficient. Configure **Branding** and **Authorized domains**, complete
the required verification, and use **Audience** → **Publish app** for the
public release. Branding publication is a separate step when required.

Use [Google's branding instructions](https://support.google.com/cloud/answer/15549049?hl=en)
for domain verification and **Publish branding**. Do not claim ownership of
`onrender.com`; plan an owned domain if your verification requires one.
Skyttel does not supply public homepage, privacy, or terms content for this
process. Prepare those pages before following the public-release path.

### Create the Google web client

1. In **Branding** → **Authorized domains**, add the domain for your
   production address and save. Enter only the domain, without `https://`
   or a path: for `skyttel.example.com`, use `example.com`. For an assigned
   Render address, use your actual `YOUR-SERVICE.onrender.com` hostname.
   Google uses the [public suffix list](https://publicsuffix.org/list/public_suffix_list.dat)
   to identify this domain boundary. Only add domains you own or are
   authorized to use; see [Google's domain instructions](https://support.google.com/cloud/answer/15549049?hl=en#authorized-domains).
2. Open **Clients** → **Create client**. Select **Web application** and name
   it `Skyttel production web`.
3. Leave **Authorized JavaScript origins** empty; Skyttel handles sign-in
   on its server.
4. Under **Authorized redirect URIs**, add your complete Google callback
   from [choose the production address](#1-choose-the-production-address),
   then click **Create**.
5. Save **Client ID** and **Client secret** in your secret store under
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Save the secret before
   closing the dialog; its full value is shown only at creation.

In **Data Access**, use only `openid`,
`https://www.googleapis.com/auth/userinfo.email`, and
`https://www.googleapis.com/auth/userinfo.profile` if the console asks you
to configure scopes. Gmail and Drive permissions are unnecessary.

Expected result: one production web client with the exact HTTPS callback
and two saved configuration values. See Google's
[client instructions](https://support.google.com/cloud/answer/15549257?hl=en).

## 3. Register Microsoft sign-in

### Check directory access

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) and
   sign in with the account that will manage the registration.
2. Select the intended directory if you have access to more than one.
   Only use an organization's directory with permission to do so.
3. Open **Entra ID** → **App registrations**. Confirm **New registration**
   is available before continuing.

Microsoft's [registration prerequisites](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
include an Azure account with an active subscription, a tenant, and at least
Application Developer permissions. If you cannot register an application,
check access with the directory administrator. Review account and billing
terms if you need new Azure access. A personal Microsoft account alone is
not sufficient, and [tenant creation](https://learn.microsoft.com/en-us/entra/fundamentals/create-new-tenant)
has additional restrictions for free or trial accounts.

The account that manages the registration can differ from the person who
signs in to Skyttel. Plan to check a personal Microsoft login later; a work
or school login does not verify that case.

### Create the registration and callback

1. Select **New registration** and enter `Skyttel production` as the name.
2. For **Supported account types**, choose
   **Any Entra ID Tenant + Personal Microsoft accounts**. Some portal
   versions say accounts in any organizational directory and personal
   Microsoft accounts. Both groups must be included.
3. If the form shows **Redirect URI (optional)**, select **Web** and enter
   the complete Microsoft callback from
   [choose the production address](#1-choose-the-production-address).
   If the field is not shown, add the callback after registration as
   described below.
4. Select **Register**. On **Overview**, save **Application (client) ID**
   as `MICROSOFT_CLIENT_ID`. Do not use **Object ID** or
   **Directory (tenant) ID**.
5. Open **Authentication** → **Redirect URI configuration**. If you entered
   the callback during registration, confirm that the exact address is
   saved under **Web**. Do not add it a second time.
6. If the callback is missing, choose **Add Redirect URI**. Some versions
   call this **Add a platform**. Select **Web**, enter the same complete
   Microsoft callback, and save with **Configure** or the page's save button.

The field is optional when creating the registration, but Skyttel needs the
saved callback before Microsoft sign-in can work.

Leave the front-channel logout URL empty. Do not enable implicit grant or
public-client authentication for this server flow. Skyttel uses Microsoft's
`common` authority; there is no tenant setting to enter in Skyttel.
See Microsoft's [redirect instructions](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri)
and [account types](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types).

### Create the server credential

> [!CAUTION]
> Microsoft recommends certificates or federated credentials for production
> instead of client secrets. Skyttel currently supports client secrets only.
> If your directory requires another credential type, this version cannot
> meet that requirement through configuration. Do not substitute a
> certificate or its identifier in the secret setting.

1. Open **Certificates & secrets** → **Client secrets** → **New client secret**.
2. Use a description such as `Skyttel production YYYY-MM`, with the current
   year and month. Select **6 months** if available, or a shorter lifetime
   required by your directory. Click **Add**.
3. Save the new **Value** immediately as `MICROSOFT_CLIENT_SECRET` in your
   secret store. **Secret ID** cannot authenticate the application.
4. Record the expiry and plan renewal before that date, for example two
   weeks beforehand. The full value cannot be retrieved later.

Skyttel requests only `openid`, `profile`, and `email`, and does not fetch
profile photos. It does not need mail, calendar, or directory administration
permissions. Do not grant broad organization-wide consent to solve a setup
error; ask the directory administrator about the specific restriction.

Expected result: the client ID and secret value are saved, the expiry is
recorded, and the registration allows personal and organizational accounts.
See Microsoft's [credential guidance](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials)
and [identity scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc#openid-connect-scopes).

## 4. Configure and start the production service

In the host's private environment settings, enter both client IDs and
secrets, plus `SKYTTEL_ORIGIN`. Do not put them in GitHub issues, source code,
screenshots, shared logs, or browser configuration. Generate a random
`BETTER_AUTH_SECRET` of at least 32 characters with a password manager and
keep it stable across deployments.

For a new household, set `SKYTTEL_FIRST_ADMIN_PROVIDER` to `google` or
`microsoft`, according to the intended administrator's login. Set
`SKYTTEL_FIRST_ADMIN_SUBJECT` to the literal value `not-configured` for now.
This deliberately matches no real account. Authentication can succeed, but
no one can create the household until you configure the verified identifier.

For an existing household, retain its administrator settings, database, and
authentication secret. Skip the first-administrator lookup and continue to
the production checks after applying any provider changes.

On Render, complete [environment entry and deployment](render.md#5-enter-the-application-configuration-in-render).
On other hosts, supply the remaining [installation settings](installation.md#configure-the-installation),
attach the production disk, and deploy with those settings. Use the same
production service and disk for every remaining step.

Expected result: `/healthz` at the public origin returns `{"status":"ok"}`.
An anonymous browser request to `/api/bootstrap` lists `google` and
`microsoft`. A working health check does not yet verify either provider.

## 5. Identify the first administrator on the running service

Use this procedure only before the first household exists. Changing these
settings later does not transfer a household or restore removed membership.

1. Have the intended administrator open the production origin in a private
   browser window and sign in with the provider selected in step 4. Check
   the account shown by Google or Microsoft before continuing. Skyttel
   denies household access while `not-configured` is in use; this is expected.
2. In that same signed-in window, open the origin with `/api/bootstrap`
   appended. Confirm `status` is `forbidden`. Copy the value of `user.id`
   privately. This Skyttel user ID locates the authenticated account; it is
   not the provider identifier to put in the environment setting.
3. Open a private terminal on the **running production service**. On Render,
   use [the production Shell instructions](render.md#use-and-close-the-production-terminal).
   Do not start a temporary instance, a one-off job, or a local container:
   the lookup needs the live service's database and environment.
4. In the shipped image's terminal, run these lines. At the prompt, paste
   the `user.id` from step 2 and press Enter. Then run the following Node
   block. Use a private session without recording or shared output.

   ```sh
   cd /app
   export SKYTTEL_SETUP_USER_ID=''
   printf 'Skyttel user ID: '
   read -r SKYTTEL_SETUP_USER_ID
   ```

   ```sh
   node --input-type=module <<'JS'
   import Database from 'better-sqlite3';
   const userId = process.env.SKYTTEL_SETUP_USER_ID?.trim();
   const provider = process.env.SKYTTEL_FIRST_ADMIN_PROVIDER;
   if (!userId || !['google', 'microsoft'].includes(provider)) {
     throw new Error('Check the user ID and configured provider.');
   }
   const db = new Database(process.env.SKYTTEL_DATABASE_PATH, {
     readonly: true,
     fileMustExist: true,
   });
   try {
     if (db.prepare('SELECT 1 FROM installation WHERE id = 1').get()) {
       throw new Error('A household already exists. Stop setup.');
     }
     const accounts = db.prepare(
       'SELECT accountId FROM account WHERE userId = ? AND providerId = ?',
     ).all(userId, provider);
     if (accounts.length !== 1) {
       throw new Error('Expected one matching account. Check the sign-in.');
     }
     console.log(accounts[0].accountId);
   } finally {
     db.close();
   }
   JS
   unset SKYTTEL_SETUP_USER_ID
   ```

5. Expect exactly one provider identifier. If the command reports an error,
   stop and check the browser session, selected provider, and live service.
   Do not select an arbitrary account from the database: other people can
   authenticate to a public address even while household creation is blocked.
6. Save the returned identifier privately as `SKYTTEL_FIRST_ADMIN_SUBJECT`.
   It is Google's `sub` or Microsoft's `oid`, not an email address, app
   client ID, directory ID, or the `user.id` used for the lookup. Keep
   `SKYTTEL_FIRST_ADMIN_PROVIDER` set to the provider just verified.
7. Type `exit` to close the terminal. Apply the subject through the host's
   environment settings and redeploy the same service with the same disk
   and `BETTER_AUTH_SECRET`. On Render use **Save and deploy** as described
   in [step 5](render.md#5-enter-the-application-configuration-in-render).
8. Wait for readiness, then have the administrator return to the application.
   `/api/bootstrap` should now show `status: "setup"`. Create the household
   once, and confirm it opens. Do not create a disposable test household in
   this production database.

The lookup only reads the database. Its output is private operator data;
do not paste it into issues, release evidence, or application logs. For
identifier definitions, see [Google's identity claims](https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload)
and [Microsoft's identity claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference).

## 6. Verify production sign-in

Perform these checks at the actual public HTTPS origin, using accounts whose
owners take part in the checks. Keep identity details private and record only
the date, deployed version, provider/account category, and pass or fail.

1. Sign out of Skyttel, then complete a fresh sign-in with the first
   administrator's provider. Confirm the intended household opens.
2. Have a household user who owns both a Google account and a personal
   Microsoft account follow [link Google and Microsoft](../user-guide/access.md#koppla-google-och-microsoft)
   under **Inloggningssätt**. Link only that person's own identities.
   Matching email addresses do not link accounts automatically.
3. Sign out and complete a fresh Google sign-in, then sign out and complete
   a fresh personal Microsoft sign-in. Confirm both reach the same Skyttel
   user and household. The user ID can be checked privately at
   `/api/bootstrap`; do not include it in shared evidence.
4. If household members will use work or school Microsoft accounts, also
   check an intended member's account with the required invitation or
   explicit linking. This is additional to the personal-account check.
5. With a controlled account that is not a member or linked login, confirm
   sign-in does not grant household access or offer household creation.
   Do not remove an existing member to make this check possible.
6. Check access after a restart of the same production service, keeping its
   disk attached. For Render, do this when you reach
   [step 10](render.md#10-check-persistence-through-a-normal-restart) of the
   deployment runbook. On other hosts, arrange a short interruption, restart
   the service, and confirm health and household access remain.

If a required account is unavailable, record the corresponding check as
incomplete. A visible sign-in button, an existing session, or a healthy
server does not prove a fresh provider exchange works.

Finish by [closing setup access](#close-setup-access). Render operators then
return to [step 6](render.md#6-verify-the-first-live-application) and continue
the deployment runbook.

## Close setup access

Exit the terminal after the lookup, close its browser tab, and close the
private browser window that showed identity details. Clear copied identity
values from your clipboard when finished. Keep only the necessary values in
the production environment and your private secret store.

Close any temporary access granted to a helper. On Render, follow
[session closure and access restrictions](render.md#use-and-close-the-production-terminal).
Ending a session and revoking permission to open another session are separate
actions. On other hosts, use their terminal-access and account controls.

Keep the production provider registrations, client credentials, database,
and authentication secret in place. They are needed for continuing sign-in;
they are not temporary setup credentials.

## Renew provider secrets

Plan changes while an operator can verify fresh sign-in. Keep the same app
registrations, client IDs, household database, and `BETTER_AUTH_SECRET`.
Create the replacement, load it into production, verify it, and then retire
the old credential. Skyttel uses one configured secret per provider and
does not automatically fall back to the old value.

### Renew the Microsoft secret before it expires

1. In Entra, select the production registration and open
   **Certificates & secrets** → **Client secrets**.
2. Leave the old credential valid. Create a replacement with a distinct
   description and record its expiry. Save its **Value** immediately.
3. Replace `MICROSOFT_CLIENT_SECRET` in the host's environment settings.
   Deploy the updated environment on the same service and disk. On Render,
   use [Save and deploy](render.md#5-enter-the-application-configuration-in-render).
4. Complete a fresh Microsoft sign-in at the production origin and confirm
   the expected household access. An existing session is not sufficient.
5. After success, delete only the old secret in Entra. Check its description,
   expiry, and Secret ID before deletion. Record the next renewal date.

If verification fails, keep the old credential until the replacement works.
You can restore its saved value and redeploy while it remains valid. If it
has expired, load a new secret; new Microsoft sign-ins can fail until then.
Do not create another registration or delete household data to repair expiry.

### Replace a Google secret

In Google Auth Platform, open **Clients**, select the production client, and
choose **Add Secret**. Save the new value as `GOOGLE_CLIENT_SECRET` in the
host's environment and redeploy. Verify fresh Google sign-in, then disable
the old secret. Delete it after confirming sign-in still works. See
[Google's rotation procedure](https://support.google.com/cloud/answer/15549257?hl=en#rotating-your-clients-secrets).

If Google already lists two secrets, identify which one production uses
before removing an unused credential. If any registration has other
consumers, update and verify them before retiring a shared secret. When a
credential is exposed, replace and revoke it promptly instead of retaining
it as a fallback.

## Change the public domain

1. Configure the new domain and HTTPS on the production host. Keep access
   to the old address during the transition where possible.
2. Add the new exact Google and Microsoft callback URLs to the existing
   registrations. Complete any required Google authorized-domain and
   branding updates. Keep the old callbacks during verification.
3. Change `SKYTTEL_ORIGIN` to the new origin and deploy the environment on
   the same production service. Do not change its database or auth secret.
   For Render's automated deployments, also update the GitHub `production`
   environment's origin as described in [Render step 7](render.md#7-give-github-permission-to-deploy).
4. Repeat fresh sign-in with both providers at the new origin. Users should
   expect to sign in again; browser sessions do not transfer between domains.
5. Update links used by household members and remove the old callbacks
   after the new address works and the old address is retired.

If verification fails while you still control the old address, restore the
old origin and redeploy with its callbacks still registered. Do not leave a
callback pointing to an address that you no longer control.

## Troubleshoot sign-in

<!-- markdownlint-disable MD013 -->
| Symptom | Check and next action |
| :-- | :-- |
| Startup reports `configuration_invalid` | Use the reported variable name to check the host's settings. Both providers and every required installation value must be present. Deploy changed settings. |
| Google `redirect_uri_mismatch` or Microsoft reply URL error | Compare the actual origin, provider registration, and complete callback, including HTTPS and trailing slashes. Check that the client ID belongs to that registration. |
| Google blocks an account or asks for verification | Check External audience, the scopes actually requested, account restrictions, and the private/public branch above. Do not add unrelated permissions or bypass a warning. |
| Microsoft rejects a personal account | Check that the registration includes both organizational and personal Microsoft accounts. A work account succeeding is not enough. |
| Microsoft rejects the credential | Check secret Value versus Secret ID, expiry, registration, and deployment of changed settings. Follow renewal above if expired. |
| Sign-in succeeds but household access is denied | Before setup, verify the intended user's provider identifier and redeploy it. After household creation, check membership or explicit login linking. Matching email addresses grant no access. |
| The administrator lookup finds no matching account | Check the authenticated production browser's user ID, selected provider, and live service. Do not select another account or copy an identifier from another installation. |
| The lookup says a household exists | Stop first-administrator setup. Preserve the database and use the existing administrator and membership process. |
| Terminal access is unavailable | Check host permissions and the running service's terminal support. On Render, use the linked terminal instructions; ask a maintainer to resolve image or access problems before continuing. |
| A provider fails after a domain or secret change | Check that the current environment is deployed, then perform a fresh provider sign-in. Health checks and existing sessions do not validate the changed credential or callback. |
<!-- markdownlint-enable MD013 -->

Keep provider responses, tokens, cookies, identifiers, and personal data out
of shared diagnostics. Share only sanitized error categories and application
version information. Resolve access problems on the existing production
service; do not replace its disk or create a new household as a workaround.
