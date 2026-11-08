import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import {
  openConversationDraft,
  startConversationWithText,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { voiceAnswerParts } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';

const assistant = (page: Page) => page.getByRole('region', { name: 'Arbetsyta', exact: true });

for (const mode of ['text', 'voice'] as const) {
  test(`literal ${mode} preparation drops a committed batch reply and preserves its proposals across restart`, {
    tag: '@technical',
  }, async ({ page }) => {
    const preparation = await readFile(
      new URL('../../docs/manual-tests/text-conversation-preparation.md', import.meta.url),
      'utf8',
    );
    const section = preparation.split('## Tappat ändringsbesked\n')[1]?.split('\n## ')[0];
    const arm = section?.match(/```text\n(drop-batch)\n```/)?.[1];
    const blockStatus = section?.match(/^block-batch-status on$/m)?.[0];
    const restoreStatus = section?.match(/^block-batch-status off$/m)?.[0];
    const readTypes = section?.match(/^tool REQUEST read_type_catalog \{\}$/m)?.[0];
    const command = [...(section?.matchAll(/^tool REQUEST submit_changes .*$/gm) ?? [])][
      mode === 'voice' ? 1 : 0
    ]?.[0];
    expect(arm).toBeDefined();
    expect(blockStatus).toBeDefined();
    expect(restoreStatus).toBeDefined();
    expect(readTypes).toBeDefined();
    expect(command).toBeDefined();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', `scripts/manual-${mode === 'voice' ? 'voice' : 'text-assistant'}.ts`],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const events: {
      event: string;
      origin?: string;
      directory?: string;
      id?: string;
      draft?: TextAssistantReview;
      phase?: string;
      operationId?: string;
      sent?: Parameters<typeof voiceAnswerParts>[0];
      lastToolResult?: { contentVersion: number; types: { id: string; name: string }[] };
    }[] = [];
    let output = '';
    let pending = '';
    let errors = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      pending += String(chunk);
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });
    child.stderr.on('data', (chunk) => {
      errors += String(chunk);
    });
    async function deliveredVoiceParts() {
      const count = events.filter((event) => event.event === 'sessions').length;
      child.stdin.write('sessions\n');
      await expect
        .poll(() => events.filter((event) => event.event === 'sessions').length)
        .toBe(count + 1);
      return voiceAnswerParts(
        events.filter((event) => event.event === 'sessions').at(-1)?.sent ?? [],
      );
    }
    let directory: string | undefined;
    try {
      await expect.poll(() => events.find((event) => event.event === 'ready')).toBeTruthy();
      const ready = events.find((event) => event.event === 'ready');
      const origin = ready?.origin as string;
      directory = ready?.directory;
      await signIn(page.request, origin);
      const { household } = await (await createHousehold(page.request, origin)).json();
      const path = `${origin}/api/households/${household.id}/map`;
      const initial = await (await page.request.get(path)).json();
      expect(
        (
          await page.request.post(`${path}/draft`, {
            headers: { origin },
            data: {
              version: 0,
              contentVersion: initial.contentVersion,
              id: 'lo',
              baseRevision: null,
              value: {
                typeId: initial.types[0].id,
                name: 'Lo Exempel',
                properties: [
                  {
                    id: 'description',
                    label: 'Beskrivning',
                    kind: 'text',
                    value: 'Påhittad uppgift',
                  },
                ],
              },
            },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`${origin}/households/${household.id}`);
      await startConversationWithText(page);
      if (mode === 'voice') await turnMicrophoneOn(page);
      const instruction =
        mode === 'voice'
          ? 'Lägg till Kim utan att spara, förklara vad ett utkast betyder och beskriv vilket år uppgifterna gäller.'
          : 'Lägg till Kim utan att spara.';
      await assistant(page).getByLabel('Meddelande till Skyttel').fill(instruction);
      await assistant(page).getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect.poll(() => events.find((event) => event.event === 'held')).toBeTruthy();
      const first = events.find((event) => event.event === 'held');
      child.stdin.write(`${readTypes?.replace('REQUEST', first?.id ?? '')}\n`);
      await expect.poll(() => events.filter((event) => event.event === 'held').length).toBe(2);
      const held = events.filter((event) => event.event === 'held')[1];
      const draft = held?.draft as TextAssistantReview;
      const typeId = held.lastToolResult?.types.find((type) => type.name === 'Person')?.id;
      expect(typeId).toBeTruthy();
      child.stdin.write(`${blockStatus}\n${arm}\n`);
      await expect
        .poll(() =>
          events.some((event) => event.event === 'batch-delivery' && event.phase === 'armed'),
        )
        .toBe(true);
      child.stdin.write(
        `${command
          ?.replace('REQUEST', held?.id ?? '')
          .replaceAll('VERSION', String(draft.version))
          .replaceAll('CONTENT', String(held.lastToolResult?.contentVersion))
          .replaceAll('TYPE', String(typeId))}\n`,
      );
      await expect
        .poll(() =>
          events.find(
            (event) => event.event === 'batch-delivery' && event.phase === 'dropped-after-commit',
          ),
        )
        .toBeTruthy();
      const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
      await expect(notice).toContainText('Det är oklart om ändringarna genomfördes.');
      await expect(notice).not.toContainText('sparades');
      await assistant(page).getByLabel('Meddelande till Skyttel').fill('Vänta med nästa uppdrag.');
      await expect(
        assistant(page).getByRole('button', { name: 'Skicka', exact: true }),
      ).toBeDisabled();
      if (mode === 'voice')
        await expect
          .poll(async () => (await deliveredVoiceParts()).join('\n'))
          .toContain('Vilket år gäller beskrivningen?');
      const partsBeforeRecovery = mode === 'voice' ? await deliveredVoiceParts() : [];
      child.stdin.write(`${restoreStatus}\n`);
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        'Kim',
      );
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        'lades till',
      );
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        'Uppdraget är inte slutfört. Återstående arbete är pausat',
      );
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        instruction,
      );
      if (mode === 'voice') {
        await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
          'Vilket år gäller beskrivningen?',
        );
        await expect
          .poll(async () =>
            (await deliveredVoiceParts()).slice(partsBeforeRecovery.length).join('\n'),
          )
          .toContain('Uppdraget är inte slutfört. Återstående arbete är pausat');
        const spoken = (await deliveredVoiceParts()).slice(partsBeforeRecovery.length).join('\n');
        expect(spoken).toContain('Kim');
        expect(spoken).toContain('Uppdraget är inte slutfört. Återstående arbete är pausat');
        expect(spoken).toContain('Vilket år gäller beskrivningen?');
      }
      await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toHaveValue(
        'Vänta med nästa uppdrag.',
      );
      await assistant(page).getByLabel('Meddelande till Skyttel').fill('');
      const before = await (await page.request.get(path)).json();
      expect(before.draft).toMatchObject({ version: 2, changes: [{ id: 'lo' }, { id: 'kim' }] });
      expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
      expect(events.filter((event) => event.event === 'held')).toHaveLength(2);
      expect(events.filter((event) => event.event === 'error')).toEqual([]);
      child.stdin.write('restart\n');
      await expect.poll(() => events.find((event) => event.event === 'restarted')).toBeTruthy();
      await page.reload();
      await startConversationWithText(page);
      const retained = await openConversationDraft(page);
      await expect(retained).toContainText('Lo Exempel');
      await expect(retained).toContainText('Kim');
      expect((await (await page.request.get(path)).json()).draft).toEqual(before.draft);
      expect(events.filter((event) => event.event === 'held')).toHaveLength(2);
    } finally {
      child.stdin.end('quit\n');
      if (child.exitCode === null) await once(child, 'exit');
      expect(child.exitCode, errors).toBe(0);
      expect(output).toContain('"event":"closed"');
      if (directory) await expect(access(directory)).rejects.toThrow();
    }
  });
}

