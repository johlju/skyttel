import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { deploymentChanges, main } from '../deployment-changes.mjs';
import { isProductionInput } from '../production-inputs.mjs';

test('all production Docker COPY inputs trigger deployment; development and release tooling do not', () => {
  const dockerfile = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');
  for (const line of dockerfile
    .split('\n')
    .filter((line) => line.startsWith('COPY ') && !line.includes('--from='))) {
    for (const path of line.split(/\s+/u).slice(1, -1)) {
      assert.ok(
        isProductionInput(path === 'src' || path === 'migrations' ? `${path}/file` : path),
        path,
      );
    }
  }
  for (const path of ['Dockerfile', '.dockerignore', 'compose.yaml', '.node-version'])
    assert.ok(isProductionInput(path), path);
  for (const path of [
    'docs/operations/render.md',
    '.devcontainer/Dockerfile',
    '.devcontainer/azure/Dockerfile',
    'tests/unit/app.test.ts',
    '.github/workflows/release.yml',
    'scripts/release/deploy.mjs',
  ])
    assert.equal(isProductionInput(path), false, path);
});

test('the full push diff covers multiple commits, deletion, renames, and initial branch creation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-production-changes-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const write = (path, text) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  const commit = () => {
    git('add', '.');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'test',
    );
    return git('rev-parse', 'HEAD');
  };
  const changes = (before, after) =>
    deploymentChanges({ before, after, ref: 'refs/heads/main', eventName: 'push' }, directory);
  try {
    git('init', '-q');
    write('src/app.ts', 'original');
    const initial = commit();
    write('docs/readme.md', 'documentation');
    write('.devcontainer/Dockerfile', 'FROM development');
    const docs = commit();
    assert.deepEqual(changes(initial, docs), []);
    assert.deepEqual(changes('0'.repeat(40), docs), ['src/app.ts']);
    write('src/app.ts', 'updated');
    commit();
    write('docs/readme.md', 'more documentation');
    const multi = commit();
    assert.deepEqual(changes(docs, multi), ['src/app.ts']);
    renameSync(join(directory, 'src/app.ts'), join(directory, 'docs/example.ts'));
    const renamed = commit();
    assert.deepEqual(changes(multi, renamed), ['src/app.ts']);
    write('package-lock.json', '{}');
    const dependency = commit();
    rmSync(join(directory, 'package-lock.json'));
    assert.deepEqual(changes(dependency, commit()), ['package-lock.json']);
    assert.throws(() => changes('f'.repeat(40), initial));
    assert.throws(() => changes(undefined, initial), /both push revisions/);
    assert.deepEqual(
      deploymentChanges({ ref: 'refs/tags/v1.0.0', eventName: 'push' }, directory),
      [],
    );
    assert.deepEqual(
      deploymentChanges({ ref: 'refs/heads/main', eventName: 'pull_request' }, directory),
      [],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('only Render deployment is gated and the skip decision is visible in the workflow summary', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(workflow.split('permissions:')[0], /paths:/);
  assert.match(workflow, /deploy: \$\{\{ steps\.deployment\.outputs\.deploy \}\}/);
  assert.match(workflow, /node scripts\/release\/deployment-changes\.mjs/);
  assert.match(workflow, / {2}deploy:\n[^\n]*\n {4}if: .*needs\.plan\.outputs\.deploy == 'true'/);
  assert.doesNotMatch(workflow.split('  deploy:\n')[0], /needs\.plan\.outputs\.deploy/);
  assert.match(workflow, /Retain sanitized deployment evidence\n {8}if: always\(\)/);
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-deployment-output-'));
  try {
    const eventPath = join(directory, 'event.json');
    const output = join(directory, 'output');
    const summary = join(directory, 'summary');
    writeFileSync(eventPath, '{}');
    main({
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REF: 'refs/tags/v1.0.0',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    });
    assert.equal(readFileSync(output, 'utf8'), 'deploy=false\n');
    assert.match(readFileSync(summary, 'utf8'), /Build and publication continue/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
