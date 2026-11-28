---
name: remediate-container-vulnerabilities
description: >-
  Assess High or Critical container findings and apply remediation the user
  selects. Recheck a labeled remediation ticket or review open cases against
  a replacement base image.
argument-hint: "[CI job URL | remediation ticket number or URL]"
---

# Remediate Container Vulnerabilities

Accept scan results or a PR or release job, a labeled remediation ticket by
number or URL, or the candidate and maintenance unit from an image update.
Recommend changes for assessments and apply selected remediation locally.
Leave branch publication, PRs, and ticket updates to a separate user-directed
workflow.

## Choose the review

- For scan evidence or a CI job, assess the findings on the exact scanned
  image. Complete this assessment whether the gate passes or blocks.
- Before an image update, recheck open tickets against the unmodified
  upstream candidate. For a supplied ticket, start with that recheck. Use the
  scanned-findings assessment when remediation is missing or no longer works.

## Assess scanned findings

1. Use the canonical gate provided by the caller or declared in repository
   instructions. If neither identifies it, find the likely gate and wait for
   user confirmation before using it. Bind evidence to the exact source commit,
   image digest, complete report, SBOM, and scanner database. For a PR, compare
   the failing commit with its current head and obtain current evidence when
   they differ. Use the repository's vulnerability-gate workflow and policy
   configuration to locate its evidence and determine which findings block it.
2. Reconcile any checklist from the caller with the gate's review markers
   and complete scanner reports. Account for every High or Critical finding,
   including nonblocking, supplemental, excepted, and no-fix findings. Group
   confirmed matches by exact image, affected package copy, and advisory.
   Merge scanner entries only when the package copy matches and advisory IDs
   match or their aliases are verified.
3. Search [remediation history](references/tracking.md#find-prior-remediation)
   before recommending a fix. Cite relevant tickets and explain whether their
   solution still applies. Recheck applicable exceptions for new fix evidence.
   Report active exceptions that are still needed and any that qualify for
   cleanup or require a new decision.
4. For every case, report the affected copy, advisory, scanners, gate
   disposition, and recommended fix. If the evidence does not support a fix,
   give a concrete next check and say what evidence it would establish. Give
   the [scan summary](#scan-summary) and any closure candidates separately.
   Finish when every checklist entry maps to a reported case. Mark unavailable
   evidence or outstanding assessment as pending.
5. Ask which remediation or exception changes to apply unless the user already
   selected them. After applying selected changes locally,
   use the [ticket template](references/template.md) to draft a labeled
   tracking ticket. For an existing ticket, draft the update and include the
   required label if missing.

## Recheck existing tickets before updating

For a supplied ticket, read its next checks, base selection, workaround, and
fix criteria. For a replacement image, find open tickets with the
[template's required label](references/template.md). Match by maintenance unit or
upstream image family. Read the ticket bodies to account for shared bases,
package locations, and all affected consumers.

Inspect the exact unmodified candidate. When starting from a ticket, resolve
the current supported upstream candidate. When called from an image update,
use the digest already selected by `$update-container-image`. Use an external
SBOM, package metadata, and authoritative fixed-version or backport evidence
to prove the affected copy is fixed or absent for every scope to be cleaned up.
A scan of an adapted image can miss a package its workaround already removes.

- **Fixed upstream:** Report the selected digest, obsolete remediation, and
  ticket that can close with the verified image change. List remaining closure
  checks. Apply only cleanup selected by the user. Use `$update-container-image`
  for the image change and `$manage-container-vulnerability-exceptions` for
  selected exception edits.
- **Still affected or evidence incomplete:** Keep the workaround and ticket
  open. Record the digest checked, what remains affected or uncertain, and
  the next check. During candidate review, return the result to the updater so
  it can test the current workaround.

## Remediate in order

Use this order to recommend a fix. When applying selected remediation, finish
each path with verified remediation or evidence of why it cannot solve the
case before trying the next path.

1. **Install a fix.** Verify a compatible fixed package or base from an
   authoritative source. Use RPM-aware comparisons for RPMs. Inspect both the
   selected base and any build-time package update steps for inherited packages.
   For a base change, pass the maintenance unit and candidate to
   `$update-container-image`. When called by the updater for a scanned finding,
   return the remediation and evidence to that update for verification.
   A package-list entry passes this step only when a rebuild installs the fix.
2. **Patch from source.** Obtain authenticated, pinned vendor or upstream
   sources and the actual fixes. Record source and patch hashes, signature
   verification, builder identity, recipe, output identity, notices, and
   provenance. Build the package and test its ABI, runtime configuration,
   crypto policy, and affected behavior in the target image. Keep its package
   identity truthful; changing a version to clear a scanner is not a patch.
   Record unavailable inputs, failed builds, or unresolved compatibility
   evidence when this path cannot deliver a verified fix.
3. **Remove unused software.** Inspect production entrypoints, application
   calls, health checks, native-library linkage, database and identity clients,
   and operational commands. Resolve the complete dependency removal list and
   report each package's purpose and evidence that production does not need
   it. When production uses a package, or use remains uncertain, recommend
   retaining it and continue to the exception step. Otherwise remove the
   reviewed list with normal dependency checks after all build-time consumers
   finish. Preserve accurate package inventory, trust material, licenses, and
   required runtime behavior. Record collateral tools removed and how their
   build-time or diagnostic purpose is served. Verify the final workloads.
4. **Ask about an exception.** If the finding blocks promotion, report why
   all three paths failed, residual exposure, and concrete next checks.
   Ask the user whether to add an exception, presenting its exact scope,
   accountable owner, rationale, and proposed case-specific review and expiry
   dates. Wait for the answer before changing the exception file. If approved,
   call the Skill tool with "manage-container-vulnerability-exceptions".
   The user decides the dates from the case; this workflow sets no fixed
   review or expiry interval. For findings outside the blocking policy or
   where the user declines, report the remaining exposure and next checks.

## Verify and record

- Rebuild all affected images from the selected base. Verify image identities,
  package inventory, and supported workloads. Run the declared gate against
  the exact rebuilt images and assess all remaining or new High and Critical
  findings. Retain the evidence. For source patches, also test the affected
  behavior. For removal, check native linkage and workloads after the complete
  package removal.
- Assess operator guidance and update affected build and runtime guidance
  using the repository's release process.
- Draft ticket updates using the tracking contract. Account for every affected
  image, remaining blocker, and temporary change. State what the user should
  watch for and what a later skill invocation must inspect to remove it.
- Apply [the tracking contract's closure rules](references/tracking.md#lifecycle).
  Recommend a PR and report which tickets can close on merge, which checks
  are pending, and which tickets should stay open.

## Scan summary

Report final counts by severity for each configured scanner. For completed
scans, show Critical and High counts even when zero and include every other
severity present. Say the scans found nothing only if every configured scan
completed and every total is zero. Mark missing or failed scans as incomplete
and link the evidence. Report the gate decision separately.
