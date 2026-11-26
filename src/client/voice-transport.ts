import { type ExchangeSdp, OpenAILiveWebRTC } from 'openai/live/webrtc';
import { voiceTranscriptBoundaries, voiceTranscriptGapMs } from '../shared/voice-transcript.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import type { HeldInput } from './voice-held-input.js';
import outputWorkletUrl from './voice-output-worklet.ts?worker&url';
import silentPlaybackUrl from './voice-silence.wav?no-inline';

const outputModules = new WeakMap<AudioContext, Promise<void>>();

/** Unlock the eventual output element and audio meter during the user's start gesture. */
export function prepareVoicePlayback(audio = new Audio(), audioContext = new AudioContext()) {
  // A bundled silent PCM source keeps playback alive until the remote stream arrives.
  // It follows the existing same-origin content policy and requests no microphone.
  audio.src = silentPlaybackUrl;
  audio.loop = true;
  const ready = Promise.all([
    (() => {
      try {
        return Promise.resolve(audioContext.resume()).then(() => audioContext.state === 'running');
      } catch {
        return Promise.resolve(false);
      }
    })(),
    (() => {
      try {
        return Promise.resolve(audio.play()).then(() => true);
      } catch {
        return Promise.resolve(false);
      }
    })(),
  ])
    .then((values) => values[0] && values[1])
    .catch(() => false);
  return {
    audio,
    audioContext,
    ready,
    close() {
      audio.pause();
      audio.removeAttribute('src');
      if (audioContext.state !== 'closed') void audioContext.close().catch(() => {});
    },
  };
}
export type VoicePlayback = ReturnType<typeof prepareVoicePlayback>;

