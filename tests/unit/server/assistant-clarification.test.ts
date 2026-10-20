import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test('controlled clarification preserves the request, independent work and property identities until correction and fresh whole-save intent', {
  tags: ['technical'],
}, async () => {
  const questions = [
    'Ska Kod 0012 vara text eller tal?',
    'Vilken Notering ska tömmas: Hem eller Arbete?',
    'Vilken Alex använder tjänsten: personen i Lund eller personen i Umeå? Vilket objekt ska betalningen komma från?',
  ];
  let turn = 0;
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    const change = input.draft.changes.find((item: { id: string }) => item.id === 'lo');
    const value = change.after;
    const properties = value.properties;
    if (turn++ === 0) {
      expect(body.instructions).toContain('Hitta inte på datatyp');
      expect(body.instructions).toContain('Skapa ingen ersättningsegenskap');
      return [
        modelTool('submit_changes', {
          version: input.draft.version,
          contentVersion: input.draft.contentVersion,
          completion: 'draft',
          questions,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: {
                  ...value,
                  properties: [
                    ...properties,
                    { label: 'Telefon', kind: 'text', value: '0700123456' },
                  ],
                },
              },
            },
          ],
        }),
      ];
    }
    if (turn === 2) {
      // The actual provider conversation retains both the original request and
      // the focused questions; the fixture supplies the interpretation itself.
      expect(JSON.stringify(body.input)).toContain('Kod 0012');
      expect(JSON.stringify(body.input)).toContain('personen i Umeå');
      return [
        modelTool('submit_changes', {
          version: input.draft.version,
          contentVersion: input.draft.contentVersion,
          completion: 'draft',
          questions: [],
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: {
                  ...value,
                  properties: [
                    { ...properties[0], value: undefined },
                    properties[1],
                    properties[2],
                    { label: 'Kod', kind: 'text', value: '0012' },
                  ],
                },
              },
            },
            {
              name: 'propose_relationship',
              arguments: {
                id: 'uses',
                baseRevision: null,
                value: {
                  typeId: input.draft.relationshipTypes.find(
                    (change: { id: string }) => change.id === 'type-uses',
                  ).after.id,
                  sourceId: 'alex-umea',
                  targetId: 'service',
                },
              },
            },
            {
              name: 'propose_relationship',
              arguments: {
                id: 'pays',
                baseRevision: null,
                value: {
                  typeId: input.draft.relationshipTypes.find(
                    (change: { id: string }) => change.id === 'type-pays',
                  ).after.id,
                  sourceId: 'account',
                  targetId: 'service',
                },
              },
            },
          ],
        }),
      ];
    }
    return [
      modelTool('save_draft', {
        version: input.draft.version,
        contentVersion: input.draft.contentVersion,
        operationId: 'clarified-whole-draft',
      }),
    ];
  });
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}`;
  const mapPath = `${base}/map`;
  const read = async () => (await browser.get(mapPath)).json();
  const propose = async (route: string, id: string, value: unknown) => {
    const state = await read();
    const response = await browser.post(`${mapPath}/${route}`, {
      headers: { origin: app.origin },
      data: {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id,
        baseRevision: null,
        value,
      },
    });
    expect(response.status(), await response.text()).toBe(200);
  };
  const initial = await read();
  for (const [id, name, properties] of [
    [
      'lo',
      'Lo',
      [
        { id: 'home', label: 'Notering', kind: 'text', value: 'Hem' },
        { id: 'work', label: 'Notering', kind: 'text', value: 'Arbete' },
      ],
    ],
    ['alex-lund', 'Alex', [{ id: 'city', label: 'Ort', kind: 'text', value: 'Lund' }]],
    ['alex-umea', 'Alex', [{ id: 'city', label: 'Ort', kind: 'text', value: 'Umeå' }]],
    ['service', 'Molnmusik', []],
    ['account', 'Betalkonto', []],
  ])
    await propose('draft', id as string, {
      typeId: initial.types[0].id,
      name,

      properties,
    });
  for (const [id, name] of [
    ['uses', 'Använder'],
    ['pays', 'Betalar'],
  ]) {
    await propose('relationship-type', `type-${id}`, {
      name,
      description: '',
      forwardLabel: name,
      reverseLabel: 'Hör till',
    });
  }
  let session: TextAssistantView = await (
    await browser.post(`${base}/text-assistant`, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const message = async (text: string) => {
    const response = await browser.post(`${base}/text-assistant/${session.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId: crypto.randomUUID(),
        revision: session.revision,
        draftVersion: session.review.version,
        contentVersion: session.review.contentVersion,
        text,
      },
    });
    expect(response.status(), await response.text()).toBe(202);
    await expect
      .poll(async () => {
        session = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
        return session.phase;
      })
      .not.toBe('working');
    expect(session.error).toBeUndefined();
  };
  await message(
    'Lägg till telefon 0700123456 på Lo. Lägg till Kod 0012. Töm Notering. Alex använder Molnmusik och betalningen kommer från ett konto. Spara hela utkastet.',
  );
  expect(session.questions).toEqual(questions);
  expect(session.questionPending).toBe(true);
  let state = await read();
  expect(state.objects).toEqual([]);
  expect(state.draft.relationships ?? []).toEqual([]);
  expect(state.draft.changes).toHaveLength(5);
  expect(
    state.draft.changes.find((change: { id: string }) => change.id === 'lo').after.properties,
  ).toMatchObject([
    { id: 'home', value: 'Hem' },
    { id: 'work', value: 'Arbete' },
    { label: 'Telefon', kind: 'text', value: '0700123456' },
  ]);
  expect(session.operations).toEqual([]);
  await message('Kod ska vara text. Töm Hem. Det är Alex i Umeå. Använd Betalkonto. Spara inte.');
  expect(session.questionPending).not.toBe(true);
  state = await read();
  const corrected = state.draft.changes.find((change: { id: string }) => change.id === 'lo').after
    .properties;
  expect(corrected[0]).toEqual({ id: 'home', label: 'Notering', kind: 'text' });
  expect(corrected[1]).toEqual({ id: 'work', label: 'Notering', kind: 'text', value: 'Arbete' });
  expect(corrected[3]).toMatchObject({ label: 'Kod', kind: 'text', value: '0012' });
  expect(state.objects).toEqual([]);
  expect(state.draft.relationships).toMatchObject([
    { after: { sourceId: 'alex-umea', targetId: 'service' } },
    { after: { sourceId: 'account', targetId: 'service' } },
  ]);
  await message('Spara hela utkastet nu.');
  expect(session.receipt).toMatchObject({
    changes: expect.any(Array),
    relationships: expect.any(Array),
  });
  expect(session.receipt?.changes).toHaveLength(5);
  expect(session.receipt?.relationships).toHaveLength(2);
  const history = await (await browser.get(`${mapPath}/history`)).json();
  expect(history.history.map((receipt: { operationId: string }) => receipt.operationId)).toEqual([
    session.receipt?.operationId,
  ]);
  state = await read();
  expect(state.draft.changes).toEqual([]);
  expect(state.objects.find((object: { id: string }) => object.id === 'lo').properties).toEqual(
    corrected,
  );
  expect(state.relationships).toHaveLength(2);
});
