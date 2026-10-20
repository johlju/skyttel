# Controlled upgrade of the login model

Use this procedure only for an installation that has no installation
authority generation. An installation with existing login authority needs
no login upgrade.

This is an offline, one-time login transition. It ends all
old login sessions, pending login and linking attempts, OAuth credentials,
assistant grants and signing keys. Users and linked identity associations,
household information, stored drafts, registered save attempts and save
receipts remain. Unsaved conversation work does not resume.

## Prepare before the maintenance window

1. Verify the new image's release identity and synthetic upgrade evidence.
   Record the current image identity for investigation, not redeployment.
   Test this procedure on a restricted disposable copy first. Keep its
   access closed and handle its deletion under the backup policy.
2. Confirm that the source is the live original installation. If it is a
   restored copy, use the controlled restore procedure instead. Do not use
   legacy adoption to bypass missing restore evidence or permanent-erasure
   checks. An older copy can reintroduce permanently erased information.
3. Inventory restricted database copies and their original copying times.
   A household export is not a full installation recovery copy. Verify a
   recoverable copy and restrict access before changing the original disk.
   Actual host backup access and deletion need their own evidence.
4. Generate a new UUID for `SKYTTEL_AUTHORITY_GENERATION`. Store it in the
   host's protected configuration outside the database disk and its copies.
   Preserve that value for ordinary restarts. Do not configure a restore
   declaration for this transition.
5. Tell users that every affected device must sign in again and actively
   choose **Kom ihåg mig** if wanted. Ask them to check uncertain saves
   using their existing results after login, without submitting new saves.

## Stop, adopt and start one instance

Close public ingress, disable automatic deployments and stop every old
application process. Verify at the host that no old process can access the
disk or provider connections. Stopping the process ends active text work,
voice and delivery channels. Natural-expiry continuation does not apply.
An exclusive SQLite write transaction cannot prove that a separate old
process has stopped. The command requires the operator to confirm this
precondition explicitly.

Run the verified new image's maintenance entry point on the original disk
with the installation's protected environment. The process must have the
same database path, secret and identity-provider configuration as the new
service, plus the new external generation:

```sh
node dist/server/upgrade-legacy-login.js \
  --confirm-legacy-upgrade --confirm-service-stopped
```

In a source checkout, build the new version first, then use
`npm run auth:upgrade -- --confirm-legacy-upgrade --confirm-service-stopped`.
The production image contains the compiled Node entry point and has no npm.
For Compose, stop the service first and run the command as a one-off
container with the same volume and protected environment; do not start a
second service instance. A hosted installation needs an equivalent isolated
maintenance process. If the host cannot provide one, keep the release
blocked until a maintainer arranges it.

Require exit status zero and `legacy_login_upgrade_completed`. The command
applies forward migrations and atomically invalidates old authority before
recording the new generation. It refuses an installation that already has
a generation, a restore declaration, or missing confirmations. Re-running
it must not invalidate new logins. Do not delete its generation record or
migration history to retry. A failure can leave forward migrations applied;
keep access closed and fix forward with a maintainer.

Start only the verified new service with the same external generation.
Missing or mismatched authority configuration must block readiness.

## Verify before reopening

1. Check readiness, exact image identity and anonymous access through HTTPS.
2. Try old cookies on each representative device, old pending callbacks,
   refresh tokens and assistant credentials. All must be denied, including
   after restart. A late response can leave a cookie; it grants no access.
3. Sign in again with Google and Microsoft. **Kom ihåg mig** starts
   unchecked. Verify the expected user and linked identities, household,
   stored draft and original save results. Check an uncertain result before
   retrying a save. Model work and old deliveries must not restart.
   If an old security cookie blocks initialization, use the offered explicit
   reset and confirm it. Then start a new login yourself; Skyttel must not
   silently replace the cookie or retry the provider request.
4. Restart the new service. Verify the same retained content and rejection
   of old keys. A normal restart preserves the new generation and does not
   repeat the upgrade.
5. Verify desktop and mobile login, keyboard focus and screen reader
   announcements. Without trustworthy evidence of the cause, the browser
   shows its ordinary ended-login message. No extra persistent record is
   kept only to remember an upgrade notice.

Record evidence and unresolved checks against the release. Synthetic
providers and temporary SQLite copies do not establish real provider,
hosted HTTPS, physical browser restart, screen reader or backup deletion
behavior. Keep delivery blocked when required evidence is missing. Repair
with a newer version; returning to an older application is unsupported.
