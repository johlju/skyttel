import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type {
  CustomField,
  MapState,
  ObjectType,
  ObjectValue,
  SaveReceipt,
} from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
let typeId: string;
const serial: CustomField = {
  id: 'serial',
  name: 'Serienummer',
  description: 'Tillverkarens uppgift',
  kind: 'text',
};
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = client) => actor.json(`${path}/${route}`, body);
async function define(update: Partial<ObjectType>, actor = client) {
  const state = await read(actor);
  const before = state.types.find((type) => type.id === typeId);
  const own = state.draft.objectTypes?.find((type) => type.id === typeId);
  const response = await post(
    'object-type',
    {
      version: state.draft.version,
      id: typeId,
      baseRevision: before?.revision ?? null,
      value: { ...before, ...own?.after, fields: [], ...update },
    },
    actor,
  );
  expect(response.status, await response.text()).toBe(200);
}
async function object(id: string, update: Partial<ObjectValue> | null, actor = client) {
  const state = await read(actor);
  const before = state.objects.find((item) => item.id === id);
  const response = await post(
    'draft',
    {
      version: state.draft.version,
      id,
      baseRevision: before?.revision ?? null,
      value: update === null ? null : { name: id, description: '', typeId, ...before, ...update },
    },
    actor,
  );
  expect(response.status, await response.text()).toBe(200);
}
async function save(operationId: string, actor = client): Promise<SaveReceipt> {
  const response = await post(
    'save',
    { version: (await read(actor)).draft.version, operationId },
    actor,
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.receipt;
}
const undo = async (receipt: SaveReceipt) =>
  post('undo', {
    version: (await read()).draft.version,
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
async function member() {
  fixture.setSubject('second-person');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  return actor;
}

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
  typeId = (await read()).types[0].id;
});
afterEach(() => fixture.close());

test('a whole-save inverse removes its only field use before changing the field kind', async () => {
  await define({ fields: [serial] });
  await save('text-field');
  await define({ fields: [{ ...serial, kind: 'number' }] });
  await object('valued', { customValues: { serial: 1 } });
  const selected = await save('number-and-object');
  const response = await undo(selected);
  expect(response.status, await response.text()).toBe(200);
  expect(draftConflicts(await read())).toEqual([]);
  await save('undo-number-and-object');
  const state = await read();
  expect(state.objects).toEqual([]);
  expect(state.types.find((type) => type.id === typeId)?.fields).toEqual([serial]);
});

test('restoring a deleted object restores its missing field through an explicit definition choice', async () => {
  await define({ fields: [serial] });
  const addition = await save('field');
  await object('valued', { customValues: { serial: 'SYNTH-1' } });
  await save('object');
  await object('valued', null);
  const deletion = await save('delete');
  expect((await undo(addition)).status).toBe(200);
  await save('remove-field');
  const height: CustomField = { id: 'height', name: 'Höjd', description: '', kind: 'number' };
  await define({ name: 'Senare typnamn', fields: [height] });
  await save('independent-catalog');
  await define({ description: 'Oberoende privat beskrivning', fields: [height] });
  const response = await undo(deletion);
  expect(response.status, await response.text()).toBe(200);
  let state = await read();
  expect(draftConflicts(state)).toEqual([
    expect.objectContaining({ kind: 'objectType', id: typeId }),
  ]);
  expect(state.draft.objectTypes?.[0].after).toMatchObject({
    name: 'Senare typnamn',
    description: 'Oberoende privat beskrivning',
    fields: expect.arrayContaining([serial, height]),
  });
  expect(state.draft.changes[0].type.fields).toEqual(expect.arrayContaining([serial, height]));
  expect(
    (await post('save', { version: state.draft.version, operationId: 'needs-review' })).status,
  ).toBe(409);
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  state = await read();
  expect(draftConflicts(state)).toEqual([]);
  await save('restore-reviewed');
  state = await read();
  expect(state.objects[0]).toMatchObject({ id: 'valued', customValues: { serial: 'SYNTH-1' } });
  expect(state.types.find((type) => type.id === typeId)).toMatchObject({
    name: 'Senare typnamn',
    description: 'Oberoende privat beskrivning',
    fields: expect.arrayContaining([serial, height]),
  });
});

test.each(['proposed', 'saved'] as const)(
  'restoring values after a kind change supports the %s definition choice without conversion',
  async (choice) => {
    await define({ fields: [{ ...serial, kind: 'number' }] });
    await save('number-field');
    await object('valued', { customValues: { serial: 42 } });
    await save('object');
    await object('valued', null);
    const deletion = await save('delete');
    await define({ fields: [{ ...serial, name: 'Senare fältnamn' }] });
    await save('unused-now-text');
    await define({
      description: 'Oberoende privat beskrivning',
      fields: [{ ...serial, name: 'Senare fältnamn' }],
    });
    const response = await undo(deletion);
    expect(response.status, await response.text()).toBe(200);
    let state = await read();
    expect(draftConflicts(state)).toEqual([
      expect.objectContaining({ kind: 'objectType', id: typeId }),
    ]);
    const resolved = await post('resolve', {
      version: state.draft.version,
      conflict: draftConflicts(state)[0],
      choice,
    });
    expect(resolved.status, await resolved.text()).toBe(200);
    state = await read();
    expect(state.draft.changes[0].after?.customValues).toEqual({ serial: 42 });
    if (choice === 'saved') {
      expect(draftConflicts(state)).toEqual([
        expect.objectContaining({ kind: 'object', id: 'valued' }),
      ]);
      expect(
        (await post('save', { version: state.draft.version, operationId: 'incompatible' })).status,
      ).toBe(409);
      expect(
        (
          await post('resolve', {
            version: state.draft.version,
            conflict: draftConflicts(state)[0],
            choice: 'saved',
          })
        ).status,
      ).toBe(200);
      expect((await read()).draft.changes).toEqual([]);
      await save('keep-independent');
      expect((await read()).types.find((type) => type.id === typeId)?.description).toBe(
        'Oberoende privat beskrivning',
      );
    } else {
      expect(draftConflicts(state)).toEqual([]);
      await save('restore-reviewed');
      state = await read();
      expect(state.objects[0].customValues).toEqual({ serial: 42 });
      expect(state.types.find((type) => type.id === typeId)?.fields).toEqual([
        { ...serial, name: 'Senare fältnamn', kind: 'number' },
      ]);
    }
  },
);

test.each(['saved', 'private'] as const)(
  'a whole-save inverse preserves a later %s field use and leaves the draft unchanged',
  async (location) => {
    await define({ fields: [serial] });
    await save('text-field');
    await define({ fields: [{ ...serial, kind: 'number' }] });
    await object('valued', { customValues: { serial: 1 } });
    const selected = await save('number-and-object');
    const actor = await member();
    await object('later', { customValues: { serial: 2 } }, actor);
    if (location === 'saved') await save('later-use', actor);
    await object('independent', {});
    const before = await read();
    const response = await undo(selected);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'field_kind_in_use' });
    expect(await read()).toEqual(before);
  },
);

