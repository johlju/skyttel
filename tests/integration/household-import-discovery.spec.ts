import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHousehold, signIn } from '../support/client.js';
import {
  expectEmptyRecoveryDraft,
  expectRecoveryContent,
  expectRecoveryDraft,
  reloadRestoredHousehold,
  seedRecoveryContent,
} from '../support/household-recovery-reading.js';
import { alex, createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('IMPORT-09: another administrator discovers the same committed import after a lost response and restart', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin, 'microsoft');
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${path}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    await seedRecoveryContent(page.request, path);
    const before = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'private',
            version: before.draft.version,
            baseRevision: null,
            value: {
              name: 'Privat arbete från exporten',
              description: 'Privat uppgift för Privat arbete från exporten',
              typeId: before.types[0].id,
            },
          },
        })
      ).status(),
    ).toBe(200);
    const original = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const administration = `${installation.origin}/households/${household.id}/settings/import`;
    await page.goto(administration);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(page.getByText('Filen är kontrollerad.', { exact: false })).toBeVisible();
    let committedId = '';
    let confirmations = 0;
    other.on('request', (request) => {
      if (request.method() === 'POST' && /\/imports\/[^/]+\/confirm$/.test(request.url()))
        confirmations++;
    });
    await page.route('**/imports/*/confirm', async (route) => {
      confirmations++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({ status: 'completed', contentVersion: 2 });
      committedId = result.id;
      await route.abort('failed');
    });
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(page.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    expect(committedId).not.toBe('');
    const fresh = await other.newPage();
    await fresh.goto(installation.origin);
    expect(
      await fresh.evaluate((id) => sessionStorage.getItem(`skyttel-import:${id}`), household.id),
    ).toBeNull();
    await fresh.goto(administration);
    await expect(
      fresh.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    await expect(fresh.getByText(committedId, { exact: true })).toBeVisible();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      ...original,
      contentVersion: 2,
    });
    const alexReader = await page.context().newPage();
    const robinReader = await other.newPage();
    await alexReader.goto(installation.origin);
    await expectRecoveryContent(alexReader);
    await expectRecoveryDraft(alexReader, 'Privat arbete från exporten');
    await robinReader.goto(installation.origin);
    await expectRecoveryContent(robinReader);
    await expectEmptyRecoveryDraft(robinReader, 'Privat arbete från exporten');
    await installation.restart();
    await fresh.reload();
    await expect(fresh.getByText(committedId, { exact: true })).toBeVisible();
    await expect(
      fresh.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      ...original,
      contentVersion: 2,
    });
    expect(confirmations).toBe(1);
    await alexReader.reload();
    await expectRecoveryContent(alexReader);
    await expectRecoveryDraft(alexReader, 'Privat arbete från exporten');
    await robinReader.reload();
    await expectRecoveryContent(robinReader);
    await expectEmptyRecoveryDraft(robinReader, 'Privat arbete från exporten');
    await alexReader.close();
    await robinReader.close();
  } finally {
    await other.close();
    await installation.close();
  }
});

