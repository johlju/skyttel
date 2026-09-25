import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let archive: Uint8Array;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  householdId = household.id;
  path = `/api/households/${householdId}`;
  const map = await (await client.request(`${path}/map`)).json();
  await client.json(`${path}/map/draft`, {
    version: 0,
    id: 'lamp',
    baseRevision: null,
    value: { name: 'Lampa', description: '', typeId: map.types[0].id },
  });
  await client.json(`${path}/map/save`, { version: 1, operationId: 'lamp-save' });
  const prepared = await (await client.json(`${path}/exports`, {})).json();
  archive = new Uint8Array(
    await (await client.request(`${path}/exports/${prepared.id}`)).arrayBuffer(),
  );
});
afterEach(() => fixture.close());

async function upload(bytes = archive, actor = client, scope = path) {
  return actor.request(`${scope}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes as BodyInit,
  });
}
function altered(change: (parts: Record<string, Uint8Array>) => void) {
  const parts = unzipSync(archive);
  change(parts);
  return zipSync(parts);
}
function changedContent(change: (content: Record<string, unknown>) => void) {
  return altered((parts) => {
    const content = JSON.parse(new TextDecoder().decode(parts['content.json']));
    change(content);
    parts['content.json'] = new TextEncoder().encode(JSON.stringify(content));
    const manifest = JSON.parse(new TextDecoder().decode(parts['manifest.json']));
    manifest.parts[0].bytes = parts['content.json'].length;
    manifest.parts[0].sha256 = createHash('sha256').update(parts['content.json']).digest('hex');
    parts['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  });
}

test.each([14, 15, 16])(
  'schema %i household archives remain importable with their saved content and history',
  async (schemaVersion) => {
    const bytes = altered((parts) => {
      const manifest = JSON.parse(new TextDecoder().decode(parts['manifest.json']));
      manifest.schemaVersion = schemaVersion;
      parts['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
    });
    const prepared = await upload(bytes);
    expect(prepared.status).toBe(201);
    const ready = await prepared.json();
    const confirmed = await client.json(`${path}/imports/${ready.id}/confirm`, {
      contentVersion: 1,
      confirmed: true,
    });
    expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
    const map = await (await client.request(`${path}/map`)).json();
    expect(map.objects).toEqual([expect.objectContaining({ id: 'lamp', name: 'Lampa' })]);
    const { history } = await (await client.request(`${path}/map/history`)).json();
    expect(history).toEqual([expect.objectContaining({ operationId: 'lamp-save' })]);
  },
);

test('invalid archives leave all live content and access unchanged before confirmation', async () => {
  const before = await (await client.request(`${path}/map`)).json();
  const bootstrap = await (await client.request('/api/bootstrap')).json();
  const cases = [
    new Uint8Array([1, 2, 3]),
    altered((parts) => {
      delete parts['images.bin'];
    }),
    altered((parts) => {
      parts['unexpected.json'] = new TextEncoder().encode('{}');
    }),
    altered((parts) => {
      parts['content.json'][0] = 0;
    }),
    altered((parts) => {
      const manifest = JSON.parse(new TextDecoder().decode(parts['manifest.json']));
      manifest.version = 99;
      parts['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
    }),
    altered((parts) => {
      const manifest = JSON.parse(new TextDecoder().decode(parts['manifest.json']));
      manifest.schemaVersion = 17;
      parts['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
    }),
    changedContent((content) => {
      (content.objects as { typeId: string }[])[0].typeId = 'missing-type';
    }),
    changedContent((content) => {
      content.identities = [];
    }),
  ];
  for (const bytes of cases) {
    const response = await upload(bytes);
    expect(response.status).toBe(400);
    expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(bootstrap);
  }
});

test('preparation is read-only and concurrent private work prevents replacement', async () => {
  const readyResponse = await upload();
  expect(readyResponse.status).toBe(201);
  const ready = await readyResponse.json();
  expect(ready.status).toBe('ready');
  expect((await (await client.request(`${path}/map`)).json()).contentVersion).toBe(1);
  expect(
    (
      await client.json(`${path}/map/view/position`, {
        version: 0,
        id: 'lamp',
        position: { x: 4, y: 2, z: 1 },
      })
    ).status,
  ).toBe(200);
  const before = await (await client.request(`${path}/map/view`)).json();
  const confirmed = await client.json(`${path}/imports/${ready.id}/confirm`, {
    contentVersion: 1,
    confirmed: true,
  });
  expect(await confirmed.json()).toEqual({ error: 'content_conflict' });
  expect(await (await client.request(`${path}/map/view`)).json()).toEqual(before);
});

test('a failed replacement rolls back the entire household and returns a durable failed outcome', async () => {
  const readyResponse = await upload();
  expect(readyResponse.status).toBe(201);
  const ready = await readyResponse.json();
  const before = await (await client.request(`${path}/map`)).json();
  fixture.database.exec(
    "CREATE TRIGGER synthetic_import_failure BEFORE INSERT ON map_object BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END;",
  );
  const response = await client.json(`${path}/imports/${ready.id}/confirm`, {
    contentVersion: 1,
    confirmed: true,
  });
  expect(await response.json()).toMatchObject({
    id: ready.id,
    status: 'failed',
    error: 'import_failed',
    contentVersion: 1,
  });
  expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
  expect((await (await client.request(`${path}/imports/${ready.id}`)).json()).status).toBe(
    'failed',
  );
});

test('upload, confirmation and status require current administrator access to the selected household', async () => {
  const ready = await (await upload()).json();
  const body = { contentVersion: 1, confirmed: true };
  fixture.setSubject('robin');
  const member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  expect((await member.json('/api/invitations/accept', { code })).status).toBe(200);
  for (const [actor, expected] of [
    [fixture.client(), 401],
    [member, 403],
  ] as const) {
    expect((await upload(archive, actor)).status).toBe(expected);
    expect((await actor.json(`${path}/imports/${ready.id}/confirm`, body)).status).toBe(expected);
    expect((await actor.request(`${path}/imports/${ready.id}`)).status).toBe(expected);
  }
  expect((await upload(archive, client, '/api/households/another')).status).toBe(403);
  expect(
    (await client.json(`/api/households/another/imports/${ready.id}/confirm`, body)).status,
  ).toBe(403);
  expect((await client.request(`/api/households/another/imports/${ready.id}`)).status).toBe(403);
  expect(
    (await client.json(`${path}/members/${user.id}/role`, { role: 'administrator' })).status,
  ).toBe(200);
  const memberReady = await (await upload(archive, member)).json();
  expect((await client.json(`${path}/members/${user.id}/revoke`, {})).status).toBe(200);
  expect((await upload(archive, member)).status).toBe(403);
  expect((await member.json(`${path}/imports/${memberReady.id}/confirm`, body)).status).toBe(403);
  expect((await member.request(`${path}/imports/${memberReady.id}`)).status).toBe(403);
  expect((await (await client.request(`${path}/map`)).json()).contentVersion).toBe(1);
});

test('foreign archive identities never bind by matching login IDs or names and their immutable history remains undoable', async () => {
  const before = await (await client.request(`${path}/map`)).json();
  const foreign = changedContent((content) => {
    (content.household as { id: string }).id = 'foreign-household';
    for (const value of Object.values(content))
      if (Array.isArray(value))
        for (const row of value)
          if (row && typeof row === 'object' && 'householdId' in row)
            row.householdId = 'foreign-household';
  });
  const parts = unzipSync(foreign);
  const manifest = JSON.parse(new TextDecoder().decode(parts['manifest.json']));
  manifest.householdId = 'foreign-household';
  parts['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  const readyResponse = await upload(zipSync(parts));
  expect(readyResponse.status).toBe(201);
  const ready = await readyResponse.json();
  const replaced = await client.json(`${path}/imports/${ready.id}/confirm`, {
    contentVersion: 1,
    confirmed: true,
  });
  expect(await replaced.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
  const current = await (await client.request(`${path}/map`)).json();
  expect(current.userId).not.toBe(before.userId);
  expect(current.draft).toEqual({ version: 0, changes: [] });
  expect(current.objects[0]).toMatchObject({ id: 'lamp', householdId });
  const { history } = await (await client.request(`${path}/map/history`)).json();
  expect(history[0]).toMatchObject({ userId: before.userId, contentVersion: 1, householdId });
  expect(
    (
      await client.json(`${path}/map/undo`, {
        version: 0,
        contentVersion: 2,
        userId: history[0].userId,
        operationId: history[0].operationId,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/map/save`, {
        version: 1,
        contentVersion: 2,
        operationId: 'fresh-undo',
      })
    ).status,
  ).toBe(200);
  expect((await (await client.request(`${path}/map`)).json()).objects).toEqual([]);
});

