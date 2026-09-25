import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, ObjectValue, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = client) => actor.json(`${path}/${route}`, body);
async function object(id: string, update: Partial<ObjectValue> | null, actor = client) {
  const state = await read(actor);
  const before = state.objects.find((item) => item.id === id);
  const response = await post(
    'draft',
    {
      version: state.draft.version,
      id,
      baseRevision: before?.revision ?? null,
      value:
        update === null
          ? null
          : { name: id, description: '', typeId: state.types[0].id, ...before, ...update },
    },
    actor,
  );
  expect(response.status).toBe(200);
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
const undo = async (receipt: SaveReceipt, actor = client) =>
  post(
    'undo',
    {
      version: (await read(actor)).draft.version,
      operationId: receipt.operationId,
      userId: receipt.userId,
    },
    actor,
  );

async function edge(id: string, sourceId: string, targetId: string) {
  const state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id,
        baseRevision: null,
        value: {
          sourceId,
          targetId,
          typeId: state.relationshipTypes[0].id,
          knowledge: 'known',
          lifecycle: 'ended',
        },
      })
    ).status,
  ).toBe(200);
}
async function member(subject = 'second-person') {
  fixture.setSubject(subject);
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  return { actor, userId: user.id };
}

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
});

test('undo restores ordinary deletion with the same object and relationship identities', async () => {
  await object('person', { name: 'Lo Exempel', lifecycle: 'ended' });
  await object('card', { name: 'Blått kort' });
  await edge('uses', 'person', 'card');
  await save('initial');
  const initial = await read();
  await object('person', null);
  const removed = await save('remove');
  expect((await read()).relationships).toEqual([]);
  expect((await undo(removed)).status).toBe(200);
  expect((await read()).objects).toHaveLength(1);
  await save('restore');
  const restored = await read();
  expect(restored.objects).toEqual(
    expect.arrayContaining(
      initial.objects.map(({ revision, ...value }) => expect.objectContaining(value)),
    ),
  );
  expect(restored.objects.find((item) => item.id === 'person')?.revision).toBe(3);
  expect(restored.relationships[0]).toMatchObject({
    id: 'uses',
    revision: 3,
    sourceId: 'person',
    targetId: 'card',
    lifecycle: 'ended',
  });
});

test('later overlaps require a choice, while independent private facts remain', async () => {
  await object('person', { name: 'Lo Exempel' });
  await save('initial');
  await object('person', { name: 'Lo Lind' });
  const selected = await save('rename');
  await object('person', { name: 'Lo Ek' });
  await save('later-name');
  await object('person', { description: 'Oberoende eget förslag' });
  expect((await undo(selected)).status).toBe(200);
  let state = await read();
  expect(draftConflicts(state)).toHaveLength(1);
  const blocked = await post('save', { version: state.draft.version, operationId: 'blocked' });
  expect(blocked.status).toBe(409);
  expect((await read()).objects).toEqual(state.objects);
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
  expect(state.draft.changes[0].after).toMatchObject({
    name: 'Lo Exempel',
    description: 'Oberoende eget förslag',
  });
  await save('resolved-undo');
});

test('own overlap blocks the whole undo without partial proposals and can be discarded alone', async () => {
  await object('person', { name: 'Lo Exempel' });
  await object('card', { name: 'Kort' });
  await save('initial');
  await object('person', { name: 'Lo Lind' });
  await object('card', { name: 'Blått kort' });
  const selected = await save('rename-both');
  await object('card', { name: 'Privat kortnamn' });
  await object('independent', { name: 'Robin' });
  const before = await read();
  const blocked = await undo(selected);
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toEqual({ error: 'undo_draft_overlap' });
  expect(await read()).toEqual(before);
  expect(
    (await post('discard-change', { version: before.draft.version, kind: 'object', id: 'card' }))
      .status,
  ).toBe(200);
  expect((await undo(selected)).status).toBe(200);
  expect(
    (await read()).draft.changes.find((change) => change.id === 'independent')?.after?.name,
  ).toBe('Robin');
  await save('undo-both');
});

