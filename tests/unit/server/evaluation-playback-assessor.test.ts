import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import { recordedPlayback } from '../../../scripts/model-evaluation/playback.js';
import {
  type PlaybackAssessorProfile,
  playbackAssessor,
} from '../../../scripts/model-evaluation/playback-assessor.js';

const profile: PlaybackAssessorProfile = {
  id: 'controlled-transcriber',
  model: 'whisper-1',
  language: 'sv',
  usdPerMinute: 0.01,
  billingQuantumSeconds: 1,
  alignmentMarginMs: 100,
  minimumAverageLogProbability: -1,
  maximumNoSpeechProbability: 0.5,
  maximumCandidates: 8,
  checkedAt: 'controlled-profile',
  sources: ['https://example.test/controlled-transcription'],
};

test.each([
  'complete',
  'missing-usage',
  'uncertain',
  'mismatched-words',
  'invalid-segments',
  'duration-mismatch',
] as const)(
  'recording assessor sends actual WAV without answer hints and retains %s billing/evidence',
  { tags: ['technical'] },
  async (mode) => {
    const db = new Database(':memory:');
    const budget = new EvaluationBudget(db, {
      authorized: true,
      priorUsd: 0,
      priorSource: 'Controlled provider; no paid calls.',
    });
    const records: unknown[] = [];
    const pcm = Buffer.alloc(96000);
    pcm.writeInt16LE(1000, 100);
    const recording = recordedPlayback(
      {
        sampleRate: 48000,
        firstFrame: 0,
        frames: 48000,
        lastActiveFrame: 50,
        observedAt: 2000,
        clocks: [],
      },
      pcm,
    );
    let requests = 0;
    const transport: typeof fetch = async (url, init) => {
      // SDK multipart capability probe is local and non-billable.
      if (String(url) === 'data:,') return new Response('');
      requests++;
      expect(String(url)).toBe('https://api.openai.com/v1/audio/transcriptions');
      const body = init?.body as FormData;
      expect(body.get('model')).toBe('whisper-1');
      expect(body.get('language')).toBe('sv');
      expect(body.get('prompt')).toBeNull();
      expect(Buffer.from(await (body.get('file') as Blob).arrayBuffer())).toEqual(recording.wav);
      return Response.json({
        duration: mode === 'duration-mismatch' ? 100 : 1,
        language: 'swedish',
        text: mode === 'mismatched-words' ? 'Sparat allt.' : 'Sparat.',
        words: [{ word: 'Sparat.', start: 0.1, end: 0.5 }],
        segments: [
          {
            start: 0,
            end: mode === 'invalid-segments' ? 100 : 1,
            avg_logprob: mode === 'uncertain' ? -3 : -0.1,
            no_speech_prob: 0.01,
          },
        ],
        ...(mode === 'missing-usage' ? {} : { usage: { type: 'duration', seconds: 1 } }),
      });
    };
    try {
      const assess = playbackAssessor(
        'controlled-key',
        profile,
        budget,
        (value) => records.push(value),
        transport,
      );
      const result = await assess(recording);
      expect(result.outcome).toBe(mode === 'complete' ? 'recognized' : 'inconclusive');
      expect(requests).toBe(1);
      expect(records).toHaveLength(1);
      expect(budget.callsStarted).toBe(1);
      expect(budget.snapshot().stopped).toBe(mode === 'missing-usage');
      if (mode === 'missing-usage') {
        expect(result.costUsd).toBeNull();
        expect(budget.snapshot().reservedUsd).toBeGreaterThan(0);
      } else expect(result.costUsd).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  },
);
