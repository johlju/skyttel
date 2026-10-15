import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let other: APIRequestContext;
let database: Database.Database;
let held: ((output: unknown[]) => void)[];
let snapshotDirectory: string | undefined;
afterEach(async () => {
  for (const release of held ?? []) release([modelMessage('Klart.')]);
  vi.useRealTimers();
  if (database?.open) database.close();
  await browser?.dispose();
  await other?.dispose();
  await app?.close();
  if (snapshotDirectory) rmSync(snapshotDirectory, { recursive: true, force: true });
  snapshotDirectory = undefined;
});

test.each(['logout', 'deadline', 'restart'] as const)(
  'background expiry preserves OFF text stop authority until %s and never removes an independent external grant',
  async (ending) => {
    let time = Date.now();
    held = [];
    const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
    });
    vi.setSystemTime(time);
    app = await createInstallation(undefined, { now: () => time, modelFetch: model.provider });
    await vi.advanceTimersByTimeAsync(100);
    browser = await request.newContext();
    other = await request.newContext();
    await signIn(browser, app.origin);
    const login = await (await browser.get(`${app.origin}/api/auth/get-session`)).json();
    const end = Date.parse(login.session.expiresAt);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    const map = await (await browser.get(mapPath)).json();
    time = end - 1_000;
    vi.setSystemTime(time);
    await signIn(other, app.origin);
    const external = await beginAssistant(other, app.origin);
    const consented = await external.consent(household.id);
    const tokens = await external.exchange((await consented.json()).url);
    const { access_token: externalToken } = await tokens.json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const conversation = await (
      await browser.post(path, {
        headers: { origin: app.origin },
        data: approvedForVisit,
      })
    ).json();
    expect(
      (
        await browser.post(`${path}/${conversation.id}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: 'accepted',
            revision: 0,
            draftVersion: 0,
            contentVersion: 1,
            text: 'Lägg till Sent.',
          },
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => held.length).toBe(1);
    const changed = await browser.post(`${app.origin}/api/browser-binding/revoke`, {
      headers: { origin: app.origin },
      data: { id: randomUUID() },
    });
    expect(changed.status()).toBe(200);
    const replacement = await changed.json();
    await browser.addCookies([
      {
        name: replacement.cookieName,
        value: replacement.candidate,
        url: app.origin,
        sameSite: 'Lax',
      },
    ]);
    expect(
      (
        await browser.post(`${app.origin}/api/browser-binding/register`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    database = new Database(join(app.directory, 'skyttel.db'), { readonly: true });
    const count = (table: string, predicate = '1') =>
      (
        database.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${predicate}`).get() as {
          count: number;
        }
      ).count;
    async function swept(read: () => number, expected = 0) {
      // Intervals are controlled; Node's HTTP/MCP event loop remains real.
      // Let bounded sweeps finish without advancing the installation deadline
      // or sending requests merely to trigger cleanup.
      await expect
        .poll(
          async () => {
            await vi.advanceTimersByTimeAsync(60_000);
            vi.setSystemTime(time);
            return read();
          },
          { interval: 5, timeout: 2_000 },
        )
        .toBe(expected);
    }
    time = end;
    await swept(() => count('session', `id = '${login.session.id}'`));
    expect(count('browser_binding', 'sessionId IS NULL')).toBe(1);
    expect(count('assistant_connection', 'browserSessionId IS NOT NULL')).toBe(1);
    if (ending === 'restart') {
      // A checkpoint taken during accepted work models the persisted state
      // left by process death. Graceful close must not erase this specimen.
      snapshotDirectory = mkdtempSync(join(tmpdir(), 'skyttel-cleanup-crash-'));
      const snapshot = join(snapshotDirectory, 'skyttel.db');
      await app.saveDatabase(snapshot);
      const originalTask = database
        .prepare(
          'SELECT taskExpiresAt FROM assistant_connection WHERE browserSessionId IS NOT NULL',
        )
        .get() as { taskExpiresAt: number };
      const storageState = await other.storageState();
      database.close();
      await browser.dispose();
      await other.dispose();
      await app.close();
      time = originalTask.taskExpiresAt - 1;
      app = await createInstallation(undefined, {
        now: () => time,
        databasePath: snapshot,
        modelFetch: model.provider,
      });
      browser = await request.newContext();
      other = await request.newContext({ storageState });
      database = new Database(snapshot, { readonly: true });
      // No accepted instruction can resume in the new process. Its private
      // grant is unnecessary even though the original deadline is in future.
      expect(count('assistant_connection', 'browserSessionId IS NOT NULL')).toBe(0);
      await swept(() => count('browser_binding', 'sessionId IS NULL'));
      time += 1;
      await swept(() => count('oauthClient'), 1);
      expect(count('assistant_connection', 'browserSessionId IS NULL')).toBe(1);
      expect(count('browser_binding', 'sessionId IS NULL')).toBe(0);
      expect(
        (await (await other.get(`${app.origin}/api/households/${household.id}/map`)).json()).draft
          .changes,
      ).toEqual([]);
      expect(held).toHaveLength(1);
      await app.restart();
      await vi.advanceTimersByTimeAsync(60_100);
      expect(count('assistant_connection', 'browserSessionId IS NOT NULL')).toBe(0);
      return;
    }
    if (ending === 'logout') {
      expect(
        (
          await browser.post(`${app.origin}/api/auth/sign-out`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
    } else {
      const task = database
        .prepare(
          'SELECT taskExpiresAt FROM assistant_connection WHERE browserSessionId IS NOT NULL',
        )
        .get() as { taskExpiresAt: number };
      time = task.taskExpiresAt - 1;
      await vi.advanceTimersByTimeAsync(60_100);
      vi.setSystemTime(time);
      expect(count('assistant_connection', 'browserSessionId IS NOT NULL')).toBe(1);
      time += 1;
      await swept(() => count('assistant_connection', 'browserSessionId IS NOT NULL'));
      await swept(() => count('browser_binding', 'sessionId IS NULL'));
    }
    held[0]([
      modelTool('submit_changes', {
        version: 0,
        contentVersion: 1,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'late',
              baseRevision: null,
              value: { typeId: map.types[0].id, name: 'Sent', description: '' },
            },
          },
        ],
      }),
    ]);
    await swept(() => count('assistant_connection', 'browserSessionId IS NOT NULL'));
    await swept(() => count('oauthClient'), 1);
    expect((await (await other.get(mapPath)).json()).draft.changes).toEqual([]);
    expect((await callAssistant(app.origin, externalToken, 'read_map')).status).toBe(200);
    expect(await (await browser.get(`${app.origin}/api/auth/get-session`)).json()).toBeNull();
  },
);
