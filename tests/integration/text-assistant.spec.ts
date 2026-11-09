import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { SaveOperation, SaveReceipt } from '../../src/shared/map.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import { controlledBatchDelivery } from '../support/batch-response-delivery.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openMap,
  openTable,
  signIn,
} from '../support/client.js';
import {
  openConversationText,
  openSavedHistory,
  readCommittedHistoryCard,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import {
  editObjectRelationship,
  editTableObject,
  readDraftProposal,
  readTableObject,
} from '../support/domain-work.js';
import { familySaveSequence } from '../support/family-save-model.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider, voiceAnswerParts } from '../support/live-provider.js';
import { manualTextDeliverySource } from '../support/manual-text-delivery.js';
import { verifyObjectDepartureAndDiscard } from '../support/object-form-departure.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';
import {
  failExplanation,
  lastToolResult,
  type ModelRequest,
  modelMessage,
  modelTool,
  textModel,
} from '../support/text-model.js';

function completionAuthorization(body: ModelRequest) {
  const input = JSON.parse(String(body.input[0].content));
  return [
    modelMessage(
      JSON.stringify(
        body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
          ? {
              mode: 'work',
              request: input.current,
              responseRequired:
                input.current.includes('förklara') || input.current.startsWith('Beskriv'),
            }
          : { decision: 'allow', complete: true, fulfillsRequest: true },
      ),
    ),
  ];
}

test('TEXT-17: verifierat slutbesked behåller beställd förklaring i text och röst', async ({
  page,
}) => {
  const explanation = 'Person är en objekttyp. Kim Lind är ett objekt av den typen.';
  const saveExplanation = 'Lo Exempel och Kim Lind finns nu i hushållets karta.';
  const model = textModel((body) => {
    const { message, draft } = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    const current = body.input.slice(body.input.findLastIndex((item) => item.role === 'user'));
    if (current.some((item) => item.type === 'function_call_output'))
      return [modelMessage(message.startsWith('Beskriv') ? saveExplanation : explanation)];
    if (message.startsWith('Beskriv'))
      return [
        modelTool('save_draft', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          operationId: 'controlled-save',
        }),
      ];
    if (message.startsWith('Ändra')) {
      const kim = draft.changes.find((change: { id: string }) => change.id === 'kim');
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'kim',
                baseRevision: null,
                value: { ...kim.after, name: 'Kim Lind' },
              },
            },
          ],
        }),
      ];
    }
    return [
      modelTool('propose_object', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        id: 'kim',
        baseRevision: null,
        value: {
          typeId: draft.changes.find((change: { id: string }) => change.id === 'lo').after.typeId,
          name: 'Kim',
        },
      }),
    ];
  }, completionAuthorization);
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await arrange(page, app);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.reload();
    await consent(page);
    await send(page, 'Lägg till Kim som person med samma objekttyp som Lo Exempel utan att spara.');
    await expect(transcript(page)).toContainText('Kim lades till.');
    await expect(transcript(page).locator('.working')).toHaveCount(0);
    expect(model.requests).toHaveLength(1);
    expect(model.authorizationRequests).toHaveLength(2);
    await expect(await showDraft(page)).toContainText('Kim');
    await expect(transcript(page)).not.toContainText('Sparat.');
    await send(
      page,
      'Ändra Kim till Kim Lind och förklara vad objekttypen Person betyder. Spara inte.',
    );
    await expect(transcript(page)).toContainText(explanation);
    await expect(transcript(page).locator('.working')).toHaveCount(0);
    expect(model.requests).toHaveLength(3);
    await expect(await showDraft(page)).toContainText('Kim Lind');
    await expect(transcript(page)).not.toContainText('Sparat.');
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    const channel = [...live.channels.keys()].at(-1);
    if (!channel) throw new Error('Missing current voice channel');
    live.emit(channel, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Beskriv efter sparandet vilka objekt som är sparade. Spara hela utkastet.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(channel, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect.poll(() => voiceAnswerParts(live.sent).join('\n')).toContain(saveExplanation);
    expect(voiceAnswerParts(live.sent).join('\n')).toContain('Sparat.');
    expect(voiceAnswerParts(live.sent).join('\n')).toContain('Samtal (obekräftat):');
    await page.evaluate(
      (delta) =>
        window.skyttelVoiceFixture.emit({
          type: 'session.output_transcript.delta',
          event_id: crypto.randomUUID(),
          delta,
          start_ms: 200,
          end_ms: 300,
        }),
      `Sparat. ${saveExplanation}`,
    );
    await expect(transcript(page)).toContainText(saveExplanation);
    await expect(await showDraft(page)).toContainText('Utkastet är tomt.');
    expect(model.requests).toHaveLength(5);
    await expect(await readTableObject(page, 'Lo Exempel')).toContainText('Person');
    await expect(await readTableObject(page, 'Kim Lind')).toContainText('Person');
    const history = await openSavedHistory(page);
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Lo Exempel');
    await expect(history.locator('.history-changes')).toContainText('Kim Lind');
    await verifyTypedSaveExplanationFailure(page);
    await verifyTypedUnsavedExplanationFailure(page);
  } finally {
    await app.close();
  }
});

async function createExplanationFailureInstallation(model: ReturnType<typeof textModel>) {
  let explanationFailures = 0;
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: failExplanation(model, () => {
      explanationFailures++;
      return Response.json(
        { error: { message: 'Controlled explanation outage.' } },
        { status: 503 },
      );
    }),
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  return { app, live, explanationFailures: () => explanationFailures };
}

