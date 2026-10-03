import { expect, test } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import {
  createHousehold,
  openMap,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import {
  openConversationText,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

for (const width of [1440, 390, 320])
  test(`UTKAST-12: closed panels retain private proposals through an unknown save at ${width}px and verify the same receipt`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    let release: (() => void) | undefined;
    try {
      await page.setViewportSize({ width, height: 844 });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      await page.goto(installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Familjeabonnemanget');
      await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await openMap(page);
      const status = page.getByRole('region', { name: 'Aktuell status', exact: true });
      const legend = page.getByRole('region', { name: 'Förslag i kartan', exact: true });
      await expect(status).toContainText('1 förslag · privat utkast');
      await expect(legend).toContainText('Föreslås läggas till');
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
      const statusButton = tools.getByRole('button', { name: 'Aktuell status', exact: true });
      if (!(await statusButton.isVisible()))
        await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
      await statusButton.focus();
      await page.keyboard.press('Enter');
      await expect(
        status.getByRole('heading', { name: 'Aktuell status', exact: true }),
      ).toBeFocused();
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let receipt: SaveReceipt | undefined;
      await page.route('**/map/save', async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        receipt = (await response.json()).receipt;
        await held;
        await route.abort();
      });
      await status.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      await expect(status).toContainText('Väntar på sparkvitto');
      await expect(legend).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Välj objekt: Familjeabonnemanget', exact: true }),
      ).toBeVisible();
      await expect.poll(() => receipt).toBeTruthy();
      release?.();
      await expect(status).toContainText('Sparutfall okänt');
      await expect(legend).toBeVisible();
      await expect(
        status.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }).click();
      await expect(status).toContainText('Sparat · kvitto bekräftat');
      await expect(legend).toHaveCount(0);
      const saved: MapState = await (await page.request.get(path)).json();
      expect(saved.objects.map((object) => object.name)).toEqual(['Familjeabonnemanget']);
      expect(saved.draft.changes).toEqual([]);
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
      const { operations } = await (await page.request.get(`${path}/operations`)).json();
      expect(operations).toHaveLength(1);
      expect(operations[0].operationId).toBe(receipt?.operationId);
      expect(operations[0].receipt).toEqual(receipt);
      await status.getByRole('button', { name: 'Stäng aktuell status', exact: true }).click();
      await expect(
        width > 700
          ? statusButton
          : tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }),
      ).toBeFocused();
    } finally {
      release?.();
      await installation.close();
    }
  });

