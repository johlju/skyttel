import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import type { Response } from '@playwright/test';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import { closeSupportDialog, createHousehold, openSettings, signIn } from '../support/client.js';
import { applyConflictPropertyChoices } from '../support/conflict-properties.js';
import {
  giveConversationConsent,
  microphoneButton,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { editTableObject, readDraftProposal } from '../support/domain-work.js';
import { createPreparedContext, expect, test } from '../support/test.js';

for (const seeded of [false, true]) {
  test(`literal context preparation completes batch, questions, save, rejection and admitted revoke on ${seeded ? 'seeded' : 'empty'} public installation`, {
    tag: '@technical',
  }, async ({ page, browser }) => {
    const document = await readFile('docs/manual-tests/conversation-preparation.md', 'utf8');
    const questions = await readFile('docs/manual-tests/conversation-questions.md', 'utf8');
    const batch = document.match(/^tool REQUEST submit_changes .+$/mu)?.[0];
    const save = document.match(/^tool REQUEST save_draft .+$/mu)?.[0];
    const question = questions.match(/^\s*tool REQUEST ask_questions [^\n]+$/mu)?.[0].trim();
    const summaryReply = document.match(/^reply REQUEST Historisk sammanfattning:.+$/mu)?.[0];
    const clientTranscript = [...document.matchAll(/```javascript\n([\s\S]*?)\n```/gu)]
      .map((match) => match[1])
      .find((source) => source.includes("delta: 'Sparat.'"));
    const stopVoice = [...document.matchAll(/```javascript\n([\s\S]*?)\n```/gu)]
      .map((match) => match[1])
      .find((source) => source.includes('VOICE_STOP_URL'));
    if (!batch || !save || !question || !summaryReply || !clientTranscript || !stopVoice)
      throw new Error('Missing literal public recipe');
    // Extract published commands before the launcher owns any fixture resources.
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: undefined },
    });
    const member = await createPreparedContext(browser);
    type Event = {
      event: string;
      id?: string;
      kind?: string;
      origin?: string;
      directory?: string;
      householdId?: string;
      operationId?: string;
      name?: string;
      draft?: TextAssistantReview;
      requests?: Event[];
    };
    const events: Event[] = [];
    const voiceStarts: Response[] = [];
    page.on('response', (response) => {
      if (
        response.request().method() === 'POST' &&
        response.status() === 201 &&
        /\/text-assistant\/[^/]+\/voice$/u.test(response.url())
      )
        voiceStarts.push(response);
    });
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
    const field = page.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    const log = page.getByRole('log', { name: 'Samtalstext' });
    async function held(after: number, kind = 'work') {
      await expect
        .poll(() => events.slice(after).some((item) => item.event === 'held' && item.kind === kind))
        .toBe(true);
      const item = events.slice(after).find((item) => item.event === 'held' && item.kind === kind);
      if (!item?.id) throw new Error('Missing current public held request');
      return item;
    }
    function render(template: string, item: Event, substitutions: Record<string, string> = {}) {
      if (!item.id) throw new Error('Missing recipe request ID');
      const values = {
        REQUEST: item.id,
        V: String(item.draft?.version),
        C: String(item.draft?.contentVersion),
        ...substitutions,
      };
      return template.replace(
        /\b(?:REQUEST|VALUE|LO|V|C)\b/gu,
        (key) => values[key as keyof typeof values],
      );
    }
    async function send(text: string) {
      const at = events.length;
      await field.fill(text);
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      return held(at);
    }
    async function noPending() {
      const at = events.length;
      command('pending');
      await expect.poll(() => events.slice(at).some((item) => item.event === 'pending')).toBe(true);
      expect(events.slice(at).find((item) => item.event === 'pending')?.requests).toEqual([]);
    }
    try {
      await expect.poll(() => events.some((item) => item.event === 'ready')).toBe(true);
      const ready = events.find((item) => item.event === 'ready');
      if (!ready?.origin || !ready.directory)
        throw new Error('Missing disposable public installation');
      if (seeded) {
        command('seed-family');
        await expect.poll(() => events.some((item) => item.event === 'seeded')).toBe(true);
      }
      await signIn(page.request, ready.origin);
      const household = seeded
        ? events.find((item) => item.event === 'seeded')?.householdId
        : (await (await createHousehold(page.request, ready.origin, 'Kontextprov')).json())
            .household.id;
      const path = `${ready.origin}/api/households/${household}/map`;
      let state = await (await page.request.get(path)).json();
      const initialObjects = state.objects;
      const initialHistory = await (await page.request.get(`${path}/history`)).json();
      if (seeded) {
        expect(initialObjects.length).toBeGreaterThan(0);
        expect(initialHistory.history.length).toBeGreaterThan(0);
      } else {
        expect(initialObjects).toEqual([]);
        expect(initialHistory.history).toEqual([]);
      }
      const person = state.types.find((item: { name: string }) => item.name === 'Person');
      expect(person).toBeDefined();
      let identityAt = events.length;
      command('identity robin');
      await expect
        .poll(() =>
          events
            .slice(identityAt)
            .some((item) => item.event === 'identity' && item.name === 'robin'),
        )
        .toBe(true);
      await signIn(member.request, ready.origin, 'microsoft');
      const { user } = await (await member.request.get(`${ready.origin}/api/bootstrap`)).json();
      const { code } = await (
        await page.request.post(`${ready.origin}/api/households/${household}/invitations`, {
          headers: { origin: ready.origin },
          data: { userId: user.id },
        })
      ).json();
      expect(
        (
          await member.request.post(`${ready.origin}/api/invitations/accept`, {
            headers: { origin: ready.origin },
            data: { code },
          })
        ).status(),
      ).toBe(200);
      identityAt = events.length;
      command('identity alex');
      await expect
        .poll(() =>
          events
            .slice(identityAt)
            .some((item) => item.event === 'identity' && item.name === 'alex'),
        )
        .toBe(true);
      const memberState = await (await member.request.get(path)).json();
      expect(
        (
          await member.request.post(`${path}/draft`, {
            headers: { origin: ready.origin },
            data: {
              version: memberState.draft.version,
              contentVersion: memberState.contentVersion,
              id: 'robin-private',
              baseRevision: null,
              value: {
                typeId: person.id,
                name: 'Robin privata Lo',
                description: 'Oberoende påhittad uppgift',
              },
            },
          })
        ).status(),
      ).toBe(200);
      const privateDraft = (await (await member.request.get(path)).json()).draft;
      expect(privateDraft.changes).toHaveLength(1);
      expect(privateDraft.changes[0].after).toMatchObject({
        typeId: person.id,
        name: 'Robin privata Lo',
        description: 'Oberoende påhittad uppgift',
      });
      expect(
        (
          await page.request.post(`${path}/draft`, {
            headers: { origin: ready.origin },
            data: {
              version: state.draft.version,
              contentVersion: state.contentVersion,
              id: 'public-lo',
              baseRevision: null,
              value: { typeId: person.id, name: 'Lo Exempel', description: 'Påhittad uppgift' },
            },
          })
        ).status(),
      ).toBe(200);
      await page.goto(ready.origin);
      if (seeded) {
        const beforeResolution = await (await page.request.get(path)).json();
        await expect(
          page.getByRole('button', { name: /^\d+ konflikt(?:er)? i ditt utkast$/ }),
        ).toBeVisible();
        await applyConflictPropertyChoices(page, 'proposed');
        const resolved = await (await page.request.get(path)).json();
        await expect(
          page.getByRole('button', { name: /^\d+ konflikt(?:er)? i ditt utkast$/ }),
        ).toHaveCount(0);
        for (const previous of beforeResolution.draft.changes) {
          const next = resolved.draft.changes.find(
            (change: { id: string }) => change.id === previous.id,
          );
          const values = (value: Record<string, unknown>) =>
            Object.fromEntries(
              Object.entries(value).filter(
                ([key]) => !['id', 'householdId', 'revision'].includes(key),
              ),
            );
          const current = beforeResolution.objects.find(
            (object: { id: string }) => object.id === previous.id,
          );
          // The seeded name conflict keeps Alex's explicit name change and
          // merges the independently saved description he never changed.
          const expected =
            previous.before && previous.after.description === previous.before.description
              ? { ...previous.after, description: current.description }
              : previous.after;
          expect(values(next.after)).toEqual(values(expected));
        }
        expect(resolved.objects).toEqual(initialObjects);
        expect(resolved.relationships).toEqual(beforeResolution.relationships);
        expect(resolved.draft.relationships).toEqual(beforeResolution.draft.relationships);
        expect(resolved.draft.objectTypes).toEqual(beforeResolution.draft.objectTypes);
        expect(resolved.draft.relationshipTypes).toEqual(beforeResolution.draft.relationshipTypes);
        expect(await (await page.request.get(`${path}/history`)).json()).toEqual(initialHistory);
        expect((await (await member.request.get(path)).json()).draft).toEqual(privateDraft);
      }
      await startConversationWithText(page);
      let item = await send('Red ut vilken Lo som avses.');
      command(render(question, item));
      await expect(log).toContainText(
        'Vilken person avses med Lo, och vilket namn ska objektet ha?',
      );
      await noPending();
      item = await send('Rätta Lo till Lo Senaste.');
      const lo = item.draft?.changes.find((change) => change.id === 'public-lo');
      if (!lo?.after) throw new Error('Missing complete public Lo proposal');
      const value = { ...lo.after, name: 'Lo Senaste' } as Record<string, unknown>;
      for (const key of ['id', 'householdId', 'revision']) delete value[key];
      command(render(batch, item, { LO: lo.id, VALUE: JSON.stringify(value) }));
      await expect(log).toContainText('Utkastet är uppdaterat.');
      await expect
        .poll(
          async () =>
            (await (await page.request.get(path)).json()).draft.changes.find(
              (change: { id: string }) => change.id === lo.id,
            )?.after.name,
        )
        .toBe('Lo Senaste');
      await noPending();
      state = await (await page.request.get(path)).json();
      expect(state.objects).toEqual(initialObjects);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual(initialHistory);
      expect((await (await member.request.get(path)).json()).draft).toEqual(privateDraft);
      await turnMicrophoneOn(page);
      let at = events.length;
      command('user Spara hela utkastet nu.');
      command('delegate');
      item = await held(at);
      command('context 89');
      await expect(page.getByRole('meter', { name: 'Kontext', exact: true })).toHaveAttribute(
        'value',
        '89',
      );
      command(render(save, item));
      await expect
        .poll(
          async () =>
            (await (await page.request.get(path)).json()).objects.find(
              (object: { id: string }) => object.id === lo.id,
            )?.name,
        )
        .toBe('Lo Senaste');
      await noPending();
      command('assistant Sparat.');
      await expect(log).toContainText('Sparat.');
      await page.evaluate(clientTranscript);
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true));
      await expect(page.getByRole('group', { name: 'Röstruta', exact: true })).toContainText(
        'Skyttel talar',
      );
      at = events.length;
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
      const summary = await held(at, 'context-summary');
      const renewedVoice = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/voice'),
      );
      command(render(summaryReply, summary));
      await expect(log).toContainText(
        'Skyttel har sammanfattat samtalet för att få plats i kontexten.',
      );
      // The summary text arrives before the replacement voice is ready. Wait
      // for admission and playback setup so the click pauses capture instead
      // of cancelling startup and leaving an untracked server transport.
      expect((await renewedVoice).status()).toBe(201);
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      expect(voiceStarts).toHaveLength(2);
      await turnMicrophoneOff(page);
      state = await (await page.request.get(path)).json();
      const savedState = state;
      const savedHistory = await (await page.request.get(`${path}/history`)).json();
      item = await send('Vad gjorde vi?');
      command(render(save, item));
      await expect(page.locator('.conversation-notice')).toContainText(
        'Skyttel kunde inte slutföra uppdraget. Försök igen.',
      );
      await noPending();
      expect(await (await page.request.get(path)).json()).toEqual(savedState);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual(savedHistory);
      // Individual manual cases start afresh. Retire every actual owned voice
      // transport before reloading this combined proof into a text-only case.
      // A microphone-off or a browser reload alone retains its server transport.
      expect(voiceStarts.length).toBeGreaterThan(0);
      const retired = [];
      for (const response of voiceStarts) {
        const { voice } = await response.json();
        expect(voice.id).toEqual(expect.any(String));
        const url = `${new URL(response.url()).pathname}/${encodeURIComponent(voice.id)}/stop`;
        const result = await page.evaluate<{ voice: { id: string; phase: string } }>(
          stopVoice.replaceAll('VOICE_STOP_URL', JSON.stringify(url)),
        );
        expect(result.voice).toMatchObject({ id: voice.id, phase: 'closed' });
        retired.push({ url, id: voice.id, phase: result.voice.phase });
      }
      expect(new Set(retired.map((voice) => voice.id)).size).toBe(voiceStarts.length);
      await test.info().attach('owned-voice-retirement', {
        body: JSON.stringify(retired, null, 2),
        contentType: 'application/json',
      });
      await page.reload();
      await openConversationText(page);
      await expect(log).not.toContainText('Vad gjorde vi?');
      await expect(page.getByRole('meter', { name: 'Kontext', exact: true })).toHaveAttribute(
        'value',
        '0',
      );
      expect(await (await page.request.get(path)).json()).toEqual(savedState);
      // This independent save case owns a newly edited browser draft. Editing
      // through the native form also updates the browser's current version.
      // Its distinct visible name avoids the seed's unrelated Lo Lind.
      const form = await editTableObject(page, 'Lo Senaste');
      await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Lo Senaste');
      await expect(form.getByLabel('Objekttyp', { exact: true })).toHaveValue(person.id);
      await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue('Påhittad uppgift');
      await form.getByLabel('Namn', { exact: true }).fill('Lo Registrerad');
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form).not.toBeVisible();
      const proposal = await readDraftProposal(page, 'Lo Registrerad');
      const proposedValues = proposal
        .getByRole('heading', { name: 'Föreslagna värden', exact: true })
        .locator('..');
      for (const [label, expected] of [
        ['Namn', 'Lo Registrerad'],
        ['Typ', 'Person'],
        ['Beskrivning', 'Påhittad uppgift'],
      ])
        await expect(
          proposedValues
            .locator('dt')
            .filter({ hasText: new RegExp(`^${label}(?:\\s+· ändrat)?$`, 'u') })
            .locator('..')
            .locator('dd'),
        ).toHaveText(expected);
      await closeSupportDialog(page, 'Lo Registrerad');
      const nextState = await (await page.request.get(path)).json();
      expect(nextState.objects).toEqual(savedState.objects);
      expect(nextState.draft.changes).toEqual([
        expect.objectContaining({ id: lo.id, after: { ...value, name: 'Lo Registrerad' } }),
      ]);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual(savedHistory);
      expect((await (await member.request.get(path)).json()).draft).toEqual(privateDraft);
      // Prepare before starting, exactly as each independent manual case does.
      // The new text session therefore owns this prepared current draft.
      await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
      await giveConversationConsent(page);
      await expect(page.getByRole('region', { name: 'Arbetsyta', exact: true })).toHaveAttribute(
        'data-session-active',
        'true',
      );
      await expect(log).not.toContainText('Vad gjorde vi?');
      await expect(page.getByRole('meter', { name: 'Kontext', exact: true })).toHaveAttribute(
        'value',
        '0',
      );
      command('hold-save on');
      item = await send('Spara hela utkastet nu.');
      at = events.length;
      command(render(save, item));
      await expect
        .poll(() => events.slice(at).some((event) => event.event === 'save-registered'))
        .toBe(true);
      const registered = events.slice(at).find((event) => event.event === 'save-registered');
      await openSettings(page);
      await page
        .locator('.settings-cards')
        .getByRole('link', { name: /^Samtal med Skyttel/ })
        .click();
      await page.getByRole('button', { name: 'Återkalla medgivandet', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Återkalla medgivandet', exact: true });
      await expect(dialog).toContainText('Skyttel sparar ditt utkast. Sparandet slutförs.');
      await dialog
        .getByRole('button', { name: 'Återkalla och avsluta samtalet', exact: true })
        .click();
      command('release-save');
      command('hold-save off');
      await expect
        .poll(
          async () =>
            (await (await page.request.get(path)).json()).objects.find(
              (object: { id: string }) => object.id === lo.id,
            )?.name,
        )
        .toBe('Lo Registrerad');
      const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
      expect(
        operations.filter(
          (operation: { operationId: string }) => operation.operationId === registered?.operationId,
        ),
      ).toEqual([
        expect.objectContaining({ status: 'succeeded', operationId: registered?.operationId }),
      ]);
      await noPending();
      expect((await (await member.request.get(path)).json()).draft).toEqual(privateDraft);
      command('quit');
      await expect.poll(() => child.exitCode).toBe(0);
      await expect(stat(ready.directory)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(events.filter((item) => item.event === 'error')).toEqual([]);
      expect(diagnostics).toBe('');
    } finally {
      if (child.exitCode === null) command('quit');
      await expect.poll(() => child.exitCode).toBe(0);
      await test.info().attach('literal-public-terminal-events', {
        body: JSON.stringify(events, null, 2),
        contentType: 'application/json',
      });
      await member.close();
    }
  });
}

