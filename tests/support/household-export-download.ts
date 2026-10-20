import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { openSettings } from './client.js';

export async function downloadHouseholdExport(page: Page, path: string) {
  await openSettings(page);
  await page
    .locator('.settings-cards')
    .getByRole('link', { name: /^Fullständig export/ })
    .click();
  const section = page.getByRole('region', { name: 'Fullständig export' });
  const preparing = page.waitForResponse(
    (response) => response.url() === `${path}/exports` && response.request().method() === 'POST',
  );
  await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
  const prepared = await preparing;
  expect(prepared.status(), await prepared.text()).toBe(201);
  const ready = await prepared.json();
  const downloading = page.waitForResponse(`${path}/exports/${ready.id}`);
  const downloaded = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
  expect((await downloading).status()).toBe(200);
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe('skyttel-hushall.zip');
  const file = await download.path();
  if (!file) throw new Error('The household export must produce a downloaded ZIP file');
  return readFile(file);
}