async function verifyTypedUnsavedExplanationFailure(page: Page) {
  const question = 'Vad heter kollegan?';
  const model = textModel((body) => {
    const { draft } = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('submit_changes', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        completion: 'draft',
        questions: [
          {
            kind: 'change',
            request: 'Lägg till kollegan som person.',
            question,
            dependsOnDraft: false,
          },
        ],
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'kim',
              baseRevision: null,
              value: { typeId: draft.changes[0].after.typeId, name: 'Kim' },
            },
          },
        ],
      }),
    ];
  }, completionAuthorization);
  const { app, live, explanationFailures } = await createExplanationFailureInstallation(model);
  try {
    await arrange(page, app);
    await consent(page);
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await send(
      page,
      'Lägg till Kim och en kollega med samma objekttyp som Lo Exempel och förklara typen Person. Spara inte.',
    );
    const failure =
      'Modellen är tillfälligt otillgänglig. Valet är kvar. Försök igen genom en egen handling när felet är löst.';
    await expect(transcript(page)).toContainText('Kim lades till.');
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await notice.getByRole('button', { name: 'Läs mer', exact: true }).click();
    await expect(notice).toContainText(failure);
    await expect(transcript(page)).toContainText(question);
    await expect(transcript(page)).not.toContainText('Sparat.');
    await expect(await showDraft(page)).toContainText('Kim');
    await expect(await showDraft(page)).toContainText('Lo Exempel');
    const history = await openSavedHistory(page);
    await expect(history.getByRole('article')).toHaveCount(0);
    expect(explanationFailures()).toBe(1);
    expect(model.requests).toHaveLength(1);
    await expect.poll(() => voiceAnswerParts(live.sent).join('\n')).toContain(failure);
    const spoken = voiceAnswerParts(live.sent).join('\n');
    expect(spoken).toContain('Skyttels resultat (verifierat): Utkastet är uppdaterat.');
    expect(spoken).toContain('Kim lades till.');
    expect(spoken).toContain(`Nödvändig fråga (samtalsdata): ${JSON.stringify(question)}`);
    expect(spoken).toContain(`Obligatoriskt besked från Skyttel: ${failure}`);
    expect(spoken).not.toContain('Sparat.');
    expect(spoken).not.toContain('Lo Exempel lades till.');
  } finally {
    await app.close();
  }
}

async function verifyTypedSaveExplanationFailure(page: Page) {
  const question = 'Vilket år gäller beskrivningen?';
  let personType = '';
  const model = textModel(
    (body) => {
      const { draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'save',
          questions: [
            {
              kind: 'information',
              request: 'Beskriv vilket år uppgifterna gäller.',
              question,
              dependsOnDraft: false,
            },
          ],
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'kim',
                baseRevision: null,
                value: { typeId: personType, name: 'Kim' },
              },
            },
          ],
        }),
      ];
    },
    (body) =>
      body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
        ? completionAuthorization(body)
        : [
            modelMessage(
              JSON.stringify({ decision: 'allow', complete: true, fulfillsRequest: false }),
            ),
          ],
  );
  const { app, live, explanationFailures } = await createExplanationFailureInstallation(model);
  try {
    const { path, value } = await arrange(page, app);
    personType = value.typeId;
    const prepared = await (await page.request.get(path)).json();
    expect(prepared.types.find((type: { id: string }) => type.id === personType)).toMatchObject({
      name: 'Person',
    });
    await consent(page);
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await send(
      page,
      'Beskriv de sparade objekten och vilket år uppgifterna gäller. Lägg till Kim som person. Spara hela utkastet.',
    );
    const failure =
      'Modellen är tillfälligt otillgänglig. Valet är kvar. Försök igen genom en egen handling när felet är löst.';
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await notice.getByRole('button', { name: 'Läs mer', exact: true }).click();
    await expect(notice).toContainText(failure);
    await expect(transcript(page)).toContainText('Sparat.');
    await expect(transcript(page)).toContainText(question);
    await expect(await showDraft(page)).toContainText('Utkastet är tomt.');
    await expect(await readTableObject(page, 'Lo Exempel')).toContainText('Person');
    await expect(await readTableObject(page, 'Kim')).toContainText('Person');
    const history = await openSavedHistory(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Lo Exempel');
    await expect(history.locator('.history-changes')).toContainText('Kim');
    expect(explanationFailures()).toBe(1);
    expect(model.requests).toHaveLength(1);
    await expect.poll(() => voiceAnswerParts(live.sent).join('\n')).toContain('Sparat.');
    const spoken = voiceAnswerParts(live.sent).join('\n');
    expect(spoken).toContain(`Obligatoriskt besked från Skyttel: ${failure}`);
    expect(spoken).toContain(`Nödvändig fråga (samtalsdata): ${JSON.stringify(question)}`);
    expect(spoken).not.toContain('Lo Exempel lades till.');
  } finally {
    await app.close();
  }
}

test('TEXT-16: ett tappat ändringsbesked bevarar tidigare förslag och återfinns utan dubbla ändringar', async ({
  page,
}) => {
  await verifyBatchRecovery(page, false);
  await verifyBatchRecovery(page, true);
});

