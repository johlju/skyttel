import { type ExchangeSdp, OpenAILiveWebRTC } from 'openai/live/webrtc';
import type { TranscriptRow } from './ConversationTranscript.js';

export function createVoiceTransport(callbacks: {
  onReady: () => void;
  onClosed: () => void;
  onFailure: (reason: 'network' | 'audio' | 'microphone' | 'provider') => void;
  onPlaybackBlocked: (blocked: boolean) => void;
  onDisconnected: (disconnected: boolean) => void;
  onTranscript?: (row: TranscriptRow) => void;
}) {
  const live = new OpenAILiveWebRTC();
  const audio = new Audio();
  audio.autoplay = true;
  const remoteTracks = new Set<MediaStreamTrack>();
  let microphone: MediaStream | undefined;
  let connected = false;
  let started = false;
  let stopped = false;
  let closed = false;
  let paused = false;
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
      if (!closed && !stopped) callbacks.onPlaybackBlocked(false);
    } catch {
      if (!closed && !stopped) callbacks.onPlaybackBlocked(true);
    }
  }
  const receiveTrack = (event: RTCTrackEvent) => {
    if (closed || stopped) {
      event.track.stop();
      return;
    }
    remoteTracks.add(event.track);
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
    for (const track of microphone?.getTracks() ?? []) track.enabled = !paused;
    callbacks.onReady();
  }
  const connectionChanged = () => {
    if (closed || stopped) return;
    if (live.peerConnection.connectionState === 'disconnected') {
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
    clearTimeout(startupTimer);
    clearTimeout(disconnectTimer);
    for (const track of microphone?.getTracks() ?? []) {
      track.removeEventListener('ended', microphoneEnded);
      track.enabled = false;
      track.stop();
    }
    for (const track of remoteTracks) track.stop();
    audio.pause();
  }
  function close() {
    if (closed) return;
    closed = true;
    stopCapture();
    for (const unsubscribe of subscriptions) unsubscribe();
    live.peerConnection.removeEventListener('track', receiveTrack);
    live.peerConnection.removeEventListener('connectionstatechange', connectionChanged);
    audio.removeEventListener('error', audioFailed);
    audio.srcObject = null;
    remoteTracks.clear();
    live.close();
  }
  return {
    async connect(exchangeSdp: ExchangeSdp, signal: AbortSignal) {
      try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (closed || stopped || signal.aborted) {
          stopCapture();
          throw new DOMException('Voice setup cancelled', 'AbortError');
        }
        for (const track of microphone.getTracks()) {
          track.enabled = false;
          track.addEventListener('ended', microphoneEnded);
          live.peerConnection.addTrack(track, microphone);
        }
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
    stopCapture,
    setMicrophonePaused(value: boolean) {
      paused = value;
      if (closed || stopped) return;
      for (const track of microphone?.getTracks() ?? [])
        track.enabled =
          !paused && connected && started && live.peerConnection.connectionState === 'connected';
    },
    close,
    playAudio,
  };
}

export type VoiceTransport = ReturnType<typeof createVoiceTransport>;
