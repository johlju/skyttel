# Set up local authentication

This guide is for developers who need to register and verify real Google and
Microsoft sign-in in a local Skyttel installation. It uses the English names
shown in the providers' dashboards. The local application address is
`http://localhost:3000`. Use invented household information while checking
the installation.

For a production deployment, follow the
[production authentication guide](../operations/authentication.md).
For the complete developer environment, follow the
[devcontainer guide](devcontainer.md).

Provider registration gives Skyttel permission to offer a sign-in button.
It does not start Skyttel or give anyone access to a household. Both Google
and Microsoft credentials are required before Skyttel can start. The
[installation guide](../operations/installation.md) covers the complete
configuration, first administrator, and container startup.

## Understand the names

- A **Google account** is the account you use to sign in to Google.
- A **Google Cloud project** groups settings for your application. Creating
  one does not move Skyttel or its household data into Google Cloud.
- An **OAuth client** is a registration that identifies Skyttel to Google.
  OAuth is the protocol used during sign-in.
- A **client ID** identifies that application registration. It is not your
  personal account identifier.
- A **client secret** is a credential Skyttel's server uses with Google.
  Keep it private, like a password.
- A **redirect URI**, also called a callback URL, tells Google where to return
  your browser after sign-in.
- A **Microsoft Entra tenant** is a directory that holds Microsoft's app
  registrations. Access to a personal Microsoft account does not necessarily
  give you permission to register an application in a tenant.

