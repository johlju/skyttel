import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import manifest from './audio/manifest.json' with { type: 'json' };
import type { evaluationEnvironment } from './environment.js';
import {
  type ClockSample,
  type PlaybackSnapshot,
  playbackInterval,
  recordedPlayback,
  type TimeInterval,
} from './playback.js';

export type ReferenceVoice = keyof typeof manifest.voices;
export type SourcePlayback = {
  startedAt: number;
  endedAt: number;
  drainedAt: number;
  started: TimeInterval;
  ended: TimeInterval;
  sourceStartPosition: number;
  speechPosition: number;
  inputClocks: ClockSample[];
  sampleRate: number;
  frames: number;
  speechFrames: number;
  sha256: string;
};

export async function referenceSpeech(
  id: string,
  expectedText?: string,
  voice: ReferenceVoice = 'marin',
) {
  const clips = manifest.voices[voice]?.clips;
  const clip = clips?.[id as keyof typeof clips];
  if (!clip) throw new Error('evaluation_audio_missing');
  const review = 'review' in clip ? clip.review : manifest.review;
  if (review.status !== 'approved') throw new Error('evaluation_audio_unreviewed');
  if (expectedText !== undefined && clip.text !== expectedText)
    throw new Error(`evaluation_audio_reference_mismatch:${id}`);
  const bytes = await readFile(new URL(`./audio/${clip.file}`, import.meta.url));
  if (
    createHash('sha256').update(bytes).digest('hex') !== clip.sha256 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('evaluation_audio_checksum_failed');
  let pcm: Buffer | undefined;
  let format = false;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error('evaluation_audio_truncated');
    if (kind === 'fmt ')
      format =
        size >= 16 &&
        bytes.readUInt16LE(offset + 8) === 1 &&
        bytes.readUInt16LE(offset + 10) === 1 &&
        bytes.readUInt32LE(offset + 12) === clip.sampleRate &&
        bytes.readUInt32LE(offset + 16) === clip.sampleRate * 2 &&
        bytes.readUInt16LE(offset + 20) === 2 &&
        bytes.readUInt16LE(offset + 22) === 16;
    if (kind === 'data') pcm = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!format || !pcm || pcm.length !== clip.frames * 2)
    throw new Error('evaluation_audio_format_failed');
  let speechFrames = clip.frames;
  while (speechFrames > 0 && pcm.readInt16LE((speechFrames - 1) * 2) === 0) speechFrames--;
  if (!speechFrames) throw new Error('evaluation_audio_empty');
  return { clip, pcm: pcm.toString('base64'), speechFrames };
}

type BrowserVoice = {
  peer: RTCPeerConnection;
  audio: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  output: HTMLAudioElement;
  render: AudioContext;
  recorder: AudioWorkletNode;
  gain: GainNode;
  chunks: Uint8Array[];
  clocks: ClockSample[];
  inputClocks: ClockSample[];
  timer: ReturnType<typeof setInterval>;
  requests: Map<string, (value: Record<string, unknown>) => void>;
  lastSnapshot?: Record<string, unknown>;
  interruption?: string;
  error?: string;
  channel: RTCDataChannel;
  source?: AudioBufferSourceNode;
  closed: boolean;
};
type EvaluationWindow = Window & { evaluationVoice?: BrowserVoice };

/** The negotiated remote stream has one output destination. The common
 * evaluator instrumentation records that destination, never a parallel player.
 * The retained element supplies volume/mute controls; pause/resume is explicit
 * because Chromium cannot record this RTC element with MediaElementAudioSource. */
