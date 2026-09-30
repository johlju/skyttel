import { readFile } from 'node:fs/promises';
import {
  type BrowserContext,
  type Download,
  expect,
  type Page,
  request,
  test,
} from '@playwright/test';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import {
  createHousehold,
  openSettings,
  openWorkspace,
  restartWithSession,
  signIn,
} from '../support/client.js';
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
    exportPage: `${installation.origin}/households/${household.id}/settings/export`,
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
  const bytes = await readFile(file as string);
  const parts = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(parts).sort()).toEqual(['content.json', 'images.bin', 'manifest.json']);
  const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  expect(manifest).toMatchObject({ format: 'skyttel-household', version: 1 });
  return { bytes, parts, content: JSON.parse(Buffer.from(parts['content.json']).toString()) };
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
    await openSettings(memberPage);
    await expect(memberPage.getByRole('link', { name: 'Administrera tillgång' })).toHaveCount(0);
    await expect(memberPage.getByRole('link', { name: 'Fullständig export' })).toHaveCount(0);
    await memberPage.goto(fixture.exportPage);
    await expect(
      memberPage.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole('button', { name: 'Förbered fullständig export' }),
    ).toHaveCount(0);

    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(installation.origin);
    await openSettings(page);
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Fullständig export', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(fixture.exportPage);
    await expect(
      page.getByRole('heading', { name: 'Fullständig export', level: 1, exact: true }),
    ).toBeFocused();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).not.toBeVisible();
    const section = page.getByRole('region', { name: 'Fullständig export' });
    await expect(section).toContainText('andra användares privata utkast och personliga vyer');
    await expect(section).toContainText('bilder och ändringshistorik');
    await expect(section).toContainText('Som administratör kan du läsa');
    await expect(section).toContainText('Filen är inte lösenordsskyddad');
    await expect(section).toContainText(
      'Inga inloggningssessioner, aktiva token eller serverhemligheter',
    );
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
    await page.goto(fixture.exportPage);
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
    await page.goto(fixture.exportPage);
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
    await page.goto(fixture.exportPage);
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
    await page.goto(fixture.exportPage);
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

test('EXPORT-08: canceling preparation with an unseen ready response explains cleanup uncertainty', async ({
  page,
}) => {
  const fixture = await arrange(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let prepared = (_id: string) => {};
  const preparedId = new Promise<string>((resolve) => {
    prepared = resolve;
  });
  try {
    const before = await fixture.read();
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await page.goto(fixture.exportPage);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    // Hold only delivery of the real ready response; the server has made the archive.
    await page.route(
      `${fixture.path}/exports`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        prepared((await response.json()).id);
        await held;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const previousId = await preparedId;
    await expect(section.getByRole('status')).toHaveText('Förbereder exporten…');
    await section.getByRole('button', { name: 'Avbryt export' }).focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('status')).toContainText('Förberedelsen har avbrutits');
    await expect(section.getByRole('status')).toContainText(
      'En tillfällig kopia kan finnas kvar tills giltighetstiden går ut',
    );
    await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toHaveCount(0);
    release();
    const fresh = page.waitForResponse(
      (response) =>
        response.url() === `${fixture.path}/exports` && response.request().method() === 'POST',
    );
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const currentId = (await (await fresh).json()).id;
    expect(currentId).not.toBe(previousId);
    await expect(section.getByRole('status')).toContainText('Exporten är klar att hämta');
    expect((await page.request.get(`${fixture.path}/exports/${previousId}`)).status()).toBe(404);
    const download = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    await archive(await download);
    expect(downloads).toHaveLength(1);
    expect(await fixture.read()).toEqual(before);
  } finally {
    release();
    await fixture.installation.close();
  }
});

for (const { width, height } of [
  { width: 1280, height: 900 },
  { width: 390, height: 900 },
  { width: 320, height: 900 },
  { width: 640, height: 500 },
]) {
  test(`EXPORT-09: keyboard export controls retain focus and unsent map work at ${width}px`, async ({
    page,
  }) => {
    const fixture = await arrange(page);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let prepared = () => {};
    const serverReady = new Promise<void>((resolve) => {
      prepared = resolve;
    });
    try {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const before = await fixture.read();
      await page.goto(fixture.installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Oskickad exportcykel');
      await page.getByLabel('Beskrivning', { exact: true }).fill('Texten finns kvar');
      await openSettings(page);
      const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
      if (width <= 800) await navigation.getByText('Välj inställning', { exact: true }).click();
      await navigation.getByRole('link', { name: 'Fullständig export', exact: true }).click();
      const section = page.getByRole('region', { name: 'Fullständig export' });
      await expect(section.getByRole('heading', { level: 1 })).toBeFocused();
      if (width <= 800) await expect(navigation.locator('details')).not.toHaveAttribute('open');
      await expect
        .poll(() =>
          section.getByRole('heading', { level: 1 }).evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              document.activeElement === element &&
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              box.left >= 0 &&
              box.right <= innerWidth &&
              element.contains(
                document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
              )
            );
          }),
        )
        .toBe(true);
      await expect(page.getByLabel('Objektets namn')).not.toBeVisible();
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await section.getByRole('button', { name: 'Förbered fullständig export' }).focus();
        await page.keyboard.press('Enter');
        const download = section.getByRole('button', { name: 'Hämta ZIP-fil' });
        await expect(download).toBeFocused();
        await download.click({ trial: true });
        const box = await download.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await section.getByRole('button', { name: 'Avbryt export' }).focus();
        await page.keyboard.press('Enter');
        await expect(section.getByRole('status')).toHaveText('Exporten har avbrutits.');
        await expect(
          section.getByRole('button', { name: 'Förbered fullständig export' }),
        ).toBeFocused();
      }
      await page.route(
        `${fixture.path}/exports`,
        async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          prepared();
          await held;
          await route.fulfill({ response });
        },
        { times: 1 },
      );
      await section.getByRole('button', { name: 'Förbered fullständig export' }).focus();
      await page.keyboard.press('Enter');
      await serverReady;
      const returnLink = page.getByRole('link', { name: 'Tillbaka till kartan', exact: true });
      await returnLink.focus();
      release();
      await expect(section.getByRole('status')).toContainText('Exporten är klar att hämta');
      await expect(returnLink).toBeFocused();
      await section.getByRole('button', { name: 'Hämta ZIP-fil' }).focus();
      const downloaded = page.waitForEvent('download');
      await page.keyboard.press('Enter');
      const result = await archive(await downloaded);
      expect(result.content.objects).toEqual([
        expect.objectContaining({ id: 'shared-object', name: 'Gemensam lampa' }),
      ]);
      await expect(
        section.getByRole('button', { name: 'Förbered fullständig export' }),
      ).toBeFocused();
      await returnLink.click();
      await expect(page.getByLabel('Objektets namn')).toHaveValue('Oskickad exportcykel');
      await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Texten finns kvar',
      );
      await expect(page.getByLabel('Beskrivning', { exact: true })).toBeFocused();
      expect(await fixture.read()).toEqual(before);
    } finally {
      release();
      await fixture.installation.close();
    }
  });
}

