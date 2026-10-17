import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { focusMapSearch } from '../support/object-search.js';
import { expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

test('YTA-05: save results remain readable beside tablet work', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Tabell', exact: true })
      .click();
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Familjens gemensamma cykel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    const status = page.locator('.draft-save-toast');
    await expect(status).toBeVisible();
    const size = await status.boundingBox();
    expect(size?.x).toBeGreaterThanOrEqual(0);
    expect((size?.x ?? 0) + (size?.width ?? 0)).toBeLessThanOrEqual(768);
    expect(size?.height).toBeLessThan(160);
    await expect(status).toHaveCount(0, { timeout: 4500 });
    await openMap(page);
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Familjens gemensamma cykel', exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('YTA-01: map tools protect unsent object loss and preserve staged work when closed', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    await expect(tools).toBeVisible();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).not.toBeVisible();
    await tools.getByRole('button', { name: 'Visa verktygens namn' }).click();
    await expect(tools.getByText('Tabell', { exact: true })).toBeVisible();
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Cykeln');
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Cykeln');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openMap(page);
    await expect(tools.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeEnabled();
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).toContainText('Cykeln');
    await saveReviewedConflictDraft(page);
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Cykeln', exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('YTA-03: narrow screens keep tools, help and text work reachable without graphics', async ({
  page,
}) => {
  const model = textModel(() => [modelMessage('Du kan skriva här.')]);
  const installation = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(installation.origin);
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Hoppa till innehållet', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Till verktygen', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      const skip = page.getByRole('button', { name: 'Till tabellen', exact: true });
      await expect(skip).toBeFocused();
      expect(
        await skip.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
          );
        }),
      ).toBe(true);
      await tools.getByRole('button', { name: 'Information och hjälp', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Information och hjälp' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        tools.getByRole('button', { name: 'Information och hjälp', exact: true }),
      ).toBeFocused();
      await tools.getByRole('button', { name: 'Visa verktygens namn' }).click();
      await tools.getByRole('button', { name: 'Information och hjälp', exact: true }).click();
      await tools.getByRole('button', { name: 'Dölj verktygens namn', exact: true }).click();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Stäng verktyget', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        tools.getByRole('button', { name: 'Information och hjälp', exact: true }),
      ).toBeFocused();
      await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).not.toBeVisible();
      await openNewObject(page);
      await page.getByLabel('Namn', { exact: true }).fill('Min cykel');
      await expect(
        page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page
        .getByRole('dialog', { name: 'Nytt objekt', exact: true })
        .getByRole('button', { name: 'Stäng objektdialogen', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await openMap(page);
      await expect(tools.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeEnabled();
      await focusMapSearch(page);
      await expect(
        page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      const draft = await openDraftReview(page);
      await expect(draft).toBeVisible();
      await closeTextView(page);
      await openMap(page);
      await startConversationWithText(page);
      await expect(
        page.getByRole('region', { name: 'Skriv till Skyttel', exact: true }),
      ).toBeVisible();
      const conversation = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
      await conversation
        .getByLabel('Meddelande till Skyttel', { exact: true })
        .fill('Jag vill skriva här.');
      await conversation.getByRole('button', { name: 'Skicka', exact: true }).click();
      const transcript = conversation.getByRole('log', { name: 'Samtalstext', exact: true });
      const sent = transcript.getByRole('listitem').filter({ hasText: 'Jag vill skriva här.' });
      const reply = transcript.getByRole('listitem').filter({ hasText: 'Du kan skriva här.' });
      await expect(sent).toHaveText('Du: Jag vill skriva här.');
      await expect(sent).toBeVisible();
      await expect(reply).toHaveText('Skyttel: Du kan skriva här.');
      await expect(reply).toBeVisible();
      const unsent = 'Oskickat meddelande medan hjälpen läses';
      await conversation.getByLabel('Meddelande till Skyttel', { exact: true }).fill(unsent);
      const retained = await (await page.request.get(path)).json();
      await tools.getByRole('button', { name: 'Visa verktygens namn' }).click();
      const help = tools.getByRole('button', { name: 'Information och hjälp', exact: true });
      await help.click();
      await expect(page.getByRole('heading', { name: 'Information och hjälp' })).toBeFocused();
      await tools.getByRole('button', { name: 'Dölj verktygens namn', exact: true }).click();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Stäng verktyget', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(help).toBeFocused();
      expect(
        await help.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
          );
        }),
      ).toBe(true);
      await openConversationText(page);
      await expect(sent).toHaveText('Du: Jag vill skriva här.');
      await expect(sent).toBeVisible();
      await expect(reply).toHaveText('Skyttel: Du kan skriva här.');
      await expect(reply).toBeVisible();
      await expect(conversation.getByLabel('Meddelande till Skyttel', { exact: true })).toHaveValue(
        unsent,
      );
      const retainedDraft = await openDraftReview(page);
      await expect(retainedDraft).toContainText('Utkastet är tomt.');
      expect(await (await page.request.get(path)).json()).toEqual(retained);
      await expect(conversation.getByLabel('Meddelande till Skyttel', { exact: true })).toHaveValue(
        unsent,
      );
    }
  } finally {
    await installation.close();
  }
});

