import { createHash } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { ImportContent } from '../../../src/server/import-schema.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const definition = {
  name: 'Förvaring',
  description: 'Förvaringsplats',
  forwardLabel: 'förvaras i',
  reverseLabel: 'innehåller',
  sections: [
    { id: 'facts', name: 'Uppgifter' },
    { id: 'service', name: 'Service' },
  ],
  fields: [
    { id: 'note', name: 'Anteckning', description: '', kind: 'text' as const, sectionId: 'facts' },
    { id: 'amount', name: 'Belopp', description: '', kind: 'number' as const, sectionId: '' },
    {
      id: 'start',
      name: 'Startdatum',
      description: '',
      kind: 'date' as const,
      sectionId: 'service',
    },
    {
      id: 'active',
      name: 'Bekräftat',
      description: '',
      kind: 'boolean' as const,
      sectionId: 'facts',
    },
    {
      id: 'unanswered',
      name: 'Obesvarat',
      description: '',
      kind: 'boolean' as const,
      sectionId: 'facts',
    },
  ],
};
const values = { note: 'Låst skåp', amount: 0, start: '2026-09-27', active: false };
const read = async (): Promise<MapState> => (await client.request(`${path}/map`)).json();
const post = (route: string, body: unknown) => client.json(`${path}/${route}`, body);

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}`;
  for (const id of ['bike', 'spare', 'garage']) {
    const state = await read();
    expect(
      (
        await post('map/draft', {
          version: state.draft.version,
          id,
          baseRevision: null,
          value: { typeId: state.types[0].id, name: id, description: '' },
        })
      ).status,
    ).toBe(200);
  }
  await save('objects');
});
afterEach(() => fixture.close());

async function define(value: unknown = definition, id = 'storage') {
  const state = await read();
  expect(
    (
      await post('map/relationship-type', {
        version: state.draft.version,
        id,
        baseRevision: state.relationshipTypes.find((type) => type.id === id)?.revision ?? null,
        value,
      })
    ).status,
  ).toBe(200);
}
async function edge(
  customValues: unknown = values,
  { id = 'edge', typeId = 'storage', sourceId = 'bike' } = {},
) {
  const state = await read();
  expect(
    (
      await post('map/relationship', {
        version: state.draft.version,
        id,
        baseRevision:
          state.relationships.find((relationship) => relationship.id === id)?.revision ?? null,
        value: { typeId, sourceId, targetId: 'garage', knowledge: 'known', customValues },
      })
    ).status,
  ).toBe(200);
}
async function save(operationId: string): Promise<SaveReceipt> {
  const state = await read();
  const response = await post('map/save', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    operationId,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()).receipt;
}
async function merge() {
  const state = await read();
  const response = await post('map/merge', {
    version: state.draft.version,
    survivorId: 'spare',
    absorbedId: 'bike',
    identityConfirmed: true,
    reviewed: {
      objects: ['spare', 'bike'].map((id) => state.objects.find((object) => object.id === id)),
      relationships: state.relationships,
      types: state.types.filter(({ id }) => id === state.objects[0].typeId),
      relationshipTypes: state.relationshipTypes.filter(({ id }) =>
        state.relationships.some((relationship) => relationship.typeId === id),
      ),
    },
    relationships: state.relationships.map(({ id }) => ({ id, action: 'keep' })),
    choices: { name: 'survivor' },
  });
  expect(response.status, await response.clone().text()).toBe(200);
}
async function archive() {
  const prepared = await post('exports', {});
  expect(prepared.status).toBe(201);
  const { id } = await prepared.json();
  const download = await client.request(`${path}/exports/${id}`);
  expect(download.status).toBe(200);
  const parts = unzipSync(new Uint8Array(await download.arrayBuffer()));
  const content: ImportContent = JSON.parse(Buffer.from(parts['content.json']).toString());
  const manifest: {
    schemaVersion: number;
    parts: { path: string; bytes: number; sha256: string }[];
  } = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  return { parts, content, manifest };
}
async function upload(source: Awaited<ReturnType<typeof archive>>) {
  source.parts['content.json'] = Buffer.from(JSON.stringify(source.content));
  const part = source.manifest.parts.find(({ path }) => path === 'content.json');
  if (!part) throw new Error('The archive must contain content.json.');
  part.bytes = source.parts['content.json'].length;
  part.sha256 = createHash('sha256').update(source.parts['content.json']).digest('hex');
  source.parts['manifest.json'] = Buffer.from(JSON.stringify(source.manifest));
  return client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': String((await read()).contentVersion),
    },
    body: zipSync(source.parts) as BodyInit,
  });
}
async function restore(source: Awaited<ReturnType<typeof archive>>) {
  const uploaded = await upload(source);
  expect(uploaded.status, await uploaded.clone().text()).toBe(201);
  const { id } = await uploaded.json();
  expect(
    (
      await post(`imports/${id}/confirm`, {
        contentVersion: (await read()).contentVersion,
        confirmed: true,
      })
    ).status,
  ).toBe(200);
}

async function populatedArchive() {
  await define();
  await edge();
  await save('original');
  await merge();
  await save('merged');
  await edge({ ...values, note: 'Privat anteckning' }, { sourceId: 'spare' });
  await define({ ...definition, name: 'Privat typnamn' });
  return archive();
}

test('archive 20 preserves relationship sections, fields and zero/false answers through private, saved and merged snapshots', async () => {
  const source = await populatedArchive();
  expect(source.manifest.schemaVersion).toBe(20);
  expect(source.content.relationshipTypeFields).toContainEqual({
    typeId: 'storage',
    fields: definition.fields,
    sections: definition.sections,
  });
  expect(source.content.relationships.find(({ id }) => id === 'edge')).toMatchObject({
    sourceId: 'spare',
    customValues: values,
  });
  const original = source.content.saves.find(({ operationId }) => operationId === 'original');
  const merged = source.content.saves.find(({ operationId }) => operationId === 'merged');
  const mergeSnapshot = merged?.receipt.changes.find(({ merge }) => merge)?.merge;
  const snapshots = [
    source.content.drafts[0].relationships[0].type,
    source.content.drafts[0].relationshipTypes[0].before,
    source.content.drafts[0].relationshipTypes[0].after,
    original?.receipt.relationshipTypes?.[0].after,
    original?.receipt.relationships?.[0].type,
    mergeSnapshot?.relationshipTypes[0],
    source.content.history
      .find(({ operationId }) => operationId === 'merged')
      ?.changes.find(({ merge }) => merge)?.merge?.relationshipTypes[0],
  ];
  for (const snapshot of snapshots)
    expect(snapshot).toMatchObject({ fields: definition.fields, sections: definition.sections });
  expect(original?.receipt.relationships?.[0].after?.customValues).toEqual(values);
  expect(mergeSnapshot?.relationships[0].customValues).toEqual(values);
  expect(source.content.drafts[0].relationships[0].after?.customValues).toEqual({
    ...values,
    note: 'Privat anteckning',
  });
  await restore(source);
  const imported = await read();
  expect(imported.relationships.find(({ id }) => id === 'edge')).toMatchObject({
    customValues: values,
  });
  expect(imported.relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject(definition);
  expect(imported.draft.relationships?.[0].after?.customValues).toEqual({
    ...values,
    note: 'Privat anteckning',
  });
  const exported = await archive();
  expect(exported.content.drafts).toEqual(source.content.drafts);
  expect(exported.content.saves).toEqual(source.content.saves);
  expect(exported.content.history).toEqual(source.content.history);
});

test('malformed current and nested relationship fields or values cannot replace any live content', async () => {
  const source = await populatedArchive();
  const before = await read();
  const access = await (await client.request('/api/bootstrap')).json();
  const original = source.content.saves.find(({ operationId }) => operationId === 'original');
  const merged = source.content.saves.find(({ operationId }) => operationId === 'merged');
  const receiptMerge = merged?.receipt.changes.find(({ merge }) => merge)?.merge;
  const historyMerge = source.content.history
    .find(({ operationId }) => operationId === 'merged')
    ?.changes.find(({ merge }) => merge)?.merge;
  const definitions = [
    source.content.relationshipTypeFields.find(({ typeId }) => typeId === 'storage'),
    source.content.drafts[0].relationships[0].type,
    source.content.drafts[0].relationshipTypes[0].before,
    source.content.drafts[0].relationshipTypes[0].after,
    original?.receipt.relationshipTypes?.[0].after,
    original?.receipt.relationships?.[0].type,
    receiptMerge?.relationshipTypes[0],
    historyMerge?.relationshipTypes[0],
  ];
  for (const snapshot of definitions) {
    if (!snapshot?.fields) throw new Error('The exported definition must retain its fields.');
    const id = snapshot.fields[1].id;
    snapshot.fields[1].id = snapshot.fields[0].id;
    expect((await upload(source)).status).toBe(400);
    expect(await read()).toEqual(before);
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(access);
    snapshot.fields[1].id = id;
    const placement = snapshot.fields[0].sectionId;
    snapshot.fields[0].sectionId = 'missing-section';
    expect((await upload(source)).status).toBe(400);
    expect(await read()).toEqual(before);
    snapshot.fields[0].sectionId = placement;
    if (!snapshot.sections) throw new Error('The definition must retain sections.');
    snapshot.sections.push({ ...snapshot.sections[0] });
    expect((await upload(source)).status).toBe(400);
    expect(await read()).toEqual(before);
    snapshot.sections.pop();
  }
  const answers = [
    source.content.relationships.find(({ id }) => id === 'edge')?.customValues,
    source.content.drafts[0].relationships[0].before?.customValues,
    source.content.drafts[0].relationships[0].after?.customValues,
    original?.receipt.relationships?.[0].after?.customValues,
    receiptMerge?.relationships[0].customValues,
    historyMerge?.relationships[0].customValues,
  ];
  for (const answer of answers) {
    if (!answer) throw new Error('The exported relationship must retain its answers.');
    answer.amount = '0';
    expect((await upload(source)).status).toBe(400);
    expect(await read()).toEqual(before);
    answer.amount = 0;
  }
  const row = source.content.relationshipTypeFields.find(({ typeId }) => typeId === 'storage');
  if (!row) throw new Error('The current definition must be exported.');
  row.typeId = 'missing-type';
  expect((await upload(source)).status).toBe(400);
  expect(await read()).toEqual(before);
  row.typeId = 'storage';
  expect((await archive()).content).toEqual(source.content);
});

test.each([14, 15, 16, 17, 18])(
  'legacy archive %i imports genuinely absent relationship field storage and answers without rewriting snapshots',
  async (schemaVersion) => {
    const { fields: _fields, sections: _sections, ...legacy } = definition;
    await define(legacy);
    await edge({});
    await save('legacy');
    await edge({}, { sourceId: 'spare' });
    await define({ ...legacy, description: 'Privat äldre beskrivning' });
    const source = await archive();
    source.manifest.schemaVersion = schemaVersion;
    Reflect.deleteProperty(source.content, 'relationshipTypeFields');
    for (const relationship of source.content.relationships) delete relationship.customValues;
    for (const row of source.content.objectTypeFields) delete row.sections;
    if (schemaVersion < 17) for (const object of source.content.objects) delete object.iconId;
    const saved = source.content.saves.find(({ operationId }) => operationId === 'legacy');
    const snapshots = [
      source.content.drafts[0].relationships[0].type,
      source.content.drafts[0].relationshipTypes[0].before,
      source.content.drafts[0].relationshipTypes[0].after,
      saved?.receipt.relationshipTypes?.[0].after,
      saved?.receipt.relationships?.[0].type,
    ];
    for (const snapshot of snapshots) {
      expect(snapshot).toBeTruthy();
      expect(snapshot).not.toHaveProperty('fields');
    }
    expect(saved?.receipt.relationships?.[0].after).not.toHaveProperty('customValues');
    expect(source.content.drafts[0].relationships[0].after).not.toHaveProperty('customValues');
    await restore(source);
    const imported = await read();
    const relationship = imported.relationships.find(({ id }) => id === 'edge');
    expect(relationship).toMatchObject({ typeId: 'storage', sourceId: 'bike', targetId: 'garage' });
    expect(relationship).not.toHaveProperty('customValues');
    expect(imported.relationshipTypes.find(({ id }) => id === 'storage')).not.toHaveProperty(
      'fields',
    );
    expect(imported.draft.relationships?.[0].after).toMatchObject({ sourceId: 'spare' });
    expect(imported.draft.relationships?.[0].after).not.toHaveProperty('customValues');
    const exported = await archive();
    expect(exported.content.relationshipTypeFields).toEqual([]);
    expect(exported.content.drafts).toEqual(source.content.drafts);
    expect(exported.content.saves).toEqual(source.content.saves);
    expect(exported.content.history).toEqual(source.content.history);
  },
);

test('erasing a former relationship type removes its values and snapshots while preserving current zero/false answers and independent private work', async () => {
  const oldDefinition = {
    ...definition,
    name: 'ERASE-DEFINITION-SENTINEL',
    sections: [{ id: 'old', name: 'ERASE-SECTION-SENTINEL' }],
    fields: [
      { id: 'note', name: 'ERASE-FIELD-SENTINEL', description: '', kind: 'text', sectionId: 'old' },
    ],
  };
  await define();
  await define(oldDefinition, 'old-storage');
  await edge({ note: 'ERASE-VALUE-SENTINEL' }, { typeId: 'old-storage' });
  await save('original');
  await merge();
  await save('merged');
  const state = await read();
  expect(
    (
      await post('map/relationship', {
        version: state.draft.version,
        id: 'edge',
        baseRevision: state.relationships[0].revision,
        value: {
          typeId: 'storage',
          sourceId: 'spare',
          targetId: 'garage',
          knowledge: 'known',
          lifecycle: 'ended',
          customValues: { ...values, note: 'Privat anteckning' },
        },
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.relationships?.[0].beforeType).toMatchObject(oldDefinition);
  fixture.setSubject('second-member');
  const member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (await post('invitations', { userId: user.id })).json();
  expect((await member.json('/api/invitations/accept', { code })).status).toBe(200);
  const theirs: MapState = await (await member.request(`${path}/map`)).json();
  expect(
    (
      await member.json(`${path}/map/relationship`, {
        version: theirs.draft.version,
        id: 'edge',
        baseRevision: theirs.relationships[0].revision,
        value: {
          typeId: 'storage',
          sourceId: 'spare',
          targetId: 'garage',
          knowledge: 'known',
          customValues: values,
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await member.json(`${path}/map/save`, {
        version: theirs.draft.version + 1,
        contentVersion: theirs.contentVersion,
        operationId: 'current-meaning',
      })
    ).status,
  ).toBe(200);
  const selection = [{ kind: 'relationshipType', id: 'old-storage' }];
  const review = await post('erasure/review', { selection });
  expect(review.status).toBe(200);
  const { token } = await review.json();
  expect(
    (
      await post('erasure/execute', {
        selection,
        token,
        operationId: 'erase-old-meaning',
        confirmation: 'RADERA PERMANENT',
      })
    ).status,
  ).toBe(200);
  const remaining = await read();
  expect(remaining.relationships).toEqual([
    expect.objectContaining({ id: 'edge', typeId: 'storage', customValues: values }),
  ]);
  expect(remaining.relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject(definition);
  expect(remaining.relationshipTypes.some(({ id }) => id === 'old-storage')).toBe(false);
  expect(remaining.draft.relationships).toHaveLength(1);
  expect(remaining.draft.relationships?.[0]).toMatchObject({
    type: definition,
    before: { typeId: 'storage', customValues: values },
    after: { typeId: 'storage', customValues: values, lifecycle: 'ended' },
  });
  expect(remaining.draft.relationships?.[0]).not.toHaveProperty('beforeType');
  const exported = await archive();
  expect(JSON.stringify(exported.content)).not.toContain('ERASE-');
  expect(JSON.stringify(exported.content)).not.toContain('old-storage');
  expect(exported.content.relationshipTypeFields).toContainEqual({
    typeId: 'storage',
    fields: definition.fields,
    sections: definition.sections,
  });
  expect(exported.content.relationships[0].customValues).toEqual(values);
  const mergeSnapshots = [
    exported.content.saves
      .find(({ operationId }) => operationId === 'merged')
      ?.receipt.changes.find(({ merge }) => merge)?.merge,
    exported.content.history
      .find(({ operationId }) => operationId === 'merged')
      ?.changes.find(({ merge }) => merge)?.merge,
  ];
  for (const snapshot of mergeSnapshots) {
    expect(snapshot).toBeTruthy();
    expect(snapshot?.relationshipTypes).toEqual([]);
    expect(snapshot?.relationships).toEqual([]);
  }
  await restore(exported);
  expect((await read()).draft.relationships).toEqual(remaining.draft.relationships);
  expect((await read()).relationships).toEqual(remaining.relationships);
});

test('archive 19 preserves genuine absence of relationship sections and placement, including private and historical snapshots', async () => {
  const { sections: _sections, ...base } = definition;
  const legacy = {
    ...base,
    fields: base.fields.map(({ sectionId: _placement, ...field }) => field),
  };
  await define(legacy);
  await edge();
  await save('legacy-fields');
  await edge({ ...values, note: 'Privat anteckning' });
  await define({ ...legacy, description: 'Äldre privat definition' });
  const source = await archive();
  source.manifest.schemaVersion = 19;
  for (const row of source.content.relationshipTypeFields) delete row.sections;
  const snapshots = [
    source.content.drafts[0].relationships[0].type,
    source.content.drafts[0].relationshipTypes[0].before,
    source.content.drafts[0].relationshipTypes[0].after,
    source.content.saves.find(({ operationId }) => operationId === 'legacy-fields')?.receipt
      .relationshipTypes?.[0].after,
  ];
  for (const snapshot of snapshots) {
    expect(snapshot).toBeTruthy();
    expect(snapshot).not.toHaveProperty('sections');
    for (const field of snapshot?.fields ?? []) expect(field).not.toHaveProperty('sectionId');
  }
  await restore(source);
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject(legacy);
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).not.toHaveProperty(
    'sections',
  );
  expect((await read()).relationships[0].customValues).toEqual(values);
  const exported = await archive();
  expect(exported.content.drafts).toEqual(source.content.drafts);
  expect(exported.content.saves).toEqual(source.content.saves);
  expect(exported.content.history).toEqual(source.content.history);
});
