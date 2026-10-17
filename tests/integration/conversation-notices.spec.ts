import type { Locator, Page } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  microphoneButton,
  startConversationWithText,
  startConversationWithVoice,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

const disconnectedActive =
  'Ingen kontakt med Skyttel. Mikrofonen är av. Slå på den igen när kontakten är tillbaka.';
const disconnectedIdle = 'Ingen kontakt med Skyttel. Försök igen när kontakten är tillbaka.';
const unavailable =
  'Samtal med Skyttel är inte tillgängligt just nu. Kontakta administratören om det fortsätter.';
const failed = 'Skyttel kunde inte slutföra uppdraget. Försök igen.';
// Availability and recovery can wait for the five-second HTTP check plus its response.
const networkRecheckTimeout = 10_000;
const notice = (page: Page) => page.getByRole('region', { name: 'Samtalsnotis', exact: true });
const textView = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const textButton = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Kartans verktyg' })
    .getByRole('button', { name: 'Skriv till Skyttel', exact: true });
const field = (page: Page) => page.getByLabel('Meddelande till Skyttel');
const assertive = (page: Page) => page.locator('.notice-announcement[aria-live="assertive"]');
const polite = (page: Page) => page.locator('.notice-announcement[aria-live="polite"]');
async function openMap(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  await page.request.post(`${path}/draft`, {
    headers: { origin },
    data: {
      version: 0,
      contentVersion: 1,
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' },
    },
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(origin);
  await expect(microphoneButton(page)).toBeVisible();
  return household.id as string;
}
async function configured(model = textModel(() => [modelMessage('Hej.')])) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  return { app, live, model };
}
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Missing visible element');
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

async function noticeContentFits(page: Page, scroll = false) {
  const card = notice(page);
  for (const child of await card.locator('p, button').all()) {
    if (scroll) await child.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const outer = await bounds(card);
        const inner = await bounds(child);
        return (
          inner.y >= outer.y &&
          inner.bottom <= outer.bottom &&
          inner.x >= outer.x &&
          inner.right <= outer.right
        );
      })
      .toBe(true);
  }
  if (await textView(page).isVisible()) {
    const cardBox = await bounds(card);
    const composer = await bounds(page.locator('.text-view-message'));
    expect(cardBox.bottom).toBeLessThanOrEqual(composer.y + 1);
  }
}

async function uncovered(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        if (
          box.width <= 0 ||
          box.height <= 0 ||
          box.left < 0 ||
          box.top < 0 ||
          box.right > innerWidth ||
          box.bottom > innerHeight
        )
          return false;
        return [
          [box.left + 8, box.top + 8],
          [box.right - 8, box.bottom - 8],
          [box.left + box.width / 2, box.top + box.height / 2],
        ].every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit !== null && element.contains(hit);
        });
      }),
    )
    .toBe(true);
}

test('NOT-01: utan samtal visar avstängda samtalsknappar en stängbar notis utan att öppna textvyn', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await openMap(page, app.origin);
    const conversationWrites: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/text-assistant'))
        conversationWrites.push(request.url());
    });
    await expect(notice(page)).toHaveCount(0);
    for (const button of [microphoneButton(page), textButton(page)]) {
      await expect(button).toBeEnabled();
      await expect(button).not.toHaveAttribute('aria-disabled');
      await expect(button).toHaveAccessibleDescription(/Inte tillgängligt just nu\./);
      await expect(button).toHaveCSS('opacity', '0.45');
    }
    await microphoneButton(page).click();
    await expect(notice(page)).toContainText(unavailable);
    await expect(microphoneButton(page)).toBeFocused();
    await expect(textView(page)).toHaveCount(0);
    await expect(assertive(page)).toHaveText(unavailable);
    await expect(notice(page).locator('.conversation-notice-symbol svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeFocused();
    await expect(polite(page)).not.toHaveText('Samtal med Skyttel är tillgängligt igen.');
    // Text and draft access remain independent of conversation availability.
    await textButton(page).click();
    await expect(textView(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(page.getByRole('region', { name: 'Arbetsyta', exact: true })).toHaveAttribute(
      'data-session-active',
      'false',
    );
    await expect(page.getByRole('dialog', { name: 'Samtal med Skyttel', exact: true })).toHaveCount(
      0,
    );
    await expect(
      textView(page).getByRole('button', { name: 'Nytt samtal', exact: true }),
    ).toBeDisabled();
    await expect(notice(page)).toContainText(unavailable);
    await expect(field(page)).toBeFocused();
    await uncovered(notice(page));
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeFocused();
    await textView(page).getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await expect(textView(page)).toHaveCount(0);
    await expect(textButton(page)).toBeFocused();
    expect(conversationWrites).toEqual([]);
    await expect(page.getByRole('region', { name: 'Teckenförklaring i kartan' })).toContainText(
      'Grönt +: föreslås läggas till',
    );
  } finally {
    await app.close();
  }
});

test('NOT-02: bruten kontakt stoppar mikrofon och sändning medan texten går att skriva och läsa', async ({
  page,
}) => {
  const { app, model } = await configured();
  try {
    await openMap(page, app.origin);
    await startConversationWithVoice(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/messages')) sent.push(request.url());
    });
    await page.context().setOffline(true);
    await expect(notice(page)).toContainText(disconnectedActive);
    await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toHaveCount(0);
    await expect(microphoneButton(page)).toBeEnabled();
    await expect(microphoneButton(page)).not.toHaveAttribute('aria-disabled');
    await expect(microphoneButton(page)).toHaveAccessibleDescription(/Inte tillgängligt just nu\./);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(() =>
        page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks.at(-1)?.enabled),
      )
      .toBe(false);
    await textButton(page).click();
    await expect(textView(page).getByRole('log', { name: 'Samtalstext' })).toBeVisible();
    await expect(notice(page)).toHaveCount(1);
    await field(page).fill('Text som inte ska skickas än.');
    await field(page).press('Enter');
    await expect(field(page)).toHaveValue('Text som inte ska skickas än.');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    expect(sent).toHaveLength(0);
    expect(model.requests).toHaveLength(0);
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0, { timeout: networkRecheckTimeout });
    await expect(polite(page)).toHaveText('Kontakten med Skyttel är tillbaka.');
    await expect(microphoneButton(page)).toBeEnabled();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(() =>
        page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks.at(-1)?.enabled),
      )
      .toBe(false);
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => model.requests.length).toBe(1);
    await expect(field(page)).toHaveValue('');
    await microphoneButton(page).click();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await page.context().setOffline(false);
    await app.close();
  }
});