test('the whole save includes definitions and their dependent content, and can itself be undone', async () => {
  expect(
    (
      await post('object-type', {
        version: 0,
        id: 'own-type',
        baseRevision: null,
        value: {
          name: 'Växt',
          description: '',
          fields: [{ id: 'color', name: 'Färg', description: '', kind: 'text' }],
        },
      })
    ).status,
  ).toBe(200);
  await object('plant', { typeId: 'own-type', name: 'Växten', customValues: { color: 'grön' } });
  expect(
    (
      await post('relationship-type', {
        version: (await read()).draft.version,
        id: 'own-edge-type',
        baseRevision: null,
        value: {
          name: 'Stödjer',
          description: '',
          forwardLabel: 'stödjer',
          reverseLabel: 'stöds av',
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'self',
        baseRevision: null,
        value: {
          sourceId: 'plant',
          targetId: 'plant',
          typeId: 'own-edge-type',
          knowledge: 'known',
        },
      })
    ).status,
  ).toBe(200);
  const selected = await save('definitions-and-content');
  expect((await undo(selected)).status).toBe(200);
  expect(draftConflicts(await read())).toEqual([]);
  const removed = await save('undo-whole');
  const state = await read();
  expect(state.objects).toEqual([]);
  expect(state.relationships).toEqual([]);
  expect(state.types.some((type) => type.id === 'own-type')).toBe(false);
  expect(state.relationshipTypes.some((type) => type.id === 'own-edge-type')).toBe(false);
  expect((await undo(selected)).status).toBe(200);
  expect((await read()).draft.changes).toEqual([]);
  expect((await read()).draft.objectTypes ?? []).toEqual([]);
  expect((await read()).draft.relationshipTypes ?? []).toEqual([]);
  expect((await read()).draft.relationships ?? []).toEqual([]);
  expect((await undo(removed)).status).toBe(200);
  await save('restore-whole');
  expect((await read()).objects[0]).toMatchObject({
    id: 'plant',
    typeId: 'own-type',
    customValues: { color: 'grön' },
  });
  expect(
    (await read()).relationshipTypes.find((type) => type.id === 'own-edge-type'),
  ).toMatchObject({ forwardLabel: 'stödjer', reverseLabel: 'stöds av' });
});

test('undoing relationship meaning preserves later status and independent own date', async () => {
  await object('person', {});
  await object('card', {});
  await object('other-card', {});
  await edge('uses', 'person', 'card');
  await save('initial');
  const edit = async (update: Record<string, unknown>) => {
    const state = await read();
    expect(
      (
        await post('relationship', {
          version: state.draft.version,
          id: 'uses',
          baseRevision: state.relationships[0].revision,
          value: { ...state.relationships[0], ...update },
        })
      ).status,
    ).toBe(200);
  };
  await edit({ targetId: 'other-card' });
  const selected = await save('switch-card');
  await edit({ lifecycle: 'active' });
  await save('later-status');
  await edit({ endDate: { knowledge: 'unknown' } });
  expect((await undo(selected)).status).toBe(200);
  expect(draftConflicts(await read())).toEqual([]);
  await save('undo-card');
  expect((await read()).relationships[0]).toMatchObject({
    targetId: 'card',
    lifecycle: 'active',
    endDate: { knowledge: 'unknown' },
  });
});

test('an older edit can be explicitly restored after a later ordinary deletion', async () => {
  await object('person', { name: 'Lo' });
  await object('card', {});
  await edge('uses', 'person', 'card');
  await save('initial');
  await object('person', { name: 'Lo Lind' });
  let state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id: 'uses',
        baseRevision: 1,
        value: { ...state.relationships[0], lifecycle: 'active' },
      })
    ).status,
  ).toBe(200);
  const edited = await save('edit');
  await object('person', null);
  await save('delete-later');
  expect((await undo(edited)).status).toBe(200);
  state = await read();
  expect(draftConflicts(state).map((conflict) => conflict.kind)).toEqual([
    'object',
    'relationship',
  ]);
  for (const kind of ['object', 'relationship']) {
    state = await read();
    const conflict = draftConflicts(state).find((item) => item.kind === kind);
    expect(
      (await post('resolve', { version: state.draft.version, conflict, choice: 'proposed' }))
        .status,
    ).toBe(200);
  }
  await save('restore-before-edit');
  state = await read();
  expect(state.objects.find((item) => item.id === 'person')).toMatchObject({
    name: 'Lo',
    revision: 4,
  });
  expect(state.relationships[0]).toMatchObject({ id: 'uses', lifecycle: 'ended', revision: 4 });
});

