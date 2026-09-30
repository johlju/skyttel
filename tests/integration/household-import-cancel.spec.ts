import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createHousehold, openSettings, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function prepareReview(page: Page, path: string, archive: Buffer) {
  await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
    name: 'skyttel.zip',
    mimeType: 'application/zip',
    buffer: archive,
  });
  const preparing = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url() === `${path}/imports`,
  );
  await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
  const response = await preparing;
  expect(response.status()).toBe(201);
  const ready = await response.json();
  expect(ready.status).toBe('ready');
  await expect(page.getByText(ready.id, { exact: true })).toBeVisible();
  return ready;
}

test('IMPORT-16: an administrator explicitly cancels only an unconfirmed preparation and removes its staged archive', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const initial = await (await page.request.get(`${path}/map`)).json();
    const value = { name: 'Exportens namn', description: '', typeId: initial.types[0].id };
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: { id: 'cancel-object', version: 0, baseRevision: null, value },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${path}/map/save`, {
          headers,
          data: { version: 1, operationId: 'cancel-before-export' },
        })
      ).status(),
    ).toBe(200);
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const saved = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'cancel-object',
            version: saved.draft.version,
            baseRevision: saved.objects[0].revision,
            value: { ...value, name: 'Senare namn' },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${path}/map/save`, {
          headers,
          data: { version: saved.draft.version + 1, operationId: 'cancel-after-export' },
        })
      ).status(),
    ).toBe(200);
    const changed = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'cancel-private',
            version: changed.draft.version,
            baseRevision: null,
            value: { ...value, name: 'Privat arbete efter exporten' },
          },
        })
      ).status(),
    ).toBe(200);
    const before = await (await page.request.get(`${path}/map`)).json();
    expect(before.objects).toEqual([expect.objectContaining({ name: 'Senare namn' })]);
    expect(before.draft.changes).toHaveLength(1);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const unsent = page.getByLabel('Objektets namn');
    await unsent.fill('Oskickat arbete under avbrottet');
    await openSettings(page);
    await page.getByRole('link', { name: 'Återimportera hushållet', exact: true }).click();
    const importer = page.getByRole('region', { name: 'Återimportera hushållet', exact: true });
    const file = importer.getByLabel('Skyttel-export (ZIP)');
    await file.setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
    const prepared = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url() === `${path}/imports`,
    );
    await importer.getByRole('button', { name: 'Kontrollera importfil' }).click();
    const ready = await (await prepared).json();
    expect(ready.status).toBe('ready');
    const staged = join(installation.directory, '.skyttel-imports', ready.id);
    expect(existsSync(staged)).toBe(true);
    const cancel = importer.getByRole('button', { name: 'Avbryt förberedelsen', exact: true });
    await expect(cancel).toBeVisible();
    await expect(
      importer.getByRole('button', { name: 'Ersätt hushållets innehåll' }),
    ).toBeDisabled();
    const cancelled = page.waitForResponse(
      (response) => response.url() === `${path}/imports/${ready.id}/cancel`,
    );
    await cancel.focus();
    await page.keyboard.press('Enter');
    expect((await cancelled).status()).toBe(200);
    await expect(importer.getByRole('status')).toContainText('Förberedelsen är avbruten');
    await expect(file).toBeFocused();
    await expect(file).toBeEnabled();
    await expect(importer.getByRole('group', { name: 'Granska ersättningen' })).toHaveCount(0);
    expect(existsSync(staged)).toBe(false);
    expect(await (await page.request.get(`${path}/imports`)).json()).toEqual({
      attempt: null,
      ready: null,
    });
    expect((await page.request.get(`${path}/imports/${ready.id}`)).status()).toBe(404);
    expect(
      (
        await page.request.post(`${path}/imports/${ready.id}/confirm`, {
          headers,
          data: { confirmed: true, contentVersion: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(unsent).toHaveValue('Oskickat arbete under avbrottet');
    await openSettings(page);
    await page.getByRole('link', { name: 'Återimportera hushållet', exact: true }).click();
    await page.reload();
    await expect(importer.getByRole('group', { name: 'Granska ersättningen' })).toHaveCount(0);
    await expect(file).toBeEnabled();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('IMPORT-18: a fresh administrator client can find cancelled files even when another review is ready', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  let directory = '';
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const before = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, {
        headers: { origin: installation.origin },
        data: {},
      })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const destination = `${installation.origin}/households/${household.id}/settings/import`;
    await page.goto(destination);
    const first = await prepareReview(page, path, archive);
    await signIn(other.request, installation.origin);
    const second = await other.newPage();
    await second.goto(destination);
    await expect(second.getByText(first.id, { exact: true })).toBeVisible();
    const newer = await prepareReview(second, path, archive);
    expect(newer.id).not.toBe(first.id);
    directory = join(installation.directory, '.skyttel-imports', first.id);
    chmodSync(directory, 0o500);
    await page.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
    await expect(page.getByText(/Förberedelsen kan inte längre användas/)).toBeVisible();
    expect(existsSync(directory)).toBe(true);
    const fresh = await other.newPage();
    await fresh.goto(destination);
    await expect(fresh.getByText(first.id, { exact: true })).toBeVisible();
    const cleanup = fresh.getByRole('button', { name: 'Slutför förberedelsens rensning' });
    await expect(cleanup).toBeVisible();
    await expect(fresh.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    chmodSync(directory, 0o700);
    await cleanup.click();
    await expect(fresh.getByText(/Förberedelsen är avbruten/)).toBeVisible();
    expect(existsSync(directory)).toBe(false);
    await fresh.reload();
    await expect(fresh.getByText(newer.id, { exact: true })).toBeVisible();
    await expect(fresh.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    await expect(
      fresh.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }),
    ).not.toBeChecked();
    await fresh.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
    await expect(fresh.getByText(/Förberedelsen är avbruten/)).toBeVisible();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
  } finally {
    if (directory && existsSync(directory)) chmodSync(directory, 0o700);
    await other.close();
    await installation.close();
  }
});

test('IMPORT-19: a retired cancellation response cannot forget a newer preparation after Settings navigation', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const before = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, {
        headers: { origin: installation.origin },
        data: {},
      })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const destination = `${installation.origin}/households/${household.id}/settings/import`;
    await page.goto(destination);
    const first = await prepareReview(page, path, archive);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let completed = () => {};
    const serverCompleted = new Promise<void>((resolve) => {
      completed = resolve;
    });
    let delivered = () => {};
    const responseDelivered = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    await page.route(`${path}/imports/${first.id}/cancel`, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ cancelled: true });
      completed();
      await held;
      await route.fulfill({ response });
      delivered();
    });
    const cancelling = page.waitForRequest(`${path}/imports/${first.id}/cancel`);
    await page.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
    const retiredRequest = await cancelling;
    await serverCompleted;
    expect(existsSync(join(installation.directory, '.skyttel-imports', first.id))).toBe(false);
    const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
    await navigation.getByRole('link', { name: 'Koppla historiskt innehåll', exact: true }).click();
    await navigation.getByRole('link', { name: 'Återimportera hushållet', exact: true }).click();
    await page.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(page.getByRole('alert')).toContainText('finns inte längre');
    const newer = await prepareReview(page, path, archive);
    expect(newer.id).not.toBe(first.id);
    release();
    await responseDelivered;
    await (await retiredRequest.response())?.finished();
    await expect(page.getByText(newer.id, { exact: true })).toBeVisible();
    let discoveries = 0;
    const readIds: string[] = [];
    page.on('request', (request) => {
      if (request.url() === `${path}/imports`) discoveries++;
      if (request.method() === 'GET' && request.url().startsWith(`${path}/imports/`))
        readIds.push(request.url());
    });
    await page.reload();
    await expect(page.getByText(newer.id, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await page.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(page.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    expect(discoveries).toBe(0);
    expect(readIds).toEqual([`${path}/imports/${newer.id}`]);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    await page.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
    await expect(page.getByText(/Förberedelsen är avbruten/)).toBeVisible();
  } finally {
    release();
    await installation.close();
  }
});

