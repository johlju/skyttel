import { expect, test } from 'vitest';
import { lastVoiceActivityAt } from '../../../scripts/model-evaluation/observations.js';
import type { AssistantObservation } from '../../../src/server/assistant-observation.js';

test('status polling permits voice quiet observation while late output and task calls extend it', {
  tags: ['technical'],
}, () => {
  const events: AssistantObservation[] = [
    { at: 100, sessionId: 'dialog', kind: 'backend_result', data: {} },
    { at: 120, sessionId: 'dialog', kind: 'voice_event', data: { role: 'assistant' } },
    { at: 130, sessionId: 'dialog', kind: 'voice_commentary', data: {} },
  ];
  for (let at = 150; at <= 2150; at += 25) {
    events.push({ at, sessionId: 'dialog', kind: 'mcp_started', data: {} });
    events.push({ at: at + 1, sessionId: 'dialog', kind: 'mcp_completed', data: {} });
  }
  expect(2200 - lastVoiceActivityAt(events, 0)).toBeGreaterThanOrEqual(2000);
  events.push({
    at: 2160,
    sessionId: 'dialog',
    taskId: 'delegated-work',
    kind: 'mcp_completed',
    data: {},
  });
  expect(2200 - lastVoiceActivityAt(events, 0)).toBeLessThan(2000);
  events.push({
    at: 2180,
    sessionId: 'dialog',
    kind: 'voice_event',
    data: { role: 'assistant' },
  });
  expect(lastVoiceActivityAt(events, 0)).toBe(2180);
  expect(lastVoiceActivityAt([], 42)).toBe(42);
});
