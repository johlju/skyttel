import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import Database from 'better-sqlite3';
import type { ErasureStatus } from '../../src/shared/household-erasure.js';
import type { MapState } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openProfile,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import {
  consentBox,
  consentBoxFor,
  openConversationText,
  openSavedHistory,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { readDraftProposal, readTableObject } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { createPreparedContext, expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

async function nativeFields(root: Locator, values: readonly (readonly [string, string])[]) {
  for (const [label, value] of values)
    await expect(
      root
        .locator('dt')
        .filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) })
        .locator('..')
        .locator('dd'),
    ).toHaveText(new RegExp(`^(?:◇ Ditt förslag: )?${value}$`));
}

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
    await openMap(page);
    await otherPage.goto(installation.origin);
    await openMap(otherPage);
    await openNewObject(otherPage);
    await otherPage.getByLabel('Namn', { exact: true }).fill('Gammal oskickad cykel');
    await expect(otherPage.getByLabel('Namn', { exact: true })).toHaveValue(
      'Gammal oskickad cykel',
    );
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
    await openDraftReview(page);
    const pendingRequest = page.waitForRequest(`${path}/map/save`);
    await openDraftReview(page);
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
    await page
      .getByRole('dialog', { name: 'Spara utkastet', exact: true })
      .getByRole('button', { name: 'Stäng dialogen', exact: true })
      .click();
    await openSettings(page);
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Permanent radering', exact: true })
      .click();
    await expect(otherPage.getByLabel('Namn', { exact: true })).toHaveValue(
      'Gammal oskickad cykel',
    );
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
    await expect(otherPage.getByLabel('Namn', { exact: true })).toHaveCount(0, { timeout: 10000 });
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(page.getByLabel('Meddelande till Skyttel')).toHaveCount(0);
    expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
      error: 'content_maintenance',
    });
    expect(await (await post('exports', {})).json()).toEqual({ error: 'content_maintenance' });
    releaseSave();
    await saveDelivered;
    await (await oldSave.response())?.finished();
    await expect(otherPage.getByLabel('Namn', { exact: true })).toHaveCount(0);
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
    await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(consentBox(page)).toBeVisible();
    await consentBoxFor(page).decline.click();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).not.toContainText(
      'Vem använder cykeln?',
    );
    await expect(page.getByLabel('Meddelande till Skyttel')).toHaveValue('');
    await expect(page.getByLabel('Namn', { exact: true })).toHaveCount(0);
    await expect(otherPage.getByLabel('Namn', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }),
    ).toHaveCount(0);
    const retainedProposal = await readDraftProposal(page, 'Stolen att bevara');
    await expect(retainedProposal).toContainText('Oberoende privat förslag');
    await nativeFields(
      retainedProposal
        .getByRole('heading', { name: 'Föreslagna värden', exact: true })
        .locator('..'),
      [
        ['Namn', 'Stolen att bevara'],
        ['Typ', 'Person'],
        ['Beskrivning', 'Oberoende privat förslag'],
      ],
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

for (const [caseId, width] of [
  ['ARBETE-01', 1280],
  ['ARBETE-10', 390],
  ['ARBETE-11', 320],
] as const) {
  test(`${caseId}: canceled form loss and staged household work survive ordinary navigation at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      await page.goto(`${installation.origin}/households/${household.id}/`);
      await openTable(page);
      await page
        .getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true })
        .fill('cykel');
      await openNewObject(page);
      const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await form.getByLabel('Namn', { exact: true }).fill('Oskickad cykel');
      await form.getByLabel('Beskrivning', { exact: true }).fill('Behåll denna text');
      await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }),
      ).toBeFocused();
      await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Oskickad cykel');
      await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Behåll denna text',
      );
      expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await openProfile(page);
      await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'Inloggningssätt', exact: true }),
      ).toBeFocused();
      await expect(page.getByLabel('Namn', { exact: true })).not.toBeVisible();
      await expect(
        page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }),
      ).not.toBeVisible();
      await expect(page.getByText('Administratör', { exact: true })).not.toBeVisible();
      await page.getByRole('link', { name: 'Till startsidan', exact: true }).focus();
      await page.keyboard.press('Enter');
      await openTable(page);
      await expect(
        page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }),
      ).toHaveValue('cykel');
      const reading = await readTableObject(page, 'Oskickad cykel');
      await expect(
        reading.getByRole('heading', { name: 'Oskickad cykel · alla uppgifter', exact: true }),
      ).toBeVisible();
      await expect(reading).toContainText('Behåll denna text');
      await nativeFields(reading, [
        ['Namn', 'Oskickad cykel'],
        ['Typ', 'Person'],
      ]);
      await expect(reading.locator('.household-table-description')).toHaveText(
        /^(?:◇ Ditt förslag: )?Behåll denna text$/,
      );
      const state = await (await page.request.get(path)).json();
      expect(state.objects).toEqual([]);
      expect(state.draft.changes).toHaveLength(1);
      expect(state.draft.changes[0].after).toMatchObject({
        name: 'Oskickad cykel',
        description: 'Behåll denna text',
      });
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
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
  const member = await createPreparedContext(browser);
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
    await openMap(memberPage);
    await openNewObject(memberPage);
    await memberPage.getByLabel('Namn', { exact: true }).fill('Privat oskickad cykel');
    await expect(
      memberPage.getByRole('dialog', { name: 'Nytt objekt', exact: true }),
    ).toBeVisible();
    await page.goto(`${installation.origin}/households/${household.id}/administration`);
    const membership = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Robin Exempel' }) });
    await membership.getByRole('button', { name: 'Återkalla tillgång', exact: true }).click();
    await membership.getByRole('button', { name: 'Bekräfta återkallelse' }).click();
    await expect(voiceBox(memberPage)).toHaveCount(0, { timeout: 10000 });
    await expect(memberPage.getByLabel('Namn', { exact: true })).toHaveCount(0);
    await expect
      .poll(() => memberPage.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: false, state: 'ended' }]);
    await memberPage.goto(`${installation.origin}/households/${household.id}`);
    await expect(
      memberPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
    await expect(memberPage.getByLabel('Namn', { exact: true })).toHaveCount(0);
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
  const importPage = await page.context().newPage();
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
    await openMap(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Gammal oskickad cykel');
    await importPage.goto(`${installation.origin}/households/${household.id}`);
    await openSettings(importPage);
    await importPage
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Återimportera hushållet', exact: true })
      .click();
    await expect(
      importPage.getByRole('heading', { name: 'Återimportera hushållet', level: 1 }),
    ).toBeFocused();
    await importPage
      .getByLabel('Skyttel-export (ZIP)')
      .setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
    await importPage.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(importPage.getByRole('group', { name: 'Granska ersättningen' })).toBeVisible();
    await importPage
      .getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' })
      .check();
    await importPage.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(
      importPage.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks), {
        timeout: 10000,
      })
      .toEqual([{ enabled: false, state: 'ended' }]);
    await expect(page.getByLabel('Namn', { exact: true })).toHaveCount(0, { timeout: 10000 });
    await page.reload();
    // The page is loaded anew: the conversation is gone, and so is the consent for the visit.
    await openConversationText(page);
    await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(consentBox(page)).toBeVisible();
    await consentBoxFor(page).decline.click();
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Utkastet är tomt.');
  } finally {
    await importPage.close();
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
    await openMap(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Sparad cykel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
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
    await openDraftReview(page);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect.poll(() => saved).toBe(true);
    await page
      .getByRole('dialog', { name: 'Spara utkastet', exact: true })
      .getByRole('button', { name: 'Stäng dialogen', exact: true })
      .click();
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Hushållskarta', exact: true })
        .getByRole('status', { name: 'Hushållsarbetets status', exact: true }),
    ).toContainText('Väntande: kontrollerar sparandet');
    release();
    await expect(
      page.getByRole('region', { name: 'Utkastets återkoppling', exact: true }),
    ).toContainText('Utfallet är okänt');
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await page.getByRole('button', { name: 'Visa sparandet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Spara utkastet', exact: true })
      .getByRole('button', { name: 'Kontrollera sparandet igen', exact: true })
      .click();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    const history = await (await page.request.get(`${path}/history`)).json();
    expect(history.history).toHaveLength(1);
    await openSavedHistory(page);
    const receipt = page.getByRole('region', { name: 'Ändringshistorik' }).getByRole('article');
    await expect(receipt).toHaveCount(1);
    await receipt.getByText('Visa ändringarna', { exact: true }).click();
    await expect(receipt.getByText('Namn: Sparad cykel.', { exact: true })).toBeVisible();
    await receipt.getByText('Identifiera sparandet och användaren', { exact: true }).click();
    await expect(
      receipt.getByText(`Sparande: ${history.history[0].operationId}`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await openTable(page);
    await expect(page.getByRole('table')).toContainText('Sparad cykel');
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
    await openMap(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Min cykel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openDraftReview(page);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    await closeTextView(page);
    await openMap(page);
    await page.getByRole('button', { name: 'Välj objekt: Min cykel', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await expect(space).toBeVisible();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: /^Flytta .+: höger$/ }).click();
    await expect(space.getByText('Din personliga vy är sparad.', { exact: true })).toBeVisible();
    const heightHelp = page
      .getByRole('region', { name: 'Navigation', exact: true })
      .getByLabel('Visa höjdhjälp', { exact: true });
    await heightHelp.check();
    const view = await (await page.request.get(path)).json();
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    const bike = page.getByRole('button', { name: 'Välj objekt: Min cykel', exact: true });
    await bike.focus();
    await bike.press('Shift+F10');
    await page
      .getByRole('toolbar', { name: 'Åtgärder för Min cykel', exact: true })
      .getByRole('button', { name: 'Visa uppgifter för Min cykel', exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'Min cykel', exact: true })).toContainText(
      'Min cykel',
    );
    await nativeFields(page.getByRole('region', { name: 'Min cykel', exact: true }), [
      ['Namn', 'Min cykel'],
      ['Typ', 'Person'],
    ]);
    await expect(
      page
        .getByRole('region', { name: 'Min cykel', exact: true })
        .locator('.household-table-description'),
    ).toHaveText('Ej uppgivet');
    await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Min cykel', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(heightHelp).toBeChecked();
    expect(await (await page.request.get(path)).json()).toEqual(view);
  } finally {
    await installation.close();
  }
});
