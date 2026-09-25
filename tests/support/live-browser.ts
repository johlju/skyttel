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
  let playback = 'allow';
  let autoStart = true;

  function silentStream(tracks) {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    for (const track of destination.stream.getTracks()) {
      tracks.push(track);
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
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
    constructor() { super(); peers.push(this); }
    createDataChannel() { return this.channel; }
    addTrack() { return {}; }
    async createOffer() { return { type: 'offer', sdp: 'synthetic-browser-offer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription() {
      this.change('connected');
      this.channel.readyState = 'open';
      this.channel.dispatchEvent(new Event('open'));
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
      for (const track of this.remote?.getTracks() ?? []) track.stop();
    }
  }

  window.RTCPeerConnection = Peer;
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true,
    value: async () => {
      if (microphone === 'deny') throw new DOMException('Synthetic denied microphone', 'NotAllowedError');
      if (microphone === 'error') throw new DOMException('Synthetic missing microphone', 'NotFoundError');
      return silentStream(microphoneTracks);
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
    setPlayback: (value) => { playback = value; },
    setAutoStart: (value) => { autoStart = value; },
    stats: () => ({
      peers: peers.length,
      openPeers: peers.filter(peer => peer.connectionState !== 'closed').length,
      microphoneTracks: microphoneTracks.map(track => ({ enabled: track.enabled, state: track.readyState })),
      remoteTracks: remoteTracks.map(track => ({ enabled: track.enabled, state: track.readyState })),
      audioElements: audioElements.size
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
      setMicrophone(value: 'allow' | 'deny' | 'error'): void;
      setPlayback(value: 'allow' | 'blocked' | 'error'): void;
      setAutoStart(value: boolean): void;
      stats(): {
        peers: number;
        openPeers: number;
        microphoneTracks: { enabled: boolean; state: string }[];
        remoteTracks: { enabled: boolean; state: string }[];
        audioElements: number;
      };
    };
  }
}
