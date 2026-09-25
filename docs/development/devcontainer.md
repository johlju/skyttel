# Set up the development environment

Use the devcontainer for Skyttel's Node.js, SQLite, and browser tools.
This guide covers local setup, sign-in, startup, and development data.
For deployed installations, use [production authentication](../operations/authentication.md)
and [installation](../operations/installation.md).

## Prepare and start

Install Docker and VS Code with the Dev Containers extension. Start Docker,
clone the repository, and open its root in VS Code. Run the following in a
host terminal with Bash or Zsh; on Windows, use a WSL Linux shell:

```sh
mkdir -p "$HOME/.codex/sessions" "$HOME/.codex/plugins" \
  "$HOME/.codex/skills" "$HOME/.codex/rules"
if [ ! -e "$HOME/.codex/auth.json" ]; then
  (umask 077; printf '{}\n' > "$HOME/.codex/auth.json")
fi
cp -n .devcontainer/.env.example .devcontainer/.env
chmod 600 .devcontainer/.env
openssl rand -base64 48
```

Save the generated value in `BETTER_AUTH_SECRET` in `.devcontainer/.env`.
Keep an existing secret when rebuilding. The file is ignored by Git;
keep its credentials and personal identity values private.

Select **Dev Containers: Reopen in Container** and the normal Skyttel
configuration. Wait for installation and the Codex daemon to finish starting.
Creation installs the repository's Node.js and npm versions, application
dependencies, and browser tools, then runs `npm run db:setup`.
Creation and rebuilding apply migrations, remove existing application data
and sessions, and load the demo household. Ordinary restarts preserve data.
The application and tests start only when you run them.

