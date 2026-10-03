import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import Database from 'better-sqlite3';
import type { ErasureStatus } from '../../src/shared/household-erasure.js';
import type { MapState } from '../../src/shared/map.js';
import {
  activatePanel,
  createHousehold,
  openProfile,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import {
  consentBox,
  consentBoxFor,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

async function startConversation(page: Page, origin: string) {
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(origin);
  await startConversationWithText(page);
  await turnMicrophoneOn(page);
  await expect(voiceBox(page)).toHaveText('Lyssnar');
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

test('ARBETE-07: pending erasure retires microphone, unsent forms and an admitted save before reloading', async ({
  page,
}) => {
  const installation = await conversationInstallation();
  const reader = new Database(join(installation.directory, 'skyttel.db'), { readonly: true });
  const otherPage = await page.context().newPage();
  let releaseSave = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const read = async (): Promise<MapState> => (await page.request.get(`${path}/map`)).json();
    const post = (suffix: string, data: unknown) =>
      page.request.post(`${path}/${suffix}`, { headers, data });
    for (const [id, name] of [
      ['lamp', 'Lampan att radera'],
      ['chair', 'Stolen att bevara'],
    ]) {
      const state = await read();
      expect(
        (
          await post('map/draft', {
            id,
            version: state.draft.version,
            contentVersion: state.contentVersion,
            baseRevision: null,
            value: { typeId: state.types[0].id, name, description: '' },
          })
        ).status(),
      ).toBe(200);
    }
    const proposed = await read();
    expect(
      (
        await post('map/save', {
          version: proposed.draft.version,
          contentVersion: proposed.contentVersion,
          operationId: 'work-before-erasure',
        })
      ).status(),
    ).toBe(200);
    const saved = await read();
    const chair = saved.objects.find(({ id }) => id === 'chair');
    expect(
      (
        await post('map/draft', {
          id: 'chair',
          version: saved.draft.version,
          contentVersion: saved.contentVersion,
          baseRevision: chair?.revision,
          value: { ...chair, description: 'Oberoende privat förslag' },
        })
      ).status(),
    ).toBe(200);
    for (const [id, x] of [
      ['lamp', 5],
      ['chair', -5],
    ] as const)
      expect(
        (await post('map/view/position', { id, version: 0, position: { x, y: 2, z: 1 } })).status(),
      ).toBe(200);
    const before = await read();
    const viewBefore = await (await page.request.get(`${path}/map/view`)).json();
    await startConversation(page, installation.origin);
    await page.getByLabel('Meddelande till Skyttel').fill('Berätta om lampan');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Vem använder cykeln?',
    );
    await page.getByLabel('Meddelande till Skyttel').fill('Gammalt oskickat svar');
    await openWorkspace(page);
    await otherPage.goto(installation.origin);
    await openWorkspace(otherPage);
    await otherPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await otherPage.getByLabel('Objektets namn').fill('Gammal oskickad cykel');
    await openSettings(otherPage);
    await expect(otherPage.getByLabel('Objektets namn')).toHaveValue('Gammal oskickad cykel');
    await expect(otherPage.getByLabel('Objektets namn')).not.toBeVisible();
    const held = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let ready = () => {};
    const saveWaiting = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let delivered = () => {};
    const saveDelivered = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    let saveId = '';
    let saveCount = 0;
    let executeCount = 0;
    const resumeIds: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/map/save')) saveCount += 1;
      if (request.url().endsWith('/erasure/execute')) executeCount += 1;
      if (request.url().endsWith('/erasure/resume'))
        resumeIds.push(request.postDataJSON().operationId);
    });
    await page.route(
      `${path}/map/save`,
      async (route) => {
        saveId = route.request().postDataJSON().operationId;
        ready();
        await held;
        const response = await route.fetch();
        expect(response.status()).toBe(409);
        expect(await response.json()).toEqual({ error: 'content_maintenance' });
        await route.fulfill({ response });
        delivered();
      },
      { times: 1 },
    );
    const pendingRequest = page.waitForRequest(`${path}/map/save`);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const oldSave = await pendingRequest;
    await saveWaiting;
    expect(saveId).not.toBe('');
    // The conversation must observe this registered operation while the
    // same browser still owns its original, unfinished manual save request.
    await page.waitForResponse(async (response) => {
      if (
        !/\/text-assistant\/[^/]+(?:\/voice\/[^/]+\/poll)?$/.test(response.url()) ||
        response.status() !== 200
      )
        return false;
      const body = await response.json();
      return (body.assistant ?? body).operations?.some(
        (operation: { operationId: string; status: string }) =>
          operation.operationId === saveId && operation.status === 'pending',
      );
    });
    expect(await (await page.request.get(`${path}/map/operations/${saveId}`)).json()).toMatchObject(
      {
        operation: {
          operationId: saveId,
          contentVersion: before.contentVersion,
          status: 'pending',
        },
      },
    );
    await openSettings(page);
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Permanent radering', exact: true })
      .click();
    await expect(otherPage.getByLabel('Objektets namn')).toHaveValue('Gammal oskickad cykel');
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(page.getByLabel('Meddelande till Skyttel')).toHaveValue('Gammalt oskickat svar');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: true, state: 'live' },
    ]);
    const section = page.getByRole('region', { name: 'Permanent radering', exact: true });
    await section.getByRole('checkbox', { name: 'Lampan att radera', exact: true }).check();
    await section.getByRole('button', { name: 'Granska raderingen', exact: true }).click();
    const scope = section.getByRole('region', { name: 'Omfattning att bekräfta' });
    await expect(scope).not.toContainText('Oberoende privat förslag');
    await expect(scope).not.toContainText('Stolen att bevara');
    // This independent reader pins real pre-erasure WAL pages; setup and
    // domain assertions use the running application's public interfaces.
    reader.exec('BEGIN');
    reader.prepare('SELECT id FROM map_object LIMIT 1').get();
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    const executing = page.waitForResponse(`${path}/erasure/execute`);
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    const executed = await executing;
    expect(executed.status()).toBe(202);
    const pending: ErasureStatus = (await executed.json()).status;
    expect(pending.phase).toBe('cleanup');
    await expect(section.getByText(pending.operationId, { exact: true })).toBeVisible();
    await expect(
      section.getByText(/Hushållets innehåll är tillfälligt otillgängligt/),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks), {
        timeout: 10000,
      })
      .toEqual([{ enabled: false, state: 'ended' }]);
    await expect(otherPage.getByLabel('Objektets namn')).toHaveCount(0, { timeout: 10000 });
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(page.getByLabel('Meddelande till Skyttel')).toHaveCount(0);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      error: 'content_maintenance',
    });
    expect(await (await post('exports', {})).json()).toEqual({ error: 'content_maintenance' });
    releaseSave();
    await saveDelivered;
    await (await oldSave.response())?.finished();
    await expect(otherPage.getByLabel('Objektets namn')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }),
    ).toHaveCount(0);
    await expect(section.getByText(pending.operationId, { exact: true })).toBeVisible();
    expect(saveCount).toBe(1);
    expect(resumeIds).toEqual([]);
    reader.exec('ROLLBACK');
    const completing = page.waitForResponse(`${path}/erasure/resume`);
    await section.getByRole('button', { name: 'Försök slutföra raderingen', exact: true }).click();
    const completed = await completing;
    expect(completed.status()).toBe(200);
    expect((await completed.json()).status).toMatchObject({
      operationId: pending.operationId,
      phase: 'completed',
      counts: { objects: 1, relationships: 0, objectTypes: 0, relationshipTypes: 0, images: 0 },
    });
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    expect(executeCount).toBe(1);
    expect(resumeIds).toEqual([pending.operationId]);
    const retained = await read();
    expect(retained.contentVersion).toBe(before.contentVersion + 1);
    expect(retained.objects).toEqual(before.objects.filter(({ id }) => id === 'chair'));
    expect(retained.draft).toEqual(before.draft);
    expect(retained.types).toEqual(before.types);
    expect(retained.relationshipTypes).toEqual(before.relationshipTypes);
    expect(await (await page.request.get(`${path}/map/view`)).json()).toEqual({
      ...viewBefore,
      contentVersion: viewBefore.contentVersion + 1,
      positions: viewBefore.positions.filter(({ id }: { id: string }) => id === 'chair'),
    });
    expect(await (await page.request.get(`${path}/map/operations/${saveId}`)).json()).toEqual({
      operation: null,
    });
    await Promise.all([
      page.waitForEvent('load'),
      section.getByRole('button', { name: 'Läs in kartan på nytt', exact: true }).click(),
    ]);
    // The page is loaded anew: the conversation is gone, and so is the consent for the visit.
    await openConversationText(page);
    await expect(consentBox(page)).toBeVisible();
    await consentBoxFor(page).decline.click();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toHaveCount(0);
    await expect(page.getByLabel('Objektets namn')).toHaveCount(0);
    await expect(otherPage.getByLabel('Objektets namn')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }),
    ).toHaveCount(0);
    await openWorkspace(page);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Oberoende privat förslag',
    );
    expect(await read()).toEqual(retained);
    expect((await (await page.request.get(path)).json()).household.role).toBe('administrator');
    expect(saveCount).toBe(1);
    expect(executeCount).toBe(1);
    expect(resumeIds).toEqual([pending.operationId]);
    await test.info().attach('retired-save-and-erasure', {
      body: JSON.stringify({ saveId, pending, saveCount, executeCount, resumeIds }, null, 2),
      contentType: 'application/json',
    });
  } finally {
    releaseSave();
    if (reader.inTransaction) reader.exec('ROLLBACK');
    reader.close();
    await otherPage.close();
    await installation.close();
  }
});

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
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Oskickad cykel');
      await page.getByLabel('Beskrivning', { exact: true }).fill('Behåll denna text');
      await openWorkspace(page);
      await page.getByLabel('Sök objekt', { exact: true }).fill('cykel');
      await activatePanel(page, 'Nytt objekt');
      await page.getByLabel('Objektets namn').focus();
      await openProfile(page);
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
      expect(
        await page.getByLabel('Objektets namn').evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
      ).toBe(true);
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
    await page.getByLabel('Meddelande till Skyttel').fill('Berätta om cykeln');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Vem använder cykeln?',
    );
    await page.getByLabel('Meddelande till Skyttel').fill('Oskickat svar');
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    // Outside the map the voice box still says that the microphone is on.
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: true, state: 'live' },
    ]);
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(page.getByLabel('Meddelande till Skyttel')).toHaveValue('Oskickat svar');
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Vem använder cykeln?',
    );
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'ended' },
    ]);
    await expect(page.getByLabel('Meddelande till Skyttel')).toHaveCount(0);
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
    await openWorkspace(memberPage);
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await memberPage.getByLabel('Objektets namn').fill('Privat oskickad cykel');
    await openProfile(memberPage);
    await memberPage.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    const membership = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Robin Exempel' }) });
    await membership.getByRole('button', { name: 'Återkalla tillgång', exact: true }).click();
    await membership.getByRole('button', { name: 'Bekräfta återkallelse' }).click();
    await expect(voiceBox(memberPage)).toHaveCount(0, { timeout: 10000 });
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
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Gammal oskickad cykel');
    await openSettings(page);
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Återimportera hushållet', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Återimportera hushållet', level: 1 }),
    ).toBeFocused();
    await page
      .getByLabel('Skyttel-export (ZIP)')
      .setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(page.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
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
    await expect(page.getByLabel('Objektets namn')).toHaveCount(0, { timeout: 10000 });
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Läs in det återställda hushållet' }).click(),
    ]);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    // The page is loaded anew: the conversation is gone, and so is the consent for the visit.
    await openConversationText(page);
    await expect(consentBox(page)).toBeVisible();
    await consentBoxFor(page).decline.click();
    await openWorkspace(page);
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
    await openWorkspace(page);
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
    await openProfile(page);
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
    await openWorkspace(page);
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
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Min cykel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Min cykel');
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Uppgifter för Min cykel', exact: true })
      .click();
    await openWorkspace(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await expect(page.getByRole('region', { name: 'Lista och utkast', exact: true })).toBeVisible();
    await expect(space).toBeVisible();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: /^Flytta .+: höger$/ }).click();
    await expect(space.getByText('Din personliga vy är sparad.', { exact: true })).toBeVisible();
    await space.getByLabel('Visa höjdhjälp', { exact: true }).check();
    const view = await (await page.request.get(path)).json();
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Lista och utkast', exact: true })).toBeVisible();
    await activatePanel(page, 'Min cykel');
    await expect(page.getByRole('region', { name: 'Min cykel', exact: true })).toContainText(
      'Min cykel',
    );
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Min cykel', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(space.getByLabel('Visa höjdhjälp', { exact: true })).toBeChecked();
    expect(await (await page.request.get(path)).json()).toEqual(view);
  } finally {
    await installation.close();
  }
});
