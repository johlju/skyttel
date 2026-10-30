# Set up LangSmith for Skyttel development and production

This guide is for the developer and installationsansvarig setting up
LangSmith for the first time. Set up development first, verify it, then
repeat the application steps for production. The result is two destinations:

<!-- markdownlint-disable MD013 -->
| Destination | Receives activity from | Application settings live in |
| :-- | :-- | :-- |
| `skyttel-dev` | Interactive development and manual testing | Private devcontainer environment file |
| `skyttel-prod` | The deployed Skyttel application | Render service environment |
<!-- markdownlint-enable MD013 -->

Use one LangSmith personal organization and its existing workspace for both.
Separate destinations make development activity easy to distinguish from
production. They share the account's allowance; separation does not create
another free allowance or a security boundary between workspace members.

LangSmith receives diagnostic evidence about assistant work. A **trace**
groups a task or voice session with its related model and tool activity.
In this guide, **sending** means Skyttel automatically uploads these traces
to LangSmith during assistant use. You do not upload files manually.
A **workspace** contains destinations and controls access. In the newer
interface, an **agent** is a named application record with environments.
Registering that record does not move Skyttel into LangSmith: Skyttel still
runs in your devcontainer or on Render.

Follow the [development setup guide](../development/devcontainer.md) for
local login and startup, and the [Render guide](render.md) for deployment.
Keep each installation's existing database, authentication secret and
installation authority. No extra container, diagnostic archive or scheduled
service is needed.

## 1. Gather what you need

Before starting, have:

- Your own LangSmith login, or an email address to create one.
- A password manager for API keys. An API key is a secret used by Skyttel
  to authenticate to LangSmith; do not paste it into chat or commit it.
- Access to Skyttel's installation settings in development and production.
- Access to the private development environment file and Render service.

## 2. Create or open your LangSmith account

