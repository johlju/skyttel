import { expect, test, vi } from 'vitest';
import {
  type AssistantObservation,
  assistantObservationBoundary,
  type ObserveAssistant,
} from '../../../src/server/assistant-observation.js';
import { traceEventByteLimit } from '../../../src/server/trace-json.js';

function message(text: string) {
  return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] };
}

function observation(data: Record<string, unknown>): AssistantObservation {
  return {
    at: 1,
    sessionId: 'synthetic-session',
    kind: 'model_attempt',
    data: { usage: {}, ...data },
  };
}

function project(event: AssistantObservation, maxBytes = traceEventByteLimit) {
  const sink = vi.fn<ObserveAssistant>();
  const failed = vi.fn();
  assistantObservationBoundary(sink, { maxBytes, failed })?.(event);
  return { sink, failed };
}

test.each(['output message', 'input message', 'reasoning', 'sibling messages'])(
  '600 KB of nested %s content is admitted unchanged below the event limit',
  (shape) => {
    const text = 'x'.repeat(600_000);
    const data =
      shape === 'input message'
        ? { input: { input: [{ role: 'user', content: [{ type: 'input_text', text }] }] } }
        : {
            output: {
              output:
                shape === 'reasoning'
                  ? [
                      {
                        type: 'reasoning',
                        summary: [{ type: 'summary_text', text: text.slice(0, 300_000) }],
                        content: [{ type: 'reasoning_text', text: text.slice(300_000) }],
                      },
                    ]
                  : shape === 'sibling messages'
                    ? [message(text.slice(0, 300_000)), message(text.slice(300_000))]
                    : [message(text)],
            },
          };
    const event = observation(data);
    expect(Buffer.byteLength(JSON.stringify(event))).toBeLessThan(traceEventByteLimit);
    const { sink, failed } = project(event);
    expect(failed).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledExactlyOnceWith(event);
  },
);

test('the complete serialized event must fit, including UTF-8, escapes and its envelope', () => {
  const event = observation({ output: { output: [message('å😀\n"\\'.repeat(100))] } });
  const bytes = Buffer.byteLength(JSON.stringify(event));
  const exact = project(event, bytes);
  expect(exact.failed).not.toHaveBeenCalled();
  expect(exact.sink).toHaveBeenCalledExactlyOnceWith(event);
  const tooSmall = project(event, bytes - 1);
  expect(tooSmall.sink).not.toHaveBeenCalled();
  expect(tooSmall.failed).toHaveBeenCalledExactlyOnceWith('oversized');
});

test('nested arrays share one budget and stop projection before visiting later messages', () => {
  const messages = [message('x'.repeat(600_000)), message('y'.repeat(600_000))];
  const later = vi.fn(() => {
    throw new Error('Projection must stop before reading this message');
  });
  Object.defineProperty(messages, 2, { get: later });
  const { sink, failed } = project(observation({ output: { output: messages } }));
  expect(sink).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledExactlyOnceWith('oversized');
  expect(later).not.toHaveBeenCalled();
});
