# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Skyttel.

## Unreleased

### Installation cost measurements

Follow the existing upgrade and recovery procedure. Start the new image
on the existing persistent disk and confirm
database readiness. Cost recording starts at upgrade; earlier usage remains
unknown. An older image does not reverse the database changes.

The configured first-administrator identity controls installation cost
access, independently of household roles. Verify that identity, then review
the monthly hosting and currency assumptions in the cost view. Initial
values assume one paid service, a small disk, a free workspace and an
illustrative currency conversion. Follow the
[cost operations guide](costs.md) to set the actual assumptions and handle
missing measurements. The view is an estimate and applies no spending stop.

The installation retains cost measurements separately from household
content. Household export, import and permanent erasure do not transfer or
clear them. A household archive cannot restore the cost history after disk
loss. Preserve installation recovery copies when that history is required;
this upgrade adds no automatic backup.

### Voice assistant

The optional voice assistant uses the existing private AI provider setup.
Keep a secure browser origin and permit the provider's server connections
and browser media traffic. Users must explicitly start microphone access;
blocked audio requires a browser playback action. See the
[voice setup and recovery guide](installation.md#enable-the-built-in-assistants).

A broken voice connection stops associated work. It does not undo a completed
save. Check durable save receipts before retrying uncertain work. Final voice
usage can be unavailable after a connection loss; retain that uncertainty.
No database conversion is required for this upgrade.

### Restore to a fresh installation

The administrator can now explicitly assign restored historical private
content to verified current members. This change needs no additional database
migration or archive format change. Rebuild the application and use the
[recovery runbook](recovery.md) when replacing a disk or moving installation.
Keep the source read-only after its final export and allow only one writable
installation after cutover. Configure fresh authentication secrets and the
destination's first administrator; an archive restores no old login authority.

Review historical and current IDs with the people concerned before assignment.
Displaced private content remains unmapped and can be assigned back. All
clients must reload after a binding change. Old save operations become
historical evidence, including pending attempts; they cannot authorize retries.
If the response is lost, read current bindings before making another change.

### Built-in text assistant

To enable the text assistant, configure `OPENAI_API_KEY` in the server's
private environment and restart with the same disk and authentication
secret. Keep the key out of browser settings, public build variables and
logs. Without it, ordinary map editing remains available.

Each user makes separate AI and map-work choices. The assistant uses the
same current household access and map rules as external MCP clients.
Stopping a session does not reverse a committed save: check its durable
result before trying again. See the
[setup and recovery guidance](installation.md#recover-assistant-access).
Real-model checks remain separate from deterministic provider substitutes.

### Permanent household erasure

Keep a database backup with its matching application image before upgrade.
Use the upgraded image with the new content maintenance state. Reload open
map sessions after rollout. Old content generations cannot submit edits or
retry saves after an erasure.

Allow free persistent disk space for database reconstruction and normal
journal use. A pending erasure can block content access across the whole
installation while a database reader or storage error delays cleanup.
Keep the recorded operation and resume it from household administration.
Use the [pending erasure runbook](permanent-erasure.md) after an interruption.

Downloaded exports and provider snapshots remain separate recovery copies.
An explicit import or restoration of an older copy can restore erased
information. Apply the household's retention decision to those copies;
do not use an older backup merely to clear a pending erasure.

### Atomic household replacement

Keep a matching database backup before upgrade. The upgrade separates
historical content owners from authenticated users. To return to an older
image, stop the application and restore its matching backup. Reload open
clients; all mutations now require the content generation they reviewed.

Allow persistent disk space for an uploaded archive and its extracted
parts. Import accepts supported full archives up to about 1.1 GB, with a
32 MiB content part and a 1 GiB image part. Interrupted preparations are
removed at startup. A committed replacement stays committed after restart.
If cleanup fails, content remains unavailable until cleanup completes;
check the durable import status before retrying or restoring a backup.

Existing access is preserved. Imported historical identities do not create
logins. Private content from another installation needs explicit verified
owner mapping before a current user can resume it.

### Assistant map work

Map-work clients can now discover type editing, relevant history, undo and
object merge tools. Refresh their tool catalogs after rollout. Keep old
read-only grants unchanged. Verify that clients review the whole resulting
draft and use current content versions for undo, including imported history.
Historical author IDs identify saved content and do not grant access.

Keep existing read-only assistant grants unchanged. Clients that need to
propose and save changes must request new consent for map work. Verify
that a read-only connection cannot write after rollout. Map-work consent
does not replace the user's explicit instruction for each whole-draft save.

Update assistant clients to read the complete draft review and preserve
both content and draft versions. After an interrupted save, check the
durable result before further changes. Retry only the same operation and
content; imported content invalidates older attempts. Do not treat a
missing response or a pending attempt as a successful save.

### Complete household export

Rebuild the complete application image. Verify that only current
administrators can prepare and download a full household archive after
rollout. These archives include every user's private drafts, personal
views, history, and retained encoded images. Apply household backup access
restrictions to each downloaded archive. An archive restores content; it
must never restore old login or membership authority.

Allow free persistent disk space for a content snapshot and its ZIP archive
during preparation, in addition to the database and its active journal.
Only one preparation runs at a time. Temporary copies have private file
permissions and expire after ten minutes; interrupted copies are removed
on the next application start. Check storage and cleanup failures before
retrying an export. A failed or interrupted export is not a recovery copy.

Use readers that support version 1 of the full archive format and ZIP64
when needed. Keep downloaded copies in a secure location. No automatic
backup is added, and a larger storage failure can lose information added
after the latest own export.

### Reversible object merges

Keep a database backup with the application image that can read it before
upgrade. Merge proposals and history retain identity, relationship and image
copy information. Use the upgraded application with this content. To return
to an older image, stop the application and restore its matching backup.
Reload open browser sessions after rollout.

Include merge records and original and copied image versions in full
content recovery. Apply the same access and retention rules as other
household history. Erasure tools must follow image copies and remove
affected merge snapshots and private proposals as well as current content.

### Private profile images

Back up the persistent database and retain its matching image before upgrade.
Startup adds image storage and keeps existing objects and drafts. Rebuild
the complete application image so the native image processor matches the
deployment architecture. Verify image upload, private access, and restart
recovery after rollout. Stop the application and restore its matching backup
before returning to an older image.

The database now retains small encoded images and historical versions.
Monitor persistent disk use and apply existing backup access restrictions
to these images. Ordinary removal retains image history; it does not erase
the original saved information. Permit uploads up to 10 MB at the ingress
for the image upload route. Keep smaller limits for ordinary API requests.

### Personal map views

Back up the persistent database and retain its matching image before upgrade.
Startup adds personal object placements and display settings. Use the
upgraded image with this database. Stop the application and restore the
matching backup before returning to an older image.

Keep personal views within the same access and backup restrictions as
private drafts. Each view belongs to one user and one household. Normal
object removal and membership revocation retain these records; revocation
blocks further access. Include retained personal views in full household
recovery and permanent erasure procedures.

### Object type changes

Use the upgraded application with private drafts that contain a type-change
undo. Earlier application versions cannot preserve the new grouped conflict
choices. Before returning to an earlier image, stop the application and
restore its matching database backup. Clients that display private drafts
must show the retained source definition and the proposed type and values
together. Reload open browser sessions after upgrade.

### History and whole-save undo

Back up the persistent database and retain its matching image before upgrade.
Startup adds retained removal records for type definitions. Private drafts
can also contain restoration proposals. Use the upgraded image with this
database. Stop the application and restore the matching backup before
returning to an older image.

New save records retain the saving user's name with their identifier.
Apply existing access restrictions and retention rules to these names,
removed definitions, and restoration records in the database and backups.
Older records can contain only the user identifier. Undo adds a new save;
it does not remove the original history or permanently erase information.

Clients that read drafts, receipts, or history must handle definition
removals with no resulting definition, as well as restoration proposals.
Reload open browser sessions after upgrade so they can review these changes.

### Editable directed relationship types

Back up the persistent database and retain its matching image before upgrade.
Startup adds storage for direction labels and private relationship type
proposals. Existing definitions and content remain. Use the upgraded image
with this database. Stop the application and restore the matching backup
before returning to an older image.

Relationship definitions and direction labels occur in private drafts,
receipts, and history. Apply existing backup access restrictions and retention
rules to these records. Clients that describe a whole draft or save must
include relationship type changes. Existing definitions without a reverse
label keep their original direction until a member supplies both labels.

### Ended content and recoverable removals

Back up the persistent database and retain its matching image before upgrade.
Startup adds storage for lifecycle status and relationship end dates. Use
the upgraded image with this database; an older image requires its matching
backup. Stop the application before restoring that backup.

Ordinary removal keeps content, relationship names, type definitions, and
earlier values in history without automatic expiry. Apply existing access
restrictions to these records and backups. Ordinary removal does not erase
this retained information. Administrators use the separate reviewed
permanent-erasure procedure to remove retained content. Follow its cleanup
and recovery guidance before treating an interrupted erasure as complete.

### Daily image security monitoring

Before rollout, configure the operator who receives security alerts and
verify delivery through GitHub. Review the latest successful scan of the
running and retained recovery images before each production update and at
least monthly. Missing or stale evidence means that current status is
unknown. Check security updates and exception expiry each week.

Keep the running and previous successfully deployed images, their deployment
records, and their verification evidence outside temporary build cleanup.
An older image with an unresolved finding remains unsafe for recovery even
after a fixed image enters production. Follow the private security contact
procedure for investigation details.

### Editable object types and custom fields

Back up the persistent database and retain its matching image before upgrade.
Startup adds storage for editable object definitions and custom field values.
Existing definitions, objects, and private drafts remain. Use the upgraded
image with this database. Stop the application and restore the matching
backup before returning to an older image.

Definitions and field values can occur in private drafts, saved objects,
receipts, and history. Apply the same backup access restrictions and retention
rules to these records as to other household content. Clients that read save
results must include definition changes when they describe the whole save.

### External assistant access

Retain the persistent database and authentication secret during upgrade.
Startup adds OAuth authorization and assistant connections. Use the same
HTTPS origin for the app, consent pages, OAuth endpoints and MCP endpoint.
Confirm that the ingress forwards all of them. A tunnel for MCP alone does
not make a local authorization server reachable.

Before enabling real client use, verify provider login, explicit AI consent,
household selection and revocation with fictional data in each selected text
client. Local automated checks do not establish production compatibility.
Existing users have no assistant connection until they approve one. Users
and administrators can revoke connections; revocation stops future reads
but cannot remove information already received by an external service.

### Production terminal access

Before rollout, review who can use the production host's terminals. The
container supports Render's managed SSH access. After administrator setup,
close terminal sessions and remove temporary operator access or SSH keys.
If access must be restricted further, protect the Render project environment
so only workspace Admins can use its terminals. Admins retain maintenance
access; closing a session does not prevent a new session.

Keep existing household identities and settings when upgrading. The
production first-administrator procedure is only for a new installation;
it does not transfer an existing household or restore removed membership.

### Automatic Render deployment

Configure the production deployment environment and one image-based Render
service with a persistent disk before enabling automatic updates. A verified
release from the main branch now changes production automatically. Keep the
same disk and authentication secret. Expect a short interruption and enable
deployment-failure notifications. Keep other deployment paths disabled.

After failure, establish the actual running image and database state before
retry. Wait for any active migration. Return to older code only when it is
compatible with the current database; changing the image does not restore
data. No extra automatic backup is added. Use a complete household export
and the documented reimport procedure for content recovery or transfer.
Authentication and membership are configured separately on a replacement
installation. Without a usable export, later content can be lost.

Ask users to preserve unsent text and reload old browser sessions after an
update. Outdated sessions cannot submit changes. An interrupted save must
be checked through its receipt before its outcome is treated as known.

### Verified container releases

Before using a published image, verify its source and signed evidence. Read
the upgrade guidance attached to that release and select the image by its
digest. Releases from the main branch proceed to automatic deployment;
stable release tags do not change the running installation.

Retain the current image and each planned recovery image with their matching
release evidence and database backup. Keep this material after temporary
build artifacts expire. Do not replace the content of an existing release
version or remove evidence needed for recovery.

### Recovery of interrupted saves

Back up the persistent database and retain its matching image before upgrade.
Startup preserves existing household content, private drafts, and save receipts.
It adds persistent records of pending and rejected save attempts. An older image
requires its matching database backup. Stop the application before restoring
that backup; changes after the backup will not be present.

After rollout, ask users to preserve unsent form text and reload open browser
sessions to make the recovery controls available. After an interrupted save or
restart, have the affected user check their save attempts before changing the
draft. The same user can check and retry a pending attempt from another device.
A missing response does not establish that the save failed. Apply existing backup
access restrictions and retention rules to private save attempts as well as
drafts and household content.

### Contracts and household relationships

Back up the persistent database and retain its matching image before upgrade.
Startup adds contract type definitions and storage for optional financial
facts, directed relationships, and incomplete information. Existing type
definitions, objects, and private drafts remain.
Use the upgraded image with this database; an older image requires its
matching backup. Stop the application before restoring that backup.

Backups contain financial facts and contract terms in private drafts, saved
objects, save receipts, and history. They also contain relationship proposals
and identity questions. Apply the same access restrictions and retention
rules to this information as to existing household content and private drafts.

### Production runtime base

The production container uses Alpine Linux 3.24. Rebuild the complete image
so native dependencies match the runtime. Before rollout, verify database
access and restart recovery on the deployment architecture. Keep the
previous image and its database backup available until these checks pass.

The running container has no operating-system or JavaScript package manager.
Install or update dependencies through an image build. Security findings at
High or Critical severity block a new delivery unless a reviewed, exact,
time-limited exception applies.

### Persistent objects and private drafts

Back up the persistent database and retain its matching image before upgrade.
Startup adds storage for objects, private drafts, history, and save receipts.
Existing households receive an initial Person object type. Keep the same
persistent disk across restarts. Backups now contain private drafts as well
as shared household content; restrict backup access accordingly.

An older image cannot open the upgraded database. Stop the application and
restore its matching backup before returning to that image. Changes after
the backup, including private drafts and receipts, will not be present.

### Verified login linking

Back up the persistent database and retain the matching image before
upgrade. Startup adds storage for login verification and preserves existing
users and memberships. An older image requires its matching database
backup; stop the application before restoring it.

Verify explicit linking with real Google and Microsoft logins after
deployment, including a personal Microsoft account. Check that both logins
reach the same user and household, and that denied consent leaves existing
access intact. Existing provider callback addresses remain valid. Do not
include tokens or identity proofs in logs or release evidence.

### First installation and persistent storage

Deploy one application instance with a persistent disk that the application
user can write to. Keep this disk and the authentication secret across
restarts and updates. A missing or replaced disk starts a separate empty
installation. Startup stops before traffic if database preparation fails;
correct the cause before you restore traffic.

### Identity and household access

Configure the first administrator with a verified provider account identifier
for each installation. Configure both identity providers and their public
callback addresses. Enable personal Microsoft accounts and verify real sign-in
with both providers before use. Email addresses do not grant access or link
accounts. After household creation, current membership controls access;
changing the configured first administrator does not transfer the household.

### Household invitations and database compatibility

Back up the persistent database before upgrade and retain the matching
application image. Startup adds storage for household invitations and keeps
existing households and memberships. No configuration changes are required.

An older application image cannot start with the upgraded database. To
return to that image, restore its matching database backup while the
application is stopped. Changes made after the backup will not be present.
