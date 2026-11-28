---
name: resolve-dependency-drift
description: Resolve a Dependabot proposal or reported drift for a toolchain or container image.
disable-model-invocation: true
---

# Resolve Dependency Drift

Recommend changes for assessments. Apply requested changes locally and report
completed and pending checks. Leave branch publication, PRs, and ticket
updates to a separate user-directed workflow.

## Workflow

1. Read the Dependabot PR or drift report for the affected dependency,
   current and proposed versions, and required checks. Find its consumers
   and read the [Skyttel update policy](../../../docs/operations/security-checks.md#versions-and-updates).
   Use `.github/dependabot.yml` to identify monitored ecosystems and paths.
2. For containers, hand the dependency, evidence, and proposed candidate
   to `$update-container-image`. That skill owns candidate selection, review
   of remediation issues, pin changes, and verification. Continue at
   **Confirm resolution** after it returns. For toolchains, continue below.

## Update a toolchain

1. Create one isolated directory with
   `mktemp -d /tmp/resolve-dependency-drift.XXXXXX`.
2. Start a background agent with `$research`.
   - For npm, research compatibility, lifecycle-script policy, install paths,
     and verification using primary npm and Node sources.
   - For a standalone tool or Action, research the supported release,
     action compatibility, release assets, published digests, and every
     synchronized installer and CI surface using primary project sources.
   - Override `$research` output handling for this invocation: write its single
     Markdown result inside the exact temporary directory, never in the
     repository.
3. Continue repository discovery while research runs. Read and apply the
   temporary findings before choosing the target or editing.
4. Apply the policy for the issue's maintenance unit:
   - **npm toolchain:** Set the exact reviewed npm version in the root
     `package.json` `packageManager` field. Synchronize its install paths.
     Preserve pinned script approvals, explicit denials, fail-closed lifecycle
     policy, and LTS Node compatibility.
   - **Standalone tool or Action:** Synchronize installer and CI versions, supported
     architecture checksums, and action pins. Preserve compatibility, immutable
     identities, and alignment coverage.
5. Update affected focused tests, generated locks or configuration, and
   operator, developer, or CI documentation.
6. Run the repository's relevant verification:
   - For npm, include clean installs, pending script approval checks,
     `npm audit`, and `npm run check`. Use `npm run test:container` when the
     production build's npm changes.
   - For a standalone tool or Action, verify alignment and run the affected
     installer and CI checks.
7. Remove only the temporary directory created for this run after applying its
   findings.

## Confirm resolution

Compare every owned reference with the reviewed upstream version or digest.
For a Dependabot proposal, check its published findings and checks for the
exact PR head. Report checks still pending and any remaining drift.

## Guardrails

- Discover surfaces dynamically; do not rely on an issue file inventory.
- Change only the maintenance unit named by the issue.
- Resolve compatibility work instead of evading the available supported
  release.
- Never use floating versions for project-bound npm dependencies or the
  canonical npm toolchain.
- Preserve existing version and integrity policies for standalone tools.
- Keep explicit lifecycle-script approvals limited to reviewed dependencies.
