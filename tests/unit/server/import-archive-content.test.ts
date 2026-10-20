import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { ImportContent } from '../../../src/server/import-schema.js';
import type { ErasureReview, ErasureSelection } from '../../../src/shared/household-erasure.js';
import type { MapState } from '../../../src/shared/map.js';
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
// Synthetic v2/schema37 export: two merged identities, three retained image
// versions, a private proposal, immutable receipts and personal positions.
const golden = JSON.parse(
  readFileSync(new URL('../../fixtures/household-import-v2.json', import.meta.url), 'utf8'),
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

async function importGolden() {
  const response = await upload(archive());
  expect(response.status).toBe(201);
  const ready = await response.json();
  const confirmation = await client.json(`${path}/imports/${ready.id}/confirm`, {
    contentVersion: 1,
    confirmed: true,
  });
  expect(confirmation.status).toBe(200);
  expect(await confirmation.json()).toMatchObject({ status: 'completed' });
}

async function exportedContent() {
  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  const ready = await prepared.json();
  const download = await client.request(`${path}/exports/${ready.id}`);
  expect(download.status).toBe(200);
  const bytes = new Uint8Array(await download.arrayBuffer());
  const parts = unzipSync(bytes);
  const content: ImportContent = JSON.parse(Buffer.from(parts['content.json']).toString());
  return { bytes, parts, content };
}

async function erase(selection: ErasureSelection) {
  const response = await client.json(`${path}/erasure/review`, { selection });
  expect(response.status).toBe(200);
  const review: ErasureReview = await response.json();
  const result = await client.json(`${path}/erasure/execute`, {
    selection,
    token: review.token,
    operationId: 'erase-imported-history',
    confirmation: 'RADERA PERMANENT',
  });
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ status: { phase: 'completed' } });
  return review;
}

async function previewReexport(bytes: Uint8Array, contentVersion: number) {
  const response = await client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': String(contentVersion),
    },
    body: bytes as BodyInit,
  });
  expect(response.status, await response.text()).toBe(201);
}

test.each(['relationship', 'relationshipType'] as const)(
  'erasing an imported %s cleans merge history while preserving merged identities, images and private proposals',
  async (kind) => {
    await importGolden();
    const before: MapState = await (await client.request(`${path}/map`)).json();
    const original = await exportedContent();
    const edgeTypeId = before.relationships[0].typeId;
    const id = kind === 'relationship' ? 'unknown-endpoint' : edgeTypeId;
    const review = await erase([{ kind, id }]);
    expect(review.objects).toEqual([]);
    expect(review.relationships.map(({ id }) => id)).toEqual(['unknown-endpoint']);
    expect(review.images).toBe(0);
    const after: MapState = await (await client.request(`${path}/map`)).json();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual([]);
    const exported = await exportedContent();
    expect(exported.content.objects).toEqual(original.content.objects);
    expect(exported.content.drafts).toEqual(original.content.drafts);
    expect(exported.content.images).toEqual(original.content.images);
    expect(exported.parts['images.bin']).toEqual(original.parts['images.bin']);
    expect(exported.content.positions).toEqual(original.content.positions);
    const originalMerge = original.content.saves.find(
      ({ operationId }) => operationId === 'merge-with-image',
    )?.receipt.changes[0].merge;
    expect(originalMerge).toBeDefined();
    const expectedMerge = {
      ...originalMerge,
      relationships: [],
      ...(kind === 'relationshipType' ? { relationshipTypes: [] } : {}),
    };
    expect(
      exported.content.saves.find(({ operationId }) => operationId === 'merge-with-image')?.receipt
        .changes[0].merge,
    ).toEqual(expectedMerge);
    expect(
      exported.content.history.find(({ operationId }) => operationId === 'merge-with-image')
        ?.changes[0].merge,
    ).toEqual(expectedMerge);
    for (const saved of exported.content.saves)
      expect(saved.receipt.relationships ?? []).toEqual([]);
    expect(exported.content.relationshipTypes.some((type) => type.id === edgeTypeId)).toBe(
      kind === 'relationship',
    );
    await previewReexport(exported.bytes, after.contentVersion);
    expect(await (await client.request(`${path}/map`)).json()).toEqual(after);
  },
);