test('undoing a new field preserves independently added fields and rejects saved or private later use', async () => {
  const state = await read();
  const type = state.types[0];
  const field = { id: 'color', name: 'Färg', description: '', kind: 'text' };
  const define = async (fields: unknown[], actor = client) => {
    const current = await read(actor);
    const saved = current.types.find((item) => item.id === type.id);
    if (!saved) throw new Error('Expected saved type');
    expect(
      (
        await post(
          'object-type',
          {
            version: current.draft.version,
            id: type.id,
            baseRevision: saved.revision,
            value: { ...saved, fields },
          },
          actor,
        )
      ).status,
    ).toBe(200);
  };
  await define([field]);
  const selected = await save('field');
  await define([field, { id: 'height', name: 'Längd', description: '', kind: 'number' }]);
  await save('independent-field');
  await object('person', { typeId: type.id, customValues: { color: 'blå' } });
  await save('using-field');
  let before = await read();
  expect(await (await undo(selected)).json()).toEqual({ error: 'field_in_use' });
  expect(await read()).toEqual(before);
  await object('person', { customValues: {} });
  await save('remove-value');
  const { actor } = await member();
  await object('private', { typeId: type.id, customValues: { color: 'grön' } }, actor);
  before = await read();
  expect(await (await undo(selected)).json()).toEqual({ error: 'field_in_use' });
  expect(await read()).toEqual(before);
  await post('discard', { version: (await read(actor)).draft.version }, actor);
  expect((await undo(selected)).status).toBe(200);
  await save('undo-field');
  expect((await read()).types.find((item) => item.id === type.id)?.fields).toEqual([
    { id: 'height', name: 'Längd', description: '', kind: 'number' },
  ]);
});

test('later use of a new definition blocks undo before changing any private proposal', async () => {
  expect(
    (
      await post('object-type', {
        version: 0,
        id: 'plant-type',
        baseRevision: null,
        value: { name: 'Växt', description: '', fields: [] },
      })
    ).status,
  ).toBe(200);
  const selected = await save('new-type');
  const { actor } = await member();
  await object('private-plant', { typeId: 'plant-type' }, actor);
  const before = await read();
  expect(await (await undo(selected)).json()).toEqual({ error: 'definition_in_use' });
  expect(await read()).toEqual(before);
  await save('later-object', actor);
  expect(await (await undo(selected)).json()).toEqual({ error: 'definition_in_use' });
});

test('history and undo require current household access, and do not expose private proposals', async () => {
  await object('person', { name: 'Lo' });
  const selected = await save('initial');
  const { actor, userId } = await member();
  await object('private', { name: 'Hemligt eget förslag' });
  const history = await actor.request(`${path}/history`);
  expect(history.status).toBe(200);
  expect(await history.text()).not.toContain('Hemligt eget förslag');
  expect(selected.actorName).toBe('Alex Exempel');
  const stranger = fixture.client();
  expect((await stranger.request(`${path}/history`)).status).toBe(401);
  expect(
    (
      await post(
        'undo',
        { version: 0, userId: selected.userId, operationId: selected.operationId },
        stranger,
      )
    ).status,
  ).toBe(401);
  fixture.setSubject('outsider');
  await stranger.signIn();
  expect((await stranger.request(`${path}/history`)).status).toBe(403);
  expect(
    (
      await post(
        'undo',
        { version: 0, userId: selected.userId, operationId: selected.operationId },
        stranger,
      )
    ).status,
  ).toBe(403);
  expect(
    (await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {})).status,
  ).toBe(200);
  expect((await actor.request(`${path}/history`)).status).toBe(403);
  expect(
    (
      await post(
        'undo',
        { version: 0, userId: selected.userId, operationId: selected.operationId },
        actor,
      )
    ).status,
  ).toBe(403);
});

