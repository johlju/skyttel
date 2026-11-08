import { expect, test } from 'vitest';
import { recordedPlayback } from '../../../scripts/model-evaluation/playback.js';
import { renderedToneWindows } from '../../support/evaluation-rendered-tone.js';

function recording(frequency: number, start: number, duration: number, sampleRate = 48_000) {
  const frames = sampleRate / 5;
  const pcm = Buffer.alloc(frames * 2);
  for (let frame = Math.round(start * sampleRate); frame < (start + duration) * sampleRate; frame++)
    pcm.writeInt16LE(
      Math.round(5000 * Math.sin((frame * frequency * 2 * Math.PI) / sampleRate)),
      frame * 2,
    );
  return recordedPlayback(
    { sampleRate, firstFrame: 0, frames, lastActiveFrame: null, observedAt: 0, clocks: [] },
    pcm,
  );
}

test('a partial 880 Hz edge is not recognized as a stale 400 Hz tone', {
  tags: ['technical'],
}, () => {
  expect(renderedToneWindows(recording(880, 0, 0.045), 400)).toBe(0);
});

test.each([44_100, 48_000])(
  'complete tones retain their frequency and partial edges remain insufficient at %s Hz sample rate',
  { tags: ['technical'] },
  (sampleRate) => {
    for (const frequency of [400, 880]) {
      expect(
        renderedToneWindows(recording(frequency, 0, 0.1, sampleRate), frequency),
      ).toBeGreaterThan(0);
      for (const start of [0, 0.055]) {
        const rendered = recording(frequency, start, 0.045, sampleRate);
        expect(renderedToneWindows(rendered, frequency)).toBe(0);
        expect(renderedToneWindows(rendered, frequency === 400 ? 880 : 400)).toBe(0);
      }
    }
  },
);

test('silence and a different tone do not supply either expected frequency', {
  tags: ['technical'],
}, () => {
  for (const rendered of [recording(0, 0, 0.1), recording(660, 0, 0.1)]) {
    expect(renderedToneWindows(rendered, 400)).toBe(0);
    expect(renderedToneWindows(rendered, 880)).toBe(0);
  }
});
