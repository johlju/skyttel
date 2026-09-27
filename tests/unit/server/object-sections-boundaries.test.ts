import { createHash } from 'node:crypto';
import { type APIRequestContext, request } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { ImportContent } from '../../../src/server/import-schema.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
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

test('archive 18 preserves section order and hidden values in current, private, history and merged snapshots', async () => {
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
  expect(source.manifest.schemaVersion).toBe(19);
  expect(source.content.objectTypeFields.find(({ typeId }) => typeId === 'solar')).toMatchObject({
    fields: definition.fields,
    sections: definition.sections,
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
    expect(snapshot).toMatchObject({ fields: definition.fields, sections: definition.sections });
  const before = await read();
  // Invalid placements must be rejected in every nested type, without replacing live content.
  for (const snapshot of snapshots) {
    if (!snapshot?.fields) throw new Error('The arranged snapshot must retain its fields.');
    const placement = snapshot.fields[0].sectionId;
    snapshot.fields[0].sectionId = 'missing-section';
    expect((await upload(source)).status()).toBe(400);
    expect(await read()).toEqual(before);
    snapshot.fields[0].sectionId = placement;
  }
  const row = source.content.objectTypeFields.find(({ typeId }) => typeId === 'solar');
  if (!row?.sections) throw new Error('The current type must retain its sections.');
  row.sections.push({ ...row.sections[0] });
  expect((await upload(source)).status()).toBe(400);
  expect(await read()).toEqual(before);
  row.sections.pop();
  await restore(source);
  await installation.restart();
  const imported = await read();
  expect(imported.types.find(({ id }) => id === 'solar')).toMatchObject(definition);
  expect(imported.objects.find(({ id }) => id === 'first')).toMatchObject({
    customValues: values,
    iconId: 'bike',
  });
  expect(imported.draft.changes[0]).toMatchObject({
    after: { description: 'Privat text', customValues: values, iconId: 'bike' },
    type: { fields: definition.fields, sections: definition.sections },
  });
  const exported = await archive();
  expect(
    exported.content.saves.map(({ receipt }) => receipt.changes.map(({ type }) => type)),
  ).toEqual(source.content.saves.map(({ receipt }) => receipt.changes.map(({ type }) => type)));
});

test.each([14, 15, 16, 17])(
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
    for (const row of source.content.objectTypeFields) delete row.sections;
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
