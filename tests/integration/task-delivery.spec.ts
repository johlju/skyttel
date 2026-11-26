import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { contrast } from '../support/accessibility.js';
import { createHousehold, signIn, utilityButton } from '../support/client.js';
import {
  chooseConversationVoice,
  closeConversationText,
  microphoneButton,
  openConversationDraft,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider, speak } from '../support/live-provider.js';
import { advanceActiveLogin } from '../support/session-time.js';
import { expect, test } from '../support/test.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

async function prepareMissingDelivery(page: Page) {
  const preparation = await readFile(
    new URL('../../docs/manual-tests/conversation-delivery.md', import.meta.url),
    'utf8',
  );
  const script = [...preparation.matchAll(/```javascript\n([\s\S]*?)\n```/g)]
    .map((match) => match[1])
    .find((source) => source.includes('window.skyttelDeliveryPreparation ='));
  if (!script) throw new Error('Missing LEV-04 delivery preparation');
  await page.addInitScript({ content: script });
  return {
    restoreConnection: () => page.evaluate('window.skyttelDeliveryPreparation.restoreConnection()'),
    dropBeforeNextMessage: () =>
      page.evaluate('window.skyttelDeliveryPreparation.dropBeforeNextMessage()'),
  };
}

async function readMapLayout(page: Page) {
  // The narrow text view covers the map. Returning from Settings restores
  // its layout after the retained region has already reappeared in the DOM.
  const region = page.getByRole('region', { name: 'Rymdkarta', exact: true, includeHidden: true });
  const navigation = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
  await Promise.all([expect(region).toBeVisible(), expect(navigation).toBeVisible()]);
  const [map, tools] = await Promise.all([region.boundingBox(), navigation.boundingBox()]);
  if (!map || !tools) throw new Error('Missing map or map tools');
  return {
    mapSize: { width: map.width, height: map.height },
    toolsPosition: { x: tools.x, y: tools.y },
  };
}

test('LEV-04: saknad leveranskanal kräver uttryckliga nya försök för text och röst', async ({
  page,
}) => {
  const viewports = [
    { width: 1280, height: 800 },
    { width: 390, height: 800 },
    { width: 320, height: 600 },
  ];
  const full = `${'Svaret efter ditt uttryckliga återförsök. '.repeat(80)}Sista raden i hela svaret.`;
  const voiceReply = 'Hela röstsvarstexten efter återanslutning.';
  const model = textModel(() => [modelMessage(model.requests.length === 1 ? full : voiceReply)]);
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  const messages: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/messages'))
      messages.push(request.postData() ?? '');
  });
  try {
    await page.addInitScript({ content: liveBrowserFixtureSource });
    const delivery = await prepareMissingDelivery(page);
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin, 'Leveransprov');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize(viewports[0]);
    await page.goto(app.origin);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await startConversationWithText(page);
    const textView = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const input = textView.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    const send = textView.getByRole('button', { name: 'Skicka', exact: true });
    await input.fill('Beskriv cykeln.');
    await send.click();
    await expect(textView.getByRole('alert')).toHaveText(
      'Instruktionen skickades inte. Skyttel kunde inte öppna anslutningen för hela svaret. Texten finns kvar; försök igen när kontakten fungerar.',
    );
    await expect(input).toHaveValue('Beskriv cykeln.');
    await expect(textView.getByRole('log', { name: 'Samtalstext' })).not.toContainText('Du:');
    expect(messages).toEqual([]);
    expect(model.requests).toEqual([]);
    await chooseConversationVoice(page);
    await expect(page.getByRole('region', { name: 'Samtalsnotis', exact: true })).toContainText(
      'Rösten kunde inte starta just nu. Försök igen om en stund.',
    );
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats()))
      .toMatchObject({
        openPeers: 0,
        microphoneTracks: [{ state: 'ended' }],
      });
    expect(live.requests).toEqual([]);
    await delivery.restoreConnection();
    // Restoring the transport alone never sends the retained instruction.
    await expect(input).toHaveValue('Beskriv cykeln.');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(messages).toEqual([]);
    expect(live.requests).toEqual([]);
    const openLayouts = new Map<number, Awaited<ReturnType<typeof readMapLayout>>>();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(textView).toBeInViewport({ ratio: 1 });
      openLayouts.set(viewport.width, await readMapLayout(page));
    }
    await page.setViewportSize(viewports[0]);
    await send.click();
    await expect(input).toHaveValue('');
    const delivered = textView.getByRole('log', { name: 'Samtalstext' });
    await expect(delivered).toContainText(full);
    expect(messages).toHaveLength(1);
    expect(model.requests).toHaveLength(1);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(textView).toBeInViewport({ ratio: 1 });
      await expect(delivered).toContainText(full);
      await delivered.getByText(/Sista raden i hela svaret/).scrollIntoViewIfNeeded();
      await expect(
        textView.getByRole('textbox', { name: 'Meddelande till Skyttel' }),
      ).toBeVisible();
      await expect.poll(() => readMapLayout(page)).toEqual(openLayouts.get(viewport.width));
      await (await utilityButton(page, 'Inställningar')).click();
      const heading = page.getByRole('heading', { level: 1, name: 'Inställningar', exact: true });
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport({ ratio: 1 });
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect.poll(() => readMapLayout(page)).toEqual(openLayouts.get(viewport.width));
    }
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    expect(live.requests).toHaveLength(1);
    await delivery.dropBeforeNextMessage();
    await input.fill('Skapa inget nytt.');
    await send.click();
    await expect(textView.getByRole('alert')).toHaveText(
      'Instruktionen skickades inte. Skyttel kunde inte öppna anslutningen för hela svaret. Texten finns kvar; försök igen när kontakten fungerar.',
    );
    await expect(input).toHaveValue('Skapa inget nytt.');
    await expect(textView.getByRole('log', { name: 'Samtalstext' })).not.toContainText(
      'Skapa inget nytt.',
    );
    expect(model.requests).toHaveLength(1);
    speak(live, 'Beskriv cykeln med rösten.');
    await expect(delivered).toContainText(voiceReply);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toHaveValue('Skapa inget nytt.');
    expect(model.requests).toHaveLength(2);
    expect(live.requests).toHaveLength(1);
    const { toolsPosition } = await readMapLayout(page);
    await closeConversationText(page);
    await expect(textView).not.toBeVisible();
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
    await expect(tools).toBeInViewport({ ratio: 1 });
    await expect.poll(() => readMapLayout(page)).toMatchObject({ toolsPosition });
  } finally {
    await page.close();
    await app.close();
  }
});