test('a currently used incompatible kind is a reviewable restoration conflict and cannot be overwritten', async () => {
  await define({ fields: [{ ...serial, kind: 'number' }] });
  await save('number-field');
  await object('valued', { customValues: { serial: 42 } });
  await save('object');
  await object('valued', null);
  const deletion = await save('delete');
  await define({ fields: [serial] });
  await object('later', { customValues: { serial: 'SYNTH-2' } });
  await save('text-and-later');
  const response = await undo(deletion);
  expect(response.status, await response.text()).toBe(200);
  const before = await read();
  const conflict = draftConflicts(before)[0];
  expect(conflict).toMatchObject({ kind: 'objectType', id: typeId });
  const resolved = await post('resolve', {
    version: before.draft.version,
    conflict,
    choice: 'proposed',
  });
  expect(resolved.status).toBe(409);
  expect(await resolved.json()).toEqual({ error: 'field_kind_in_use' });
  expect(await read()).toEqual(before);
  expect(
    (await post('resolve', { version: before.draft.version, conflict, choice: 'saved' })).status,
  ).toBe(200);
  expect(draftConflicts(await read())).toEqual([
    expect.objectContaining({ kind: 'object', id: 'valued' }),
  ]);
  expect((await read()).objects[0].customValues).toEqual({ serial: 'SYNTH-2' });
});

test('a later private use rejects a reviewed restoration save atomically', async () => {
  await define({ fields: [{ ...serial, kind: 'number' }] });
  await save('number-field');
  await object('valued', { customValues: { serial: 42 } });
  await save('object');
  await object('valued', null);
  const deletion = await save('delete');
  await define({ fields: [serial] });
  await save('unused-now-text');
  expect((await undo(deletion)).status).toBe(200);
  let state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  const actor = await member();
  await object('private', { customValues: { serial: 'SYNTH-PRIVATE' } }, actor);
  state = await read();
  const response = await post('save', {
    version: state.draft.version,
    operationId: 'blocked-restore',
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'field_kind_in_use' });
  expect(await read()).toEqual(state);
  expect((await read()).objects).toEqual([]);
  expect((await read()).types.find((type) => type.id === typeId)?.fields).toEqual([serial]);
});

test('restoration cannot reinterpret an incompatible value already in the own private draft', async () => {
  await define({ fields: [{ ...serial, kind: 'number' }] });
  await save('number-field');
  await object('valued', { customValues: { serial: 42 } });
  await save('object');
  await object('valued', null);
  const deletion = await save('delete');
  await define({ fields: [serial] });
  await save('unused-now-text');
  await object('private', { customValues: { serial: 'SYNTH-PRIVATE' } });
  const before = await read();
  const response = await undo(deletion);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'undo_draft_overlap' });
  expect(await read()).toEqual(before);
});

