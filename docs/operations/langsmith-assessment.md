# Diagnose failures and assess LangSmith

This procedure is for Skyttel's sole developer and installationsansvarig.
Use it after a separately authorized rollout of the tracing integration.
Complete the [account and Render rollout](langsmith-rollout.md) first.
Writing or reviewing this guide does not authorize production configuration,
deployment, household-data uploads, assessment comments, or billable model,
voice, or judge calls. Available credentials do not provide that authorization.

The developer investigates failures. The installationsansvarig controls
installation-wide sending and resolves delivery problems. Household
administrator status alone does not grant that installation authority.

Traces intentionally contain exact conversation text, relevant model inputs
and outputs, and household tool requests and results. This is not an
anonymization contract. Raw audio, authentication credentials, transport
headers, environment variables, and unrelated or unreviewed metadata must
stay out of traces. If they appear, follow the stop procedure below.

## Prepare the assessment

Before starting, confirm the actual account uses the free default personal
LangSmith organization, with one developer and no payment method. Verify
current allowance, remaining quota, access, and the tracing project's rolling
14-day base retention. A research finding or a successful local test does not
verify the account. Use the
[LangSmith billing guidance](https://docs.langchain.com/langsmith/billing)
to inspect the account; do not add a card, buy a plan, or create an organization
that requires payment to continue this procedure.

Designate one pilot tracking issue for the sanitized assessment record. Record
the start and end of the first 14 days of everyday use there, plus setup effort
in minutes. Include any effect on everyday use separately from investigation
time. Do not copy household information into the issue or repository.

Keep three different periods separate:

- The assessment samples failures during the first 14 days of everyday use.
- Base trace retention rolls separately for each trace. Inspect evidence
  before it expires; do not expect all evidence to survive until the summary.
- The integration continues until product removal, subject to opt-out and
  the stop conditions below. Day 14, case 10, and an inconclusive assessment
  do not disable sending.

No scheduled assessment service, automatic window extension, recurring review
requirement, or automatic shutdown is part of this procedure. Check delivery
health when investigating a failure or changing configuration.

## Select natural failures in occurrence order

1. During everyday use, assign neutral case numbers to the first ten natural
   failures in occurrence order. Review all failures if fewer than ten occur
   within the window. Do not inject faults or replace a difficult case with
   one that has better trace delivery.
2. Include a failure even when its trace is missing, incomplete, or impossible
   to correlate. Record its mode as text, voice, or both. Missing evidence
   belongs in the assessment; successful delivery is not an admission rule.
3. Begin each sampled review within 48 hours of the failure. If this deadline
   cannot be met, record the missed deadline as a procedure deviation and
   identify any lost evidence. Do not hide the case or automatically extend
   the sample or window.
4. Limit active investigation to 30 minutes per case. At the limit, record
   the current finding and leave remaining questions unresolved. Do not
   extend the budget to obtain a favorable diagnosis.

## Investigate each proposed cause

1. Check the application's outcome and delivery health separately. Last
   delivery, drop counts, and safe error categories describe trace delivery.
   They do not prove that household work succeeded. Health values reset on
   process restart and cannot provide a complete history.
2. Find the affected backend-task trace in the intended LangSmith project.
   For voice, inspect the separate voice-session trace and its explicit
   delegation links to backend tasks. Use the recorded conversation, request,
   task, delegation, provider-call, tool-execution, and span identities as
   applicable. Do not infer parentage from nearby timestamps or count shared
   backend spans twice.
3. Inspect the relevant exact text, model action, model attempt, MCP work,
   and backend result in LangSmith. Distinguish failure, cancellation,
   disconnection, incomplete work, and a successful observed ending. A start
   with no observed ending stays incomplete. Record missing endings,
   delivery gaps, and unknown relationships as limitations.
4. State a proposed cause and the LangSmith evidence that supports it. Keep
   that evidence in LangSmith. Do not download traces, reconstruct lost
   household payloads, add recordings, or create a local diagnostic archive.
5. Check the cause independently. Use relevant code, existing application
   records available through permitted access, or a test with invented data
   that demonstrates the same defect. An expected outcome, a plausible
   explanation, or a successful retry alone does not prove the cause.
   Billable provider tests need separate explicit authorization.
6. Identify a useful corrective action, such as a code correction or an
   operator action. Traces confer no authority to change the household map,
   repeat a save, or reinterpret a sparkvitto. Application verdicts and
   installation cost accounting remain authoritative.
7. Classify each proposed diagnosis using the following rules, then record
   the sanitized case comment. Keep incorrect and unresolved proposals in
   the record even when another proposal is verified.

<!-- markdownlint-disable MD013 -->
| Status | Required conclusion |
| :-- | :-- |
| Verified | LangSmith evidence establishes the cause and a separate check supports it. Record the useful corrective action. |
| Incorrect | The separate check contradicts the proposed cause. Record the general reason and any remaining questions. |
| Unresolved | Evidence or independent checking is insufficient, conflicting, missing, or unfinished at the time limit. |
<!-- markdownlint-enable MD013 -->

## Record a sanitized case comment

Use this format in the designated pilot tracking issue. Replace placeholders
with short, general descriptions. A supporting-evidence entry describes the
kind of operation and observed status; it does not copy its payload. Do not
include conversation text, tool arguments or results, household identifiers,
trace identifiers or links, credentials, screenshots, or attachments. Keep
the record useful after trace expiry without turning it into another archive.

```text
Case: 01 (occurrence order)
Mode: text / voice / both
Review begins within 48 hours: yes / no; limitation if no
Proposed cause: general defect or failure category
LangSmith support: general operation/status that supports or challenges it
Independent check: code / application record / invented-data test
Diagnosis: verified / incorrect / unresolved
Missing evidence or unresolved questions: none / general limitation
Useful corrective action: general action / not established
Active investigation: N minutes, at most 30
```

Add a separate diagnosis entry for each additional proposed cause. Keep the
total active investigation for the case within 30 minutes. Record setup effort
and effects on everyday use separately; do not include them in this number.

## Assess usefulness at the end of the window

Use the whole ordered sample, including missing and incomplete traces. A
positive finding requires at least three reviewed failures and a verified,
useful diagnosis for text plus a verified, useful diagnosis for voice. Each
mode's diagnosis must use LangSmith evidence to establish its cause and have
an independent check. Report incorrect and unresolved diagnoses alongside
the verified ones. A partially met criterion is not a combined positive result.

Report **inconclusive** if there are too few failures, insufficient mode
coverage, or lost evidence needed to assess the criteria. If sufficient
evidence exists but no useful verified diagnosis emerges, report
**usefulness not demonstrated**. Report an early stop and its reason
separately. Do not claim statistical reliability, proven long-term value, or
an improvement over an unretained local baseline.

Use this sanitized summary format in the same tracking issue:

```text
Assessment window: start / end; 14 days, without automatic extension
Ordered sample: N natural failures; text N, voice N, both N
Diagnoses: verified N, incorrect N, unresolved N
Useful verified text diagnosis: neutral case number / none
Useful verified voice diagnosis: neutral case number / none
Missing evidence and coverage limits: general description
Procedure deviations: none / general description
Finding: positive / inconclusive / usefulness not demonstrated
Early stop: no / general reason
Setup effort: N minutes
Active investigation: N minutes total; no case exceeds 30 minutes
Effects on everyday use: general description
Corrective actions: general description
```

The summary ends this assessment, not the integration. Keep rolling base
retention during continued use. Do not add experiments, automatic evaluation,
retention upgrades, dataset copies, or bulk export to preserve assessment
evidence. LangSmith's
[retention guidance](https://docs.langchain.com/langsmith/usage-and-billing)
explains that trace content expires separately from some analytics and billing
metadata; do not promise physical deletion of every metadata category within
14 days.

## Stop sending and handle removal

Stop sending if tracing disrupts normal use, sends excluded data, or cannot
remain within free-service limits. Isolated lost evidence alone is not a stop
condition. The installationsansvarig uses the installation-wide sending
control to opt out. This discards pending events and cancels active delivery
where possible; an already sent request cannot be recalled. Record the reason
in sanitized form. Resolve quota or credential suspension before explicit
recovery; do not add a payment method or paid feature to recover sending.

Opt-out and cloud deletion are separate actions. For unwanted data, request
deletion of the affected traces through the permitted LangSmith account.
On product removal, stop sending first, remove the integration's configuration
and credentials, and request deletion of all remaining integration traces.
Follow the current
[LangSmith deletion procedure](https://docs.langchain.com/langsmith/data-purging-compliance)
and repeat queries for the relevant project and traces to check removal.
Deletion is asynchronous. Record outstanding cleanup in sanitized form;
an accepted request or an empty local buffer does not prove cloud removal.
Some analytics or billing metadata can remain. Assessment completion alone
does not trigger final cleanup.

## Use agent assistance within permitted access

The developer keeps control of the one permitted account. An agent can inspect
relevant repository code, reason about sanitized findings, or help construct
tests with invented data. Give it only the access and information authorized
for the current investigation. Do not copy household trace payloads into
issues, repository files, or agent artifacts. Missing account access does not
authorize reconstruction, bulk export, or broader access. If direct inspection
is needed but authorized access is unavailable, keep the diagnosis unresolved.

Do not require a second seat, shared credentials, unrestricted account access,
a payment method, paid services, dataset copies, or bulk export. Separately
authorize any live uploads or billable provider calls before executing them.
