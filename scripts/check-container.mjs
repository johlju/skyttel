import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const docker = process.env.DOCKER_BIN ?? 'docker';
const suffix = randomUUID();
const suppliedImage = process.env.SKYTTEL_CHECK_IMAGE;
const image = suppliedImage ?? `skyttel-container-check:${suffix}`;
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
  return (
    await exec(docker, args, {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 60_000,
    })
  ).stdout.trim();
}

async function build() {
  await new Promise((resolve, reject) => {
    const child = spawn(docker, ['build', '--tag', image, '.'], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Container build failed (${code})`)),
    );
  });
}

async function createApplication(name, mounts) {
  containers.add(name);
  await command([
    'create',
    '--name',
    name,
    ...Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    ...mounts.flatMap((mount) => ['--mount', mount]),
    image,
  ]);
}

async function request(name, path, options = {}) {
  // Run the HTTP client beside the app: the Docker engine may be on another
  // host, so its published ports are not necessarily on our loopback address.
  const output = await command([
    'exec',
    name,
    'node',
    '--input-type=commonjs',
    '-e',
    `const http = require('node:http');
     const { path, options } = JSON.parse(process.argv[1]);
     const request = http.request({
       hostname: '127.0.0.1', port: 3000, path,
       method: options.method, headers: options.headers, timeout: 1000,
     }, (response) => {
       let body = '';
       response.setEncoding('utf8');
       response.on('data', (chunk) => { body += chunk; });
       response.on('end', () => console.log(JSON.stringify({ status: response.statusCode, body })));
     });
     request.on('timeout', () => request.destroy(new Error('Container request timed out')));
     request.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
     request.end(options.body);`,
    JSON.stringify({ path, options }),
  ]);
  return JSON.parse(output);
}

async function waitUntilReady(name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await request(name, '/healthz');
      if (response.status === 200) {
        assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
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

async function household(name, fixture) {
  const response = await request(name, `/api/households/${fixture.householdId}`, {
    headers: { cookie: fixture.cookie },
  });
  assert.equal(response.status, 200, 'The authenticated household remains available');
  return JSON.parse(response.body);
}

try {
  await command(['info', '--format', '{{.ServerVersion}}']);
  if (!suppliedImage) await build();
  await command(['volume', 'create', volume]);

  const fresh = `skyttel-fresh-${suffix}`;
  await createApplication(fresh, [`type=volume,src=${volume},dst=/data`]);
  await command(['start', fresh]);
  await waitUntilReady(fresh);
  assert.equal(await command(['exec', fresh, 'id', '-u']), '1000');
  assert.equal(await command(['exec', fresh, 'id', '-g']), '1000');
  await command([
    'exec',
    fresh,
    'sh',
    '-ec',
    'for manager in apk npm npx yarn yarnpkg corepack; do if command -v "$manager"; then exit 1; fi; done; ' +
      'test ! -e /usr/local/lib/node_modules/corepack',
  ]);
  const loginPage = await request(fresh, '/');
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.body, /<html/u);
  for (const path of ['/api/test-login', '/api/__test/sign-in']) {
    const response = await request(fresh, path, { method: 'POST' });
    assert.equal(response.status, 404, 'Production must not expose test authentication');
  }
  const denied = await request(fresh, '/api/households/synthetic-household');
  assert.equal(denied.status, 401);
  await command(['restart', fresh]);
  await waitUntilReady(fresh);
  console.log(
    'PASS: fresh volume, non-root runtime, readiness, and production authentication boundary',
  );

  const seedDirectory = join(directory, 'seed');
  await mkdir(seedDirectory);
  const seed = await exec(
    process.execPath,
    ['--import', 'tsx', 'tests/support/seed-container.ts', seedDirectory],
    { maxBuffer: 1024 * 1024 },
  );
  const fixture = JSON.parse(seed.stdout);
  assert.equal(typeof fixture.cookie, 'string');
  assert.equal(typeof fixture.householdId, 'string');
  await command(['volume', 'create', persistedVolume]);

  // Copy via Docker's API; caller-side temporary paths may not exist on the
  // Docker host. Prepare only the disposable fixture disk for the production UID.
  const seedContainer = `skyttel-seed-${suffix}`;
  containers.add(seedContainer);
  await command([
    'create',
    '--name',
    seedContainer,
    '--user',
    '0',
    '--entrypoint',
    'node',
    '--mount',
    `type=volume,src=${persistedVolume},dst=/data`,
    image,
    '--input-type=module',
    '-e',
    "import { chownSync } from 'node:fs'; chownSync('/data/skyttel.sqlite', 1000, 1000);",
  ]);
  await command([
    'cp',
    join(seedDirectory, 'skyttel.sqlite'),
    `${seedContainer}:/data/skyttel.sqlite`,
  ]);
  await command(['start', '--attach', seedContainer]);
  assert.equal(await command(['inspect', '--format', '{{.State.ExitCode}}', seedContainer]), '0');

  const persisted = `skyttel-persisted-${suffix}`;
  await createApplication(persisted, [`type=volume,src=${persistedVolume},dst=/data`]);
  await command(['start', persisted]);
  await waitUntilReady(persisted);
  const before = await household(persisted, fixture);
  const mapPath = `/api/households/${fixture.householdId}/map`;
  async function mapRequest(suffix = '', body) {
    const response = await request(persisted, `${mapPath}${suffix}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie: fixture.cookie,
        origin: configuredOrigin,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 200);
    return JSON.parse(response.body);
  }
  const initialMap = await mapRequest();
  await mapRequest('/draft', {
    version: 0,
    id: 'synthetic-person',
    baseRevision: null,
    value: { typeId: initialMap.types[0].id, name: 'Lo Exempel', description: 'Synthetic person' },
  });
  const privateDraft = await mapRequest();
  await command(['restart', persisted]);
  await waitUntilReady(persisted);
  assert.deepEqual(await mapRequest(), privateDraft);
  const saveRequest = { version: 1, operationId: 'container-save' };
  const receipt = await mapRequest('/save', saveRequest);
  const savedMap = await mapRequest();
  await command(['restart', persisted]);
  await waitUntilReady(persisted);
  assert.deepEqual(await household(persisted, fixture), before);
  assert.deepEqual(await mapRequest(), savedMap);
  assert.deepEqual(await mapRequest('/save', saveRequest), receipt);
  assert.deepEqual((await mapRequest('/history')).history, [receipt.receipt]);
  console.log(
    'PASS: identity, household, private draft, objects, history, and receipt survive container restart',
  );

  await command(['stop', fresh]);
  const brokenSql = join(directory, 'broken.sql');
  await writeFile(brokenSql, 'THIS IS NOT VALID SQL;\n');
  const failed = `skyttel-failed-${suffix}`;
  await createApplication(failed, [`type=volume,src=${volume},dst=/data`]);
  const migrationFiles = (await readdir('migrations')).filter((name) => name.endsWith('.sql'));
  const nextVersion = String(migrationFiles.length + 1).padStart(3, '0');
  await command(['cp', brokenSql, `${failed}:/app/migrations/${nextVersion}_container_smoke.sql`]);
  await command(['start', failed]);
  const exitCode = await command(['wait', failed]);
  assert.equal(exitCode, '1', 'Migration failure must exit with failure');
  const logs = await exec(docker, ['logs', failed]);
  assert.deepEqual(JSON.parse(`${logs.stdout}${logs.stderr}`.trim()), {
    event: 'database_initialization_failed',
    reason: 'migration_failed',
  });
  assert.doesNotMatch(`${logs.stdout}${logs.stderr}`, /server_ready/u);
  assert.doesNotMatch(`${logs.stdout}${logs.stderr}`, /synthetic-google-secret|alex-google/u);
  console.log('PASS: failed migration exits without readiness or private diagnostic values');
} finally {
  for (const name of containers) {
    await command(['rm', '--force', name]).catch(() => {});
  }
  await command(['volume', 'rm', volume]).catch(() => {});
  await command(['volume', 'rm', persistedVolume]).catch(() => {});
  if (!suppliedImage) await command(['image', 'rm', image]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