test.each(['same-kind', 'different-kind'] as const)(
  'an overlapping %s private field proposal blocks the complete restoration',
  async (overlap) => {
    await define({ fields: [serial] });
    const addition = await save('field');
    await object('valued', { customValues: { serial: 'SYNTH-1' } });
    await save('object');
    await object('valued', null);
    const deletion = await save('delete');
    expect((await undo(addition)).status).toBe(200);
    await save('remove-field');
    await define({ fields: [{ ...serial, kind: overlap === 'same-kind' ? 'text' : 'boolean' }] });
    await object('independent', {});
    const before = await read();
    const response = await undo(deletion);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'undo_draft_overlap' });
    expect(await read()).toEqual(before);
  },
);

test('undoing an independent object name preserves a later field kind and value', async () => {
  await define({ fields: [serial] });
  await object('valued', { customValues: { serial: 'SYNTH-1' } });
  await save('initial');
  await object('valued', { name: 'Nytt namn' });
  const rename = await save('rename');
  await object('valued', { customValues: {} });
  await save('remove-value');
  await define({ fields: [{ ...serial, kind: 'number' }] });
  await object('valued', { customValues: { serial: 42 } });
  await save('new-meaning');
  expect((await undo(rename)).status).toBe(200);
  expect(draftConflicts(await read())).toEqual([]);
  await save('undo-name');
  expect((await read()).objects[0]).toMatchObject({ name: 'valued', customValues: { serial: 42 } });
});

test('one definition choice covers all missing fields needed by the whole restoration', async () => {
  const height: CustomField = { id: 'height', name: 'Höjd', description: '', kind: 'number' };
  await define({ fields: [serial, height] });
  const addition = await save('fields');
  await object('serial-object', { customValues: { serial: 'SYNTH-1' } });
  await object('height-object', { customValues: { height: 10 } });
  await save('objects');
  await object('serial-object', null);
  await object('height-object', null);
  const deletion = await save('delete-both');
  expect((await undo(addition)).status).toBe(200);
  await save('remove-fields');
  await define({ description: 'Oberoende privat beskrivning' });
  expect((await undo(deletion)).status).toBe(200);
  const state = await read();
  expect(draftConflicts(state)).toHaveLength(1);
  expect(state.draft.objectTypes?.[0].after?.fields).toEqual(
    expect.arrayContaining([serial, height]),
  );
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'saved',
      })
    ).status,
  ).toBe(200);
  const reviewed = await read();
  expect(reviewed.draft.objectTypes?.[0].after).toMatchObject({
    description: 'Oberoende privat beskrivning',
  });
  expect(reviewed.draft.objectTypes?.[0].after?.fields).toBeUndefined();
  expect(
    draftConflicts(reviewed)
      .map((conflict) => conflict.id)
      .sort(),
  ).toEqual(['height-object', 'serial-object']);
});

test('a removed type restores the historical field kind required by a deleted object', async () => {
  typeId = 'historic-type';
  await define({ name: 'Egen typ', description: '', fields: [{ ...serial, kind: 'number' }] });
  const addition = await save('type');
  await object('valued', { customValues: { serial: 42 } });
  await save('object');
  await object('valued', null);
  const deletion = await save('delete');
  await define({ fields: [serial] });
  await save('now-text');
  expect((await undo(addition)).status).toBe(200);
  const state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  await save('remove-type');
  expect((await undo(deletion)).status).toBe(200);
  expect(draftConflicts(await read())).toEqual([]);
  await save('restore');
  const restored = await read();
  expect(restored.objects[0].customValues).toEqual({ serial: 42 });
  expect(restored.types.find((type) => type.id === typeId)?.fields).toEqual([
    { ...serial, kind: 'number' },
  ]);
});

test('restoring a removed type cannot reinterpret another private restoration using its retained kind', async () => {
  typeId = 'historic-type';
  await define({ name: 'Egen typ', description: '', fields: [{ ...serial, kind: 'number' }] });
  const addition = await save('type');
  await object('number-object', { customValues: { serial: 42 } });
  await save('number-object');
  await object('number-object', null);
  const numericDeletion = await save('delete-number');
  await define({ fields: [serial] });
  await object('text-object', { customValues: { serial: 'SYNTH-2' } });
  await save('text-object');
  await object('text-object', null);
  const textDeletion = await save('delete-text');
  expect((await undo(addition)).status).toBe(200);
  const state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  await save('remove-type');
  const actor = await member();
  expect(
    (
      await post(
        'undo',
        { version: 0, operationId: textDeletion.operationId, userId: textDeletion.userId },
        actor,
      )
    ).status,
  ).toBe(200);
  const before = await read();
  const response = await undo(numericDeletion);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'field_kind_in_use' });
  expect(await read()).toEqual(before);
});
