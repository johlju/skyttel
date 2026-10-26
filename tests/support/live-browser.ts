// External browser media/WebRTC substitute for the actual Live SDK. This source
// can run before the unchanged application bundle in a disposable fixture.
// It never requests hardware microphone access or contacts a voice provider.
export const liveBrowserFixtureSource = `
(() => {
  const peers = [];
  const microphoneTracks = [];
  const remoteTracks = [];
  const audioElements = new Set();
  let microphone = 'allow';
  let microphoneRequests = 0;
  let playback = 'allow';
  let autoStart = true;
  let releaseMicrophone;
  const signals = new Map();
  const sentAudio = [];
  const captureChanges = [];
  const microphoneWave = new Float32Array(2048);
  const timeline = [];
  let droppedEvents = 0;
  let pendingMicrophone = 0;
  const record = (event, context) => {
    if (timeline.length === 128) { timeline.shift(); droppedEvents++; }
    timeline.push({
      event, browserPerformanceMs: performance.now(), browserDateMs: Date.now(),
      audioContextSeconds: context?.currentTime ?? null,
      audioState: context?.state ?? null, pendingMicrophone
    });
  };

  function silentStream(tracks) {
    const context = new AudioContext();
    record('audio-created', context);
    context.addEventListener('statechange', () => record('audio-state', context));
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    signals.set(tracks, { context, gain, oscillator, stream: destination.stream });
    for (const track of destination.stream.getTracks()) {
      tracks.push(track);
      if (tracks === microphoneTracks) {
        const enabled = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'enabled');
        Object.defineProperty(track, 'enabled', {
          get: () => enabled.get.call(track),
          set: value => {
            enabled.set.call(track, value);
            captureChanges.push({ enabled: value, at: performance.now() });
          }
        });
      }
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        record('track-stopped', context);
        if (context.state !== 'closed') void context.close();
      };
    }
    return destination.stream;
  }

  class Channel extends EventTarget {
    readyState = 'connecting';
    send() {
      if (this.readyState !== 'open') throw new Error('Synthetic closed data channel');
    }
    close() {
      if (this.readyState === 'closed') return;
      this.readyState = 'closed';
      this.dispatchEvent(new Event('close'));
    }
    emit(event) {
      if (this.readyState === 'open')
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
    }
  }

  class Peer extends EventTarget {
    connectionState = 'new';
    localDescription = null;
    channel = new Channel();
    remote = null;
    meters = [];
    constructor() { super(); peers.push(this); }
    createDataChannel() { return this.channel; }
    addTrack(track, stream) {
      // Observe the exact outgoing WebRTC media stream. This is not the
      // hardware/source track or a request-count proxy for delivered sound.
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const wave = new Float32Array(analyser.fftSize);
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const timer = setInterval(() => {
        if (!track.enabled) return;
        analyser.getFloatTimeDomainData(wave);
        const peak = Math.max(...wave.map(Math.abs));
        if (peak < 0.04) return;
        analyser.getFloatFrequencyData(spectrum);
        let bin = 0;
        for (let i = 1; i < spectrum.length; i++) if (spectrum[i] > spectrum[bin]) bin = i;
        sentAudio.push({ peak, frequency: bin * context.sampleRate / analyser.fftSize, at: performance.now() });
      }, 10);
      this.meters.push({ context, source, timer });
      void context.resume();
      return {};
    }
    async createOffer() { return { type: 'offer', sdp: 'synthetic-browser-offer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription() {
      this.change('connected');
      this.channel.readyState = 'open';
      this.channel.dispatchEvent(new Event('open'));
      record('channel-open');
      setTimeout(() => {
        if (this.connectionState !== 'connected') return;
        this.remoteTrack();
        if (autoStart) this.started();
      }, 0);
    }
    change(state) {
      this.connectionState = state;
      this.dispatchEvent(new Event('connectionstatechange'));
    }
    started() {
      this.channel.emit({
        type: 'session.started', event_id: crypto.randomUUID(),
        session: { id: 'synthetic-live', model: 'gpt-live-1', status: 'active' }
      });
    }
    remoteTrack() {
      if (this.remote) return;
      this.remote = silentStream(remoteTracks);
      const event = new Event('track');
      Object.assign(event, { track: this.remote.getTracks()[0], streams: [this.remote] });
      this.dispatchEvent(event);
    }
    close() {
      if (this.connectionState === 'closed') return;
      this.change('closed');
      this.channel.close();
      record('peer-closed');
      for (const meter of this.meters) {
        clearInterval(meter.timer);
        meter.source.disconnect();
        void meter.context.close();
      }
      for (const track of this.remote?.getTracks() ?? []) track.stop();
    }
  }

  window.RTCPeerConnection = Peer;
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true,
    value: async () => {
      microphoneRequests++;
      record('microphone-request');
      if (microphone === 'deny') throw new DOMException('Synthetic denied microphone', 'NotAllowedError');
      if (microphone === 'busy') throw new DOMException('Synthetic busy microphone', 'NotReadableError');
      if (microphone === 'error') throw new DOMException('Synthetic missing microphone', 'NotFoundError');
      if (microphone === 'hold') {
        pendingMicrophone++;
        record('microphone-held');
        await new Promise(resolve => { releaseMicrophone = resolve; });
        pendingMicrophone--;
        record('microphone-released');
      }
      const stream = silentStream(microphoneTracks);
      record('microphone-ready', signals.get(microphoneTracks).context);
      return stream;
    }
  });
  HTMLMediaElement.prototype.play = function () {
    audioElements.add(this);
    if (playback === 'blocked') return Promise.reject(new DOMException('Synthetic autoplay block', 'NotAllowedError'));
    if (playback === 'error') return Promise.reject(new DOMException('Synthetic output failure', 'NotSupportedError'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function () { audioElements.delete(this); };
  const latest = () => peers.at(-1);
  window.skyttelVoiceFixture = {
    emit: (event) => latest()?.channel.emit(event),
    started: () => latest()?.started(),
    disconnect: () => latest()?.change('disconnected'),
    reconnect: () => latest()?.change('connected'),
    fail: () => latest()?.change('failed'),
    close: () => latest()?.close(),
    remoteTrack: () => latest()?.remoteTrack(),
    audioError: () => { for (const element of audioElements) element.dispatchEvent(new Event('error')); },
    setMicrophone: (value) => { microphone = value; },
    releaseMicrophone: () => releaseMicrophone?.(),
    setPlayback: (value) => { playback = value; },
    setAutoStart: (value) => { autoStart = value; },
    sentAudio: () => sentAudio,
    captureChanges: () => captureChanges,
    microphoneLevel: () => {
      const signal = signals.get(microphoneTracks);
      if (!signal) return 0;
      if (!signal.analyser) {
        // Observe rendered source audio separately from the enabled property.
        // The media graph can still contain earlier frames after a UI update.
        const source = signal.context.createMediaStreamSource(signal.stream);
        signal.analyser = signal.context.createAnalyser();
        signal.analyser.fftSize = microphoneWave.length;
        source.connect(signal.analyser);
      }
      signal.analyser.getFloatTimeDomainData(microphoneWave);
      return Math.max(...microphoneWave.map(Math.abs));
    },
    setMicrophoneTone: (frequency) => {
      const signal = signals.get(microphoneTracks);
      signal.oscillator.frequency.value = frequency;
      signal.gain.gain.value = 0.2;
      void signal.context.resume();
    },
    setSound: (source, active, level = 0.2) => {
      const signal = signals.get(source === 'microphone' ? microphoneTracks : remoteTracks);
      if (!signal) throw new Error('Missing media signal');
      signal.gain.gain.value = active ? level : 0;
      record(active ? 'sound-start-requested' : 'sound-stop-requested', signal.context);
      void signal.context.resume();
    },
    diagnostics: () => ({
      timeSources: { browserPerformanceMs: 'browser-performance-may-be-simulated', browserDateMs: 'browser-date-may-be-simulated', audioContextSeconds: 'real-audio-context' },
      timeline: [...timeline], droppedEvents, pendingMicrophone,
      contexts: [...signals.values()].slice(-8).map(signal => ({ state: signal.context.state, audioContextSeconds: signal.context.currentTime })),
      openPeers: peers.filter(peer => peer.connectionState !== 'closed').length,
      liveTracks: [...microphoneTracks, ...remoteTracks].filter(track => track.readyState === 'live').length,
      activeMeters: peers.reduce((count, peer) => count + (peer.connectionState === 'closed' ? 0 : peer.meters.length), 0)
    }),
    stats: () => ({
      microphoneRequests,
      peers: peers.length,
      openPeers: peers.filter(peer => peer.connectionState !== 'closed').length,
      microphoneTracks: microphoneTracks.map(track => ({ enabled: track.enabled, state: track.readyState })),
      remoteTracks: remoteTracks.map(track => ({ enabled: track.enabled, state: track.readyState })),
      audioElements: audioElements.size,
      silencedAudioElements: [...audioElements].filter(element => element.muted).length
    })
  };
})();
`;