test('confirmation closes the durable gate before cancelling a concurrent stalled import upload', async () => {
  const ready = await (await upload()).json();
  let entered: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(archive.slice(0, 1));
    },
    pull() {
      entered();
      return new Promise<void>(() => {});
    },
  });
  const second = client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await reading;
  const confirmed = await client.json(`${path}/imports/${ready.id}/confirm`, {
    confirmed: true,
    contentVersion: 1,
  });
  expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
  expect(await (await second).json()).toEqual({ error: 'import_cancelled' });
});

test('losing administrator authority during cancellation fails the prepared import and releases its durable gate', async () => {
  const { user: owner } = await (await client.request('/api/bootstrap')).json();
  fixture.setSubject('robin');
  const other = fixture.client();
  await other.signIn();
  const { user } = await (await other.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  await other.json('/api/invitations/accept', { code });
  await client.json(`${path}/members/${user.id}/role`, { role: 'administrator' });
  const before = await (await client.request(`${path}/map`)).json();
  const ready = await (await upload()).json();
  let entered: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let cancelled: () => void = () => {};
  const cancelling = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  let resume: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const second = client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(archive.slice(0, 1));
      },
      pull() {
        entered();
        return new Promise<void>(() => {});
      },
      cancel() {
        cancelled();
        return released;
      },
    }),
    duplex: 'half',
  } as RequestInit);
  await reading;
  const confirmation = client.json(`${path}/imports/${ready.id}/confirm`, {
    confirmed: true,
    contentVersion: 1,
  });
  await cancelling;
  expect((await client.request(`${path}/map`)).status).toBe(409);
  expect((await client.json(`${path}/exports`, {})).status).toBe(409);
  expect((await upload()).status).toBe(409);
  expect(
    await (
      await client.json(`${path}/imports/${ready.id}/confirm`, {
        confirmed: true,
        contentVersion: 1,
      })
    ).json(),
  ).toMatchObject({ status: 'prepared' });
  expect((await other.json(`${path}/members/${owner.id}/role`, { role: 'member' })).status).toBe(
    200,
  );
  resume();
  expect((await confirmation).status).toBe(403);
  expect((await second).status).toBe(400);
  expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
  expect(await (await other.request(`${path}/imports/${ready.id}`)).json()).toMatchObject({
    status: 'failed',
    error: 'forbidden',
  });
});

