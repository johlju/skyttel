import { readFile } from 'node:fs/promises';
import { type Download, expect, test } from '@playwright/test';
import { createInstallation } from '../support/installation.js';

async function contents(download: Download) {
  expect(download.suggestedFilename()).toBe('skyttel-lagringssamtycke.json');
  const path = await download.path();
  if (!path) throw new Error('The browser did not provide the downloaded file');
  return JSON.parse(await readFile(path, 'utf8'));
}

test('KAK-43: cookie data export contains the saved consent and public register while unsaved choices and unrelated storage stay unchanged', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${installation.origin}/cookies`);
    const button = page.getByRole('button', { name: 'Exportera data', exact: true });
    await expect(button).toBeVisible();
    const firstDownload = page.waitForEvent('download');
    await button.click();
    expect((await contents(await firstDownload)).consent).toBeNull();
    await page.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    await page.getByRole('button', { name: 'Spara Preferenser', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Dina lagringspreferenser är sparade.');
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('skyttel-storage-consent') ?? 'null'),
    );
    await page.evaluate(() => {
      const consent = JSON.parse(localStorage.getItem('skyttel-storage-consent') ?? 'null');
      localStorage.setItem(
        'skyttel-storage-consent',
        JSON.stringify({
          ...consent,
          unrelatedExportField: 'private-consent-extra',
        }),
      );
      localStorage.setItem('unrelated-setting', 'unrelated-private-value');
      sessionStorage.setItem('skyttel-import:example', 'private-recovery-reference');
    });
    const storageBefore = await page.evaluate(() => ({
      local: { ...localStorage },
      tab: { ...sessionStorage },
    }));
    await page.getByRole('button', { name: 'Endast nödvändiga', exact: true }).click();
    const choice = page.getByRole('switch', { name: 'Preferenskakor', exact: true });
    await expect(choice).not.toBeChecked();
    await button.focus();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const exported = await contents(await download);
    expect(exported.consent).toEqual(saved);
    expect(exported.consent.preferences).toBe(true);
    expect(exported.schemaVersion).toBe(1);
    expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true);
    expect(exported.policyPublishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(exported.storageRegister.provider).toBe('Skyttel');
    expect(exported.storageRegister.necessary).toHaveLength(8);
    expect(exported.storageRegister.preferences).toHaveLength(2);
    expect(exported.storageRegister.browserDetails).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '__Host-skyttel_binding' })]),
    );
    expect(exported.storageRegister.server).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'storage_action_result' })]),
    );
    expect(JSON.stringify(exported)).not.toMatch(
      /unrelated-private-value|private-recovery-reference|private-consent-extra/,
    );
    expect(
      await page.evaluate(() => ({ local: { ...localStorage }, tab: { ...sessionStorage } })),
    ).toEqual(storageBefore);
    await expect(choice).not.toBeChecked();
    await expect(button).toBeFocused();
    await expect(page.locator('a[download]')).toHaveCount(0);
    expect(
      await page
        .locator('article.cookie-storage')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const reset = page.getByRole('button', { name: 'Återställ samtycke', exact: true });
    await expect(reset.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  } finally {
    await installation.close();
  }
});

test('KAK-44: a failed cookie export explains the failure and can be retried without changing consent', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.goto(`${installation.origin}/cookies`);
    await page.getByRole('button', { name: 'Endast nödvändiga', exact: true }).click();
    await page.getByRole('button', { name: 'Spara Preferenser', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Dina lagringspreferenser är sparade.');
    const saved = await page.evaluate(() => localStorage.getItem('skyttel-storage-consent'));
    await page.evaluate(() => {
      const create = URL.createObjectURL;
      let fail = true;
      URL.createObjectURL = function (blob) {
        if (fail) {
          fail = false;
          throw new DOMException('Synthetic blocked export', 'SecurityError');
        }
        return create.call(this, blob);
      };
    });
    const button = page.getByRole('button', { name: 'Exportera data', exact: true });
    await button.click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Uppgifterna kunde inte exporteras. Försök igen.' }),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('skyttel-storage-consent'))).toBe(saved);
    await expect(button).toBeFocused();
    const download = page.waitForEvent('download');
    await button.click();
    expect((await contents(await download)).consent).toEqual(JSON.parse(saved ?? 'null'));
    await expect(
      page.getByText('Uppgifterna kunde inte exporteras. Försök igen.', { exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('skyttel-storage-consent'))).toBe(saved);
  } finally {
    await installation.close();
  }
});
