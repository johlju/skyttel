import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

type ArchiveFixture = {
  manifest: {
    householdId: string;
    schemaVersion: number;
    parts: { path: string; bytes: number; sha256: string }[];
  };
  content: Record<string, Record<string, unknown>[]> & { household: { id: string } };
  imagesBase64: string;
};
// Synthetic v1/schema14 export: two merged identities, three retained image
// versions, a private proposal, immutable receipts and personal positions.
const golden = JSON.parse(
  readFileSync(new URL('../../fixtures/household-import-v1.json', import.meta.url), 'utf8'),
) as ArchiveFixture;
let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (
    await client.json('/api/households', { name: 'Ny installation' })
  ).json();
  path = `/api/households/${household.id}`;
});
afterEach(() => fixture.close());
function archive(change: (value: ArchiveFixture) => void = () => {}) {
  const value = structuredClone(golden);
  change(value);
  const parts: Record<string, Uint8Array> = {
    'content.json': Buffer.from(JSON.stringify(value.content)),
    'images.bin': Buffer.from(value.imagesBase64, 'base64'),
  };
  value.manifest.parts = Object.entries(parts).map(([path, bytes]) => ({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }));
  parts['manifest.json'] = Buffer.from(JSON.stringify(value.manifest));
  return zipSync(parts);
}
async function upload(bytes: Uint8Array) {
  return client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes as BodyInit,
  });
}

test('schema14 merge image archive retains every historical receipt and unmapped private row through import and re-export', async () => {
  const response = await upload(archive());
  expect(response.status).toBe(201);
  const ready = await response.json();
  expect(
    await (
      await client.json(`${path}/imports/${ready.id}/confirm`, {
        contentVersion: 1,
        confirmed: true,
      })
    ).json(),
  ).toMatchObject({ status: 'completed' });
  const current = await (await client.request(`${path}/map`)).json();
  expect(current.objects).toHaveLength(1);
  expect(current.objects[0]).toMatchObject({ id: 'first', name: 'Lo Exempel' });
  expect(current.draft).toEqual({ version: 0, changes: [] });
  const privateChange = golden.content.drafts[0].changes as { after: { profileImageId: string } }[];
  expect(
    (await client.request(`${path}/profile-images/${privateChange[0].after.profileImageId}`))
      .status,
  ).toBe(404);
  expect(
    (await client.request(`${path}/profile-images/${current.objects[0].profileImageId}`)).status,
  ).toBe(200);
  const exported = await (await client.json(`${path}/exports`, {})).json();
  const parts = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${exported.id}`)).arrayBuffer()),
  );
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  expect(content.identities).toEqual(golden.content.identities);
  expect(content.saves.map((row: { receipt: unknown }) => row.receipt)).toEqual(
    golden.content.saves.map((row) => row.receipt),
  );
  expect(
    content.positions.map((row: { objectId: string; x: number }) => [row.objectId, row.x]),
  ).toEqual([
    ['first', 45],
    ['second', -23],
  ]);
  expect(content.drafts[0].changes).toHaveLength(1);
  expect(Buffer.from(parts['images.bin'])).toEqual(Buffer.from(golden.imagesBase64, 'base64'));
  const receipt = content.saves.find(
    (row: { operationId: string }) => row.operationId === 'merge-with-image',
  ).receipt;
  expect(
    (
      await client.json(`${path}/map/undo`, {
        version: 0,
        contentVersion: 2,
        userId: receipt.userId,
        operationId: receipt.operationId,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/map/save`, {
        version: 1,
        contentVersion: 2,
        operationId: 'new-owner-undo',
      })
    ).status,
  ).toBe(200);
  expect((await (await client.request(`${path}/map`)).json()).objects).toHaveLength(2);
});

