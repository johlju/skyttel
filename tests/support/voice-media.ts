import { vi } from 'vitest';

/** Browser media boundaries; the real transport and held-input code stay in the test. */
export function voiceMedia() {
  class Track extends EventTarget {
    enabled = true;
    stopped = false;
    stop() {
      this.stopped = true;
    }
  }
  class Stream {
    constructor(private tracks: Track[] = []) {}
    getTracks() {
      return this.tracks;
    }
  }
  class Node {
    disconnected = false;
    constructor(public stream?: Stream) {}
    connect<T>(next: T): T {
      if (next instanceof Node) next.stream = this.stream;
      return next;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class Processor extends Node {
    static all: Processor[] = [];
    port = {
      onmessage: (_event: MessageEvent) => {},
      postMessage: vi.fn(),
      close: vi.fn(),
    };
    onprocessorerror = () => {};
    constructor() {
      super();
      Processor.all.push(this);
    }
  }
  const microphone = new Track();
  const outgoing = new Track();
  const stream = new Stream([microphone]);
  const sources: Node[] = [];
  const signals = new Map<Track, number>();
  const addModule = vi.fn().mockResolvedValue(undefined);
  const context = {
    state: 'running',
    audioWorklet: { addModule },
    createMediaStreamSource: (stream: Stream) => {
      const source = new Node(stream);
      sources.push(source);
      return source;
    },
    createMediaStreamDestination: () => ({ stream: new Stream([outgoing]) }),
    createAnalyser: () =>
      Object.assign(new Node(), {
        fftSize: 256,
        getByteTimeDomainData(this: Node, values: Uint8Array) {
          values.fill(
            128 +
              Math.max(
                0,
                ...(this.stream?.getTracks() ?? []).map((track) => signals.get(track) ?? 0),
              ),
          );
        },
      }),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal('AudioWorkletNode', Processor);
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('AudioContext', function AudioContext() {
    return context;
  });
  const audios: HTMLAudioElement[] = [];
  vi.stubGlobal('Audio', function Audio() {
    const audio = document.createElement('audio');
    audios.push(audio);
    return audio;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  class Channel extends EventTarget {
    readyState = 'connecting';
    send = vi.fn();
    close() {
      this.readyState = 'closed';
      this.dispatchEvent(new Event('close'));
    }
    emit(value: object) {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ event_id: crypto.randomUUID(), ...value }),
        }),
      );
    }
  }
  class Peer extends EventTarget {
    static all: Peer[] = [];
    connectionState = 'new';
    localDescription: object | null = null;
    channel = new Channel();
    remote = new Track();
    addTrack = vi.fn();
    constructor() {
      super();
      Peer.all.push(this);
    }
    createDataChannel() {
      return this.channel;
    }
    async createOffer() {
      return { type: 'offer', sdp: 'synthetic-offer' };
    }
    async setLocalDescription(value: object) {
      this.localDescription = value;
    }
    async setRemoteDescription() {
      this.connectionState = 'connected';
      this.dispatchEvent(new Event('connectionstatechange'));
      this.dispatchEvent(Object.assign(new Event('track'), { track: this.remote }));
      this.channel.readyState = 'open';
      this.channel.dispatchEvent(new Event('open'));
    }
    close() {
      this.connectionState = 'closed';
    }
  }
  vi.stubGlobal('RTCPeerConnection', Peer);
  return {
    microphone,
    outgoing,
    stream,
    get source() {
      return sources[0];
    },
    context,
    addModule,
    getUserMedia,
    processors: Processor.all,
    peers: Peer.all,
    audios,
    signals,
  };
}
