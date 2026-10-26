import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('the copied implement-stack bundle serves watcher help and status without the repository', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'implement-stack-standalone-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bundle = join(directory, 'skill');
  cpSync(resolve('.agents/skills/implement-stack'), bundle, { recursive: true });
  const command = join(bundle, 'scripts/watch-ci.mjs');
  const invoke = (args) =>
    spawnSync(process.execPath, [command, ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10_000,
      env: { PATH: process.env.PATH },
    });
  const help = invoke(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--input/);
  assert.doesNotMatch(help.stdout, /npm run/);
  const input = join(directory, 'manifest.json');
  writeFileSync(
    input,
    JSON.stringify({
      version: 1,
      repo: 'example/project',
      policyBranch: 'main',
      phase: 'published',
      prs: [
        {
          number: 1,
          head: 'a'.repeat(40),
          checks: [
            {
              context: 'application',
              appId: 15368,
              workflow: '.github/workflows/ci.yml',
              event: 'pull_request',
            },
          ],
        },
      ],
    }),
  );
  const status = invoke(['--input', input, '--state', join(directory, 'state.json'), '--status']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).snapshot, null);
  assert.equal(JSON.parse(status.stdout).stale, true);
});
