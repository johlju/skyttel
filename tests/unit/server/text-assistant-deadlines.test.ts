import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import {
  activateRememberedLogin,
  createHousehold,
  restartWithSession,
  signIn,
} from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { advanceActiveLogin } from '../../support/session-time.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test.each(['missing', 'invalid'])(
  '%s auth with an occupied live binding cannot stop its session, accepted task or login attempt',
  async (auth) => {
    const held: ((output: unknown[]) => void)[] = [];
    const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
    app = await createInstallation(undefined, { modelFetch: model.provider });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const original = await (await browser.get(`${app.origin}/api/auth/get-session`)).json();
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    const map = await (await browser.get(mapPath)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const session = await (
      await browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
    ).json();
    expect(
      (
        await browser.post(`${path}/${session.id}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: 'held',
            revision: 0,
            draftVersion: 0,
            contentVersion: 1,
            text: 'Lägg till Behållet arbete.',
          },
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => held.length).toBe(1);
    const started = await browser.post(`${app.origin}/api/auth/sign-in/social`, {
      headers: { origin: app.origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    expect(started.status()).toBe(200);
    const state = await browser.storageState();
    state.cookies = state.cookies.flatMap((cookie) =>
      cookie.name.endsWith('better-auth.session_token')
        ? auth === 'missing'
          ? []
          : [{ ...cookie, value: 'invalid-authentication' }]
        : [cookie],
    );
    const unauthenticated = await request.newContext({ storageState: state });
    try {
      expect(
        (
          await unauthenticated.post(`${app.origin}/api/auth/sign-out`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(401);
      expect((await browser.get(mapPath)).status()).toBe(200);
      held[0]([
        modelTool('submit_changes', {
          version: 0,
          contentVersion: 1,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'preserved',
                baseRevision: null,
                value: { typeId: map.types[0].id, name: 'Behållet arbete' },
              },
            },
          ],
        }),
      ]);
      await expect
        .poll(async () => (await (await browser.get(mapPath)).json()).draft.changes)
        .toMatchObject([{ id: 'preserved', after: { name: 'Behållet arbete' } }]);
      const callback = await browser.get((await started.json()).url, { maxRedirects: 0 });
      expect(callback.status()).toBe(302);
      expect(callback.headers().location).not.toContain('binding_invalid');
      expect((await browser.get(mapPath)).status()).toBe(200);
      expect(
        (await (await browser.get(`${app.origin}/api/auth/get-session`)).json()).session.id,
      ).not.toBe(original.session.id);
      expect(
        (
          await browser.post(`${app.origin}/api/auth/sign-out`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
      expect((await browser.get(mapPath)).status()).toBe(401);
    } finally {
      held[0]?.([modelMessage('Klart.')]);
      await unauthenticated.dispose();
    }
  },
);

test('a known browser binding cannot use another binding’s auth cookie to log its session out', async () => {
  app = await createInstallation();
  browser = await request.newContext();
  const other = await request.newContext();
  try {
    await signIn(browser, app.origin);
    await signIn(other, app.origin);
    const foreign = (await other.storageState()).cookies.filter((cookie) =>
      cookie.name.endsWith('better-auth.session_token'),
    );
    await browser.addCookies(foreign);
    expect(
      (
        await browser.post(`${app.origin}/api/auth/sign-out`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(401);
    expect((await (await other.get(`${app.origin}/api/bootstrap`)).json()).status).toBe('setup');
  } finally {
    await other.dispose();
  }
});

test('OFF preserves accepted text and its original login end, then logout after natural cleanup stops the rotated binding’s task', async () => {
  const startedAt = Date.now();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(startedAt);
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  const other = await request.newContext();
  try {
    app = await createInstallation(undefined, {
      now: () => Date.now(),
      modelFetch: model.provider,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const started = await browser.post(`${app.origin}/api/auth/sign-in/social`, {
      headers: { origin: app.origin },
      data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
    });
    const callback = await browser.get((await started.json()).url, { maxRedirects: 0 });
    await activateRememberedLogin(browser, app.origin);
    const proof = new URL(callback.headers().location, app.origin).searchParams.get(
      'loginConfirmation',
    );
    const confirmed = await (
      await browser.get(`${app.origin}/api/browser-binding/confirmation?proof=${proof}`, {
        headers: { origin: app.origin },
      })
    ).json();
    expect(confirmed).toMatchObject({ remembered: true, expiresAt: startedAt + 604_800_000 });
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    const map = await (await browser.get(mapPath)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    vi.setSystemTime(confirmed.expiresAt - 1_000);
    await signIn(other, app.origin);
    const external = await beginAssistant(other, app.origin);
    const consented = await external.consent(household.id);
    const tokens = await external.exchange((await consented.json()).url);
    const { access_token: externalToken } = await tokens.json();
    expect((await callAssistant(app.origin, externalToken, 'read_map')).status).toBe(200);
    const session = await (
      await browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
    ).json();
    const post = async (requestId: string, draftVersion: number) => {
      const view = await (await browser.get(`${path}/${session.id}`)).json();
      return browser.post(`${path}/${session.id}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId,
          revision: view.revision,
          draftVersion,
          contentVersion: 1,
          text: `Lägg till ${requestId}.`,
        },
      });
    };
    expect((await post('before-off', 0)).status()).toBe(202);
    await expect.poll(() => held.length).toBe(1);
    const revoked = await browser.post(`${app.origin}/api/browser-binding/revoke`, {
      headers: { origin: app.origin },
      data: { id: randomUUID() },
    });
    expect(revoked.status()).toBe(200);
    const replacement = await revoked.json();
    expect(replacement).toMatchObject({
      sessionId: confirmed.sessionId,
      expiresAt: confirmed.expiresAt,
    });
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
    const proposal = (id: string, version: number) => [
      modelTool('submit_changes', {
        version,
        contentVersion: 1,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id,
              baseRevision: null,
              value: { typeId: map.types[0].id, name: id },
            },
          },
        ],
      }),
    ];
    held[0](proposal('before-off', 0));
    await expect
      .poll(async () => (await (await browser.get(mapPath)).json()).draft.changes)
      .toMatchObject([{ id: 'before-off' }]);
    await expect
      .poll(async () => (await (await browser.get(`${path}/${session.id}`)).json()).phase)
      .not.toBe('working');
    expect((await post('stopped-after-off', 1)).status()).toBe(202);
    await expect.poll(() => held.length).toBe(2);
    vi.setSystemTime(confirmed.expiresAt + 1_000);
    expect((await (await browser.get(`${app.origin}/api/bootstrap`)).json()).status).toBe(
      'anonymous',
    );
    // Bootstrap uses Better Auth's real natural-expiry cleanup. Only the
    // replacement binding and its accepted-task context remain for logout.
    expect(
      (
        await browser.post(`${app.origin}/api/auth/sign-out`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    held[1](proposal('stopped-after-off', 1));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await (await other.get(mapPath)).json()).draft.changes).toMatchObject([
      { id: 'before-off' },
    ]);
    expect((await (await other.get(mapPath)).json()).draft.changes).toHaveLength(1);
    expect((await callAssistant(app.origin, externalToken, 'read_map')).status).toBe(200);
    await signIn(browser, app.origin);
    expect((await (await browser.get(mapPath)).json()).draft.changes).toMatchObject([
      { id: 'before-off' },
    ]);
    expect((await (await browser.get(mapPath)).json()).draft.changes).toHaveLength(1);
  } finally {
    for (const release of held) release([modelMessage('Klart.')]);
    await other.dispose();
    vi.useRealTimers();
  }
});

