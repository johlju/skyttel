import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const source = await readFile(
  new URL('../../.devcontainer/link-playwright-chrome.sh', import.meta.url),
  'utf8',
);

async function discover(t, { matches = [], findStatus = 1, fallback = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chrome-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  const cache = join(root, 'cache');
  const target = join(root, 'chrome', 'chrome');
  await mkdir(bin);
  await mkdir(cache);
  const executable = async (path, contents) => {
    await writeFile(path, `#!/bin/bash\n${contents}\n`);
    await chmod(path, 0o755);
  };
  for (const name of ['sort', 'tail', 'readlink', 'install', 'ln']) {
    await symlink(`/usr/bin/${name}`, join(bin, name));
  }
  await executable(join(bin, 'sudo'), 'exec "$@"');
  await executable(join(bin, 'find'), '/usr/bin/find "$@"; exit "$FIND_STATUS"');
  for (const match of matches) {
    const directory = join(cache, match);
    await mkdir(directory, { recursive: true });
    await executable(join(directory, 'chrome'), 'echo cache-browser');
  }
  if (fallback) await executable(join(bin, 'chromium'), 'echo system-browser');
  // Redirect the system link into the fixture; exercise the rest unchanged.
  const script = join(root, 'discover.sh');
  await writeFile(script, source.replaceAll('/opt/google/chrome', join(root, 'chrome')));
  const result = spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin,
      PLAYWRIGHT_BROWSERS_PATH: cache,
      FIND_STATUS: String(findStatus),
    },
  });
  return { ...result, target, cache, bin };
}

test('failed find with no match reaches system Chromium fallback', async (t) => {
  const result = await discover(t, { fallback: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /system-browser/);
});

test('failed find with no browser reports the diagnostic', async (t) => {
  const result = await discover(t);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not find a Playwright or system Chromium executable/);
});

for (const findStatus of [0, 1]) {
  test(`find status ${findStatus} preserves path matching and version sorting`, async (t) => {
    const result = await discover(t, {
      findStatus,
      fallback: true,
      matches: [
        'chromium-9/chrome-linux',
        'chromium-10/chrome-linux64',
        'chromium-11/chrome-linux-arm64',
        'chromium-99/unrelated',
      ],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /chromium-11\/chrome-linux-arm64\/chrome/);
    assert.match(result.stdout, /cache-browser/);
  });
}
