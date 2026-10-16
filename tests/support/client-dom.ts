import { beforeEach, vi } from 'vitest';

// Unrelated component workflows use the same prepared necessary-only choice
// as integration tests. Consent workflows exercise a clean browser separately.
beforeEach(() => {
  localStorage.setItem(
    'skyttel-storage-consent',
    JSON.stringify({
      schemaVersion: 1,
      informationVersion: 1,
      preferences: false,
      decidedAt: Date.now(),
    }),
  );
});

// jsdom has no origin-wide lock service. Native locking and secure cookie
// policy are verified against the real HTTPS installation in Chromium.
Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request: async (_name: string, _options: unknown, operation: () => Promise<unknown>) =>
      operation(),
  },
});

// jsdom has no WebGL. Keep the real map and camera; Chromium tests verify rendering.
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();
  return {
    ...three,
    WebGLRenderer: vi.fn(
      class {
        autoClear = true;
        private pixelRatio = 1;
        setPixelRatio(value: number) {
          this.pixelRatio = value;
        }
        getPixelRatio() {
          return this.pixelRatio;
        }
        setSize = vi.fn();
        clear = vi.fn();
        render = vi.fn();
        dispose = vi.fn();
      },
    ),
  };
});

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

// jsdom omits the native dialog methods. Real modal behavior is covered in Chromium.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  for (const name of ['showModal', 'close'] as const)
    Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        this.open = name === 'showModal';
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
