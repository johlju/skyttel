import type { Page } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  microphoneButton,
  openConversationText,
  selectConversation,
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
  let releaseTitle!: () => void;
  const waitingForTitle = new Promise<void>((resolve) => {
    releaseTitle = resolve;
  });
  const title = textModel(async (request) => {
    if (request.input[0].content !== 'Beskriv garaget utan att ändra något.') return [];
    await waitingForTitle;
    return [modelMessage('Fråga om garaget')];
  });
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
    titleFetch: title.provider,
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
      .getByRole('radio', { name: 'GPT-6.2 Sol', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await send(page, 'Beskriv garaget utan att ändra något.');
    await expect(log(page)).toContainText('Vilket garage?');
    const toggle = view(page).getByRole('button', { name: 'Samtal', exact: true });
    await toggle.click();
    const list = view(page).getByRole('region', { name: 'Samtal', exact: true });
    await expect(
      list.getByRole('button', { name: 'Beskriv garaget utan att ändra något.', exact: true }),
    ).toHaveAttribute('aria-current', 'true');
    releaseTitle();
    await expect(list.getByRole('button', { name: 'Fråga om garaget', exact: true })).toBeVisible();
    await list.getByRole('button', { name: 'Samtalsinformation' }).press('Enter');
    const info = page.getByRole('dialog', { name: 'Samtalsinformation' });
    await expect(info).toContainText('Fråga om garaget');
    await expect(info.getByText('Löper ut', { exact: true })).toBeVisible();
    await expect(info.locator('time')).toHaveCount(3);
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
    await info.getByRole('button', { name: 'Kopiera samtals-ID' }).click();
    const id = await page.evaluate(() => navigator.clipboard.readText());
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    await info.getByRole('button', { name: 'Kopiera LangSmith-filter' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `and(eq(metadata_key, "conversation_id"), eq(metadata_value, "${id}"))`,
    );
    await page.keyboard.press('Escape');
    await expect(list.getByRole('button', { name: 'Samtalsinformation' })).toBeFocused();
    await page.setViewportSize({ width: 760, height: 900 });
    await page.reload();
    await openConversationText(page);
    await expect(log(page)).not.toContainText('Vilket garage?');
    await toggle.click();
    const compactText = view(page).getByRole('button', { name: 'Text', exact: true });
    await expect(compactText).toBeVisible();
    await selectConversation(page, 'Fråga om garaget');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(compactText).toHaveCount(0);
    await expect(toggle).toBeFocused();
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
    await otherReasoning.getByRole('button', { name: 'GPT-6.2 Sol', exact: true }).click();
    await other
      .getByRole('dialog', { name: 'Modellval', exact: true })
      .getByRole('radio', { name: 'GPT-6.1 Terra', exact: true })
      .click();
    await other.keyboard.press('Escape');
    await send(other, 'Beskriv cykeln utan att ändra något.');
    await expect(log(other)).toContainText('Det andra samtalet gäller cykeln.');
    await view(other).getByRole('textbox').fill('Min oskickade text');
    await selectConversation(other, 'Fråga om garaget');
    await expect(view(other).getByRole('textbox')).toHaveValue('Min oskickade text');
    await expect(log(other)).toContainText('Vilket garage?');
    await expect(
      log(other).getByRole('listitem').filter({ hasText: 'Vilket garage?' }),
    ).toHaveCount(1);
    await expect(log(other)).not.toContainText('Det andra samtalet gäller cykeln.');
    await expect(
      view(other).getByRole('button', {
        name: 'Modell och resonemang: GPT-6.2 Sol, Låg',
        exact: true,
      }),
    ).toBeVisible();
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
    await other.evaluate(() => {
      window.skyttelVoiceFixture.emit({
        type: 'session.output_transcript.delta',
        delta: 'Garaget heter Västra.',
        event_id: crypto.randomUUID(),
        start_ms: 110,
        end_ms: 210,
      });
      window.skyttelVoiceFixture.setSound('remote', true, 0.7);
    });
    await expect(other.getByRole('group', { name: 'Röstruta' })).toContainText('Skyttel talar');
    await view(other)
      .getByRole('button', { name: 'Samtal', exact: true })
      .getAttribute('aria-expanded')
      .then(async (expanded) => {
        if (expanded !== 'true')
          await view(other).getByRole('button', { name: 'Samtal', exact: true }).click();
      });
    const bicycle = view(other)
      .getByRole('region', { name: 'Samtal', exact: true })
      .getByRole('button', { name: 'Beskriv cykeln utan att ändra något.', exact: true });
    await expect(bicycle).toBeDisabled();
    // Finish the audible word before the provider stream falls silent.
    await other.evaluate(() => window.skyttelVoiceFixture.remoteTone(800, 0, 0.5));
    await expect(bicycle).toBeEnabled();
    await selectConversation(other, 'Beskriv cykeln utan att ändra något.');
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
    releaseTitle();
    await otherContext.close().catch(() => undefined);
    await app.close();
  }
});
