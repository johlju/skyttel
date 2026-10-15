import { createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';

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
    if (existing && (!existing.sessionId || existing.sessionId === current?.session.id))
      return context.json({ candidate: cookie(headers), cookieName, origin });
    // An auth key without its binding grants only the right to terminate its
    // own identifiable old binding. It never grants protected application access.
    const previous = current
      ? (database
          .prepare('SELECT id FROM browser_binding WHERE sessionId = ?')
          .get(current.session.id) as { id: string } | undefined)
      : undefined;
    if (
      (existing?.sessionId && existing.sessionId !== current?.session.id) ||
      (cookie(headers) && !previous)
    )
      return context.json(
        { error: existing?.sessionId ? 'binding_occupied' : 'binding_invalid' },
        409,
      );
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
        return Response.redirect(new URL('/?error=binding_invalid', origin));
      const response = await operation();
      database.prepare('DELETE FROM browser_binding_attempt WHERE state = ?').run(key(state ?? ''));
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
      if (current && current.session.id !== binding.sessionId)
        database
          .prepare(
            'UPDATE browser_binding SET sessionId = ?, revision = revision + 1, expiresAt = ? WHERE id = ? AND revision = ?',
          )
          .run(
            current.session.id,
            new Date(current.session.expiresAt).getTime(),
            binding.id,
            binding.revision,
          );
      return response;
    },
  };
}
