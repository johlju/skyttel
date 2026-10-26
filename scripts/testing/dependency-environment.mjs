import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(process.cwd());
const modules = resolve(root, 'node_modules');
const recovery = 'Run npm run deps:prepare in this checkout.';

// The repository declares space-separated numeric engine comparators.
// Reject other syntax explicitly instead of accepting a version we cannot check.
function satisfies(version, range) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || typeof range !== 'string') return false;
  return range.split(/\s+/).every((comparator) => {
    const match = /^(>=|<=|>|<|=)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(comparator);
    if (!match)
      throw new Error(
        `Unsupported engine comparator ${comparator}; update the setup check for the declared range.`,
      );
    const actual = version.split('.').map(Number);
    const expected = match.slice(2).map((part) => Number(part ?? 0));
    const difference =
      actual.map((part, index) => part - expected[index]).find((part) => part !== 0) ?? 0;
    return {
      '>=': difference >= 0,
      '<=': difference <= 0,
      '>': difference > 0,
      '<': difference < 0,
      '=': difference === 0,
    }[match[1] ?? '='];
  });
}

function checkTools(manifest) {
  if (!satisfies(process.versions.node, manifest.engines?.node)) {
    throw new Error(
      `Node ${process.versions.node} is unsupported; use Node ${manifest.engines?.node} declared in package.json, then ${recovery}`,
    );
  }
  const expected = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager)?.[1];
  const npm = process.env.npm_execpath;
  const result = npm
    ? spawnSync(process.execPath, [npm, '--version'], { encoding: 'utf8' })
    : spawnSync('npm', ['--version'], { encoding: 'utf8' });
  const version = result.stdout?.trim();
  if (
    !expected ||
    result.status !== 0 ||
    version !== expected ||
    !satisfies(version, manifest.engines?.npm) ||
    manifest.devEngines?.packageManager?.name !== 'npm' ||
    manifest.devEngines.packageManager.version !== expected
  ) {
    throw new Error(
      `npm ${version || 'unavailable'} is unsupported; use ${manifest.packageManager} declared in package.json and keep devEngines consistent, then ${recovery}`,
    );
  }
}

function localPath(path) {
  const physical = realpathSync(path);
  const within = relative(modules, physical);
  if (isAbsolute(within) || within === '..' || within.startsWith('../')) {
    throw new Error(`${path} resolves outside this checkout's node_modules. ${recovery}`);
  }
  return physical;
}

function checkInstallation() {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  for (const group of ['dependencies', 'devDependencies']) {
    const declared = manifest[group] ?? {};
    const locked = lock.packages?.['']?.[group] ?? {};
    if (
      Object.keys(declared).length !== Object.keys(locked).length ||
      Object.entries(declared).some(([name, version]) => locked[name] !== version)
    ) {
      throw new Error(
        `package.json and package-lock.json disagree. Restore the intended lockfile. ${recovery}`,
      );
    }
    for (const name of Object.keys(declared)) {
      const packagePath = resolve(modules, name, 'package.json');
      try {
        const installed = JSON.parse(readFileSync(localPath(packagePath), 'utf8'));
        if (
          installed.name !== name ||
          installed.version !== lock.packages?.[`node_modules/${name}`]?.version
        ) {
          throw new Error('installed package identity or version differs from package-lock.json');
        }
        const bins =
          typeof installed.bin === 'string'
            ? { [name.split('/').at(-1)]: installed.bin }
            : (installed.bin ?? {});
        for (const [bin, target] of Object.entries(bins)) {
          if (
            localPath(resolve(modules, '.bin', bin)) !== localPath(resolve(modules, name, target))
          ) {
            throw new Error(`executable ${bin} resolves to a different package`);
          }
        }
      } catch (error) {
        throw new Error(`${name}: ${error.message}. ${recovery}`);
      }
    }
  }
  const require = createRequire(resolve(root, 'package.json'));
  const tooling = [
    'typescript',
    'tsx',
    'vite',
    'vitest',
    '@vitest/browser-playwright',
    '@vitest/coverage-v8',
    '@playwright/test',
  ];
  for (const name of tooling) {
    try {
      localPath(require.resolve(name));
    } catch (error) {
      throw new Error(
        `Cannot resolve ${name} from this installation: ${error.message}. ${recovery}`,
      );
    }
  }
  // Resolve import conditions from the checkout, not from this script's location.
  const imported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      'console.log(JSON.stringify(JSON.parse(process.argv[1]).map(name => import.meta.resolve(name))))',
      JSON.stringify(tooling),
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (imported.status !== 0) {
    throw new Error(`Tooling import resolution failed: ${imported.stderr}`);
  }
  for (const url of JSON.parse(imported.stdout)) localPath(fileURLToPath(url));
}

try {
  checkTools(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')));
  const layout = lstatSync(modules, { throwIfNoEntry: false });
  if (layout?.isSymbolicLink()) {
    throw new Error(
      'node_modules is a dependency alias (symlink). Remove only the link, then run npm run deps:prepare in this checkout.',
    );
  }
  if (process.argv[2] === 'prepare') {
    const lockfile = resolve(root, 'package-lock.json');
    const before = readFileSync(lockfile);
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Start preparation with npm run deps:prepare.');
    const result = spawnSync(
      process.execPath,
      [npm, 'ci', '--prefix', root, '--include=dev', '--no-audit', '--no-fund'],
      {
        cwd: root,
        stdio: 'inherit',
      },
    );
    if (result.status !== 0)
      throw new Error(
        'npm ci did not complete. Resolve its diagnostic and rerun npm run deps:prepare.',
      );
    if (!before.equals(readFileSync(lockfile)))
      throw new Error(
        'Preparation changed package-lock.json; inspect the change before verification.',
      );
  } else if (!layout?.isDirectory()) {
    throw new Error('node_modules is missing. Run npm run deps:prepare in this checkout.');
  }
  checkInstallation();
} catch (error) {
  console.error(`Skyttel dependency setup failed: ${error.message}\n${recovery}`);
  process.exitCode = 78;
}
