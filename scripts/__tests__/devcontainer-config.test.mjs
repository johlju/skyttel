import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const merge = new URL('../../.devcontainer/merge-codex-config.py', import.meta.url).pathname;
const managed = new URL('../../.devcontainer/codex-config.toml', import.meta.url).pathname;

function parseToml(path) {
  const result = spawnSync(
    'python3',
    [
      '-c',
      'import json,sys,tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], "rb"))))',
      path,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function fixture(t, contents) {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-config-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.toml');
  if (contents !== undefined) await writeFile(path, contents, { mode: 0o640 });
  return {
    path,
    directory,
    run: (source = managed) => spawnSync('python3', [merge, source, path], { encoding: 'utf8' }),
    read: () => readFile(path, 'utf8'),
    parse: () => parseToml(path),
  };
}

test('first creation supplies defaults and private file permissions', async (t) => {
  const config = await fixture(t);
  const result = config.run();
  assert.equal(result.status, 0, result.stderr);
  const parsed = config.parse();
  assert.equal(parsed.cli_auth_credentials_store, undefined);
  assert.equal(parsed.default_permissions, 'skyttel-development');
  assert.equal(parsed.projects['/workspace'].trust_level, 'trusted');
  assert.equal(parsed.permissions['skyttel-development'].filesystem['~/.codex/skills'], 'write');
  const rules = parsed.skills.config;
  assert.equal(rules.length, 39);
  assert.ok(rules.every((rule) => rule.name && !rule.path && rule.enabled === false));
  for (const name of [
    'review-agent',
    'cloud-environment:cloud-environment-runtime',
    'cloud-environment:cloud-desktop',
    'sites:sites',
    'sites:sites-remix',
    'pages:write-page',
    'openai-templates:artifact-template-analytics-dashboard',
    'work-pets:pets',
  ]) {
    assert.ok(
      rules.some((rule) => rule.name === name),
      `Missing exclusion: ${name}`,
    );
  }
  assert.equal((await stat(config.path)).mode & 0o777, 0o600);
});

test('repeated setup enforces managed settings and preserves unrelated personal choices', async (t) => {
  const config = await fixture(
    t,
    `# Personal choices survive rebuilding.
approval_policy = "on-request"
default_permissions = ":read-only"
cli_auth_credentials_store = "keyring"
model = "personal-sentinel"
[plugins.plugin-management]
enabled = true
[plugins.personal]
enabled = true
[[skills.config]]
path = "/synthetic/skills/SKILL.md"
enabled = true
[[skills.config]]
name = "review-agent"
enabled = true
[[skills.config]]
name = "pages:write-page"
enabled = true
[[skills.config]]
name = "pages:write-page"
enabled = true
[[skills.config]]
name = "personal-skill"
enabled = false
[projects."/other-project"]
trust_level = "untrusted"
[projects."/workspace"]
trust_level = "untrusted"
personal_sentinel = "preserved"
[shell_environment_policy.set]
SKYTTEL_PERSISTENCE_SENTINEL = "retained"
[permissions.personal]
extends = ":read-only"
`,
  );
  const expected = config.parse();
  expected.approval_policy = 'never';
  expected.default_permissions = 'skyttel-development';
  expected.plugins['plugin-management'].enabled = false;
  expected.plugins['openai-templates'] = { enabled: false };
  expected.skills.config = [
    { path: '/synthetic/skills/SKILL.md', enabled: true },
    { name: 'personal-skill', enabled: false },
    ...parseToml(managed).skills.config,
  ];
  expected.projects['/workspace'].trust_level = 'trusted';
  const first = config.run();
  assert.equal(first.status, 0, first.stderr);
  const once = await config.read();
  const second = config.run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(await config.read(), once, 'Repeated setup must be byte-for-byte idempotent');
  const actual = config.parse();
  delete actual.permissions['skyttel-development'];
  assert.deepEqual(actual, expected);
  assert.match(once, /# Personal choices survive rebuilding\./);
  assert.equal((await stat(config.path)).mode & 0o777, 0o640);
});

test('path-based managed rules remain supported alongside name-based rules', async (t) => {
  const config = await fixture(
    t,
    `[[skills.config]]
path = "/synthetic/managed/SKILL.md"
enabled = true
[[skills.config]]
name = "personal-skill"
enabled = true
`,
  );
  const source = join(config.directory, 'managed.toml');
  await writeFile(
    source,
    `${await readFile(managed, 'utf8')}
[[skills.config]]
path = "/synthetic/managed/SKILL.md"
enabled = false
`,
  );
  const result = config.run(source);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(config.parse().skills.config, [
    { name: 'personal-skill', enabled: true },
    ...parseToml(source).skills.config,
  ]);
  const once = await config.read();
  assert.equal(config.run(source).status, 0);
  assert.equal(await config.read(), once);
});

test('ambiguous managed skill selectors do not overwrite the user configuration', async (t) => {
  const config = await fixture(t, 'model = "personal-sentinel"\n');
  const source = join(config.directory, 'managed.toml');
  await writeFile(
    source,
    `${await readFile(managed, 'utf8')}
[[skills.config]]
name = "ambiguous"
path = "/synthetic/ambiguous/SKILL.md"
enabled = false
`,
  );
  const result = config.run(source);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires exactly one name or path/);
  assert.equal(await config.read(), 'model = "personal-sentinel"\n');
});

test('first transition replaces legacy managed blocks and preserves personal settings outside them', async (t) => {
  const config = await fixture(
    t,
    `# >>> skyttel azure dev managed root
model = "legacy-personal-model"
approval_policy = "on-request"
default_permissions = ":read-only"
# <<< skyttel azure dev managed root
cli_auth_credentials_store = "keyring"
# >>> skyttel azure dev managed profile
[permissions.skyttel-development]
extends = ":read-only"
# <<< skyttel azure dev managed profile
`,
  );
  const result = config.run();
  assert.equal(result.status, 0, result.stderr);
  const actual = config.parse();
  assert.equal(actual.model, undefined);
  assert.equal(actual.cli_auth_credentials_store, 'keyring');
  assert.equal(actual.approval_policy, 'never');
  assert.equal(actual.default_permissions, 'skyttel-development');
  assert.equal(actual.permissions['skyttel-development'].extends, ':workspace');
});

for (const contents of [
  'model = "unterminated\n',
  '# >>> skyttel azure dev managed root\nmodel = "personal"\n',
]) {
  test(`invalid configuration is reported without overwriting the original: ${contents.split('\n')[0]}`, async (t) => {
    const config = await fixture(t, contents);
    await chmod(config.path, 0o600);
    assert.notEqual(config.run().status, 0);
    assert.equal(await config.read(), contents);
    assert.equal((await stat(config.path)).mode & 0o777, 0o600);
  });
}
