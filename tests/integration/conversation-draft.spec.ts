import type { Page } from '@playwright/test';
import { bounds } from '../support/accessibility.js';
import { closeSupportDialog, createHousehold, openSettings, signIn } from '../support/client.js';
import { installation } from '../support/conversation-draft-steps.js';
import {
  openConversationText,
  openSavedHistory,
  startConversationWithText,
} from '../support/conversation-page.js';
import { prepareConversationReview } from '../support/conversation-review-preparation.js';
import { createInstallation, robin } from '../support/installation.js';
import { propertyValues } from '../support/property-controls.js';
import { createPreparedContext, expect, test } from '../support/test.js';

const view = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });

const draft = (page: Page) => view(page).getByRole('region', { name: 'Utkastet', exact: true });

const toggle = (page: Page) => view(page).getByRole('button', { name: /^(Visa|Dölj) utkastet/ });

const preference = (page: Page) =>
  page.getByRole('checkbox', { name: 'Visa utkastet när ett samtal börjar', exact: true });

async function readLoProposal(page: Page) {
  await draft(page)
    .getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true })
    .click();
  const proposal = page.getByRole('dialog', { name: 'Lo Exempel', exact: true });
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText('Person');
  await expect(proposal.locator('dt').filter({ hasText: /^Beskrivning$/ })).toHaveCount(0);
  await closeSupportDialog(page, 'Lo Exempel');
}

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

