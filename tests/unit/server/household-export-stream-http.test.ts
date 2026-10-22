import { randomBytes } from 'node:crypto';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from '@playwright/test';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { expect, test, vi } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

test('technical: revocation or demotion interrupts an active download and removes its private copy', {
  tags: ['technical'],
}, async () => {
  const installation = await createInstallation();
  const client = await request.newContext();
  const other = await request.newContext();
  const diagnostic = vi.spyOn(console, 'error');
  const information = vi.spyOn(console, 'info');
  try {
    await signIn(client, installation.origin);
    const { household } = await (await createHousehold(client, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    const { user } = await (await other.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await client.post(`${path}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await other.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
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
            .run(`retained-${index}`, household.id, 'historical-object', user.id, pixels);
      })();
    } finally {
      database.close();
    }
    for (const action of ['role', 'revoke']) {
      expect(
        (
          await client.post(`${path}/members/${user.id}/role`, {
            headers,
            data: { role: 'administrator' },
          })
        ).status(),
      ).toBe(200);
      const prepared = await other.post(`${path}/exports`, { headers, data: {} });
      expect(prepared.status()).toBe(201);
      const ready = await prepared.json();
      expect(ready.bytes).toBeGreaterThan(16 * 1024 * 1024);
      const cookies = (await other.storageState()).cookies
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ');
      const deadline = AbortSignal.timeout(3000);
      const response = await fetch(`${path}/exports/${ready.id}`, {
        headers: { cookie: cookies },
        signal: deadline,
      });
      expect(response.status).toBe(200);
      if (!response.body) throw new Error('Archive stream required');
      const reader = response.body.getReader();
      const first = await reader.read();
      expect(first.value?.byteLength).toBeGreaterThan(0);
      let received = first.value?.byteLength ?? 0;
      // Stop consuming the real HTTP transfer while the other administrator
      // changes access. Bytes already in network buffers cannot be recalled.
      expect(
        (
          await client.post(`${path}/members/${user.id}/${action}`, {
            headers,
            data: action === 'role' ? { role: 'member' } : {},
          })
        ).status(),
      ).toBe(200);
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value.byteLength;
        }
      } catch {
        // An interrupted content-length response rejects rather than completing.
      } finally {
        reader.releaseLock();
      }
      expect(received).toBeLessThan(ready.bytes);
      expect(deadline.aborted).toBe(false);
      expect(await readdir(join(installation.directory, '.skyttel-exports'))).toEqual([]);
      expect((await other.get(`${path}/exports/${ready.id}`)).status()).toBe(403);
      expect(diagnostic).not.toHaveBeenCalled();
      expect(information).not.toHaveBeenCalled();
    }
  } finally {
    await other.dispose();
    await client.dispose();
    await installation.close();
    diagnostic.mockRestore();
    information.mockRestore();
  }
});

test('an archive read failure still reaches the HTTP server error log and removes its copy', async () => {
  const installation = await createInstallation();
  const client = await request.newContext();
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await signIn(client, installation.origin);
    const { household } = await (await createHousehold(client, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/exports`;
    const prepared = await client.post(path, {
      headers: { origin: installation.origin },
      data: {},
    });
    expect(prepared.status()).toBe(201);
    const ready = await prepared.json();
    const directory = join(installation.directory, '.skyttel-exports');
    await unlink(join(directory, ready.id, 'archive.zip'));
    const cookies = (await client.storageState()).cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    await expect(
      fetch(`${path}/${ready.id}`, { headers: { cookie: cookies } }).then((response) =>
        response.arrayBuffer(),
      ),
    ).rejects.toThrow();
    expect(diagnostic.mock.calls).toEqual([[expect.objectContaining({ code: 'ENOENT' })]]);
    await expect.poll(() => readdir(directory)).toEqual([]);
  } finally {
    await client.dispose();
    await installation.close();
    diagnostic.mockRestore();
  }
});
