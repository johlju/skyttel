import { expect, test } from 'vitest';
import { AdministrationError } from '../../../src/server/administration.js';
import { createSecurityEvents } from '../../../src/server/security-events.js';

test('security events expose only bounded diagnostic context as single-line JSON', () => {
  const lines: string[] = [];
  const events = createSecurityEvents({
    identity: { version: '1.2.3', commit: 'a'.repeat(40) },
    now: () => Date.parse('2026-11-02T12:00:00Z'),
    sink: {
      available: () => true,
      write: (line) => {
        lines.push(line);
      },
    },
  });
  const operation = events.begin('membership_role');
  operation.known({ actorId: 'actor-1', householdId: 'household-1', targetId: 'target-1' });
  operation.stage = 'mutation';
  operation.record('succeeded', 'committed', { previousRole: 'member', role: 'administrator' });
  expect(JSON.parse(lines[0])).toEqual({
    event: 'security_operation',
    schemaVersion: 1,
    reference: expect.any(String),
    operationReference: expect.any(String),
    at: '2026-11-02T12:00:00.000Z',
    operation: 'membership_role',
    outcome: 'succeeded',
    reason: 'state_changed',
    code: 'committed',
    stage: 'mutation',
    version: '1.2.3',
    commit: 'a'.repeat(40),
    actorId: 'actor-1',
    householdId: 'household-1',
    targetId: 'target-1',
    previousRole: 'member',
    role: 'administrator',
  });
  expect(lines[0].split('\n')).toHaveLength(2);
});

test('unreviewed errors, extra fields and hostile references cannot enter security records', () => {
  const lines: string[] = [];
  const events = createSecurityEvents({
    sink: {
      available: () => true,
      write: (line) => {
        lines.push(line);
      },
    },
    identity: { version: 'secret\nforged', commit: 'x'.repeat(1000) },
  });
  const operation = events.begin('grant_approve');
  operation.known({
    actorId: 'secret\nforged',
    householdId: 'x'.repeat(1000),
    targetId: '\u001b[31m',
  });
  operation.stage = 'consent';
  operation.failure(new AdministrationError('secret-token\nforged', 403));
  operation.failure(
    Object.assign(new Error('secret payload'), { code: 'forbidden', token: 'secret-token' }),
  );
  operation.record('succeeded', 'committed', {
    status: 999,
    role: 'secret-role',
    previousRole: '\n',
    replacedCount: Infinity,
    ...{ cookie: 'secret-cookie' },
  });
  for (const line of lines) {
    expect(line.length).toBeLessThan(2048);
    expect(line.split('\n')).toHaveLength(2);
    expect(line).not.toContain('secret');
    expect(line).not.toContain('forged');
    const record = JSON.parse(line);
    expect(record).not.toHaveProperty('actorId');
    expect(record).not.toHaveProperty('householdId');
    expect(record).not.toHaveProperty('targetId');
    expect(record).not.toHaveProperty('cookie');
    expect(record.version).toBe('unknown');
    expect(record.commit).toBe('unknown');
  }
  expect(JSON.parse(lines[0])).toMatchObject({
    code: 'internal_failure',
    stage: 'consent',
    status: 403,
  });
  expect(JSON.parse(lines[1])).toMatchObject({ code: 'internal_failure', status: 500 });
});

test('rejection floods have fixed memory and visible suppression without suppressing successes', () => {
  let time = 60_000;
  const lines: string[] = [];
  const events = createSecurityEvents({
    now: () => time,
    sink: {
      available: () => true,
      write: (line) => {
        lines.push(line);
      },
    },
  });
  for (let i = 0; i < 1000; i++) events.begin('membership_role').record('rejected', 'forbidden');
  expect(lines).toHaveLength(21);
  expect(JSON.parse(lines[20])).toMatchObject({ code: 'rejection_limit', count: 1 });
  events.begin('membership_role').record('succeeded', 'committed');
  expect(JSON.parse(lines[21]).outcome).toBe('succeeded');
  time += 60_000;
  events.begin('invitation_create').record('rejected', 'unauthenticated');
  expect(JSON.parse(lines[22])).toMatchObject({ code: 'rejection_limit', count: 980 });
  expect(JSON.parse(lines[23]).outcome).toBe('rejected');
});

test('unavailable or throwing sinks never queue events and report bounded loss after recovery', () => {
  let available = false;
  let throws = false;
  const lines: string[] = [];
  const events = createSecurityEvents({
    sink: {
      available: () => available,
      write: (line) => {
        if (throws) throw new Error('secret sink failure');
        lines.push(line);
      },
    },
  });
  for (let i = 0; i < 1000; i++) events.begin('membership_role').record('succeeded', 'committed');
  expect(lines).toEqual([]);
  available = true;
  throws = true;
  expect(() => events.begin('membership_role').record('succeeded', 'committed')).not.toThrow();
  throws = false;
  events.begin('membership_role').record('succeeded', 'committed');
  expect(lines).toHaveLength(2);
  expect(JSON.parse(lines[0])).toMatchObject({ code: 'delivery_loss', count: 1002 });
  expect(JSON.parse(lines[1]).outcome).toBe('succeeded');
});

test('a sink that applies backpressure after a write receives no more records until it drains', () => {
  let ready = true;
  const lines: string[] = [];
  const events = createSecurityEvents({
    sink: {
      available: () => ready,
      write: (line) => {
        lines.push(line);
        ready = false;
      },
    },
  });
  events.begin('export_prepare').record('succeeded', 'archive_ready');
  for (let index = 0; index < 1000; index++)
    events.begin('membership_role').record('succeeded', 'committed');
  expect(lines).toHaveLength(1);
  ready = true;
  events.begin('membership_role').record('succeeded', 'committed');
  expect(lines).toHaveLength(2);
  expect(JSON.parse(lines[1])).toMatchObject({ code: 'delivery_loss', count: 1000 });
});
