# State and recovery

## Journal and ownership

- Store the journal under `<git-common-dir>/implement-stack/<spec-number>/`
  and put its location on the Spec. Keep runtime state out of commits.
- Claim a single writer through atomic directory creation at
  `<git-common-dir>/implement-stack/writer.lock`; record session and Spec.
  Check the existing owner before resuming or taking over. Tracker assignment
  to the same user does not prove that another session has relinquished work.
- The orchestrator owns stack mutations, publication, and tracker writes.
  gh-stack's mutation lock does not coordinate workers' Git commands; require
  explicit ownership handoff before changing their branches.
- Reserve capacity for workers' nested `code-review` agents before dispatch;
  queue excess workers rather than skipping their reviews.
- Record the fixed point, target, verified tip, dependencies, ordered layers,
  owners/worktrees, dispatch bases, returned and integrated heads, PR/stack
  identities, expected remote heads, and verification evidence.
- Journal each mutation's intent and observed result. Before rewriting,
  preserve affected heads under `refs/implement-stack/<batch>/...` and copy
  the gh-stack catalog. Retain the tool's own recovery journals. Record
  tracker writes separately from integration so either can resume.

## Conflicts and failed checks

- Keep the last verified tip. Pause new integrations and ordinary dispatch
  until the combined result is valid; already running workers may continue.
- For gh-stack conflicts, resolve and stage in the reported worktree, then
  use `gh stack rebase --continue`. For a substantive fix, transfer that
  worktree to a fresh repair agent for resolution edits only; the orchestrator
  retains continuation. This is a paused operation, not a normal `implement`
  task that can commit and review independently.
- Once the operation completes, route code fixes through the failing-layer
  path below. Preserve useful resolution edits before aborting, and use the
  matching tool's abort only when restoration cannot discard newer work.
  Check both refs and metadata afterward; adoption can survive a rebase abort.

## Repair a failing layer

A later repair layer cannot fix checks on an earlier PR's head. Use this
path when that earlier head fails; append cumulative improvements only when
the preceding layers remain valid.

1. Preserve the failing layer and its suffix, obtain ownership handoffs, and
   return affected published PRs to draft. Pause integration and dispatch.
2. Dispatch a fresh worker using the main skill's dispatch instructions, based
   on the failing layer's exact head. Keep its repair branch outside the stack.
3. Inspect the returned descendant commit. In the failing layer's clean
   worktree, confirm the expected old head and fast-forward the work branch:

   ```bash
   git merge --ff-only <repair-commit>
   gh stack rebase --no-trunk
   ```

4. Record the rewritten suffix. Return to integrated verification and batch
   review, then republish affected heads with recorded leases. Each changed
   PR needs valid checks before becoming ready again.
5. Add repair evidence to the original issues without reopening them. Retain
   the repair branch as recovery evidence, not another PR.

## Resume and partial publication

- Re-establish ownership; compare the journal with worktrees, agents, refs,
  gh-stack state, remote stack/PRs, and target before another mutation.
- Complete or safely abort a paused operation using its recorded worktree
  and tool version. Native Git and gh-stack rebases have different recovery
  journals; continue the operation actually in progress.
- Preserve a missing worker's work; reassign only after its former owner has
  stopped. Reconcile unexpected remote changes rather than replacing the
  recorded lease with the newly observed head.
- After interrupted publication, read remote state, find existing PRs by
  exact head/repository, and retry only missing steps. Check existing tracker
  comments and closure before repeating writes.
- External merge, closure, auto-merge, or queueing is a divergence to report;
  leave further publication paused rather than merging or rebuilding the
  stack automatically. Preserve incomplete work and record the next action.
