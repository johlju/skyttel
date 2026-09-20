# Develop in the devcontainer

Use the devcontainer for Skyttel's Node.js and SQLite development environment.
Docker Compose runs one `app` service with the repository at `/workspace`.
Start the application and run checks from a container terminal.

## Prepare and start

Use a running Docker engine and VS Code with the Dev Containers extension.
Before the first container creation, prepare the private environment file:

```sh
cp .devcontainer/.env.example .devcontainer/.env
openssl rand -base64 48
```

Put the generated value in `BETTER_AUTH_SECRET` in `.devcontainer/.env` and
keep it stable across rebuilds. This ignored file is the default environment
for `npm run dev:all` and `npm run db:setup`. The synthetic provider values
display the sign-in page but cannot complete real sign-in. Configure
dedicated provider registrations and a first administrator using the
[installation guide](../operations/installation.md) when real sign-in is
needed. Keep credentials and identity values out of Git and public logs.

Ensure the host directories
`~/.codex/sessions`, `~/.codex/plugins`, `~/.codex/skills`, and
`~/.codex/rules` exist. `~/.codex/auth.json` must be an existing regular file
from your host Codex authentication setup. An empty placeholder is not usable
authentication. These mounts share their actual contents with the container;
changes to a shared directory also affect the host. The container does not
copy authentication into its image or the repository.

Select **Dev Containers: Reopen in Container** and choose the normal Skyttel
configuration. Wait for dependency and tool installation and the Codex daemon
to finish starting. Container creation and startup do not start the
application or run tests.

## Run the application

Start the client and server in a container terminal:

```sh
npm run dev:all
```

