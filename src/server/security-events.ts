import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { buildIdentity } from '../shared/build-identity.js';
import { AdministrationError } from './administration.js';
import { MapError } from './map-error.js';

const operations = [
  'membership_role',
  'membership_remove',
  'invitation_create',
  'invitation_accept',
  'invitation_revoke',
  'grant_approve',
  'grant_revoke',
  'export_prepare',
  'export_download',
  'export_cancel',
  'event_delivery',
] as const;
type Operation = (typeof operations)[number];
const outcomes = [
  'succeeded',
  'unchanged',
  'rejected',
  'failed',
  'refused',
  'started',
  'completed',
  'cancelled',
  'suppressed',
] as const;
type Outcome = (typeof outcomes)[number];
const stages = [
  'request',
  'authorization',
  'mutation',
  'consent',
  'preparation',
  'download',
  'cleanup',
  'response',
] as const;
type Stage = (typeof stages)[number];

// These codes are a diagnostic contract. Never serialize a free-form error code.
const reasons = {
  committed: 'state_changed',
  no_change: 'already_in_state',
  invitation_replaced: 'prior_invitation_revoked',
  unauthenticated: 'authentication_required',
  forbidden: 'access_denied',
  invalid_request: 'malformed_request',
  user_not_found: 'target_unavailable',
  member_not_found: 'target_unavailable',
  invitation_not_found: 'target_unavailable',
  already_member: 'already_member',
  last_administrator: 'last_administrator',
  invitation_unavailable: 'invitation_unavailable',
  export_busy: 'export_busy',
  export_unavailable: 'export_unavailable',
  export_cancelled: 'cancelled',
  archive_too_large: 'archive_limit',
  archive_storage_unavailable: 'storage_unavailable',
  content_maintenance: 'content_unavailable',
  client_outdated: 'client_outdated',
  consent_refused: 'user_refused',
  consent_rejected: 'consent_not_approved',
  archive_ready: 'archive_prepared',
  download_started: 'stream_started',
  download_completed: 'server_stream_completed',
  download_cancelled: 'stream_cancelled',
  internal_failure: 'internal_failure',
  rejection_limit: 'rejection_detail_suppressed',
  delivery_loss: 'events_lost',
} as const;
type Code = keyof typeof reasons;
type References = {
  actorId?: string;
  householdId?: string;
  targetId?: string;
  targetUserId?: string;
};
type Details = {
  status?: number;
  previousRole?: string;
  role?: string;
  replacedCount?: number;
  count?: number;
};
export type SecurityEventSink = { available(): boolean; write(line: string): void };

// One listener per process, not per request/application. Node may emit an error
// even when write has a callback. Never report a logging failure through logging.
process.stderr.on('error', () => {});
const stderr: SecurityEventSink = {
  available: () =>
    !process.stderr.destroyed &&
    !process.stderr.errored &&
    !process.stderr.writableNeedDrain &&
    process.stderr.writableLength < 16_384,
  write: (line) => {
    process.stderr.write(line, () => {});
  },
};

function reference(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
}
function identityValue(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9.+_-]{1,80}$/.test(value) ? value : 'unknown';
}
const boundedCount = (value: number) => Math.min(1_000_000_000, Math.max(0, Math.trunc(value)));

export function createSecurityEvents({
  sink = stderr,
  identity = buildIdentity,
  now = () => Date.now(),
}: {
  sink?: SecurityEventSink;
  identity?: typeof buildIdentity;
  now?: () => number;
} = {}) {
  let windowStart = 0;
  let rejected = 0;
  let suppressed = 0;
  let lost = 0;
  function output(event: Record<string, unknown>) {
    try {
      if (!sink.available()) {
        lost = boundedCount(lost + 1);
        return false;
      }
      sink.write(`${JSON.stringify(event)}\n`);
      return true;
    } catch {
      lost = boundedCount(lost + 1);
      return false;
    }
  }
  function envelope(
    operation: Operation,
    operationReference: string,
    stage: Stage,
    outcome: Outcome,
    code: Code,
  ) {
    return {
      event: 'security_operation',
      schemaVersion: 1,
      reference: randomUUID(),
      operationReference: reference(operationReference) ?? 'unknown',
      at: new Date(now()).toISOString(),
      operation,
      outcome,
      reason: reasons[code],
      code,
      stage,
      version: identityValue(identity.version),
      commit: identityValue(identity.commit),
    };
  }
  function summary(code: 'rejection_limit' | 'delivery_loss', count: number) {
    return output({
      ...envelope('event_delivery', randomUUID(), 'request', 'suppressed', code),
      count,
    });
  }
  function emit(
    operation: Operation,
    operationReference: string,
    stage: Stage,
    outcome: Outcome,
    code: Code,
    refs: References,
    details: Details,
  ) {
    // Runtime validation also protects callers outside TypeScript and future adapters.
    if (
      !operations.includes(operation) ||
      !outcomes.includes(outcome) ||
      !stages.includes(stage) ||
      !Object.hasOwn(reasons, code)
    )
      return;
    if (lost && sink.available()) {
      const count = lost;
      lost = 0;
      if (!summary('delivery_loss', count)) lost = boundedCount(lost + count);
    }
    if (now() - windowStart >= 60_000) {
      if (suppressed) summary('rejection_limit', suppressed);
      windowStart = now();
      rejected = 0;
      suppressed = 0;
    }
    if (outcome === 'rejected' && ++rejected > 20) {
      suppressed = boundedCount(suppressed + 1);
      if (suppressed === 1) summary('rejection_limit', 1);
      return;
    }
    const event: Record<string, unknown> = envelope(
      operation,
      operationReference,
      stage,
      outcome,
      code,
    );
    for (const key of ['actorId', 'householdId', 'targetId', 'targetUserId'] as const) {
      const value = reference(refs[key]);
      if (value) event[key] = value;
    }
    if (
      Number.isInteger(details.status) &&
      (details.status as number) >= 100 &&
      (details.status as number) <= 599
    )
      event.status = details.status;
    for (const key of ['previousRole', 'role'] as const)
      if (['member', 'administrator', 'none'].includes(details[key] ?? ''))
        event[key] = details[key];
    if (Number.isSafeInteger(details.replacedCount) && (details.replacedCount as number) >= 0)
      event.replacedCount = boundedCount(details.replacedCount as number);
    output(event);
  }
  return {
    begin(operation: Operation) {
      return new SecurityOperation(operation, (op, stage, outcome, code, refs, details) => {
        try {
          emit(operation, op, stage, outcome, code, refs, details);
        } catch {
          lost = boundedCount(lost + 1);
        }
      });
    },
  };
}

