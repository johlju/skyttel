# Investigate blocked internal assistant actions

This guide is for the installation operator who receives a user's blocked
action reference or monitors server security events.

The internal text and voice assistant determines turn scope from the user's
requests separately from map content and worker replies. Read-only scope
blocks draft changes, discard and save preparation. For requested edits,
a separate comparison checks proposed operations against the fixed scope
before dispatch. A batch is checked before its first mutation. Ordinary
requested edits still enter the same draft without an approval step.

## Find and investigate an event

Collect structured server stderr in your installation's restricted logs.
The event `assistant_action_out_of_scope` includes a UUID `reference`, UTC
`at`, `householdId`, `actorId`, `sessionId`, `taskId`, `source` (`text` or
`voice`), a known `tool` name and a bounded `reason` (`read_only_turn` or
`outside_requested_work`). The user's notice contains the same reference.
The event excludes raw conversation, map content, tool arguments and secrets.
The notice's **Kopiera felrapport** control copies the error, the original
request and available conversation/task identities. **Läs mer** previews the
same report. The report can contain private user text; keep it within the
installation's support process. Automatic failure notices are not repeated
in the visible conversation text.
Treat its identity metadata as access-controlled operational information.
Apply the installation's log retention and access policy.

1. Find the reference in server logs. Record the time, source and reason.
2. Ask the user which task they intended, without requesting unnecessary
   household content. Check whether the blocked action was unrelated or a
   false positive. A log event does not establish prompt injection as its
   cause.
3. Have the user inspect their draft and any save result before continuing.
   Earlier completed work is retained. The blocked turn does not retry
   automatically. An already registered save retains its recovery protocol.
4. Escalate repeated or unexplained violations through the installation's
   existing support process. Share the reference and minimal metadata;
   do not copy private map or conversation text into public reports.

Ambiguous requests require clarification. Malformed model decisions,
invalid tool arguments, stale versions and access failures do not by
themselves generate this security event. A failed scope check prevents the
current action; it does not erase existing draft work.

## Coverage and operating limits

Scope interpretation and edit comparison use the configured text model.
They add provider calls, latency and recorded usage for both text and voice
work. Monitor costs and task expiry after rollout. Existing task deadlines,
cancellation, consent and explicit-save checks remain in force.

Natural-language interpretation and comparison are fallible. Model output
cannot expand a read-only scope once established, but a wrong initial scope
or an incorrect edit comparison can miss a mismatch. Synthetic tests prove
enforcement for supplied decisions, not real-model resistance or production
exposure. Real provider behavior requires separately authorized evaluation.

External MCP clients keep their existing access to the same user's draft.
This protection does not verify their conversation or report their intent
violations. See the
[external-assistant scope decision](../../.out-of-scope/external-assistant-prompt-injection.md).
No external incident service, automatic email or dashboard is added.