1. Open [LangSmith](https://smith.langchain.com) and sign in or create your
   account. Use the region intended for this installation.
2. Keep the default personal organization and one developer. Do not create
   another organization, add a second seat or add a payment method for this
   setup.
3. Open **Settings → Billing and Usage**. Confirm the Developer plan,
   no payment method, remaining trace allowance and reset date. The documented
   limit for a personal organization without a card is 5,000 traces per
   month. Check the actual account before enabling either destination.
4. Open **Settings** in LangSmith. For the default US region, you can open
   [Settings directly](https://smith.langchain.com/settings). If you use
   another region, stay on that region's LangSmith website.
5. If your interface has **General** with a field labelled **Workspace ID**,
   copy that value. LangSmith's
   [SDK instructions](https://docs.langchain.com/langsmith/create-account-api-key#configure-the-sdk)
   describe this layout, but the new personal-workspace interface can omit it.
   In that layout, **Configuration → Workspace** only shows the experience
   switch. Do not switch experiences to search for an ID.
6. If no Workspace ID is displayed, copy **ID** beside **Organization** above
   the **Personal** selector. This is the organization ID. Use it in the
   [workspace lookup below](#look-up-your-workspace-id) to retrieve the
   separate workspace ID. Record the returned workspace UUID for both
   installations; do not put the organization ID in the workspace setting.
7. Confirm you are using your own **Personal** organization on the
   **Developer** plan. For this single-workspace account, LangSmith assigns
   your login the Organization Admin role, which includes Workspace Admin.
   That role permits reading traces and requesting deletion. No role change,
   extra member or plan upgrade is needed for this setup. See
   [default roles](https://docs.langchain.com/langsmith/set-up-hierarchy#organization-roles)
   and [trace permissions](https://docs.langchain.com/langsmith/organization-workspace-operations#runs).
8. Record how you sign in and which account you use in your password manager,
   for example Google plus your account email, or GitHub plus your username.
   Check that you can still access that sign-in account's recovery method.
   Keep any recovery codes securely. This concerns the account you use to
   sign in; there is no additional LangSmith recovery switch in this guide.
9. Keep access to that login for later cleanup. Your setup PAT can expire or
   be revoked after setup: you can create another PAT from the same admin
   account when cleanup is needed. Skyttel's tracing-only runtime keys cannot
   read or delete stored traces.

There may be no traces yet. Continue to step 3; there is nothing to inspect
or delete at this point. Step 8 checks that you can open the first permitted
development trace. Step 11 describes requesting deletion when cleanup is
needed. The role check above establishes expected permissions, not a
completed live read or deletion check. If using a shared organization
instead, have its administrator confirm Workspace Admin access for the
selected workspace before continuing.

If the account requires payment or additional access, resolve that before
activation. Development activity uses the same allowance as production.
See [account and API keys](https://docs.langchain.com/langsmith/create-account-api-key)
and [billing](https://docs.langchain.com/langsmith/billing).

Record the API endpoint for the selected region:

| Region | API endpoint |
| :-- | :-- |
| GCP US | `https://api.smith.langchain.com` |
| GCP EU | `https://eu.api.smith.langchain.com` |
| GCP APAC | `https://apac.api.smith.langchain.com` |
| AWS US | `https://aws.api.smith.langchain.com` |

Use the API endpoint, not the website address from the browser. Copy it
without a trailing slash, path or query. Do not choose a region from the
household's language: use the account's actual region. Changing regions does
not migrate data. See [regions](https://docs.langchain.com/langsmith/regions-faq)
and the [regional endpoint reference](https://support.langchain.com/articles/6271700631-pointing-the-langsmith-sdk-and-cli-at-a-non-us-regional-endpoint).

**Check before continuing:** you have the region, API endpoint, workspace
UUID, free capacity, an admin login and a way to recover that login.

## 3. Create skyttel-dev and skyttel-prod

Choose the path that matches your LangSmith interface. Do only one path,
using it for both development and production. If you see **All agents**
and **+ Agent**, use Path A and skip Path B.

### Path A: All agents and the new agent experience

This is an agent-based workspace. Skyttel runs in your devcontainer or on
Render; this flow registers where its traces will appear in LangSmith.

1. Select **All agents** in the left sidebar.
2. Click **+ Agent**. Under **CONNECT**, choose **Trace an existing agent**.
   Some UI versions call this option **Observability** in a **New Agent**
   panel.
3. Enter `skyttel-dev` in both **Agent name** and **Agent ID**, then create
   the record.
4. Return to **All agents** and repeat with `skyttel-prod` as both name
   and ID.
5. Select `skyttel-dev` and choose **Development** in the environment
   selector. For `skyttel-prod`, choose **Production**. These environment
   names are fixed; `skyttel-dev` and `skyttel-prod` are agent names.
6. Obtain the destination name and project UUID for each selected environment
   using [the lookup below](#look-up-agent-destination-values).

If an ID already exists, open it and verify that it is the intended Skyttel
record before reusing it. You do not need to build or deploy an agent inside
LangSmith. See [agent creation](https://docs.langchain.com/langsmith/create-an-agent)
and [environments](https://docs.langchain.com/langsmith/agent-environments).

`tracer_session_name` is the name of a field in LangSmith's API response.
The lookup script reads that field and prints its value after the label
`SKYTTEL_LANGSMITH_PROJECT:`. It does not print a separate line labelled
`tracer_session_name`. Copy the value after the colon into Skyttel's
destination setting; do not enter the literal text `tracer_session_name`.
See the [output example](#read-the-agent-lookup-output) below.

Do not substitute the agent name, agent ID or project UUID. The two returned
names can look different from `skyttel-dev` and `skyttel-prod`; copy them
exactly. The environment's `tracer_session_id` is the project UUID used for
lookup and cleanup. This is LangSmith's
[compatibility configuration](https://docs.langchain.com/langsmith/create-an-agent#configure-integrations-that-require-a-project-name).

### Path B: classic project-based workspaces only

Keep this path for an existing project-based Cloud workspace using the
classic experience. LangSmith also uses project-based workspaces for
self-hosted installations; this guide's account and region steps target
LangSmith Cloud. See [workspace types](https://docs.langchain.com/langsmith/log-traces-to-agent#prerequisites).

The documented indicator for a project-based workspace is the LangSmith logo
in the top-left control, rather than a named workspace switcher. If you have
the **All agents → + Agent → Trace an existing agent** flow, follow Path A.
Skyttel's `SKYTTEL_LANGSMITH_PROJECT` setting works with Path A through the
compatibility value above; its name does not mean you need Path B.

For Path B, create two tracing projects named exactly
`skyttel-dev` and `skyttel-prod`, using
[the project setup below](#create-or-read-project-based-destinations).
It works without relying on a particular version of the project's UI.

For this path, `SKYTTEL_LANGSMITH_PROJECT` is literally `skyttel-dev` in
development and `skyttel-prod` in production. Record each project's returned
UUID separately. Do not create evaluation experiments in place of tracing
projects. See the [tracing quickstart](https://docs.langchain.com/langsmith/observability-quickstart).

### Record the two destinations

Keep this worksheet privately. It contains identities, not API-key secrets.

<!-- markdownlint-disable MD013 -->
| Setting | Development | Production |
| :-- | :-- | :-- |
| Region and API endpoint | From step 2 | Same region and endpoint |
| Workspace UUID | From step 2 | Same workspace UUID |
| Agent/environment, if applicable | `skyttel-dev` / Development | `skyttel-prod` / Production |
| Destination name | Value after `SKYTTEL_LANGSMITH_PROJECT:` under `skyttel-dev DEVELOPMENT`, or `skyttel-dev` for Path B | Value after `SKYTTEL_LANGSMITH_PROJECT:` under `skyttel-prod PRODUCTION`, or `skyttel-prod` for Path B |
| Project UUID for inspection/deletion | Returned development UUID | Returned production UUID |
<!-- markdownlint-enable MD013 -->

**Check before continuing:** the two destination names and UUIDs are
different. They must resolve inside the intended workspace and region.

## 4. Set retention and create two runtime keys

1. Open each destination's tracing page, selecting the correct environment
   for Path A. Open **Retention** and choose **Base**. Verify the rolling
   14-day policy for new traces.
2. Leave retention upgrades, evaluators and automation disabled. Do not
   create datasets, experiments or bulk exports as part of this setup.
3. Open **Settings → API Keys** and click **+ Create API key**. In the
   **Create an API Key** dialog, select **Tracing Only** under **Key Type**.
   Use `skyttel-dev` as the description, select only the intended workspace,
   choose an expiration date and click **Create API Key**.
4. Copy the one-time secret into your password manager before closing the
   dialog. Label it for development and record its expiration.
5. Create another tracing-only key described as `skyttel-prod`. Store and
   label it for production, with an expiration and rotation reminder.

**Ready to continue:** both destinations use Base retention, both runtime
tracing keys are saved privately, and you have the admin account access
covered in step 2. Continue to step 5. There is no additional PAT to create
or cleanup to perform at this point.

**Background information:** the following notes explain the keys and
retention settings above; they do not add setup steps.

Separate keys let you rotate or revoke one installation's credential.
Their workspace scope does not restrict either key to one destination:
the destination setting determines routing. Steps 6 and 7 use the worksheet
to connect each installation to its intended destination.

A runtime tracing key submits traces and updates. It cannot inspect stored
traces, register an agent or perform cleanup. The setup PAT used for the
earlier lookups is the separate credential for those operations; no new PAT
is needed here. Steps 6 and 7 install only the tracing-only runtime keys in
Skyttel. The setup PAT stays outside the application configuration. See
[tracing-key permissions](https://docs.langchain.com/langsmith/create-account-api-key#tracing-keys).

Retention applies separately to payloads and analytics/billing metadata.
Some metadata can remain indefinitely. Changing retention affects new
traces; dataset copies have independent lifetimes. This explains the limits
of the Base retention setting you selected above, not another setting to
configure. See
[retention](https://docs.langchain.com/langsmith/usage-and-billing).

## 5. Prepare users and choose when sending starts

Do the required preparation for development first, then independently for
production. Keeping sending disabled during configuration is optional.

### Required: prepare users before sending

1. Verify application health, login and household access.
2. Before enabling tracing, tell everyone who uses the assistant what will
   be sent to LangSmith and why. They need to know that another service can
   receive their actual words and household information, so they can decide
   whether to use the assistant. You can use the message below.
3. Ask users to finish current conversations and save their work, then wait
   while you change the settings. Afterward, ask them to start a new
   conversation and read and accept the information if Skyttel prompts them.
   Old conversations are not made eligible for tracing by accepting newer
   information later.

Suggested message to users:

> We are enabling LangSmith diagnostics to help investigate problems with
> Skyttel's assistant. Skyttel already uses OpenAI to process assistant
> requests. LangSmith is an additional service that can receive exact
> conversation text, information sent to and returned by the AI model, and
> the household information the assistant looks up or changes. Voice audio
> recordings are not sent to LangSmith. The operator can turn off future
> uploads, but this does not delete information already sent. Please read
> Skyttel's conversation information before continuing to use the assistant.

Skyttel handles each person's conversation consent in the application.
Telling users about the change does not replace that consent.

The account and key checks belong to steps 2–4. If you have completed them,
there is no separate approval step here. The
[production setup checklist](langsmith-rollout-checkpoint.md) helps you track
the checks at each stage; it does not add an authorization process.

**To start sending automatically:** continue to step 6 for development or
step 7 for production. With valid settings and no saved opt-out or suspension,
sending starts when the application loads the configuration on startup.
Editing the environment file alone does not change the running application.
Step 8 checks the sending state and verifies delivery.

A saved opt-out or suspension survives restarts. If one exists, configuring
the environment does not clear it; step 8 explains how to proceed.

### Optional: wait to activate sending

Use this only if you want to configure the connection first and enable
sending manually afterward. Otherwise, skip this subsection.

1. As installationsansvarig, open **Inställningar → Drift → Diagnostik med
   LangSmith**. Select **Stäng av sändning** if that button is available,
   then confirm the disabled state. If already disabled, leave it disabled.
2. Keep the same database so the disabled state survives the restart or
   deployment. Existing LangSmith settings can remain in place.

Continue to step 6 or 7 to configure the connection. Sending will remain
disabled until you select **Aktivera sändning** in step 8.

## 6. Connect development to skyttel-dev

Use the development column of the worksheet and the development runtime key.
Follow [configure development tracing](../development/devcontainer.md#configure-development-tracing)
to edit the private environment file and restart the app. That section covers
ordinary startup, separate worktrees and exported values that can override
the file.

The application reads these four settings:

<!-- markdownlint-disable MD013 -->
| Setting | What to enter |
| :-- | :-- |
| `SKYTTEL_LANGSMITH_ENDPOINT` | Regional API endpoint from step 2 |
| `SKYTTEL_LANGSMITH_PROJECT` | Exact development destination name from step 3 |
| `SKYTTEL_LANGSMITH_API_KEY` | Development tracing-only key from step 4 |
| `SKYTTEL_LANGSMITH_WORKSPACE_ID` | Workspace UUID from step 2 |
<!-- markdownlint-enable MD013 -->

For Path B, the project value is `skyttel-dev`. For Path A, copy the value
after `SKYTTEL_LANGSMITH_PROJECT:` in the script's `skyttel-dev DEVELOPMENT`
output. That value comes from the API field named `tracer_session_name`.
See the [output example](#read-the-agent-lookup-output).

Skyttel uses these application-specific variables. Do not copy the generic
`LANGSMITH_TRACING` or `LANGSMITH_PROJECT` examples from LangSmith into
Skyttel's setup. Remove `LANGSMITH_AGENT_ID` and
`LANGSMITH_AGENT_ENVIRONMENT` from exports and the private environment file;
their presence disconnects this integration.
CLI profiles do not supply the application's configuration.

Verify that the app starts with the same household data. If you chose the
optional wait in step 5, confirm sending remains disabled. Otherwise, valid
configuration starts sending unless a saved opt-out or suspension prevents
it. Complete [activation and verification](#8-activate-and-verify-one-installation-at-a-time)
for development before moving to production.

Interactive use and manual testing of the running app can send traces.
Ordinary automated tests use isolated configuration and controlled providers
or ingestion endpoints; the development file does not turn them into cloud
upload tests. Real-model and real-voice suites require their own explicit
authorization for billable calls.

## 7. Connect production to skyttel-prod

1. Complete the required preparation in step 5 for production. If you want
   to wait before sending, also complete its optional disable procedure
   before deploying the settings.
2. Open the existing Render service, then **Environment → + Add Environment
   Variable**.
3. Add the same four application settings from step 6, using the production
   destination and production runtime key. For Path B the project value is
   `skyttel-prod`; for Path A use the Production environment's returned name.
   Enter plain values without surrounding shell quotes.
4. Check linked environment groups for conflicting values. Service values
   take precedence. Confirm no development destination or key is selected.
5. Choose **Save only** if deployment must wait. When you are ready,
   follow the [Render guide](render.md) to deploy the exact verified image
   with the new environment. Check release identity, `/healthz`, database
   readiness, login and household access.
6. Check the sending state in Skyttel. If you chose to wait, it should remain
   disabled. Otherwise, valid configuration starts sending unless a saved
   opt-out or suspension prevents it. Continue to step 8 to verify delivery.

These are Render application settings, not GitHub deployment secrets.
**Restart service** reuses the running deployment's configuration; it does
not apply newly saved settings. See
[Render environment settings](https://render.com/docs/configure-environment-variables)
and [deployment effects](https://render.com/docs/deploys).

A merge to main can publish and deploy automatically.
**Save only** values can become active on that next release. Complete the
required preparation in step 5 before that release. If you choose to wait
before sending, establish the disabled state before deployment as well.
Preserve the existing SQLite disk and follow the exact-image flow rather
than replacing it with a source build.

## 8. Activate and verify one installation at a time

Use invented household information for development. Only use content
permitted for upload in production. Text and voice checks can invoke paid
model providers even when LangSmith tracing is within its free allowance.

Items 1 and 2 below are required state checks after applying configuration.
Items 3–8 are optional live verification: skip them if you do not want to
send a test request now. Tracing can remain enabled, but actual cloud
delivery and display remain unverified until you inspect a trace.

1. Confirm the destination worksheet, remaining allowance and current
   conversation information. If performing the optional live checks, choose
   content you are willing to send and account for model-provider charges.
2. Open **Inställningar → Drift → Diagnostik med LangSmith**. If it shows
   **Sändning aktiverad**, continue to the next item; no activation click is
   needed. If sending is disabled and you are ready, select **Aktivera
   sändning**. If it is suspended or shows **Inte ansluten**, resolve the
   problem using step 9 before continuing. Changing environment variables
   or restarting does not clear a saved opt-out or suspension.
3. Start a new conversation and accept the current information. Send one
   short text request using permitted content. If you choose to test voice,
   open a new voice session and make one request.
4. Refresh delivery health in Skyttel. Check for a recent accepted delivery
   and inspect error/drop counts. Startup health alone does not prove that
   LangSmith accepts traces.
5. In LangSmith, open the matching destination. For Path A, select the agent
   and its Development or Production environment. For Path B, select the
   matching project. Set the time range to include the check you just ran.
6. Open the text task's trace and inspect its model/tool children. For voice,
   inspect the separate voice root and links to delegated backend work.
   Follow linked UUIDs with `trace_id:"<UUID>"` in the Runs/Traces search.
   See [trace filtering](https://docs.langchain.com/langsmith/filter-traces).
7. Confirm the check appears in the intended destination, not the other one.
   Inspect `extra.metadata.status` for the exact Skyttel outcome. Confirm
   raw audio, credentials and transport metadata are absent.
8. Record the installation/release, date, destination, safe outcome and any
   gaps privately. Do not make a local trace-payload archive.

Opening voice can upload its root and reviewed intent before context
preparation, transcript content or a successful Live call. Preparation can
also produce a linked backend summary trace. A failed preparation can leave
a voice root without a Live-creation attempt. Treat uploading as active as
soon as you enable it.

**If you perform live verification, success means:** each installation
reports accepted delivery, and its permitted
text/voice activity appears only in the matching destination. If the
destination or content is wrong, disable sending before investigating.

Local automated tests establish local composition, consent, controls and
linkage. They do not establish actual cloud display, account limits, hosted
ingress, physical microphone/audio behavior or human accessibility.

## 9. Resolve common setup problems

<!-- markdownlint-disable MD013 -->
| What you see | What to check |
| :-- | :-- |
| `Inte ansluten` | Check that the endpoint, exact destination name and runtime key are configured in the active environment. |
| Disabled after restart | The opt-out is stored in that installation's database. Enable it only when ready. |
| Configuration/export failure | Check all four values, regional API URL, copied destination name and conflicting exported agent variables. |
| Credential suspension / HTTP 401 or 403 | Check key expiration, workspace access and matching region; do not substitute the setup PAT. |
| Quota suspension / HTTP 429 | Check usage and rate limits. Wait for reset or resolve within the free allowance. |
| Accepted delivery but no visible trace | Check workspace, agent/environment or project, time range and trace completeness. One accepted event does not prove the ending arrived. |
| Development appears in production | Disable development sending, correct its destination/key, restart, then verify new activity. Plan cleanup of wrongly routed data. |
| Environment-file edit has no effect | See the development guide's exported-value instructions; Render needs a deployment with the saved environment. |
<!-- markdownlint-enable MD013 -->

After fixing a quota or credential suspension, select **Starta om sändning
efter kontroll**. Ordinary enable or process restart does not clear it.
Only new events are sent: there is no replay or backfill. Health counters
reset on process restart; opt-out and suspension do not.
See [delivery limits and health](langsmith-delivery.md).

## 10. Rotate a key or stop sending

Rotate one installation at a time:

1. Disable sending there and confirm the state.
2. Create a replacement tracing-only key for the same workspace, labelled
   for that installation. Record its expiry.
3. Replace the private development value and restart using the development
   guide, or replace the Render secret and deploy the verified image with
   the new settings.
4. Verify configuration, then enable or recover sending as appropriate.
   Use the state checks in step 8; its live checks are optional.
5. Revoke/delete that installation's old key. If a key leaks, revoke it
   immediately. Keep setup/delete credentials outside both applications.

If tracing disrupts ordinary work, sends excluded data or cannot stay free,
disable sending. This discards buffered events and cancels active delivery
where possible; it cannot recall requests already accepted by LangSmith.
Shutdown has at most two seconds to finish or discard.

For recovery, stop sending, remove diagnostic settings if needed and repair
forward with a compatible image. Older images against upgraded SQLite are
unsupported. Do not delete the database or restore old authentication
authority. Household restoration uses [controlled recovery](database-restore.md).

## 11. Remove an installation's sending and clean up its traces

1. Disable that installation's sending. Remove its four application settings
   from the private development file and exported environment, or from Render
   and linked groups. Restart development or deploy the Render environment.
   Verify `Inte ansluten` if enabled, or the durable disabled state.
2. Revoke its runtime key. Keep the other installation's key, household
   storage and authority intact.
3. Use your LangSmith admin account's read/delete access and the
   worksheet's exact project UUID to identify remaining traces. For Path A,
   this UUID is `tracer_session_id`. Do not use the agent name, destination
   name or a Skyttel conversation ID. Do not bulk-export payloads.
4. Request deletion using the current
   [deletion procedure](https://docs.langchain.com/langsmith/data-purging-compliance).
   Its API accepts `POST /api/v1/runs/delete` with the project UUID in
   `session_id` and up to 1,000 `trace_ids`. Use bounded batches, the matching
   regional endpoint/workspace and the separate cleanup credential.
5. Deletion is asynchronous. Query again after processing, including after
   the documented background deletion window. An accepted request does not
   confirm removal. Record pending cleanup and contact support if permitted
   queries still return content. Revoke temporary cleanup access.

Opt-out does not delete cloud data. Some analytics/billing metadata can
remain; do not promise physical deletion of all metadata within 14 days.

## 12. Assess production usefulness after rollout

This assessment is optional and does not block configuration or activation.
Skip it if you only want to set up tracing.

Use the [diagnosis and assessment procedure](langsmith-assessment.md) for the
production destination: the first ten natural failures in occurrence order
within 14 days, review begun within 48 hours, and at most 30 minutes active
investigation per case. Check proposed causes independently and keep
sanitized records, missing evidence and unresolved cases.

Development checks do not replace those production observations. Day 14,
case ten or an inconclusive finding does not automatically stop sending.
There is no recurring assessment service or automatic shutdown.

## Setup reference

### Create a setup PAT

A personal access token (PAT) lets the setup scripts read workspace and
destination identities using your account's permissions. You can create it
before you know the workspace UUID: the dialog selects a workspace by name.
Reuse an existing setup PAT if it has the necessary access.

1. Open **Settings → API Keys**, then click **+ Create API key** to open the
   **Create an API Key** dialog.
2. In **Description**, enter a recognizable label such as `Management PAT`
   or `Skyttel setup PAT`.
3. Under **Key Type**, select **Personal Access Token**. The **Tracing Only**
   keys used by Skyttel cannot perform these setup lookups.
4. Under **Default Workspace**, select your existing workspace by name,
   for example **Workspace 1**. No workspace UUID is needed in this dialog.
   This sets the default for requests without a workspace header; it does
   not restrict the PAT's permissions to that workspace.
5. Under **Expiration Date**, choose a duration that covers setup, such as
   **30d**, or use **Custom** for a shorter period.
6. Select **Create API Key**. Copy the secret into your password manager
   before closing the dialog; LangSmith displays it only once.
7. Use it at the hidden **Setup PAT** prompt in the lookup scripts below.
   Keep it outside Skyttel's environment files and Render settings, and
   revoke it when the setup work is complete.

Use the same setup PAT for the workspace lookup and subsequent agent or
project setup. The two application runtime keys remain separate tracing-only
keys created in step 4. See
[PAT permissions and creation](https://docs.langchain.com/langsmith/create-account-api-key).

### Look up your workspace ID

Use this when Settings does not display a Workspace ID. First
[create a setup PAT](#create-a-setup-pat), or use your existing setup PAT.
A tracing-only key cannot perform this lookup.

Copy the whole block into a devcontainer terminal, including the final `PY`.
Enter the regional API endpoint from step 2, the ID copied beside
**Organization**, and your setup PAT when prompted. The PAT input is hidden.
This sends one read-only request to list workspaces; it does not create a
workspace, upload traces or invoke a model.

```sh
python3 - <<'PY'
import getpass, json, sys, urllib.error, urllib.request
sys.stdin = open('/dev/tty')
base = input('Regional API endpoint: ').strip().rstrip('/')
if base not in {
    'https://api.smith.langchain.com',
    'https://eu.api.smith.langchain.com',
    'https://apac.api.smith.langchain.com',
    'https://aws.api.smith.langchain.com',
}:
    raise SystemExit('Use an HTTPS API endpoint from the region table in step 2.')
organization = input('Organization ID copied from Settings: ').strip()
token = getpass.getpass('Setup PAT (hidden): ')
request = urllib.request.Request(base + '/api/v1/workspaces', headers={
    'X-API-Key': token, 'X-Organization-Id': organization,
})
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        workspaces = json.load(response)
except urllib.error.HTTPError as error:
    raise SystemExit(f'HTTP {error.code}; check region, organization and PAT.')
if not workspaces:
    raise SystemExit('No visible workspaces; check account access and region.')
for workspace in workspaces:
    print('Workspace:', workspace['display_name'])
    print('SKYTTEL_LANGSMITH_WORKSPACE_ID:', workspace['id'])
PY
```

For the single-workspace personal account, use the returned workspace ID
for both development and production. If several workspaces are listed,
match the intended workspace by name. Return to step 2 and continue setup;
you can reuse this PAT for the destination lookup, then revoke it when done.
The [organization API guide](https://docs.langchain.com/langsmith/manage-organization-by-api)
and [List Workspaces API](https://api.smith.langchain.com/redoc#tag/workspaces/operation/list_workspaces_api_v1_workspaces_get)
document the request. It needs an organization ID, not an already known
workspace ID.

### Look up agent destination values

Use this only for Path A. First create both agent records in step 3.
Reuse the setup PAT from the workspace lookup, or
[create a setup PAT](#create-a-setup-pat) with your account's access to read
the agents. A tracing-only runtime key cannot perform this lookup.

Open a terminal inside the devcontainer. Copy the whole block below, including
the final `PY` line. It uses the installed Python 3; no extra package is
needed. At the prompts, enter the regional API endpoint and workspace UUID
from step 2. The PAT prompt hides what you type or paste. The script reads
destination identities only; it does not upload traces or call a model.

```sh
python3 - <<'PY'
import getpass, json, sys, urllib.error, urllib.request
sys.stdin = open('/dev/tty')
base = input('Regional API endpoint from step 2: ').strip().rstrip('/')
if base not in {
    'https://api.smith.langchain.com',
    'https://eu.api.smith.langchain.com',
    'https://apac.api.smith.langchain.com',
    'https://aws.api.smith.langchain.com',
}:
    raise SystemExit('Use an HTTPS API endpoint from the region table in step 2.')
workspace = input('Workspace UUID from step 2: ').strip()
token = getpass.getpass('Setup PAT (read agents; hidden): ')
for agent, target in [('skyttel-dev', 'DEVELOPMENT'),
                      ('skyttel-prod', 'PRODUCTION')]:
    request = urllib.request.Request(base + '/api/v1/agents/' + agent,
        headers={'x-api-key': token, 'x-tenant-id': workspace})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f'{agent}: HTTP {error.code}; check setup access.')
    environment = next((item for item in result['environments']
                        if item['environment'] == target), None)
    if environment is None:
        raise SystemExit(f'{agent}: {target} environment is missing.')
    print(agent, target)
    print('SKYTTEL_LANGSMITH_PROJECT:', environment['tracer_session_name'])
    print('Project UUID for cleanup:', environment['tracer_session_id'])
PY
```

### Read the agent lookup output

For example, the development part of the script's output might be:

```text
skyttel-dev DEVELOPMENT
SKYTTEL_LANGSMITH_PROJECT: skyttel-dev-development
Project UUID for cleanup: <development-project-uuid>
```

Here, `skyttel-dev-development` is the value of LangSmith's
`tracer_session_name` field. The script labels it with Skyttel's setting
name so you know where to use it. For this output, put the following in
your private development environment file:

```dotenv
SKYTTEL_LANGSMITH_PROJECT=skyttel-dev-development
```

Copy only the value after the colon. Do not include the colon, the output
label or the literal text `tracer_session_name` in the value. Use the value
your own lookup returns; this example is not a naming rule. For production,
use the value after `SKYTTEL_LANGSMITH_PROJECT:` in the separate
`skyttel-prod PRODUCTION` part of the output.

Copy the two different destination values and UUIDs into the worksheet.
Keep the project
UUIDs for cleanup; neither is the workspace UUID. You can revoke the temporary
setup PAT after lookup if it is not needed for other setup work.
If lookup fails, check the region, workspace, exact agent IDs and PAT access.
Do not try the runtime key or guess the destination name.

### Create or read project-based destinations

Use this only for Path B. Reuse your setup PAT, or
[create a setup PAT](#create-a-setup-pat) with permission to read projects
and, when creating them, to create projects. Do not put it in Skyttel.
The pinned SDK uses the regional tracing API's `/sessions` endpoint for
projects. See the [tracing API reference](https://api.smith.langchain.com/redoc).

Copy the whole block into a private devcontainer terminal. For each project,
enter `create` for a new destination or `read` to verify an existing one.
If creation reports HTTP 409, use `read` on the next invocation and verify
the existing project. It does not send traces or invoke model providers.

```sh
python3 - <<'PY'
import getpass, json, sys, urllib.error, urllib.parse, urllib.request
sys.stdin = open('/dev/tty')
base = input('Regional API endpoint from step 2: ').strip().rstrip('/')
if base not in {
    'https://api.smith.langchain.com',
    'https://eu.api.smith.langchain.com',
    'https://apac.api.smith.langchain.com',
    'https://aws.api.smith.langchain.com',
}:
    raise SystemExit('Use an HTTPS API endpoint from the region table in step 2.')
workspace = input('Workspace UUID from step 2: ').strip()
token = getpass.getpass('Setup PAT (read/create projects; hidden): ')
for name in ['skyttel-dev', 'skyttel-prod']:
    action = input(f'{name}: read or create? ').strip()
    if action not in ('read', 'create'):
        raise SystemExit('Use read or create; no request sent for this name.')
    path, data = '/sessions', None
    if action == 'read':
        path += '?' + urllib.parse.urlencode({'name': name})
    else:
        data = json.dumps({'name': name, 'extra': {},
                           'description': None}).encode()
    request = urllib.request.Request(base + path, data=data, headers={
        'x-api-key': token, 'x-tenant-id': workspace,
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f'{name}: HTTP {error.code}; check name/access.')
    project = (next((item for item in result if item['name'] == name), None)
               if action == 'read' else result)
    if project is None:
        raise SystemExit(f'{name}: no matching project; check workspace.')
    print('SKYTTEL_LANGSMITH_PROJECT:', project['name'])
    print('Project UUID for cleanup:', project['id'])
PY
```

Record both names and UUIDs, revoke temporary setup access when no longer
needed, and return to step 4.

Primary service documentation is checked on 2026-10-28. Verify actual account
conditions and UI labels during setup; local checks do not verify your account.
