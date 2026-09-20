import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('MEDLEM-04: replacing an invitation invalidates the old code and cancellation keeps the new code usable', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    const userId = await recipientPage.getByLabel('Ditt Skyttel-användar-ID').inputValue();
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const oldCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await page.reload();
    await expect(page.getByLabel('Inbjudningskod att dela')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Inbjudningar' })).toContainText('Väntar på svar');

    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const newCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    expect(newCode).not.toBe(oldCode);
    const invitations = page.getByRole('list', { name: 'Inbjudningar' });
    await expect(invitations.getByRole('listitem')).toHaveCount(2);
    await expect(invitations).toContainText('Återkallad');
    await expect(invitations).toContainText('Väntar på svar');
    await invitations.getByRole('button', { name: 'Återkalla inbjudan' }).click();
    const confirmation = page.getByRole('group', { name: `Återkalla inbjudan till ${robin.name}` });
    await expect(confirmation).toContainText('Koden slutar fungera');
    await confirmation.getByRole('button', { name: 'Avbryt' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByLabel('Inbjudningskod att dela')).toHaveValue(newCode);

    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(oldCode);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('alert')).toContainText('Inbjudan kan inte användas');
    await expect(
      recipientPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(newCode);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(invitations).toContainText('Accepterad');
    await expect(page.getByRole('list', { name: 'Medlemmar' })).toContainText(robin.name);
  } finally {
    await recipient.close();
    await installation.close();
  }
});

