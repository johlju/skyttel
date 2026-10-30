import { createHash } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { buildIdentity } from '../shared/build-identity.js';
import { normalizeHouseholdName } from '../shared/household-name.js';
import type { TextAssistantView } from '../shared/text-assistant.js';
import { AdministrationError } from './administration.js';
import { administrationRoutes } from './administration-routes.js';
import type { ObserveAssistant } from './assistant-observation.js';
import { assistantRoutes } from './assistant-routes.js';
import type { Auth } from './auth.js';
import { authenticationCleanup } from './authentication-cleanup.js';
import { browserBindings } from './browser-binding.js';
import type { Config } from './config.js';
import { contentOwnerRoutes } from './content-owner-routes.js';
import { conversationConsents } from './conversation-consent.js';
import { conversationConsentRoutes } from './conversation-consent-routes.js';
import { costRoutes } from './cost-routes.js';
import { installationCosts } from './costs.js';
import { householdErasureRoutes } from './household-erasure-routes.js';
import { householdExportRoutes } from './household-export-routes.js';
import { householdImportRoutes } from './household-import-routes.js';
import { createHousehold, householdAccess, isFirstAdmin, isInitialized } from './households.js';
import { installationAuthority } from './installation-authority.js';
import type { LiveModelProfile, LiveSidebandFactory, LiveUsage } from './live-provider.js';
import { createLoginMethods } from './login-methods.js';
import { MapError } from './map.js';
import { mapRoutes } from './map-routes.js';
import { policyContactRoutes } from './policy-contact-routes.js';
import { profileImageRoutes } from './profile-image-routes.js';
import { imageUploadLimit } from './profile-images.js';
import { propertyWriteLimit } from './properties.js';
import { textAssistantRoutes } from './text-assistant.js';
import type { LocalDispatch } from './text-assistant-mcp.js';
import type { TextModelProfile, TextModelUsage } from './text-assistant-model.js';
import { themePreferenceRoutes } from './theme-preference-routes.js';
import { type ConnectTraceDelivery, traceSending } from './trace-sending.js';
import { traceSendingRoutes } from './trace-sending-routes.js';
import { voiceAssistantRoutes } from './voice-assistant.js';