test('NOT-03: en notis flyttas till textvyn utan ny uppläsning och försvinner när kontakten återkommer', async ({
  page,
}) => {
  const { app } = await configured();
  try {
    await openMap(page, app.origin);
    await startConversationWithVoice(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await microphoneButton(page).focus();
    await page.context().setOffline(true);
    await expect(notice(page)).toContainText(disconnectedActive);
    await expect(microphoneButton(page)).toBeFocused();
    await expect(assertive(page)).toHaveText(disconnectedActive);
    await expect(
      page.locator('.voice-announcement:not(.voice-context-announcement)'),
    ).not.toHaveText('Mikrofonen är av');
    const identity = await notice(page).evaluateHandle((element) => element);
    await assertive(page)
      .locator('span')
      .evaluate((element) => {
        element.dataset.announcementIdentity = 'first';
      });
    await textButton(page).click();
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toHaveAttribute('data-inline', 'true');
    await expect(notice(page)).toHaveCount(1);
    expect(await notice(page).evaluate((element, first) => element === first, identity)).toBe(true);
    await expect(assertive(page).locator('span')).toHaveAttribute(
      'data-announcement-identity',
      'first',
    );
    const card = await bounds(notice(page));
    const composer = await bounds(page.locator('.text-view-message'));
    expect(card.bottom).toBeLessThanOrEqual(composer.y + 1);
    const content = await bounds(notice(page).locator('p'));
    expect(content.y).toBeGreaterThanOrEqual(card.y);
    expect(content.bottom).toBeLessThanOrEqual(card.bottom);
    expect(content.right).toBeLessThanOrEqual(card.right);
    await page.getByRole('button', { name: 'Stäng textvyn' }).click();
    await expect(
      page.locator('.conversation-corner').getByRole('region', { name: 'Samtalsnotis' }),
    ).toBeVisible();
    expect(await notice(page).evaluate((element, first) => element === first, identity)).toBe(true);
    await expect(assertive(page).locator('span')).toHaveAttribute(
      'data-announcement-identity',
      'first',
    );
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0, { timeout: networkRecheckTimeout });
    await expect(polite(page)).toHaveText('Kontakten med Skyttel är tillbaka.');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');

    // The second occurrence starts with the message field focused. Moving the
    // same card must neither steal that focus nor add a microphone announcement.
    await microphoneButton(page).click();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await textButton(page).click();
    await field(page).focus();
    await page.context().setOffline(true);
    await expect(notice(page)).toContainText(disconnectedActive);
    await expect(assertive(page)).toHaveText(disconnectedActive);
    await expect(
      page.locator('.voice-announcement:not(.voice-context-announcement)'),
    ).not.toHaveText('Mikrofonen är av');
    await expect(field(page)).toBeFocused();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    const focusedFieldIdentity = await notice(page).evaluateHandle((element) => element);
    await assertive(page)
      .locator('span')
      .evaluate((element) => {
        element.dataset.announcementIdentity = 'second';
      });
    await page.getByRole('button', { name: 'Stäng textvyn' }).click();
    expect(
      await notice(page).evaluate((element, first) => element === first, focusedFieldIdentity),
    ).toBe(true);
    await textButton(page).click();
    expect(
      await notice(page).evaluate((element, first) => element === first, focusedFieldIdentity),
    ).toBe(true);
    await expect(notice(page)).toHaveCount(1);
    await expect(notice(page)).toHaveAttribute('data-inline', 'true');
    await expect(assertive(page).locator('span')).toHaveAttribute(
      'data-announcement-identity',
      'second',
    );
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0, { timeout: networkRecheckTimeout });
    await expect(polite(page)).toHaveText('Kontakten med Skyttel är tillbaka.');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await page.context().setOffline(false);
    await app.close();
  }
});

