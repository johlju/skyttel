# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Skyttel. For routine deployment steps, use the
[installation guide](installation.md) and [deployment runbook](render.md).

## Unreleased

### Database compatibility and rollout

This release adds database storage and changes saved content formats. Before
upgrade, back up the persistent database and retain its matching application
image. Keep the same persistent disk and authentication secret during rollout.
Use the upgraded image with the upgraded database. To return to an older image,
stop the application and restore its matching database backup. Changing the
image alone does not reverse database changes. Changes after the backup will
not be present after restoration.

Ask users to preserve unsent text and reload open browser sessions after
rollout. Outdated sessions cannot submit changes. After an interrupted save,
check its durable result before retrying; a missing response does not establish
failure. A retry must use the same operation and content. Imported content or
a change to historical owner assignments invalidates older attempts.

Backups now retain private drafts, personal views, image versions, save attempts,
historical names, financial facts and removed content. Apply household access
and retention restrictions to these records and their recovery copies. Ordinary
removal and undo do not permanently erase retained information. Follow the
[permanent erasure runbook](permanent-erasure.md) for that operation.

### Object icon and archive compatibility

This release stores each object's selected icon with its other content.
Objects without a selection use their type's default icon. Full household
archives from this release need an upgraded reader. The upgraded application
also accepts supported older archives and uses default icons where no
selection exists. Use the database backup and matching image procedure above
for rollback; changing the image alone does not remove icon storage.

Refresh connected assistants' tool catalogs after rollout. Older clients
that omit the icon field retain the current selection. An explicit reset
uses a null value. Icons are bundled locally and need no external service.

### Object and relationship type sections

This release stores named sections, field order and hidden field placement
with object and relationship type definitions. Existing definitions and
supported older archives keep their field order and use a default section.
Hidden fields retain their values, including in drafts, history and recovery copies.
Hiding a field does not erase its content or limit access to it.

Object types can also store the placement and order of built-in description
and financial properties. These settings do not change the financial values,
their certainty or their reported dates. Existing common values remain
accessible outside type sections, including after a type change. Older
definitions and archives keep their original presentation until it is changed.

New household archives require an upgraded reader. Refresh connected
assistants' tool catalogs after rollout so they can change sections and
field placement. Older clients that omit section or built-in property
information retain the existing placement. Custom answers and built-in
property references remain separate contracts. Use the database backup
and matching image procedure
above for rollback.

### Relationship fields and archive compatibility

This release stores optional custom field definitions and answers for
relationships. Existing relationships keep empty answers. New full household
archives require an upgraded reader; supported older archives remain readable.
Keep custom answers under the same access and retention controls as other
household content, including private drafts and recovery copies.

Refresh connected assistants' tool catalogs after rollout. Clients that omit
custom fields or answers retain existing data when the relationship type is
unchanged. Clearing answers requires an explicit empty value set. Use the
database backup and matching image procedure above for rollback.

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

Personal conversation choices now include saved desktop widths. They remain
in the installation database and apply to the user's households. Household
export and import do not transfer or restore these choices. Keep an installation
database backup if these choices must survive disk replacement. The upgrade
preserves existing draft choices and supplies default widths.

New household archives use schema version 24 and need an upgraded reader.
The upgraded reader still accepts supported archives from versions 14 through
23. Use the matching database backup and image procedure above for rollback.

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
backup and matching image procedure above for rollback; changing the image
alone does not remove this storage. Backups and recovery copies retain these
consent records. Apply household access and retention restrictions to them.

A saved consent is not household content. A full household archive does not
contain it, and import does not transfer or change it. After a move to
another installation, each user gives consent again. When a user loses access
to a household, that user's saved consent is removed.

New household archives require an upgraded reader; supported older archives
remain readable. After rollout, each user must give consent before the first
text or voice conversation, and can save it for the household.

This release changes the consent text. A saved consent for the previous text
does not apply. Verify that users must approve the new text before text or
voice work can start. Speech recorded during a long press can wait in the
browser and go to the voice service after the user releases the button.
Release stops new recording immediately.

A user can revoke the consent in Settings. The revocation removes the saved
consent and ends that user's conversations in the household. A restored
database backup contains the consents that were saved when the backup was
made. After a restoration, tell users that a consent which they revoked
after the backup applies again until they revoke it again.

### Household export, replacement and recovery

Verify that only current administrators can prepare and download a full
household archive after rollout. Archives include every user's private drafts,
personal views, history and retained images. Restrict access to downloaded
archives. Archive readers must support version 1 of the full archive format and
ZIP64 when needed. No automatic backup is added; keep usable recovery copies
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
history, undo and object merge tools. Keep existing read-only grants unchanged.
Clients that need to propose and save changes must request new consent for map
work. Verify that a read-only connection cannot write after rollout. Map-work
consent does not replace the user's instruction for each whole-draft save.

Update assistant clients to read the complete draft review and preserve both
content and draft versions. Undo must use current content versions, including
for imported history. Historical author identifiers grant no access. Clients
must check durable save results before further changes after an interruption;
a pending attempt is not a successful save.

Clients that read drafts, save results or history must handle object and
relationship type changes, removed definitions with no resulting definition,
and restoration proposals. Draft displays must include the retained source
definition together with a proposed object type and its values. Older clients
cannot preserve the new grouped conflict choices for type-change undo.

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

Configure the operator who receives security alerts and verify delivery through
GitHub. Review the latest successful scan of the running and retained recovery
images before each production update and at least monthly. Missing or stale
evidence means that current status is unknown. Check security updates and
exception expiry each week. An older image with an unresolved finding remains
unsafe for recovery after a fixed image enters production.

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
retry. Wait for any active migration. A complete household export restores
content through the [recovery procedure](recovery.md); it does not reverse the
database upgrade or restore authentication and membership on a replacement
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
