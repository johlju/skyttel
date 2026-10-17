import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let snapshotDirectory: string | undefined;
afterEach(async () => {
  await client?.dispose();
  await app?.close();
  if (snapshotDirectory) rmSync(snapshotDirectory, { recursive: true, force: true });
  snapshotDirectory = undefined;
});

test.each(['before-deadline', 'after-idle-end'] as const)(
  'a crash clears bounded accepted work without renewing beyond its original deadline: %s',
  async (restart) => {
    let clock = Date.now();
    const model = textModel(() => new Promise<unknown[]>(() => {}));
    app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
    client = await request.newContext();
    await signIn(client, app.origin);
    const { household } = await (await createHousehold(client, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const conversation = await (
      await client.post(path, {
        headers: { origin: app.origin },
        data: approvedForVisit,
      })
    ).json();
    clock += 25 * 60_000;
    expect(
      (
        await client.post(`${path}/${conversation.id}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: 'crash-work',
            revision: 0,
            draftVersion: 0,
            contentVersion: 1,
            text: 'Beskriv kartan.',
          },
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => model.requests.length).toBe(1);
    const originalDeadline = clock + 30 * 60_000;
    snapshotDirectory = mkdtempSync(join(tmpdir(), 'skyttel-idle-crash-'));
    const snapshot = join(snapshotDirectory, 'skyttel.db');
    await app.saveDatabase(snapshot);
    const storageState = await client.storageState();
    await client.dispose();
    await app.close();
    clock = originalDeadline + (restart === 'before-deadline' ? -1 : 30 * 60_000);
    app = await createInstallation(undefined, {
      now: () => clock,
      databasePath: snapshot,
      modelFetch: model.provider,
    });
    client = await request.newContext({ storageState });
    if (restart === 'before-deadline') {
      expect((await (await client.get(`${app.origin}/api/bootstrap`)).json()).status).toBe('ready');
      const policy = await (
        await client.post(`${app.origin}/api/browser-binding/status`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).json();
      expect(policy.expiresAt).toBe(clock + 30 * 60_000);
      expect((await client.get(`${app.origin}/api/households/${household.id}/map`)).status()).toBe(
        200,
      );
      clock = policy.expiresAt;
    }
    expect((await (await client.get(`${app.origin}/api/bootstrap`)).json()).status).toBe(
      'anonymous',
    );
    expect(model.requests).toHaveLength(1);
  },
);

test('accepted finite work pauses idle until its clear terminal result, then starts thirty minutes', async () => {
  let clock = Date.now();
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
  client = await request.newContext();
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const conversation = await (
    await client.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
  ).json();
  clock += 25 * 60_000;
  const accepted = await client.post(`${path}/${conversation.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      requestId: 'finite-work',
      revision: 0,
      draftVersion: 0,
      contentVersion: 1,
      text: 'Beskriv kartan.',
    },
  });
  expect(accepted.status()).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
  clock += 15 * 60_000;
  expect((await (await client.get(`${app.origin}/api/bootstrap`)).json()).status).toBe('ready');
  release([modelMessage('Jag är klar. Inga ändringar föreslås.')]);
  await expect
    .poll(async () => (await (await client.get(`${path}/${conversation.id}`)).json()).phase)
    .toBe('ready');
  const policy = await (
    await client.post(`${app.origin}/api/browser-binding/status`, {
      headers: { origin: app.origin },
      data: {},
    })
  ).json();
  expect(policy.expiresAt).toBe(clock + 30 * 60_000);
  clock += 30 * 60_000;
  expect((await (await client.get(`${app.origin}/api/bootstrap`)).json()).status).toBe('anonymous');
});
