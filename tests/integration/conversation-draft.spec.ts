import { expect, type Page, test } from '@playwright/test';
import { createHousehold, openSettings, signIn, utilityButton } from '../support/client.js';
import { openConversationText, startConversationWithText } from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

const view = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const draft = (page: Page) => view(page).getByRole('region', { name: 'Utkastet', exact: true });
const toggle = (page: Page) => view(page).getByRole('button', { name: /^(Visa|Dölj) utkastet/ });
const preference = (page: Page) =>
  page.getByRole('checkbox', { name: 'Visa utkastet när ett samtal börjar', exact: true });
async function settings(page: Page) {
  await openSettings(page);
  await page
    .locator('.settings-cards')
    .getByRole('link', { name: /^Samtal med Skyttel/ })
    .click();
  await expect(preference(page)).toBeEnabled();
}
async function back(page: Page) {
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
}
async function installation(page: Page, proposals = true) {
  let typeId = '';
  const app = await createInstallation(undefined, {
    modelFetch: textModel((body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (!current?.draft?.changes?.length)
        return [
          modelTool('propose_object', {
            version: current.draft.version,
            contentVersion: current.draft.contentVersion,
            id: 'lo',
            baseRevision: null,
            value: {
              typeId,
              name: 'Lo Exempel',
              description: '',
            },
          }),
        ];
      return [modelMessage('Ett provsvar.')];
    }).provider,
  });
  await signIn(page.request, app.origin);
  const { household } = await (
    await createHousehold(page.request, app.origin, 'Utkastprov')
  ).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const read = async () => (await page.request.get(path)).json();
  const post = async (route: string, data: object) => {
    const state = await read();
    const response = await page.request.post(`${path}/${route}`, {
      headers: { origin: app.origin },
      data: { version: state.draft.version, contentVersion: state.contentVersion, ...data },
    });
    expect(response.status(), await response.text()).toBe(200);
  };
  typeId = (await read()).types[0].id;
  if (proposals) {
    const state = await read();
    await post('draft', {
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
    });
  }
  await page.goto(`${app.origin}/households/${household.id}`);
  return { app, path, household, read, post };
}

