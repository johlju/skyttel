import { expect, type Locator, type Page, test } from '@playwright/test';
import { createHousehold, openSettings, signIn } from '../support/client.js';
import {
  chooseConversationVoice,
  consentBox,
  giveConversationConsent,
  microphoneButton,
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
  voiceAnnouncement,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

type Fixture = Window['skyttelVoiceFixture'];
const media = (page: Page) => page.evaluate(() => window.skyttelVoiceFixture.stats());
const sound = (page: Page, source: Parameters<Fixture['setSound']>[0], level: number) =>
  page.evaluate(
    ([source, level]) => window.skyttelVoiceFixture.setSound(source, level > 0, level),
    [source, level] as const,
  );
const stopIcon = (page: Page) =>
  voiceBox(page).getByRole('button', { name: 'Avbryt', exact: true });
const waveform = (page: Page) => voiceBox(page).locator('[aria-hidden="true"]').first();
const panel = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const messageField = (page: Page) => page.getByLabel('Meddelande till Skyttel');
async function sendMessage(page: Page, text: string) {
  await messageField(page).fill(text);
  await page.getByRole('button', { name: 'Skicka', exact: true }).click();
}
const bounds = async (control: Locator) => {
  const box = await control.boundingBox();
  if (!box) throw new Error('The control has no place on the screen');
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
};
const overlaps = (
  first: Awaited<ReturnType<typeof bounds>>,
  second: Awaited<ReturnType<typeof bounds>>,
) =>
  first.x < second.right &&
  second.x < first.right &&
  first.y < second.bottom &&
  second.y < first.bottom;
// The tallest of the seven bars, in pixels.
const tallestBar = (page: Page) =>
  waveform(page)
    .locator('i')
    .evaluateAll((bars) => Math.max(...bars.map((bar) => bar.getBoundingClientRect().height)));

/** What a person says, and that Skyttel takes it on as a task. */
function speak(live: ReturnType<typeof liveProvider>, text: string) {
  const session = [...live.channels.keys()].at(-1);
  if (!session) throw new Error('Missing live session');
  live.emit(session, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: text,
    start_ms: 0,
    end_ms: 100,
  });
  live.emit(session, {
    type: 'session.delegation.created',
    event_id: crypto.randomUUID(),
    offset_ms: 100,
    delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
  });
}
const answers = (live: ReturnType<typeof liveProvider>) =>
  live.sent.filter(({ event }) => event.type === 'session.commentary.append').length;

/** A model whose answer the test holds until it releases it. */
function heldModel() {
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  return {
    ...model,
    waiting: () => held.length,
    release: (output: unknown[]) => held.shift()?.(output),
  };
}
async function installation(modelFetch: typeof fetch) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  return { app, live };
}
/** The household's map with one suggested object in the draft and the controlled microphone. */
async function openMapWithDraft(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' };
  await page.request.post(`${path}/draft`, {
    headers: { origin },
    data: { version: 0, contentVersion: 1, id: 'lo', baseRevision: null, value },
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(origin);
  await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
  return { path, value };
}
async function listening(page: Page) {
  await expect(voiceBox(page)).toHaveText('Lyssnar');
  await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await media(page)).microphoneTracks.at(-1)?.enabled).toBe(true);
}

