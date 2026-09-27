import { access } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
  createHousehold,
  openConversation,
  openProfile,
  openSettings,
  signIn,
} from '../support/client.js';
import { launchManualCosts } from '../support/manual-costs.js';

const assistant = (page: Page) =>
  page.getByRole('region', { name: 'Skyttels textassistent', exact: true });
const category = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
async function startAssistant(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin, 'Kostnadsprov')).json();
  await page.goto(origin);
  await openConversation(page);
  const panel = assistant(page);
  await panel.getByLabel(/Jag tillåter att OpenAI/).check();
  await panel.getByLabel(/Jag tillåter förslag och sparande/).check();
  await panel.getByRole('button', { name: 'Starta textassistenten' }).click();
  return household.id as string;
}
async function sendText(page: Page) {
  await openConversation(page);
  const panel = assistant(page);
  await panel.getByLabel('Meddelande till textassistenten').fill('Prova kostnadsunderlaget.');
  await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
  await expect(panel).toContainText('Det kontrollerade kostnadsprovet är klart.');
}
async function startVoice(page: Page) {
  await openConversation(page);
  await assistant(page).getByRole('button', { name: 'Starta röst', exact: true }).click();
  await expect(assistant(page)).toContainText(
    'Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.',
  );
}
async function openCosts(page: Page) {
  const link = page.getByRole('link', { name: 'Månadskostnad', exact: true });
  const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
  await expect(link.or(tools).first()).toBeVisible();
  if (!(await link.isVisible())) await openSettings(page);
  await link.click();
  await expect(category(page, 'Render – hel månad')).toBeVisible();
}