test('SAMTALSUTKAST-01: utkasttabellen visar alla slags ändringar med kartans symboler', async ({
  page,
}) => {
  const { app, read, post } = await installation(page);
  try {
    await post('draft', {
      id: 'kim',
      baseRevision: null,
      value: { typeId: (await read()).types[0].id, name: 'Kim', description: '' },
    });
    await post('save', { operationId: 'draft-initial' });
    const state = await read();
    await post('draft', {
      id: 'lo',
      baseRevision: 1,
      value: { typeId: state.types[0].id, name: 'Lo Rättad', description: '' },
    });
    await post('draft', { id: 'kim', baseRevision: 1, value: null });
    await post('object-type', {
      id: 'custom',
      baseRevision: null,
      value: { name: 'Provtyp', description: '', fields: [] },
    });
    await post('draft', {
      id: 'new',
      baseRevision: null,
      value: { typeId: 'custom', name: 'Nytt objekt', description: '' },
    });
    await page.reload();
    await startConversationWithText(page);
    await expect(toggle(page)).toHaveAccessibleName('Visa utkastet (4)');
    await expect(draft(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    const table = draft(page).getByRole('table', { name: 'Osparade ändringar' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Symbol',
      'Namn',
      'Typ',
      'Vad som ändras',
    ]);
    await expect(table.locator('tbody tr')).toHaveCount(4);
    await expect(table.getByRole('row', { name: /Ändra Lo Rättad/ })).toContainText(
      'Namn: Lo Exempel → Lo Rättad',
    );
    await expect(table.getByRole('row', { name: /Ta bort Kim/ })).toContainText('Tas bort');
    expect(
      await table.locator('tbody td:first-child > span[aria-hidden]').allTextContents(),
    ).toEqual(['✎', '×', '+', '+']);
    const draftBox = await draft(page).boundingBox();
    const textBox = await view(page).locator('.text-view-conversation').boundingBox();
    expect(draftBox?.width).toBe(340);
    expect((draftBox?.x ?? 0) + (draftBox?.width ?? 0)).toBe(textBox?.x);
    await expect(draft(page).getByRole('link')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Ändringar under samtalet' })).toHaveCount(0);
    await toggle(page).click();
    await openConversationText(page); // closes the text view
    await openConversationText(page); // opens it again
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).click();
    await view(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    expect((await read()).draft.changes).toHaveLength(3);
  } finally {
    await app.close();
  }
});

test('SAMTALSUTKAST-02: valet följer användaren mellan hushåll och enheter', async ({
  page,
  browser,
}) => {
  const { app, household, post } = await installation(page);
  const device = await browser.newContext();
  const member = await browser.newContext();
  try {
    await settings(page);
    await expect(preference(page)).not.toBeChecked();
    await expect(
      page
        .getByRole('region', { name: 'Utkastet', exact: true })
        .getByText('Gäller dig i alla dina hushåll.', { exact: true }),
    ).toBeVisible();
    await preference(page).check();
    await expect(
      page.getByRole('region', { name: 'Utkastet', exact: true }).getByRole('status'),
    ).toHaveText('Valet är sparat');
    await back(page);
    await startConversationWithText(page);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await toggle(page).click();
    await view(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await post('save', { operationId: 'draft-save' });
    await view(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).click();
    await expect(draft(page)).toHaveText('Utkastet är tomt.');
    const { user: alex } = await (await page.request.get(`${app.origin}/api/bootstrap`)).json();
    const other = { id: 'draft-other-household' };
    app.seedMembership(alex.id, other.id, 'Andra hushållet', 'administrator');
    await signIn(device.request, app.origin);
    const second = await device.newPage();
    await second.goto(`${app.origin}/households/${other.id}`);
    await settings(second);
    await expect(preference(second)).toBeChecked();
    await preference(second).uncheck();
    await expect(
      second.getByRole('region', { name: 'Utkastet', exact: true }).getByRole('status'),
    ).toHaveText('Valet är sparat');
    await page.reload();
    await settings(page);
    await expect(preference(page)).not.toBeChecked();
    app.setIdentity(robin);
    await signIn(member.request, app.origin, 'microsoft');
    const { user } = await (await member.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(
      `${app.origin}/api/households/${household.id}/invitations`,
      { headers: { origin: app.origin }, data: { userId: user.id } },
    );
    expect(
      (
        await member.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code: (await invitation.json()).code },
        })
      ).status(),
    ).toBe(200);
    await preference(page).check();
    await expect(preference(page)).toBeChecked();
    const robinPage = await member.newPage();
    await robinPage.goto(`${app.origin}/households/${household.id}`);
    await settings(robinPage);
    await expect(preference(robinPage)).not.toBeChecked();
    await app.restart();
    await page.reload();
    await expect(preference(page)).toBeChecked();
  } finally {
    await device.close();
    await member.close();
    await app.close();
  }
});

for (const configuration of [
  { name: 'smal skärm', viewport: { width: 390, height: 844 }, hasTouch: false, isMobile: false },
  { name: 'bred pekskärm', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
]) {
  test.describe(configuration.name, () => {
    test.use({
      viewport: configuration.viewport,
      hasTouch: configuration.hasTouch,
      isMobile: configuration.isMobile,
    });
    test('SAMTALSUTKAST-03: första förslaget öppnar utkastet på mobil enhet', async ({ page }) => {
      const { app } = await installation(page, false);
      try {
        await settings(page);
        await preference(page).check();
        await expect(preference(page)).toBeChecked();
        await back(page);
        await startConversationWithText(page);
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await view(page)
          .getByRole('textbox', { name: 'Meddelande till Skyttel' })
          .fill('Lägg till Lo.');
        await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
        await expect(draft(page).getByRole('table')).toContainText('Lo Exempel');
        const button = await toggle(page).boundingBox();
        const box = await draft(page).boundingBox();
        const conversation = await view(page).locator('.text-view-conversation').boundingBox();
        expect(box?.y).toBeGreaterThanOrEqual((button?.y ?? 0) + (button?.height ?? 0));
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(conversation?.y ?? 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          configuration.viewport.width,
        );
      } finally {
        await app.close();
      }
    });
  });
}

test('SAMTALSUTKAST-04: kvittot och tidigare sparförsök finns i Utkast och historik', async ({
  page,
}) => {
  const { app, post } = await installation(page);
  try {
    await post('save', { operationId: 'draft-receipt' });
    await page.reload();
    await startConversationWithText(page);
    await expect(view(page).getByText('Visa kvittot')).toHaveCount(0);
    await expect(view(page).getByText('Tidigare sparförsök')).toHaveCount(0);
    await (await utilityButton(page, 'Utkast och historik')).click();
    await page.getByText('Tidigare sparförsök', { exact: true }).click();
    const attempts = page.getByRole('region', { name: 'Mina sparförsök' });
    await attempts.getByText('Visa kvittot', { exact: true }).click();
    await expect(attempts).toContainText('Sparat: Lo Exempel. Kvitto: draft-receipt.');
  } finally {
    await app.close();
  }
});

test('SAMTALSUTKAST-05: utkastvalet fungerar utan tillgängligt samtal', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.goto(app.origin);
    await settings(page);
    await expect(
      page.getByText('Samtal med Skyttel är inte tillgängligt just nu.', { exact: true }),
    ).toBeVisible();
    await page.route('**/conversation-preferences', (route) =>
      route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue(),
    );
    await preference(page).click();
    const status = page.getByRole('region', { name: 'Utkastet', exact: true }).getByRole('status');
    await expect(status).toHaveText('Valet kunde inte sparas. Försök igen.');
    await expect(preference(page)).not.toBeChecked();
    await expect(preference(page)).toBeFocused();
    await page.unroute('**/conversation-preferences');
    await preference(page).check();
    await expect(status).toHaveText('Valet är sparat');
  } finally {
    await app.close();
  }
});