test('YTA-04: loading and a failed map read offer a working next action', async ({ page }) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/map?*', async (route) => {
      await held;
      await route.abort();
    });
    await page.goto(installation.origin);
    await expect(page.getByText('Hushållets karta hämtas…')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Kartans verktyg', exact: true }),
    ).toBeVisible();
    release();
    await expect(page.getByRole('alert')).toContainText('kunde inte');
    await page.unroute('**/map?*');
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  } finally {
    release();
    await installation.close();
  }
});

test('YTA-02: theme choice returns focus and System follows the device', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(installation.origin);
    const workspace = page.getByRole('region', { name: 'Hushållskarta', exact: true });
    const themeButton = page.getByRole('button', { name: /^Tema:/ });
    const checkSkipLinks = async () => {
      await page.getByRole('link', { name: 'Hoppa till innehållet', exact: true }).focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      for (const [role, name] of [
        ['link', 'Hoppa till innehållet'],
        ['link', 'Till verktygen'],
        ['button', 'Till tabellen'],
        ['button', 'Till samtalet med Skyttel'],
      ] as const) {
        const control = page.getByRole(role, { name, exact: true });
        await expect(control).toBeFocused();
        const appearance = await control.evaluate((element) => {
          const style = getComputedStyle(element);
          const luminance = (color: string) => {
            if (!/^rgb\(\d+, \d+, \d+\)$/.test(color))
              throw new Error(`Expected an opaque RGB skip-link color, received ${color}`);
            const channels = (color.match(/\d+/g) ?? [])
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const unit = value / 255;
                return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
              });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const foreground = luminance(style.color);
          const background = luminance(style.backgroundColor);
          const rect = element.getBoundingClientRect();
          return {
            contrast:
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
            outline: style.outlineStyle,
            focusVisible: element.matches(':focus-visible'),
            unobscured: element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            ),
          };
        });
        expect(appearance.contrast, name).toBeGreaterThanOrEqual(4.5);
        expect(appearance.focusVisible, name).toBe(true);
        expect(appearance.outline, name).not.toBe('none');
        expect(appearance.unobscured, name).toBe(true);
        await page.keyboard.press('Tab');
      }
    };
    await themeButton.click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await checkSkipLinks();
    await page.reload();
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await themeButton.click();
    await page.getByRole('radio', { name: 'Ljust', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await expect(workspace).toHaveAttribute('data-theme', 'light');
    await checkSkipLinks();
    await themeButton.click();
    await page.getByRole('radio', { name: 'System', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await checkSkipLinks();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(workspace).toHaveAttribute('data-theme', 'light');
    await checkSkipLinks();
    await themeButton.click();
    await page.keyboard.press('Escape');
    await expect(themeButton).toBeFocused();
  } finally {
    await installation.close();
  }
});

for (const theme of ['light', 'dark'] as const) {
  const caseId = theme === 'light' ? 'YTA-06' : 'YTA-10';
  test(`${caseId}: empty mobile maps keep focused display choices readable and operable in ${theme}`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(installation.origin);
      for (const height of [900, 568, 451]) {
        await page.setViewportSize({ width: 320, height });
        const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
        const labels = page.getByRole('button', { name: 'Alla etiketter', exact: true });
        for (const target of [reset, labels]) {
          await target.focus();
          await expect(target).toBeFocused();
          const visible = await target.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const label = element.closest('label') ?? element;
            const bounds = label.getBoundingClientRect();
            return {
              centerHit: element.contains(
                document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
              ),
              labelHit: label.contains(
                document.elementFromPoint(bounds.right - 2, bounds.y + bounds.height / 2),
              ),
              within:
                bounds.left >= 0 &&
                bounds.right <= innerWidth &&
                bounds.top >= 0 &&
                bounds.bottom <= innerHeight,
            };
          });
          expect(visible).toEqual({ centerHit: true, labelHit: true, within: true });
        }
        const navigate = page.getByRole('button', { name: 'Navigera', exact: true });
        await navigate.focus();
        await page.keyboard.press('Enter');
        const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
        const heightHelp = navigation.getByRole('checkbox', {
          name: 'Visa höjdhjälp',
          exact: true,
        });
        await expect(heightHelp).toBeDisabled();
        await expect(heightHelp).not.toBeChecked();
        await expect(
          navigation.getByText('Välj ett objekt för att visa höjdhjälp', { exact: true }),
        ).toBeVisible();
        const heightLabel = navigation.getByText('Visa höjdhjälp', { exact: true });
        await heightLabel.scrollIntoViewIfNeeded();
        expect(
          await heightLabel.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
            );
          }),
        ).toBe(true);
        await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
        const action = page.getByRole('button', {
          name: 'Tabell',
          exact: true,
        });
        await action.focus();
        await expect(action).toBeFocused();
        expect(
          await action.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              element.contains(
                document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
              )
            );
          }),
        ).toBe(true);
      }
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      await openNewObject(page);
      await page.getByLabel('Namn', { exact: true }).fill('Cykeln');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await openMap(page);
      await page.getByRole('button', { name: 'Navigera', exact: true }).click();
      await expect(
        page.getByRole('checkbox', { name: 'Visa höjdhjälp', exact: true }),
      ).not.toBeChecked();
    } finally {
      await installation.close();
    }
  });
}

