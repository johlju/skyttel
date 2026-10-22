---
name: fix-integration-tests
description: >-
  Run and repair Playwright integration tests in focused phases with test-only
  edits. Use when asked to run, triage, or fix
  `npm run test:integration`, `npm run test:integration:prodlike`, or
  specific `tests/integration/**/*.spec.ts` failures.
---

# Fix Integration Tests

## Scope

- Apply [test placement](../maintain-manual-tests/references/cases.md#test-placement)
  when changing coverage or moving technical checks between suites.
- Edit failing specs and the shared helpers they use under `tests/support/`.
  Keep helper changes limited to test setup, assertions or measurements.
  Preserve production contracts and assertions.
- Do not run a full suite while fixing a phase.
- Do not abort or restart a slow test only because it exceeds an arbitrary
  duration. Stop when the user changes the requested scope, the runner is
  stuck, or memory pressure risks killing the devcontainer.

## Project Setup

- Read `package.json`, the Playwright configuration, and the project's testing
  guide to identify available suites, setup steps, and commands for running a
  suite or a single spec. Use the project's scripts and supported arguments.
- Chunks: only when project scripts, runner configuration, or testing docs
  define integration-test chunks, read [CHUNKS.md](CHUNKS.md) before building
  the phase list. Otherwise, use the suite and spec workflow below.
- Complete the documented test setup before running tests.

## Workflow

1. Call the Skill tool with "select-integration-tests"
   ([SKILL.md](../select-integration-tests/SKILL.md)), supplying user-provided
   paths, reported failures and the current change. Group its selected
   scenarios by spec file into phases; execute its required runs to collect
   failures.
2. Pick one failing spec file.
3. Inspect its existing failure evidence; reproduce only when needed for diagnosis.
4. Inspect Playwright output, traces, screenshots, console errors, app-server
   logs, and available memory diagnostics.
5. Fix the smallest test defect that explains the failure. Repair a shared
   helper once instead of copying a corrected implementation into a spec.
6. Call the Skill tool with "select-integration-tests" after the fix;
   execute its required runs.
7. Repeat steps 3-6 for each failing spec file.
8. Supply results to "select-integration-tests" to assess completion and
   prepare verification reporting. Return to step 2 for remaining failures
   that can be repaired within this skill's scope.
9. If dev and prodlike are both in scope, finish dev before starting prodlike.

## Fix Rules

- Prefer current product behavior and repository docs over stale test
  expectations.
- Do not weaken assertions, add arbitrary waits, or skip tests to hide
  failures.
- Use Playwright locator, navigation, and state waits instead of fixed
  timeouts.
- Treat env-only failures as setup issues before changing spec code.
- Do not edit production code, including application, component, hook, runtime
  library, translation, config, migration, or seed files.
- If a production change is required, report
  `PRODUCTION CHANGE NEEDED: {link to report}`.
  - Write a detailed report in the system's temporary folder explaining what
    needs to change and why.
  - Group the report by failing spec file.
  - For each spec group, include the command, failure evidence, suspected
    production files or symbols, required behavior change, and blocked tests.
- Continue with remaining test-only phases after writing the report.
- Respect Playwright config differences between dev and prodlike runs.