test('MEDLEM-05: an expired invitation is visibly unusable and a fresh invitation restores the join flow', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const { user } = await (
      await recipient.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { invitation, code } = await (
      await page.request.post(`${installation.origin}/api/households/${household.id}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    // Arrange an invitation whose seven-day lifetime has passed without
    // changing authentication expiry or waiting on the wall clock.
    const database = new Database(join(installation.directory, 'skyttel.db'));
    try {
      database
        .prepare('UPDATE invitation SET createdAt = ?, expiresAt = ? WHERE id = ?')
        .run('2000-01-01T00:00:00.000Z', '2000-01-08T00:00:00.000Z', invitation.id);
    } finally {
      database.close();
    }
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    const invitations = page.getByRole('list', { name: 'Inbjudningar' });
    await expect(invitations).toContainText('Utgången');
    await expect(invitations.getByRole('button', { name: 'Återkalla inbjudan' })).toHaveCount(0);
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(code);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('alert')).toContainText('Inbjudan kan inte användas');
    await expect(recipientPage.getByLabel('Inbjudningskod', { exact: true })).toHaveValue(code);
    await expect(
      recipientPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();

    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const newCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(newCode);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await page.reload();
    await expect(invitations).toContainText('Accepterad');
    await expect(page.getByRole('list', { name: 'Medlemmar' })).toContainText(robin.name);
  } finally {
    await recipient.close();
    await installation.close();
  }
});

test('MEDLEM-06: revocation preserves shared objects and only a new invitation restores membership', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const { user } = await (
      await recipient.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${installation.origin}/api/households/${household.id}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    const accepted = await recipient.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    expect(accepted.status()).toBe(200);
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    await recipientPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await recipientPage.getByLabel('Objektets namn').fill('Robin i kartan');
    await recipientPage.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    await recipientPage.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(recipientPage.getByRole('status')).toContainText('Sparat');
    await page.goto(`${installation.origin}/households/${household.id}/administration`);

    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('har redan tillgång till hushållet');
    await expect(page.getByLabel('Inbjudningskod att dela')).toHaveCount(0);
    const member = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ hasText: robin.name });
    await member.getByRole('button', { name: 'Återkalla tillgång' }).click();
    await expect(member).toContainText('Personer och innehåll i kartan finns kvar');
    await member.getByRole('button', { name: 'Bekräfta återkallelse' }).click();
    await expect(member).toHaveCount(0);
    await recipientPage.reload();
    await expect(
      recipientPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(code);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('alert')).toContainText('Inbjudan kan inte användas');
    await page.getByRole('link', { name: 'Till hushållet' }).click();
    await page.getByLabel('Sök objekt').fill('Robin i kartan');
    await expect(page.getByRole('button', { name: 'Robin i kartan', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Administrera tillgång' }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const newCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    expect(newCode).not.toBe(code);
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(newCode);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await recipientPage.getByLabel('Sök objekt').fill('Robin i kartan');
    await expect(
      recipientPage.getByRole('button', { name: 'Robin i kartan', exact: true }),
    ).toBeVisible();
  } finally {
    await recipient.close();
    await installation.close();
  }
});

test('MEDLEM-01: an administrator invites an authenticated user who joins by keyboard on a phone', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext({ viewport: { width: 320, height: 568 } });
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    const userId = await recipientPage.getByLabel('Ditt Skyttel-användar-ID').inputValue();

    await page.goto(installation.origin);
    await page.getByRole('link', { name: 'Administrera tillgång' }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const code = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await expect(page.getByRole('list', { name: 'Inbjudningar' })).toContainText('Väntar på svar');

    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).focus();
    await recipientPage.keyboard.type(code);
    await recipientPage.keyboard.press('Tab');
    await expect(recipientPage.getByRole('button', { name: 'Acceptera inbjudan' })).toBeFocused();
    await recipientPage.keyboard.press('Enter');
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await expect(recipientPage.getByRole('link', { name: 'Administrera tillgång' })).toHaveCount(0);
    expect(
      await recipientPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Medlemmar' })).toContainText(robin.name);
    await expect(page.getByRole('list', { name: 'Inbjudningar' })).toContainText('Accepterad');
    await expect(page.getByLabel('Inbjudningskod att dela')).toHaveCount(0);
  } finally {
    await recipient.close();
    await installation.close();
  }
});

test('MEDLEM-07: a recipient can check access when the acceptance response is lost', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const administrator = await browser.newContext();
  try {
    await signIn(administrator.request, installation.origin);
    const { household } = await (
      await createHousehold(administrator.request, installation.origin)
    ).json();
    installation.setIdentity(robin);
    await signIn(page.request, installation.origin, 'microsoft');
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await administrator.request.post(
        `${installation.origin}/api/households/${household.id}/invitations`,
        { headers: { origin: installation.origin }, data: { userId: user.id } },
      )
    ).json();
    await page.goto(installation.origin);
    await page.route('**/api/invitations/accept', (route) => route.abort());
    await page.getByLabel('Inbjudningskod', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(page.getByRole('alert')).toContainText('Inbjudan kunde inte bekräftas');
    await expect(page.getByLabel('Inbjudningskod', { exact: true })).toHaveValue(code);
    await page.getByRole('button', { name: 'Kontrollera tillgång' }).click();
    await expect(
      page.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
    await page.unroute('**/api/invitations/accept');
    await page.route('**/api/invitations/accept', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort();
    });
    await page.getByLabel('Inbjudningskod', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(page.getByRole('alert')).toContainText('Inbjudan kunde inte bekräftas');
    await expect(page.getByRole('button', { name: 'Kontrollera tillgång' })).toBeVisible();
    await page.getByRole('button', { name: 'Kontrollera tillgång' }).click();
    await expect(page.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
  } finally {
    await administrator.close();
    await installation.close();
  }
});

test('MEDLEM-02: invitation errors are recoverable and a revoked code cannot grant access', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const { user } = await (
      await recipient.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill('unknown-user');
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Skyttel-användaren finns inte');
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const code = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await expect(
      page.getByRole('button', { name: 'Återkalla inbjudan', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Återkalla inbjudan', exact: true }).click();
    await page.getByRole('button', { name: 'Bekräfta återkallelse' }).click();
    await expect(page.getByRole('list', { name: 'Inbjudningar' })).toContainText('Återkallad');
    await expect(page.getByLabel('Inbjudningskod att dela')).toHaveCount(0);
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(code);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('alert')).toContainText('Inbjudan kan inte användas');
    await expect(recipientPage.getByLabel('Inbjudningskod', { exact: true })).toHaveValue(code);
    await expect(
      recipientPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
  } finally {
    await recipient.close();
    await installation.close();
  }
});

test('MEDLEM-03: administrators share responsibility and open clients lose revoked access without disrupting input', async ({
  page,
  browser,
}) => {
  test.setTimeout(45_000);
  const installation = await createInstallation();
  const second = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.setIdentity(robin);
    await signIn(second.request, installation.origin, 'microsoft');
    const { user } = await (
      await second.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${installation.origin}/api/households/${household.id}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await second.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    const robinRow = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ hasText: robin.name });
    await expect(robinRow.getByRole('button', { name: 'Gör till administratör' })).toBeVisible();
    await robinRow.getByRole('button', { name: 'Gör till administratör' }).click();
    await expect(robinRow.getByText('Administratör', { exact: true })).toBeVisible();

    const editor = page.getByLabel('Skyttel-användar-ID att bjuda in');
    await editor.fill('påbörjat-id');
    await editor.focus();
    await page.waitForResponse(
      (response) =>
        response.url().endsWith('/administration') && response.request().method() === 'GET',
    );
    await expect(editor).toHaveValue('påbörjat-id');
    await expect(editor).toBeFocused();

    const secondPage = await second.newPage();
    await secondPage.goto(`${installation.origin}/households/${household.id}/administration`);
    const ownRow = secondPage
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ hasText: `${robin.name} (du)` });
    await expect(ownRow.getByRole('button', { name: 'Gör till medlem' })).toBeVisible();
    await expect(ownRow.getByRole('button', { name: 'Gör till medlem' })).toBeDisabled();
    await expect(ownRow.getByRole('button', { name: 'Återkalla tillgång' })).toBeVisible();
    await expect(ownRow.getByRole('button', { name: 'Återkalla tillgång' })).toBeDisabled();
    const alexRow = secondPage
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ hasText: 'Alex Exempel' });
    await alexRow.getByRole('button', { name: 'Gör till medlem' }).click();
    await expect(
      page.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('list', { name: 'Medlemmar' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Till startsidan' }).click();
    await expect(page.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Administrera tillgång' })).toHaveCount(0);
    await expect(ownRow.getByRole('button', { name: 'Gör till medlem' })).toBeDisabled();
    await expect(ownRow.getByRole('button', { name: 'Återkalla tillgång' })).toBeDisabled();
    await alexRow.getByRole('button', { name: 'Återkalla tillgång' }).click();
    await expect(alexRow).toContainText('Personer och innehåll i kartan finns kvar');
    await alexRow.getByRole('button', { name: 'Avbryt' }).click();
    await expect(alexRow.getByRole('button', { name: 'Bekräfta återkallelse' })).toHaveCount(0);
    await alexRow.getByRole('button', { name: 'Återkalla tillgång' }).click();
    await alexRow.getByRole('button', { name: 'Bekräfta återkallelse' }).click();
    await expect(
      page.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Hushållet Linden' })).toHaveCount(0);
    await expect(secondPage.getByRole('list', { name: 'Medlemmar' })).not.toContainText(
      'Alex Exempel',
    );
  } finally {
    await second.close();
    await installation.close();
  }
});
