import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { request } from '@playwright/test';
import { expect, test, vi } from 'vitest';

vi.setConfig({ expect: { poll: { timeout: 5000 } } });

import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';

function launch() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts']);
  const events: ReturnType<typeof JSON.parse>[] = [];
  let output = '';
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.once('exit', () => {
      exited = true;
      resolve();
    }),
  );
  child.stderr.on('data', (data) => {
    output += data;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    output += `${line}\n`;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* Non-JSON diagnostic is retained above. */
    }
  });
  async function next(event: string) {
    await expect
      .poll(() => events.some((item) => item.event === event || item.event === 'error') || exited, {
        timeout: 10_000,
      })
      .toBe(true);
    const index = events.findIndex((item) => item.event === event);
    expect(index, output).toBeGreaterThanOrEqual(0);
    return events.splice(index, 1)[0];
  }
  async function command(value: string, event = 'released') {
    child.stdin.write(`${value}\n`);
    return next(event);
  }
  return { child, lines, exit, next, command, output: () => output };
}

test('manual voice controls drive real delegation and MCP, preserve provisional usage and remove their disposable app', async () => {
  const { child, lines, exit, next, command, output } = launch();
  let browser = await request.newContext();
  try {
    const ready = await next('ready');
    const origin = ready.origin as string;
    const html = await (await browser.get(origin)).text();
    expect(html).toContain('/assets/manual-voice-provider.js');
    const script = await browser.get(`${origin}/assets/manual-voice-provider.js`);
    expect(script.status()).toBe(200);
    expect(await script.text()).toContain('skyttelVoiceFixture');
    await signIn(browser, origin);
    const { household } = await (await createHousehold(browser, origin)).json();
    const base = `${origin}/api/households/${household.id}`;
    const created = await browser.post(`${base}/text-assistant`, {
      headers: { origin },
      data: approvedForVisit,
    });
    expect(created.status()).toBe(201);
    const assistant = await created.json();
    const assistantPath = `${base}/text-assistant/${assistant.id}`;
    const started = await browser.post(`${assistantPath}/voice`, {
      headers: { origin },
      data: { sdp: 'synthetic-manual-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
    });
    expect(started.status(), await started.text()).toBe(201);
    const initial = await started.json();
    const voicePath = `${assistantPath}/voice/${initial.voice.id}`;
    async function poll() {
      const current = await (await browser.get(assistantPath)).json();
      return browser.post(`${voicePath}/poll`, {
        headers: { origin },
        data: {
          revision: current.revision,
          draftVersion: current.review.version,
          contentVersion: current.review.contentVersion,
        },
      });
    }
    await command('text-context 84');
    await command('user Lägg till ett påhittat abonnemang.');
    await command('delegate');
    const held = await next('held');
    expect(held.draft.changes).toEqual([]);
    await command(`tool ${held.id} read_type_catalog {}`);
    const catalog = await next('held');
    const type = catalog.lastToolResult.types.find(
      (value: { name: string }) => value.name === 'Abonnemang',
    );
    await command(
      `tool ${catalog.id} propose_object ${JSON.stringify({
        version: held.draft.version,
        contentVersion: held.draft.contentVersion,
        id: 'spoken-subscription',
        baseRevision: null,
        value: { typeId: type.id, name: 'Talets provabonnemang' },
      })}`,
    );
    const proposed = await next('held');
    await command(`reply ${proposed.id} Förslaget är klart.`);
    await expect
      .poll(async () => (await (await browser.get(assistantPath)).json()).phase)
      .not.toBe('working');
    expect((await (await browser.get(`${base}/map`)).json()).draft.changes).toMatchObject([
      { id: 'spoken-subscription' },
    ]);
    const beforeContext = await (await browser.get(assistantPath)).json();
    expect(beforeContext.contextPercentage).toBe(84);
    await command('context 85');
    await command('context-invalid');
    expect(await (await browser.get(assistantPath)).json()).toMatchObject({
      contextPercentage: 85,
      revision: beforeContext.revision,
    });
    await command('capture-context-source');
    await command('usage 12');
    await command('usage 15');
    await command('finalize off');
    await expect.poll(async () => (await (await poll()).json()).voice.seconds).toBe(15);
    const stopped = await browser.post(`${voicePath}/stop`, { headers: { origin }, data: {} });
    expect(await stopped.json()).toMatchObject({ voice: { seconds: 15, usageFinal: false } });
    const renewed = await browser.post(`${assistantPath}/new`, {
      headers: { origin },
      data: {},
    });
    expect((await renewed.json()).contextPercentage).toBe(0);
    await command('context-old 99');
    expect((await (await browser.get(assistantPath)).json()).contextPercentage).toBe(0);
    browser = await restartWithSession(browser, () => command('restart', 'restarted'));
    expect(
      (await browser.post(`${voicePath}/poll`, { headers: { origin }, data: {} })).status(),
    ).toBe(404);
    expect((await (await browser.get(`${base}/map`)).json()).draft.changes).toHaveLength(1);
    await command('quit', 'closed');
    await exit;
    expect(child.exitCode).toBe(0);
    await expect(access(ready.directory)).rejects.toThrow();
    expect(output()).not.toMatch(
      /synthetic-model-key|synthetic-provider-token|session_token|Bearer /,
    );
  } finally {
    child.kill('SIGTERM');
    await exit;
    lines.close();
    await browser.dispose();
  }
}, 30_000);

test('manual voice family setup refuses reuse and resolves the seeded conflict and price through actual voice delegation and MCP', async () => {
  const document = await readFile('docs/manual-tests/voice-controls-preparation.md', 'utf8');
  const readDraft = document.match(/^\s*tool REQUEST read_my_draft \{\}$/mu)?.[0].trim();
  if (!readDraft) throw new Error('Missing public family draft-read recipe');
  const { child, lines, exit, next, command } = launch();
  const browser = await request.newContext();
  try {
    const { origin } = await next('ready');
    const seeded = await command('seed-family', 'seeded');
    await signIn(browser, origin);
    const base = `${origin}/api/households/${seeded.householdId}`;
    const before = await (await browser.get(`${base}/map`)).json();
    await command('seed-family', 'error');
    expect(await (await browser.get(`${base}/map`)).json()).toEqual(before);
    const assistant = await (
      await browser.post(`${base}/text-assistant`, {
        headers: { origin },
        data: approvedForVisit,
      })
    ).json();
    const path = `${base}/text-assistant/${assistant.id}`;
    const response = await browser.post(`${path}/voice`, {
      headers: { origin },
      data: {
        sdp: 'synthetic-offer',
        revision: assistant.revision,
        draftVersion: assistant.review.version,
        contentVersion: assistant.review.contentVersion,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    await command('user Behåll Lo-förslaget, rätta priset till 189 kr och spara.');
    await command('delegate');
    let held = await next('held');
    await command(readDraft.replace('REQUEST', held.id));
    held = await next('held');
    const review = held.lastToolResult;
    const contentVersion = review.contentVersion;
    expect(review.conflicts).toHaveLength(1);
    expect(review.changes).toEqual(before.draft.changes);
    expect(review.relationships).toEqual(before.draft.relationships);
    await command(
      `tool ${held.id} resolve_conflict ${JSON.stringify({
        version: review.version,
        contentVersion,
        conflict: review.conflicts[0],
        choice: 'proposed',
      })}`,
    );
    held = await next('held');
    const version = held.lastToolResult.version;
    await command(`tool ${held.id} read_map {"query":"Familjens Molnmusik"}`);
    held = await next('held');
    const { id, householdId: _household, revision, ...value } = held.lastToolResult.objects[0];
    await command(
      `tool ${held.id} propose_object ${JSON.stringify({
        version,
        contentVersion,
        id,
        baseRevision: revision,
        value: {
          ...value,

          properties: value.properties.map((property: { label: string }) => {
            if (property.label === 'Beskrivning')
              return { ...property, kind: 'text', value: 'Familjeabonnemang 189 kr per månad.' };
            if (property.label === 'Pris') return { ...property, kind: 'number', value: 189 };
            return property;
          }),
        },
      })}`,
    );
    held = await next('held');
    await command(
      `tool ${held.id} save_draft ${JSON.stringify({
        version: held.lastToolResult.version,
        contentVersion,
        operationId: 'family-manual-save',
      })}`,
    );
    await expect.poll(async () => (await (await browser.get(path)).json()).receipt).toBeTruthy();
    const saved = await (await browser.get(`${base}/map`)).json();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    expect(saved.relationships).toContainEqual(
      expect.objectContaining({
        id: review.relationships[0].id,
        targetId: saved.objects.find((item: { name: string }) => item.name === 'musik@example.test')
          .id,
      }),
    );
    expect(saved.objects.find((item: { id: string }) => item.id === id).properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Valuta', kind: 'text', value: 'SEK' }),
        expect.objectContaining({ label: 'Betalningsintervall', kind: 'text', value: 'månad' }),
      ]),
    );
    expect(
      saved.objects
        .find((item: { id: string }) => item.id === id)
        .properties.find((property: { label: string }) => property.label === 'Pris'),
    ).toMatchObject({ kind: 'number', value: 189 });
    expect(
      saved.objects.find((item: { name: string }) => item.name === 'Lo Lind').properties,
    ).toContainEqual(expect.objectContaining({ value: 'Spelar piano i musikföreningen.' }));
    await command('quit', 'closed');
    await exit;
    expect(child.exitCode).toBe(0);
  } finally {
    child.kill('SIGTERM');
    await exit;
    lines.close();
    await browser.dispose();
  }
}, 30_000);

test.each([false, true])(
  'published queued correction preparation compares admitted and current targets with manual rename %s',
  async (renamed) => {
    const document = await readFile('docs/manual-tests/conversation-preparation.md', 'utf8');
    const holdCheck = document.match(/^hold-check on$/mu)?.[0];
    const allow = document.match(/^reply CHECK \{"decision":"allow","complete":true\}$/mu)?.[0];
    const clarify = document.match(/^reply CHECK \{"decision":"clarify"\}$/mu)?.[0];
    if (!holdCheck || !allow || !clarify) throw new Error('Missing public queued-check recipe');
    const { child, lines, exit, next, command } = launch();
    const browser = await request.newContext();
    try {
      const { origin } = await next('ready');
      await command(holdCheck, 'check-hold');
      await signIn(browser, origin);
      const { household } = await (await createHousehold(browser, origin)).json();
      const base = `${origin}/api/households/${household.id}`;
      const post = (path: string, data: object) =>
        browser.post(`${base}${path}`, { headers: { origin }, data });
      const readMap = async () => (await browser.get(`${base}/map`)).json();
      let map = await readMap();
      const value = {
        typeId: map.types.find((type: { name: string }) => type.name === 'Person').id,
        name: 'Lo Exempel',
        properties: [
          { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Påhittad uppgift' },
        ],
      };
      expect(
        (
          await post('/map/draft', {
            version: map.draft.version,
            contentVersion: map.contentVersion,
            id: 'lo',
            baseRevision: null,
            value,
          })
        ).status(),
      ).toBe(200);
      const session = await (await post('/text-assistant', approvedForVisit)).json();
      const path = `/text-assistant/${session.id}`;
      const read = async () => (await browser.get(`${base}${path}`)).json();
      async function send(text: string) {
        const current = await read();
        expect(
          (
            await post(`${path}/messages`, {
              revision: current.revision,
              draftVersion: current.review.version,
              contentVersion: current.review.contentVersion,
              requestId: crypto.randomUUID(),
              text,
            })
          ).status(),
        ).toBe(202);
      }
      await command('scope-read', 'scope');
      await command('text-context 99');
      await send('Fyll kontexten.');
      const first = await next('held');
      const exact = 'Rätta Lo Exempel till Lo Klar. Spara inte.';
      await send(exact);
      await command(`reply ${first.id} Den första läsningen är klar.`);
      const summary = await next('held');
      expect(summary.kind).toBe('context-summary');
      map = await readMap();
      const manual = {
        ...value,
        name: renamed ? 'Lo Manuell' : value.name,
        properties: [
          {
            ...value.properties[0],
            value: renamed ? 'Påhittad uppgift' : 'Manuell aktuell uppgift',
          },
        ],
      };
      expect(
        (
          await post('/map/draft', {
            version: map.draft.version,
            contentVersion: map.contentVersion,
            id: 'lo',
            baseRevision: null,
            value: manual,
          })
        ).status(),
      ).toBe(200);
      await command('scope-work', 'scope');
      await command('text-context 0');
      await command(`reply ${summary.id} Avslutad historisk läsning.`);
      const queued = await next('held');
      expect(queued.message).toBe(exact);
      expect(queued.draft.changes[0].after.name).toBe(manual.name);
      await command(
        `tool ${queued.id} submit_changes ${JSON.stringify({
          version: queued.draft.version,
          contentVersion: queued.draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: { ...manual, name: 'Lo Klar' },
              },
            },
          ],
        })}`,
      );
      const check = await next('held');
      expect(check.kind).toBe('action-check');
      expect(check.comparison.authority).toMatchObject({
        current: exact,
        scope: { mode: 'work', request: exact },
      });
      expect(check.comparison.untrusted.data.queuedReference.draft.changes[0].after.name).toBe(
        'Lo Exempel',
      );
      expect(check.comparison.untrusted.data.draft.changes[0].after.name).toBe(manual.name);
      // The terminal controls the independent provider response. The app must
      // preserve the real admitted authority and enforce the returned decision.
      await command((renamed ? clarify : allow).replace('CHECK', check.id));
      await expect.poll(async () => (await read()).phase).not.toBe('working');
      const final = await read();
      const result = await readMap();
      if (renamed)
        expect(final).toMatchObject({ phase: 'error', error: 'assistant_scope_unclear' });
      else expect(final.phase).toBe('ready');
      expect(result.draft.changes[0].after).toMatchObject({
        name: renamed ? 'Lo Manuell' : 'Lo Klar',
        properties: manual.properties,
      });
      expect(result.objects).toEqual([]);
      expect((await (await browser.get(`${base}/map/history`)).json()).history).toEqual([]);
      await command('hold-check off', 'check-hold');
      await command('quit', 'closed');
      await exit;
      expect(child.exitCode).toBe(0);
    } finally {
      child.kill('SIGTERM');
      await exit;
      lines.close();
      await browser.dispose();
    }
  },
  30_000,
);
