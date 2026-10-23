import type { Page } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import type { VoiceAssistantResponse } from '../../src/shared/voice-assistant.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openSettings,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import {
  openConversationDraft,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { openObjectRelationships } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { focusMapSearch } from '../support/object-search.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { createPreparedContext, expect, test } from '../support/test.js';
import { modelMessage, modelTool, textModel, verifiedAnswers } from '../support/text-model.js';

function saveToast(page: Page) {
  return page.locator('p[aria-hidden="true"]').filter({ hasText: /^Utkastet är sparat$/ });
}

async function closeSaveDialog(page: Page) {
  const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
  if (await modal.isVisible()) await page.keyboard.press('Escape');
}

for (const theme of ['light', 'dark'] as const)
  test(`${theme === 'dark' ? 'UTKAST-94' : 'UTKAST-25'}: filtered legend matches map colours and retains only displayed categories in ${theme}`, async ({
    page,
  }) => {
    const app = await createInstallation();
    try {
      await signIn(page.request, app.origin);
      const { household } = await (await createHousehold(page.request, app.origin)).json();
      const path = `${app.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const post = async (route: string, data: unknown) => {
        const response = await page.request.post(`${path}/${route}`, {
          headers: { origin: app.origin },
          data,
        });
        expect(response.status(), await response.text()).toBe(200);
      };
      const initial = await read();
      for (const [id, name] of [
        ['lo', 'Lo Exempel'],
        ['music', 'Molnmusik'],
        ['kim', 'Kim Exempel'],
      ])
        await post('draft', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: { typeId: initial.types[0].id, name },
        });
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'uses',
        baseRevision: null,
        value: { typeId: initial.relationshipTypes[0].id, sourceId: 'lo', targetId: 'music' },
      });
      await post('save', { version: (await read()).draft.version, operationId: 'legend-baseline' });
      const saved = await read();
      const lo = saved.objects.find(({ id }) => id === 'lo');
      const edge = saved.relationships[0];
      await post('draft', {
        version: saved.draft.version,
        id: 'lo',
        baseRevision: lo?.revision,
        value: {
          ...lo,
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Privat rättelse',
            },
          ],
        },
      });
      await post('relationship', {
        version: (await read()).draft.version,
        id: edge.id,
        baseRevision: edge.revision,
        value: { ...edge, sourceId: 'music', targetId: 'lo' },
      });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(app.origin);
      const legend = page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true });
      await expect(legend).toContainText('Grönt +');
      await expect(legend).toContainText('Gul penna');
      await expect(legend).toContainText('Rött ×');
      await expect(legend).not.toContainText('markerat objekt');
      for (const kind of ['added', 'changed', 'removed']) {
        const colour = await legend
          .locator(`.map-legend-symbol.${kind}`)
          .evaluate((element) => getComputedStyle(element).color);
        const representation = page
          .locator(
            kind === 'changed' ? '.spatial-node.changed .proposal-symbol' : `.spatial-edge.${kind}`,
          )
          .first();
        await expect(representation).toBeVisible();
        expect(colour).toBe(
          await representation.evaluate((element) => getComputedStyle(element).color),
        );
        await expect(legend.locator(`.map-legend-symbol.${kind} .map-legend-line`)).toHaveCSS(
          'border-top-style',
          kind === 'removed' ? 'dashed' : 'solid',
        );
      }
      const beforeCamera = await legend.innerText();
      await page.getByRole('button', { name: 'Navigera', exact: true }).click();
      await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
      await expect(legend).toHaveText(beforeCamera, { useInnerText: true });
      await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
      await page.getByRole('button', { name: /^Välj samband: Molnmusik/ }).click();
      await expect(legend).not.toContainText('markerat objekt');
      await focusMapSearch(page);
      const mapSearch = page.getByRole('region', {
        name: 'Kartans sökning och filter',
        exact: true,
      });
      await mapSearch
        .getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true })
        .fill('Kim Exempel');
      await mapSearch.getByRole('searchbox').press('Escape');
      await expect(legend).not.toContainText('föreslås');
      await expect(legend).not.toContainText('tidigare samband');
      await expect(legend).toContainText('Punkter');
      await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
      await expect(legend).toContainText('Ring: markerat objekt');
      await focusMapSearch(page);
      await mapSearch
        .getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true })
        .fill('Inga träffar');
      await mapSearch.getByRole('searchbox').press('Escape');
      await expect(legend).toHaveCount(0);
      expect((await read()).draft.relationships?.[0].id).toBe(edge.id);
      expect((await read()).draft.relationships?.[0].before?.sourceId).toBe('lo');
    } finally {
      await app.close();
    }
  });

for (const recoverUnknown of [false, true])
  test(`${recoverUnknown ? 'UTKAST-95' : 'UTKAST-26'}: confirmed save toast expires while failed refresh remains recoverable without a conversation${recoverUnknown ? ' after an unknown result' : ''}`, async ({
    page,
  }) => {
    const app = await createInstallation();
    try {
      await signIn(page.request, app.origin);
      await createHousehold(page.request, app.origin);
      await page.goto(app.origin);
      await openTable(page);
      await openNewObject(page);
      await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      const mapReads = /\/map(?:\?.*)?$/;
      await page.route(mapReads, (route) =>
        route.request().method() === 'GET' ? route.abort() : route.continue(),
      );
      if (recoverUnknown)
        await page.route('**/map/save', async (route) => {
          await route.fetch();
          await route.abort();
        });
      await openDraftReview(page);
      await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      await closeSaveDialog(page);
      await closeTextView(page);
      await openMap(page);
      const status = page.getByRole('region', { name: 'Kartans status', exact: true });
      if (recoverUnknown) {
        await expect(status).toContainText('Sparutfall okänt');
        await expect(saveToast(page)).toHaveCount(0);
        await status.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
      }
      await expect(saveToast(page)).toHaveCount(1);
      await expect(status).toContainText('kartan kunde inte hämtas');
      await expect(status).not.toContainText('Sparutfall okänt');
      await expect(saveToast(page)).toHaveCount(0, { timeout: 4500 });
      await expect(status.getByRole('alert')).toContainText('kartan kunde inte hämtas');
      await page.unroute(mapReads);
      const refresh = status.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true });
      await refresh.click();
      await expect(status.getByRole('alert')).toHaveCount(0);
      await expect(saveToast(page)).toHaveCount(0);
      await (await utilityButton(page, 'Rapporter')).click();
      const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
      await expect(history.getByRole('article')).toHaveCount(1);
      await expect(history.getByRole('article')).toContainText('Lo Exempel');
    } finally {
      await app.close();
    }
  });

for (const width of [1440, 390, 320])
  test(`${width === 1440 ? 'UTKAST-12' : width === 390 ? 'UTKAST-96' : 'UTKAST-97'}: closed work views retain private proposals through an unknown save at ${width}px and verify the same receipt`, async ({
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
      await openTable(page);
      await openNewObject(page);
      await page.getByLabel('Namn', { exact: true }).fill('Familjeabonnemanget');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await openMap(page);
      const status = page.getByRole('region', { name: 'Kartans status', exact: true });
      const legend = page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true });
      await expect(legend).toContainText('föreslås läggas till');
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
      await openTable(page);
      await openDraftReview(page);
      await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      await closeSaveDialog(page);
      await closeTextView(page);
      await openMap(page);
      await expect(status).toContainText('Väntar på sparkvitto');
      await expect(legend).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Välj objekt: Familjeabonnemanget', exact: true }),
      ).toBeVisible();
      await expect.poll(() => receipt).toBeTruthy();
      release?.();
      await expect(status).toContainText('Sparutfall okänt');
      await expect(saveToast(page)).toHaveCount(0);
      await expect(legend).toBeVisible();
      await expect(
        status.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }).click();
      await expect(saveToast(page)).toHaveCount(1);
      await expect(legend).not.toContainText('föreslås');
      const saved: MapState = await (await page.request.get(path)).json();
      expect(saved.objects.map((object) => object.name)).toEqual(['Familjeabonnemanget']);
      expect(saved.draft.changes).toEqual([]);
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
      const { operations } = await (await page.request.get(`${path}/operations`)).json();
      expect(operations).toHaveLength(1);
      expect(operations[0].operationId).toBe(receipt?.operationId);
      expect(operations[0].receipt).toEqual(receipt);
      await expect(saveToast(page)).toHaveCount(0, { timeout: 4500 });
      await page.reload();
      await expect(saveToast(page)).toHaveCount(0);
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
                  value: {
                    typeId: serviceType,
                    name: 'Molnmusik',
                    properties: [
                      {
                        id: 'description',
                        label: 'Beskrivning',
                        kind: 'text' as const,
                        value: 'Från text',
                      },
                    ],
                  },
                },
              },
            ]
          : [
              {
                name: 'propose_relationship',
                arguments: {
                  id: 'uses',
                  baseRevision: null,
                  value: { typeId: usesType, sourceId: personId, targetId: 'music' },
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
  const member = await createPreparedContext(browser);
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
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    personId = (await read()).draft.changes[0].id;
    await startConversationWithText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Lägg Molnmusik i utkastet.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    const status = page.getByRole('region', { name: 'Kartans status', exact: true });
    const draftToggle = page.getByRole('button', { name: /^Visa utkastet/ });
    await expect(draftToggle).toHaveAccessibleName('Visa utkastet (2)');
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
    await expect(draftToggle).toHaveAccessibleName('Visa utkastet (3)');
    await page.getByLabel('Meddelande till Skyttel').fill('Oskickat samtalsmeddelande');
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openMap(page);
    await expect(status).not.toContainText('Oskickad formulärtext');
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await openTable(memberPage);
    await expect(await openDraftReview(memberPage)).toContainText('Utkastet är tomt.');
    await closeTextView(memberPage);
    const beforeMember: MapState = await (await member.request.get(path)).json();
    expect(beforeMember.objects).toEqual([]);
    expect(beforeMember.relationships).toEqual([]);
    expect(beforeMember.draft.changes).toEqual([]);
    await openTable(page);
    await openNewObject(page);
    const form = page.locator('dialog.object-dialog-C');
    await form.getByLabel('Namn', { exact: true }).fill('Oskickad cykel');
    await setProperty(form, 'Beskrivning', 'Texten ska finnas kvar');
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Oskickad cykel');
    await expect(propertyRow(page, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
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
    let voicePollHeld = false;
    await page.route('**/text-assistant/*/voice/*/poll', async (route) => {
      voicePollHeld = true;
      await saving;
      await route.fulfill({ response: await route.fetch() });
    });
    // Voice polls also carry the session review. Hold the next sequential
    // poll before changing the draft so it cannot refresh the map mid-click.
    await expect.poll(() => voicePollHeld).toBe(true);
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openMap(page);
    await expect(
      page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true }),
    ).toContainText('föreslås läggas till');
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
    await openTable(page);
    await expect(await openDraftReview(page)).toContainText('Oskickad cykel');
    await expect(
      page.getByRole('button', { name: 'Dölj utkastet (4)', exact: true }),
    ).toBeVisible();
    const refreshed = page.waitForResponse(
      (response) => response.url().endsWith('/poll') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await closeSaveDialog(page);
    await openMap(page);
    await expect.poll(() => waiting).toBe(true);
    const poll = await refreshed;
    expect(poll.status()).toBe(200);
    const updated: VoiceAssistantResponse = await poll.json();
    expect(updated.assistant.review.version).toBe(draft.version);
    await openConversationText(page);
    await expect(await openConversationDraft(page)).toContainText('Oskickad cykel', {
      timeout: 10000,
    });
    await openMap(page);
    await expect(status).toContainText('Väntar på sparkvitto');
    const before = await read();
    expect(before.objects).toEqual([]);
    expect(before.relationships).toEqual([]);
    expect(before.draft).toEqual(draft);
    release?.();
    await expect(saveToast(page)).toHaveCount(1);
    await expect(
      page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true }),
    ).not.toContainText('föreslås');
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
    await openTable(reopened);
    const objects = reopened.getByRole('region', { name: 'Hushållets tabell', exact: true });
    for (const name of ['Lo Exempel', 'Molnmusik', 'Oskickad cykel'])
      await expect(objects).toContainText(name);
    const relationships = await openObjectRelationships(reopened, 'Lo Exempel');
    await expect(relationships).toContainText('Lo Exempel → Använder → Molnmusik');
    await closeSupportDialog(reopened, 'Samband för Lo Exempel');
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

test('UTKAST-13: a verified save keeps a newer field focused', async ({ page }) => {
  const installation = await createInstallation();
  let release: (() => void) | undefined;
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
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
    await openDraftReview(page);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await closeSaveDialog(page);
    await expect.poll(() => committed).toBe(true);
    await closeTextView(page);
    const search = page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true });
    await search.fill('Lo');
    release?.();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    await expect(search).toBeFocused();
    await page.keyboard.type(' Exempel');
    await expect(search).toHaveValue('Lo Exempel');
    await expect(saveToast(page)).toHaveCount(1);
    await expect(search).toBeFocused();
    await openMap(page);
    await expect(
      page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true }),
    ).not.toContainText('föreslås');
  } finally {
    release?.();
    await installation.close();
  }
});

test('UTKAST-15: a necessary answer gates the native draft save until a fresh explicit save', async ({
  page,
}) => {
  let calls = 0;
  const model = textModel((body) => {
    const call = calls++;
    if (call === 1)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: verifiedAnswers(body, ['Vilket kort avses?']),
          continueResponse: true,
        }),
      ];
    if (call > 1) return [modelMessage('Frågan är besvarad. Förslaget väntar på sparbesked.')];
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
              value: {
                ...change.after,
                properties: [
                  {
                    id: 'description',
                    label: 'Beskrivning',
                    kind: 'text' as const,
                    value: 'Förslag väntar på svar',
                  },
                ],
              },
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
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await startConversationWithText(page);
    await page
      .getByLabel('Meddelande till Skyttel')
      .fill('Förbered uppgiften och fråga vilket kort som avses.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await openMap(page);
    const status = page.getByRole('region', { name: 'Kartans status', exact: true });
    await openConversationText(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Vilket kort avses?',
    );
    await openMap(page);
    await expect(
      status.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toHaveCount(0);
    const review = await openDraftReview(page);
    await expect(
      review.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    expect((await read()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    await openConversationText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Kortet Lo Exempel avses.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => calls).toBe(3);
    await openMap(page);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const save = page
      .getByRole('region', { name: 'Utkastet', exact: true })
      .getByRole('button', { name: 'Spara hela utkastet', exact: true });
    await expect(save).toBeEnabled();
    expect(calls).toBe(3);
    expect((await read()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    await save.click();
    await closeSaveDialog(page);
    await expect(saveToast(page)).toHaveCount(1);
    const saved = await read();
    expect(
      saved.objects.map((object) => ({
        name: object.name,
        properties: object.properties,
      })),
    ).toEqual([
      {
        name: 'Lo Exempel',
        properties: expect.arrayContaining([
          expect.objectContaining({
            label: 'Beskrivning',
            kind: 'text',
            value: 'Förslag väntar på svar',
          }),
        ]),
      },
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
  test(`${viewport.width === 1440 ? 'UTKAST-16' : viewport.width === 640 ? 'UTKAST-98' : 'UTKAST-99'}: navigation and native draft review keep controls usable through both opening orders at ${viewport.width}px`, async ({
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
        value: { typeId: initial.types[0].id, name: 'Lo Exempel' },
      });
      await post('save', { version: 1, operationId: 'navigation-status-baseline' });
      await post('draft', {
        version: (await read()).draft.version,
        id: 'bike',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Blå cykeln' },
      });
      await page.goto(installation.origin);
      await openMap(page);
      // Select through the public keyboard control: default graph placement is
      // independent of the protected lower controls whose pointer access is tested below.
      const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
      await lo.focus();
      await lo.press('Enter');
      await expect(lo).toHaveAttribute('aria-pressed', 'true');
      const shared = await read();
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
      const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
      const status = page.locator('.workspace-context');
      const view = async (): Promise<PersonalView> =>
        (await page.request.get(`${path}/view`)).json();
      let version = 0;
      for (const first of ['navigation', 'status']) {
        if (first === 'status') {
          const draft = await openDraftReview(page);
          const save = draft.getByRole('button', { name: 'Spara hela utkastet', exact: true });
          await save.focus();
          await save.click({ trial: true });
          await expect(save).toBeFocused();
          await closeTextView(page);
        }
        if (first === 'navigation')
          await tools.getByRole('button', { name: 'Navigera', exact: true }).click();
        await expect(status).toBeVisible();
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
          JSON.stringify({ navigationBox, statusBox }),
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
        await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
        await expect(tools.getByRole('button', { name: 'Navigera', exact: true })).toBeFocused();
        const draft = await openDraftReview(page);
        const save = draft.getByRole('button', { name: 'Spara hela utkastet', exact: true });
        await save.focus();
        await save.click({ trial: true });
        await expect(save).toBeFocused();
        await closeTextView(page);
        expect(await read()).toEqual(shared);
      }
    } finally {
      await installation.close();
    }
  });
