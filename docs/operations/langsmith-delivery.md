# Bounded LangSmith delivery

This contract helps installation operators interpret delivery health and
recover from loss or suspension. Normal startup connects the real sender when
its explicit destination and credential configuration is present. Configured
sending defaults on; a stored opt-out or suspension remains effective.
Complete the [rollout runbook](langsmith-rollout.md) before the first enabled
release. Use the [assessment procedure](langsmith-assessment.md) afterward.

## Evidence and loss

Each accepted backend task has one stable trace root. MCP executions and model
attempts have explicit child identities. Starts remain incomplete until an
observed ending updates them. Missing or discarded endings never imply success.
The sender carries exact admitted task requests, selected backend results,
MCP arguments and text results, model instructions, conversation input, tool
definitions, reviewed model output and actions, and model-attempt metadata.
Each model response retains its admitted actions together. Content is eligible
only when its conversation starts under the current LangSmith information;
later saved acceptance does not make an older conversation eligible.
Each voice session has a separate root. Its creation attempt contains the
prepared Live instructions and reviewed session result. Transcript fragments,
delegations, commentary and outgoing instructions have independent child
identities. An observed send records the local send outcome; it does not prove
that audio was delivered or heard. Session endings distinguish completion,
failure, disconnection, cancellation and missing final evidence.

Delegated work retains its own backend root and model and MCP children. Explicit
links join it to the calling voice session and delegation. Voice preparation
can also link a separate backend summary operation. A summary within an
existing backend task retains that task's ownership. Standalone summaries have
no inferred voice link. Recovery and retry requests have separate identities;
an accepted no-op can have a backend root with no model or MCP children.

Use the exact UUID in the `trace_id` filter to find a linked trace. The link
metadata contains the trace and span identities; the sender does not query the
cloud to resolve them. Local ingestion checks do not verify cloud rendering.
Evidence excludes raw audio, authentication, headers, environment values and
unrelated provider metadata.

Delivery runs independently of household work. The sender drops whole events
when they exceed a limit or cannot be serialized. It never shortens content or
substitutes a successful-looking result. Installation health shows safe error
categories and a dropped-event count; it contains no trace payload or raw
provider error. A successful delivery means ingestion accepted one operation;
it does not establish that a complete trace is available in the cloud.

## Resource limits

All limits include pending and active sender work:

- At most 1,000 events or 16 MiB of serialized data, whichever is reached first.
- At most 1 MiB for one serialized event, including its SDK envelope.
- At most 60 seconds from observation until an event expires.
- One upload at a time, including response cleanup and retries.
- At most five seconds for one upload attempt and two retries per event.
- At most two seconds to finish delivery during application shutdown.

Admission leaves conservative headroom for serialization and transport copies.
Capacity loss can therefore occur before pending payloads alone reach 16 MiB.
These limits cover serialized diagnostic data and its representations; they
are not a limit on total process or operating-system memory.

Buffers exist only in memory. Opt-out discards pending events and aborts active
delivery where possible. Shutdown either finishes or discards accepted work.
Restart and re-enabling admit only new events. No diagnostic payload enters the
database, household archives, files, disk spools or replay stores.

## Failure and recovery

Temporary network and server failures receive bounded retries within the event
lifetime. HTTP 401 and 403 suspend sending for credentials. HTTP 429 suspends
sending conservatively for quota or rate limits; it does not prove a monthly
quota exhaustion. Suspension discards buffered events, survives process restart,
and requires the operator to resolve the cause and explicitly restart sending.
Do not add a payment method for recovery. See the
[installation control guidance](operator-upgrade-notes.md#installation-diagnostic-sending-control).
