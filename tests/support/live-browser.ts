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
      this.startedAt ??= performance.now();
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
  // Observe the final nodes connected to the device output. This records the
  // same rendered PCM that Web Audio supplies to the browser's audio device.
  const speakerNodes = new Set();
  const incomingNodes = new Set();
  const connectNode = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...ports) {
    const result = connectNode.call(this, target, ...ports);
    if (target === this.context.destination) speakerNodes.add(this);
    if (this instanceof MediaStreamAudioSourceNode &&
        this.mediaStream.getAudioTracks().some(track => remoteTracks.includes(track))) incomingNodes.add(this);
    return result;
  };
  const nativePlay = HTMLMediaElement.prototype.play;
  const nativePause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function () {
    audioElements.add(this);
    if (playback === 'blocked') return Promise.reject(new DOMException('Synthetic autoplay block', 'NotAllowedError'));
    if (playback === 'error') return Promise.reject(new DOMException('Synthetic output failure', 'NotSupportedError'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function () { audioElements.delete(this); nativePause.call(this); };
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
    // Count complete cycles in both signals so a clipped onset is visible.
    sessionMs: () => Math.ceil(performance.now() - latest().startedAt),
    // Arm the tones on the actual button, so capture begins in the same click
    // as interruption even when the UI or the control request is delayed.
    armCorrection: (button) => {
      const fixture = window.skyttelVoiceFixture;
      return new Promise(resolve => button.addEventListener('click', () => {
        const start = fixture.sessionMs();
        const sentFrom = sentAudio.length;
        fixture.setMicrophoneTone(600);
        setTimeout(() => fixture.setSound('microphone', false), 160);
        fixture.remoteTone(640, 0, 0.12);
        fixture.remoteTone(800, 0.22, 0.18);
        fixture.remoteTone(1000, 0.601, 0.15);
        const timer = setInterval(() => {
          if (!sentAudio.slice(sentFrom).some(sample => Math.abs(sample.frequency - 600) < 40)) return;
          clearInterval(timer);
          clearTimeout(deadline);
          const event = { type: 'session.input_transcript.delta', event_id: crypto.randomUUID(),
            delta: 'Jag menar Lo Exempel.', start_ms: start, end_ms: start + 160 };
          fixture.emit(event);
          resolve(event);
        }, 10);
        const deadline = setTimeout(() => { clearInterval(timer); resolve(null); }, 1500);
      }, { once: true }));
    },
    observeSpeaker: async () => {
      const element = [...audioElements].find(element => element.srcObject);
      await nativePlay.call(element);
      if (!element.muted || speakerNodes.size !== 1) throw new Error('Expected one device output and a muted receiver');
      const [played] = speakerNodes;
      const context = played.context;
      const raw = [...incomingNodes].find(node => node.context === context);
      if (!raw) throw new Error('Missing receiver audio in the output context');
      // Compare both branches in the same render quantum. A second media
      // stream or audio context would introduce independent jitter/resampling.
      const merger = context.createChannelMerger(2);
      raw.connect(merger, 0, 0);
      played.connect(merger, 0, 1);
      const recorder = context.createScriptProcessor(4096, 2, 1);
      merger.connect(recorder).connect(context.destination);
      const counts = [{}, {}];
      const lastCrossing = [-Infinity, -Infinity];
      const lastSample = [0, 0];
      const previousMarker = [0, 0];
      let frames = 0;
      recorder.onaudioprocess = ({ inputBuffer }) => {
        for (let ch = 0; ch < 2; ch++) {
          const samples = inputBuffer.getChannelData(ch);
          for (let i = 0; i < samples.length; i++) {
            if (samples[i] > 0.01 && lastSample[ch] <= 0.01) {
              const hz = context.sampleRate / (frames + i - lastCrossing[ch]);
              const marker = [440, 640, 800, 1000, 1200, 1600].find(word => Math.abs(hz - word) < word * 0.05);
              // A discontinuity between words can make one half-wave look like
              // another frequency. Require consecutive cycles of the same tone.
              if (marker && marker === previousMarker[ch]) counts[ch][marker] = (counts[ch][marker] || 0) + 1;
              previousMarker[ch] = marker;
              lastCrossing[ch] = frames + i;
            }
            lastSample[ch] = samples[i];
          }
        }
        frames += inputBuffer.length;
      };
      return () => ({ incoming: { ...counts[0] }, speaker: { ...counts[1] } });
    },
    remoteTone: (frequency, start, duration) => {
      const { context, gain, oscillator } = signals.get(remoteTracks);
      const at = context.currentTime + start;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.2, at);
      gain.gain.setValueAtTime(0, at + duration);
    },
    setMicrophoneTone: (frequency) => {
      const signal = signals.get(microphoneTracks);
      signal.oscillator.frequency.value = frequency;
      signal.gain.gain.value = 0.2;
      void signal.context.resume();
    },
    useControlledRemoteSamples: () => {
      // A timing test can control the incoming audio meter without depending
      // on Chromium's media graph scheduling. Leave microphone samples real.
      const createSource = AudioContext.prototype.createMediaStreamSource;
      AudioContext.prototype.createMediaStreamSource = function (stream) {
        const source = createSource.call(this, stream);
        if (!stream.getAudioTracks().some(track => remoteTracks.includes(track))) return source;
        const signal = signals.get(remoteTracks);
        const connect = source.connect.bind(source);
        source.connect = (destination, ...args) => {
          if (destination instanceof AnalyserNode) {
            destination.getByteTimeDomainData = (samples) => {
              samples.fill(128 + Math.round(127 * signal.gain.gain.value));
            };
          }
          return connect(destination, ...args);
        };
        return source;
      };
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
      sessionMs(): number;
      armCorrection(button: Element): Promise<{
        type: string;
        event_id: string;
        delta: string;
        start_ms: number;
        end_ms: number;
      } | null>;
      observeSpeaker(): Promise<
        () => {
          incoming: Record<number, number>;
          speaker: Record<number, number>;
        }
      >;
      remoteTone(frequency: number, start: number, duration: number): void;
      setMicrophoneTone(frequency: number): void;
      useControlledRemoteSamples(): void;
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
