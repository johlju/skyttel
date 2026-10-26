import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { dependencyFixture } from './helpers/dependency-fixture.mjs';

const runner = resolve('scripts/testing/run-with-test-environment.py');

test('missing dependencies stop verification before its child starts', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-dependency-environment-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of ['package.json', 'package-lock.json']) {
    copyFileSync(file, join(directory, file));
  }
  const marker = join(directory, 'started');
  const result = spawnSync(
    'python3',
    [
      runner,
      process.execPath,
      '-e',
      'require("node:fs").writeFileSync(process.argv[1], "ran")',
      marker,
    ],
    {
      cwd: directory,
      env: { ...process.env, SKYTTEL_TEST_LOCK_FILE: join(directory, 'tests.lock') },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 78, result.stdout + result.stderr);
  assert.match(result.stderr, /setup.*node_modules.*npm run deps:prepare/is);
  assert.equal(existsSync(marker), false);
});

test('aggregate check rejects missing dependencies before invoking tools from PATH', (t) => {
  const fixture = dependencyFixture(t, { installed: false });
  fixture.write('bin/tsc', '#!/bin/sh\ntouch started\nexit 1\n');
  chmodSync(join(fixture.directory, 'bin/tsc'), 0o755);
  const result = spawnSync('npm', ['run', 'check'], {
    cwd: fixture.directory,
    env: { ...fixture.env, PATH: `${join(fixture.directory, 'bin')}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  assert.equal(result.status, 78, result.stdout + result.stderr);
  assert.equal(existsSync(join(fixture.directory, 'started')), false);
});

test('an incomplete browser coverage installation is a setup failure before execution', (t) => {
  const fixture = dependencyFixture(t);
  rmSync(join(fixture.directory, 'node_modules/@vitest/coverage-v8'), { recursive: true });
  const result = fixture.verify();
  assert.equal(result.status, 78, result.stderr);
  assert.match(result.stderr, /coverage-v8.*deps:prepare/is);
  assert.equal(existsSync(join(fixture.directory, 'started')), false);
});

test('a dependency alias to another checkout is rejected without touching either checkout', (t) => {
  const source = dependencyFixture(t);
  const worktree = dependencyFixture(t, { installed: false });
  symlinkSync(join(source.directory, 'node_modules'), join(worktree.directory, 'node_modules'));
  const files = ['package-lock.json', '.devcontainer/.env', 'data/skyttel.sqlite'];
  const before = files.map((file) => readFileSync(join(worktree.directory, file)));
  const sourceModule = readFileSync(join(source.directory, 'node_modules/vitest/package.json'));
  for (const result of [worktree.verify(), worktree.run(['--prepare'])]) {
    assert.equal(result.status, 78, result.stderr);
    assert.match(result.stderr, /node_modules.*(?:link|alias).*deps:prepare/is);
  }
  assert.equal(existsSync(join(worktree.directory, 'started')), false);
  assert.deepEqual(
    files.map((file) => readFileSync(join(worktree.directory, file))),
    before,
  );
  assert.deepEqual(
    readFileSync(join(source.directory, 'node_modules/vitest/package.json')),
    sourceModule,
  );
});

test('ordinary installations and internal package and executable links are supported', (t) => {
  const fixture = dependencyFixture(t);
  assert.equal(fixture.verify().status, 0);
  assert.equal(
    lstatSync(join(fixture.directory, 'node_modules/.bin/vitest')).isSymbolicLink(),
    true,
  );
  mkdirSync(join(fixture.directory, 'node_modules/.store'));
  renameSync(
    join(fixture.directory, 'node_modules/vitest'),
    join(fixture.directory, 'node_modules/.store/vitest'),
  );
  symlinkSync('.store/vitest', join(fixture.directory, 'node_modules/vitest'));
  assert.equal(fixture.verify().status, 0);
});

test('the current dependency directory, including devcontainer volume mounts, passes preflight', (t) => {
  const fixture = dependencyFixture(t);
  const result = spawnSync('python3', [runner, process.execPath, '-e', 'process.exit(0)'], {
    env: fixture.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('an independently prepared Git worktree uses its own locked installation without credentials', (t) => {
  const source = dependencyFixture(t);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', source.directory, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-b', 'main');
  git('add', 'package.json', 'package-lock.json', '.gitignore', 'fixtures', 'scripts');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'fixture',
  );
  const worktree = join(source.directory, 'additional-worktree');
  git('worktree', 'add', '--detach', worktree);
  const before = readFileSync(join(source.directory, 'node_modules/vitest/package.json'));
  const result = spawnSync('npm', ['run', 'deps:prepare'], {
    cwd: worktree,
    env: source.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(source.verify({ cwd: worktree }).status, 0);
  assert.equal(existsSync(join(worktree, '.devcontainer/.env')), false);
  assert.deepEqual(
    readFileSync(join(source.directory, 'node_modules/vitest/package.json')),
    before,
  );
  assert.notEqual(
    statSync(join(source.directory, 'node_modules')).ino,
    statSync(join(worktree, 'node_modules')).ino,
  );
});

test('external package or executable resolution and stale versions stop execution', (t) => {
  for (const kind of ['package', 'executable', 'version', 'entry']) {
    const fixture = dependencyFixture(t);
    if (kind === 'version') {
      fixture.write('node_modules/vitest/package.json', '{"name":"vitest","version":"0.0.0"}');
    } else if (kind === 'entry') {
      fixture.write(
        'node_modules/@vitest/coverage-v8/package.json',
        '{"name":"@vitest/coverage-v8","version":"1.0.0","main":"missing.cjs"}',
      );
    } else {
      const target = join(
        fixture.directory,
        kind === 'package' ? 'node_modules/vitest' : 'node_modules/.bin/vitest',
      );
      const external = join(fixture.directory, 'external');
      if (kind === 'package') renameSync(target, external);
      else {
        rmSync(target);
        fixture.write('external', '#!/usr/bin/env node\n');
      }
      symlinkSync(external, target);
    }
    const result = fixture.verify();
    assert.equal(result.status, 78, result.stderr);
    assert.equal(existsSync(join(fixture.directory, 'started')), false);
  }
});

test('direct build and test commands reject an unprepared checkout', (t) => {
  const fixture = dependencyFixture(t, { installed: false });
  for (const script of [
    'build',
    'test:unit',
    'test:unit:coverage',
    'test:integration',
    'test:gates',
  ]) {
    const result = spawnSync('npm', ['run', script], {
      cwd: fixture.directory,
      env: fixture.env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 78, `${script}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /dependency setup failed/);
  }
});

test('child failure is distinct from setup failure and never becomes a pass', (t) => {
  const fixture = dependencyFixture(t);
  const result = fixture.run([
    process.execPath,
    '-e',
    'console.error("incomplete coverage"); process.exit(23)',
  ]);
  assert.equal(result.status, 23);
  assert.match(result.stderr, /incomplete coverage/);
  assert.doesNotMatch(result.stderr, /setup failed/);
});

test('browser tooling import resolution cannot escape through a different export condition', (t) => {
  const fixture = dependencyFixture(t);
  fixture.write('outside.cjs', 'module.exports = {};');
  fixture.write(
    'node_modules/@vitest/coverage-v8/package.json',
    JSON.stringify({
      name: '@vitest/coverage-v8',
      version: '1.0.0',
      exports: { '.': { import: './import.cjs', require: './index.cjs' } },
    }),
  );
  symlinkSync(
    join(fixture.directory, 'outside.cjs'),
    join(fixture.directory, 'node_modules/@vitest/coverage-v8/import.cjs'),
  );
  const result = fixture.verify();
  assert.equal(result.status, 78, result.stderr);
  assert.equal(existsSync(join(fixture.directory, 'started')), false);
});

test('preparation installs local locked packages without changing configuration, data or lockfile', (t) => {
  const fixture = dependencyFixture(t, { installed: false });
  const files = ['package-lock.json', '.devcontainer/.env', 'data/skyttel.sqlite'];
  const before = files.map((file) => readFileSync(join(fixture.directory, file)));
  const result = spawnSync('npm', ['run', 'deps:prepare'], {
    cwd: fixture.directory,
    env: fixture.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fixture.verify().status, 0);
  assert.deepEqual(
    files.map((file) => readFileSync(join(fixture.directory, file))),
    before,
  );
  assert.equal(
    existsSync(join(fixture.directory, 'node_modules/@vitest/coverage-v8/package.json')),
    true,
  );
  const inode = statSync(join(fixture.directory, 'node_modules')).ino;
  const repeated = fixture.run(['--prepare']);
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  assert.equal(
    statSync(join(fixture.directory, 'node_modules')).ino,
    inode,
    'Keep the dependency directory itself so mounted directories remain supported',
  );
  assert.deepEqual(
    files.map((file) => readFileSync(join(fixture.directory, file))),
    before,
  );
});

test('unsupported declared Node and npm versions fail before preparation or verification', (t) => {
  for (const tool of ['node', 'npm']) {
    const fixture = dependencyFixture(t);
    const manifest = JSON.parse(readFileSync(join(fixture.directory, 'package.json'), 'utf8'));
    if (tool === 'node') manifest.engines.node = '>=99.0.0 <100';
    else manifest.packageManager = 'npm@0.0.0';
    fixture.write('package.json', JSON.stringify(manifest));
    const before = readFileSync(join(fixture.directory, 'node_modules/vitest/package.json'));
    for (const result of [fixture.verify(), fixture.run(['--prepare'])]) {
      assert.equal(result.status, 78, result.stdout + result.stderr);
      assert.match(result.stderr, new RegExp(`${tool}.*(?:require|support|declared)`, 'is'));
    }
    assert.equal(existsSync(join(fixture.directory, 'started')), false);
    assert.deepEqual(
      readFileSync(join(fixture.directory, 'node_modules/vitest/package.json')),
      before,
    );
  }
});
