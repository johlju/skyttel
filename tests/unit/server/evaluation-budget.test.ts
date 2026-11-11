import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import {
  budgetedLive,
  type LiveEvaluationProfile,
} from '../../../scripts/model-evaluation/live.js';
import profiles from '../../../scripts/model-evaluation/profiles.json' with { type: 'json' };

test.each([5, 90])(
  'Live estimates retain initialization uncertainty without adding it twice: %s seconds',
  {
    tags: ['technical'],
  },
  async (seconds) => {
    const db = new Database(':memory:');
    try {
      const budget = new EvaluationBudget(db, {
        authorized: true,
        priorUsd: 0,
        priorSource: 'Controlled estimate scope.',
        allowEstimates: true,
      });
      const profile = {
        ...profiles.profiles.find((item) => item.role === 'voice'),
        usdPerMinute: 0.05,
        billingMode: 'usage-estimate',
      } as LiveEvaluationProfile;
      const live = budgetedLive(
        budget,
        120,
        () => {},
        async () => Response.json({}),
        profile,
      );
      await live.fetch('https://api.openai.com/v1/live/sessions', {
        body: JSON.stringify({ session: { model: profile.model } }),
      });
      live.usage({
        attemptId: 'controlled',
        sessionId: 'controlled',
        startedAt: '2026-11-11T00:00:00Z',
        endedAt: '2026-11-11T00:01:30Z',
        model: profile.model,
        seconds,
        final: true,
        outcome: 'closed',
      });
      expect(budget.snapshot()).toMatchObject({
        spentUsd: 0,
        estimatedUsd: seconds === 5 ? 0.0125 : 0.075,
        reservedUsd: 0.1,
        estimatedCharges: 1,
        stopped: false,
      });
    } finally {
      db.close();
    }
  },
);

test('authorized estimates remain separate from settled charges and survive reopening', {
  tags: ['technical'],
}, () => {
  const db = new Database(':memory:');
  const config = {
    authorized: true,
    priorUsd: 0,
    priorSource: 'Controlled estimate scope.',
    allowEstimates: true,
  };
  try {
    const budget = new EvaluationBudget(db, config);
    const charge = budget.reserve('voice', 0.05);
    budget.estimate(
      charge,
      0.0125,
      '15-second initialization allowance; final billing unresolved.',
    );
    expect(new EvaluationBudget(db, config).snapshot()).toMatchObject({
      spentUsd: 0,
      estimatedUsd: 0.0125,
      estimatedCharges: 1,
      reservedUsd: 0.05,
      stopped: false,
    });
    expect(() => budget.reserve('judge', 1)).not.toThrow();
    expect(() => new EvaluationBudget(db, { ...config, allowEstimates: false })).toThrow(
      'evaluation_budget_configuration_changed',
    );
    budget.settle(charge, 0.01);
    expect(budget.snapshot()).toMatchObject({
      spentUsd: 0.01,
      estimatedUsd: 0,
      estimatedCharges: 0,
    });
  } finally {
    db.close();
  }
});

test('an omitted ceiling tracks costs and uncertainty while preserving explicit budget scopes', {
  tags: ['technical'],
}, () => {
  const db = new Database(':memory:');
  const config = {
    priorUsd: 1,
    priorSource: 'Authorized selected run without a ceiling.',
    authorized: true,
  };
  try {
    expect(() => new EvaluationBudget(db, { ...config, authorized: false })).toThrow(
      'evaluation_not_authorized',
    );
    const budget = new EvaluationBudget(db, config);
    const backend = budget.reserve('backend', 24);
    const judge = budget.reserve('judge', 5);
    budget.settle(backend, 12);
    expect(new EvaluationBudget(db, config).snapshot()).toMatchObject({
      limitUsd: null,
      availableUsd: null,
      spentUsd: 13,
      reservedUsd: 5,
      stopped: false,
    });
    expect(() => new EvaluationBudget(db, { ...config, limitUsd: 10 })).toThrow(
      'evaluation_budget_configuration_changed',
    );
    budget.settle(judge, null);
    expect(budget.snapshot()).toMatchObject({
      reservedUsd: 5,
      stopped: true,
      reason: 'evaluation_usage_unknown',
    });
    expect(() => budget.reserve('voice', 1)).toThrow('evaluation_usage_unknown');
  } finally {
    db.close();
  }
});