test('TAL-10: Prata med Skyttel slår på och av mikrofonen utan att någon panel öppnas', async ({
  page,
}) => {
  const { app, live } = await installation(textModel(() => [modelMessage('Hej.')]).provider);
  try {
    await openMapWithDraft(page, app.origin);
    const microphone = microphoneButton(page);
    await expect(microphone).toHaveAttribute('aria-pressed', 'false');
    await expect(microphone).toHaveAttribute(
      'title',
      'Prata med Skyttel (Ctrl+Mellanslag). Håll in för att tala tills du släpper.',
    );
    await expect(voiceBox(page)).toHaveCount(0);
    const off = await microphone.evaluate((button) => getComputedStyle(button).backgroundColor);

    // The welcome guide's start with voice does what the button does.
    await page
      .getByRole('complementary', { name: 'Kom igång med kartan' })
      .getByRole('button', { name: 'Tala', exact: true })
      .click();
    await expect(consentBox(page)).toBeVisible();
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('hold'));
    await giveConversationConsent(page);

    // While the voice starts, the name stays and the description says what a press does.
    await expect(voiceBox(page)).toHaveText('Rösten startar');
    await expect(waveform(page)).toHaveAttribute('data-form', 'dimmed');
    await expect(stopIcon(page)).toHaveCount(0);
    await expect(microphone).toHaveAccessibleName('Prata med Skyttel');
    await expect(microphone).toHaveAccessibleDescription('Avbryt starten av rösten');
    await expect(microphone).toHaveAttribute('aria-pressed', 'false');
    await expect(panel(page)).toHaveCount(0);

    // A short press cancels the start: no microphone is taken, and nothing reaches OpenAI.
    await microphone.click();
    await expect(voiceBox(page)).toHaveCount(0);
    await page.evaluate(() => window.skyttelVoiceFixture.releaseMicrophone());
    await expect
      .poll(async () => (await media(page)).microphoneTracks)
      .toEqual([{ enabled: false, state: 'ended' }]);
    expect(live.requests).toHaveLength(0);

    // A short press starts the voice. No panel opens: only the voice box is shown.
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('allow'));
    await expect(microphone).toBeEnabled();
    await microphone.click();
    await listening(page);
    await expect(microphone).toHaveAccessibleName('Prata med Skyttel');
    await expect(microphone).toHaveAttribute(
      'title',
      'Prata med Skyttel (Ctrl+Mellanslag). Håll in för att tala tills du släpper.',
    );
    await expect(panel(page)).toHaveCount(0);
    await expect(messageField(page)).toBeHidden();
    expect(
      await microphone.evaluate((button) => getComputedStyle(button).backgroundColor),
    ).not.toBe(off);
    expect(live.requests).toHaveLength(1);

    // A short press turns the microphone off. Quiet gaps cannot prove the answer is complete.
    await microphone.click();
    await expect(microphone).toHaveAttribute('aria-pressed', 'false');
    await expect(voiceBox(page)).toHaveCount(0);
    expect((await media(page)).microphoneTracks.at(-1)).toEqual({ enabled: false, state: 'live' });
    await expect(panel(page)).toHaveCount(0);
    await page.waitForTimeout(3500);
    expect((await media(page)).openPeers).toBe(1);

    // The same conversation goes on: the next press listens again without asking.
    await expect(microphone).toBeEnabled();
    await microphone.click();
    await listening(page);
    await expect(consentBox(page)).toHaveCount(0);
    expect(live.requests).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('TAL-11: Skyttel arbetar färdigt och talar klart när mikrofonen stängs av', async ({
  page,
}) => {
  const model = heldModel();
  const { app, live } = await installation(model.provider);
  try {
    const { path, value } = await openMapWithDraft(page, app.origin);
    await startConversationWithVoice(page);
    await listening(page);
    const before = await (await page.request.get(path)).json();

    speak(live, 'Rätta namnet till Lo Lind.');
    await expect.poll(() => model.waiting()).toBe(1);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await expect(voiceAnnouncement(page)).toHaveText('Skyttel arbetar');

    // The microphone is turned off in the middle of the work.
    await chooseConversationVoice(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect((await media(page)).microphoneTracks).toEqual([{ enabled: false, state: 'live' }]);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await expect(stopIcon(page)).toBeVisible();
    // The button can turn the microphone on again: the task was said, not written.
    await expect(microphoneButton(page)).toBeEnabled();
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).focus();

    // Skyttel finishes the work with what was said, and gets its answer to say.
    await sound(page, 'remote', 0.2);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    model.release([
      modelTool('propose_object', {
        version: before.draft.version,
        contentVersion: before.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'Lo Lind' },
      }),
    ]);
    await expect.poll(() => model.waiting()).toBe(1);
    model.release([modelMessage('Namnet är ändrat i utkastet.')]);
    await expect.poll(() => answers(live)).toBe(1);
    await expect
      .poll(async () => (await (await page.request.get(path)).json()).draft.changes[0].after.name)
      .toBe('Lo Lind');

    // Skyttel says its answer to the end. The box stays for it, and the connection with it.
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await expect(waveform(page)).toHaveAttribute('data-form', 'skyttel');
    expect((await media(page)).openPeers).toBe(1);
    expect((await media(page)).microphoneTracks).toEqual([{ enabled: false, state: 'live' }]);
    await sound(page, 'remote', 0);
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(voiceAnnouncement(page)).toHaveText('Mikrofonen är av');

    // A long pause in the answer does not close the connection or lose later output.
    await page.waitForTimeout(3500);
    expect((await media(page)).openPeers).toBe(1);
    await sound(page, 'remote', 0.2);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    expect((await media(page)).microphoneTracks).toEqual([{ enabled: false, state: 'live' }]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(live.requests).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('TAL-12: Avbryt i röstrutan stoppar arbetet och tystar Skyttel men behåller förslagen', async ({
  page,
}) => {
  const model = heldModel();
  const { app, live } = await installation(model.provider);
  try {
    const { path, value } = await openMapWithDraft(page, app.origin);
    await startConversationWithVoice(page);
    await listening(page);
    const before = await (await page.request.get(path)).json();
    await expect(stopIcon(page)).toHaveCount(0);

    // Skyttel works: the stop icon stops the work, and the earlier suggestion stays.
    speak(live, 'Rätta namnet.');
    await page.evaluate(() =>
      window.skyttelVoiceFixture.emit({
        type: 'session.input_transcript.delta',
        event_id: crypto.randomUUID(),
        delta: 'Rätta namnet.',
        start_ms: 0,
        end_ms: 100,
      }),
    );
    await expect.poll(() => model.waiting()).toBe(1);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await expect(stopIcon(page)).toHaveAttribute('title', 'Avbryt');
    await stopIcon(page).focus();
    await page.keyboard.press('Enter');
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(stopIcon(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeFocused();
    model.release([
      modelTool('propose_object', {
        version: before.draft.version,
        contentVersion: before.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect
      .poll(async () => (await (await page.request.get(path)).json()).draft)
      .toEqual(before.draft);
    expect(answers(live)).toBe(0);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await media(page)).silencedAudioElements).toBe(0);

    // Skyttel talks: retire that output stream, even if it later resumes after a pause.
    await sound(page, 'remote', 0.2);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    expect((await media(page)).silencedAudioElements).toBe(0);
    const previousTracks = (await media(page)).remoteTracks.length;
    await stopIcon(page).click();
    await expect
      .poll(async () => (await media(page)).remoteTracks[previousTracks - 1].state)
      .toBe('ended');
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    expect((await media(page)).microphoneTracks).toEqual([{ enabled: true, state: 'live' }]);
    await sound(page, 'remote', 0);
    await page.waitForTimeout(1500);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    // A new answer in the fresh connection is heard again.
    expect(live.requests.at(-1)?.session?.input).toEqual(
      expect.arrayContaining([
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Rätta namnet.' }],
          status: 'incomplete',
        },
      ]),
    );
    expect(JSON.stringify(live.requests.at(-1)?.session?.input)).not.toContain('För sent');
    await sound(page, 'remote', 0.2);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    expect((await (await page.request.get(path)).json()).draft).toEqual(before.draft);
  } finally {
    await app.close();
  }
});

test('TAL-13: ett skrivet meddelande visar aldrig röstrutan och stänger av mikrofonknappen', async ({
  page,
}) => {
  const model = heldModel();
  const { app, live } = await installation(model.provider);
  try {
    await openMapWithDraft(page, app.origin);
    await startConversationWithText(page);
    const microphone = microphoneButton(page);
    await expect(microphone).toBeEnabled();
    await expect(microphone).toHaveAttribute('aria-pressed', 'false');

    // Skyttel works with a written message, with the microphone off.
    await sendMessage(page, 'Beskriv utkastet.');
    await expect.poll(() => model.waiting()).toBe(1);
    await expect(microphone).toBeDisabled();
    await expect(voiceBox(page)).toHaveCount(0);
    model.release([modelMessage('Utkastet har ett förslag.')]);
    await expect(panel(page).getByRole('log')).toContainText('Utkastet har ett förslag.');
    await expect(microphone).toBeEnabled();
    await expect(voiceBox(page)).toHaveCount(0);

    // The user cancels the written task: the button is available again.
    await sendMessage(page, 'Beskriv det en gång till.');
    await expect.poll(() => model.waiting()).toBe(1);
    await expect(microphone).toBeDisabled();
    await panel(page).getByRole('textbox', { name: 'Meddelande till Skyttel' }).press('Escape');
    await expect(microphone).toBeEnabled();
    await expect(voiceBox(page)).toHaveCount(0);
    expect(live.requests).toHaveLength(0);
    expect((await media(page)).microphoneTracks).toEqual([]);

    // With the microphone on, a written message shows Skyttel arbetar with the stop icon.
    await microphone.click();
    await listening(page);
    await openConversationText(page);
    await sendMessage(page, 'Beskriv det nu.');
    await expect.poll(() => model.waiting()).toBe(2);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await expect(microphone).toBeEnabled();
    await stopIcon(page).click();
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(stopIcon(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('TAL-14: röstrutan visar ett statusord åt gången och en vågform som följer rösten', async ({
  page,
}) => {
  const model = heldModel();
  const { app, live } = await installation(model.provider);
  try {
    await openMapWithDraft(page, app.origin);
    await startConversationWithVoice(page);
    await listening(page);
    const box = voiceBox(page);
    const wave = waveform(page);
    const bars = wave.locator('i');
    const height = async () => (await bounds(box)).height;
    const heights = () =>
      bars.evaluateAll((items) => items.map((bar) => bar.getBoundingClientRect().height));

    // Lyssnar: seven dots in the accent colour. Only the status word is there to read.
    await expect(bars).toHaveCount(7);
    await expect(wave).toHaveAttribute('data-form', 'still');
    await expect(box.getByRole('button')).toHaveCount(0);
    expect(await heights()).toEqual(Array(7).fill(4));
    const listeningWidth = (await bounds(box)).width;
    expect(await height()).toBe(36);
    const accent = await bars.first().evaluate((bar) => getComputedStyle(bar).backgroundColor);

    // Du talar: the bars follow the sound level from the microphone.
    await sound(page, 'microphone', 0.08);
    await expect(box).toHaveText('Du talar');
    await expect(wave).toHaveAttribute('data-form', 'user');
    await expect.poll(() => tallestBar(page)).toBeGreaterThan(4);
    const quiet = await tallestBar(page);
    expect(quiet).toBeLessThan(8);
    await sound(page, 'microphone', 0.9);
    await expect.poll(() => tallestBar(page)).toBeGreaterThan(12);
    expect(await bars.first().evaluate((bar) => getComputedStyle(bar).backgroundColor)).toBe(
      accent,
    );
    expect(await height()).toBe(36);

    // Skyttel talar goes before Du talar: an even wave in the text colour.
    await sound(page, 'remote', 0.2);
    await expect(box).toHaveText('Skyttel talar');
    await expect(wave).toHaveAttribute('data-form', 'skyttel');
    await expect(bars.first()).not.toHaveCSS('animation-name', 'none');
    expect(await bars.first().evaluate((bar) => getComputedStyle(bar).backgroundColor)).toBe(
      await box.evaluate((element) => getComputedStyle(element).color),
    );
    await expect(stopIcon(page)).toBeVisible();
    expect(await height()).toBe(36);

    // Skyttel arbetar goes before both: the dots are still.
    speak(live, 'Beskriv utkastet.');
    await expect.poll(() => model.waiting()).toBe(1);
    await expect(box).toHaveText('Skyttel arbetar');
    await expect(wave).toHaveAttribute('data-form', 'still');
    expect(await heights()).toEqual(Array(7).fill(4));
    expect(await height()).toBe(36);
    // The width follows the word, and the height does not.
    expect((await bounds(box)).width).toBeGreaterThan(listeningWidth);
    model.release([modelMessage('Utkastet har ett förslag.')]);
    await expect(box).toHaveText('Skyttel talar');

    // Reduced motion: two fixed forms that change without a transition.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(bars.first()).toHaveCSS('animation-name', 'none');
    await expect(bars.first()).toHaveCSS('transition-duration', '0s');
    const still = await heights();
    expect(Math.max(...still)).toBeGreaterThan(4);
    await sound(page, 'remote', 0);
    await expect(box).toHaveText('Du talar');
    expect(await heights()).toEqual(still);
    await sound(page, 'microphone', 0.08);
    await expect(box).toHaveText('Du talar');
    expect(await heights()).toEqual(still);
    await sound(page, 'microphone', 0);
    await expect(box).toHaveText('Lyssnar');
    expect(await heights()).toEqual(Array(7).fill(4));
    expect(await height()).toBe(36);
    await expect(page.getByText('Mikrofonen är av', { exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

for (const [name, width, height, place] of [
  ['dator', 1280, 800, 'top'],
  ['bred pekskärm', 820, 1180, 'top'],
  ['smal skärm', 390, 844, 'bottom'],
] as const)
  test(`röstrutan står på sin plats på ${name} och täcker aldrig kartans rad eller återkoppling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const model = heldModel();
    const { app, live } = await installation(model.provider);
    try {
      await openMapWithDraft(page, app.origin);
      await startConversationWithVoice(page);
      await listening(page);
      // The map says what it did in its common feedback.
      await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
      const feedback = page.locator('.workspace-feedback');
      await expect(feedback).toContainText('Översikt återställd');
      const row = page.locator('.spatial-bottom-bar');
      const feedbackHeight = (await bounds(feedback)).height;
      const check = async () => {
        const box = await bounds(voiceBox(page));
        const margin = place === 'top' ? 24 : 12;
        expect(Math.round(width - box.right)).toBe(margin);
        if (place === 'top') expect(Math.round(box.y)).toBe(24);
        else {
          // At the bottom edge the box stands on the status card, below the map's row.
          const card = await bounds(page.locator('.workspace-voice-controls'));
          expect(Math.round(card.y - box.bottom)).toBe(12);
          expect(Math.round(height - card.bottom)).toBeLessThanOrEqual(24 + feedbackHeight);
          expect(box.y).toBeGreaterThan((await bounds(row)).bottom);
        }
        expect(overlaps(box, await bounds(feedback))).toBe(false);
        expect(overlaps(box, await bounds(row))).toBe(false);
        // The box stands above the feedback, wherever on the screen the two are.
        expect(box.bottom).toBeLessThanOrEqual((await bounds(feedback)).y);
        return box;
      };
      const first = await check();

      // A longer status word and the stop icon make the box wider. It stays in its place.
      speak(live, 'Beskriv utkastet.');
      await expect.poll(() => model.waiting()).toBe(1);
      await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
      const working = await check();
      // At the bottom edge the box stands on the status card, which grows while Skyttel works.
      if (place === 'top') expect(working.y).toBe(first.y);
      expect(working.height).toBe(first.height);
      expect(working.width).toBeGreaterThan(first.width);
      const stop = await bounds(stopIcon(page));
      expect(stop.width).toBeGreaterThanOrEqual(24);
      expect(stop.height).toBeGreaterThanOrEqual(24);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    } finally {
      await app.close();
    }
  });

test('TAL-16: hjälpmedel får röstrutans namn, knappens läge och uppläsningarna i tur', async ({
  page,
}) => {
  const model = heldModel();
  const { app, live } = await installation(model.provider);
  try {
    await openMapWithDraft(page, app.origin);
    const announcement = voiceAnnouncement(page);
    await expect(announcement).toHaveAttribute('aria-live', 'polite');
    await expect(announcement).toHaveText('');

    // The focus is on the button: a screen reader says its state, and nothing more is read.
    await startConversationWithVoice(page);
    await listening(page);
    await expect(announcement).toHaveText('');
    await expect(microphoneButton(page)).toHaveAccessibleName('Prata med Skyttel');
    await microphoneButton(page).click();
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(announcement).toHaveText('');

    // The focus is elsewhere: Lyssnar is read once when the microphone is turned on.
    expect((await media(page)).openPeers).toBe(1);
    await expect(microphoneButton(page)).toBeEnabled();
    // Activate without moving the focus from the map.
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).focus();
    await microphoneButton(page).evaluate((button: HTMLButtonElement) => button.click());
    await listening(page);
    await expect(announcement).toHaveText('Lyssnar');
    const told = await announcement.locator('span').evaluateHandle((element) => element);

    // The box is a named group. The waveform is hidden, and the word can always be read there.
    const box = voiceBox(page);
    await expect(box).toHaveRole('group');
    await expect(box).toHaveAccessibleName('Röstruta');
    await expect(waveform(page)).toHaveAttribute('aria-hidden', 'true');
    await expect(box.getByText('Lyssnar', { exact: true })).toBeVisible();

    // Du talar is not read, and Lyssnar is not read again when it comes back after talk.
    await sound(page, 'microphone', 0.2);
    await expect(box).toHaveText('Du talar');
    await sound(page, 'microphone', 0);
    await expect(box).toHaveText('Lyssnar');
    expect(
      await announcement.locator('span').evaluate((element, first) => element === first, told),
    ).toBe(true);

    // Skyttel arbetar is read. Skyttel talar is not: the voice is heard.
    speak(live, 'Beskriv utkastet.');
    await expect.poll(() => model.waiting()).toBe(1);
    await expect(announcement).toHaveText('Skyttel arbetar');
    model.release([modelMessage('Utkastet har ett förslag.')]);
    await sound(page, 'remote', 0.2);
    await expect(box).toHaveText('Skyttel talar');
    await expect(announcement).toHaveText('Skyttel arbetar');
    await expect(stopIcon(page)).toHaveAccessibleName('Avbryt');

    // The tab order: the two conversation buttons, then the stop icon, then the other tools.
    await microphoneButton(page).focus();
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('navigation', { name: 'Kartans verktyg' })
        .getByRole('button', { name: 'Skriv till Skyttel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(stopIcon(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('navigation', { name: 'Kartans verktyg' })
        .getByRole('button', { name: 'Sök i kartan', exact: true }),
    ).toBeFocused();

    // The microphone is turned off with the focus elsewhere: it is read when the box goes.
    await microphoneButton(page).click();
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).focus();
    await expect(box).toHaveText('Skyttel talar');
    await expect(announcement).toHaveText('Skyttel arbetar');
    await sound(page, 'remote', 0);
    await expect(box).toHaveCount(0);
    await expect(announcement).toHaveText('Mikrofonen är av');

    // Settings keep the map loaded: the voice box follows the voice there too.
    expect((await media(page)).openPeers).toBe(1);
    await expect(microphoneButton(page)).toBeEnabled();
    await microphoneButton(page).click();
    await listening(page);
    await openSettings(page);
    await expect(
      page.getByRole('heading', { name: 'Inställningar', level: 1, exact: true }),
    ).toBeFocused();
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await sound(page, 'remote', 0.2);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await expect(stopIcon(page)).toBeVisible();
    expect((await media(page)).openPeers).toBe(1);
    await stopIcon(page).focus();
    await page.keyboard.press('Enter');
    await expect(stopIcon(page)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }),
    ).toBeFocused();
  } finally {
    await app.close();
  }
});
