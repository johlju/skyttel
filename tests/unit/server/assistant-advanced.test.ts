import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type APIRequestContext, request } from '@playwright/test';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let householdId: string;
let token: string;
let path: string;
beforeEach(async () => {
  app = await createInstallation();
  browser = await request.newContext();
  await signIn(browser, app.origin);
  ({
    household: { id: householdId },
  } = await (await createHousehold(browser, app.origin)).json());
  path = `${app.origin}/api/households/${householdId}/map`;
  const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
  const consent = await flow.consent(householdId);
  expect(consent.status()).toBe(200);
  const response = await flow.exchange((await consent.json()).url);
  expect(response.status).toBe(200);
  token = (await response.json()).access_token;
});
afterEach(async () => {
  await browser.dispose();
  await app.close();
});

async function tool(name: string, args = {}, expectedError?: string) {
  const response = await callAssistant(app.origin, token, name, args);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  const value = JSON.parse(body.result.content[0].text);
  if (expectedError) {
    expect(body.result.isError).toBe(true);
    expect(value.error).toBe(expectedError);
  } else expect(body.result.isError, JSON.stringify(body.result)).not.toBe(true);
  return value;
}
function version(review: { version: number; contentVersion: number }) {
  return { version: review.version, contentVersion: review.contentVersion };
}

async function object(id: string, updates: Record<string, unknown>) {
  const state = await (await browser.get(path)).json();
  const saved = state.objects.find((item: { id: string }) => item.id === id);
  const { id: _id, householdId: _household, revision: _revision, ...value } = saved ?? {};
  return tool('propose_object', {
    ...version({ ...state.draft, contentVersion: state.contentVersion }),
    id,
    baseRevision: saved?.revision ?? null,
    value: { typeId: state.types[0].id, name: id, description: '', ...value, ...updates },
  });
}

async function save(operationId: string) {
  const review = await tool('read_my_draft');
  return (await tool('save_draft', { ...version(review), operationId })).receipt;
}

async function definition(id: string, value: unknown, expectedError?: string) {
  const state = await (await browser.get(path)).json();
  return tool(
    'propose_object_type',
    {
      ...version({ ...state.draft, contentVersion: state.contentVersion }),
      id,
      baseRevision: state.types.find((type: { id: string }) => type.id === id)?.revision ?? null,
      value,
    },
    expectedError,
  );
}

async function member() {
  const other = await request.newContext();
  app.setIdentity(robin);
  await signIn(other, app.origin);
  const { user } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
  const invitation = await browser.post(`${path.replace('/map', '')}/invitations`, {
    headers: { origin: app.origin },
    data: { userId: user.id },
  });
  const accepted = await other.post(`${app.origin}/api/invitations/accept`, {
    headers: { origin: app.origin },
    data: { code: (await invitation.json()).code },
  });
  expect(accepted.status()).toBe(200);
  return other;
}