test('shared reservations prevent concurrent calls from overspending and preserve uncertain charges', {
  tags: ['technical'],
}, () => {
  const db = new Database(':memory:');
  try {
    const budget = new EvaluationBudget(db, {
      limitUsd: 10,
      priorUsd: 1,
      priorSource: 'verified receipt',
      authorized: true,
    });
    const voice = budget.reserve('voice', 6);
    const backend = budget.reserve('backend', 2);
    expect(() => budget.reserve('judge', 1.01)).toThrow('evaluation_budget_exceeded');
    budget.settle(backend, 0.4);
    expect(budget.snapshot()).toMatchObject({ spentUsd: 1.4, reservedUsd: 6, availableUsd: 2.6 });
    budget.settle(voice, null);
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 6, stopped: true });
    expect(() => budget.reserve('judge', 0.01)).toThrow('evaluation_budget_exceeded');
  } finally {
    db.close();
  }
});

test('an empty legacy capped schema reports incompatibility for an uncapped configuration', {
  tags: ['technical'],
}, () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE evaluation_budget (
      id INTEGER PRIMARY KEY CHECK (id = 1), ceiling INTEGER NOT NULL,
      prior INTEGER NOT NULL, source TEXT NOT NULL, stopped TEXT)`);
    expect(
      () =>
        new EvaluationBudget(db, {
          priorUsd: 0,
          priorSource: 'New authorized scope requires a new ledger.',
          authorized: true,
        }),
    ).toThrow('evaluation_budget_schema_incompatible');
  } finally {
    db.close();
  }
});

test.each([false, true])(
  'a failed paid voice startup retains its hold and counts as dispatched execution (estimates: %s)',
  {
    tags: ['technical'],
  },
  async (allowEstimates) => {
    const db = new Database(':memory:');
    try {
      const budget = new EvaluationBudget(db, {
        authorized: true,
        limitUsd: 10,
        priorUsd: 0,
        priorSource: 'Isolated non-billable test.',
        allowEstimates,
      });
      const profile = {
        ...profiles.profiles.find((item) => item.role === 'voice'),
        ...(allowEstimates ? { billingMode: 'usage-estimate' } : {}),
      } as LiveEvaluationProfile;
      const live = budgetedLive(
        budget,
        60,
        () => {},
        async () => {
          throw new Error('connection_failed_after_dispatch');
        },
        profile,
      );
      expect(budget.callsStarted).toBe(0);
      await expect(
        live.fetch('https://api.openai.com/v1/live/sessions', {
          body: JSON.stringify({ session: { model: profile.model } }),
        }),
      ).rejects.toThrow('connection_failed_after_dispatch');
      live.usage({
        attemptId: 'failed-start',
        sessionId: null,
        startedAt: '2026-10-10T00:00:00Z',
        endedAt: '2026-10-10T00:00:01Z',
        model: profile.model,
        seconds: null,
        final: false,
        outcome: 'failed',
      });
      expect(budget.callsStarted).toBe(1);
      expect(budget.snapshot()).toMatchObject({
        stopped: true,
        reason: 'evaluation_usage_unknown',
        reservedUsd: profile.usdPerMinute,
      });
      await expect(
        live.fetch('https://api.openai.com/v1/live/sessions', {
          body: JSON.stringify({ session: { model: profile.model } }),
        }),
      ).rejects.toThrow('evaluation_usage_unknown');
      expect(budget.callsStarted).toBe(1);
    } finally {
      db.close();
    }
  },
);
