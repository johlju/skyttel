import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager)?.[1];
if (!version) throw new Error('package.json must declare an exact npm packageManager version.');

// Bootstrap outside the project so devEngines does not reject the old npm.
const directory = mkdtempSync(join(tmpdir(), 'skyttel-npm-bootstrap-'));
try {
  execFileSync('npm', ['install', '--global', `npm@${version}`], {
    cwd: directory,
    stdio: 'inherit',
  });
  const installed = execFileSync('npm', ['--version'], { cwd: directory, encoding: 'utf8' }).trim();
  if (installed !== version)
    throw new Error(`Expected npm ${version}, but npm ${installed} is active.`);
  console.log(`Using repository npm ${version}.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
