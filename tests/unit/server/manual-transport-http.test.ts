import { type APIRequestContext, type APIResponse, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createManualTransport } from '../../../scripts/manual-transport-control.js';
import { conflictBasis, conflictProperties } from '../../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let owner: APIRequestContext;
let member: APIRequestContext;
let transport: Awaited<ReturnType<typeof createManualTransport>>;
let path: string;
let otherPath: string;
let events: { phase: string; route?: string; status?: number }[];
const read = async (actor = owner): Promise<MapState> =>
  (await actor.get(`${app.origin}${path}/map`)).json();
const history = async () => (await owner.get(`${app.origin}${path}/map/history`)).json();
const post = (suffix: string, data: unknown, actor = owner) =>
  actor.post(`${app.origin}${path}/map/${suffix}`, { headers: { origin: app.origin }, data });
async function checked(response: APIResponse, status = 200) {
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(status);
  return body;
}
async function propose(id: string, name: string, actor = owner) {
  const state = await read(actor);
  const saved = state.objects.find((object) => object.id === id);
  const own = state.draft.changes.find((change) => change.id === id);
  return checked(
    await post(
      'draft',
      {
        id,
        version: state.draft.version,
        contentVersion: state.contentVersion,
        baseRevision: own ? (own.before?.revision ?? null) : (saved?.revision ?? null),
        value: { typeId: state.types[0].id, ...saved, ...own?.after, name },
      },
      actor,
    ),
  );
}
async function save(operationId: string, actor = owner) {
  const state = await read(actor);
  return checked(
    await post(
      'save',
      {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId,
      },
      actor,
    ),
  );
}
function through(suffix: string, data: unknown, pathname = path, actor = owner) {
  return actor.post(`${transport.address}${pathname}/map/${suffix}`, {
    headers: { host: new URL(app.origin).host, origin: app.origin },
    data,
  });
}
beforeEach(async () => {
  app = await createInstallation();
  owner = await request.newContext();
  await signIn(owner, app.origin);
  const { household } = await checked(await createHousehold(owner, app.origin), 201);
  path = `/api/households/${household.id}`;
  otherPath = '/api/households/unrelated-household';
  app.setIdentity(robin);
  member = await request.newContext();
  await signIn(member, app.origin);
  const { user } = await checked(await member.get(`${app.origin}/api/bootstrap`));
  const { code } = await checked(
    await owner.post(`${app.origin}${path}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    }),
    201,
  );
  await checked(
    await member.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code },
    }),
  );
  await propose('lamp', 'Grundvärde');
  await save('initial');
  await propose('independent', 'Mitt oberoende förslag');
  events = [];
  transport = await createManualTransport({
    publicOrigin: app.origin,
    upstreamOrigin: app.origin,
    householdId: household.id,
    report: (event) => events.push(event),
  });
});
afterEach(async () => {
  await transport?.close();
  await owner?.dispose();
  await member?.dispose();
  await app?.close();
});

test('a resolve hold before application execution intercepts the real route and preserves private, shared and historical state until release', async () => {
  await propose('lamp', 'Mitt förslag');
  await propose('lamp', 'Det nyare sparade värdet', member);
  await save('member-newer', member);
  const before = await read();
  const memberBefore = await read(member);
  const historyBefore = await history();
  transport.command('arm resolve:before');
  let delivered = false;
  const pending = through('resolve', {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    conflict: draftConflicts(before).find((conflict) => conflict.id === 'lamp'),
    choice: 'saved',
  }).then((response) => {
    delivered = true;
    return response;
  });
  await expect
    .poll(() => transport.command('status').held, { timeout: 1000 })
    .toEqual({ route: 'resolve', boundary: 'before' });
  expect(delivered).toBe(false);
  expect(events).toEqual([{ phase: 'held-before', route: 'resolve' }]);
  expect(await read()).toEqual(before);
  expect(await read(member)).toEqual(memberBefore);
  expect(await history()).toEqual(historyBefore);
  transport.command('release');
  await checked(await pending);
  const after = await read();
  expect(after.objects).toEqual(before.objects);
  expect(after.draft.changes).toEqual(
    before.draft.changes.filter((change) => change.id === 'independent'),
  );
  expect(await read(member)).toEqual(memberBefore);
  expect(await history()).toEqual(historyBefore);
});

test('a discard-change hold before application execution leaves unrelated proposals and saved content intact', async () => {
  await propose('keep', 'Ett annat privat förslag');
  const before = await read();
  const historyBefore = await history();
  transport.command('arm discard:before');
  const pending = through('discard-change', {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    kind: 'object',
    id: 'independent',
  });
  await expect
    .poll(() => transport.command('status').held, { timeout: 1000 })
    .toEqual({ route: 'discard', boundary: 'before' });
  expect(await read()).toEqual(before);
  transport.command('release');
  await checked(await pending);
  const after = await read();
  expect(after.objects).toEqual(before.objects);
  expect(after.draft.changes).toEqual(
    before.draft.changes.filter((change) => change.id === 'keep'),
  );
  expect(await history()).toEqual(historyBefore);
});

test('a resolve hold after application completion hides delivery while exposing only the actual private result', async () => {
  await propose('lamp', 'Mitt förslag');
  await propose('lamp', 'Sparat namn', member);
  await save('member-newer', member);
  const before = await read();
  const historyBefore = await history();
  transport.command('arm resolve:after');
  let delivered = false;
  const pending = through('resolve', {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    conflict: draftConflicts(before).find((conflict) => conflict.id === 'lamp'),
    choice: 'saved',
  }).then((response) => {
    delivered = true;
    return response;
  });
  await expect
    .poll(() => transport.command('status').held)
    .toEqual({ route: 'resolve', boundary: 'after' });
  expect(delivered).toBe(false);
  expect(events).toEqual([
    { phase: 'application-completed', route: 'resolve', status: 200 },
    { phase: 'held-after', route: 'resolve', status: 200 },
  ]);
  const completed = await read();
  expect(completed.draft.version).toBe(before.draft.version + 1);
  expect(completed.draft.changes).toEqual(
    before.draft.changes.filter((change) => change.id === 'independent'),
  );
  expect(completed.objects).toEqual(before.objects);
  expect(await history()).toEqual(historyBefore);
  transport.command('release');
  expect(await checked(await pending)).toEqual(completed.draft);
  expect(await read()).toEqual(completed);
});

test.each([
  ['discard-change', 'after'],
  ['discard-review', 'before'],
  ['discard-review', 'after'],
  ['discard', 'before'],
  ['discard', 'after'],
] as const)(
  'a %s hold at %s preserves the endpoint’s actual private mutation and its delivery boundary',
  async (route, boundary) => {
    await propose('keep', 'Ett annat privat förslag');
    const before = await read();
    const memberBefore = await read(member);
    const historyBefore = await history();
    const body = {
      version: before.draft.version,
      contentVersion: before.contentVersion,
      ...(route === 'discard' ? {} : { kind: 'object', id: 'independent' }),
    };
    const confirmation =
      route === 'discard-review' ? (await checked(await post(route, body))).plan : undefined;
    if (confirmation)
      expect(confirmation).toEqual({ removed: ['object-independent'], affected: [] });
    expect(await read()).toEqual(before);
    transport.command(`arm discard:${boundary}`);
    let delivered = false;
    const pending = through(route, { ...body, ...(confirmation ? { confirmation } : {}) }).then(
      (response) => {
        delivered = true;
        return response;
      },
    );
    await expect
      .poll(() => transport.command('status').held)
      .toEqual({ route: 'discard', boundary });
    expect(delivered).toBe(false);
    const held = await read();
    if (boundary === 'before') expect(held).toEqual(before);
    else {
      expect(events).toEqual([
        { phase: 'application-completed', route: 'discard', status: 200 },
        { phase: 'held-after', route: 'discard', status: 200 },
      ]);
      expect(held.draft.version).toBe(before.draft.version + 1);
      expect(held.draft.changes).toEqual(
        route === 'discard' ? [] : before.draft.changes.filter((change) => change.id === 'keep'),
      );
    }
    expect(held.objects).toEqual(before.objects);
    expect(await read(member)).toEqual(memberBefore);
    expect(await history()).toEqual(historyBefore);
    transport.command('release');
    const result = await checked(await pending);
    const after = await read();
    expect(after.draft.version).toBe(before.draft.version + 1);
    expect(after.draft.changes).toEqual(
      route === 'discard' ? [] : before.draft.changes.filter((change) => change.id === 'keep'),
    );
    expect(route === 'discard-review' ? result.state : result).toEqual(
      route === 'discard-review' ? after : after.draft,
    );
    expect(after.objects).toEqual(before.objects);
    expect(await read(member)).toEqual(memberBefore);
    expect(await history()).toEqual(historyBefore);
  },
);

test('a discard-review response can be held after execution without confirming or changing the proposal', async () => {
  const before = await read();
  transport.command('arm discard:after');
  const pending = through('discard-review', {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    kind: 'object',
    id: 'independent',
  });
  await expect
    .poll(() => transport.command('status').held)
    .toEqual({ route: 'discard', boundary: 'after' });
  expect(events).toEqual([
    { phase: 'application-completed', route: 'discard', status: 200 },
    { phase: 'held-after', route: 'discard', status: 200 },
  ]);
  expect(await read()).toEqual(before);
  transport.command('release');
  expect(await checked(await pending)).toEqual({
    plan: { removed: ['object-independent'], affected: [] },
  });
  expect(await read()).toEqual(before);
});

test('a held resolution is rejected with its real 409 after newer shared content replaces the reviewed basis', async () => {
  await propose('lamp', 'Mitt förslag');
  await propose('lamp', 'Sparat namn', member);
  await save('member-newer', member);
  const before = await read();
  const conflict = draftConflicts(before).find((item) => item.id === 'lamp');
  if (!conflict) throw new Error('Expected an actual concurrent edit');
  transport.command('arm resolve:before');
  const pending = through('resolve', {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    conflict,
    basis: conflictBasis(before, conflict),
    choices: Object.fromEntries(
      conflictProperties(before, conflict).map((property) => [property.key, 'saved']),
    ),
  });
  await expect
    .poll(() => transport.command('status').held)
    .toEqual({ route: 'resolve', boundary: 'before' });
  await propose('lamp', 'Ett ännu nyare sparat namn', member);
  await save('member-newest', member);
  const newer = await read();
  const historyBeforeRelease = await history();
  expect(newer.draft).toEqual(before.draft);
  transport.command('release');
  expect(await checked(await pending, 409)).toEqual({ error: 'resolution_conflict' });
  expect(await read()).toEqual(newer);
  expect(await history()).toEqual(historyBeforeRelease);
});

test('a stale discard result held after execution reports the actual 409 without removing any current proposal', async () => {
  const stale = await read();
  await propose('keep', 'Ett nyare privat förslag');
  const before = await read();
  const historyBefore = await history();
  transport.command('arm discard:after');
  const pending = through('discard-change', {
    version: stale.draft.version,
    contentVersion: stale.contentVersion,
    kind: 'object',
    id: 'independent',
  });
  await expect
    .poll(() => transport.command('status').held)
    .toEqual({ route: 'discard', boundary: 'after' });
  expect(events).toEqual([
    { phase: 'application-completed', route: 'discard', status: 409 },
    { phase: 'held-after', route: 'discard', status: 409 },
  ]);
  expect(await read()).toEqual(before);
  transport.command('release');
  expect(await checked(await pending, 409)).toEqual({ error: 'draft_conflict' });
  expect(await read()).toEqual(before);
  expect(await history()).toEqual(historyBefore);
});

test('an armed resolve remains scoped to the selected household and actual method, preserving upstream authorization and origin checks', async () => {
  const before = await read();
  const body = { version: before.draft.version, contentVersion: before.contentVersion };
  transport.command('arm resolve:before');
  const unrelated = await through('resolve', body, otherPath);
  expect(await checked(unrelated, 403)).toEqual({ error: 'forbidden' });
  const wrongMethod = await owner.get(`${transport.address}${path}/map/resolve`, {
    headers: { host: new URL(app.origin).host },
  });
  expect(wrongMethod.status()).toBe(404);
  expect((await through('resolve-conflict', body)).status()).toBe(404);
  const wrongHost = await owner.get(`${transport.address}${path}/map`);
  expect(wrongHost.status()).toBe(421);
  expect(transport.command('status')).toEqual({
    armed: { route: 'resolve', boundary: 'before' },
    active: undefined,
    held: undefined,
  });
  expect(events).toEqual([]);
  expect(await read()).toEqual(before);
  const forbidden = owner.post(`${transport.address}${path}/map/resolve`, {
    headers: { host: new URL(app.origin).host, origin: 'https://foreign.example.test' },
    data: body,
  });
  await expect
    .poll(() => transport.command('status').held)
    .toEqual({ route: 'resolve', boundary: 'before' });
  transport.command('release');
  expect(await checked(await forbidden, 403)).toEqual({ error: 'forbidden' });
  expect(await read()).toEqual(before);
});

test('discard interception forwards an unauthenticated request unchanged and retains the application’s 401', async () => {
  const before = await read();
  const anonymous = await request.newContext();
  try {
    transport.command('arm discard:after');
    const pending = through(
      'discard-change',
      {
        version: before.draft.version,
        contentVersion: before.contentVersion,
        kind: 'object',
        id: 'independent',
      },
      path,
      anonymous,
    );
    await expect
      .poll(() => transport.command('status').held)
      .toEqual({ route: 'discard', boundary: 'after' });
    expect(events).toEqual([
      { phase: 'application-completed', route: 'discard', status: 401 },
      { phase: 'held-after', route: 'discard', status: 401 },
    ]);
    expect(await read()).toEqual(before);
    transport.command('release');
    expect(await checked(await pending, 401)).toEqual({ error: 'unauthenticated' });
  } finally {
    await anonymous.dispose();
  }
  expect(await read()).toEqual(before);
});
