# LangSmith production setup checklist

Use this checklist when configuring production Skyttel to send to
`skyttel-prod`. The [setup guide](langsmith-rollout.md) contains the full
configuration walkthrough.

Each item states when to do it, how to verify it and the consequence of
skipping it. **MUST** items address the specific risk described; complete
them at the stated stage. **OPTIONAL** items can be skipped without blocking
setup. A check already completed during setup does not need repeating unless
its configuration changes. Keep results privately, without keys or payloads.

With valid configuration and no saved opt-out or suspension, sending starts
when the application starts. Complete the first five checks before applying
the production environment settings. Complete check 6 after deployment.
Checks 7–9 are optional; check 7 must be chosen before applying configuration
if you want to delay sending.

## Before production sending starts

### 1. MUST: confirm the account meets the free-only setup

- [ ] The selected organization is on the free Developer plan without a card,
      and has trace capacity remaining.

**When:** Before the first upload, and when changing the account or plan.
**If skipped:** A card or paid plan can allow charges. Exhausted capacity can
reject uploads and suspend Skyttel's sending.

1. In LangSmith Settings, check that the organization selector shows your
   intended **Personal** organization.
2. Under **Billing**, open **Plans and Pricing**. Check the plan and payment
   information: this setup uses Developer with no payment method. In other
   layouts these controls are under **Billing and Usage**.
3. Open **Usage graph** under Billing. Compare the current billing period's
   trace consumption with the account's allowance. Count development and
   production together; they share it.
4. If the plan, payment status or remaining capacity does not match, leave
   sending off while resolving it. Do not add a card to bypass a limit.

