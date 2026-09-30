import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const fields = [
  { id: 'note', name: 'Anteckning', description: '', kind: 'text' },
  { id: 'amount', name: 'Belopp', description: '', kind: 'number' },
  { id: 'start', name: 'Startdatum', description: '', kind: 'date' },
  { id: 'active', name: 'Bekräftat', description: '', kind: 'boolean' },
  { id: 'unanswered', name: 'Obesvarat', description: '', kind: 'boolean' },
];
const definition = {
  name: 'Förvaring',
  description: 'Förvaringsplats',
  forwardLabel: 'förvaras i',
  reverseLabel: 'innehåller',
  fields,
};
const values = { note: 'Låst skåp', amount: 0, start: '2026-09-27', active: false };
const read = async (): Promise<MapState> => (await client.request(path)).json();
const post = (route: string, body: unknown) => client.json(`${path}/${route}`, body);
const define = async (value: unknown = definition, baseRevision: number | null = null) =>
  post('relationship-type', {
    version: (await read()).draft.version,
    id: 'storage',
    baseRevision,
    value,
  });
const edge = async (customValues?: unknown, baseRevision: number | null = null) =>
  post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
    baseRevision,
    value: {
      typeId: 'storage',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues,
    },
  });
const save = async (operationId: string) =>
  post('save', { version: (await read()).draft.version, operationId });

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
  for (const id of ['bike', 'garage']) {
    const state = await read();
    await post('draft', {
      id,
      version: state.draft.version,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id, description: '' },
    });
  }
  await save('objects');
});
afterEach(() => fixture.close());

async function otherMember() {
  const member = fixture.client();
  fixture.setSubject('second-member');
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await member.json('/api/invitations/accept', { code });
  return member;
}

test('relationship definitions and four optional values share the atomic draft, receipt and history', async () => {
  expect((await define()).status).toBe(200);
  expect((await edge(values)).status).toBe(200);
  const draft = (await read()).draft;
  expect(draft.relationshipTypes?.[0].after).toMatchObject(definition);
  expect(draft.relationships?.[0].after).toMatchObject({ customValues: values });
  const response = await save('fields');
  expect(response.status).toBe(200);
  const { receipt } = await response.json();
  expect(receipt.relationshipTypes[0].after).toMatchObject(definition);
  expect(receipt.relationships[0].after.customValues).toEqual(values);
  expect((await read()).relationships[0]).toMatchObject({ customValues: values });
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(
    history.find((item: { operationId: string }) => item.operationId === 'fields').relationships[0]
      .after.customValues,
  ).toEqual(values);
  expect(
    (
      await define(
        {
          name: 'Förvaring',
          description: 'Äldre klient',
          forwardLabel: 'förvaras i',
          reverseLabel: 'innehåller',
        },
        1,
      )
    ).status,
  ).toBe(200);
  expect((await edge(undefined, 1)).status).toBe(200);
  expect((await save('legacy-edit')).status).toBe(200);
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject({
    fields,
  });
  expect((await read()).relationships[0]).toMatchObject({ customValues: values });
  expect((await edge({}, 2)).status).toBe(200);
  expect((await save('clear')).status).toBe(200);
  expect((await read()).relationships[0].customValues).toBeUndefined();
});

test('invalid relationship fields and values reject the complete request without changing the draft', async () => {
  const before = await read();
  for (const invalid of [
    null,
    {},
    [...fields, fields[0]],
    [{ ...fields[0], id: '__proto__' }],
    [{ ...fields[0], kind: 'money' }],
    [{ ...fields[0], name: ' ' }],
  ]) {
    expect((await define({ ...definition, fields: invalid })).status).toBe(400);
    expect(await read()).toEqual(before);
  }
  await define();
  const defined = await read();
  for (const invalid of [
    null,
    [],
    { missing: 'value' },
    { amount: '0' },
    { active: 0 },
    { start: '2026-02-30' },
    { note: 'x'.repeat(2001) },
  ]) {
    expect((await edge(invalid)).status).toBe(400);
    expect(await read()).toEqual(defined);
  }
});