test('image bytes, image owner references and historical typed references are validated before preview', async () => {
  const before = await (await client.request(`${path}/map`)).json();
  const corruptions: ((value: ArchiveFixture) => void)[] = [
    (value) => {
      value.content.images[0].objectId = 'missing-owner';
    },
    (value) => {
      value.content.images[0].offset = 1;
    },
    (value) => {
      value.content.images[0].sha256 = '0'.repeat(64);
    },
    (value) => {
      value.content.images[0].width = 299;
    },
    (value) => {
      const bytes = Buffer.from(value.imagesBase64, 'base64');
      bytes.fill(0, 0, Number(value.content.images[0].length));
      value.imagesBase64 = bytes.toString('base64');
      value.content.images[0].sha256 = createHash('sha256')
        .update(bytes.subarray(0, Number(value.content.images[0].length)))
        .digest('hex');
    },
    (value) => {
      value.content.objects[0].profileImageId = 'missing-image';
    },
    (value) => {
      value.content.relationships[0].sourceId = 'missing-endpoint';
    },
    (value) => {
      value.content.objectTypes.push(value.content.objectTypes[0]);
    },
    (value) => {
      value.content.history[0].savedAt = 'altered-history';
    },
    (value) => {
      value.content.operations[0].draftVersion = 99999;
    },
    (value) => {
      const live = value.content.objects.find((row) => row.deleted === 0);
      if (live) live.deleted = 1;
    },
    (value) => {
      value.content.removedTypes.push({
        kind: 'objectType',
        typeId: value.content.objects[0].typeId,
      });
    },
    (value) => {
      value.content.removedTypes.push({
        kind: 'relationshipType',
        typeId: value.content.relationships[0].typeId,
      });
    },
    (value) => {
      const fields = [
        { id: 'duplicate', name: 'Text', description: '', kind: 'text' },
        { id: 'duplicate', name: 'Tal', description: '', kind: 'number' },
      ];
      const receipt = value.content.saves[0].receipt as {
        changes: { type: { fields?: unknown[] } }[];
      };
      receipt.changes[0].type.fields = fields;
      const history = value.content.history.find(
        (row) => row.operationId === value.content.saves[0].operationId,
      );
      if (!history) throw new Error('Synthetic history is missing');
      (history.changes as { type: { fields?: unknown[] } }[])[0].type.fields = fields;
    },
    (value) => {
      value.content.objects[0].id = 'uneditable/object';
    },
    (value) => {
      value.content.objectTypeFields.push({
        typeId: value.content.objectTypes[0].id,
        fields: [{ id: '__proto__', name: 'Fält', description: '', kind: 'text' }],
      });
    },
    (value) => {
      value.content.objectTypeFields.push({
        typeId: value.content.objectTypes[0].id,
        fields: Array.from({ length: 101 }, (_, index) => ({
          id: `field-${index}`,
          name: 'Fält',
          description: '',
          kind: 'text',
        })),
      });
    },
    (value) => {
      const receipt = value.content.saves[0].receipt as {
        changes: { type: { fields?: unknown[] } }[];
      };
      receipt.changes[0].type.fields = [
        { id: 'constructor', name: 'Fält', description: '', kind: 'text' },
      ];
    },
    (value) => {
      const receipt = value.content.saves.find((row) => row.operationId === 'merge-with-image')
        ?.receipt as { changes: { merge?: { objectNames: Record<string, string> } }[] };
      const merge = receipt.changes.find((change) => change.merge)?.merge;
      if (!merge) throw new Error('Synthetic merge is missing');
      merge.objectNames['missing-name-owner'] = 'Okänd';
    },
    (value) => {
      // The endpoint remains in a retained receipt, but is absent from the current map.
      value.content.objects = value.content.objects.filter((row) => row.deleted !== 0);
    },
  ];
  for (const corrupt of corruptions) {
    const response = await upload(archive(corrupt));
    expect(response.status).toBe(400);
    expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
  }
});

test('retained personal placements for discarded private identities remain exportable even without an object row', async () => {
  const response = await upload(
    archive((value) => {
      value.content.positions[0].objectId = 'discarded-private-identity';
    }),
  );
  expect(response.status).toBe(201);
  const ready = await response.json();
  expect(
    (
      await (
        await client.json(`${path}/imports/${ready.id}/confirm`, {
          contentVersion: 1,
          confirmed: true,
        })
      ).json()
    ).status,
  ).toBe('completed');
  const exported = await (await client.json(`${path}/exports`, {})).json();
  const parts = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${exported.id}`)).arrayBuffer()),
  );
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  expect(content.positions).toContainEqual(
    expect.objectContaining({ objectId: 'discarded-private-identity', x: 45 }),
  );
  expect((await (await client.request(`${path}/map/view`)).json()).positions).toEqual([]);
});
