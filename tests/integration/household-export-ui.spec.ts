import { readFile } from 'node:fs/promises';
import { type BrowserContext, type Download, expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

async function arrange(page: Page) {
  const installation = await createInstallation();
  await signIn(page.request, installation.origin);
  const { household } = await (await createHousehold(page.request, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}`;
  const headers = { origin: installation.origin };
  const read = async (): Promise<MapState> => (await page.request.get(`${path}/map`)).json();
  const state = await read();
  expect(
    (
      await page.request.post(`${path}/map/draft`, {
        headers,
        data: {
          id: 'shared-object',
          version: 0,
          baseRevision: null,
          value: {
            typeId: state.types[0].id,
            name: 'Gemensam lampa',
            description: 'Gemensam uppgift',
          },
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`${path}/map/save`, {
        headers,
        data: { version: 1, operationId: 'initial-content' },
      })
    ).status(),
  ).toBe(200);
  return {
    installation,
    household,
    path,
    headers,
    read,
    administration: `${installation.origin}/households/${household.id}/administration`,
  };
}

async function inviteMember(
  fixture: Awaited<ReturnType<typeof arrange>>,
  page: Page,
  context: BrowserContext,
) {
  fixture.installation.setIdentity(robin);
  await signIn(context.request, fixture.installation.origin, 'microsoft');
  const { user } = await (
    await context.request.get(`${fixture.installation.origin}/api/bootstrap`)
  ).json();
  const response = await page.request.post(`${fixture.path}/invitations`, {
    headers: fixture.headers,
    data: { userId: user.id },
  });
  expect(response.status()).toBe(201);
  const { code } = await response.json();
  expect(
    (
      await context.request.post(`${fixture.installation.origin}/api/invitations/accept`, {
        headers: fixture.headers,
        data: { code },
      })
    ).status(),
  ).toBe(200);
  return user as { id: string; name: string };
}

async function archive(download: Download) {
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe('skyttel-hushall.zip');
  const file = await download.path();
  expect(file).not.toBeNull();
  const parts = unzipSync(new Uint8Array(await readFile(file as string)));
  expect(Object.keys(parts).sort()).toEqual(['content.json', 'images.bin', 'manifest.json']);
  const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  expect(manifest).toMatchObject({ format: 'skyttel-household', version: 1 });
  return { parts, content: JSON.parse(Buffer.from(parts['content.json']).toString()) };
}

test('EXPORT-01: an administrator downloads the complete household archive by keyboard', async ({
  page,
  browser,
}) => {
  const fixture = await arrange(page);
  const member = await browser.newContext();
  try {
    const { path, headers, installation } = fixture;
    const memberUser = await inviteMember(fixture, page, member);
    let state = await fixture.read();
    const image = await sharp({
      create: { width: 24, height: 18, channels: 3, background: '#2255aa' },
    })
      .png()
      .toBuffer();
    expect(
      (
        await page.request.post(`${path}/profile-images/shared-object`, {
          headers: {
            ...headers,
            'content-type': 'image/png',
            'x-skyttel-draft-version': String(state.draft.version),
            'x-skyttel-content-version': String(state.contentVersion),
            'x-skyttel-object-revision': String(state.objects[0].revision),
          },
          data: image,
        })
      ).status(),
    ).toBe(200);
    state = await fixture.read();
    expect(
      (
        await page.request.post(`${path}/map/save`, {
          headers,
          data: { version: state.draft.version, operationId: 'profile-image' },
        })
      ).status(),
    ).toBe(200);
    state = await fixture.read();
    expect(
      (
        await member.request.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'private-object',
            version: 0,
            baseRevision: null,
            value: {
              typeId: state.types[0].id,
              name: 'Robins privata förslag',
              description: 'Privat uppgift',
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.request.post(`${path}/map/view/position`, {
          headers,
          data: { id: 'shared-object', version: 0, position: { x: 20, y: -10, z: 3 } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.request.post(`${path}/map/view/settings`, {
          headers,
          data: { version: 0, settings: { ...defaultViewSettings, stars: true } },
        })
      ).status(),
    ).toBe(200);
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await expect(
      memberPage.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    await expect(memberPage.getByRole('link', { name: 'Administrera tillgång' })).toHaveCount(0);
    await memberPage.goto(fixture.administration);
    await expect(
      memberPage.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole('button', { name: 'Förbered fullständig export' }),
    ).toHaveCount(0);

    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(fixture.administration);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    await expect(section).toContainText('andra användares privata utkast och personliga vyer');
    await expect(section).toContainText('bilder och ändringshistorik');
    await expect(section).toContainText('Förvara filen säkert');
    await expect(section).toContainText('sedan din senaste egna export');
    await section.getByRole('button', { name: 'Förbered fullständig export' }).focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('status')).toContainText('Exporten är klar att hämta');
    await expect(section.locator('time')).toHaveAttribute('datetime', /T/);
    expect(downloads).toHaveLength(0);
    const downloadButton = section.getByRole('button', { name: 'Hämta ZIP-fil' });
    await downloadButton.focus();
    const pendingDownload = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const result = await archive(await pendingDownload);
    expect(result.content.objects).toEqual([
      expect.objectContaining({ id: 'shared-object', name: 'Gemensam lampa' }),
    ]);
    expect(result.content.history).toHaveLength(2);
    expect(result.content.drafts).toContainEqual(
      expect.objectContaining({
        userId: memberUser.id,
        changes: [
          expect.objectContaining({
            id: 'private-object',
            after: expect.objectContaining({ name: 'Robins privata förslag' }),
          }),
        ],
      }),
    );
    expect(result.content.positions).toContainEqual(
      expect.objectContaining({
        userId: memberUser.id,
        objectId: 'shared-object',
        x: 20,
        y: -10,
        z: 3,
      }),
    );
    expect(result.content.viewSettings).toContainEqual(
      expect.objectContaining({
        userId: memberUser.id,
        settings: expect.objectContaining({ stars: true }),
      }),
    );
    expect(result.parts['images.bin'].length).toBeGreaterThan(0);
    await expect(section.getByRole('status')).toContainText(
      'Webbläsarens nedladdning har startats',
    );
    await expect(downloadButton).toHaveCount(0);
  } finally {
    await member.close();
    await fixture.installation.close();
  }
});

test('EXPORT-02: an administrator cancels an export and prepares another', async ({ page }) => {
  const fixture = await arrange(page);
  try {
    const state = await fixture.read();
    expect(
      (
        await page.request.post(`${fixture.path}/map/draft`, {
          headers: fixture.headers,
          data: {
            id: 'private-proposal',
            version: state.draft.version,
            baseRevision: null,
            value: {
              typeId: state.types[0].id,
              name: 'Privat förslag',
              description: 'Bevara texten',
            },
          },
        })
      ).status(),
    ).toBe(200);
    const before = await fixture.read();
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(fixture.administration);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    const preparedResponse = page.waitForResponse(
      (response) =>
        response.url() === `${fixture.path}/exports` && response.request().method() === 'POST',
    );
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const prepared = await (await preparedResponse).json();
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toBeVisible();
    await section.getByRole('button', { name: 'Avbryt export' }).click();
    await expect(section.getByRole('status')).toHaveText('Exporten har avbrutits.');
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toHaveCount(0);
    expect(downloads).toHaveLength(0);
    expect((await page.request.get(`${fixture.path}/exports/${prepared.id}`)).status()).toBe(404);
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const pendingDownload = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    const result = await archive(await pendingDownload);
    expect(result.content.objects).toEqual([
      expect.objectContaining({ id: 'shared-object', name: 'Gemensam lampa' }),
    ]);
    expect(result.content.drafts).toContainEqual(
      expect.objectContaining({ changes: [expect.objectContaining({ id: 'private-proposal' })] }),
    );
    expect(await fixture.read()).toEqual(before);
  } finally {
    await fixture.installation.close();
  }
});

test('EXPORT-03: an interrupted download offers a new export without reporting success', async ({
  page,
}) => {
  const fixture = await arrange(page);
  try {
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(fixture.administration);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toBeVisible();
    // Only the network transfer fails; preparation and recovery use the real application.
    await page.route('**/exports/*', (route) => route.abort('connectionreset'), { times: 1 });
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    await expect(section.getByRole('alert')).toContainText(
      'Kontrollera anslutningen och förbered en ny export',
    );
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toHaveCount(0);
    await expect(section.getByText(/Webbläsarens nedladdning har startats/)).toHaveCount(0);
    expect(downloads).toHaveLength(0);
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const pendingDownload = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    await archive(await pendingDownload);
    await expect(section.getByRole('alert')).toHaveCount(0);
    await expect(section.getByRole('status')).toContainText(
      'Webbläsarens nedladdning har startats',
    );
  } finally {
    await fixture.installation.close();
  }
});

test('EXPORT-04: a changed administrator role blocks export and clears the ready download', async ({
  page,
  browser,
}) => {
  const fixture = await arrange(page);
  const secondAdministrator = await browser.newContext();
  try {
    const member = await inviteMember(fixture, page, secondAdministrator);
    expect(
      (
        await page.request.post(`${fixture.path}/members/${member.id}/role`, {
          headers: fixture.headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    const { user } = await (
      await page.request.get(`${fixture.installation.origin}/api/bootstrap`)
    ).json();
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(fixture.administration);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toBeVisible();
    // Schedule the real role change just before the real download request reaches the server.
    await page.route(
      '**/exports/*',
      async (route) => {
        expect(
          (
            await secondAdministrator.request.post(`${fixture.path}/members/${user.id}/role`, {
              headers: fixture.headers,
              data: { role: 'member' },
            })
          ).status(),
        ).toBe(200);
        await route.continue();
      },
      { times: 1 },
    );
    const denied = page.waitForResponse(
      (response) =>
        response.url().startsWith(`${fixture.path}/exports/`) &&
        response.request().method() === 'GET',
    );
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    expect((await denied).status()).toBe(403);
    await expect(section).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeVisible();
    expect(downloads).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Förbered fullständig export' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Till startsidan' }).click();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Medlem', { exact: true })).toBeVisible();
  } finally {
    await secondAdministrator.close();
    await fixture.installation.close();
  }
});

test('EXPORT-05: an expired export requires a new preparation', async ({ page }) => {
  const fixture = await arrange(page);
  try {
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(fixture.administration);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toBeVisible();
    // Server expiry itself is covered with a controlled clock and real SQLite.
    await page.route(
      '**/exports/*',
      (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'export_not_found' }),
        }),
      { times: 1 },
    );
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    await expect(section.getByRole('alert')).toContainText('Exporten har gått ut');
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toHaveCount(0);
    expect(downloads).toHaveLength(0);
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    await expect(section.getByRole('status')).toContainText('Exporten är klar att hämta');
    await expect(section.getByRole('alert')).toHaveCount(0);
    const pendingDownload = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    await archive(await pendingDownload);
  } finally {
    await fixture.installation.close();
  }
});