test('duplicate selection validates supplied custom answers before retaining the existing relationship', async () => {
  await define();
  await edge(values);
  await save('initial');
  const before = await read();
  const proposal = {
    version: before.draft.version,
    id: 'duplicate',
    baseRevision: null,
    value: {
      typeId: 'storage',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { amount: 'not a number' },
    },
  };
  expect((await post('relationship', proposal)).status).toBe(400);
  expect(await read()).toEqual(before);
  const selected = await post('relationship', {
    ...proposal,
    value: { ...proposal.value, customValues: values },
  });
  expect(selected.status).toBe(200);
  expect(await selected.json()).toMatchObject({ existingId: 'edge' });
  expect(await read()).toEqual(before);
});

test('cancelling and undoing object merges preserve relationship answers and original endpoints', async () => {
  const arranged = {
    ...definition,
    sections: [{ id: 'facts', name: 'Uppgifter' }],
    fields: fields.map((field) => ({ ...field, sectionId: field.id === 'amount' ? '' : 'facts' })),
  };
  await define(arranged);
  await edge(values);
  await post('draft', {
    version: (await read()).draft.version,
    id: 'spare',
    baseRevision: null,
    value: { typeId: (await read()).objects[0].typeId, name: 'spare', description: '' },
  });
  await save('initial');
  const merge = async () => {
    const state = await read();
    const response = await post('merge', {
      version: state.draft.version,
      survivorId: 'spare',
      absorbedId: 'bike',
      identityConfirmed: true,
      reviewed: {
        objects: ['spare', 'bike'].map((id) => state.objects.find((object) => object.id === id)),
        relationships: state.relationships,
        types: state.types.filter(({ id }) => id === state.objects[0].typeId),
        relationshipTypes: state.relationshipTypes.filter(({ id }) => id === 'storage'),
      },
      choices: { name: 'survivor' },
      relationships: [{ id: 'edge', action: 'keep' }],
    });
    expect(response.status, await response.clone().text()).toBe(200);
  };
  await merge();
  expect((await read()).draft.changes[0].merge?.relationshipTypes[0]).toMatchObject(arranged);
  expect((await read()).draft.relationships?.[0].type).toMatchObject(arranged);
  expect((await read()).draft.relationships?.[0].after).toMatchObject({
    sourceId: 'spare',
    customValues: values,
  });
  expect(
    (
      await post('discard-change', {
        version: (await read()).draft.version,
        kind: 'object',
        id: 'spare',
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.relationships ?? []).toEqual([]);
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject(
    arranged,
  );
  expect((await read()).relationships[0]).toMatchObject({ sourceId: 'bike', customValues: values });
  await merge();
  const { receipt } = await (await save('merged')).json();
  expect((await read()).relationships[0]).toMatchObject({
    sourceId: 'spare',
    customValues: values,
  });
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        userId: receipt.userId,
        operationId: receipt.operationId,
      })
    ).status,
  ).toBe(200);
  expect((await save('undo-merge')).status).toBe(200);
  expect((await read()).relationships[0]).toMatchObject({ sourceId: 'bike', customValues: values });
  expect((await read()).objects.map(({ id }) => id)).toEqual(['bike', 'garage', 'spare']);
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject(
    arranged,
  );
});

test('used relationship field removal and kind changes are denied without disclosing a private draft', async () => {
  await define();
  await save('definition');
  const member = fixture.client();
  fixture.setSubject('member');
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await member.json('/api/invitations/accept', { code });
  expect(
    (await define({ ...definition, fields: fields.filter(({ id }) => id !== 'note') }, 1)).status,
  ).toBe(200);
  expect(
    (
      await member.json(`${path}/relationship`, {
        version: 0,
        id: 'private-edge',
        baseRevision: null,
        value: {
          typeId: 'storage',
          sourceId: 'bike',
          targetId: 'garage',
          knowledge: 'known',
          customValues: { note: 'Hemlig uppgift' },
        },
      })
    ).status,
  ).toBe(200);
  const before = await read();
  const rejected = await save('later-private-use');
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toEqual({ error: 'field_in_use' });
  expect(await read()).toEqual(before);
  await post('discard', { version: before.draft.version });
  const changed = await define(
    {
      ...definition,
      fields: fields.map((field) => (field.id === 'note' ? { ...field, kind: 'number' } : field)),
    },
    1,
  );
  expect(changed.status).toBe(409);
  expect(await changed.json()).toEqual({ error: 'field_kind_in_use' });
  expect(JSON.stringify(await read())).not.toContain('Hemlig uppgift');
});

