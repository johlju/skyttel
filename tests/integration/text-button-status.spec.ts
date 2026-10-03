import { expect, test } from '@playwright/test';
import { bounds, contrast } from '../support/accessibility.js';
import { createHousehold, signIn, utilityButton } from '../support/client.js';
import {
  closeConversationText,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

test('TEXTBRICKA-01: stängd textvy visar arbete och ett oläst svar utan att flytta verktygen', async ({
  page,
}) => {
  let release!: () => void;
  const reply = 'Det privata utkastet är fortfarande osparat.';
  const model = textModel(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return [modelMessage(reply)];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.goto(app.origin);
    await startConversationWithText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Beskriv mitt utkast.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => typeof release).toBe('function');
    await closeConversationText(page);
    const button = await utilityButton(page, 'Skriv till Skyttel');
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
    const before = await bounds(tools);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel arbetar.');
    await expect(button.locator('.text-button-marker')).toHaveAttribute('data-status', 'working');
    await expect(page.locator('.text-button-announcement')).toHaveText('');
    await expect(button).toBeFocused();
    release();
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel har svarat.');
    await expect(button.locator('.text-button-marker')).toHaveAttribute('data-status', 'answered');
    await expect(page.locator('.text-button-announcement')).toHaveText('Skyttel har svarat');
    await expect(page.locator('.text-button-announcement')).toHaveAttribute('aria-live', 'polite');
    expect(await bounds(tools)).toEqual(before);
    await expect(button).toBeFocused();
    await (await utilityButton(page, 'Din profil')).click();
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(button).toBeFocused();
    expect((await page.locator('[aria-live="polite"]').allTextContents()).join(' ')).not.toContain(
      reply,
    );
    await openConversationText(page);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel');
    await expect(button.locator('.text-button-marker')).toHaveCount(0);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(reply);
    await closeConversationText(page);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel');
    await expect(button.locator('.text-button-marker')).toHaveCount(0);
    expect(model.requests).toHaveLength(1);
  } finally {
    release?.();
    await app.close();
  }
});

test('TEXTBRICKA-02: en oläst nödvändig fråga får frågebricka och samma fråga ligger kvar med mikrofonen av', async ({
  page,
}) => {
  let release!: () => void;
  const question = 'Vilken person avses med Lo?';
  const model = textModel(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return [modelTool('ask_questions', { questions: [question] })];
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Red ut vilken Lo som avses.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => typeof release).toBe('function');
    await closeConversationText(page);
    release();
    const button = await utilityButton(page, 'Skriv till Skyttel');
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel väntar på ditt svar.');
    await expect(button.locator('.text-button-marker')).toHaveText('?');
    await expect(page.locator('.text-button-announcement')).toHaveText(
      'Skyttel väntar på ditt svar',
    );
    expect((await page.locator('[aria-live="polite"]').allTextContents()).join(' ')).not.toContain(
      question,
    );
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toBeVisible();
    await expect(button).toHaveAccessibleName('Skriv till Skyttel');
    await expect(button.locator('.text-button-marker')).toHaveCount(0);
    await turnMicrophoneOff(page);
    // Starting voice does not replay a question already delivered while it was off.
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel väntar på ditt svar.');
    await expect(page.locator('.text-button-announcement')).toHaveText('');
    await openConversationText(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(question);
    await closeConversationText(page);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel');
    expect(model.requests).toHaveLength(1);
  } finally {
    release?.();
    await app.close();
  }
});

