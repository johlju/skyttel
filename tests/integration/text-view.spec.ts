import { expect, type Locator, type Page, test } from '@playwright/test';
import { createHousehold, openWorkspace, signIn, utilityButton } from '../support/client.js';
import {
  closeConversationText,
  consentBox,
  giveConversationConsent,
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

const textView = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const messageField = (page: Page) =>
  textView(page).getByRole('textbox', { name: 'Meddelande till Skyttel', exact: true });
const conversationText = (page: Page) =>
  textView(page).getByRole('log', { name: 'Samtalstext', exact: true });
const bounds = async (control: Locator) => {
  const box = await control.boundingBox();
  if (!box) throw new Error('The control has no place on the screen');
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
};

/** A household with one unsaved change in the draft, and a model that the test answers. */
async function household(page: Page, respond: Parameters<typeof textModel>[0]) {
  const live = liveProvider();
  const model = textModel(respond);
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  const proposed = await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' },
    },
  });
  expect(proposed.status(), await proposed.text()).toBe(200);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  const stops: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/(stop|new)$/.test(request.url()))
      stops.push(request.url().split('/').slice(-3).join('/'));
  });
  await page.goto(app.origin);
  await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
  return { app, live, model, path, stops };
}

test('TEXTVY-01: Skriv till Skyttel öppnar och stänger textvyn utan att avsluta samtalet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { app, stops } = await household(page, () => [modelMessage('Ett provsvar.')]);
  try {
    const tool = await utilityButton(page, 'Skriv till Skyttel');
    await expect(tool).toHaveAttribute('aria-expanded', 'false');
    const map = await bounds(page.locator('.map-space'));

    // Without a consent the button asks first. The text view opens once the conversation has started.
    await tool.click();
    await expect(consentBox(page)).toBeVisible();
    await expect(textView(page)).toHaveCount(0);
    await giveConversationConsent(page);
    await expect(textView(page)).toBeVisible();
    await expect(tool).toHaveAttribute('aria-expanded', 'true');

    // On a computer: a side field of 400 px at the right edge, under the voice box's corner.
    // It pushes the map aside, and the message field has the focus.
    const view = await bounds(textView(page));
    expect(view.width).toBe(400);
    expect(view.right).toBe(1280);
    expect(view.y).toBeGreaterThanOrEqual(64);
    await expect.poll(async () => (await bounds(page.locator('.map-space'))).right).toBe(880);
    expect(map.right).toBe(1280);
    await expect(textView(page).getByRole('heading', { level: 2 })).toHaveText(
      'Skriv till Skyttel',
    );
    const heading = textView(page).locator('header').getByRole('button');
    await expect(heading).toHaveCount(2);
    await expect(heading.first()).toHaveAccessibleName('Nytt samtal');
    await expect(heading.last()).toHaveAccessibleName('Stäng textvyn');
    await expect(messageField(page)).toBeFocused();
    await expect(messageField(page)).toHaveAttribute('placeholder', 'Berätta vad du vill göra…');
    for (const removed of [
      'Samtalskontroller',
      'Öppna samtalet',
      'Tala eller skriv',
      'Fortsätt skriva',
      'Avsluta samtalet',
      'Samtalstexten kan innehålla fel',
    ])
      await expect(page.getByText(removed, { exact: false })).toHaveCount(0);

    // Closing the text view ends nothing, and the unsent text stays.
    await messageField(page).fill('Oskickat');
    await textView(page).getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await expect(textView(page)).toHaveCount(0);
    await expect(tool).toBeFocused();
    await expect(tool).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await bounds(page.locator('.map-space'))).right).toBe(1280);
    await tool.click();
    await expect(messageField(page)).toHaveValue('Oskickat');
    await tool.click();
    await expect(textView(page)).toHaveCount(0);

    // The quick link does what the button does.
    const link = page.getByRole('button', { name: 'Till samtalet med Skyttel', exact: true });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(messageField(page)).toHaveValue('Oskickat');
    await expect(messageField(page)).toBeFocused();
    expect(stops).toEqual([]);
  } finally {
    await app.close();
  }
});