test('SAMTALSUTKAST-01: utkasttabellen visar alla slags ändringar med kartans symboler', async ({
  page,
}) => {
  const { app, read, post } = await installation(page);
  try {
    await prepareConversationReview({ read, post });
    const beforeReview = await read();
    await page.reload();
    const savedBefore = await openSavedHistory(page);
    await savedBefore.getByText('Visa ändringarna', { exact: true }).click();
    await expect(
      savedBefore.locator('.history-changes').getByText('Sista fyra: 1111 (Text)', { exact: true }),
    ).toBeVisible();
    await expect(savedBefore.locator('.history-changes')).not.toContainText('2222');
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await startConversationWithText(page);
    await expect(toggle(page)).toHaveAccessibleName('Visa utkastet (8)');
    await expect(draft(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    const table = draft(page).getByRole('table', { name: 'Osparade ändringar' });
    await expect(table.getByRole('columnheader')).toHaveText(['Namn', 'Typ', 'Vad som ändras']);
    await expect(table.locator('tbody tr')).toHaveCount(8);
    const proposalRow = (name: string) =>
      table.getByRole('row').filter({
        has: page.getByRole('button', { name: `Visa förslaget: ${name}`, exact: true }),
      });
    await expect(proposalRow('Lo Rättad')).toContainText('Namn: Lo Exempel → Lo Rättad');
    const removalRow = proposalRow('Kim');
    const removalStatus = removalRow.getByText('Tas bort', { exact: true });
    await expect(removalStatus).toBeVisible();
    await expect(table.locator('td:last-child .conversation-draft-symbol')).toHaveText([
      '✎',
      '×',
      '+',
      '✎',
      '✎',
      '+',
      '+',
      '+',
    ]);
    await removalStatus.hover();
    const highlight = await removalRow.evaluate((row) => getComputedStyle(row).backgroundColor);
    expect(highlight).not.toBe('rgba(0, 0, 0, 0)');
    const removalName = removalRow.getByRole('button', {
      name: 'Visa förslaget: Kim',
      exact: true,
    });
    await removalName.hover();
    await expect(removalName).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(removalRow).toHaveCSS('background-color', highlight);
    await removalStatus.click();
    const removalDetails = page.getByRole('dialog', { name: 'Kim', exact: true });
    await expect(removalDetails).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(removalDetails).toBeHidden();
    await expect(removalName).toBeFocused();
    await expect(removalRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await toggle(page).hover();
    await removalStatus.hover();
    await expect(removalRow).toHaveCSS('background-color', highlight);
    for (const line of [
      'Sista fyra: 1111 (Text) → Sista fyra: 2222 (Text)',
      'Lo Rättad → Betalar → Kortet',
    ])
      await expect(table.getByText(line, { exact: false })).toBeVisible();
    for (const name of ['Provtyp', 'Förvaras'])
      await expect(
        table.getByRole('button', { name: `Visa förslaget: ${name}`, exact: true }),
      ).toBeVisible();
    expect(propertyValues((await read()).objects.find((object) => object.id === 'card'))).toEqual({
      'last-four': '1111',
    });
    expect((await read()).draft.relationships).toHaveLength(2);
    expect(await read()).toEqual(beforeReview);
    const relationship = table.getByRole('row', {
      name: /Familjens gemensamma musikkonto.*Ändras/,
    });
    await expect(relationship).toContainText('familjen@example.test');
    await expect(relationship).toContainText('musik@example.test');
    const typeCell = relationship.getByRole('cell').filter({ hasText: /^Inloggningsadress$/ });
    const lineCount = await typeCell.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });
    expect(lineCount).toBeGreaterThanOrEqual(1);
    expect(lineCount).toBeLessThanOrEqual(3);
    await expect(typeCell).toBeVisible();
    const draftBox = await bounds(draft(page));
    const textBox = await bounds(view(page).locator('.text-view-conversation'));
    // A resized draft must not cover the conversation or clip its own heading and types.
    expect(draftBox.right).toBeLessThanOrEqual(textBox.x);
    const heading = await bounds(draft(page).getByRole('heading', { name: 'Utkast', exact: true }));
    expect(heading.x).toBeGreaterThanOrEqual(draftBox.x);
    expect(heading.right).toBeLessThanOrEqual(draftBox.right);
    expect(heading.y).toBeGreaterThanOrEqual(draftBox.y);
    expect(heading.bottom).toBeLessThanOrEqual(draftBox.bottom);
    expect(await typeCell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await view(page).getByRole('textbox', { name: 'Meddelande till Skyttel', exact: true }).click({
      trial: true,
    });
    for (const name of ['Ändra utkastlistans bredd', 'Ändra samtalstextens bredd']) {
      const handle = view(page).getByRole('separator', { name, exact: true });
      await expect(handle).toHaveAccessibleName(name);
      await handle.hover({ trial: true });
    }
    await toggle(page).click();
    await openConversationText(page); // closes the text view
    await openConversationText(page); // opens it again
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).click();
    await view(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    expect((await read()).draft.changes).toHaveLength(4);
    expect(await read()).toEqual(beforeReview);
    const savedAfter = await openSavedHistory(page);
    if (
      !(await savedAfter
        .locator('.history-changes')
        .evaluate((element) => element.hasAttribute('open')))
    )
      await savedAfter.getByText('Visa ändringarna', { exact: true }).click();
    await expect(
      savedAfter.locator('.history-changes').getByText('Sista fyra: 1111 (Text)', { exact: true }),
    ).toBeVisible();
    await expect(savedAfter.locator('.history-changes')).not.toContainText('2222');
    expect(await read()).toEqual(beforeReview);
  } finally {
    await app.close();
  }
});

test('SAMTALSUTKAST-02: valet följer användaren mellan hushåll och enheter', async ({
  page,
  browser,
}) => {
  const { app, path, household, read } = await installation(page);
  const device = await createPreparedContext(browser);
  const member = await createPreparedContext(browser);
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
    const restarted = page.waitForResponse(
      (response) =>
        response.url() === `${app.origin}/api/households/${household.id}/text-assistant` &&
        response.request().method() === 'POST',
    );
    await view(page).getByRole('button', { name: 'Nytt samtal' }).click();
    const restartResponse = await restarted;
    expect(restartResponse.status()).toBe(201);
    const conversation = await restartResponse.json();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await readLoProposal(page);
    const beforeSave = await read();
    const savedResponse = page.waitForResponse(
      (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
    );
    await draft(page).getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const response = await savedResponse;
    expect(response.status(), await response.text()).toBe(200);
    const { receipt } = await response.json();
    expect(response.request().postDataJSON()).toEqual({
      version: beforeSave.draft.version,
      contentVersion: beforeSave.contentVersion,
      operationId: receipt.operationId,
      conversationId: conversation.id,
    });
    expect(receipt.operationId).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
    await expect(
      page.getByRole('dialog', { name: 'Spara utkastet', exact: true }),
    ).not.toBeVisible();
    const saved = await read();
    expect(saved.objects).toEqual([expect.objectContaining({ id: 'lo', name: 'Lo Exempel' })]);
    expect(saved.draft).toEqual({ version: beforeSave.draft.version + 1, changes: [] });
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toEqual([
      expect.objectContaining({ operationId: receipt.operationId, status: 'succeeded', receipt }),
    ]);
    await view(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(draft(page).getByRole('heading', { name: 'Utkast', exact: true })).toBeVisible();
    await expect(draft(page).getByText('Utkastet är tomt.', { exact: true })).toBeVisible();
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
  {
    caseId: 'SAMTALSUTKAST-03',
    name: 'smal skärm',
    viewport: { width: 390, height: 844 },
    hasTouch: false,
    isMobile: false,
  },
  {
    caseId: 'SAMTALSUTKAST-06',
    name: 'bred pekskärm',
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    isMobile: true,
  },
]) {
  test.describe(configuration.name, () => {
    test.use({
      viewport: configuration.viewport,
      hasTouch: configuration.hasTouch,
      isMobile: configuration.isMobile,
    });
    test(`${configuration.caseId}: första förslaget öppnar utkastet på mobil enhet`, async ({
      page,
    }) => {
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
        await expect(toggle(page)).toHaveAccessibleName('Dölj utkastet (1)');
        await readLoProposal(page);
        const conversation = view(page).getByRole('log', { name: 'Samtalstext' });
        await expect(conversation).toBeHidden();
        const text = view(page).getByRole('button', { name: 'Text', exact: true });
        await text.focus();
        await text.press('Enter');
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(conversation).toBeVisible();
        await expect(conversation).toContainText('Lo ligger i utkastet.');
        await expect(draft(page)).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          configuration.viewport.width,
        );
      } finally {
        await app.close();
      }
    });
  });
}

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
