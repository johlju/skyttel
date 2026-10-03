import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  closeConversationText,
  microphoneButton,
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

const region = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const field = (page: Page) =>
  region(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
const log = (page: Page) => region(page).getByRole('log', { name: 'Samtalstext' });
const canceled = 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.';
function providers() {
  const held: { message: string; release: (output: unknown[]) => void }[] = [];
  const model = textModel(
    (request) =>
      new Promise<unknown[]>((release) => {
        const current = JSON.parse(
          String(request.input.findLast((item) => item.role === 'user')?.content),
        );
        held.push({ message: current.message, release });
      }),
  );
  return { held, model, live: liveProvider() };
}
async function arrange(page: Page, fixtures: ReturnType<typeof providers>) {
  const app = await createInstallation(undefined, {
    modelFetch: fixtures.model.provider,
    liveFetch: fixtures.live.provider,
    liveSideband: fixtures.live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin, 'Köprov')).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' };
  await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value,
    },
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  await startConversationWithText(page);
  await expect(field(page)).toBeVisible();
  return { app, value, read: async () => await (await page.request.get(path)).json() };
}
async function send(page: Page, text: string) {
  await field(page).fill(text);
  await region(page).getByRole('button', { name: 'Skicka', exact: true }).click();
  await expect(field(page)).toHaveValue('');
}
function speak(live: ReturnType<typeof liveProvider>, text: string) {
  const id = [...live.channels.keys()].at(-1);
  if (!id) throw new Error('Missing live session');
  live.emit(id, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: text,
    start_ms: 0,
    end_ms: 100,
  });
  live.emit(id, {
    type: 'session.delegation.created',
    event_id: crypto.randomUUID(),
    offset_ms: 100,
    delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
  });
}

test('KÖ-01: datorn besvarar serverns kö i ordning och Escape avbryter bara i textvyn', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixtures = providers();
  const { app, read, value } = await arrange(page, fixtures);
  try {
    await send(page, 'Första uppdraget.');
    await expect.poll(() => fixtures.held.length).toBe(1);
    await send(page, 'Andra uppdraget.');
    await send(page, 'Tredje uppdraget.');
    await expect(log(page)).toContainText('2 meddelanden väntar. Tryck på Escape för att avbryta.');
    expect(fixtures.held.map((item) => item.message)).toEqual(['Första uppdraget.']);
    fixtures.held[0].release([modelMessage('Första svaret.')]);
    await expect.poll(() => fixtures.held.length).toBe(2);
    await expect(log(page)).toContainText('Första svaret.');
    await expect(log(page)).toContainText('1 meddelande väntar.');
    fixtures.held[1].release([modelMessage('Andra svaret.')]);
    await expect.poll(() => fixtures.held.length).toBe(3);
    expect(fixtures.held.map((item) => item.message)).toEqual([
      'Första uppdraget.',
      'Andra uppdraget.',
      'Tredje uppdraget.',
    ]);
    fixtures.held[2].release([modelMessage('Tredje svaret.')]);
    await expect(log(page)).not.toContainText('Skyttel arbetar…');
    const replies = log(page).locator('.assistant');
    await expect(replies).toHaveText([
      'Skyttel: Första svaret.',
      'Skyttel: Andra svaret.',
      'Skyttel: Tredje svaret.',
    ]);
    await field(page).press('Escape');
    await expect(region(page).locator('.text-view-canceled')).toBeEmpty();

    await turnMicrophoneOn(page);
    await turnMicrophoneOff(page);
    await send(page, 'Hållet uppdrag.');
    await send(page, 'Väntande uppdrag.');
    await expect(log(page)).toContainText('1 meddelande väntar.');
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Skriv till Skyttel', exact: true })
      .focus();
    await page.keyboard.press('Escape');
    await expect(log(page)).toContainText('Skyttel arbetar…');
    await field(page).fill('Text som inte skickas');
    await field(page).press('Escape');
    await expect(region(page).locator('.text-view-canceled')).toHaveText(canceled);
    await expect(region(page).locator('.text-view-canceled')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    await expect(log(page)).not.toContainText('Skyttel arbetar…');
    await expect(field(page)).toHaveValue('Text som inte skickas');
    await expect
      .poll(async () =>
        page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks[0]?.state),
      )
      .toBe('ended');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    const before = (await read()).draft;
    fixtures.held[3].release([
      modelTool('propose_object', {
        version: before.version,
        contentVersion: (await read()).contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect.poll(async () => (await read()).draft).toEqual(before);
    await closeConversationText(page);
    await expect(page.getByText(canceled, { exact: true })).toHaveCount(0);
    await openConversationText(page);
    await expect(region(page).locator('.text-view-canceled')).toHaveText(canceled);
    await send(page, 'Ny uppgift.');
    await expect(region(page).locator('.text-view-canceled')).toBeEmpty();
    await send(page, 'Bort med kön.');
    await expect(log(page)).toContainText('1 meddelande väntar.');
    await region(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(log(page)).not.toContainText('Skyttel arbetar…');
    fixtures.held[4].release([modelMessage('För sent igen.')]);
    await send(page, 'Efter nytt samtal.');
    await expect.poll(() => fixtures.held.length).toBe(6);
    expect(fixtures.held.map((item) => item.message)).not.toContain('Väntande uppdrag.');
    expect(fixtures.held.map((item) => item.message)).not.toContain('Bort med kön.');
    fixtures.held[5].release([modelMessage('Efter nytt.')]);
    await expect(log(page)).toContainText('Efter nytt.');
  } finally {
    for (const item of fixtures.held) item.release([]);
    await app.close();
  }
});

test('KÖ-02: smal dator visar stopp, behåller oskickad text och tillåter Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 900 });
  const fixtures = providers();
  const { app, read } = await arrange(page, fixtures);
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Ett uppdrag åt gången.');
    await expect.poll(() => fixtures.held.length).toBe(1);
    await expect(region(page).getByRole('button', { name: 'Skicka', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Avbryt', exact: true })).toHaveCount(1);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await field(page).fill('Oskickad text');
    await field(page).press('Enter');
    expect(fixtures.held).toHaveLength(1);
    await expect(log(page)).toContainText('0 meddelanden väntar.');
    const before = (await read()).draft;
    const stop = region(page).getByRole('button', { name: 'Avbryt', exact: true });
    const box = await stop.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
    const corner = await voiceBox(page).boundingBox();
    if (!box || !corner) throw new Error('Missing visible stop or voice box');
    expect(
      box.y + box.height <= corner.y ||
        corner.y + corner.height <= box.y ||
        box.x + box.width <= corner.x ||
        corner.x + corner.width <= box.x,
    ).toBe(true);
    await stop.click();
    await expect(region(page).locator('.text-view-canceled')).toHaveText(canceled);
    await expect(field(page)).toHaveValue('Oskickad text');
    await expect(field(page)).toBeFocused();
    await expect
      .poll(async () =>
        page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks[0]?.state),
      )
      .toBe('ended');
    await expect.poll(async () => (await read()).draft).toEqual(before);
    fixtures.held[0].release([modelMessage('Ett sent svar.')]);
    await expect(log(page)).not.toContainText('Ett sent svar.');
    await send(page, 'Avbryt med tangentbord.');
    await expect.poll(() => fixtures.held.length).toBe(2);
    await field(page).press('Escape');
    await expect(region(page).locator('.text-view-canceled')).toHaveText(canceled);
    fixtures.held[1].release([]);

    // Escape while Skyttel only speaks neither silences nor cancels.
    await expect
      .poll(async () => page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers))
      .toBe(1);
    await expect
      .poll(async () =>
        page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks.at(-1)?.state),
      )
      .toBe('live');
    await expect.poll(() => fixtures.live.channels.size).toBe(1);
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true, 0.2));
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    const tracks = await page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks);
    await field(page).press('Escape');
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks)).toEqual(
      tracks,
    );
  } finally {
    for (const item of fixtures.held) item.release([]);
    await app.close();
  }
});