test('NOT-04: bruten kontakt går före otillgängligt samtal och uppdragsfel', async ({ page }) => {
  const model = textModel(() => {
    throw new Error('Synthetic provider failure');
  });
  const { app } = await configured(model);
  try {
    await openMap(page, app.origin);
    await startConversationWithText(page);
    await field(page).fill('Ge ett förslag.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice(page)).toContainText(failed);
    app.setConversationAvailable(false);
    await expect(notice(page)).toContainText(unavailable, { timeout: networkRecheckTimeout });
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    await field(page).fill('Oskickad text finns kvar.');
    await page.context().setOffline(true);
    await expect(notice(page)).toContainText(disconnectedActive);
    await expect(notice(page)).toHaveCount(1);
    await page.context().setOffline(false);
    await expect(notice(page)).toContainText(unavailable, { timeout: networkRecheckTimeout });
    app.setConversationAvailable(true);
    await expect(notice(page)).toContainText(failed, { timeout: networkRecheckTimeout });
    await expect(polite(page)).toContainText('Samtal med Skyttel är tillgängligt igen.');
    await expect(field(page)).toHaveValue('Oskickad text finns kvar.');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled();
  } finally {
    await page.context().setOffline(false);
    await app.close();
  }
});

test('NOT-05: uppdragsfelet kan stängas eller försvinna vid nästa försök och fokus stannar logiskt', async ({
  page,
}) => {
  let fail = true;
  let release: ((output: unknown[]) => void) | undefined;
  const model = textModel(() =>
    fail
      ? Promise.reject(new Error('Synthetic provider failure'))
      : new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
  );
  const { app } = await configured(model);
  try {
    await openMap(page, app.origin);
    await startConversationWithText(page);
    await field(page).fill('Ge ett förslag.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice(page)).toContainText(failed);
    await expect(polite(page)).toHaveText(failed);
    await expect(field(page)).toBeFocused();
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeFocused();
    await field(page).fill('Försök igen.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice(page)).toContainText(failed);
    fail = false;
    await field(page).fill('Ett nytt försök.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect.poll(() => Boolean(release)).toBe(true);
    release?.([modelMessage('Ett nytt svar.')]);
    await expect(textView(page).getByRole('log')).toContainText('Ett nytt svar.');
  } finally {
    release?.([]);
    await app.close();
  }
});

test('NOT-06: en stängbar kontakt-notis försvinner automatiskt och nästa avbrott väntar på ett nytt tryck', async ({
  page,
}) => {
  const { app } = await configured();
  try {
    await openMap(page, app.origin);
    await page.context().setOffline(true);
    await expect(notice(page)).toHaveCount(0);
    await microphoneButton(page).click();
    await expect(notice(page)).toContainText(disconnectedIdle);
    await expect(textView(page)).toHaveCount(0);
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).focus();
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0, { timeout: networkRecheckTimeout });
    await expect(microphoneButton(page)).toBeFocused();
    await expect(polite(page)).toHaveText('Kontakten med Skyttel är tillbaka.');
    await page.context().setOffline(true);
    await expect(notice(page)).toHaveCount(0);
    await microphoneButton(page).click();
    await expect(notice(page)).toContainText(disconnectedIdle);
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).click();
    await expect(notice(page)).toHaveCount(0);
    await page.context().setOffline(false);
    await expect(microphoneButton(page)).not.toHaveAccessibleDescription(
      /Inte tillgängligt just nu\./,
      { timeout: networkRecheckTimeout },
    );
    // Dismissal does not produce a recovery announcement.
    await expect(polite(page)).toHaveText('');
  } finally {
    await page.context().setOffline(false);
    await app.close();
  }
});

for (const viewport of [
  { caseId: 'NOT-07', width: 1280, height: 900 },
  { caseId: 'NOT-16', width: 700, height: 900 },
  { caseId: 'NOT-17', width: 390, height: 844 },
  { caseId: 'NOT-18', width: 667, height: 375 },
  { caseId: 'NOT-19', width: 320, height: 640 },
  { caseId: 'NOT-20', width: 320, height: 250 },
]) {
  test(`${viewport.caseId}: notisen har sin plats och täcker inte kartans återkoppling vid ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    const { app } = await configured();
    try {
      await page.setViewportSize(viewport);
      if (viewport.height <= 450) await page.clock.install();
      await openMap(page, app.origin);
      await startConversationWithVoice(page);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(voiceBox(page)).toBeVisible();
      // Keep the temporary disconnection stable during the geometry checks.
      // Its transport grace period is covered by the voice tests.
      if (viewport.height <= 450)
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
      // A real browser can lose its provider connection independently of HTTP.
      await page.evaluate(() => window.skyttelVoiceFixture.disconnect());
      await expect(notice(page)).toContainText(disconnectedActive);
      const mapStatus = page.getByRole('region', { name: 'Kartans status', exact: true });
      if (viewport.height <= 450) {
        const context = page.getByRole('region', { name: 'Kartans sammanhang', exact: true });
        for (
          let tab = 0;
          tab < 30 && !(await context.evaluate((element) => element === document.activeElement));
          tab++
        ) {
          await page.keyboard.press('Tab');
        }
        await expect(context).toBeFocused();
        expect(await context.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
          'solid',
        );
        await context.press('PageDown');
        await expect
          .poll(() => context.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
        await context.press('End');
        const legend = page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true });
        await uncovered(legend.locator('p').last());
      }
      await mapStatus.scrollIntoViewIfNeeded();
      await expect(mapStatus).toContainText('Nya förslag är osparade');
      await expect
        .poll(async () => overlaps(await bounds(notice(page)), await bounds(mapStatus)))
        .toBe(false);
      const card = await bounds(notice(page));
      await uncovered(mapStatus);
      await uncovered(notice(page));
      expect(
        overlaps(
          card,
          await bounds(page.getByRole('button', { name: 'Återställ vy', exact: true })),
        ),
      ).toBe(false);
      await noticeContentFits(page);
      const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
      if (viewport.height <= 320) {
        for (
          let tab = 0;
          tab < 30 && !(await reset.evaluate((element) => element === document.activeElement));
          tab++
        ) {
          await page.keyboard.press('Tab');
        }
        await expect(reset).toBeFocused();
      } else await reset.scrollIntoViewIfNeeded();
      await uncovered(reset);
      await reset.hover();
      const camera = page
        .getByRole('navigation', { name: 'Kameravy', exact: true })
        .getByRole('button', { name: 'Navigera', exact: true });
      await camera.scrollIntoViewIfNeeded();
      await uncovered(camera);
      await camera.click({ trial: true });
      expect(overlaps(await bounds(notice(page)), await bounds(camera))).toBe(false);
      if (viewport.width <= 700) {
        expect(card.x).toBe(12);
        expect(card.width).toBe(viewport.width - 24);
      } else {
        expect(card.right).toBe(viewport.width - 24);
      }
      await page.evaluate(() => window.skyttelVoiceFixture.reconnect());
      if (viewport.height <= 450) await page.clock.resume();
      await expect(notice(page)).toHaveCount(0, { timeout: networkRecheckTimeout });
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await app.close();
    }
  });
}

for (const viewport of [
  { caseId: 'NOT-08', width: 1280, height: 900 },
  { caseId: 'NOT-21', width: 820, height: 1180 },
  { caseId: 'NOT-22', width: 390, height: 844 },
]) {
  test(`${viewport.caseId}: en uppdragsnotis står bredvid röstrutan utan att täcka återkoppling vid ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    const { app } = await configured(
      textModel(() => Promise.reject(new Error('Synthetic provider failure'))),
    );
    try {
      await page.setViewportSize(viewport);
      await openMap(page, app.origin);
      await startConversationWithVoice(page);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
      await textButton(page).click();
      await field(page).fill('Ge ett förslag.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(notice(page)).toContainText(failed);
      await page.getByRole('button', { name: 'Stäng textvyn' }).click();
      const box = await bounds(voiceBox(page));
      const card = await bounds(notice(page));
      const feedback = await bounds(
        page.getByRole('region', { name: 'Kartans status', exact: true }),
      );
      expect(overlaps(card, feedback)).toBe(false);
      expect(overlaps(card, box)).toBe(false);
      if (viewport.width <= 700) expect(card.bottom).toBeLessThan(box.y);
      else expect(card.y).toBeGreaterThan(box.bottom);
      await textButton(page).focus();
      await page.keyboard.press('Tab');
      await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(notice(page)).toHaveCount(0);
      await expect(microphoneButton(page)).toBeFocused();
      await expect(voiceBox(page)).toHaveText('Lyssnar');
    } finally {
      await app.close();
    }
  });
}
