import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
async function propose(value: Record<string, unknown>, actor = client, id = 'object') {
  const state = await read(actor);
  const own = state.draft.changes.find((change) => change.id === id);
  const saved = state.objects.find((object) => object.id === id);
  return actor.json(`${path}/draft`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id,
    baseRevision: own ? (own.before?.revision ?? null) : (saved?.revision ?? null),
    value: {
      name: 'Min cykel',
      description: '',
      typeId: state.types[0].id,
      ...value,
    },
  });
}
async function save(operationId: string, actor = client): Promise<SaveReceipt> {
  const state = await read(actor);
  const response = await actor.json(`${path}/save`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    operationId,
  });
  expect(response.status).toBe(200);
  return (await response.json()).receipt;
}
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
});
afterEach(() => fixture.close());

async function member() {
  fixture.setSubject('robin');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  return actor;
}

test('an icon is one private object fact, survives old-client edits and receipts, and resets explicitly', async () => {
  expect((await propose({ iconId: 'bike' })).status).toBe(200);
  expect((await read()).draft.changes[0].after).toMatchObject({ iconId: 'bike' });
  expect((await read()).objects).toEqual([]);
  expect((await propose({ description: 'Bevara ikonen' })).status).toBe(200);
  const first = await save('first');
  expect(first.changes[0].after).toMatchObject({ iconId: 'bike', description: 'Bevara ikonen' });
  expect((await read()).objects[0]).toMatchObject({ iconId: 'bike' });
  const unchanged = await read();
  for (const iconId of ['', 'Bike', 'not-a-lucide-icon', 3, {}]) {
    expect((await propose({ iconId })).status).toBe(400);
    expect(await read()).toEqual(unchanged);
  }
  expect((await propose({ iconId: null })).status).toBe(200);
  expect((await read()).draft.changes[0].after).not.toHaveProperty('iconId');
  const reset = await save('reset');
  expect(reset.changes[0].before).toMatchObject({ iconId: 'bike' });
  expect(reset.changes[0].after).not.toHaveProperty('iconId');
  expect((await read()).objects[0]).not.toHaveProperty('iconId');
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toEqual([reset, first]);
});

test('resolving a stale description keeps an independently saved icon and explicit icon reset wins its own choice', async () => {
  await propose({ iconId: 'bike' });
  await save('initial');
  const actor = await member();
  await propose({ description: 'Mitt förslag' });
  await propose({ iconId: 'music' }, actor);
  await save('other-icon', actor);
  let state = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        choice: 'proposed',
        conflict: draftConflicts(state)[0],
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.changes[0].after).toMatchObject({
    iconId: 'music',
    description: 'Mitt förslag',
  });
  await save('resolved');
  await propose({ iconId: null });
  await propose({ iconId: 'house' }, actor);
  await save('other-again', actor);
  state = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        choice: 'proposed',
        conflict: draftConflicts(state)[0],
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.changes[0].after).not.toHaveProperty('iconId');
});

test('upgrading a schema 16 object and older private proposal keeps the canonical default and ordinary save', async () => {
  fixture.close();
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-icon-upgrade-'));
  try {
    for (const name of readdirSync('migrations').filter(
      (name) => name.endsWith('.sql') && name < '017',
    ))
      copyFileSync(join('migrations', name), join(directory, name));
    fixture = await applicationFixture({ migrationsDirectory: directory });
    client = fixture.client();
    await client.signIn();
    const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
    const { user } = await (await client.request('/api/bootstrap')).json();
    path = `/api/households/${household.id}/map`;
    const type = fixture.database
      .prepare('SELECT * FROM object_type WHERE householdId = ? LIMIT 1')
      .get(household.id) as MapState['types'][number];
    const object = {
      id: 'object',
      householdId: household.id,
      typeId: type.id,
      revision: 1,
      name: 'Min cykel',
      description: '',
    };
    fixture.database
      .prepare(
        'INSERT INTO map_object (id, householdId, typeId, revision, name, description) VALUES (?, ?, ?, 1, ?, ?)',
      )
      .run(object.id, household.id, type.id, object.name, object.description);
    fixture.database
      .prepare('INSERT INTO map_draft (householdId, userId, version, changes) VALUES (?, ?, 1, ?)')
      .run(
        household.id,
        user.id,
        JSON.stringify([
          {
            id: 'object',
            before: object,
            after: { ...object, description: 'Äldre förslag' },
            type,
          },
        ]),
      );
    await fixture.upgradeLegacyLogin();
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'anonymous',
    });
    await client.signIn();
    expect((await read()).objects).toEqual([object]);
    expect(draftConflicts(await read())).toEqual([]);
    const receipt = await save('legacy-proposal');
    expect(receipt.changes[0].after).toMatchObject({ description: 'Äldre förslag' });
    expect(receipt.changes[0].after).not.toHaveProperty('iconId');
    expect((await propose({ iconId: 'bike', typeId: type.id })).status).toBe(200);
    await save('own-icon');
    expect((await read()).objects[0]).toMatchObject({ iconId: 'bike' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('archive icon validation protects current, private, receipt and history values before atomic import', async () => {
  await propose({ iconId: 'bike' });
  await propose({ iconId: 'music' }, client, 'other');
  await save('initial');
  await propose({ iconId: 'telescope' }, client, 'private');
  const scope = path.replace('/map', '');
  const prepared = await (await client.json(`${scope}/exports`, {})).json();
  const bytes = await (await client.request(`${scope}/exports/${prepared.id}`)).arrayBuffer();
  const parts = unzipSync(new Uint8Array(bytes));
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  const savedReceipt = content.saves.find(
    (entry: { operationId: string }) => entry.operationId === 'initial',
  ).receipt;
  const records = [
    content.objects[0],
    content.objects.find((entry: { id: string }) => entry.id === 'other'),
    content.drafts[0].changes[0].after,
    savedReceipt.changes[0].after,
    content.history[0].changes[0].after,
  ];
  for (const record of records) {
    const original = record.iconId;
    record.iconId = 'not-a-valid-icon';
    parts['content.json'] = Buffer.from(JSON.stringify(content));
    const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
    manifest.parts[0].bytes = parts['content.json'].length;
    manifest.parts[0].sha256 = createHash('sha256').update(parts['content.json']).digest('hex');
    parts['manifest.json'] = Buffer.from(JSON.stringify(manifest));
    const invalid = await client.request(`${scope}/imports`, {
      method: 'POST',
      headers: {
        origin: fixture.config.origin,
        'content-type': 'application/zip',
        'X-Skyttel-Content-Version': '1',
      },
      body: new Uint8Array(zipSync(parts)),
    });
    expect(invalid.status).toBe(400);
    if (original === undefined) delete record.iconId;
    else record.iconId = original;
  }
  const upload = await client.request(`${scope}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes,
  });
  expect(upload.status).toBe(201);
  const ready = await upload.json();
  expect(
    (
      await client.json(`${scope}/imports/${ready.id}/confirm`, {
        contentVersion: 1,
        confirmed: true,
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.changes[0].after).toMatchObject({ iconId: 'telescope' });
  expect(
    (
      await client.json(`${path}/discard`, {
        version: (await read()).draft.version,
        contentVersion: 2,
      })
    ).status,
  ).toBe(200);
  expect((await read()).objects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'object', iconId: 'bike' }),
      expect.objectContaining({ id: 'other', iconId: 'music' }),
    ]),
  );
});