export function createApp({
  config,
  database,
  auth: originalAuth,
  identity = buildIdentity,
  consentTextVersion,
  modelFetch,
  modelUsage,
  liveFetch,
  liveSideband,
  liveUsage,
  assistantDispatch,
  modelProfile,
  liveProfile,
  observe,
  traceDelivery,
  now = () => Date.now(),
}: {
  config: Config;
  database: Database.Database;
  auth: Auth;
  identity?: typeof buildIdentity;
  /** The version of the conversation consent text, when it is not the release's own. */
  consentTextVersion?: number;
  modelFetch?: typeof fetch;
  modelUsage?: TextModelUsage;
  liveFetch?: typeof fetch;
  liveSideband?: LiveSidebandFactory;
  liveUsage?: LiveUsage;
  assistantDispatch?: (request: Request, dispatch: LocalDispatch) => Response | Promise<Response>;
  modelProfile?: TextModelProfile;
  liveProfile?: LiveModelProfile;
  observe?: ObserveAssistant;
  traceDelivery?: ConnectTraceDelivery;
  /** Installation time in milliseconds since the Unix epoch. */
  now?: () => number;
}) {
  const app = new Hono();
  // Historical test installations can intentionally stop before this migration.
  const hasBindings = !!database
    .prepare("SELECT 1 FROM sqlite_master WHERE name = 'browser_binding' AND type = 'table'")
    .get();
  const bindings = hasBindings
    ? browserBindings(database, originalAuth, config.origin, now)
    : undefined;
  const auth = bindings
    ? ({
        ...originalAuth,
        api: {
          ...originalAuth.api,
          getSession: ((options: { headers: Headers }) =>
            bindings.session(options.headers)) as Auth['api']['getSession'],
        },
      } as Auth)
    : originalAuth;
  const costs = installationCosts(database);
  const sending = traceSending(database, now);
  if (traceDelivery) sending.connect(traceDelivery);
  const linking = createLoginMethods(database, auth, config.origin, bindings);
  const consents = conversationConsents(database, consentTextVersion);
  let revalidateWork: (() => void) | undefined;
  let revalidateVoice: (() => void) | undefined;
  app.use('*', async (context, next) => {
    try {
      await next();
    } finally {
      revalidateWork?.();
      revalidateVoice?.();
    }
    if (bindings) {
      const controlled = await bindings.output(context.req.raw, context.res);
      // Hono's response setter restores the previous Set-Cookie headers.
      // Replace the actual outgoing headers after the handler has completed.
      context.res.headers.delete('set-cookie');
      for (const cookie of controlled.headers.getSetCookie())
        context.res.headers.append('set-cookie', cookie);
    }
  });
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
      referrerPolicy: 'no-referrer',
    }),
  );
  app.use('/api/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    if (
      identity.commit !== 'development' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) &&
      !context.req.path.startsWith('/api/auth/') &&
      context.req.header('X-Skyttel-Build') !== `${identity.commit}:${identity.version}`
    )
      return context.json({ error: 'client_outdated' }, 409);
    await next();
  });
  app.use('/api/*', (context, next) =>
    context.req.method === 'POST' && /^\/api\/households\/[^/]+\/imports$/.test(context.req.path)
      ? next()
      : bodyLimit({
          maxSize:
            context.req.method === 'POST' &&
            /^\/api\/households\/[^/]+\/profile-images\/[^/]+$/.test(context.req.path)
              ? imageUploadLimit
              : context.req.method === 'POST' &&
                  /^\/api\/households\/[^/]+\/map\/object-form$/.test(context.req.path)
                ? imageUploadLimit + propertyWriteLimit + 32_768
                : context.req.method === 'POST' &&
                    /^\/api\/households\/[^/]+\/map\/(draft|relationship|relationship-form|resolve|discard-review)$/.test(
                      context.req.path,
                    )
                  ? propertyWriteLimit
                  : 16_384,
          onError: (failed) => failed.json({ error: 'invalid_request' }, 413),
        })(context, next),
  );
  app.onError((error, context) => {
    if (error instanceof AdministrationError || error instanceof MapError)
      return context.json({ error: error.code }, error.status);
    console.error(JSON.stringify({ event: 'request_failed' }));
    return context.json({ error: 'internal_error' }, 500);
  });
  function databaseReadiness() {
    const migrations = database
      .prepare('SELECT version, checksum FROM schema_migration ORDER BY version')
      .all() as { version: number; checksum: string }[];
    if (!migrations.length) throw new Error('database_not_ready');
    return {
      status: 'ready',
      schemaVersion: migrations.at(-1)?.version,
      schemaChecksum: createHash('sha256').update(JSON.stringify(migrations)).digest('hex'),
    };
  }
  app.get('/healthz', (context) => {
    context.header('Cache-Control', 'no-store');
    try {
      databaseReadiness();
      return context.json({ status: 'ok' });
    } catch {
      return context.json({ status: 'unavailable' }, 503);
    }
  });
  app.get('/api/version', (context) =>
    context.json({ ...identity, database: databaseReadiness() }),
  );
  if (bindings) app.route('/api/browser-binding', bindings.routes);
  app.route('/api', policyContactRoutes(database, auth, config));
  const authRoutes = new Set([
    '/api/auth/sign-in/social',
    '/api/auth/callback/google',
    '/api/auth/callback/microsoft',
    '/api/auth/sign-out',
    '/api/auth/get-session',
    '/api/auth/.well-known/oauth-authorization-server',
    '/api/auth/jwks',
    '/api/auth/oauth2/authorize',
    '/api/auth/oauth2/register',
    '/api/auth/oauth2/token',
    '/api/auth/oauth2/revoke',
  ]);
  app.on(['GET', 'POST'], '/api/auth/*', async (context) => {
    if (!authRoutes.has(context.req.path)) return context.json({ error: 'not_found' }, 404);
    if (
      context.req.path === '/api/auth/oauth2/authorize' ||
      context.req.path === '/api/auth/oauth2/register'
    ) {
      const url = new URL(context.req.url);
      if (context.req.path === '/api/auth/oauth2/authorize')
        url.searchParams.set('prompt', 'consent');
      const request = new Request(url, {
        method: context.req.method,
        headers: new Headers(context.req.raw.headers),
        ...(context.req.method === 'POST' ? { body: await context.req.raw.arrayBuffer() } : {}),
        signal: context.req.raw.signal,
      });
      // Better Auth's internal session lookup must not accept an auth cookie
      // which Skyttel's browser-binding boundary rejects. Keep its ordinary
      // anonymous OAuth/login response and validation behavior.
      if (bindings && !(await bindings.session(request.headers))) request.headers.delete('cookie');
      return auth.handler(request);
    }
    if (context.req.path === '/api/auth/get-session' && bindings)
      return context.json(await bindings.session(context.req.raw.headers));
    if (context.req.path === '/api/auth/sign-in/social' && bindings)
      return bindings.start(context.req.raw, (request) => auth.handler(request));
    if (context.req.path === '/api/auth/sign-out' && bindings)
      return bindings.logout(context.req.raw, () => auth.handler(context.req.raw));
    if (context.req.path.startsWith('/api/auth/callback/'))
      return bindings
        ? linking.handleCallback(context.req.raw, (operation) =>
            bindings.callback(context.req.raw, operation),
          )
        : linking.handleCallback(context.req.raw);
    return auth.handler(context.req.raw);
  });

  app.get('/api/bootstrap', async (context) => {
    const providers = ['google', 'microsoft'] as const;
    let session = await auth.api.getSession({ headers: context.req.raw.headers });
    const sessionStatus = !session ? await bindings?.status(context.req.raw.headers) : undefined;
    if (!session && sessionStatus?.state === 'active')
      session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session)
      return context.json({
        status: 'anonymous',
        providers,
        operator: false,
        ...(installationAuthority(database)?.restoredFrom ? { restored: true } : {}),
        sessionStatus:
          sessionStatus && (sessionStatus.state === 'expired' || sessionStatus.bindingId)
            ? sessionStatus
            : undefined,
      });
    const user = { id: session.user.id, name: session.user.name };
    const loginId = session.session.id;
    const operator = isFirstAdmin(database, user.id, config);
    const household = householdAccess(database, user.id);
    if (household)
      return context.json({ status: 'ready', providers, user, household, operator, loginId });
    if (!isInitialized(database) && isFirstAdmin(database, user.id, config)) {
      return context.json({ status: 'setup', providers, user, operator, loginId });
    }
    return context.json({ status: 'forbidden', providers, user, operator, loginId });
  });

  app.post('/api/households', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    if (context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    if (
      context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    ) {
      return context.json({ error: 'invalid_request' }, 400);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'invalid_request' }, 400);
    }
    if (!body || typeof body !== 'object' || !('name' in body)) {
      return context.json({ error: 'invalid_request' }, 400);
    }
    const name = normalizeHouseholdName(body.name);
    if (name === null) {
      return context.json({ error: 'invalid_request' }, 400);
    }
    const result = createHousehold(database, config, session.user.id, name);
    if ('error' in result) {
      return context.json({ error: result.error }, result.error === 'forbidden' ? 403 : 409);
    }
    return context.json(result, 201);
  });

  app.get('/api/households/:id', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    const household = householdAccess(database, session.user.id, context.req.param('id'));
    if (!household) return context.json({ error: 'forbidden' }, 403);
    return context.json({ household });
  });
  app.route('/api', administrationRoutes(database, auth, config.origin));
  app.route('/api', costRoutes(database, auth, config, costs));
  app.route('/api', traceSendingRoutes(database, auth, config, sending));
  app.route('/api', contentOwnerRoutes(database, auth, config.origin));
  app.route('/api', householdExportRoutes(database, auth, config.origin));
  app.route('/api', householdErasureRoutes(database, auth, config.origin));
  app.route('/api', householdImportRoutes(database, auth, config.origin));
  app.route('/api', linking.routes);
  app.route('/api', profileImageRoutes(database, auth, config.origin));
  app.route('/api', themePreferenceRoutes(database, auth, config.origin));
  app.route('/', assistantRoutes(database, auth, config.origin));
  let stopVoice: ((sessionId: string) => void) | undefined;
  let retireVoiceWork: ((sessionId: string) => void) | undefined;
  let summarizeVoice: ((sessionId: string, signal: AbortSignal) => Promise<void>) | undefined;
  let newVoiceConversation:
    | ((view: TextAssistantView, deferVoiceClose?: boolean) => void)
    | undefined;
  const dispatchAssistant: LocalDispatch = (request) =>
    assistantDispatch ? assistantDispatch(request, (next) => app.fetch(next)) : app.fetch(request);
  const textAssistant = textAssistantRoutes({
    database,
    auth,
    config,
    consents,
    now,
    dispatch: dispatchAssistant,
    onWork: (id, until) => {
      if (bindings?.work(id, until)) revalidateVoice?.();
    },
    onActivity: (id) => {
      if (bindings?.activity(id)) revalidateVoice?.();
    },
    modelFetch,
    modelProfile,
    voiceTokens: liveProfile?.tokens,
    observe,
    modelUsage: (attempt) => {
      costs.model(attempt);
      modelUsage?.(attempt);
    },
    onStop: (sessionId) => stopVoice?.(sessionId),
    onResetStart: (sessionId) => retireVoiceWork?.(sessionId),
    onSummary: (sessionId, signal) => summarizeVoice?.(sessionId, signal),
    onNewConversation: (view, deferVoiceClose) => newVoiceConversation?.(view, deferVoiceClose),
  });
  app.route('/api', textAssistant.routes);
  app.route('/api', mapRoutes(database, auth, config.origin, textAssistant.checkManualSave));
  revalidateWork = textAssistant.stopUnauthorizedWork;
  app.route(
    '/api',
    conversationConsentRoutes(
      database,
      auth,
      config.origin,
      consents,
      textAssistant.endConversations,
    ),
  );
  const voiceAssistant = voiceAssistantRoutes({
    now,
    voiceAccess: textAssistant.voiceAccess,
    expireVoiceWork: textAssistant.expireVoiceWork,
    config,
    liveProfile,
    dispatch: dispatchAssistant,
    liveFetch,
    liveSideband,
    liveUsage,
    recordUsage: costs.live,
    interrupt: textAssistant.interrupt,
    conversation: textAssistant.conversation,
    transcript: textAssistant.transcript,
    voiceInput: textAssistant.voiceInput,
    observe,
    contextUsage: textAssistant.contextUsage,
    prepareVoiceContext: textAssistant.prepareVoiceContext,
  });
  revalidateVoice = voiceAssistant.revalidate;
  stopVoice = voiceAssistant.stopSession;
  retireVoiceWork = voiceAssistant.retireSessionWork;
  summarizeVoice = voiceAssistant.summarizeSession;
  newVoiceConversation = voiceAssistant.newConversation;
  app.route('/api', voiceAssistant.routes);
  const stopCleanup = hasBindings
    ? authenticationCleanup({
        database,
        now,
        revalidate: () => {
          revalidateWork?.();
          revalidateVoice?.();
        },
      })
    : undefined;
  app.all('/api/*', (context) => context.json({ error: 'not_found' }, 404));
  app.use('/assets/*', serveStatic({ root: './dist/client' }));
  app.get(
    '*',
    async (context, next) => {
      context.header('Cache-Control', 'no-store');
      await next();
    },
    serveStatic({ path: './dist/client/index.html' }),
  );
  return Object.assign(app, {
    prepareTaskDelivery: textAssistant.prepareDelivery,
    summarizeForEvaluation: textAssistant.summarizeForEvaluation,
    close: async () => {
      stopCleanup?.();
      sending.close();
      await voiceAssistant.close();
      await textAssistant.close();
    },
  });
}
