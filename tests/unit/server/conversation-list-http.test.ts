import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import type {
  RetainedConversation,
  TextAssistantView,
} from '../../../src/shared/text-assistant.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

test('only an accepted request lists a conversation and a delayed title follows its original ID', async () => {
  const instruction = 'Var finns cykeln?';
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const titleInputs: unknown[] = [];
  const model = textModel(() => [modelMessage('I garaget.')]);
  const title = textModel(async (body) => {
    titleInputs.push(body.input);
    await held;
    return [modelMessage('Cykelns plats')];
  });
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    titleFetch: title.provider,
  });
  const client = await request.newContext();
  try {
    await signIn(client, app.origin);
    const { household } = await (await createHousehold(client, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (url: string, data: object) =>
      client.post(url, { headers: { origin: app.origin }, data });
    const list = async (): Promise<RetainedConversation[]> =>
      (await (await client.get(`${path}/retained`)).json()).conversations;
    const first: TextAssistantView = await (await post(path, approvedForVisit)).json();
    expect(await list()).toEqual([]);
    const sent = await post(`${path}/${first.id}/messages`, {
      text: instruction,
      revision: first.revision,
      requestId: crypto.randomUUID(),
      draftVersion: first.review.version,
      contentVersion: first.review.contentVersion,
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await expect.poll(async () => (await list()).map((row) => row.title)).toEqual([instruction]);
    await expect
      .poll(async () => (await (await client.get(`${path}/${first.id}`)).json()).modelReply)
      .toBe('I garaget.');
    const [before] = await list();
    const reset = await post(`${path}/${first.id}/messages`, {
      text: 'Nytt samtal',
      revision: (await (await client.get(`${path}/${first.id}`)).json()).revision,
      requestId: crypto.randomUUID(),
      draftVersion: first.review.version,
      contentVersion: first.review.contentVersion,
    });
    expect(reset.status()).toBe(201);
    const second = await reset.json();
    expect(second.review).toEqual(first.review);
    expect(second.conversation ?? []).toEqual([]);
    expect(second.id).not.toBe(first.id);
    expect(await list()).toHaveLength(1);
    release();
    await expect
      .poll(async () => (await list()).map((row) => row.title))
      .toEqual(['Cykelns plats']);
    expect(titleInputs).toEqual([[{ role: 'user', content: instruction }]]);
    expect((await list())[0]).toMatchObject({ id: first.id, expiresAt: before.expiresAt });
  } finally {
    release();
    await client.dispose();
    await app.close();
  }
});

test('reading from another device leaves admitted work in place and a late title cannot revive a removed conversation', async () => {
  let finishWork!: () => void;
  let finishTitle!: () => void;
  const work = new Promise<void>((resolve) => {
    finishWork = resolve;
  });
  const pendingTitle = new Promise<void>((resolve) => {
    finishTitle = resolve;
  });
  const dialogue = textModel(async () => {
    await work;
    return [modelMessage('Klart.')];
  });
  const title = textModel(async () => {
    await pendingTitle;
    return [modelMessage('Sen titel')];
  });
  let titleRequestId: string | null = null;
  let titleCompleted = false;
  const app = await createInstallation(undefined, {
    modelFetch: dialogue.provider,
    titleFetch: async (url, init) => {
      const response = await title.provider(url, init);
      titleRequestId = response.headers.get('x-request-id');
      return response;
    },
    modelUsage: (attempt) => {
      if (titleRequestId && attempt.requestId === titleRequestId && attempt.outcome === 'completed')
        titleCompleted = true;
    },
  });
  const writer = await request.newContext();
  const reader = await request.newContext();
  try {
    await signIn(writer, app.origin);
    const { household } = await (await createHousehold(writer, app.origin)).json();
    await signIn(reader, app.origin);
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const headers = { origin: app.origin };
    const session: TextAssistantView = await (
      await writer.post(path, { headers, data: approvedForVisit })
    ).json();
    const endpoint = `${path}/${session.id}`;
    const opened = `${path}/retained/${session.id}/open`;
    const deletion = `${path}/retained/${session.id}/delete`;
    const admitted = await writer.post(`${endpoint}/messages`, {
      headers,
      data: {
        text: 'Beskriv garaget.',
        requestId: crypto.randomUUID(),
        revision: session.revision,
        draftVersion: session.review.version,
        contentVersion: session.review.contentVersion,
      },
    });
    expect(admitted.status()).toBe(202);
    await expect.poll(() => dialogue.requests.length).toBe(1);
    expect(await (await reader.get(opened)).json()).toMatchObject({
      id: session.id,
      requiresActivation: true,
      phase: 'working',
    });
    const busy = await reader.post(opened, {
      headers,
      data: { ...approvedForVisit, activate: true },
    });
    expect(busy.status()).toBe(409);
    const blockedDeletion = await reader.post(deletion, { headers, data: {} });
    expect(blockedDeletion.status()).toBe(409);
    expect(await blockedDeletion.json()).toEqual({ error: 'assistant_conversation_busy' });
    const stillWorking = await (await writer.get(endpoint)).json();
    expect(stillWorking).toMatchObject({ id: session.id, phase: 'working' });
    expect(stillWorking.paused).not.toBe(true);
    finishWork();
    await expect
      .poll(async () => (await (await writer.get(endpoint)).json()).modelReply)
      .toBe('Klart.');
    const { user } = await (await reader.get(`${app.origin}/api/bootstrap`)).json();
    app.seedMembership(user.id, 'other-household', 'Annat hushåll');
    const wrongHousehold = deletion.replace(`/${household.id}/`, '/other-household/');
    expect((await reader.post(wrongHousehold, { headers, data: {} })).status()).toBe(404);
    expect((await writer.get(endpoint)).status()).toBe(200);
    expect((await reader.post(deletion, { headers, data: {} })).status()).toBe(200);
    expect((await reader.post(deletion, { headers, data: {} })).status()).toBe(200);
    const removed = await writer.get(endpoint);
    expect(removed.status()).toBe(404);
    expect(await removed.json()).toEqual({ error: 'assistant_conversation_deleted' });
    finishTitle();
    await expect.poll(() => titleCompleted).toBe(true);
    expect((await reader.get(opened)).status()).toBe(404);
    expect(await (await reader.get(`${path}/retained`)).json()).toEqual({ conversations: [] });
    expect(title.requests).toHaveLength(1);
  } finally {
    finishWork();
    finishTitle();
    await writer.dispose();
    await reader.dispose();
    await app.close();
  }
});

test('unusable generated titles retain the original request and list order across a restart', async () => {
  const alternatives = [' ', 'Första raden\nAndra raden', 'x'.repeat(81)];
  const model = textModel(() => [modelMessage('Klart.')]);
  const titles = textModel(() => [modelMessage(alternatives.shift() ?? '')]);
  const titleIds = new Set<string>();
  const completedTitles = new Set<string>();
  let time = Date.now();
  const app = await createInstallation(undefined, {
    now: () => time,
    modelFetch: model.provider,
    titleFetch: async (url, init) => {
      const response = await titles.provider(url, init);
      const id = response.headers.get('x-request-id');
      if (id) titleIds.add(id);
      return response;
    },
    modelUsage(attempt) {
      if (attempt.requestId && titleIds.has(attempt.requestId))
        completedTitles.add(attempt.requestId);
    },
  });
  let client = await request.newContext();
  try {
    await signIn(client, app.origin);
    const { household } = await (await createHousehold(client, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const headers = { origin: app.origin };
    const requests = ['Var ligger nyckeln?', 'Beskriv cykeln.', 'Var ligger garaget?'];
    const ids: string[] = [];
    for (const text of requests) {
      time += 60_000;
      const session: TextAssistantView = await (
        await client.post(path, { headers, data: approvedForVisit })
      ).json();
      ids.push(session.id);
      const message = await client.post(`${path}/${session.id}/messages`, {
        headers,
        data: {
          text,
          requestId: crypto.randomUUID(),
          revision: session.revision,
          draftVersion: session.review.version,
          contentVersion: session.review.contentVersion,
        },
      });
      expect(message.status()).toBe(202);
      await expect
        .poll(async () => (await (await client.get(`${path}/${session.id}`)).json()).modelReply)
        .toBe('Klart.');
    }
    const list = async (): Promise<RetainedConversation[]> =>
      (await (await client.get(`${path}/retained`)).json()).conversations;
    await expect.poll(() => completedTitles.size).toBe(requests.length);
    const ordered = requests.map((title, index) => ({ title, id: ids[index] })).reverse();
    expect((await list()).map(({ id, title }) => ({ id, title }))).toEqual(ordered);
    client = await restartWithSession(client, () => app.restart());
    const stored = await list();
    expect(stored.map(({ id, title }) => ({ id, title }))).toEqual(ordered);
    expect(stored.every((row) => row.paused)).toBe(true);
  } finally {
    await client.dispose();
    await app.close();
  }
});

test('reading an idle conversation on a second browser leaves ownership in place until consented activation', async () => {
  const model = textModel(() => [modelMessage('I garaget.')]);
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  const owner = await request.newContext();
  const reader = await request.newContext();
  try {
    await signIn(owner, app.origin);
    const { household } = await (await createHousehold(owner, app.origin)).json();
    await signIn(reader, app.origin);
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const headers = { origin: app.origin };
    const session: TextAssistantView = await (
      await owner.post(path, { headers, data: approvedForVisit })
    ).json();
    const open = `${path}/retained/${session.id}/open`;
    expect((await reader.get(open)).status()).toBe(404);
    const sent = await owner.post(`${path}/${session.id}/messages`, {
      headers,
      data: {
        requestId: crypto.randomUUID(),
        text: 'Var står cykeln?',
        revision: session.revision,
        draftVersion: session.review.version,
        contentVersion: session.review.contentVersion,
      },
    });
    expect(sent.status()).toBe(202);
    await expect
      .poll(async () => (await (await owner.get(`${path}/${session.id}`)).json()).modelReply)
      .toBe('I garaget.');
    const selected = await reader.post(open, { headers, data: {} });
    expect(await selected.json()).toMatchObject({ id: session.id, requiresActivation: true });
    const refused = await reader.post(open, { headers, data: { activate: true } });
    expect(refused.status()).toBe(403);
    expect((await owner.get(`${path}/${session.id}`)).status()).toBe(200);
    const active = await reader.post(open, {
      headers,
      data: { activate: true, ...approvedForVisit },
    });
    expect(active.status()).toBe(200);
    const view: TextAssistantView = await active.json();
    expect(view.id).toBe(session.id);
    expect(view.paused).toBe(false);
    expect(view.conversation?.map((row) => row.text)).toEqual(['Var står cykeln?', 'I garaget.']);
    expect((await reader.get(`${path}/${session.id}`)).status()).toBe(200);
    expect((await owner.get(`${path}/${session.id}`)).status()).toBe(404);
    expect(model.requests).toHaveLength(1);
  } finally {
    await owner.dispose();
    await reader.dispose();
    await app.close();
  }
});