test('EXPORT-10: the downloaded current-format archive restores shared, private and historical content after restart', async ({
  page,
}) => {
  const fixture = await arrange(page);
  let client = await request.newContext({ storageState: await page.context().storageState() });
  try {
    const { path, headers, installation } = fixture;
    const read = async (): Promise<MapState> => (await client.get(`${path}/map`)).json();
    const post = async (route: string, body: Record<string, unknown>) => {
      const state = await read();
      const response = await client.post(`${path}/map/${route}`, {
        headers,
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...body },
      });
      expect(response.status(), await response.text()).toBe(200);
      return response;
    };
    const originalType = (await read()).types[0];
    await post('object-type', {
      id: originalType.id,
      baseRevision: originalType.revision,
      value: {
        name: originalType.name,
        description: 'Uppgifter som följer med exporten',
        sections: [{ id: 'facts', name: 'Uppgifter' }],
        fields: [
          { id: 'count', name: 'Antal', description: '', kind: 'number', sectionId: 'facts' },
          { id: 'confirmed', name: 'Bekräftad', description: '', kind: 'boolean', sectionId: '' },
        ],
        builtins: [
          { key: 'description', name: 'Kommentar', sectionId: 'facts' },
          { key: 'debt', name: 'Skuld', sectionId: '' },
        ],
        propertyOrder: ['field:count', 'builtin:description', 'field:confirmed', 'builtin:debt'],
      },
    });
    await post('draft', {
      id: 'shared-object',
      baseRevision: (await read()).objects[0].revision,
      value: {
        typeId: originalType.id,
        name: 'Gemensam lampa',
        description: 'Kommentar i det ordnade avsnittet',
        iconId: 'bike',
        customValues: { count: 0, confirmed: false },
        financialFacts: {
          debt: { knowledge: 'uncertain', value: '12 300', reportedOn: '2026-09-01' },
        },
      },
    });
    await post('draft', {
      id: 'garage',
      baseRevision: null,
      value: { typeId: originalType.id, name: 'Garaget', description: '' },
    });
    await post('relationship-type', {
      id: 'storage',
      baseRevision: null,
      value: {
        name: 'Förvaring',
        description: 'Var saken finns',
        forwardLabel: 'förvaras i',
        reverseLabel: 'innehåller',
        sections: [{ id: 'storage-facts', name: 'Förvaringen' }],
        fields: [
          {
            id: 'amount',
            name: 'Belopp',
            description: '',
            kind: 'number',
            sectionId: 'storage-facts',
          },
          {
            id: 'locked',
            name: 'Låst',
            description: '',
            kind: 'boolean',
            sectionId: 'storage-facts',
          },
          {
            id: 'note',
            name: 'Anteckning',
            description: '',
            kind: 'text',
            sectionId: 'storage-facts',
          },
          { id: 'date', name: 'Startdatum', description: '', kind: 'date', sectionId: '' },
        ],
      },
    });
    await post('relationship', {
      id: 'stored-lamp',
      baseRevision: null,
      value: {
        typeId: 'storage',
        sourceId: 'shared-object',
        targetId: 'garage',
        knowledge: 'known',
        customValues: { amount: 0, locked: false, note: 'Övre hyllan', date: '2026-09-01' },
      },
    });
    await post('save', { operationId: 'export-properties' });
    const imageIds: string[] = [];
    const imageBytes: Buffer[] = [];
    for (const [index, background] of ['#2255aa', '#aa5522'].entries()) {
      const state = await read();
      const object = state.objects.find(({ id }) => id === 'shared-object');
      const image = await sharp({ create: { width: 24, height: 18, channels: 3, background } })
        .png()
        .toBuffer();
      const response = await client.post(`${path}/profile-images/shared-object`, {
        headers: {
          ...headers,
          'content-type': 'image/png',
          'x-skyttel-draft-version': String(state.draft.version),
          'x-skyttel-content-version': String(state.contentVersion),
          'x-skyttel-object-revision': String(object?.revision),
        },
        data: image,
      });
      expect(response.status()).toBe(200);
      await post('save', { operationId: `export-image-${index}` });
      const imageId = (await read()).objects.find(
        ({ id }) => id === 'shared-object',
      )?.profileImageId;
      expect(imageId).toBeDefined();
      imageIds.push(imageId as string);
      imageBytes.push(await (await client.get(`${path}/profile-images/${imageId}`)).body());
    }
    await post('draft', {
      id: 'private-object',
      baseRevision: null,
      value: { typeId: originalType.id, name: 'Privat förslag från exporten', description: '' },
    });
    expect(
      (
        await client.post(`${path}/map/view/position`, {
          headers,
          data: { id: 'shared-object', version: 0, position: { x: 20, y: -10, z: 3 } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await client.post(`${path}/map/view/settings`, {
          headers,
          data: { version: 0, settings: { ...defaultViewSettings, stars: true } },
        })
      ).status(),
    ).toBe(200);
    const before = await read();
    const history = (await (await client.get(`${path}/map/history`)).json()).history;
    const access = await (await client.get(`${path}/administration`)).json();
    await page.goto(fixture.exportPage);
    const section = page.getByRole('region', { name: 'Fullständig export' });
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const downloaded = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    const result = await archive(await downloaded);
    const manifest = JSON.parse(Buffer.from(result.parts['manifest.json']).toString());
    expect(manifest.schemaVersion).toBe(21);
    const encoded = Buffer.from(result.parts['content.json']).toString();
    for (const excluded of [
      'synthetic-provider-token',
      'synthetic-test-secret-with-at-least-32-characters',
      'fake-secret',
      'accessToken',
      'refreshToken',
      'emailVerified',
      'memberships',
    ])
      expect(encoded).not.toContain(excluded);
    expect(result.content.images).toHaveLength(2);
    expect(result.content.history).toHaveLength(4);
    expect(new Set(result.content.objects.map((object: { id: string }) => object.id)).size).toBe(2);
    const savedObject = before.objects.find(({ id }) => id === 'shared-object');
    expect(savedObject).toBeDefined();
    await post('draft', {
      id: 'shared-object',
      baseRevision: savedObject?.revision,
      value: {
        typeId: savedObject?.typeId,
        name: 'Senare namn som ersätts',
        description: savedObject?.description,
        iconId: savedObject?.iconId,
        profileImageId: savedObject?.profileImageId,
        customValues: savedObject?.customValues,
        financialFacts: savedObject?.financialFacts,
      },
    });
    await post('save', { operationId: 'after-downloaded-copy' });
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Återimportera hushållet', exact: true })
      .click();
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel-hushall.zip',
      mimeType: 'application/zip',
      buffer: result.bytes,
    });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(page.getByText('Filen är kontrollerad.', { exact: false })).toBeVisible();
    const replace = page.getByRole('button', { name: 'Ersätt hushållets innehåll' });
    await expect(replace).toBeDisabled();
    expect((await read()).objects.some(({ name }) => name === 'Senare namn som ersätts')).toBe(
      true,
    );
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await replace.click();
    await expect(
      page.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    client = await restartWithSession(client, () => installation.restart());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Återimportera hushållet' })).toBeVisible();
    const restored = await read();
    expect(restored.contentVersion).toBe(before.contentVersion + 1);
    expect(restored.objects).toEqual(before.objects);
    expect(restored.relationships).toEqual(before.relationships);
    expect(restored.types).toEqual(before.types);
    expect(restored.relationshipTypes).toEqual(before.relationshipTypes);
    expect(restored.draft.changes).toEqual(before.draft.changes);
    expect((await (await client.get(`${path}/map/history`)).json()).history).toEqual(history);
    expect(await (await client.get(`${path}/administration`)).json()).toEqual(access);
    const view = await (await client.get(`${path}/map/view`)).json();
    expect(view.positions).toContainEqual(
      expect.objectContaining({ id: 'shared-object', x: 20, y: -10, z: 3 }),
    );
    expect(view.settings.stars).toBe(true);
    for (const [index, id] of imageIds.entries()) {
      const response = await client.get(`${path}/profile-images/${id}`);
      expect(response.status()).toBe(200);
      expect(await response.body()).toEqual(imageBytes[index]);
    }
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openWorkspace(page);
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toContainText(
      'Gemensam lampa',
    );
    await expect(page.getByRole('region', { name: 'Hela mitt utkast', exact: true })).toContainText(
      'Privat förslag från exporten',
    );
  } finally {
    await client.dispose();
    await fixture.installation.close();
  }
});

for (const phase of ['ready', 'downloading'] as const) {
  test(`EXPORT-11: leaving a ${phase} export retires the copy and preserves unsent map work`, async ({
    page,
  }) => {
    const fixture = await arrange(page);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received = () => {};
    const serverDelivered = new Promise<void>((resolve) => {
      received = resolve;
    });
    let delivered = () => {};
    const browserDelivery = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    try {
      const before = await fixture.read();
      const downloads: Download[] = [];
      page.on('download', (download) => downloads.push(download));
      await page.goto(fixture.installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Oskickat vid avbruten export');
      await page.getByLabel('Beskrivning', { exact: true }).fill('Bevara min redigering');
      await openSettings(page);
      const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
      await navigation.getByRole('link', { name: 'Fullständig export', exact: true }).click();
      const section = page.getByRole('region', { name: 'Fullständig export' });
      const preparedResponse = page.waitForResponse(
        (response) =>
          response.url() === `${fixture.path}/exports` && response.request().method() === 'POST',
      );
      await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
      const ready = await (await preparedResponse).json();
      await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toBeVisible();
      if (phase === 'downloading') {
        // Hold delivery of the real complete response, not archive creation or cleanup.
        await page.route(
          `${fixture.path}/exports/${ready.id}`,
          async (route) => {
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            expect((await response.body()).length).toBe(ready.bytes);
            received();
            await held;
            await route.fulfill({ response });
            delivered();
          },
          { times: 1 },
        );
        await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
        await serverDelivered;
        await expect(section.getByRole('status')).toHaveText('Hämtar och kontrollerar ZIP-filen…');
      }
      const canceled = page.waitForResponse(`${fixture.path}/exports/${ready.id}/cancel`);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      expect((await canceled).status()).toBe(200);
      expect((await page.request.get(`${fixture.path}/exports/${ready.id}`)).status()).toBe(404);
      release();
      if (phase === 'downloading') await browserDelivery;
      await expect(page.getByLabel('Objektets namn')).toHaveValue('Oskickat vid avbruten export');
      await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Bevara min redigering',
      );
      await expect(page.getByLabel('Beskrivning', { exact: true })).toBeFocused();
      expect(downloads).toHaveLength(0);
      expect(await fixture.read()).toEqual(before);
      await openSettings(page);
      await navigation.getByRole('link', { name: 'Fullständig export', exact: true }).click();
      await expect(section.getByRole('button', { name: 'Hämta ZIP-fil' })).toHaveCount(0);
      await expect(section.getByRole('status')).toHaveCount(0);
      await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
      const downloaded = page.waitForEvent('download');
      await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
      const result = await archive(await downloaded);
      expect(result.content.objects).toEqual([
        expect.objectContaining({ id: 'shared-object', name: 'Gemensam lampa' }),
      ]);
      expect(downloads).toHaveLength(1);
    } finally {
      release();
      await fixture.installation.close();
    }
  });
}