declare global {
  interface Window {
    skyttelVoiceFixture: {
      emit(event: Record<string, unknown>): void;
      started(): void;
      disconnect(): void;
      reconnect(): void;
      fail(): void;
      close(): void;
      remoteTrack(): void;
      audioError(): void;
      setMicrophone(value: 'allow' | 'deny' | 'error' | 'hold' | 'busy'): void;
      releaseMicrophone(): void;
      setPlayback(value: 'allow' | 'blocked' | 'error'): void;
      setAutoStart(value: boolean): void;
      sentAudio(): { peak: number; frequency: number; at: number }[];
      captureChanges(): { enabled: boolean; at: number }[];
      microphoneLevel(): number;
      setMicrophoneTone(frequency: number): void;
      /** The level is the sound's strength, from 0 to 1. A quiet voice when it is left out. */
      setSound(source: 'microphone' | 'remote', active: boolean, level?: number): void;
      diagnostics(): {
        timeSources: Record<string, string>;
        timeline: {
          event: string;
          browserPerformanceMs: number;
          browserDateMs: number;
          audioContextSeconds: number | null;
          audioState: string | null;
          pendingMicrophone: number;
        }[];
        droppedEvents: number;
        pendingMicrophone: number;
        contexts: { state: string; audioContextSeconds: number }[];
        openPeers: number;
        liveTracks: number;
        activeMeters: number;
      };
      stats(): {
        microphoneRequests: number;
        peers: number;
        openPeers: number;
        microphoneTracks: { enabled: boolean; state: string }[];
        remoteTracks: { enabled: boolean; state: string }[];
        audioElements: number;
        silencedAudioElements: number;
      };
    };
  }
}
