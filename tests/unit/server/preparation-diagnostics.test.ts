import { expect, test } from 'vitest';
import { unexpectedPreparationDiagnostics } from '../../support/preparation-diagnostics.js';

const grant = {
  event: 'security_operation',
  schemaVersion: 1,
  reference: '11111111-1111-4111-8111-111111111111',
  operationReference: '22222222-2222-4222-8222-222222222222',
  at: '2026-11-02T12:00:00.000Z',
  operation: 'grant_approve',
  outcome: 'succeeded',
  reason: 'state_changed',
  code: 'committed',
  stage: 'consent',
  version: 'development',
  commit: 'development',
  actorId: '33333333-3333-4333-8333-333333333333',
  householdId: '44444444-4444-4444-8444-444444444444',
  targetId: '55555555-5555-4555-8555-555555555555',
  status: 200,
};
const line = (event: unknown) => `${JSON.stringify(event)}\n`;

test('expected preparation security events coexist with an otherwise quiet launcher', () => {
  const { status: _status, ...mutation } = { ...grant, stage: 'mutation' };
  const targetUserId = '66666666-6666-4666-8666-666666666666';
  const output = [
    grant,
    { ...mutation, operation: 'invitation_create', targetUserId, replacedCount: 0 },
    {
      ...mutation,
      operation: 'invitation_accept',
      targetUserId,
      previousRole: 'none',
      role: 'member',
    },
    { ...mutation, operation: 'membership_remove', previousRole: 'member', role: 'none' },
  ]
    .map(line)
    .join('');
  expect(unexpectedPreparationDiagnostics(output)).toBe('');
  expect(unexpectedPreparationDiagnostics('')).toBe('');
});

test.each([
  { outcome: 'failed', code: 'internal_failure' },
  { outcome: 'rejected', code: 'forbidden' },
  { outcome: 'suppressed', code: 'delivery_loss' },
  { operation: 'grant_revoke' },
  { status: 500 },
  { schemaVersion: 2 },
  { stage: 'cleanup' },
  { actorId: 'unverified-input' },
  { at: 'invalid-time' },
  { token: 'sensitive-data' },
  { payload: { transcript: 'private conversation' } },
])('unexpected security data remains an assertion failure: %j', (change) => {
  const unexpected = line({ ...grant, ...change });
  expect(unexpectedPreparationDiagnostics(line(grant) + unexpected)).toBe(unexpected);
});

test('raw errors, truncated JSON and voice interruption diagnostics remain visible', () => {
  const diagnostic = line({ event: 'voice_interrupted', code: 'voice_access_lost' });
  const errors = `Unhandled failure\n${diagnostic}{"event":"security_operation"`;
  expect(unexpectedPreparationDiagnostics(line(grant) + errors)).toBe(errors);
});
