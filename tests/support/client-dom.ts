// jsdom has no layout. Keep real focus scrolling in Chromium and integration tests.
if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value() {},
  });
}

if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value() {},
  });
}

// Geometry and responsive behavior are verified in real Chromium. These defaults
// allow HTTP-backed jsdom clients to mount the same panels without a layout engine.
if (typeof document.elementFromPoint !== 'function') {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => null,
  });
}
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => Object.assign(new EventTarget(), { matches: false, media }),
  });
}
if (typeof globalThis.ResizeObserver !== 'function') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

// Real stream activity is covered in Chromium using generated audio tracks.
// jsdom has no Web Audio processing; provide the browser boundary there.
if (typeof globalThis.AudioContext !== 'function') {
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: class {
      state = 'running';
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          getByteTimeDomainData(samples: Uint8Array) {
            samples.fill(128);
          },
          disconnect() {},
        };
      }
      async resume() {}
      async close() {
        this.state = 'closed';
      }
    },
  });
}
