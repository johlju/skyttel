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

## Establish the case

1. Use the canonical gate provided by the caller or declared in repository
   instructions. If neither identifies it, find the likely gate and wait for
   user confirmation before using it. Bind evidence to the exact source commit,
   image digest, complete report, SBOM, and scanner database. For a PR,
   confirm the job scanned the current proposed merge or head and refresh
   evidence for a superseded revision. Use the
   [Skyttel gate](../../../docs/operations/security-checks.md#container-image-vulnerability-gate)
   to locate evidence. The Grype policy blocks High and Critical findings
   even when a fix is unavailable.
2. Read the unfiltered results for the [scan summary](#scan-summary). Select
   only High or Critical findings for remediation review, including findings
   without a reported fix and excepted findings. Handle confirmed matches as
   one case by image, package copy, and advisory or verified alias. Identify
   which findings block promotion and why.
3. Search [remediation history](references/tracking.md#find-prior-remediation)
   before recommending a fix. Cite relevant tickets and explain whether their
   solution still applies. Recheck applicable exceptions for new fix evidence.
   Report active exceptions that are still needed and any that qualify for
   cleanup or require a new decision.
4. Give the scan summary, proposed fixes in the order below, and any closure
   candidates. Ask which cases to remediate unless the user already selected
   them. Apply only selected changes. After applying remediation locally,
   use the [ticket template](references/template.md) to draft a labeled
   tracking ticket. For an existing ticket, draft the update and include the
   required label if missing.

## Recheck against the upstream image

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
  the next check. For a direct ticket request, continue below when remediation
  is missing or the existing workaround no longer passes. During candidate
  review, return the result to the updater so it can test the current workaround.

## Remediate in order

Finish each path with either verified remediation or recorded evidence of why
it cannot solve the case. Continue to the next path only on the latter result.

1. **Install a fix.** Verify a compatible fixed package or base from an
   authoritative source. Use RPM-aware comparisons for RPMs. Inspect both the
   selected base and any build-time package update steps for inherited packages.
   For a base change, pass the maintenance unit and candidate to
   `$update-container-image`. When called by the updater for a blocking finding,
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
   Ask the user whether to add an exception. Present its exact scope,
   owner, reviewer, rationale, and proposed review plan and expiry within the
   Skyttel policy's 30-day limit. If approved, invoke
   `$manage-container-vulnerability-exceptions`. For findings outside the
   blocking policy or where the user declines, report the remaining exposure
   and next checks.

## Verify and record

- Rebuild all affected images from the selected base. Verify image identities,
  package inventory, and supported workloads. Run the declared gate against
  the exact rebuilt images and retain the evidence. For source patches, also
  test the affected behavior. For removal, check native linkage and workloads
  after the complete package removal.
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
