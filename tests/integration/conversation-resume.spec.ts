import type { Page } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  giveConversationConsent,
  microphoneButton,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import { modelMessage, modelTool, pendingUpdate, textModel } from '../support/text-model.js';

test('KONTEXT-25: återuppta rätt samtal på samma och annan enhet utan att blanda text eller modellval', async ({
  page,
  browser,
}) => {
  let calls = 0;
  const live = liveProvider();
  const model = textModel(
    (body) => {
      const call = calls++;
      if (call === 0)
        return [
          modelTool('ask_questions', {
            questions: [
              {
                kind: 'information',
                request: 'Beskriv garaget utan att ändra något.',
                question: 'Vilket garage?',
                dependsOnDraft: false,
              },
            ],
          }),
        ];
      if (call === 1) return [modelMessage('Det andra samtalet gäller cykeln.')];
      if (call === 2)
        return [
          modelTool('ask_questions', {
            questions: [],
            updates: [pendingUpdate(body, 'Vilket garage?', { answer: 'Garaget heter Västra.' })],
            continueResponse: true,
          }),
        ];
      return [modelMessage('Garaget heter Västra.')];
    },
    (body) => {
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE')) {
        const { current } = JSON.parse(String(body.input[0].content));
        return [
          modelMessage(
            JSON.stringify({
              mode: current === 'Beskriv cykeln utan att ändra något.' ? 'read' : 'work',
              request: current,
              responseRequired: false,
            }),
          ),
        ];
      }
      return [modelMessage('{"decision":"allow","complete":true,"fulfillsRequest":true}')];
    },
  );
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  const otherContext = await browser.newContext();
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin, 'Återuppta samtal');
    await page.goto(app.origin);
    await startConversationWithText(page);
    const view = (target: Page) =>
      target.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const log = (target: Page) => view(target).getByRole('log', { name: 'Samtalstext' });
    const send = async (target: Page, text: string) => {
      await view(target).getByRole('textbox', { name: 'Meddelande till Skyttel' }).fill(text);
      await view(target).getByRole('button', { name: 'Skicka', exact: true }).click();
    };
    await view(page)
      .getByRole('button', { name: /^Modell och resonemang:/ })
      .click();
    const reasoning = page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await reasoning.getByRole('button', { name: 'Låg', exact: true }).click();
    await reasoning.getByRole('button', { name: 'GPT-6.1 Terra', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Modellval', exact: true })
      .getByRole('radio', { name: 'GPT-6.1 Sol', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await send(page, 'Beskriv garaget utan att ändra något.');
    await expect(log(page)).toContainText('Vilket garage?');
    await page.reload();
    await openConversationText(page);
    await expect(view(page).getByRole('status', { name: 'Samtalets livslängd' })).toContainText(
      'Samtalet är pausat.',
    );
    await expect(
      view(page).getByRole('button', { name: 'Återuppta samtalet', exact: true }),
    ).toBeVisible();
    await view(page).getByRole('button', { name: 'Återuppta samtalet', exact: true }).click();
    await giveConversationConsent(page);
    await expect(
      view(page).getByRole('textbox', { name: 'Meddelande till Skyttel' }),
    ).toBeEnabled();
    await expect(log(page)).toContainText('Vilket garage?');
    const other = await otherContext.newPage();
    await other.addInitScript({ content: liveBrowserFixtureSource });
    await expect(log(page).getByRole('listitem').filter({ hasText: 'Vilket garage?' })).toHaveCount(
      1,
    );
    await signIn(other.request, app.origin);
    await other.goto(app.origin);
    await other
      .getByRole('dialog', { name: 'Vi använder kakor', exact: true })
      .getByRole('button', { name: 'Endast nödvändiga', exact: true })
      .click();
    await startConversationWithText(other);
    await view(other)
      .getByRole('button', { name: /^Modell och resonemang:/ })
      .click();
    const otherReasoning = other.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await otherReasoning.getByRole('button', { name: 'Medium', exact: true }).click();
    await otherReasoning.getByRole('button', { name: 'GPT-6.1 Sol', exact: true }).click();
    await other
      .getByRole('dialog', { name: 'Modellval', exact: true })
      .getByRole('radio', { name: 'GPT-6.1 Terra', exact: true })
      .click();
    await other.keyboard.press('Escape');
    await send(other, 'Beskriv cykeln utan att ändra något.');
    await expect(log(other)).toContainText('Det andra samtalet gäller cykeln.');
    await view(other).getByRole('button', { name: 'Bevarade samtal', exact: true }).click();
    const retained = view(other).getByRole('region', { name: 'Bevarade samtal', exact: true });
    await expect(retained).toContainText('Löper ut');
    await retained
      .getByRole('button', { name: 'Öppna Beskriv garaget utan att ändra något.', exact: true })
      .click();
    await expect(log(other)).toContainText('Vilket garage?');
    await expect(
      log(other).getByRole('listitem').filter({ hasText: 'Vilket garage?' }),
    ).toHaveCount(1);
    await expect(log(other)).not.toContainText('Det andra samtalet gäller cykeln.');
    await expect(
      view(other).getByRole('button', {
        name: 'Modell och resonemang: GPT-6.1 Sol, Låg',
        exact: true,
      }),
    ).toBeVisible();
    const resume = view(other).getByRole('button', { name: 'Återuppta samtalet', exact: true });
    await expect(resume).toBeFocused();
    await other.keyboard.press('Enter');
    await turnMicrophoneOn(other);
    await expect(microphoneButton(other)).toHaveAttribute('aria-pressed', 'true');
    const liveId = [...live.channels.keys()].at(-1);
    if (!liveId) throw new Error('Missing resumed voice connection');
    live.emit(liveId, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Det västra garaget.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(liveId, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect(log(other)).toContainText('Garaget heter Västra.');
    await view(other).getByRole('button', { name: 'Bevarade samtal', exact: true }).click();
    await retained
      .getByRole('button', { name: 'Öppna Beskriv cykeln utan att ändra något.', exact: true })
      .click();
    await expect(microphoneButton(other)).toHaveAttribute('aria-pressed', 'false');
    await expect(log(other)).toContainText('Det andra samtalet gäller cykeln.');
    await expect(log(other)).not.toContainText('Garaget heter Västra.');
    await view(other).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(
      view(other).getByRole('button', {
        name: 'Modell och resonemang: GPT-6.1 Terra, Medium',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await otherContext.close().catch(() => undefined);
    await app.close();
  }
});