test('TEXTVY-02: samtalstexten visar vem som skriver och raden Skyttel arbetar sist', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  const { app } = await household(
    page,
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  try {
    // The welcome guide's start with text does what the button does.
    await page
      .getByRole('complementary', { name: 'Kom igång med kartan' })
      .getByRole('button', { name: 'Skriv', exact: true })
      .click();
    await giveConversationConsent(page);
    await expect(conversationText(page)).toHaveText(
      'Här visas det du och Skyttel säger och skriver.',
    );

    // Skicka stands level with the middle of the message field, and the field keeps the focus.
    const send = textView(page).getByRole('button', { name: 'Skicka', exact: true });
    await expect(send).toBeDisabled();
    const field = await bounds(messageField(page));
    const button = await bounds(send);
    expect(Math.abs(field.y + field.height / 2 - (button.y + button.height / 2))).toBeLessThan(2);
    await messageField(page).fill('Vem betalar musiken?');
    await send.click();
    await expect(messageField(page)).toBeFocused();
    await expect(messageField(page)).toHaveValue('');
    const rows = conversationText(page).getByRole('listitem');
    await expect(rows).toHaveText(['Du: Vem betalar musiken?', 'Skyttel arbetar…']);
    await expect(textView(page).getByRole('timer')).toHaveCount(0);
    await release([modelMessage('Kim betalar musiken.')]);
    await expect(rows).toHaveText(['Du: Vem betalar musiken?', 'Skyttel: Kim betalar musiken.']);

    // No name is shown. The user's text stands in a tinted box to the right, Skyttel's without one.
    await expect(rows.first()).toHaveClass('conversation-row user');
    await expect(rows.first().locator('.visually-hidden')).toHaveText('Du: ');
    const style = (row: Locator) =>
      row.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const list = element.parentElement?.getBoundingClientRect();
        const { backgroundColor, borderTopStyle, fontSize } = getComputedStyle(element);
        return {
          tinted: backgroundColor !== 'rgba(0, 0, 0, 0)' && borderTopStyle !== 'none',
          right: Math.round((list?.right ?? 0) - box.right),
          fontSize: Number.parseFloat(fontSize),
        };
      });
    const user = await style(rows.first());
    const skyttel = await style(rows.last());
    expect(user.tinted).toBe(true);
    expect(skyttel.tinted).toBe(false);
    expect(user.right).toBeLessThan(skyttel.right);
    expect(user.fontSize).toBeLessThan(15);

    // Enter sends as well, and Shift+Enter makes a new line.
    await messageField(page).pressSequentially('Rad ett');
    await page.keyboard.press('Shift+Enter');
    await messageField(page).pressSequentially('rad två');
    await page.keyboard.press('Enter');
    await expect(rows.nth(2)).toHaveText('Du: Rad ett\nrad två');
    await expect(rows.last()).toHaveText('Skyttel arbetar…');
    await expect(messageField(page)).toBeFocused();
    await release([modelMessage('Klart.')]);
    await expect(rows.last()).toHaveText('Skyttel: Klart.');
  } finally {
    await app.close();
  }
});

test('TEXTVY-03: Nytt samtal tömmer samtalstexten, stoppar arbetet och behåller utkast och mikrofon', async ({
  page,
}) => {
  let held = false;
  let release!: (output: unknown[]) => void;
  const { app, live, model, path, stops } = await household(page, () => {
    held = true;
    return new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
  });
  try {
    const before = (await (await page.request.get(path)).json()).draft;
    await startConversationWithVoice(page);
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: true, state: 'live' }]);
    await openConversationText(page);
    await messageField(page).fill('Rätta namnet.');
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await expect(conversationText(page).getByRole('listitem').last()).toHaveText(
      'Skyttel arbetar…',
    );
    await messageField(page).fill('Oskickat');

    await textView(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(conversationText(page)).toHaveText(
      'Skyttel: Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
    );
    await expect(consentBox(page)).toHaveCount(0);
    await expect(messageField(page)).toHaveValue('Oskickat');
    // The stopped work cannot change the draft afterwards.
    release([
      modelTool('propose_object', {
        version: before.version,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { ...before.changes[0].after, name: 'För sent' },
      }),
    ]);
    await expect(conversationText(page)).toHaveText(
      'Skyttel: Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
    );
    expect((await (await page.request.get(path)).json()).draft).toEqual(before);
    // The microphone keeps its state, and Skyttel is told to start over and what to say.
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: true, state: 'live' },
    ]);
    expect(live.requests).toHaveLength(1);
    expect(live.sent.map(({ event }) => event)).toContainEqual({
      type: 'session.commentary.append',
      delegation_id: null,
      content: 'Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
    });
    expect(live.sent.map(({ event }) => event.type)).not.toContain('session.close');
    expect(stops.filter((stop) => stop.endsWith('/stop'))).toEqual([]);

    // The next message starts without what was said before.
    await messageField(page).fill('Vad finns i utkastet?');
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => model.requests.length).toBe(2);
    expect(model.requests[1].input).toHaveLength(1);
    expect(JSON.stringify(model.requests[1].input)).not.toContain('Rätta namnet.');
    release([modelMessage('Lo Exempel.')]);
  } finally {
    await app.close();
  }
});

test.describe('a wide touch screen', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  test('TEXTVY-04: textvyn går att använda på mobil enhet och smal skärm', async ({ page }) => {
    const { app } = await household(page, () => [modelMessage('Ett provsvar.')]);
    try {
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await startConversationWithText(page);
      // A mobile device: the message field does not take the focus by itself.
      await expect(textView(page)).toBeVisible();
      await expect(messageField(page)).not.toBeFocused();
      const wide = await bounds(textView(page));
      expect(wide.width).toBe(400);
      expect(wide.right).toBe(820);
      await messageField(page).tap();
      await messageField(page).fill('Hej Skyttel.');
      await textView(page).getByRole('button', { name: 'Skicka', exact: true }).tap();
      await expect(conversationText(page)).toContainText('Skyttel: Ett provsvar.');
      await expect(messageField(page)).toBeFocused();

      // A narrow screen: the text view fills the screen under the toolbar, and the map waits.
      await page.setViewportSize({ width: 390, height: 844 });
      const tools = await bounds(page.getByRole('navigation', { name: 'Kartans verktyg' }));
      await expect
        .poll(async () => {
          const narrow = await bounds(textView(page));
          return [narrow.x, narrow.right, narrow.y >= tools.bottom, narrow.bottom <= 844];
        })
        .toEqual([0, 390, true, true]);
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toHaveCount(0);
      await expect(textView(page).getByRole('button', { name: 'Nytt samtal' })).toBeInViewport();
      await expect(
        textView(page).getByRole('button', { name: 'Skicka', exact: true }),
      ).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      await closeConversationText(page);
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
      await openConversationText(page);
      await expect(messageField(page)).not.toBeFocused();
      await expect(conversationText(page)).toContainText('Skyttel: Ett provsvar.');
      await openWorkspace(page);
      await expect(textView(page)).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
