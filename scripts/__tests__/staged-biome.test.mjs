import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('the commit hook checks staged blobs and configuration in a partially staged checkout', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skyttel-staged-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const commit = () =>
    spawnSync('git', ['-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'], {
      cwd,
      encoding: 'utf8',
    });
  git('init', '--quiet');
  git('config', 'core.hooksPath', resolve('.githooks'));
  git('config', 'user.name', 'Hook test');
  git('config', 'user.email', 'hook@example.invalid');
  mkdirSync(join(cwd, 'node_modules/.bin'), { recursive: true });
  symlinkSync(resolve('node_modules/.bin/biome'), join(cwd, 'node_modules/.bin/biome'));
  copyFileSync('biome.json', join(cwd, 'biome.json'));
  copyFileSync('package.json', join(cwd, 'package.json'));
  copyFileSync('.gitignore', join(cwd, '.gitignore'));
  mkdirSync(join(cwd, 'src'));
  const file = 'src/staged example.ts';
  const good = 'export const value = 1;\n';
  const bad = 'export const value=1\n';
  const write = (contents) => writeFileSync(join(cwd, file), contents);
  write(bad);
  git('add', '.gitignore', 'biome.json', 'package.json', file);
  write(good);
  const rejected = commit();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr + rejected.stdout, /staged example\.ts format/);
  assert.equal(git('show', `:${file}`), bad);
  assert.equal(readFileSync(join(cwd, file), 'utf8'), good);

  git('add', file);
  write(bad);
  writeFileSync(join(cwd, 'biome.json'), 'broken unstaged config');
  const accepted = commit();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(git('show', `HEAD:${file}`), good);
  assert.equal(git('show', `:${file}`), good);
  assert.equal(readFileSync(join(cwd, file), 'utf8'), bad);

  writeFileSync(join(cwd, 'package.json'), '{}\n');
  const component = 'src/Example.tsx';
  writeFileSync(
    join(cwd, component),
    "import { useState } from 'react';\n\nexport function Example({ ready }: { ready: boolean }) {\n  if (ready) useState(0);\n  return null;\n}\n",
  );
  git('add', component);
  const react = commit();
  assert.notEqual(react.status, 0);
  assert.match(react.stderr + react.stdout, /useHookAtTopLevel/);
});
