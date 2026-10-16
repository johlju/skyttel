import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { alex, createInstallation, robin } from '../tests/support/installation.js';

const { values } = parseArgs({
  options: { microsoft: { type: 'boolean' }, https: { type: 'boolean' } },
});
const provider = values.microsoft ? 'microsoft' : 'google';
const identity = values.microsoft ? robin : alex;
let holdInitialization: 'candidate' | 'register' | 'reset-check' | null = null;
let releaseInitialization: (() => void) | undefined;
let dropLoginCookie = false;
let clockOffset = 0;
let loseStorageReply = false;
let copyGeneration = '11111111-1111-4111-8111-111111111111';
let generation = copyGeneration;
let hasCopy = false;
let holdSessionStatus = false;
let releaseSessionStatus: (() => void) | undefined;
const installation = await createInstallation(
  { provider, subject: identity.subject },
  {
    https: values.https,
    now: () => Date.now() + clockOffset,
    async deliverResponse(request, response) {
      if (
        loseStorageReply &&
        new URL(request.url).pathname === '/api/browser-binding/revoke' &&
        response.ok
      )
        return new Response(null, { status: 502 });
      if (
        holdSessionStatus &&
        new URL(request.url).pathname === '/api/browser-binding/status' &&
        (await response.clone().json()).state === 'expired'
      ) {
        holdSessionStatus = false;
        await new Promise<void>((resolve) => {
          releaseSessionStatus = resolve;
          console.log(JSON.stringify({ event: 'session_status_held' }));
        });
        releaseSessionStatus = undefined;
      }
      if (dropLoginCookie && new URL(request.url).pathname.startsWith('/api/auth/callback/')) {
        const headers = new Headers(response.headers);
        headers.delete('set-cookie');
        for (const cookie of response.headers.getSetCookie())
          if (!cookie.split(';', 1)[0].split('=')[0].endsWith('better-auth.session_token'))
            headers.append('set-cookie', cookie);
        return new Response(response.body, { status: response.status, headers });
      }
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
              event:
                stage === 'candidate'
                  ? 'initialization_held'
                  : stage === 'register'
                    ? 'registration_held'
                    : 'reset_held',
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
    'provider-down | provider-up | deny-consent | allow-consent | drop-login-cookie | allow-login-cookie | hold-initialization | hold-registration | hold-reset-check | release-initialization | save-copy | restore-copy | lose-storage-reply | allow-storage-reply | hold-session-status | release-session-status | advance-minutes N (1–480) | advance-day | restart | quit',
  );
  for await (const line of input) {
    const command = line.trim();
    const minutes = /^advance-minutes ([1-9]\d{0,2})$/.exec(command);
    if (command === 'quit') break;
    if (command === 'provider-down') installation.failProvider(true);
    else if (command === 'provider-up') installation.failProvider(false);
    else if (command === 'deny-consent') installation.denyConsent(true);
    else if (command === 'allow-consent') installation.denyConsent(false);
    else if (command === 'drop-login-cookie') dropLoginCookie = true;
    else if (command === 'allow-login-cookie') dropLoginCookie = false;
    else if (command === 'lose-storage-reply') loseStorageReply = true;
    else if (command === 'allow-storage-reply') loseStorageReply = false;
    else if (command === 'save-copy') {
      const originalCopyTime = new Date().toISOString();
      await installation.saveDatabase(join(installation.directory, 'manual-copy.sqlite'));
      copyGeneration = generation;
      hasCopy = true;
      console.log(JSON.stringify({ event: 'copy_saved', originalCopyTime }));
    } else if (command === 'restore-copy' && hasCopy) {
      generation = randomUUID();
      await installation.restoreDatabase(join(installation.directory, 'manual-copy.sqlite'), {
        generation,
        restore: { fromGeneration: copyGeneration, confirmedAt: Date.now(), erasureReviewed: true },
      });
      console.log(JSON.stringify({ event: 'synthetic_copy_restored' }));
    } else if (command === 'advance-day') clockOffset += 86_400_000;
    else if (command === 'hold-session-status' && !releaseSessionStatus) holdSessionStatus = true;
    else if (command === 'release-session-status') {
      releaseSessionStatus?.();
      holdSessionStatus = false;
    } else if (minutes && Number(minutes[1]) <= 480) clockOffset += Number(minutes[1]) * 60_000;
    else if (command === 'hold-initialization' && !releaseInitialization)
      holdInitialization = 'candidate';
    else if (command === 'hold-registration' && !releaseInitialization)
      holdInitialization = 'register';
    else if (command === 'hold-reset-check' && !releaseInitialization)
      holdInitialization = 'reset-check';
    else if (command === 'release-initialization') {
      releaseInitialization?.();
      holdInitialization = null;
    } else if (command === 'restart') {
      releaseSessionStatus?.();
      holdSessionStatus = false;
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
  releaseSessionStatus?.();
  releaseInitialization?.();
  input.close();
  await installation.close();
  console.log(JSON.stringify({ event: 'closed', directory: installation.directory }));
}