test('per-proposal discard requires current household access and preserves every private draft when denied', async () => {
  await object('person', { name: 'Lo Exempel' });
  await save('initial');
  const { actor, userId } = await member();
  await object('person', { name: 'Administratörens privata förslag' });
  await object('person', { name: 'Medlemmens privata förslag' }, actor);
  const ownerBefore = await read();
  const memberBefore = await read(actor);
  const historyBefore = await (await client.request(`${path}/history`)).json();
  const body = { version: memberBefore.draft.version, kind: 'object', id: 'person' };
  const anonymous = fixture.client();
  expect((await post('discard-change', body, anonymous)).status).toBe(401);

  fixture.setSubject('another-household-member');
  const outsider = fixture.client();
  await outsider.signIn();
  const { user } = await (await outsider.request('/api/bootstrap')).json();
  // Arrange a separate household, then create its private proposal through HTTP.
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other-household', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other-household', user.id, 'member');
  const otherPath = '/api/households/other-household/map';
  const other = (await (await outsider.request(otherPath)).json()) as MapState;
  expect(
    (
      await outsider.json(`${otherPath}/draft`, {
        version: other.draft.version,
        id: 'other-person',
        baseRevision: null,
        value: { name: 'Robin Exempel', description: '', typeId: other.types[0].id },
      })
    ).status,
  ).toBe(200);
  const otherBefore = await (await outsider.request(otherPath)).json();
  const otherHistoryBefore = await (await outsider.request(`${otherPath}/history`)).json();
  expect((await post('discard-change', body, outsider)).status).toBe(403);

  expect(
    (await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {})).status,
  ).toBe(200);
  expect((await post('discard-change', body, actor)).status).toBe(403);
  expect(await read()).toEqual(ownerBefore);
  expect(await (await client.request(`${path}/history`)).json()).toEqual(historyBefore);
  expect(await (await outsider.request(otherPath)).json()).toEqual(otherBefore);
  expect(await (await outsider.request(`${otherPath}/history`)).json()).toEqual(otherHistoryBefore);

  // Restore access through the API to inspect the private draft and prove the
  // same request is valid for an ordinary member with current access.
  const invitation = await client.json(`${path.replace('/map', '')}/invitations`, { userId });
  expect(invitation.status).toBe(201);
  const { code } = await invitation.json();
  expect((await actor.json('/api/invitations/accept', { code })).status).toBe(200);
  expect(await read(actor)).toEqual(memberBefore);
  expect((await post('discard-change', body, actor)).status).toBe(200);
  const discarded = await read(actor);
  expect(discarded.draft.changes).toEqual([]);
  expect(discarded.objects).toEqual(memberBefore.objects);
  expect(await read()).toEqual(ownerBefore);
  expect(await (await client.request(`${path}/history`)).json()).toEqual(historyBefore);
});

test('undo restores necessary definitions removed after the selected object deletion', async () => {
  expect(
    (
      await post('object-type', {
        version: 0,
        id: 'plant',
        baseRevision: null,
        value: { name: 'Växt', description: '', fields: [] },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post('relationship-type', {
        version: 1,
        id: 'supports',
        baseRevision: null,
        value: {
          name: 'Stödjer',
          description: '',
          forwardLabel: 'stödjer',
          reverseLabel: 'stöds av',
        },
      })
    ).status,
  ).toBe(200);
  const definitions = await save('definitions');
  await object('flower', { typeId: 'plant' });
  await object('person', {});
  expect(
    (
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'support',
        baseRevision: null,
        value: { typeId: 'supports', sourceId: 'person', targetId: 'flower', knowledge: 'known' },
      })
    ).status,
  ).toBe(200);
  await save('content');
  await object('flower', null);
  const deletion = await save('remove-flower');
  expect((await undo(definitions)).status).toBe(200);
  await save('remove-definitions');
  expect((await undo(deletion)).status).toBe(200);
  const draft = (await read()).draft;
  expect(draft.objectTypes?.[0]).toMatchObject({
    id: 'plant',
    before: null,
    after: { revision: 3 },
  });
  expect(draft.relationshipTypes?.[0]).toMatchObject({
    id: 'supports',
    before: null,
    after: { revision: 3 },
  });
  await save('restore-deletion');
  expect((await read()).objects.map((item) => item.id).sort()).toEqual(['flower', 'person']);
  expect((await read()).relationships[0]).toMatchObject({
    id: 'support',
    typeId: 'supports',
    targetId: 'flower',
  });
});