test('manual text launcher public preparation seeded rejects an unaccepted delivery', {
  tag: '@technical',
}, async ({ page }) => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-text-assistant.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let resolveReady!: (value: { origin: string; directory: string }) => void;
  const ready = new Promise<{ origin: string; directory: string }>((resolve) => {
    resolveReady = resolve;
  });
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    const line = output.split('\n').find((value) => value.includes('"event":"ready"'));
    if (line) resolveReady(JSON.parse(line));
  });
  child.stderr.on('data', () => {});
  const app = await ready;
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    const response = await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: {
          typeId: state.types[0].id,
          name: 'Lo Exempel',
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Påhittad uppgift',
            },
          ],
        },
      },
    });
    expect(response.status()).toBe(200);
    const before = await (await page.request.get(path)).json();
    expect(before.draft.changes).toHaveLength(1);
    expect(before.draft.changes[0]).toMatchObject({
      id: 'lo',
      before: null,
      after: {
        name: 'Lo Exempel',
        properties: expect.arrayContaining([
          expect.objectContaining({
            label: 'Beskrivning',
            kind: 'text',
            value: 'Påhittad uppgift',
          }),
        ]),
      },
    });
    await page.goto(`${app.origin}/households/${household.id}`);
    const result = await page.evaluate(async (url) => {
      const control = (
        window as unknown as {
          skyttelTextDelivery: { arm(): void; status(): { phase: string }; clear(): void };
        }
      ).skyttelTextDelivery;
      control.arm();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const result = { status: response.status, phase: control.status().phase };
      control.clear();
      return result;
    }, `${app.origin}/api/households/${household.id}/text-assistant/missing-session/messages`);
    expect(result).toEqual({ status: 404, phase: 'not-accepted' });
    expect(await (await page.request.get(path)).json()).toEqual(before);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    await page.reload();
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { skyttelTextDelivery: { status(): { phase: string } } }
          ).skyttelTextDelivery.status().phase,
      ),
    ).toBe('idle');
  } finally {
    child.stdin.end('quit\n');
    if (child.exitCode === null) await once(child, 'exit');
    expect(child.exitCode).toBe(0);
    expect(output).toContain('"event":"closed"');
    await expect(access(app.directory)).rejects.toThrow();
  }
});
