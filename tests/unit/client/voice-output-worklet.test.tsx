import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

class TestProcessor {
  port = { onmessage: (_event: { data: string }) => {}, postMessage: vi.fn() };
}

type Processor = TestProcessor & {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};
let VoiceOutput: new () => Processor;

beforeAll(async () => {
  vi.stubGlobal('AudioWorkletProcessor', TestProcessor);
  vi.stubGlobal('registerProcessor', (name: string, processor: typeof VoiceOutput) => {
    expect(name).toBe('skyttel-voice-output');
    VoiceOutput = processor;
  });
  await import('../../../src/client/voice-output-worklet.js');
});
afterAll(() => vi.unstubAllGlobals());

function start(sampleRate: number) {
  vi.stubGlobal('sampleRate', sampleRate);
  const processor = new VoiceOutput();
  const send = (data: string) => processor.port.onmessage({ data });
  send('interrupt');
  return {
    send,
    posted: processor.port.postMessage,
    render(input: Float32Array) {
      const output = new Float32Array(input.length);
      for (let offset = 0; offset < input.length; offset += 128) {
        processor.process(
          [[input.subarray(offset, offset + 128)]],
          [[output.subarray(offset, offset + 128)]],
        );
      }
      return output;
    },
  };
}

describe.each([44_100, 48_000])('speaker interruption at %i Hz', (sampleRate) => {
  const quiet = sampleRate / 5;

  it('resets one frame short and passes the first sample after a full quiet interval', () => {
    const { send, posted, render } = start(sampleRate);
    send('correction');
    const input = new Float32Array(3 * quiet + 2);
    input[quiet - 1] = 0.5;
    input[2 * quiet - 1] = -0.5;
    input.set([0.75, -0.5], 3 * quiet);
    const output = render(input);
    expect(output.subarray(0, 3 * quiet).every((sample) => sample === 0)).toBe(true);
    expect([...output.subarray(3 * quiet)]).toEqual([0.75, -0.5]);
    expect(posted.mock.calls).toEqual([['open']]);
  });

  it('keeps a quiet speaker muted until correction transcription starts', () => {
    const { send, posted, render } = start(sampleRate);
    render(new Float32Array(quiet + 1));
    expect(posted).not.toHaveBeenCalled();
    send('correction');
    expect([...render(Float32Array.of(0.25))]).toEqual([0.25]);
    expect(posted.mock.calls).toEqual([['open']]);
  });
});

it('keeps a live speaker connected through missing channels, passes normal audio and stops on close', () => {
  vi.stubGlobal('sampleRate', 48_000);
  const processor = new VoiceOutput();
  const input = Float32Array.from([0.25, -0.75]);
  const output = new Float32Array(input.length);
  expect(processor.process([], [[output]])).toBe(true);
  expect(processor.process([[]], [[output]])).toBe(true);
  expect(processor.process([[input]], [])).toBe(true);
  expect(processor.process([[input]], [[]])).toBe(true);
  expect([...output]).toEqual([0, 0]);
  processor.port.onmessage({ data: 'unrecognized' });
  expect(processor.process([[input]], [[output]])).toBe(true);
  expect(output).toEqual(input);
  processor.port.onmessage({ data: 'close' });
  output.fill(0);
  expect(processor.process([[input]], [[output]])).toBe(false);
  expect([...output]).toEqual([0, 0]);
});
