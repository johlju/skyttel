import { afterEach, expect, test, vi } from 'vitest';
import { createHeldInput } from '../../../src/client/voice-held-input.js';
import type { VoicePlayback } from '../../../src/client/voice-transport.js';
import { voiceMedia } from '../../support/voice-media.js';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('held input records only after playback permission, release stops recording while delivery stays available', async () => {
  const media = voiceMedia();
  const controller = new AbortController();
  const playback = {
    audioContext: media.context,
    ready: Promise.resolve(false),
  } as unknown as VoicePlayback;
  const input = await createHeldInput(playback, controller.signal);
  expect(input.ready).toBe(false);
  input.capture(true);
  expect(media.microphone.enabled).toBe(false);
  input.playbackReady();
  expect(media.microphone.enabled).toBe(true);
  input.capture(false);
  input.transmit(true);
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.stopped).toBe(false);
  const drained = vi.fn();
  input.onDrained(drained);
  media.processors[0].port.onmessage(new MessageEvent('message', { data: { drained: true } }));
  expect(drained).toHaveBeenCalledOnce();
  controller.abort();
  expect(media.microphone.stopped).toBe(true);
  expect(media.outgoing.stopped).toBe(true);
  input.playbackReady();
  input.capture(true);
  expect(media.microphone.enabled).toBe(false);
});

test.each(['permission', 'processor', 'playback'] as const)(
  'cancellation while awaiting %s releases late microphone input without allowing capture',
  async (stage) => {
    const media = voiceMedia();
    let release = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (stage === 'permission')
      media.getUserMedia.mockImplementationOnce(async () => {
        await waiting;
        return media.stream;
      });
    if (stage === 'processor') media.addModule.mockReturnValueOnce(waiting);
    const controller = new AbortController();
    const playback = {
      audioContext: media.context,
      ready: stage === 'playback' ? waiting.then(() => true) : Promise.resolve(true),
    } as unknown as VoicePlayback;
    const pending = createHeldInput(playback, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    release();
    await rejected;
    expect(media.microphone.stopped).toBe(true);
    expect(media.microphone.enabled).toBe(false);
    if (stage === 'playback') expect(media.outgoing.stopped).toBe(true);
  },
);

test('discarded speech is silenced immediately, and hardware failure is reported without retaining the microphone', async () => {
  const media = voiceMedia();
  const controller = new AbortController();
  const input = await createHeldInput(
    { audioContext: media.context, ready: Promise.resolve(true) } as unknown as VoicePlayback,
    controller.signal,
  );
  input.capture(true);
  expect(media.microphone.enabled).toBe(true);
  input.discard();
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.enabled).toBe(false);
  const failed = vi.fn(() => controller.abort());
  input.onFailure(failed);
  media.processors[0].onprocessorerror();
  expect(failed).toHaveBeenCalledOnce();
  expect(media.microphone.stopped).toBe(true);
  expect(media.outgoing.stopped).toBe(true);
  input.close();
  expect(media.source.disconnected).toBe(true);
});

test('an unavailable audio processor stops the granted microphone before rejecting startup', async () => {
  const media = voiceMedia();
  media.addModule.mockRejectedValueOnce(new Error('processor unavailable'));
  await expect(
    createHeldInput(
      { audioContext: media.context, ready: Promise.resolve(true) } as unknown as VoicePlayback,
      new AbortController().signal,
    ),
  ).rejects.toThrow('processor unavailable');
  expect(media.microphone.stopped).toBe(true);
  expect(media.microphone.enabled).toBe(false);
  expect(media.processors).toHaveLength(0);
});