Open [the development client](http://localhost:5173). Vite proxies `/api`
and `/healthz` to the server on container port 3300. VS Code forwards ports
3300 for the API, 3301 for the compiled application, 5173 for the client,
and 9324 for Playwright reports.
Keep host port 5173 free because the sign-in origin uses that port. Ctrl+C
stops both development processes; source edits reload them.

To build and run the compiled application on port 3301, use:

```sh
npm run dev:prodlike
```

This command builds once, then serves the Vite client and API through the
production Hono server at [port 3301](http://localhost:3301). It uses the same
database and provider credentials as normal development. Its public origin
uses the configured host and protocol with port 3301. For real sign-in, add
the corresponding port-3301 callback URLs to the dedicated provider
registrations. Source edits require another build. Keep host port 3301 free.

`SKYTTEL_DEV_ENV_FILE` selects another private environment file. Exported
environment values take precedence over file values. Compose also loads
`.devcontainer/.env`, so recreate the container after changing a value it
exports. The default database is `/data/skyttel.sqlite`.
SQLite runs inside the app and migrates when the app starts.

Set `PORT=3300` in private development environment files, including files
used to run development on the host, so the API matches the Vite proxy.
Update existing development files that set `PORT=3000`. Recreate the
container after changing its environment, and rebuild it to apply the
updated forwarded ports.

## Reset demo data

Both dev container profiles run `npm run db:setup` as the final creation
step, including after a rebuild. Configure real provider credentials and
the first administrator before creating the container. Each successful
setup replaces the development database contents with demo data.

After configuring real provider credentials and the first administrator,
prepare the development database and start the application:

```sh
npm run db:setup
npm run dev:all
```

Open [the development client](http://localhost:5173) and sign in with the
account identified by `SKYTTEL_FIRST_ADMIN_PROVIDER` and
`SKYTTEL_FIRST_ADMIN_SUBJECT`. The `TestHousehold` household is ready, and
that account has the administrator role. Its initial display name is
`Development administrator`. Sign-in still requires the configured identity
provider; the seed does not create a password or an authenticated session.

Every successful `npm run db:setup` removes all application data from
`SKYTTEL_DATABASE_PATH` and replaces it with the demo data. This includes
households, memberships, invitations, provider accounts, and sessions, so
sign in again after a reset. Back up any development data you want to keep.
Starting the development server does not reset the database.

The command uses `.devcontainer/.env` by default, or the file selected by
`SKYTTEL_DEV_ENV_FILE`. Exported environment values take precedence, including
values Compose loads when creating the container. Recreate the container
after changing those values in the file. Check `SKYTTEL_DATABASE_PATH`
before resetting; use a dedicated development database.

Setup validates the configuration before opening the database and rejects
`NODE_ENV=production` and the example first-administrator subject values.
It applies migrations, then clears and seeds application data in one
transaction. If clearing or seeding fails, the previous application data
remains. Migration history is retained.

Add future demo fixtures in `scripts/seeds/demo.ts`, or in helpers called
from that file. The reset also clears application tables introduced by
future migrations. Keep the fixtures synthetic; the configured administrator
identity comes from the private environment file.

## Use a host terminal

For terminal access through the default configuration, run on the host:

```sh
npm ci
npx devcontainer up --workspace-folder .
npx devcontainer exec --workspace-folder . zsh
```

The CLI does not provide VS Code's port-forwarding UI. Use the attached
editor when opening the application through its forwarded ports.

## State and rebuilds

Compose keeps independent named volumes for the following state:

<!-- markdownlint-disable MD013 -->
| Volume | Container path and purpose |
| --- | --- |
| `skyttel-data` | `/data`: development SQLite database and journal files. |
| `codex-state` | `/home/vscode/.codex`: installed runtime, configuration, and remaining Codex state. |
| `codex-tmp` | `/home/vscode/.codex/tmp`: container-local runtime wrappers. |
| `config` | `/home/vscode/.config`: personal tool settings. |
| `vscode-server` | `/home/vscode/.vscode-server`: remote editor settings and extensions. |
| `node-modules` | `/workspace/node_modules`: Linux dependencies isolated from the host. |
| `worktrees` | `/home/vscode/worktrees`: Git worktrees outside the checkout. |
<!-- markdownlint-enable MD013 -->

The host Codex bind mounts override their corresponding paths inside
`codex-state`; their contents remain on the host. Source and the private
`.devcontainer/.env` remain in the repository's host bind mount.

Restarting or rebuilding the same Compose project retains its volumes.
The normal `skyttel-devcontainer` and opt-in `skyttel-devcontainer-elevated`
projects have separate named volumes; they share the same host bind mounts.
Changing the Compose project name selects different volumes. Removing
volumes, including `docker compose down --volumes`, deletes their state.
Back up data you need to keep before removing volumes.

Use `/home/vscode/worktrees` for additional worktrees and install their
dependencies separately. Keep the main `/workspace` path stable because
worktree metadata refers to it. Applications and tools run as `vscode`;
use `sudo` for development installations that require root access.

## Tools and updates

Both profiles install the Node version from `.node-version` and the npm
version from `packageManager` in `package.json`. Rebuild after changing
either version source. Keep them compatible with the package engine range,
CI, and production Node images.

Creation installs application dependencies with `npm ci` and browsers matching
the application's locked Playwright version. Codex CLI and separate global
Playwright tooling use rolling releases and can change on rebuild. VS Code
manages editor extension updates.

After tool updates, rebuild, start the application, and check that your
development data is still available. Run the application checks explicitly:

```sh
npm run check
dotnet gitversion /output json
```

Check rolling tool versions with `codex --version` and
`"$HOME/.local/bin/playwright" --version`. Use
`npx --no-install playwright --version` for the project's locked Playwright
version. In VS Code's
Extensions view, select the installed Codex extension to see its version.

See [development testing](testing.md) for focused application checks and
the explicit `npm run purge:install` dependency-maintenance command.

## Temporary containers

Docker CLI, Compose, and Buildx connect to the host engine. For example:

```sh
docker run --rm alpine echo ready
docker compose version
docker buildx version
```

The temporary container is removed when its process exits. Containers and
images use the host engine and appear in Docker Desktop. Bind-mount paths
refer to the Docker host, so use named volumes or `docker cp` for files that
exist only inside the devcontainer. The application `test:container` command
uses Docker copy and exec to work in both environments.

## Codex permissions and remaining verification

Creation configures Codex permissions in `~/.codex/config.toml`.
The `skyttel-development` profile allows workspace writes and networking
to `localhost`, `127.0.0.1`, and `::1`, with approval policy `never`.
Repository settings also apply; see [Codex command permissions](codex-permissions.md).

Use the normal profile first. It includes the host Docker socket, which lets
commands manage host containers; use it for trusted development work.
Use the elevated configuration only when investigating a demonstrated
container restriction. It adds `SYS_ADMIN` and relaxed sandbox-related
Linux settings `seccomp=unconfined` and `systempaths=unconfined`.
Do not disable the Codex sandbox to work around a failure.

Codex command approval does not change Linux capabilities. An expected
denial of an out-of-scope write does not justify switching profiles.
A running daemon does not establish that signed-in CLI or VS Code extension
use works; see [issue #25](https://github.com/viscalyx/skyttel/issues/25)
for client verification.

## Troubleshoot startup

Use **Dev Containers: Show Container Log** for build and lifecycle failures.
Fix a missing host Codex mount, failed installation, or daemon error before
assuming startup completed. For application errors, inspect its terminal,
the environment file, `/data` permissions, and `/healthz`. Synthetic provider
credentials cannot complete sign-in. Preserve data when investigating a
migration failure. Run `npm ci` inside the container for missing or
incompatible native packages; never copy host `node_modules` into Linux.

Record exact errors, host OS/CPU, Docker version, profile, and tool versions.
Keep authentication, session content, and household data out of public logs.
