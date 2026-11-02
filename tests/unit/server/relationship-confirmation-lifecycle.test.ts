import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import { householdMap } from '../../../src/server/map.js';
import { relationshipConfirmationCleanup } from '../../../src/server/relationship-form-attempts.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let directory: string | undefined;
let reopened: Database.Database | undefined;
let stop: (() => void) | undefined;
afterEach(async () => {
  stop?.();
  if (reopened?.open) reopened.close();
  fixture?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function prepare(legacy = false) {
  if (legacy) {
    directory = mkdtempSync(join(tmpdir(), 'skyttel-confirmation-migrations-'));
    cpSync(resolve('migrations'), directory, { recursive: true });
    for (const name of readdirSync(directory))
      if (name.endsWith('.sql') && Number(name.split('_')[0]) > 41) rmSync(join(directory, name));
  }
  fixture = await applicationFixture({ migrationsDirectory: legacy ? directory : undefined });
  const client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  const state = await (await client.request(`/api/households/${household.id}/map`)).json();
  const map = householdMap(fixture.database, state.userId, household.id);
  for (const id of ['source', 'target'])
    map.propose({
      version: map.read().draft.version,
      contentVersion: 1,
      id,
      baseRevision: null,
      value: { name: id, typeId: state.types[0].id },
    });
  const body = {
    version: map.read().draft.version,
    contentVersion: 1,
    id: 'edge',
    baseRevision: null,
    typeRevision: state.relationshipTypes[0].revision,
    stagingId: crypto.randomUUID() as string,
    ignoredPadding: 'å'.repeat(16384),
    value: { typeId: state.relationshipTypes[0].id, sourceId: 'source', targetId: 'target' },
  };
  return { householdId: household.id, userId: state.userId, map, body };
}

test.each([1, 1001])(
  'legacy %i-row evidence receives one upgrade grace and preserves exact replay until expiry',
  async (count) => {
    const { map: oldMap, householdId, userId, body } = await prepare(true);
    const staged = oldMap.proposeRelationship(body);
    const outcome = {
      status: 'staged',
      stagingId: body.stagingId,
      relationshipId: body.id,
      draftVersion: staged.version,
      value: staged.relationships?.[0].after,
    };
    const insert = fixture.database.prepare(
      'INSERT INTO relationship_form_attempt VALUES (?, ?, 1, ?, ?, ?)',
    );
    fixture.database.transaction(() => {
      insert.run(
        householdId,
        userId,
        body.stagingId,
        JSON.stringify(body),
        JSON.stringify(outcome),
      );
      for (let index = 1; index < count; index++)
        insert.run(
          householdId,
          userId,
          crypto.randomUUID(),
          JSON.stringify(body),
          JSON.stringify(outcome),
        );
    })();
    const preserved = oldMap.read();
    await fixture.app.close();
    fixture.database.close();
    const upgradeStart = Date.now();
    reopened = openDatabase(fixture.config.databasePath);
    const deadline = () =>
      reopened
        ?.prepare(
          'SELECT min(expiresAt) AS first, max(expiresAt) AS last FROM relationship_form_attempt',
        )
        .get() as { first: number; last: number };
    const grace = deadline();
    const evidenceBytes = () =>
      reopened
        ?.prepare('SELECT sum(accountedBytes) AS bytes FROM relationship_form_attempt')
        .get() as { bytes: number };
    const compactedBytes =
      512 +
      [householdId, userId, body.stagingId, JSON.stringify(outcome)].reduce(
        (sum, value) => sum + Buffer.byteLength(value, 'utf8'),
        0,
      ) +
      64;
    expect(evidenceBytes()).toEqual({
      bytes: count * (compactedBytes - 64 + Buffer.byteLength(JSON.stringify(body), 'utf8')),
    });
    expect(grace.first).toBeGreaterThanOrEqual(upgradeStart + 604800000);
    expect(grace.last).toBe(grace.first);
    expect(grace.first).toBeLessThanOrEqual(Date.now() + 604800000);
    reopened.close();
    reopened = openDatabase(fixture.config.databasePath);
    expect(deadline()).toEqual(grace);
    let time = grace.first - 1;
    const map = () => householdMap(reopened as Database.Database, userId, householdId, () => time);
    expect(map().proposeRelationshipForm(body).outcome).toEqual(outcome);
    expect(() => map().proposeRelationshipForm({ ...body, ignoredPadding: 'changed' })).toThrow(
      'operation_reused',
    );
    stop = relationshipConfirmationCleanup(reopened, () => time);
    // Drain the bounded legacy compaction batches without advancing server time.
    await vi.waitFor(() =>
      expect(
        reopened
          ?.prepare(
            'SELECT count(*) AS count FROM relationship_form_attempt WHERE fingerprint IS NULL',
          )
          .get(),
      ).toEqual({ count: 0 }),
    );
    expect(
      reopened
        .prepare("SELECT count(*) AS count FROM relationship_form_attempt WHERE submission != ''")
        .get(),
    ).toEqual({ count: 0 });
    expect(deadline()).toEqual(grace);
    expect(map().proposeRelationshipForm(body).outcome).toEqual(outcome);
    expect(evidenceBytes()).toEqual({ bytes: count * compactedBytes });
    // Repeating cleanup must not charge the fingerprint or release the request twice.
    stop();
    stop = relationshipConfirmationCleanup(reopened, () => time);
    expect(evidenceBytes()).toEqual({ bytes: count * compactedBytes });
    expect(() => map().proposeRelationshipForm({ ...body, ignoredPadding: 'changed' })).toThrow(
      'operation_reused',
    );
    const fresh = {
      ...body,
      id: 'duplicate',
      version: preserved.draft.version,
      stagingId: map().relationshipFormTicket(1).stagingId,
    };
    if (count > 1000)
      expect(() => map().proposeRelationshipForm(fresh)).toThrow(
        'relationship_confirmation_capacity',
      );
    else expect(map().proposeRelationshipForm(fresh).outcome?.status).toBe('duplicate');
    time++;
    expect(() => map().relationshipFormOutcome(body.stagingId, 1)).toThrow(
      'relationship_confirmation_unavailable',
    );
    expect(() => map().proposeRelationshipForm(body)).toThrow(
      'relationship_confirmation_unavailable',
    );
    stop();
    stop = relationshipConfirmationCleanup(reopened, () => time);
    await vi.waitFor(() =>
      expect(
        reopened
          ?.prepare(
            'SELECT count(*) AS count FROM relationship_form_attempt WHERE fingerprint IS NULL OR expiresAt <= ?',
          )
          .get(time),
      ).toEqual({ count: 0 }),
    );
    expect(map().read()).toEqual(preserved);
    expect(() => map().proposeRelationshipForm(body)).toThrow(
      'relationship_confirmation_unavailable',
    );
    expect(
      map().proposeRelationshipForm({
        ...fresh,
        stagingId: map().relationshipFormTicket(1).stagingId,
      }).outcome?.status,
    ).toBe('duplicate');
  },
);

test('startup and idle cleanup use bounded batches, recover after a database failure and preserve drafts', async () => {
  const { map, body, householdId, userId } = await prepare();
  body.stagingId = map.relationshipFormTicket(1).stagingId;
  map.proposeRelationshipForm(body);
  const preserved = map.read();
  const deadline = (
    fixture.database.prepare('SELECT expiresAt FROM relationship_form_attempt').get() as {
      expiresAt: number;
    }
  ).expiresAt;
  fixture.database
    .prepare(`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < 249)
    INSERT INTO relationship_form_attempt (householdId, userId, contentVersion, stagingId, submission, outcome, expiresAt, fingerprint, accountedBytes)
    SELECT householdId, userId, contentVersion, 'seed-' || n, submission, outcome, expiresAt, fingerprint,
      accountedBytes - length(cast(stagingId AS blob)) + length('seed-' || n)
    FROM relationship_form_attempt, numbers WHERE stagingId = ?`)
    .run(body.stagingId);
  await fixture.app.close();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setImmediate', 'clearImmediate'] });
  let time = deadline - 1;
  stop = relationshipConfirmationCleanup(fixture.database, () => time);
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 250 });
  time++;
  fixture.database.exec(
    "CREATE TRIGGER reject_confirmation_cleanup BEFORE DELETE ON relationship_form_attempt BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  );
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  await vi.advanceTimersByTimeAsync(60_000);
  expect(errors).toHaveBeenCalledWith(
    JSON.stringify({ event: 'relationship_confirmation_cleanup_failed' }),
  );
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 250 });
  fixture.database.exec('DROP TRIGGER reject_confirmation_cleanup');
  stop();
  stop = relationshipConfirmationCleanup(fixture.database, () => time);
  // Startup performs one bounded transaction before yielding.
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 150 });
  await vi.advanceTimersByTimeAsync(10);
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 0 });
  expect(map.read()).toEqual(preserved);
  const current = householdMap(fixture.database, userId, householdId, () => time);
  const fresh = {
    ...body,
    id: 'duplicate',
    version: preserved.draft.version,
    stagingId: current.relationshipFormTicket(1).stagingId,
  };
  current.proposeRelationshipForm(fresh);
  time += 604800000;
  await vi.advanceTimersByTimeAsync(60_010);
  expect(
    fixture.database.prepare('SELECT count(*) AS count FROM relationship_form_attempt').get(),
  ).toEqual({ count: 0 });
  expect(map.read()).toEqual(preserved);
  stop();
  await vi.advanceTimersByTimeAsync(120_000);
});
