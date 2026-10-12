import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import manifest from './audio/manifest.json' with { type: 'json' };
import type { evaluationEnvironment } from './environment.js';

export type ReferenceVoice = keyof typeof manifest.voices;

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
  return { clip, pcm: pcm.toString('base64') };
}

type BrowserVoice = {
  peer: RTCPeerConnection;
  audio: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  output: HTMLAudioElement;
  channel: RTCDataChannel;
  source?: AudioBufferSourceNode;
  closed: boolean;
};
type EvaluationWindow = Window & { evaluationVoice?: BrowserVoice };

/** Actual WebRTC/Live transport using fixed synthetic audio. No recognition,
 * delegation or model output is substituted; acoustic output is not recorded. */
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
  const page = await context.newPage();
  await page.goto(environment.installation.origin);
  return {
    page,
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
          output.autoplay = true;
          peer.ontrack = (event) => {
            output.srcObject = event.streams[0];
            void output.play();
          };
          const channel = peer.createDataChannel('oai-events');
          (window as EvaluationWindow).evaluationVoice = {
            peer,
            audio,
            destination,
            output,
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
    async play(id: string) {
      const reference = await referenceSpeech(id, undefined, referenceVoice);
      const sent = await page.evaluate(
        async ({ pcm, frames, sampleRate }) => {
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
          const startedAt = Date.now();
          await new Promise<void>((resolve) => {
            source.onended = () => resolve();
            source.start();
          });
          source.disconnect();
          return { startedAt, endedAt: Date.now() };
        },
        {
          pcm: reference.pcm,
          frames: reference.clip.frames,
          sampleRate: reference.clip.sampleRate,
        },
      );
      return { ...sent, frames: reference.clip.frames, sha256: reference.clip.sha256 };
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
    if (voice.channel.readyState === 'open')
      voice.channel.send(JSON.stringify({ type: 'session.close' }));
    voice.source?.stop();
    voice.peer.close();
    voice.output.pause();
    for (const track of voice.destination.stream.getTracks()) track.stop();
    await voice.audio.close();
    delete (window as EvaluationWindow).evaluationVoice;
  });
}
