import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { microphoneButton, startConversationWithText } from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { lastToolResult, modelTool, textModel } from '../support/text-model.js';

const checking = 'Det är oklart om utkastet sparades. Skyttel kontrollerar det.';
const saved = 'Kontrollen visar att hela utkastet sparades. Ändringarna finns i hushållets karta.';
const notice = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Samtalsnotis', exact: true });

test('SPARKONTROLL-01: ett tappat sparbesked kontrolleras automatiskt före nytt arbete och förklaras en gång', async ({
  page,
}) => {
  const model = textModel((request) => {
    if (!lastToolResult(request))
      return [
        modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'checked-save' }),
      ];
    return [];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  let release!: () => void;
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: 0,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
      },
    });
    await page.goto(app.origin);
    await startConversationWithText(page);
    let lost = false;
    await page.route('**/text-assistant/*', async (route) => {
      const response = await route.fetch();
      const result = await response.json();
      if (!lost && result.receipt) {
        lost = true;
        await route.abort();
      } else await route.fulfill({ response });
    });
    await page.route('**/text-assistant/*/recover', async (route) => {
      const response = await route.fetch();
      if ((await response.json()).phase !== 'working')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await route.fulfill({ response });
    });
    await page.getByLabel('Meddelande till Skyttel').fill('Spara hela utkastet.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice(page)).toContainText(checking);
    await page.getByLabel('Meddelande till Skyttel').fill('Nästa uppdrag');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    await expect(microphoneButton(page)).toBeDisabled();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(
      page.getByRole('button', { name: 'Kontrollera om utkastet sparades', exact: true }),
    ).toHaveCount(0);
    await expect.poll(() => typeof release).toBe('function');
    release();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(saved);
    await expect(
      page
        .getByRole('log', { name: 'Samtalstext' })
        .getByRole('listitem')
        .filter({ hasText: saved }),
    ).toHaveCount(1);
    await expect(notice(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled();
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
  } finally {
    release?.();
    await app.close();
  }
});
