import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

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
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
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
    await installation.restart();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Återimportera hushållet' })).toBeVisible();
    expect((await (await page.request.get(`${path}/map`)).json()).objects[0].name).toBe(
      'Lampa från exporten',
    );
  } finally {
    await installation.close();
  }
});
