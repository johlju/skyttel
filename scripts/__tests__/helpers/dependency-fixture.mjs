import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { dirname, join, resolve } from 'node:path';

export const runner = resolve('scripts/testing/run-with-test-environment.py');
const project = JSON.parse(readFileSync('package.json', 'utf8'));
const tools = {
  typescript: 'tsc',
  tsx: 'tsx',
  vite: 'vite',
  vitest: 'vitest',
  '@vitest/browser-playwright': null,
  '@vitest/coverage-v8': null,
  '@playwright/test': 'playwright',
};

export function dependencyFixture(t, { installed = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-dependencies-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (path, contents) => {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  const dependencies = {};
  const packages = {};
  for (const [name, bin] of Object.entries(tools)) {
    const archive = `fixtures/${name.replace('/', '-')}.tgz`;
    dependencies[name] = `file:${archive}`;
    const manifest = {
      name,
      version: '1.0.0',
      main: 'index.cjs',
      ...(bin && { bin: { [bin]: 'cli.cjs' } }),
    };
    const files = {
      'package.json': `${JSON.stringify(manifest)}\n`,
      'index.cjs': 'module.exports = {};\n',
      'cli.cjs': '#!/usr/bin/env node\nprocess.exit(0);\n',
    };
    for (const [file, contents] of Object.entries(files)) {
      write(`archive/package/${file}`, contents);
      if (installed) write(`node_modules/${name}/${file}`, contents);
    }
    mkdirSync(dirname(join(directory, archive)), { recursive: true });
    const packed = spawnSync('tar', [
      '-czf',
      join(directory, archive),
      '-C',
      join(directory, 'archive'),
      'package',
    ]);
    assert.equal(packed.status, 0, packed.stderr.toString());
    packages[`node_modules/${name}`] = {
      version: '1.0.0',
      resolved: `file:${archive}`,
      ...(bin && { bin: manifest.bin }),
    };
    if (installed && bin) {
      mkdirSync(join(directory, 'node_modules/.bin'), { recursive: true });
      symlinkSync(`../${name}/cli.cjs`, join(directory, 'node_modules/.bin', bin));
    }
  }
  write(
    'package.json',
    JSON.stringify({
      name: 'dependency-fixture',
      version: '1.0.0',
      private: true,
      packageManager: project.packageManager,
      engines: project.engines,
      devEngines: project.devEngines,
      scripts: project.scripts,
      devDependencies: dependencies,
    }),
  );
  write(
    'package-lock.json',
    JSON.stringify({
      name: 'dependency-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'dependency-fixture', version: '1.0.0', devDependencies: dependencies },
        ...packages,
      },
    }),
  );
  write('.devcontainer/.env', 'PRIVATE_SENTINEL=preserve\n');
  write('data/skyttel.sqlite', 'database sentinel\n');
  write('.gitignore', 'node_modules/\ndata/\n.devcontainer/.env\narchive/\n');
  mkdirSync(join(directory, 'scripts/testing'), { recursive: true });
  for (const file of ['run-with-test-environment.py', 'dependency-environment.mjs']) {
    copyFileSync(resolve('scripts/testing', file), join(directory, 'scripts/testing', file));
  }
  const env = {
    ...process.env,
    SKYTTEL_TEST_LOCK_FILE: join(directory, 'tests.lock'),
    npm_config_cache: join(directory, 'npm-cache'),
    npm_config_offline: 'true',
  };
  const run = (args = [], options = {}) =>
    spawnSync('python3', [runner, ...args], {
      cwd: directory,
      env,
      encoding: 'utf8',
      ...options,
    });
  const verify = (options) =>
    run([process.execPath, '-e', 'require("node:fs").writeFileSync("started", "ran")'], options);
  return { directory, env, run, verify, write };
}