The example provider values allow startup and display the sign-in page.
Complete [local sign-in setup](#set-up-local-sign-in) to use the application.
On first setup, `db:setup` stops with `SKYTTEL_FIRST_ADMIN_SUBJECT` until
you configure your administrator's provider identifier. The dependencies
are already installed: follow the sign-in steps below, then rebuild to
complete setup and load the demo household.
Use invented household information in development.

The normal configuration includes access to the host Docker engine. Use it
for trusted development work. The elevated profile is only for investigating
a demonstrated container restriction; it uses separate development volumes.

## Run the application

Run from the repository root inside the container:

```sh
npm run dev:all
```

Open [Skyttel](http://localhost:5173). Vite serves the client on port 5173
and proxies API requests to port 3300. VS Code forwards these ports to the
host. Keep host port 5173 free and use `localhost` consistently so the
browser origin matches the provider callback. Source edits reload the app;
Ctrl+C stops both processes.

For a compiled build served by the application server:

```sh
npm run dev:prodlike
```

Open [the compiled application](http://localhost:3301). This command builds
once and uses the same database and provider credentials as `dev:all`.
Restart the command after source edits. Keep host port 3301 free and keep
`PORT=3300` in the private development file: the command overrides it for
its own process.

The development commands read `.devcontainer/.env` by default.
`SKYTTEL_DEV_ENV_FILE` selects another private file. Exported environment
values take precedence over file values. Compose exports settings when
creating the container, so recreate it after changing those settings.
The container database is `/data/skyttel.sqlite`; ordinary startup applies
pending migrations and preserves application data.

## Set up local sign-in

Both Google and Microsoft client IDs and secrets must be present in the
private environment file. Replace the synthetic credentials with your own
development registrations to sign in with those providers. Keep development
credentials separate from production credentials.

Follow the detailed [local authentication walkthrough](local-authentication.md)
to create your own provider accounts and development registrations, configure
callbacks, save the credentials privately, and renew Microsoft secrets.
Copy the four provider credentials into `.devcontainer/.env`, keeping the
container's database path and other settings. Recreate the container to load
the credentials, then continue below to designate your first administrator.

### Designate the first administrator

Skip identity discovery if your administrator is already configured.
Changing this setting does not transfer an existing household.
For a new empty installation, leave the template's administrator subject
in place while identifying your account. Select `google` or `microsoft`
in `SKYTTEL_FIRST_ADMIN_PROVIDER`, then recreate the container to load the
real provider credentials.

1. Run `npm run dev:all`, open `http://localhost:5173`, and sign in using
   the intended administrator's selected provider. Expect **Du har inte
   tillgång till hushållet** while the subject is still a placeholder.
2. In the same signed-in browser, open
   `http://localhost:5173/api/bootstrap`. Confirm `status` is `forbidden`
   and copy `user.id` privately. Stop the development server with Ctrl+C.
3. In a private terminal at the repository root, read that user's provider
   identifier. Run the prompt first, then the Node block. The lookup loads
   the same environment file as development and refuses an existing household.

   ```sh
   export SKYTTEL_SETUP_USER_ID=''
   printf 'Skyttel user ID: '
   read -r SKYTTEL_SETUP_USER_ID
   ```

   ```sh
   node --input-type=module <<'JS'
   import Database from 'better-sqlite3';
   process.loadEnvFile(process.env.SKYTTEL_DEV_ENV_FILE ?? '.devcontainer/.env');
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

4. Save the returned value as `SKYTTEL_FIRST_ADMIN_SUBJECT` in your private
   environment file. It is the provider's account identifier, not an email
   address, client ID, or the Skyttel `user.id` used for the lookup.
5. Rebuild the devcontainer to complete setup and load `TestHousehold`,
   then restart development and sign in again. When developing without
   the container, restart development and follow the installation screen
   to create a household, or explicitly choose [demo data](#reset-demo-data).

A successful provider sign-in alone does not grant household access.
Matching email addresses at Google and Microsoft do not link their accounts.
Use the [access guide](../user-guide/access.md) when testing another identity.

## Reset demo data

After configuring provider credentials and a verified administrator subject,
container creation and rebuilding reset the database to the demo household.
To perform the same reset without rebuilding:

```sh
npm run db:setup
npm run dev:all
```

`db:setup` removes all application data and sessions from the selected
`SKYTTEL_DATABASE_PATH` and creates `TestHousehold` with your configured
administrator. Check the selected path and back up anything you want to
keep before running it or rebuilding the container. Sign in again after the
reset. `db:migrate`, normal application startup, and container stop/start
preserve the data.

## Disposable local database

Use a disposable database when investigating a bug or replacing household
content during development. Run it inside the devcontainer and open
`http://localhost:5173` in the host browser. Complete
[local sign-in setup](#set-up-local-sign-in) first and use the configured
administrator's account. Use only invented household information.

Stop the normal `npm run dev:all` with Ctrl+C and keep ports 3300 and 5173
free. From the repository root, run this block in a terminal that you keep
open for the whole check. It creates a new empty database without running
`db:setup` or changing the ordinary development database. Provider settings
come from the same private environment file as normal development:
`SKYTTEL_DEV_ENV_FILE`, or `.devcontainer/.env` when it is not set.

```sh
umask 077
SKYTTEL_BROWSER_CASE_DIR=$(mktemp -d /tmp/skyttel-browser-case.XXXXXX)
printf 'SKYTTEL_DATABASE_PATH=%s/skyttel.sqlite\n' \
  "$SKYTTEL_BROWSER_CASE_DIR" > "$SKYTTEL_BROWSER_CASE_DIR/case.env"
env -u SKYTTEL_DATABASE_PATH \
  node --env-file="$SKYTTEL_BROWSER_CASE_DIR/case.env" scripts/develop.mjs
```

Open a fresh private browser window on the host, sign in and create the
requested household. If two profiles are required, use two separate browser
profiles, both signed in as the same configured administrator. Session
cookies are profile-local. Keep any downloaded synthetic archives in a
separate private folder on the host.

For a restart within the check, press Ctrl+C, wait for both development
processes to stop, and run only this command in the same terminal. It uses
the same database, sessions, and household:

```sh
env -u SKYTTEL_DATABASE_PATH \
  node --env-file="$SKYTTEL_BROWSER_CASE_DIR/case.env" scripts/develop.mjs
```

Reload the browser after startup. Do not rerun the directory-creation block
or `db:setup` during a persistence check. When finished, stop the server,
close the test browser windows, remove downloaded test archives, and delete
only this temporary directory in the same terminal:

```sh
rm -r -- "${SKYTTEL_BROWSER_CASE_DIR:?}"
unset SKYTTEL_BROWSER_CASE_DIR
```

Start the ordinary environment again with `npm run dev:all`. For another
isolated check, create a fresh directory with the first block.

## Develop without the container

Install Git and the Node.js version in `.node-version`, using a Node
installation your user can update. Native SQLite dependencies require a
supported prebuilt binary or Python, a C/C++ compiler, and Make.
From the repository root, install the pinned npm and dependencies:

```sh
node scripts/install-repository-npm.mjs
npm ci
npx playwright install --with-deps chromium
cp -n .env.example .env.local
chmod 600 .env.local
```

Set the following in `.env.local`, along with a generated
`BETTER_AUTH_SECRET` and your provider credentials:

```dotenv
SKYTTEL_ORIGIN=http://localhost:5173
SKYTTEL_DATABASE_PATH=./data/skyttel.sqlite
SKYTTEL_FIRST_ADMIN_PROVIDER=google
SKYTTEL_FIRST_ADMIN_SUBJECT=not-configured
HOST=127.0.0.1
PORT=3300
```

Use a terminal without stale exported settings. Select the host file before
starting development or running the administrator lookup:

```sh
export SKYTTEL_DEV_ENV_FILE=.env.local
npm run dev:all
```

Follow the same provider registration and administrator steps above.
On the host, restart the development command after editing the file;
there is no container to recreate. Keep ports 3300 and 5173 available.

## Optional assistant access

For Skyttel's text and voice assistants to call the real provider, add
`OPENAI_API_KEY` to the private environment file and reload the environment.
It is server-only; never use a `VITE_` variable for the key. Normal automated
checks use synthetic providers and do not require a real key.

The devcontainer installs Codex tooling. If you use it, sign in from the
container's CLI or VS Code extension. The host directories prepared above
share sessions, plugins, skills, and rules with the container; editing their
contents also changes the host copies. Both profiles also mount the host's
`~/.codex/auth.json` as a file. The preparation command creates an empty
placeholder only when the file is absent; it preserves existing credentials.
Keep credentials out of the repository and container image.

## State and rebuilds

Both profiles run `db:setup` when created or rebuilt: saved application
data, private drafts, and sessions are replaced with fresh demo data.
The database volume remains mounted, but its application contents reset.
A normal container stop/start or application restart preserves those contents.

The same Compose project retains dependencies, editor state, `~/.config`,
and `/home/vscode/worktrees` in named volumes across rebuilds.
Keep additional Git worktrees outside the checkout and install dependencies
for each. Changing profiles or the Compose project name selects different
volumes; removing volumes deletes their contents.

Codex sessions, plugins, skills, and rules use host directories; `auth.json`
uses a host file. These mounts survive container recreation. Codex's SQLite
state and temporary files have separate named volumes. The Compose files do
not mount the whole `~/.codex` directory: back up personal `config.toml`
outside the disposable container filesystem before rebuilding.
Setup replaces managed configuration blocks and applies the repository's
approval policy, default permissions, workspace trust, and disabled plugins
and skills. Keep unrelated personal settings outside managed blocks.

Rebuild after changing `.node-version` or the npm pin in `package.json`.
Keep the private environment file and authentication secret when rebuilding.

## Verify the environment

Run `npm run check` to typecheck, lint, build, and run the automated suites.
See [testing](testing.md) for focused commands and optional
manual environments.

For container startup failures, use **Dev Containers: Show Container Log**.
For application failures, inspect its terminal, private environment settings,
and database permissions. Check `http://localhost:5173/healthz` for
`{"status":"ok"}`. A healthy response does not verify provider credentials;
test a fresh sign-in. Run `npm ci` inside the container for missing or
incompatible dependencies; keep host `node_modules` out of Linux containers.