export function createVoiceTransport(
  callbacks: {
    onReady: () => void;
    onMicrophoneReady?: () => void;
    onClosed: () => void;
    onFailure: (reason: 'network' | 'audio' | 'microphone' | 'provider') => void;
    onPlaybackBlocked: (blocked: boolean) => void;
    onDisconnected: (disconnected: boolean) => void;
    onTranscript?: (row: TranscriptRow) => void;
    onAudioActivity?: (activity: { microphone: boolean; speaker: boolean }) => void;
    /** Text aligned with provider output audio; it does not define a complete turn. */
    onOutputTranscript?: (text: string, interval?: { start: number; end: number }) => void;
    needsPlaybackProgress?: () => boolean;
    onPlaybackProgress?: (from: number, at: number, renderedMs: number, speaker: boolean) => void;
    /** Skyttel has taken on a task from what the user said. */
    onDelegation?: () => void;
    inputAllowed?: () => boolean;
  },
  playback?: VoicePlayback,
  buffered?: HeldInput,
) {
  const audio = playback?.audio ?? new Audio();
  const audioContext = playback?.audioContext ?? new AudioContext();
  const live = new OpenAILiveWebRTC();
  audio.autoplay = true;
  const remoteTracks = new Set<MediaStreamTrack>();
  let output: AudioWorkletNode | undefined;
  let muted = false;
  let correctionStarted = false;
  let interruptedThrough = -1;
  let microphone: MediaStream | undefined;
  let connected = false;
  let started = false;
  let timelineOrigin = Number.POSITIVE_INFINITY;
  let stopped = false;
  let playbackTransferred = false;
  let closed = false;
  let paused = false;
  const meters: { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; input: boolean }[] =
    [];
  const samples = new Uint8Array(256);
  let playing = false;
  let activity = { microphone: false, speaker: false };
  function meter(stream: MediaStream, input: boolean) {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = samples.length;
    source.connect(analyser);
    if (!input && output) source.connect(output);
    meters.push({ source, analyser, input });
  }
  const measuring = () =>
    !closed &&
    !stopped &&
    connected &&
    started &&
    live.peerConnection.connectionState === 'connected' &&
    audioContext.state === 'running';
  // The largest deviation from silence in a stream, from 0 to 1.
  function peak(analyser: AnalyserNode) {
    analyser.getByteTimeDomainData(samples);
    let largest = 0;
    for (const value of samples) largest = Math.max(largest, Math.abs(value - 128));
    return Math.min(1, largest / 128);
  }
  const audible = (analyser: AnalyserNode) => peak(analyser) > 3 / 128;
  // Observe only the already-authorized streams. Incoming audio remains
  // independent of the microphone being off, and transcripts never imply playback.
  const meterIntervalMs = 100;
  let receiver: RTCRtpReceiver | undefined;
  let lastPosition:
    | {
        id: string;
        mediaStart: number;
        renderStart: number;
        renderedMs: number;
        at: number;
      }
    | undefined;
  let readingPosition = false;
  const rendering = () =>
    measuring() &&
    playing &&
    !muted &&
    [...remoteTracks].some(
      (track) => track.enabled && !track.muted && track.readyState !== 'ended',
    );

  async function playbackProgress(at: number, sampledMs: number, speaker: boolean) {
    if (!callbacks.needsPlaybackProgress?.() || !callbacks.onPlaybackProgress || !rendering()) {
      lastPosition = undefined;
      return;
    }
    const current = receiver;
    if (!current?.getStats) {
      if (speaker) callbacks.onPlaybackProgress(at - sampledMs, at, sampledMs, true);
      return;
    }
    if (readingPosition) return;
    readingPosition = true;
    const renderTime = audioContext.currentTime;
    try {
      const stats = await current.getStats();
      if (current !== receiver || !rendering()) {
        lastPosition = undefined;
        return;
      }
      for (const report of stats.values()) {
        if (report.type !== 'inbound-rtp' || report.kind !== 'audio') continue;
        const rate = stats.get(report.codecId)?.clockRate;
        // Samples emitted by the jitter buffer include rendered pauses. Exclude
        // concealment generated locally to fill in missing network audio.
        const mediaMs = ((report.jitterBufferEmittedCount - report.concealedSamples) * 1000) / rate;
        if (!(rate > 0 && Number.isFinite(mediaMs))) continue;
        if (!lastPosition || lastPosition.id !== report.id) {
          lastPosition = {
            id: report.id,
            mediaStart: mediaMs,
            renderStart: renderTime,
            renderedMs: 0,
            at,
          };
          return;
        }
        // Both clocks report in blocks. Comparing their positions from one
        // origin preserves frames across uneven meter ticks.
        const renderedMs = Math.min(
          mediaMs - lastPosition.mediaStart,
          (renderTime - lastPosition.renderStart) * 1000,
        );
        const elapsed = renderedMs - lastPosition.renderedMs;
        if (elapsed > 0) callbacks.onPlaybackProgress(lastPosition.at, at, elapsed, speaker);
        lastPosition.at = at;
        lastPosition.renderedMs = Math.max(lastPosition.renderedMs, renderedMs);
        return;
      }
    } catch {
      // Some receivers do not expose playout counters. Only credit audible samples.
    } finally {
      readingPosition = false;
    }
    lastPosition = undefined;
    if (speaker && rendering()) callbacks.onPlaybackProgress(at - sampledMs, at, sampledMs, true);
  }
  let lastSample = performance.now();
  const activityTimer = setInterval(() => {
    const at = performance.now();
    const sampledMs = Math.min(meterIntervalMs, at - lastSample);
    lastSample = at;
    const next = { microphone: false, speaker: false };
    if (measuring()) {
      for (const { analyser, input } of meters) {
        if (input ? paused : !playing) continue;
        if (input) next.microphone ||= audible(analyser);
        else next.speaker ||= !muted && audible(analyser);
      }
    }
    void playbackProgress(at, sampledMs, next.speaker);
    if (next.microphone !== activity.microphone || next.speaker !== activity.speaker) {
      activity = next;
      callbacks.onAudioActivity?.(next);
    }
  }, meterIntervalMs);
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let userRow: TranscriptRow | undefined;
  let assistantRow: TranscriptRow | undefined;
  const transcriptBoundaries = voiceTranscriptBoundaries();
  let userAt = 0;
  let assistantSince = false;
  let assistantBoundary = false;
  let assistantAt = 0;
  const audioTime = (value: number) => Number.isFinite(value) && value >= 0;
  // At receipt, the provider has already reached this position. Keep the
  // earliest inferred origin so delayed events cannot move the cutoff back.
  function observePosition(position: number, receivedAt: number) {
    if (audioTime(position)) timelineOrigin = Math.min(timelineOrigin, receivedAt - position);
  }
  function finish(row: TranscriptRow | undefined) {
    if (!row?.partial) return;
    row.partial = false;
    callbacks.onTranscript?.({ ...row });
  }
  function startCorrection() {
    if (closed || stopped || !muted || correctionStarted) return false;
    correctionStarted = true;
    output?.port.postMessage('correction');
    return true;
  }
  function transcript(
    role: TranscriptRow['role'],
    event: { event_id: string; delta: string; start_ms: number; end_ms: number },
  ) {
    if (closed || stopped || !event.delta) return;
    const now = performance.now();
    if (role === 'user') {
      const correction =
        Boolean(event.delta.trim()) &&
        audioTime(event.start_ms) &&
        audioTime(event.end_ms) &&
        event.end_ms >= event.start_ms &&
        event.end_ms > interruptedThrough &&
        startCorrection();
      const userEnd =
        audioTime(event.end_ms) && (!audioTime(event.start_ms) || event.end_ms >= event.start_ms)
          ? event.end_ms
          : undefined;
      const starts = transcriptBoundaries.append(role, event.start_ms, userEnd, {
        newUtterance: correction,
        fallbackGapMs: assistantSince ? now - userAt : 0,
      });
      finish(assistantRow);
      if (!userRow || starts) {
        finish(userRow);
        userRow = { id: crypto.randomUUID(), role, text: '' };
        assistantRow = undefined;
      }
      userRow.text += event.delta;
      userRow.speechEventIds = [...(userRow.speechEventIds ?? []), event.event_id];
      userRow.partial = true;
      userAt = now;
      if (userEnd !== undefined) observePosition(userEnd, now);
      assistantSince = false;
      callbacks.onTranscript?.({ ...userRow });
    } else {
      // The output fragment can extend beyond what has played.
      observePosition(event.start_ms, now);
      assistantSince = true;
      finish(userRow);
      const assistantEnd = audioTime(event.end_ms) ? event.end_ms : undefined;
      const starts = transcriptBoundaries.append(role, event.start_ms, assistantEnd, {
        newUtterance: assistantBoundary && now - assistantAt >= voiceTranscriptGapMs,
      });
      if (!assistantRow || starts) {
        finish(assistantRow);
        assistantRow = { id: crypto.randomUUID(), role, text: '', voiced: true };
      }
      assistantRow.text += event.delta;
      assistantRow.partial = true;
      assistantBoundary = false;
      assistantAt = now;
      callbacks.onTranscript?.({ ...assistantRow });
    }
  }
  async function playAudio() {
    if (closed || stopped) return;
    try {
      await Promise.all([audio.play(), audioContext.resume()]);
      if (!closed && !stopped) {
        output?.connect(audioContext.destination);
        playing = true;
        buffered?.playbackReady();
        callbacks.onPlaybackBlocked(false);
        ready();
      }
    } catch {
      if (!closed && !stopped) {
        output?.disconnect();
        playing = false;
        for (const track of microphone?.getTracks() ?? []) track.enabled = false;
        buffered?.capture(false);
        callbacks.onPlaybackBlocked(true);
      }
    }
  }
  const receiveTrack = (event: RTCTrackEvent) => {
    if (closed || stopped) {
      event.track.stop();
      return;
    }
    receiver = event.receiver;
    lastPosition = undefined;
    remoteTracks.add(event.track);
    meter(new MediaStream([event.track]), false);
    audio.loop = false;
    // Keep Chromium pulling the WebRTC receiver. The rendering graph owns
    // the only audible path and connects to the speaker once play succeeds.
    audio.muted = true;
    audio.srcObject = new MediaStream([...remoteTracks]);
    void playAudio();
  };
  const audioFailed = () => {
    if (!closed && !stopped) callbacks.onFailure('audio');
  };
  const microphoneEnded = () => {
    if (!closed && !stopped) callbacks.onFailure('microphone');
  };
  live.peerConnection.addEventListener('track', receiveTrack);
  audio.addEventListener('error', audioFailed);
  function ready() {
    if (
      closed ||
      stopped ||
      !connected ||
      !started ||
      live.peerConnection.connectionState !== 'connected'
    )
      return;
    clearTimeout(startupTimer);
    if (!playing) return;
    if (callbacks.inputAllowed?.() === false) {
      paused = true;
      buffered?.capture(false);
      buffered?.transmit(false);
      for (const track of buffered?.outgoing.getTracks() ?? []) track.enabled = false;
      for (const track of microphone?.getTracks() ?? []) track.enabled = false;
      callbacks.onReady();
      return;
    }
    for (const track of microphone?.getTracks() ?? []) track.enabled = !paused;
    if (buffered) {
      buffered.capture(!paused);
      for (const track of buffered.outgoing.getTracks()) track.enabled = true;
      buffered.transmit(true);
    }
    callbacks.onReady();
  }
  const connectionChanged = () => {
    if (closed || stopped) return;
    if (live.peerConnection.connectionState === 'disconnected') {
      paused = true;
      for (const track of microphone?.getTracks() ?? []) track.enabled = false;
      buffered?.capture(false);
      buffered?.transmit(false);
      for (const track of buffered?.outgoing.getTracks() ?? []) track.enabled = false;
      callbacks.onDisconnected(true);
      disconnectTimer ??= setTimeout(() => {
        if (!closed && !stopped) callbacks.onFailure('network');
      }, 3000);
    } else if (live.peerConnection.connectionState === 'connected') {
      clearTimeout(disconnectTimer);
      disconnectTimer = undefined;
      callbacks.onDisconnected(false);
      ready();
    }
  };
  live.peerConnection.addEventListener('connectionstatechange', connectionChanged);
  const subscriptions = [
    live.on('session.input_transcript.delta', (event) => transcript('user', event)),
    live.on('session.output_transcript.delta', (event) => {
      transcript('assistant', event);
      if (!closed && !stopped && event.delta) {
        const interval =
          audioTime(event.start_ms) && audioTime(event.end_ms) && event.end_ms > event.start_ms
            ? { start: event.start_ms, end: event.end_ms }
            : undefined;
        callbacks.onOutputTranscript?.(event.delta, interval);
        if (interval && !lastPosition && receiver?.getStats)
          void playbackProgress(performance.now(), 0, false);
      }
    }),
    live.on('session.delegation.created', (event) => {
      observePosition(event.offset_ms, performance.now());
      assistantBoundary = true;
      finish(assistantRow);
      if (!closed && !stopped) callbacks.onDelegation?.();
    }),
    live.on('session.started', (event) => {
      if (typeof event.session?.id !== 'string' || !event.session.id) return;
      if (!started) observePosition(0, performance.now());
      started = true;
      ready();
    }),
    live.on('session.closed', () => {
      if (!closed && !stopped) callbacks.onClosed();
    }),
    live.on('error', () => {
      if (!closed && !stopped) callbacks.onFailure('provider');
    }),
    live.onConnectionEvent((event) => {
      if (
        !closed &&
        !stopped &&
        (event.type === 'closed' || (event.type === 'error' && event.fatal))
      )
        callbacks.onFailure('network');
    }),
  ];
  function stopCapture() {
    buffered?.close();
    finish(userRow);
    finish(assistantRow);
    stopped = true;
    clearInterval(activityTimer);
    output?.disconnect();
    output?.port.postMessage('close');
    output?.port.close();
    activity = { microphone: false, speaker: false };
    callbacks.onAudioActivity?.(activity);
    for (const { source, analyser } of meters) {
      source.disconnect();
      analyser.disconnect();
    }
    meters.length = 0;
    if (!playbackTransferred && audioContext.state !== 'closed')
      void audioContext.close().catch(() => {});
    clearTimeout(startupTimer);
    clearTimeout(disconnectTimer);
    for (const track of microphone?.getTracks() ?? []) {
      track.removeEventListener('ended', microphoneEnded);
      track.enabled = false;
      track.stop();
    }
    for (const track of remoteTracks) track.stop();
    if (!playbackTransferred) audio.pause();
  }
  function close() {
    if (closed) return;
    closed = true;
    stopCapture();
    for (const unsubscribe of subscriptions) unsubscribe();
    live.peerConnection.removeEventListener('track', receiveTrack);
    live.peerConnection.removeEventListener('connectionstatechange', connectionChanged);
    audio.removeEventListener('error', audioFailed);
    if (!playbackTransferred) {
      audio.srcObject = null;
      audio.removeAttribute('src');
    }
    remoteTracks.clear();
    live.close();
  }
  return {
    prepareTextCorrection() {
      if (!muted || correctionStarted) return undefined;
      const interruption = interruptedThrough;
      return () => {
        if (interruption === interruptedThrough) startCorrection();
      };
    },
    interruptSpeech() {
      // Also check the current samples: the activity display updates at 10 Hz.
      if (!output || !playing || !measuring() || muted) return undefined;
      if (!activity.speaker && !meters.some(({ input, analyser }) => !input && audible(analyser)))
        return undefined;
      muted = true;
      correctionStarted = false;
      interruptedThrough = performance.now() - timelineOrigin;
      output.port.postMessage('interrupt');
      finish(userRow);
      finish(assistantRow);
      userRow = assistantRow = undefined;
      transcriptBoundaries.reset();
      activity = { ...activity, speaker: false };
      callbacks.onAudioActivity?.(activity);
      return { interruptedThroughMs: interruptedThrough };
    },
    suspendInput() {
      paused = true;
      buffered?.capture(false);
      buffered?.transmit(false);
      for (const track of [
        ...(microphone?.getTracks() ?? []),
        ...(buffered?.outgoing.getTracks() ?? []),
      ])
        track.enabled = false;
    },
    /** Preserve already-captured held speech across a context summary handoff. */
    releaseBufferedInput() {
      const input = buffered;
      input?.capture(false);
      input?.transmit(false);
      for (const track of input?.outgoing.getTracks() ?? []) track.enabled = false;
      buffered = undefined;
      return input;
    },
    async connect(
      exchangeSdp: ExchangeSdp,
      signal: AbortSignal,
      retained?: { stream?: MediaStream; paused: boolean },
    ) {
      try {
        paused = retained?.paused ?? false;
        microphone =
          buffered?.stream ??
          retained?.stream ??
          (await navigator.mediaDevices.getUserMedia({ audio: true }));
        if (closed || stopped || signal.aborted) {
          stopCapture();
          throw new DOMException('Voice setup cancelled', 'AbortError');
        }
        let module = outputModules.get(audioContext);
        if (!module) {
          module = audioContext.audioWorklet.addModule(outputWorkletUrl);
          outputModules.set(audioContext, module);
        }
        await module;
        if (closed || stopped || signal.aborted)
          throw new DOMException('Voice setup cancelled', 'AbortError');
        output = new AudioWorkletNode(audioContext, 'skyttel-voice-output', {
          channelCount: 1,
          channelCountMode: 'explicit',
          outputChannelCount: [1],
        });
        output.port.onmessage = ({ data }) => {
          if (data === 'open') muted = false;
        };
        output.onprocessorerror = audioFailed;
        for (const track of microphone.getTracks()) {
          if (!buffered) track.enabled = false;
          track.addEventListener('ended', microphoneEnded);
          if (!buffered) live.peerConnection.addTrack(track, microphone);
        }
        if (buffered) {
          buffered.onFailure(() => callbacks.onFailure('microphone'));
          for (const track of buffered.outgoing.getTracks()) {
            track.enabled = false;
            live.peerConnection.addTrack(track, buffered.outgoing);
          }
          buffered.onDrained(() => {
            if (paused)
              for (const track of buffered?.outgoing.getTracks() ?? []) track.enabled = false;
          });
        }
        meter(microphone, true);
        void audioContext.resume().catch(() => {});
        callbacks.onMicrophoneReady?.();
        startupTimer = setTimeout(() => {
          if (!closed && !stopped) callbacks.onFailure('network');
        }, 30_000);
        await live.connect({ exchangeSdp, signal, timeoutMs: 30_000 });
        connected = true;
        ready();
      } catch (error) {
        close();
        throw error;
      }
    },
    /** Carry the already-unlocked output and running context into a replacement connection. */
    releasePlayback() {
      playbackTransferred = true;
      audio.srcObject = null;
      return prepareVoicePlayback(audio, audioContext);
    },
    // Transfer ownership before closing the old peer. The same authorized
    // stream is attached to a fresh provider session without another permission request.
    releaseMicrophone() {
      const stream = microphone;
      microphone = undefined;
      for (const track of stream?.getTracks() ?? []) {
        track.removeEventListener('ended', microphoneEnded);
        track.enabled = false;
      }
      return stream;
    },
    stopCapture,
    discardPendingInput() {
      paused = true;
      buffered?.discard();
      for (const track of microphone?.getTracks() ?? []) track.enabled = false;
    },
    setMicrophonePaused(value: boolean) {
      paused = value || callbacks.inputAllowed?.() === false;
      if (closed || stopped) return;
      if (buffered) {
        buffered.capture(!paused);
        if (!paused && connected && started && playing) {
          for (const track of buffered.outgoing.getTracks()) track.enabled = true;
          buffered.transmit(true);
        }
        return;
      }
      for (const track of microphone?.getTracks() ?? [])
        track.enabled =
          !paused &&
          playing &&
          connected &&
          started &&
          live.peerConnection.connectionState === 'connected';
    },
    /** The microphone's sound level right now, from 0 to 1. It is 0 while the microphone is off. */
    microphoneLevel() {
      if (paused || !measuring()) return 0;
      let level = 0;
      for (const { analyser, input } of meters) if (input) level = Math.max(level, peak(analyser));
      return level;
    },
    close,
    playAudio,
  };
}

export type VoiceTransport = ReturnType<typeof createVoiceTransport>;
