import { createHousehold, signIn } from '../support/client.js';
import {
  microphoneButton,
  openConversationDraft,
  startConversationWithText,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { expect, test } from '../support/test.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

test('TEXT-SCOPE-01: stoppad åtgärd visar felreferens och behåller utkastet', async ({ page }) => {
  const model = textModel(
    (input) => {
      const current = JSON.parse(
        String(input.input.findLast((item) => item.role === 'user')?.content),
      );
      if (current.message === 'Mitt nästa uppdrag') return [modelMessage('Ett nytt svar.')];
      if (current.message === 'Prova ett vanligt fel.')
        throw new Error('controlled_worker_failure');
      return [
        modelTool('discard_draft', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
        }),
      ];
    },
    () => [modelMessage('{"mode":"read","request":"Summarize only."}')],
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(mapPath)).json();
    await page.request.post(`${mapPath}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: 0,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { name: 'Lo Exempel', typeId: state.types[0].id, properties: [] },
      },
    });
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    const draft = await openConversationDraft(page);
    await expect(draft).toContainText('Lo Exempel');
    await page
      .getByLabel('Meddelande till Skyttel', { exact: true })
      .fill('Sammanfatta kartan. Ändra ingenting.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await expect(notice).toContainText('Skyttel stoppade en åtgärd utanför din begäran.');
    await expect(notice).toContainText(/Felreferens: [a-f0-9-]{36}/);
    const reference = (await notice.textContent())?.match(/Felreferens: ([a-f0-9-]{36})/)?.[1];
    if (!reference) throw new Error('Missing security reference');
    const transcript = page.getByRole('log', { name: 'Samtalstext', exact: true });
    await expect(transcript).not.toContainText(reference);
    const copyBox = await notice.getByRole('button', { name: 'Kopiera felrapport' }).boundingBox();
    const closeBox = await notice.getByRole('button', { name: 'Stäng notisen' }).boundingBox();
    const textBox = await notice.locator('.conversation-diagnostic-text').boundingBox();
    if (!copyBox || !closeBox || !textBox) throw new Error('Missing notice controls');
    expect(textBox.x + textBox.width).toBeLessThanOrEqual(copyBox.x);
    expect(copyBox.x + copyBox.width).toBeLessThanOrEqual(closeBox.x);
    expect(copyBox.y).toBe(closeBox.y);
    await expect(notice.locator('[data-diagnostic-report]')).not.toBeVisible();
    await notice.getByText('Läs mer', { exact: true }).click();
    const report = notice.locator('[data-diagnostic-report]');
    await expect(report).toContainText(reference);
    await expect(report).toContainText(/Sammanfatta kartan\. Ändra ingenting\./);
    await expect(report).toContainText(/Uppdrags-ID:/);
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    await page.getByLabel('Meddelande till Skyttel', { exact: true }).fill('Oskickad text.');
    await notice.getByRole('button', { name: 'Kopiera felrapport', exact: true }).click();
    await expect(notice.getByRole('status')).toHaveText('Felrapporten är kopierad.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await report.textContent(),
    );
    await expect(report).not.toContainText(/Oskickad text\./);
    expect((await report.textContent())?.split('Skyttel stoppade en åtgärd').length).toBe(2);
    await expect(notice.locator('textarea')).toHaveCount(0);
    await notice.getByRole('button', { name: 'Visa mindre', exact: true }).click();
    await expect(report).toHaveCount(0);
    await expect(notice.getByRole('button', { name: 'Läs mer', exact: true })).toBeFocused();
    await expect(draft).toContainText('Lo Exempel');
    await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).click();
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
    for (let attempt = 0; attempt < 2; attempt++) {
      await microphoneButton(page).click();
      await expect(notice).toContainText('Webbläsaren tillåter inte mikrofonen.');
      await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).click();
      await expect(notice).toHaveCount(0);
    }
    await page
      .getByLabel('Meddelande till Skyttel', { exact: true })
      .fill('Sammanfatta kartan igen. Ändra ingenting.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice).toContainText('Skyttel stoppade en åtgärd utanför din begäran.');
    await expect(notice).not.toContainText(reference);
    await expect(notice.getByRole('status')).toBeEmpty();
    await expect(notice.locator('[data-diagnostic-report]')).not.toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async () => {
          throw new DOMException('Synthetic clipboard denial', 'NotAllowedError');
        },
      });
    });
    await notice.getByRole('button', { name: 'Kopiera felrapport', exact: true }).click();
    await expect(notice.getByRole('status')).toContainText('Kunde inte kopiera.');
    await expect(report).toBeVisible();
    await expect(report).toContainText(/Sammanfatta kartan igen\. Ändra ingenting\./);
    await expect(report).not.toContainText(reference);
    await expect(transcript).not.toContainText('Skyttel stoppade en åtgärd');
    await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).click();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page
        .getByLabel('Meddelande till Skyttel', { exact: true })
        .fill('Prova ett vanligt fel.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(notice).toContainText('Modellen är tillfälligt otillgänglig. Valet är kvar.');
      await expect(notice).toContainText('Prova ett vanligt fel.');
      const calls = model.requests.length;
      await notice
        .getByRole('button', { name: 'Avstå från det oavslutade arbetet', exact: true })
        .click();
      await expect(notice).toHaveCount(0);
      expect(model.requests).toHaveLength(calls);
      await expect(draft).toContainText('Lo Exempel');
    }
    await page.getByLabel('Meddelande till Skyttel', { exact: true }).fill('Mitt nästa uppdrag');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
      'Ett nytt svar.',
    );
    await expect(notice).toHaveCount(0);
  } finally {
    await app.close();
  }
});
