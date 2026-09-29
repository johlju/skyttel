import { createHash } from 'node:crypto';
import { type APIRequestContext, request } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { ImportContent } from '../../../src/server/import-schema.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { mergeObjects } from '../../../src/shared/object-merge.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let scope: string;
const read = async (): Promise<MapState> => (await client.get(`${scope}/map`)).json();
const post = (route: string, data: unknown) =>
  client.post(`${scope}/${route}`, { headers: { origin: installation.origin }, data });
const definition = {
  name: 'Solkraft',
  description: '',
  builtins: [
    { key: 'description' as const, name: 'Avtalstext', sectionId: 'facts' },
    { key: 'debt' as const, name: 'Skuld', sectionId: 'service' },
    { key: 'price' as const, name: 'Pris', sectionId: '' },
  ],
  propertyOrder: [
    'builtin:description',
    'field:note',
    'builtin:debt',
    'field:power',
    'field:battery',
    'builtin:price',
  ],
  sections: [
    { id: 'service', name: 'Service' },
    { id: 'facts', name: 'Uppgifter' },
  ],
  fields: [
    { id: 'note', name: 'Anteckning', description: '', kind: 'text' as const, sectionId: 'facts' },
    { id: 'power', name: 'Effekt', description: '', kind: 'number' as const, sectionId: '' },
    {
      id: 'battery',
      name: 'Batteri',
      description: '',
      kind: 'boolean' as const,
      sectionId: 'service',
    },
  ],
};
const financialFacts = {
  debt: { knowledge: 'uncertain', value: '12 300', reportedOn: '2026-09-01' },
  price: { knowledge: 'unknown' },
  currency: { knowledge: 'none' },
  startDate: { knowledge: 'known', value: '2026-08-01' },
};
const values = { note: 'Behåll uppgiften', power: 0, battery: false };
beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  scope = `${installation.origin}/api/households/${household.id}`;
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});
async function define(value: unknown = definition) {
  const state = await read();
  const current = state.types.find(({ id }) => id === 'solar');
  expect(
    (
      await post('map/object-type', {
        version: state.draft.version,
        id: 'solar',
        baseRevision: current?.revision ?? null,
        value,
      })
    ).status(),
  ).toBe(200);
}
async function object(id: string, typeId = 'solar', description = '') {
  const state = await read();
  const current = state.objects.find((object) => object.id === id);
  expect(
    (
      await post('map/draft', {
        version: state.draft.version,
        id,
        baseRevision: current?.revision ?? null,
        value: {
          typeId,
          name: 'Solpaneler',
          description,
          financialFacts,
          iconId: 'bike',
          ...(typeId === 'solar' ? { customValues: values } : {}),
        },
      })
    ).status(),
  ).toBe(200);
}
async function save(operationId: string): Promise<SaveReceipt> {
  const state = await read();
  const result = await post('map/save', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    operationId,
  });
  expect(result.status()).toBe(200);
  return (await result.json()).receipt;
}
async function archive() {
  const prepared = await post('exports', {});
  expect(prepared.ok()).toBe(true);
  const { id } = await prepared.json();
  const download = await client.get(`${scope}/exports/${id}`);
  expect(download.status()).toBe(200);
  const parts = unzipSync(new Uint8Array(await download.body()));
  const content: ImportContent = JSON.parse(Buffer.from(parts['content.json']).toString());
  const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  return { parts, content, manifest };
}
function pack(source: Awaited<ReturnType<typeof archive>>) {
  source.parts['content.json'] = Buffer.from(JSON.stringify(source.content));
  const part = source.manifest.parts.find((part: { path: string }) => part.path === 'content.json');
  part.bytes = source.parts['content.json'].length;
  part.sha256 = createHash('sha256').update(source.parts['content.json']).digest('hex');
  source.parts['manifest.json'] = Buffer.from(JSON.stringify(source.manifest));
  return Buffer.from(zipSync(source.parts));
}
async function upload(source: Awaited<ReturnType<typeof archive>>) {
  return client.post(`${scope}/imports`, {
    headers: {
      origin: installation.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': String((await read()).contentVersion),
    },
    data: pack(source),
  });
}
async function restore(source: Awaited<ReturnType<typeof archive>>) {
  const uploaded = await upload(source);
  expect(uploaded.status()).toBe(201);
  const { id } = await uploaded.json();
  expect(
    (
      await post(`imports/${id}/confirm`, {
        contentVersion: (await read()).contentVersion,
        confirmed: true,
      })
    ).status(),
  ).toBe(200);
}