test('TEXTBRICKA-03: röstrutan ersätter brickan och samma olästa svar annonseras inte på nytt', async ({
  page,
}) => {
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Beskriv mitt utkast.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => held.length).toBe(1);
    await closeConversationText(page);
    held[0]([modelMessage('Det första svaret.')]);
    const button = await utilityButton(page, 'Skriv till Skyttel');
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel har svarat.');
    await page.evaluate(() => {
      const region = document.querySelector('.text-button-announcement');
      if (!region) throw new Error('Missing polite button announcement');
      const announcements: string[] = [];
      const observer = new MutationObserver(() => {
        if (region.textContent) announcements.push(region.textContent);
      });
      observer.observe(region, { childList: true, characterData: true, subtree: true });
      Object.assign(window, { textButtonAnnouncements: announcements });
    });
    for (let repeat = 0; repeat < 2; repeat++) {
      await turnMicrophoneOn(page);
      await expect(button).toHaveAccessibleName('Skriv till Skyttel');
      await turnMicrophoneOff(page);
      await expect(voiceBox(page)).toHaveCount(0);
      await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel har svarat.');
      await expect(page.locator('.text-button-announcement')).toHaveText('');
    }
    expect(await page.evaluate(() => Reflect.get(window, 'textButtonAnnouncements'))).toEqual([]);
    await turnMicrophoneOn(page);
    const id = [...live.channels.keys()].at(-1);
    if (!id) throw new Error('Missing Live session');
    live.emit(id, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Beskriv kartan.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(id, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect.poll(() => held.length).toBe(2);
    await turnMicrophoneOff(page);
    await expect(voiceBox(page)).toContainText('Skyttel arbetar');
    await expect(button).toHaveAccessibleName('Skriv till Skyttel');
    await expect(button.locator('.text-button-marker')).toHaveCount(0);
    held[1]([modelMessage('Det talade svaret.')]);
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBeGreaterThan(0);
    await openConversationText(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Det talade svaret.',
    );
    expect(model.requests).toHaveLength(2);
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});

for (const width of [390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`TEXTBRICKA-04: minskad rörelse och fasta knappmått vid ${width}px i ${theme} tema`, async ({
      page,
    }) => {
      let release!: () => void;
      const model = textModel(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return [modelMessage('Ett nytt svar.')];
      });
      const app = await createInstallation(undefined, { modelFetch: model.provider });
      try {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
        await signIn(page.request, app.origin);
        await createHousehold(page.request, app.origin);
        await page.goto(app.origin);
        await startConversationWithText(page);
        await page.getByLabel('Meddelande till Skyttel').fill('Beskriv mitt utkast.');
        await page.getByRole('button', { name: 'Skicka', exact: true }).click();
        await expect.poll(() => typeof release).toBe('function');
        await closeConversationText(page);
        const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
        await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
        const button = await utilityButton(page, 'Skriv till Skyttel');
        await expect(button.locator('span').first()).toHaveText('Skriv till Skyttel');
        await expect(button.locator('span').first()).toBeVisible();
        const before = await bounds(tools);
        const target = await bounds(button);
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
        const spinner = button.locator('.text-button-marker svg');
        expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe(
          'none',
        );
        await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: theme });
        expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe(
          'text-button-work',
        );
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
        release();
        await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel har svarat.');
        const badge = button.locator('.text-button-marker');
        await expect(badge).toHaveText('•••');
        expect(await contrast(badge)).toBeGreaterThanOrEqual(4.5);
        const overlay = await bounds(badge);
        expect(overlay.right).toBeGreaterThan(target.right - 3);
        expect(overlay.y).toBeLessThan(target.y + 3);
        expect(await bounds(button)).toEqual(target);
        expect(await bounds(tools)).toEqual(before);
      } finally {
        release?.();
        await app.close();
      }
    });

test('TEXTBRICKA-05: köat textarbete behåller arbetsmarkeringen före ett oläst svar och avbrott tar bort den', async ({
  page,
}) => {
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.goto(app.origin);
    await startConversationWithText(page);
    for (const instruction of ['Beskriv mitt utkast.', 'Beskriv sedan kartan.']) {
      await page.getByLabel('Meddelande till Skyttel').fill(instruction);
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(page.getByLabel('Meddelande till Skyttel')).toHaveValue('');
    }
    await expect.poll(() => held.length).toBe(1);
    await closeConversationText(page);
    const button = await utilityButton(page, 'Skriv till Skyttel');
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel arbetar.');
    held[0]([modelMessage('Första svaret är klart.')]);
    await expect.poll(() => held.length).toBe(2);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel arbetar.');
    await expect(page.locator('.text-button-announcement')).toHaveText('');
    await openConversationText(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Första svaret är klart.',
    );
    await page.getByLabel('Meddelande till Skyttel').press('Escape');
    await expect(
      page.getByText('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.', { exact: true }),
    ).toBeVisible();
    await closeConversationText(page);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel');
    held[1]([modelMessage('Det avbrutna svaret får inte visas.')]);
    await openConversationText(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).not.toContainText(
      'Det avbrutna svaret',
    );
    await closeConversationText(page);
    await expect(button.locator('.text-button-marker')).toHaveCount(0);
    expect(model.requests).toHaveLength(2);
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});
