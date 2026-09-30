import { expect, test } from '@playwright/test';
import { createHousehold, openSettings, openWorkspace, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('IMPORT-12: protected Settings recovery pages preserve ordinary work and retire it after replacement', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const initial = await (await page.request.get(`${path}/map`)).json();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers: { origin: installation.origin },
          data: {
            id: 'retained-private',
            version: initial.draft.version,
            baseRevision: null,
            value: { name: 'Redan privat arbete', description: '', typeId: initial.types[0].id },
          },
        })
      ).status(),
    ).toBe(200);
    const before = await (await page.request.get(`${path}/map`)).json();
    const exported = await (
      await page.request.post(`${path}/exports`, {
        headers: { origin: installation.origin },
        data: {},
      })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const name = page.getByLabel('Objektets namn');
    await name.fill('Oskickat arbete före återimport');
    await name.focus();
    await openSettings(page);
    const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
    await expect(
      navigation.getByRole('link', { name: 'Återimportera hushållet', exact: true }),
    ).toBeVisible();
    await navigation.getByRole('link', { name: 'Återimportera hushållet', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings\/import$/);
    const importer = page.getByRole('region', { name: 'Återimportera hushållet', exact: true });
    await expect(
      importer.getByRole('heading', { name: 'Återimportera hushållet', level: 1 }),
    ).toBeFocused();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).not.toBeVisible();
    await expect(name).not.toBeVisible();
    await importer.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await importer.getByRole('button', { name: 'Kontrollera importfil' }).focus();
    await page.keyboard.press('Enter');
    await expect(importer.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    await expect(importer.getByRole('heading', { name: 'Ersätts', exact: true })).toBeVisible();
    await expect(importer.getByRole('heading', { name: 'Behålls', exact: true })).toBeVisible();
    await expect(
      importer.getByRole('button', { name: 'Ersätt hushållets innehåll' }),
    ).toBeDisabled();
    await navigation.getByRole('link', { name: 'Koppla historiskt innehåll', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/content-owners$/);
    const owners = page.getByRole('region', { name: 'Koppla historiskt innehåll', exact: true });
    await expect(owners.getByRole('heading', { level: 1 })).toBeFocused();
    await owners.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' }).click();
    await expect(owners.getByLabel('Historisk innehållsidentitet')).toBeVisible();
    await expect(owners).toContainText('samma namn eller e-postadress är inget bevis');
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(name).toHaveValue('Oskickat arbete före återimport');
    await expect(name).toBeFocused();
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual(before);
    await openSettings(page);
    await navigation.getByRole('link', { name: 'Återimportera hushållet', exact: true }).click();
    await importer.getByRole('button', { name: 'Hämta importens status' }).click();
    await importer
      .getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' })
      .focus();
    await page.keyboard.press('Space');
    await importer.getByRole('button', { name: 'Ersätt hushållets innehåll' }).focus();
    await page.keyboard.press('Enter');
    await expect(importer.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await expect(
      importer.getByRole('button', { name: 'Läs in det återställda hushållet' }),
    ).toBeFocused();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(name).toHaveCount(0);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      ...before,
      contentVersion: 2,
    });
  } finally {
    await installation.close();
  }
});

test('IMPORT-13: import and identity Settings destinations enforce current household administrator access', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const { user: administrator } = await (
      await page.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const guest = await other.newPage();
    await guest.goto(`${installation.origin}/households/${household.id}/settings/import`);
    await expect(guest.getByLabel('Skyttel-export (ZIP)')).toHaveCount(0);
    await expect(guest.getByRole('button', { name: /Fortsätt med Google/ })).toBeVisible();
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin, 'microsoft');
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    await guest.goto(`${installation.origin}/households/${household.id}/settings/content-owners`);
    await expect(
      guest.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' }),
    ).toHaveCount(0);
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
    for (const destination of ['import', 'content-owners']) {
      await guest.goto(`${installation.origin}/households/${household.id}/settings/${destination}`);
      await expect(
        guest.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
      ).toBeVisible();
      await expect(guest.getByLabel('Skyttel-export (ZIP)')).toHaveCount(0);
      await expect(
        guest.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' }),
      ).toHaveCount(0);
      await page.goto(`${installation.origin}/households/wrong/settings/${destination}`);
      await expect(
        page.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
      ).toBeVisible();
    }
    expect(
      (
        await page.request.post(`${path}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    await expect(page.getByLabel('Skyttel-export (ZIP)')).toBeEnabled();
    await guest.bringToFront();
    expect(
      (
        await other.request.post(`${path}/members/${administrator.id}/role`, {
          headers,
          data: { role: 'member' },
        })
      ).status(),
    ).toBe(200);
    const refreshedAccess = page.waitForResponse(
      (response) => response.url().endsWith('/api/bootstrap') && response.status() === 200,
    );
    await page.bringToFront();
    expect((await (await refreshedAccess).json()).household.role).toBe('member');
    await expect(
      page.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeVisible();
    await expect(page.getByLabel('Skyttel-export (ZIP)')).toHaveCount(0);
    expect((await page.request.get(`${path}/imports`)).status()).toBe(403);
  } finally {
    await other.close();
    await installation.close();
  }
});
