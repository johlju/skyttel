import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

const guide = readFileSync('docs/manual-tests/household-erasure-preparation.md', 'utf8');
const snippets = [...guide.matchAll(/```javascript\n([\s\S]*?)\n```/g)].map((match) => match[1]);
const readerCommand = guide.match(/--input-type=module -e '\n([\s\S]*?)\n'/)?.[1];
if (snippets.length !== 3 || !readerCommand) throw new Error('Missing erasure preparation');

test('documented erasure preparation preserves actual boundaries with seeded content', {
  tag: '@technical',
}, async ({ page }) => {
  const installation = await createInstallation();
  let reader: ChildProcessWithoutNullStreams | undefined;
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const read = async () => (await page.request.get(`${path}/map`)).json();
    const post = (suffix: string, data: unknown) =>
      page.request.post(`${path}/${suffix}`, { headers, data });
    const state = await read();
    expect(
      (
        await post('map/draft', {
          id: 'private',
          version: state.draft.version,
          baseRevision: null,
          value: { typeId: state.types[0].id, name: 'Privat prov' },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${installation.origin}/households/${household.id}/settings/erasure`);
    const execute = async (operationId: string, lost: boolean) => {
      const state = await read();
      const type = state.types.find((item: { id: string }) => item.id !== state.types[0].id);
      expect(type).toBeDefined();
      const selection = [{ kind: 'objectType', id: type.id }];
      const review = await (await post('erasure/review', { selection })).json();
      return page.evaluate(
        async ({ url, data, lost }) => {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(data),
            });
            if (lost) return { delivered: true };
            return { status: response.status, body: await response.json() };
          } catch (failure) {
            return { lost: failure instanceof TypeError };
          }
        },
        {
          url: `${path}/erasure/execute`,
          lost,
          data: { selection, token: review.token, operationId, confirmation: 'RADERA PERMANENT' },
        },
      );
    };
    const before = await read();
    page.once('dialog', (dialog) => dialog.accept('execute'));
    await page.evaluate(snippets[0]);
    const dropped = page.waitForEvent('console', {
      predicate: (message) => message.text() === 'Slutfört svar tappat',
    });
    expect(await execute('lost-execute', true)).toEqual({ lost: true });
    await dropped;
    expect(
      (await (await page.request.get(`${path}/erasure/lost-execute`)).json()).status.phase,
    ).toBe('completed');
    expect((await read()).draft).toEqual(before.draft);

    reader = spawn(process.execPath, ['--input-type=module', '-e', readerCommand], {
      env: { ...process.env, SKYTTEL_DATABASE_PATH: join(installation.directory, 'skyttel.db') },
    });
    const child = reader;
    let output = '';
    let errors = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk.toString();
    });
    await expect.poll(() => `${output}${errors}`).toContain('Läsningen är öppen');
    const pending = await execute('reader-cleanup', false);
    expect(pending.status).toBe(202);
    expect(pending.body.status.phase).toBe('cleanup');
    const stopped = new Promise<number | null>((resolve) => child.once('exit', resolve));
    child.stdin.write('\n');
    expect(await stopped).toBe(0);
    expect(output).toContain('Läsningen är avslutad.');
    reader = undefined;
    page.once('dialog', (dialog) => dialog.accept('resume'));
    await page.evaluate(snippets[0]);
    const lostResume = await page.evaluate(async (url) => {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ operationId: 'reader-cleanup' }),
        });
        return false;
      } catch (failure) {
        return failure instanceof TypeError;
      }
    }, `${path}/erasure/resume`);
    expect(lostResume).toBe(true);
    expect(
      (await (await page.request.get(`${path}/erasure/reader-cleanup`)).json()).status.phase,
    ).toBe('completed');
    expect((await read()).draft).toEqual(before.draft);

    await page.evaluate(snippets[1]);
    const held = page.waitForEvent('console', {
      predicate: (message) => message.text() === 'RADERING-10: svaret väntar',
    });
    const reading = page.evaluate(async (url) => (await fetch(url)).status, `${path}/erasure`);
    await held;
    await page.keyboard.press('Alt+Shift+R');
    expect(await reading).toBe(200);

    await page.evaluate(snippets[2]);
    const storage = () =>
      page.evaluate(() => {
        const result: string[] = [];
        for (const method of ['removeItem', 'setItem'] as const) {
          try {
            if (method === 'setItem') sessionStorage.setItem('skyttel-erasure:smoke', 'value');
            else sessionStorage.removeItem('skyttel-erasure:smoke');
            result.push('allowed');
          } catch {
            result.push('blocked');
          }
        }
        return result;
      });
    expect(await storage()).toEqual(['blocked', 'allowed']);
    await page.keyboard.press('Alt+Shift+S');
    expect(await storage()).toEqual(['allowed', 'blocked']);
    await page.keyboard.press('Alt+Shift+A');
    expect(await storage()).toEqual(['allowed', 'allowed']);
    await page.evaluate(() => sessionStorage.removeItem('skyttel-erasure:smoke'));
    await page.reload();
    expect(await storage()).toEqual(['allowed', 'allowed']);
    expect((await read()).draft).toEqual(before.draft);
  } finally {
    if (reader) {
      const stopped = new Promise((resolve) => reader?.once('exit', resolve));
      reader.stdin.write('\n');
      await stopped;
    }
    await installation.close();
  }
});