test('relationship field kind changes are checked against pending definitions, the own draft and saved values', async () => {
  const noteAs = (kind: string) => ({
    ...definition,
    fields: fields.map((field) => (field.id === 'note' ? { ...field, kind } : field)),
  });
  const expectKindInUse = async (response: Response) => {
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'field_kind_in_use' });
  };
  await define();
  expect((await save('definition')).status).toBe(200);
  const member = await otherMember();
  expect(
    (
      await member.json(`${path}/relationship-type`, {
        version: 0,
        id: 'storage',
        baseRevision: 1,
        value: noteAs('date'),
      })
    ).status,
  ).toBe(200);
  await expectKindInUse(await define(noteAs('number'), 1));
  const memberState: MapState = await (await member.request(path)).json();
  await member.json(`${path}/discard`, { version: memberState.draft.version });
  expect((await edge({ note: 'Låst skåp' })).status).toBe(200);
  await expectKindInUse(await define(noteAs('number'), 1));
  expect((await save('edge')).status).toBe(200);
  await expectKindInUse(await define(noteAs('number'), 1));
  const saved = (await read()).relationships.find(({ id }) => id === 'edge');
  expect((await edge({ amount: 1 }, saved?.revision)).status).toBe(200);
  expect((await define(noteAs('number'), 1)).status).toBe(200);
  const memberDraft: MapState = await (await member.request(path)).json();
  expect(
    (
      await member.json(`${path}/relationship`, {
        version: memberDraft.draft.version,
        id: 'member-edge',
        baseRevision: null,
        value: {
          typeId: 'storage',
          sourceId: 'garage',
          targetId: 'bike',
          knowledge: 'known',
          customValues: { note: 'Hyllan' },
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await member.json(`${path}/save`, {
        version: memberDraft.draft.version + 1,
        operationId: 'member-note',
      })
    ).status,
  ).toBe(200);
  const before = await read();
  await expectKindInUse(await save('kind-change'));
  expect(await read()).toEqual(before);
  expect(before.relationshipTypes.find(({ id }) => id === 'storage')?.fields?.[0].kind).toBe(
    'text',
  );
});

test('relationship conflict resolution and undo retain independently changed values and field names', async () => {
  await define();
  await edge(values);
  await save('initial');
  const member = await otherMember();
  await edge({ ...values, note: 'Min anteckning' }, 1);
  await member.json(`${path}/relationship`, {
    version: 0,
    id: 'edge',
    baseRevision: 1,
    value: {
      typeId: 'storage',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { ...values, amount: 12 },
    },
  });
  await member.json(`${path}/save`, { version: 1, operationId: 'their-value' });
  expect((await save('stale')).status).toBe(409);
  const state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: { kind: 'relationship', id: 'edge', current: state.relationships[0] },
      })
    ).status,
  ).toBe(200);
  const saved = await save('my-value');
  const { receipt } = await saved.json();
  expect((await read()).relationships[0].customValues).toEqual({
    ...values,
    note: 'Min anteckning',
    amount: 12,
  });
  await edge({ ...values, note: 'Min anteckning', amount: 15 }, 3);
  await save('later-value');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: 'my-value',
        userId: receipt.userId,
      })
    ).status,
  ).toBe(200);
  expect((await save('undone')).status).toBe(200);
  expect((await read()).relationships[0].customValues).toEqual({ ...values, amount: 15 });
  await define(
    {
      ...definition,
      fields: fields.map((field) =>
        field.id === 'note' ? { ...field, name: 'Min rubrik' } : field,
      ),
    },
    1,
  );
  const theirs = await (await member.request(path)).json();
  await member.json(`${path}/relationship-type`, {
    version: theirs.draft.version,
    id: 'storage',
    baseRevision: 1,
    value: {
      ...definition,
      fields: fields.map((field) =>
        field.id === 'amount' ? { ...field, name: 'Ny summa' } : field,
      ),
    },
  });
  await member.json(`${path}/save`, {
    version: theirs.draft.version + 1,
    operationId: 'their-name',
  });
  const conflict = await read();
  expect(
    (
      await post('resolve', {
        version: conflict.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'relationshipType',
          id: 'storage',
          current: conflict.relationshipTypes.find(({ id }) => id === 'storage'),
        },
      })
    ).status,
  ).toBe(200);
  expect((await save('both-names')).status).toBe(200);
  expect(
    (await read()).relationshipTypes
      .find(({ id }) => id === 'storage')
      ?.fields?.slice(0, 2)
      .map(({ name }) => name),
  ).toEqual(['Min rubrik', 'Ny summa']);
});

