import { unzipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
let submission: Record<string, unknown>;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}`;
  for (const id of ['source', 'target']) {
    const state = await read();
    expect(
      (
        await client.json(`${path}/map/draft`, {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: { name: id, typeId: state.types[0].id },
        })
      ).status,
    ).toBe(200);
  }
  const state = await read();
  submission = {
    id: 'relationship',
    stagingId: (
      await (
        await client.json(`${path}/map/relationship-form-ticket`, {
          contentVersion: state.contentVersion,
        })
      ).json()
    ).stagingId,
    version: state.draft.version,
    contentVersion: state.contentVersion,
    baseRevision: null,
    typeRevision: state.relationshipTypes[0].revision,
    value: {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'source',
      targetId: 'target',

      properties: [
        { id: 'memo', label: 'Beskrivning', kind: 'text', value: 'Sambandets egen anteckning' },
        { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
        { id: 'no', label: 'Samma', kind: 'boolean', value: false },
        { id: 'empty', label: 'Tomt', kind: 'date' },
      ],
    },
  };
});
afterEach(() => fixture.close());
async function read(): Promise<MapState> {
  return (await client.request(`${path}/map`)).json();
}
const submit = (value = submission) => client.json(`${path}/map/relationship-form`, value);
const outcome = () =>
  `${path}/map/relationship-form/${submission.stagingId}?contentVersion=${submission.contentVersion}`;

test('complete form attempts enforce authentication, membership, origin, owner, versions and reference guards without partial drafts', async () => {
  const before = await read();
  expect((await fixture.client().request(outcome())).status).toBe(401);
  expect(
    (
      await client.request(`${path}/map/relationship-form`, {
        method: 'POST',
        headers: { origin: 'https://elsewhere.test', 'content-type': 'application/json' },
        body: JSON.stringify(submission),
      })
    ).status,
  ).toBe(403);
  for (const update of [
    { contentVersion: undefined },
    { contentVersion: null },
    { typeRevision: undefined },
    { version: -1 },
    { value: { ...(submission.value as object), targetId: 'missing' } },
    { value: { ...(submission.value as object), lifecycle: 'invalid' } },
  ])
    expect((await submit({ ...submission, ...update })).status).toBe(400);
  for (const update of [{ version: 0 }, { contentVersion: 2 }, { typeRevision: 999 }])
    expect((await submit({ ...submission, ...update })).status).toBe(409);
  expect((await read()).draft).toEqual(before.draft);
  fixture.setSubject('another-owner');
  const member = fixture.client();
  await member.signIn();
  expect((await member.request(outcome())).status).toBe(403);
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  expect((await member.json('/api/invitations/accept', { code })).status).toBe(200);
  expect((await submit()).status).toBe(200);
  const own = await (await client.request(outcome())).json();
  expect(own.outcome.status).toBe('staged');
  const other = await (await member.request(outcome())).json();
  expect(other.error).toBe('relationship_confirmation_unavailable');
});

test('immutable form evidence does not enter shared receipts or portable archives and survives restart-compatible exact replay', async () => {
  const staged = await (await submit()).json();
  const saved = await client.json(`${path}/map/save`, {
    version: staged.state.draft.version,
    contentVersion: 1,
    operationId: 'form-save',
  });
  expect(saved.status).toBe(200);
  const receipt = (await saved.json()).receipt;
  expect(JSON.stringify(receipt)).not.toContain(submission.stagingId);
  expect(JSON.stringify(receipt)).not.toContain('proposedAt');
  const replay = await (await submit()).json();
  expect(replay.outcome).toEqual(staged.outcome);
  expect(replay.state.draft.relationships ?? []).toEqual([]);
  expect(replay.state.relationships).toHaveLength(1);
  const prepared = await (await client.json(`${path}/exports`, {})).json();
  const bytes = new Uint8Array(
    await (await client.request(`${path}/exports/${prepared.id}`)).arrayBuffer(),
  );
  const archive = unzipSync(bytes);
  expect(JSON.parse(new TextDecoder().decode(archive['manifest.json'])).schemaVersion).toBe(40);
  const content = new TextDecoder().decode(archive['content.json']);
  expect(content).not.toContain(submission.stagingId);
  expect(content).not.toContain('relationship_form_attempt');
  const upload = await client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes as BodyInit,
  });
  expect(upload.status).toBe(201);
  const ready = await upload.json();
  expect(
    (
      await client.json(`${path}/imports/${ready.id}/confirm`, {
        contentVersion: 1,
        confirmed: true,
      })
    ).status,
  ).toBe(200);
  expect((await client.request(outcome())).status).toBe(409);
  const latest = await read();
  expect(latest.relationships).toHaveLength(1);
  expect(latest.relationships[0].properties).toEqual(
    (submission.value as { properties: unknown }).properties,
  );
  const current = await client.request(
    `${path}/map/relationship-form/${submission.stagingId}?contentVersion=${latest.contentVersion}`,
  );
  expect((await current.json()).error).toBe('relationship_confirmation_unavailable');
});

test('permanent content erasure invalidates private form evidence containing the erased relationship values', async () => {
  const staged = await (await submit()).json();
  expect(
    (
      await client.json(`${path}/map/save`, {
        version: staged.state.draft.version,
        contentVersion: 1,
        operationId: 'before-erasure',
      })
    ).status,
  ).toBe(200);
  const selection = [{ kind: 'relationship', id: 'relationship' }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  const erased = await client.json(`${path}/erasure/execute`, {
    selection,
    token: review.token,
    operationId: 'erase-form-content',
    confirmation: 'RADERA PERMANENT',
  });
  expect(erased.status).toBe(200);
  const latest = await read();
  expect(latest.relationships).toEqual([]);
  const recovery = await client.request(
    `${path}/map/relationship-form/${submission.stagingId}?contentVersion=${latest.contentVersion}`,
  );
  expect((await recovery.json()).error).toBe('relationship_confirmation_unavailable');
});

test('only server-issued attempts establish absence; old identifiers cannot become fresh writes', async () => {
  const before = await read();
  submission.stagingId = crypto.randomUUID();
  expect((await submit()).status).toBe(409);
  expect(await (await client.request(outcome())).json()).toEqual({
    error: 'relationship_confirmation_unavailable',
  });
  const ticket = await client.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 });
  expect(ticket.status).toBe(200);
  submission.stagingId = (await ticket.json()).stagingId;
  expect((await (await client.request(outcome())).json()).outcome).toBeNull();
  expect((await read()).draft).toEqual(before.draft);
  expect((await submit()).status).toBe(200);
});

test('seven-day recovery survives save and a real database reopen without renewal, then fences delayed writes', async () => {
  const { householdMap } = await import('../../../src/server/map.js');
  const { openDatabase } = await import('../../../src/server/database.js');
  const before = await read();
  const householdId = path.split('/').at(-1) as string;
  let time = Date.now();
  let database = fixture.database;
  const map = () => householdMap(database, before.userId, householdId, () => time);
  submission.stagingId = map().relationshipFormTicket(1).stagingId;
  const staged = map().proposeRelationshipForm(submission);
  map().save({
    version: staged.state.draft.version,
    contentVersion: 1,
    operationId: 'retention-save',
  });
  const duplicate = {
    ...submission,
    id: 'duplicate',
    version: map().read().draft.version,
    stagingId: map().relationshipFormTicket(1).stagingId,
  };
  expect(map().proposeRelationshipForm(duplicate).outcome?.status).toBe('duplicate');
  const stable = map().read();
  const history = map().history();
  const deadlines = database
    .prepare('SELECT expiresAt FROM relationship_form_attempt ORDER BY stagingId')
    .all();
  await fixture.app.close();
  database.close();
  database = openDatabase(fixture.config.databasePath);
  try {
    time += 7 * 24 * 60 * 60_000 - 1;
    for (const body of [submission, duplicate]) {
      expect(map().relationshipFormOutcome(body.stagingId as string, 1).outcome).not.toBeNull();
      expect(map().proposeRelationshipForm(body).outcome?.stagingId).toBe(body.stagingId);
    }
    expect(
      database.prepare('SELECT expiresAt FROM relationship_form_attempt ORDER BY stagingId').all(),
    ).toEqual(deadlines);
    time++;
    for (const body of [submission, duplicate]) {
      expect(() => map().relationshipFormOutcome(body.stagingId as string, 1)).toThrow(
        'relationship_confirmation_unavailable',
      );
      expect(() => map().proposeRelationshipForm(body)).toThrow(
        'relationship_confirmation_unavailable',
      );
    }
    expect(map().read()).toEqual(stable);
    expect(map().history()).toEqual(history);
    expect(map().operation('retention-save').operation).not.toBeNull();
    database.prepare('DELETE FROM relationship_form_attempt').run();
    expect(() => map().proposeRelationshipForm(duplicate)).toThrow(
      'relationship_confirmation_unavailable',
    );
    expect(map().read()).toEqual(stable);
    const fresh = { ...duplicate, stagingId: map().relationshipFormTicket(1).stagingId };
    expect(map().proposeRelationshipForm(fresh).outcome?.status).toBe('duplicate');
  } finally {
    database.close();
  }
});

test('duplicate padding has fixed retained cost and changed reuse remains rejected', async () => {
  const staged = await (await submit()).json();
  const before = await read();
  const sizes: number[] = [];
  for (const padding of ['', 'x'.repeat(16_384)]) {
    const ticket = await (
      await client.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 })
    ).json();
    const body = {
      ...submission,
      stagingId: ticket.stagingId,
      id: 'duplicate',
      version: staged.state.draft.version,
      ignoredPadding: padding,
    };
    const result = await (await submit(body)).json();
    expect(result.outcome.status).toBe('duplicate');
    const row = fixture.database
      .prepare(`SELECT length(cast(submission AS blob)) + length(fingerprint) + length(cast(outcome AS blob)) AS bytes
      FROM relationship_form_attempt WHERE stagingId = ?`)
      .get(ticket.stagingId) as { bytes: number };
    sizes.push(row.bytes);
    expect((await submit(body)).status).toBe(200);
    expect(await (await submit({ ...body, ignoredPadding: `${padding}!` })).json()).toEqual({
      error: 'operation_reused',
    });
    // Property order, unlike property values, is not a change to the request.
    expect((await submit(Object.fromEntries(Object.entries(body).reverse()))).status).toBe(200);
  }
  expect(sizes[0]).toBe(sizes[1]);
  expect(await read()).toEqual(before);
});

// Seed already-retained evidence at the storage boundary; requests and draft
// observations still use the production HTTP path. No disk-full test is needed.
function seedAttempts(count: number) {
  fixture.database
    .prepare(`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < ?)
    INSERT INTO relationship_form_attempt (householdId, userId, contentVersion, stagingId, submission, outcome, expiresAt, fingerprint, accountedBytes)
    SELECT householdId, userId, contentVersion, printf('seed-%08d', n), '', outcome, expiresAt, fingerprint,
      accountedBytes - length(cast(stagingId AS blob)) + length(printf('seed-%08d', n))
    FROM relationship_form_attempt, numbers WHERE stagingId = ?`)
    .run(count, submission.stagingId as string);
}

test('exact member count admission is atomic for concurrent requests and never evicts accepted outcomes', async () => {
  const accepted = await (await submit()).json();
  seedAttempts(998);
  const before = await read();
  const bodies = [];
  for (let index = 0; index < 2; index++) {
    const ticket = await (
      await client.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 })
    ).json();
    bodies.push({
      ...submission,
      id: 'duplicate',
      stagingId: ticket.stagingId,
      version: before.draft.version,
    });
  }
  const replies = await Promise.all(bodies.map((body) => submit(body)));
  expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
  const rejectedIndex = replies.findIndex((reply) => reply.status === 409);
  expect(await replies[rejectedIndex].json()).toEqual({
    error: 'relationship_confirmation_capacity',
  });
  const full = await read();
  expect(full).toEqual(before);
  expect((await (await submit()).json()).outcome).toEqual(accepted.outcome);
  const newTicket = await (
    await client.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 })
  ).json();
  for (let index = 0; index < 3; index++) {
    expect(
      await (
        await submit({
          ...submission,
          stagingId: newTicket.stagingId,
          version: full.draft.version,
          value: null,
        })
      ).json(),
    ).toEqual({ error: 'relationship_confirmation_capacity' });
  }
  expect(await read()).toEqual(full);
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 1000 });
});

test('a ticket expires after one hour without becoming a fresh write, including after a clock edit or another caller', async () => {
  const { householdMap } = await import('../../../src/server/map.js');
  const before = await read();
  let time = Date.now();
  const map = householdMap(
    fixture.database,
    before.userId,
    path.split('/').at(-1) as string,
    () => time,
  );
  submission.stagingId = map.relationshipFormTicket(1).stagingId;
  time += 60 * 60_000 - 1;
  expect(map.relationshipFormOutcome(submission.stagingId as string, 1).outcome).toBeNull();
  time++;
  expect(() => map.proposeRelationshipForm(submission)).toThrow(
    'relationship_confirmation_unavailable',
  );
  submission.stagingId = `${time}.${(submission.stagingId as string).split('.').slice(1).join('.')}`;
  expect(() => map.proposeRelationshipForm(submission)).toThrow(
    'relationship_confirmation_unavailable',
  );
  expect(map.read()).toEqual(before);
});

test.each(['member', 'installation'] as const)(
  'the exact %s byte boundary counts full staged values and rejects without changing the draft',
  async (scope) => {
    const accepted = await (await submit()).json();
    const original = fixture.database
      .prepare('SELECT * FROM relationship_form_attempt')
      .get() as Record<string, string | number>;
    const before = await read();
    const ticket = await (
      await client.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 })
    ).json();
    const value = {
      ...(submission.value as object),
      verb: 'har samband med',
      properties: [{ id: 'large', label: 'Anteckning', kind: 'text', value: 'å'.repeat(10_000) }],
    };
    const body = {
      ...submission,
      stagingId: ticket.stagingId,
      version: before.draft.version,
      value,
    };
    const expectedOutcome = {
      status: 'staged',
      stagingId: ticket.stagingId,
      relationshipId: 'relationship',
      draftVersion: before.draft.version + 1,
      value,
    };
    const size = (row: Record<string, unknown>) =>
      512 +
      ['householdId', 'userId', 'stagingId', 'submission', 'outcome', 'fingerprint'].reduce(
        (sum, key) => sum + Buffer.byteLength(String(row[key] ?? ''), 'utf8'),
        0,
      );
    const nextSize = size({
      ...original,
      stagingId: ticket.stagingId,
      outcome: JSON.stringify(expectedOutcome),
    });
    expect(original.accountedBytes).toBe(size(original));
    const limit = (scope === 'member' ? 8 : 64) * 1024 * 1024;
    if (scope === 'installation') {
      // An unrelated household's grandfathered evidence consumes the global budget.
      fixture.database
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run('other-home', 'Björken', new Date().toISOString());
      fixture.database
        .prepare('INSERT INTO content_identity (householdId, id, userId, name) VALUES (?, ?, ?, ?)')
        .run('other-home', original.userId, original.userId, 'Alex');
      fixture.database
        .prepare('UPDATE relationship_form_attempt SET householdId = ?')
        .run('other-home');
      original.householdId = 'other-home';
    }
    const fill = limit - size(original) - nextSize - (scope === 'installation' ? 4096 : 0);
    const fillEvidence = (length: number) => {
      const submission = JSON.stringify('x'.repeat(length));
      fixture.database
        .prepare('UPDATE relationship_form_attempt SET submission = ?, accountedBytes = ?')
        .run(submission, size({ ...original, submission }));
    };
    fillEvidence(fill - 1);
    expect(await (await submit(body)).json()).toEqual({
      error: 'relationship_confirmation_capacity',
    });
    expect(await read()).toEqual(before);
    fillEvidence(fill - 2);
    const admitted = await submit(body);
    expect(admitted.status, await admitted.clone().text()).toBe(200);
    expect((await admitted.json()).outcome).toEqual(expectedOutcome);
    const stored = fixture.database
      .prepare('SELECT * FROM relationship_form_attempt WHERE stagingId = ?')
      .get(ticket.stagingId) as Record<string, unknown>;
    expect(stored.accountedBytes).toBe(nextSize);
    expect(stored.accountedBytes).toBe(size(stored));
    expect((await read()).draft.relationships?.[0].after?.properties).toEqual(value.properties);
    if (scope === 'member')
      expect((await (await submit()).json()).outcome).toEqual(accepted.outcome);
  },
);

test('the installation count ceiling also binds a new member while checks and retries remain available', async () => {
  const accepted = await (await submit()).json();
  await client.json(`${path}/map/save`, {
    version: accepted.state.draft.version,
    contentVersion: 1,
    operationId: 'seed-global',
  });
  seedAttempts(9998);
  fixture.setSubject('fresh-member');
  const member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  await member.json('/api/invitations/accept', { code });
  const before = await (await member.request(`${path}/map`)).json();
  const bodies = [];
  for (let index = 0; index < 2; index++) {
    const ticket = await (
      await member.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 })
    ).json();
    bodies.push({
      ...submission,
      id: 'duplicate',
      stagingId: ticket.stagingId,
      version: before.draft.version,
    });
  }
  expect((await member.json(`${path}/map/relationship-form`, bodies[0])).status).toBe(200);
  expect(await (await member.json(`${path}/map/relationship-form`, bodies[1])).json()).toEqual({
    error: 'relationship_confirmation_capacity',
  });
  expect((await member.json(`${path}/map/relationship-form`, bodies[0])).status).toBe(200);
  expect(await (await member.request(`${path}/map`)).json()).toEqual(before);
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 10000 });
});

test('saved relationship edits and removals keep their full outcomes for seven days without expiring map history', async () => {
  const { householdMap } = await import('../../../src/server/map.js');
  const before = await read();
  let time = Date.now();
  const map = householdMap(
    fixture.database,
    before.userId,
    path.split('/').at(-1) as string,
    () => time,
  );
  const added = map.proposeRelationshipForm(submission);
  map.save({ version: added.state.draft.version, contentVersion: 1, operationId: 'save-add' });
  const edit = {
    ...submission,
    version: map.read().draft.version,
    baseRevision: 1,
    stagingId: map.relationshipFormTicket(1).stagingId,
    value: { ...(submission.value as object), lifecycle: 'ended' },
  };
  const edited = map.proposeRelationshipForm(edit);
  map.save({ version: edited.state.draft.version, contentVersion: 1, operationId: 'save-edit' });
  const remove = {
    ...edit,
    version: map.read().draft.version,
    baseRevision: 2,
    stagingId: map.relationshipFormTicket(1).stagingId,
    value: null,
  };
  const removed = map.proposeRelationshipForm(remove);
  map.save({ version: removed.state.draft.version, contentVersion: 1, operationId: 'save-remove' });
  const stable = map.read();
  const history = map.history();
  time += 604800000 - 1;
  expect(map.proposeRelationshipForm(edit).outcome).toEqual(edited.outcome);
  expect(map.proposeRelationshipForm(remove).outcome).toEqual(removed.outcome);
  time++;
  for (const body of [edit, remove]) {
    expect(() => map.proposeRelationshipForm(body)).toThrow(
      'relationship_confirmation_unavailable',
    );
    expect(() => map.relationshipFormOutcome(body.stagingId, 1)).toThrow(
      'relationship_confirmation_unavailable',
    );
  }
  expect(map.read()).toEqual(stable);
  expect(map.history()).toEqual(history);
});

test('revoked membership cannot recover an accepted result or obtain new attempt identifiers', async () => {
  const before = await read();
  expect((await submit()).status).toBe(200);
  fixture.database
    .prepare('DELETE FROM membership WHERE householdId = ? AND userId = ?')
    .run(path.split('/').at(-1), before.userId);
  expect((await client.request(outcome())).status).toBe(403);
  expect((await submit()).status).toBe(403);
  expect(
    (await client.json(`${path}/map/relationship-form-ticket`, { contentVersion: 1 })).status,
  ).toBe(403);
});
