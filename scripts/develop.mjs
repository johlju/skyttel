import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const environmentFile = process.env.SKYTTEL_DEV_ENV_FILE ?? '.devcontainer/.env';
if (!existsSync(environmentFile)) {
  console.error(
    'Development configuration is missing. Set SKYTTEL_DEV_ENV_FILE to your private environment file; see docs/development/devcontainer.md.',
  );
  process.exit(1);
}
process.loadEnvFile(environmentFile);

const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  const timeout = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 10_000);
  timeout.unref();
}

const commands = [
  ['node_modules/tsx/dist/cli.mjs', 'watch', '--clear-screen=false', 'src/server/index.ts'],
  ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173', '--strictPort'],
];
for (const args of commands) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  children.push(child);
  child.once('error', (error) => {
    console.error(`Development process could not start: ${error.message}`);
    stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`Development process stopped (${code ?? 'signal'}).`);
      stop(code || 1);
    }
  });
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
