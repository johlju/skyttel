import { access } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { launchManualCosts } from '../support/manual-costs.js';

const assistant = (page: Page) =>
  page.getByRole('region', { name: 'Skyttels textassistent', exact: true });
const category = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
async function startAssistant(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin, 'Kostnadsprov')).json();
  await page.goto(origin);
  const panel = assistant(page);
  await panel.getByLabel(/Jag tillåter att OpenAI/).check();
  await panel.getByLabel(/Jag tillåter förslag och sparande/).check();
  await panel.getByRole('button', { name: 'Starta textassistenten' }).click();
  return household.id as string;
}
async function sendText(page: Page) {
  const panel = assistant(page);
  await panel.getByLabel('Meddelande till textassistenten').fill('Prova kostnadsunderlaget.');
  await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
  await expect(panel).toContainText('Det kontrollerade kostnadsprovet är klart.');
}
async function startVoice(page: Page) {
  await assistant(page).getByRole('button', { name: 'Starta röst', exact: true }).click();
  await expect(assistant(page)).toContainText(
    'Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.',
  );
}
async function openCosts(page: Page) {
  await page.getByRole('link', { name: 'Månadskostnad', exact: true }).click();
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
    await expect(category(page, 'Render – hel månad')).toContainText('72,50 SEK (7,25 USD)');
    await expect(category(page, 'Live – uppmätt hittills')).toContainText('0,75 SEK (0,075 USD)');
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