test('cancelled and saved merges preserve whole canonical facts and undo keeps an independent presentation edit', async () => {
  await define();
  await object('first', 'solar', 'Första texten');
  await object('second', 'solar', 'Andra texten');
  await save('originals');
  const originals = (await read()).objects;
  await object('first', 'solar', 'Privat text');
  const privateState = await read();
  async function merge() {
    const state = await read();
    return post('map/merge', {
      version: state.draft.version,
      survivorId: 'first',
      absorbedId: 'second',
      identityConfirmed: true,
      reviewed: {
        objects: ['first', 'second'].map((id) => mergeObjects(state).get(id)),
        relationships: [],
        types: state.types.filter(({ id }) => id === 'solar'),
        relationshipTypes: [],
      },
      relationships: [],
      choices: { description: 'absorbed' },
    });
  }
  expect((await merge()).status()).toBe(200);
  let state = await read();
  const proposed = state.draft.changes.find(({ id }) => id === 'first');
  expect(proposed?.after).toMatchObject({ description: 'Andra texten', financialFacts });
  expect(proposed?.merge?.types[0]).toMatchObject(definition);
  expect(
    (
      await post('map/discard-change', {
        version: state.draft.version,
        kind: 'object',
        id: 'second',
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.changes).toEqual(privateState.draft.changes);
  expect((await merge()).status()).toBe(200);
  const receipt = await save('merged');
  expect(receipt.changes.find(({ after }) => after?.id === 'first')?.after?.financialFacts).toEqual(
    financialFacts,
  );
  await define({
    ...definition,
    builtins: definition.builtins.map((field) =>
      field.key === 'debt' ? { ...field, sectionId: '' } : field,
    ),
  });
  await save('hide-debt');
  state = await read();
  expect(
    (
      await post('map/undo', {
        version: state.draft.version,
        userId: receipt.userId,
        operationId: receipt.operationId,
      })
    ).status(),
  ).toBe(200);
  await save('undo-merge');
  client = await restartWithSession(client, () => installation.restart());
  state = await read();
  for (const original of originals) {
    const { revision: _revision, ...value } = original;
    expect(state.objects.find(({ id }) => id === value.id)).toMatchObject(value);
  }
  expect(state.types.find(({ id }) => id === 'solar')?.builtins).toContainEqual({
    key: 'debt',
    name: 'Skuld',
    sectionId: '',
  });
});

test('archive 21 preserves canonical property placement, sections and hidden values in current, private, history and merged snapshots', async () => {
  await define();
  await object('first');
  await object('second');
  await save('originals');
  const state = await read();
  expect(
    (
      await post('map/merge', {
        version: state.draft.version,
        survivorId: 'first',
        absorbedId: 'second',
        identityConfirmed: true,
        reviewed: {
          objects: state.objects,
          relationships: [],
          types: state.types.filter(({ id }) => id === 'solar'),
          relationshipTypes: [],
        },
        relationships: [],
        choices: {},
      })
    ).status(),
  ).toBe(200);
  await save('merged');
  await object('first', 'solar', 'Privat text');
  await define({ ...definition, name: 'Privat typnamn' });
  const source = await archive();
  expect(source.manifest.schemaVersion).toBe(21);
  expect(source.content.objectTypeFields.find(({ typeId }) => typeId === 'solar')).toMatchObject({
    fields: definition.fields,
    sections: definition.sections,
    builtins: definition.builtins,
    propertyOrder: definition.propertyOrder,
  });
  const snapshots = [
    source.content.drafts[0].changes[0].type,
    source.content.drafts[0].objectTypes[0].before,
    source.content.drafts[0].objectTypes[0].after,
    source.content.history[0].changes[0].type,
    source.content.saves.find(({ operationId }) => operationId === 'originals')?.receipt
      .objectTypes?.[0].after,
    source.content.saves.find(({ operationId }) => operationId === 'merged')?.receipt.changes[0]
      .merge?.types[0],
  ];
  for (const snapshot of snapshots)
    expect(snapshot).toMatchObject({
      fields: definition.fields,
      sections: definition.sections,
      builtins: definition.builtins,
      propertyOrder: definition.propertyOrder,
    });
  const before = await read();
  // Invalid placements must be rejected in every nested type, without replacing live content.
  for (const snapshot of snapshots) {
    if (!snapshot?.fields) throw new Error('The arranged snapshot must retain its fields.');
    const placement = snapshot.fields[0].sectionId;
    snapshot.fields[0].sectionId = 'missing-section';
    expect((await upload(source)).status()).toBe(400);
    expect(await read()).toEqual(before);
    snapshot.fields[0].sectionId = placement;
    if (!snapshot.builtins || !snapshot.propertyOrder)
      throw new Error('Canonical presentation must survive each nested snapshot.');
    const key = snapshot.builtins[0].key;
    snapshot.builtins[0].key = 'name' as typeof key;
    expect((await upload(source)).status()).toBe(400);
    expect(await read()).toEqual(before);
    snapshot.builtins[0].key = key;
    snapshot.propertyOrder.push(snapshot.propertyOrder[0]);
    expect((await upload(source)).status()).toBe(400);
    expect(await read()).toEqual(before);
    snapshot.propertyOrder.pop();
  }
  const row = source.content.objectTypeFields.find(({ typeId }) => typeId === 'solar');
  if (!row?.sections) throw new Error('The current type must retain its sections.');
  row.sections.push({ ...row.sections[0] });
  expect((await upload(source)).status()).toBe(400);
  expect(await read()).toEqual(before);
  row.sections.pop();
  if (!row.builtins || !row.propertyOrder)
    throw new Error('Raw canonical presentation is required.');
  row.builtins.push({ ...row.builtins[0] });
  expect((await upload(source)).status()).toBe(400);
  expect(await read()).toEqual(before);
  row.builtins.pop();
  const reference = row.propertyOrder[0];
  row.propertyOrder[0] = 'builtin:name';
  expect((await upload(source)).status()).toBe(400);
  expect(await read()).toEqual(before);
  row.propertyOrder[0] = reference;
  await restore(source);
  client = await restartWithSession(client, () => installation.restart());
  const imported = await read();
  expect(imported.types.find(({ id }) => id === 'solar')).toMatchObject(definition);
  expect(imported.objects.find(({ id }) => id === 'first')).toMatchObject({
    customValues: values,
    financialFacts,
    iconId: 'bike',
  });
  expect(imported.draft.changes[0]).toMatchObject({
    after: { description: 'Privat text', financialFacts, customValues: values, iconId: 'bike' },
    type: { fields: definition.fields, sections: definition.sections },
  });
  const exported = await archive();
  expect(
    exported.content.saves.map(({ receipt }) => receipt.changes.map(({ type }) => type)),
  ).toEqual(source.content.saves.map(({ receipt }) => receipt.changes.map(({ type }) => type)));
});

test.each([14, 15, 16, 17, 18, 19, 20])(
  'legacy archive %i keeps absent presentation metadata and original snapshot field order',
  async (version) => {
    const legacy = {
      name: definition.name,
      description: '',
      fields: definition.fields.map(({ sectionId: _placement, ...field }) => field),
    };
    await define(legacy);
    await object('first');
    await save('legacy');
    const source = await archive();
    source.manifest.schemaVersion = version;
    for (const row of source.content.objectTypeFields) {
      delete row.sections;
      delete row.builtins;
      delete row.propertyOrder;
    }
    if (version < 17) {
      for (const object of source.content.objects) delete object.iconId;
      for (const entry of source.content.history)
        for (const change of entry.changes) {
          if (change.before) delete change.before.iconId;
          if (change.after) delete change.after.iconId;
        }
      for (const entry of source.content.saves)
        for (const change of entry.receipt.changes) {
          if (change.before) delete change.before.iconId;
          if (change.after) delete change.after.iconId;
        }
    }
    await restore(source);
    const imported = (await read()).types.find(({ id }) => id === 'solar');
    expect(imported).toMatchObject(legacy);
    expect(imported).not.toHaveProperty('sections');
    expect(imported).not.toHaveProperty('builtins');
    expect(imported).not.toHaveProperty('propertyOrder');
    for (const field of imported?.fields ?? []) expect(field).not.toHaveProperty('sectionId');
    const exported = await archive();
    expect(exported.content.history.map(({ changes }) => changes.map(({ type }) => type))).toEqual(
      source.content.history.map(({ changes }) => changes.map(({ type }) => type)),
    );
    expect((await read()).objects[0].customValues).toEqual(values);
  },
);

test('erasing an unrelated object preserves section metadata and hidden answers in surviving draft and history', async () => {
  await define();
  await object('keep');
  await object('erase', (await read()).types[0].id);
  await save('mixed');
  await object('keep', 'solar', 'Privat bevarad text');
  const selection = [{ kind: 'object', id: 'erase' }];
  const review = await post('erasure/review', { selection });
  expect(review.status()).toBe(200);
  const { token } = await review.json();
  expect(
    (
      await post('erasure/execute', {
        selection,
        token,
        operationId: 'erase-unrelated',
        confirmation: 'RADERA PERMANENT',
      })
    ).status(),
  ).toBe(200);
  const state = await read();
  expect(state.objects.map(({ id }) => id)).toEqual(['keep']);
  expect(state.types.find(({ id }) => id === 'solar')).toMatchObject(definition);
  expect(state.objects[0].financialFacts).toEqual(financialFacts);
  expect(state.draft.changes[0]).toMatchObject({
    type: definition,
    after: { customValues: values, iconId: 'bike', description: 'Privat bevarad text' },
  });
  const { history }: { history: SaveReceipt[] } = await (
    await client.get(`${scope}/map/history`)
  ).json();
  expect(history[0].changes).toHaveLength(1);
  expect(history[0].changes[0]).toMatchObject({
    type: definition,
    after: { id: 'keep', customValues: values, iconId: 'bike' },
  });
  const exported = await archive();
  expect(exported.content.objectTypeFields.find(({ typeId }) => typeId === 'solar')).toMatchObject({
    sections: definition.sections,
    fields: definition.fields,
  });
  expect(exported.content.objects.some(({ id }) => id === 'erase')).toBe(false);
});

test('archive validation rejects object property metadata in raw and historical relationship definitions', async () => {
  expect(
    (
      await post('map/relationship-type', {
        version: 0,
        id: 'edge',
        baseRevision: null,
        value: {
          name: 'Använder',
          description: '',
          forwardLabel: 'använder',
          reverseLabel: 'används av',
          fields: [],
          sections: [],
        },
      })
    ).status(),
  ).toBe(200);
  await save('edge-definition');
  const source = await archive();
  const before = await read();
  const raw = source.content.relationshipTypeFields.find(({ typeId }) => typeId === 'edge');
  const nested = source.content.saves[0].receipt.relationshipTypes?.[0].after;
  for (const record of [raw, nested]) {
    if (!record)
      throw new Error('The relationship definition must exist in raw storage and its receipt.');
    const candidate = record as unknown as Record<string, unknown>;
    candidate.builtins = [{ key: 'debt', name: 'Skuld', sectionId: '' }];
    expect((await upload(source)).status()).toBe(400);
    expect(await read()).toEqual(before);
    delete candidate.builtins;
  }
  await restore(source);
  expect((await read()).relationshipTypes.find(({ id }) => id === 'edge')?.sections).toEqual([]);
});
