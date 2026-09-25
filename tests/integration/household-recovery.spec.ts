import { type APIRequestContext, expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { beginAssistant, callAssistant } from '../support/assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('FLYTT-01: a fresh installation restores an archive, explicitly assigns private ownership and remains portable after restart', async ({
  browser,
}) => {
  const source = await createInstallation();
  const destination = await createInstallation({ provider: 'microsoft', subject: robin.subject });
  const third = await createInstallation({ provider: 'google', subject: 'third-admin' });
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [sourceContext, destinationContext, thirdContext] = contexts;
  const sourceClient = sourceContext.request;
  const destinationPage = await destinationContext.newPage();
  const destinationClient = destinationContext.request;
  const thirdClient = thirdContext.request;
  try {
    await signIn(sourceClient, source.origin);
    const { household } = await (await createHousehold(sourceClient, source.origin)).json();
    const sourcePath = `${source.origin}/api/households/${household.id}`;
    const read = async (client: APIRequestContext, path: string): Promise<MapState> =>
      (await client.get(`${path}/map`)).json();
    const post = async (route: string, body: Record<string, unknown>) => {
      const state = await read(sourceClient, sourcePath);
      const response = await sourceClient.post(`${sourcePath}/map/${route}`, {
        headers: { origin: source.origin },
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...body },
      });
      expect(response.status(), await response.text()).toBe(200);
    };
    const typeId = (await read(sourceClient, sourcePath)).types[0].id;
    await post('object-type', {
      id: typeId,
      baseRevision: 1,
      value: {
        name: 'Person',
        description: 'Egen betydelse',
        fields: [{ id: 'note', name: 'Notering', description: '', kind: 'text' }],
      },
    });
    for (const id of ['shared', 'retired'])
      await post('draft', {
        id,
        baseRevision: null,
        value: {
          name: id,
          description: 'Påhittat innehåll',
          typeId,
          customValues: { note: 'SYNTHETIC' },
        },
      });
    await post('save', { operationId: 'original-content' });
    const uploadImage = async (color: string) => {
      const state = await read(sourceClient, sourcePath);
      const response = await sourceClient.post(`${sourcePath}/profile-images/shared`, {
        headers: {
          origin: source.origin,
          'content-type': 'image/png',
          'x-skyttel-content-version': String(state.contentVersion),
          'x-skyttel-draft-version': String(state.draft.version),
          'x-skyttel-object-revision': String(
            state.objects.find((row) => row.id === 'shared')?.revision,
          ),
        },
        data: await sharp({ create: { width: 4, height: 3, channels: 3, background: color } })
          .png()
          .toBuffer(),
      });
      expect(response.status()).toBe(200);
      return (await read(sourceClient, sourcePath)).draft.changes.find((row) => row.id === 'shared')
        ?.after?.profileImageId as string;
    };
    await uploadImage('#2255aa');
    await post('save', { operationId: 'first-image' });
    await uploadImage('#aa5522');
    await post('save', { operationId: 'second-image' });
    await post('draft', { id: 'retired', baseRevision: 1, value: null });
    await post('save', { operationId: 'retire-object' });
    const privateImage = await uploadImage('#33aa44');
    await post('view/position', { id: 'shared', version: 0, position: { x: 17, y: 8, z: 3 } });
    const { version: _settingsVersion, ...settings } = (
      await (await sourceClient.get(`${sourcePath}/map/view`)).json()
    ).settings;
    await post('view/settings', {
      version: 0,
      settings: { ...settings, stars: true, axisCorner: 'top-left' },
    });
    const sourceState = await read(sourceClient, sourcePath);
    const sourceView = await (await sourceClient.get(`${sourcePath}/map/view`)).json();
    const historicalId = sourceState.userId;
    const sourceHistory = (await (await sourceClient.get(`${sourcePath}/map/history`)).json())
      .history;
    const pending = {
      operationId: 'source-pending',
      version: sourceState.draft.version,
      contentVersion: sourceState.contentVersion,
    };
    await post('operations', pending);
    const oauth = await beginAssistant(sourceClient, source.origin);
    const consent = await oauth.consent(household.id);
    const token = await oauth.exchange((await consent.json()).url);
    const { access_token } = await token.json();
    expect((await callAssistant(source.origin, access_token, 'read_map')).status).toBe(200);
    const exportArchive = async (client: APIRequestContext, path: string, origin: string) => {
      const response = await client.post(`${path}/exports`, { headers: { origin }, data: {} });
      expect(response.status()).toBe(201);
      return (await client.get(`${path}/exports/${(await response.json()).id}`)).body();
    };
    // No source writes follow the final archive. Only these bytes cross installations.
    const archive = await exportArchive(sourceClient, sourcePath, source.origin);
    const sourceParts = unzipSync(archive);
    const sourceContent = JSON.parse(Buffer.from(sourceParts['content.json']).toString());
    destination.setIdentity({ ...robin, name: 'Alex Exempel', email: 'alex@example.test' });
    await signIn(destinationClient, destination.origin, 'microsoft');
    const { household: restoredHousehold } = await (
      await createHousehold(destinationClient, destination.origin, 'Ny installation')
    ).json();
    const destinationPath = `${destination.origin}/api/households/${restoredHousehold.id}`;
    const oldCookies = (await sourceContext.cookies())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    expect(
      (
        await thirdClient.get(`${destinationPath}/map`, { headers: { cookie: oldCookies } })
      ).status(),
    ).toBe(401);
    expect((await callAssistant(destination.origin, access_token, 'read_map')).status).toBe(401);
    await destinationPage.goto(
      `${destination.origin}/households/${restoredHousehold.id}/administration`,
    );
    await destinationPage
      .getByLabel('Skyttel-export (ZIP)')
      .setInputFiles({ name: 'source.zip', mimeType: 'application/zip', buffer: archive });
    await destinationPage.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await destinationPage
      .getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' })
      .check();
    await destinationPage.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(destinationPage.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await destinationPage.reload();
    let restored = await read(destinationClient, destinationPath);
    const destinationUserId = (
      await (await destinationClient.get(`${destination.origin}/api/bootstrap`)).json()
    ).user.id;
    expect(restored.userId).not.toBe(historicalId);
    expect(restored.draft.changes).toEqual([]);
    expect(
      (await destinationClient.get(`${destinationPath}/profile-images/${privateImage}`)).status(),
    ).toBe(404);
    expect(
      (await (await destinationClient.get(`${destinationPath}/map/history`)).json()).history,
    ).toEqual(sourceHistory);
    expect(
      (
        await destinationClient.post(`${destinationPath}/map/draft`, {
          headers: { origin: destination.origin },
          data: {
            version: restored.draft.version,
            contentVersion: restored.contentVersion,
            id: 'destination-private',
            baseRevision: null,
            value: { name: 'Nytt privat arbete', description: '', typeId },
          },
        })
      ).status(),
    ).toBe(200);
    const displacedId = restored.userId;
    restored = await read(destinationClient, destinationPath);
    const destinationPending = {
      operationId: 'destination-pending',
      version: restored.draft.version,
      contentVersion: restored.contentVersion,
    };
    expect(
      (
        await destinationClient.post(`${destinationPath}/map/operations`, {
          headers: { origin: destination.origin },
          data: destinationPending,
        })
      ).status(),
    ).toBe(200);
    await destinationPage.reload();
    await destinationPage
      .getByRole('button', { name: 'Hämta aktuella innehållskopplingar' })
      .click();
    await destinationPage.getByLabel('Historisk innehållsidentitet').selectOption(historicalId);
    await destinationPage.getByLabel('Aktuell verifierad medlem').selectOption(destinationUserId);
    await expect(
      destinationPage.getByRole('button', { name: 'Bekräfta innehållskopplingen' }),
    ).toBeDisabled();
    await destinationPage
      .getByRole('checkbox', { name: 'Jag har identifierat rätt person' })
      .check();
    await destinationPage.getByRole('button', { name: 'Bekräfta innehållskopplingen' }).click();
    await expect(
      destinationPage.getByText('Innehållskopplingen är sparad.', { exact: true }),
    ).toBeVisible();
    await destination.restart();
    restored = await read(destinationClient, destinationPath);
    expect(restored.userId).toBe(historicalId);
    expect(restored.draft.changes.map((row) => row.id)).toEqual(
      sourceState.draft.changes.map((row) => row.id),
    );
    expect(
      (await destinationClient.get(`${destinationPath}/profile-images/${privateImage}`)).status(),
    ).toBe(200);
    expect(
      (await (await destinationClient.get(`${destinationPath}/map/view`)).json()).positions,
    ).toEqual(sourceView.positions);
    expect(
      (await (await destinationClient.get(`${destinationPath}/map/history`)).json()).history,
    ).toEqual(sourceHistory);
    expect(
      (await (await destinationClient.get(`${destinationPath}/map/view`)).json()).settings,
    ).toEqual(sourceView.settings);
    const secondArchive = await exportArchive(
      destinationClient,
      destinationPath,
      destination.origin,
    );
    const secondParts = unzipSync(secondArchive);
    const secondContent = JSON.parse(Buffer.from(secondParts['content.json']).toString());
    expect(secondContent.drafts).toContainEqual(
      expect.objectContaining({
        userId: displacedId,
        changes: expect.arrayContaining([expect.objectContaining({ id: 'destination-private' })]),
      }),
    );
    expect(secondContent.saves).toEqual(
      sourceContent.saves.map((row: Record<string, unknown>) => ({
        ...row,
        householdId: restoredHousehold.id,
      })),
    );
    expect(secondContent.operations.map((row: { operationId: string }) => row.operationId)).toEqual(
      expect.arrayContaining(['source-pending', 'destination-pending']),
    );
    expect(Buffer.from(secondParts['images.bin'])).toEqual(Buffer.from(sourceParts['images.bin']));
    third.setIdentity({ subject: 'third-admin', name: 'Kim Exempel', email: 'kim@example.test' });
    await signIn(thirdClient, third.origin);
    const { household: thirdHousehold } = await (
      await createHousehold(thirdClient, third.origin)
    ).json();
    const thirdPath = `${third.origin}/api/households/${thirdHousehold.id}`;
    const prepared = await thirdClient.post(`${thirdPath}/imports`, {
      headers: {
        origin: third.origin,
        'content-type': 'application/zip',
        'x-skyttel-content-version': '1',
      },
      data: secondArchive,
    });
    expect(prepared.status(), await prepared.text()).toBe(201);
    expect(
      (
        await thirdClient.post(`${thirdPath}/imports/${(await prepared.json()).id}/confirm`, {
          headers: { origin: third.origin },
          data: { contentVersion: 1, confirmed: true },
        })
      ).status(),
    ).toBe(200);
    const thirdUserId = (await (await thirdClient.get(`${third.origin}/api/bootstrap`)).json()).user
      .id;
    expect(
      (
        await thirdClient.post(`${thirdPath}/content-owners/assign`, {
          headers: { origin: third.origin },
          data: {
            contentVersion: 2,
            identityId: historicalId,
            userId: thirdUserId,
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(200);
    await third.restart();
    const thirdState = await read(thirdClient, thirdPath);
    for (const old of [pending, destinationPending])
      expect(
        (
          await thirdClient.post(`${thirdPath}/map/save`, {
            headers: { origin: third.origin },
            data: { ...old, contentVersion: thirdState.contentVersion },
          })
        ).status(),
      ).toBe(409);
    expect((await (await thirdClient.get(`${thirdPath}/map/history`)).json()).history).toEqual(
      sourceHistory,
    );
    const thirdArchive = await exportArchive(thirdClient, thirdPath, third.origin);
    const thirdParts = unzipSync(thirdArchive);
    const thirdContent = JSON.parse(Buffer.from(thirdParts['content.json']).toString());
    expect(thirdContent.drafts.map((row: { userId: string }) => row.userId)).toEqual(
      expect.arrayContaining([historicalId, displacedId]),
    );
    expect(
      thirdContent.objects.map((row: { id: string; deleted: number }) => [row.id, row.deleted]),
    ).toEqual(
      sourceContent.objects.map((row: { id: string; deleted: number }) => [row.id, row.deleted]),
    );
    expect(Buffer.from(thirdParts['images.bin'])).toEqual(Buffer.from(sourceParts['images.bin']));
    // Displacement preserves usable private work, not merely an archived row.
    for (const identityId of [displacedId, historicalId]) {
      const state = await read(thirdClient, thirdPath);
      expect(
        (
          await thirdClient.post(`${thirdPath}/content-owners/assign`, {
            headers: { origin: third.origin },
            data: {
              identityId,
              userId: thirdUserId,
              contentVersion: state.contentVersion,
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(200);
      const selected = await read(thirdClient, thirdPath);
      expect(selected.userId).toBe(identityId);
      expect(selected.draft.changes.map((row) => row.id)).toEqual(
        identityId === displacedId ? ['destination-private'] : ['shared'],
      );
    }
    const fresh = await read(thirdClient, thirdPath);
    expect(
      (
        await thirdClient.post(`${thirdPath}/map/save`, {
          headers: { origin: third.origin },
          data: {
            version: fresh.draft.version,
            contentVersion: fresh.contentVersion,
            operationId: 'fresh-after-move',
          },
        })
      ).status(),
    ).toBe(200);
    await third.restart();
    expect(
      (await read(thirdClient, thirdPath)).objects.find((row) => row.id === 'shared'),
    ).toHaveProperty('profileImageId', privateImage);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.all([source.close(), destination.close(), third.close()]);
  }
});