test('restoring a removed relationship restores its historical fields alongside current independent definitions', async () => {
  await define();
  await edge(values);
  await save('initial');
  await post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
    baseRevision: 1,
    value: null,
  });
  const { receipt } = await (await save('removed-edge')).json();
  const extra = { id: 'extra', name: 'Ny uppgift', description: '', kind: 'text' };
  expect((await define({ ...definition, fields: [extra] }, 1)).status).toBe(200);
  await save('removed-fields');
  const undone = await post('undo', {
    version: (await read()).draft.version,
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
  expect(undone.status, await undone.clone().text()).toBe(200);
  const state = await read();
  expect(state.draft.relationships?.[0].after?.customValues).toEqual(values);
  expect(state.draft.relationshipTypes?.[0].after?.fields?.map(({ id }) => id)).toEqual([
    'extra',
    'note',
    'amount',
    'start',
    'active',
  ]);
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'relationshipType',
          id: 'storage',
          current: state.relationshipTypes.find(({ id }) => id === 'storage'),
        },
      })
    ).status,
  ).toBe(200);
  expect((await save('restored')).status).toBe(200);
  expect((await read()).relationships[0].customValues).toEqual(values);
});

test('undoing a relationship type change restores only its own type values while preserving later lifecycle facts', async () => {
  await define();
  await edge(values);
  await save('initial');
  const otherType = (await read()).relationshipTypes.find(({ id }) => id !== 'storage');
  if (!otherType) throw new Error('A prefilled relationship type is required.');
  const member = await otherMember();
  expect(
    (
      await member.json(`${path}/relationship-type`, {
        version: 0,
        id: otherType.id,
        baseRevision: otherType.revision,
        value: { ...definition, name: 'Annan betydelse', fields: [fields[0]] },
      })
    ).status,
  ).toBe(200);
  expect(
    (await member.json(`${path}/save`, { version: 1, operationId: 'prefill-fields' })).status,
  ).toBe(200);
  const propose = async (customValues: unknown, baseRevision: number, extra = {}) =>
    post('relationship', {
      version: (await read()).draft.version,
      id: 'edge',
      baseRevision,
      value: {
        typeId: otherType.id,
        sourceId: 'bike',
        targetId: 'garage',
        knowledge: 'known',
        customValues,
        ...extra,
      },
    });
  expect((await propose(undefined, 1)).status).toBe(400);
  expect((await propose({ note: 'Ny betydelse' }, 1)).status).toBe(200);
  const { receipt } = await (await save('changed-type')).json();
  expect(receipt.relationships[0].beforeType).toMatchObject({ id: 'storage', fields });
  expect((await propose({ note: 'Ny betydelse' }, 2, { lifecycle: 'ended' })).status).toBe(200);
  await save('ended');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        userId: receipt.userId,
        operationId: receipt.operationId,
      })
    ).status,
  ).toBe(200);
  expect((await save('undo-type')).status).toBe(200);
  expect((await read()).relationships[0]).toMatchObject({
    typeId: 'storage',
    customValues: values,
    lifecycle: 'ended',
  });
});
