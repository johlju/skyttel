# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Skyttel. For routine deployment steps, use the
[installation guide](installation.md) and [deployment runbook](render.md).

## Unreleased

### One-time household content reset

On first startup, this release automatically upgrades the production
installation in the same database. It permanently clears existing objects,
relationships, images, drafts, history, saved operation contents and obsolete
type fields. The installation, household, user access, compatible type names
and settings remain. Inform users before merging and pause map work until
deployment verification is complete. No special deployment setting, manual
deletion, new database, backup or login upgrade is required.

The direct upgrade also supports preview 0.2.0-preview.46, before personal
map backgrounds. No intermediate deployment is required. If the earlier
upgrade stops with `unsupported_database_format`, deploy the corrected
release against the same disk and configuration. Do not edit database
format markers or delete the database to bypass this check. Other validation
failures still require investigation.

Keep the existing persistent disk, database path, authentication secret and
installation authority. The transition validates the source and commits the
content reset and schema upgrade together. After deployment, verify health,
the release identity, existing users' access to the same empty household and
retained settings. Newly saved content must survive restarts and later
releases: the completed migration never repeats the reset.

This transition is forward only. If verification fails, diagnose the failure
and repair forward while preserving any new household work. Do not combine
this transition with a database restore.

### Personal map backgrounds

New household exports preserve each personal view's background choices and
motion settings. Import keeps current access. In a new installation,
explicitly assign historical personal content to verified members before
they use it. New personal views use enabled backgrounds.

### New image security alerts after closure

When the image security monitor finds a blocked or unknown status with no
open alert, it creates a new alert. Closed alerts stay unchanged. Closing
an alert does not suppress later alerts while the status remains blocked
or unknown.

