import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';

test('manual text controls hold actual provider work, reject a stale release and remove their disposable installation', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-text-assistant.ts']);
  const events: ReturnType<typeof JSON.parse>[] = [];
  let exited = false;
  let diagnostics = '';
  child.stderr.on('data', (data) => {
    diagnostics += data;
  });
  child.once('exit', () => {
    exited = true;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      events.push(JSON.parse(line));
    } catch {
      diagnostics += line;
    }
  });
  async function next(event: string) {
    await expect
      .poll(() => events.some((item) => item.event === event || item.event === 'error') || exited, {
        timeout: 10_000,
      })
      .toBe(true);
    const index = events.findIndex((item) => item.event === event);
    expect(index, diagnostics + JSON.stringify(events)).toBeGreaterThanOrEqual(0);
    return events.splice(index, 1)[0];
  }
  async function command(text: string, event = 'released') {
    child.stdin.write(`${text}\n`);
    return next(event);
  }
  const browser = await request.newContext();
  try {
    const ready = await next('ready');
    const origin: string = ready.origin;
    await signIn(browser, origin);
    const { household } = await (await createHousehold(browser, origin)).json();
    const base = `${origin}/api/households/${household.id}`;
    const created = await browser.post(`${base}/text-assistant`, {
      headers: { origin },
      data: { externalAi: true, mapWork: true },
    });
    expect(created.status()).toBe(201);
    const session = await created.json();
    const assistant = `${base}/text-assistant/${session.id}`;
    async function send(revision: number, text: string) {
      const current = await (await browser.get(assistant)).json();
      const response = await browser.post(`${assistant}/messages`, {
        headers: { origin },
        data: {
          revision,
          draftVersion: current.review.version,
          contentVersion: current.review.contentVersion,
          text,
          requestId: crypto.randomUUID(),
        },
      });
      expect(response.status()).toBe(202);
      return next('held');
    }
    async function completed() {
      let view: ReturnType<typeof JSON.parse> = {};
      await expect
        .poll(async () => {
          const response = await browser.get(assistant);
          expect(response.status()).toBe(200);
          view = await response.json();
          return view.phase;
        })
        .not.toBe('working');
      return view;
    }
    const held = await send(0, 'Lägg till ett påhittat abonnemang.');
    expect(held.draft.changes).toEqual([]);
    expect((await (await browser.get(assistant)).json()).phase).toBe('working');
    await command(`tool ${held.id} read_type_catalog {}`);
    const catalog = await next('held');
    const type = catalog.lastToolResult.types.find(
      (item: { name: string }) => item.name === 'Abonnemang',
    );
    const args = {
      version: held.draft.version,
      contentVersion: held.draft.contentVersion,
      id: 'manual-subscription',
      baseRevision: null,
      value: { typeId: type.id, name: 'Provabonnemang', description: '' },
    };
    await command(`tool ${catalog.id} propose_object ${JSON.stringify(args)}`);
    const proposed = await next('held');
    await command(`reply ${proposed.id} Förslaget är klart.`);
    const first = await completed();
    expect(first.review.changes).toMatchObject([{ id: 'manual-subscription' }]);
    const delayed = await send(first.revision, 'Rätta namnet.');
    const staleArgs = {
      ...args,
      version: delayed.draft.version,
      value: { ...args.value, name: 'Sent svar' },
    };
    const discarded = await browser.post(`${base}/map/discard`, {
      headers: { origin },
      data: { version: delayed.draft.version, contentVersion: delayed.draft.contentVersion },
    });
    expect(discarded.status()).toBe(200);
    await command(`tool ${delayed.id} propose_object ${JSON.stringify(staleArgs)}`);
    const stale = await completed();
    expect(stale.phase).toBe('error');
    expect((await (await browser.get(`${base}/map`)).json()).draft.changes).toEqual([]);
    const failing = await send(stale.revision, 'Läs mitt utkast.');
    await command(`fail ${failing.id}`);
    expect((await completed()).phase).toBe('error');
    await command('restart', 'restarted');
    expect((await browser.get(assistant)).status()).toBe(404);
    expect((await browser.get(`${base}/map`)).status()).toBe(200);
    await command('quit', 'closed');
    await expect(access(ready.directory)).rejects.toThrow();
  } finally {
    child.kill('SIGTERM');
    lines.close();
    await browser.dispose();
  }
}, 20_000);
