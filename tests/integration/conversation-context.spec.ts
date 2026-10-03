import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';
import { expect, type Page, test } from '@playwright/test';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import { createHousehold, openProfile, signIn } from '../support/client.js';
import {
  microphoneButton,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { type ModelRequest, modelMessage, modelTool, textModel } from '../support/text-model.js';

const view = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const log = (page: Page) => view(page).getByRole('log', { name: 'Samtalstext' });
const field = (page: Page) => view(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
async function send(page: Page, text: string) {
  await openConversationText(page);
  await expect(log(page)).not.toContainText('Skyttel arbetar…');
  await field(page).fill(text);
  await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
}
function current(request: ModelRequest) {
  return JSON.parse(String(request.input.findLast((item) => item.role === 'user')?.content)) as {
    message: string;
    draft: TextAssistantReview;
  };
}
function propose(request: ModelRequest, name: string) {
  const { draft } = current(request);
  return modelTool('submit_changes', {
    version: draft.version,
    contentVersion: draft.contentVersion,
    completion: 'draft',
    questions: [],
    operations: [
      {
        name: 'propose_object',
        arguments: {
          id: 'lo',
          baseRevision: draft.changes[0].before?.revision ?? null,
          value: { ...draft.changes[0].after, name },
        },
      },
    ],
  });
}
async function arrange(page: Page, app: Awaited<ReturnType<typeof createInstallation>>) {
  await signIn(page.request, app.origin);
  const { household } = await (
    await createHousehold(page.request, app.origin, 'Kontextprov')
  ).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' },
    },
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  await startConversationWithText(page);
  await expect(field(page)).toBeVisible();
  return { path, read: async () => await (await page.request.get(path)).json() };
}
function utterance(live: ReturnType<typeof liveProvider>, text: string) {
  const id = [...live.channels.keys()].at(-1);
  if (!id) throw new Error('No active voice');
  live.emit(id, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: text,
    start_ms: 0,
    end_ms: 100,
  });
  return () =>
    live.emit(id, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
}
function speak(live: ReturnType<typeof liveProvider>, text: string) {
  utterance(live, text)();
}
function noPersistentConversation(
  app: Awaited<ReturnType<typeof createInstallation>>,
  marker: string,
) {
  for (const file of readdirSync(app.directory).filter((name) =>
    /^skyttel\.db(?:-wal)?$/.test(name),
  ))
    expect(readFileSync(join(app.directory, file)).includes(Buffer.from(marker))).toBe(false);
}

test('KONTEXT-01: kontexten består efter utkast, sparande, avbrott och fel', async ({ page }) => {
  let held = false;
  let release!: (output: unknown[]) => void;
  const messages: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ['log', 'warn', 'error'] as const)
    console[level] = (...args) => {
      messages.push(format(...args));
      original[level](...args);
    };
  const model = textModel((request) => {
    const { message, draft } = current(request);
    if (message === 'Rätta Lo till Lo Lind.') return [propose(request, 'Lo Lind')];
    if (message === 'Ändra den sista.') {
      expect(JSON.stringify(request.input)).toContain('Lo Lind');
      return [propose(request, 'Lo Senaste')];
    }
    if (message === 'Spara hela utkastet nu.' || message === 'Vad gjorde vi?') {
      if (message === 'Vad gjorde vi?')
        expect(JSON.stringify(request.input)).toContain('Spara hela utkastet nu.');
      return [
        modelTool('save_draft', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          operationId: crypto.randomUUID(),
        }),
      ];
    }
    if (message === 'Kontrollera samtalets tillfälliga provord.') {
      held = true;
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    }
    expect(JSON.stringify(request.input)).toContain('Lo Senaste');
    expect(JSON.stringify(request.input)).toContain('Kontrollera samtalets tillfälliga provord.');
    expect(JSON.stringify(request.input)).toContain('Vad gjorde vi?');
    const calls = request.input.filter((item) => item.type === 'function_call');
    for (const call of calls)
      expect(
        request.input.some(
          (item) => item.type === 'function_call_output' && item.call_id === call.call_id,
        ),
      ).toBe(true);
    return [modelMessage('Samtalet finns kvar.')];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { read } = await arrange(page, app);
    await send(page, 'Rätta Lo till Lo Lind.');
    await expect.poll(async () => (await read()).draft.changes[0].after.name).toBe('Lo Lind');
    await send(page, 'Ändra den sista.');
    await expect.poll(async () => (await read()).draft.changes[0].after.name).toBe('Lo Senaste');
    await send(page, 'Spara hela utkastet nu.');
    await expect.poll(async () => (await read()).draft.changes.length).toBe(0);
    const saved = await read();
    await send(page, 'Kontrollera samtalets tillfälliga provord.');
    await expect.poll(() => held).toBe(true);
    await field(page).press('Escape');
    release([modelMessage('För sent.')]);
    await expect(log(page)).not.toContainText('För sent.');
    await send(page, 'Vad gjorde vi?');
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toContainText(
      'Skyttel kunde inte slutföra uppdraget. Försök igen.',
    );
    expect((await read()).objects).toEqual(saved.objects);
    await send(page, 'Finns samtalet kvar?');
    await expect(log(page)).toContainText('Samtalet finns kvar.');
    for (const request of model.requests)
      expect((request as ModelRequest & { store: boolean }).store).toBe(false);
    noPersistentConversation(app, 'Kontrollera samtalets tillfälliga provord.');
    expect(messages.join('\n')).not.toContain('Kontrollera samtalets tillfälliga provord.');
  } finally {
    await app.close();
    Object.assign(console, original);
  }
});

