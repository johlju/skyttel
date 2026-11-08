import { createHousehold, openProfile, signIn } from '../support/client.js';
import {
  openConversationDraft,
  openConversationText,
  startConversationWithText,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';
import { readVoiceProposal } from '../support/voice-work-reading.js';

test('KONTEXT-24: omladdning bevarar pausat samtal och avslut lämnar utkastet', async ({
  page,
}) => {
  const instruction = 'Byt cykelns namn till Blå, men ändra inte ägaren.';
  const queuedInstruction = 'Förklara vem som använder cykeln, men ändra eller spara ingenting.';
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  let turn = 0;
  const model = textModel(() =>
    turn++
      ? held
      : [
          modelTool('ask_questions', {
            questions: [
              {
                kind: 'change',
                request: instruction,
                question: 'Vilken cykel?',
                dependsOnDraft: true,
              },
            ],
          }),
        ],
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await signIn(page.request, app.origin);
    const { household } = await (
      await createHousehold(page.request, app.origin, 'Kontextprov')
    ).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(map)).json();
    await page.request.post(`${map}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo Exempel' },
      },
    });
    await page.goto(app.origin);
    await startConversationWithText(page);
    const text = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const log = text.getByRole('log', { name: 'Samtalstext' });
    await text.getByRole('button', { name: /^Modell och resonemang:/ }).click();
    const reasoning = page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await reasoning.getByRole('button', { name: 'Låg', exact: true }).click();
    await expect(reasoning.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Låg');
    await reasoning.getByRole('button', { name: 'GPT-6.1 Terra', exact: true }).click();
    const models = page.getByRole('dialog', { name: 'Modellval', exact: true });
    await models.getByRole('radio', { name: 'GPT-6.1 Sol', exact: true }).click();
    await expect(models.getByRole('status')).toContainText('Valet är sparat');
    await page.keyboard.press('Escape');
    await text.getByRole('textbox', { name: 'Meddelande till Skyttel' }).fill(instruction);
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(log).toContainText('Vilken cykel?');
    await text
      .getByRole('textbox', { name: 'Meddelande till Skyttel' })
      .fill('Beskriv garaget utan att ändra.');
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => model.requests.length).toBe(2);
    await text.getByRole('textbox', { name: 'Meddelande till Skyttel' }).fill(queuedInstruction);
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(text.getByRole('textbox', { name: 'Meddelande till Skyttel' })).toHaveValue('');
    await page.reload();
    await openConversationText(page);
    await expect(log).toContainText(instruction);
    await expect(log).toContainText('Vilken cykel?');
    await expect(log).toContainText(queuedInstruction);
    release([modelMessage('Ett sent svar får inte starta kön.')]);
    await expect(text).toContainText('Samtalet är pausat');
    await expect(text.getByRole('status', { name: 'Samtalets livslängd' })).toContainText(
      'Löper ut',
    );
    await expect(
      text.getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Sol, Låg', exact: true }),
    ).toBeVisible();
    await expect(log).not.toContainText('Skyttel arbetar…');
    await openProfile(page);
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await openConversationText(page);
    await expect(log).toContainText(instruction);
    await expect(log).toContainText('Vilken cykel?');
    await expect(text).toContainText('Samtalet är pausat');
    await app.restart();
    await page.reload();
    await openConversationText(page);
    await expect(log).toContainText(instruction);
    await expect(log).toContainText('Vilken cykel?');
    await expect(text).toContainText('Samtalet är pausat');
    await openConversationDraft(page);
    await readVoiceProposal(page, 'Lo Exempel', null);
    const end = text.getByRole('button', { name: 'Avsluta samtalet', exact: true });
    await end.focus();
    await page.keyboard.press('Enter');
    await expect(log).not.toContainText(instruction);
    await expect(log).not.toContainText('Vilken cykel?');
    await expect(text.getByRole('button', { name: 'Nytt samtal', exact: true })).toBeFocused();
    await page.reload();
    await openConversationText(page);
    await expect(log).not.toContainText(instruction);
    await openConversationDraft(page);
    await readVoiceProposal(page, 'Lo Exempel', null);
    expect(model.requests).toHaveLength(2);
  } finally {
    release([modelMessage('Släpp provet.')]);
    await app.close();
  }
});
