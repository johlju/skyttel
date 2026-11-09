import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import {
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { unexpectedPreparationDiagnostics } from '../support/preparation-diagnostics.js';
import { expect, test } from '../support/test.js';

test('literal whole-draft preparation reads omitted proposals before a rejected combined save', {
  tag: '@technical',
}, async ({ page }) => {
  const document = await readFile('docs/manual-tests/text-conversation-preparation.md', 'utf8');
  const recipe = document.split('## Avvisad kontroll av hela utkastet')[1]?.split('\n## ')[0];
  const read = recipe?.match(/^tool REQUEST read_my_draft \{\}$/mu)?.[0];
  const batch = recipe?.match(/^tool REQUEST submit_changes .*"name":"Kim".*$/mu)?.[0];
  const allow = recipe?.match(/^reply CHECK .*"decision":"allow".*$/mu)?.[0];
  const reject = recipe?.match(/^reply CHECK .*"decision":"clarify".*$/mu)?.[0];
  const reading = recipe?.match(/^scope-read\nresponse-required off$/mu)?.[0];
  const report = recipe?.match(/^tool REQUEST report_result .*$/mu)?.[0];
  const speaking = recipe?.match(/^scope-work\nhold-check on\nuser .*\ndelegate$/mu)?.[0];
  const correction = recipe?.match(/^tool REQUEST submit_changes .*VALUE.*$/mu)?.[0];
  const complete = recipe?.match(/^reply CHECK .*"fulfillsRequest":true.*$/mu)?.[0];
  if (
    !read ||
    !batch ||
    !allow ||
    !reject ||
    !reading ||
    !report ||
    !speaking ||
    !correction ||
    !complete
  )
    throw new Error('Missing published save preparation');
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: undefined },
  });
  type Event = {
    event: string;
    id?: string;
    kind?: string;
    origin?: string;
    draft?: TextAssistantReview;
    lastToolResult?: TextAssistantReview;
    comparison?: { untrusted: { data: { wholeDraft?: boolean; draft: TextAssistantReview } } };
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
  function releaseTool(
    line: string,
    id: string,
    draft: TextAssistantReview,
    replacements: Record<string, string>,
  ) {
    const values: Record<string, string> = {
      REQUEST: id,
      V: String(draft.version),
      C: String(draft.contentVersion),
      ...replacements,
    };
    command(line.replace(/\b(?:REQUEST|V|C|TYPE|VALUE)\b/gu, (key) => values[key] ?? key));
  }
  async function held(after: number, kind: string) {
    await expect
      .poll(() => events.slice(after).some((item) => item.event === 'held' && item.kind === kind))
      .toBe(true);
    const item = events.slice(after).find((item) => item.event === 'held' && item.kind === kind);
    if (!item?.id) throw new Error('Missing held preparation request');
    return { ...item, id: item.id };
  }
  try {
    await expect.poll(() => events.some((item) => item.event === 'ready')).toBe(true);
    const origin = events.find((item) => item.event === 'ready')?.origin;
    if (!origin) throw new Error('Missing disposable installation');
    await signIn(page.request, origin);
    const { household } = await (await createHousehold(page.request, origin, 'Textprov')).json();
    const path = `${origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    const person = state.types.find((item: { name: string }) => item.name === 'Person');
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id: 'lo',
            baseRevision: null,
            value: {
              typeId: person.id,
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
    const before = await (await page.request.get(path)).json();
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(`${origin}/households/${household.id}`);
    await startConversationWithText(page);
    command('hold-check on');
    await page
      .getByRole('textbox', { name: 'Meddelande till Skyttel' })
      .fill('Lägg till Kim som person och spara.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    let item = await held(0, 'work');
    expect(item.draft?.changes).toEqual([]);
    let at = events.length;
    command(read.replace('REQUEST', item.id));
    item = await held(at, 'work');
    const current = item.lastToolResult;
    expect(current?.changes).toEqual(before.draft.changes);
    if (!current) throw new Error('Missing complete draft read');
    const lo = current.changes.find((change) => change.id === 'lo');
    if (!lo?.after) throw new Error('Missing current Lo proposal');
    at = events.length;
    releaseTool(batch, item.id, current, { TYPE: lo.after.typeId });
    item = await held(at, 'action-check');
    at = events.length;
    command(allow.replace('CHECK', item.id));
    item = await held(at, 'action-check');
    expect(item.comparison?.untrusted.data.wholeDraft).toBe(true);
    expect(item.comparison?.untrusted.data.draft.changes).toEqual([
      ...before.draft.changes,
      expect.objectContaining({
        id: 'kim',
        after: expect.objectContaining({ name: 'Kim', typeId: person.id }),
      }),
    ]);
    command(reject.replace('CHECK', item.id));
    const log = page.getByRole('log', { name: 'Samtalstext' });
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await notice.getByRole('button', { name: 'Läs mer', exact: true }).click();
    await expect(notice).toContainText('Ändringarna ligger kvar osparade i ditt utkast.');
    await expect(notice).toContainText('Be om sparande igen');
    const after = await (await page.request.get(path)).json();
    expect(after.objects).toEqual(before.objects);
    expect(after.draft.changes).toEqual(item.comparison?.untrusted.data.draft.changes);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
    command('hold-check off');
    command(reading);
    at = events.length;
    await page
      .getByRole('textbox', { name: 'Meddelande till Skyttel' })
      .fill('Vad finns i utkastet?');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    item = await held(at, 'work');
    command(report.replace('REQUEST', item.id));
    await expect(log).toContainText('Utkast:');
    await expect(log).not.toContainText('Skyttel arbetar…');
    expect(
      events.slice(at).filter((event) => event.event === 'held' && event.kind === 'work'),
    ).toHaveLength(1);
    expect(await (await page.request.get(path)).json()).toEqual(after);
    await turnMicrophoneOn(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    at = events.length;
    command(speaking);
    item = await held(at, 'work');
    const fresh = item.draft;
    const kim = fresh?.changes.find((change) => change.id === 'kim');
    if (!fresh || !kim?.after) throw new Error('Missing current Kim proposal');
    at = events.length;
    releaseTool(correction, item.id, fresh, {
      VALUE: JSON.stringify({ ...kim.after, name: 'Kim Lind' }),
    });
    item = await held(at, 'action-check');
    at = events.length;
    command(allow.replace('CHECK', item.id));
    item = await held(at, 'action-check');
    expect(item.comparison?.untrusted.data.wholeDraft).toBe(true);
    expect(item.comparison?.untrusted.data.draft.changes).toEqual([
      ...before.draft.changes,
      expect.objectContaining({
        id: 'kim',
        after: expect.objectContaining({ name: 'Kim Lind', typeId: person.id }),
      }),
    ]);
    command(complete.replace('CHECK', item.id));
    await expect(log).toContainText('Sparat.');
    const saved = await (await page.request.get(path)).json();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Lo Exempel' }),
        expect.objectContaining({ name: 'Kim Lind' }),
      ]),
    );
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toHaveLength(
      1,
    );
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(1);
    expect(events.filter((event) => event.event === 'error')).toEqual([]);
    expect(unexpectedPreparationDiagnostics(diagnostics)).toBe('');
  } finally {
    command('quit');
    await expect.poll(() => child.exitCode).toBe(0);
    await test.info().attach('literal-whole-draft-events', {
      body: JSON.stringify(events, null, 2),
      contentType: 'application/json',
    });
  }
});