Google explains these registration terms in
[Manage OAuth Clients](https://support.google.com/cloud/answer/15549257?hl=en).

## 1. Create and select a Google Cloud project

You can create an account and project for this sign-in setup for free, as
described in Google's
[Sign in with Google tutorial](https://codelabs.developers.google.com/codelabs/sign-in-with-google-button).
Use the Cloud Console directly; a paid hosting subscription or trial is not
part of this local setup. If a screen requests payment details, check whether
you are in the separate billing or free-trial signup before continuing.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Sign in with your Google account and complete any initial welcome steps.
   Review any terms yourself before accepting them.
3. Open the project selector near the top of the page, then **New Project**.
4. Enter `Skyttel verification` as the project name. Google may suggest a
   different project ID; that is normal. The name is a label for you.
5. If a location is requested for a personal account, use **No organization**
   when available. Click **Create**.
6. Select **Skyttel verification** in the project selector. Check this name
   before changing any settings in the following steps.

Expected result: the dashboard shows your selected project. See Google's
[project creation instructions](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
if your account cannot create a project.

## 2. Describe the sign-in application

These settings identify the application on Google's sign-in screens and give
Google a contact address for project notifications.

1. Open the top-left menu, then **Google Auth Platform** → **Branding**.
   If the menu is hard to find, search for **Google Auth Platform** using the
   search bar at the top.
2. Click **Get started** if Google Auth Platform is not configured yet.
3. Under **App Information**, enter `Skyttel verification` as the **App name**.
   Select your own email for **User support email**, then click **Next**.
4. Under **Audience**, choose **External**, then click **Next**. This supports
   ordinary Google accounts, including a personal account.
5. Under **Contact Information**, enter an email address you monitor, then
   click **Next**.
6. Review the Google API Services User Data Policy. If you agree, select its
   checkbox, then **Continue** → **Create**.

Expected result: Google Auth Platform now has pages such as **Branding**,
**Audience**, **Clients**, and **Data Access**. If setup already exists, use
those pages to review it instead of creating a second project.

References: Google's
[consent-screen setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [Google Auth Platform introduction](https://support.google.com/cloud/answer/15544987?hl=en).

## 3. Keep the application in testing mode

Open **Audience** and keep the publishing status as **Testing** for this local
verification. There is no need to use **Publish app** for these checks.

To record the account you intend to test, under **Test users** select
**Add users**, enter that account's Google email, then **Save**. You do not
need to put the email in project documentation or share it in a chat.

This test-user entry is optional for Skyttel's basic sign-in permissions:
`openid`, `email`, and `profile`. Google exempts this combination from its
usual test-user restriction and seven-day authorization expiry. Do not use
the test-user list as a way to protect a household. Skyttel enforces access
through its configured first administrator and current household membership.
See Google's [Testing exception](https://support.google.com/cloud/answer/15549945?hl=en).

## 4. Create the Google web client

1. Open **Clients** in Google Auth Platform, then **Create client**.
2. Choose **Web application** as the application type.
3. Set the name to `Skyttel local verification`.
4. Leave **Authorized JavaScript origins** empty. Skyttel's server handles
   this sign-in flow; it does not use Google's browser sign-in library.
5. Under **Authorized redirect URIs**, click **Add URI** and enter exactly:

   ```text
   http://localhost:3000/api/auth/callback/google
   ```

6. Click **Create**. Keep the credentials dialog open until you save the
   **Client ID** and **Client secret** privately in the next step.

The callback must match exactly: use `localhost`, port `3000`, and no trailing
slash. An address using `127.0.0.1` is a different callback. These values are
for local testing; a hosted installation needs its own HTTPS address.

Skyttel requests only basic identity information. A **scope** is a permission
requested during sign-in. If configuring **Data Access**, use only `openid`,
`https://www.googleapis.com/auth/userinfo.email`, and
`https://www.googleapis.com/auth/userinfo.profile`. Gmail and Drive access are
not needed. Registering a scope in the dashboard does not grant household
access in Skyttel.

References: Google's
[web-server OAuth instructions](https://developers.google.com/identity/protocols/oauth2/web-server)
and [Better Auth's Google setup](https://better-auth.com/docs/authentication/google).

## 5. Save the credentials privately

Skyttel reads settings from environment variables. For the local container,
these are stored in a file named `.env.local` in the Skyttel project folder.
That file is private configuration: Git ignores it, so it is not included in
commits. It still contains readable secrets and must stay on your computer.

The command steps in this guide require Unix tools and a POSIX-compatible
shell, such as Bash or Zsh on macOS or Linux. On Windows, use a Linux shell in
[Windows Subsystem for Linux (WSL)](https://learn.microsoft.com/en-us/windows/wsl/install).
The commands, including the later `<<'JS'` block, do not run as written in
PowerShell or Command Prompt. In WSL, keep the project in its Linux filesystem,
such as `~/skyttel`, so `chmod` uses Linux file permissions. Windows-mounted
paths such as `/mnt/c` have different
[permission behavior](https://learn.microsoft.com/en-us/windows/wsl/file-permissions).

If `.env.local` already exists, keep it and edit the two Google entries below.
If it does not exist, open a terminal in the Skyttel project folder and run:

```sh
cp -n .env.example .env.local
chmod 600 .env.local
```

The copy command keeps an existing file. The permission command limits file
access to your operating-system user on macOS and Linux. Open `.env.local`
in your text editor, find these lines, and paste each value after `=`:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Use the **Client ID** for the first line and the **Client secret** for the
second. Keep each value on one line and save the file. Do not replace other
settings or create a second line with the same variable name.

Use the copy button beside **Client ID** in Google's dialog, then paste after
`GOOGLE_CLIENT_ID=` in the editor. Repeat with **Client secret** and
`GOOGLE_CLIENT_SECRET=`. Leave no spaces around `=`. Save with **Command+S**
on macOS or **Ctrl+S** on Windows and Linux. You can then close the credentials
dialog. Keep the other configuration entries, including any generated
`BETTER_AUTH_SECRET`, unchanged during this step. The Microsoft entries will
be filled during Microsoft setup.

Files beginning with a dot may be hidden in a file browser. Use your text
editor's **Open File** command to open `.env.local` from the Skyttel project
folder. In macOS Finder, **Command+Shift+Period** shows hidden files. Edit the
local file, not the shared `.env.example` template.

Google shows the full client secret only when it is created. Save it before
closing the dialog. If using **Download JSON** as a temporary copy, save it
outside the repository; an arbitrary JSON filename is not protected by the
`.env.local` ignore rule. Do not paste credentials into chat, screenshots,
issues, or this guide. See Google's
[client secret handling guidance](https://support.google.com/cloud/answer/15549257?hl=en).

## 6. Open Microsoft app registrations

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Sign in with an account you control that can register applications.
3. If you have access to several directories, select the directory intended
   for this verification. Use an organization's directory only when you are
   authorized to create this registration there.
4. Open **Entra ID** → **App registrations**.

Expected result: an app-registration list with **New registration** available.
If sign-in succeeds but the page denies access or reports no directory, the
account's setup or permissions need attention before continuing.

Microsoft's [registration prerequisites](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
list an Azure account with an active subscription, an appropriate directory,
and permission to register applications. Check existing access first. Do not
assume that signing up for a personal Microsoft account completes these
prerequisites. Microsoft's
[tenant creation guidance](https://learn.microsoft.com/en-us/entra/fundamentals/create-new-tenant)
also limits creation of additional workforce tenants by free or trial users.
Review the applicable signup and billing terms if you need a new Azure account.

The account managing this registration and the account used to test Skyttel
can differ. The sign-in verification needs a **personal Microsoft account**;
a successful work or school account sign-in alone does not check that case.

## 7. Register Skyttel with Microsoft

1. In **App registrations**, choose **New registration**.
2. Enter `Skyttel local verification` as the name.
3. Under **Supported account types**, select
   **Any Entra ID Tenant + Personal Microsoft accounts**. Some portal versions
   describe this as accounts in any organizational directory and personal
   Microsoft accounts. The selected option must include both groups.
4. If the form includes **Redirect URI (optional)**, select **Web** as the
   platform and enter:

   ```text
   http://localhost:3000/api/auth/callback/microsoft
   ```

   The field is optional during registration, but Skyttel needs the callback
   before sign-in works. Enter it now when the field is available; otherwise
   add it on the **Authentication** page in the next section.
5. Click **Register**. The application's **Overview** page opens.
6. Copy **Application (client) ID** into the existing `MICROSOFT_CLIENT_ID=`
   entry in `.env.local`, then save. The **Object ID** and
   **Directory (tenant) ID** are different values and do not belong there.

Skyttel uses Microsoft's `common` sign-in authority, which works with this
audience. The registration must also enable the intended account types.
See Microsoft's
[supported account types](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types)
and [Better Auth's Microsoft setup](https://better-auth.com/docs/authentication/microsoft).

## 8. Set the Microsoft callback address

If you enter the callback during registration, use this section to verify
the saved **Web** entry. Add it only if it is missing.

1. Open the new registration's **Authentication** page.
2. On **Redirect URI configuration**, choose **Add Redirect URI**. Some
   portal versions call this **Add a platform**.
3. Select **Web**, because Skyttel's server handles the sign-in exchange.
4. Enter this redirect URI and save with **Configure** or the page's save
   button:

   ```text
   http://localhost:3000/api/auth/callback/microsoft
   ```

Leave the front-channel logout URL empty. This setup uses an authorization
code flow with a server credential; it does not require enabling implicit
grant or public-client authentication. If this callback already exists as a
**Web** redirect, check the saved entry instead of
adding a duplicate.

Reference: Microsoft's
[redirect URI setup](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri).

## 9. Create and save the Microsoft client secret

1. In the registration, open **Certificates & secrets** → **Client secrets**.
2. Choose **New client secret** and describe it as `Skyttel local verification`.
3. Choose **6 months** if offered, or a shorter period required by your
   directory's policy, then **Add**. Record the expiry privately so you can
   replace the secret before it stops working.
4. Copy the new secret's **Value** immediately. **Secret ID** is only a label
   for the credential and cannot authenticate Skyttel.
5. Paste the value after `MICROSOFT_CLIENT_SECRET=` in `.env.local` and save.
   Keep the Google entries and other existing settings unchanged.

The full secret value is available only at creation. If it is lost, create a
replacement instead of trying to recover it from the displayed secret ID.
The **Secret ID** identifies a particular credential in the app registration.
It helps you distinguish credentials when replacing or deleting them, but it
does not work as a password. Skyttel needs only the **Value** in
`MICROSOFT_CLIENT_SECRET`; there is no setting for Secret ID. Microsoft's
[credential properties](https://learn.microsoft.com/en-us/graph/api/resources/passwordcredential?view=graph-rest-1.0)
describe the identifier and secret value separately.

This client-secret procedure is for local verification. Microsoft recommends
certificate credentials for production; Skyttel's current configuration uses
client secrets. See Microsoft's
[credential guidance](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials).

Skyttel requests `openid`, `profile`, and `email` for Microsoft sign-in and
does not fetch a profile photo. It does not need mail, calendar, or directory
administration permissions. Do not add broad API permissions or grant
organization-wide consent just to follow this guide. If an organization's
policy blocks sign-in, ask its administrator about that specific restriction.
See Microsoft's
[OpenID Connect scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc#openid-connect-scopes).

## Renew the Microsoft secret before it expires

Plan the replacement before the expiry date shown in Entra, for example two
weeks beforehand. The expiry is set by Microsoft, not by when you first start
Skyttel. Renewal means creating a replacement secret in the **same app
registration**, updating Skyttel, and retiring the old secret. You keep the
same Application (client) ID and household.

During replacement, both credentials can remain valid in Entra, but Skyttel
uses only the one configured in its environment. It does not automatically
try the old value if the replacement fails.

1. Open [Microsoft Entra](https://entra.microsoft.com/), select the correct
   directory, then **Entra ID** → **App registrations** → your Skyttel app.
2. Open **Certificates & secrets** → **Client secrets**. Identify the current
   secret by its description, expiry, and Secret ID. Leave it in place while
   creating its replacement so the running application can still sign in.
3. Click **New client secret**. Use a description that distinguishes it from
   the old one, such as `Skyttel local renewal YYYY-MM`, with the actual year
   and month. Choose the new expiry, then **Add**.
4. Copy the new **Value** immediately. Replace only the value after
   `MICROSOFT_CLIENT_SECRET=` in `.env.local` and save. Keep the client ID,
   `BETTER_AUTH_SECRET`, administrator identity, and database settings.
5. From the Skyttel project folder, recreate the running local service so it
   loads the changed environment:

   ```sh
   docker compose up -d --force-recreate skyttel
   docker compose ps
   curl --fail http://localhost:3000/healthz
   ```

   Use the same Compose project and files as the original startup. If your
   startup command uses `-p` or `-f` options, include those options here. The
   recreation briefly interrupts the service and preserves its named volume.
   Do not remove the volume or create a new project during renewal. A plain
   `docker compose restart` does not load changed environment variables.
6. Open a private browser window and complete a fresh **Microsoft** sign-in
   at [local Skyttel](http://localhost:3000). Check the expected access for that
   identity. If Microsoft is the household's original provider or an explicitly
   linked login, confirm the same household opens. A Google household does not
   automatically belong to a Microsoft identity with the same email address.
7. After the fresh Microsoft flow succeeds, return to **Client secrets**
   and delete only the **old** credential. Use the description, expiry, and
   Secret ID to distinguish it from the replacement. If the registration is
   shared by other installations, update and verify those consumers first.
8. Record the replacement's expiry privately and plan the next renewal.

A healthy application or an already signed-in browser does not prove the new
secret works: both can succeed without a fresh exchange with Microsoft. If
the new sign-in fails, keep the old credential until the replacement is
working. Check the copied **Value**, matching app registration, expiry, and
environment reload. An unexpired old value saved in a password manager can
be restored to `.env.local` and loaded with the same recreation command if
needed; Entra cannot show its full value again.

If the secret is already expired, create and load a replacement using these
same steps. New Microsoft sign-ins can fail until this is done. Creating a
new app registration or deleting household data is not part of the repair.
For a hosted installation, update its private environment setting and use
the host's redeploy procedure with the existing persistent disk.

References: Microsoft's
[credential management](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials),
[rotation guidance](https://learn.microsoft.com/en-us/entra/msidweb/authentication/client-secrets#rotation-strategy),
Docker's [service recreation](https://docs.docker.com/reference/cli/docker/compose/up/),
and the [restart limitation](https://docs.docker.com/reference/cli/docker/compose/restart/).

## Continue with the first household

These steps create a test household with Google as the first provider in a
new local installation. Both providers must be configured before startup.
Populated entries alone do not prove that the credentials work or the
callback settings match.

If this installation already contains a household, keep its configuration
and sign in with its original provider or an explicitly linked login. Skip
the identity-discovery steps; changing the first-administrator setting does
not transfer an existing household to another account.

### 10. Complete the local configuration

1. Open the existing `.env.local` in your text editor. Keep the Google and
   Microsoft client IDs and secrets you save during provider registration.
   Edit the existing lines below for a new Google verification installation:

   ```dotenv
   SKYTTEL_ORIGIN=http://localhost:3000
   SKYTTEL_FIRST_ADMIN_PROVIDER=google
   SKYTTEL_FIRST_ADMIN_SUBJECT=not-configured
   PORT=3000
   ```

2. If `BETTER_AUTH_SECRET` already contains a generated value, keep it. If it
   is empty, run this command in a private terminal:

   ```sh
   openssl rand -base64 48
   ```

   Copy the generated value into the existing `BETTER_AUTH_SECRET=` line.
   Save it privately; do not paste it into chat or verification evidence.
   This is Skyttel's own authentication secret, separate from both provider
   client secrets. Keep it unchanged across restarts and updates.
3. Keep `SKYTTEL_DATABASE_PATH=./data/skyttel.sqlite` from the example for
   running directly with Node.js. The supplied Compose file overrides this
   setting inside the container with `/data/skyttel.sqlite` and mounts its
   persistent named volume at `/data`. You do not need to create a `/data`
   directory on your computer for this Compose setup.
4. Check that all four Google and Microsoft credential entries contain their
   respective values, even though Google is the first provider you will use.
   Save `.env.local`. Keep each setting on one line and avoid duplicate
   variable names.

`not-configured` deliberately matches no real account. It allows you to
discover the intended person's provider identifier after a real sign-in
without granting household creation first. An email address, OAuth client
ID, or Microsoft Secret ID cannot replace that personal identifier.

See the [configuration reference](../operations/installation.md#configure-the-installation)
for the purpose of every setting.

### 11. Build and start the local service

Start Docker Desktop or your Docker Engine, then open a terminal in the
Skyttel project folder. Run:

```sh
docker compose build
docker compose up -d skyttel
docker compose ps
curl --fail http://localhost:3000/healthz
```

The first build can take several minutes. Wait for the service to start;
the health command should return `{"status":"ok"}`. This confirms startup
and database preparation, not provider sign-in. If startup fails, follow
the [startup checks](../operations/installation.md#startup-failures-and-storage).

Use the same Compose project and files for every command belonging to this
installation. If you start with `-p` or `-f` options, keep those options on
the later `exec`, `up`, `restart`, and `stop` commands too. A different
project name can select a different persistent volume.

If startup reports that port `3000` is already in use, identify the existing
application or SSH port forwarding before stopping anything. You can either
free that port or choose a different local port. A different port also
requires updating `SKYTTEL_ORIGIN`, the host-side container port mapping,
both providers' registered callback URLs, and the address you open in the
browser. Keep those settings consistent.

### 12. Discover and designate the Google administrator

1. Open [local Skyttel](http://localhost:3000) in your browser. Use this exact
   address throughout the check; do not switch between `localhost` and
   `127.0.0.1`.
2. Select **Fortsätt med Google** and complete Google's sign-in using the
   account intended to administer this test installation. Review the
   identity permissions when Google asks for consent.
3. Expect **Du har inte tillgång till hushållet** after returning to Skyttel.
   The header shows your signed-in name and **Logga ut**. This denial is
   correct while `SKYTTEL_FIRST_ADMIN_SUBJECT` is `not-configured`: Google
   authentication succeeds, but no account has permission to create the
   household yet. **Inloggningen kunde inte slutföras** instead means the
   sign-in itself fails; check the credentials and callback before continuing.
4. In a private terminal, inspect only the authenticated provider account
   identifiers with this command:

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

   Its output contains a private identity identifier. Run it without screen
   sharing or terminal recording; do not attach the output to an issue.
   In this fresh installation, expect exactly one row with `providerId`
   equal to `google`. If there are several accounts, stop and establish which
   belongs to the intended administrator rather than copying the first row.
5. Copy that row's complete `accountId` into the existing
   `SKYTTEL_FIRST_ADMIN_SUBJECT=` line in `.env.local`, replacing only
   `not-configured`. Keep `SKYTTEL_FIRST_ADMIN_PROVIDER=google`. The account
   identifier comes from Google's stable `sub` claim; it is not an email.
6. Save the file, then reload the environment by recreating the service:

   ```sh
   docker compose up -d --force-recreate skyttel
   curl --fail http://localhost:3000/healthz
   ```

7. After readiness, refresh the same browser tab. Expect **Skapa ditt
   hushåll**. If the browser asks you to sign in again, choose the same Google
   account. If access is still denied, check the provider and exact account
   identifier; keep the database and authentication secret intact.

The [administrator procedure](../operations/installation.md#designate-the-first-administrator)
explains this access boundary. Google describes the stable `sub` value in its
[identity guidance](https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload).

### 13. Create the household and check that it persists

1. In **Hushållets namn**, enter an invented name such as `Hushållet Linden`.
   Select **Skapa hushåll** once and wait for completion.
2. Expect the household's name, **Administratör**, and **Hushållet är redo**.
   Keep the household URL privately if you want to check direct access later.
3. Select **Logga ut**. Expect the sign-in page. Opening the saved household
   URL while signed out must not reveal household information.
4. Choose **Fortsätt med Google** and sign in with the same Google account.
   Expect the same household, without another household-creation form.
   Google may remember its own account session; Skyttel sign-out does not
   sign you out of every Google service.
5. With the household open, restart the container:

   ```sh
   docker compose restart skyttel
   curl --fail http://localhost:3000/healthz
   ```

6. Wait for readiness, then refresh the household page in the same browser.
   Confirm the same household is available. Also repeat sign-out and Google
   sign-in after the restart to check the saved identity and membership.

Use `restart` here because no environment values change. Use service
recreation when configuration changes. Keep the same volume and
`BETTER_AUTH_SECRET`; `docker compose down --volumes` deletes the stored
household and is not a restart or a repair step.

To invite other Skyttel users and share administrator responsibility, follow
the [household access guide](../users/access.md). Keep provider verification
below separate from invitations so that you can check sign-in without
granting household membership.

### 14. Verify personal Microsoft sign-in separately

A Microsoft identity does not automatically gain access to the Google
identity's household, even when both providers report the same email.
Use an identity with no membership or existing login link for the denied-access
check below. Signing in separately creates a separate Skyttel user, which
cannot later be merged through login linking. To test linking instead, follow
the [login-linking steps](../users/access.md#link-google-and-microsoft) with
an identity that does not already belong to another Skyttel user.

You can also check the consent-cancellation path during the first Microsoft
sign-in. In a fresh private browser window, choose **Fortsätt med Microsoft**
and use a personal account. If Microsoft presents a permissions or consent
screen, select **Cancel** or **No** once. Expect Skyttel's sign-in page to
show **Inloggningen kunde inte slutföras** with the sign-in buttons available
for another attempt. Retry and review the requested permissions before
continuing. If no consent screen appears, record that this check is not
performed; closing a browser tab does not test the callback error path.

1. For a first Microsoft check, sign out of Skyttel or open a fresh private
   browser window. Select **Fortsätt med Microsoft** and sign in with a
   personal Microsoft account. If Microsoft offers both a personal and a
   work or school account, select the personal account.
2. In this Google household installation, expect **Du har inte tillgång till
   hushållet** with the signed-in name and **Logga ut** in the header. This
   shows the expected lack of household membership after authentication.
   A provider error or **Inloggningen kunde inte slutföras** is a failed
   sign-in, not the expected access denial.
3. To verify Microsoft household creation and persistence, prepare a
   separate private installation with its own first-administrator
   configuration, `BETTER_AUTH_SECRET`, and empty persistent volume. When
   running these local installations one at a time at the same origin, reuse
   the dedicated local verification registrations for Google and Microsoft.
   Do not use production provider registrations. Give the separate
   installation a distinct Compose project name and keep using that name for
   its commands. Preserve the Google installation's `.env.local` and volume;
   do not change its administrator to Microsoft or delete its data to reuse
   the setup.
4. If the separate installation uses the same `localhost:3000` address,
   stop the Google service first with `docker compose stop skyttel` in its
   original project. Only one installation can listen on that port at a time.
   Use a fresh private browser session for the separate installation so
   cookies from the first one do not carry across.
5. In the separate configuration, start with
   `SKYTTEL_FIRST_ADMIN_PROVIDER=microsoft` and
   `SKYTTEL_FIRST_ADMIN_SUBJECT=not-configured`. Repeat the discovery and
   household steps above with **Fortsätt med Microsoft**. Expect one
   `microsoft` row after the first discovery sign-in and copy its `accountId`
   into that installation's private configuration. Better Auth uses the
   Microsoft `oid` identifier. Do not copy a Google identifier or an email.
6. Verify creation, sign-out, return sign-in, and restart persistence for the
   Microsoft household too. A work or school account alone does not verify
   personal-account support.

Complete the additional denied-access and failure scenarios in the
[real-provider verification steps](testing.md#verify-real-identity-providers-separately).
Record outcomes privately only after performing the checks. Dashboard setup,
application readiness, and automated tests do not establish successful live
provider sign-in. Better Auth describes the Microsoft identifier in its
[provider documentation](https://better-auth.com/docs/authentication/microsoft#account-identifiers).
