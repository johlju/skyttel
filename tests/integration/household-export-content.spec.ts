import { createHash, randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { ExportManifest } from '../../src/shared/household-export.js';
import type { MapDraft, MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('EXPORT-07: revocation or demotion interrupts an active download and removes its private copy', async ({
  page,
  playwright,
}) => {
  const installation = await createInstallation();
  const other = await playwright.request.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    const { user } = await (await other.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await other.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    const pixels = await sharp(randomBytes(256 * 256 * 3), {
      raw: { width: 256, height: 256, channels: 3 },
    })
      .webp({ lossless: true })
      .toBuffer();
    const database = new Database(join(installation.directory, 'skyttel.db'));
    try {
      database.transaction(() => {
        for (let index = 0; index < 100; index++)
          database
            .prepare('INSERT INTO profile_image VALUES (?, ?, ?, ?, ?, 256, 256)')
            .run(`retained-${index}`, household.id, 'historical-object', user.id, pixels);
      })();
    } finally {
      database.close();
    }
    for (const action of ['role', 'revoke']) {
      expect(
        (
          await page.request.post(`${path}/members/${user.id}/role`, {
            headers,
            data: { role: 'administrator' },
          })
        ).status(),
      ).toBe(200);
      const prepared = await other.post(`${path}/exports`, { headers, data: {} });
      expect(prepared.status()).toBe(201);
      const ready = await prepared.json();
      expect(ready.bytes).toBeGreaterThan(16 * 1024 * 1024);
      const cookies = (await other.storageState()).cookies
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ');
      const response = await fetch(`${path}/exports/${ready.id}`, { headers: { cookie: cookies } });
      expect(response.status).toBe(200);
      if (!response.body) throw new Error('Archive stream required');
      const reader = response.body.getReader();
      const first = await reader.read();
      expect(first.value?.byteLength).toBeGreaterThan(0);
      let received = first.value?.byteLength ?? 0;
      // Stop consuming the real HTTP transfer while the other administrator
      // changes access. Bytes already in network buffers cannot be recalled.
      expect(
        (
          await page.request.post(`${path}/members/${user.id}/${action}`, {
            headers,
            data: action === 'role' ? { role: 'member' } : {},
          })
        ).status(),
      ).toBe(200);
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value.byteLength;
        }
      } catch {
        // An interrupted content-length response rejects rather than completing.
      } finally {
        reader.releaseLock();
      }
      expect(received).toBeLessThan(ready.bytes);
      expect(await readdir(join(installation.directory, '.skyttel-exports'))).toEqual([]);
      expect((await other.get(`${path}/exports/${ready.id}`)).status()).toBe(403);
    }
  } finally {
    await other.dispose();
    await installation.close();
  }
});

test('EXPORT-06: a full archive preserves merge identities and original, copied and private image versions', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const householdPath = `${installation.origin}/api/households/${household.id}`;
    const path = `${householdPath}/map`;
    const headers = { origin: installation.origin };
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers, data });
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
            value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
          })
        ).status(),
      ).toBe(200);
    }
    let state = await read();
    expect(
      (
        await post('relationship', {
          version: state.draft.version,
          id: 'unknown-endpoint',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes[0].id,
            sourceId: 'second',
            targetId: null,
            knowledge: 'unknown',
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
      const response = await page.request.post(`${householdPath}/profile-images/${id}`, {
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
      const response = await page.request.get(`${householdPath}/profile-images/${id}`);
      expect(response.status()).toBe(200);
      return response.body();
    };
    const sourceId = await upload('second', '#2255aa');
    await save('source-image');
    const sourceBytes = await imageBytes(sourceId);
    state = await read();
    expect(
      (
        await post('merge', {
          version: state.draft.version,
          survivorId: 'first',
          absorbedId: 'second',
          identityConfirmed: true,
          reviewed: {
            objects: ['first', 'second'].map((id) =>
              state.objects.find((object) => object.id === id),
            ),
            relationships: state.relationships,
            types: state.types.filter((type) => type.id === state.objects[0].typeId),
            relationshipTypes: state.relationshipTypes.filter(
              (type) => type.id === state.relationships[0].typeId,
            ),
          },
          choices: { profileImageId: 'absorbed' },
          relationships: [{ id: 'unknown-endpoint', action: 'keep' }],
        })
      ).status(),
    ).toBe(200);
    const merged = await save('merge-with-image');
    const merge = merged.changes.find((change) => change.after?.id === 'first')?.merge;
    const copiedId = merge?.imageCopy?.copiedImageId;
    expect(copiedId).toEqual(expect.any(String));
    expect(copiedId).not.toBe(sourceId);
    expect(await imageBytes(copiedId as string)).toEqual(sourceBytes);
    expect(merge?.imageCopy).toEqual({
      sourceObjectId: 'second',
      sourceImageId: sourceId,
      copiedImageId: copiedId,
    });
    const privateId = await upload('first', '#aa5522');
    const privateBytes = await imageBytes(privateId);
    expect(privateBytes).not.toEqual(sourceBytes);
    const expectedDraft = (await read()).draft;
    await installation.restart();
    expect((await read()).draft).toEqual(expectedDraft);
    const publicView = await (await page.request.get(`${path}/view`)).json();
    expect(publicView.positions.map((position: { id: string }) => position.id)).toEqual(['first']);

    const prepared = await page.request.post(`${householdPath}/exports`, { headers, data: {} });
    expect(prepared.status()).toBe(201);
    const ready = await prepared.json();
    const download = await page.request.get(`${householdPath}/exports/${ready.id}`);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toBe('application/zip');
    const archive = await download.body();
    expect(archive.length).toBe(ready.bytes);
    const parts = unzipSync(archive);
    expect(Object.keys(parts).sort()).toEqual(['content.json', 'images.bin', 'manifest.json']);
    const manifest: ExportManifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
    expect(manifest).toMatchObject({
      format: 'skyttel-household',
      version: 1,
      householdId: household.id,
    });
    for (const part of manifest.parts) {
      expect(parts[part.path].length).toBe(part.bytes);
      expect(createHash('sha256').update(parts[part.path]).digest('hex')).toBe(part.sha256);
    }
    const content = JSON.parse(Buffer.from(parts['content.json']).toString());
    const exportedSave = content.saves.find(
      (save: { operationId: string }) => save.operationId === 'merge-with-image',
    );
    expect(exportedSave.receipt).toEqual(merged);
    expect(content.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', deleted: 0, profileImageId: copiedId }),
        expect.objectContaining({ id: 'second', deleted: 1, profileImageId: sourceId }),
      ]),
    );
    expect(content.relationships).toEqual([
      expect.objectContaining({
        id: 'unknown-endpoint',
        sourceId: 'first',
        targetId: null,
        knowledge: 'unknown',
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
    await installation.close();
  }
});
