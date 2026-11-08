import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pendingUpdate,
  readOnlyScope,
  textModel,
} from '../../support/text-model.js';

test('a new clarification cannot skip a second independent requested change', async () => {
  const instruction = 'Lägg till Mira, Nils och en kollega som personer utan att spara.';
  const question = 'Vad heter kollegan?';
  let personType = '';
  let releaseSecondBatch = () => {};
  const secondBatchReady = new Promise<void>((resolve) => {
    releaseSecondBatch = resolve;
  });
  const model = textModel(
    async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      expect(input.message).toBe(instruction);
      const step = model.requests.length;
      const result = lastToolResult(body);
      if (step > 1) {
        expect(result?.pendingParts).toEqual([
          expect.objectContaining({ question, status: 'waiting' }),
        ]);
        expect(JSON.stringify(body.input)).toContain(instruction);
      }
      if (step === 3) return [modelTool('ask_questions', { questions: [question] })];
      if (step === 2) await secondBatchReady;
      if (step > 3) throw new Error('Unexpected independent-work round');
      const draft = result?.review ?? input.draft;
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'draft',
          questions:
            step === 1
              ? [
                  {
                    kind: 'change',
                    request: 'Lägg till en kollega som person.',
                    question,
                    dependsOnDraft: false,
                  },
                ]
              : [],
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: step === 1 ? 'partial-mira' : 'partial-nils',
                baseRevision: null,
                value: { typeId: personType, name: step === 1 ? 'Mira' : 'Nils' },
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
            ? { mode: 'work', request: instruction, responseRequired: false }
            : { decision: 'allow', complete: true, fulfillsRequest: false },
        ),
      ),
    ],
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  const browser = await request.newContext();
  try {
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    const before = await (await browser.get(mapPath)).json();
    personType = before.types.find((type: { name: string }) => type.name === 'Person').id;
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const started: TextAssistantView = await (
      await browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
    ).json();
    expect(
      (
        await browser.post(`${path}/${started.id}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: crypto.randomUUID(),
            revision: started.revision,
            draftVersion: started.review.version,
            contentVersion: started.review.contentVersion,
            text: instruction,
          },
        })
      ).status(),
    ).toBe(202);
    let partial!: TextAssistantView;
    await expect
      .poll(async () => {
        partial = await (await browser.get(`${path}/${started.id}`)).json();
        return partial.questions;
      })
      .toEqual([question]);
    expect(partial.review.changes).toMatchObject([{ id: 'partial-mira', after: { name: 'Mira' } }]);
    expect(partial.pendingParts).toHaveLength(1);
    expect(partial.pendingParts?.[0]).toMatchObject({ question, status: 'waiting' });
    expect(partial.error).toBeUndefined();
    expect(partial.receipt).toBeUndefined();
    await expect.poll(() => model.requests.length).toBe(2);
    expect((await (await browser.get(`${path}/${started.id}`)).json()).phase).toBe('working');
    releaseSecondBatch();
    let finished!: TextAssistantView;
    await expect
      .poll(async () => {
        finished = await (await browser.get(`${path}/${started.id}`)).json();
        return finished.phase;
      })
      .toBe('ready');
    expect(finished.error).toBeUndefined();
    expect(finished.questions).toEqual([question]);
    expect(finished.questionPending).toBe(true);
    expect(finished.pendingParts).toEqual(partial.pendingParts);
    expect(finished.review.version).toBe(started.review.version + 2);
    expect(finished.review.changes).toMatchObject([
      { id: 'partial-mira', after: { name: 'Mira' } },
      { id: 'partial-nils', after: { name: 'Nils' } },
    ]);
    expect(finished.modelReply).toContain(question);
    expect(finished.receipt).toBeUndefined();
    expect(finished.operations).toEqual([]);
    expect(model.requests).toHaveLength(3);
    expect(
      model.authorizationRequests.filter(
        (body) => !body.instructions.startsWith('SKYTTEL_TURN_SCOPE'),
      ),
    ).toHaveLength(2);
    expect((await (await browser.get(mapPath)).json()).objects).toEqual(before.objects);
    expect((await (await browser.get(`${mapPath}/history`)).json()).history).toEqual([]);
    expect((await (await browser.get(`${mapPath}/operations`)).json()).operations).toEqual([]);
  } finally {
    releaseSecondBatch();
    await browser.dispose();
    await app.close();
  }
});

for (const { situation, olderWaiting, readyPart, partialBatch } of [
  {
    situation: 'before requested changes',
    olderWaiting: false,
    readyPart: false,
    partialBatch: false,
  },
  { situation: 'after a partial batch', olderWaiting: false, readyPart: false, partialBatch: true },
  {
    situation: 'after a partial batch beside an older waiting question',
    olderWaiting: true,
    readyPart: false,
    partialBatch: true,
  },
  {
    situation: 'with a ready pending change',
    olderWaiting: false,
    readyPart: true,
    partialBatch: true,
  },
])
  test(`a report ${situation} keeps unfinished work active`, async () => {
    const question = 'Vad heter kollegan?';
    let personType = '';
    let workStep = 0;
    let releaseWork = () => {};
    const workReady = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });
    const model = textModel(
      async (body) => {
        const input = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        if (input.message === 'Beskriv vilket år lampan köptes.')
          return [
            modelTool('ask_questions', {
              questions: [
                {
                  kind: 'information',
                  request: input.message,
                  question: 'Vilken lampa menar du?',
                  dependsOnDraft: false,
                },
              ],
            }),
          ];
        if (input.message === 'Beskriv hela utkastet.')
          return [modelTool('report_result', { source: 'draft' })];
        const step = workStep++ - (readyPart ? 2 : 0);
        if (step === -2)
          return [
            modelTool('ask_questions', {
              questions: [
                {
                  kind: 'change',
                  request: 'Lägg till kollegan som person.',
                  question,
                  dependsOnDraft: false,
                },
              ],
            }),
          ];
        if (step === -1)
          return [
            modelTool('ask_questions', {
              questions: [],
              updates: [pendingUpdate(body, question)],
              continueResponse: false,
            }),
          ];
        if (step === (partialBatch ? 1 : 0))
          return [modelTool('report_result', { source: 'draft' })];
        const remaining = step === (partialBatch ? 2 : 1);
        if (remaining) await workReady;
        const { draft } = input;
        return [
          modelTool('submit_changes', {
            version: draft.version,
            contentVersion: draft.contentVersion,
            completion: 'draft',
            resolves:
              readyPart && remaining
                ? input.pendingParts
                    .filter((part: { status: string }) => part.status === 'ready')
                    .map(({ id, revision }: { id: string; revision: number }) => ({ id, revision }))
                : [],
            operations: (remaining && !partialBatch
              ? ['Kim', 'Lo']
              : [remaining ? 'Lo' : 'Kim']
            ).map((name) => ({
              name: 'propose_object',
              arguments: {
                id: name.toLowerCase(),
                baseRevision: null,
                value: { typeId: personType, name },
              },
            })),
          }),
        ];
      },
      (body) => {
        const input = JSON.parse(String(body.input[0].content));
        if (
          body.instructions.startsWith('SKYTTEL_TURN_SCOPE') &&
          input.current === 'Beskriv hela utkastet.'
        )
          return readOnlyScope();
        return [
          modelMessage(
            JSON.stringify(
              body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
                ? {
                    mode: 'work',
                    request: input.current,
                    responseRequired: false,
                  }
                : {
                    decision: 'allow',
                    complete: true,
                    fulfillsRequest:
                      readyPart ||
                      input.untrusted.operations.some(
                        (operation: { arguments: { id?: string } }) =>
                          operation.arguments.id === 'lo',
                      ),
                  },
            ),
          ),
        ];
      },
    );
    const app = await createInstallation(undefined, { modelFetch: model.provider });
    const browser = await request.newContext();
    try {
      await signIn(browser, app.origin);
      const { household } = await (await createHousehold(browser, app.origin)).json();
      const mapPath = `${app.origin}/api/households/${household.id}/map`;
      const before = await (await browser.get(mapPath)).json();
      personType = before.types.find((type: { name: string }) => type.name === 'Person').id;
      const path = `${app.origin}/api/households/${household.id}/text-assistant`;
      const started: TextAssistantView = await (
        await browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
      ).json();
      async function send(view: TextAssistantView, text: string) {
        expect(
          (
            await browser.post(`${path}/${started.id}/messages`, {
              headers: { origin: app.origin },
              data: {
                requestId: crypto.randomUUID(),
                revision: view.revision,
                draftVersion: view.review.version,
                contentVersion: view.review.contentVersion,
                text,
              },
            })
          ).status(),
        ).toBe(202);
      }
      let starting = started;
      if (olderWaiting) {
        await send(started, 'Beskriv vilket år lampan köptes.');
        await expect
          .poll(async () => {
            starting = await (await browser.get(`${path}/${started.id}`)).json();
            return starting.phase;
          })
          .toBe('ready');
        expect(starting.pendingParts).toContainEqual(
          expect.objectContaining({ status: 'waiting', question: 'Vilken lampa menar du?' }),
        );
      }
      await send(
        starting,
        readyPart
          ? 'Lägg till Kim och en kollega som personer utan att spara.'
          : 'Lägg till Kim och Lo som personer utan att spara.',
      );
      if (readyPart) {
        let waiting!: TextAssistantView;
        await expect
          .poll(async () => {
            waiting = await (await browser.get(`${path}/${started.id}`)).json();
            return waiting.questionPending;
          })
          .toBe(true);
        await send(waiting, 'Kollegan heter Lo. Lägg till Kim också utan att spara.');
        let clarified!: TextAssistantView;
        await expect
          .poll(async () => {
            clarified = await (await browser.get(`${path}/${started.id}`)).json();
            return clarified.phase;
          })
          .toBe('ready');
        expect(clarified.pendingParts).toContainEqual(
          expect.objectContaining({ status: 'ready', question }),
        );
        const workBeforeRead = model.requests.length;
        await send(clarified, 'Beskriv hela utkastet.');
        let information!: TextAssistantView;
        await expect
          .poll(async () => {
            information = await (await browser.get(`${path}/${started.id}`)).json();
            return information.phase;
          })
          .toBe('ready');
        expect(information.error).toBeUndefined();
        expect(information.pendingParts).toEqual(clarified.pendingParts);
        expect(model.requests).toHaveLength(workBeforeRead + 1);
        expect(await (await browser.get(mapPath)).json()).toEqual(before);
        await send(information, 'Fortsätt med Kim och kollegan Lo utan att spara.');
      }
      const preceding = (olderWaiting ? 1 : 0) + (readyPart ? 3 : 0) + (partialBatch ? 2 : 1);
      await expect.poll(() => model.requests.length).toBeGreaterThanOrEqual(preceding);
      const reported: TextAssistantView = await (await browser.get(`${path}/${started.id}`)).json();
      expect(reported.error).toBeUndefined();
      expect(reported.receipt).toBeUndefined();
      if (readyPart)
        expect(reported.pendingParts).toContainEqual(
          expect.objectContaining({ status: 'ready', question }),
        );
      const during = await (await browser.get(mapPath)).json();
      expect(during.objects).toEqual(before.objects);
      expect(
        during.draft.changes.map((change: { after: { name: string } }) => change.after.name),
      ).toEqual(partialBatch ? ['Kim'] : []);
      await expect.poll(() => model.requests.length).toBe(preceding + 1);
      const active: TextAssistantView = await (await browser.get(`${path}/${started.id}`)).json();
      expect(active.phase).toBe('working');
      if (readyPart)
        expect(active.pendingParts).toContainEqual(
          expect.objectContaining({ status: 'ready', question }),
        );
      releaseWork();
      let finished!: TextAssistantView;
      await expect
        .poll(async () => {
          finished = await (await browser.get(`${path}/${started.id}`)).json();
          return finished.phase;
        })
        .toBe('ready');
      expect(finished.error).toBeUndefined();
      if (olderWaiting)
        expect(finished.pendingParts).toContainEqual(
          expect.objectContaining({ status: 'waiting', question: 'Vilken lampa menar du?' }),
        );
      expect(finished.review.changes.map((change) => change.after?.name).sort()).toEqual([
        'Kim',
        'Lo',
      ]);
      expect(finished.receipt).toBeUndefined();
      if (readyPart)
        expect(finished.pendingParts).toContainEqual(
          expect.objectContaining({ status: 'completed', question }),
        );
      expect((await (await browser.get(`${mapPath}/operations`)).json()).operations).toEqual([]);
      expect((await (await browser.get(`${mapPath}/history`)).json()).history).toEqual([]);
      expect((await (await browser.get(mapPath)).json()).objects).toEqual(before.objects);
    } finally {
      releaseWork();
      await browser.dispose();
      await app.close();
    }
  });

const missingScope = {
  title: 'missing scope',
  missingScope: true,
  missingResult: false,
  responseRequired: false,
  readAfterSave: false,
};
const missingResult = {
  title: 'missing result',
  missingScope: false,
  missingResult: true,
  responseRequired: false,
  readAfterSave: false,
};
const contradictoryResponse = {
  title: 'contradictory response',
  missingScope: false,
  missingResult: false,
  responseRequired: true,
  readAfterSave: false,
};
const followingCatalogRead = {
  title: 'following catalog read',
  missingScope: false,
  missingResult: false,
  responseRequired: true,
  readAfterSave: true,
};
const ordinaryCertificates = [missingScope, missingResult, contradictoryResponse];

for (const boundary of [
  { title: 'direct draft', mode: 'direct', saving: false, certificates: ordinaryCertificates },
  { title: 'combined draft', mode: 'combined', saving: false, certificates: ordinaryCertificates },
  {
    title: 'direct save',
    mode: 'save',
    saving: true,
    certificates: [...ordinaryCertificates, followingCatalogRead],
  },
  { title: 'combined save', mode: 'combined', saving: true, certificates: ordinaryCertificates },
  { title: 'automatic save', mode: 'direct', saving: true, certificates: ordinaryCertificates },
  {
    title: 'report',
    mode: 'report',
    saving: false,
    certificates: [missingScope, contradictoryResponse],
  },
])
  for (const certificate of boundary.certificates)
    test(`${boundary.title} continues requested explanation with ${certificate.title} certification`, async () => {
      const explanation = 'Person är en objekttyp. Förslagen hör till ditt utkast före sparande.';
      const { saving } = boundary;
      const { readAfterSave } = certificate;
      const holdResponse =
        boundary.mode === 'save' && certificate.responseRequired && !readAfterSave;
      let releaseResponse = () => {};
      const responseReady = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      const model = textModel(
        async (body) => {
          const result = lastToolResult(body);
          const previousCall = body.input.findLast((item) => item.type === 'function_call');
          if (result && previousCall?.name !== 'read_my_draft') {
            if (holdResponse) await responseReady;
            return [modelMessage(explanation)];
          }
          const { draft: initialDraft } = JSON.parse(
            String(body.input.findLast((item) => item.role === 'user')?.content),
          );
          if (boundary.mode === 'report') return [modelTool('report_result', { source: 'draft' })];
          if (boundary.mode === 'save')
            return [
              modelTool('save_draft', {
                version: initialDraft.version,
                contentVersion: initialDraft.contentVersion,
                operationId: 'controlled-save',
              }),
              ...(readAfterSave ? [modelTool('read_type_catalog', {})] : []),
            ];
          if (!result) return [modelTool('read_my_draft', {})];
          const draft = result;
          const proposal = {
            name: 'propose_object',
            arguments: {
              id: 'kim',
              baseRevision: null,
              value: {
                typeId: draft.changes.find((change: { id: string }) => change.id === 'lo').after
                  .typeId,
                name: 'Kim',
              },
            },
          };
          return [
            boundary.mode === 'combined'
              ? modelTool('submit_changes', {
                  version: draft.version,
                  contentVersion: draft.contentVersion,
                  completion: saving ? 'save' : 'draft',
                  operations: [proposal],
                })
              : modelTool(proposal.name, {
                  version: draft.version,
                  contentVersion: draft.contentVersion,
                  ...proposal.arguments,
                }),
          ];
        },
        (body) => [
          modelMessage(
            JSON.stringify(
              body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
                ? {
                    mode: boundary.mode === 'report' ? 'read' : 'work',
                    request: JSON.parse(String(body.input[0].content)).current,
                    ...(certificate.missingScope
                      ? {}
                      : {
                          responseRequired: certificate.responseRequired,
                        }),
                  }
                : {
                    decision: 'allow',
                    complete: true,
                    ...(certificate.missingResult ? {} : { fulfillsRequest: true }),
                  },
            ),
          ),
        ],
      );
      const app = await createInstallation(undefined, { modelFetch: model.provider });
      const browser = await request.newContext();
      try {
        await signIn(browser, app.origin);
        const { household } = await (await createHousehold(browser, app.origin)).json();
        const mapPath = `${app.origin}/api/households/${household.id}/map`;
        const before = await (await browser.get(mapPath)).json();
        expect(
          (
            await browser.post(`${mapPath}/draft`, {
              headers: { origin: app.origin },
              data: {
                version: 0,
                contentVersion: 1,
                id: 'lo',
                baseRevision: null,
                value: { typeId: before.types[0].id, name: 'Lo Exempel' },
              },
            })
          ).status(),
        ).toBe(200);
        const path = `${app.origin}/api/households/${household.id}/text-assistant`;
        const started: TextAssistantView = await (
          await browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
        ).json();
        expect(
          (
            await browser.post(`${path}/${started.id}/messages`, {
              headers: { origin: app.origin },
              data: {
                requestId: crypto.randomUUID(),
                revision: started.revision,
                draftVersion: started.review.version,
                contentVersion: started.review.contentVersion,
                text:
                  boundary.mode === 'report'
                    ? 'Beskriv utkastet och förklara vad objekttypen Person betyder.'
                    : boundary.mode === 'save'
                      ? 'Beskriv skillnaden mellan objekttypen Person och ett objekt. Spara hela utkastet.'
                      : saving
                        ? 'Lägg till Kim som person. Beskriv skillnaden mellan objekttypen Person och ett objekt. Spara hela utkastet.'
                        : 'Lägg till Kim och förklara vad objekttypen Person betyder. Spara inte.',
              },
            })
          ).status(),
        ).toBe(202);
        if (holdResponse) {
          let saved!: TextAssistantView;
          await expect
            .poll(async () => {
              saved = await (await browser.get(`${path}/${started.id}`)).json();
              return saved.receipt?.operationId;
            })
            .toBeTruthy();
          expect(saved.phase).toBe('working');
          expect(saved.modelReply).toBeUndefined();
          releaseResponse();
        }
        let finished!: TextAssistantView;
        await expect
          .poll(async () => {
            finished = await (await browser.get(`${path}/${started.id}`)).json();
            return finished.phase;
          })
          .not.toBe('working');
        expect(finished.error).toBeUndefined();
        expect(finished.modelReply).toBe(explanation);
        const setupReads = boundary.mode === 'report' || boundary.mode === 'save' ? 0 : 1;
        expect(model.requests).toHaveLength(setupReads + 2);
        if (saving) {
          expect(finished.receipt?.operationId).toBeTruthy();
          expect(finished.review.changes).toEqual([]);
          if (readAfterSave) {
            const followUp = model.requests[setupReads + 1];
            const calls = followUp.input.filter((item) => item.type === 'function_call');
            const outputs = followUp.input.filter((item) => item.type === 'function_call_output');
            expect(calls.map((call) => call.name)).toEqual(['save_draft', 'read_type_catalog']);
            expect(outputs.map((output) => output.call_id)).toEqual(
              calls.map((call) => call.call_id),
            );
            const catalog = JSON.parse(String(outputs.at(-1)?.output));
            expect(catalog.types).toContainEqual(expect.objectContaining({ name: 'Person' }));
          }
          expect((await (await browser.get(mapPath)).json()).objects).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'Lo Exempel' })]),
          );
        } else {
          expect(finished.receipt).toBeUndefined();
          expect(finished.review.changes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                after: expect.objectContaining({
                  name: boundary.mode === 'report' ? 'Lo Exempel' : 'Kim',
                }),
              }),
            ]),
          );
        }
      } finally {
        releaseResponse();
        await browser.dispose();
        await app.close();
      }
    });
