import sharp from 'sharp';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
let images: string;
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const sourceImage = (format: 'jpeg' | 'png' | 'webp' = 'png', color = '#ff6600') =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: color } })
    [format]()
    .toBuffer();
function headers(state: MapState, id = 'person') {
  const own = state.draft.changes.find((item) => item.id === id);
  return {
    origin: fixture.config.origin,
    'content-type': 'application/octet-stream',
    'x-skyttel-draft-version': String(state.draft.version),
    'x-skyttel-content-version': String(state.contentVersion),
    'x-skyttel-object-revision': String(
      own
        ? (own.before?.revision ?? null)
        : (state.objects.find((item) => item.id === id)?.revision ?? null),
    ),
  };
}
const upload = async (bytes: Buffer | null, actor = client, state?: MapState, id = 'person') =>
  actor.request(`${images}/${id}`, {
    method: bytes ? 'POST' : 'DELETE',
    headers: headers(state ?? (await read(actor)), id),
    ...(bytes ? { body: new Uint8Array(bytes) } : {}),
  });
async function save(id: string, actor = client): Promise<SaveReceipt> {
  const response = await actor.json(`${path}/save`, {
    version: (await read(actor)).draft.version,
    operationId: id,
  });
  expect(response.status).toBe(200);
  return (await response.json()).receipt;
}
const undo = async (receipt: SaveReceipt) =>
  client.json(`${path}/undo`, {
    version: (await read()).draft.version,
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
async function member() {
  fixture.setSubject('robin');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  return { actor, userId: user.id };
}
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
  images = `/api/households/${household.id}/profile-images`;
  const state = await read();
  expect(
    (
      await client.json(`${path}/draft`, {
        version: 0,
        id: 'person',
        baseRevision: null,
        value: {
          name: 'Lo Exempel',
          description: 'Bevara mitt förslag',
          typeId: state.types[0].id,
        },
      })
    ).status,
  ).toBe(200);
});
afterEach(() => fixture.close());

test('a real PNG becomes a bounded private image proposal and is fetched separately', async () => {
  const source = await sharp({
    create: { width: 600, height: 400, channels: 3, background: '#ff6600' },
  })
    .png()
    .toBuffer();
  const state = await read();
  const response = await client.request(`${images}/person`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/octet-stream',
      'x-skyttel-draft-version': String(state.draft.version),
      'x-skyttel-content-version': String(state.contentVersion),
      'x-skyttel-object-revision': 'null',
    },
    body: new Uint8Array(source),
  });
  expect(response.status).toBe(200);
  const current = await read();
  expect(current.objects).toEqual([]);
  expect(current.draft.changes[0].after).toMatchObject({
    description: 'Bevara mitt förslag',
    profileImageId: expect.any(String),
  });
  const imageId = current.draft.changes[0].after?.profileImageId;
  const fetched = await client.request(`${images}/${imageId}`);
  expect(fetched.headers.get('content-type')).toBe('image/webp');
  expect(fetched.headers.get('cache-control')).toBe('no-store');
  const encoded = Buffer.from(await fetched.arrayBuffer());
  expect(encoded.length).toBeLessThanOrEqual(262144);
  const metadata = await sharp(encoded).metadata();
  expect(metadata).toMatchObject({ format: 'webp', width: 300, height: 200 });
  expect(metadata.exif).toBeUndefined();
  expect(encoded).not.toEqual(source);
});

