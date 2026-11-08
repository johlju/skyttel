import { supportedConversationChoices } from '../../src/shared/conversation-model.js';
import { createHousehold, signIn } from '../support/client.js';
import {
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

test('MODELLVAL-04: Escape stänger modelldialogen utan att avbryta arbete eller kö', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async () => {
    const first = model.requests.length === 1;
    if (first) await waiting;
    return [modelMessage(first ? 'Första svaret' : 'Andra svaret')];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.goto(app.origin);
    await startConversationWithText(page);
    const text = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const field = text.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    await field.fill('Första uppdraget');
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => model.requests.length).toBe(1);
    await field.fill('Andra uppdraget');
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(field).toHaveValue('');
    const opener = text.getByRole('button', { name: /^Modell och resonemang:/ });
    await opener.click();
    await expect(page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    release();
    await expect(text.getByRole('log', { name: 'Samtalstext' })).toContainText(
      /Första svaret[\s\S]*Andra svaret/,
    );
  } finally {
    release();
    await app.close();
  }
});

test('MODELLVAL-05: alla aktiverade modellpar går att välja utan avstängda mellanval', async ({
  page,
}) => {
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett svar.')]).provider,
    conversationModels: [
      { model: 'gpt-6.1-terra', effort: 'high' },
      { model: 'gpt-6.1-sol', effort: 'low' },
    ],
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.goto(app.origin);
    await startConversationWithText(page);
    await page
      .getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Terra, Hög', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'GPT-6.1 Terra', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Modellval', exact: true });
    await dialog.getByRole('button', { name: 'Välj GPT-6.1 Sol, Låg', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: 'GPT-6.1 Sol', exact: true })).toBeChecked();
    await expect(dialog.getByRole('status')).toContainText('Valet är sparat');
    await page.keyboard.press('Escape');
    const sol = page.getByRole('button', {
      name: 'Modell och resonemang: GPT-6.1 Sol, Låg',
      exact: true,
    });
    await expect(sol).toBeFocused();
    await sol.click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'GPT-6.1 Sol', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Välj GPT-6.1 Terra, Hög', exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByRole('radio', { name: 'GPT-6.1 Terra', exact: true }),
    ).toBeChecked();
  } finally {
    await app.close();
  }
});

test('MODELLVAL-01: text och röst delar modellval och tre resonemangsnivåer med tangentbord', async ({
  page,
}) => {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett svar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    const text = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const textControl = text.getByRole('button', {
      name: 'Modell och resonemang: GPT-6.1 Terra, Hög',
      exact: true,
    });
    await textControl.focus();
    await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await expect(dialog.getByRole('heading')).toBeFocused();
    await expect(dialog).toContainText('GPT-Live 1 fortsätter att lyssna och tala.');
    const slider = dialog.getByRole('slider', { name: /^Resonemangsnivå/ });
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Låg');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Medium');
    await dialog.getByRole('button', { name: 'GPT-6.1 Terra', exact: true }).click();
    const models = page.getByRole('dialog', { name: 'Modellval', exact: true });
    const sol = models.getByRole('radio', { name: 'GPT-6.1 Sol', exact: true });
    await sol.click();
    await expect(sol).toBeChecked();
    await expect(models.getByRole('status')).toContainText('Valet är sparat');
    await page.keyboard.press('Escape');
    await expect(
      text.getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Sol, Medium', exact: true }),
    ).toBeFocused();
    await turnMicrophoneOn(page);
    const voiceControl = voiceBox(page).getByRole('button', {
      name: 'Modell och resonemang: GPT-6.1 Sol, Medium',
      exact: true,
    });
    await voiceControl.click();
    dialog = page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await dialog.getByRole('button', { name: 'Hög', exact: true }).click();
    await expect(dialog.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Hög');
    await page.keyboard.press('Escape');
    await expect(
      voiceBox(page).getByRole('button', {
        name: 'Modell och resonemang: GPT-6.1 Sol, Hög',
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      text.getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Sol, Hög', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await text
      .getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Sol, Hög', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Låg', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Låg',
    );
  } finally {
    await app.close();
  }
});

test('MODELLVAL-03: ett avaktiverat personligt val behålls tills användaren väljer en aktiverad kombination', async ({
  page,
}) => {
  const choices = [...supportedConversationChoices];
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett svar.')]).provider,
    conversationModels: choices,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    await page
      .getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Terra, Hög', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Medium', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Medium',
    );
    choices.splice(0, choices.length, { model: 'gpt-6.1-sol', effort: 'high' });
    await app.restart();
    await page.goto(app.origin);
    await startConversationWithText(page);
    await page
      .getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Terra, Medium', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await expect(dialog).toContainText('Det sparade valet är inte aktiverat');
    await dialog.getByRole('button', { name: 'Välj GPT-6.1 Sol, Hög', exact: true }).click();
    await expect(dialog.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Hög');
    await expect(dialog.getByRole('heading')).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'GPT-6.1 Sol', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Modell och resonemang: GPT-6.1 Sol, Hög', exact: true }),
    ).toBeFocused();
    await turnMicrophoneOn(page);
    const voiceControl = voiceBox(page).getByRole('button', {
      name: 'Modell och resonemang: GPT-6.1 Sol, Hög',
      exact: true,
    });
    await voiceControl.click();
    await expect(page.getByRole('dialog').getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Hög',
    );
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'GPT-6.1 Sol', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(voiceControl).toBeFocused();
  } finally {
    await app.close();
  }
});
