import { type ExchangeSdp, OpenAILiveWebRTC } from 'openai/live/webrtc';
import type { TranscriptRow } from './ConversationTranscript.js';
import silentPlaybackUrl from './voice-silence.wav?no-inline';

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
    /** Skyttel has taken on a task from what the user said. */
    onDelegation?: () => void;
  },
  playback?: VoicePlayback,
) {
  const audio = playback?.audio ?? new Audio();
  const audioContext = playback?.audioContext ?? new AudioContext();
  const live = new OpenAILiveWebRTC();
  audio.autoplay = true;
  const remoteTracks = new Set<MediaStreamTrack>();
  let microphone: MediaStream | undefined;
  let connected = false;
  let started = false;
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
  const activityTimer = setInterval(() => {
    const next = { microphone: false, speaker: false };
    if (measuring()) {
      for (const { analyser, input } of meters) {
        if (input ? paused : !playing) continue;
        if (input) next.microphone ||= audible(analyser);
        else next.speaker ||= audible(analyser);
      }
    }
    if (next.microphone !== activity.microphone || next.speaker !== activity.speaker) {
      activity = next;
      callbacks.onAudioActivity?.(next);
    }
  }, 100);
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let userRow: TranscriptRow | undefined;
  let assistantRow: TranscriptRow | undefined;
  let userEnd: number | undefined;
  let userAt = 0;
  let assistantSince = false;
  let assistantBoundary = false;
  let assistantAt = 0;
  const turnGap = 2000;
  const audioTime = (value: number) => Number.isFinite(value) && value >= 0;
  function finish(row: TranscriptRow | undefined) {
    if (!row?.partial) return;
    row.partial = false;
    callbacks.onTranscript?.({ ...row });
  }
  function transcript(
    role: TranscriptRow['role'],
    event: { delta: string; start_ms: number; end_ms: number },
  ) {
    if (closed || stopped || !event.delta) return;
    const now = performance.now();
    if (role === 'user') {
      const gap =
        userEnd !== undefined && audioTime(event.start_ms) && event.start_ms >= userEnd
          ? event.start_ms - userEnd
          : now - userAt;
      finish(assistantRow);
      if (!userRow || (assistantSince && gap >= turnGap)) {
        finish(userRow);
        userRow = { id: crypto.randomUUID(), role, text: '' };
        assistantRow = undefined;
      }
      userRow.text += event.delta;
      userRow.partial = true;
      userAt = now;
      userEnd =
        audioTime(event.end_ms) && (!audioTime(event.start_ms) || event.end_ms >= event.start_ms)
          ? event.end_ms
          : undefined;
      assistantSince = false;
      callbacks.onTranscript?.({ ...userRow });
    } else {
      assistantSince = true;
      finish(userRow);
      if (!assistantRow || (assistantBoundary && now - assistantAt >= turnGap)) {
        finish(assistantRow);
        assistantRow = { id: crypto.randomUUID(), role, text: '' };
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
      await audio.play();
      if (!closed && !stopped) {
        playing = true;
        void audioContext.resume().catch(() => {});
        callbacks.onPlaybackBlocked(false);
        ready();
      }
    } catch {
      if (!closed && !stopped) {
        playing = false;
        for (const track of microphone?.getTracks() ?? []) track.enabled = false;
        callbacks.onPlaybackBlocked(true);
      }
    }
  }
  const receiveTrack = (event: RTCTrackEvent) => {
    if (closed || stopped) {
      event.track.stop();
      return;
    }
    remoteTracks.add(event.track);
    meter(new MediaStream([event.track]), false);
    audio.loop = false;
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
    for (const track of microphone?.getTracks() ?? []) track.enabled = !paused;
    callbacks.onReady();
  }
  const connectionChanged = () => {
    if (closed || stopped) return;
    if (live.peerConnection.connectionState === 'disconnected') {
      paused = true;
      for (const track of microphone?.getTracks() ?? []) track.enabled = false;
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
    live.on('session.output_transcript.delta', (event) => transcript('assistant', event)),
    live.on('session.delegation.created', () => {
      assistantBoundary = true;
      finish(assistantRow);
      if (!closed && !stopped) callbacks.onDelegation?.();
    }),
    live.on('session.started', (event) => {
      if (typeof event.session?.id !== 'string' || !event.session.id) return;
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
    finish(userRow);
    finish(assistantRow);
    stopped = true;
    clearInterval(activityTimer);
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
    async connect(
      exchangeSdp: ExchangeSdp,
      signal: AbortSignal,
      retained?: { stream?: MediaStream; paused: boolean },
    ) {
      try {
        paused = retained?.paused ?? false;
        microphone =
          retained?.stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
        if (closed || stopped || signal.aborted) {
          stopCapture();
          throw new DOMException('Voice setup cancelled', 'AbortError');
        }
        for (const track of microphone.getTracks()) {
          track.enabled = false;
          track.addEventListener('ended', microphoneEnded);
          live.peerConnection.addTrack(track, microphone);
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
    setMicrophonePaused(value: boolean) {
      paused = value;
      if (closed || stopped) return;
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