async function verifyBatchRecovery(page: Page, explanation: boolean) {
  const delivery = controlledBatchDelivery();
  const question = 'Vilket år gäller beskrivningen?';
  const instruction = explanation
    ? 'Lägg till Kim utan att spara, förklara vad ett utkast betyder och beskriv vilket år uppgifterna gäller.'
    : 'Lägg till Kim utan att spara.';
  const model = textModel(
    (body) => {
      const { draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      const person = lastToolResult(body)?.types?.find(
        (type: { name: string }) => type.name === 'Person',
      );
      if (!person) return [modelTool('read_type_catalog', {})];
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'draft',
          questions: explanation
            ? [
                {
                  kind: 'information',
                  request: 'Beskriv vilket år uppgifterna gäller.',
                  question,
                  dependsOnDraft: false,
                },
              ]
            : [],
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'kim',
                baseRevision: null,
                value: { typeId: person.id, name: 'Kim' },
              },
            },
          ],
        }),
      ];
    },
    (body) => [
      modelMessage(
        JSON.stringify(
          body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
            ? { mode: 'work', request: instruction, responseRequired: explanation }
            : { decision: 'allow', complete: true, fulfillsRequest: explanation },
        ),
      ),
    ],
  );
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
    assistantDispatch: delivery.dispatch,
  });
  try {
    await arrange(page, app);
    if (explanation) {
      await page.addInitScript({ content: liveBrowserFixtureSource });
      await page.reload();
    }
    await consent(page);
    if (explanation) {
      await turnMicrophoneOn(page);
      await expect(voiceBox(page)).toHaveText('Lyssnar');
    }
    delivery.arm();
    delivery.blockStatus(true);
    await send(page, instruction);
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await expect(notice).toContainText('Det är oklart om ändringarna genomfördes.');
    await expect(notice).not.toContainText('sparades');
    const field = page.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    await field.fill('Vänta med nästa uppdrag.');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    expect(model.requests).toHaveLength(2);
    const authorizations = model.authorizationRequests.length;
    if (explanation)
      await expect.poll(() => voiceAnswerParts(live.sent).join('\n')).toContain(question);
    const recoveryVoiceStart = live.sent.length;
    delivery.blockStatus(false);
    await expect(transcript(page)).toContainText('Kim');
    await expect(transcript(page)).toContainText('lades till');
    const unfinished = 'Uppdraget är inte slutfört.';
    await expect(notice).toContainText(unfinished);
    await expect(notice).toContainText('Återstående arbete är pausat');
    await expect(transcript(page)).toContainText(instruction);
    if (explanation) {
      await expect(transcript(page)).toContainText(question);
      await expect
        .poll(() => voiceAnswerParts(live.sent.slice(recoveryVoiceStart)).join('\n'))
        .toContain(unfinished);
      const recoveredVoice = voiceAnswerParts(live.sent.slice(recoveryVoiceStart)).join('\n');
      expect(recoveredVoice).toContain('Kim lades till.');
      expect(recoveredVoice).toContain(
        `Nödvändig fråga (samtalsdata): ${JSON.stringify(question)}`,
      );
      expect(recoveredVoice).not.toContain('Sparat.');
    }
    await expect(field).toHaveValue('Vänta med nästa uppdrag.');
    await field.fill('');
    expect(delivery.status().phase).toBe('dropped-after-commit');
    expect(model.requests).toHaveLength(2);
    expect(model.authorizationRequests).toHaveLength(authorizations);
    const draft = await showDraft(page);
    await expect(
      draft.getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true }),
    ).toHaveCount(1);
    await expect(
      draft.getByRole('button', { name: 'Visa förslaget: Kim', exact: true }),
    ).toHaveCount(1);
    await draft.getByRole('button', { name: 'Visa förslaget: Kim', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Kim', exact: true })).toContainText('Person');
    await closeSupportDialog(page, 'Kim');
    await app.restart();
    await page.reload();
    await openTable(page);
    await consent(page);
    const retained = await showDraft(page);
    await expect(
      retained.getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true }),
    ).toHaveCount(1);
    await expect(
      retained.getByRole('button', { name: 'Visa förslaget: Kim', exact: true }),
    ).toHaveCount(1);
    await expect(transcript(page)).not.toContainText('Sparat.');
    expect(model.requests).toHaveLength(2);
  } finally {
    await app.close();
  }
}

