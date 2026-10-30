import type Database from 'better-sqlite3';
import type {
  TraceDeliveryError,
  TraceSendingStatus,
  TraceSuspension,
} from '../shared/trace-sending.js';

/** stop must synchronously discard buffers and cancel active delivery where possible. */
export interface TraceDeliveryAdapter {
  start(): void;
  stop(): void;
}

export interface TraceSending {
  read(): TraceSendingStatus;
  canSend(): boolean;
  connect(connect: ConnectTraceDelivery): void;
  update(action: 'enable' | 'disable' | 'restart'): TraceSendingStatus | null;
  delivered(): void;
  dropped(category: TraceDeliveryError, count?: number): void;
  suspend(reason: TraceSuspension): void;
  close(): void;
}
export type ConnectTraceDelivery = (sending: TraceSending) => TraceDeliveryAdapter;

/** Only sending intent and recovery fences are durable. No diagnostic payload enters SQLite. */
export function traceSending(
  database: Database.Database,
  now: () => number = Date.now,
): TraceSending {
  const installed = !!database
    .prepare("SELECT 1 FROM sqlite_master WHERE name = 'trace_sending' AND type = 'table'")
    .get();
  const stored = installed
    ? (database.prepare('SELECT enabled, suspension FROM trace_sending WHERE id = 1').get() as
        | { enabled: number; suspension: TraceSuspension | null }
        | undefined)
    : undefined;
  let enabled = stored ? stored.enabled === 1 : true;
  let suspension = stored?.suspension ?? null;
  let adapter: TraceDeliveryAdapter | undefined;
  let lastSuccessfulDelivery: number | null = null;
  let droppedEvents = 0;
  let lastError: TraceDeliveryError | null = null;
  const canSend = () => !!adapter && enabled && suspension === null;
  function persist() {
    database
      .prepare(
        'INSERT INTO trace_sending (id, enabled, suspension) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, suspension = excluded.suspension',
      )
      .run(Number(enabled), suspension);
  }
  function stop() {
    try {
      adapter?.stop();
    } catch {
      lastError = 'export';
    }
  }
  function start() {
    if (!canSend()) return;
    try {
      adapter?.start();
    } catch {
      stop();
      adapter = undefined;
      lastError = 'export';
    }
  }
  function read(): TraceSendingStatus {
    return {
      connected: !!adapter,
      enabled,
      state: !enabled
        ? 'disabled'
        : suspension
          ? 'suspended'
          : adapter
            ? 'sending'
            : 'not_connected',
      suspension,
      lastSuccessfulDelivery,
      droppedEvents,
      lastError,
    };
  }
  return {
    read,
    canSend,
    connect(connect: ConnectTraceDelivery) {
      try {
        adapter = connect(this);
        start();
      } catch {
        lastError = 'export';
      }
    },
    update(action: 'enable' | 'disable' | 'restart') {
      if (action === 'restart' && !adapter) return null;
      const wasSending = canSend();
      if (action === 'disable') {
        enabled = false;
        try {
          persist();
        } finally {
          stop();
        }
      } else {
        const previous = { enabled, suspension };
        enabled = true;
        if (action === 'restart') suspension = null;
        try {
          persist();
        } catch (error) {
          enabled = previous.enabled;
          suspension = previous.suspension;
          throw error;
        }
        if (!wasSending) start();
      }
      return read();
    },
    delivered() {
      lastSuccessfulDelivery = now();
    },
    dropped(category: TraceDeliveryError, count = 1) {
      if (
        ![
          'quota',
          'credentials',
          'network',
          'timeout',
          'capacity',
          'oversized',
          'expired',
          'export',
        ].includes(category)
      )
        category = 'export';
      if (Number.isSafeInteger(count) && count > 0)
        droppedEvents = Math.min(Number.MAX_SAFE_INTEGER, droppedEvents + count);
      lastError = category;
    },
    suspend(reason: TraceSuspension) {
      if (reason !== 'quota' && reason !== 'credentials') return;
      suspension = reason;
      lastError = reason;
      try {
        persist();
      } finally {
        stop();
      }
    },
    close() {
      stop();
      adapter = undefined;
    },
  };
}
