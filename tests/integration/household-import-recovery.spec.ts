import { createHousehold, signIn } from '../support/client.js';
import {
  expectRecoveryContent,
  reloadRestoredHousehold,
  seedRecoveryContent,
} from '../support/household-recovery-reading.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('IMPORT-08: an unavailable prepared archive allows fresh review after restart without changing content', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    await seedRecoveryContent(page.request, path, 'Senare namn');
    const before = await (await page.request.get(`${path}/map`)).json();
    const exported = await page.request.post(`${path}/exports`, { headers, data: {} });
    expect(exported.status()).toBe(201);
    const archive = await (
      await page.request.get(`${path}/exports/${(await exported.json()).id}`)
    ).body();
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    const input = page.getByLabel('Skyttel-export (ZIP)');
    const file = { name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive };
    await input.setInputFiles(file);
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(page.getByText('Filen är kontrollerad.', { exact: false })).toBeVisible();
    await installation.restart();
    await page.reload();
    await expect(input).toBeDisabled();
    await page.getByRole('button', { name: 'Hämta importens status' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(input).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Hämta importens status' })).toHaveCount(0);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    const reader = await page.context().newPage();
    await reader.goto(installation.origin);
    await expectRecoveryContent(reader, 'Senare namn');
    await reader.close();
    await input.setInputFiles(file);
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    const replace = page.getByRole('button', { name: 'Ersätt hushållets innehåll' });
    await expect(replace).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await replace.click();
    await expect(page.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    expect((await (await page.request.get(`${path}/map`)).json()).contentVersion).toBe(2);
    await reloadRestoredHousehold(page);
    await expectRecoveryContent(page, 'Senare namn');
  } finally {
    await installation.close();
  }
});