test('failed removal of an aborted upload prevents false completion and a later import retries cleanup', async () => {
  const ready = await (await upload()).json();
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-imports');
  let blockedDirectory = '';
  let entered: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const second = client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(archive.slice(0, 1));
      },
      pull() {
        entered();
        return new Promise<void>(() => {});
      },
      cancel() {
        blockedDirectory = join(
          directory,
          readdirSync(directory).find((id) => id !== ready.id) as string,
        );
        chmodSync(blockedDirectory, 0o000);
      },
    }),
    duplex: 'half',
  } as RequestInit);
  try {
    await reading;
    const confirmed = await client.json(`${path}/imports/${ready.id}/confirm`, {
      confirmed: true,
      contentVersion: 1,
    });
    expect(await confirmed.json()).toMatchObject({ status: 'failed', contentVersion: 1 });
    expect((await second).status).toBe(500);
    expect((await (await client.request(`${path}/map`)).json()).contentVersion).toBe(1);
  } finally {
    if (blockedDirectory) chmodSync(blockedDirectory, 0o700);
  }
  const next = await (await upload()).json();
  expect(
    (
      await (
        await client.json(`${path}/imports/${next.id}/confirm`, {
          confirmed: true,
          contentVersion: 1,
        })
      ).json()
    ).status,
  ).toBe('completed');
  expect(existsSync(blockedDirectory)).toBe(false);
});

