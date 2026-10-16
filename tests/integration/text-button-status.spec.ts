import { expect, type Page, test } from '@playwright/test';
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

async function toolbarLayout(page: Page) {
  const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
  return {
    tools: await bounds(tools),
    workspace: await bounds(page.getByRole('region', { name: 'Rymdkarta', exact: true })),
    controls: await tools.evaluate((element) => {
      const toolbar = element.getBoundingClientRect();
      return [...element.querySelectorAll('button')]
        .filter((button) => button.getClientRects().length)
        .map((button) => {
          const box = button.getBoundingClientRect();
          return {
            // Scrolling exposes controls without changing their arrangement.
            x: box.x - toolbar.x + element.scrollLeft,
            y: box.y - toolbar.y + element.scrollTop,
            width: box.width,
            height: box.height,
          };
        });
    }),
  };
}

async function expectReservedReplySpace(
  page: Page,
  reply: string,
  before: Awaited<ReturnType<typeof toolbarLayout>>,
) {
  const panel = page.getByRole('region', { name: 'Hela svaret som text', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toBeInViewport({ ratio: 1 });
  await expect(panel).toContainText(reply);
  const delivered = await bounds(panel);
  expect(delivered.height).toBeGreaterThan(0);
  const workspace = page.getByRole('region', { name: 'Rymdkarta', exact: true });
  await expect.poll(async () => (await bounds(workspace)).y).toBeCloseTo(delivered.bottom, 3);
  const after = await toolbarLayout(page);
  expect(after.workspace.x).toBe(before.workspace.x);
  expect(after.workspace.width).toBe(before.workspace.width);
  expect(after.workspace.bottom).toBe(before.workspace.bottom);
  expect(after.workspace.y - before.workspace.y).toBeCloseTo(delivered.height, 3);
  const inset = before.tools.y - before.workspace.y;
  expect(after.tools.y - after.workspace.y).toBeCloseTo(inset, 3);
  expect(after.tools.x).toBe(before.tools.x);
  expect(after.tools.width).toBe(before.tools.width);
  expect(after.tools.height).toBeCloseTo(
    Math.min(before.tools.height, after.workspace.height - 2 * inset),
    3,
  );
  expect(after.tools.bottom).toBeLessThanOrEqual(after.workspace.bottom - inset);
  expect(after.controls).toEqual(before.controls);
}

test('TEXTBRICKA-01: stängd textvy visar arbete och ett oläst svar med fasta verktygsmått', async ({
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
    const before = await toolbarLayout(page);
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel arbetar.');
    await expect(button.locator('.text-button-marker')).toHaveAttribute('data-status', 'working');
    const dot = await bounds(button.locator('.text-button-marker'));
    const icon = await bounds(button.locator('svg'));
    expect(dot.width).toBe(10);
    expect(dot.height).toBe(10);
    expect(dot.y).toBeLessThan(icon.y);
    await expect(page.locator('.text-button-announcement')).toHaveText('');
    await expect(button).toBeFocused();
    release();
    await expect(button).toHaveAccessibleName('Skriv till Skyttel. Skyttel har svarat.');
    await expect(button.locator('.text-button-marker')).toHaveAttribute('data-status', 'answered');
    expect((await bounds(button.locator('.text-button-marker'))).height).toBe(18);
    await expect(button.locator('.text-button-marker')).toHaveCSS('font-size', '12px');
    await expect(page.locator('.text-button-announcement')).toHaveText('Skyttel har svarat');
    await expect(page.locator('.text-button-announcement')).toHaveAttribute('aria-live', 'polite');
    await expectReservedReplySpace(page, reply, before);
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

for (const { caseId, width, theme } of [
  { caseId: 'TEXTBRICKA-04', width: 390, theme: 'light' },
  { caseId: 'TEXTBRICKA-08', width: 1280, theme: 'dark' },
] as const)
  test(`${caseId}: minskad rörelse och fasta knappmått vid ${width}px i ${theme} tema`, async ({
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
      const before = await toolbarLayout(page);
      const target = await bounds(button);
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      const spinner = button.locator('.text-button-marker');
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
      await expectReservedReplySpace(page, 'Ett nytt svar.', before);
      const currentTarget = await bounds(button);
      const overlay = await bounds(badge);
      expect(overlay.right).toBeGreaterThan(currentTarget.right - 3);
      expect(overlay.y).toBeLessThan(currentTarget.y + 3);
      expect(currentTarget.width).toBe(target.width);
      expect(currentTarget.height).toBe(target.height);
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