test('UTKAST-14: manual text and voice proposals share one durable private draft and an atomic household save', async ({
  page,
  browser,
}) => {
  let serviceType = '';
  let personId = '';
  let usesType = '';
  let step = 0;
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    ).draft;
    const fromText = step++ === 0;
    return [
      modelTool('submit_changes', {
        version: current.version,
        contentVersion: current.contentVersion,
        completion: 'draft',
        operations: fromText
          ? [
              {
                name: 'propose_object',
                arguments: {
                  id: 'music',
                  baseRevision: null,
                  value: { typeId: serviceType, name: 'Molnmusik', description: 'Från text' },
                },
              },
            ]
          : [
              {
                name: 'propose_relationship',
                arguments: {
                  id: 'uses',
                  baseRevision: null,
                  value: {
                    typeId: usesType,
                    sourceId: personId,
                    targetId: 'music',
                    knowledge: 'known',
                  },
                },
              },
            ],
      }),
    ];
  });
  const live = liveProvider();
  const installation = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  const member = await browser.newContext();
  let release: (() => void) | undefined;
  let releasePoll: (() => void) | undefined;
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const initial = await read();
    serviceType = initial.types.find((type) => type.name === 'Tjänst')?.id ?? '';
    usesType = initial.relationshipTypes.find((type) => type.name === 'Använder')?.id ?? '';
    installation.setIdentity(robin);
    await signIn(member.request, installation.origin, 'microsoft');
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const headers = { origin: installation.origin };
    const { code } = await (
      await page.request.post(`${installation.origin}/api/households/${household.id}/invitations`, {
        headers,
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await member.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    personId = (await read()).draft.changes[0].id;
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Oskickad cykel');
    await page.getByLabel('Beskrivning', { exact: true }).fill('Texten ska finnas kvar');
    await startConversationWithText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Lägg Molnmusik i utkastet.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    const status = page.getByRole('region', { name: 'Aktuell status', exact: true });
    await expect(status).toContainText('2 förslag · privat utkast');
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    const voiceId = [...live.channels.keys()].at(-1);
    if (!voiceId) throw new Error('The authorized voice session must exist');
    live.emit(voiceId, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Lo använder Molnmusik.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(voiceId, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect(status).toContainText('3 förslag · privat utkast');
    await page.getByLabel('Meddelande till Skyttel').fill('Oskickat samtalsmeddelande');
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openMap(page);
    await expect(status).toContainText('3 förslag · privat utkast');
    await expect(status).toContainText(
      'Oskickad formulärtext finns kvar. Den ingår inte i utkastet.',
    );
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await openWorkspace(memberPage);
    await expect(memberPage.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
    const beforeMember: MapState = await (await member.request.get(path)).json();
    expect(beforeMember.objects).toEqual([]);
    expect(beforeMember.relationships).toEqual([]);
    expect(beforeMember.draft.changes).toEqual([]);
    await status.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Oskickad cykel');
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Texten ska finnas kvar',
    );
    const saving = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    await page.route('**/text-assistant/*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      // Read the genuine updated session only after the local save is in flight.
      await saving;
      await route.fulfill({ response: await route.fetch() });
    });
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await openMap(page);
    await expect(status).toContainText('4 förslag · privat utkast');
    const draft = (await read()).draft;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = false;
    await page.route('**/map/save', async (route) => {
      waiting = true;
      releasePoll?.();
      await held;
      await route.continue();
    });
    await status.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect.poll(() => waiting).toBe(true);
    await openConversationText(page);
    await expect(page.getByRole('region', { name: 'Assistentens hela utkast' })).toContainText(
      'Oskickad cykel',
      { timeout: 10000 },
    );
    await openMap(page);
    await expect(status).toContainText('Väntar på sparkvitto');
    const before = await read();
    expect(before.objects).toEqual([]);
    expect(before.relationships).toEqual([]);
    expect(before.draft).toEqual(draft);
    release?.();
    await expect(status).toContainText('Sparat · kvitto bekräftat');
    await expect(page.getByRole('region', { name: 'Förslag i kartan', exact: true })).toHaveCount(
      0,
    );
    const saved = await read();
    expect(saved.objects.map((object) => object.name).sort()).toEqual([
      'Lo Exempel',
      'Molnmusik',
      'Oskickad cykel',
    ]);
    expect(saved.relationships).toMatchObject([
      { sourceId: personId, targetId: 'music', typeId: usesType },
    ]);
    expect(saved.draft.changes).toEqual([]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(1);
    expect(history[0].changes).toHaveLength(3);
    expect(history[0].relationships).toHaveLength(1);
    await page.context().close();
    await memberPage.close();
    await installation.restart();
    const reopened = await member.newPage();
    await reopened.goto(installation.origin);
    await openWorkspace(reopened);
    const objects = reopened.getByRole('list', { name: 'Objekt', exact: true });
    for (const name of ['Lo Exempel', 'Molnmusik', 'Oskickad cykel'])
      await expect(objects).toContainText(name);
    await expect(reopened.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Lo Exempel → Använder → Molnmusik',
    );
    const shared: MapState = await (await member.request.get(path)).json();
    expect(shared.objects).toEqual(saved.objects);
    expect(shared.relationships).toEqual(saved.relationships);
    expect(shared.draft.changes).toEqual([]);
    expect((await (await member.request.get(`${path}/history`)).json()).history).toEqual(history);
  } finally {
    release?.();
    releasePoll?.();
    await member.close();
    await installation.close();
  }
});

test('UTKAST-13: a verified save keeps a newer field focused and current status opens explicitly', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release: (() => void) | undefined;
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed = false;
    await page.route('**/map/save', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committed = true;
      await held;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    const search = page.getByLabel('Sök objekt', { exact: true });
    await search.fill('Lo');
    release?.();
    await expect(page.getByRole('status')).toContainText('Sparat: Lo Exempel');
    await expect(page.getByRole('region', { name: 'Förslag i kartan', exact: true })).toHaveCount(
      0,
    );
    await expect(search).toBeFocused();
    await page.keyboard.type(' Exempel');
    await expect(search).toHaveValue('Lo Exempel');
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
    const trigger = tools.getByRole('button', { name: 'Aktuell status', exact: true });
    if (!(await trigger.isVisible()))
      await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Aktuell status', exact: true })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Aktuell status', exact: true })).toContainText(
      'Sparat · kvitto bekräftat',
    );
    await page.getByRole('button', { name: 'Stäng aktuell status', exact: true }).click();
    await expect(trigger).toBeFocused();
  } finally {
    release?.();
    await installation.close();
  }
});

