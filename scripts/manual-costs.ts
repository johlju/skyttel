import { createInterface } from 'node:readline';
import { costProvider } from '../tests/support/cost-provider.js';
import { alex, createInstallation, robin } from '../tests/support/installation.js';
import { liveBrowserFixtureSource } from '../tests/support/live-browser.js';

const emit = (event: string, values = {}) => console.log(JSON.stringify({ event, ...values }));

async function main() {
  if (process.env.NODE_ENV === 'production' || process.argv.length > 2)
    throw new Error('Run without arguments in the development environment.');
  process.umask(0o077);
  const provider = costProvider(() => emit('held'));
  const app = await createInstallation(undefined, {
    modelFetch: provider.provider,
    liveFetch: provider.live.provider,
    liveSideband: provider.live.attach,
    browserProviderScript: liveBrowserFixtureSource,
  });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    emit('ready', {
      origin: app.origin,
      directory: app.directory,
      message:
        'Disposable cost checks with controlled providers and silent media. Forward this port privately and sign in with Google as Alex. No real API key or microphone is used. Type help.',
    });
    for await (const raw of input) {
      const [command, value, extra] = raw.trim().split(/\s+/);
      try {
        if (extra) throw new Error('Unexpected extra argument.');
        if (command === 'quit') break;
        if (command === 'help') {
          emit('help', {
            commands: [
              'text known|missing|held',
              'release',
              'delegate',
              'usage SECONDS',
              'finalize on|off',
              'identity alex|robin',
              'restart',
              'quit',
            ],
          });
          continue;
        }
        if (command === 'text') {
          if (!['known', 'missing', 'held'].includes(value)) throw new Error('Unknown text mode.');
          provider.textMode(value as 'known' | 'missing' | 'held');
        } else if (command === 'release') provider.release();
        else if (command === 'delegate') provider.delegate();
        else if (command === 'usage') {
          if (!value) throw new Error('Supply seconds.');
          provider.usage(Number(value));
        } else if (command === 'finalize') {
          if (value !== 'on' && value !== 'off') throw new Error('Use on or off.');
          provider.live.configure({ finalize: value === 'on' });
        } else if (command === 'identity') {
          if (value !== 'alex' && value !== 'robin') throw new Error('Use alex or robin.');
          app.setIdentity(value === 'alex' ? alex : robin);
        } else if (command === 'restart') {
          provider.cancel();
          await app.restart();
          emit('restarted', { origin: app.origin });
          continue;
        } else throw new Error('Unknown command. Type help.');
        emit('changed', { command, value });
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : 'Control failed.' });
      }
    }
  } finally {
    provider.cancel();
    input.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
    emit('closed', { removedDirectory: app.directory });
  }
}

main().catch(() => {
  emit('error', { message: 'Disposable cost fixture failed. Check the local build and ports.' });
  process.exitCode = 1;
});