test('a model result at the original thirty minute deadline cannot mutate the draft', async () => {
  let clock = Date.now();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  let typeId: string;
  const model = textModel(async () => {
    entered = true;
    await waiting;
    return [
      modelTool('submit_changes', {
        version: 0,
        contentVersion: 1,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'too-late',
              baseRevision: null,
              value: { typeId, name: 'För sent' },
            },
          },
        ],
      }),
    ];
  });
  app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const mapPath = `${app.origin}/api/households/${household.id}/map`;
  const map = await (await browser.get(mapPath)).json();
  typeId = map.types[0].id;
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const accepted = await browser.post(`${path}/${session.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      requestId: 'original',
      revision: 0,
      draftVersion: 0,
      contentVersion: 1,
      text: 'Lägg till För sent.',
    },
  });
  expect(accepted.status()).toBe(202);
  await expect.poll(() => entered).toBe(true);
  clock += 30 * 60_000;
  release();
  await expect
    .poll(async () => (await (await browser.get(`${path}/${session.id}`)).json()).phase)
    .not.toBe('working');
  expect((await (await browser.get(mapPath)).json()).draft.changes).toEqual([]);
});

test('accepted text finishes after natural login expiry and its committed draft survives login and restart', async () => {
  let clock = Date.now();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  let completed = false;
  let typeId: string;
  const model = textModel(async () => {
    entered = true;
    await waiting;
    return [
      modelTool('submit_changes', {
        version: 0,
        contentVersion: 1,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'accepted-text',
              baseRevision: null,
              value: { typeId, name: 'Mottaget arbete' },
            },
          },
        ],
      }),
    ];
  });
  app = await createInstallation(undefined, {
    now: () => clock,
    modelFetch: model.provider,
    observe: (event) => {
      if (
        event.kind === 'mcp_completed' &&
        (event.data as { name: string }).name === 'propose_object'
      )
        completed = true;
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const mapPath = `${app.origin}/api/households/${household.id}/map`;
  const map = await (await browser.get(mapPath)).json();
  typeId = map.types.find((type: { name: string }) => type.name === 'Person').id;
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  await advanceActiveLogin(browser, app.origin, 8 * 60 * 60_000 - 1_000, (elapsed) => {
    clock += elapsed;
  });
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  // The natural absolute login limit is eight hours. Accept one second before it.
  const response = await browser.post(`${path}/${session.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      requestId: 'original',
      revision: 0,
      draftVersion: 0,
      contentVersion: 1,
      text: `Lägg till Mottaget arbete som person (${typeId}).`,
    },
  });
  expect(response.status(), await response.text()).toBe(202);
  await expect.poll(() => entered).toBe(true);
  clock += 2_000;
  // Better Auth may remove a naturally expired row on a read. Arrange that
  // cleanup on an independent connection; it must not become explicit logout.
  const cleanup = new Database(join(app.directory, 'skyttel.db'));
  cleanup.pragma('foreign_keys = ON');
  cleanup.prepare('DELETE FROM session').run();
  cleanup.close();
  expect((await browser.get(mapPath)).status()).toBe(401);
  expect(
    (
      await browser.post(`${path}/${session.id}/messages`, {
        headers: { origin: app.origin },
        data: { requestId: 'late', text: 'Spara allt' },
      })
    ).status(),
  ).toBe(401);
  release();
  await expect.poll(() => completed).toBe(true);
  await signIn(browser, app.origin);
  const saved = await (await browser.get(mapPath)).json();
  expect(saved.draft.changes).toMatchObject([
    { id: 'accepted-text', after: { name: 'Mottaget arbete' } },
  ]);
  browser = await restartWithSession(browser, app.restart);
  expect((await (await browser.get(mapPath)).json()).draft.changes).toEqual(saved.draft.changes);
});