test('UTKAST-15: a necessary answer gates both save actions until a fresh explicit save', async ({
  page,
}) => {
  let calls = 0;
  const model = textModel((body) => {
    if (calls++ > 0) return [modelMessage('Frågan är besvarad. Förslaget väntar på sparbesked.')];
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    ).draft;
    const change = current.changes[0];
    return [
      modelTool('submit_changes', {
        version: current.version,
        contentVersion: current.contentVersion,
        completion: 'draft',
        questions: ['Vilket kort avses?'],
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: change.id,
              baseRevision: null,
              value: { ...change.after, description: 'Förslag väntar på svar' },
            },
          },
        ],
      }),
    ];
  });
  const installation = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await startConversationWithText(page);
    await page
      .getByLabel('Meddelande till Skyttel')
      .fill('Förbered uppgiften och fråga vilket kort som avses.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await openMap(page);
    const status = page.getByRole('region', { name: 'Aktuell status', exact: true });
    await expect(status.getByRole('region', { name: 'Nödvändigt svar' })).toContainText(
      'Vilket kort avses?',
    );
    await expect(
      status.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toHaveCount(0);
    await openWorkspace(page);
    await expect(
      page
        .getByRole('region', { name: 'Hela mitt utkast', exact: true })
        .getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    expect((await read()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    await status.getByRole('button', { name: 'Svara i samtalet', exact: true }).click();
    await page.getByLabel('Meddelande till Skyttel').fill('Kortet Lo Exempel avses.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(status.getByRole('region', { name: 'Nödvändigt svar' })).toHaveCount(0);
    await openMap(page);
    const save = status.getByRole('button', { name: 'Spara hela utkastet', exact: true });
    await expect(save).toBeEnabled();
    expect(calls).toBe(2);
    expect((await read()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    await save.click();
    await expect(status).toContainText('Sparat · kvitto bekräftat');
    const saved = await read();
    expect(saved.objects.map(({ name, description }) => ({ name, description }))).toEqual([
      { name: 'Lo Exempel', description: 'Förslag väntar på svar' },
    ]);
    expect(saved.draft.changes).toEqual([]);
    const { operations } = await (await page.request.get(`${path}/operations`)).json();
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
  } finally {
    await installation.close();
  }
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 640, height: 500 },
  { width: 320, height: 250 },
])
  test(`UTKAST-16: navigation and current status keep lower controls usable in both opening orders at ${viewport.width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize(viewport);
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const initial = await read();
      const post = async (route: string, data: unknown) => {
        const response = await page.request.post(`${path}/${route}`, {
          headers: { origin: installation.origin },
          data,
        });
        expect(response.status(), await response.text()).toBe(200);
      };
      await post('draft', {
        version: 0,
        id: 'lo',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Lo Exempel', description: '' },
      });
      await post('save', { version: 1, operationId: 'navigation-status-baseline' });
      await post('draft', {
        version: (await read()).draft.version,
        id: 'bike',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Blå cykeln', description: '' },
      });
      await page.goto(installation.origin);
      await openMap(page);
      await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
      const shared = await read();
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
      const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
      const status = page.getByRole('region', { name: 'Aktuell status', exact: true });
      const view = async (): Promise<PersonalView> =>
        (await page.request.get(`${path}/view`)).json();
      let version = 0;
      for (const first of ['navigation', 'status']) {
        if (first === 'navigation')
          await tools.getByRole('button', { name: 'Navigera', exact: true }).click();
        const trigger = tools.getByRole('button', { name: 'Aktuell status', exact: true });
        if (!(await trigger.isVisible()))
          await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
        await trigger.click();
        await expect(
          status.getByRole('heading', { name: 'Aktuell status', exact: true }),
        ).toBeFocused();
        if (first === 'status')
          await tools.getByRole('button', { name: 'Navigera', exact: true }).click();
        const navigationBox = await navigation.boundingBox();
        const statusBox = await status.boundingBox();
        if (!navigationBox || !statusBox) throw new Error('Both surfaces must be visible.');
        expect(
          navigationBox.x + navigationBox.width <= statusBox.x ||
            statusBox.x + statusBox.width <= navigationBox.x ||
            navigationBox.y + navigationBox.height <= statusBox.y ||
            statusBox.y + statusBox.height <= navigationBox.y,
        ).toBe(true);
        for (const direction of ['vänster', 'höger', 'uppåt', 'nedåt', 'framåt', 'bakåt']) {
          const move = navigation.getByRole('button', {
            name: `Flytta Lo Exempel: ${direction}`,
            exact: true,
          });
          await move.focus();
          await move.click();
          await expect.poll(async () => (await view()).positions[0]?.version).toBe(++version);
        }
        expect(await read()).toEqual(shared);
        const save = status.getByRole('button', { name: 'Spara hela utkastet', exact: true });
        await save.focus();
        await save.click({ trial: true });
        await expect(save).toBeFocused();
        await status.getByRole('button', { name: 'Stäng aktuell status', exact: true }).click();
        await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
        await expect(tools.getByRole('button', { name: 'Navigera', exact: true })).toBeFocused();
        expect(await read()).toEqual(shared);
      }
    } finally {
      await installation.close();
    }
  });
