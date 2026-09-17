import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const entryPoint = resolve('dist/server/index.js');

function start(databasePath: string, port: number, overrides: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, [entryPoint], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      SKYTTEL_ORIGIN: `http://127.0.0.1:${port}`,
      SKYTTEL_DATABASE_PATH: databasePath,
      SKYTTEL_FIRST_ADMIN_PROVIDER: 'google',
      SKYTTEL_FIRST_ADMIN_SUBJECT: 'synthetic-private-subject',
      BETTER_AUTH_SECRET: 'synthetic-private-auth-secret-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'synthetic-google-client',
      GOOGLE_CLIENT_SECRET: 'synthetic-private-google-secret',
      MICROSOFT_CLIENT_ID: 'synthetic-microsoft-client',
      MICROSOFT_CLIENT_SECRET: 'synthetic-private-microsoft-secret',
      HOST: '127.0.0.1',
      PORT: String(port),
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const closed = once(child, 'close');
  return {
    child,
    closed,
    output: () => output,
    async dispose() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
    },
  };
}

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No synthetic listener address');
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      ),
  };
}

test('invalid configuration exits with only a redacted diagnostic', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-startup-'));
  const server = start(join(directory, 'skyttel.sqlite'), 3000, {
    SKYTTEL_ORIGIN: 'synthetic-private-invalid-origin',
  });
  try {
    expect(await server.closed).toEqual([1, null]);
    expect(server.output().trim()).toBe(
      JSON.stringify({ event: 'configuration_invalid', variable: 'SKYTTEL_ORIGIN' }),
    );
  } finally {
    await server.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an occupied listener exits without readiness or private diagnostics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-startup-'));
  const reservation = await reservePort();
  const server = start(join(directory, 'skyttel.sqlite'), reservation.port);
  try {
    expect(await server.closed).toEqual([1, null]);
    expect(server.output().trim()).toBe(JSON.stringify({ event: 'listener_failed' }));
  } finally {
    await server.dispose();
    await reservation.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`the compiled server closes cleanly on ${signal} and can reopen its SQLite storage`, async ({
    request,
  }) => {
    const directory = await mkdtemp(join(tmpdir(), 'skyttel-startup-'));
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.close();
    let server = start(join(directory, 'skyttel.sqlite'), port);
    try {
      for (let run = 0; run < 2; run += 1) {
        await expect.poll(server.output).toContain('server_ready');
        const health = await request.get(`http://127.0.0.1:${port}/healthz`);
        expect(health.status()).toBe(200);
        expect(await health.json()).toEqual({ status: 'ok' });
        server.child.kill(signal);
        expect(await server.closed).toEqual([0, null]);
        expect(server.output().trim()).toBe(JSON.stringify({ event: 'server_ready' }));
        if (run === 0) server = start(join(directory, 'skyttel.sqlite'), port);
      }
    } finally {
      await server.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