test('queue time and identical retries consume the original deadline instead of renewing it', async () => {
  let clock = Date.now();
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const mapPath = `${app.origin}/api/households/${household.id}/map`;
  const map = await (await browser.get(mapPath)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const post = (requestId: string) =>
    browser.post(`${path}/${session.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId,
        revision: 0,
        draftVersion: 0,
        contentVersion: 1,
        text: 'Lägg till ett förslag.',
      },
    });
  expect((await post('first')).status()).toBe(202);
  await expect.poll(() => held.length).toBe(1);
  clock += 60_000;
  const queued = await post('queued');
  expect(queued.status()).toBe(202);
  const { receivedAt, deadline } = (await queued.json()).tasks.find(
    (task: { id: string }) => task.id === 'queued',
  );
  expect(deadline - receivedAt).toBe(1_800_000);
  clock += 60_000;
  const retry = await post('queued');
  expect(
    (await retry.json()).tasks.find((task: { id: string }) => task.id === 'queued'),
  ).toMatchObject({ receivedAt, deadline, status: 'queued' });
  clock = deadline - 1_000;
  held[0]([modelMessage('Det första svaret är färdigt.')]);
  await expect.poll(() => held.length).toBe(2);
  clock = deadline;
  held[1]([
    modelTool('submit_changes', {
      version: 0,
      contentVersion: 1,
      completion: 'draft',
      operations: [
        {
          name: 'propose_object',
          arguments: {
            id: 'queue-too-late',
            baseRevision: null,
            value: { typeId: map.types[0].id, name: 'Köns förslag' },
          },
        },
      ],
    }),
  ]);
  await expect
    .poll(async () => (await (await browser.get(`${path}/${session.id}`)).json()).phase)
    .not.toBe('working');
  expect((await (await browser.get(mapPath)).json()).draft.changes).toEqual([]);
});

test.each(['logout after expiry', 'consent revocation', 'membership revocation'])(
  '%s stops a held accepted instruction without losing an earlier committed draft',
  async (stop) => {
    let clock = Date.now();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    let returned = false;
    let typeId: string;
    const model = textModel(async () => {
      entered = true;
      await waiting;
      returned = true;
      return [
        modelTool('submit_changes', {
          version: 1,
          contentVersion: 1,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'stopped',
                baseRevision: null,
                value: { typeId, name: 'Stoppat arbete' },
              },
            },
          ],
        }),
      ];
    });
    app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const bootstrap = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    const map = await (await browser.get(mapPath)).json();
    typeId = map.types[0].id;
    expect(
      (
        await browser.post(`${mapPath}/draft`, {
          headers: { origin: app.origin },
          data: {
            version: 0,
            contentVersion: 1,
            id: 'earlier',
            baseRevision: null,
            value: { typeId, name: 'Redan lagrat' },
          },
        })
      ).status(),
    ).toBe(200);
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    await advanceActiveLogin(browser, app.origin, 8 * 60 * 60_000 - 1_000, (elapsed) => {
      clock += elapsed;
    });
    const session = await (
      await browser.post(path, {
        headers: { origin: app.origin },
        data: approvedForVisit,
      })
    ).json();
    expect(
      (
        await browser.post(`${path}/${session.id}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: 'held',
            revision: 0,
            draftVersion: 1,
            contentVersion: 1,
            text: 'Lägg till Stoppat arbete.',
          },
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => entered).toBe(true);
    if (stop === 'logout after expiry') {
      clock += 2_000;
      expect(
        (
          await browser.post(`${app.origin}/api/auth/sign-out`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
    } else if (stop === 'consent revocation') {
      expect(
        (
          await browser.post(
            `${app.origin}/api/households/${household.id}/conversation-consent/revoke`,
            {
              headers: { origin: app.origin },
              data: {},
            },
          )
        ).status(),
      ).toBe(200);
    } else {
      app.revokeMembership(bootstrap.user.id);
      // Restoring access cannot restore the old assistant grant.
      const arrangement = new Database(join(app.directory, 'skyttel.db'));
      arrangement
        .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
        .run(household.id, bootstrap.user.id, 'administrator');
      arrangement.close();
    }
    release();
    await expect.poll(() => returned).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (stop === 'logout after expiry') await signIn(browser, app.origin);
    expect((await (await browser.get(mapPath)).json()).draft.changes).toMatchObject([
      { id: 'earlier', after: { name: 'Redan lagrat' } },
    ]);
    expect((await (await browser.get(mapPath)).json()).draft.changes).toHaveLength(1);
  },
);

test('a later queued instruction cannot extend an earlier explicit save authority deadline', async () => {
  let clock = Date.now();
  const receivedAt = clock;
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const mapPath = `${app.origin}/api/households/${household.id}/map`;
  const map = await (await browser.get(mapPath)).json();
  await browser.post(`${mapPath}/draft`, {
    headers: { origin: app.origin },
    data: {
      version: 0,
      contentVersion: 1,
      id: 'earlier',
      baseRevision: null,
      value: { typeId: map.types[0].id, name: 'Osparat förslag' },
    },
  });
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const post = (requestId: string, text: string) =>
    browser.post(`${path}/${session.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId,
        revision: 0,
        draftVersion: 1,
        contentVersion: 1,
        text,
      },
    });
  expect((await post('save', 'Spara hela utkastet.')).status()).toBe(202);
  await expect.poll(() => held.length).toBe(1);
  clock += 60_000;
  expect((await post('explain', 'Förklara mitt utkast.')).status()).toBe(202);
  clock = receivedAt + 29 * 60_000 + 59_000;
  held[0]([modelMessage('Det finns ett väntande uppdrag.')]);
  await expect.poll(() => held.length).toBe(2);
  clock = receivedAt + 30 * 60_000 + 30_000;
  held[1]([
    modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'provider-save' }),
  ]);
  await expect
    .poll(async () => (await (await browser.get(`${path}/${session.id}`)).json()).phase)
    .not.toBe('working');
  const after = await (await browser.get(mapPath)).json();
  expect(after.objects).toEqual([]);
  expect(after.draft.changes).toHaveLength(1);
  expect((await (await browser.get(`${path}/${session.id}`)).json()).operations).toEqual([]);
});

test('a late voice result before its timer runs preserves already accepted queued text', async () => {
  let clock = Date.now();
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  let proposalCommitted = false;
  app = await createInstallation(undefined, {
    now: () => clock,
    modelFetch: model.provider,
    observe: (event) => {
      if (
        event.kind === 'mcp_completed' &&
        (event.data as { name: string }).name === 'propose_object'
      )
        proposalCommitted = true;
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const mapPath = `${app.origin}/api/households/${household.id}/map`;
  const map = await (await browser.get(mapPath)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  await advanceActiveLogin(browser, app.origin, 8 * 60 * 60_000 - 1_000, (elapsed) => {
    clock += elapsed;
  });
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const post = (requestId: string, voice: boolean) =>
    browser.post(`${path}/${session.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId,
        revision: 0,
        draftVersion: 0,
        contentVersion: 1,
        text: voice ? 'Förklara i röst.' : 'Lägg till Mitt textförslag.',
        ...(voice ? { voiceContext: 'Förklara i röst.' } : {}),
      },
    });
  expect((await post('voice', true)).status()).toBe(202);
  await expect.poll(() => held.length).toBe(1);
  expect((await post('text', false)).status()).toBe(202);
  clock += 2_000;
  held[0]([modelMessage('För sent röstsvar.')]);
  await expect.poll(() => held.length).toBe(2);
  held[1]([
    modelTool('submit_changes', {
      version: 0,
      contentVersion: 1,
      completion: 'draft',
      operations: [
        {
          name: 'propose_object',
          arguments: {
            id: 'queued-text',
            baseRevision: null,
            value: { typeId: map.types[0].id, name: 'Mitt textförslag' },
          },
        },
      ],
    }),
  ]);
  await expect.poll(() => proposalCommitted).toBe(true);
  await signIn(browser, app.origin);
  expect((await (await browser.get(mapPath)).json()).draft.changes).toMatchObject([
    { id: 'queued-text', after: { name: 'Mitt textförslag' } },
  ]);
});
