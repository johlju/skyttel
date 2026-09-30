import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import type { Administration } from '../../src/shared/administration.js';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openSettings, openWorkspace, signIn } from '../support/client.js';
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
    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const oldCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await page.reload();
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
    await expect(page.getByLabel('Inbjudningskod att dela')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Inbjudningar' })).toContainText('Väntar på svar');

    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
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
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
    await expect(invitations).toContainText('Accepterad');
    await page.getByRole('button', { name: 'Medlemmar', exact: true }).click();
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
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
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

    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const newCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(newCode);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
    await expect(invitations).toContainText('Accepterad');
    await page.getByRole('button', { name: 'Medlemmar', exact: true }).click();
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
    await openWorkspace(recipientPage);
    await recipientPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await recipientPage.getByLabel('Objektets namn').fill('Robin i kartan');
    await recipientPage.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    await recipientPage.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(recipientPage.getByRole('status')).toContainText('Sparat');
    await page.goto(`${installation.origin}/households/${household.id}/administration`);

    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
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
    await openWorkspace(page);
    await page.getByLabel('Sök objekt').fill('Robin i kartan');
    await expect(
      page.getByRole('button', { name: 'Uppgifter för Robin i kartan', exact: true }),
    ).toBeVisible();

    await openSettings(page);

    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const newCode = await page.getByLabel('Inbjudningskod att dela').inputValue();
    expect(newCode).not.toBe(code);
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(newCode);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan' }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await openWorkspace(recipientPage);
    await recipientPage.getByLabel('Sök objekt').fill('Robin i kartan');
    await expect(
      recipientPage.getByRole('button', { name: 'Uppgifter för Robin i kartan', exact: true }),
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
    await openSettings(page);
    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const code = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Inbjudningar' })).toContainText('Väntar på svar');

    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).focus();
    await recipientPage.keyboard.type(code);
    await recipientPage.keyboard.press('Tab');
    await expect(recipientPage.getByRole('button', { name: 'Acceptera inbjudan' })).toBeFocused();
    await recipientPage.keyboard.press('Enter');
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await openSettings(recipientPage);
    await expect(
      recipientPage.getByRole('link', { name: 'Administrera tillgång', exact: true }),
    ).toHaveCount(0);
    expect(
      await recipientPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Medlemmar' })).toContainText(robin.name);
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
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
    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill('unknown-user');
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Skyttel-användaren finns inte');
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(user.id);
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const code = await page.getByLabel('Inbjudningskod att dela').inputValue();
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
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

    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
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
    await openSettings(page);
    await expect(
      page.getByRole('link', { name: 'Administrera tillgång', exact: true }),
    ).toHaveCount(0);
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

test('MEDLEM-08: staged invitation copies its one-time code and revocation retires an open recipient workspace', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const read = async () => (await page.request.get(`${path}/map`)).json();
    const post = (suffix: string, data: unknown) =>
      page.request.post(`${path}/${suffix}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const value = { typeId: initial.types[0].id, name: 'Bevarad cykel', description: '' };
    expect(
      (await post('map/draft', { id: 'cycle', version: 0, baseRevision: null, value })).status(),
    ).toBe(200);
    expect(
      (
        await post('map/save', {
          version: (await read()).draft.version,
          operationId: 'before-invite',
        })
      ).status(),
    ).toBe(200);
    const saved = await read();
    expect(
      (
        await post('map/draft', {
          id: 'cycle',
          version: saved.draft.version,
          contentVersion: saved.contentVersion,
          baseRevision: saved.objects[0].revision,
          value: { ...value, description: 'Alex privata förslag' },
        })
      ).status(),
    ).toBe(200);
    const before = await read();
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    const userId = await recipientPage.getByLabel('Ditt Skyttel-användar-ID').inputValue();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: installation.origin,
    });
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const unsent = page.getByLabel('Objektets namn');
    await unsent.fill('Alex oskickade arbete');
    await openSettings(page);
    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Administrera tillgång', exact: true }),
    ).toBeFocused();
    await expect(unsent).toHaveValue('Alex oskickade arbete');
    await expect(unsent).not.toBeVisible();
    const ready = page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true });
    await expect(ready).toBeVisible();
    await expect(page.getByLabel('Skyttel-användar-ID att bjuda in')).toHaveCount(0);
    await expect(page.getByText(/Ett namn eller en e-postadress/)).toBeVisible();
    await ready.click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    const creating = page.waitForResponse(
      (response) =>
        response.url() === `${path}/invitations` && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const created = await creating;
    expect(created.status()).toBe(201);
    const invitation = await created.json();
    expect(invitation.invitation.userId).toBe(userId);
    const codeField = page.getByLabel('Inbjudningskod att dela');
    await expect(codeField).toHaveValue(invitation.code);
    await expect(page.getByText(/Skicka koden privat till/)).toContainText(userId);
    await expect(page.getByText(/kan användas en gång/)).toBeVisible();
    await page.getByRole('button', { name: 'Kopiera koden', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Koden är kopierad');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invitation.code);
    await page.getByRole('button', { name: 'Inbjudningar', exact: true }).click();
    const invitations = page.getByRole('list', { name: 'Inbjudningar' });
    await expect(invitations).toContainText('Väntar på svar');
    await expect(page.getByRole('list', { name: 'Medlemmar' })).not.toBeVisible();
    await expect(codeField).toHaveValue(invitation.code);
    await page.getByRole('button', { name: 'Klar med inbjudan', exact: true }).click();
    await expect(codeField).toHaveCount(0);
    await expect(ready).toBeVisible();
    expect(await read()).toEqual(before);
    await recipientPage.getByLabel('Inbjudningskod', { exact: true }).fill(invitation.code);
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan', exact: true }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    await openWorkspace(recipientPage);
    await recipientPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const recipientUnsent = recipientPage.getByLabel('Objektets namn');
    await recipientUnsent.fill('Robins oskickade arbete');
    await expect(invitations).toContainText('Accepterad', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Medlemmar', exact: true }).click();
    await expect(invitations).not.toBeVisible();
    const member = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ hasText: userId });
    await expect(member).toContainText(robin.name);
    await member.getByRole('button', { name: 'Återkalla tillgång', exact: true }).click();
    await expect(member).toContainText('Alla befintliga sessioner förlorar tillgång');
    await expect(member).toContainText('Personer och innehåll i kartan finns kvar');
    await member.getByRole('button', { name: 'Bekräfta återkallelse', exact: true }).click();
    await expect(
      recipientPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(recipientUnsent).toHaveCount(0);
    expect((await recipient.request.get(`${path}/map`)).status()).toBe(403);
    await expect(member).toHaveCount(0);
    expect(await read()).toEqual(before);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(unsent).toHaveValue('Alex oskickade arbete');
    await expect(unsent).toBeFocused();
    expect(await read()).toEqual(before);
    await openSettings(page);
    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await page.reload();
    await expect(codeField).toHaveCount(0);
    await expect(ready).toBeVisible();
  } finally {
    await recipient.close();
    await installation.close();
  }
});

test('MEDLEM-09: failed clipboard writing keeps the real code usable by manual copy and acceptance', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recipient = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const read = async (): Promise<MapState> => (await page.request.get(`${path}/map`)).json();
    const initial = await read();
    expect(
      (
        await page.request.post(`${path}/map/draft`, {
          headers: { origin: installation.origin },
          data: {
            id: 'clipboard-private',
            version: initial.draft.version,
            contentVersion: initial.contentVersion,
            baseRevision: null,
            value: {
              typeId: initial.types[0].id,
              name: 'Privat under kopiering',
              description: 'Alex behåller sitt eget förslag',
            },
          },
        })
      ).status(),
    ).toBe(200);
    const before = await read();
    installation.setIdentity(robin);
    await signIn(recipient.request, installation.origin, 'microsoft');
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(installation.origin);
    const userId = await recipientPage.getByLabel('Ditt Skyttel-användar-ID').inputValue();
    // Only the browser API fails. Native keyboard copy/paste and the whole
    // invitation service remain real; this does not prove a browser permission policy.
    await page.addInitScript(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        value: async () => {
          throw new DOMException('Synthetic clipboard denial', 'NotAllowedError');
        },
      });
    });
    let creations = 0;
    page.on('request', (request) => {
      if (request.url() === `${path}/invitations` && request.method() === 'POST') creations += 1;
    });
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    await page.getByRole('button', { name: 'Jag har personens användar-ID', exact: true }).click();
    await page.getByLabel('Skyttel-användar-ID att bjuda in').fill(userId);
    const creating = page.waitForResponse(
      (response) =>
        response.url() === `${path}/invitations` && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Skapa inbjudan', exact: true }).click();
    const created = await creating;
    expect(created.status()).toBe(201);
    const invitation = await created.json();
    expect(invitation.invitation.userId).toBe(userId);
    const code = page.getByLabel('Inbjudningskod att dela');
    await expect(code).toHaveValue(invitation.code);
    await page.getByRole('button', { name: 'Kopiera koden', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Koden kunde inte kopieras. Markera och kopiera koden i fältet själv.',
    );
    await expect(page.getByText(/Skicka koden privat till/)).toContainText(userId);
    await expect(code).toHaveValue(invitation.code);
    const pending: Administration = await (await page.request.get(`${path}/administration`)).json();
    expect(pending.invitations).toHaveLength(1);
    expect(pending.invitations[0]).toMatchObject({
      id: invitation.invitation.id,
      userId,
      status: 'pending',
    });
    expect(await read()).toEqual(before);

    await code.selectText();
    await page.keyboard.press('ControlOrMeta+C');
    await recipientPage.bringToFront();
    const acceptingCode = recipientPage.getByLabel('Inbjudningskod', { exact: true });
    await acceptingCode.focus();
    await recipientPage.keyboard.press('ControlOrMeta+V');
    await expect(acceptingCode).toHaveValue(invitation.code);
    const accepting = recipientPage.waitForResponse(
      (response) =>
        response.url() === `${installation.origin}/api/invitations/accept` &&
        response.request().method() === 'POST',
    );
    await recipientPage.getByRole('button', { name: 'Acceptera inbjudan', exact: true }).click();
    expect((await accepting).status()).toBe(200);
    await expect(recipientPage.getByRole('heading', { name: 'Hushållet Linden' })).toBeVisible();
    await expect(recipientPage.getByText('Medlem', { exact: true })).toBeVisible();
    const after: Administration = await (await page.request.get(`${path}/administration`)).json();
    expect(after.invitations).toHaveLength(1);
    expect(after.invitations[0]).toMatchObject({
      id: invitation.invitation.id,
      userId,
      status: 'accepted',
    });
    expect(after.members.find((member) => member.userId === userId)?.role).toBe('member');
    expect(creations).toBe(1);
    expect(await read()).toEqual(before);
    const recipientMap: MapState = await (await recipient.request.get(`${path}/map`)).json();
    expect(recipientMap.objects).toEqual(before.objects);
    expect(recipientMap.draft.changes).toEqual([]);
    await page.bringToFront();
    await expect(code).toHaveCount(0, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Klar med inbjudan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Jag har personens användar-ID' })).toBeVisible();
  } finally {
    await recipient.close();
    await installation.close();
  }
});