After rollout, verify that the configured recipient receives assignments
and mentions on new alerts. Follow the
[notification delivery check](security-monitoring.md#configure-the-recipient-and-verify-delivery).
Do not rely on a subscription to a closed alert for future notifications.

### Browser storage consent and policy contact

Before rollout, select the installation's public policy email address.
After upgrade, the installation operator must save it under Policykontakt
in the Drift settings group. The development demo address is not a
production default. A missing address leaves normal use available and
shows a request to contact the person responsible for the installation.

Existing remembered logins have no browser storage consent. On the next
visit, verify that Skyttel disables remembered login safely and offers a
new storage choice. Ordinary access can continue only after confirmation
and within its existing limits. Permission alone must not activate
remembered login. Explicit activation after login must keep the original
authentication time and seven-day limit.

Verify activation, withdrawal and reset through the production HTTPS
ingress, including lost replies and result checks after a new login.
Keep unresolved action references. Reset must preserve household data,
account settings and suppressed login offers. Activation results use
the 24-hour recovery window; this is not a general consent history.

### Development configuration examples

The environment examples include a shared development installation
generation. Before using an example for QA, staging, production or another
non-development installation, replace it with a unique privately managed
generation. Operators must enforce this restriction; the service does not
reject the development value. Preserve an existing installation's generation
across ordinary restarts.

### Controlled login transition and roll forward

The production installation does not need another login upgrade.

For login maintenance, close public access and
stop application processes. Use an independently stored installation
generation and the controlled maintenance procedure. Affected devices must
sign in again and make a new remembered-login choice. Stored household work
and save results remain; AI work does not resume.

Use a corrected newer version if verification fails. Do not return to an
older application or restore old login authority. A data restoration is a
separate controlled operation with its own erasure review. Keep delivery
blocked until required provider, HTTPS, accessibility and backup evidence
is available.

### Ordinary login inactivity

Verify that ordinary logins end after thirty minutes without meaningful
user actions, including after remembered login is turned off. Background
requests and a silent microphone must not keep a login active. Check the
warning before expiry and the exact access boundary with text and voice.
Remembered logins retain their seven-day absolute limit without a separate
inactivity limit. Activity never extends an absolute login limit.

Accepted work and finite delivery pause inactivity within the original
task deadline. A service restart ends that work without replay. Verify
that restart or a delayed completion cannot renew the inactivity period
beyond its original bounded work deadline. Stored drafts and save
receipts must remain available after a new login.

### Authentication data cleanup

Keep the upgraded service running so that startup and background cleanup
can remove ended login records and expired attempts without browser
traffic. Verify removal from the live database across restart, the
24-hour action-result window and rejection of old cookies and callbacks.
Investigate cleanup failures. Accepted text work must keep its original
bounded stop link until its deadline. Household content and save receipts
must remain available.

Database cleanup does not prove deletion from backups or snapshots.
Restrict recovery copies and verify their actual deletion separately;
the maximum is thirty days from original copying. Record missing host
evidence before claiming these periods as actual production behavior.

### Installation restore barrier

Before upgrade, configure a unique authority generation in private host
settings outside the database and restored volume. Missing configuration
stops startup. Keep it stable for normal restart. Before every complete
database or disk restore, keep the service closed, change this generation
and record a fixed restore declaration with trusted permanent-erasure
clearance. Follow the controlled restore procedure before reopening.

Old browser and assistant access must be invalid before readiness. Preserve
the independent declaration across restart and recopy. Verify old cookies,
pending callbacks, authorization codes, refresh tokens and JWTs through
the production ingress. Actual copy inventories, restricted access and
physical deletion within thirty days still require operator evidence.

### Accepted text work at login expiry

Verify that an accepted text instruction can finish after normal login
expiry, within thirty minutes of receipt including queue time. New
instructions and save requests must require a valid login. Logout, consent
revocation and access removal must stop further work. After a restart,
check the existing draft and save results; model work does not resume.
Do not report a completed server response as confirmed browser delivery.

### Browser login after upgrade

Sessions from before the upgrade no longer grant application access. Tell
users to sign in again. Before rollout, confirm that supported browsers
allow necessary cookies and provide Web Locks. Users must open Skyttel
directly at its configured HTTPS address.

After upgrade, verify Google and Microsoft sign-in through the production
HTTPS ingress in the supported browsers. Check that the ingress preserves
the configured public host and that users regain household access.

Verify overlapping sign-in, account linking and logout through the ingress.
One successful sign-in must replace the previous login in the same browser
binding. Logout must stop pending sign-in and linking callbacks in that
binding. Other browser bindings and separately approved assistant
connections must keep their access. A delayed cookie response can require
another sign-in; it must not restore an ended login.

Verify both ordinary and remembered sign-in through the HTTPS ingress.
Ordinary sign-in must use session cookies and end within eight hours.
Remembered sign-in needs a new active choice and must end within seven days.
Reads and restart must not extend either deadline. Check that the auth
cookie has HttpOnly, Secure and SameSite=Lax, and that both persistent
cookies expire by the original deadline. Verify the confirmation failure
message when the browser does not accept the login cookie. Browser session
restore and real provider compatibility still need production verification.

Verify turning off remembered sign-in through the production ingress.
The old key and pending sign-in and linking attempts must lose authority
immediately. The replacement login must use session cookies and keep the
earlier deadline or eight hours from the change, whichever comes first.
A delayed old cookie can require a new sign-in; it must not restore access.
Check the separate messages for a saved change, confirmed continued
sign-in and a lost response. Action results remain available only to
their owner for 24 hours. Include these records in restricted database
backup handling; they stay outside household files.

Session choice records are part of the installation database and its
restricted backups. They stay outside full household files.

### Account theme and household files

Account theme choices stay outside household
files and remain unchanged when household content is imported. Use the
database backup to recover account choices with the installation.

### Voice session expiry

After upgrade, verify that an active voice connection stops at the server
login deadline through the production HTTPS ingress, including when the
browser sends no status requests. Verify logout, consent withdrawal and
removed household access with a live connection. An interrupted voice
instruction needs a new login and the complete instruction again; it must
not restart automatically. Confirm that stored drafts and save receipts
remain available after login and restart.

### Complete conversation text delivery

Before rollout, verify WebSocket upgrades through the HTTPS ingress and
the supported browsers. A connection opened during a valid login can
deliver an already accepted text task after normal login expiry, within
its original thirty-minute limit. It must not allow household reads,
new instructions or a new connection after expiry. Verify that logout,
consent withdrawal and access removal end outstanding deliveries.

Check the complete text fallback and its audio notice with keyboard and
screen reader users. Receipt confirms that the complete text reaches
the browser; it does not confirm audio playback, reading or understanding.
A lost connection, missing receipt or restart ends delivery without
automatic replay. Check existing drafts and save results after login;
temporary conversation text does not become stored conversation history.

### Conversation model

The application uses GPT-6.1 Sol with high reasoning effort for text,
voice backend work and conversation summaries. Before rollout, confirm that
the configured OpenAI project permits this model. Monitor response times and
spending after rollout. GPT-Live 1 continues to handle speech.

New text model usage uses Sol prices. Earlier measurements keep their saved
prices. The cost page combines text model usage and shows the model for each
price table. The model change does not replace provider credentials.

### Private type restoration

Full household files can contain private proposals to restore removed type
definitions. Keep restricted database recovery copies; recovery requires
the current or a corrected newer application.

Import retains these proposals but requires a new explicit review against
current content before saving. Import does not transfer earlier restoration
authority. Shared history contains saved definitions without the private
authority. After an operator imports household content, tell affected users to
review these retained proposals before they save their drafts.

### Relationship form recovery

The upgraded database retains private evidence of complete relationship form
attempts so a lost response can be checked before retrying. Keep the database
under the installation's recovery controls. Repair application failures
with a corrected newer version. This evidence is scoped
to its household and owner; recovery reads current content alongside the earlier
outcome and does not restore an earlier draft over later work.

Full household files omit this temporary recovery evidence.
Import, content replacement, permanent erasure and owner removal invalidate
the corresponding evidence. After those operations, preserve unsent text and
review current content before starting another attempt.

### Assistant tool removal

Refresh connected assistants' tool catalogs after rollout. Historical undo
and object merge actions are removed from the web interface and assistant
tools. Update external clients that call those actions before upgrade.
History remains available for reading. Ordinary drafts and atomic saves
continue to use durable save receipts.

Object merge proposals are not part of the supported model.
Reading supported saved history does not restore those actions.

### Database operation and rollout

Preserve the persistent database and installation authority across normal
restarts.
Repair application failures with a corrected newer application. A separate
controlled data restoration must
invalidate old authority and review permanent erasure before reopening.
Changes after the backup will not be present after restoration.

Ask users to preserve unsent text and reload open browser sessions after
rollout. Outdated sessions cannot submit changes. After an interrupted save,
check its durable result before retrying; a missing response does not establish
failure. A retry must use the same operation and content. Imported content or
a change to historical owner assignments invalidates older attempts.

Backups now retain private drafts, personal views, image versions, save
attempts,
historical names, free properties and removed content. Apply household access
and retention restrictions to these records and their recovery copies. Ordinary
removal does not permanently erase retained information. Follow the
[permanent erasure runbook](permanent-erasure.md) for that operation.

### Complete object forms and recovery

Household archives can contain a private identifier for each complete
object-form addition to a draft. Shared history contains saved values and
save attribution; it
does not contain private form-attempt identifiers.

### Object icons in household archives

This release stores each object's selected icon with its other content.
Objects without a selection use their type's default icon. Full household
archives preserve the selected icons. Use the controlled database recovery
procedure above
for controlled recovery with the current or a corrected newer application;
changing the image alone does not remove icon storage.

Refresh connected assistants' tool catalogs after rollout. Older clients
that omit the icon field retain the current selection. An explicit reset
uses a null value. Icons are bundled locally and need no external service.

### Free properties and assistant compatibility

Refresh connected assistants' tool catalogs and update external clients
before use. Objects and relationships carry their own ordered properties
with stable identities. Repeated labels and empty values are valid.
Clients must preserve identities, order and value types. Type definitions
retain names, explanations and relationship directions; type fields,
sections, hidden fields and fixed financial values are not supported.

Every current relationship needs two existing objects in the same household.
An incomplete request needs clarification before a relationship is created.
Status is an explicit choice; property labels and dates do not change it.
Retained drafts can contain blocked proposals that prevent the whole save.
Clients must show these proposals for correction and preserve the user's
other work. Refresh the current review after changed deletion consequences
and obtain a new whole-draft save instruction.

New full archives preserve these properties, blocked and suppressed drafts,
receipts and history. Import validates the archive before replacement and
keeps current access. Historical provenance does not restore earlier save
authority. Keep archives and database recovery copies under the same access
and retention controls as other household content.

### Installation cost measurements

Cost recording starts at upgrade; earlier usage remains unknown. The configured
first-administrator identity controls installation cost access, independently
of household roles. Verify that identity and set the actual hosting and currency
assumptions using the [cost operations guide](costs.md). Initial values are
illustrative. The estimate applies no spending stop.

Cost measurements remain separate from household content. Household export,
import and permanent erasure do not transfer or clear them. A household archive
cannot restore cost history after disk loss. Preserve installation recovery
copies when that history is required; this upgrade adds no automatic backup.

### Built-in text and voice assistants

Assistant responses and conversation summaries use the provider's output
limit unless a lower limit is configured. A higher limit can increase the
cost and duration of an individual request. After rollout, monitor actual
token use, incomplete responses and response times before you set a lower
limit. Output use includes internal reasoning as well as visible text.

Accepted text work has a thirty-minute bound from receipt, including queue
time and delivery. Active voice work ends at the login deadline. After
rollout, monitor response times and active work. Use the stop control when
work must end.

Personal conversation choices remain in the installation database and apply
to the user's households. Household export and import do not transfer or
restore these choices. Include them in installation backups if they must
survive disk replacement. Follow the controlled database recovery
procedure above for controlled data recovery with the current or a newer
application. Older application versions are unsupported.

To enable the optional assistants, configure the AI provider key in the server's
private environment and restart. Keep the key out of browser settings, public
build variables and logs. Without it, ordinary map editing remains available.
Voice uses the same provider setup and requires a secure browser origin,
provider server connections and browser media traffic. Follow the
[assistant setup guide](installation.md#enable-the-built-in-assistants).

A broken voice connection stops associated work but does not undo a completed
save. Use the [assistant recovery guidance](installation.md#recover-assistant-access)
before retrying uncertain work. Final voice usage can be unavailable after a
connection loss; retain that uncertainty in cost records.

### Interrupted save recovery

After contact returns, the application checks an uncertain save before it
accepts new conversation work. An already registered save can finish with its
original operation and content, even after conversation consent is revoked.
Do not create a new save attempt to replace a missing reply. If the automatic
check fails, restore household access and storage availability, then use the
check action. Retain the original operation and its durable result.

### Conversation consent

This release stores a saved conversation consent for each Skyttel user and
household, with its date and the version of the consent text. Use the database
backup procedure above for controlled data recovery; changing the image
alone does not remove this storage. Backups and recovery copies retain these
consent records. Apply household access and retention restrictions to them.

A saved consent is not household content. A full household archive does not
contain it, and import does not transfer or change it. After a move to
another installation, each user gives consent again. When a user loses access
to a household, that user's saved consent is removed.

After rollout, each user must give consent
before the first text or voice conversation, and can save it for the
household.

This release changes the consent text. A saved consent for the previous text
does not apply. Verify that users must approve the new text before text or
voice work can start. Speech recorded during a long press can wait in the
browser and go to the voice service after the user releases the button.
Release stops new recording immediately.

A user can revoke the consent in Settings. The revocation removes the saved
consent and ends that user's conversations in the household. A restored
database backup can contain earlier consent records. A controlled restore
must invalidate old authentication and assistant authority before reopening.
Retained household conversation choices do not reactivate old connections
or permit automatic model work.

### Household export, replacement and recovery

Verify that only current administrators can prepare and download a full
household archive after rollout. Archives include every user's private drafts,
personal views, history and retained images. Restrict access to downloaded
archives. Archive readers must support ZIP64 when needed.
No automatic backup is added; keep usable recovery copies
outside the running disk.

Allow free persistent disk space for an export snapshot and its ZIP archive,
or an uploaded archive and its extracted parts, in addition to the database
and active journal. Import accepts supported full archives up to about 1.1 GB,
with a 32 MiB content part and a 1 GiB image part. Only one export preparation
runs at a time. Temporary export copies expire after ten minutes; interrupted
export and import preparations are removed at startup. Check storage and
cleanup failures before retrying. A failed export is not a recovery copy.

A committed replacement stays committed after restart. If cleanup fails,
content remains unavailable until cleanup completes. Check the durable import
status before retrying or restoring a backup. Existing access is preserved;
imported identities do not create logins. For recovery on a fresh installation,
use the [recovery runbook](recovery.md) to establish fresh authentication and
verified private-content ownership. Keep only one writable installation after
cutover. Historical save attempts cannot authorize retries at the destination.

A current administrator can find a confirmed import from another browser,
including after restart or loss of the original administrator's role. Compare
the attempt ID and finish cleanup through that attempt; cleanup does not repeat
the replacement. An unconfirmed review remains available only to its uploader
for ten minutes and does not survive restart. Review the archive again when
that temporary preparation is no longer available.

Cancellation of an unconfirmed review removes its temporary files. If removal
fails, that review cannot replace content. Its uploader can follow the same
attempt and retry cleanup while household content remains available. Resolve
storage permissions before retrying. This cleanup is separate from cleanup
after a committed replacement, which keeps household content unavailable.

### Permanent household erasure

Allow free persistent disk space for database reconstruction and normal journal
use. A pending erasure can block content access across the whole installation
while a database reader or storage error delays cleanup. Keep the recorded
operation and resume it from **Inställningar → Permanent radering**. Follow the
[pending erasure runbook](permanent-erasure.md) after an interruption.
Old content generations cannot submit edits or retry saves after an erasure.

Keep the recorded operation identifier after a lost reply. Status checks in
the original browser tab follow that operation after navigation or reload;
a newer result does not resolve an earlier attempt. A new browser tab can show
the latest operation instead. Compare identifiers and keep an unavailable
attempt unresolved until its own status can be read. Do not start another
erasure merely because the previous response is missing.

Downloaded exports and provider snapshots remain separate recovery copies.
Import or restoration of an older copy can restore erased information. Apply
the household's retention decision to those copies; do not use an older backup
merely to clear a pending erasure. Recovery and erasure procedures must cover
retained personal views, merge records, original and copied image versions,
and private proposals as well as current content.

### Private profile images

Rebuild the complete application image so the native image processor matches
the deployment architecture. Verify image upload, private access and restart
recovery after rollout. Monitor persistent disk use: the database now retains
encoded images and historical versions.

Permit uploads up to 10 MB at the ingress for the image upload route. Keep
smaller limits for ordinary API requests.

### Assistant and integration compatibility

Refresh assistant tool catalogs after rollout to discover type editing,
draft work and readable history. Historical undo and object merge tools are
removed. Keep existing read-only grants unchanged.
Clients that need to propose and save changes must request new consent for map
work. Verify that a read-only connection cannot write after rollout. Map-work
consent does not replace the user's instruction for each whole-draft save.

Update assistant clients to read the complete draft review and preserve both
content and draft versions. Use current content after an import before proposing
or saving changes. Historical author identifiers grant no access. Clients
must check durable save results before further changes after an interruption;
a pending attempt is not a successful save.

Clients that read drafts, save results or history must handle object and
relationship type changes, removed definitions with no resulting definition,
and restoration proposals. Draft displays must include the retained source
definition together with a proposed object type and its values. Older clients
must support explicit property choices against the current comparison before
they can resolve these conflicts. Re-read the current comparison after import
or content replacement. Shared saved history does not carry private restoration
authority.

### External assistant access

Use the same HTTPS origin for the app, consent pages, OAuth endpoints and MCP
endpoint. Confirm that the ingress forwards all of them. A tunnel for MCP alone
does not make a local authorization server reachable.

Before enabling real client use, verify provider login, explicit AI consent,
household selection and revocation with fictional data in each selected client.
Existing users have no assistant connection until they approve one. Revocation
stops future reads but cannot remove information already received by an external
service.

### Image security monitoring and release verification

After the monitoring update reaches the main branch, run the image security
workflow again. Check fresh scan evidence for the running and retained recovery
images. Earlier unknown results do not establish image safety. Continue private
investigation if the new result is blocked or unknown.

Configure the operator who receives security alerts and verify delivery through
GitHub. Review the latest successful scan of the running and retained recovery
images before each production update and at least monthly. Missing or stale
evidence means that current status is unknown. Check security updates and
exception expiry each week. An older image with an unresolved finding remains
unsafe after a fixed image enters production. Retained-image monitoring does
not authorize running an older application after the login transition.

Before using a published image, verify its source and signed evidence. Read
the guidance attached to that release and select the image by its digest.
Retain running and recovery images, deployment records, verification evidence
and matching database backups outside temporary build cleanup. Do not replace
the content of an existing release version or remove evidence needed for
recovery. Follow the private security contact procedure for investigation
details.

### Production terminal access

The container supports Render's managed SSH access. Before rollout, review who
can use the production host's terminals and remove temporary operator access
or SSH keys. If access must be restricted further, protect the Render project
environment so only workspace Admins can use its terminals. Admins retain
maintenance access; closing a session does not prevent a new session.

### Automatic Render deployment

Before enabling automatic updates, configure the production deployment
environment and one image-based Render service with a persistent disk. A
verified release from the main branch changes production automatically when
the push changes application source, dependencies, or production configuration;
stable release tags do not change the running installation. Expect a short
interruption, enable deployment-failure notifications and keep other deployment
paths disabled. Follow the [deployment runbook](render.md).

Documentation, tests, release tooling, and development-container changes alone
still publish a release, but do not deploy it. Use the latest release run that
requires production deployment when retrying a failed update. Later changes
outside production inputs do not prevent that retry. Read the job summary and
retain its deployment report and request log when investigating failures.

After failure, establish the actual running image and database state before
retry. Wait for any active database maintenance. A supported household export restores
content through the [recovery procedure](recovery.md); it does not reverse the
database format change or restore authentication and membership on a replacement
installation. Without a usable recovery copy, later content can be lost.

### Production runtime base

The production container uses Alpine Linux 3.24. Rebuild the complete image
so native dependencies match the runtime. Before rollout, verify database
access and restart recovery on the deployment architecture. Keep the previous
image and its database backup available until these checks pass.

The running container has no operating-system or JavaScript package manager.
Install or update dependencies through an image build. Security findings at
High or Critical severity block a new delivery unless a reviewed, exact,
time-limited exception applies.

### Verified login linking

Verify explicit linking with real Google and Microsoft logins after deployment,
including a personal Microsoft account. Check that both logins reach the same
user and household, and that denied consent leaves existing access intact.
Existing provider callback addresses remain valid. Do not include tokens or
identity proofs in logs or release evidence.