test('private versions become shared only with a receipt and historical images survive replacement, removal and object undo', async () => {
  const { actor } = await member();
  expect((await upload(await sourceImage())).status).toBe(200);
  const first = (await read()).draft.changes[0].after?.profileImageId;
  expect((await actor.request(`${images}/${first}`)).status).toBe(404);
  const initial = await save('initial');
  expect((await actor.request(`${images}/${first}`)).status).toBe(200);
  expect((await upload(await sourceImage('jpeg', '#0033ff'))).status).toBe(200);
  const second = (await read()).draft.changes[0].after?.profileImageId;
  const changed = await save('replace');
  expect(second).not.toBe(first);
  expect((await actor.request(`${images}/${first}`)).status).toBe(200);
  expect((await upload(null)).status).toBe(200);
  const removed = await save('remove-image');
  expect((await read()).objects[0].profileImageId).toBeUndefined();
  expect((await undo(removed)).status).toBe(200);
  expect((await read()).draft.changes[0].after?.profileImageId).toBe(second);
  await save('restore-image');
  const state = await read();
  expect(
    (
      await client.json(`${path}/draft`, {
        version: state.draft.version,
        id: 'person',
        baseRevision: state.objects[0].revision,
        value: null,
      })
    ).status,
  ).toBe(200);
  const deletion = await save('delete-object');
  expect((await undo(deletion)).status).toBe(200);
  await save('restore-object');
  expect((await read()).objects[0].profileImageId).toBe(second);
  expect((await undo(changed)).status).toBe(200);
  expect(draftConflicts(await read())).toEqual([]);
  await save('restore-first');
  expect((await read()).objects[0].profileImageId).toBe(first);
  expect((await client.request(`${path}/history`)).status).toBe(200);
  expect(initial.changes[0].after?.profileImageId).toBe(first);
});

test('JPEG and WebP content are re-encoded, generic edits keep the image, and discarded versions are inaccessible', async () => {
  for (const format of ['jpeg', 'webp'] as const) {
    expect((await upload(await sourceImage(format))).status).toBe(200);
    const state = await read();
    const imageId = state.draft.changes[0].after?.profileImageId;
    const response = await client.request(`${images}/${imageId}`);
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({
      format: 'webp',
      width: 300,
      height: 200,
    });
    expect(
      (
        await client.json(`${path}/draft`, {
          version: state.draft.version,
          id: 'person',
          baseRevision: null,
          value: { name: 'Lo Lind', description: 'Ändrad text', typeId: state.types[0].id },
        })
      ).status,
    ).toBe(200);
    expect((await read()).draft.changes[0].after?.profileImageId).toBe(imageId);
    expect((await upload(null)).status).toBe(200);
    expect((await client.request(`${images}/${imageId}`)).status).toBe(404);
  }
});

test('invalid content and processing failures leave every existing proposal intact, including exact upload limits', async () => {
  const png = await sourceImage();
  expect((await upload(png)).status).toBe(200);
  const before = await read();
  const image = before.draft.changes[0].after?.profileImageId;
  for (const invalid of [
    Buffer.from('not an image'),
    await sharp(png).gif().toBuffer(),
    png.subarray(0, png.length - 50),
  ]) {
    expect((await upload(invalid)).status).toBe(400);
    expect(await read()).toEqual(before);
  }
  const boundary = Buffer.alloc(10_000_000);
  png.copy(boundary);
  expect((await upload(boundary)).status).toBe(200);
  const atLimit = await read();
  expect((await upload(Buffer.alloc(10_000_001))).status).toBe(413);
  expect(await read()).toEqual(atLimit);
  expect((await client.json(`${path}/draft`, { text: 'x'.repeat(17000) })).status).toBe(413);
  // The original pending version becomes unreachable after a valid replacement.
  expect((await client.request(`${images}/${image}`)).status).toBe(404);
});

