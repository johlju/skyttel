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

let origin;
try {
  origin = new URL(process.env.SKYTTEL_ORIGIN);
  if (origin.origin !== process.env.SKYTTEL_ORIGIN) throw new Error('Invalid origin');
} catch {
  console.error('Development configuration has an invalid SKYTTEL_ORIGIN.');
  process.exit(1);
}
origin.port = '3301';
const serverEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: '3301',
  SKYTTEL_ORIGIN: origin.origin,
};

let child;
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  child?.kill('SIGTERM');
  const timeout = setTimeout(() => child?.kill('SIGKILL'), 10_000);
  timeout.unref();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

function run(command, args, environment = process.env) {
  return new Promise((resolve) => {
    child = spawn(command, args, { stdio: 'inherit', env: environment });
    child.once('error', (error) => {
      console.error(`Compiled development process could not start: ${error.message}`);
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? (stopping ? 0 : 1)));
  });
}

process.exitCode = await run('npm', ['run', 'build']);
if (process.exitCode === 0 && !stopping) {
  console.info(`Starting the compiled application at ${origin.origin}.`);
  process.exitCode = await run(process.execPath, ['dist/server/index.js'], serverEnvironment);
}