test('completed outcomes survive repeated confirmation and reject altered confirmation identity', async () => {
  const ready = await (await upload()).json();
  const body = { confirmed: true, contentVersion: 1 };
  const first = await (await client.json(`${path}/imports/${ready.id}/confirm`, body)).json();
  expect(first).toMatchObject({ status: 'completed', contentVersion: 2 });
  expect(await (await client.json(`${path}/imports/${ready.id}/confirm`, body)).json()).toEqual(
    first,
  );
  expect(await (await client.request(`${path}/imports/${ready.id}`)).json()).toEqual(first);
  expect(
    (await client.json(`${path}/imports/${ready.id}/confirm`, { ...body, contentVersion: 2 }))
      .status,
  ).toBe(409);
  expect(
    (await client.json(`${path}/imports/${ready.id}/confirm`, { ...body, confirmed: false }))
      .status,
  ).toBe(400);
  expect(
    (await client.json(`${path}/imports/${ready.id}/confirm`, { ...body, extra: true })).status,
  ).toBe(400);
  expect((await client.request(`${path}/imports/missing`)).status).toBe(404);
});

test('custom definitions, ended facts, removed catalog entries and unsaved private work roundtrip together', async () => {
  const read = async () => (await client.request(`${path}/map`)).json();
  const post = async (route: string, body: Record<string, unknown>) => {
    const state = await read();
    const response = await client.json(`${path}/map/${route}`, {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      ...body,
    });
    expect(response.status, await response.text()).toBe(200);
  };
  const fields = [
    { id: 'serial', name: 'Serienummer', description: '', kind: 'text' },
    { id: 'count', name: 'Antal', description: '', kind: 'number' },
    { id: 'date', name: 'Datum', description: '', kind: 'date' },
    { id: 'enabled', name: 'Aktiv', description: '', kind: 'boolean' },
  ];
  await post('object-type', {
    id: 'equipment',
    baseRevision: null,
    value: { name: 'Utrustning', description: 'Egna fält', fields },
  });
  await post('relationship-type', {
    id: 'installed',
    baseRevision: null,
    value: {
      name: 'Installerad',
      description: '',
      forwardLabel: 'installerad i',
      reverseLabel: 'innehåller',
    },
  });
  await post('draft', {
    id: 'machine',
    baseRevision: null,
    value: {
      name: 'Maskin',
      description: '',
      typeId: 'equipment',
      identity: 'unspecified',
      lifecycle: 'ended',
      customValues: { serial: 'SYNTH-1', count: 2, date: '2026-01-01', enabled: false },
      financialFacts: {
        price: { knowledge: 'known', value: '19' },
        endDate: { knowledge: 'uncertain', value: '2026-01-01' },
      },
    },
  });
  await post('relationship', {
    id: 'installation',
    baseRevision: null,
    value: {
      typeId: 'installed',
      sourceId: 'machine',
      targetId: 'lamp',
      knowledge: 'uncertain',
      lifecycle: 'ended',
      endDate: { knowledge: 'known', value: '2026-01-01' },
    },
  });
  await post('save', { operationId: 'definitions-and-facts' });
  await post('object-type', {
    id: 'unused',
    baseRevision: null,
    value: { name: 'Tillfällig', description: '', fields: [] },
  });
  await post('relationship-type', {
    id: 'unused-edge',
    baseRevision: null,
    value: { name: 'Tillfällig', description: '', forwardLabel: 'framåt', reverseLabel: 'bakåt' },
  });
  await post('save', { operationId: 'unused-definitions' });
  await post('object-type', { id: 'unused', baseRevision: 1, value: null });
  await post('relationship-type', { id: 'unused-edge', baseRevision: 1, value: null });
  await post('save', { operationId: 'removed-definitions' });
  await post('object-type', {
    id: 'equipment',
    baseRevision: 1,
    value: { name: 'Privat utrustning', description: 'Privat förslag', fields },
  });
  await post('relationship-type', {
    id: 'installed',
    baseRevision: 1,
    value: {
      name: 'Privat installation',
      description: '',
      forwardLabel: 'finns i',
      reverseLabel: 'har',
    },
  });
  await post('draft', {
    id: 'machine',
    baseRevision: 1,
    value: {
      ...(await read()).objects.find((item: { id: string }) => item.id === 'machine'),
      name: 'Privat maskin',
    },
  });
  await post('relationship', {
    id: 'installation',
    baseRevision: 1,
    value: {
      typeId: 'installed',
      sourceId: 'machine',
      targetId: null,
      knowledge: 'unknown',
      lifecycle: 'ended',
      endDate: { knowledge: 'known', value: '2026-01-01' },
    },
  });
  const before = await read();
  const history = await (await client.request(`${path}/map/history`)).json();
  const exported = await (await client.json(`${path}/exports`, {})).json();
  archive = new Uint8Array(
    await (await client.request(`${path}/exports/${exported.id}`)).arrayBuffer(),
  );
  const response = await upload();
  expect(response.status, await response.clone().text()).toBe(201);
  const ready = await response.json();
  expect(
    await (
      await client.json(`${path}/imports/${ready.id}/confirm`, {
        contentVersion: 1,
        confirmed: true,
      })
    ).json(),
  ).toMatchObject({ status: 'completed' });
  const after = await read();
  expect(after).toEqual({ ...before, contentVersion: 2 });
  expect(await (await client.request(`${path}/map/history`)).json()).toEqual(history);
  await post('save', { operationId: 'fresh-private-definitions' });
  expect((await read()).objects).toContainEqual(
    expect.objectContaining({
      id: 'machine',
      name: 'Privat maskin',
      customValues: { serial: 'SYNTH-1', count: 2, date: '2026-01-01', enabled: false },
    }),
  );
});

test('committed replacement stays gated after file cleanup fails and explicit retry completes cleanup only', async () => {
  const ready = await (await upload()).json();
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-imports', ready.id);
  chmodSync(directory, 0o500);
  const body = { confirmed: true, contentVersion: 1 };
  try {
    const confirmed = await client.json(`${path}/imports/${ready.id}/confirm`, body);
    expect(await confirmed.json()).toMatchObject({ status: 'cleanup', contentVersion: 2 });
    expect((await client.request(`${path}/map`)).status).toBe(409);
    expect((await client.json(`${path}/exports`, {})).status).toBe(409);
    expect(await (await client.request(`${path}/imports/${ready.id}`)).json()).toMatchObject({
      status: 'cleanup',
    });
  } finally {
    chmodSync(directory, 0o700);
  }
  expect(
    await (await client.json(`${path}/imports/${ready.id}/confirm`, body)).json(),
  ).toMatchObject({ status: 'completed', contentVersion: 2 });
  expect(existsSync(directory)).toBe(false);
  expect((await (await client.request(`${path}/map`)).json()).contentVersion).toBe(2);
});
