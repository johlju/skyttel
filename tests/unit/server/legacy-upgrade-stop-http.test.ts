import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

test('the mandatory maintenance stop closes Live and delivery, rejects a late model mutation and never resumes work on restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-upgrade-stop-'));
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const live = liveProvider();
  const options = {
    databasePath: join(directory, 'skyttel.db'),
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  };
  let app = await createInstallation(undefined, options);
  let stopped = false;
  const client = await request.newContext();
  const WebSocket = createRequire(import.meta.url)('ws') as new (
    url: string,
    options: {
      headers: Record<string, string>;
    },
  ) => {
    on(event: 'message' | 'close' | 'error', callback: (data: unknown) => void): void;
    close(): void;
  };
  let socket: InstanceType<typeof WebSocket> | undefined;
  try {
    await signIn(client, app.origin);
    const { household } = await (await createHousehold(client, app.origin)).json();
    const mapPath = `/api/households/${household.id}/map`;
    const before = await (await client.get(`${app.origin}${mapPath}`)).json();
    const path = `/api/households/${household.id}/text-assistant`;
    const session = await (
      await client.post(`${app.origin}${path}`, {
        headers: { origin: app.origin },
        data: approvedForVisit,
      })
    ).json();
    const endpoint = `${app.origin}${path}/${session.id}`;
    socket = new WebSocket(`${endpoint}/delivery`.replace('http', 'ws'), {
      headers: {
        Origin: app.origin,
        Cookie: (await client.storageState()).cookies
          .map(({ name, value }) => `${name}=${value}`)
          .join('; '),
      },
    });
    const messages: Record<string, unknown>[] = [];
    let closed = false;
    socket.on('message', (data) => messages.push(JSON.parse(String(data))));
    socket.on('close', () => {
      closed = true;
    });
    socket.on('error', () => {});
    await expect.poll(() => messages[0]?.type).toBe('connected');
    const voice = await client.post(`${endpoint}/voice`, {
      headers: { origin: app.origin },
      data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
    });
    expect(voice.status(), await voice.text()).toBe(201);
    expect(
      (
        await client.post(`${endpoint}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: 'held-before-upgrade',
            revision: 0,
            draftVersion: 0,
            contentVersion: 1,
            text: 'Lägg till Sent.',
            deliveryConnectionId: messages[0].id,
          },
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => model.requests.length).toBe(1);
    await app.close();
    stopped = true;
    await expect.poll(() => closed).toBe(true);
    expect(live.channels.size).toBe(0);
    expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(true);
    release([
      modelTool('propose_object', {
        version: 0,
        contentVersion: 1,
        id: 'late',
        baseRevision: null,
        value: { typeId: before.types[0].id, name: 'Sent', description: '' },
      }),
    ]);
    app = await createInstallation(undefined, options);
    stopped = false;
    await signIn(client, app.origin);
    expect(await (await client.get(`${app.origin}${mapPath}`)).json()).toEqual(before);
    expect((await client.get(`${app.origin}${path}/${session.id}`)).status()).toBe(404);
    expect(model.requests).toHaveLength(1);
    expect(messages.some((message) => message.state === 'awaiting-receipt')).toBe(false);
  } finally {
    release([modelMessage('Avslutat.')]);
    socket?.close();
    await client.dispose();
    if (!stopped) await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