test('IMPORT-11: another administrator finishes the same gated cleanup after the original administrator loses authority', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  let directory = '';
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const { user: owner } = await (
      await page.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin, 'microsoft');
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path}/invitations`, {
        headers,
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${path}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    await seedRecoveryContent(page.request, path);
    const initial = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'cleanup-private',
            version: initial.draft.version,
            baseRevision: null,
            value: {
              name: 'Privat arbete genom rensningen',
              description: 'Privat uppgift för Privat arbete genom rensningen',
              typeId: initial.types[0].id,
            },
          },
        })
      ).status(),
    ).toBe(200);
    const original = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const administration = `${installation.origin}/households/${household.id}/settings/import`;
    await page.goto(administration);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    const prepared = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url() === `${path}/imports`,
    );
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    const ready = await (await prepared).json();
    expect(ready.status).toBe('ready');
    directory = join(installation.directory, '.skyttel-imports', ready.id);
    // Real filesystem boundary: replacement can commit but removal of the
    // extracted files must fail. No production state or result is substituted.
    chmodSync(directory, 0o500);
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(page.getByText(/Tillfälliga filer behöver rensas/)).toBeVisible();
    const fresh = await other.newPage();
    const blockedMap = fresh.waitForResponse(`${path}/map/view`);
    await fresh.goto(`${installation.origin}/households/${household.id}`);
    expect((await blockedMap).status()).toBe(409);
    await expect(fresh.getByRole('alert')).toContainText('Hushållets innehåll ändras');
    await expect(fresh.getByRole('region', { name: 'Rymdkarta', exact: true })).toHaveCount(0);
    await fresh.goto(`${installation.origin}/households/${household.id}/settings/export`);
    const exportSection = fresh.getByRole('region', { name: 'Fullständig export' });
    const blockedExport = fresh.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url() === `${path}/exports`,
    );
    await exportSection.getByRole('button', { name: 'Förbered fullständig export' }).click();
    expect((await blockedExport).status()).toBe(409);
    await expect(exportSection.getByRole('alert')).toContainText('Exporten kunde inte förberedas');
    await expect(exportSection.getByRole('button', { name: 'Hämta ZIP-fil' })).toHaveCount(0);
    expect((await other.request.get(`${path}/map`)).status()).toBe(409);
    expect((await other.request.post(`${path}/exports`, { headers, data: {} })).status()).toBe(409);
    await fresh.goto(`${installation.origin}/households/${household.id}/administration`);
    const alexMembership = fresh
      .getByRole('list', { name: 'Medlemmar', exact: true })
      .getByRole('listitem')
      .filter({ has: fresh.getByRole('heading', { name: owner.name, exact: true }) });
    await expect(alexMembership.getByText('Administratör', { exact: true })).toBeVisible();
    const changingRole = fresh.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url() === `${path}/members/${owner.id}/role`,
    );
    await alexMembership.getByRole('button', { name: 'Gör till medlem', exact: true }).click();
    const changedRole = await changingRole;
    expect(changedRole.request().postDataJSON()).toEqual({ role: 'member' });
    expect(changedRole.status()).toBe(200);
    await expect(fresh.getByRole('status')).toHaveText('Rollen har ändrats.');
    await expect(alexMembership.getByText('Medlem', { exact: true })).toBeVisible();
    // Keep the original direct-route authority and status checks alongside
    // the actual browser handoff; the same role remains a valid explicit request.
    expect(
      (
        await other.request.post(`${path}/members/${owner.id}/role`, {
          headers,
          data: { role: 'member' },
        })
      ).status(),
    ).toBe(200);
    expect((await page.request.get(`${path}/imports`)).status()).toBe(403);
    expect((await page.request.get(`${path}/imports/${ready.id}`)).status()).toBe(403);
    await fresh.goto(administration);
    await expect(fresh.getByText(ready.id, { exact: true })).toBeVisible();
    await expect(fresh.getByText(/Tillfälliga filer behöver rensas/)).toBeVisible();
    await expect(fresh.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    const discovered = await (await other.request.get(`${path}/imports`)).json();
    expect(discovered.attempt).toMatchObject({
      id: ready.id,
      status: 'cleanup',
      contentVersion: 2,
      confirmationContentVersion: 1,
    });
    const altered = await other.request.post(`${path}/imports/${ready.id}/confirm`, {
      headers,
      data: { confirmed: true, contentVersion: 2 },
    });
    expect(altered.status()).toBe(409);
    expect(await altered.json()).toEqual({ error: 'operation_conflict' });
    expect((await other.request.get(`${path}/map`)).status()).toBe(409);
    chmodSync(directory, 0o700);
    const cleanup = fresh.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url() === `${path}/imports/${ready.id}/confirm`,
    );
    await fresh.getByRole('button', { name: 'Slutför importens rensning' }).click();
    expect((await cleanup).postDataJSON()).toEqual({ confirmed: true, contentVersion: 1 });
    await expect(fresh.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await expect(fresh.getByText(ready.id, { exact: true })).toBeVisible();
    expect(existsSync(directory)).toBe(false);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      ...original,
      contentVersion: 2,
    });
    const reader = await page.context().newPage();
    await reader.goto(installation.origin);
    await expectRecoveryContent(reader);
    await expectRecoveryDraft(reader, 'Privat arbete genom rensningen');
    const robinReader = await other.newPage();
    await robinReader.goto(installation.origin);
    await expectRecoveryContent(robinReader);
    await expectEmptyRecoveryDraft(robinReader, 'Privat arbete genom rensningen');
    await installation.restart();
    await fresh.reload();
    await expect(fresh.getByText(ready.id, { exact: true })).toBeVisible();
    expect((await (await page.request.get(`${path}/map`)).json()).contentVersion).toBe(2);
    await reader.reload();
    await expectRecoveryContent(reader);
    await expectRecoveryDraft(reader, 'Privat arbete genom rensningen');
    await reloadRestoredHousehold(fresh);
    await expectRecoveryContent(fresh);
    await expectEmptyRecoveryDraft(fresh, 'Privat arbete genom rensningen');
    await reader.close();
    await robinReader.close();
  } finally {
    if (directory && existsSync(directory)) chmodSync(directory, 0o700);
    await other.close();
    await installation.close();
  }
});

test('IMPORT-10: the current administrator recovers a lost preparation before an older completed import', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  const administrator = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(administrator.request, installation.origin, 'microsoft');
    const { user } = await (
      await administrator.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path}/invitations`, {
        headers,
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await administrator.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${path}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    const exported = await (
      await page.request.post(`${path}/exports`, {
        headers: { origin: installation.origin },
        data: {},
      })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const administration = `${installation.origin}/households/${household.id}/settings/import`;
    const file = { name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive };
    await page.goto(administration);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles(file);
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(page.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    const before = await (await page.request.get(`${path}/map`)).json();
    expect(before.contentVersion).toBe(2);
    let readyId = '';
    let confirmations = 0;
    other.on('request', (request) => {
      if (request.method() === 'POST' && /\/imports\/[^/]+\/confirm$/.test(request.url()))
        confirmations++;
    });
    await page.route('**/imports', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const result = await response.json();
      expect(result).toMatchObject({ status: 'ready', contentVersion: 2 });
      readyId = result.id;
      await route.abort('failed');
    });
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles(file);
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(readyId).not.toBe('');
    const foreign = await administrator.newPage();
    await foreign.goto(administration);
    await expect(foreign.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await expect(foreign.getByText(readyId, { exact: true })).toHaveCount(0);
    await expect(foreign.getByRole('group', { name: 'Granska ersättningen' })).toHaveCount(0);
    expect((await administrator.request.get(`${path}/imports/${readyId}`)).status()).toBe(404);
    expect(
      (
        await administrator.request.post(`${path}/imports/${readyId}/confirm`, {
          headers,
          data: { confirmed: true, contentVersion: 2 },
        })
      ).status(),
    ).toBe(404);
    installation.setIdentity(alex);
    await signIn(other.request, installation.origin);
    const fresh = await other.newPage();
    await fresh.goto(administration);
    await expect(fresh.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    await expect(fresh.getByText(readyId, { exact: true })).toBeVisible();
    const replace = fresh.getByRole('button', { name: 'Ersätt hushållets innehåll' });
    await expect(replace).toBeDisabled();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    expect(confirmations).toBe(0);
    await fresh.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await replace.click();
    await expect(fresh.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    expect(confirmations).toBe(1);
    expect((await (await page.request.get(`${path}/map`)).json()).contentVersion).toBe(3);
  } finally {
    await administrator.close();
    await other.close();
    await installation.close();
  }
});

test('IMPORT-14: a locally known uncertain import keeps its exact identity after a newer replacement and a lost status response', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    await seedRecoveryContent(page.request, path);
    const initial = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'retained',
            version: initial.draft.version,
            baseRevision: null,
            value: {
              name: 'Privat arbete i båda ersättningarna',
              description: 'Privat uppgift för Privat arbete i båda ersättningarna',
              typeId: initial.types[0].id,
            },
          },
        })
      ).status(),
    ).toBe(200);
    const original = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const destination = `${installation.origin}/households/${household.id}/settings/import`;
    const file = { name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive };
    let confirmations = 0;
    let firstId = '';
    await page.route('**/imports/*/confirm', async (route) => {
      confirmations++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({ status: 'completed', contentVersion: 2 });
      firstId = result.id;
      await route.abort('failed');
    });
    await page.goto(destination);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles(file);
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    expect(firstId).not.toBe('');
    await signIn(other.request, installation.origin);
    const fresh = await other.newPage();
    other.on('request', (request) => {
      if (request.method() === 'POST' && /\/imports\/[^/]+\/confirm$/.test(request.url()))
        confirmations++;
    });
    await fresh.goto(destination);
    await expect(fresh.getByText(firstId, { exact: true })).toBeVisible();
    await fresh.getByLabel('Skyttel-export (ZIP)').setInputFiles(file);
    await fresh.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await fresh.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    const secondConfirmation = fresh.waitForResponse((response) =>
      /\/imports\/[^/]+\/confirm$/.test(response.url()),
    );
    await fresh.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    const second = await (await secondConfirmation).json();
    expect(second).toMatchObject({ status: 'completed', contentVersion: 3 });
    expect(second.id).not.toBe(firstId);
    await expect(fresh.getByText(second.id, { exact: true })).toBeVisible();
    await installation.restart();
    expect((await (await other.request.get(`${path}/imports`)).json()).attempt.id).toBe(second.id);
    let discoveries = 0;
    const readIds: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') return;
      if (request.url() === `${path}/imports`) discoveries++;
      if (request.url().startsWith(`${path}/imports/`)) readIds.push(request.url());
    });
    await page.reload();
    const importer = page.getByRole('region', { name: 'Återimportera hushållet', exact: true });
    await expect(importer.getByText(firstId, { exact: true })).toBeVisible();
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await page.route(
      `${path}/imports/${firstId}`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        expect(await response.json()).toMatchObject({
          id: firstId,
          status: 'completed',
          contentVersion: 2,
        });
        await route.abort('failed');
      },
      { times: 1 },
    );
    await importer.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(importer.getByRole('alert')).toBeVisible();
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await expect(importer.getByText(firstId, { exact: true })).toBeVisible();
    await expect(importer.getByText(second.id, { exact: true })).toHaveCount(0);
    await expect(importer.getByText(/Hushållets innehåll är ersatt/)).toHaveCount(0);
    await importer.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(importer.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await expect(importer.getByText(firstId, { exact: true })).toBeVisible();
    await expect(importer.getByText(second.id, { exact: true })).toHaveCount(0);
    expect(discoveries).toBe(0);
    expect(readIds).toEqual([`${path}/imports/${firstId}`, `${path}/imports/${firstId}`]);
    expect(confirmations).toBe(2);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      ...original,
      contentVersion: 3,
    });
    const reader = await page.context().newPage();
    await reader.goto(installation.origin);
    await expectRecoveryContent(reader);
    await expectRecoveryDraft(reader, 'Privat arbete i båda ersättningarna');
    await reader.close();
  } finally {
    await other.close();
    await installation.close();
  }
});
