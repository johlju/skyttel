import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import type { LiveSidebandFactory } from '../../src/server/live-provider.js';
import { liveProvider, voiceAnswerParts } from './live-provider.js';

/** External speech provider with real local WebRTC media and controlled words.
 * The application, source recording, receiver and output renderer stay real. */
export async function evaluationVoiceProvider(
  tailOffsetSeconds = 3,
  options: {
    usefulPartial?: boolean;
    manual?: boolean;
    initialText?: string;
    initialEndMs?: number;
  } = {},
) {
  const server = createServer((_request, response) =>
    response.end('<!doctype html><title>Controlled speech provider</title>'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('voice_provider_address');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}`);
  const live = liveProvider();
  function emitDelegation(sessionId: string, text: string, startMs: number, endMs: number) {
    live.emit(sessionId, {
      type: 'session.input_transcript.delta',
      event_id: randomUUID(),
      delta: text,
      start_ms: startMs,
      end_ms: endMs,
    });
    live.emit(sessionId, {
      type: 'session.delegation.created',
      event_id: randomUUID(),
      offset_ms: endMs,
      delegation: { id: randomUUID(), type: 'delegation', target: 'client' },
    });
  }
  let finalAudioSentAt: number | undefined;
  let outputStarted = false;
  let inputTimer: ReturnType<typeof setTimeout> | undefined;
  let outputTimer: ReturnType<typeof setTimeout> | undefined;
  let words = '';
  let outputStartedAt: number | undefined;
  let resolveOutputStarted!: () => void;
  const outputStartedSignal = new Promise<void>((resolve) => {
    resolveOutputStarted = resolve;
  });
  await page.exposeFunction('outputTailEnded', () => {
    finalAudioSentAt = Date.now();
  });
  const provider: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    const response = await live.provider(url, init);
    const result = await response.json();
    const sdp = await page.evaluate(async (offer: string) => {
      const peer = new RTCPeerConnection();
      const audio = new AudioContext();
      const destination = audio.createMediaStreamDestination();
      const oscillator = audio.createOscillator();
      const silent = audio.createGain();
      silent.gain.value = 0;
      oscillator.connect(silent).connect(destination);
      oscillator.start();
      for (const track of destination.stream.getTracks()) peer.addTrack(track, destination.stream);
      Object.assign(window, { providerVoice: { peer, audio, destination } });
      await peer.setRemoteDescription({ type: 'offer', sdp: offer });
      await peer.setLocalDescription(await peer.createAnswer());
      await audio.resume();
      if (peer.iceGatheringState !== 'complete')
        await new Promise<void>((resolve) => {
          const changed = () => {
            if (peer.iceGatheringState !== 'complete') return;
            peer.removeEventListener('icegatheringstatechange', changed);
            resolve();
          };
          peer.addEventListener('icegatheringstatechange', changed);
          changed();
        });
      return peer.localDescription?.sdp;
    }, body.transport.sdp);
    return Response.json({ ...result, transport: { type: 'webrtc', sdp } });
  };
  const attach: LiveSidebandFactory = (...args) => {
    const sideband = live.attach(...args);
    if (options.manual) return sideband;
    const send = sideband.send.bind(sideband);
    sideband.send = (event) => {
      send(event);
      words += voiceAnswerParts([{ event }]).join('');
      if (words && !outputStarted && !outputTimer) {
        outputTimer = setTimeout(() => {
          outputStarted = true;
          live.emit(args[1], {
            type: 'session.output_transcript.delta',
            event_id: randomUUID(),
            delta: words,
            start_ms: 3000,
            end_ms: 6500,
          });
          void page
            .evaluate(
              ({ tailOffset, usefulPartial }) => {
                const { audio, destination } = (
                  window as unknown as {
                    providerVoice: {
                      audio: AudioContext;
                      destination: MediaStreamAudioDestinationNode;
                    };
                  }
                ).providerVoice;
                const start = audio.currentTime + 0.05;
                for (const [frequency, offset, duration] of [
                  [400, 0, 0.4],
                  ...(usefulPartial ? [[660, 1, 0.5]] : []),
                  [880, tailOffset, 0.5],
                ]) {
                  const source = audio.createOscillator();
                  const gain = audio.createGain();
                  source.frequency.value = frequency;
                  gain.gain.value = 0.15;
                  source.connect(gain).connect(destination);
                  source.start(start + offset);
                  source.stop(start + offset + duration);
                  if (frequency === 880)
                    source.onended = () => {
                      void (
                        window as unknown as { outputTailEnded: () => Promise<void> }
                      ).outputTailEnded();
                    };
                }
              },
              { tailOffset: tailOffsetSeconds, usefulPartial: options.usefulPartial },
            )
            .then(() => {
              outputStartedAt = Date.now();
              resolveOutputStarted();
            });
        }, 30);
      }
    };
    inputTimer = setTimeout(() => {
      emitDelegation(
        args[1],
        options.initialText ?? 'Spara hela utkastet.',
        0,
        options.initialEndMs ?? 2400,
      );
    }, 3000);
    return sideband;
  };
  return {
    provider,
    attach,
    delegate(text: string, startMs = 0, endMs = 2400) {
      const sessionId = live.channels.keys().next().value;
      if (!sessionId) throw new Error('voice_provider_session_missing');
      emitDelegation(sessionId, text, startMs, endMs);
    },
    outputStarted: outputStartedSignal,
    get outputStartedAt() {
      return outputStartedAt;
    },
    get finalAudioSentAt() {
      return finalAudioSentAt;
    },
    async tone(frequency: number, seconds: number) {
      return page.evaluate(
        async ({ frequency, seconds }) => {
          const { audio, destination } = (
            window as unknown as {
              providerVoice: {
                audio: AudioContext;
                destination: MediaStreamAudioDestinationNode;
              };
            }
          ).providerVoice;
          const source = audio.createOscillator();
          const gain = audio.createGain();
          source.frequency.value = frequency;
          gain.gain.value = 0.15;
          source.connect(gain).connect(destination);
          const startedAt = performance.timeOrigin + performance.now();
          await new Promise<void>((resolve) => {
            source.onended = () => resolve();
            source.start();
            source.stop(audio.currentTime + seconds);
          });
          source.disconnect();
          return { startedAt, endedAt: performance.timeOrigin + performance.now() };
        },
        { frequency, seconds },
      );
    },
    async close() {
      clearTimeout(inputTimer);
      clearTimeout(outputTimer);
      await browser.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
