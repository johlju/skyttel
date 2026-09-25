# Restore or move a household

Use this guide when a disk is lost or when the household must move to a new
installation. A current administrator restores a complete Skyttel ZIP through
the application. The new installation needs its own disk, configuration and
verified logins. You do not need the source database, disk or login session.

An export includes all unique household content: current and removed objects,
relationships, type definitions, history, saved operation evidence, image
versions, all private drafts, and personal views. Treat the complete file as
private household information. It does not restore memberships, invitations,
browser sessions, provider credentials or assistant grants. Never publish an
archive in an issue or attach it to shared diagnostic logs.

No extra automatic backup is configured. A major failure can lose everything
since the latest usable export and can require several days to recover.
Persistent disk protects normal restarts; an older app image does not recover
lost data or reverse a database migration.

## Prepare the destination

1. Retain a private copy of the complete ZIP and record its date and source
   application version. Do not modify individual archive entries or combine
   files from different exports. For a planned move, use the final-export
   procedure below before importing.
2. Select a verified release that accepts the export format. Start with the
   same release as the source when available, or read the destination's
   [upgrade notes](operator-upgrade-notes.md) for compatibility. If validation
   rejects the archive, preserve it and resolve compatibility before retrying.
3. Create a new, empty persistent disk and one application instance. Keep it
   separate from any retained source disk. On Render, follow the
   [service and disk setup](render.md#3-create-the-render-web-service-and-disk).
   On another container host, use the [installation guide](installation.md).
   Use the verified image digest, a writable `/data` owned by UID/GID 1000,
   and `/data/skyttel.sqlite` for the database. Do not copy a running SQLite
   file or share one disk between installations.
4. Configure a distinct authentication secret, both identity providers, the
   destination HTTPS origin and its exact Google and Microsoft callbacks.
   Keep secrets in private host settings. Follow
   [production authentication](authentication.md) to verify and configure
   the destination's first administrator. This can be a different person
   from the source administrator. A matching name or email grants no access.
5. Check `/healthz`, the running release identity and fresh provider sign-in.
   Have the configured first administrator create the destination household.
   Keep it empty until import. Do not invite ordinary use yet.

For a local synthetic exercise, use the
[two-installation setup](../manual-tests/household-recovery.md#local-recovery-preparation).
Local checks do not establish hosted HTTPS, disk-service or real-device
behavior.

## Pause changes and take the final export

For recovery after disk loss, use the most recent usable export and continue
with import. Record its date as the limit of known recovered information.

For a planned move, agree on a maintenance interval with all household users.
Ask them to stop editing in every browser, device and assistant. Resolve
unknown saves through their durable operation status before export. Save any
changes that should become shared, or leave them in their persistent private
drafts; both are included. Unsent form text is not exported.

1. Stop active assistant work and close other editing sessions. No user may
   make further changes on the source after the final export begins.
2. As a source administrator, follow
   [full household export](../user-guide/household-export.md). Download the
   complete ZIP to private storage and keep its original name. If any new
   write occurs during this interval, repeat the final export.
3. Stop the source application after the download finishes. Retain its disk
   and configuration privately while checking the destination. Keep the
   source stopped until the move succeeds or you explicitly abandon it.
   Do not rely on users remembering an old address once the destination
   starts accepting changes.

There is no automatic merge between installations. Never operate both as
writable copies of the same household. Do not run competing deployments
during the move.

## Import the complete archive

As the destination administrator, follow
[household import](../user-guide/household-import.md): open **Administrera tillgång**,
choose **Återimportera hushållet**, select the ZIP and choose
**Kontrollera importfil**. Read the counts and replacement warning, then
confirm **Ersätt hushållets innehåll**. Import replaces the destination
household's content as a whole. It does not combine it with new destination
work, so export any destination content that must be retained first.

Wait for a completed result before continuing. If the response is lost, use
**Hämta importens status**. A failed validation or replacement leaves the
previous content intact. If cleanup is pending, content is already replaced
and the map stays closed; use **Slutför importens rensning** or correct the
storage problem and restart. Do not delete the database to clear this state.
After completion, choose **Läs in det återställda hushållet**.

## Establish current access and private ownership

Import does not authorize the historical users. Use the normal
[membership controls](../user-guide/access.md) to invite current users and assign
administrator roles. Each intended owner must sign in at the destination
with their own Google or Microsoft account and accept access first.

The administrator then assigns historical private content explicitly:

1. Ask the person to verify their current signed-in Skyttel account. They
   can privately read `user.id` at the destination's `/api/bootstrap`.
   Match that current member ID with the intended historical identity using
   your knowledge of the household and its source records. Do not use name,
   email or a coincidentally equal identifier as automatic proof.
2. In **Administrera tillgång → Koppla historiskt innehåll**, choose
   **Hämta aktuella innehållskopplingar**. Select the historical name and ID
   under **Historisk innehållsidentitet**, then the verified destination
   member under **Aktuell verifierad medlem**.
3. Read the existing and replacement bindings and private-content counts.
   A member can have one active private-content identity in this household.
   Assigning another identity leaves the displaced identity and all its
   private work stored without a current owner; it does not merge or delete
   either draft. Select **Ingen aktuell ägare** only to remove a binding.
4. Confirm **Jag har identifierat rätt person** and choose
   **Bekräfta innehållskopplingen**. Wait for
   **Innehållskopplingen är sparad.** If its response is lost, use
   **Hämta aktuella innehållskopplingar** and check the current binding
   before attempting another change.
5. Have affected users reload current content. Old forms, personal-view
   writes and save attempts are rejected. Verify the intended private draft
   and personal view. Leave identities without a verified owner unmapped;
   they remain private and included in later complete exports.

Historical author IDs, names and receipts remain evidence of the source.
They are not rewritten as new authorship. Historical pending attempts do not
become live requests on the destination. For an incorrect binding, stop work,
read the current bindings and explicitly reassign the right identity. The
displaced draft and view remain available for that reassignment.

This assignment does not link Google and Microsoft logins. A person who
wants both current logins linked must complete
[proof of both identities](../user-guide/access.md#koppla-google-och-microsoft).
Historical account access is not required to assign content, and the
assignment cannot bypass current membership or provider authentication.
Reconnect assistants through fresh consent at the destination.

## Verify and open the destination

Check current objects and relationships, custom types and fields, removed
content and history, retained image versions, each assigned private draft,
and personal positions and settings. Confirm that unmapped private content
is not visible as an ordinary member's draft. Download a fresh complete
destination export to private storage and retain it with the source archive
until the recovery is accepted.

Restart the destination with the same disk, secret and image. Repeat health,
version, sign-in and content checks. Confirm an old source session or
assistant connection does not grant destination access. Record only dates,
release identity, source export date, checks and outcomes in shared evidence.

For a domain move, follow
[change the public domain](authentication.md#change-the-public-domain).
Configure destination HTTPS and callbacks before redirecting users. Update
the deployment service ID and origin together, as described in
[Render deployment permission](render.md#7-give-github-permission-to-deploy),
so the next approved release reaches the intended service. Verify image
security monitoring against that service as well.

Only after verification should users resume editing at the destination.
Keep the source stopped. Retire its access, callbacks and retained disk
under your own retention decision; do not delete a retained copy merely
because the first import reports success.

If destination verification fails before anyone resumes work, keep it
closed and either repair it or stop it before reopening the unchanged
source. If new destination work exists, preserve a fresh export before
changing course. Reopening the older source cannot merge that work and
would omit it. Resolve which copy is authoritative before allowing writes.
