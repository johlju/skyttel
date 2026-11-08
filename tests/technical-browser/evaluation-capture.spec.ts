import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { evaluationEnvironment } from '../../scripts/model-evaluation/environment.js';
import type { LiveEvaluationProfile } from '../../scripts/model-evaluation/live.js';
import {
  outputRecordingWorklet,
  type PlaybackRecording,
} from '../../scripts/model-evaluation/playback.js';
import profiles from '../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../scripts/model-evaluation/provider.js';
import { speechConnection } from '../../scripts/model-evaluation/speech.js';
import { renderedToneWindows as toneWindows } from '../support/evaluation-rendered-tone.js';
import { evaluationVoiceProvider } from '../support/evaluation-voice-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

test('consecutive captures exclude pending prior audio and retain the new rendered tail', {
  tag: '@technical',
}, async () => {
  const live = await evaluationVoiceProvider(3, { manual: true });
  const applicationRequests: string[] = [];
  let environment: Awaited<ReturnType<typeof evaluationEnvironment>> | undefined;
  let connection: Awaited<ReturnType<typeof speechConnection>> | undefined;
  try {
    environment = await evaluationEnvironment(
      {
        id: 'consecutive-capture',
        title: 'Independent turn recordings',
        voice: true,
        steps: [],
      },
      {
        modelProfile: verifiedProfile('sol-high'),
        modelFetch: textModel(() => [modelMessage('Sparat.')]).provider,
        liveProfile: profiles.profiles.find(
          (profile) => profile.role === 'voice',
        ) as LiveEvaluationProfile,
        liveFetch: live.provider,
        liveSideband: live.attach,
        deliverResponse: (request, response) => {
          const path = new URL(request.url).pathname;
          if (path === '/api/bootstrap' || path.endsWith('/restore'))
            applicationRequests.push(path);
          return path === '/__evaluation_output.js'
            ? new Response(outputRecordingWorklet, {
                headers: { 'Content-Type': 'application/javascript' },
              })
            : response;
        },
      },
    );
    connection = await speechConnection(environment);
    await expect(connection.page).toHaveTitle('Skyttel voice evaluation');
    await connection.start();
    expect(applicationRequests).toEqual([]);
    // Control only browser MessagePort delivery. The PCM itself comes from the
    // actual worklet rendering the original negotiated peer stream. Retain old
    // messages after a snapshot, then deliver them immediately before the next
    // begin reaches the worklet, like a busy main thread with queued messages.
    await connection.page.evaluate(() => {
      const original = MessagePort.prototype.postMessage;
      let captures = 0;
      let holding = false;
      const pending: MessageEvent[] = [];
      let deliver: ((event: MessageEvent) => void) | undefined;
      const evidence = { held: 0, released: 0 };
      Object.assign(window, { captureDeliveryEvidence: evidence });
      MessagePort.prototype.postMessage = function (message: unknown, ...rest: unknown[]) {
        const command = message as { begin?: string };
        if (command.begin) {
          captures++;
          if (captures === 1) {
            const handler = this.onmessage;
            deliver = (event) => handler?.call(this, event);
            this.onmessage = (event) => {
              if (event.data.snapshot) holding = true;
              if (holding && event.data.pcm) {
                pending.push(event);
                evidence.held++;
              } else deliver?.(event);
            };
          } else {
            holding = false;
            for (const event of pending.splice(0)) {
              deliver?.(event);
              evidence.released++;
            }
          }
        }
        return Reflect.apply(original, this, [message, ...rest]);
      };
    });
    const firstInput = await connection.play('spara-hela-utkastet');
    const priorTone = live.tone(400, 0.8);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const prior = await connection.recording();
    const priorToneInterval = await priorTone;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const secondInput = await connection.play('spara-hela-utkastet');
    const finalTone = await live.tone(880, 0.6);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const current = await connection.recording();
    const delivery = await connection.page.evaluate(
      () =>
        (window as unknown as { captureDeliveryEvidence: { held: number; released: number } })
          .captureDeliveryEvidence,
    );
    const path = test.info().outputPath('consecutive-capture-evidence.json');
    await mkdir(dirname(path), { recursive: true });
    const metadata = ({ wav: _wav, ...recording }: PlaybackRecording) => recording;
    await writeFile(
      path,
      JSON.stringify(
        {
          firstInput,
          secondInput,
          finalTone,
          priorTone: priorToneInterval,
          delivery,
          prior: metadata(prior),
          current: metadata(current),
          priorToneWindows: toneWindows(prior, 400),
          staleToneWindows: toneWindows(current, 400),
          finalToneWindows: toneWindows(current, 880),
        },
        null,
        2,
      ),
    );
    await test
      .info()
      .attach('consecutive-capture-evidence', { path, contentType: 'application/json' });
    expect(delivery.held).toBeGreaterThan(1);
    expect(delivery.released).toBe(delivery.held);
    expect(secondInput.startedAt).toBeGreaterThan(firstInput.drainedAt);
    expect(secondInput.startedAt).toBeGreaterThan(priorToneInterval.endedAt);
    expect(current.firstFrame).toBeGreaterThan(prior.firstFrame + prior.frames);
    expect(toneWindows(prior, 400)).toBeGreaterThan(0);
    expect(toneWindows(current, 400)).toBe(0);
    expect(toneWindows(current, 880)).toBeGreaterThanOrEqual(4);
    let lastPcmFrame = -1;
    for (let frame = 0; frame < current.frames; frame++)
      if (Math.abs(current.wav.readInt16LE(44 + frame * 2)) >= 32) lastPcmFrame = frame;
    expect(current.firstFrame + lastPcmFrame).toBe(current.lastActiveFrame);
    expect(current.interruption ?? current.error).toBeUndefined();
  } finally {
    try {
      await connection?.close();
    } finally {
      try {
        await environment?.close();
      } finally {
        await live.close();
      }
    }
  }
});