test('KOST-01: separata kostnader och månadens antaganden återläses efter omstart', async ({
  page,
}) => {
  const app = await launchManualCosts();
  try {
    await startAssistant(page, app.origin);
    await startVoice(page);
    await app.command('delegate');
    await expect(assistant(page)).toContainText('Det kontrollerade kostnadsprovet är klart.');
    await app.command('usage 90');
    await assistant(page).getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(assistant(page)).toContainText('Rösten är avstängd.');
    await openCosts(page);
    const overview = category(page, 'Månadens kostnadsöversikt');
    await expect(overview).toContainText('75,54 SEK');
    const totalBounds = await overview.boundingBox();
    const renderBounds = await category(page, 'Render – hel månad').boundingBox();
    expect(
      totalBounds && renderBounds && totalBounds.y + totalBounds.height <= renderBounds.y,
    ).toBe(true);
    await expect(category(page, 'Render – hel månad')).toContainText('72,50 SEK (7,25 USD)');
    await expect(category(page, 'Live – uppmätt hittills')).toContainText('0,75 SEK (0,075 USD)');
    await page.getByText('Visa mätvärden för Live', { exact: true }).click();
    await page.getByText('Visa mätvärden för Terra', { exact: true }).click();
    await expect(category(page, 'Live – uppmätt hittills')).toContainText(
      '90 sekunder rapporterade',
    );
    await expect(category(page, 'Terra – uppmätt hittills')).toContainText('2,29 SEK (0,229 USD)');
    await expect(category(page, 'Terra – uppmätt hittills')).toContainText('100 000 token');
    const terra = category(page, 'Terra – uppmätt hittills');
    const usage = terra.locator('dd');
    await expect(usage).toHaveText([
      '100 000 token',
      '20 000 token',
      '10 000 token',
      '5 000 token',
      '2 000 token',
    ]);
    await expect(page.locator('.cost-total')).toContainText('75,54 SEK (7,554 USD)');
    await expect(page.getByText(/Cirka 200 kronor per månad/)).toBeVisible();
    await category(page, 'Prisunderlag')
      .getByText(/Modellpriser kontrollerade/)
      .click();
    await expect(page.getByRole('table', { name: 'Terra-priser per miljon token' })).toBeVisible();
    const rates = category(page, 'Prisunderlag');
    await expect(rates).toContainText('Modellpriser kontrollerade 2026-09-25');
    await expect(rates).toContainText('0,05 USD/minut, beräknat per sekund');
    await expect(rates).toContainText('Startkrediten antas ingå i dessa sekunder');
    await expect(rates.getByRole('link', { name: 'GPT-Live', exact: true })).toHaveAttribute(
      'href',
      'https://developers.openai.com/api/docs/models/gpt-live-1',
    );
    await expect(rates.getByRole('link', { name: 'GPT-5.6 Terra', exact: true })).toHaveAttribute(
      'href',
      'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
    );
    await page.getByText('Ändra månadens antaganden', { exact: true }).click();
    await page.getByLabel('SEK per USD', { exact: true }).fill('11');
    await page.getByRole('button', { name: 'Spara månadens antaganden' }).click();
    await expect(page.locator('.cost-total')).toContainText('83,09 SEK (7,554 USD)');
    const month = await page.getByLabel('Månad (UTC)').inputValue();
    const previous = new Date(`${month}-01T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    await page.getByLabel('Månad (UTC)').fill(previous.toISOString().slice(0, 7));
    await expect(category(page, 'Prisunderlag')).toContainText('1 USD = 10 SEK');
    await expect(page.getByText(/tidigare förbrukning är okänd/)).toBeVisible();
    await page.getByLabel('Månad (UTC)').fill(month);
    await expect(page.locator('.cost-total')).toContainText('83,09 SEK');
    await app.command('restart', 'restarted');
    await page.reload();
    await page.getByText('Visa mätvärden för Live', { exact: true }).click();
    await page.getByText('Visa mätvärden för Terra', { exact: true }).click();
    await expect(page.locator('.cost-total')).toContainText('83,09 SEK (7,554 USD)');
    await expect(category(page, 'Prisunderlag')).toContainText('1 USD = 11 SEK');
    await expect(category(page, 'Render – hel månad')).toContainText('79,75 SEK (7,25 USD)');
    await expect(category(page, 'Live – uppmätt hittills')).toContainText(
      '90 sekunder rapporterade',
    );
    await expect(category(page, 'Live – uppmätt hittills')).toContainText('0,83 SEK (0,075 USD)');
    await expect(terra).toContainText('2,52 SEK (0,229 USD)');
    await expect(usage).toHaveText([
      '100 000 token',
      '20 000 token',
      '10 000 token',
      '5 000 token',
      '2 000 token',
    ]);
  } finally {
    await app.close();
  }
  await expect(access(app.directory)).rejects.toThrow();
});

test('KOST-02: saknade slutvärden och hämtningsfel bevarar känt underlag utan dubbelräkning', async ({
  page,
}) => {
  const app = await launchManualCosts();
  try {
    await app.command('text missing');
    await startAssistant(page, app.origin);
    await sendText(page);
    await startVoice(page);
    await app.command('usage 12');
    await app.command('usage 15');
    await app.command('usage 15');
    await app.command('finalize off');
    await assistant(page).getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(assistant(page)).toContainText('Rösten är avstängd.');
    await openCosts(page);
    const live = category(page, 'Live – uppmätt hittills');
    const terra = category(page, 'Terra – uppmätt hittills');
    await expect(live).toContainText('15 sekunder rapporterade');
    await expect(live).toContainText('1 registrerade försök; 1 med osäkert underlag');
    await expect(live).toContainText('0,13 SEK (0,0125 USD)');
    await expect(terra).toContainText('Belopp saknas');
    await expect(terra).toContainText('1 saknar mätvärde');
    await expect(page.locator('.cost-total')).toContainText('Delsumma för beräkningsbara delar');
    await expect(page.getByText(/deras belopp är inte noll/)).toBeVisible();
    const known = await page.locator('.cost-total').innerText();
    await app.command('restart', 'restarted');
    await page.reload();
    await expect(page.locator('.cost-total')).toHaveText(known);
    await expect(live).toContainText('15 sekunder rapporterade');
    await expect(terra).toContainText('Belopp saknas');
    await page.route('**/api/operator/costs?*', (route) =>
      route.fulfill({ status: 503, body: '{}' }),
    );
    await page.getByRole('button', { name: 'Uppdatera underlaget' }).click();
    await expect(page.getByRole('alert')).toContainText('Tidigare hämtade värden är inaktuella');
    await expect(page.locator('.cost-total')).toHaveText(known);
    await page.unroute('**/api/operator/costs?*');
    await page.getByRole('button', { name: 'Uppdatera underlaget' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.cost-total')).toHaveText(known);
  } finally {
    await app.close();
  }
});

test('KOST-03: endast driftansvarig har åtkomst oberoende av hushållets roller', async ({
  page,
  browser,
}) => {
  const app = await launchManualCosts();
  const robin = await browser.newContext();
  try {
    await signIn(page.request, app.origin);
    await page.goto(app.origin);
    await openCosts(page);
    const alex = await (await page.request.get(`${app.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const scope = `${app.origin}/api/households/${household.id}`;
    await app.command('identity robin');
    await signIn(robin.request, app.origin, 'microsoft');
    const other = await (await robin.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await (
      await page.request.post(`${scope}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: other.user.id },
      })
    ).json();
    expect(
      (
        await robin.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code: invitation.code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${scope}/members/${other.user.id}/role`, {
          headers: { origin: app.origin },
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    const otherPage = await robin.newPage();
    await otherPage.goto(app.origin);
    await openProfile(otherPage);
    await expect(otherPage.getByRole('link', { name: 'Månadskostnad' })).toHaveCount(0);
    const month = new Date().toISOString().slice(0, 7);
    expect(
      (await robin.request.get(`${app.origin}/api/operator/costs?month=${month}`)).status(),
    ).toBe(403);
    expect(
      (
        await robin.request.post(`${app.origin}/api/operator/costs/assumptions`, {
          headers: { origin: app.origin },
          data: { month, version: 0, sekPerUsd: 99 },
        })
      ).status(),
    ).toBe(403);
    await otherPage.goto(`${app.origin}/costs`);
    await expect(category(otherPage, 'Render – hel månad')).toHaveCount(0);
    expect(
      (
        await robin.request.post(`${scope}/members/${alex.user.id}/revoke`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(category(page, 'Render – hel månad')).toBeVisible();
    expect(
      (
        await page.request.post(`${app.origin}/api/auth/sign-out`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    await page.getByRole('button', { name: 'Uppdatera underlaget' }).click();
    await expect(category(page, 'Render – hel månad')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Månadskostnad' })).toHaveCount(0);
  } finally {
    await robin.close();
    await app.close();
  }
});

for (const width of [1280, 390, 320]) {
  test(`KOST-04: okänt sparresultat återläses med fokus och fullständiga detaljer (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const app = await launchManualCosts();
    try {
      await signIn(page.request, app.origin);
      await page.goto(`${app.origin}/costs`);
      await expect(category(page, 'Månadens kostnadsöversikt')).toContainText('72,50 SEK');
      await expect(
        page.getByText('Din driftbehörighet är fristående', { exact: false }),
      ).toBeVisible();
      const edit = page.getByRole('button', { name: 'Ändra månadens antaganden', exact: true });
      await edit.click();
      const rate = page.getByLabel('SEK per USD', { exact: true });
      await expect(rate).toBeFocused();
      await rate.fill('12');
      await page.getByRole('button', { name: 'Uppdatera underlaget' }).click();
      await expect(rate).toHaveValue('12');
      let writes = 0;
      await page.route('**/api/operator/costs/assumptions', async (route) => {
        writes++;
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      });
      const save = page.getByRole('button', { name: 'Spara månadens antaganden' });
      await save.click();
      await expect(page.getByRole('alert')).toContainText('Sparresultatet är okänt');
      await expect(save).toBeDisabled();
      await expect(category(page, 'Månadens kostnadsöversikt')).toContainText('72,50 SEK');
      await page.getByRole('button', { name: 'Uppdatera underlaget' }).click();
      await expect(page.getByRole('status')).toContainText('Aktuella antaganden är hämtade');
      await expect(category(page, 'Månadens kostnadsöversikt')).toContainText('87,00 SEK');
      expect(writes).toBe(1);
      await page.unroute('**/api/operator/costs/assumptions');
      await app.command('restart', 'restarted');
      await page.reload();
      await expect(category(page, 'Månadens kostnadsöversikt')).toContainText('87,00 SEK');
      await page.getByText('Tidigare antaganden för månaden', { exact: true }).click();
      const history = category(page, 'Månadens antaganden');
      await expect(history).toContainText('Version 1');
      await expect(history).toContainText('1 USD = 10 SEK');
      await expect(history).toContainText('Version 2');
      await expect(history).toContainText('1 USD = 12 SEK');
      await edit.click();
      await expect(rate).toBeFocused();
      await rate.fill('13');
      await save.click();
      await expect(page.getByRole('status')).toHaveText('Månadens antaganden är sparade.');
      await expect(edit).toBeFocused();
      await edit.click();
      await page.getByRole('button', { name: 'Stäng redigering' }).click();
      await expect(edit).toBeFocused();
      await edit.click();
      await rate.fill('14');
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/operator/costs/assumptions', async (route) => {
        const response = await route.fetch();
        await held;
        await route.fulfill({ response });
      });
      await save.click();
      await expect(page.getByRole('status')).toHaveText('Sparar antaganden…');
      const themeButton = page.getByRole('button', { name: /Tema:.*Byt tema/ });
      await themeButton.click();
      await page
        .getByRole('radio', { name: width === 390 ? 'Mörkt' : 'Ljust', exact: true })
        .click();
      await expect(themeButton).toBeFocused();
      release();
      await expect(page.getByRole('status')).toHaveText('Månadens antaganden är sparade.');
      await expect(themeButton).toBeFocused();
      await category(page, 'Prisunderlag')
        .getByText(/Modellpriser kontrollerade/)
        .click();
      const table = page.getByRole('region', { name: /Terra-priser .*rulla vid behov/ });
      await expect(table.getByRole('table')).toBeVisible();
      await expect(table.getByRole('columnheader')).toHaveText([
        'Indata i anropet',
        'Vanlig indata',
        'Cacheläsning',
        'Cacheskrivning',
        'Utdata',
      ]);
      await expect(table.getByRole('cell')).toHaveText([
        '2',
        '0,2',
        '2,5',
        '12',
        '4',
        '0,4',
        '5',
        '18',
      ]);
      await table.focus();
      if (await table.evaluate((element) => element.scrollWidth > element.clientWidth)) {
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await app.close();
    }
  });
}
