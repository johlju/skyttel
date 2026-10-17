import { createHousehold, openSettings, signIn } from '../support/client.js';
import {
  expectRecoveryContent,
  reloadRestoredHousehold,
} from '../support/household-recovery-reading.js';
import { createInstallation } from '../support/installation.js';
import { denyRecoveryStorage, restoreRecoveryStorage } from '../support/recovery-storage.js';
import { expect, test } from '../support/test.js';

test('IMPORT-01: an administrator reviews and explicitly replaces household content with the keyboard', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const state = await (await page.request.get(`${path}/map`)).json();
    const propose = (name: string, version: number, revision: number | null) =>
      page.request.post(`${path}/map/draft`, {
        headers,
        data: {
          id: 'lamp',
          version,
          baseRevision: revision,
          value: { typeId: state.types[0].id, name, description: '' },
        },
      });
    expect((await propose('Lampa från exporten', 0, null)).status()).toBe(200);
    expect(
      (
        await page.request.post(`${path}/map/save`, {
          headers,
          data: { version: 1, operationId: 'first' },
        })
      ).status(),
    ).toBe(200);
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    expect((await propose('Senare namn', 2, 1)).status()).toBe(200);
    expect(
      (
        await page.request.post(`${path}/map/save`, {
          headers,
          data: { version: 3, operationId: 'later' },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    await expect(page.getByRole('heading', { name: 'Återimportera hushållet' })).toBeVisible();
    await page
      .getByLabel('Skyttel-export (ZIP)')
      .setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Filen är kontrollerad.', { exact: false })).toBeVisible();
    const replace = page.getByRole('button', { name: 'Ersätt hushållets innehåll' });
    await expect(replace).toBeDisabled();
    expect((await (await page.request.get(`${path}/map`)).json()).objects[0].name).toBe(
      'Senare namn',
    );
    const reader = await page.context().newPage();
    await reader.goto(installation.origin);
    await expectRecoveryContent(reader, 'Senare namn', '');
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).focus();
    await page.keyboard.press('Space');
    await replace.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    const restored = await (await page.request.get(`${path}/map`)).json();
    expect(restored.contentVersion).toBe(2);
    expect(restored.objects[0].name).toBe('Lampa från exporten');
    await reloadRestoredHousehold(page);
    await expectRecoveryContent(page, 'Lampa från exporten', '');
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    await installation.restart();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Återimportera hushållet' })).toBeVisible();
    expect((await (await page.request.get(`${path}/map`)).json()).objects[0].name).toBe(
      'Lampa från exporten',
    );
    await reader.reload();
    await expectRecoveryContent(reader, 'Lampa från exporten', '');
    await openSettings(reader);
    await reader.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await expect(
      reader.getByRole('heading', { name: 'Administrera tillgång', exact: true }),
    ).toBeVisible();
    await expect(
      reader
        .getByRole('list', { name: 'Medlemmar', exact: true })
        .getByText('Administratör', { exact: true }),
    ).toBeVisible();
    await reader.close();
  } finally {
    await installation.close();
  }
});

test('IMPORT-21: unavailable recovery storage preserves the file, exact review and confirmed server result', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const read = async () => (await page.request.get(`${path}/map`)).json();
    const post = (suffix: string, data: unknown) =>
      page.request.post(`${path}/${suffix}`, { headers, data });
    let archive: Buffer = Buffer.alloc(0);
    for (const name of ['Lampan i exporten', 'Senare namn']) {
      const state = await read();
      expect(
        (
          await post('map/draft', {
            id: 'lamp',
            version: state.draft.version,
            baseRevision: state.objects[0]?.revision ?? null,
            value: { typeId: state.types[0].id, name, description: '' },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await post('map/save', {
            version: (await read()).draft.version,
            operationId: archive.length ? 'later' : 'exported',
          })
        ).status(),
      ).toBe(200);
      if (!archive.length) {
        const exported = await (await post('exports', {})).json();
        archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
      }
    }
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    const importer = page.getByRole('region', { name: 'Återimportera hushållet', exact: true });
    const file = importer.getByLabel('Skyttel-export (ZIP)');
    await expect(file).toBeEnabled();
    await file.setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
    let preparations = 0;
    const confirmations: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url() === `${path}/imports`) preparations += 1;
      if (request.url().endsWith('/confirm')) confirmations.push(request.url());
    });
    await denyRecoveryStorage(page, 'skyttel-import:', 'removeItem');
    const prepare = importer.getByRole('button', { name: 'Kontrollera importfil', exact: true });
    await prepare.click();
    await expect(importer.getByRole('alert')).toContainText('Webbläsarens återhämtningsminne');
    await expect(importer).toHaveAttribute('aria-busy', 'false');
    await expect(prepare).toBeEnabled();
    await expect(file).toHaveValue(/skyttel.zip$/);
    expect(preparations).toBe(0);
    expect(await read()).toEqual(before);
    const reader = await page.context().newPage();
    await reader.goto(installation.origin);
    await expectRecoveryContent(reader, 'Senare namn', '');
    await restoreRecoveryStorage(page);
    await denyRecoveryStorage(page, 'skyttel-import:', 'setItem');
    const prepared = page.waitForResponse(
      (response) => response.url() === `${path}/imports` && response.request().method() === 'POST',
    );
    await prepare.click();
    const ready = await (await prepared).json();
    expect(ready.status).toBe('ready');
    await expect(importer.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    await expect(importer.getByText(ready.id, { exact: true })).toBeVisible();
    await expect(importer.getByRole('alert')).toContainText('Webbläsarens återhämtningsminne');
    await expect(importer.getByRole('alert')).not.toContainText('Svaret från filkontrollen saknas');
    await importer
      .getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' })
      .check();
    const replace = importer.getByRole('button', {
      name: 'Ersätt hushållets innehåll',
      exact: true,
    });
    await replace.click();
    await expect(importer.getByRole('alert')).toContainText('Ingen ersättning har startats');
    expect(confirmations).toEqual([]);
    expect(await read()).toEqual(before);
    await reader.reload();
    await expectRecoveryContent(reader, 'Senare namn', '');
    const statusRead = page.waitForResponse(
      (response) => response.url() === `${path}/imports/${ready.id}`,
    );
    await importer.getByRole('button', { name: 'Hämta importens status', exact: true }).click();
    expect((await statusRead).status()).toBe(200);
    await expect(importer.getByText(ready.id, { exact: true })).toBeVisible();
    await expect(importer.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    await restoreRecoveryStorage(page);
    await denyRecoveryStorage(page, 'skyttel-import:', 'removeItem');
    await replace.click();
    await expect(
      importer.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(importer.getByRole('alert')).toContainText('Webbläsarens återhämtningsminne');
    await expect(importer.getByRole('alert')).not.toContainText('Utfallet är okänt');
    await expect(importer).toHaveAttribute('aria-busy', 'false');
    expect(confirmations).toEqual([`${path}/imports/${ready.id}/confirm`]);
    expect(preparations).toBe(1);
    const restored = await read();
    expect(restored.contentVersion).toBe(before.contentVersion + 1);
    expect(restored.objects[0].name).toBe('Lampan i exporten');
    await restoreRecoveryStorage(page);
    await importer.getByRole('button', { name: 'Hämta importens status', exact: true }).click();
    await expect(importer.getByRole('alert')).toHaveCount(0);
    await expect(
      importer.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(preparations).toBe(1);
    expect(confirmations).toHaveLength(1);
    await reloadRestoredHousehold(page);
    await expectRecoveryContent(page, 'Lampan i exporten', '');
    expect(preparations).toBe(1);
    expect(confirmations).toHaveLength(1);
    await reader.close();
  } finally {
    await installation.close();
  }
});
