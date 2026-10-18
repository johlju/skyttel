import { type Browser, type BrowserContext, test as base, expect } from '@playwright/test';
import { pageDiagnostics } from './page-diagnostics.js';

/** Unrelated workflows start with the browser's already saved necessary-only
 * choice. Consent and login-offer scenarios use Playwright's unprepared test. */
export async function prepareStorageChoice(context: BrowserContext, preferences = false) {
  await context.addInitScript((allowed) => {
    if (!localStorage.getItem('skyttel-storage-consent'))
      localStorage.setItem(
        'skyttel-storage-consent',
        JSON.stringify({
          schemaVersion: 1,
          informationVersion: 1,
          preferences: allowed,
          decidedAt: Date.now(),
        }),
      );
  }, preferences);
}

export async function createPreparedContext(
  browser: Browser,
  options?: Parameters<Browser['newContext']>[0],
  preferences = false,
) {
  const context = await browser.newContext(options);
  await prepareStorageChoice(context, preferences);
  return context;
}

export const test = base.extend<{ storagePreferences: boolean }>({
  storagePreferences: [false, { option: true }],
  page: async ({ page }, use, info) => {
    let finish: Awaited<ReturnType<typeof pageDiagnostics>> = async () => {};
    try {
      finish = await pageDiagnostics(page);
    } catch (error) {
      console.error('Could not start browser diagnostics:', error);
    }
    try {
      await use(page);
    } finally {
      try {
        await finish(info);
      } catch (error) {
        console.error('Could not retain browser diagnostics:', error);
      }
    }
  },
  context: async ({ context, storagePreferences }, use) => {
    await prepareStorageChoice(context, storagePreferences);
    await use(context);
  },
});
export { expect };
