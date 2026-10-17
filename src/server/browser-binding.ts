import { createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { serializeSigned } from 'hono/utils/cookie';
import { rememberedLoginInformation } from '../shared/remembered-login.js';
import type { SessionStatus } from '../shared/session-activity.js';
import { storageConsentInformationVersion } from '../shared/storage-consent.js';
import type { Auth } from './auth.js';
import { stageAuthCallback } from './auth-callback-transaction.js';
import { installationAuthority } from './installation-authority.js';
import { linkingAttempt } from './login-methods.js';

const attemptLifetime = 10 * 60_000;
type Binding = {
  id: string;
  confirmed: number;
  revision: number;
  sessionId: string | null;
  expiresAt: number;
};
type Choice = {
  choiceSchemaVersion: number | null;
  rememberMe: number | null;
  informationVersion: number | null;
  choicePurpose: string | null;
  decidedAt: number | null;
};
type Attempt = Choice & {
  bindingId: string;
  revision: number;
  sessionId: string | null;
  expiresAt: number;
  provider: string | null;
};
type SessionPolicy = Choice & {
  activatedAt?: number | null;
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  absoluteExpiresAt: number | null;
  loginConfirmation: string | null;
  ordinaryStartedAt: number | null;
  lastActivityAt: number | null;
  idleWorkUntil?: number | null;
};
const ordinaryLifetime = 8 * 60 * 60_000;
const rememberedLifetime = 7 * 24 * 60 * 60_000;
function remembered(choice: Choice) {
  return (
    choice.choiceSchemaVersion === 1 &&
    choice.rememberMe === 1 &&
    choice.informationVersion === rememberedLoginInformation.version &&
    choice.choicePurpose === rememberedLoginInformation.purpose &&
    typeof choice.decidedAt === 'number' &&
    Number.isSafeInteger(choice.decidedAt) &&
    choice.decidedAt >= 0
  );
}
function rememberedSession(policy: SessionPolicy) {
  const created = new Date(policy.createdAt).getTime();
  return (
    remembered(policy) &&
    policy.decidedAt !== null &&
    (policy.decidedAt <= created ||
      (policy.activatedAt === policy.decidedAt &&
        policy.decidedAt < created + rememberedLifetime)) &&
    typeof policy.absoluteExpiresAt === 'number' &&
    Number.isSafeInteger(policy.absoluteExpiresAt) &&
    policy.absoluteExpiresAt > created &&
    policy.absoluteExpiresAt <= created + rememberedLifetime
  );
}
export function absoluteSessionDeadline(policy: SessionPolicy) {
  const created = new Date(policy.createdAt).getTime();
  return Math.min(
    new Date(policy.expiresAt).getTime(),
    policy.absoluteExpiresAt ?? Number.POSITIVE_INFINITY,
    rememberedSession(policy)
      ? created + rememberedLifetime
      : (policy.ordinaryStartedAt ?? created) + ordinaryLifetime,
  );
}
export function sessionDeadline(policy: SessionPolicy) {
  return Math.min(
    absoluteSessionDeadline(policy),
    rememberedSession(policy)
      ? Number.POSITIVE_INFINITY
      : Math.max(
          policy.lastActivityAt ?? new Date(policy.createdAt).getTime(),
          validWorkDeadline(policy) ? (policy.idleWorkUntil ?? 0) : 0,
        ) +
          30 * 60_000,
  );
}
function validWorkDeadline(policy: SessionPolicy) {
  return (
    Number.isSafeInteger(policy.idleWorkUntil) &&
    (policy.idleWorkUntil ?? 0) >= new Date(policy.createdAt).getTime() &&
    (policy.idleWorkUntil ?? 0) <= absoluteSessionDeadline(policy) + 30 * 60_000
  );
}
const deadline = sessionDeadline;
function responseHeaders(request: Request, response: Response) {
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
  return headers;
}

export function bindingCookieName(origin: string) {
  return origin.startsWith('https:') ? '__Host-skyttel_binding' : 'skyttel_binding';
}

function key(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function browserBindings(
  database: Database.Database,
  auth: Auth,
  origin: string,
  now: () => number = () => Date.now(),
) {
  const hasWorkDeadline = (
    database.prepare('PRAGMA table_info(session)').all() as { name: string }[]
  ).some((column) => column.name === 'idleWorkUntil');
  // Process-local tasks never resume. Resolve their bounded crash anchors
  // before background cleanup can examine the effective session policy.
  if (hasWorkDeadline) {
    try {
      if (database.inTransaction) throw new Error('cleanup_busy');
      let count: number;
      do {
        count = database
          .transaction(() => {
            const abandoned = database
              .prepare('SELECT * FROM session WHERE idleWorkUntil IS NOT NULL LIMIT 100')
              .all() as SessionPolicy[];
            for (const selected of abandoned)
              database
                .prepare('UPDATE session SET lastActivityAt = ?, idleWorkUntil = NULL WHERE id = ?')
                .run(
                  validWorkDeadline(selected)
                    ? Math.max(
                        selected.lastActivityAt ?? new Date(selected.createdAt).getTime(),
                        Math.min(now(), selected.idleWorkUntil ?? 0),
                      )
                    : selected.lastActivityAt,
                  selected.id,
                );
            return abandoned.length;
          })
          .immediate();
      } while (count === 100);
    } catch {
      console.error(JSON.stringify({ event: 'authentication_cleanup_failed' }));
      throw new Error('authentication_cleanup_failed');
    }
  }
  const cookieName = bindingCookieName(origin);
  const routes = new Hono();
  const completing = new Set<string>();
  // Only the committed revocation response may issue a key for a replacement
  // binding that the browser has not registered yet. No old-key redemption.
  const replacements = new WeakMap<Response, string>();
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
  const librarySession = (headers: Headers) => auth.api.getSession({ headers });
  function policy(id: string) {
    return database.prepare('SELECT * FROM session WHERE id = ?').get(id) as
      | SessionPolicy
      | undefined;
  }
  function activity(id: string) {
    const selected = policy(id);
    if (!selected || deadline(selected) <= now() || database.inTransaction) return false;
    database.prepare('UPDATE session SET lastActivityAt = ? WHERE id = ?').run(now(), id);
    return true;
  }
  async function rawSession(headers: Headers) {
    const current = await librarySession(headers);
    if (!current) return null;
    const protectedPolicy = policy(current.session.id);
    return protectedPolicy &&
      protectedPolicy.token === current.session.token &&
      deadline(protectedPolicy) > now()
      ? current
      : null;
  }
  function cookie(headers: Headers) {
    const values = (headers.get('cookie') ?? '').split(';').map((part) => part.trim());
    const matches = values.filter((part) => part.startsWith(`${cookieName}=`));
    return matches.length === 1
      ? matches[0].slice(cookieName.length + 1)
      : matches.length
        ? 'invalid'
        : null;
  }
  function recordedBinding(headers: Headers): Binding | undefined {
    const value = cookie(headers);
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return;
    return database.prepare('SELECT * FROM browser_binding WHERE id = ?').get(key(value)) as
      | Binding
      | undefined;
  }
  function lookup(headers: Headers): Binding | undefined {
    const binding = recordedBinding(headers);
    return binding && binding.expiresAt > now() ? binding : undefined;
  }
  function canReset(headers: Headers, current: unknown) {
    const value = cookie(headers);
    return (
      !current &&
      typeof value === 'string' &&
      /^[a-f0-9]{64}$/.test(value) &&
      !recordedBinding(headers)
    );
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
    const sameOriginRead =
      context.req.header('Origin') === undefined &&
      context.req.method === 'GET' &&
      (context.req.path === '/api/browser-binding/preference' ||
        context.req.path.startsWith('/api/browser-binding/results/')) &&
      context.req.header('Sec-Fetch-Site') === 'same-origin';
    if (
      (!sameOriginRead && context.req.header('Origin') !== origin) ||
      !canonicalRequest(context.req.raw)
    )
      return context.json({ error: 'forbidden' }, 403);
    await next();
  });
  function status(selected: SessionPolicy, binding: Binding): SessionStatus {
    const expiresAt = deadline(selected);
    const reason = expiresAt < absoluteSessionDeadline(selected) ? 'inactivity' : 'absolute';
    const identity = {
      sessionId: selected.id,
      bindingId: binding.id,
      bindingRevision: binding.revision,
    };
    return expiresAt <= now()
      ? { state: 'expired', serverTime: now(), reason, ...identity }
      : { state: 'active', serverTime: now(), expiresAt, reason, ...identity };
  }
  async function readStatus(headers: Headers): Promise<SessionStatus> {
    // Capture a known policy before the library can remove an expired row.
    const binding = recordedBinding(headers);
    const selected = binding?.sessionId ? policy(binding.sessionId) : undefined;
    const current = await session(headers);
    const fresh = recordedBinding(headers);
    if (binding && fresh?.id === binding.id && fresh.revision === binding.revision) {
      const latest = fresh.sessionId ? policy(fresh.sessionId) : undefined;
      if (current && latest?.id === current.session.id && latest.token === current.session.token)
        return status(latest, fresh);
      const ended = latest ?? (fresh.sessionId === null ? selected : undefined);
      if (
        fresh.confirmed &&
        ended &&
        ended.id === selected?.id &&
        (!latest || latest.token === selected.token) &&
        deadline(ended) <= now()
      )
        return status(ended, fresh);
    }
    return {
      state: 'anonymous',
      serverTime: now(),
      bindingId: fresh?.id,
      bindingRevision: fresh?.revision,
    };
  }
  routes.post('/status', async (context) =>
    context.json(await readStatus(context.req.raw.headers)),
  );
  routes.post('/activity', async (context) => {
    const body = await context.req.json().catch(() => null);
    if (!['write', 'speak', 'navigate', 'search', 'edit', 'save'].includes(body?.kind))
      return context.json({ error: 'invalid_request' }, 400);
    const current = await session(context.req.raw.headers);
    const selected = current && policy(current.session.id);
    const binding = lookup(context.req.raw.headers);
    if (!selected || !binding) return context.json({ error: 'unauthenticated' }, 401);
    if (database.inTransaction) return context.json({ error: 'binding_busy' }, 409);
    // Admission above validates the old deadline: activity arriving at the
    // exact end cannot resurrect a login. Absolute limits never move.
    activity(selected.id);
    return context.json(status(policy(selected.id) ?? selected, binding));
  });
  routes.post('/candidate', async (context) => {
    const headers = context.req.raw.headers;
    const current = await rawSession(headers);
    const recorded = recordedBinding(headers);
    const selected = recorded?.sessionId ? policy(recorded.sessionId) : undefined;
    // Only an explicit new login may retire a known expired binding. Its
    // session policy must also have expired: a binding cookie alone can never
    // terminate another user's live session, even if the binding deadline did.
    const expired =
      recorded &&
      (recorded.sessionId ? selected && deadline(selected) <= now() : recorded.expiresAt <= now());
    const existing = expired ? undefined : lookup(headers);
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
      (cookie(headers) && !previous && !expired)
    )
      return context.json(
        {
          error: existing?.sessionId ? 'binding_occupied' : 'binding_invalid',
          ...(canReset(headers, current) ? { canReset: true } : {}),
        },
        409,
      );
    if (database.inTransaction) return context.json({ error: 'binding_busy' }, 409);
    const candidate = randomBytes(32).toString('hex');
    database.transaction(() => {
      if (expired) database.prepare('DELETE FROM browser_binding WHERE id = ?').run(recorded.id);
      if (expired)
        database
          .prepare('DELETE FROM assistant_connection WHERE browserBindingId = ?')
          .run(recorded.id);
      if (previous && current) {
        database
          .prepare('DELETE FROM assistant_connection WHERE browserSessionId = ?')
          .run(current.session.id);
        database.prepare('DELETE FROM browser_binding WHERE id = ?').run(previous.id);
        database.prepare('DELETE FROM session WHERE id = ?').run(current.session.id);
      }
      database
        .prepare('INSERT INTO browser_binding (id, expiresAt) VALUES (?, ?)')
        .run(key(candidate), now() + attemptLifetime);
    })();
    return context.json({ candidate, cookieName, origin });
  });
  routes.post('/reset-check', async (context) => {
    const headers = context.req.raw.headers;
    const current = await rawSession(headers);
    if (!canReset(headers, current)) return context.json({ error: 'binding_invalid' }, 409);
    // This check removes no server state and gives no authentication authority.
    // The browser clears only its explicitly confirmed, unchanged cookie.
    return context.json({ status: 'reset_allowed' });
  });
  routes.post('/register', async (context) => {
    const binding = lookup(context.req.raw.headers);
    if (!binding) return context.json({ error: 'binding_invalid' }, 409);
    const current = binding.sessionId ? await rawSession(context.req.raw.headers) : null;
    if (binding.sessionId && current?.session.id !== binding.sessionId)
      return context.json({ error: 'binding_occupied' }, 409);
    if (database.inTransaction) return context.json({ error: 'binding_busy' }, 409);
    const result = database
      .prepare(
        'UPDATE browser_binding SET confirmed = 1 WHERE id = ? AND revision = ? AND sessionId IS ? AND expiresAt > ?',
      )
      .run(binding.id, binding.revision, binding.sessionId, now());
    if (result.changes !== 1) return context.json({ error: 'binding_invalid' }, 409);
    return context.json({ status: 'confirmed', revision: binding.revision });
  });
  routes.on(['GET', 'POST'], '/confirmation', async (context) => {
    const current = await session(context.req.raw.headers);
    const binding = lookup(context.req.raw.headers);
    const proof = context.req.query('proof');
    const selected = current && policy(current.session.id);
    if (
      !current ||
      !binding ||
      !selected ||
      !proof ||
      !/^[a-f0-9]{64}$/.test(proof) ||
      selected.loginConfirmation !== key(proof)
    )
      return context.json({ error: 'unconfirmed' }, 401);
    return context.json({
      status: 'confirmed',
      userId: current.user.id,
      sessionId: current.session.id,
      revision: binding.revision,
      remembered: rememberedSession(selected),
      informationVersion: selected.informationVersion,
      decidedAt: selected.decidedAt,
      expiresAt: absoluteSessionDeadline(selected),
      cookieName,
      origin,
    });
  });
  routes.on(['GET', 'POST'], '/preference', async (context) => {
    const current = await session(context.req.raw.headers);
    const selected = current && policy(current.session.id);
    if (!selected) return context.json({ error: 'unauthenticated' }, 401);
    return context.json({
      userId: current.user.id,
      remembered: rememberedSession(selected),
      sessionId: selected.id,
      bindingId: lookup(context.req.raw.headers)?.id,
      expiresAt: absoluteSessionDeadline(selected),
      inactiveAfterMs: 30 * 60_000,
      generation: installationAuthority(database)?.generation,
    });
  });
  routes.on(['GET', 'POST'], '/results/:id', async (context) => {
    const current = await session(context.req.raw.headers);
    if (!current) return context.json({ error: 'unauthenticated' }, 401);
    const result = database
      .prepare(
        "SELECT id, userId, status, kind = 'activate' AS remembered, completedAt, checkUntil, sessionExpiresAt AS expiresAt FROM storage_action_result WHERE id = ? AND userId = ? AND checkUntil > ?",
      )
      .get(context.req.param('id'), current.user.id, now());
    if (result)
      return context.json({
        ...result,
        remembered: Boolean((result as { remembered: number }).remembered),
      });
    const restoredFrom = installationAuthority(database)?.restoredFrom;
    if (
      restoredFrom &&
      restoredFrom !== 'legacy' &&
      context.req.query('generation') === restoredFrom
    )
      return context.json({
        id: context.req.param('id'),
        userId: current.user.id,
        status: 'unavailable_after_restore',
      });
    return context.json({ error: 'result_unavailable' }, 404);
  });
  routes.on('POST', ['/revoke', '/activate'], async (context) => {
    const activating = context.req.path.endsWith('/activate');
    const body = (await context.req.json().catch(() => null)) as {
      id?: unknown;
      sessionId?: unknown;
      bindingId?: unknown;
      informationVersion?: unknown;
      consentInformationVersion?: unknown;
      preferences?: unknown;
      rememberMe?: unknown;
    } | null;
    if (
      typeof body?.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id)
    )
      return context.json({ error: 'invalid_request' }, 400);
    if (
      activating &&
      (typeof body.sessionId !== 'string' ||
        typeof body.bindingId !== 'string' ||
        body.preferences !== true ||
        body.rememberMe !== true ||
        body.consentInformationVersion !== storageConsentInformationVersion ||
        body.informationVersion !== rememberedLoginInformation.version)
    )
      return context.json({ error: 'invalid_request' }, 400);
    const authContext = await auth.$context;
    const current = await session(context.req.raw.headers);
    const binding = lookup(context.req.raw.headers);
    if (!current || !binding) return context.json({ error: 'unauthenticated' }, 401);
    const token = randomBytes(32).toString('hex');
    const candidate = randomBytes(32).toString('hex');
    const signed = await serializeSigned(
      authContext.authCookies.sessionToken.name,
      token,
      authContext.secret,
      {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: origin.startsWith('https:'),
        ...(activating && current
          ? {
              expires: new Date(new Date(current.session.createdAt).getTime() + rememberedLifetime),
            }
          : {}),
      },
    );
    if (database.inTransaction) return context.json({ error: 'binding_busy' }, 409);
    const committed = database
      .transaction(() => {
        const fresh = lookup(context.req.raw.headers);
        const selected = policy(current.session.id);
        if (
          !fresh ||
          fresh.id !== binding.id ||
          fresh.revision !== binding.revision ||
          fresh.sessionId !== current.session.id ||
          (body.sessionId !== undefined && body.sessionId !== current.session.id) ||
          (body.bindingId !== undefined && body.bindingId !== fresh.id) ||
          !selected ||
          selected.token !== current.session.token ||
          deadline(selected) <= now() ||
          (activating && new Date(selected.createdAt).getTime() + rememberedLifetime <= now())
        )
          return null;
        // Reusing a correlation reference never repeats a mutation or supplies a
        // replacement key. Result recovery has its own authenticated read route.
        if (database.prepare('SELECT 1 FROM storage_action_result WHERE id = ?').get(body.id))
          return null;
        const completedAt = now();
        const expiresAt = activating
          ? new Date(selected.createdAt).getTime() + rememberedLifetime
          : Math.min(absoluteSessionDeadline(selected), completedAt + ordinaryLifetime);
        const ordinaryStartedAt = rememberedSession(selected)
          ? completedAt
          : (selected.ordinaryStartedAt ?? new Date(selected.createdAt).getTime());
        database.prepare('DELETE FROM login_link WHERE sessionId = ?').run(selected.id);
        database.prepare('DELETE FROM browser_binding WHERE id = ?').run(binding.id);
        database
          .prepare(`UPDATE session SET token = ?, rememberMe = ?, absoluteExpiresAt = ?,
        expiresAt = ?, ordinaryStartedAt = ?, lastActivityAt = ?, loginConfirmation = CASE WHEN ? THEN loginConfirmation ELSE NULL END,
        choiceSchemaVersion = 1, informationVersion = ?, choicePurpose = ?, decidedAt = ?, activatedAt = ? WHERE id = ?`)
          .run(
            token,
            activating ? 1 : 0,
            expiresAt,
            new Date(expiresAt).toISOString(),
            ordinaryStartedAt,
            rememberedSession(selected) ? completedAt : (selected.lastActivityAt ?? completedAt),
            activating ? 1 : 0,
            rememberedLoginInformation.version,
            rememberedLoginInformation.purpose,
            completedAt,
            activating ? completedAt : null,
            selected.id,
          );
        database
          .prepare('INSERT INTO browser_binding (id, sessionId, expiresAt) VALUES (?, ?, ?)')
          .run(key(candidate), selected.id, expiresAt);
        database
          .prepare(
            'UPDATE assistant_connection SET browserBindingId = ? WHERE browserSessionId = ?',
          )
          .run(key(candidate), selected.id);
        database
          .prepare(`INSERT INTO storage_action_result
        (id, userId, kind, status, completedAt, checkUntil, sessionExpiresAt)
        VALUES (?, ?, ?, 'completed', ?, ?, ?)`)
          .run(
            body.id,
            current.user.id,
            activating ? 'activate' : 'revoke',
            completedAt,
            completedAt + 86_400_000,
            expiresAt,
          );
        return {
          id: body.id,
          userId: current.user.id,
          status: 'completed',
          remembered: activating,
          completedAt,
          checkUntil: completedAt + 86_400_000,
          expiresAt,
          inactiveAfterMs: 30 * 60_000,
          sessionId: selected.id,
          bindingId: key(candidate),
          candidate,
          cookieName,
          origin,
        };
      })
      .immediate();
    if (!committed) return context.json({ error: 'revocation_rejected' }, 409);
    context.header('Set-Cookie', signed);
    const response = context.json(committed);
    replacements.set(response, key(candidate));
    return response;
  });
  return {
    status: readStatus,
    activity,
    work(id: string, until: number | undefined) {
      if (!hasWorkDeadline || database.inTransaction) return false;
      const selected = policy(id);
      if (!selected) return false;
      if (until !== undefined && until > now() && until <= now() + 30 * 60_000) {
        if (selected.idleWorkUntil === until) return false;
        database.prepare('UPDATE session SET idleWorkUntil = ? WHERE id = ?').run(until, id);
      } else {
        if (selected.idleWorkUntil == null) return false;
        database
          .prepare('UPDATE session SET lastActivityAt = ?, idleWorkUntil = NULL WHERE id = ?')
          .run(
            Math.max(
              selected.lastActivityAt ?? new Date(selected.createdAt).getTime(),
              Math.min(now(), selected.idleWorkUntil),
            ),
            id,
          );
      }
      return true;
    },
    routes,
    session,
    async output(request: Request, response: Response) {
      const headers = new Headers(response.headers);
      headers.delete('set-cookie');
      const issued = response.headers.getSetCookie();
      if (!issued.length) return response;
      const current = issued.some((item) =>
        item.split(';', 1)[0].split('=')[0].endsWith('better-auth.session_token'),
      )
        ? await rawSession(responseHeaders(request, response))
        : null;
      const selected = current && policy(current.session.id);
      const replacement = replacements.get(response);
      const binding = replacement
        ? (database.prepare('SELECT * FROM browser_binding WHERE id = ?').get(replacement) as
            | Binding
            | undefined)
        : lookup(request.headers);
      for (const item of issued) {
        const [pair, ...attributes] = item.split(';');
        const name = pair.split('=')[0];
        if (name.endsWith('better-auth.dont_remember') || name === cookieName) continue;
        if (!name.endsWith('better-auth.session_token')) {
          headers.append('set-cookie', item);
          continue;
        }
        if (attributes.some((attribute) => /^\s*max-age=0$/i.test(attribute))) {
          headers.append('set-cookie', item);
          continue;
        }
        if (
          !selected ||
          !binding ||
          binding.sessionId !== selected.id ||
          deadline(selected) <= now()
        )
          continue;
        headers.append(
          'set-cookie',
          `${pair}; Path=/; HttpOnly; SameSite=Lax${origin.startsWith('https:') ? '; Secure' : ''}${rememberedSession(selected) ? `; Expires=${new Date(deadline(selected)).toUTCString()}` : ''}`,
        );
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    async start(
      request: Request,
      operation: (request: Request) => Promise<Response>,
      linkingProvider?: string,
    ) {
      if (!canonicalRequest(request) || request.headers.get('origin') !== origin)
        return Response.json({ error: 'forbidden' }, { status: 403 });
      const binding = await authorized(request.headers);
      if (!binding) return Response.json({ error: 'binding_required' }, { status: 409 });
      const signingIn = new URL(request.url).pathname === '/api/auth/sign-in/social';
      const body = signingIn
        ? ((await request
            .clone()
            .json()
            .catch(() => null)) as Record<string, unknown> | null)
        : { provider: linkingProvider };
      if (
        signingIn &&
        (request.method !== 'POST' ||
          !body ||
          body.idToken ||
          !['google', 'microsoft'].includes(String(body.provider)))
      )
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      const decidedAt = now();
      let providerRequest = request;
      if (signingIn && body) {
        // additionalData is attacker-controlled. It must not inject link or
        // choice metadata into the provider's protected state.
        const {
          additionalData: _additionalData,
          rememberMe: _rememberMe,
          informationVersion: _version,
          ...providerBody
        } = body;
        providerRequest = new Request(request, { body: JSON.stringify(providerBody) });
      }
      const response = await operation(providerRequest);
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
          'INSERT INTO browser_binding_attempt (state, bindingId, revision, sessionId, expiresAt, choiceSchemaVersion, rememberMe, informationVersion, choicePurpose, decidedAt, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          key(state),
          binding.id,
          binding.revision,
          binding.sessionId,
          now() + attemptLifetime,
          1,
          0,
          rememberedLoginInformation.version,
          rememberedLoginInformation.purpose,
          decidedAt,
          String(body?.provider ?? ''),
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
        attempt.expiresAt <= now() ||
        (attempt.provider && !new URL(request.url).pathname.endsWith(`/${attempt.provider}`)) ||
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
          const current = await librarySession(responseHeaders(request, response));
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
                ? (database.prepare('SELECT * FROM session WHERE id = ?').get(binding.sessionId) as
                    | SessionPolicy
                    | undefined)
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
                registered.expiresAt <= now() ||
                (binding.sessionId && (!previous || deadline(previous) <= now()))
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
              const authenticatedAt = now();
              const expiresAt =
                authenticatedAt + (remembered(registered) ? rememberedLifetime : ordinaryLifetime);
              const confirmation = randomBytes(32).toString('hex');
              database
                .prepare(
                  'UPDATE session SET createdAt = ?, expiresAt = ?, choiceSchemaVersion = ?, rememberMe = ?, informationVersion = ?, choicePurpose = ?, decidedAt = ?, absoluteExpiresAt = ?, loginConfirmation = ? WHERE id = ?',
                )
                .run(
                  new Date(authenticatedAt).toISOString(),
                  new Date(expiresAt).toISOString(),
                  1,
                  remembered(registered) ? 1 : 0,
                  registered.informationVersion,
                  registered.choicePurpose,
                  registered.decidedAt,
                  expiresAt,
                  key(confirmation),
                  current.session.id,
                );
              if (binding.sessionId && current.session.id !== binding.sessionId)
                database
                  .prepare('DELETE FROM assistant_connection WHERE browserSessionId = ?')
                  .run(binding.sessionId);
              if (binding.sessionId && current.session.id !== binding.sessionId)
                database.prepare('DELETE FROM session WHERE id = ?').run(binding.sessionId);
              database
                .prepare('DELETE FROM browser_binding_attempt WHERE bindingId = ?')
                .run(binding.id);
              database
                .prepare(
                  'UPDATE browser_binding SET sessionId = ?, revision = revision + 1, expiresAt = ? WHERE id = ?',
                )
                .run(current.session.id, expiresAt, binding.id);
              const headers = new Headers(response.headers);
              const destination = new URL(headers.get('location') ?? '/', origin);
              destination.searchParams.set('loginConfirmation', confirmation);
              headers.set('location', destination.href);
              return new Response(response.body, { status: response.status, headers });
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
      const recorded = recordedBinding(request.headers);
      // Capture policy before Better Auth may naturally remove an expired row.
      const selected = recorded?.sessionId ? policy(recorded.sessionId) : undefined;
      const current = await librarySession(request.headers);
      const binding = recordedBinding(request.headers);
      function permitted(fresh: Binding) {
        if (!fresh.confirmed || (current && current.session.id !== fresh.sessionId)) return false;
        const protectedPolicy = (fresh.sessionId ? policy(fresh.sessionId) : undefined) ?? selected;
        if (protectedPolicy) {
          const expiresAt = deadline(protectedPolicy);
          return (
            Number.isFinite(expiresAt) &&
            (expiresAt <= now() || current?.session.token === protectedPolicy.token)
          );
        }
        // A cleaned session needs both proven natural expiry and its persisted
        // private task context. A binding cookie never ends live authority.
        return (
          Number.isFinite(fresh.expiresAt) &&
          fresh.expiresAt <= now() &&
          !!database
            .prepare(`SELECT 1 FROM assistant_connection
            WHERE browserBindingId = ? AND browserSessionId IS NOT NULL
            AND (? IS NULL OR browserSessionId = ?) AND taskExpiresAt > ?`)
            .get(fresh.id, fresh.sessionId, fresh.sessionId, now())
        );
      }
      if (
        !binding ||
        binding.revision !== recorded?.revision ||
        (binding.sessionId !== recorded.sessionId &&
          !(
            binding.sessionId === null &&
            selected &&
            Number.isFinite(deadline(selected)) &&
            deadline(selected) <= now()
          )) ||
        !permitted(binding)
      )
        return Response.json({ error: 'unauthenticated' }, { status: 401 });
      if (database.inTransaction) return Response.json({ error: 'binding_busy' }, { status: 409 });
      const changed = database
        .transaction(() => {
          const fresh = recordedBinding(request.headers);
          if (
            fresh?.revision !== binding.revision ||
            fresh.sessionId !== binding.sessionId ||
            !permitted(fresh)
          )
            return false;
          database
            .prepare('DELETE FROM browser_binding_attempt WHERE bindingId = ?')
            .run(binding.id);
          database
            .prepare(`DELETE FROM assistant_connection
            WHERE browserBindingId = ? OR browserSessionId = ?`)
            .run(binding.id, binding.sessionId);
          if (binding.sessionId)
            database.prepare('DELETE FROM session WHERE id = ?').run(binding.sessionId);
          database
            .prepare(
              'UPDATE browser_binding SET revision = revision + 1, expiresAt = ? WHERE id = ?',
            )
            .run(now() + attemptLifetime, binding.id);
          return true;
        })
        .immediate();
      return changed ? operation() : Response.json({ error: 'unauthenticated' }, { status: 401 });
    },
  };
}
