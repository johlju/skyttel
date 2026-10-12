import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

const units = (usd: number) => {
  if (!Number.isFinite(usd) || usd < 0 || usd > 1_000_000)
    throw new Error('invalid_evaluation_cost');
  return Math.ceil(usd * 1_000_000);
};

/** One persistent, atomic ledger shared by voice, backend, summary, judge and
 * any billed counting calls. Unknown charges keep their conservative hold. */
export class EvaluationBudget {
  private dispatchedCalls = 0;
  get callsStarted() {
    return this.dispatchedCalls;
  }
  /** Mark paid dispatch after reservation, across all provider adapters. */
  beginCall() {
    this.dispatchedCalls++;
  }
  constructor(
    private readonly db: Database.Database,
    config: {
      limitUsd?: number;
      priorUsd: number;
      priorSource: string;
      authorized: boolean;
    },
  ) {
    if (!config.authorized || !config.priorSource.trim())
      throw new Error('evaluation_not_authorized');
    const ceiling = config.limitUsd === undefined ? null : units(config.limitUsd);
    db.exec(`CREATE TABLE IF NOT EXISTS evaluation_budget (
      id INTEGER PRIMARY KEY CHECK (id = 1), ceiling INTEGER,
      prior INTEGER NOT NULL, source TEXT NOT NULL, stopped TEXT);
      CREATE TABLE IF NOT EXISTS evaluation_charge (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, reserved INTEGER NOT NULL,
      actual INTEGER, uncertain INTEGER NOT NULL DEFAULT 0);`);
    db.prepare(
      'INSERT OR IGNORE INTO evaluation_budget (id, ceiling, prior, source) VALUES (1, ?, ?, ?)',
    ).run(ceiling, units(config.priorUsd), config.priorSource);
    const saved = db.prepare('SELECT ceiling, prior, source FROM evaluation_budget').get() as
      | { ceiling: number | null; prior: number; source: string }
      | undefined;
    if (!saved) throw new Error('evaluation_budget_schema_incompatible');
    if (
      saved.ceiling !== ceiling ||
      saved.prior !== units(config.priorUsd) ||
      saved.source !== config.priorSource
    )
      throw new Error('evaluation_budget_configuration_changed');
  }
  snapshot() {
    const config = this.db.prepare('SELECT * FROM evaluation_budget WHERE id = 1').get() as {
      ceiling: number | null;
      prior: number;
      stopped: string | null;
    };
    const totals = this.db
      .prepare(
        'SELECT COALESCE(SUM(actual), 0) AS spent, COALESCE(SUM(CASE WHEN actual IS NULL THEN reserved ELSE 0 END), 0) AS held FROM evaluation_charge',
      )
      .get() as { spent: number; held: number };
    return {
      limitUsd: config.ceiling === null ? null : config.ceiling / 1e6,
      spentUsd: (config.prior + totals.spent) / 1e6,
      reservedUsd: totals.held / 1e6,
      availableUsd:
        config.ceiling === null
          ? null
          : (config.ceiling - config.prior - totals.spent - totals.held) / 1e6,
      stopped: Boolean(config.stopped),
      reason: config.stopped,
    };
  }
  reserve(kind: string, maximumUsd: number) {
    return (
      this.db.transaction(() => {
        const state = this.snapshot();
        if (state.reason) throw new Error(state.reason);
        const maximum = units(maximumUsd);
        if (state.availableUsd !== null && maximum > Math.round(state.availableUsd * 1e6))
          return undefined;
        const id = randomUUID();
        this.db
          .prepare('INSERT INTO evaluation_charge (id, kind, reserved) VALUES (?, ?, ?)')
          .run(id, kind, maximum);
        return id;
      })() ?? this.exceeded()
    );
  }
  private exceeded(): never {
    this.stop('evaluation_budget_exceeded');
    throw new Error('evaluation_budget_exceeded');
  }
  stop(reason: string) {
    this.db
      .prepare('UPDATE evaluation_budget SET stopped = COALESCE(stopped, ?) WHERE id = 1')
      .run(reason);
  }
  settle(id: string, actualUsd: number | null) {
    this.db.transaction(() => {
      const charge = this.db
        .prepare('SELECT reserved, actual FROM evaluation_charge WHERE id = ?')
        .get(id) as { reserved: number; actual: number | null } | undefined;
      if (!charge || charge.actual !== null) throw new Error('evaluation_charge_already_settled');
      if (actualUsd === null) {
        this.db.prepare('UPDATE evaluation_charge SET uncertain = 1 WHERE id = ?').run(id);
        this.stop('evaluation_usage_unknown');
      } else {
        const actual = units(actualUsd);
        this.db.prepare('UPDATE evaluation_charge SET actual = ? WHERE id = ?').run(actual, id);
        const available = this.snapshot().availableUsd;
        if (actual > charge.reserved || (available !== null && available < 0))
          this.stop('evaluation_cost_above_reservation');
      }
    })();
  }
}
