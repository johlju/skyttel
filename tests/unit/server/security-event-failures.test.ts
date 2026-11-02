import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invalidateHouseholdExports } from '../../../src/server/household-export.js';
import { applicationFixture } from './fixture.js';

vi.mock('node:fs/promises', { spy: true });
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let admin: ReturnType<typeof fixture.client>;
let householdId: string;
let lines: string[];
const events = () => lines.map((line) => JSON.parse(line));
beforeEach(async () => {
  lines = [];
  fixture = await applicationFixture({
    securityEventSink: {
      available: () => true,
      write: (line) => {
        lines.push(line);
      },
    },
  });
  admin = fixture.client();
  await admin.signIn();
  householdId = (await (await admin.json('/api/households', { name: 'Private household' })).json())
    .household.id;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await invalidateHouseholdExports(fixture.database, householdId);
  fixture.close();
});

test('archive creation failure produces one safe failure and retains the normal HTTP error', async () => {
  vi.mocked(open).mockRejectedValueOnce(
    Object.assign(new Error('secret-disk-path'), { code: 'secret-code' }),
  );
  const response = await admin.json(`/api/households/${householdId}/exports`, {});
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'internal_error' });
  expect(events()).toHaveLength(1);
  expect(events()[0]).toMatchObject({
    operation: 'export_prepare',
    outcome: 'failed',
    code: 'internal_failure',
    stage: 'preparation',
    status: 500,
  });
  expect(lines.join('')).not.toContain('secret');
});

test('archive stream failure is distinct from cancellation and completion without leaking the error', async () => {
  const path = `/api/households/${householdId}/exports`;
  const { id } = await (await admin.json(path, {})).json();
  const real = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(createReadStream).mockImplementationOnce((path, options) => {
    const stream = real.createReadStream(path, options);
    stream.destroy(new Error('secret-file-path'));
    return stream;
  });
  const response = await admin.request(`${path}/${id}`);
  expect(response.status).toBe(200);
  await expect(response.arrayBuffer()).rejects.toThrow('secret-file-path');
  expect(events().map((event) => event.outcome)).toEqual(['succeeded', 'started', 'failed']);
  expect(events()[2]).toMatchObject({
    operation: 'export_download',
    stage: 'download',
    code: 'internal_failure',
  });
  expect(events()[2]).not.toHaveProperty('status');
  expect(lines.join('')).not.toContain('secret');
});

test('a cleanup error after demotion does not conceal the committed membership change', async () => {
  fixture.setSubject('second-administrator');
  const other = fixture.client();
  await other.signIn();
  const targetId = (await (await other.request('/api/bootstrap')).json()).user.id;
  const { code } = await (
    await admin.json(`/api/households/${householdId}/invitations`, { userId: targetId })
  ).json();
  await other.json('/api/invitations/accept', { code });
  const path = `/api/households/${householdId}/members/${targetId}/role`;
  await admin.json(path, { role: 'administrator' });
  await other.json(`/api/households/${householdId}/exports`, {});
  lines.length = 0;
  vi.mocked(rm).mockRejectedValueOnce(new Error('secret-cleanup-path'));
  const response = await admin.json(path, { role: 'member' });
  expect(response.status).toBe(500);
  const administration = await (
    await admin.request(`/api/households/${householdId}/administration`)
  ).json();
  expect(
    administration.members.find((member: { userId: string }) => member.userId === targetId).role,
  ).toBe('member');
  const membershipEvents = events().filter((event) => event.operation === 'membership_role');
  expect(membershipEvents).toHaveLength(2);
  expect(membershipEvents[0]).toMatchObject({
    outcome: 'succeeded',
    code: 'committed',
    previousRole: 'administrator',
    role: 'member',
    stage: 'mutation',
  });
  expect(membershipEvents[1]).toMatchObject({
    outcome: 'failed',
    code: 'internal_failure',
    stage: 'cleanup',
  });
  expect(membershipEvents[1].operationReference).toBe(membershipEvents[0].operationReference);
  expect(lines.join('')).not.toContain('secret');
});
