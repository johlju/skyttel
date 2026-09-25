import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { CostAssumptions, CostMonth } from '../shared/costs.js';
import {
  type CostAttempt,
  currentRates,
  defaultAssumptions,
  type Measurement,
  summarizeAttempts,
} from './cost-estimates.js';
import type { LiveUsageAttempt } from './live-provider.js';
import { MapError } from './map-error.js';
import type { TextModelAttempt } from './text-assistant-model.js';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const money = z.number().finite().min(0).max(1_000_000);
const settingsSchema = z
  .object({
    month: monthSchema,
    version: z.number().int().min(0),
    sekPerUsd: z.number().finite().positive().max(10_000),
    computeUsd: money,
    diskGb: z.number().finite().min(0).max(1_000_000),
    diskUsdPerGb: money,
    workspace: z.enum(['hobby', 'pro', 'scale', 'custom']),
    workspaceUsd: money,
  })
  .strict();

function count(value: unknown, integer = true): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER &&
    (!integer || Number.isInteger(value))
    ? value
    : null;
}

export function installationCosts(database: Database.Database) {
  let recordingUnavailable = false;
  function captureDefaults(month: string) {
    database
      .prepare(`INSERT INTO cost_assumptions (month, version, updatedAt, assumptions)
      SELECT ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM cost_assumptions WHERE month = ?)`)
      .run(month, new Date().toISOString(), JSON.stringify(defaultAssumptions), month);
  }
  function record(attempt: TextModelAttempt | LiveUsageAttempt, measurement: Measurement) {
    try {
      database
        .transaction(() => {
          captureDefaults(attempt.startedAt.slice(0, 7));
          database
            .prepare(`INSERT INTO cost_attempt (id, kind, month, startedAt, endedAt, measurement, rates)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        endedAt = excluded.endedAt, measurement = excluded.measurement
        WHERE cost_attempt.endedAt IS NULL OR excluded.endedAt IS NOT NULL`)
            .run(
              attempt.attemptId,
              measurement.kind,
              attempt.startedAt.slice(0, 7),
              attempt.startedAt,
              attempt.endedAt,
              JSON.stringify(measurement),
              JSON.stringify(currentRates),
            );
        })
        .immediate();
    } catch {
      recordingUnavailable = true;
      throw new MapError('usage_unavailable', 503);
    }
  }
  function model(attempt: TextModelAttempt) {
    record(attempt, {
      kind: 'terra',
      outcome: attempt.outcome,
      model: attempt.resolvedModel ?? null,
      tier: attempt.serviceTier ?? null,
      usage: {
        input: count(attempt.usage.input),
        cached: count(attempt.usage.cached),
        cacheWrite: count(attempt.usage.cacheWrite),
        output: count(attempt.usage.output),
        reasoning: count(attempt.usage.reasoning),
      },
    });
  }
  function live(attempt: LiveUsageAttempt) {
    record(attempt, {
      kind: 'live',
      seconds: count(attempt.seconds, false),
      final: attempt.final,
      outcome: attempt.outcome,
    });
  }
  function read(selectedMonth: unknown): CostMonth {
    const checked = monthSchema.safeParse(selectedMonth);
    if (!checked.success) throw new MapError('invalid_request', 400);
    const month = checked.data;
    captureDefaults(month);
    const coverage = database.prepare('SELECT startedAt FROM cost_coverage WHERE id = 1').get() as {
      startedAt: string;
    };
    const history = database
      .prepare(
        'SELECT version, updatedAt, assumptions FROM cost_assumptions WHERE month = ? ORDER BY version DESC',
      )
      .all(month) as { version: number; updatedAt: string; assumptions: string }[];
    const assumptionHistory = history.map((row) => ({
      ...(JSON.parse(row.assumptions) as CostAssumptions),
      version: row.version,
      updatedAt: row.updatedAt,
    }));
    const assumptions = assumptionHistory[0] ?? {
      ...defaultAssumptions,
      version: 0,
      updatedAt: null,
    };
    const attempts = database
      .prepare('SELECT * FROM cost_attempt WHERE month = ? ORDER BY startedAt, id')
      .all(month) as CostAttempt[];
    const totals = summarizeAttempts(attempts, assumptions.sekPerUsd);
    const renderUsd =
      assumptions.computeUsd +
      assumptions.diskGb * assumptions.diskUsdPerGb +
      assumptions.workspaceUsd;
    const totalUsd = renderUsd + totals.live.estimatedUsd + totals.terra.estimatedUsd;
    const coverageIncomplete = `${month}-01T00:00:00.000Z` < coverage.startedAt;
    return {
      month,
      generatedAt: new Date().toISOString(),
      coverageStartedAt: coverage.startedAt,
      coverageIncomplete,
      recordingUnavailable,
      assumptions,
      assumptionHistory,
      ...totals,
      render: { estimatedUsd: renderUsd, estimatedSek: renderUsd * assumptions.sekPerUsd },
      total: {
        estimatedUsd: totalUsd,
        estimatedSek: totalUsd * assumptions.sekPerUsd,
        incomplete:
          coverageIncomplete ||
          recordingUnavailable ||
          totals.live.uncertainAttempts > 0 ||
          totals.terra.uncertainAttempts > 0 ||
          totals.live.unpricedAttempts > 0 ||
          totals.terra.unpricedAttempts > 0,
      },
    };
  }
  function update(value: unknown) {
    const checked = settingsSchema.safeParse(value);
    if (!checked.success) throw new MapError('invalid_request', 400);
    const { month, version, ...assumptions } = checked.data;
    database
      .transaction(() => {
        const current = database
          .prepare('SELECT max(version) AS version FROM cost_assumptions WHERE month = ?')
          .get(month) as { version: number | null };
        if ((current.version ?? 0) !== version) throw new MapError('cost_assumptions_changed', 409);
        database
          .prepare('INSERT INTO cost_assumptions VALUES (?, ?, ?, ?)')
          .run(month, version + 1, new Date().toISOString(), JSON.stringify(assumptions));
      })
      .immediate();
    return read(month);
  }
  return { model, live, read, update };
}