export class SecurityOperation {
  operationReference = randomUUID();
  stage: Stage = 'request';
  recorded = false;
  reportedFailure = false;
  private refs: References = {};
  constructor(
    readonly operation: Operation,
    private readonly emit: (
      reference: string,
      stage: Stage,
      outcome: Outcome,
      code: Code,
      refs: References,
      details: Details,
    ) => void,
  ) {}
  /** Supply only identities verified by the operation's existing authorization/lookups. */
  known(refs: References) {
    for (const key of ['actorId', 'householdId', 'targetId', 'targetUserId'] as const)
      if (refs[key] !== undefined) this.refs[key] = refs[key];
  }
  record(outcome: Outcome, code: Code, details: Details = {}) {
    this.recorded = true;
    if (outcome === 'failed' || outcome === 'rejected' || outcome === 'cancelled')
      this.reportedFailure = true;
    this.emit(this.operationReference, this.stage, outcome, code, this.refs, details);
  }
  failure(error: unknown, status?: number | null) {
    const code =
      (error instanceof AdministrationError || error instanceof MapError) &&
      Object.hasOwn(reasons, error.code)
        ? (error.code as Code)
        : 'internal_failure';
    const responseStatus =
      status === null
        ? undefined
        : (status ??
          (error instanceof AdministrationError || error instanceof MapError ? error.status : 500));
    this.record(
      code === 'export_cancelled'
        ? 'cancelled'
        : responseStatus !== undefined && responseStatus < 500
          ? 'rejected'
          : 'failed',
      code,
      { status: responseStatus },
    );
  }
}

const scope = new AsyncLocalStorage<SecurityOperation>();
const defaultEvents = createSecurityEvents();
export function securityOperation(operation: Operation) {
  const current = scope.getStore();
  return current?.operation === operation ? current : defaultEvents.begin(operation);
}
export function securityActor(actorId: string) {
  scope.getStore()?.known({ actorId });
}

const endpoints: [string, RegExp, Operation][] = [
  ['POST', /^\/api\/households\/[^/]+\/members\/[^/]+\/role$/, 'membership_role'],
  ['POST', /^\/api\/households\/[^/]+\/members\/[^/]+\/revoke$/, 'membership_remove'],
  ['POST', /^\/api\/households\/[^/]+\/invitations$/, 'invitation_create'],
  ['POST', /^\/api\/invitations\/accept$/, 'invitation_accept'],
  ['POST', /^\/api\/households\/[^/]+\/invitations\/[^/]+\/revoke$/, 'invitation_revoke'],
  ['POST', /^\/api\/assistants\/consent$/, 'grant_approve'],
  ['POST', /^\/api\/assistants\/[^/]+\/revoke$/, 'grant_revoke'],
  ['POST', /^\/api\/households\/[^/]+\/exports$/, 'export_prepare'],
  ['GET', /^\/api\/households\/[^/]+\/exports\/[^/]+$/, 'export_download'],
  ['POST', /^\/api\/households\/[^/]+\/exports\/[^/]+\/cancel$/, 'export_cancel'],
];

export function securityEventMiddleware(
  events: ReturnType<typeof createSecurityEvents>,
): MiddlewareHandler {
  return async (context, next) => {
    const endpoint = endpoints.find(
      ([method, path]) => context.req.method === method && path.test(context.req.path),
    );
    if (!endpoint) return next();
    const operation = events.begin(endpoint[2]);
    await scope.run(operation, async () => {
      await next();
      if (context.res.status >= 400) {
        // Domain failures are already recorded at their actual boundary.
        if (!operation.recorded) {
          if (context.error) operation.failure(context.error, context.res.status);
          else {
            const code =
              context.res.status === 401
                ? 'unauthenticated'
                : context.res.status === 403
                  ? 'forbidden'
                  : context.res.status === 409
                    ? 'client_outdated'
                    : 'invalid_request';
            operation.record(
              context.res.status >= 500 ? 'failed' : 'rejected',
              context.res.status >= 500 ? 'internal_failure' : code,
              { status: context.res.status },
            );
          }
        } else if (context.error && !operation.reportedFailure)
          operation.failure(context.error, context.res.status);
      }
    });
  };
}