test('KÖ-03: röstrutans stopp avbryter talat arbete och textkön utan att ändra utkastet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixtures = providers();
  const { app, read } = await arrange(page, fixtures);
  try {
    await turnMicrophoneOn(page);
    speak(fixtures.live, 'Hållet talat uppdrag.');
    await expect.poll(() => fixtures.held.length).toBe(1);
    await expect(log(page)).toContainText('Skyttel arbetar…');
    speak(fixtures.live, 'Väntande talat uppdrag.');
    await expect(log(page)).toContainText('1 meddelande väntar.');
    await send(page, 'Väntande text.');
    await expect(log(page)).toContainText('2 meddelanden väntar.');
    await turnMicrophoneOff(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    const before = (await read()).draft;
    await voiceBox(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(region(page).locator('.text-view-canceled')).toHaveText(canceled);
    await expect(log(page)).not.toContainText('Skyttel arbetar…');
    await expect
      .poll(async () =>
        page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks[0]?.state),
      )
      .toBe('ended');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    fixtures.held[0].release([modelMessage('För sent.')]);
    await send(page, 'Ett nytt textuppdrag.');
    await expect.poll(() => fixtures.held.length).toBe(2);
    expect(fixtures.held.map((item) => item.message)).toEqual([
      'Hållet talat uppdrag.',
      'Ett nytt textuppdrag.',
    ]);
    fixtures.held[1].release([modelMessage('Textsvaret.')]);
    await expect(log(page)).toContainText('Textsvaret.');
    await expect.poll(async () => (await read()).draft).toEqual(before);
    expect(
      fixtures.live.sent.filter(({ event }) => event.type === 'session.commentary.append'),
    ).toHaveLength(0);
  } finally {
    for (const item of fixtures.held) item.release([]);
    await app.close();
  }
});

test.describe('Pekskärm', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('KÖ-04: mobilens stopp skickar inte oskickad text och köar inget meddelande', async ({
    page,
  }) => {
    const fixtures = providers();
    const { app, read } = await arrange(page, fixtures);
    try {
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await send(page, 'Mobiluppdrag.');
      await expect.poll(() => fixtures.held.length).toBe(1);
      await field(page).fill('Ska ligga kvar');
      await field(page).press('Enter');
      await field(page).press('Escape');
      await expect(log(page)).toContainText('Skyttel arbetar… 0 meddelanden väntar.');
      await expect(log(page)).not.toContainText('Tryck på Escape');
      await expect(page.getByRole('button', { name: 'Avbryt', exact: true })).toHaveCount(1);
      const before = (await read()).draft;
      await region(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
      await expect(region(page).locator('.text-view-canceled')).toHaveText(canceled);
      await expect(field(page)).toHaveValue('Ska ligga kvar');
      fixtures.held[0].release([modelMessage('För sent på mobilen.')]);
      await expect(log(page)).not.toContainText('För sent på mobilen.');
      await expect.poll(async () => (await read()).draft).toEqual(before);
      expect(fixtures.held).toHaveLength(1);
    } finally {
      for (const item of fixtures.held) item.release([]);
      await app.close();
    }
  });
});
