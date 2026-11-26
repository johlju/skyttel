import type { Locator, Page } from '@playwright/test';
import { backgroundDifference, captureBackground } from '../support/background-pixels.js';
import {
  closeSupportDialog,
  createHousehold,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import {
  closeConversationText,
  consentBox,
  giveConversationConsent,
  microphoneButton,
  openConversationText,
  selectConversation,
  startConversationWithText,
  startConversationWithVoice,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
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
      value: {
        typeId: state.types[0].id,
        name: 'Lo Exempel',
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Påhittad uppgift',
          },
        ],
      },
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

test('TEXTVY-08: samtalslistan tar bort valda samtal och behåller utkast och oskickad text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let finishWork!: () => void;
  const work = new Promise<void>((resolve) => {
    finishWork = resolve;
  });
  let turns = 0;
  const { app } = await household(page, async () => {
    if (++turns === 1) return [modelMessage('Det första svaret.')];
    await work;
    return [modelMessage('Det andra svaret.')];
  });
  const first = 'Beskriv cykeln.';
  const second = 'Beskriv garaget.';
  const unsent = 'Min oskickade text';
  const view = textView(page);
  const list = view.getByRole('region', { name: 'Samtal', exact: true });
  const draft = view.getByRole('region', { name: 'Utkastet', exact: true });
  const toggle = view.getByRole('button', { name: 'Samtal', exact: true });
  const newConversation = view.getByRole('button', { name: 'Nytt samtal', exact: true });
  const close = view.getByRole('button', { name: 'Stäng textvyn', exact: true });
  const send = async (text: string) => {
    await messageField(page).fill(text);
    await view.getByRole('button', { name: 'Skicka', exact: true }).click();
  };
  const trash = (title: string) => list.getByRole('button', { name: `Ta bort samtalet: ${title}` });
  const dialog = page.getByRole('dialog', { name: 'Ta bort samtal?' });
  const confirm = dialog.getByRole('button', { name: 'Ta bort', exact: true });
  try {
    await startConversationWithText(page);
    await send(first);
    await expect(conversationText(page)).toContainText('Det första svaret.');
    await view.getByRole('button', { name: 'Visa utkastet (1)' }).click();
    await toggle.click();
    await expect(list.getByRole('heading', { name: 'Samtal' })).toBeVisible();
    await expect(list.locator('time')).toHaveCount(1);
    await expect(list.getByRole('button', { name: first, exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    for (const panel of [list, draft]) {
      await expect(panel).toHaveCSS('border-top-right-radius', '16px');
      await expect(panel).toHaveCSS('border-bottom-left-radius', '16px');
    }
    expect((await bounds(list)).right).toBeLessThan((await bounds(draft)).x);
    expect((await bounds(draft)).right).toBeLessThan((await bounds(view)).x);
    const listHeading = await bounds(list.getByRole('heading', { name: 'Samtal' }));
    const draftHeading = await bounds(draft.getByRole('heading', { name: 'Utkast' }));
    expect(listHeading.y + listHeading.height / 2).toBeCloseTo(
      draftHeading.y + draftHeading.height / 2,
      0,
    );
    const row = draft.getByRole('row').filter({ hasText: 'Lo Exempel' });
    const name = await bounds(row.getByRole('button', { name: 'Visa förslaget: Lo Exempel' }));
    const removeProposal = row.getByRole('button', { name: 'Ta bort förslaget: Lo Exempel' });
    const status = row.getByText('Läggs till', { exact: true });
    expect((await bounds(row.locator('.conversation-draft-symbol'))).right).toBeLessThan(
      (await bounds(status)).x,
    );
    const { y, height } = await bounds(removeProposal);
    expect(y + height / 2).toBeCloseTo(name.y + name.height / 2, 0);
    await expect(row.getByRole('cell', { name: 'Person' })).toHaveCSS('vertical-align', 'middle');
    const save = await bounds(draft.getByRole('button', { name: 'Spara hela utkastet' }));
    expect(save.y + save.height / 2).toBeGreaterThan(draftHeading.y + draftHeading.height / 2);
    const firstTitle = list.getByRole('button', { name: first, exact: true });
    const firstRow = list.getByRole('listitem').filter({
      has: page.getByRole('button', { name: first, exact: true }),
    });
    const firstInfo = firstRow.getByRole('button', { name: 'Samtalsinformation' });
    const removeConversation = trash(first);
    const background = (locator: Locator) =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    const selectedBackground = await background(firstRow);
    await firstTitle.hover();
    const rowHoverBackground = await background(firstRow);
    expect(rowHoverBackground).not.toBe(selectedBackground);
    await expect(firstTitle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await firstInfo.hover();
    const infoHoverBackground = await background(firstInfo);
    expect(infoHoverBackground).not.toBe('rgba(0, 0, 0, 0)');
    await expect(firstRow).toHaveCSS('background-color', rowHoverBackground);
    const idleBackground = await background(removeConversation);
    await removeConversation.hover();
    await expect(firstInfo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(firstRow).toHaveCSS('background-color', rowHoverBackground);
    const hoverBackground = await background(removeConversation);
    expect(hoverBackground).not.toBe(idleBackground);
    for (const button of [
      removeProposal,
      draft.getByRole('button', { name: 'Kasta hela utkastet' }),
    ]) {
      await button.hover();
      await expect(button).toHaveCSS('background-color', hoverBackground);
    }
    await expect(firstRow).toHaveCSS('background-color', selectedBackground);
    expect((await bounds(toggle)).right).toBeLessThanOrEqual((await bounds(newConversation)).x);
    expect((await bounds(newConversation)).right).toBeLessThanOrEqual((await bounds(close)).x);
    const closeIcon = close.locator('svg');
    const cross = await bounds(closeIcon);
    expect((await bounds(close)).right - cross.right).toBeLessThanOrEqual(3);
    expect(cross.y).toBeLessThan((await bounds(newConversation.locator('svg'))).y);
    await close.hover();
    await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(closeIcon).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await trash(first).click();
    await expect(dialog).toContainText(first);
    await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trash(first)).toBeFocused();

    await newConversation.click();
    await expect(conversationText(page)).not.toContainText('Det första svaret.');
    await send(second);
    await expect(conversationText(page)).toContainText('Skyttel arbetar');
    await expect(firstRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await firstInfo.hover();
    await expect(firstInfo).toHaveCSS('background-color', infoHoverBackground);
    await expect(firstRow).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await trash(second).click();
    await expect(confirm).toBeDisabled();
    await expect(dialog).toContainText('Vänta tills det är klart.');
    await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await trash(first).click();
    await confirm.click();
    await expect(trash(first)).toHaveCount(0);
    await expect(conversationText(page)).toContainText('Skyttel arbetar');

    finishWork();
    await expect(conversationText(page)).toContainText('Det andra svaret.');
    await turnMicrophoneOn(page);
    await messageField(page).fill(unsent);
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true, 0.5));
    await expect(page.getByRole('group', { name: 'Röstruta' })).toHaveText('Skyttel talar');
    await trash(second).click();
    await expect(confirm).toBeDisabled();
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false, 0));
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(list).toContainText('Inga samtal ännu.');
    await expect(list.getByRole('status')).toHaveText('Samtalet togs bort.');
    await expect(list.getByRole('heading', { name: 'Samtal' })).toBeFocused();
    await expect(conversationText(page)).not.toContainText('Det andra svaret.');
    await expect(messageField(page)).toHaveValue(unsent);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    if (!(await draft.isVisible()))
      await view.getByRole('button', { name: 'Visa utkastet (1)' }).click();
    await expect(draft).toContainText('Lo Exempel');
    await page.reload();
    await openConversationText(page);
    await toggle.click();
    await expect(list).toContainText('Inga samtal ännu.');
  } finally {
    finishWork();
    await app.close();
  }
});

