# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Skyttel.

## Unreleased

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