test('another member using a definition after undo preparation rejects the complete save atomically', async () => {
  expect(
    (
      await post('relationship-type', {
        version: 0,
        id: 'supports',
        baseRevision: null,
        value: {
          name: 'Stödjer',
          description: '',
          forwardLabel: 'stödjer',
          reverseLabel: 'stöds av',
        },
      })
    ).status,
  ).toBe(200);
  const definition = await save('definition');
  await object('person', {});
  await object('card', {});
  await save('objects');
  expect((await undo(definition)).status).toBe(200);
  await object('independent', {});
  const { actor } = await member();
  expect(
    (
      await post(
        'relationship',
        {
          version: 0,
          id: 'other-edge',
          baseRevision: null,
          value: { typeId: 'supports', sourceId: 'person', targetId: 'card', knowledge: 'known' },
        },
        actor,
      )
    ).status,
  ).toBe(200);
  const before = await read();
  const response = await post('save', {
    version: before.draft.version,
    operationId: 'blocked-by-private',
  });
  expect(await response.json()).toEqual({ error: 'definition_in_use' });
  expect(await read()).toEqual(before);
  await save('other-edge', actor);
  expect(
    await (
      await post('save', { version: before.draft.version, operationId: 'blocked-by-saved' })
    ).json(),
  ).toEqual({ error: 'definition_in_use' });
  expect((await read()).objects.some((item) => item.id === 'independent')).toBe(false);
});

test('overlapping private endpoints block undo without discarding independent proposals', async () => {
  await object('person', {});
  await object('card', {});
  const created = await save('objects');
  await edge('private-edge', 'person', 'card');
  const before = await read();
  expect(await (await undo(created)).json()).toEqual({ error: 'undo_draft_overlap' });
  expect(await read()).toEqual(before);
  await save('edge');
  const state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id: 'private-edge',
        baseRevision: 1,
        value: null,
      })
    ).status,
  ).toBe(200);
  const deleted = await save('delete-edge');
  await object('person', null);
  expect(await (await undo(deleted)).json()).toEqual({ error: 'undo_draft_overlap' });
  expect((await read()).draft.changes[0].after).toBeNull();
});