test('IMPORT-20: a retired unavailable status response cannot forget a newer preparation after Settings navigation', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const before = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, {
        headers: { origin: installation.origin },
        data: {},
      })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    const first = await prepareReview(page, path, archive);
    // Another current administrator client cancels this same unconfirmed preparation.
    const cancelled = await page.request.post(`${path}/imports/${first.id}/cancel`, {
      headers: { origin: installation.origin },
      data: {},
    });
    expect(cancelled.status()).toBe(200);
    expect(await cancelled.json()).toEqual({ cancelled: true });
    expect(existsSync(join(installation.directory, '.skyttel-imports', first.id))).toBe(false);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let completed = () => {};
    const serverCompleted = new Promise<void>((resolve) => {
      completed = resolve;
    });
    let delivered = () => {};
    const responseDelivered = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    await page.route(
      `${path}/imports/${first.id}`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(404);
        expect(await response.json()).toEqual({ error: 'import_unavailable' });
        completed();
        await held;
        await route.fulfill({ response });
        delivered();
      },
      { times: 1 },
    );
    const reading = page.waitForRequest(`${path}/imports/${first.id}`);
    await page.getByRole('button', { name: 'Hämta importens status' }).click();
    const retiredRequest = await reading;
    await serverCompleted;
    const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
    await navigation.getByRole('link', { name: 'Koppla historiskt innehåll', exact: true }).click();
    await navigation.getByRole('link', { name: 'Återimportera hushållet', exact: true }).click();
    await page.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(page.getByRole('alert')).toContainText('finns inte längre');
    const newer = await prepareReview(page, path, archive);
    expect(newer.id).not.toBe(first.id);
    release();
    await responseDelivered;
    await (await retiredRequest.response())?.finished();
    let discoveries = 0;
    const readIds: string[] = [];
    page.on('request', (request) => {
      if (request.url() === `${path}/imports`) discoveries++;
      if (request.method() === 'GET' && request.url().startsWith(`${path}/imports/`))
        readIds.push(request.url());
    });
    await page.reload();
    await expect(page.getByText(newer.id, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await page.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(page.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    expect(discoveries).toBe(0);
    expect(readIds).toEqual([`${path}/imports/${newer.id}`]);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    await page.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
    await expect(page.getByText(/Förberedelsen är avbruten/)).toBeVisible();
  } finally {
    release();
    await installation.close();
  }
});

