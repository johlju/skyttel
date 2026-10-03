import { beforeEach, expect, test, vi } from 'vitest';

type Processor = {
  port: {
    onmessage: (event: {
      data: { capture?: boolean; transmit?: boolean; discard?: boolean };
    }) => void;
    postMessage: ReturnType<typeof vi.fn>;
  };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};
let processor: Processor;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('sampleRate', 128);
  vi.stubGlobal(
    'AudioWorkletProcessor',
    class {
      port = { postMessage: vi.fn(), onmessage: () => undefined };
    },
  );
  vi.stubGlobal('registerProcessor', (_name: string, Constructor: new () => Processor) => {
    processor = new Constructor();
  });
  await import('../../../src/client/voice-input-worklet.js');
});

test('held speech waits for media readiness, drains in order and excludes speech after release', () => {
  processor.port.onmessage({ data: { capture: true } });
  processor.process([[new Float32Array([1, 2, 3])]], [[new Float32Array(2)]]);
  processor.process([[new Float32Array([4, 5])]], [[new Float32Array(2)]]);
  processor.port.onmessage({ data: { capture: false } });
  processor.port.onmessage({ data: { transmit: true } });
  const delivered = [new Float32Array(2), new Float32Array(2), new Float32Array(2)];
  for (const block of delivered) processor.process([[new Float32Array([8, 9])]], [[block]]);
  expect(delivered.map((block) => [...block])).toEqual([
    [1, 2],
    [3, 4],
    [5, 0],
  ]);
  expect(processor.port.postMessage).toHaveBeenCalledExactlyOnceWith({ drained: true });
  const silence = new Float32Array(2);
  processor.process([[new Float32Array([8, 9])]], [[silence]]);
  expect([...silence]).toEqual([0, 0]);
});

test('excessive startup fails instead of dropping the beginning or retaining unlimited speech', () => {
  processor.port.onmessage({ data: { capture: true } });
  let continued = true;
  for (let i = 0; i < 40 && continued; i++)
    continued = processor.process([[new Float32Array(128)]], []);
  expect(continued).toBe(false);
  expect(processor.port.postMessage).toHaveBeenCalledExactlyOnceWith({ failed: true });
  processor.port.onmessage({ data: { transmit: true } });
  const output = new Float32Array(128);
  processor.process([], [[output]]);
  expect(output.every((value) => value === 0)).toBe(true);
});

test('unavailable input discards pending speech and a later explicit press starts with fresh speech', () => {
  processor.port.onmessage({ data: { capture: true } });
  processor.process([[new Float32Array([1, 2])]], []);
  processor.port.onmessage({ data: { capture: false, transmit: false, discard: true } });
  processor.port.onmessage({ data: { transmit: true } });
  const first = new Float32Array(2);
  processor.process([[new Float32Array([3, 4])]], [[first]]);
  expect([...first]).toEqual([0, 0]);
  processor.port.onmessage({ data: { capture: true } });
  const next = new Float32Array(2);
  processor.process([[new Float32Array([5, 6])]], [[next]]);
  expect([...next]).toEqual([5, 6]);
});
