# Operate the installation cost view

Use **Månadskostnad** at `/costs` to inspect the whole installation's
estimated monthly cost. The view separates a full-month Render assumption,
measured Live voice usage, and measured Terra model usage. The total is an
estimate in USD and SEK. About 200 SEK per month is a planning guideline;
Skyttel does not stop work when an estimate reaches that amount.

## Configure and verify operator access

Cost access uses the existing `SKYTTEL_FIRST_ADMIN_PROVIDER` and
`SKYTTEL_FIRST_ADMIN_SUBJECT` settings. Sign in as the verified provider
account designated by those settings, or through another login explicitly
linked to the same Skyttel user. Follow the
[production identity setup](authentication.md#5-identify-the-first-administrator-on-the-running-service)
when identifying that account. A name or email address does not grant access.

The server checks this identity for every cost request. Household membership
and administrator roles do not grant installation cost access. The configured
operator can still open `/costs` without current household membership. Changing
the configured identity and deploying the settings transfers cost access; it
does not transfer a household or its administrator role. Verify the intended
account before changing these settings.

No new provider credential is required for the view. Existing
`OPENAI_API_KEY` configuration enables the built-in assistants whose attempts
are measured. Opening or refreshing costs makes no paid AI request and does
not connect to provider billing accounts. MCP clients and assistant tools do
not receive installation cost access.

## Set the monthly assumptions

Choose **Månad (UTC)** and read **Prisunderlag**. Select
**Ändra månadens antaganden**, enter the actual assumptions for this
installation, and choose **Spara månadens antaganden**. See the
[cost view guide](../user-guide/costs.md) for the screen controls.

The initial assumptions are examples, not detected deployment settings:

| Assumption | Initial value |
| :-- | :-- |
| Render service | One paid 512 MB service, USD 7 per full month |
| Allocated persistent disk | 1 GB at USD 0.25 per GB per full month |
| Workspace | Hobby, USD 0 allocated to this installation |
| Currency conversion | 10 SEK per USD, an operator assumption |

With these values the Render baseline is USD 7.25, or SEK 72.50, for a
whole month. The calculation is service cost plus allocated disk capacity
times disk price plus the workspace cost assigned to this installation.
Disk capacity means the provisioned GB, not the current database size.
Set the workspace plan and its assigned cost explicitly; Skyttel does not
determine a shared workspace's allocation. Changing a plan label does not
retrieve its price.

Review the [Render price list](https://render.com/pricing) and your actual
service configuration when setting these values. Skyttel does not fetch
current prices or exchange rates. Enter the SEK per USD assumption yourself.
Values must be finite and nonnegative, and SEK per USD must be positive.
The Render baseline covers a whole month even when the service runs for
only part of it. It does not calculate the provider's partial-month charges.

The first measurement or operator view for a month captures the initial
assumptions as a dated revision. This automatic capture does not mean an
operator has approved them or that Skyttel detected the deployment settings.
Later application defaults do not change that month's captured values.
Each explicit save adds a dated revision for the selected month and preserves earlier
revisions. It changes that month's Render estimate and SEK conversion,
including the conversion of already recorded AI usage. Other months retain
their own assumptions. If another operator session saves first, refresh the
view, inspect the current values, and enter the intended revision again.

## Understand the model estimates

Each provider attempt keeps the model price assumptions present at its
start. Later model price changes do not change that attempt's USD estimate.
**Prisunderlag** shows the applicable price versions, dates and sources.
An attempt belongs to the UTC month in which it starts, including a voice
session that ends in the following month. Repeated updates replace the
same attempt's measurements; a new provider attempt is counted separately.

The included price assumptions dated 2026-09-25 are:

| Model or category | USD assumption |
| :-- | :-- |
| `gpt-live-1` | 0.05 per minute, calculated per second |
| Terra ordinary input | 2.00 per million tokens |
| Terra cache read | 0.20 per million tokens |
| Terra cache write | 2.50 per million tokens |
| Terra output, including reasoning | 12.00 per million tokens |

For a `gpt-5.6-terra` request with more than 272,000 input tokens, the
corresponding prices are USD 4.00, 0.40, 5.00 and 18.00 for the whole
request. Cache reads and writes replace the ordinary input price for those
tokens. Reasoning tokens are part of output and are not charged a second
time in the estimate. These assumptions use Standard pricing; other
reported models or service tiers can remain unpriced. A missing effective
service tier is shown as an assumed Standard tier. If the effective model
is missing, the view explicitly identifies the requested Terra model as
the pricing assumption.

Live time includes the active session, including silence and waiting for
backend work. Provider-reported seconds appear separately from estimated
billable seconds. The estimate assumes at least 15 seconds for a session
with known duration, with the initial credit included in that duration.
For example, 90 reported seconds gives USD 0.075, without an additional
15-second charge. The provider's treatment of a short or interrupted session
and refunds can differ. Missing duration remains unknown. Terra requests
made during a voice session appear in the Terra category as well.

The estimate excludes taxes, credits, negotiated or promotional prices,
regional or other service-tier adjustments, Render traffic, build and domain
overages, other services and instances, and external ChatGPT or Codex
subscriptions or usage outside the built-in assistants. Check provider
billing separately for the amount payable.

## Handle incomplete or stale measurements

Recording starts with this feature's database upgrade. The view gives that
start time and marks earlier periods as incomplete. Earlier usage cannot
be reconstructed from the household map. An empty measured subtotal does
not establish zero usage before recording starts.

Attempts are recorded before billable provider dispatch. If that initial
record cannot be saved, the assistant cannot start that provider request.
A connection loss, missing final usage, interrupted attempt or recording
failure can leave the last known values provisional. An unfinished attempt
remains unfinished across a normal restart. Missing values and unsupported
prices stay visible as unknown or unpriced; they are never confirmed as
zero. Missing reasoning detail can leave a measurement incomplete even when
the known output total can be priced.

Use **Uppdatera underlaget** after checking the connection and service health.
A refresh failure leaves previously known values visible with an error;
check the last refresh time before using them. Loss of authorization clears
the protected view. If recording is unavailable, check the persistent disk,
free space and application logs using the
[storage failure guidance](installation.md#startup-failures-and-storage).
The recording warning remains for the current server process after a write
failure, even if later recording succeeds. After fixing storage, a normal
restart clears that process warning; it does not repair missing final
measurements. Do not delete measurements to clear the warning. A recording
failure after a completed map save does not undo that save; check its saved
result before retrying map work.

## Upgrade, retain and recover the measurements

Use the existing installation upgrade and recovery procedure; this feature
adds no backup system or requirement to copy a live database.
Deploy the upgraded application on the existing persistent disk;
startup applies the additive database changes. Check `/healthz`, database
readiness at `/api/version`, and fresh operator sign-in. Open the cost view,
review its recording start time, and save the intended monthly assumptions.
Confirm that an ordinary household administrator cannot read the view.

Cost measurements and assumption revisions belong to the installation.
They contain technical counts, timestamps, outcomes and price assumptions,
without household or user identifiers, map text, prompts, transcripts,
audio, credentials or raw provider errors. Household export, import,
replacement and permanent erasure neither transfer nor clear this ledger.
Household import into the same installation keeps its existing ledger.

After disk loss, restoring a household archive into a fresh installation
does not recover cost history or monthly assumptions. The destination starts
its own recording coverage and marks the missing earlier period as unknown.
Keep provider billing evidence separately when historical reconciliation is
required. A whole-disk recovery can retain only the measurements present in
that recovered copy; usage after its snapshot remains outside that copy.

An older application image does not reverse the database changes. Use a
compatible image with the upgraded database, or recover a matching database
and application pair during an attended outage. Keep any later copy before
recovery to avoid losing its measurements. Follow the
[deployment recovery guidance](render.md#recover-with-older-code-only-when-compatible)
if the upgrade does not become ready.