test('discarding an unsaved object drops only its incident proposals and all proposal kinds are individually removable', async () => {
  await object('person', {});
  await object('card', {});
  await edge('private-edge', 'person', 'card');
  let state = await read();
  expect(
    (await post('discard-change', { version: state.draft.version, kind: 'object', id: 'person' }))
      .status,
  ).toBe(200);
  state = await read();
  expect(state.draft.changes.map((change) => change.id)).toEqual(['card']);
  expect(state.draft.relationships ?? []).toEqual([]);
  expect(
    (
      await post('object-type', {
        version: state.draft.version,
        id: 'new-type',
        baseRevision: null,
        value: { name: 'Ny typ', description: '', fields: [] },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post('relationship-type', {
        version: (await read()).draft.version,
        id: 'new-edge-type',
        baseRevision: null,
        value: { name: 'Ny typ', description: '', forwardLabel: 'hör till', reverseLabel: 'har' },
      })
    ).status,
  ).toBe(200);
  for (const [kind, id] of [
    ['objectType', 'new-type'],
    ['relationshipType', 'new-edge-type'],
    ['relationship', 'private-edge'],
  ]) {
    expect(
      (await post('discard-change', { version: (await read()).draft.version, kind, id })).status,
    ).toBe(200);
  }
  expect((await read()).draft.changes.map((change) => change.id)).toEqual(['card']);
});

test('invalid, stale and unavailable undo requests cannot mutate content or another draft', async () => {
  await object('person', {});
  const selected = await save('initial');
  const before = await read();
  for (const data of [
    { version: before.draft.version },
    { version: before.draft.version, userId: [], operationId: 'initial' },
    { version: before.draft.version - 1, userId: selected.userId, operationId: 'initial' },
    { version: before.draft.version, userId: selected.userId, operationId: 'missing' },
    { version: before.draft.version, userId: 'wrong-user', operationId: 'initial' },
  ])
    expect((await post('undo', data)).status).toBeGreaterThanOrEqual(400);
  for (const data of [
    { version: before.draft.version, kind: 'object', id: 5 },
    { version: before.draft.version, kind: 'object', id: 'missing' },
    { version: before.draft.version, kind: 'unknown', id: 'person' },
  ])
    expect((await post('discard-change', data)).status).toBeGreaterThanOrEqual(400);
  expect(await read()).toEqual(before);
});

test('definition overlap can restore later removed definitions and preserve edits to the restoration proposal', async () => {
  const objectValue = { name: 'Växt', description: '', fields: [] };
  const edgeValue = {
    name: 'Stödjer',
    description: '',
    forwardLabel: 'stödjer',
    reverseLabel: 'stöds av',
  };
  await post('object-type', { version: 0, id: 'plant', baseRevision: null, value: objectValue });
  await post('relationship-type', {
    version: 1,
    id: 'supports',
    baseRevision: null,
    value: edgeValue,
  });
  const created = await save('created-types');
  await post('object-type', {
    version: 3,
    id: 'plant',
    baseRevision: 1,
    value: { ...objectValue, name: 'Blomma' },
  });
  await post('relationship-type', {
    version: 4,
    id: 'supports',
    baseRevision: 1,
    value: { ...edgeValue, name: 'Hjälper' },
  });
  const edited = await save('edited-types');
  const resolveAll = async () => {
    for (const kind of ['objectType', 'relationshipType']) {
      const current = await read();
      expect(
        (
          await post('resolve', {
            version: current.draft.version,
            conflict: draftConflicts(current).find((item) => item.kind === kind),
            choice: 'proposed',
          })
        ).status,
      ).toBe(200);
    }
  };
  expect((await undo(created)).status).toBe(200);
  await resolveAll();
  await save('removed-types');
  expect((await undo(edited)).status).toBe(200);
  await resolveAll();
  let current = await read();
  await post('object-type', {
    version: current.draft.version,
    id: 'plant',
    baseRevision: null,
    value: { ...objectValue, description: 'Återställd definition' },
  });
  current = await read();
  await post('relationship-type', {
    version: current.draft.version,
    id: 'supports',
    baseRevision: null,
    value: { ...edgeValue, description: 'Återställd betydelse' },
  });
  await save('restored-types');
  current = await read();
  expect(current.types.find((item) => item.id === 'plant')).toMatchObject({
    name: 'Växt',
    revision: 4,
    description: 'Återställd definition',
  });
  expect(current.relationshipTypes.find((item) => item.id === 'supports')).toMatchObject({
    name: 'Stödjer',
    revision: 4,
    description: 'Återställd betydelse',
  });
});

test('a changed tombstone cannot be reused silently and missing retained data cannot be restored', async () => {
  await object('person', { name: 'Lo' });
  await save('initial');
  await object('person', null);
  const deletion = await save('delete');
  expect((await undo(deletion)).status).toBe(200);
  const proposed = (await read()).draft;
  const { actor } = await member();
  expect((await undo(deletion, actor)).status).toBe(200);
  await save('other-restore', actor);
  await object('person', null, actor);
  await save('other-delete', actor);
  const blocked = await post('save', {
    version: proposed.version,
    operationId: 'stale-restoration',
  });
  expect(blocked.status).toBe(409);
  expect((await read()).objects).toEqual([]);
  expect((await read()).draft).toEqual(proposed);
  await post('discard-change', { version: proposed.version, kind: 'object', id: 'person' });
  // Arrange retention loss at the storage boundary; the permanent-erasure UI
  // is a later issue. Observe only the public undo response and map afterwards.
  fixture.database.prepare('DELETE FROM map_object WHERE id = ?').run('person');
  const before = await read();
  expect(await (await undo(deletion)).json()).toEqual({ error: 'undo_unavailable' });
  expect(await read()).toEqual(before);
});

test('undo and per-proposal discard enforce Origin and household boundaries; restoration metadata cannot authorize an ID collision', async () => {
  await object('person', {});
  const receipt = await save('initial');
  const before = await read();
  for (const route of ['undo', 'discard-change']) {
    expect(
      (
        await client.request(`${path}/${route}`, {
          method: 'POST',
          headers: { origin: 'https://unrelated.example', 'content-type': 'application/json' },
          body: JSON.stringify({
            version: before.draft.version,
            operationId: receipt.operationId,
            userId: receipt.userId,
            id: 'person',
            kind: 'object',
          }),
        })
      ).status,
    ).toBe(403);
  }
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other-household', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other-household', before.userId, 'administrator');
  const otherPath = '/api/households/other-household/map';
  const other = (await (await client.request(otherPath)).json()) as MapState;
  expect(
    await (
      await client.json(`${otherPath}/undo`, {
        version: 0,
        operationId: receipt.operationId,
        userId: receipt.userId,
      })
    ).json(),
  ).toEqual({ error: 'undo_unavailable' });
  expect(
    (
      await client.json(`${otherPath}/draft`, {
        version: 0,
        id: 'person',
        baseRevision: null,
        restoreRevision: 1,
        value: { name: 'Fel hushåll', description: '', typeId: other.types[0].id },
      })
    ).status,
  ).toBe(200);
  expect(
    (await client.json(`${otherPath}/save`, { version: 1, operationId: 'collision' })).status,
  ).toBe(409);
  expect(await read()).toEqual(before);
  const { actor } = await member();
  expect((await actor.request(`${otherPath}/history`)).status).toBe(403);
  expect(
    (
      await actor.json(`${otherPath}/undo`, {
        version: 0,
        operationId: receipt.operationId,
        userId: receipt.userId,
      })
    ).status,
  ).toBe(403);
});

test.each(['object', 'relationship', 'objectType', 'relationshipType'] as const)(
  'choosing the saved %s for undo keeps independent facts from the existing private draft',
  async (kind) => {
    await object('person', {});
    await object('card', {});
    await edge('uses', 'person', 'card');
    await save('initial');
    const initial = await read();
    const edit = async (primary: string, independent = false) => {
      const state = await read();
      if (kind === 'object')
        return object('person', independent ? { description: primary } : { name: primary });
      if (kind === 'relationship') {
        const value = state.relationships[0];
        expect(
          (
            await post('relationship', {
              version: state.draft.version,
              id: value.id,
              baseRevision: value.revision,
              value: {
                ...value,
                ...(independent ? { endDate: { knowledge: 'unknown' } } : { lifecycle: primary }),
              },
            })
          ).status,
        ).toBe(200);
      } else if (kind === 'objectType') {
        const value = state.types.find((type) => type.id === initial.types[0].id);
        expect(
          (
            await post('object-type', {
              version: state.draft.version,
              id: value?.id,
              baseRevision: value?.revision,
              value: {
                ...value,
                fields: [],
                ...(independent ? { description: primary } : { name: primary }),
              },
            })
          ).status,
        ).toBe(200);
      } else {
        const value = state.relationshipTypes.find(
          (type) => type.id === initial.relationshipTypes[0].id,
        );
        expect(
          (
            await post('relationship-type', {
              version: state.draft.version,
              id: value?.id,
              baseRevision: value?.revision,
              value: {
                name: value?.name,
                description: value?.description,
                forwardLabel: value?.forwardLabel ?? 'kopplar till',
                reverseLabel: value?.reverseLabel ?? 'kopplas från',
                ...(independent ? { description: primary } : { forwardLabel: primary }),
              },
            })
          ).status,
        ).toBe(200);
      }
    };
    await edit(kind === 'relationship' ? 'active' : 'Första ändringen');
    const selected = await save('selected');
    await edit(kind === 'relationship' ? 'ended' : 'Senare ändring');
    await save('later');
    await edit('Oberoende eget förslag', true);
    expect((await undo(selected)).status).toBe(200);
    const before = await read();
    expect(
      (
        await post('resolve', {
          version: before.draft.version,
          conflict: draftConflicts(before).find((item) => item.kind === kind),
          choice: 'saved',
        })
      ).status,
    ).toBe(200);
    expect(draftConflicts(await read())).toEqual([]);
    await save('only-independent');
    const result = await read();
    if (kind === 'object')
      expect(result.objects.find((value) => value.id === 'person')).toMatchObject({
        name: 'Senare ändring',
        description: 'Oberoende eget förslag',
      });
    else if (kind === 'relationship')
      expect(result.relationships[0]).toMatchObject({
        lifecycle: 'ended',
        endDate: { knowledge: 'unknown' },
      });
    else if (kind === 'objectType')
      expect(result.types.find((type) => type.id === initial.types[0].id)).toMatchObject({
        name: 'Senare ändring',
        description: 'Oberoende eget förslag',
      });
    else
      expect(
        result.relationshipTypes.find((type) => type.id === initial.relationshipTypes[0].id),
      ).toMatchObject({ forwardLabel: 'Senare ändring', description: 'Oberoende eget förslag' });
  },
);

test('choosing the saved undo value does not authorize an overlapping later edit to the retained private proposal', async () => {
  await object('person', { name: 'Lo' });
  await save('initial');
  await object('person', { name: 'Lo Lind' });
  const selected = await save('selected');
  await object('person', { name: 'Lo Ek' });
  await save('later-name');
  await object('person', { description: 'Egen beskrivning' });
  expect((await undo(selected)).status).toBe(200);
  const { actor } = await member();
  await object('person', { description: 'Senare delad beskrivning' }, actor);
  await save('later-description', actor);
  let state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'saved',
      })
    ).status,
  ).toBe(200);
  state = await read();
  expect(state.draft.changes[0].after).toMatchObject({
    name: 'Lo Ek',
    description: 'Egen beskrivning',
  });
  expect(draftConflicts(state)).toHaveLength(1);
  expect(
    (await post('save', { version: state.draft.version, operationId: 'still-blocked' })).status,
  ).toBe(409);
  expect((await read()).objects[0].description).toBe('Senare delad beskrivning');
});
afterEach(() => fixture.close());

test('undo is a private whole-save proposal against today’s values with a new receipt', async () => {
  await object('person', { name: 'Lo Exempel' });
  await save('initial');
  await object('person', { name: 'Lo Lind' });
  const selected = await save('rename');
  await object('person', { description: 'Senare oberoende rättelse' });
  await save('description');
  await object('independent', { name: 'Privat förslag' });
  expect((await undo(selected)).status).toBe(200);
  const state = await read();
  expect(state.objects[0].name).toBe('Lo Lind');
  expect(state.draft.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'person',
        after: expect.objectContaining({
          name: 'Lo Exempel',
          description: 'Senare oberoende rättelse',
        }),
      }),
      expect.objectContaining({
        id: 'independent',
        after: expect.objectContaining({ name: 'Privat förslag' }),
      }),
    ]),
  );
  const receipt = await save('undo-rename');
  expect(receipt.operationId).not.toBe(selected.operationId);
  expect((await read()).objects.find((item) => item.id === 'person')).toMatchObject({
    name: 'Lo Exempel',
    description: 'Senare oberoende rättelse',
  });
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(history).toHaveLength(4);
  expect(history[1]).toEqual(selected);
});
