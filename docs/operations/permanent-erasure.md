# Recover a pending permanent erasure

This runbook is for operators and household administrators. Permanent
erasure removes selected retained content as well as its current display.
Use ordinary removal or an ended status when you need history to remain.

## Review before execution

Open household administration and choose **Permanent radering**. Select
the intended identities or definitions, then review the full affected
scope. A merged identity can include its source, survivor, and image
copies. A selected definition can include objects or relationships still
using it. Other users' private content appears only as impact counts.

Enter the displayed confirmation only after reviewing this scope. A
changed household requires a new review. Keep the operation identifier
if the connection fails. Check the status before starting another action.
Do not assume that a lost reply means that no content was removed.

## Pending state

The administration page distinguishes preparation, cleanup, and completion.
During preparation, target-household content is protected. During cleanup,
content access across the installation is protected because the database
journal is shared. Login and administration remain available. Do not
report completion until the page reports that erasure is complete.

If status remains pending:

1. Leave the durable operation in place. Do not delete its database record,
   edit its phase, or restore an earlier database to reopen the map.
2. Check persistent disk capacity and application write access. Database
   reconstruction needs additional free space; provision up to twice the
   database size in addition to normal journal and export capacity.
3. Let active database readers finish. Close external inspection sessions
   and transactions. A reader for another household can delay cleanup.
4. In household administration, use the pending operation's resume action.
   The server retries the recorded operation and its cleanup checks.
5. If needed, restart the single application instance on the same persistent
   disk. Startup removes abandoned server export and import files. Read the durable
   status and resume the same operation after login. Restart alone does
   not mean that erasure completed.

If the initiating administrator loses access, another current household
administrator can inspect status and resume. A prepared operation applies
only after a current administrator passes the server's access check.
Do not grant access to an old archive identity to recover this operation.

Generic `erasure_recovery_pending` and `export_cleanup_failed` events help
identify a retryable failure without recording selected household content.
Escalate persistent storage errors with the operation ID and phase. Keep
database copies and logs containing household content out of public issues.

## Verify completion and recovery limits

After completion, reload old map sessions. The new content generation
rejects stale edits and retries. Check that selected content, its retained
images, and its history are unavailable, while unrelated content remains.
The [manual procedure](../manual-tests/household-erasure.md) uses synthetic
content and includes restart and interrupted-response checks.

Skyttel removes its temporary exports and imports, and checks journal and free
page cleanup. This does not guarantee immediate physical deletion from a
provider's snapshots, filesystem history, or remapped storage blocks.
Manage those copies under the provider's retention process. Do not remove
the application's pending protection merely because an external copy was
deleted.

Already downloaded exports are unchanged. Store or delete them under the
household's retention decision. An explicit import of an older export can
restore erased information. Similarly, restoring a pre-erasure whole-disk
backup can restore that information; do not treat rollback as erasure
recovery. Record which copies must no longer be used for normal recovery.
