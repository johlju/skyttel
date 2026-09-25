import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, readlink } from 'node:fs/promises';
import { get, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from '@playwright/test';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import type { ReadyExport } from '../src/shared/household-export.js';
import { createHousehold, signIn } from '../tests/support/client.js';
import { alex, createInstallation, robin } from '../tests/support/installation.js';

// A fresh, loopback-only application fixture. Only external provider responses
// are synthetic. Cookies stay in memory; no existing origin or database accepted.
const emit = (event: string, values = {}) => console.log(JSON.stringify({ event, ...values }));
type Transfer = ReadyExport & {
  response: IncomingMessage;
  receivedBytes: number;
  interrupted: boolean;
  settled: Promise<void>;
};

async function main() {
  if (
    process.platform !== 'linux' ||
    process.env.NODE_ENV === 'production' ||
    process.argv.length > 2
  )
    throw new Error('Run without arguments in the Linux development environment.');
  process.umask(0o077);
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const reader = await request.newContext();
  const input = createInterface({ input: process.stdin });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let transfer: Transfer | undefined;
  let path = '';
  const headers = { origin: installation.origin };
  const scratchDirectory = join(installation.directory, '.skyttel-exports');
  try {
    await signIn(administrator, installation.origin);
    const { household } = await (await createHousehold(administrator, installation.origin)).json();
    path = `${installation.origin}/api/households/${household.id}`;
    installation.setIdentity(robin);
    await signIn(reader, installation.origin, 'microsoft');
    const { user } = await (await reader.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await administrator.post(`${path}/invitations`, {
        headers,
        data: { userId: user.id },
      })
    ).json();
    if (
      (
        await reader.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status() !== 200 ||
      (
        await administrator.post(`${path}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status() !== 200
    )
      throw new Error('Public household setup failed.');
    installation.setIdentity(alex);
    const pixels = await sharp(randomBytes(256 * 256 * 3), {
      raw: { width: 256, height: 256, channels: 3 },
    })
      .webp({ lossless: true })
      .toBuffer();
    const database = new Database(join(installation.directory, 'skyttel.db'));
    try {
      database.transaction(() => {
        for (let index = 0; index < 100; index++)
          database
            .prepare('INSERT INTO profile_image VALUES (?, ?, ?, ?, ?, 256, 256)')
            .run(
              `manual-retained-${index}`,
              household.id,
              'manual-historical-object',
              user.id,
              pixels,
            );
      })();
    } finally {
      database.close();
    }

    async function inspect() {
      if (!transfer) throw new Error('Use pause to start a new export first.');
      const archive = join(scratchDirectory, transfer.id, 'archive.zip');
      let sourceReadBytes: number | null = null;
      // Linux reports the actual source file offset. A pending client alone
      // cannot establish that the server has not already sent the whole file.
      for (const fd of await readdir('/proc/self/fd')) {
        try {
          if ((await readlink(`/proc/self/fd/${fd}`)) !== archive) continue;
          const info = await readFile(`/proc/self/fdinfo/${fd}`, 'utf8');
          sourceReadBytes = Number(/^pos:\s*(\d+)/m.exec(info)?.[1]);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      return {
        id: transfer.id,
        archiveBytes: transfer.bytes,
        receivedBytes: transfer.receivedBytes,
        sourceReadBytes,
        active:
          existsSync(archive) &&
          sourceReadBytes !== null &&
          sourceReadBytes >= transfer.receivedBytes &&
          sourceReadBytes < transfer.bytes &&
          !transfer.response.complete &&
          Date.now() < Date.parse(transfer.expiresAt),
        expiresAt: transfer.expiresAt,
      };
    }

    emit('ready', {
      origin: installation.origin,
      directory: installation.directory,
      scratchDirectory,
      householdId: household.id,
      robinId: user.id,
      administrationUrl: `${installation.origin}/households/${household.id}/administration`,
      commands: ['pause', 'inspect', 'resume', 'quit'],
    });
    for await (const line of input) {
      const command = line.trim();
      if (command === 'quit') break;
      try {
        if (command === 'pause') {
          if (transfer) throw new Error('Resume the current transfer before starting another.');
          const prepared = await reader.post(`${path}/exports`, { headers, data: {} });
          if (prepared.status() !== 201)
            throw new Error(`Prepare HTTP ${prepared.status()}; Robin must be an administrator.`);
          const ready: ReadyExport = await prepared.json();
          if (ready.bytes <= 16 * 1024 * 1024)
            throw new Error('Archive too small to establish backpressure.');
          const cookie = (await reader.storageState()).cookies
            .map(({ name, value }) => `${name}=${value}`)
            .join('; ');
          const response = await new Promise<IncomingMessage>((resolve, reject) => {
            get(`${path}/exports/${ready.id}`, { headers: { cookie } }, resolve).once(
              'error',
              reject,
            );
          });
          if (
            response.statusCode !== 200 ||
            Number(response.headers['content-length']) !== ready.bytes
          ) {
            response.destroy();
            throw new Error('Expected a successful full-length export response.');
          }
          let settle = () => {};
          const current: Transfer = {
            ...ready,
            response,
            receivedBytes: 0,
            interrupted: false,
            settled: new Promise<void>((resolve) => {
              settle = resolve;
            }),
          };
          transfer = current;
          response.on('error', () => {
            current.interrupted = true;
            settle();
          });
          response.once('end', settle);
          await new Promise<void>((resolve, reject) => {
            response.once('error', reject);
            response.on('data', (chunk: Buffer) => {
              current.receivedBytes += chunk.byteLength;
              if (current.receivedBytes === chunk.byteLength) {
                response.pause();
                resolve();
              }
            });
          });
          let previous: number | null = null;
          let paused = await inspect();
          for (let sample = 0; sample < 20; sample++) {
            await delay(100);
            paused = await inspect();
            if (!paused.active)
              throw new Error(
                'Server source is not active; this is not a valid paused-transfer check.',
              );
            if (paused.sourceReadBytes === previous) break;
            previous = paused.sourceReadBytes;
            if (sample === 19)
              throw new Error('Server source did not settle; repeat with a fresh fixture.');
          }
          emit('paused', paused);
        } else if (command === 'inspect') {
          emit('inspection', await inspect());
        } else if (command === 'resume') {
          if (!transfer) throw new Error('Use pause first.');
          const current = transfer;
          current.response.resume();
          await current.settled;
          const result = {
            id: current.id,
            archiveBytes: current.bytes,
            receivedBytes: current.receivedBytes,
            interrupted: current.interrupted || !current.response.complete,
            beforeExpiry: Date.now() < Date.parse(current.expiresAt),
            scratchEmpty: (await readdir(scratchDirectory)).length === 0,
            retryStatus: (await reader.get(`${path}/exports/${current.id}`)).status(),
          };
          transfer = undefined;
          emit('result', result);
        } else {
          throw new Error('Use pause, inspect, resume or quit.');
        }
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : 'Control failed.' });
      }
    }
  } finally {
    input.close();
    transfer?.response.destroy();
    if (transfer)
      await reader
        .post(`${path}/exports/${transfer.id}/cancel`, { headers, data: {} })
        .catch(() => {});
    await administrator.dispose();
    await reader.dispose();
    await installation.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    emit('closed', { removedDirectory: installation.directory });
  }
}

main().catch((error) => {
  emit('error', {
    message: error instanceof Error ? error.message : 'Disposable export setup failed.',
  });
  process.exitCode = 1;
});
