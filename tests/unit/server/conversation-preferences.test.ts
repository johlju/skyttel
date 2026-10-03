import { afterEach, beforeEach, expect, test } from 'vitest';
import { defaultConversationPreferences } from '../../../src/shared/conversation-preferences.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map/conversation-preferences`;
});
afterEach(() => fixture.close());

test('a personal draft choice defaults to closed and survives rereading without consent', async () => {
  expect(await (await client.request(path)).json()).toEqual({
    ...defaultConversationPreferences,
    showDraftOnStart: false,
  });
  expect(await (await client.json(path, { showDraftOnStart: true })).json()).toEqual({
    ...defaultConversationPreferences,
    showDraftOnStart: true,
  });
  expect(await (await client.request(path)).json()).toEqual({
    ...defaultConversationPreferences,
    showDraftOnStart: true,
  });
  expect(await (await client.json(path, { showDraftOnStart: false })).json()).toEqual({
    ...defaultConversationPreferences,
    showDraftOnStart: false,
  });
});

test('invalid personal choices, unknown households and unauthenticated requests cannot change the setting', async () => {
  for (const body of [
    {},
    { showDraftOnStart: 'true' },
    { showDraftOnStart: false, userId: 'another' },
    { textWidth: 299 },
    { draftWidth: 259 },
    { textWidth: 400.5 },
    { draftWidth: '340' },
    { textWidth: Number.MAX_SAFE_INTEGER + 1 },
  ])
    expect((await client.json(path, body)).status).toBe(400);
  expect(
    (await client.request('/api/households/missing/map/conversation-preferences')).status,
  ).toBe(403);
  expect((await fixture.client().request(path)).status).toBe(401);
  expect(
    (
      await client.json('/api/households/missing/map/conversation-preferences', {
        showDraftOnStart: true,
      })
    ).status,
  ).toBe(403);
  expect(await (await client.request(path)).json()).toEqual({
    ...defaultConversationPreferences,
    showDraftOnStart: false,
  });
});

test('independent partial width changes retain the other personal choices', async () => {
  await client.json(path, { showDraftOnStart: true, textWidth: 624, draftWidth: 460 });
  expect(await (await client.json(path, { textWidth: 648 })).json()).toEqual({
    showDraftOnStart: true,
    textWidth: 648,
    draftWidth: 460,
  });
  expect(await (await client.json(path, { draftWidth: 484 })).json()).toEqual({
    showDraftOnStart: true,
    textWidth: 648,
    draftWidth: 484,
  });
  expect(await (await client.json(path, { textWidth: 400, draftWidth: 340 })).json()).toEqual({
    ...defaultConversationPreferences,
    showDraftOnStart: true,
  });
});