test('erasing an absorbed imported identity erases the complete lineage and images while keeping unrelated free values', async () => {
  await importGolden();
  let current: MapState = await (await client.request(`${path}/map`)).json();
  const properties = [
    { id: 'text', label: 'Samma', kind: 'text' as const, value: 'first' },
    { id: 'zero', label: 'Samma', kind: 'number' as const, value: 0 },
    { id: 'false', label: 'Samma', kind: 'boolean' as const, value: false },
    { id: 'empty', label: 'Samma' },
  ];
  expect(
    (
      await client.json(`${path}/map/draft`, {
        version: current.draft.version,
        contentVersion: current.contentVersion,
        id: 'keep',
        baseRevision: null,
        value: { name: 'Behåll', typeId: current.objects[0].typeId, properties },
      })
    ).status,
  ).toBe(200);
  current = await (await client.request(`${path}/map`)).json();
  expect(
    (
      await client.json(`${path}/map/save`, {
        version: current.draft.version,
        contentVersion: current.contentVersion,
        operationId: 'keep-independent',
      })
    ).status,
  ).toBe(200);
  const before: MapState = await (await client.request(`${path}/map`)).json();
  const review = await erase([{ kind: 'object', id: 'second' }]);
  expect(review.objects.map(({ id }) => id)).toEqual(['first', 'second']);
  expect(review.images).toBe(3);
  expect(review.privateImages).toBe(1);
  expect(review.positions).toBe(2);
  const after: MapState = await (await client.request(`${path}/map`)).json();
  expect(after.objects).toEqual(before.objects.filter(({ id }) => id === 'keep'));
  expect(after.objects[0].properties).toEqual(properties);
  expect(after.relationships).toEqual([]);
  const exported = await exportedContent();
  expect(exported.content.objects.map(({ id }) => id)).toEqual(['keep']);
  expect(exported.content.objects[0].properties).toEqual(properties);
  expect(exported.content.relationships).toEqual([]);
  expect(exported.content.images).toEqual([]);
  expect(exported.parts['images.bin']).toHaveLength(0);
  expect(exported.content.positions).toEqual([]);
  for (const draft of exported.content.drafts) expect(draft.changes).toEqual([]);
  for (const saved of exported.content.saves) {
    expect(saved.receipt.changes.every(({ after }) => after?.id === 'keep')).toBe(true);
    expect(saved.receipt.relationships ?? []).toEqual([]);
  }
  await previewReexport(exported.bytes, after.contentVersion);
  expect(await (await client.request(`${path}/map`)).json()).toEqual(after);
});

test('untrusted archive containers reject oversized manifests, repeated part claims and unrecognized entries before preview', async () => {
  const before = await (await client.request(`${path}/map`)).json();
  const oversized = unzipSync(archive());
  oversized['manifest.json'] = Buffer.from(' '.repeat(16_385));
  const repeated = unzipSync(archive());
  const manifest = JSON.parse(Buffer.from(repeated['manifest.json']).toString());
  manifest.parts = [manifest.parts[0], manifest.parts[0]];
  repeated['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  const unexpected = unzipSync(archive());
  unexpected['unrecognized.json'] = unexpected['content.json'];
  delete unexpected['content.json'];
  for (const [parts, error] of [
    [oversized, 'archive_too_large'],
    [repeated, 'invalid_archive'],
    [unexpected, 'invalid_archive'],
  ] as const) {
    const response = await upload(zipSync(parts));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
  }
});

test('checksummed archives still reject excessive JSON nesting, mismatched household identity and unowned image bytes', async () => {
  const before = await (await client.request(`${path}/map`)).json();
  const invalid = [
    archive((value) => {
      let nested: unknown = 'opaque';
      for (let depth = 0; depth < 45; depth++) nested = { next: nested };
      value.content.objects[0].properties = [
        { id: 'nested', label: 'Text', kind: 'text', value: nested },
      ];
    }),
    archive((value) => {
      value.content.household.id = 'mismatched-household';
    }),
    archive((value) => {
      value.imagesBase64 = Buffer.concat([
        Buffer.from(value.imagesBase64, 'base64'),
        Buffer.from('unowned image bytes'),
      ]).toString('base64');
    }),
  ];
  for (const bytes of invalid) {
    const response = await upload(bytes);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_archive' });
    expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
  }
});

test('new-format merge image archive retains every historical receipt and unmapped private row through import and re-export', async () => {
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
  expect(content.identities.filter((row: { id: string }) => row.id !== current.userId)).toEqual(
    golden.content.identities,
  );
  expect((await (await client.request(`${path}/map/view`)).json()).settings.background).toBe(true);
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
      value.content.objectTypeFields = [{ typeId: value.content.objectTypes[0].id, fields: [] }];
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
