import { createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';
import { stageAuthCallback } from './auth-callback-transaction.js';
import { linkingAttempt } from './login-methods.js';

const attemptLifetime = 10 * 60_000;
type Binding = {
  id: string;
  confirmed: number;
  revision: number;
  sessionId: string | null;
  expiresAt: number;
};
type Attempt = { bindingId: string; revision: number; sessionId: string | null; expiresAt: number };

export function bindingCookieName(origin: string) {
  return origin.startsWith('https:') ? '__Host-skyttel_binding' : 'skyttel_binding';
}

function key(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function browserBindings(database: Database.Database, auth: Auth, origin: string) {
  const cookieName = bindingCookieName(origin);
  const routes = new Hono();
  const completing = new Set<string>();
  const invalidCallback = (request: Request) => {
    const state = new URL(request.url).searchParams.get('state');
    const linking = state && linkingAttempt(database, state);
    return new Response(null, {
      status: 302,
      headers: {
        location: new URL(linking ? '/login-methods?failed=1' : '/?error=binding_invalid', origin)
          .href,
      },
    });
  };
  function canonicalRequest(request: Request) {
    // TLS can terminate at the configured ingress. Preserve the public Host;
    // the browser separately confirms the exact HTTPS origin before writing.
    return new URL(request.url).host === new URL(origin).host;
  }
  const rawSession = (headers: Headers) => auth.api.getSession({ headers });
  function cookie(headers: Headers) {
    const values = (headers.get('cookie') ?? '').split(';').map((part) => part.trim());
    const matches = values.filter((part) => part.startsWith(`${cookieName}=`));
    return matches.length === 1
      ? matches[0].slice(cookieName.length + 1)
      : matches.length
        ? 'invalid'
        : null;
  }
  function lookup(headers: Headers): Binding | undefined {
    const value = cookie(headers);
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return;
    const binding = database
      .prepare('SELECT * FROM browser_binding WHERE id = ?')
      .get(key(value)) as Binding | undefined;
    return binding && binding.expiresAt > Date.now() ? binding : undefined;
  }
  async function session(headers: Headers) {
    const current = await rawSession(headers);
    const binding = lookup(headers);
    return current && binding?.confirmed && binding.sessionId === current.session.id
      ? current
      : null;
  }
  async function authorized(headers: Headers) {
    const binding = lookup(headers);
    if (!binding?.confirmed) return;
    if (binding.sessionId) {
      const current = await rawSession(headers);
      if (current?.session.id !== binding.sessionId) return;
    }
    const fresh = lookup(headers);
    return fresh?.revision === binding.revision && fresh.sessionId === binding.sessionId
      ? fresh
      : undefined;
  }
  routes.use('*', async (context, next) => {
    if (context.req.header('Origin') !== origin || !canonicalRequest(context.req.raw))
      return context.json({ error: 'forbidden' }, 403);
    await next();
  });
  routes.post('/candidate', async (context) => {
    const headers = context.req.raw.headers;
    const existing = lookup(headers);
    const current = await rawSession(headers);
    // An auth key without its binding grants only the right to terminate its
    // own identifiable old binding. It never grants protected application access.
    const previous = current
      ? (database
          .prepare('SELECT id FROM browser_binding WHERE sessionId = ?')
          .get(current.session.id) as { id: string } | undefined)
      : undefined;
    if (
      existing &&
      (!existing.sessionId || existing.sessionId === current?.session.id) &&
      (!previous || previous.id === existing.id)
    )
      return context.json({ candidate: cookie(headers), cookieName, origin });
    if (
      (existing?.sessionId && existing.sessionId !== current?.session.id) ||
      (cookie(headers) && !previous)
    )
      return context.json(
        { error: existing?.sessionId ? 'binding_occupied' : 'binding_invalid' },
        409,
      );
    if (database.inTransaction) return context.json({ error: 'binding_busy' }, 409);
    const candidate = randomBytes(32).toString('hex');
    database.transaction(() => {
      if (previous && current) {
        database.prepare('DELETE FROM browser_binding WHERE id = ?').run(previous.id);
        database.prepare('DELETE FROM session WHERE id = ?').run(current.session.id);
      }
      database
        .prepare('INSERT INTO browser_binding (id, expiresAt) VALUES (?, ?)')
        .run(key(candidate), Date.now() + attemptLifetime);
    })();
    return context.json({ candidate, cookieName, origin });
  });
  routes.post('/register', async (context) => {
    const binding = lookup(context.req.raw.headers);
    if (!binding) return context.json({ error: 'binding_invalid' }, 409);
    if (binding.sessionId && !(await authorized(context.req.raw.headers)))
      return context.json({ error: 'binding_occupied' }, 409);
    if (database.inTransaction) return context.json({ error: 'binding_busy' }, 409);
    const result = database
      .prepare(
        'UPDATE browser_binding SET confirmed = 1 WHERE id = ? AND revision = ? AND sessionId IS ? AND expiresAt > ?',
      )
      .run(binding.id, binding.revision, binding.sessionId, Date.now());
    if (result.changes !== 1) return context.json({ error: 'binding_invalid' }, 409);
    return context.json({ status: 'confirmed', revision: binding.revision });
  });
  return {
    routes,
    session,
    async start(request: Request, operation: () => Promise<Response>) {
      if (!canonicalRequest(request) || request.headers.get('origin') !== origin)
        return Response.json({ error: 'forbidden' }, { status: 403 });
      const binding = await authorized(request.headers);
      if (!binding) return Response.json({ error: 'binding_required' }, { status: 409 });
      const response = await operation();
      if (!response.ok) return response;
      const result = (await response.clone().json()) as { url?: string };
      const state = result.url ? new URL(result.url, origin).searchParams.get('state') : null;
      // Provider creation can await. Re-read authorization before recording the
      // attempt; the captured revision is also checked at callback entry.
      const fresh = await authorized(request.headers);
      if (!state || fresh?.id !== binding.id || fresh.revision !== binding.revision)
        return Response.json({ error: 'binding_invalid' }, { status: 409 });
      if (database.inTransaction) return Response.json({ error: 'binding_busy' }, { status: 409 });
      database
        .prepare(
          'INSERT INTO browser_binding_attempt (state, bindingId, revision, sessionId, expiresAt) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          key(state),
          binding.id,
          binding.revision,
          binding.sessionId,
          Date.now() + attemptLifetime,
        );
      return response;
    },
    async callback(request: Request, operation: () => Promise<Response>) {
      if (!canonicalRequest(request) || request.method !== 'GET') return invalidCallback(request);
      const state = new URL(request.url).searchParams.get('state');
      const attempt = state
        ? (database
            .prepare('SELECT * FROM browser_binding_attempt WHERE state = ?')
            .get(key(state)) as Attempt | undefined)
        : undefined;
      const binding = await authorized(request.headers);
      if (
        !attempt ||
        attempt.expiresAt <= Date.now() ||
        !binding ||
        attempt.bindingId !== binding.id ||
        attempt.revision !== binding.revision ||
        attempt.sessionId !== binding.sessionId
      )
        return invalidCallback(request);
      const attemptKey = key(state ?? '');
      if (completing.has(attemptKey)) return invalidCallback(request);
      completing.add(attemptKey);
      try {
        return await stageAuthCallback(database, operation, async (response, commit) => {
          const headers = new Headers(request.headers);
          const cookies = new Map(
            (headers.get('cookie') ?? '').split(';').map((item) => {
              const [name, ...value] = item.trim().split('=');
              return [name, value.join('=')];
            }),
          );
          for (const item of response.headers.getSetCookie()) {
            const [name, ...value] = item.split(';', 1)[0].split('=');
            cookies.set(name, value.join('='));
          }
          headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
          const current = await rawSession(headers);
          const location = response.headers.get('location');
          const destination = location ? new URL(location, origin) : undefined;
          const redirected =
            response.status >= 300 &&
            response.status < 400 &&
            destination?.origin === origin &&
            !['error', 'authError', 'failed'].some((name) => destination.searchParams.has(name));
          const linked =
            location &&
            new URL(location, origin).pathname === '/login-methods' &&
            !new URL(location, origin).search;
          const success =
            redirected && current && (current.session.id !== binding.sessionId || linked);
          // Better Auth can briefly hold a transaction for independent OAuth
          // client registration. Do not make this publication its savepoint.
          if (database.inTransaction) return invalidCallback(request);
          return database
            .transaction(() => {
              const fresh = lookup(request.headers);
              const registered = database
                .prepare('SELECT * FROM browser_binding_attempt WHERE state = ?')
                .get(attemptKey) as Attempt | undefined;
              const previous = binding.sessionId
                ? (database
                    .prepare('SELECT expiresAt FROM session WHERE id = ?')
                    .get(binding.sessionId) as { expiresAt: string } | undefined)
                : undefined;
              if (
                !fresh ||
                fresh.id !== binding.id ||
                fresh.revision !== binding.revision ||
                fresh.sessionId !== binding.sessionId ||
                !registered ||
                registered.bindingId !== binding.id ||
                registered.revision !== binding.revision ||
                registered.sessionId !== binding.sessionId ||
                registered.expiresAt <= Date.now() ||
                (binding.sessionId &&
                  (!previous || new Date(previous.expiresAt).getTime() <= Date.now()))
              )
                return invalidCallback(request);
              if (!success) {
                commit(['login_link', 'verification']);
                database
                  .prepare('DELETE FROM browser_binding_attempt WHERE state = ?')
                  .run(attemptKey);
                // A failed library response can contain a cookie minted before
                // a later hook failed. Never publish an uncommitted auth key.
                const headers = new Headers(response.headers);
                headers.delete('set-cookie');
                for (const cookie of response.headers.getSetCookie())
                  if (!cookie.split(';', 1)[0].split('=')[0].endsWith('better-auth.session_token'))
                    headers.append('set-cookie', cookie);
                return new Response(response.body, { status: response.status, headers });
              }
              commit();
              if (current.session.id === binding.sessionId) {
                // Linking publishes account changes under the same guard; it
                // does not replace the login or cancel independent login work.
                database
                  .prepare('DELETE FROM browser_binding_attempt WHERE state = ?')
                  .run(attemptKey);
                return response;
              }
              if (binding.sessionId && current.session.id !== binding.sessionId)
                database.prepare('DELETE FROM session WHERE id = ?').run(binding.sessionId);
              database
                .prepare('DELETE FROM browser_binding_attempt WHERE bindingId = ?')
                .run(binding.id);
              database
                .prepare(
                  'UPDATE browser_binding SET sessionId = ?, revision = revision + 1, expiresAt = ? WHERE id = ?',
                )
                .run(current.session.id, new Date(current.session.expiresAt).getTime(), binding.id);
              return response;
            })
            .immediate();
        });
      } catch {
        if (!database.inTransaction)
          database.prepare('DELETE FROM browser_binding_attempt WHERE state = ?').run(attemptKey);
        return invalidCallback(request);
      } finally {
        completing.delete(attemptKey);
      }
    },
    async logout(request: Request, operation: () => Promise<Response>) {
      if (!canonicalRequest(request) || request.headers.get('origin') !== origin)
        return Response.json({ error: 'forbidden' }, { status: 403 });
      const binding = await authorized(request.headers);
      if (!binding?.sessionId) return Response.json({ error: 'unauthenticated' }, { status: 401 });
      if (database.inTransaction) return Response.json({ error: 'binding_busy' }, { status: 409 });
      const changed = database
        .transaction(() => {
          const fresh = lookup(request.headers);
          if (fresh?.revision !== binding.revision || fresh.sessionId !== binding.sessionId)
            return false;
          database
            .prepare('DELETE FROM browser_binding_attempt WHERE bindingId = ?')
            .run(binding.id);
          database.prepare('DELETE FROM session WHERE id = ?').run(binding.sessionId);
          database
            .prepare(
              'UPDATE browser_binding SET revision = revision + 1, expiresAt = ? WHERE id = ?',
            )
            .run(Date.now() + attemptLifetime, binding.id);
          return true;
        })
        .immediate();
      return changed ? operation() : Response.json({ error: 'unauthenticated' }, { status: 401 });
    },
  };
}
