import { createHash } from 'node:crypto';

export const voicePlaybackContract = 'voice-rendered-v1';
export const renderedResponseRequirement =
  'Det inspelade talet innehåller hela det nödvändiga slutliga svaret på den aktuella begäran, eller hela en nödvändig följdfråga eller säker oförmåga. Ett mellanbesked, avsikt eller avbruten mening räcker inte. Saknat eller osäkert innehåll ger inconclusive.';
export const renderedUsefulRequirement =
  'Det inspelade talet ger minst ett korrekt, relevant och användbart delresultat för den aktuella begäran, eller en nödvändig konkret följdfråga eller säker oförmåga. Hela uppdraget behöver inte vara slutfört. Enbart status, bekräftelse på mottagen begäran, avsikt, irrelevant innehåll eller obestyrkta framgångsbesked är fail. Osäker användbarhet är inconclusive. Bedöm oberoende av om hela slutliga svaret är färdigt.';
export type ClockSample = { position: number; at: number };
export type TimeInterval = { lower: number; upper: number };
export type PlaybackSnapshot = {
  sampleRate: number;
  firstFrame: number;
  frames: number;
  lastActiveFrame: number | null;
  observedAt: number;
  clocks: ClockSample[];
  interruption?: string;
  error?: string;
};
export type PlaybackRecording = PlaybackSnapshot & {
  wav: Buffer;
  sha256: string;
};
export type PlaybackRecognition = {
  outcome: 'recognized' | 'inconclusive';
  text: string;
  lastWordEndSeconds: number | null;
  alignmentMarginMs: number;
  reason?: string;
  profile: string;
  callId: string;
  costUsd: number | null;
};

/** Bracket an observed media position with actual clock samples. Missing or
 * stalled device clocks cannot become a fabricated completion timestamp. */
export function playbackInterval(samples: ClockSample[], position: number): TimeInterval | null {
  const before = samples.findLast((sample) => sample.position <= position);
  const after = samples.find((sample) => sample.position >= position);
  if (
    !before ||
    !after ||
    !Number.isFinite(position) ||
    !Number.isFinite(before.at) ||
    !Number.isFinite(after.at) ||
    after.at < before.at ||
    after.position < before.position
  )
    return null;
  return { lower: before.at, upper: after.at };
}

