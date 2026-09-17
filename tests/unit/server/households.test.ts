import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  createHousehold,
  householdAccess,
  isFirstAdmin,
  isInitialized,
} from '../../../src/server/households.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
beforeEach(async () => {
  fixture = await applicationFixture();
  for (const [id, provider, subject] of [
    ['administrator', 'google', 'synthetic-admin'],
    ['member', 'google', 'other-subject'],
    ['same-subject', 'microsoft', 'synthetic-admin'],
  ]) {
    fixture.database
      .prepare('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'Synthetic user', `${id}@example.test`, '2026-01-01', '2026-01-01');
    fixture.database
      .prepare(
        'INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(`account-${id}`, subject, provider, id, '2026-01-01', '2026-01-01');
  }
});
afterEach(() => fixture.close());

describe('household access and installation setup', () => {
  test('matches both identity provider and subject when recognizing the administrator', () => {
    expect(isFirstAdmin(fixture.database, 'administrator', fixture.config)).toBe(true);
    expect(isFirstAdmin(fixture.database, 'member', fixture.config)).toBe(false);
    expect(isFirstAdmin(fixture.database, 'same-subject', fixture.config)).toBe(false);
    expect(isFirstAdmin(fixture.database, 'missing', fixture.config)).toBe(false);
  });

  test('creation grants administrator access and marks the installation initialized', () => {
    expect(isInitialized(fixture.database)).toBe(false);
    const result = createHousehold(fixture.database, fixture.config, 'administrator', 'Linden');
    if ('error' in result) throw new Error(result.error);
    expect(householdAccess(fixture.database, 'administrator')).toEqual(result.household);
    expect(householdAccess(fixture.database, 'administrator', result.household.id)).toEqual(
      result.household,
    );
    expect(result.household).toMatchObject({ name: 'Linden', role: 'administrator' });
    expect(isInitialized(fixture.database)).toBe(true);
  });

  test('an unauthorized identity cannot initialize the household', () => {
    expect(createHousehold(fixture.database, fixture.config, 'member', 'Linden')).toEqual({
      error: 'forbidden',
    });
    expect(isInitialized(fixture.database)).toBe(false);
    expect(householdAccess(fixture.database, 'member')).toBeUndefined();
  });

  test('a second creation attempt preserves the original household', () => {
    const first = createHousehold(fixture.database, fixture.config, 'administrator', 'Linden');
    if ('error' in first) throw new Error(first.error);
    expect(createHousehold(fixture.database, fixture.config, 'administrator', 'Örnen')).toEqual({
      error: 'already_initialized',
    });
    expect(householdAccess(fixture.database, 'administrator')).toEqual(first.household);
  });

  test('a failed creation leaves setup available for a corrected name', () => {
    expect(() => createHousehold(fixture.database, fixture.config, 'administrator', '')).toThrow();
    expect(isInitialized(fixture.database)).toBe(false);
    expect(
      createHousehold(fixture.database, fixture.config, 'administrator', 'Linden'),
    ).toHaveProperty('household.name', 'Linden');
  });

  test('membership grants access only to its own household and takes effect immediately when revoked', () => {
    const result = createHousehold(fixture.database, fixture.config, 'administrator', 'Linden');
    if ('error' in result) throw new Error(result.error);
    expect(householdAccess(fixture.database, 'member', result.household.id)).toBeUndefined();
    fixture.database
      .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
      .run(result.household.id, 'member', 'member');
    expect(householdAccess(fixture.database, 'member', result.household.id)).toEqual({
      ...result.household,
      role: 'member',
    });
    expect(householdAccess(fixture.database, 'member', 'another-household')).toBeUndefined();
    fixture.database.prepare('DELETE FROM membership WHERE userId = ?').run('member');
    expect(householdAccess(fixture.database, 'member', result.household.id)).toBeUndefined();
  });
});