test('advanced tools use actual SDK contracts, preserve old read grants and current revocation, and reject stale or incomplete review choices', async () => {
  const client = new Client({ name: 'Avancerad provklient', version: '1' });
  const readClient = new Client({ name: 'Äldre läsande klient', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const catalog = (await client.listTools()).tools;
    const newMutations = [
      'propose_object_type',
      'propose_relationship_type',
      'propose_undo',
      'propose_merge',
    ];
    for (const name of newMutations) {
      const tool = catalog.find((item) => item.name === name);
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.inputSchema.required).toEqual(
        expect.arrayContaining(['version', 'contentVersion']),
      );
    }
    expect(catalog.map(({ name }) => name).join(' ')).not.toMatch(
      /export|import|erase|member|admin/,
    );
    const flow = await beginAssistant(browser, app.origin, 'skyttel:read');
    const accepted = await flow.consent(householdId);
    const readToken = (await (await flow.exchange((await accepted.json()).url)).json())
      .access_token;
    await readClient.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${readToken}` } },
      }),
    );
    expect((await readClient.listTools()).tools.map(({ name }) => name)).toEqual([
      'read_map',
      'read_my_draft',
    ]);
    expect(
      (
        await readClient.callTool({
          name: 'propose_object_type',
          arguments: {
            version: 0,
            contentVersion: 1,
            id: 'forbidden',
            baseRevision: null,
            value: { name: 'Ej tillåten', description: '', fields: [] },
          },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: 'propose_relationship_type',
          arguments: {
            version: 0,
            contentVersion: 1,
            id: 'fields',
            baseRevision: null,
            value: {
              name: 'Fel',
              description: '',
              forwardLabel: 'framåt',
              reverseLabel: 'bakåt',
              fields: [],
            },
          },
        })
      ).isError,
    ).toBe(true);
    await tool('read_history', { operationId: 'missing-owner' }, 'invalid_request');
    await tool('read_history', { userId: 'missing-operation' }, 'invalid_request');
    await tool(
      'read_history',
      { operationId: 'missing', userId: 'missing', objectId: 'extra' },
      'invalid_request',
    );
    await tool('read_history', { operationId: 'missing', userId: 'missing' }, 'undo_unavailable');
    expect((await tool('read_history', { offset: 20 })).history).toEqual([]);
    await tool(
      'read_merge_review',
      { survivorId: 'missing', absorbedId: 'other' },
      'object_conflict',
    );
    await object('a', { name: 'Lo', identity: 'unspecified' });
    await object('b', { name: 'Lo' });
    await save('merge-review-fixture');
    const merge = await tool('read_merge_review', { survivorId: 'a', absorbedId: 'b' });
    expect(merge.choices).toEqual([
      {
        field: 'identity',
        survivor: { present: true, value: 'unspecified' },
        absorbed: { present: false },
      },
    ]);
    await tool('read_merge_review', { survivorId: 'a', absorbedId: 'a' }, 'object_conflict');
    const body = {
      ...version(merge),
      survivorId: 'a',
      absorbedId: 'b',
      identityConfirmed: true,
      reviewed: merge.reviewed,
      choices: {},
      relationships: [],
    };
    const incomplete = await tool('propose_merge', body, 'merge_choices_required');
    expect(incomplete.message).toContain('varje avvikande');
    await object('a', { name: 'Nytt namn' });
    await save('concurrent-merge-edit');
    const latest = await tool('read_my_draft');
    await tool(
      'propose_merge',
      { ...body, ...version(latest), choices: { identity: 'survivor' } },
      'merge_conflict',
    );
    await tool(
      'propose_undo',
      {
        ...version(body),
        operationId: 'merge-review-fixture',
        userId: (await (await browser.get(path)).json()).userId,
      },
      'draft_conflict',
    );
    const context = await (await browser.get(`${app.origin}/api/assistants/context`)).json();
    for (const connection of context.connections)
      expect(
        (
          await browser.post(`${app.origin}/api/assistants/${connection.id}/revoke`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
    await expect(client.callTool({ name: 'read_history', arguments: {} })).rejects.toThrow();
    await expect(
      client.callTool({
        name: 'propose_undo',
        arguments: { ...version(latest), operationId: 'merge-review-fixture', userId: 'forged' },
      }),
    ).rejects.toThrow();
  } finally {
    await client.close();
    await readClient.close();
  }
});

test('MCP uses fresh content versions to undo imported historical authorship and rejects every old advanced mutation', async () => {
  await object('lamp', { name: 'Historisk lampa' });
  const original = await save('source-save');
  const householdPath = path.replace('/map', '');
  const prepared = await browser.post(`${householdPath}/exports`, {
    headers: { origin: app.origin },
    data: {},
  });
  expect(prepared.status()).toBe(201);
  const archive = await (
    await browser.get(`${householdPath}/exports/${(await prepared.json()).id}`)
  ).body();
  const source = { app, browser };
  app = await createInstallation();
  browser = await request.newContext();
  try {
    await signIn(browser, app.origin);
    const { household } = await (
      await createHousehold(browser, app.origin, 'Återställt hushåll')
    ).json();
    const targetPath = `${app.origin}/api/households/${household.id}`;
    const uploaded = await browser.post(`${targetPath}/imports`, {
      headers: {
        origin: app.origin,
        'content-type': 'application/zip',
        'x-skyttel-content-version': '1',
      },
      data: archive,
    });
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const ready = await uploaded.json();
    const confirmed = await browser.post(`${targetPath}/imports/${ready.id}/confirm`, {
      headers: { origin: app.origin },
      data: { contentVersion: 1, confirmed: true },
    });
    expect((await confirmed.json()).status).toBe('completed');
    const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
    const consent = await flow.consent(household.id);
    token = (await (await flow.exchange((await consent.json()).url)).json()).access_token;
    path = `${targetPath}/map`;
    await app.restart();
    const review = await tool('read_my_draft');
    expect(review.contentVersion).toBe(2);
    const selected = await tool('read_history', {
      operationId: original.operationId,
      userId: original.userId,
    });
    expect(selected.receipt).toMatchObject({
      userId: original.userId,
      contentVersion: 1,
      actorName: 'Alex Exempel',
    });
    const currentOwner = (await (await browser.get(path)).json()).userId;
    expect(currentOwner).not.toBe(original.userId);
    for (const [name, args] of [
      [
        'propose_object_type',
        {
          id: 'stale-type',
          baseRevision: null,
          value: { name: 'Gammal typ', description: '', fields: [] },
        },
      ],
      [
        'propose_relationship_type',
        {
          id: 'stale-edge-type',
          baseRevision: null,
          value: {
            name: 'Gammal typ',
            description: '',
            forwardLabel: 'framåt',
            reverseLabel: 'bakåt',
          },
        },
      ],
      ['propose_undo', { operationId: original.operationId, userId: original.userId }],
      [
        'propose_merge',
        {
          survivorId: 'lamp',
          absorbedId: 'other',
          identityConfirmed: true,
          reviewed: { objects: [{}, {}], relationships: [], types: [], relationshipTypes: [] },
          choices: {},
          relationships: [],
        },
      ],
    ] as const) {
      await tool(name, { ...args, version: review.version, contentVersion: 1 }, 'content_conflict');
    }
    expect(await tool('read_my_draft')).toEqual(review);
    await tool('propose_undo', {
      ...version(review),
      operationId: original.operationId,
      userId: original.userId,
    });
    const undone = await save('fresh-imported-undo');
    expect(undone.userId).toBe(currentOwner);
    expect(undone.contentVersion).toBe(2);
    expect((await tool('read_map')).objects).toEqual([]);
  } finally {
    await browser.dispose();
    await app.close();
    app = source.app;
    browser = source.browser;
  }
});

test('MCP rental, loan, credit and installment cases preserve dated uncertainty and correct facts without inventing missing information', async () => {
  const catalog = await tool('read_type_catalog');
  const type = (name: string) =>
    catalog.types.find((entry: { name: string }) => entry.name === name).id;
  const cases = [
    [
      'home-rent',
      'Hyresavtal',
      'Hyra för Linden 4',
      {
        price: { knowledge: 'known', value: '9 500' },
        currency: { knowledge: 'known', value: 'SEK' },
        paymentInterval: { knowledge: 'known', value: 'månad' },
        terms: { knowledge: 'unknown' },
      },
    ],
    [
      'garage-rent',
      'Hyresavtal',
      'Hyra för garaget',
      { price: { knowledge: 'uncertain', value: '650' }, endDate: { knowledge: 'none' } },
    ],
    [
      'loan',
      'Låneavtal',
      'Exempellån',
      { debt: { knowledge: 'uncertain', value: '125 000,50', reportedOn: '2026-09-01' } },
    ],
    [
      'credit',
      'Kreditavtal',
      'Exempelkredit',
      {
        creditLimit: { knowledge: 'known', value: '80 000', reportedOn: '2026-08-01' },
        usedCredit: { knowledge: 'known', value: '12 500', reportedOn: '2026-09-02' },
        terms: { knowledge: 'none' },
      },
    ],
    [
      'installment',
      'Avbetalningsavtal',
      'Bilens avbetalning',
      { debt: { knowledge: 'unknown', reportedOn: '2026-09-03' } },
    ],
  ] as const;
  for (const [id, kind, name, financialFacts] of cases)
    await object(id, { typeId: type(kind), name, financialFacts });
  await object('car', { typeId: type('Fordon'), name: 'Familjens bil', identity: 'unspecified' });
  let review = await tool('read_my_draft');
  for (const [id, typeName, sourceId, targetId, knowledge] of [
    ['finance-car', 'Finansierar', 'installment', 'car', 'known'],
    ['unknown-landlord', 'Hyresvärd', 'home-rent', null, 'unknown'],
    ['no-payer', 'Betalar', 'garage-rent', null, 'none'],
    ['uncertain-collateral', 'Finansierar', 'loan', 'car', 'uncertain'],
  ] as const)
    review = await tool('propose_relationship', {
      ...version(review),
      id,
      baseRevision: null,
      value: {
        typeId: catalog.relationshipTypes.find((entry: { name: string }) => entry.name === typeName)
          .id,
        sourceId,
        targetId,
        knowledge,
      },
    });
  await save('extended-household');
  await app.restart();
  for (const [id, kind, name, financialFacts] of cases) {
    const found = await tool('read_map', { query: name });
    expect(found.objects).toHaveLength(1);
    expect(found.objects[0]).toMatchObject({ id, typeId: type(kind), financialFacts });
    expect(found.objects[0].financialFacts).toEqual(financialFacts);
  }
  expect((await tool('read_map', { objectId: 'car' })).objects[0].identity).toBe('unspecified');
  const credit = (await tool('read_map', { objectId: 'credit' })).objects[0];
  await object('credit', {
    financialFacts: {
      ...credit.financialFacts,
      usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-20' },
    },
  });
  const receipt = await save('credit-correction');
  const history = await tool('read_history', {
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
  expect(history.receipt.changes[0]).toMatchObject({
    before: { financialFacts: { usedCredit: { value: '12 500', reportedOn: '2026-09-02' } } },
    after: { financialFacts: { usedCredit: { value: '0', reportedOn: '2026-09-20' } } },
  });
  const saved = await tool('read_map');
  expect(saved.relationships.map((edge: { knowledge: string }) => edge.knowledge).sort()).toEqual([
    'known',
    'none',
    'uncertain',
    'unknown',
  ]);
});

test('MCP type change preserves object and edges without field conversion, and undo explicitly restores removed definitions and rejects overlapping private work', async () => {
  for (const [id, name, kind] of [
    ['cycle', 'Cykel', 'text'],
    ['vehicle', 'Motorfordon', 'number'],
  ]) {
    await definition(id, {
      name,
      description: '',
      fields: [
        { id: 'serial', name: 'Nummer', description: '', kind },
        { id: 'insured', name: 'Försäkrad', description: '', kind: 'boolean' },
      ],
    });
  }
  await object('bike', {
    typeId: 'cycle',
    name: 'Alex blå cykel',
    customValues: { serial: 'SYNTH-42', insured: false },
  });
  let review = await object('garage', { name: 'Garaget' });
  const catalog = await tool('read_type_catalog');
  review = await tool('propose_relationship_type', {
    ...version(review),
    id: 'parking-type',
    baseRevision: null,
    value: {
      name: 'Förvaring',
      description: '',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
    },
  });
  await tool('propose_relationship', {
    ...version(review),
    id: 'parking',
    baseRevision: null,
    value: { typeId: 'parking-type', sourceId: 'bike', targetId: 'garage', knowledge: 'known' },
  });
  await save('before-type-change');
  const initial = await tool('read_map', { objectId: 'bike' });
  review = await object('bike', { typeId: 'vehicle', customValues: { serial: 42 } });
  expect(review.changes[0]).toMatchObject({
    before: { typeId: 'cycle', customValues: { serial: 'SYNTH-42', insured: false } },
    after: { typeId: 'vehicle', customValues: { serial: 42 } },
    beforeType: { name: 'Cykel' },
    type: { name: 'Motorfordon' },
  });
  const changed = await save('type-change');
  expect((await tool('read_map', { objectId: 'bike' })).relationships).toEqual(
    initial.relationships,
  );
  expect((await tool('read_map', { objectId: 'bike' })).objects[0].customValues).toEqual({
    serial: 42,
  });
  await definition('cycle', null);
  await save('remove-old-type');
  review = await tool('read_my_draft');
  review = await tool('propose_undo', {
    ...version(review),
    operationId: changed.operationId,
    userId: changed.userId,
  });
  expect(review.objectTypes).toEqual([
    expect.objectContaining({
      id: 'cycle',
      before: null,
      after: expect.objectContaining({ name: 'Cykel' }),
    }),
  ]);
  expect(review.changes[0].after.customValues).toEqual({ serial: 'SYNTH-42', insured: false });
  expect(
    (await (await browser.get(path)).json()).types.some(
      (type: { id: string }) => type.id === 'cycle',
    ),
  ).toBe(false);
  await save('restore-cycle-type');
  review = await tool('read_my_draft');
  const bike = (await tool('read_map', { objectId: 'bike' })).objects[0];
  review = await tool('propose_object', {
    ...version(review),
    id: 'bike',
    baseRevision: bike.revision,
    value: null,
  });
  expect(review.relationships[0]).toMatchObject({ id: 'parking', after: null });
  const removed = await save('remove-bike');
  review = await tool('read_my_draft');
  const edgeType = (await tool('read_type_catalog')).relationshipTypes.find(
    (type: { id: string }) => type.id === 'parking-type',
  );
  await tool('propose_relationship_type', {
    ...version(review),
    id: edgeType.id,
    baseRevision: edgeType.revision,
    value: null,
  });
  await definition('cycle', null);
  await save('remove-unused-definitions');
  expect((await tool('read_map')).objects).toHaveLength(1);
  review = await tool('read_my_draft');
  review = await tool('propose_undo', {
    ...version(review),
    operationId: removed.operationId,
    userId: removed.userId,
  });
  expect(review.objectTypes[0]).toMatchObject({ id: 'cycle', before: null });
  expect(review.relationshipTypes[0]).toMatchObject({ id: 'parking-type', before: null });
  await app.restart();
  await save('restore-bike-and-types');
  expect((await tool('read_map', { objectId: 'bike' })).relationships[0]).toMatchObject({
    id: 'parking',
    sourceId: 'bike',
    targetId: 'garage',
  });
  await object('bike', { description: 'Sparad rättelse' });
  const corrected = await save('description-change');
  review = await object('bike', { description: 'Privat rättelse' });
  const denied = await tool(
    'propose_undo',
    { ...version(review), operationId: corrected.operationId, userId: corrected.userId },
    'undo_draft_overlap',
  );
  expect(denied.message).toContain('eget utkast');
  expect(denied.review).toEqual(review);
  expect(catalog.types.some((type: { id: string }) => type.id === 'cycle')).toBe(true);
});

test('MCP protects used fields and ended definitions, explains private-use blocks without leaking content, and rechecks concurrent use at whole save', async () => {
  const field = { id: 'serial', name: 'Nummer', description: '', kind: 'text' };
  const type = { name: 'Cykel', description: '', fields: [field] };
  await definition('cycle', type);
  await object('bike', {
    typeId: 'cycle',
    name: 'Alex blå cykel',
    customValues: { serial: 'SYNTH-42' },
    lifecycle: 'ended',
  });
  await save('used-field');
  const blockedKind = await definition(
    'cycle',
    { ...type, fields: [{ ...field, kind: 'number' }] },
    'field_kind_in_use',
  );
  expect(blockedKind.message).toContain('nytt fält');
  const blockedField = await definition('cycle', { ...type, fields: [] }, 'field_in_use');
  expect(blockedField.message).toContain('fältvärden');
  const blockedType = await definition('cycle', null, 'definition_in_use');
  expect(blockedType.message).toContain('upphört');
  expect((await tool('read_map', { objectId: 'bike' })).objects[0].customValues).toEqual({
    serial: 'SYNTH-42',
  });
  await definition('cycle', {
    ...type,
    name: 'Trampcykel',
    fields: [field, { ...field, id: 'numeric', name: 'Numeriskt nummer', kind: 'number' }],
  });
  await save('new-field');
  expect((await tool('read_map', { objectId: 'bike' })).objects[0].customValues).toEqual({
    serial: 'SYNTH-42',
  });
  await definition('private-type', { name: 'Privat använd typ', description: '', fields: [] });
  await definition('race-type', { name: 'Samtidig använd typ', description: '', fields: [] });
  await save('available-types');
  const other = await member();
  try {
    const propose = async (id: string, typeId: string, name: string) => {
      const state = await (await other.get(path)).json();
      const response = await other.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: { typeId, name, description: 'Privat hemlig anteckning' },
        },
      });
      expect(response.status()).toBe(200);
    };
    await propose('secret', 'private-type', 'Andras privata namn');
    const denied = await definition('private-type', null, 'definition_in_use');
    expect(JSON.stringify(denied)).not.toMatch(
      /Andras privata namn|Privat hemlig anteckning|"secret"/,
    );
    const review = await definition('race-type', null);
    await propose('racer', 'race-type', 'Nytt privat bruk');
    await tool(
      'save_draft',
      { ...version(review), operationId: 'racing-removal' },
      'definition_in_use',
    );
    expect(
      (await tool('read_type_catalog')).types.some(
        (item: { id: string }) => item.id === 'private-type',
      ),
    ).toBe(true);
    const saved = await (await browser.get(path)).json();
    expect(saved.types.some((item: { id: string }) => item.id === 'race-type')).toBe(true);
    expect(saved.objects.some((item: { id: string }) => item.id === 'secret')).toBe(false);
    expect((await (await other.get(path)).json()).draft.changes).toHaveLength(2);
  } finally {
    await other.dispose();
  }
});

test('MCP explicitly reviews an identity merge, copies the selected image and restores identities and edges through whole-save undo', async () => {
  await object('a', { name: 'Lo Exempel', description: 'Första uppgiften' });
  await object('b', { name: 'Lo Exempel', description: 'Andra uppgiften' });
  await object('card', { name: 'Blått kort', description: 'Orelaterade kortdetaljer' });
  await save('merge-fixture');
  const imagePath = path.replace('/map', '/profile-images');
  for (const [id, color] of [
    ['a', '#ff0000'],
    ['b', '#00ff00'],
  ]) {
    const state = await (await browser.get(path)).json();
    const bytes = await sharp({ create: { width: 10, height: 12, channels: 3, background: color } })
      .png()
      .toBuffer();
    const response = await browser.post(`${imagePath}/${id}`, {
      headers: {
        origin: app.origin,
        'content-type': 'image/png',
        'x-skyttel-draft-version': String(state.draft.version),
        'x-skyttel-content-version': String(state.contentVersion),
        'x-skyttel-object-revision': String(
          state.objects.find((item: { id: string }) => item.id === id).revision,
        ),
      },
      data: bytes,
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  await save('images');
  const originals = (await tool('read_map')).objects;
  const catalog = await tool('read_type_catalog');
  let review = await tool('read_my_draft');
  for (const [id, sourceId] of [
    ['first', 'a'],
    ['second', 'b'],
  ]) {
    review = await tool('propose_relationship', {
      ...version(review),
      id,
      baseRevision: null,
      value: {
        typeId: catalog.relationshipTypes[0].id,
        sourceId,
        targetId: 'card',
        knowledge: 'known',
      },
    });
  }
  await save('edges');
  await object('independent', { name: 'Eget oberoende förslag' });
  let merge = await tool('read_merge_review', { survivorId: 'a', absorbedId: 'b' });
  expect(merge.reviewed.objects.map((item: { id: string }) => item.id)).toEqual(['a', 'b']);
  expect(merge.contextObjects).toEqual([
    {
      id: 'card',
      name: 'Blått kort',
      typeId: originals.find((item: { id: string }) => item.id === 'card').typeId,
    },
  ]);
  expect(JSON.stringify(merge)).not.toContain('Orelaterade kortdetaljer');
  expect(merge.choices.map((choice: { field: string }) => choice.field)).toEqual([
    'description',
    'profileImageId',
  ]);
  const request = () => ({
    ...version(merge),
    survivorId: 'a',
    absorbedId: 'b',
    reviewed: merge.reviewed,
    identityConfirmed: false,
    choices: { description: 'absorbed', profileImageId: 'absorbed' },
    relationships: [
      { id: 'first', action: 'remove' },
      { id: 'second', action: 'keep' },
    ],
  });
  await tool(
    'propose_merge',
    {
      ...request(),
      relationships: [
        { id: 'first', action: 'keep' },
        { id: 'second', action: 'keep' },
      ],
    },
    'duplicate_relationship',
  );
  review = await tool('propose_merge', request());
  expect(review.readyToSave).toBe(false);
  expect(review.unresolvedIdentities).toEqual([{ kind: 'object', id: 'a' }]);
  await tool(
    'save_draft',
    { ...version(review), operationId: 'unconfirmed-merge' },
    'unresolved_identity',
  );
  review = await tool('read_my_draft');
  await tool('discard_proposal', { ...version(review), kind: 'object', id: 'a' });
  merge = await tool('read_merge_review', { survivorId: 'a', absorbedId: 'b' });
  review = await tool('propose_merge', { ...request(), identityConfirmed: true });
  expect(review.changes.some((change: { id: string }) => change.id === 'independent')).toBe(true);
  await app.restart();
  const merged = await save('confirmed-merge');
  const current = (await tool('read_map', { objectId: 'a' })).objects[0];
  const sourceImage = originals.find((item: { id: string }) => item.id === 'b').profileImageId;
  expect(current.profileImageId).not.toBe(sourceImage);
  expect(await (await browser.get(`${imagePath}/${current.profileImageId}`)).body()).toEqual(
    await (await browser.get(`${imagePath}/${sourceImage}`)).body(),
  );
  await object('a', { name: 'Senare namn' });
  await save('later-name');
  review = await tool('read_my_draft');
  await tool('propose_undo', {
    ...version(review),
    userId: merged.userId,
    operationId: merged.operationId,
  });
  await save('undo-merge');
  await app.restart();
  const restored = await tool('read_map');
  expect(restored.objects.find((item: { id: string }) => item.id === 'a')).toMatchObject({
    name: 'Senare namn',
    description: 'Första uppgiften',
    profileImageId: originals.find((item: { id: string }) => item.id === 'a').profileImageId,
  });
  expect(restored.objects.find((item: { id: string }) => item.id === 'b')).toMatchObject({
    name: 'Lo Exempel',
    description: 'Andra uppgiften',
    profileImageId: sourceImage,
  });
  expect(restored.objects.some((item: { id: string }) => item.id === 'independent')).toBe(false);
  expect(restored.relationships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'first', sourceId: 'a' }),
      expect.objectContaining({ id: 'second', sourceId: 'b' }),
    ]),
  );
});

test('MCP history discovery is bounded and scoped while a selected save exposes historical facts and fresh undo preserves later independent work', async () => {
  await object('bike', { name: 'Alex blå cykel', description: 'Blå ram' });
  await save('initial-bike');
  await object('unrelated', {
    name: 'Orelaterat konto',
    description: 'Unik orelaterad anteckning',
  });
  await save('unrelated-save');
  await object('bike', { description: 'Grön ram' });
  const corrected = await save('repaint');
  await object('bike', { name: 'Alex stadscykel' });
  await save('independent-name');
  const summaries = await tool('read_history', { objectId: 'bike', limit: 2 });
  expect(summaries.history.map((item: { operationId: string }) => item.operationId)).toEqual([
    'independent-name',
    'repaint',
  ]);
  expect(summaries.hasMore).toBe(true);
  expect(JSON.stringify(summaries)).not.toMatch(/Unik orelaterad|Blå ram|Grön ram|unrelated-save/);
  const selected = await tool('read_history', {
    operationId: corrected.operationId,
    userId: corrected.userId,
  });
  expect(selected.receipt).toMatchObject({
    actorName: 'Alex Exempel',
    savedAt: expect.stringMatching(/T/),
    changes: [{ before: { description: 'Blå ram' }, after: { description: 'Grön ram' } }],
  });
  await object('private', { name: 'Eget oberoende förslag' });
  let review = await tool('read_my_draft');
  review = await tool('propose_undo', {
    ...version(review),
    operationId: corrected.operationId,
    userId: corrected.userId,
  });
  expect(review.changes.find((change: { id: string }) => change.id === 'bike').after).toMatchObject(
    { name: 'Alex stadscykel', description: 'Blå ram' },
  );
  expect(review.changes.find((change: { id: string }) => change.id === 'private')).toBeDefined();
  expect((await tool('read_map', { objectId: 'bike' })).objects[0].description).toBe('Grön ram');
  await app.restart();
  expect(await tool('read_my_draft')).toEqual(review);
  const receipt = await save('undo-repaint');
  expect(receipt.changes).toHaveLength(2);
  expect((await tool('read_map', { objectId: 'bike' })).objects[0]).toMatchObject({
    name: 'Alex stadscykel',
    description: 'Blå ram',
  });
  expect((await tool('read_map', { objectId: 'unrelated' })).objects[0].description).toBe(
    'Unik orelaterad anteckning',
  );
});

test('MCP creates a household solar type with four field kinds and preserves unanswered and false values', async () => {
  let review = await tool('read_my_draft');
  expect((await tool('read_map')).objects).toEqual([]);
  expect((await tool('read_type_catalog')).types.length).toBeGreaterThan(0);
  review = await tool('propose_object_type', {
    ...version(review),
    id: 'solar',
    baseRevision: null,
    value: {
      name: 'Solcellsanläggning',
      description: 'Hushållets egen anläggning',
      fields: [
        { id: 'model', name: 'Modell', description: '', kind: 'text' },
        { id: 'power', name: 'Effekt', description: 'kW', kind: 'number' },
        { id: 'installed', name: 'Installerad', description: '', kind: 'date' },
        { id: 'battery', name: 'Batteri', description: '', kind: 'boolean' },
      ],
    },
  });
  const catalog = await tool('read_type_catalog');
  expect(catalog.types.find((type: { id: string }) => type.id === 'solar').fields).toHaveLength(4);
  for (const [id, customValues] of [
    ['roof', { model: 'Takpanelen', power: 7.5, installed: '2026-09-01' }],
    ['garage', { battery: false }],
  ] as const) {
    review = await tool('propose_object', {
      ...version(review),
      id,
      baseRevision: null,
      typeRevision: 1,
      value: {
        typeId: 'solar',
        name: id === 'roof' ? 'Takets solceller' : 'Garagets solceller',
        description: '',
        customValues,
      },
    });
  }
  expect((await (await browser.get(path)).json()).objects).toEqual([]);
  const { receipt } = await tool('save_draft', { ...version(review), operationId: 'solar-save' });
  expect(receipt.objectTypes).toHaveLength(1);
  expect(receipt.changes).toHaveLength(2);
  await app.restart();
  const state = await tool('read_map');
  expect(state.objects.find((object: { id: string }) => object.id === 'roof').customValues).toEqual(
    { model: 'Takpanelen', power: 7.5, installed: '2026-09-01' },
  );
  expect(
    state.objects.find((object: { id: string }) => object.id === 'garage').customValues,
  ).toEqual({ battery: false });
  expect(
    (await (await browser.get(path)).json()).types.find(
      (type: { id: string }) => type.id === 'solar',
    ).fields,
  ).toHaveLength(4);
});

test('MCP custom relationship types retain both labels, direction, duplicate reuse and whole definition review', async () => {
  let review = await tool('read_my_draft');
  const catalog = await tool('read_type_catalog');
  review = await tool('propose_relationship_type', {
    ...version(review),
    id: 'stored',
    baseRevision: null,
    value: {
      name: 'Förvaring',
      description: 'Var saken förvaras',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
    },
  });
  for (const [id, name] of [
    ['bike', 'Alex blå cykel'],
    ['garage', 'Garaget'],
  ]) {
    review = await tool('propose_object', {
      ...version(review),
      id,
      baseRevision: null,
      value: { typeId: catalog.types[0].id, name, description: '' },
    });
  }
  const edge = { typeId: 'stored', sourceId: 'bike', targetId: 'garage', knowledge: 'known' };
  review = await tool('propose_relationship', {
    ...version(review),
    id: 'parking',
    baseRevision: null,
    value: edge,
  });
  const repeated = await tool('propose_relationship', {
    ...version(review),
    id: 'duplicate',
    baseRevision: null,
    value: edge,
  });
  expect(repeated.existingId).toBe('parking');
  expect(repeated.relationships).toHaveLength(1);
  review = await tool('propose_relationship', {
    ...version(repeated),
    id: 'other-kind',
    baseRevision: null,
    value: { ...edge, typeId: catalog.relationshipTypes[0].id },
  });
  const { receipt } = await tool('save_draft', { ...version(review), operationId: 'custom-edges' });
  expect(receipt.relationshipTypes[0].after).toMatchObject({
    forwardLabel: 'förvaras i',
    reverseLabel: 'innehåller',
  });
  await app.restart();
  const state = await tool('read_map', { objectId: 'garage' });
  expect(state.relationships).toHaveLength(2);
  expect(state.relationships.find((item: { id: string }) => item.id === 'parking')).toMatchObject({
    sourceId: 'bike',
    targetId: 'garage',
    typeId: 'stored',
  });
  expect(
    state.relationshipTypes.find((item: { id: string }) => item.id === 'stored'),
  ).toMatchObject({ forwardLabel: 'förvaras i', reverseLabel: 'innehåller' });
});
