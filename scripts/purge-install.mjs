import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const modules = new URL('../node_modules/', import.meta.url);
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this maintenance command with npm run purge:install.');

// Keep the directory itself: node_modules is a volume mount in the devcontainer.
await mkdir(modules, { recursive: true });
for (const entry of await readdir(modules)) {
  await rm(new URL(encodeURIComponent(entry), modules), { recursive: true, force: true });
}
const run = (...args) =>
  execFileSync(process.execPath, [npm, ...args], { cwd: root, stdio: 'inherit' });
run('cache', 'clean', '--force');
run('install');
// Regenerate the lock with native optional packages already installed, as in
// Kravhantering's two-phase workaround for extraneous platform dependencies.
await rm(new URL('../package-lock.json', import.meta.url), { force: true });
run('install');
