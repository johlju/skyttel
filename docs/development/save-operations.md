# Durable save operations

This contract is for developers building map clients and future household
import or permanent-deletion features. The HTTP routes, browser client, and
future assistant clients must use the same operation identity and results.

## Registration and recovery

`GET /api/households/:id/map` provides the authenticated `userId`, current
`contentVersion`, and private draft version. Save requests contain only
`operationId`, `version`, and `contentVersion`. Generate an operation ID
once and retain the complete request for retries. Omitting `contentVersion`
means generation 1, never the household's current generation.

1. `POST /api/households/:id/map/operations` registers that request and
   returns `{ operation }`. Registration commits before any map changes.
2. `POST /api/households/:id/map/save` submits the same request. Success
   returns `{ receipt }`; a known rejection returns `{ error }` and its
   HTTP error status. The save endpoint also registers requests from
   clients that omit the separate registration call.
3. `GET /api/households/:id/map/operations` discovers the caller's pending
   operations and twenty most recently created terminal operations.
4. `GET /api/households/:id/map/operations/:operationId` returns
   `{ operation }`, including older terminal results. A missing operation
   returns `{ operation: null }`.

Operations include the user, household, operation ID, draft version,
content version, and creation time. The `SaveOperation` union in
[`src/shared/map.ts`](../../src/shared/map.ts) has these durable outcomes:

<!-- markdownlint-disable MD013 -->

| Status | Meaning | Client action |
| --- | --- | --- |
| `pending` | Registration persists; no terminal result exists. | Check or retry the same request. |
| `succeeded` | Map changes, history, consumed draft, and receipt commit together. | Verify the receipt identity and reread the map and history. |
| `rejected` | The error code persists; the attempted map transaction has no effects. | Explain the rejection; reread and correct the draft. |

<!-- markdownlint-enable MD013 -->

An unknown outcome is a client's observation when a response or status
check is unavailable. It is not a durable server status. A missing result
does not prove failure: an earlier request may still be arriving. Never
replace an unknown request with a new operation ID, claim success from
local state, or claim that a disconnected save was undone.

While the caller has a pending operation, draft edits, conflict resolution,
discard, and registration of another operation return `operation_pending`.
Retry the pending request to obtain its terminal result before editing.
Other household members can continue using their own drafts.

## Identity, transactions, and errors

Every read and retry checks current household membership. Operation lookup
is private to its actor, including for administrators. Another member's
operation ID gives the same missing result as an unknown ID. Shared map
history continues to include successful changes by all household members.

An operation binds its request to the draft snapshot at registration. The
server stores a SHA-256 digest of that snapshot while pending. Reusing an
ID with another version or altered snapshot returns `operation_conflict`.
Unexpected request fields and malformed identities return `invalid_request`.
Requests from another content generation return `content_conflict`.

A stale registration itself records a rejected `draft_conflict` result.
Other map validation failures roll back the complete map transaction before
recording their rejected result. Repeating a rejected request returns the
same error even if the current draft later changes. Retrying a successful
request returns its existing receipt without adding history or consuming
another draft. Unexpected storage errors preserve the pending registration;
the client must check or retry because a missing response is inconclusive.

Migration 006 preserves older receipts, assigns them content generation 1,
and makes their successful operations discoverable. Ordinary server restarts
preserve drafts, pending operations, rejections, and receipts in SQLite.

## Future import and permanent deletion

There is no public import or permanent-deletion endpoint yet. Future work
must preserve the content-generation boundary established by migration 006.

For whole-household content replacement, open one immediate SQLite
transaction, increment `household.contentVersion`, then install the replacement
content before committing. The generation trigger immediately deletes all
of that household's `map_operation`, `map_save`, `map_history`, and `map_draft`
rows. Install any replacement drafts and history after that increment, within
the same transaction. The importer must also replace the remaining map data;
the trigger alone does not remove objects, relationships, or types.

An import failure must roll back the generation increment, cleanup, and all
replacement writes together. Do not import an older generation number or
restore old operation identities as current requests. Generations cannot
decrease. Old requests fail with `content_conflict`, even if their draft
version or object IDs appear again in the replacement content.

The cleanup is deliberately household-wide. A future targeted permanent
deletion must define how to remove affected receipts and operation data,
prevent old retries, and preserve unrelated drafts and history. It must not
silently use the household-wide cleanup as an object-deletion implementation.
Any whole-household purge must erase the remaining household content in the
same transaction and retain the generation barrier for subsequent requests.