test('all image read and mutation routes check membership, origin, household and live private references', async () => {
  await upload(await sourceImage());
  const first = (await read()).draft.changes[0].after?.profileImageId;
  await save('initial');
  await upload(await sourceImage('jpeg', '#223344'));
  const privateId = (await read()).draft.changes[0].after?.profileImageId;
  const before = await read();
  const { actor, userId } = await member();
  const otherDraft = await read(actor);
  expect((await actor.request(`${images}/${privateId}`)).status).toBe(404);
  expect(
    (
      await actor.json(`${path}/draft`, {
        version: 0,
        id: 'person',
        baseRevision: 1,
        value: { ...before.objects[0], profileImageId: privateId },
      })
    ).status,
  ).toBe(404);
  expect(await read(actor)).toEqual(otherDraft);
  const anonymous = fixture.client();
  fixture.setSubject('outside');
  const outsider = fixture.client();
  await outsider.signIn();
  const { user } = await (await outsider.request('/api/bootstrap')).json();
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other-household', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other-household', user.id, 'member');
  for (const [denied, status] of [
    [anonymous, 401],
    [outsider, 403],
  ] as const) {
    expect((await denied.request(`${images}/${first}`)).status).toBe(status);
    expect((await upload(await sourceImage(), denied, before)).status).toBe(status);
    expect((await upload(null, denied, before)).status).toBe(status);
  }
  expect(
    (await outsider.request(`/api/households/other-household/profile-images/${first}`)).status,
  ).toBe(404);
  expect(
    (
      await client.request(`${images}/person`, {
        method: 'DELETE',
        headers: { ...headers(before), origin: 'https://foreign.example' },
      })
    ).status,
  ).toBe(403);
  expect(
    (await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {})).status,
  ).toBe(200);
  expect((await actor.request(`${images}/${first}`)).status).toBe(403);
  expect((await actor.request(`${images}/${privateId}`)).status).toBe(403);
  expect((await upload(await sourceImage(), actor, before)).status).toBe(403);
  expect((await upload(null, actor, before)).status).toBe(403);
  expect(await read()).toEqual(before);
});

test('stale image proposals and failed whole saves preserve the draft and retry with the same receipt', async () => {
  await upload(await sourceImage());
  await save('initial');
  const stale = await read();
  await upload(await sourceImage('webp', '#aaaaaa'));
  const before = await read();
  expect((await upload(await sourceImage(), client, stale)).status).toBe(409);
  expect((await upload(null, client, stale)).status).toBe(409);
  fixture.database.exec(
    "CREATE TRIGGER fail_image_save BEFORE INSERT ON map_history BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
  );
  const attempt = { version: before.draft.version, operationId: 'recoverable' };
  expect((await client.json(`${path}/save`, attempt)).status).toBe(500);
  expect(await read()).toEqual(before);
  fixture.database.exec('DROP TRIGGER fail_image_save');
  const response = await client.json(`${path}/save`, attempt);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(await (await client.json(`${path}/save`, attempt)).json()).toEqual(result);
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(2);
});

test('independent concurrent facts and image undo overlap follow ordinary conflict rules', async () => {
  await upload(await sourceImage());
  await save('initial');
  const { actor } = await member();
  await upload(await sourceImage('jpeg', '#ffff00'));
  const state = await read(actor);
  await actor.json(`${path}/draft`, {
    version: 0,
    id: 'person',
    baseRevision: 1,
    value: { ...state.objects[0], name: 'Lo Lind' },
  });
  await save('name', actor);
  let current = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: current.draft.version,
        conflict: draftConflicts(current)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  const changed = await save('image');
  expect((await read()).objects[0].name).toBe('Lo Lind');
  await upload(await sourceImage('webp', '#123456'));
  const own = await read();
  expect((await undo(changed)).status).toBe(409);
  expect(await read()).toEqual(own);
  await save('later-image');
  expect((await undo(changed)).status).toBe(200);
  current = await read();
  expect(draftConflicts(current)).toHaveLength(1);
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: current.draft.version,
        conflict: draftConflicts(current)[0],
        choice: 'saved',
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.changes).toEqual([]);
});

