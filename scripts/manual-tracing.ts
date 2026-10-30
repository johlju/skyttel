import { createInterface } from 'node:readline';
import type { TraceSending } from '../src/server/trace-sending.js';
import { alex, createInstallation, robin } from '../tests/support/installation.js';

async function main() {
  const disconnected = process.argv[2] === '--disconnected';
  if (
    process.env.NODE_ENV === 'production' ||
    process.argv.length > 3 ||
    (process.argv.length === 3 && !disconnected)
  )
    throw new Error('Use the development environment with optional --disconnected.');
  let sending!: TraceSending;
  const app = await createInstallation(undefined, {
    traceDelivery: disconnected
      ? undefined
      : (control) => {
          sending = control;
          return { start() {}, stop() {} };
        },
  });
  const input = createInterface({ input: process.stdin });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    console.log(
      JSON.stringify({
        event: 'ready',
        connected: !disconnected,
        origin: app.origin,
        directory: app.directory,
        commands: [
          ...(!disconnected ? ['delivered', 'drop', 'quota', 'credentials'] : []),
          'restart',
          'robin',
          'alex',
          'quit',
        ],
      }),
    );
    for await (const command of input) {
      if (command === 'quit') break;
      if (disconnected && ['delivered', 'drop', 'quota', 'credentials'].includes(command)) {
        console.log('No delivery adapter is connected.');
        continue;
      }
      if (command === 'delivered') sending.delivered();
      else if (command === 'drop') sending.dropped('oversized', 2);
      else if (command === 'quota' || command === 'credentials') sending.suspend(command);
      else if (command === 'restart') {
        await app.restart();
        console.log(
          JSON.stringify({ event: 'restarted', origin: app.origin, directory: app.directory }),
        );
      } else if (command === 'alex') app.setIdentity(alex);
      else if (command === 'robin') {
        app.setIdentity(robin);
        console.log('Sign in with Microsoft in a separate browser profile.');
      } else console.log('Unknown command.');
      console.log('Ready. Refresh delivery status in the browser.');
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    input.close();
    await app.close();
    console.log(JSON.stringify({ event: 'closed', removedDirectory: app.directory }));
  }
}
main().catch(() => {
  console.error('Disposable tracing fixture failed. Check the local build and ports.');
  process.exitCode = 1;
});
