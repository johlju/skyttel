import { expect, type Page } from '@playwright/test';

/** Returning from settings can compile a newly selected shader on CI. */
export async function waitForMapScene(page: Page) {
  await expect(
    page.getByRole('region', { name: 'Rymdkarta', exact: true }).locator('canvas'),
  ).toBeVisible({ timeout: 30_000 });
}
