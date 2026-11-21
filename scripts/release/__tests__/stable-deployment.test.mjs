import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createReleasePlan } from '../plan.mjs';
import { stableDeploymentSource, validateStableIdentity } from '../stable-deployment.mjs';

const repository = 'viscalyx/skyttel';
const commit = 'a'.repeat(40);
const workflow = '.github/workflows/release.yml';
const ref = 'refs/tags/v0.2.0';
const run = {
  id: 42,
  path: workflow,
  head_repository: { full_name: repository },
  head_branch: 'v0.2.0',
  head_sha: commit,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};

test('stable deployment binds the published image to the successful upstream tag push', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-stable-event-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = {
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'b'.repeat(40),
    STABLE_RELEASE_SHA: commit,
    GITHUB_EVENT_PATH: join(directory, 'event.json'),
  };
  const writeEvent = (workflowRun) =>
    writeFileSync(
      env.GITHUB_EVENT_PATH,
      JSON.stringify({ action: 'completed', workflow_run: workflowRun }),
    );
  writeEvent(run);
  const source = stableDeploymentSource(env);
  assert.deepEqual(source, { repository, ref, commit, eventName: 'push', runId: '42' });
  assert.throws(() => stableDeploymentSource({ ...env, GITHUB_REF: 'refs/heads/feature' }));
  for (const sha of [undefined, 'short', env.GITHUB_SHA]) {
    assert.throws(() => stableDeploymentSource({ ...env, STABLE_RELEASE_SHA: sha }));
  }
  const identity = {
    ...createReleasePlan({
      ...source,
      gitVersion: { Sha: commit, SemVer: '0.2.0', FullSemVer: '0.2.0' },
    }),
    digest: `sha256:${'c'.repeat(64)}`,
    origin: { ref, runId: '42', workflow: `${repository}/${workflow}` },
  };
  validateStableIdentity(identity, source);
  for (const changes of [
    { commit: env.GITHUB_SHA },
    { digest: 'sha256:bad' },
    { origin: { ...identity.origin, ref: 'refs/heads/main' } },
    { origin: { ...identity.origin, runId: '43' } },
    { origin: { ...identity.origin, workflow: `${repository}/.github/workflows/ci.yml` } },
  ]) {
    assert.throws(() => validateStableIdentity({ ...identity, ...changes }, source));
  }
  for (const changes of [
    { path: '.github/workflows/ci.yml' },
    { head_repository: { full_name: 'fork/skyttel' } },
    { head_branch: 'main' },
    { head_branch: 'v0.2.0-preview.1' },
    { head_branch: 'v0.2.0\n' },
    { head_sha: 'short' },
    { head_sha: env.GITHUB_SHA },
    { id: 0 },
    { conclusion: 'failure' },
    { event: 'workflow_dispatch' },
  ]) {
    writeEvent({ ...run, ...changes });
    assert.throws(() => stableDeploymentSource(env));
  }
});

test('a stable tag must resolve to its source commit and that commit must be on origin/main', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skyttel-stable-tag-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Release Test', '-c', 'user.email=release@example.test', ...args],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  git('init', '--initial-branch=main');
  git('commit', '--allow-empty', '-m', 'Reviewed release source');
  const reviewed = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', reviewed);
  git('tag', '-am', 'Stable release', 'v0.2.0');
  git('switch', '-c', 'feature');
  git('commit', '--allow-empty', '-m', 'Branch-only source');
  const unreviewed = git('rev-parse', 'HEAD');
  git('tag', 'v0.3.0');
  const verifySource = (tag, sha) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { requireStableSource } from ${JSON.stringify(new URL('../plan.mjs', import.meta.url).href)};
          requireStableSource(process.argv[1], process.argv[2]);`,
        `refs/tags/${tag}`,
        sha,
      ],
      { cwd, encoding: 'utf8' },
    );
  assert.equal(verifySource('v0.2.0', reviewed).status, 0);
  assert.match(verifySource('v0.2.0', unreviewed).stderr, /does not match the release commit/u);
  assert.match(verifySource('v0.3.0', unreviewed).stderr, /approved on origin\/main/u);
});