export async function speechConnection(
  environment: Awaited<ReturnType<typeof evaluationEnvironment>>,
  referenceVoice: ReferenceVoice = 'marin',
) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    storageState: await environment.client.storageState(),
  });
  // tsx preserves nested function names with esbuild's __name helper. Playwright
  // serializes callbacks without their module closure, so the evaluator-owned
  // document needs the same helper when launched outside Playwright's compiler.
  await context.addInitScript({
    content:
      'globalThis.__name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });',
  });
  const page = await context.newPage();
  // The evaluator owns this renderer. Loading the application would restore
  // and pause the conversation that the evaluator has already opened.
  const documentUrl = new URL('/__evaluation_voice', environment.installation.origin).href;
  await page.route(documentUrl, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Skyttel voice evaluation</title>',
    }),
  );
  await page.goto(documentUrl);
  return {
    page,
    observedAt: () => page.evaluate(() => performance.timeOrigin + performance.now()),
    async start() {
      const view = await environment.get<
        import('../../src/shared/text-assistant.js').TextAssistantView
      >(environment.path);
      const voice = await page.evaluate(
        async ({ path, revision, draftVersion, contentVersion }) => {
          const peer = new RTCPeerConnection();
          const audio = new AudioContext();
          const destination = audio.createMediaStreamDestination();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          gain.gain.value = 0;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          for (const track of destination.stream.getTracks())
            peer.addTrack(track, destination.stream);
          const output = document.createElement('audio');
          output.autoplay = false;
          const render = new AudioContext();
          await render.audioWorklet.addModule('/__evaluation_output.js');
          const recorder = new AudioWorkletNode(render, 'skyttel-evaluation-output');
          const outputGain = render.createGain();
          outputGain.connect(recorder).connect(render.destination);
          const chunks: Uint8Array[] = [];
          const clocks: ClockSample[] = [];
          const inputClocks: ClockSample[] = [];
          const requests = new Map<string, (value: Record<string, unknown>) => void>();
          recorder.port.onmessage = ({ data }) => {
            const voice = (window as EvaluationWindow).evaluationVoice;
            // The port orders prior-capture PCM before this acknowledgement.
            // Reset at that boundary, after queued old blocks are delivered.
            if (data.began) {
              chunks.length = 0;
              if (voice) voice.lastSnapshot = undefined;
            }
            if (data.pcm) chunks.push(new Uint8Array(data.pcm.buffer));
            if (data.error && voice) voice.error = data.error;
            if (data.snapshot && voice) voice.lastSnapshot = data;
            const key = data.began ?? data.snapshot;
            if (key) {
              requests.get(key)?.(data);
              requests.delete(key);
            }
          };
          recorder.onprocessorerror = () => {
            const voice = (window as EvaluationWindow).evaluationVoice;
            if (voice) voice.error = 'evaluation_output_processor_error';
          };
          peer.ontrack = (event) => {
            if (event.track.kind !== 'audio' || output.srcObject) return;
            output.srcObject = event.streams[0];
            render.createMediaStreamSource(event.streams[0]).connect(outputGain);
            event.track.addEventListener('ended', () => {
              const voice = (window as EvaluationWindow).evaluationVoice;
              if (voice) voice.interruption = 'evaluation_output_track_ended';
            });
          };
          peer.onconnectionstatechange = () => {
            const voice = (window as EvaluationWindow).evaluationVoice;
            if (
              voice &&
              !voice.closed &&
              ['failed', 'disconnected', 'closed'].includes(peer.connectionState)
            )
              voice.error = 'evaluation_output_transport_failed';
          };
          output.onvolumechange = () => {
            outputGain.gain.value = output.muted ? 0 : output.volume;
            const voice = (window as EvaluationWindow).evaluationVoice;
            if (voice && (output.muted || output.volume < 1))
              voice.interruption = 'evaluation_output_attenuated';
          };
          output.onerror = () => {
            const voice = (window as EvaluationWindow).evaluationVoice;
            if (voice) voice.error = 'evaluation_output_error';
          };
          const sample = () => {
            const timestamp = render.getOutputTimestamp();
            if (timestamp.contextTime && timestamp.performanceTime)
              clocks.push({
                position: timestamp.contextTime,
                at: performance.timeOrigin + timestamp.performanceTime,
              });
            inputClocks.push({
              position: audio.currentTime,
              at: performance.timeOrigin + performance.now(),
            });
          };
          const timer = setInterval(sample, 20);
          sample();
          const channel = peer.createDataChannel('oai-events');
          (window as EvaluationWindow).evaluationVoice = {
            peer,
            audio,
            destination,
            output,
            render,
            recorder,
            gain: outputGain,
            chunks,
            clocks,
            inputClocks,
            timer,
            requests,
            channel,
            closed: false,
          };
          const deadline = new Promise<never>((_resolve, reject) =>
            setTimeout(() => reject(new Error('evaluation_voice_start_timeout')), 30_000),
          );
          return Promise.race([
            deadline,
            (async () => {
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              const response = await fetch(`${path}/voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdp: offer.sdp, revision, draftVersion, contentVersion }),
              });
              if (!response.ok) throw new Error(`evaluation_voice_start_${response.status}`);
              const result = await response.json();
              await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
              await audio.resume();
              await render.resume();
              while (peer.connectionState !== 'connected') {
                if (['failed', 'closed'].includes(peer.connectionState))
                  throw new Error('evaluation_voice_connection_failed');
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
              return result.voice.id as string;
            })(),
          ]);
        },
        {
          path: new URL(`${environment.base}/${environment.path}`).pathname,
          revision: view.revision,
          draftVersion: view.review.version,
          contentVersion: view.review.contentVersion,
        },
      );
      return voice;
    },
    async play(id: string): Promise<SourcePlayback> {
      const reference = await referenceSpeech(id, undefined, referenceVoice);
      const sent = await page.evaluate(
        async ({ pcm, frames, sampleRate, speechFrames }) => {
          const voice = (window as EvaluationWindow).evaluationVoice;
          if (!voice || voice.closed) throw new Error('evaluation_voice_not_connected');
          const bytes = Uint8Array.from(atob(pcm), (char) => char.charCodeAt(0));
          const values = new DataView(bytes.buffer);
          const buffer = voice.audio.createBuffer(1, frames, sampleRate);
          const floats = buffer.getChannelData(0);
          for (let index = 0; index < frames; index++)
            floats[index] = values.getInt16(index * 2, true) / 32768;
          const source = voice.audio.createBufferSource();
          source.buffer = buffer;
          source.connect(voice.destination);
          voice.source = source;
          const begin = crypto.randomUUID();
          await new Promise((resolve) => {
            voice.requests.set(begin, resolve);
            voice.recorder.port.postMessage({ begin });
          });
          const position = voice.audio.currentTime + 0.05;
          const startedAt = performance.timeOrigin + performance.now() + 50;
          await new Promise<void>((resolve) => {
            source.onended = () => resolve();
            source.start(position);
          });
          source.disconnect();
          if (voice.closed || voice.audio.state !== 'running')
            throw new Error('evaluation_input_playback_interrupted');
          const drainedAt = performance.timeOrigin + performance.now();
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {
            startedAt,
            drainedAt,
            sourceStartPosition: position,
            speechPosition: position + speechFrames / sampleRate,
            inputClocks: voice.inputClocks.filter(
              (sample) =>
                sample.position >= position - 0.1 &&
                sample.position <= position + frames / sampleRate + 0.1,
            ),
          };
        },
        {
          pcm: reference.pcm,
          frames: reference.clip.frames,
          sampleRate: reference.clip.sampleRate,
          speechFrames: reference.speechFrames,
        },
      );
      const ended = playbackInterval(sent.inputClocks, sent.speechPosition);
      const started = playbackInterval(sent.inputClocks, sent.sourceStartPosition);
      if (!ended || !started) throw new Error('evaluation_input_clock_unverified');
      return {
        ...sent,
        startedAt: started.upper,
        started,
        endedAt: ended.upper,
        ended,
        frames: reference.clip.frames,
        sampleRate: reference.clip.sampleRate,
        speechFrames: reference.speechFrames,
        sha256: reference.clip.sha256,
      };
    },
    async recording() {
      const result = await page.evaluate(async () => {
        const voice = (window as EvaluationWindow).evaluationVoice;
        if (!voice || voice.closed) throw new Error('evaluation_voice_not_connected');
        const id = crypto.randomUUID();
        const snapshot =
          voice.render.state !== 'running' || voice.error
            ? voice.lastSnapshot
            : await new Promise<Record<string, unknown>>((resolve) => {
                voice.requests.set(id, resolve);
                voice.recorder.port.postMessage({ snapshot: id });
              });
        if (!snapshot)
          throw new Error(voice.error ?? voice.interruption ?? 'evaluation_output_not_running');
        const length = voice.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of voice.chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        let pcm = '';
        for (const byte of bytes.subarray(0, Number(snapshot.frames) * 2))
          pcm += String.fromCharCode(byte);
        return {
          snapshot: {
            ...snapshot,
            sampleRate: voice.render.sampleRate,
            clocks: voice.clocks,
            observedAt: performance.timeOrigin + performance.now(),
            interruption: voice.interruption,
            error: voice.error,
          },
          pcm: btoa(pcm),
        };
      });
      return recordedPlayback(
        result.snapshot as PlaybackSnapshot,
        Buffer.from(result.pcm, 'base64'),
      );
    },
    async control(action: 'pause' | 'resume' | 'mute' | 'interrupt' | 'error') {
      await page.evaluate(async (action) => {
        const voice = (window as EvaluationWindow).evaluationVoice;
        if (!voice) throw new Error('evaluation_voice_not_connected');
        if (voice.render.state === 'running') {
          const snapshot = crypto.randomUUID();
          await new Promise((resolve) => {
            voice.requests.set(snapshot, resolve);
            voice.recorder.port.postMessage({ snapshot });
          });
        }
        if (action === 'resume') await voice.render.resume();
        else if (action === 'pause') {
          voice.interruption = 'evaluation_output_paused';
          await voice.render.suspend();
        } else if (action === 'mute') voice.output.muted = true;
        else if (action === 'interrupt') {
          voice.interruption = 'evaluation_output_interrupted';
          voice.gain.gain.value = 0;
        } else {
          voice.error = 'evaluation_output_error';
          voice.gain.disconnect();
        }
      }, action);
    },
    async retire() {
      await retire(page);
    },
    async close() {
      try {
        await retire(page);
      } finally {
        await browser.close();
      }
    },
  };
}
async function retire(page: Page) {
  if (page.isClosed()) return;
  await page.evaluate(async () => {
    const voice = (window as EvaluationWindow).evaluationVoice;
    if (!voice) return;
    voice.closed = true;
    clearInterval(voice.timer);
    if (voice.channel.readyState === 'open')
      voice.channel.send(JSON.stringify({ type: 'session.close' }));
    voice.source?.stop();
    voice.peer.close();
    voice.output.pause();
    for (const track of voice.destination.stream.getTracks()) track.stop();
    await voice.audio.close();
    await voice.render.close();
    delete (window as EvaluationWindow).evaluationVoice;
  });
}
