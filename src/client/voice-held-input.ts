import inputWorkletUrl from './voice-input-worklet.ts?worker&url';
import type { VoicePlayback } from './voice-transport.js';

const modules = new WeakMap<AudioContext, Promise<void>>();

/** Preload the worklet during the press, before the long-press threshold. */
export function prepareHeldInput(playback: VoicePlayback) {
  let module = modules.get(playback.audioContext);
  if (!module) {
    module = playback.audioContext.audioWorklet.addModule(inputWorkletUrl);
    modules.set(playback.audioContext, module);
  }
  return module;
}

/** Capture locally after consent and working playback, then transmit in order at real time. */
export async function createHeldInput(playback: VoicePlayback, signal: AbortSignal) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tracks = stream.getTracks();
  for (const track of tracks) track.enabled = false;
  let dispose: () => void = () => undefined;
  try {
    await prepareHeldInput(playback);
    if (signal.aborted) throw new DOMException('Held input cancelled', 'AbortError');
    const context = playback.audioContext;
    const source = context.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(context, 'skyttel-held-input', {
      channelCount: 1,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const destination = context.createMediaStreamDestination();
    source.connect(processor).connect(destination);
    let capture = false;
    let canPlay = false;
    let closed = false;
    let onDrained: () => void = () => undefined;
    let onFailure: () => void = () => undefined;
    processor.port.onmessage = ({
      data,
    }: MessageEvent<{ drained?: boolean; failed?: boolean }>) => {
      if (data.drained) onDrained();
      if (data.failed) onFailure();
    };
    processor.onprocessorerror = () => onFailure();
    const close = () => {
      if (closed) return;
      closed = true;
      source.disconnect();
      processor.disconnect();
      processor.port.close();
      for (const track of destination.stream.getTracks()) track.stop();
      signal.removeEventListener('abort', cancelled);
    };
    const cancelled = () => {
      close();
      for (const track of tracks) track.stop();
    };
    dispose = cancelled;
    signal.addEventListener('abort', cancelled, { once: true });
    canPlay = await Promise.race([
      playback.ready,
      new Promise<false>((resolve) => {
        if (signal.aborted) resolve(false);
        else signal.addEventListener('abort', () => resolve(false), { once: true });
      }),
    ]);
    if (signal.aborted) {
      close();
      throw new DOMException('Held input cancelled', 'AbortError');
    }
    return {
      stream,
      outgoing: destination.stream,
      get ready() {
        return canPlay;
      },
      capture(value: boolean) {
        capture = value;
        for (const track of tracks) track.enabled = value && canPlay && !closed;
        processor.port.postMessage({ capture: value && canPlay && !closed });
      },
      playbackReady() {
        canPlay = true;
        for (const track of tracks) track.enabled = capture && !closed;
        processor.port.postMessage({ capture: capture && !closed });
      },
      transmit(value: boolean) {
        processor.port.postMessage({ transmit: value });
      },
      discard() {
        capture = false;
        for (const track of [...tracks, ...destination.stream.getTracks()]) track.enabled = false;
        processor.port.postMessage({ capture: false, transmit: false, discard: true });
      },
      onDrained(callback: () => void) {
        onDrained = callback;
      },
      onFailure(callback: () => void) {
        onFailure = callback;
      },
      close,
    };
  } catch (error) {
    dispose();
    for (const track of tracks) track.stop();
    throw error;
  }
}
export type HeldInput = Awaited<ReturnType<typeof createHeldInput>>;
