import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import {
  budgetedLive,
  type LiveEvaluationProfile,
} from '../../../scripts/model-evaluation/live.js';

test('voice comparison refuses changed speaking/listening conditions before paid dispatch', {
  tags: ['technical'],
}, async () => {
  const db = new Database(':memory:');
  const profile: LiveEvaluationProfile = {
    id: 'controlled-live',
    provider: 'openai',
    model: 'gpt-live-1',
    tokens: 32000,
    usdPerMinute: 0.01,
    checkedAt: 'controlled-profile',
    sources: ['https://example.test/controlled-voice'],
    backend: 'sol-high',
  };
  const requiredSession = {
    model: profile.model,
    audio: { output: { voice: 'marin' } },
    instructions: 'Common listening and speaking conditions.',
    store: false,
    delegation: { type: 'client' },
  };
  const budget = new EvaluationBudget(db, {
    authorized: true,
    priorUsd: 0,
    priorSource: 'Controlled no-payment contract test.',
  });
  let dispatched = 0;
  const live = budgetedLive(
    budget,
    60,
    () => {},
    async () => {
      dispatched++;
      return Response.json({});
    },
    profile,
    { requiredSession },
  );
  try {
    await expect(
      live.fetch('https://api.openai.com/v1/live/sessions', {
        method: 'POST',
        body: JSON.stringify({
          session: { ...requiredSession, audio: { output: { voice: 'changed' } } },
          transport: { type: 'webrtc', sdp: 'controlled' },
        }),
      }),
    ).rejects.toThrow('evaluation_live_session_conditions_mismatch');
    expect(dispatched).toBe(0);
    expect(budget.callsStarted).toBe(0);
    expect(budget.snapshot().reservedUsd).toBe(0);
  } finally {
    db.close();
  }
});
