import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const docker = process.env.DOCKER_BIN ?? 'docker';
const suffix = randomUUID();
const suppliedImage = process.env.SKYTTEL_DEVCONTAINER_CHECK_IMAGE;
const image = suppliedImage ?? `skyttel-devcontainer-check:${suffix}`;
const directory = await mkdtemp(join(tmpdir(), 'skyttel-devcontainer-check-'));
const bundle = join(directory, 'fixture');
const projects = [];

async function command(args) {
  return (
    await exec(docker, args, { cwd: root, maxBuffer: 5 * 1024 * 1024, timeout: 120_000 })
  ).stdout.trim();
}

async function build() {
  await new Promise((resolve, reject) => {
    const child = spawn(
      docker,
      ['build', '--tag', image, '--file', '.devcontainer/Dockerfile', '.'],
      {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, BUILDX_CONFIG: join(directory, 'buildx') },
      },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Devcontainer build failed (${code})`)),
    );
  });
}

async function prepareFixture() {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts['db:setup'], 'tsx scripts/setup-database.ts');
  assert.equal(manifest.scripts['db:migrate'], 'tsx scripts/migrate-development-database.ts');
  await mkdir(bundle);
  for (const file of ['prepare-storage.sh', 'merge-codex-config.py', 'codex-config.toml']) {
    await copyFile(join(root, '.devcontainer', file), join(bundle, file));
  }
  await copyFile(
    join(root, 'scripts/fixtures/devcontainer-state.py'),
    join(bundle, 'devcontainer-state.py'),
  );
  // Use the application's actual migrations, with only synthetic records.
  await exec(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `import { openDatabase } from './src/server/database.ts';
       import { householdMap } from './src/server/map.ts';
       const db = openDatabase(process.argv[1]);
       db.prepare('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
         .run('persistence-user', 'Synthetic developer', 'developer@example.test', 0, 0);
       db.prepare('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)')
         .run('persistence-session', 9999999999999, 'synthetic-session-token', 0, 0, 'persistence-user');
       db.prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
         .run('persistence-household', 'Synthetic household', '2026-01-01');
       db.prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
         .run('persistence-household', 'persistence-user', 'administrator');
       const type = db.prepare('SELECT id FROM object_type WHERE householdId = ? LIMIT 1')
         .get('persistence-household');
       const map = householdMap(db, 'persistence-user', 'persistence-household');
       map.propose({ version: map.read().draft.version, id: 'persistence-object', baseRevision: null,
         value: { typeId: type.id, name: 'Saved synthetic object', description: 'Retained' } });
       map.save({ version: map.read().draft.version, operationId: 'persistence-save' });
       map.propose({ version: map.read().draft.version, id: 'private-sentinel', baseRevision: null,
         value: { typeId: type.id, name: 'Private synthetic draft', description: 'Retained privately' } });
       db.close();`,
      join(bundle, 'fixture.sqlite'),
    ],
    { cwd: root, timeout: 30_000 },
  );
}

async function checkProfile(profile, composePath) {
  const project = `skyttel-devcheck-${profile}-${suffix}`;
  const path = join(directory, `${profile}.json`);
  const compose = (...args) =>
    command(['compose', '--project-name', project, '--file', path, ...args]);
  // Resolve the real profile without opening its private env file. Replace
  // every mount source and environment before creating any containers.
  const original = JSON.parse(
    await command([
      'compose',
      '--env-file',
      '/dev/null',
      '--file',
      composePath,
      'config',
      '--no-env-resolution',
      '--format',
      'json',
    ]),
  );
  const expectedProject =
    profile === 'standard' ? 'skyttel-devcontainer' : 'skyttel-devcontainer-elevated';
  assert.equal(
    original.name,
    expectedProject,
    'Renaming a profile disconnects its existing volumes',
  );
  const configPath = composePath.replace('docker-compose.yml', 'devcontainer.json');
  const configText = await readFile(join(root, configPath), 'utf8');
  const hookMatch = /"postCreateCommand"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(configText);
  assert.ok(hookMatch, `${profile}: postCreateCommand must be a shell command`);
  const hook = JSON.parse(hookMatch[1]);
  for (const required of [
    'bash .devcontainer/prepare-storage.sh',
    'python3 .devcontainer/merge-codex-config.py .devcontainer/codex-config.toml /home/vscode/.codex/config.toml',
    'npm run db:setup',
  ]) {
    assert.ok(hook.includes(required), `${profile}: creation must run ${required}`);
  }
  const startMatch = /"postStartCommand"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(configText);
  assert.ok(startMatch, `${profile}: postStartCommand must be a shell command`);
  assert.ok(
    !JSON.parse(startMatch[1]).includes('db:setup'),
    `${profile}: ordinary startup must not reset application data`,
  );
  const targets = original.services.app.volumes.map(({ target }) => target);
  const persistent = {
    '/data': 'skyttel-data',
    '/home/vscode/.codex/sqlite': 'codex-state',
    '/home/vscode/.codex/tmp': 'codex-tmp',
    '/home/vscode/.config': 'config',
    '/home/vscode/.vscode-server': 'vscode-server',
    '/workspace/node_modules': 'node-modules',
    '/home/vscode/worktrees': 'worktrees',
  };
  for (const [target, source] of Object.entries(persistent)) {
    const actual = original.services.app.volumes.find((mount) => mount.target === target);
    assert.equal(actual?.type, 'volume', `${profile}: ${target} must use a persistent volume`);
    assert.equal(actual.source, source, `${profile}: changing ${target}'s source loses old state`);
    assert.ok(original.volumes[source], `${profile}: ${source} must have a volume definition`);
    assert.equal(original.volumes[source].name, `${expectedProject}_${source}`);
    assert.notEqual(original.volumes[source].external, true);
    assert.equal(original.volumes[source].driver_opts, undefined);
  }
  const shared = [
    '/workspace',
    ...['sessions', 'plugins', 'skills', 'rules', 'auth.json'].map(
      (name) => `/home/vscode/.codex/${name}`,
    ),
  ];
  for (const target of shared) {
    const actual = original.services.app.volumes.find((mount) => mount.target === target);
    assert.equal(actual?.type, 'bind', `${profile}: ${target} must remain shared with the host`);
    assert.equal(
      actual.source,
      target === '/workspace'
        ? root.replace(/\/$/, '')
        : join(homedir(), target.slice('/home/vscode/'.length)),
      `${profile}: ${target} must retain its host directory`,
    );
  }
  assert.deepEqual(targets.toSorted(), [...Object.keys(persistent), ...shared].toSorted());
  assert.equal(original.services.app.environment.SKYTTEL_DATABASE_PATH, '/data/skyttel.sqlite');
  assert.equal(original.services.app.build.dockerfile, '.devcontainer/Dockerfile');
  const volumes = Object.fromEntries(
    targets.map((_, index) => [`storage-${index}`, { name: `${project}-storage-${index}` }]),
  );
  const model = {
    services: {
      app: {
        image,
        command: original.services.app.command,
        user: original.services.app.user,
        init: original.services.app.init,
        cap_add: original.services.app.cap_add,
        security_opt: original.services.app.security_opt,
        environment: {
          SKYTTEL_DATABASE_PATH: original.services.app.environment.SKYTTEL_DATABASE_PATH,
          NODE_ENV: 'development',
        },
        volumes: targets.map((target, index) => ({
          type: 'volume',
          source: `storage-${index}`,
          target,
          ...(target === '/home/vscode/.codex/auth.json'
            ? { volume: { subpath: 'auth.json' } }
            : {}),
        })),
      },
    },
    volumes,
  };
  await writeFile(path, JSON.stringify(model));
  projects.push({ compose, volumes: Object.values(volumes).map(({ name }) => name) });
  // Seed a file in isolated storage so the auth mount remains a file, without
  // reading or mounting host credentials. All other replacements are directories.
  const authVolume = volumes[`storage-${targets.indexOf('/home/vscode/.codex/auth.json')}`].name;
  await command(['volume', 'create', authVolume]);
  await command([
    'run',
    '--rm',
    '--user',
    'root',
    '--mount',
    `type=volume,source=${authVolume},target=/fixture`,
    image,
    'touch',
    '/fixture/auth.json',
  ]);
  await compose('up', '--detach', '--no-build');
  let container = await compose('ps', '--quiet', 'app');
  const run = (...args) => command(['exec', container, ...args]);
  await command(['cp', bundle, `${container}:/workspace/.devcontainer-test`]);
  // The replacements for host directories start empty and root-owned. Set
  // their synthetic owner once; prepare-storage intentionally skips them.
  await command([
    'exec',
    '--user',
    'root',
    container,
    'chown',
    '-R',
    'vscode:vscode',
    ...original.services.app.volumes
      .filter(({ type }) => type === 'bind')
      .map(({ target }) => target),
  ]);
  const prepare = () => run('bash', '/workspace/.devcontainer-test/prepare-storage.sh');
  const state = (action) =>
    run('python3', '/workspace/.devcontainer-test/devcontainer-state.py', action);
  const merge = () =>
    run(
      'python3',
      '/workspace/.devcontainer-test/merge-codex-config.py',
      '/workspace/.devcontainer-test/codex-config.toml',
      '/home/vscode/.codex/config.toml',
    );
  const databaseCommand = async (script) => {
    const databasePath = join(directory, `${profile}.sqlite`);
    const envPath = join(directory, `${profile}.env`);
    await writeFile(envPath, '', { mode: 0o600 });
    await command(['cp', `${container}:/data/skyttel.sqlite`, databasePath]);
    // Execute the actual setup or migration with repository dependencies, then
    // put its result back. The container needs no second npm installation.
    await exec(process.execPath, ['--import', 'tsx', script], {
      cwd: root,
      timeout: 30_000,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        SKYTTEL_DEV_ENV_FILE: envPath,
        SKYTTEL_DATABASE_PATH: databasePath,
        SKYTTEL_ORIGIN: 'http://localhost:5173',
        SKYTTEL_FIRST_ADMIN_PROVIDER: 'google',
        SKYTTEL_FIRST_ADMIN_SUBJECT: 'devcontainer-check-administrator',
        BETTER_AUTH_SECRET: 'synthetic-devcontainer-persistence-secret',
        GOOGLE_CLIENT_ID: 'synthetic-google-client',
        GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
        MICROSOFT_CLIENT_ID: 'synthetic-microsoft-client',
        MICROSOFT_CLIENT_SECRET: 'synthetic-microsoft-secret',
        PORT: '3300',
      },
    });
    await command(['cp', databasePath, `${container}:/data/skyttel.sqlite`]);
    await run('sudo', 'chown', 'vscode:vscode', '/data/skyttel.sqlite');
  };
  const setup = () => databaseCommand('scripts/setup-database.ts');
  const migrate = () => databaseCommand('scripts/migrate-development-database.ts');
  await prepare();
  await run('touch', '/data/skyttel.sqlite');
  await setup();
  await state('verify-demo');
  await state('seed');
  await merge();
  await migrate();
  await state('verify');
  await compose('stop');
  await compose('start');
  await state('verify');
  const previous = container;
  await compose('up', '--detach', '--no-build', '--force-recreate');
  container = await compose('ps', '--quiet', 'app');
  assert.notEqual(container, previous, 'Recreation must replace the writable container layer');
  await prepare();
  await merge();
  await merge();
  await state('verify-recreated');
  await setup();
  await state('record-reset');
  await compose('stop');
  await compose('start');
  await migrate();
  await state('verify-reset');
  const mounts = JSON.parse(await command(['inspect', '--format', '{{json .Mounts}}', container]));
  assert.equal(mounts.length, targets.length);
  for (const mount of mounts) {
    assert.equal(mount.Type, 'volume');
    assert.ok(mount.Name.startsWith(`${project}-`), 'Every mount must belong to this test');
  }
  console.log(
    `${profile}: creation seeds demo data; recreation resets application data; restart and migration preserve data; mounted developer state survives`,
  );
}

const failures = [];
try {
  await command(['info', '--format', '{{.ServerVersion}}']);
  await prepareFixture();
  if (!suppliedImage) await build();
  await checkProfile('standard', '.devcontainer/docker-compose.yml');
  await checkProfile('elevated', '.devcontainer/elevated/docker-compose.yml');
} catch (error) {
  failures.push(error);
} finally {
  for (const project of projects) {
    try {
      await project.compose('down', '--volumes', '--remove-orphans');
      const remaining = await command(['volume', 'ls', '--format', '{{.Name}}']);
      for (const volume of project.volumes) {
        assert.ok(
          !remaining.split('\n').includes(volume),
          `Test volume was not removed: ${volume}`,
        );
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (!suppliedImage) await command(['image', 'rm', image]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
if (failures.length) throw new AggregateError(failures, 'Devcontainer lifecycle test failed');
