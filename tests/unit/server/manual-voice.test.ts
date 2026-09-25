import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';

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
  const browser = await request.newContext();
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
      data: { externalAi: true, mapWork: true },
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
        value: { typeId: type.id, name: 'Talets provabonnemang', description: '' },
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
    await command('usage 12');
    await command('usage 15');
    await command('finalize off');
    await expect.poll(async () => (await (await poll()).json()).voice.seconds).toBe(15);
    const stopped = await browser.post(`${voicePath}/stop`, { headers: { origin }, data: {} });
    expect(await stopped.json()).toMatchObject({ voice: { seconds: 15, usageFinal: false } });
    await command('restart', 'restarted');
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
        data: { externalAi: true, mapWork: true },
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
    const contentVersion = held.draft.contentVersion;
    expect(held.draft.conflicts).toHaveLength(1);
    await command(
      `tool ${held.id} resolve_conflict ${JSON.stringify({
        version: held.draft.version,
        contentVersion,
        conflict: held.draft.conflicts[0],
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
          description: 'Familjeabonnemang 189 kr per månad.',
          financialFacts: {
            price: { knowledge: 'known', value: '189' },
            currency: { knowledge: 'known', value: 'SEK' },
            paymentInterval: { knowledge: 'known', value: 'månad' },
          },
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
    expect(
      saved.objects.find((item: { id: string }) => item.id === id).financialFacts.price,
    ).toEqual({ knowledge: 'known', value: '189' });
    expect(saved.objects.some((item: { name: string }) => item.name === 'Lo Lind')).toBe(true);
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
