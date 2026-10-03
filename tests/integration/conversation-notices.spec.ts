import { expect, type Locator, type Page, test } from '@playwright/test';
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
import { modelMessage, textModel } from '../support/text-model.js';

const disconnectedActive =
  'Ingen kontakt med Skyttel. Mikrofonen är av. Slå på den igen när kontakten är tillbaka.';
const disconnectedIdle = 'Ingen kontakt med Skyttel. Försök igen när kontakten är tillbaka.';
const unavailable =
  'Samtal med Skyttel är inte tillgängligt just nu. Kontakta administratören om det fortsätter.';
const failed = 'Skyttel kunde inte slutföra uppdraget. Försök igen.';
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

test('NOT-01: utan samtal visar avstängda samtalsknappar en stängbar notis utan att öppna textvyn', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await openMap(page, app.origin);
    await expect(notice(page)).toHaveCount(0);
    for (const button of [microphoneButton(page), textButton(page)]) {
      await expect(button).toBeEnabled();
      await expect(button).not.toHaveAttribute('aria-disabled');
      await expect(button).toHaveAccessibleDescription(/Inte tillgängligt just nu\./);
      await expect(button).toHaveCSS('opacity', '0.6');
      await button.click();
      await expect(notice(page)).toContainText(unavailable);
      await expect(button).toBeFocused();
      await expect(textView(page)).toHaveCount(0);
      await expect(assertive(page)).toHaveText(unavailable);
      await expect(notice(page).locator('svg')).toHaveAttribute('aria-hidden', 'true');
      await notice(page).getByRole('button', { name: 'Stäng notisen' }).click();
      await expect(notice(page)).toHaveCount(0);
      await expect(microphoneButton(page)).toBeFocused();
      await expect(polite(page)).not.toHaveText('Samtal med Skyttel är tillgängligt igen.');
    }
    await expect(page.getByRole('button', { name: 'Aktuell status', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Aktuell status', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Visa samtals- och utkastdetaljer' }),
    ).toHaveCount(0);
    await expect(page.getByText('1 förslag · privat utkast', { exact: true })).toBeVisible();
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
    await expect(microphoneButton(page)).toBeDisabled();
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
    await expect(notice(page)).toHaveCount(0);
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
    await expect(assertive(page)).toHaveText(disconnectedActive);
    await assertive(page)
      .locator('span')
      .evaluate((element) => {
        element.dataset.announcementIdentity = 'first';
      });
    await textButton(page).click();
    await expect(textView(page).getByRole('region', { name: 'Samtalsnotis' })).toBeVisible();
    await expect(notice(page)).toHaveCount(1);
    await expect(assertive(page).locator('span')).toHaveAttribute(
      'data-announcement-identity',
      'first',
    );
    const card = await bounds(notice(page));
    const composer = await bounds(page.locator('.text-view-message'));
    expect(card.bottom).toBeLessThanOrEqual(composer.y + 1);
    await page.getByRole('button', { name: 'Stäng textvyn' }).click();
    await expect(
      page.locator('.conversation-corner').getByRole('region', { name: 'Samtalsnotis' }),
    ).toBeVisible();
    await expect(assertive(page).locator('span')).toHaveAttribute(
      'data-announcement-identity',
      'first',
    );
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0);
    await expect(polite(page)).toHaveText('Kontakten med Skyttel är tillbaka.');
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
    await expect(notice(page)).toContainText(unavailable, { timeout: 7000 });
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    await field(page).fill('Oskickad text finns kvar.');
    await page.context().setOffline(true);
    await expect(notice(page)).toContainText(disconnectedActive);
    await expect(notice(page)).toHaveCount(1);
    await page.context().setOffline(false);
    await expect(notice(page)).toContainText(unavailable);
    app.setConversationAvailable(true);
    await expect(notice(page)).toContainText(failed, { timeout: 7000 });
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
    await textButton(page).click();
    await expect(notice(page)).toContainText(disconnectedIdle);
    await expect(textView(page)).toHaveCount(0);
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).focus();
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeFocused();
    await expect(polite(page)).toHaveText('Kontakten med Skyttel är tillbaka.');
    await page.context().setOffline(true);
    await expect(notice(page)).toHaveCount(0);
    await microphoneButton(page).click();
    await expect(notice(page)).toContainText(disconnectedIdle);
    await notice(page).getByRole('button', { name: 'Stäng notisen' }).click();
    await expect(notice(page)).toHaveCount(0);
    await page.context().setOffline(false);
    // Dismissal does not produce a recovery announcement.
    await expect(polite(page)).toHaveText('');
  } finally {
    await page.context().setOffline(false);
    await app.close();
  }
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 700, height: 900 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
]) {
  test(`NOT-07: notisen har sin plats och täcker inte kartans återkoppling vid ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    const { app } = await configured();
    try {
      await page.setViewportSize(viewport);
      await openMap(page, app.origin);
      await startConversationWithVoice(page);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(voiceBox(page)).toBeVisible();
      if (viewport.height <= 450) await page.getByText('Visningsval', { exact: true }).click();
      // A real browser can lose its provider connection independently of HTTP.
      await page.evaluate(() => window.skyttelVoiceFixture.disconnect());
      await expect(notice(page)).toContainText(disconnectedActive);
      const card = await bounds(notice(page));
      const feedback = await bounds(page.locator('.workspace-voice-controls'));
      expect(overlaps(card, feedback)).toBe(false);
      expect(
        overlaps(
          card,
          await bounds(page.getByRole('button', { name: 'Återställ vy', exact: true })),
        ),
      ).toBe(false);
      if (viewport.width <= 700) {
        expect(card.x).toBe(12);
        expect(card.width).toBe(viewport.width - 24);
      } else {
        expect(card.right).toBe(viewport.width - 24);
      }
      await page.evaluate(() => window.skyttelVoiceFixture.reconnect());
      await expect(notice(page)).toHaveCount(0);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await app.close();
    }
  });
}