**Pass:** The account meets the free setup and has trace capacity remaining.
See [billing](https://docs.langchain.com/langsmith/billing) and
[usage views](https://docs.langchain.com/langsmith/view-usage).

### 2. MUST: verify production routing and its runtime key

- [ ] The production settings match the production destination and use its
      tracing-only key.

**When:** Before saving settings that the next deployment will load.
**If skipped:** Household content can go to the development or wrong
workspace, invalid settings can prevent delivery, or a setup PAT can expose
unnecessary account permissions to the application.

1. Open your destination worksheet from
   [step 3](langsmith-rollout.md#record-the-two-destinations).
2. Open the production Render service's **Environment** page. Compare
   `SKYTTEL_LANGSMITH_ENDPOINT` and `SKYTTEL_LANGSMITH_WORKSPACE_ID` with
   the worksheet's region and workspace UUID.
3. Compare `SKYTTEL_LANGSMITH_PROJECT` with the value printed after
   `SKYTTEL_LANGSMITH_PROJECT:` under `skyttel-prod PRODUCTION` by the
   [agent lookup](langsmith-rollout.md#look-up-agent-destination-values).
   For a classic project-based workspace, use `skyttel-prod`.
4. In LangSmith **Settings → API Keys**, select **Tracing** and find the
   production key. Check its workspace and expiration. Use its secret saved
   in your password manager for `SKYTTEL_LANGSMITH_API_KEY`; do not use the
   setup PAT or development key.
5. Check linked Render environment groups for conflicting values. Compare
   the final four values with the worksheet before deploying.

**Pass:** Every value points to the intended production destination and the
runtime key is valid. A project UUID, organization ID or literal
`tracer_session_name` is not a substitute for the destination value.

### 3. MUST: verify retention before uploading household content

- [ ] The production destination uses Base retention without retention
      upgrades or automation.

**When:** Before the first production trace.
**If skipped:** Trace content can be retained longer than intended. Changing
the default afterward does not shorten the retention of existing traces.

1. In LangSmith, select **skyttel-prod**, open **Tracing**, and select its
   **Production** environment. In a classic workspace, open the
   **skyttel-prod** tracing project.
2. Open **Retention** and check that **Base**, with a 14-day period, is
   selected. If not, select Base before sending.
3. For a new destination, leave evaluators, automation and retention upgrades
   unconfigured. If reusing a destination with existing rules or evaluators,
   inspect those settings and disable them before this rollout.
4. Keep trace content out of datasets and bulk exports; those copies have
   separate lifetimes.

**Pass:** The selected destination has the intended policy for new traces.
Base retention does not promise removal of every analytics/billing metadata
record. See [retention settings](https://docs.langchain.com/langsmith/billing#change-project-level-default-retention)
and [retention upgrades](https://docs.langchain.com/langsmith/usage-and-billing#data-retention-auto-upgrades).

### 4. MUST: have access to stop sending and request cleanup

- [ ] The operator can open Skyttel's sending control and retains LangSmith
      admin access.

**When:** Before uploading production content.
**If skipped:** You may be unable to stop further uploads promptly or request
removal of content sent to LangSmith.

1. Sign in to production Skyttel as installationsansvarig. Open
   **Inställningar → Drift → Diagnostik med LangSmith** and confirm the
   sending state and control are visible. This check does not require
   toggling the control.
2. Sign in to the intended LangSmith Personal organization. On the Developer
   plan, your login has organization and workspace admin access. For a shared
   organization, have its administrator confirm your Workspace Admin role.
3. Confirm that you can access that login's recovery method and your password
   manager entry for it. A setup PAT may expire; the admin login lets you
   create a replacement for cleanup.
4. Keep the production project UUID from the destination worksheet. Identify
   the [cleanup procedure](langsmith-rollout.md#11-remove-an-installations-sending-and-clean-up-its-traces)
   you will use if needed. No deletion request or extra PAT is required now.

**Pass:** You can reach the stop control and have admin access for later
cleanup. This verifies access, not a completed deletion. Deletion is a
separate, asynchronous operation; disabling sending does not remove cloud
data. See [admin roles](https://docs.langchain.com/langsmith/set-up-hierarchy#organization-roles)
and [trace permissions](https://docs.langchain.com/langsmith/organization-workspace-operations#runs).

### 5. MUST: explain the change to users

- [ ] Users know what LangSmith will receive and why, and finish their old
      conversations before configuration.

**When:** Before configuration starts sending, or before manual activation.
**If skipped:** Users may be surprised that exact household content is sent
to another service. Conversations created under older information remain
ineligible for tracing, so continuing them also leaves diagnostic gaps.

1. Give assistant users the
   [suggested message in step 5](langsmith-rollout.md#required-prepare-users-before-sending).
   It explains that LangSmith helps investigate assistant problems and can
   receive their actual conversation text and household information.
2. Have users finish active conversations and save their work. Pause new
   conversations while applying the configuration.
3. Tell users to start new conversations after configuration and read and
   accept the information if Skyttel prompts them. Skyttel handles individual
   consent; no separate consent form or operator approval step is needed.

**Pass before activation:** Users are informed, old conversations are ended,
and users know how to resume. New conversations use the current information
when work resumes.

## After applying the production configuration

### 6. MUST: check application access and the sending state

- [ ] Skyttel still opens the expected household, and its sending state
      matches the activation choice.

**When:** Immediately after deployment, before users resume normal work.
**If skipped:** A failed deployment or wrong database configuration can go
unnoticed. Tracing may be active when you intended to wait, or remain off
when you expect diagnostics.

1. Open production Skyttel, sign in and confirm the expected household data
   is present. If login fails or data is unexpected, stop and investigate
   the deployment; do not reset the database.
2. Open **Inställningar → Drift → Diagnostik med LangSmith**, then select
   **Uppdatera leveransstatus**.
3. For automatic activation, expect **Sändning aktiverad**. If you chose the
   optional wait in check 7, expect **Sändning avstängd** until you activate.
4. If it shows **Inte ansluten**, recheck the four environment values and
   that deployment loaded them. If it shows **Sändning spärrad**, resolve the
   displayed cause using [troubleshooting](langsmith-rollout.md#9-resolve-common-setup-problems).
   A restart does not clear a saved opt-out or suspension.
5. If sending is active when it should be off, select **Stäng av sändning**.
   If it is disabled and you are ready, select **Aktivera sändning**.

**Pass:** Application access works and the sending state matches your choice.
An enabled state alone does not prove cloud delivery. With no new activity,
**Ingen registrerad leverans sedan start** is expected.

## Optional checks

### 7. OPTIONAL: delay activation until after configuration

- [ ] Sending stays disabled through configuration and deployment.

**When:** Before applying settings, only if you want a manual activation.
**If skipped:** Valid configuration enables sending on startup unless a
saved opt-out or suspension prevents it. Skipping is fine if that is your
intention and the required checks above are complete.

1. In Skyttel, open **Inställningar → Drift → Diagnostik med LangSmith**.
2. Select **Stäng av sändning** if available. Confirm **Sändning avstängd**.
3. Apply the production settings and deploy with the same database.
4. Verify the disabled state using check 6. When ready to start sending,
   select **Aktivera sändning**.

**Pass:** Uploads wait for your manual activation. If you skip this option,
no disabling or extra deployment is required.

### 8. OPTIONAL: verify a trace in LangSmith

- [ ] A permitted text request appears in the intended production destination.

**When:** After sending is enabled, if you want to confirm cloud delivery.
**If skipped:** Tracing is not disabled, but actual delivery and display
remain unverified. No synthetic request is required just to enable
tracing. Text and voice checks can incur model-provider charges.

1. Decide whether to incur model-provider charges for a test request, and
   choose content you are willing to send. Start a new Skyttel conversation
   and accept current information if prompted.
2. Send a short request using invented content, or inspect the next permitted
   real request instead of creating extra activity. Note its time.
3. In Skyttel's LangSmith settings, select **Uppdatera leveransstatus**.
   Look for a recent **Senaste lyckade leverans** and inspect
   **Förlorade händelser sedan start** and **Senaste felkategori**.
4. In LangSmith, select **skyttel-prod → Tracing → Production**, or the
   classic **skyttel-prod** project. Set the time range to include the request.
5. Open its trace and compare the request and outcome with Skyttel. Check
   that the same trace is not in the development destination. Inspect its
   model/tool children and `extra.metadata.status`.
6. If you also want to check voice, repeat with a new voice
   session and inspect its separate root and links to backend work. Voice
   can upload a root as soon as the session opens.
7. If content goes to the wrong destination or includes credentials or raw
   audio, disable sending and use the cleanup procedure. If delivery fails,
   follow the troubleshooting guide before relying on these diagnostics.

**Pass:** The checked activity is visible only in the intended destination.
A successful text check does not verify voice, and one accepted delivery
does not establish complete trace history.

### 9. OPTIONAL: assess diagnostic usefulness

- [ ] A separate assessment is planned if the operator wants to measure value.

**When:** After setup, only if choosing to evaluate usefulness.
**If skipped:** Tracing continues normally; you simply have no structured
assessment of whether it helps diagnose failures.

1. Decide whether to run the
   [diagnostic assessment](langsmith-assessment.md).
2. If yes, designate a private or sanitized record and the assessment's start
   date. Keep household content and trace payloads out of shared records.
3. Follow that procedure's first-ten-failures and 14-day sampling rules.
   Record its findings separately from this configuration checklist.

**Pass:** Either the assessment is explicitly skipped or it has an owner,
record and start date. Its end does not automatically disable sending.
