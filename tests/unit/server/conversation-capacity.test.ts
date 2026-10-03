import { expect, test } from 'vitest';
import { ConversationCapacity } from '../../../src/server/conversation-capacity.js';

test('text occupancy replaces measured snapshots and estimates only later additions', () => {
  const capacity = new ConversationCapacity();
  expect(capacity.percent(0, 0)).toBe(0);
  capacity.text({ input_tokens: 840_000, output_tokens: 52_500 }, 120);
  expect(capacity.percent(120, 0)).toBe(85);
  expect(capacity.percent(31_620, 0)).toBe(86);
  capacity.text({ input_tokens: 105_000, output_tokens: 0 }, 31_620);
  expect(capacity.percent(31_620, 0)).toBe(10);
});

test('voice uses its own capacity and trusted latest ratio, including decreases', () => {
  const capacity = new ConversationCapacity();
  capacity.beginVoice('voice');
  expect(capacity.percent(0, 326_400)).toBe(85);
  capacity.voice('voice', 0.92);
  expect(capacity.percent(0, 0)).toBe(92);
  capacity.voice('voice', 0.1);
  expect(capacity.percent(0, 0)).toBe(10);
  capacity.text({ input_tokens: 892_500, output_tokens: 0 }, 0);
  expect(capacity.percent(0, 0)).toBe(85);
});

test('invalid and retired usage cannot overwrite measurements and reset retires all snapshots', () => {
  const capacity = new ConversationCapacity();
  capacity.beginVoice('new');
  capacity.voice('new', 0.85);
  for (const value of [undefined, null, '0.95', -1, NaN, Infinity]) capacity.voice('new', value);
  capacity.voice('old', 1);
  expect(capacity.percent(0, 0)).toBe(85);
  capacity.text({ input_tokens: -1, output_tokens: 0 }, 0);
  capacity.reset();
  capacity.voice('new', 1);
  expect(capacity.percent(0, 0)).toBe(0);
  expect(capacity.percent(3_150_000, 0)).toBe(100);
});
