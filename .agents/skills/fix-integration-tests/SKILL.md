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
- Run the suite the user requested.
- If no suite is named, run the default integration suite, then prodlike if
  the project defines it.
- Treat user-provided spec paths as the initial phase list.
- Keep each failing spec file as one phase.
- Edit failing specs and the shared helpers they use under `tests/support/`.
  Keep helper changes limited to test setup, assertions or measurements;
  run affected helper consumers. Preserve production contracts and assertions.
- Do not run a full suite while fixing a phase.
- Do not abort or restart a slow test only because it exceeds an arbitrary
  duration; passing completion matters. Abort only when the test is not
  responding, the runner is stuck, or memory pressure risks killing the
  devcontainer.

## Project Setup

- Read `package.json`, the Playwright configuration, and the project's testing
  guide to identify available suites, setup steps, and commands for running a
  suite or a single spec. Use the project's scripts and supported arguments.
- Chunks: only when project scripts, runner configuration, or testing docs
  define integration-test chunks, read [CHUNKS.md](CHUNKS.md) before building
  the phase list. Otherwise, use the suite and spec workflow below.
- Complete the documented test setup before running tests.

## Workflow

1. Build the phase list:
   - User supplied paths: use those spec files.
   - No paths: run the selected suite with its project script and collect
     failing spec files from Playwright output.
2. Pick one failing spec file.
3. Re-run that spec with the selected suite's spec command.
4. Inspect Playwright output, traces, screenshots, console errors, app-server
   logs, and available memory diagnostics.
5. Fix the smallest test defect that explains the failure. Repair a shared
   helper once instead of copying a corrected implementation into a spec.
6. Re-run the same spec until it passes.
7. Repeat steps 3-6 for each failing spec file.
8. Run the selected suite after all known phases pass.
9. If new spec files fail, repeat from step 2.
10. If dev and prodlike are both in scope, finish dev before starting prodlike.

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
- Report final pass/fail status and the exact commands run.
