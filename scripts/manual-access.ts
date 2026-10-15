import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { alex, createInstallation, robin } from '../tests/support/installation.js';

const { values } = parseArgs({
  options: { microsoft: { type: 'boolean' }, https: { type: 'boolean' } },
});
const provider = values.microsoft ? 'microsoft' : 'google';
const identity = values.microsoft ? robin : alex;
let holdInitialization: 'candidate' | 'register' | null = null;
let releaseInitialization: (() => void) | undefined;
const installation = await createInstallation(
  { provider, subject: identity.subject },
  {
    https: values.https,
    async deliverResponse(request, response) {
      if (
        holdInitialization &&
        new URL(request.url).pathname === `/api/browser-binding/${holdInitialization}`
      ) {
        const stage = holdInitialization;
        holdInitialization = null;
        await new Promise<void>((resolve) => {
          releaseInitialization = resolve;
          console.log(
            JSON.stringify({
              event: stage === 'candidate' ? 'initialization_held' : 'registration_held',
            }),
          );
        });
        releaseInitialization = undefined;
      }
      return response;
    },
  },
);
installation.setIdentity(identity);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
process.once('SIGINT', () => input.close());
process.once('SIGTERM', () => input.close());
try {
  console.log(
    JSON.stringify({
      event: 'ready',
      origin: installation.origin,
      directory: installation.directory,
      provider,
    }),
  );
  console.log(
    'provider-down | provider-up | deny-consent | allow-consent | hold-initialization | hold-registration | release-initialization | restart | quit',
  );
  for await (const line of input) {
    const command = line.trim();
    if (command === 'quit') break;
    if (command === 'provider-down') installation.failProvider(true);
    else if (command === 'provider-up') installation.failProvider(false);
    else if (command === 'deny-consent') installation.denyConsent(true);
    else if (command === 'allow-consent') installation.denyConsent(false);
    else if (command === 'hold-initialization' && !releaseInitialization)
      holdInitialization = 'candidate';
    else if (command === 'hold-registration' && !releaseInitialization)
      holdInitialization = 'register';
    else if (command === 'release-initialization') {
      releaseInitialization?.();
      holdInitialization = null;
    } else if (command === 'restart') {
      releaseInitialization?.();
      holdInitialization = null;
      await installation.restart();
    } else {
      console.log('Unknown command.');
      continue;
    }
    console.log(JSON.stringify({ event: 'configured', command }));
  }
} finally {
  releaseInitialization?.();
  input.close();
  await installation.close();
  console.log(JSON.stringify({ event: 'closed', directory: installation.directory }));
}