test('TEXTVY-01: Skriv till Skyttel öppnar och stänger textvyn utan att avsluta samtalet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { app, stops } = await household(page, () => [modelMessage('Ett provsvar.')]);
  try {
    const tool = await utilityButton(page, 'Skriv till Skyttel');
    await expect(tool).toHaveAttribute('aria-expanded', 'false');
    const map = await bounds(page.locator('.map-space'));

    // Opening the text view starts nothing; explicit use asks for consent.
    await tool.click();
    await expect(consentBox(page)).toBeHidden();
    await expect(textView(page)).toBeVisible();
    await textView(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(consentBox(page)).toBeVisible();
    await giveConversationConsent(page);
    await expect(textView(page)).toBeVisible();
    await expect(tool).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Kartans status', exact: true })).toContainText(
      'Nya förslag är osparade tills du uttryckligen ber om ett samlat sparande.',
    );

    // On a computer: a side field of 400 px at the right edge, under the voice box's corner.
    // The map keeps its full geometry and the message field has the focus.
    const view = await bounds(textView(page));
    expect(view.width).toBe(400);
    expect(view.right).toBe(1280);
    expect(view.y).toBeGreaterThanOrEqual(64);
    expect(await bounds(page.locator('.map-space'))).toEqual(map);
    expect(map.right).toBe(1280);
    await expect(textView(page).getByRole('heading', { level: 2 })).toHaveText(
      'Skriv till Skyttel',
    );
    const heading = textView(page).locator('header').getByRole('button');
    await expect(heading).toHaveCount(4);
    await expect(heading.first()).toHaveAccessibleName('Samtal');
    await expect(heading.nth(1)).toHaveAccessibleName('Nytt samtal');
    await expect(heading.nth(2)).toHaveAccessibleName(/^Modell och resonemang:/);
    await expect(heading.last()).toHaveAccessibleName('Stäng textvyn');
    await expect(messageField(page)).toBeFocused();
    await expect(messageField(page)).toHaveAttribute('placeholder', 'Berätta vad du vill göra…');
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

test('TEXTVY-07: textvyn täcker kartan och flyttar bara en skymd markering', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { app } = await household(page, () => [modelMessage('Ett provsvar.')]);
  try {
    const marker = page.locator('.spatial-node[data-object-id="lo"]');
    const tool = await utilityButton(page, 'Skriv till Skyttel');
    const widthHandle = textView(page).getByRole('separator', {
      name: 'Ändra samtalstextens bredd',
    });
    const pixels = (name: string) => captureBackground(page, info.outputPath(`${name}.png`));
    const panRight = async (distance: number) => {
      await page.mouse.move(300, 700);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(300 + distance, 700);
      await page.mouse.up({ button: 'right' });
    };

    const initial = await bounds(marker);
    const initialSky = await pixels('initial');
    await tool.click();
    await expect(textView(page)).toBeVisible();
    expect(await bounds(marker)).toEqual(initial);
    expect(backgroundDifference(initialSky, await pixels('unselected'))).toBe(0);
    await closeConversationText(page);

    await marker.click();
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await panRight(320);
    const covered = await bounds(marker);
    expect(covered.x).toBeGreaterThan(880);
    const pannedSky = await pixels('user-pan');
    expect(backgroundDifference(initialSky, pannedSky)).toBeGreaterThan(0);

    await tool.click();
    await expect.poll(async () => (await bounds(marker)).right).toBeLessThanOrEqual(880);
    const uncovered = await bounds(marker);
    expect(uncovered.right).toBeGreaterThan(870);
    expect(uncovered.y).toBe(covered.y);
    expect(backgroundDifference(pannedSky, await pixels('auto-pan'))).toBe(0);

    await widthHandle.press('ArrowLeft');
    await expect(widthHandle).toHaveAttribute('aria-valuenow', '424');
    await expect.poll(async () => (await bounds(marker)).right).toBeLessThanOrEqual(856);
    const draftButton = textView(page).getByRole('button', { name: 'Visa utkastet (1)' });
    await draftButton.click();
    const draft = textView(page).getByRole('region', { name: 'Utkastet', exact: true });
    const draftLeft = (await bounds(draft)).x;
    await expect.poll(async () => (await bounds(marker)).right).toBeLessThanOrEqual(draftLeft);
    expect(backgroundDifference(pannedSky, await pixels('wider'))).toBe(0);

    const adjusted = await bounds(marker);
    await panRight(120);
    await expect.poll(async () => (await bounds(marker)).x).toBeGreaterThan(adjusted.x + 80);
    await expect(marker).toHaveAttribute('inert', '');
    const moved = await bounds(marker);
    await closeConversationText(page);
    await expect(marker).not.toHaveAttribute('inert', '');
    expect(await bounds(marker)).toEqual(moved);
  } finally {
    await app.close();
  }
});

test('TEXTVY-02: samtalstexten visar vem som skriver och raden Skyttel arbetar sist', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  const { app, model } = await household(
    page,
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  try {
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Skriv till Skyttel', exact: true })
      .click();
    await textView(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await giveConversationConsent(page, { remember: true });
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
    const rows = conversationText(page).locator(':scope > li');
    await expect(rows).toHaveText([
      'Du: Vem betalar musiken?',
      'Skyttel arbetar… Bearbetar uppgiften. Tryck på Escape för att avbryta.',
    ]);
    const working = rows.last();
    const animation = () =>
      working.evaluate((element) => getComputedStyle(element, '::before').animationName);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(animation).toBe('assistant-work-turn');
    const rotation = () =>
      working.evaluate((element) => getComputedStyle(element, '::before').transform);
    const initialRotation = await rotation();
    await expect.poll(rotation).not.toBe(initialRotation);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(animation).toBe('none');
    await expect(working).toContainText('Skyttel arbetar…');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(animation).toBe('assistant-work-turn');
    await expect(messageField(page)).toBeFocused();
    await release([modelTool('read_map', { query: 'musik' })]);
    await expect(working).toContainText('Bearbetar uppgiften.');
    const workRows = conversationText(page).locator('.work-step');
    await expect(workRows).toHaveText(['MCP: Läser kartan']);
    await expect(workRows.locator('svg')).toBeVisible();
    await expect.poll(() => model.requests.length).toBe(2);
    await release([modelTool('read_map', { query: 'piano' })]);
    await expect(workRows).toHaveText(['MCP: Läser kartan (2)']);
    await expect.poll(() => model.requests.length).toBe(3);
    await release([modelTool('read_history', { limit: 1 })]);
    await expect(workRows).toHaveText(['MCP: Läser kartan (2)', 'MCP: Läser sparhistoriken']);
    await expect.poll(() => model.requests.length).toBe(4);
    await release([modelTool('read_map', { query: 'radio' })]);
    const steps = ['MCP: Läser kartan (2)', 'MCP: Läser sparhistoriken', 'MCP: Läser kartan'];
    await expect(workRows).toHaveText(steps);
    await expect.poll(() => model.requests.length).toBe(5);
    await release([modelMessage('Kim betalar musiken.')]);
    const firstTurn = ['Du: Vem betalar musiken?', ...steps, 'Skyttel: Kim betalar musiken.'];
    await expect(rows).toHaveText(firstTurn);

    // The user's text stands in a tinted box to the right; Skyttel's text has its own style.
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
    await expect(rows.nth(firstTurn.length)).toHaveText('Du: Rad ett\nrad två');
    await expect(rows.last()).toHaveText(
      'Skyttel arbetar… Bearbetar uppgiften. Tryck på Escape för att avbryta.',
    );
    await expect(messageField(page)).toBeFocused();
    await release([modelMessage('Klart.')]);
    const expected = [...firstTurn, 'Du: Rad ett\nrad två', 'Skyttel: Klart.'];
    await expect(rows).toHaveText(expected);
    await page.reload();
    await selectConversation(page, 'Vem betalar musiken?');
    await expect(rows).toHaveText(expected);
  } finally {
    await app.close();
  }
});

test('TEXTVY-03: Nytt samtal tömmer samtalet och behåller utkast och mikrofon', async ({
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
      'Skyttel arbetar… Bearbetar uppgiften. Tryck på Escape för att avbryta.',
    );
    await messageField(page).fill('Oskickat');

    const fresh = textView(page).getByRole('button', { name: 'Nytt samtal', exact: true });
    await expect(fresh).toBeDisabled();
    await messageField(page).press('Escape');
    await expect(fresh).toBeEnabled();
    const connectionsBeforeNew = live.requests.length;
    const stopsBeforeNew = [...stops];
    await textView(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(conversationText(page)).toHaveText(
      'Här visas det du och Skyttel säger och skriver.',
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
      'Här visas det du och Skyttel säger och skriver.',
    );
    expect((await (await page.request.get(path)).json()).draft).toEqual(before);
    {
      const retained = await readDraftProposal(page, 'Lo Exempel');
      await expect(retained).toContainText('Lo Exempel');
      await expect(retained).toContainText('Person');
      await expect(retained).toContainText('Påhittad uppgift');
      await closeSupportDialog(page, 'Lo Exempel');
      await textView(page)
        .getByRole('button', { name: /^Dölj utkastet/ })
        .click();
    }
    // The same authorized microphone stays live. The provider context and
    // old playback are replaced, and Skyttel says what remains.
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: true, state: 'live' },
    ]);
    expect(live.requests).toHaveLength(connectionsBeforeNew + 1);
    expect(live.requests.at(-1)?.session.input).toBeUndefined();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers)).toBe(1);
    expect(
      await page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks[0].state),
    ).toBe('ended');
    const resetAcknowledgements = () =>
      live.sent.filter(
        ({ event }) =>
          event.type === 'session.commentary.append' &&
          event.content === 'Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
      );
    expect(resetAcknowledgements()).toHaveLength(1);
    expect(live.sent.map(({ event }) => event.type)).toContain('session.close');
    expect(stops).toEqual(stopsBeforeNew);

    // The next message starts without what was said before.
    await messageField(page).fill('Vad finns i utkastet?');
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => model.requests.length).toBe(2);
    expect(model.requests[1].input).toHaveLength(1);
    expect(JSON.stringify(model.requests[1].input)).not.toContain('Rätta namnet.');
    release([modelMessage('Lo Exempel.')]);
    await expect(conversationText(page)).toContainText('Skyttel: Lo Exempel.');
    // Starting over also keeps an off microphone off, with the same live track.
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .locator('.workspace-talk')
      .click();
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: false, state: 'live' }]);
    await messageField(page).fill('Oskickat vid omstart');
    let releaseReset!: () => void;
    const resetHeld = new Promise<void>((resolve) => {
      releaseReset = resolve;
    });
    let resetRequests = 0;
    await page.route('**/text-assistant', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      resetRequests++;
      await resetHeld;
      await route.continue();
    });
    await textView(page).getByRole('button', { name: 'Nytt samtal', exact: true }).dblclick();
    await expect.poll(() => resetRequests).toBe(1);
    releaseReset();
    await expect.poll(() => live.requests.length).toBe(connectionsBeforeNew + 2);
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: false, state: 'live' }]);
    await expect(conversationText(page)).toHaveText(
      'Här visas det du och Skyttel säger och skriver.',
    );
    await expect(messageField(page)).toHaveValue('Oskickat vid omstart');
    expect((await (await page.request.get(path)).json()).draft).toEqual(before);
    {
      const retained = await readDraftProposal(page, 'Lo Exempel');
      await expect(retained).toContainText('Lo Exempel');
      await expect(retained).toContainText('Person');
      await expect(retained).toContainText('Påhittad uppgift');
      await closeSupportDialog(page, 'Lo Exempel');
      await textView(page)
        .getByRole('button', { name: /^Dölj utkastet/ })
        .click();
    }
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
      1,
    );
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers)).toBe(1);
    expect(resetRequests).toBe(1);
    expect(resetAcknowledgements()).toHaveLength(1);
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
      await openTable(page);
      await expect(textView(page)).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