export function recordedPlayback(snapshot: PlaybackSnapshot, pcm: Buffer): PlaybackRecording {
  if (
    !Number.isSafeInteger(snapshot.sampleRate) ||
    snapshot.sampleRate <= 0 ||
    !Number.isSafeInteger(snapshot.frames) ||
    snapshot.frames < 0 ||
    !Number.isSafeInteger(snapshot.firstFrame) ||
    snapshot.firstFrame < 0 ||
    (snapshot.lastActiveFrame !== null &&
      (!Number.isSafeInteger(snapshot.lastActiveFrame) ||
        snapshot.lastActiveFrame < snapshot.firstFrame ||
        snapshot.lastActiveFrame >= snapshot.firstFrame + snapshot.frames)) ||
    pcm.length !== snapshot.frames * 2
  )
    throw new Error('evaluation_playback_recording_invalid');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(snapshot.sampleRate, 24);
  header.writeUInt32LE(snapshot.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const wav = Buffer.concat([header, pcm]);
  return { ...snapshot, wav, sha256: createHash('sha256').update(wav).digest('hex') };
}

export function renderedResponseEnd(
  recording: PlaybackRecording,
  recognition: PlaybackRecognition,
): TimeInterval | null {
  if (
    recording.error ||
    recording.interruption ||
    recognition.outcome !== 'recognized' ||
    recognition.lastWordEndSeconds === null ||
    !Number.isFinite(recognition.lastWordEndSeconds) ||
    recognition.lastWordEndSeconds < 0 ||
    recognition.lastWordEndSeconds > recording.frames / recording.sampleRate ||
    recording.lastActiveFrame === null ||
    !Number.isFinite(recognition.alignmentMarginMs) ||
    recognition.alignmentMarginMs < 0
  )
    return null;
  const end = Math.max(
    recording.lastActiveFrame + 1,
    recording.firstFrame +
      Math.ceil(
        (recognition.lastWordEndSeconds + recognition.alignmentMarginMs / 1000) *
          recording.sampleRate,
      ),
  );
  if (end > recording.firstFrame + recording.frames) return null;
  return playbackInterval(recording.clocks, end / recording.sampleRate);
}

/** Pass through the original negotiated output. Recording is bounded and
 * failure stops measurement without replacing or truncating the user's audio. */
export const outputRecordingWorklet = `
registerProcessor('skyttel-evaluation-output', class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capture = false;
    this.first = 0;
    this.frames = 0;
    this.last = null;
    this.buffer = new Int16Array(4096);
    this.used = 0;
    this.port.onmessage = ({ data }) => {
      if (data.begin) {
        this.capture = true;
        this.first = currentFrame;
        this.frames = 0;
        this.last = null;
        this.used = 0;
        this.port.postMessage({ began: data.begin });
      }
      if (data.snapshot) {
        this.flush();
        this.port.postMessage({ snapshot: data.snapshot, firstFrame: this.first,
          frames: this.frames, lastActiveFrame: this.last });
      }
    };
  }
  flush() {
    if (!this.used) return;
    const bytes = this.buffer.slice(0, this.used);
    this.port.postMessage({ pcm: bytes }, [bytes.buffer]);
    this.used = 0;
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    const outgoing = channels?.[0];
    if (!outgoing) return true;
    for (let channel = 0; channel < channels.length; channel++) {
      const incoming = inputs[0]?.[channel];
      if (incoming) channels[channel].set(incoming); else channels[channel].fill(0);
    }
    if (!this.capture) return true;
    if (this.frames + outgoing.length > 12000000) {
      this.capture = false;
      this.flush();
      this.port.postMessage({ error: 'evaluation_playback_recording_limit' });
      return true;
    }
    for (let index = 0; index < outgoing.length; index++) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[index] / channels.length;
      const value = Math.max(-32768, Math.min(32767, Math.round(mixed * 32768)));
      this.buffer[this.used++] = value;
      if (Math.abs(value) >= 32) this.last = currentFrame + index;
      if (this.used === this.buffer.length) this.flush();
    }
    this.frames += outgoing.length;
    return true;
  }
});`;

export const voicePlaybackInstrumentation = {
  contract: voicePlaybackContract,
  source: 'original-negotiated-webrtc-remote-stream',
  output: 'one-web-audio-destination-with-pass-through-pcm-recorder',
  recording: 'mono-downmix-of-all-rendered-output-channels',
  captureBoundary: 'reset-accumulated-pcm-at-ordered-worklet-began-acknowledgement',
  workletSha256: createHash('sha256').update(outputRecordingWorklet).digest('hex'),
  inputEnd: 'unchanged-fixture-last-nonzero-pcm-frame-bracketed-on-browser-clock',
  outputEnd: 'device-clock-bracket-of-observed-recording-end-and-asr-alignment-margin',
  finalRecordingValidation:
    'Resnapshot rendered output after final content judgment and current-state validation. Newly active frames require fresh recognition and semantic assessment; any observed playback interruption or error prevents successful completion.',
  stateObservation: {
    contract: 'checked-state-browser-clock-v2',
    cadenceMs: 25,
    boundary:
      'Earliest still-valid checked state on the browser clock, observed during outer polling and offline recognition/judgment; invalid observations reset it. Serialized polls and checks may exceed the cadence. Final current state is checked before success.',
  },
  semanticRequirements: {
    complete: renderedResponseRequirement,
    useful: renderedUsefulRequirement,
  },
  firstUseful:
    'Conservative rendered end of the first sampled candidate independently verified useful; an upper bound, not word onset. Earlier inconclusive candidates leave firstUsefulMs unknown while firstVerifiedUsefulMs retains the first certified boundary.',
  overhead:
    'Common instrumented renderer replaces native element playout in both versions. Recording, WebAudio buffering, clock sampling and serialized application/state polling during offline assessment can affect latency; their additional overhead is unquantified. State observation uses the same cadence during outer polling and offline work, and retains a conservative observed upper boundary. This is the instrumented user-output path, not an uninstrumented production-latency estimate.',
};