test('KONTEXT-02: röst och text delar kontext över avstängning och ny röstanslutning', async ({
  page,
}) => {
  const model = textModel((request) => {
    const { message } = current(request);
    if (message === 'Rätta Lo till Lo Lind.') return [propose(request, 'Lo Lind')];
    expect(JSON.stringify(request.input)).toContain('Lo Lind');
    return [propose(request, 'Lo Senaste')];
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { read } = await arrange(page, app);
    await turnMicrophoneOn(page);
    speak(live, 'Rätta Lo till Lo Lind.');
    await expect.poll(async () => (await read()).draft.changes[0].after.name).toBe('Lo Lind');
    const shown = await read();
    // Wait for the real browser's displayed-draft acknowledgement; a provider
    // answer alone does not authorize work against a version it has not shown.
    await page.waitForRequest(
      (request) =>
        /\/voice\/[^/]+\/poll$/u.test(request.url()) &&
        request.postDataJSON()?.draftVersion === shown.draft.version,
    );
    await turnMicrophoneOff(page);
    await turnMicrophoneOn(page);
    speak(live, 'Ändra den sista.');
    await expect.poll(async () => (await read()).draft.changes[0].after.name).toBe('Lo Senaste');
    const latest = await read();
    await page.waitForRequest(
      (request) =>
        /\/voice\/[^/]+\/poll$/u.test(request.url()) &&
        request.postDataJSON()?.draftVersion === latest.draft.version,
    );
    await turnMicrophoneOff(page);
    await send(page, 'Ändra den sista.');
    await expect.poll(() => model.requests.length).toBe(3);
    await expect(log(page)).not.toContainText('Skyttel arbetar…');
    // A physical connection failure still keeps the server's conversation.
    await page.evaluate(() => window.skyttelVoiceFixture.fail());
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers))
      .toBe(0);
    await turnMicrophoneOn(page);
    expect(live.requests).toHaveLength(2);
    expect(JSON.stringify(live.requests[1].session.input)).toContain('Rätta Lo till Lo Lind.');
    speak(live, 'Ändra den sista.');
    await expect.poll(() => model.requests.length).toBe(4);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    for (const request of live.requests) expect(request.session.store).toBe(false);
  } finally {
    await app.close();
  }
});

test('KONTEXT-03: skrivna och talade kommandon börjar om samtalet och kastar utkastet', async ({
  page,
}) => {
  const model = textModel(() => [modelMessage('Tillfälligt samtalsord för provet.')]);
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { read } = await arrange(page, app);
    await send(page, 'Ett tillfälligt samtalsord.');
    await expect(log(page)).toContainText('Tillfälligt samtalsord för provet.');
    await send(page, 'Vad betyder ”nytt samtal och kasta utkastet”?');
    await expect.poll(() => model.requests.length).toBe(2);
    await expect(log(page)).not.toContainText('Skyttel arbetar…');
    expect((await read()).draft.changes).toHaveLength(1);
    await turnMicrophoneOn(page);
    await field(page).fill('Oskickat');
    speak(live, 'Nytt samtal');
    await expect(log(page)).toHaveText(
      'Skyttel: Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
    );
    await expect.poll(() => live.requests.length).toBe(2);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(field(page)).toHaveValue('Oskickat');
    expect((await read()).draft.changes).toHaveLength(1);
    expect(live.requests[1].session.input).toBeUndefined();
    await turnMicrophoneOff(page);
    await send(page, 'Nytt samtal');
    await expect.poll(() => live.requests.length).toBe(3);
    await expect(field(page)).toHaveValue('');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect((await read()).draft.changes).toHaveLength(1);
    await turnMicrophoneOn(page);
    const finish = utterance(live, 'Nytt samtal');
    await turnMicrophoneOff(page);
    await field(page).fill('Oskickat under avstängning');
    finish();
    await expect.poll(() => live.requests.length).toBe(4);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(field(page)).toHaveValue('Oskickat under avstängning');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
      1,
    );
    expect((await read()).draft.changes).toHaveLength(1);
    await turnMicrophoneOn(page);
    speak(live, 'Kasta utkastet');
    await expect.poll(async () => (await read()).draft.changes.length).toBe(0);
    await expect(log(page)).toContainText('Utkastet är kastat.');
    await turnMicrophoneOff(page);
    await send(page, 'Kasta utkastet');
    await expect.poll(async () => (await read()).draft.changes.length).toBe(0);
    await expect(log(page)).toContainText('Utkastet är kastat.');
    await send(page, 'Nytt samtal och kasta utkastet');
    await expect(log(page)).toHaveText('Skyttel: Nytt samtal. Utkastet är tomt.');
    await expect(field(page)).toHaveValue('');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await turnMicrophoneOn(page);
    speak(live, 'Kasta utkastet och nytt samtal');
    await expect.poll(() => live.requests.length).toBe(6);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(log(page)).toHaveText('Skyttel: Nytt samtal. Utkastet är tomt.');
    await send(page, 'Har vi börjat om?');
    await expect.poll(() => model.requests.length).toBe(3);
    expect(model.requests[2].input).toHaveLength(1);
    expect(JSON.stringify(model.requests[2].input)).not.toContain('Ett tillfälligt samtalsord.');
    noPersistentConversation(app, 'Ett tillfälligt samtalsord.');
    // Leaving really ends the ephemeral context; the draft remains private data.
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
  } finally {
    await app.close();
  }
});