test('YTA-09: voice and notices leave the empty map entry and lower controls reachable', async ({
  page,
  context,
}) => {
  const live = liveProvider();
  const installation = await createInstallation(undefined, {
    modelFetch: textModel(() => []).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(installation.origin);
    await startConversationWithVoice(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
    await expect(page.locator('.workspace-feedback')).toHaveCount(0);
    for (const disconnected of [false, true]) {
      if (disconnected) {
        await context.setOffline(true);
        await expect(page.getByRole('region', { name: 'Samtalsnotis', exact: true })).toContainText(
          'Ingen kontakt med Skyttel. Mikrofonen är av.',
        );
      }
      for (const height of [900, 568]) {
        await page.setViewportSize({ width: 320, height });
        await expect
          .poll(() =>
            page.evaluate(() => {
              const bounds = (selector: string) => {
                const element = document.querySelector(selector);
                if (!element) throw new Error(`Missing visible surface: ${selector}`);
                return element.getBoundingClientRect();
              };
              const entry = bounds('.workspace-tools');
              const corner = bounds('.conversation-corner');
              const status = bounds('.workspace-context');
              return {
                entryClear: entry.bottom <= corner.top,
                cornerStatusClear: status.bottom <= corner.top || status.right <= corner.left,
                cornerVisible: corner.top >= 0 && corner.bottom <= innerHeight,
              };
            }),
          )
          .toEqual({
            entryClear: true,
            cornerStatusClear: true,
            cornerVisible: true,
          });
        const entry = page.getByRole('button', { name: 'Tabell', exact: true });
        await entry.focus();
        await expect(entry).toBeFocused();
        expect(
          await entry.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            );
          }),
        ).toBe(true);
      }
    }
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await openNewObject(page);
    await expect(page.getByLabel('Namn', { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await installation.close();
  }
});
