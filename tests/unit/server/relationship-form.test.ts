import { unzipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
let submission: Record<string, unknown>;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}`;
  for (const id of ['source', 'target']) {
    const state = await read();
    expect(
      (
        await client.json(`${path}/map/draft`, {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: { name: id, description: '', typeId: state.types[0].id },
        })
      ).status,
    ).toBe(200);
  }
  const state = await read();
  submission = {
    id: 'relationship',
    stagingId: crypto.randomUUID(),
    version: state.draft.version,
    contentVersion: state.contentVersion,
    baseRevision: null,
    typeRevision: state.relationshipTypes[0].revision,
    value: {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'source',
      targetId: 'target',
      knowledge: 'known',
    },
  };
});
afterEach(() => fixture.close());
async function read(): Promise<MapState> {
  return (await client.request(`${path}/map`)).json();
}
const submit = (value = submission) => client.json(`${path}/map/relationship-form`, value);
const outcome = () =>
  `${path}/map/relationship-form/${submission.stagingId}?contentVersion=${submission.contentVersion}`;

test('complete form attempts enforce authentication, membership, origin, owner, versions and reference guards without partial drafts', async () => {
  const before = await read();
  expect((await fixture.client().request(outcome())).status).toBe(401);
  expect(
    (
      await client.request(`${path}/map/relationship-form`, {
        method: 'POST',
        headers: { origin: 'https://elsewhere.test', 'content-type': 'application/json' },
        body: JSON.stringify(submission),
      })
    ).status,
  ).toBe(403);
  for (const update of [
    { contentVersion: undefined },
    { contentVersion: null },
    { typeRevision: undefined },
    { version: -1 },
    { value: { ...(submission.value as object), targetId: 'missing' } },
    { value: { ...(submission.value as object), lifecycle: 'invalid' } },
  ])
    expect((await submit({ ...submission, ...update })).status).toBe(400);
  for (const update of [{ version: 0 }, { contentVersion: 2 }, { typeRevision: 999 }])
    expect((await submit({ ...submission, ...update })).status).toBe(409);
  expect((await read()).draft).toEqual(before.draft);
  fixture.setSubject('another-owner');
  const member = fixture.client();
  await member.signIn();
  expect((await member.request(outcome())).status).toBe(403);
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  expect((await member.json('/api/invitations/accept', { code })).status).toBe(200);
  expect((await submit()).status).toBe(200);
  const own = await (await client.request(outcome())).json();
  expect(own.outcome.status).toBe('staged');
  const other = await (await member.request(outcome())).json();
  expect(other.outcome).toBeNull();
  expect(other.state.draft.relationships ?? []).toEqual([]);
});

test('immutable form evidence does not enter shared receipts or portable archives and survives restart-compatible exact replay', async () => {
  const staged = await (await submit()).json();
  const saved = await client.json(`${path}/map/save`, {
    version: staged.state.draft.version,
    contentVersion: 1,
    operationId: 'form-save',
  });
  expect(saved.status).toBe(200);
  const receipt = (await saved.json()).receipt;
  expect(JSON.stringify(receipt)).not.toContain(submission.stagingId);
  expect(JSON.stringify(receipt)).not.toContain('proposedAt');
  const replay = await (await submit()).json();
  expect(replay.outcome).toEqual(staged.outcome);
  expect(replay.state.draft.relationships ?? []).toEqual([]);
  expect(replay.state.relationships).toHaveLength(1);
  const prepared = await (await client.json(`${path}/exports`, {})).json();
  const bytes = new Uint8Array(
    await (await client.request(`${path}/exports/${prepared.id}`)).arrayBuffer(),
  );
  const archive = unzipSync(bytes);
  expect(JSON.parse(new TextDecoder().decode(archive['manifest.json'])).schemaVersion).toBe(33);
  const content = new TextDecoder().decode(archive['content.json']);
  expect(content).not.toContain(submission.stagingId);
  expect(content).not.toContain('relationship_form_attempt');
  const upload = await client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes as BodyInit,
  });
  expect(upload.status).toBe(201);
  const ready = await upload.json();
  expect(
    (
      await client.json(`${path}/imports/${ready.id}/confirm`, {
        contentVersion: 1,
        confirmed: true,
      })
    ).status,
  ).toBe(200);
  expect((await client.request(outcome())).status).toBe(409);
  const latest = await read();
  expect(latest.relationships).toHaveLength(1);
  const current = await client.request(
    `${path}/map/relationship-form/${submission.stagingId}?contentVersion=${latest.contentVersion}`,
  );
  expect((await current.json()).outcome).toBeNull();
});

test('permanent content erasure invalidates private form evidence containing the erased relationship values', async () => {
  const staged = await (await submit()).json();
  expect(
    (
      await client.json(`${path}/map/save`, {
        version: staged.state.draft.version,
        contentVersion: 1,
        operationId: 'before-erasure',
      })
    ).status,
  ).toBe(200);
  const selection = [{ kind: 'relationship', id: 'relationship' }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  const erased = await client.json(`${path}/erasure/execute`, {
    selection,
    token: review.token,
    operationId: 'erase-form-content',
    confirmation: 'RADERA PERMANENT',
  });
  expect(erased.status).toBe(200);
  const latest = await read();
  expect(latest.relationships).toEqual([]);
  const recovery = await client.request(
    `${path}/map/relationship-form/${submission.stagingId}?contentVersion=${latest.contentVersion}`,
  );
  expect((await recovery.json()).outcome).toBeNull();
});