test('TEXT-15: avvisat sparande bevarar utkastet före ett nytt talat sparbesked', async ({
  page,
}) => {
  let checks = 0;
  let checkingSave = false;
  let releaseCheck = () => {};
  const heldCheck = new Promise<void>((resolve) => {
    releaseCheck = resolve;
  });
  const model = textModel(
    (body) => {
      const { message, draft: initialDraft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (message === 'Vad finns i utkastet?')
        return [modelTool('report_result', { source: 'draft' })];
      const read = lastToolResult(body);
      const draft = read?.changes ? read : initialDraft;
      const previous = draft.changes.find((change: { id: string }) => change.id === 'kim');
      const person = previous ?? draft.changes.find((change: { id: string }) => change.id === 'lo');
      if (!person) return [modelTool('read_my_draft', {})];
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'save',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'kim',
                baseRevision: null,
                value: previous
                  ? { ...previous.after, name: 'Kim Lind' }
                  : { typeId: person.after.typeId, name: 'Kim' },
              },
            },
          ],
        }),
      ];
    },
    async (body) => {
      const input = JSON.parse(String(body.input[0].content));
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [
          modelMessage(
            JSON.stringify({
              mode: input.current === 'Vad finns i utkastet?' ? 'read' : 'work',
              request: input.current,
              responseRequired: false,
            }),
          ),
        ];
      if (input.untrusted.data.wholeDraft) {
        expect(input.untrusted.data.draft.changes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'lo',
              after: expect.objectContaining({ name: 'Lo Exempel' }),
            }),
            expect.objectContaining({ id: 'kim' }),
          ]),
        );
        if (checks++ === 0) return [modelMessage('{"decision":"clarify"}')];
        checkingSave = true;
        await heldCheck;
      }
      return [
        modelMessage(
          JSON.stringify({
            decision: 'allow',
            complete: true,
            fulfillsRequest: Boolean(input.untrusted.data.wholeDraft),
          }),
        ),
      ];
    },
  );
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { path } = await arrange(page, app);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.reload();
    await consent(page);
    await expect(await showDraft(page)).toContainText('Lo Exempel');
    await send(page, 'Lägg till Kim som person och spara.');
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await notice.getByRole('button', { name: 'Läs mer', exact: true }).click();
    await expect(notice).toContainText('Ändringarna ligger kvar osparade i ditt utkast.');
    await expect(notice).toContainText('Be om sparande igen');
    await expect(await showDraft(page)).toContainText('Lo Exempel');
    await expect(await showDraft(page)).toContainText('Kim');
    await (await showDraft(page))
      .getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Lo Exempel', exact: true })).toContainText(
      'Påhittad uppgift',
    );
    await closeSupportDialog(page, 'Lo Exempel');
    await send(page, 'Vad finns i utkastet?');
    await expect.poll(() => model.requests.length).toBe(3);
    const report = transcript(page).getByRole('listitem').filter({ hasText: 'Utkast:' });
    await expect(report).toContainText('Lo Exempel');
    await expect(report).toContainText('Kim');
    await expect(transcript(page).locator('.working')).toHaveCount(0);
    await expect(transcript(page)).not.toContainText('Sparat.');
    await expect(await showDraft(page)).toContainText('Kim');
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    const channel = [...live.channels.keys()].at(-1);
    if (!channel) throw new Error('Missing current voice channel');
    live.emit(channel, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Ändra namnet på Kim till Kim Lind och spara.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(channel, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect.poll(() => checkingSave).toBe(true);
    await expect(transcript(page)).not.toContainText('Sparat.');
    await expect(await showDraft(page)).toContainText('Kim Lind');
    releaseCheck();
    await expect(page.locator('.draft-save-toast')).toHaveText('Utkastet är sparat');
    await page.evaluate(() =>
      window.skyttelVoiceFixture.emit({
        type: 'session.output_transcript.delta',
        event_id: crypto.randomUUID(),
        delta: 'Sparat.',
        start_ms: 200,
        end_ms: 300,
      }),
    );
    await expect(transcript(page)).toContainText('Sparat.');
    await expect(await showDraft(page)).toContainText('Utkastet är tomt.');
    await expect(await readTableObject(page, 'Lo Exempel')).toContainText('Påhittad uppgift');
    await expect(await readTableObject(page, 'Kim Lind')).toContainText('Person');
    const history = await openSavedHistory(page);
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Lo Exempel');
    await expect(history.locator('.history-changes')).toContainText('Kim Lind');
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
  } finally {
    releaseCheck();
    await app.close();
  }
});

const assistant = (page: Page) => page.getByRole('region', { name: 'Arbetsyta', exact: true });

const transcript = (page: Page) => page.getByRole('log', { name: 'Samtalstext', exact: true });

const notice = (page: Page) => page.getByRole('region', { name: 'Samtalsnotis', exact: true });

async function consent(page: Page) {
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/text-assistant'),
  );
  await startConversationWithText(page);
  await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeVisible();
  return (await (await started).json()) as TextAssistantView;
}

async function send(page: Page, text: string) {
  await openConversationText(page);
  await assistant(page).getByLabel('Meddelande till Skyttel').fill(text);
  await assistant(page).getByRole('button', { name: 'Skicka', exact: true }).click();
}

async function showDraft(page: Page) {
  await openConversationText(page);
  const toggle = page.getByRole('button', { name: /^Visa utkastet/ });
  if (await toggle.isVisible()) await toggle.click();
  return assistant(page).getByRole('region', { name: 'Utkastet', exact: true });
}

async function showAttempts(page: Page) {
  const history = await openSavedHistory(page);
  await history.getByText('Identifiera sparandet och användaren', { exact: true }).last().click();
  return history;
}

async function arrange(page: Page, app: Awaited<ReturnType<typeof createInstallation>>) {
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  const value = {
    typeId: state.types[0].id,
    name: 'Lo Exempel',
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Påhittad uppgift' },
    ],
  };
  await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: { version: 0, contentVersion: 1, id: 'lo', baseRevision: null, value },
  });
  await page.goto(app.origin);
  await openTable(page);
  return { path, value };
}

