# Set up local authentication

This guide is for developers who need to register and verify real Google and
Microsoft sign-in in a local Skyttel installation. It uses the English names
shown in the providers' dashboards. Normal devcontainer development uses
`http://localhost:5173`; the compiled application and local Codex CLI test use
`http://localhost:3301`. Use invented household information throughout.
Start with provider registration, then follow the first-household steps to
start the development server. Production-container checks belong in the
[installation guide](../operations/installation.md#build-start-and-restart).

For a new contributor, complete provider registration in sections 1–9, then
[set up sign-in inside the container](devcontainer.md#set-up-local-sign-in)
or use the host setup in sections 10–13. Host development requires Git,
the repository's Node.js and npm versions, and a supported shell.
Devcontainer development needs Docker and VS Code with Dev Containers;
Node.js and npm run inside the container. If your credentials and
administrator identity already exist, use
[the configured devcontainer steps](#use-the-credentials-in-the-devcontainer).

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

Use your own Google account, or follow Google's
[account creation instructions](https://support.google.com/accounts/answer/27441?hl=en).
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
4. Enter `Skyttel development` as the project name. Google may suggest a
   different project ID; that is normal. The name is a label for you.
5. If a location is requested for a personal account, use **No organization**
   when available. Click **Create**.
6. Select **Skyttel development** in the project selector. Check this name
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
3. Under **App Information**, enter `Skyttel development` as the **App name**.
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

Use the existing development project and client when available. For example,
open **Skyttel local development** under **Clients**, review its type and
redirect URIs, then save any additions. Adding a redirect URI does not require
a new client ID or secret. Keep callbacks used by other development setups.
For a new client:

1. Open **Clients** in Google Auth Platform, then **Create client**.
2. Choose **Web application** as the application type.
3. Set the name to `Skyttel local development`.
4. Leave **Authorized JavaScript origins** empty. Skyttel's server handles
   this sign-in flow; it does not use Google's browser sign-in library.
5. Under **Authorized redirect URIs**, add these as two separate entries:

   ```text
   http://localhost:5173/api/auth/callback/google
   http://localhost:3301/api/auth/callback/google
   ```

6. Click **Create**. Keep the credentials dialog open until you save the
   **Client ID** and **Client secret** privately in the next step.

Each callback must match exactly: use `localhost`, the port for that workflow,
and no trailing slash. An address using `127.0.0.1` is a different callback.
Google returns the browser to port 5173 for `npm run dev:all` and port 3301
for `npm run dev:prodlike`. Do not register the API's internal port 3300 in
place of these browser addresses. Google permits HTTP localhost callbacks;
a hosted installation needs its own HTTPS address.

The Codex MCP callback is a different registration between Codex and Skyttel.
Do not add Codex's generated return address to the Google web client.
Allow time for Google configuration changes to take effect before diagnosing
a redirect mismatch; propagation can take several minutes or longer.

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

Skyttel reads settings from environment variables. This walkthrough saves
your provider credentials in `.env.local` in the Skyttel project folder for
host development. Devcontainer development reads `.devcontainer/.env`; the
[container steps](#use-the-credentials-in-the-devcontainer) explain what to
copy there. Both files are private configuration: Git ignores them, so they
are not included in commits. They still contain readable secrets and must
stay on your computer.

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

### Use the credentials in the devcontainer

Complete both provider registrations before continuing. Follow
[Prepare and start](devcontainer.md#prepare-and-start) to prepare the host,
create `.devcontainer/.env`, and generate `BETTER_AUTH_SECRET` if needed.
In your editor, copy the four provider credentials from `.env.local` into
their existing entries in `.devcontainer/.env`. Keep the container settings:

```dotenv
SKYTTEL_DATABASE_PATH=/data/skyttel.sqlite
SKYTTEL_ORIGIN=http://localhost:5173
HOST=0.0.0.0
PORT=3300
```

Keep an existing administrator's provider and subject. If you configured
them on the host, copy both entries from `.env.local`; do not replace the
subject with a client ID. For a new installation without a known subject,
follow [administrator discovery](devcontainer.md#designate-the-first-administrator)
inside the container. Initial container setup stops at `db:setup` until
the subject is configured; dependencies are already installed for discovery.

The development scripts read `.devcontainer/.env` by default. Compose exports
its values at container creation, and exported values take precedence over
file values. Recreate the container after changing exported settings.
Creation and rebuilding run `db:setup`, replacing application data and
sessions with the demo household; ordinary restarts preserve data. See
[state and rebuilds](devcontainer.md#state-and-rebuilds).

With the administrator configured, run `npm run dev:all` in the container,
open `http://localhost:5173`, and sign in with that provider. Check that the
expected development household opens. This verifies the port-5173 callback;
it does not verify the separate Codex connection.

For the compiled application, `npm run dev:prodlike` sets the origin and
listening port to 3301. Use the
[isolated Codex preparation](../manual-tests/setup/assistants.md#manual-local-codex-cli-setup)
for the manual assistant test; that preparation explicitly selects a new
database and loads credentials from the selected private development file.
The same Google development client serves both ports, without a public
tunnel or new provider secrets.
Keep real-provider and real-Codex tests outside CI and pull request workflows.

The remaining provider sections also cover Microsoft configuration. New
contributors then follow [the first-household steps](#continue-with-the-first-household)
to discover their administrator identity and start the development server.

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

If you have no directory, follow [Azure account signup](https://azure.microsoft.com/en-us/free/).
The signup requires a phone number and a supported payment card, and creates
a directory you can select in Entra, often named **Default Directory**.
If your existing directory denies app registration, ask its administrator for
**Application Developer** access or a registration you can manage. See
Microsoft's [app-registration permissions](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/delegate-app-roles).

The account managing this registration and the account used to test Skyttel
can differ. The sign-in verification needs a **personal Microsoft account**;
a successful work or school account sign-in alone does not check that case.

## 7. Register Skyttel with Microsoft

1. In **App registrations**, choose **New registration**.
2. Enter `Skyttel local development` as the name.
3. Under **Supported account types**, select
   **Any Entra ID Tenant + Personal Microsoft accounts**. Some portal versions
   describe this as accounts in any organizational directory and personal
   Microsoft accounts. The selected option must include both groups.
4. If the form includes **Redirect URI (optional)**, select **Web** as the
   platform and enter:

   ```text
   http://localhost:5173/api/auth/callback/microsoft
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
   http://localhost:5173/api/auth/callback/microsoft
   ```

Leave the front-channel logout URL empty. This setup uses an authorization
code flow with a server credential; it does not require enabling implicit
grant or public-client authentication. If this callback already exists as a
**Web** redirect, check the saved entry instead of
adding a duplicate.

For `localhost`, Microsoft ignores the port when matching this callback.
One **Web** entry covers both development on 5173 and the compiled app on
3301. Do not add duplicate localhost entries that differ only by port. An
existing entry with the same host and path on port 3000 can remain. Google
has different matching rules and needs both exact callback ports above.

References: Microsoft's
[redirect URI setup](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri)
and [localhost exceptions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url#localhost-exceptions).

## 9. Create and save the Microsoft client secret

1. In the registration, open **Certificates & secrets** → **Client secrets**.
2. Choose **New client secret** and describe it as `Skyttel local development`.
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
registration**, updating Skyttel, and retiring the old secret. Secret
replacement keeps the same Application (client) ID and household ownership.

During replacement, both credentials can remain valid in Entra, but Skyttel
uses only the one configured in its environment. It does not automatically
try the old value if the replacement fails.

1. Open [Microsoft Entra](https://entra.microsoft.com/), select the correct
   directory, then **Entra ID** → **App registrations** → your Skyttel app.
2. Open **Certificates & secrets** → **Client secrets**. Identify the current
   secret by its description, expiry, and Secret ID. Leave it in place while
   creating its replacement so the running application can still sign in.
3. Click **New client secret**. Use a description that distinguishes it from
   the old one, such as `Skyttel development renewal YYYY-MM`, with the actual
   year and month. Choose the new expiry, then **Add**.
4. Copy the new **Value** immediately. Replace only the value after
   `MICROSOFT_CLIENT_SECRET=` in `.env.local` and save. Keep the client ID,
   `BETTER_AUTH_SECRET`, administrator identity, and database settings.
5. Stop the development server with Ctrl+C. In the devcontainer, update
   `MICROSOFT_CLIENT_SECRET` in `.devcontainer/.env` too, then run:

   ```sh
   (
     unset MICROSOFT_CLIENT_SECRET
     SKYTTEL_DEV_ENV_FILE=.devcontainer/.env npm run dev:all
   )
   ```

   The subshell clears the old exported secret for this process so the
   development command loads the new value from the file. Use this command
   for subsequent starts while the container still exports the old value.
   This reload preserves your development household and linked logins.
   Container creation and rebuilding run `db:setup` and reset that data;
   they are unnecessary for secret renewal.
   For host development, open a terminal without stale exported credentials,
   select `.env.local`, and start the server again:

   ```sh
   SKYTTEL_DEV_ENV_FILE=.env.local npm run dev:all
   ```

6. Open a private browser window and complete a fresh **Microsoft** sign-in
   at [development Skyttel](http://localhost:5173). Check the expected access
   for that identity. If Microsoft is the household's original provider or an
   explicitly linked login, confirm the same household opens. A Google
   household does not automatically belong to a Microsoft identity with the
   same email address.
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
be restored to the private environment and loaded by restarting development if
needed; Entra cannot show its full value again.

If the secret is already expired, create and load a replacement using these
same steps. New Microsoft sign-ins can fail until this is done. Creating a
new app registration or deleting household data is not part of the repair.
For a hosted installation, update its private environment setting and use
the host's redeploy procedure with the existing persistent disk.

References: Microsoft's
[credential management](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials),
[rotation guidance](https://learn.microsoft.com/en-us/entra/msidweb/authentication/client-secrets#rotation-strategy).

## Continue with the first household

These steps get a new contributor to a running development server and a
known Google administrator identity. Both providers must be configured before
startup. Existing contributors with a configured administrator can skip
identity discovery and use the [devcontainer guide](devcontainer.md).
Changing the first-administrator setting does not transfer an existing
household to another account.

Container creation and rebuilding run `db:setup`, which requires a known
administrator subject and resets application data to the demo household.
For a first setup, either follow
[the container steps](#use-the-credentials-in-the-devcontainer), including
administrator discovery, or use the host development server below.
Both paths use port 5173 and the same provider registration as normal
development. Neither requires a production container or another callback.

### 10. Prepare the host and local configuration

Clone the repository and open a terminal at its root. Install the Node.js
version in `.node-version`, then install the npm version pinned in
`package.json` and the dependencies:

```sh
node scripts/install-repository-npm.mjs
npm ci
```

Use a user-managed Node.js installation where the npm bootstrap can update
npm without administrator privileges. Native SQLite dependencies need a
supported prebuilt binary or Python, a C/C++ compiler, and Make; see the
[development prerequisites](devcontainer.md#develop-without-the-container).
A host installation of dependencies is separate from the devcontainer's
dependency volume.

1. Open the existing `.env.local`. Keep the provider credentials saved above.
   For a new development installation, set:

   ```dotenv
   SKYTTEL_ORIGIN=http://localhost:5173
   SKYTTEL_DATABASE_PATH=./data/skyttel.sqlite
   SKYTTEL_FIRST_ADMIN_PROVIDER=google
   SKYTTEL_FIRST_ADMIN_SUBJECT=not-configured
   HOST=127.0.0.1
   PORT=3300
   ```

2. Keep an existing generated `BETTER_AUTH_SECRET`. If it is empty, generate
   one in a private terminal and save it in that entry:

   ```sh
   openssl rand -base64 48
   ```

3. Confirm that both provider credential pairs are present and save the file.
   Use a fresh host terminal without exported Skyttel settings from another
   installation. Exported values override the selected environment file.

`not-configured` allows real sign-in without granting household creation.
It is a temporary discovery setting, not a usable administrator identifier.
An email address or OAuth client ID cannot replace the Google subject.
Do not run `db:setup` until that subject is known: the seed deliberately
rejects placeholder identities and resets its selected database.

### 11. Start the development server

From the repository root in host terminal A:

```sh
export SKYTTEL_DEV_ENV_FILE=.env.local
npm run dev:all
```

In host terminal B, check the browser-facing server:

```sh
curl --fail http://localhost:5173/healthz
```

Expect `{"status":"ok"}`. Vite serves the client on port 5173 and forwards
API requests to port 3300. The API creates and migrates the configured SQLite
file on startup. Neither the readiness response nor visible sign-in buttons
prove that provider login works. Keep both ports free; do not change only the
browser port to resolve a conflict, because the Google callback must match.

### 12. Discover and designate the Google administrator

1. Open [development Skyttel](http://localhost:5173). Use `localhost`
   consistently, not `127.0.0.1`, in the browser.
2. Select **Fortsätt med Google** and sign in with the intended development
   administrator's Google account.
3. Expect **Du har inte tillgång till hushållet**, with your signed-in name
   and **Logga ut**. This is the expected result while the administrator
   subject is `not-configured`. **Inloggningen kunde inte slutföras** means
   authentication failed; check the credentials and callback before continuing.
4. In the same signed-in browser, open
   `http://localhost:5173/api/bootstrap`. Confirm `status` is `forbidden`
   and copy `user.id` privately. Stop terminal A with Ctrl+C.
5. From the repository root in a private host terminal, read that user's
   provider identifier. Run the prompt first, then the Node block. The lookup
   loads the selected environment file and refuses an existing household.

   ```sh
   export SKYTTEL_SETUP_USER_ID=''
   printf 'Skyttel user ID: '
   read -r SKYTTEL_SETUP_USER_ID
   ```

   ```sh
   node --input-type=module <<'JS'
   import Database from 'better-sqlite3';
   process.loadEnvFile(process.env.SKYTTEL_DEV_ENV_FILE ?? '.env.local');
   const userId = process.env.SKYTTEL_SETUP_USER_ID?.trim();
   const provider = process.env.SKYTTEL_FIRST_ADMIN_PROVIDER;
   if (!userId || provider !== 'google') {
     throw new Error('Check the user ID and configured Google provider.');
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

   The output is a private identity identifier; do not share or record the
   terminal. The lookup matches the signed-in user and configured provider.
6. Copy the returned `accountId` into `SKYTTEL_FIRST_ADMIN_SUBJECT`
   in `.env.local`. Keep `SKYTTEL_FIRST_ADMIN_PROVIDER=google` and save.
   Google's stable `sub` is the identifier; it is not your email address.

Google documents the [identity claim](https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload).
Skyttel's [administrator rules](../operations/installation.md#designate-the-first-administrator)
explain the distinction between provider login and household access.

### 13. Start normal development with demo data

For continued **host development**, run from the repository root:

```sh
export SKYTTEL_DEV_ENV_FILE=.env.local
npm run db:setup
npm run dev:all
```

The reset removes all data and sessions from the selected development
SQLite file and creates `TestHousehold` with your configured administrator.
Open `http://localhost:5173` and sign in again with Google. Expect the demo
household and administrator access. Future `npm run dev:all` starts preserve
data; run `db:setup` only when you intend to replace it.

For **devcontainer development**, stop the host server first. Before the
first container creation, prepare its private file without overwriting an
existing one:

```sh
cp -n .devcontainer/.env.example .devcontainer/.env
chmod 600 .devcontainer/.env
```

In your editor, copy the four provider credentials, `BETTER_AUTH_SECRET`,
`SKYTTEL_FIRST_ADMIN_PROVIDER`, and the verified `SKYTTEL_FIRST_ADMIN_SUBJECT`
from `.env.local` into their existing entries in `.devcontainer/.env`.
Keep the container's `SKYTTEL_DATABASE_PATH=/data/skyttel.sqlite`,
`SKYTTEL_ORIGIN=http://localhost:5173`, `HOST=0.0.0.0`, and `PORT=3300`.
Do not copy the host database into the container volume. Keep both private
files out of Git and update their shared credentials together when needed.

Follow [Prepare and start](devcontainer.md#prepare-and-start), including the
host Codex prerequisites, then reopen the repository in the devcontainer.
Its creation script runs `db:setup`, migrating the container's separate
development database and replacing its application data and sessions with
`TestHousehold`. Rebuilding repeats that reset; ordinary restarts preserve
data. In a container terminal, run
`npm run dev:all` and open port 5173 on the host. Sign in with Google and check
the household you created. The devcontainer supplies its own Node.js, npm,
tools, and native dependencies for ongoing work.

For the **manual Codex CLI test**, stop any existing port-3301 app and use
[the isolated setup](../manual-tests/setup/assistants.md#manual-local-codex-cli-setup).
It reuses the same Google client but uses the registered port-3301 callback
and a fresh throwaway database. Normal development stays on port 5173.

### 14. Check Microsoft sign-in separately

The Codex case tests Google only. To check the development Microsoft client,
use a separate private browser window at `http://localhost:5173` and choose
**Fortsätt med Microsoft** with a personal Microsoft account.
For an identity with no membership or linked login, expect **Du har inte
tillgång till hushållet** after successful sign-in. A provider error is not
an expected access denial. A Google household does not automatically belong
to a Microsoft identity with the same email address.

To test linking instead, follow the [login-linking steps](../user-guide/access.md#koppla-google-och-microsoft)
with an identity that does not already belong to a Skyttel user. Signing in
separately creates a separate user, which cannot later be merged by linking.
Additional provider, persistence, and denial checks are described in
[real-provider verification](../manual-tests/access.md#real-identity-provider-preparation).
Those checks and real Codex login remain manual and separate from CI.
