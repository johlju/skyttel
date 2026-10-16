import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  closeConversationText,
  microphoneButton,
  openConversationText,
  startConversationWithText,
  voiceBox,
} from '../support/conversation-page.js';
import { expect, test } from '../support/test.js';
import {
  voiceControlsPreparationSource,
  voiceTonePreparationSource,
} from '../support/voice-controls-preparation.js';

// Representative references for each distinct preparation workflow.
// Empty-short and populated-desktop combinations do not run independently.
const references = [
  { seeded: true, viewport: { width: 320, height: 250 } },
  { seeded: false, viewport: { width: 1280, height: 900 } },
];

for (const { seeded, viewport } of references)
  test(`voice preparation controls the public launcher on ${seeded ? 'seeded' : 'empty'} content at ${viewport.width}x${viewport.height}`, {
    tag: '@technical',
  }, async ({ page }) => {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(
      viewport,
    );
    // Extract the literal public preparation before launching its installation.
    const document = await readFile('docs/manual-tests/voice-controls-preparation.md', 'utf8');
    const snippet = document.match(/```javascript\n([\s\S]*?)\n```/u)?.[1];
    expect(snippet).toBe(voiceControlsPreparationSource);
    const tones = [...document.matchAll(/```javascript\n([\s\S]*?)\n```/gu)][1]?.[1];
    expect(tones).toBe(voiceTonePreparationSource);
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: undefined },
    });
    const events: {
      event: string;
      origin?: string;
      directory?: string;
      householdId?: string;
      message?: string;
      id?: string;
      kind?: string;
    }[] = [];
    let buffer = '';
    let diagnostics = '';
    const unexpectedOutput: string[] = [];
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('{')) events.push(JSON.parse(line));
        else if (line.trim()) unexpectedOutput.push(line);
      }
    });
    child.stderr.on('data', (chunk) => {
      diagnostics += String(chunk);
    });
    try {
      await expect.poll(() => events.some(({ event }) => event === 'ready')).toBe(true);
      const ready = events.find(({ event }) => event === 'ready');
      if (!ready?.origin || !ready.directory) throw new Error('Missing public launcher address');
      if (seeded) {
        child.stdin.write('seed-family\n');
        await expect.poll(() => events.some(({ event }) => event === 'seeded')).toBe(true);
      }
      await signIn(page.request, ready.origin);
      const household = seeded
        ? events.find(({ event }) => event === 'seeded')?.householdId
        : (await (await createHousehold(page.request, ready.origin, 'Tryckprov')).json()).household
            .id;
      if (!household) throw new Error('Missing prepared household');
      await page.goto(ready.origin);
      const path = `${ready.origin}/api/households/${household}/map`;
      const before = await (await page.request.get(path)).json();
      expect(before.draft.changes.length > 0).toBe(seeded);
      const history = await (await page.request.get(`${path}/history`)).json();
      await startConversationWithText(page, { remember: true });
      await page.reload();
      await expect(microphoneButton(page)).toBeVisible();
      await page.evaluate(() => {
        Object.assign(window, { voiceOriginalFetch: window.fetch });
      });
      await page.evaluate(voiceControlsPreparationSource);
      await page.evaluate(voiceTonePreparationSource);
      await page.evaluate(() => window.skyttelVoicePreparation?.hold('voice'));
      await microphoneButton(page).scrollIntoViewIfNeeded();
      const box = await microphoneButton(page).boundingBox();
      if (!box) throw new Error('Missing microphone control');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect
        .poll(() => page.evaluate(() => window.skyttelVoicePreparation?.status().held))
        .toBe('voice');
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => window.skyttelVoiceFixture.sentAudio())).toEqual([]);
      await page.mouse.up();
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      const voiceAdmission = page.waitForResponse(
        (response) => response.url().endsWith('/voice') && response.request().method() === 'POST',
      );
      await page.evaluate(() => window.skyttelVoicePreparation?.release());
      const admittedVoice = await voiceAdmission;
      expect(admittedVoice.status()).toBe(201);
      const firstVoice = (await admittedVoice.json()).voice;
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.skyttelVoiceFixture
              .sentAudio()
              .some(({ frequency }) => frequency > 400 && frequency < 480),
          ),
        )
        .toBe(true);
      await page.waitForTimeout(1100);
      expect(
        await page.evaluate(() =>
          window.skyttelVoiceFixture
            .sentAudio()
            .some(({ frequency }) => frequency > 820 && frequency < 940),
        ),
      ).toBe(false);
      await page.evaluate(() => window.voiceToneCleanup?.());
      await page.evaluate(() => window.skyttelVoicePreparation?.restore());
      expect(
        await page.evaluate(
          () =>
            window.fetch ===
            (window as unknown as { voiceOriginalFetch: typeof fetch }).voiceOriginalFetch,
        ),
      ).toBe(true);
      expect(await page.evaluate(() => Boolean(window.skyttelVoicePreparation))).toBe(false);
      expect(await (await page.request.get(path)).json()).toEqual(before);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);

      // The exact admitted transport must close before a replacement assistant.
      // Reload alone leaves its server session alive.
      const stoppedVoice = await page.request.post(`${admittedVoice.url()}/${firstVoice.id}/stop`, {
        headers: { origin: ready.origin },
        data: {},
      });
      expect(stoppedVoice.status()).toBe(200);
      expect((await stoppedVoice.json()).voice.phase).toBe('closed');
      // The other documented hold prevents assistant admission during startup.
      expect(diagnostics, 'before deliberate first-page reload').toBe('');
      await page.reload();
      expect(diagnostics, 'after deliberate first-page reload').toBe('');
      await expect(microphoneButton(page)).toBeVisible();
      await page.evaluate(voiceControlsPreparationSource);
      await page.evaluate(voiceTonePreparationSource);
      await page.evaluate(() => window.skyttelVoicePreparation?.hold('text-assistant'));
      await microphoneButton(page).scrollIntoViewIfNeeded();
      const assistantBox = await microphoneButton(page).boundingBox();
      if (!assistantBox) throw new Error('Missing microphone control');
      await page.mouse.move(
        assistantBox.x + assistantBox.width / 2,
        assistantBox.y + assistantBox.height / 2,
      );
      await page.mouse.down();
      await expect
        .poll(() => page.evaluate(() => window.skyttelVoicePreparation?.status().held))
        .toBe('text-assistant');
      await page.waitForTimeout(250);
      await page.mouse.up();
      await microphoneButton(page).click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.skyttelVoiceFixture
              .stats()
              .microphoneTracks.every(({ state }) => state === 'ended'),
          ),
        )
        .toBe(true);
      const admitted = page.waitForResponse(
        (response) =>
          response.url().endsWith('/text-assistant') && response.request().method() === 'POST',
      );
      await page.evaluate(() => window.skyttelVoicePreparation?.release());
      expect((await admitted).status()).toBe(201);
      expect(diagnostics, 'after the held assistant is admitted').toBe('');
      await expect
        .poll(() => page.evaluate(() => window.skyttelVoicePreparation?.status().held))
        .toBeNull();
      await page.evaluate(() => window.voiceToneCleanup?.());
      await page.evaluate(() => window.skyttelVoicePreparation?.restore());
      const secondVoiceAdmission = page.waitForResponse(
        (response) => response.url().endsWith('/voice') && response.request().method() === 'POST',
      );
      await microphoneButton(page).click();
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      const admittedSecondVoice = await secondVoiceAdmission;
      expect(admittedSecondVoice.status()).toBe(201);
      await page.evaluate(() => window.skyttelVoiceFixture.setMicrophoneTone(880));
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.skyttelVoiceFixture
              .sentAudio()
              .some(({ frequency }) => frequency > 820 && frequency < 940),
          ),
        )
        .toBe(true);
      expect(
        await page.evaluate(() =>
          window.skyttelVoiceFixture
            .sentAudio()
            .some(({ frequency }) => frequency > 400 && frequency < 480),
        ),
      ).toBe(false);
      expect(await (await page.request.get(path)).json()).toEqual(before);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
      await microphoneButton(page).click();
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      const secondVoice = (await admittedSecondVoice.json()).voice;
      const stoppedSecondVoice = await page.request.post(
        `${admittedSecondVoice.url()}/${secondVoice.id}/stop`,
        { headers: { origin: ready.origin }, data: {} },
      );
      expect(stoppedSecondVoice.status()).toBe(200);
      expect((await stoppedSecondVoice.json()).voice.phase).toBe('closed');
      expect(diagnostics, 'after deliberate prepared-transport cleanup').toBe('');

      const runner = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/manual-voice-observation.ts',
          '--origin',
          ready.origin,
          '--width',
          String(viewport.width),
          '--height',
          String(viewport.height),
          '--freeze-grace',
          '--headless',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: undefined } },
      );
      const controls: {
        event: string;
        endpoint?: string;
        directory?: string;
        clockPaused?: boolean;
      }[] = [];
      let controlBuffer = '';
      let controlErrors = '';
      const unexpectedControlOutput: string[] = [];
      runner.stdout.on('data', (chunk) => {
        controlBuffer += String(chunk);
        const lines = controlBuffer.split('\n');
        controlBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('{')) controls.push(JSON.parse(line));
          else if (line.trim()) unexpectedControlOutput.push(line);
        }
      });
      runner.stderr.on('data', (chunk) => {
        controlErrors += String(chunk);
      });
      let controlled: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
      try {
        await expect.poll(() => controls.some(({ event }) => event === 'ready')).toBe(true);
        const endpoint = controls.find(({ event }) => event === 'ready')?.endpoint;
        if (!endpoint) throw new Error('Missing observation runner endpoint');
        controlled = await chromium.connectOverCDP(endpoint);
        const observed = controlled.contexts()[0].pages()[0];
        expect(await observed.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(
          viewport,
        );
        await signIn(observed.request, ready.origin);
        await observed.reload();
        // Consent was remembered for this same household by the actual text start.
        await microphoneButton(observed).click();
        await expect(voiceBox(observed)).toHaveText('Lyssnar');
        runner.stdin.write('disconnect\n');
        await expect
          .poll(() =>
            controls.some(
              ({ event, clockPaused }) => event === 'disconnected' && clockPaused === true,
            ),
          )
          .toBe(true);
        const notice = observed.getByRole('region', { name: 'Samtalsnotis', exact: true });
        await expect(notice).toContainText('Ingen kontakt med Skyttel. Mikrofonen är av.');
        await observed.waitForTimeout(3500);
        await expect(notice).toContainText('Ingen kontakt med Skyttel. Mikrofonen är av.');
        await expect(microphoneButton(observed)).toHaveAttribute('aria-pressed', 'false');
        await observed.getByRole('button', { name: 'Navigera', exact: true }).focus();
        await expect(observed.getByRole('button', { name: 'Navigera', exact: true })).toBeFocused();
        runner.stdin.write('reconnect\n');
        await expect
          .poll(() =>
            controls.some(
              ({ event, clockPaused }) => event === 'reconnected' && clockPaused === false,
            ),
          )
          .toBe(true);
        await expect(notice).toHaveCount(0);
        await expect(microphoneButton(observed)).toHaveAttribute('aria-pressed', 'false');
        expect(await (await page.request.get(path)).json()).toEqual(before);
        expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
        // The HTTP boundary is distinct from independent media disconnection.
        for (const focused of ['microphone', 'message'] as const) {
          await microphoneButton(observed).click();
          await expect(voiceBox(observed)).toHaveText('Lyssnar');
          if (focused === 'message') await openConversationText(observed);
          const target =
            focused === 'microphone'
              ? microphoneButton(observed)
              : observed.getByLabel('Meddelande till Skyttel');
          await target.focus();
          const offlineCount = controls.filter(({ event }) => event === 'offline').length;
          runner.stdin.write('offline\n');
          await expect
            .poll(
              () =>
                controls.filter(
                  ({ event, clockPaused }) => event === 'offline' && clockPaused === true,
                ).length,
            )
            .toBe(offlineCount + 1);
          await expect(notice).toContainText('Ingen kontakt med Skyttel. Mikrofonen är av.');
          await expect(target).toBeFocused();
          const card = await notice.evaluateHandle((element) => element);
          const occurrence = await observed
            .locator('.notice-announcement[aria-live="assertive"] span')
            .evaluateHandle((element) => element);
          await observed.waitForTimeout(3500);
          await expect(notice).toContainText('Ingen kontakt med Skyttel. Mikrofonen är av.');
          await expect(
            observed.locator('.voice-announcement:not(.voice-context-announcement)'),
          ).not.toContainText('Mikrofonen är av');
          if (focused === 'message') await closeConversationText(observed);
          else await openConversationText(observed);
          expect(await notice.evaluate((element, previous) => element === previous, card)).toBe(
            true,
          );
          expect(
            await observed
              .locator('.notice-announcement[aria-live="assertive"] span')
              .evaluate((element, previous) => element === previous, occurrence),
          ).toBe(true);
          const onlineCount = controls.filter(({ event }) => event === 'online').length;
          runner.stdin.write('online\n');
          await expect
            .poll(
              () =>
                controls.filter(
                  ({ event, clockPaused }) => event === 'online' && clockPaused === false,
                ).length,
            )
            .toBe(onlineCount + 1);
          await expect(notice).toHaveCount(0);
          await expect(microphoneButton(observed)).toHaveAttribute('aria-pressed', 'false');
          if (focused === 'microphone') await closeConversationText(observed);
          await card.dispose();
          await occurrence.dispose();
        }
        expect(await (await page.request.get(path)).json()).toEqual(before);
        expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
        expect(diagnostics, 'before deliberate observation-browser quit').toBe('');
        runner.stdin.write('quit\n');
        await expect.poll(() => runner.exitCode).toBe(0);
        expect(controls.some(({ event }) => event === 'closed')).toBe(true);
        expect(controls.filter(({ event }) => event === 'error')).toEqual([]);
        expect(controlErrors).toBe('');
        expect(unexpectedControlOutput).toEqual([]);
        expect(
          controls.every(({ event }) =>
            ['ready', 'disconnected', 'reconnected', 'offline', 'online', 'closed'].includes(event),
          ),
        ).toBe(true);
        const profile = controls.find(({ event }) => event === 'ready')?.directory;
        if (!profile) throw new Error('Missing disposable observation profile');
        await expect(stat(profile)).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await controlled?.close();
        if (runner.exitCode === null) {
          runner.kill('SIGTERM');
          await new Promise<void>((resolve) => runner.once('exit', () => resolve()));
        }
      }
      // Only the deliberate fixture shutdown below may emit access-lost diagnostics.
      // Any earlier diagnostic, provider detail, transcript or PCM logging fails.
      expect(diagnostics).toBe('');
      child.stdin.write('quit\n');
      await expect.poll(() => child.exitCode).toBe(0);
      expect(events.some(({ event }) => event === 'closed')).toBe(true);
      expect(events.filter(({ event }) => event === 'error')).toEqual([]);
      expect(unexpectedOutput).toEqual([]);
      expect(events.every(({ event }) => ['ready', 'seeded', 'closed'].includes(event))).toBe(true);
      for (const line of diagnostics.trim().split('\n').filter(Boolean)) {
        const entry = JSON.parse(line);
        expect(Object.keys(entry).sort()).toEqual([
          'code',
          'diagnosticId',
          'event',
          'group',
          'stage',
        ]);
        expect(entry).toEqual({
          event: 'voice_interrupted',
          stage: 'session',
          code: 'voice_access_lost',
          group: 'interrupted',
          diagnosticId: expect.stringMatching(/^[a-f0-9-]{36}$/),
        });
      }
      await expect(stat(ready.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await page.evaluate(() => window.skyttelVoicePreparation?.restore()).catch(() => {});
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => child.once('exit', () => resolve()));
      }
    }
  });