test('TEXT-01: familjeärendet sparas samlat med bevarad oskickad formulärtext', async ({
  page,
}) => {
  let releaseModel = () => {};
  const heldModel = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  const saveFamily = familySaveSequence(() => [
    {
      id: 'description',
      label: 'Beskrivning',
      kind: 'text',
      value: 'Familjeabonnemang 189 kr per månad.',
    },
    { id: 'price', label: 'Pris', kind: 'text', value: '189' },
    { id: 'currency', label: 'Valuta', kind: 'text', value: 'SEK' },
    { id: 'paymentInterval', label: 'Betalningsintervall', kind: 'text', value: 'månad' },
  ]);
  const model = textModel(async (body) => {
    await heldModel;
    return saveFamily(body);
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const household = app.seedDemo();
    await signIn(page.request, app.origin);
    await page.goto(app.origin);
    await consent(page);
    await expect(await showDraft(page)).toContainText('Lo Lind');
    await send(page, 'Behåll Lo-förslaget, rätta priset till 189 kr och spara mina ändringar.');
    await expect.poll(() => model.requests.length).toBe(1);
    await closeTextView(page);
    await editTableObject(page, 'Kim Exempel');
    await setProperty(page, 'Beskrivning', 'Osänd text som ska finnas kvar');
    releaseModel();
    const path = `${app.origin}/api/households/${household.id}/map`;
    await expect
      .poll(async () => (await (await page.request.get(path)).json()).draft.changes)
      .toEqual([]);
    await expect(propertyRow(page, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Osänd text som ska finnas kvar',
    );
    await verifyObjectDepartureAndDiscard(page, { Beskrivning: 'Osänd text som ska finnas kvar' });
    await openConversationText(page);
    await expect(
      transcript(page)
        .getByRole('listitem')
        .filter({ hasText: /^Skyttel: Sparat\.$/ }),
    ).toHaveCount(1);
    await expect(await showDraft(page)).toContainText('Utkastet är tomt.');
    await expect(await showAttempts(page)).toContainText('Familjens Molnmusik');
    const savedSubscription = await readTableObject(page, 'Familjens Molnmusik');
    for (const value of ['Familjeabonnemang 189 kr per månad.', '189', 'SEK', 'månad'])
      await expect(savedSubscription).toContainText(value);
    const savedLo = await readTableObject(page, 'Lo Lind');
    await expect(savedLo).toContainText('Spelar piano i musikföreningen.');
    const familyHistory = await openSavedHistory(page);
    const familyReceipt = familyHistory
      .getByRole('article')
      .filter({ hasText: 'Familjens Molnmusik' })
      .first();
    await familyReceipt.getByText('Visa ändringarna', { exact: true }).click();
    for (const value of ['189', 'SEK', 'månad', 'Lo Lind', 'musik@example.test'])
      await expect(familyReceipt.locator('.history-changes')).toContainText(value);
    const map = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map`)
    ).json();
    expect(
      map.objects
        .find((object: { name: string }) => object.name === 'Familjens Molnmusik')
        .properties.find((property: { id: string }) => property.id === 'price'),
    ).toEqual({ id: 'price', label: 'Pris', kind: 'text', value: '189' });
    expect(map.objects.some((object: { name: string }) => object.name === 'Lo Lind')).toBe(true);
    expect(map.draft.changes).toEqual([]);
    expect(
      map.relationships.every(
        (edge: { sourceId: string; targetId: string }) =>
          typeof edge.sourceId === 'string' && typeof edge.targetId === 'string',
      ),
    ).toBe(true);
    expect(JSON.stringify(map.relationships)).toContain('Osäkert uppgivet');
    expect(model.requests).toHaveLength(5);
  } finally {
    releaseModel();
    await app.close();
  }
});

test('TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte nytt arbete', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  let held = false;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        held = true;
        release = resolve;
      }),
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path, value } = await arrange(page, app);
    const started = await consent(page);
    await send(page, 'Rätta namnet.');
    await expect.poll(() => held).toBe(true);
    await expect(transcript(page)).toContainText('Skyttel arbetar');
    await page.request.post(`${path}/discard`, {
      headers: { origin: app.origin },
      data: { version: 1, contentVersion: 1 },
    });
    release([
      modelTool('propose_object', {
        version: 1,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect(
      notice(page).getByText('Skyttel kunde inte slutföra uppdraget. Försök igen.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await (
          await page.request.get(`${path.replace(/\/map$/, '/text-assistant')}/${started.id}`)
        ).json()
      ).error,
    ).toBe('assistant_draft_changed');
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    held = false;
    await send(page, 'Skapa ett nytt förslag.');
    await expect.poll(() => held).toBe(true);
    await assistant(page).getByRole('textbox', { name: 'Meddelande till Skyttel' }).press('Escape');
    release([
      modelTool('propose_object', {
        version: 2,
        contentVersion: 1,
        id: 'late',
        baseRevision: null,
        value,
      }),
    ]);
    await expect(assistant(page)).toContainText(
      'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
    );
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await closeTextView(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const newForm = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await newForm.getByLabel('Namn', { exact: true }).fill('Nytt vanligt arbete');
    await setProperty(newForm, 'Beskrivning', 'Efter båda sena svaren');
    await newForm.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await (await page.request.get(path)).json()).draft.changes).toMatchObject([
      {
        after: {
          name: 'Nytt vanligt arbete',
          properties: expect.arrayContaining([
            expect.objectContaining({
              label: 'Beskrivning',
              kind: 'text',
              value: 'Efter båda sena svaren',
            }),
          ]),
        },
      },
    ]);
    const ordinaryProposal = await readDraftProposal(page, 'Nytt vanligt arbete');
    await expect(ordinaryProposal).toContainText('Efter båda sena svaren');
  } finally {
    await app.close();
  }
});

test('TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet tillgängligt', async ({
  page,
}) => {
  let fail = false;
  const model = textModel(() => {
    if (fail) throw new Error('Synthetic failure');
    return [modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'no-save' })];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const started = await consent(page);
    const currentTask = async (): Promise<TextAssistantView> =>
      (await page.request.get(`${path.replace(/\/map$/, '/text-assistant')}/${started.id}`)).json();
    let revision = started.revision;
    for (const text of [
      'Spara inte.',
      'Vad händer om vi sparar?',
      'Spara ej.',
      'Spara senare.',
      'Skriv ”spara” i beskrivningen.',
    ]) {
      await send(page, text);
      await expect
        .poll(async () => {
          const current = await currentTask();
          return current.revision > revision && current.error === 'assistant_save_not_requested';
        })
        .toBe(true);
      revision = (await currentTask()).revision;
      await expect(notice(page)).toContainText(
        'Skyttel kunde inte slutföra uppdraget. Försök igen.',
      );
      expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    }
    fail = true;
    await send(page, 'Beskriv mitt utkast.');
    await expect.poll(async () => (await currentTask()).error).toBe('assistant_model_temporary');
    await expect(notice(page)).toContainText(
      'Modellen är tillfälligt otillgänglig. Valet är kvar.',
    );
    await notice(page).getByRole('button', { name: 'Läs mer', exact: true }).click();
    await expect(notice(page)).toContainText(
      'Modellen är tillfälligt otillgänglig. Valet är kvar. Försök igen genom en egen handling när felet är löst.',
    );
    await closeTextView(page);
    await editTableObject(page, 'Lo Exempel');
    await page.getByLabel('Namn', { exact: true }).fill('Lo Lind');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await (await page.request.get(path)).json()).draft.changes[0].after.name).toBe(
      'Lo Lind',
    );
    const corrected = await readDraftProposal(page, 'Lo Lind');
    await expect(corrected).toContainText('Person');
    await expect(corrected).toContainText('Påhittad uppgift');
  } finally {
    await app.close();
  }
});

test('TEXT-04: ett tappat sparbesked återfinns efter omstart utan dubbelt sparande', async ({
  page,
}) => {
  const preparation = await readFile(
    new URL('../../docs/manual-tests/text-conversation-preparation.md', import.meta.url),
    'utf8',
  );
  const consoleScripts = [...preparation.matchAll(/```js\n([\s\S]*?)\n```/g)].map(
    (match) => match[1],
  );
  const captureScript = consoleScripts.find((script) =>
    script.startsWith('const completedDelivery ='),
  );
  const comparisonScript = consoleScripts.find((script) =>
    script.startsWith('const expectedOperationId ='),
  );
  expect(captureScript).toBeDefined();
  expect(comparisonScript).toBeDefined();
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    ).draft;
    return [
      modelTool('save_draft', {
        version: current.version,
        contentVersion: current.contentVersion,
        operationId: 'lost-browser-reply',
      }),
    ];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const beforeSave = await (await page.request.get(path)).json();
    await consent(page);
    await page.evaluate(manualTextDeliverySource);
    await page.evaluate(() => {
      (window as unknown as { skyttelTextDelivery: { arm(): void } }).skyttelTextDelivery.arm();
    });
    let dropped = false;
    let committedReceipt: SaveReceipt | undefined;
    await page.route('**/text-assistant/*/messages', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(202);
      await expect
        .poll(async () =>
          (await (await page.request.get(`${path}/operations`)).json()).operations.some(
            (item: { status: string }) => item.status === 'succeeded',
          ),
        )
        .toBe(true);
      const operations = (await (await page.request.get(`${path}/operations`)).json())
        .operations as SaveOperation[];
      const committed = operations.find((operation) => operation.status === 'succeeded');
      if (committed?.status !== 'succeeded')
        throw new Error('Missing original committed receipt before delivery loss');
      committedReceipt = committed.receipt;
      dropped = true;
      await route.fulfill({ response });
    });
    await send(page, 'Spara hela utkastet nu.');
    await expect.poll(() => dropped).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { skyttelTextDelivery: { status(): { phase: string } } }
            ).skyttelTextDelivery.status().phase,
        ),
      )
      .toBe('dropped-after-commit');
    await expect(notice(page)).toContainText(
      'Det är oklart om utkastet sparades. Skyttel kontrollerar det.',
    );
    const actualOperationId = await page.evaluate(
      () =>
        (
          window as unknown as { skyttelTextDelivery: { status(): { operationId: string } } }
        ).skyttelTextDelivery.status().operationId,
    );
    const capturedId = page.waitForEvent('console', {
      predicate: (message) => message.type() === 'log' && message.text() === actualOperationId,
    });
    await page.evaluate(captureScript as string);
    expect((await capturedId).text()).toBe(actualOperationId);
    await app.restart();
    await page.unroute('**/text-assistant/*/messages');
    await page.reload();
    await openTable(page);
    await consent(page);
    const history = await showAttempts(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await expect(history).toContainText('Lo Exempel');
    await expect(
      history.getByText(`Sparande: ${actualOperationId}`, { exact: true }),
    ).toBeVisible();
    if (!committedReceipt) throw new Error('Missing captured original receipt');
    expect(committedReceipt.operationId).toBe(actualOperationId);
    await readCommittedHistoryCard(history, committedReceipt);
    const verifiedComparison = page.waitForEvent('console', {
      predicate: (message) =>
        message.type() === 'log' &&
        message.text() === 'Historiken visar det ursprungliga sparandets ID.',
    });
    await page.evaluate(
      (comparisonScript as string).replace('KOPIERAT-FAKTISKT-ID', actualOperationId),
    );
    expect((await verifiedComparison).text()).toBe(
      'Historiken visar det ursprungliga sparandets ID.',
    );
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Påhittad uppgift');
    await expect(history.locator('.history-changes')).toContainText('Person');
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
    expect(operations[0].operationId).toBe(actualOperationId);
    expect(operations[0].receipt).toEqual(committedReceipt);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      committedReceipt,
    ]);
    expect((await (await page.request.get(path)).json()).objects).toHaveLength(1);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    const recoveredDraft = await showDraft(page);
    await expect(recoveredDraft.getByText('Utkastet är tomt.', { exact: true })).toBeVisible();
    const afterRecovery = await (await page.request.get(path)).json();
    expect(afterRecovery.draft).toEqual({ version: beforeSave.draft.version + 1, changes: [] });
  } finally {
    await app.close();
  }
});

test('TEXT-05: markering kräver visning och skyddar oskickad text', async ({ page }) => {
  let step = 0;
  let releaseDisplay = () => {};
  const heldDisplay = new Promise<void>((resolve) => {
    releaseDisplay = resolve;
  });
  const model = textModel(async () => {
    if (step === 2) await heldDisplay;
    return step++ % 2 === 0
      ? [modelTool('show_map_object', { objectId: 'lo' })]
      : [modelMessage('Markerat!')];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await arrange(page, app);
    await consent(page);
    await send(page, 'Markera Lo i kartan.');
    const selected = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    const mapStatus = page.getByRole('region', { name: 'Kartans status', exact: true });
    await expect(mapStatus).toContainText('Markerat i kartan.');
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toContainText(
      'Påhittad uppgift',
    );
    await openConversationText(page);
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await send(page, 'Markera Lo igen.');
    await expect.poll(() => model.requests.length).toBe(3);
    await closeTextView(page);
    await editTableObject(page, 'Lo Exempel');
    await setProperty(page, 'Beskrivning', 'Osänd uppgift');
    releaseDisplay();
    await expect.poll(() => model.requests.length).toBe(4);
    expect(lastToolResult(model.requests[3])).toMatchObject({ displayed: false });
    await expect(propertyRow(page, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Osänd uppgift',
    );
    await verifyObjectDepartureAndDiscard(page, { Beskrivning: 'Osänd uppgift' });
    await openConversationText(page);
    await expect(transcript(page)).toContainText('Markerat!');
    await openMap(page);
    await expect(mapStatus).not.toContainText('Markerat i kartan.');
  } finally {
    releaseDisplay();
    await app.close();
  }
});

test('TEXT-06: obekräftad samtalstext skiljs från sparande och markering', async ({ page }) => {
  const replies = [
    'Klart. Ändringarna är nu lagrade i hushållets karta.',
    'Saved successfully.',
    'Lo är nu vald och visas i kartan.',
    'Har du sparat tidigare, och vem betalar?',
  ];
  let step = 0;
  const model = textModel(() =>
    step < replies.length
      ? [modelMessage(replies[step++])]
      : [
          modelTool('save_draft', {
            version: 1,
            contentVersion: 1,
            operationId: 'provider-choice',
          }),
        ],
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const before = await (await page.request.get(path)).json();
    await openMap(page);
    await consent(page);
    const object = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const selected = await object.getAttribute('aria-pressed');
    for (const reply of replies) {
      await send(page, 'Beskriv mitt utkast.');
      const conversation = assistant(page).getByRole('log', { name: 'Samtalstext', exact: true });
      await expect(conversation).toContainText(reply);
      // The reservation about errors stands in the consent text, not in the text view.
      await expect(
        assistant(page).getByRole('button', { name: 'Visa utkastet (1)', exact: true }),
      ).toBeVisible();
      await expect(object).toHaveAttribute('aria-pressed', selected ?? 'false');
      const current = await (await page.request.get(path)).json();
      expect(current.objects).toEqual(before.objects);
      expect(current.draft).toEqual(before.draft);
      expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
      const retained = await readDraftProposal(page, 'Lo Exempel');
      await expect(retained).toContainText('Lo Exempel');
      await expect(retained).toContainText('Person');
      await expect(retained).toContainText('Påhittad uppgift');
      await closeSupportDialog(page, 'Lo Exempel');
      await assistant(page)
        .getByRole('button', { name: /^Dölj utkastet/ })
        .click();
    }
    await send(page, 'Spara hela utkastet nu.');
    await expect(
      transcript(page)
        .getByRole('listitem')
        .filter({ hasText: /^Skyttel: Sparat\.$/ }),
    ).toHaveCount(1);
    const history = await showAttempts(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await expect(history).toContainText('Lo Exempel');
    expect((await (await page.request.get(path)).json()).objects).toMatchObject([{ id: 'lo' }]);
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Person');
    await expect(history.locator('.history-changes')).toContainText('Påhittad uppgift');
  } finally {
    await app.close();
  }
});

test('TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto', async ({ page }) => {
  let step = 0;
  const model = textModel(
    (body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      ).draft;
      const turn = step++;
      return [
        turn === 1
          ? modelTool('save_draft', {
              version: current.version,
              contentVersion: current.contentVersion,
              operationId: 'details-save',
            })
          : modelTool('report_result', { source: turn === 0 ? 'draft' : 'latest_save' }),
      ];
    },
    (body) => {
      const input = JSON.parse(String(body.input[0].content));
      return [
        modelMessage(
          JSON.stringify(
            body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
              ? {
                  mode: input.current === 'Spara hela utkastet nu.' ? 'work' : 'read',
                  request: input.current,
                  responseRequired: false,
                }
              : { decision: 'allow', complete: true, fulfillsRequest: true },
          ),
        ),
      ];
    },
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const read = async () => (await page.request.get(path)).json();
    const post = async (route: string, data: object) => {
      const state = await read();
      const response = await page.request.post(`${path}/${route}`, {
        headers: { origin: app.origin },
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...data },
      });
      expect(response.status(), await response.text()).toBe(200);
    };
    const state = await read();
    const usageType = state.relationshipTypes.find(
      (type: { name: string }) => type.name === 'Använder',
    );
    const paymentType = state.relationshipTypes.find(
      (type: { name: string }) => type.name === 'Betalar',
    );
    const service = {
      typeId: state.types.find((type: { name: string }) => type.name === 'Tjänst').id,
      name: 'Tonrum',
    };
    const relationship = { sourceId: 'lo', targetId: 'tonrum' };
    await post('draft', {
      id: 'tonrum',
      baseRevision: null,
      value: { ...service, lifecycle: 'active' },
    });
    await post('relationship', {
      id: 'lo-tonrum',
      baseRevision: null,
      value: { ...relationship, typeId: usageType.id, verb: 'Använder' },
    });
    await post('save', { operationId: 'details-baseline' });
    await page.reload();
    const relationshipForm = await editObjectRelationship(
      page,
      'Lo Exempel',
      'Lo Exempel → Använder → Tonrum',
    );
    await relationshipForm
      .getByLabel('Sambandstyp', { exact: true })
      .selectOption({ label: 'Betalar' });
    await relationshipForm.getByLabel('Verb', { exact: true }).fill('Betalar');
    await stageRelationshipAndClose(page);
    const objectForm = await editTableObject(page, 'Tonrum');
    await objectForm.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await objectForm.getByLabel('Objektets status', { exact: true }).selectOption('ended');
    await objectForm
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    const nativeProposal = await showDraft(page);
    await expect(nativeProposal).toContainText('Gäller: Aktuellt → Upphört');
    await expect(nativeProposal).toContainText('Använder → Betalar');
    const nativeState = await read();
    expect(nativeState.draft.changes).toMatchObject([
      { id: 'tonrum', after: { ...service, lifecycle: 'ended' } },
    ]);
    expect(nativeState.draft.relationships).toMatchObject([
      {
        id: 'lo-tonrum',
        before: { ...relationship, typeId: usageType.id, verb: 'Använder' },
        after: { ...relationship, typeId: paymentType.id, verb: 'Betalar' },
      },
    ]);
    await post('draft', {
      id: 'tonrum',
      baseRevision: 1,
      value: { ...service, lifecycle: 'ended' },
    });
    await post('relationship', {
      id: 'lo-tonrum',
      baseRevision: 1,
      value: { ...relationship, typeId: paymentType.id, verb: 'Betalar' },
    });
    await page.reload();
    await openTable(page);
    await consent(page);
    await openTable(page);
    const listPanel = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const report = transcript(page);
    const beforeReview = await read();

    await send(page, 'Läs upp hela utkastet.');
    await expect(report).toContainText('Utkast:');
    await expect(report).toContainText('Tonrum (Gäller: aktuellt → upphört)');
    await expect(report).toContainText('Lo Exempel Använder Tonrum → Lo Exempel Betalar Tonrum');
    await expect(listPanel).toBeVisible();
    expect(await read()).toEqual(beforeReview);

    await send(page, 'Spara hela utkastet nu.');
    await expect(
      transcript(page)
        .getByRole('listitem')
        .filter({ hasText: /^Skyttel: Sparat\.$/ }),
    ).toHaveCount(1);
    const saved = await read();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    expect(saved.objects.find((object: { id: string }) => object.id === 'tonrum').lifecycle).toBe(
      'ended',
    );
    expect(saved.relationships).toMatchObject([{ typeId: paymentType.id, verb: 'Betalar' }]);
    await openTable(page);
    await page
      .getByRole('region', { name: 'Hushållets tabell', exact: true })
      .getByRole('button', { name: 'Filter', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Tabellens filter', exact: true })
      .getByLabel('Ta med upphörda', { exact: true })
      .check();
    await page.keyboard.press('Escape');
    const savedTonrum = await readTableObject(page, 'Tonrum');
    await expect(savedTonrum).toContainText('Manuellt upphört');
    await expect(savedTonrum).toContainText('Tjänst');
    const operations = await (await page.request.get(`${path}/operations`)).json();

    await send(page, 'Vad sparades senast?');
    await expect(report).toContainText('Sparandet:');
    await expect(report).toContainText('Tonrum (Gäller: aktuellt → upphört)');
    await expect(report).toContainText('Lo Exempel Använder Tonrum → Lo Exempel Betalar Tonrum');
    await expect(listPanel).toBeVisible();
    expect(await read()).toEqual(saved);
    expect(await (await page.request.get(`${path}/operations`)).json()).toEqual(operations);
    expect(model.requests).toHaveLength(3);
  } finally {
    await app.close();
  }
});
