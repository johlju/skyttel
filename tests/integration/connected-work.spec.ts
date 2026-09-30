import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import type { MapState, ObjectType, RelationshipType, SaveReceipt } from '../../src/shared/map.js';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import {
  activatePanel,
  openConversation,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

declare global {
  interface Window {
    familyMediaRequests: { microphone: number; playback: number };
  }
}

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error('The actual response must contain the requested family value');
  return value;
}

async function loseGraphics(page: Page) {
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('The browser must support actual graphics context loss');
    extension.loseContext();
  });
  await expect(
    page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.', { exact: true }),
  ).toBeVisible();
}

for (const mode of ['voice', 'text'] as const) {
  const title =
    mode === 'voice'
      ? 'ARBETE-08: familjeabonnemanget går från inloggning och samtal till gemensamt kvitto och privat fortsatt arbete'
      : 'ARBETE-09: samma familjearbete fungerar med text och listor utan grafik eller ljud';
  test(title, async ({ page, browser }) => {
    let step = 0;
    let subscriptionType: ObjectType | undefined;
    let personType: ObjectType | undefined;
    let paymentType: RelationshipType | undefined;
    let subscriptionId = '';
    let personId = '';
    const requestedOperationId = 'connected-family-save';
    const model = textModel((body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      ).draft as TextAssistantReview;
      const result = lastToolResult(body) as TextAssistantReview;
      switch (++step) {
        case 1:
          return [modelTool('read_type_catalog', {})];
        case 2: {
          const catalog = lastToolResult(body) as MapState;
          subscriptionType = required(catalog.types.find(({ name }) => name === 'Abonnemang'));
          personType = required(catalog.types.find(({ name }) => name === 'Person'));
          paymentType = required(catalog.relationshipTypes.find(({ name }) => name === 'Betalar'));
          return [
            modelTool('propose_object', {
              version: current.version,
              contentVersion: current.contentVersion,
              id: randomUUID(),
              baseRevision: null,
              typeRevision: subscriptionType.revision,
              value: {
                typeId: subscriptionType.id,
                name: 'Familjens Molnmusik',
                description: '',
                financialFacts: {
                  price: { knowledge: 'known', value: '179' },
                  currency: { knowledge: 'known', value: 'SEK' },
                  paymentInterval: { knowledge: 'known', value: 'månad' },
                },
              },
            }),
          ];
        }
        case 3:
          subscriptionId = required(
            result.changes.find(({ after }) => after?.name === 'Familjens Molnmusik'),
          ).id;
          return [modelMessage('Familjeabonnemanget är föreslaget i ditt privata utkast.')];
        case 4:
          return [
            modelTool('propose_object', {
              version: current.version,
              contentVersion: current.contentVersion,
              id: randomUUID(),
              baseRevision: null,
              typeRevision: required(personType).revision,
              value: { typeId: required(personType).id, name: 'Kim Exempel', description: '' },
            }),
          ];
        case 5:
          personId = required(result.changes.find(({ after }) => after?.name === 'Kim Exempel')).id;
          return [
            modelTool('propose_relationship', {
              version: result.version,
              contentVersion: result.contentVersion,
              id: randomUUID(),
              baseRevision: null,
              typeRevision: required(paymentType).revision,
              value: {
                typeId: required(paymentType).id,
                sourceId: personId,
                targetId: subscriptionId,
                knowledge: 'known',
              },
            }),
          ];
        case 6:
          return [
            modelMessage(
              'Kim Exempel betalar Familjens Molnmusik. Förslagen är fortfarande privata.',
            ),
          ];
        case 7:
          return [
            modelTool('save_draft', {
              version: current.version,
              contentVersion: current.contentVersion,
              operationId: requestedOperationId,
            }),
          ];
        default:
          throw new Error('Unexpected connected scenario model request');
      }
    });
    const live = liveProvider();
    const app = await createInstallation(undefined, {
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    try {
      // 1. Visible first login and household setup, including keyboard focus.
      if (mode === 'voice') await page.addInitScript({ content: liveBrowserFixtureSource });
      else
        await page.addInitScript(() => {
          window.familyMediaRequests = { microphone: 0, playback: 0 };
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            value: async () => {
              window.familyMediaRequests.microphone += 1;
              throw new Error('The text flow must never request a microphone');
            },
          });
          const play = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function () {
            window.familyMediaRequests.playback += 1;
            return play.call(this);
          };
        });
      await page.goto(app.origin);
      await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('button', { name: 'Fortsätt till Google', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Hushållets namn')).toBeFocused();
      await page.getByLabel('Hushållets namn').fill('Hushållet Linden');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Skapa hushåll', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Hushållet Linden' })).toBeFocused();
      if (mode === 'text') await loseGraphics(page);
      const identity = await (await page.request.get(`${app.origin}/api/bootstrap`)).json();
      const householdId = identity.household.id;
      const path = `${app.origin}/api/households/${householdId}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const readMember = async (): Promise<MapState> => (await member.request.get(path)).json();
      const history = async (): Promise<SaveReceipt[]> =>
        (await (await page.request.get(`${path}/history`)).json()).history;

      // 2. Supporting public invitation setup; Robin's proposal uses the visible form.
      app.setIdentity(robin);
      await signIn(member.request, app.origin, 'microsoft');
      const recipient = await (await member.request.get(`${app.origin}/api/bootstrap`)).json();
      app.setIdentity(alex);
      const invitation = await page.request.post(
        `${app.origin}/api/households/${householdId}/invitations`,
        { headers: { origin: app.origin }, data: { userId: recipient.user.id } },
      );
      expect(invitation.status()).toBe(201);
      expect(
        (
          await member.request.post(`${app.origin}/api/invitations/accept`, {
            headers: { origin: app.origin },
            data: { code: (await invitation.json()).code },
          })
        ).status(),
      ).toBe(200);
      await member.goto(app.origin);
      if (mode === 'text') await loseGraphics(member);
      await openWorkspace(member);
      await member.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await member.getByLabel('Objektets namn').fill('Robins notering');
      await member.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      const robinPrivate = (await readMember()).draft;
      expect(robinPrivate.changes).toHaveLength(1);
      expect((await read()).draft.changes).toEqual([]);

      // 3. Real text task reads the catalog, then proposes the private subscription.
      await openConversation(page);
      const assistant = page.getByRole('region', { name: 'Skyttels textassistent', exact: true });
      const start = assistant.getByRole('button', { name: 'Starta textassistenten', exact: true });
      await expect(start).toBeDisabled();
      await assistant.getByLabel(/Jag tillåter att OpenAI/).check();
      await expect(start).toBeDisabled();
      await assistant.getByLabel(/Jag tillåter förslag och sparande/).check();
      await start.click();
      const message = assistant.getByLabel('Meddelande till textassistenten');
      await message.fill(
        'Föreslå Familjens Molnmusik, ett familjeabonnemang för 179 SEK per månad.',
      );
      await assistant.getByRole('button', { name: 'Skicka', exact: true }).click();
      const proposals = assistant.getByRole('list', { name: 'Alla föreslagna ändringar' });
      await expect(proposals).toContainText('Familjens Molnmusik');
      await expect(assistant.getByRole('log', { name: 'Samtalets dialog' })).toContainText(
        'Familjeabonnemanget är föreslaget',
      );
      const initial = await read();
      expect(initial.draft.changes).toHaveLength(1);
      expect(initial.objects).toEqual([]);
      expect(initial.types).toContainEqual(subscriptionType);
      expect(initial.types).toContainEqual(personType);
      expect(initial.relationshipTypes).toContainEqual(paymentType);
      expect(await history()).toEqual([]);
      expect((await readMember()).draft).toEqual(robinPrivate);

      // 4. Controlled transcript crosses the real voice delegation and sequential tools.
      if (mode === 'voice') {
        await assistant.getByRole('button', { name: 'Starta röst', exact: true }).click();
        await expect(
          assistant.getByText('Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.', {
            exact: true,
          }),
        ).toBeVisible();
        expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toMatchObject({
          peers: 1,
          openPeers: 1,
          microphoneTracks: [{ enabled: true, state: 'live' }],
        });
        const session = [...live.channels.keys()][0];
        live.emit(session, {
          type: 'session.input_transcript.delta',
          event_id: randomUUID(),
          delta: 'Kim Exempel betalar familjens Molnmusik.',
          start_ms: 0,
          end_ms: 100,
        });
        live.emit(session, {
          type: 'session.delegation.created',
          event_id: randomUUID(),
          offset_ms: 100,
          delegation: { id: randomUUID(), type: 'delegation', target: 'client' },
        });
      } else {
        await message.fill('Kim Exempel betalar familjens Molnmusik.');
        await assistant.getByRole('button', { name: 'Skicka', exact: true }).click();
      }
      await expect(proposals.getByRole('listitem')).toHaveCount(3);
      await expect(proposals).toContainText('Kim Exempel → Betalar → Familjens Molnmusik');
      await expect(assistant.getByRole('log', { name: 'Samtalets dialog' })).toContainText(
        'Förslagen är fortfarande privata.',
      );
      const proposed = await read();
      expect(proposed.draft.changes).toHaveLength(2);
      expect(proposed.draft.relationships).toHaveLength(1);
      expect(proposed.objects).toEqual([]);
      expect(proposed.relationships).toEqual([]);
      expect((await readMember()).draft).toEqual(robinPrivate);

      // 5. Correct the staged financial values, then retain independent dirty text.
      await openWorkspace(page);
      const objects = page.getByRole('list', { name: 'Objekt', exact: true });
      await objects
        .getByRole('button', { name: 'Uppgifter för Familjens Molnmusik', exact: true })
        .click();
      const subscription = page.getByRole('region', { name: 'Familjens Molnmusik', exact: true });
      await subscription.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      await subscription
        .getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true })
        .click();
      await subscription.getByLabel('Pris', { exact: true }).fill('189');
      await subscription.getByLabel('Beskrivning', { exact: true }).fill('Rättad för hand');
      const correction = page.waitForResponse(`${path}/draft`);
      await subscription.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      expect((await correction).status()).toBe(200);
      await expect(subscription).not.toBeVisible();
      await openWorkspace(page);
      await objects
        .getByRole('button', { name: 'Uppgifter för Familjens Molnmusik', exact: true })
        .click();
      await openWorkspace(page);
      await objects.getByRole('button', { name: 'Uppgifter för Kim Exempel', exact: true }).click();
      const person = page.getByRole('region', { name: 'Kim Exempel', exact: true });
      await expect(person.getByRole('heading', { name: 'Kim Exempel', exact: true })).toBeFocused();
      await person.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      await person.getByLabel('Beskrivning', { exact: true }).fill('Oskickat om Kim');
      await person.getByRole('button', { name: 'Stäng Kim Exempel', exact: true }).click();
      await openWorkspace(page);
      await objects.getByRole('button', { name: 'Uppgifter för Kim Exempel', exact: true }).click();
      await expect(person).toHaveCount(1);
      await expect(person.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Oskickat om Kim',
      );
      const corrected = await read();
      const expectedFacts = {
        price: { knowledge: 'known', value: '189' },
        currency: { knowledge: 'known', value: 'SEK' },
        paymentInterval: { knowledge: 'known', value: 'månad' },
      };
      expect(corrected.draft.changes.find(({ id }) => id === subscriptionId)?.after).toMatchObject({
        name: 'Familjens Molnmusik',
        description: 'Rättad för hand',
        financialFacts: expectedFacts,
      });
      expect(corrected.draft.changes.find(({ id }) => id === personId)?.after?.description).toBe(
        '',
      );

      // 6. Settings hides work, retains its exact values and resumes the same microphone.
      await openConversation(page);
      const dialogue = assistant.getByRole('log', { name: 'Samtalets dialog' });
      const dialogueBeforeSettings = await dialogue.innerText();
      await message.fill('Oskickat i samtalet');
      if (mode === 'voice') {
        await page
          .getByRole('navigation', { name: 'Kartans verktyg' })
          .getByRole('button', { name: 'Pausa mikrofon', exact: true })
          .click();
      }
      await openSettings(page);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Inställningar', exact: true }),
      ).toBeFocused();
      await expect(person).not.toBeVisible();
      await expect(subscription).not.toBeVisible();
      await expect(message).not.toBeVisible();
      const voice = assistant.getByRole('region', { name: 'Skyttels röst', exact: true });
      if (mode === 'voice') {
        expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toMatchObject({
          peers: 1,
          openPeers: 1,
          microphoneTracks: [{ enabled: false, state: 'live' }],
        });
        await voice.getByRole('button', { name: 'Återuppta mikrofon', exact: true }).click();
        expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toMatchObject({
          peers: 1,
          openPeers: 1,
          microphoneTracks: [{ enabled: true, state: 'live' }],
        });
      }
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await activatePanel(page, 'Familjens Molnmusik');
      await expect(
        subscription.getByRole('heading', { name: 'Familjens Molnmusik', exact: true }),
      ).toBeFocused();
      await expect(subscription).toContainText('Rättad för hand');
      await activatePanel(page, 'Kim Exempel');
      await expect(person.getByRole('heading', { name: 'Kim Exempel', exact: true })).toBeFocused();
      await expect(person.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Oskickat om Kim',
      );
      await openConversation(page);
      await expect(
        page.getByRole('heading', { name: 'Samtal och text', exact: true }),
      ).toBeFocused();
      await expect(message).toHaveValue('Oskickat i samtalet');
      await expect(dialogue).toHaveText(dialogueBeforeSettings, { useInnerText: true });
      expect(await read()).toEqual(corrected);
      expect((await readMember()).draft).toEqual(robinPrivate);
      expect(await history()).toEqual([]);

      // 7. Explicit whole save; compare all real receipt values, excluding local text.
      await expect(proposals.getByRole('listitem')).toHaveCount(3);
      await assistant.getByText('Visa hela utkastets detaljer', { exact: true }).click();
      const wholeDraft = assistant.getByRole('region', {
        name: 'Assistentens hela utkast',
        exact: true,
      });
      for (const value of ['Rättad för hand', '189', 'SEK', 'månad'])
        await expect(wholeDraft.getByText(value, { exact: false }).first()).toBeVisible();
      await message.fill('Spara hela utkastet nu.');
      await assistant.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(assistant.getByRole('status')).toHaveText(
        'Sparat. Hela utkastet finns i hushållets karta.',
      );
      await assistant.getByText('Visa kvittot', { exact: true }).click();
      await expect(assistant).toContainText('Familjens Molnmusik');
      await expect(person.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Oskickat om Kim',
      );
      const receipts = await history();
      expect(receipts).toHaveLength(1);
      const receipt = receipts[0];
      // The server owns the durable operation identity; model-supplied IDs are not authority.
      const operationId = receipt.operationId;
      await expect(assistant).toContainText(operationId);
      expect(receipt).toMatchObject({
        operationId,
        userId: identity.user.id,
        draftVersion: corrected.draft.version,
        contentVersion: corrected.contentVersion,
      });
      expect(receipt.changes).toHaveLength(2);
      for (const change of corrected.draft.changes)
        expect(receipt.changes.find(({ after }) => after?.id === change.id)).toMatchObject({
          before: null,
          after: change.after,
        });
      expect(receipt.relationships).toHaveLength(1);
      expect(receipt.relationships?.[0]).toMatchObject({
        before: null,
        after: {
          ...corrected.draft.relationships?.[0].after,
          typeId: required(paymentType).id,
          sourceId: personId,
          targetId: subscriptionId,
          knowledge: 'known',
        },
      });
      expect(receipt.objectTypes ?? []).toEqual([]);
      expect(receipt.relationshipTypes ?? []).toEqual([]);
      const operations = await (await page.request.get(`${path}/operations`)).json();
      expect(operations.operations).toHaveLength(1);
      expect(operations.operations[0]).toMatchObject({ operationId, status: 'succeeded', receipt });
      const saved = await read();
      expect(saved.objects).toHaveLength(2);
      expect(saved.relationships).toHaveLength(1);
      expect(saved.draft.changes).toEqual([]);
      expect(saved.draft.relationships ?? []).toEqual([]);
      expect(JSON.stringify(saved)).not.toContain('Oskickat om Kim');
      expect(JSON.stringify(saved)).not.toContain('Robins notering');

      // 8. Stop media, restart the same database, inspect full history and two-way privacy.
      if (mode === 'voice') {
        await voice.getByRole('button', { name: 'Stäng av rösten', exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats()))
          .toMatchObject({
            openPeers: 0,
            microphoneTracks: [{ enabled: false, state: 'ended' }],
            remoteTracks: [{ enabled: true, state: 'ended' }],
          });
      } else {
        expect(live.requests).toEqual([]);
        await expect(voice.getByRole('button', { name: 'Starta röst', exact: true })).toBeVisible();
        expect(await page.evaluate(() => window.familyMediaRequests)).toEqual({
          microphone: 0,
          playback: 0,
        });
      }
      await app.restart();
      await page.reload();
      if (mode === 'text') await loseGraphics(page);
      expect((await (await page.request.get(`${app.origin}/api/bootstrap`)).json()).user.id).toBe(
        identity.user.id,
      );
      expect(await history()).toEqual([receipt]);
      expect(await read()).toEqual(saved);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
      const savedHistory = page.getByRole('region', { name: 'Ändringshistorik' });
      const savedGroup = savedHistory
        .getByRole('article')
        .filter({ hasText: `Sparande: ${operationId}` });
      await savedGroup.getByText('Visa ändringarna', { exact: true }).click();
      for (const value of [
        'Familjens Molnmusik',
        'Kim Exempel',
        'Rättad för hand',
        '189',
        'SEK',
        'månad',
        'Betalar',
      ])
        await expect(savedGroup).toContainText(value);
      await openWorkspace(page);
      await objects
        .getByRole('button', { name: 'Uppgifter för Familjens Molnmusik', exact: true })
        .click();
      await subscription.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      await subscription.getByLabel('Beskrivning', { exact: true }).fill('Alex privat efteråt');
      await subscription.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await member.reload();
      if (mode === 'text') await loseGraphics(member);
      await openWorkspace(member);
      const memberObjects = member.getByRole('list', { name: 'Objekt', exact: true });
      for (const name of ['Familjens Molnmusik', 'Kim Exempel', 'Robins notering'])
        await expect(
          memberObjects.getByRole('button', { name: `Uppgifter för ${name}`, exact: true }),
        ).toBeVisible();
      await memberObjects
        .getByRole('button', { name: 'Uppgifter för Familjens Molnmusik', exact: true })
        .click();
      const memberSubscription = member.getByRole('region', {
        name: 'Familjens Molnmusik',
        exact: true,
      });
      await expect(memberSubscription).toContainText('Rättad för hand');
      for (const value of ['Pris: 189', 'Valuta: SEK', 'Betalningsintervall: månad'])
        await expect(memberSubscription.getByText(value, { exact: true })).toBeVisible();
      await expect(memberSubscription).not.toContainText('Alex privat efteråt');
      await openWorkspace(member);
      await expect(
        member.getByRole('list', { name: 'Samband', exact: true }).getByRole('button', {
          name: 'Kim Exempel → Betalar → Familjens Molnmusik',
          exact: true,
        }),
      ).toBeVisible();
      await member.getByRole('button', { name: 'Visa historik', exact: true }).click();
      const memberHistory = member
        .getByRole('region', { name: 'Ändringshistorik' })
        .getByRole('article')
        .filter({ hasText: `Sparande: ${operationId}` });
      await memberHistory.getByText('Visa ändringarna', { exact: true }).click();
      for (const value of ['Rättad för hand', '189', 'SEK', 'månad', 'Kim Exempel', 'Betalar'])
        await expect(memberHistory).toContainText(value);
      const otherState = await readMember();
      expect(otherState.objects).toEqual(saved.objects);
      expect(otherState.relationships).toEqual(saved.relationships);
      expect(otherState.draft).toEqual(robinPrivate);
      const alexState = await read();
      expect(alexState.objects).toEqual(saved.objects);
      expect(alexState.draft.changes).toHaveLength(1);
      expect(alexState.draft.changes[0].after?.description).toBe('Alex privat efteråt');
      expect(JSON.stringify(alexState)).not.toContain('Robins notering');
      expect(await history()).toEqual([receipt]);
      expect((await (await member.request.get(`${path}/history`)).json()).history).toEqual([
        receipt,
      ]);
      expect(model.requests).toHaveLength(7);
      if (mode === 'text')
        expect(await page.evaluate(() => window.familyMediaRequests)).toEqual({
          microphone: 0,
          playback: 0,
        });
    } finally {
      await memberContext.close();
      await app.close();
    }
  });
}
