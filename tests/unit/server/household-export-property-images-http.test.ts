import { createHash } from 'node:crypto';
import { request } from '@playwright/test';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import type { ExportManifest } from '../../../src/shared/household-export.js';
import type { MapDraft, MapState, SaveReceipt } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

test('a full archive preserves object identities and saved, historical and private image versions', {
  tags: ['technical'],
}, async () => {
  const client = await request.newContext();
  const installation = await createInstallation();
  try {
    await signIn(client, installation.origin);
    const { household } = await (await createHousehold(client, installation.origin)).json();
    const householdPath = `${installation.origin}/api/households/${household.id}`;
    const path = `${householdPath}/map`;
    const headers = { origin: installation.origin };
    const read = async (): Promise<MapState> => (await client.get(path)).json();
    const post = (route: string, data: unknown) =>
      client.post(`${path}/${route}`, { headers, data });
    const save = async (operationId: string): Promise<SaveReceipt> => {
      const response = await post('save', { version: (await read()).draft.version, operationId });
      expect(response.status()).toBe(200);
      return (await response.json()).receipt;
    };
    for (const id of ['first', 'second']) {
      const state = await read();
      expect(
        (
          await post('draft', {
            version: state.draft.version,
            id,
            baseRevision: null,
            value: { typeId: state.types[0].id, name: 'Lo Exempel' },
          })
        ).status(),
      ).toBe(200);
    }
    const state = await read();
    expect(
      (
        await post('relationship', {
          version: state.draft.version,
          id: 'unknown-endpoint',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes[0].id,
            sourceId: 'second',
            targetId: 'second',
            properties: [
              {
                id: 'certainty',
                label: 'Uppgiftens säkerhet',
                kind: 'text' as const,
                value: 'Okänt',
              },
            ],
          },
        })
      ).status(),
    ).toBe(200);
    await save('initial');
    for (const [id, x] of [
      ['first', 45],
      ['second', -23],
    ] as const)
      expect(
        (await post('view/position', { id, version: 0, position: { x, y: 8, z: 3 } })).status(),
      ).toBe(200);

    const upload = async (id: string, color: string) => {
      const current = await read();
      const png = await sharp({
        create: { width: 24, height: 18, channels: 3, background: color },
      })
        .png()
        .toBuffer();
      const response = await client.post(`${householdPath}/profile-images/${id}`, {
        headers: {
          ...headers,
          'content-type': 'image/png',
          'x-skyttel-draft-version': String(current.draft.version),
          'x-skyttel-content-version': String(current.contentVersion),
          'x-skyttel-object-revision': String(
            current.objects.find((object) => object.id === id)?.revision,
          ),
        },
        data: png,
      });
      expect(response.status()).toBe(200);
      const imageId = (await read()).draft.changes.find((change) => change.id === id)?.after
        ?.profileImageId;
      expect(imageId).toEqual(expect.any(String));
      return imageId as string;
    };
    const imageBytes = async (id: string) => {
      const response = await client.get(`${householdPath}/profile-images/${id}`);
      expect(response.status()).toBe(200);
      return response.body();
    };
    const sourceId = await upload('second', '#2255aa');
    await save('source-image');
    const sourceBytes = await imageBytes(sourceId);
    const copiedId = await upload('first', '#2255aa');
    const imageSave = await save('image-with-history');
    expect(copiedId).not.toBe(sourceId);
    expect(await imageBytes(copiedId)).toEqual(sourceBytes);
    const privateId = await upload('first', '#aa5522');
    const privateBytes = await imageBytes(privateId);
    expect(privateBytes).not.toEqual(sourceBytes);
    const expectedDraft = (await read()).draft;
    await installation.restart();
    expect((await read()).draft).toEqual(expectedDraft);
    const publicView = await (await client.get(`${path}/view`)).json();
    expect(publicView.positions.map((position: { id: string }) => position.id).sort()).toEqual([
      'first',
      'second',
    ]);

    const prepared = await client.post(`${householdPath}/exports`, { headers, data: {} });
    expect(prepared.status()).toBe(201);
    const ready = await prepared.json();
    const download = await client.get(`${householdPath}/exports/${ready.id}`);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toBe('application/zip');
    const archive = await download.body();
    expect(archive.length).toBe(ready.bytes);
    const parts = unzipSync(archive);
    expect(Object.keys(parts).sort()).toEqual(['content.json', 'images.bin', 'manifest.json']);
    const manifest: ExportManifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
    expect(manifest).toMatchObject({
      format: 'skyttel-household',
      version: 2,
      schemaVersion: 37,
      householdId: household.id,
    });
    for (const part of manifest.parts) {
      expect(parts[part.path].length).toBe(part.bytes);
      expect(createHash('sha256').update(parts[part.path]).digest('hex')).toBe(part.sha256);
    }
    const content = JSON.parse(Buffer.from(parts['content.json']).toString());
    const exportedSave = content.saves.find(
      (save: { operationId: string }) => save.operationId === 'image-with-history',
    );
    expect(exportedSave.receipt).toEqual(imageSave);
    expect(content.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', deleted: 0, profileImageId: copiedId }),
        expect.objectContaining({ id: 'second', deleted: 0, profileImageId: sourceId }),
      ]),
    );
    expect(content.relationships).toEqual([
      expect.objectContaining({
        id: 'unknown-endpoint',
        sourceId: 'second',
        targetId: 'second',
        properties: [
          { id: 'certainty', label: 'Uppgiftens säkerhet', kind: 'text' as const, value: 'Okänt' },
        ],
      }),
    ]);
    expect(
      content.drafts.find((draft: MapDraft & { userId: string }) => draft.userId === state.userId),
    ).toMatchObject({ ...expectedDraft });
    expect(content.positions).toEqual([
      expect.objectContaining({ objectId: 'first', x: 45, y: 8, z: 3 }),
      expect.objectContaining({ objectId: 'second', x: -23, y: 8, z: 3 }),
    ]);
    expect(content.images).toHaveLength(3);
    expect(content.images.map((image: { id: string }) => image.id).sort()).toEqual(
      [sourceId, copiedId, privateId].sort(),
    );
    let offset = 0;
    for (const image of content.images) {
      expect(image.offset).toBe(offset);
      const bytes = Buffer.from(parts['images.bin'].subarray(offset, offset + image.length));
      expect(bytes.length).toBe(image.length);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
      expect(bytes).toEqual(image.id === privateId ? privateBytes : sourceBytes);
      expect(image).toMatchObject({
        householdId: household.id,
        objectId: image.id === sourceId ? 'second' : 'first',
        createdBy: state.userId,
        width: 24,
        height: 18,
      });
      offset += image.length;
    }
    expect(offset).toBe(parts['images.bin'].length);
  } finally {
    await client.dispose();
    await installation.close();
  }
});
