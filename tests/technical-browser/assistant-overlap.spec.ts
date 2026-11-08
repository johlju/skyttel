import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import { startConversationWithText } from '../support/conversation-page.js';
import { expect, test } from '../support/test.js';

for (const mode of ['sequential', 'overlap'] as const) {
  test(`${mode} public preparation gates edits, clarification and Escape in the real browser`, {
    tag: '@technical',
  }, async ({ page }) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: undefined, SKYTTEL_CONVERSATION_WORK_MODE: mode },
    });
    type Event = {
      event: string;
      id?: string;
      kind?: string;
      origin?: string;
      directory?: string;
      executionMode?: string;
      draft?: TextAssistantReview;
      requests?: Event[];
    };
    const events: Event[] = [];
    let buffer = '';
    let diagnostics = '';
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.startsWith('{')) events.push(JSON.parse(line));
    });
    child.stderr.on('data', (chunk) => {
      diagnostics += String(chunk);
    });
    const command = (line: string) => child.stdin.write(`${line}\n`);
    async function held(after: number, kind: string) {
      await expect
        .poll(() =>
          events.slice(after).some((event) => event.event === 'held' && event.kind === kind),
        )
        .toBe(true);
      const found = events
        .slice(after)
        .find((event) => event.event === 'held' && event.kind === kind);
      if (!found?.id) throw new Error('Missing held request.');
      return found;
    }
    const field = page.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    const log = page.getByRole('log', { name: 'Samtalstext' });
    async function send(text: string) {
      const at = events.length;
      await field.fill(text);
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      return at;
    }
    let directory: string | undefined;
    let failure: unknown;
    try {
      await expect.poll(() => events.some((event) => event.event === 'ready')).toBe(true);
      const ready = events.find((event) => event.event === 'ready');
      if (!ready?.origin || !ready.directory) throw new Error('Missing disposable installation.');
      directory = ready.directory;
      expect(ready.executionMode).toBe(mode);
      await signIn(page.request, ready.origin);
      const { household } = await (await createHousehold(page.request, ready.origin)).json();
      const path = `${ready.origin}/api/households/${household.id}/map`;
      const map = await (await page.request.get(path)).json();
      await page.goto(ready.origin);
      await startConversationWithText(page);
      command('hold-scope on');
      command('hold-check on');
      command('response-required off');
      const at = await send('Lägg till Kim Lind som person utan att spara.');
      const scope = await held(at, 'scope');
      let work: Event | undefined;
      if (mode === 'overlap') {
        work = await held(at, 'work');
        const afterRead = events.length;
        command(`tool ${work.id} read_map {"query":"Kim"}`);
        const next = await held(afterRead, 'work');
        work = next;
      } else {
        command('pending');
        await expect
          .poll(() => events.slice(at).some((event) => event.event === 'pending'))
          .toBe(true);
        expect(
          events
            .slice(at)
            .find((event) => event.event === 'pending')
            ?.requests?.map((event) => event.kind),
        ).toEqual(['scope']);
      }
      const mutation = (item: Event | undefined, id = 'kim', name = 'Kim Lind') => {
        if (!item?.draft || !item.id) throw new Error('Missing current work envelope.');
        return `tool ${item.id} submit_changes ${JSON.stringify({
          version: item.draft.version,
          contentVersion: item.draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id,
                baseRevision: null,
                value: { typeId: map.types[0].id, name, properties: [] },
              },
            },
          ],
        })}`;
      };
      if (mode === 'overlap') command(mutation(work));
      expect(await (await page.request.get(path)).json()).toEqual(map);
      command(
        `reply ${scope.id} {"mode":"work","request":"Lägg till Kim Lind utan att spara.","responseRequired":false}`,
      );
      if (mode === 'sequential') command(mutation(await held(at, 'work')));
      const check = await held(at, 'action-check');
      expect(await (await page.request.get(path)).json()).toEqual(map);
      command(`reply ${check.id} {"decision":"allow","complete":true,"fulfillsRequest":true}`);
      await expect(log).toContainText('Kim Lind lades till.');
      const changed = await (await page.request.get(path)).json();
      expect(changed.draft.changes).toMatchObject([{ id: 'kim', after: { name: 'Kim Lind' } }]);
      const unclear = await send('Lägg till personen.');
      const unclearScope = await held(unclear, 'scope');
      if (mode === 'overlap')
        command(mutation(await held(unclear, 'work'), 'discarded', 'Fel person'));
      command(`reply ${unclearScope.id} {"mode":"clarify","request":"Vem menar du?"}`);
      await expect(log).toContainText('Vem menar du?');
      expect(await (await page.request.get(path)).json()).toEqual(changed);
      const stopping = await send('Lägg till en annan person.');
      const stoppedScope = await held(stopping, 'scope');
      const stoppedWork = mode === 'overlap' ? await held(stopping, 'work') : undefined;
      await field.press('Escape');
      await expect(
        page.getByText('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.', { exact: true }),
      ).toBeVisible();
      command(
        `reply ${stoppedScope.id} {"mode":"work","request":"Lägg till en annan person.","responseRequired":false}`,
      );
      if (stoppedWork) command(mutation(stoppedWork, 'late', 'För sent'));
      command('pending');
      await expect
        .poll(() => events.slice(stopping).some((event) => event.event === 'pending'))
        .toBe(true);
      expect(await (await page.request.get(path)).json()).toEqual(changed);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual({ history: [] });
    } catch (error) {
      failure = error;
    } finally {
      try {
        command('quit');
        await expect.poll(() => child.exitCode).not.toBeNull();
        expect(child.exitCode, diagnostics).toBe(0);
        if (directory) {
          const removedDirectory = directory;
          await expect
            .poll(async () => {
              try {
                await stat(removedDirectory);
                return true;
              } catch {
                return false;
              }
            })
            .toBe(false);
        }
      } catch (error) {
        if (failure) console.error('Overlap fixture cleanup failed:', diagnostics, error);
        else failure = error;
      }
    }
    if (failure) throw failure;
  });
}