test('context preparation preserves buffered PCM through summary on seeded public installation', {
  tag: '@technical',
}, async ({ page }) => {
  // Extract the exact publicly runnable block before starting the fixture.
  const document = await readFile('docs/manual-tests/conversation-preparation.md', 'utf8');
  const source = document.match(/```javascript\n([\s\S]*?)\n```/u)?.[1];
  if (!source) throw new Error('Missing documented public preparation');
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: undefined },
  });
  const events: {
    event: string;
    origin?: string;
    directory?: string;
    householdId?: string;
    id?: string;
    kind?: string;
    message?: string;
  }[] = [];
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
  try {
    await expect.poll(() => events.some(({ event }) => event === 'ready')).toBe(true);
    const ready = events.find(({ event }) => event === 'ready');
    if (!ready?.origin || !ready.directory) throw new Error('Missing disposable launcher');
    child.stdin.write('seed-family\n');
    await expect.poll(() => events.some(({ event }) => event === 'seeded')).toBe(true);
    await signIn(page.request, ready.origin);
    const household = events.find(({ event }) => event === 'seeded')?.householdId;
    if (!household) throw new Error('Missing household');
    const path = `${ready.origin}/api/households/${household}/map`;
    const before = await (await page.request.get(path)).json();
    expect(before.objects.length).toBeGreaterThan(0);
    expect(before.draft.changes.length).toBeGreaterThan(0);
    const history = await (await page.request.get(`${path}/history`)).json();
    expect(history.history.length).toBeGreaterThan(0);
    await page.goto(ready.origin);
    await startConversationWithText(page);
    await page.evaluate(() => Object.assign(window, { contextOriginalFetch: window.fetch }));
    await page.evaluate(source);
    await page.evaluate(() => {
      (
        window as unknown as { skyttelVoicePreparation: { hold: (route: string) => void } }
      ).skyttelVoicePreparation.hold('voice');
    });
    const box = await microphoneButton(page).boundingBox();
    if (!box) throw new Error('Missing native microphone');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { skyttelVoicePreparation: { status: () => { held: string } } }
            ).skyttelVoicePreparation.status().held,
        ),
      )
      .toBe('voice');
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophoneTone(440));
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.sentAudio())).toEqual([]);
    await page.mouse.up();
    const releasedAt = await page.evaluate(() => performance.now());
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophoneTone(880));
    const started = page.waitForResponse(
      (response) => response.url().endsWith('/voice') && response.request().method() === 'POST',
    );
    await page.evaluate(() =>
      (
        window as unknown as { skyttelVoicePreparation: { release: () => void } }
      ).skyttelVoicePreparation.release(),
    );
    expect((await started).status()).toBe(201);
    child.stdin.write('context 89\n');
    await expect
      .poll(() => events.some(({ event, kind }) => event === 'held' && kind === 'context-summary'))
      .toBe(true);
    const summary = events.find(
      ({ event, kind }) => event === 'held' && kind === 'context-summary',
    );
    if (!summary?.id) throw new Error('Missing actual summary request');
    child.stdin.write(
      `reply ${summary.id} Historisk sammanfattning: Lo är det senaste förslaget.\n`,
    );
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Skyttel har sammanfattat samtalet för att få plats i kontexten.',
    );
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers))
      .toBe(1);
    const renewedAt = await page.evaluate(() => performance.now());
    await expect
      .poll(() =>
        page.evaluate(
          (at) =>
            window.skyttelVoiceFixture
              .sentAudio()
              .some((sample) => sample.at > at && sample.frequency > 400 && sample.frequency < 480),
          renewedAt,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        (at) =>
          window.skyttelVoiceFixture
            .captureChanges()
            .filter((change) => change.at > at && change.enabled),
        releasedAt,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture
          .sentAudio()
          .some((sample) => sample.frequency > 820 && sample.frequency < 940),
      ),
    ).toBe(false);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
      1,
    );
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() =>
      (
        window as unknown as { skyttelVoicePreparation: { restore: () => void } }
      ).skyttelVoicePreparation.restore(),
    );
    expect(
      await page.evaluate(
        () =>
          window.fetch ===
          (window as unknown as { contextOriginalFetch: typeof fetch }).contextOriginalFetch,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => 'skyttelVoicePreparation' in window)).toBe(false);
    expect(await (await page.request.get(path)).json()).toEqual(before);
    expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
    child.stdin.write('quit\n');
    await expect.poll(() => events.some(({ event }) => event === 'closed')).toBe(true);
    await expect(stat(ready.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(diagnostics).toBe('');
    expect(events.filter(({ event }) => event === 'error')).toEqual([]);
  } finally {
    await page.mouse.up();
    if (child.exitCode === null) child.stdin.write('quit\n');
    await expect.poll(() => child.exitCode).toBe(0);
  }
});
