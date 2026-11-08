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
    await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
      reference,
    );
    await expect(draft).toContainText('Lo Exempel');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
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
    await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).click();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page
        .getByLabel('Meddelande till Skyttel', { exact: true })
        .fill('Prova ett vanligt fel.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(notice).toContainText('Modellen är tillfälligt otillgänglig. Valet är kvar.');
      const calls = model.requests.length;
      await notice
        .getByRole('button', { name: 'Avstå från det oavslutade arbetet', exact: true })
        .click();
      await expect(notice).toHaveCount(0);
      expect(model.requests).toHaveLength(calls);
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
