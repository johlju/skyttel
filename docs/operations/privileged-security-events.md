# Investigate privileged security events

This guide is for installation operators who investigate access changes or
full exports, and maintainers who diagnose a reported event. Skyttel writes
bounded JSON records to server stderr with `event: security_operation`.
The development server shows them in its terminal. No application log file,
audit database, viewer, alert, or automatic transmission to an AI agent is
created. Authentication library logging stays disabled.

## Find events and restrict access

Render collects stderr in application logs. Open the service's **Logs**
page, select the relevant time range and instance, and search for
`security_operation` or an event's `reference`. Use `operationReference`
to find related stages. See
[Render application logging](https://render.com/articles/how-render-handles-logging-and-observability).

Review workspace membership and API credentials before rollout. Permit
log access only for operators and maintainers who need it. Render's
Admin, Developer and Contributor roles can read service logs; Viewer and
Billing cannot. Available roles depend on the plan. Review **Workspace
Settings** and remove unnecessary access. See [Render roles and permissions](https://render.com/docs/team-members).

The records contain restricted identity metadata. They exclude names,
email and IP addresses, invitation codes, cookies, tokens, OAuth query
strings, provider payloads, request and response bodies, household content,
raw error messages and stacks. Other application or hosting logs have
their own scope; these exclusions describe this event interface.

## Interpret the record

Every record has `schemaVersion` (currently `1`), a unique `reference`, UTC
`at`, `operationReference`, `operation`, `stage`, `outcome`, `reason`,
diagnostic `code`, and build `version` and `commit`. Development uses
`development` for both build fields. Unknown or unsafe build values become
`unknown`. Optional `status` is an HTTP status when one is meaningful.

Only verified internal references are included as `actorId`, `householdId`
and `targetId`. `targetUserId` identifies an invitation recipient or the
owner of a revoked grant. An early rejection can omit these references.
A missing reference
means unknown or withheld context, not an anonymous person proven to exist.
No extra privileged lookup is made to identify a denied target. References
are limited to 128 ASCII letters, digits, underscores or hyphens; unsafe
values are omitted. Build values have an 80-character allowlist.

<!-- markdownlint-disable MD013 -->

| Operation | Meaning of successful evidence |
| --- | --- |
| `membership_role`, `membership_remove` | The membership transaction commits. `previousRole` and `role` describe the change; `none` means removal. |
| `invitation_create` | A new invitation commits. `targetId` identifies it; `targetUserId` identifies its recipient. `replacedCount` counts prior pending invitations revoked for that recipient. |
| `invitation_accept` | The invitation commits membership with role `member`. The target is the invitation. |
| `invitation_revoke` | The invitation becomes revoked. An already revoked invitation is `unchanged`. |
| `grant_approve` | Consent succeeds and returns an authorization code. The target is the connection, never the code. |
| `grant_revoke` | Connection, consent and associated tokens are removed in one transaction. |
| `export_prepare` | The archive is ready, not downloaded. The target is the temporary export reference. |
| `export_download` | `started`, `completed`, `cancelled` and `failed` distinguish the server stream lifecycle. |
| `export_cancel` | Cancellation and cleanup finish, or `unchanged` means no matching export. |

<!-- markdownlint-enable MD013 -->

A repeated role assignment is `unchanged`, not a privilege change. An
invitation replacement invalidates previous pending codes in the same
transaction. The event counts them without recording any code.
`refused` means the user declines external consent. `rejected` means a
request or authorization check prevents the operation. `failed` means an
operation encounters an internal or infrastructure failure. Temporary
connection creation followed by unsuccessful consent never emits approval.
A successful HTTP consent response without a valid authorization-code
result is an internal failure, not an authorization rejection.

Success is recorded at the commit boundary. A later cleanup or response
failure can follow a success with the same operation reference. It does
not mean the earlier change is rolled back. Export preparation, download
and explicit cancellation share a reference after export ownership is
verified. Expiry, replacement or access invalidation can cancel a ready
archive. Stream completion confirms only that the server stream ends
normally; it does not prove client receipt or a file saved on disk.

## Diagnose safely

Use the build commit to inspect the matching source revision. Locate the
operation and stage in [administration](../../src/server/administration.ts),
[assistant routes](../../src/server/assistant-routes.ts), or
[export handling](../../src/server/household-export.ts). Early endpoint
checks and the diagnostic allowlist are in the
[event interface](../../src/server/security-events.ts). Check related
events before deciding whether a change commits. A single event narrows
the checks to inspect; it cannot establish the root cause.

<!-- markdownlint-disable MD013 -->

| Diagnostic code | Interpretation and next check |
| --- | --- |
| `committed`, `invitation_replaced`, `no_change` | Check the recorded outcome, roles and replacement count. |
| `unauthenticated`, `forbidden` | Check current login and authorization. Cross-origin requests also use `forbidden`. |
| `invalid_request`, `client_outdated` | Check request shape, size or client build compatibility. |
| `user_not_found`, `member_not_found`, `invitation_not_found` | The authorized lookup cannot find the requested target. |
| `already_member`, `last_administrator`, `invitation_unavailable` | Check the membership or invitation rule at the named operation. |
| `consent_refused`, `consent_rejected` | Distinguish refusal from unsuccessful consent. Check consent validation and cleanup. |
| `export_busy`, `export_unavailable` | Check competing work, ownership, expiry and content generation. |
| `archive_storage_unavailable`, `archive_too_large`, `content_maintenance` | Check disk capacity, archive limits or content maintenance. |
| `archive_ready`, `download_started`, `download_completed` | Check the next lifecycle event; readiness or start is not completion. |
| `export_cancelled`, `download_cancelled` | Preparation, a ready copy or a stream is cancelled. |
| `internal_failure` | Unknown error. Inspect the operation and stage; no free-form error property is trusted. |
| `rejection_limit`, `delivery_loss` | Evidence is incomplete; see delivery limits below. |

<!-- markdownlint-enable MD013 -->

Stages are `request`, `authorization`, `mutation`, `consent`, `preparation`,
`download`, `cleanup` and `response`. The following synthetic pair shows a
committed demotion followed by failed cleanup. Actual records are each a
single JSON line; formatting here is only for reading.

```json
{
  "event": "security_operation",
  "schemaVersion": 1,
  "reference": "11111111-1111-4111-8111-111111111111",
  "operationReference": "22222222-2222-4222-8222-222222222222",
  "at": "2026-11-02T12:00:00.000Z",
  "operation": "membership_role",
  "outcome": "succeeded",
  "reason": "state_changed",
  "code": "committed",
  "stage": "mutation",
  "version": "development",
  "commit": "development",
  "actorId": "synthetic-actor",
  "householdId": "synthetic-household",
  "targetId": "synthetic-target",
  "previousRole": "administrator",
  "role": "member"
}
```

```json
{
  "event": "security_operation",
  "schemaVersion": 1,
  "reference": "33333333-3333-4333-8333-333333333333",
  "operationReference": "22222222-2222-4222-8222-222222222222",
  "at": "2026-11-02T12:00:00.001Z",
  "operation": "membership_role",
  "outcome": "failed",
  "reason": "internal_failure",
  "code": "internal_failure",
  "stage": "cleanup",
  "version": "development",
  "commit": "development",
  "actorId": "synthetic-actor",
  "householdId": "synthetic-household",
  "targetId": "synthetic-target",
  "status": 500
}
```

For this pair, inspect export invalidation after the committed membership
change. Confirm current membership through the administration page before
retrying. Do not infer a disk failure from the fallback code alone. When
sharing an event with a maintainer or AI coding session, restrict the
destination and include the matching source revision. Do not add raw
requests, invitation codes, archive contents or provider responses.

## Delivery limits

Logging cannot grant or deny access and cannot roll back a mutation.
The emitter neither waits for a drain nor queues records for retry. It
skips output while stderr is destroyed, errored, needs a drain, or already
has at least 16 KiB buffered. A single bounded record can cross that
threshold. A thrown write is contained. Other writers and the host have
their own buffering. A successful write does not confirm Render retention;
asynchronous output failure, process exit and host loss can lose events.

Each application instance emits the first 20 rejected attempts per
60-second window. All operations share this counter; identities never
become aggregation keys. The first suppressed rejection emits
`rejection_limit` with `count: 1`. On the next event after the window ends,
another summary reports the window's total suppressed count, including
that first rejection. Do not add the initial notice to that total.
Successful operations are outside this suppression. Counters saturate at
one billion and reset on restart; no timer or growing queue is used.

`delivery_loss` reports skipped or throwing writes once output becomes
available again, including failed summary writes. It is not a complete
count of host or asynchronous losses. If output never recovers, even the
summary is lost. Suppression, loss and process restart leave evidence gaps;
absence of an event does not prove absence of an action.

## Retention and deletion

Render documents application-log retention of 7 days for Hobby, 14 days
for Pro and 30 days for Scale/Enterprise. Check the workspace's **Billing**
page for its plan and confirm the current [retention policy](https://render.com/docs/logging#retention-period)
when setting the installation's policy. These values are verified on
2026-11-02. Older entries become unavailable; a later plan upgrade does
not recover them. This is a retention-expiry rule, not a stronger guarantee
of immediate physical deletion from all provider storage.

These operational records are outside household archives, content imports
and household content erasure. Erasure does not delete retained operator
logs. For deletion requests beyond retention expiry, use the provider's
support and contractual process; Skyttel has no log-deletion endpoint.
Local terminal output has no application-managed persistence. Terminal
capture, forwarded logs, downloaded copies and copies pasted into an AI
session each need their own access, retention and deletion policy. Review
and delete those copies separately when their approved purpose ends.

## Check collection with synthetic actions

Use a disposable installation and synthetic identities. Run the development
server in a terminal, or open the test service's Render **Logs** page.

1. Invite a synthetic signed-in recipient and replace the invitation once.
   Find creation and replacement events; no invitation code may appear.
1. Accept the current invitation, promote the member, repeat the same
   role assignment, then demote them. Confirm `succeeded` versus `unchanged`.
1. From that member's session, attempt administration and confirm a bounded
   rejection without an unverified target reference.
1. Approve and revoke a synthetic external client, then decline a fresh
   consent request. Confirm success, revocation and refusal separately.
1. Prepare and download a full export, then prepare another and cancel it.
   Match operation references and distinguish server completion from saving
   the file in the browser.
1. Record the instance, time, build identity, observed event references,
   applicable retention period and who checks collection. Remove synthetic
   accounts and downloaded archives using the test installation's reset
   procedure. Retained logs follow the policy above.

Synthetic repository tests cover safe fields, rejection floods, delivery
failure, committed changes and export lifecycle errors. They do not prove
collection, reader permissions or deletion in a hosted installation.
Production checks need their own authorization. General login auditing,
imports, erasure and installation recovery are outside this event stream.
Existing [internal assistant events](assistant-security-events.md) remain
separate.
