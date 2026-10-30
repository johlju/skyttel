import type { TraceSending } from '../../src/server/trace-sending.js';
import { signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('SPARNING-01: installationsansvarig stänger av och aktiverar sändning med bevarat val efter omstart', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${app.origin}/costs`);
    await page.getByText('Välj inställning', { exact: true }).click();
    await page.getByRole('link', { name: 'Diagnostik med LangSmith', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Diagnostik med LangSmith' }),
    ).toBeFocused();
    await expect(page.getByText('Inte ansluten', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Ingen registrerad leverans sedan start', { exact: true }),
    ).toBeVisible();
    const stop = page.getByRole('button', { name: 'Stäng av sändning', exact: true });
    await stop.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Sändningsvalet är sparat.');
    await expect(
      page.getByRole('button', { name: 'Aktivera sändning', exact: true }),
    ).toBeFocused();
    await expect(page.getByText('Sändning avstängd', { exact: true })).toBeVisible();
    await app.restart();
    await page.reload();
    await expect(page.getByText('Sändning avstängd', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aktivera sändning', exact: true }).click();
    await expect(page.getByText('Inte ansluten', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Varje persons samtalsmedgivande är ett separat val/),
    ).toBeVisible();
    await expect(page.getByText(/Skickade förfrågningar kan inte återkallas/)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('SPARNING-02: installationsansvarig läser leveransstatus och häver en beständig spärr efter kontroll', async ({
  page,
}) => {
  let sending!: TraceSending;
  const app = await createInstallation(undefined, {
    traceDelivery: (control) => {
      sending = control;
      return { start() {}, stop() {} };
    },
  });
  try {
    await signIn(page.request, app.origin);
    await page.goto(`${app.origin}/tracing`);
    await expect(page.getByText('Sändning aktiverad', { exact: true })).toBeVisible();
    sending.delivered();
    sending.dropped('oversized', 2);
    await page.getByRole('button', { name: 'Uppdatera leveransstatus' }).click();
    await expect(page.getByText('För stor händelse', { exact: true })).toBeVisible();
    await expect(
      page.locator('dt').filter({ hasText: 'Förlorade händelser sedan start' }).locator('+ dd'),
    ).toHaveText('2');
    for (const reason of ['quota', 'credentials'] as const) {
      sending.suspend(reason);
      await app.restart();
      await page.reload();
      await expect(page.getByText('Sändning spärrad', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Ingen registrerad leverans sedan start', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/Lägg inte till betalningsmetod/)).toBeVisible();
      await page.getByRole('button', { name: 'Starta om sändning efter kontroll' }).click();
      await expect(page.getByText('Sändning aktiverad', { exact: true })).toBeVisible();
    }
  } finally {
    await app.close();
  }
});

test('SPARNING-03: hushållets administratör har inte installationens sändningskontroll', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    app.setIdentity(robin);
    await signIn(page.request, app.origin, 'microsoft');
    const bootstrap = await (await page.request.get(`${app.origin}/api/bootstrap`)).json();
    app.seedMembership(bootstrap.user.id, 'other-home', 'Andra hushållet', 'administrator');
    await page.goto(`${app.origin}/households/other-home/settings`);
    await expect(page.getByRole('heading', { level: 1, name: 'Inställningar' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Diagnostik med LangSmith', exact: true }),
    ).toHaveCount(0);
    await page.goto(`${app.origin}/tracing`);
    await expect(
      page.getByRole('heading', {
        name: 'Endast installationsansvarig har tillgång till diagnostiken',
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stäng av sändning' })).toHaveCount(0);
  } finally {
    await app.close();
  }
});