test('type changes, conflict choices and undo preserve independently replaced profile images', async () => {
  expect((await upload(await sourceImage())).status).toBe(200);
  await save('initial');
  const initial = await read();
  const original = initial.objects[0];
  const target = initial.types.find((type) => type.id !== original.typeId);
  expect(target).toBeDefined();
  expect(
    (
      await client.json(`${path}/draft`, {
        version: initial.draft.version,
        id: original.id,
        baseRevision: original.revision,
        typeRevision: target?.revision,
        value: { ...original, typeId: target?.id },
      })
    ).status,
  ).toBe(200);
  const { actor } = await member();
  expect((await upload(await sourceImage('jpeg', '#ffff00'), actor)).status).toBe(200);
  await save('concurrent-image', actor);
  let current = await read();
  const replacement = current.objects[0].profileImageId;
  expect(replacement).not.toBe(original.profileImageId);
  expect(draftConflicts(current)).toHaveLength(1);
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: current.draft.version,
        conflict: draftConflicts(current)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  const changed = await save('type-change');
  expect((await read()).objects[0]).toMatchObject({
    id: original.id,
    typeId: target?.id,
    profileImageId: replacement,
  });
  expect((await upload(await sourceImage('webp', '#123456'), actor)).status).toBe(200);
  await save('later-image', actor);
  current = await read();
  const latest = current.objects[0];
  const imageBytes = Buffer.from(
    await (await client.request(`${images}/${latest.profileImageId}`)).arrayBuffer(),
  );
  expect(
    (
      await client.json(`${path}/draft`, {
        version: current.draft.version,
        id: original.id,
        baseRevision: latest.revision,
        value: { ...latest, description: 'Egen oberoende anteckning' },
      })
    ).status,
  ).toBe(200);
  expect((await undo(changed)).status).toBe(200);
  expect((await read()).draft.changes[0].after).toMatchObject({
    typeId: original.typeId,
    profileImageId: latest.profileImageId,
    description: 'Egen oberoende anteckning',
  });
  await save('undo-type-change');
  expect((await read()).objects[0]).toMatchObject({
    id: original.id,
    typeId: original.typeId,
    profileImageId: latest.profileImageId,
    description: 'Egen oberoende anteckning',
  });
  expect(
    Buffer.from(await (await client.request(`${images}/${latest.profileImageId}`)).arrayBuffer()),
  ).toEqual(imageBytes);
  for (const id of [original.profileImageId, replacement])
    expect((await client.request(`${images}/${id}`)).status).toBe(200);
});

test.each(['draft', 'save', 'access'] as const)(
  'an upload rechecks %s after asynchronous body processing',
  async (change) => {
    await save('initial');
    const { actor, userId } = await member();
    const state = await read(actor);
    const bytes = await sourceImage();
    let reached: () => void = () => {};
    let release: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const body = new ReadableStream(
      {
        async pull(controller) {
          reached();
          await proceed;
          controller.enqueue(new Uint8Array(bytes));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const pending = actor.request(`${images}/person`, {
      method: 'POST',
      headers: { ...headers(state), 'content-length': String(bytes.length) },
      body,
      duplex: 'half',
    } as RequestInit);
    await reading;
    if (change === 'access') {
      await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {});
    } else {
      const writer = change === 'draft' ? actor : client;
      await writer.json(`${path}/draft`, {
        version: (await read(writer)).draft.version,
        id: 'person',
        baseRevision: 1,
        value: { ...state.objects[0], name: 'Bevara nytt namn' },
      });
      if (change === 'save') await save('parallel', client);
    }
    const expected = change === 'access' ? await read() : await read(actor);
    release();
    expect((await pending).status).toBe(change === 'access' ? 403 : 409);
    expect(change === 'access' ? await read() : await read(actor)).toEqual(expected);
  },
);

test.each(['profileImageId', 'sourceImageId', 'copiedImageId'])(
  'a custom field named %s cannot grant access to another member’s private image',
  async (fieldId) => {
    await upload(await sourceImage());
    const privateId = (await read()).draft.changes[0].after?.profileImageId;
    const { actor } = await member();
    const state = await read(actor);
    const type = state.types[0];
    expect(
      (
        await actor.json(`${path}/object-type`, {
          version: 0,
          id: type.id,
          baseRevision: type.revision,
          value: {
            ...type,
            fields: [{ id: fieldId, name: 'Vanlig text', description: '', kind: 'text' }],
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await actor.json(`${path}/draft`, {
          version: 1,
          id: 'other',
          baseRevision: null,
          value: {
            typeId: type.id,
            name: 'Annat objekt',
            description: '',
            customValues: { [fieldId]: privateId },
          },
        })
      ).status,
    ).toBe(200);
    expect((await actor.request(`${images}/${privateId}`)).status).toBe(404);
    await save('text-only', actor);
    expect((await actor.request(`${images}/${privateId}`)).status).toBe(404);
  },
);
