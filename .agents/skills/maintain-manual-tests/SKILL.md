---
name: maintain-manual-tests
description: >-
  Synchronize manual cases, integration/browser counterparts and mapped
  technical evidence. Use when planning or changing their scenarios or identities,
  maintaining the manual-test index, or editing the testing guide.
---

# Maintain Manual Tests

## Workflow

For index-only or testing-guide-only work, use steps 5 and 6. For case or
counterpart or mapped-evidence changes, start at step 1 and follow the
applicable branches.

1. Scope the change. Identify every requested scenario, its accepted
   requirements, affected specs, and existing cases under `docs/manual-tests/`.
   Apply [test placement](references/cases.md#test-placement) before choosing
   a suite. Derive expected behavior from those requirements. Finish when every
   in-scope scenario has an expected outcome and affected files identified;
   backfill unrelated scenarios only when requested.
2. Classify and implement each change:
   - Functional scenario additions, revisions, or removals: synchronize manual
     cases and integration/browser coverage in the same change.
   - Selector, flake, title, setup, or refactoring maintenance: preserve
     behavior and coverage; update manual cases when instructions or references
     change. These changes may stand alone without production edits.
   Keep production fixes within authorized requirements and preserve valid
   assertions when a test exposes a defect. Finish when every changed scenario
   is synchronized and maintenance edits preserve existing coverage.
3. For case additions or revisions, read
   [case writing](references/cases.md#case-writing) and
   [the area template](templates/area.md). Use the full template for a new area
   or its case section within an existing area. Finish when every placeholder
   is replaced, preparation and UI steps are runnable in Swedish, and all
   expected results are observable in the current workflow.
4. For affected cases or test identities, read
   [mapping and identity](references/cases.md#mapping-and-identity).
   Finish when every ordinary case has one discovered functional counterpart
   with equivalent actions and outcomes, human observations are explicit, and
   every renamed, moved, split, or retired ID follows the identity rules.
5. Group cases by application area, independent of demo fixtures or individual
   pages. Maintain `docs/manual-tests/README.md` as the area index; update its
   links and summaries whenever area files or their documented coverage
   change. Keep application test steps in manual cases. Keep
   `docs/development/testing.md` focused on test execution, without links to
   manual cases or their index.
   Finish when area grouping, index links, and summaries match the documented
   coverage and each document serves its intended audience.
6. Validate the change:
   - Run the repository's Markdown and spelling checks on changed documents,
     including new files outside the configured check list. Resolve local links.
   - Run `npm run test:manual-mapping` for complete migrations. During staged
     migration, select all affected areas with repeated `--area` arguments:
     `npm run test:manual-mapping -- --area docs/manual-tests/<file>.md`.
     Scoped validation checks selected cases and global manual/functional ID
     uniqueness;
     full validation also requires every ordinary integration/browser test
     to have one manual counterpart.
   - For test behavior or execution changes, run affected suites using
     [the testing guide](../../../docs/development/testing.md).
     For title-only changes, verify discovery.
   Finish when applicable checks pass and every affected ordinary case's
   actions and outcomes have been compared with its counterpart; mapping
   validation checks structure, so functional equivalence requires that
   comparison.
   Report updated cases, performed checks, and remaining coverage gaps.
   Report manual execution only when actually performed.
