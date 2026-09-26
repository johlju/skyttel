import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

async function startConversation(page: Page, origin: string) {
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(origin);
  await page.getByLabel(/Jag tillåter att OpenAI/).check();
  await page.getByLabel(/Jag tillåter förslag och sparande/).check();
  await page.getByRole('button', { name: 'Starta textassistenten', exact: true }).click();
  await page.getByRole('button', { name: 'Starta röst', exact: true }).click();
  await expect(page.getByText('Mikrofonen är på', { exact: true })).toBeVisible();
}

function conversationInstallation() {
  const live = liveProvider();
  const model = textModel(() => [modelMessage('Vem använder cykeln?')]);
  return createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
}

for (const width of [1280, 390, 320]) {
  test(`ARBETE-01: unsent household work survives ordinary navigation at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      await page.goto(`${installation.origin}/households/${household.id}/`);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Oskickad cykel');
      await page.getByLabel('Beskrivning', { exact: true }).fill('Behåll denna text');
      await page.getByLabel('Sök objekt', { exact: true }).fill('cykel');
      await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'Inloggningssätt', exact: true }),
      ).toBeFocused();
      await expect(page.getByLabel('Objektets namn')).not.toBeVisible();
      await expect(page.getByLabel('Sök objekt', { exact: true })).not.toBeVisible();
      await expect(page.getByText('Administratör', { exact: true })).not.toBeVisible();
      await page.getByRole('link', { name: 'Till startsidan', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Objektets namn')).toHaveValue('Oskickad cykel');
      await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Behåll denna text',
      );
      await expect(page.getByLabel('Sök objekt', { exact: true })).toHaveValue('cykel');
      await expect(page.getByLabel('Objektets namn')).toBeFocused();
      const state = await (
        await page.request.get(`${installation.origin}/api/households/${household.id}/map`)
      ).json();
      expect(state.draft.changes).toEqual([]);
      await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
        'Oskickad cykel',
      );
    } finally {
      await installation.close();
    }
  });
}

test('ARBETE-02: conversation and microphone survive navigation and end on logout', async ({
  page,
}) => {
  const installation = await conversationInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await startConversation(page, installation.origin);
    await page.getByLabel('Meddelande till textassistenten').fill('Berätta om cykeln');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(page.getByRole('log', { name: 'Samtalets dialog' })).toContainText(
      'Vem använder cykeln?',
    );
    await page.getByLabel('Meddelande till textassistenten').fill('Oskickat svar');
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await expect(page.getByText('Mikrofonen är på', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausa mikrofon', exact: true }).click();
    await expect(page.getByText('Mikrofonen är pausad', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(page.getByLabel('Meddelande till textassistenten')).toHaveValue('Oskickat svar');
    await expect(page.getByRole('log', { name: 'Samtalets dialog' })).toContainText(
      'Vem använder cykeln?',
    );
    await expect(page.getByText('Mikrofonen är pausad', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Återuppta mikrofon', exact: true }).click();
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'ended' },
    ]);
    await expect(page.getByLabel('Meddelande till textassistenten')).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('ARBETE-03: revoked household access retires hidden forms and microphone', async ({
  page,
  browser,
}) => {
  const installation = await conversationInstallation();
  const member = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(member.request, installation.origin, 'microsoft');
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await member.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).ok(),
    ).toBe(true);
    const memberPage = await member.newPage();
    await startConversation(memberPage, installation.origin);
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await memberPage.getByLabel('Objektets namn').fill('Privat oskickad cykel');
    await memberPage.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    const membership = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Robin Exempel' }) });
    await membership.getByRole('button', { name: 'Återkalla tillgång', exact: true }).click();
    await membership.getByRole('button', { name: 'Bekräfta återkallelse' }).click();
    await expect(memberPage.getByText('Mikrofonen är på', { exact: true })).toHaveCount(0, {
      timeout: 10000,
    });
    await expect
      .poll(() => memberPage.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: false, state: 'ended' }]);
    await memberPage.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(
      memberPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
    await expect(memberPage.getByLabel('Objektets namn')).toHaveCount(0);
    expect((await member.request.get(`${path}/map`)).status()).toBe(403);
  } finally {
    await member.close();
    await installation.close();
  }
});

test('ARBETE-04: replaced household content retires hidden work and microphone', async ({
  page,
}) => {
  const installation = await conversationInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const exported = await (
      await page.request.post(`${path}/exports`, { headers, data: {} })
    ).json();
    const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
    await startConversation(page, installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Gammal oskickad cykel');
    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await page
      .getByLabel('Skyttel-export (ZIP)')
      .setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(
      page.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks), {
        timeout: 10000,
      })
      .toEqual([{ enabled: false, state: 'ended' }]);
    await page.getByRole('link', { name: 'Till hushållet', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Starta textassistenten', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Objektets namn')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
  } finally {
    await installation.close();
  }
});

test('ARBETE-05: navigation preserves a save attempt after its response disappears', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Sparad cykel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    let saved = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/map/save', async (route) => {
      await route.fetch();
      saved = true;
      await held;
      await route.abort();
    });
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect.poll(() => saved).toBe(true);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Hushållskarta', exact: true }).getByRole('status'),
    ).toContainText('Väntande: kontrollerar sparandet');
    release();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await page.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Sparad cykel');
    const history = await (await page.request.get(`${path}/history`)).json();
    expect(history.history).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toContainText(
      'Sparad cykel',
    );
  } finally {
    release();
    await installation.close();
  }
});

test('ARBETE-06: selection and personal map view survive navigation and resizing', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map/view`;
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Min cykel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Min cykel');
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Min cykel', exact: true })
      .click();
    await page.getByRole('button', { name: 'Samlad vy', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByText('Ordna min vy', { exact: true }).click();
    await space.getByRole('button', { name: 'Flytta höger i rummet', exact: true }).click();
    await expect(space.getByText('Din personliga vy är sparad.', { exact: true })).toBeVisible();
    await space.getByLabel('Visa höjdhjälp', { exact: true }).check();
    const view = await (await page.request.get(path)).json();
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Samlad vy', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.getByRole('region', { name: 'Val och redigering', exact: true }),
    ).toContainText('Min cykel');
    await expect(space.getByLabel('Visa höjdhjälp', { exact: true })).toBeChecked();
    expect(await (await page.request.get(path)).json()).toEqual(view);
  } finally {
    await installation.close();
  }
});
