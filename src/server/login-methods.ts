import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';

export function stateKey(state: string) {
  return createHash('sha256').update(state).digest('hex');
}

export type LinkAttempt = {
  sessionId: string;
  userId: string;
  provider: string;
  stage: string;
  expiresAt: number;
};

export function linkingAttempt(database: Database.Database, state: string) {
  return database.prepare('SELECT * FROM login_link WHERE state = ?').get(stateKey(state)) as
    | LinkAttempt
    | undefined;
}

export function createLoginMethods(database: Database.Database, auth: Auth, origin: string) {
  // The supported deployment runs one application instance. Serialize each
  // session's linking operations across OAuth's asynchronous verification so
  // cancellation cannot report success while an account is being attached.
  const pending = new Map<string, Promise<void>>();
  async function exclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const result = (pending.get(sessionId) ?? Promise.resolve()).then(operation);
    const completion = result.then(
      () => {},
      () => {},
    );
    pending.set(sessionId, completion);
    try {
      return await result;
    } finally {
      if (pending.get(sessionId) === completion) pending.delete(sessionId);
    }
  }
  const routes = new Hono();
  routes.get('/login-methods', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    const providers = database
      .prepare('SELECT DISTINCT providerId FROM account WHERE userId = ? ORDER BY providerId')
      .all(session.user.id) as { providerId: string }[];
    const attempt = database
      .prepare('SELECT * FROM login_link WHERE sessionId = ?')
      .get(session.session.id) as LinkAttempt | undefined;
    return context.json({
      providers: providers.map(({ providerId }) => providerId),
      stage: attempt && attempt.expiresAt > Date.now() ? attempt.stage : null,
    });
  });
  routes.post('/login-methods/:step', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    if (context.req.header('Origin') !== origin) return context.json({ error: 'forbidden' }, 403);
    return exclusive(session.session.id, async () => {
      const step = context.req.param('step');
      if (step === 'cancel') {
        const attempt = database
          .prepare('SELECT stage FROM login_link WHERE sessionId = ?')
          .get(session.session.id) as { stage: string } | undefined;
        if (attempt?.stage === 'complete') return context.json({ status: 'complete' });
        database.prepare('DELETE FROM login_link WHERE sessionId = ?').run(session.session.id);
        return context.json({ status: 'cancelled' });
      }
      const body = await context.req.json().catch(() => null);
      const provider = body?.provider;
      if (!['prove', 'add'].includes(step) || !['google', 'microsoft'].includes(provider))
        return context.json({ error: 'invalid_request' }, 400);
      const existing = database
        .prepare('SELECT 1 FROM account WHERE userId = ? AND providerId = ?')
        .get(session.user.id, provider);
      const attempt = database
        .prepare('SELECT * FROM login_link WHERE sessionId = ?')
        .get(session.session.id) as LinkAttempt | undefined;
      if (
        step === 'prove'
          ? !existing
          : existing || attempt?.stage !== 'verified' || attempt.expiresAt <= Date.now()
      )
        return context.json({ error: 'verification_required' }, 409);
      // Consume the previous proof before issuing another OAuth request.
      database
        .prepare('DELETE FROM login_link WHERE sessionId = ? OR expiresAt <= ?')
        .run(session.session.id, Date.now());
      const response = await auth.api.linkSocialAccount({
        headers: context.req.raw.headers,
        body: {
          provider,
          callbackURL: '/login-methods',
          errorCallbackURL: '/login-methods?failed=1',
          disableRedirect: true,
        },
        asResponse: true,
      });
      if (!response.ok) return response;
      const { url } = (await response.clone().json()) as { url: string };
      const state = new URL(url).searchParams.get('state');
      if (!state) return context.json({ error: 'provider_error' }, 502);
      database
        .prepare(
          'INSERT INTO login_link (sessionId, userId, state, provider, stage, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          session.session.id,
          session.user.id,
          stateKey(state),
          provider,
          step,
          Date.now() + 10 * 60_000,
        );
      return response;
    });
  });
  return {
    routes,
    async handleCallback(request: Request) {
      const state = new URL(request.url).searchParams.get('state');
      const attempt = state ? linkingAttempt(database, state) : undefined;
      if (!attempt) return auth.handler(request);
      return exclusive(attempt.sessionId, () => handleAuthCallback(request, database, auth));
    },
  };
}

async function handleAuthCallback(request: Request, database: Database.Database, auth: Auth) {
  const state = new URL(request.url).searchParams.get('state');
  const attempt = state ? linkingAttempt(database, state) : undefined;
  if (!attempt) return auth.handler(request);
  const session = await auth.api.getSession({ headers: request.headers });
  if (
    attempt.expiresAt <= Date.now() ||
    attempt.sessionId !== session?.session.id ||
    !['prove', 'add'].includes(attempt.stage)
  )
    return Response.redirect(new URL('/login-methods?failed=1', request.url));
  let response: Response;
  try {
    response = await auth.handler(request);
  } catch {
    response = Response.redirect(new URL('/login-methods?failed=1', request.url));
  }
  const success =
    response.headers.get('location') === new URL('/login-methods', request.url).href ||
    response.headers.get('location') === '/login-methods';
  database
    .prepare('UPDATE login_link SET stage = ?, state = NULL WHERE sessionId = ? AND state = ?')
    .run(
      success ? (attempt.stage === 'prove' ? 'verified' : 'complete') : 'failed',
      attempt.sessionId,
      stateKey(state ?? ''),
    );
  return response;
}