test('IMPORT-17: failed cancellation cleanup and a lost success remain bound to the same unconfirmed preparation', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  let directory = '';
  const freshContext = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const initial = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'cleanup-private',
            version: 0,
            baseRevision: null,
            value: { name: 'Privat under avbrottet', description: '', typeId: initial.types[0].id },
          },
        })
      ).status(),
    ).toBe(200);
    const before = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    const destination = `${installation.origin}/households/${household.id}/settings/import`;
    await page.goto(destination);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    const preparing = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url() === `${path}/imports`,
    );
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    const ready = await (await preparing).json();
    expect(ready.status).toBe('ready');
    directory = join(installation.directory, '.skyttel-imports', ready.id);
    chmodSync(directory, 0o500);
    const cancelling = page.waitForResponse(`${path}/imports/${ready.id}/cancel`);
    await page.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
    expect(await (await cancelling).json()).toMatchObject({
      id: ready.id,
      status: 'cancel-cleanup',
      contentVersion: 1,
    });
    await expect(page.getByText(/Förberedelsen kan inte längre användas/)).toBeVisible();
    await expect(page.getByText(/Förberedelsen är avbruten/)).toHaveCount(0);
    expect(existsSync(directory)).toBe(true);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    expect(
      (
        await page.request.post(`${path}/imports/${ready.id}/confirm`, {
          headers,
          data: { confirmed: true, contentVersion: 1 },
        })
      ).status(),
    ).toBe(409);
    await signIn(freshContext.request, installation.origin);
    const fresh = await freshContext.newPage();
    await fresh.goto(destination);
    const importer = fresh.getByRole('region', { name: 'Återimportera hushållet', exact: true });
    await expect(importer.getByText(ready.id, { exact: true })).toBeVisible();
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await expect(importer.getByRole('button', { name: 'Ersätt hushållets innehåll' })).toHaveCount(
      0,
    );
    await expect(
      importer.getByRole('button', { name: 'Slutför förberedelsens rensning' }),
    ).toBeVisible();
    chmodSync(directory, 0o700);
    let cancelledRequests = 0;
    await fresh.route(`${path}/imports/${ready.id}/cancel`, async (route) => {
      cancelledRequests++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ cancelled: true });
      await route.abort('failed');
    });
    await importer.getByRole('button', { name: 'Slutför förberedelsens rensning' }).click();
    await expect(importer.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await expect(importer.getByText(/Förberedelsen är avbruten/)).toHaveCount(0);
    expect(existsSync(directory)).toBe(false);
    let reads = 0;
    let discoveries = 0;
    fresh.on('request', (request) => {
      if (request.url() === `${path}/imports`) discoveries++;
    });
    await fresh.route(`${path}/imports/${ready.id}`, async (route) => {
      reads++;
      if (reads === 1) await route.abort('failed');
      else await route.continue();
    });
    await importer.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(importer.getByRole('alert')).toBeVisible();
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeDisabled();
    await expect(importer.getByText(ready.id, { exact: true })).toBeVisible();
    await importer.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(importer.getByRole('alert')).toContainText('finns inte längre');
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeEnabled();
    await expect(importer.getByText(/Förberedelsen är avbruten/)).toHaveCount(0);
    expect(reads).toBe(2);
    expect(discoveries).toBe(0);
    expect(cancelledRequests).toBe(1);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    await installation.restart();
    await fresh.reload();
    await expect(importer.getByLabel('Skyttel-export (ZIP)')).toBeEnabled();
    await expect(
      importer.getByRole('button', { name: 'Slutför förberedelsens rensning' }),
    ).toHaveCount(0);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
  } finally {
    if (directory && existsSync(directory)) chmodSync(directory, 0o700);
    await freshContext.close();
    await installation.close();
  }
});
