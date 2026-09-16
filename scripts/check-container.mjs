import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const docker = process.env.DOCKER_BIN ?? 'docker';
const suffix = randomUUID();
const image = `skyttel-container-check:${suffix}`;
const volume = `skyttel-container-check-${suffix}`;
const persistedVolume = `skyttel-container-persisted-${suffix}`;
const containers = new Set();
const directory = await mkdtemp(join(tmpdir(), 'skyttel-container-check-'));
const authSecret = 'synthetic-test-secret-with-at-least-32-characters';
const configuredOrigin = 'http://localhost:3000';
const environment = {
  SKYTTEL_ORIGIN: configuredOrigin,
  SKYTTEL_DATABASE_PATH: '/data/skyttel.sqlite',
  SKYTTEL_FIRST_ADMIN_PROVIDER: 'google',
  SKYTTEL_FIRST_ADMIN_SUBJECT: 'alex-google',
  BETTER_AUTH_SECRET: authSecret,
  GOOGLE_CLIENT_ID: 'synthetic-google-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
  MICROSOFT_CLIENT_ID: 'synthetic-microsoft-client',
  MICROSOFT_CLIENT_SECRET: 'synthetic-microsoft-secret',
  SKYTTEL_TEST_LOGIN: '1',
};

async function command(args) {
  return (await exec(docker, args, {
    maxBuffer: 5 * 1024 * 1024,
    timeout: 60_000,
  })).stdout.trim();
}

async function build() {
  await new Promise((resolve, reject) => {
    const child = spawn(docker, ['build', '--tag', image, '.'], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`Container build failed (${code})`)));
  });
}

async function start(name, mounts) {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  containers.add(name);
  await command([
    'run', '--detach', '--name', name,
    '--publish', `127.0.0.1:${port}:3000`,
    ...Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    ...mounts.flatMap((mount) => ['--mount', mount]),
    image,
  ]);
  return `http://127.0.0.1:${port}`;
}

async function waitUntilReady(name, origin) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      }
    } catch {
      // A listener is absent until startup and migrations are complete.
    }
    const state = JSON.parse(await command(['inspect', '--format', '{{json .State}}', name]));
    assert.equal(state.Running, true, 'The container exits before it becomes ready');
    await delay(250);
  }
  throw new Error('Container does not become ready within 30 seconds');
}

async function household(origin, fixture) {
  const response = await fetch(`${origin}/api/households/${fixture.householdId}`, {
    headers: { cookie: fixture.cookie },
  });
  assert.equal(response.status, 200, 'The authenticated household remains available');
  return response.json();
}

try {
  await command(['info', '--format', '{{.ServerVersion}}']);
  await build();
  await command(['volume', 'create', volume]);

  const fresh = `skyttel-fresh-${suffix}`;
  const freshOrigin = await start(fresh, [`type=volume,src=${volume},dst=/data`]);
  await waitUntilReady(fresh, freshOrigin);
  assert.equal(await command(['exec', fresh, 'id', '-u']), '1000');
  assert.equal(await command(['exec', fresh, 'id', '-g']), '1000');
  const loginPage = await fetch(freshOrigin);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /<html/u);
  for (const path of ['/api/test-login', '/api/__test/sign-in']) {
    const response = await fetch(`${freshOrigin}${path}`, { method: 'POST' });
    assert.equal(response.status, 404, 'Production must not expose test authentication');
  }
  const denied = await fetch(`${freshOrigin}/api/households/synthetic-household`);
  assert.equal(denied.status, 401);
  await command(['restart', fresh]);
  await waitUntilReady(fresh, freshOrigin);
  console.log('PASS: fresh volume, non-root runtime, readiness, and production authentication boundary');

  const seedDirectory = join(directory, 'seed');
  await mkdir(seedDirectory);
  const seed = await exec(process.execPath, [
    '--import', 'tsx', 'tests/support/seed-container.ts', seedDirectory,
  ], { maxBuffer: 1024 * 1024 });
  const fixture = JSON.parse(seed.stdout);
  assert.equal(typeof fixture.cookie, 'string');
  assert.equal(typeof fixture.householdId, 'string');
  await command(['volume', 'create', persistedVolume]);
  // Prepare only the disposable fixture disk for the production UID.
  await command([
    'run', '--rm', '--user', '0', '--entrypoint', 'node',
    '--mount', `type=bind,src=${seedDirectory},dst=/fixture,readonly`,
    '--mount', `type=volume,src=${persistedVolume},dst=/data`,
    image, '--input-type=module', '-e',
    "import { copyFileSync, chownSync } from 'node:fs'; copyFileSync('/fixture/skyttel.sqlite', '/data/skyttel.sqlite'); chownSync('/data/skyttel.sqlite', 1000, 1000);",
  ]);

  const persisted = `skyttel-persisted-${suffix}`;
  const persistedOrigin = await start(persisted, [
    `type=volume,src=${persistedVolume},dst=/data`,
  ]);
  await waitUntilReady(persisted, persistedOrigin);
  const before = await household(persistedOrigin, fixture);
  await command(['restart', persisted]);
  await waitUntilReady(persisted, persistedOrigin);
  assert.deepEqual(await household(persistedOrigin, fixture), before);
  console.log('PASS: provider identity, session, membership, and household survive container restart');

  await command(['stop', fresh]);
  const brokenSql = join(directory, 'broken.sql');
  await writeFile(brokenSql, 'THIS IS NOT VALID SQL;\n');
  const failed = `skyttel-failed-${suffix}`;
  const failedOrigin = await start(failed, [
    `type=volume,src=${volume},dst=/data`,
    `type=bind,src=${brokenSql},dst=/app/migrations/002_container_smoke.sql,readonly`,
  ]);
  const exitCode = await command(['wait', failed]);
  assert.equal(exitCode, '1', 'Migration failure must exit with failure');
  await assert.rejects(fetch(`${failedOrigin}/healthz`, {
    signal: AbortSignal.timeout(1000),
  }), 'Migration failure must never provide readiness');
  const logs = await exec(docker, ['logs', failed]);
  assert.match(`${logs.stdout}${logs.stderr}`, /database_initialization_failed/u);
  assert.doesNotMatch(`${logs.stdout}${logs.stderr}`, /server_ready/u);
  assert.doesNotMatch(`${logs.stdout}${logs.stderr}`, /synthetic-google-secret|alex-google/u);
  console.log('PASS: failed migration exits without readiness or private diagnostic values');
} finally {
  for (const name of containers) {
    await command(['rm', '--force', name]).catch(() => {});
  }
  await command(['volume', 'rm', volume]).catch(() => {});
  await command(['volume', 'rm', persistedVolume]).catch(() => {});
  await command(['image', 'rm', image]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
