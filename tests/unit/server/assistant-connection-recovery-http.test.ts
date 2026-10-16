import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test.each([
  'registration unavailable',
  'registration missing client',
  'authorization not redirecting',
  'authorization foreign origin',
  'authorization wrong destination',
  'consent unavailable',
  'callback foreign origin',
  'callback wrong state',
  'callback missing code',
  'token exchange unavailable',
  'token missing credential',
  'token missing lifetime',
  'MCP unavailable',
  'draft tool rejected',
  'draft tool missing text',
  'draft tool invalid JSON',
] as const)(
  'a failed private connection (%s) exposes no conversation or grant and a fresh attempt can recover',
  async (failure) => {
    let injectFailure = true;
    const model = textModel(() => [modelMessage('Ett nytt, behörigt svar.')]);
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      async assistantDispatch(request, dispatch) {
        const path = new URL(request.url).pathname;
        if (!injectFailure) return dispatch(request);
        if (path === '/mcp' && request.method === 'POST' && failure.startsWith('draft tool ')) {
          const body = await request.clone().json();
          if (body.method === 'tools/call' && body.params.name === 'read_my_draft')
            return Response.json({
              jsonrpc: '2.0',
              id: body.id,
              result:
                failure === 'draft tool rejected'
                  ? { isError: true, content: [{ type: 'text', text: 'Synthetic refusal' }] }
                  : {
                      content:
                        failure === 'draft tool missing text'
                          ? []
                          : [{ type: 'text', text: 'not JSON' }],
                    },
            });
        }
        if (
          (failure === 'registration unavailable' && path === '/api/auth/oauth2/register') ||
          (failure === 'consent unavailable' && path === '/api/assistants/consent') ||
          (failure === 'token exchange unavailable' && path === '/api/auth/oauth2/token') ||
          (failure === 'MCP unavailable' && path === '/mcp')
        )
          return Response.json({ error: 'synthetic_service_outage' }, { status: 503 });
        const response = await dispatch(request);
        if (failure === 'registration missing client' && path === '/api/auth/oauth2/register')
          return Response.json({ client_id: null });
        if (path === '/api/auth/oauth2/authorize') {
          if (failure === 'authorization not redirecting') return new Response(null);
          if (failure === 'authorization foreign origin')
            return Response.redirect('https://other.example.test/assistant-consent');
          if (failure === 'authorization wrong destination')
            return Response.redirect(new URL('/another-consent', app.origin));
        }
        if (path === '/api/assistants/consent' && failure.startsWith('callback ')) {
          const callback = new URL((await response.json()).url);
          if (failure === 'callback foreign origin') callback.host = 'other.example.test';
          if (failure === 'callback wrong state') callback.searchParams.set('state', 'another');
          if (failure === 'callback missing code') callback.searchParams.delete('code');
          return Response.json({ url: callback.href });
        }
        if (path === '/api/auth/oauth2/token' && failure.startsWith('token missing ')) {
          const token = await response.json();
          if (failure === 'token missing credential') delete token.access_token;
          else delete token.expires_in;
          return Response.json(token);
        }
        return response;
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const start = () =>
      browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit });
    const failed = await start();
    expect(failed.status()).toBe(503);
    expect(await failed.json()).toEqual({ error: 'assistant_connection_failed' });
    expect(model.requests).toEqual([]);
    expect(
      (await (await browser.get(`${app.origin}/api/assistants/context`)).json()).connections,
    ).toEqual([]);
    expect((await browser.get(path.replace('/text-assistant', '/map'))).status()).toBe(200);
    injectFailure = false;
    const recovered = await start();
    expect(recovered.status(), await recovered.text()).toBe(201);
    expect(await recovered.json()).toMatchObject({ phase: 'ready', review: { version: 0 } });
    const connections = await (await browser.get(`${app.origin}/api/assistants/context`)).json();
    expect(connections.connections).toHaveLength(1);
    expect(model.requests).toEqual([]);
  },
);
