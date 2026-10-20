import { createHash } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { ImportContent } from '../../../src/server/import-schema.js';
import { conflictBasis, conflictProperties } from '../../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let owner: ReturnType<typeof fixture.client>;
let member: ReturnType<typeof fixture.client>;
let path: string;
type Kind = 'objectType' | 'relationshipType';
const collection = (kind: Kind) => (kind === 'objectType' ? 'types' : 'relationshipTypes');
const proposals = (kind: Kind) => (kind === 'objectType' ? 'objectTypes' : 'relationshipTypes');
const route = (kind: Kind) => (kind === 'objectType' ? 'object-type' : 'relationship-type');
const read = async (actor = member): Promise<MapState> =>
  (await actor.request(`${path}/map`)).json();
const history = async () => (await member.request(`${path}/map/history`)).json();
const post = (suffix: string, body: unknown, actor = member) =>
  actor.json(`${path}/map/${suffix}`, body);
async function checked(response: Response, status = 200) {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(status);
  return body;
}
async function definition(kind: Kind, value: unknown, actor = owner, id = 'historical-type') {
  const state = await read(actor);
  const previous = state.draft[proposals(kind)]?.find((change) => change.id === id);
  await checked(
    await post(
      route(kind),
      {
        id,
        version: state.draft.version,
        contentVersion: state.contentVersion,
        baseRevision: previous
          ? (previous.before?.revision ?? null)
          : (state[collection(kind)].find((type) => type.id === id)?.revision ?? null),
        value,
      },
      actor,
    ),
  );
}
async function object(id: string, actor = member) {
  const state = await read(actor);
  await checked(
    await post(
      'draft',
      {
        id,
        version: state.draft.version,
        contentVersion: state.contentVersion,
        baseRevision: null,
        value: {
          name: id,
          typeId: state.types[0].id,
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text',
              value: 'Oberoende privat arbete',
            },
          ],
        },
      },
      actor,
    ),
  );
}
async function save(operationId: string, actor = member) {
  const state = await read(actor);
  return post(
    'save',
    { operationId, version: state.draft.version, contentVersion: state.contentVersion },
    actor,
  );
}
async function archive() {
  const ready = await checked(await owner.json(`${path}/exports`, {}), 201);
  const response = await owner.request(`${path}/exports/${ready.id}`);
  expect(response.status).toBe(200);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const content = JSON.parse(Buffer.from(files['content.json']).toString()) as ImportContent;
  return { files, content };
}
async function restoreArchive(snapshot: Awaited<ReturnType<typeof archive>>) {
  snapshot.files['content.json'] = Buffer.from(JSON.stringify(snapshot.content));
  const manifest = JSON.parse(Buffer.from(snapshot.files['manifest.json']).toString());
  for (const part of manifest.parts) {
    const bytes = snapshot.files[part.path];
    part.bytes = bytes.length;
    part.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  snapshot.files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  const contentVersion = (await read(owner)).contentVersion;
  const ready = await checked(
    await owner.request(`${path}/imports`, {
      method: 'POST',
      headers: {
        origin: fixture.config.origin,
        'content-type': 'application/zip',
        'X-Skyttel-Content-Version': String(contentVersion),
      },
      body: Buffer.from(zipSync(snapshot.files)),
    }),
    201,
  );
  expect(
    await checked(
      await owner.json(`${path}/imports/${ready.id}/confirm`, { contentVersion, confirmed: true }),
    ),
  ).toMatchObject({ status: 'completed', contentVersion: contentVersion + 1 });
}
function value(kind: Kind, name: string) {
  return {
    name,
    description: 'Definition med historiska fält',

    ...(kind === 'relationshipType'
      ? { forwardLabel: 'förvaras i', reverseLabel: 'förvarar' }
      : {}),
  };
}
/** Combine earlier owned drafts with lawful newer saved facts through the archive boundary. */
async function removedScenario(kind: Kind, bothOwners = false, missing = false) {
  if (missing) await object('independent');
  const baseline = missing ? await archive() : undefined;
  await definition(kind, value(kind, 'Historisk typ'));
  await checked(await save('definition-created', owner));
  await definition(kind, value(kind, 'Medlemmens privata namn'), member);
  await object('independent');
  if (bothOwners) await definition(kind, value(kind, 'Ägarens privata namn'));
  const earlier = await archive();
  if (baseline) await restoreArchive(baseline);
  else {
    for (const actor of bothOwners ? [member, owner] : [member]) {
      const state = await read(actor);
      await checked(await post('discard', { version: state.draft.version }, actor));
    }
    await definition(kind, null);
    await checked(await save('definition-removed', owner));
  }
  const current = await archive();
  const owners = new Set([earlier.content.drafts.find((draft) => draft.changes.length)?.userId]);
  if (bothOwners) owners.add((await read(owner)).userId);
  current.content.drafts = [
    ...current.content.drafts.filter((draft) => !owners.has(draft.userId)),
    ...earlier.content.drafts.filter((draft) => owners.has(draft.userId)),
  ];
  await restoreArchive(current);
  const state = await read();
  expect(state.draft.changes).toMatchObject([{ id: 'independent' }]);
  expect(state[collection(kind)].some((type) => type.id === 'historical-type')).toBe(false);
  return state;
}
function resolution(state: MapState, kind: Kind, choice: 'saved' | 'proposed' = 'proposed') {
  const conflict = draftConflicts(state).find((item) => item.kind === kind);
  if (!conflict) throw new Error('Expected a definition conflict');
  return {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    conflict,
    basis: conflictBasis(state, conflict),
    command: 'definition-choice',
    definitionChoice: choice,
  };
}
beforeEach(async () => {
  fixture = await applicationFixture();
  owner = fixture.client();
  await owner.signIn();
  const { household } = await checked(await owner.json('/api/households', { name: 'Linden' }), 201);
  path = `/api/households/${household.id}`;
  fixture.setSubject('restoration-member');
  member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await checked(await owner.json(`${path}/invitations`, { userId: user.id }), 201);
  await checked(await member.json('/api/invitations/accept', { code }));
});
afterEach(() => fixture.close());

test.each(['objectType', 'relationshipType'] as const)(
  '%s restoration remains private, survives an ordinary edit and creates one complete receipt only on whole save',
  async (kind) => {
    const before = await removedScenario(kind);
    const ownerBefore = await read(owner);
    const historyBefore = await history();
    const request = resolution(before, kind);
    for (const [invalid, status, error] of [
      [{ ...request, basis: {} }, 409, 'resolution_conflict'],
      [{ ...request, definitionChoice: 'invented' }, 400, 'invalid_request'],
      [{ ...request, command: 'discard-proposal' }, 400, 'invalid_resolution'],
      [{ ...request, version: before.draft.version + 1 }, 409, 'draft_conflict'],
    ] as const) {
      const response = await post('resolve', invalid);
      expect(await checked(response, status)).toEqual({ error });
      expect(await read()).toEqual(before);
      expect(await read(owner)).toEqual(ownerBefore);
      expect(await history()).toEqual(historyBefore);
    }
    await checked(await post('resolve', request));
    const granted = await read();
    expect(granted.draft[proposals(kind)]?.[0]).toMatchObject({
      before: null,
      after: { id: 'historical-type', revision: 3, name: 'Medlemmens privata namn' },
      restoration: {
        contentVersion: before.contentVersion,
        definition: before.removedDefinitions?.[proposals(kind)][0],
      },
    });
    expect(granted[collection(kind)]).toEqual(before[collection(kind)]);
    expect(await read(owner)).toEqual(ownerBefore);
    expect(await history()).toEqual(historyBefore);
    expect((await post('resolve', request)).status).toBe(409);
    expect(await read()).toEqual(granted);
    await definition(kind, value(kind, 'Granskat privat namn'), member);
    const edited = await read();
    expect(edited.draft[proposals(kind)]?.[0].restoration).toEqual(
      granted.draft[proposals(kind)]?.[0].restoration,
    );
    const receipt: SaveReceipt = (await checked(await save('restored'))).receipt;
    expect(receipt[proposals(kind)]).toEqual([
      { id: 'historical-type', before: null, after: edited.draft[proposals(kind)]?.[0].after },
    ]);
    expect(receipt.changes).toMatchObject([{ after: { id: 'independent', revision: 1 } }]);
    expect(JSON.stringify(receipt)).not.toContain('restoration');
    const final = await read();
    expect(final.draft.changes).toEqual([]);
    expect(final.draft[proposals(kind)]).toBeUndefined();
    expect(final[collection(kind)]).toContainEqual(edited.draft[proposals(kind)]?.[0].after);
    expect((await history()).history).toEqual([receipt, ...historyBefore.history]);
  },
);

test.each(['objectType', 'relationshipType'] as const)(
  '%s restoration requires renewed authority after archive replacement and refuses old generation requests',
  async (kind) => {
    const before = await removedScenario(kind);
    await checked(await post('resolve', resolution(before, kind)));
    const granted = await read();
    const exported = await archive();
    expect(
      exported.content.drafts.find((draft) => draft.userId === granted.userId)?.[proposals(kind)][0]
        .restoration,
    ).toEqual(granted.draft[proposals(kind)]?.[0].restoration);
    await restoreArchive(exported);
    const imported = await read();
    const historyBefore = await history();
    expect(imported.contentVersion).toBe(granted.contentVersion + 1);
    expect(imported.draft[proposals(kind)]?.[0]).not.toHaveProperty('restoration');
    expect(imported.draft.changes).toEqual(granted.draft.changes);
    expect(await (await post('resolve', resolution(before, kind))).json()).toEqual({
      error: 'content_conflict',
    });
    expect(await (await save('unreviewed')).json()).toEqual({ error: 'type_conflict' });
    expect(await read()).toEqual(imported);
    expect(await history()).toEqual(historyBefore);
    await checked(await post('resolve', resolution(imported, kind)));
    expect((await read()).draft[proposals(kind)]?.[0].restoration?.contentVersion).toBe(
      imported.contentVersion,
    );
    await checked(await save('fresh-review'));
    expect((await read())[collection(kind)]).toContainEqual(
      expect.objectContaining({ id: 'historical-type', revision: 3 }),
    );
  },
);

test.each(['objectType', 'relationshipType'] as const)(
  '%s cannot manufacture a tombstone for a missing historical definition and explicit discard preserves unrelated work',
  async (kind) => {
    const before = await removedScenario(kind, false, true);
    const ownerBefore = await read(owner);
    const historyBefore = await history();
    expect(before.removedDefinitions).toBeUndefined();
    expect(await (await post('resolve', resolution(before, kind))).json()).toEqual({
      error: 'type_conflict',
    });
    expect(await read()).toEqual(before);
    await checked(await post('resolve', resolution(before, kind, 'saved')));
    const after = await read();
    expect(after.draft[proposals(kind)] ?? []).toEqual([]);
    expect(after.draft.changes).toEqual(before.draft.changes);
    expect(after.objects).toEqual(before.objects);
    expect(await read(owner)).toEqual(ownerBefore);
    expect(await history()).toEqual(historyBefore);
  },
);

test.each(['objectType', 'relationshipType'] as const)(
  '%s raced restoration rolls back the entire save and can be rebased with explicit property choices',
  async (kind) => {
    const before = await removedScenario(kind, true);
    await checked(await post('resolve', resolution(before, kind)));
    const privateDraft = (await read()).draft;
    const ownerState = await read(owner);
    await checked(await post('resolve', resolution(ownerState, kind), owner));
    await checked(await save('owner-restoration', owner));
    const shared = await read();
    const historyBefore = await history();
    expect(await (await save('raced-restoration')).json()).toEqual({ error: 'type_conflict' });
    expect(await read()).toEqual(shared);
    expect((await read()).draft).toEqual(privateDraft);
    expect(await history()).toEqual(historyBefore);
    const conflict = draftConflicts(shared).find((item) => item.kind === kind);
    if (!conflict) throw new Error('Expected concurrent restored definition');
    const choices = Object.fromEntries(
      conflictProperties(shared, conflict).map((property) => [property.key, 'proposed']),
    );
    await checked(
      await post('resolve', {
        version: shared.draft.version,
        contentVersion: shared.contentVersion,
        conflict,
        basis: conflictBasis(shared, conflict),
        choices,
      }),
    );
    const rebased = await read();
    expect(rebased.draft[proposals(kind)]?.[0]).not.toHaveProperty('restoration');
    expect(rebased.draft[proposals(kind)]?.[0].after?.revision).toBe(4);
    expect(rebased[collection(kind)]).toEqual(shared[collection(kind)]);
    await checked(await save('reviewed-again'));
    expect((await read())[collection(kind)]).toContainEqual(
      expect.objectContaining({
        id: 'historical-type',
        revision: 4,
        name: 'Medlemmens privata namn',
      }),
    );
  },
);

test.each(['objectType', 'relationshipType'] as const)(
  '%s ordinary creation cannot reuse a removed identity or accept forged restoration authority',
  async (kind) => {
    const before = await removedScenario(kind);
    await checked(await post('resolve', resolution(before, kind, 'saved')));
    const state = await read();
    const historyBefore = await history();
    expect(
      await (
        await post(route(kind), {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id: 'historical-type',
          baseRevision: null,
          value: value(kind, 'Förfalskad auktoritet'),
          restoration: {
            contentVersion: state.contentVersion,
            definition: before.removedDefinitions,
          },
        })
      ).json(),
    ).toEqual({ error: 'type_conflict' });
    expect(await read()).toEqual(state);
    expect(await history()).toEqual(historyBefore);
  },
);