test('LEV-05: förlorad första leveransram ger tydligt fel och bevarat utkast efter ny inloggning', async ({
  page,
}) => {
  let clock = Date.now();
  let release: (output: unknown[]) => void = () => {};
  let first = true;
  const model = textModel(() => {
    if (!first) return [modelMessage('Förslaget finns i ditt utkast.')];
    first = false;
    return new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
  });
  const app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
  try {
    await page.addInitScript(() => {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = class extends OriginalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          if (!String(url).endsWith('/delivery')) return;
          this.addEventListener('message', (event) => {
            const frame = JSON.parse(String(event.data));
            if (frame.type !== 'delivery' || frame.state !== 'waiting') return;
            // Simulate loss before the App sees its first task frame. The
            // actual authenticated socket and HTTP admission remain real.
            event.stopImmediatePropagation();
            this.close();
          });
        }
      };
    });
    await signIn(page.request, app.origin);
    const { household } = await (
      await createHousehold(page.request, app.origin, 'Leveransprov')
    ).json();
    const map = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map`)
    ).json();
    await page.goto(app.origin);
    await startConversationWithText(page);
    const textView = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const input = textView.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    await input.fill('Lägg till Lo Exempel i mitt utkast.');
    const accepted = page.waitForResponse(
      (response) => response.url().endsWith('/messages') && response.status() === 202,
    );
    await textView.getByRole('button', { name: 'Skicka', exact: true }).click();
    const admission = await (await accepted).json();
    expect(admission.tasks).toHaveLength(1);
    expect(['waiting', 'failed']).toContain(admission.tasks[0].delivery.state);
    await expect(input).toHaveValue('');
    const failure = page
      .getByRole('alert')
      .filter({ hasText: 'Hela svaret kunde inte levereras.' });
    await expect(failure).toBeVisible();
    expect(model.requests).toHaveLength(1);
    release([
      modelTool('propose_object', {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        id: 'lo-delivery',
        baseRevision: null,
        value: { typeId: map.types[0].id, name: 'Lo Exempel' },
      }),
    ]);
    await expect(textView.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Förslaget finns i ditt utkast.',
    );
    await expect(await openConversationDraft(page)).toContainText('Lo Exempel');
    expect(model.requests).toHaveLength(2);
    clock += 8 * 60 * 60_000;
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    await page.getByRole('button', { name: 'Läs mer', exact: true }).click();
    await expect(failure).toBeVisible();
    await signIn(page.request, app.origin);
    await expect(failure).toHaveCount(0, { timeout: 8000 });
    await startConversationWithText(page);
    await expect(await openConversationDraft(page)).toContainText('Lo Exempel');
    expect(model.requests).toHaveLength(2);
  } finally {
    release([modelMessage('Avslutat prov.')]);
    await page.close();
    await app.close();
  }
});

for (const scenario of [
  { id: 'LEV-01', audio: false, width: 1280 },
  { id: 'LEV-02', audio: true, width: 390 },
]) {
  test(`${scenario.id}: hela svaret kommer vid utgång och rensas vid ny inloggning${scenario.audio ? ' med ljudnotis' : ' utan ljudnotis'}`, async ({
    page,
  }, testInfo) => {
    let clock = Date.now();
    let release: (output: unknown[]) => void = () => {};
    const model = textModel(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    const live = liveProvider();
    const app = await createInstallation(undefined, {
      now: () => clock,
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    const frames: Record<string, unknown>[] = [];
    const receipts: Record<string, unknown>[] = [];
    page.on('websocket', (socket) => {
      if (!socket.url().endsWith('/delivery')) return;
      socket.on('framereceived', ({ payload }) => frames.push(JSON.parse(String(payload))));
      socket.on('framesent', ({ payload }) => receipts.push(JSON.parse(String(payload))));
    });
    try {
      await page.setViewportSize({ width: scenario.width, height: 800 });
      await page.addInitScript({ content: liveBrowserFixtureSource });
      await signIn(page.request, app.origin);
      await createHousehold(page.request, app.origin, 'Leveransprov');
      await advanceActiveLogin(page.request, app.origin, 8 * 60 * 60_000 - 60_000, (elapsed) => {
        clock += elapsed;
      });
      await page.goto(app.origin);
      await startConversationWithText(page);
      if (scenario.audio) {
        await turnMicrophoneOn(page);
        await expect(voiceBox(page)).toHaveText('Lyssnar');
      }
      const textView = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
      await textView
        .getByRole('textbox', { name: 'Meddelande till Skyttel' })
        .fill('Beskriv hela svaret.');
      await textView.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect.poll(() => model.requests.length).toBe(1);
      await expect.poll(() => frames.some((frame) => frame.state === 'waiting')).toBe(true);
      clock += 60_000;
      await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
      const login = page.getByRole('button', { name: 'Fortsätt med Google' });
      await login.focus();
      const announcement = page.locator('.task-delivery-announcement');
      await expect(announcement).not.toHaveAttribute('role', 'status');
      await expect(announcement).toHaveAttribute('aria-live', 'polite');
      await expect(announcement).toHaveText('');
      await announcement.evaluate((element) => {
        const records: string[] = [];
        new MutationObserver(() => records.push(element.textContent ?? '')).observe(element, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        Object.assign(window, { deliveryAnnouncements: records });
      });
      const full = `${'Alla delar i ett långt svar med åäö och 🚲. '.repeat(60)}Sista frågan: vem använder cykeln?`;
      release([modelMessage(full)]);
      const notice = page.getByRole('region', { name: 'Svar från ditt samtal', exact: true });
      await expect(notice).toContainText('Din inloggning har gått ut.');
      await expect(notice).toHaveCSS('border-top-style', 'dashed');
      expect(await contrast(notice.locator('.task-delivery-notice-bar p'))).toBeGreaterThanOrEqual(
        4.5,
      );
      await notice.screenshot({ path: testInfo.outputPath('compact-reply-notice.png') });
      await expect(notice.getByRole('button', { name: 'Läs mer', exact: true })).toBeVisible();
      const panel = page.getByRole('region', { name: 'Hela svaret som text', exact: true });
      await expect(panel).toHaveCount(0);

      await expect.poll(() => frames.some((frame) => frame.state === 'received')).toBe(true);
      expect(receipts).toHaveLength(1);
      expect(receipts[0].text).toBe(
        frames.find((frame) => frame.state === 'awaiting-receipt')?.text,
      );
      expect(frames.find((frame) => frame.state === 'awaiting-receipt')?.saveState).toBe(
        'unconfirmed',
      );
      await expect(announcement).toHaveText(
        `Hela svaret finns här som text. Inget nytt sparande är bekräftat.${scenario.audio ? ' Ljudleveransen kan inte bekräftas.' : ''}`,
      );
      await expect(announcement).toHaveAttribute('role', 'status');
      await expect(login).toBeFocused();
      expect(
        await page.evaluate(
          () => (window as Window & { deliveryAnnouncements?: string[] }).deliveryAnnouncements,
        ),
      ).toHaveLength(1);
      await notice.getByRole('button', { name: 'Läs mer', exact: true }).click();
      await expect(panel).toContainText(full);
      await expect(panel).toContainText('Inget nytt sparande är bekräftat.');
      if (scenario.audio) await expect(panel).toContainText('Ljudleveransen kan inte bekräftas.');
      else await expect(panel).not.toContainText('Ljudleveransen kan inte bekräftas.');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await panel.scrollIntoViewIfNeeded();
        await expect(panel).toBeInViewport({ ratio: 1 });
        await panel.focus();
        await page.keyboard.press('Control+End');
        await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await expect
          .poll(() =>
            panel.evaluate(
              (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
            ),
          )
          .toBeLessThanOrEqual(1);
        await expect(panel).toContainText('Sista frågan: vem använder cykeln?');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
      if (scenario.audio) {
        await notice.getByRole('button', { name: 'Visa mindre' }).click();
        await expect(panel).toHaveCount(0);
        await notice.getByRole('button', { name: 'Stäng svarsnotisen' }).click();
        await expect(notice).toHaveCount(0);
      }
      expect(model.requests).toHaveLength(1);
      // Same-user replacement must clear even an already closed delivery's
      // transient text. Bootstrap provides correlation, never new authority.
      await signIn(page.request, app.origin);
      await expect(panel).toHaveCount(0, { timeout: 8000 });
      expect(model.requests).toHaveLength(1);
    } finally {
      release([modelMessage('Avslutat prov.')]);
      await page.close();
      await app.close();
    }
  });
}