// These literal recipes have independent setup and cleanup; the complete
// control/observation cases above retain their original time budget.
for (const { seeded, viewport } of references)
  test(`voice preparation executes literal fault recipes on ${seeded ? 'seeded' : 'empty'} content at ${viewport.width}x${viewport.height}`, {
    tag: '@technical',
  }, async ({ page }) => {
    // Read every literal command before launching its actual installation.
    const document = await readFile('docs/manual-tests/voice-controls-preparation.md', 'utf8');
    const playbackSection = document.split('## Ljudhinder ROSTFEL-04\n')[1]?.split('\n## ')[0];
    const playback = [...(playbackSection ?? '').matchAll(/```javascript\n([\s\S]*?)\n```/gu)].map(
      (match) => match[1],
    );
    expect(playback).toEqual([
      "window.skyttelVoiceFixture.setPlayback('blocked');",
      'window.skyttelVoiceFixture.stats();',
      "window.skyttelVoiceFixture.setPlayback('allow');",
    ]);
    const noticesSection = document.split('## Notisernas tidslinjer\n')[1]?.split('\n## ')[0];
    const denied = noticesSection?.match(/```javascript\n([\s\S]*?)\n\s*```/u)?.[1]?.trim();
    expect(denied).toBe("window.skyttelVoiceFixture.setMicrophone('deny');");
    const command = (pattern: RegExp) => {
      const value = noticesSection?.match(pattern)?.[1];
      if (!value) throw new Error(`Missing literal notice preparation ${pattern}`);
      return value;
    };
    const unavailable = command(/`(available off)`/u);
    const available = command(/`(available on)`/u);
    const failed = command(/`(fail REQUEST)`/u);
    const answered = command(/`(reply REQUEST Ett nytt svar\.)`/u);
    const allowed = command(/`(window\.skyttelVoiceFixture\.setMicrophone\('allow'\))`/u);
    const offMicrophoneSound = document.split('### Tidslinje TAL-11\n')[1]?.split('\n### ')[0];
    const remote = [
      ...(offMicrophoneSound ?? '').matchAll(
        /`(window\.skyttelVoiceFixture\.setSound\('remote', (?:true|false)\))`/gu,
      ),
    ].map((match) => match[1]);
    expect(remote).toEqual([
      "window.skyttelVoiceFixture.setSound('remote', true)",
      "window.skyttelVoiceFixture.setSound('remote', false)",
    ]);
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: undefined },
    });
    const events: {
      event: string;
      origin?: string;
      directory?: string;
      householdId?: string;
      message?: string;
      id?: string;
      kind?: string;
    }[] = [];
    let buffer = '';
    let diagnostics = '';
    const unexpectedOutput: string[] = [];
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('{')) events.push(JSON.parse(line));
        else if (line.trim()) unexpectedOutput.push(line);
      }
    });
    child.stderr.on('data', (chunk) => {
      diagnostics += String(chunk);
    });
    try {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(
        viewport,
      );
      await expect.poll(() => events.some(({ event }) => event === 'ready')).toBe(true);
      const ready = events.find(({ event }) => event === 'ready');
      if (!ready?.origin || !ready.directory) throw new Error('Missing public launcher address');
      if (seeded) {
        child.stdin.write('seed-family\n');
        await expect.poll(() => events.some(({ event }) => event === 'seeded')).toBe(true);
      }
      await signIn(page.request, ready.origin);
      const household = seeded
        ? events.find(({ event }) => event === 'seeded')?.householdId
        : (await (await createHousehold(page.request, ready.origin, 'Tryckprov')).json()).household
            .id;
      if (!household) throw new Error('Missing prepared household');
      await page.goto(ready.origin);
      const path = `${ready.origin}/api/households/${household}/map`;
      const before = await (await page.request.get(path)).json();
      expect(before.draft.changes.length > 0).toBe(seeded);
      const history = await (await page.request.get(`${path}/history`)).json();
      await startConversationWithText(page, { remember: true });
      // Execute the moved ROSTFEL/NOT recipes at their documented boundaries.
      await page.reload();
      await openConversationText(page);
      await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Arbetsyta', exact: true })).toHaveAttribute(
        'data-session-active',
        'true',
      );
      const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
      await page.evaluate(playback[0]);
      const playbackAdmission = page.waitForResponse(
        (response) => response.url().endsWith('/voice') && response.request().method() === 'POST',
      );
      await microphoneButton(page).click();
      await expect(notice).toContainText('Webbläsaren stoppade ljudet.');
      const blocked = await page.evaluate<ReturnType<Window['skyttelVoiceFixture']['stats']>>(
        playback[1],
      );
      expect(blocked.microphoneTracks.every((track: { enabled: boolean }) => !track.enabled)).toBe(
        true,
      );
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      await page.evaluate(playback[2]);
      await notice.getByRole('button', { name: 'Starta ljudet', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(notice).toHaveCount(0);
      await expect(microphoneButton(page)).toBeFocused();
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      const playbackResponse = await playbackAdmission;
      expect(playbackResponse.status()).toBe(201);
      const playbackVoice = (await playbackResponse.json()).voice;
      await microphoneButton(page).click();
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      await page.evaluate(remote[0]);
      await expect(voiceBox(page)).toHaveText('Skyttel talar');
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      await page.evaluate(remote[1]);
      await expect(voiceBox(page)).toHaveCount(0);
      const stoppedPlayback = await page.request.post(
        `${playbackResponse.url()}/${playbackVoice.id}/stop`,
        { headers: { origin: ready.origin }, data: {} },
      );
      expect(stoppedPlayback.status()).toBe(200);
      expect((await stoppedPlayback.json()).voice.phase).toBe('closed');
      await page.reload();
      child.stdin.write(`${unavailable}\n`);
      await expect(microphoneButton(page)).toHaveAccessibleDescription(
        /Inte tillgängligt just nu\./,
        { timeout: 10_000 },
      );
      await microphoneButton(page).click();
      await expect(notice).toContainText('Samtal med Skyttel är inte tillgängligt');
      child.stdin.write(`${available}\n`);
      await expect(notice).toHaveCount(0, { timeout: 10_000 });
      await page.evaluate(denied ?? 'throw new Error("Missing denied preparation")');
      await microphoneButton(page).click();
      await expect(notice).toContainText('Webbläsaren tillåter inte mikrofonen.');
      await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).click();
      await page.evaluate(allowed);
      // These are separate documented cases; reset the denied voice attempt
      // before the text task, so its failure is not masked by the old notice.
      await page.reload();
      await openConversationText(page);
      await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Arbetsyta', exact: true })).toHaveAttribute(
        'data-session-active',
        'true',
      );
      const field = page.getByLabel('Meddelande till Skyttel');
      const send = page
        .getByRole('region', { name: 'Skriv till Skyttel', exact: true })
        .getByRole('button', { name: 'Skicka', exact: true });
      await field.fill('Ge ett förslag.');
      await send.click();
      await expect.poll(() => events.filter(({ event }) => event === 'held').length).toBe(1);
      const rejected = events.find(({ event }) => event === 'held')?.id;
      if (!rejected) throw new Error('Missing literal notice request');
      child.stdin.write(`${failed.replace('REQUEST', rejected)}\n`);
      await expect(notice).toContainText('Skyttel kunde inte slutföra uppdraget.');
      await expect(field).toBeFocused();
      await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(microphoneButton(page)).toBeFocused();
      await field.fill('Ett nytt försök.');
      await send.click();
      await expect.poll(() => events.filter(({ event }) => event === 'held').length).toBe(2);
      await expect(notice).toHaveCount(0);
      const recovered = events.filter(({ event }) => event === 'held').at(-1)?.id;
      if (!recovered) throw new Error('Missing literal recovery request');
      child.stdin.write(`${answered.replace('REQUEST', recovered)}\n`);
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        'Ett nytt svar.',
      );
      await closeConversationText(page);
      expect(await (await page.request.get(path)).json()).toEqual(before);
      expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
      expect(diagnostics, 'after literal playback/notice preparation and reset').toBe('');
      expect(events.filter(({ event }) => event === 'held')).toHaveLength(2);
      expect(events.filter(({ event }) => event === 'released')).toHaveLength(4);
      expect(
        events.filter(({ event }) => event === 'released').map(({ kind, id }) => ({ kind, id })),
      ).toEqual([
        { kind: 'available', id: 'off' },
        { kind: 'available', id: 'on' },
        { kind: 'fail', id: rejected },
        { kind: 'reply', id: recovered },
      ]);
      expect(events.filter(({ event }) => event === 'error')).toEqual([]);
      expect(unexpectedOutput).toEqual([]);
      expect(
        events.every(({ event }) => ['ready', 'seeded', 'held', 'released'].includes(event)),
      ).toBe(true);
      expect(diagnostics, 'before literal-proof launcher quit').toBe('');
      child.stdin.write('quit\n');
      await expect.poll(() => child.exitCode).toBe(0);
      expect(events.filter(({ event }) => event === 'closed')).toHaveLength(1);
      expect(events.filter(({ event }) => event === 'error')).toEqual([]);
      expect(unexpectedOutput).toEqual([]);
      expect(
        events.every(({ event }) =>
          ['ready', 'seeded', 'held', 'released', 'closed'].includes(event),
        ),
      ).toBe(true);
      expect(diagnostics, 'after literal-proof launcher quit').toBe('');
      await expect(stat(ready.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => child.once('exit', () => resolve()));
      }
    }
  });
