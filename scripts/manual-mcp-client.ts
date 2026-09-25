import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';

// A disposable public OAuth/MCP client. Credentials and captured requests live
// only in this process; it never opens the application database or config files.
class ControlError extends Error {}
type Captured = { name: string; arguments: Record<string, unknown> };
type Tool = {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
  annotations?: { readOnlyHint?: boolean };
};
const emit = (event: string, values = {}) => console.log(JSON.stringify({ event, ...values }));

async function main() {
  const origin = new URL(process.argv[2] ?? 'http://localhost:3301');
  const port = Number(process.argv[3] ?? '47731');
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.href !== `${origin.origin}/` ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  )
    throw new ControlError('Use a loopback HTTP origin and a callback port from 0 to 65535.');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const scope = 'skyttel:read skyttel:write';
  const controller = new AbortController();
  let stopped = false;
  let input: ReturnType<typeof createInterface> | undefined;
  let finishCallback: (code: string | null) => void = () => {};
  const callbackCode = new Promise<string | null>((resolve) => {
    finishCallback = resolve;
  });
  let redirect: URL;
  const listener = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Connection', 'close');
    let callback: URL;
    try {
      callback = new URL(request.url ?? '/', redirect.origin);
    } catch {
      response.writeHead(400).end('Invalid callback.');
      return;
    }
    if (
      request.method !== 'GET' ||
      request.headers.host !== redirect.host ||
      callback.origin !== redirect.origin ||
      callback.pathname !== redirect.pathname ||
      callback.searchParams.getAll('state').length !== 1 ||
      callback.searchParams.get('state') !== state ||
      (callback.searchParams.has('code') && callback.searchParams.has('error')) ||
      (!callback.searchParams.has('error') && callback.searchParams.getAll('code').length !== 1)
    ) {
      response.writeHead(400).end('Invalid callback. Return to the original authorization link.');
      return;
    }
    response
      .writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('Return to the test-client terminal. This page contains no test results.');
    finishCallback(callback.searchParams.get('code'));
  });
  function stop() {
    stopped = true;
    controller.abort();
    finishCallback(null);
    input?.close();
    listener.closeAllConnections();
    listener.close();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let token = '';
  const captures = new Map<string, Captured>();
  try {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(port, '127.0.0.1', resolve);
    });
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new ControlError('Callback listener failed.');
    redirect = new URL(`http://127.0.0.1:${address.port}/callback`);
    const registration = await fetch(`${origin.origin}/api/auth/oauth2/register`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_type: 'native',
        client_name: 'Skyttel manual MCP controls',
        redirect_uris: [redirect.href],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope,
      }),
    });
    if (registration.status !== 201)
      throw new ControlError(`Registration HTTP ${registration.status}`);
    const { client_id: clientId } = await registration.json();
    if (typeof clientId !== 'string') throw new ControlError('Invalid registration response.');
    const authorize = new URL(`${origin.origin}/api/auth/oauth2/authorize`);
    authorize.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirect.href,
      scope,
      resource: `${origin.origin}/mcp`,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    emit('authorize', { url: authorize.href });
    const timeout = setTimeout(() => finishCallback(null), 10 * 60 * 1000);
    let code: string | null;
    try {
      code = await callbackCode;
    } finally {
      clearTimeout(timeout);
      listener.close();
    }
    if (stopped) return;
    if (!code) throw new ControlError('Authorization denied or timed out. Restart the client.');
    const exchanged = await fetch(`${origin.origin}/api/auth/oauth2/token`, {
      method: 'POST',
      signal: controller.signal,
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirect.href,
        resource: `${origin.origin}/mcp`,
      }),
    });
    if (!exchanged.ok) throw new ControlError(`Token exchange HTTP ${exchanged.status}`);
    const credentials = await exchanged.json();
    if (typeof credentials.access_token !== 'string')
      throw new ControlError('No access token received.');
    token = credentials.access_token;
    async function rpc(method: string, params: Record<string, unknown>) {
      const response = await fetch(`${origin.origin}/mcp`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });
      if (!response.ok) throw new ControlError(`MCP HTTP ${response.status}`);
      const body = await response.json();
      if (body.error || !body.result) throw new ControlError('Invalid MCP response.');
      return body.result;
    }
    async function call(name: string, args: Record<string, unknown> = {}) {
      const result = await rpc('tools/call', { name, arguments: args });
      if (typeof result.content?.[0]?.text !== 'string')
        throw new ControlError('Invalid MCP tool response.');
      return JSON.parse(result.content[0].text);
    }
    async function toolArguments(name: string, json: string, readOnly: boolean) {
      const catalog = await rpc('tools/list', {});
      const tool = (catalog.tools as Tool[]).find((item) => item.name === name);
      if (
        !tool ||
        tool.annotations?.readOnlyHint !== readOnly ||
        ['save_draft', 'prepare_save'].includes(name)
      )
        throw new ControlError(
          'Use an available tool with the correct command; capture-save handles saves.',
        );
      const args: unknown = JSON.parse(json);
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new ControlError('Tool arguments must be a JSON object.');
      const properties = tool.inputSchema.properties ?? {};
      if (
        Object.keys(args).some(
          (key) => !Object.hasOwn(properties, key) || ['version', 'contentVersion'].includes(key),
        ) ||
        (!readOnly &&
          (!Object.hasOwn(properties, 'version') || !Object.hasOwn(properties, 'contentVersion')))
      )
        throw new ControlError(
          "Use only the tool's documented arguments; versions are captured automatically.",
        );
      return args as Record<string, unknown>;
    }
    function captured(label: string) {
      const request = captures.get(label);
      if (!request) throw new ControlError('Unknown capture label.');
      return request;
    }
    function remember(label: string, value: Captured, review: unknown) {
      if (!/^[a-z][a-z0-9-]*$/.test(label) || captures.has(label)) {
        throw new ControlError(
          'Use a new lowercase capture label. Existing requests are never overwritten.',
        );
      }
      captures.set(label, value);
      emit('captured', { label, tool: value.name, arguments: value.arguments, review });
    }
    emit('ready', {
      message: 'Synthetic data only. Type help. Revoke this connection in Skyttel before quit.',
    });
    input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
      const [command, label = ''] = line.trim().split(/\s+/);
      try {
        if (command === 'quit') break;
        if (command === 'help') {
          emit('help', {
            commands: [
              'read',
              'map [query]',
              'tools',
              'read-tool TOOL JSON',
              'capture-tool LABEL TOOL JSON',
              'capture-save LABEL',
              'capture-object LABEL {"id":"manual-bank","type":"Bankkonto","name":"Betalkonto","identity":"unresolved"}',
              'send LABEL',
              'drop LABEL',
              'status LABEL',
              'discard OBJECT_ID',
              'quit',
            ],
          });
        } else if (command === 'tools') {
          emit('result', { value: await rpc('tools/list', {}) });
        } else if (command === 'read-tool' || command === 'capture-tool') {
          const parts = line
            .trim()
            .match(
              command === 'read-tool'
                ? /^read-tool\s+(\S+)\s+([\s\S]+)$/
                : /^capture-tool\s+\S+\s+(\S+)\s+([\s\S]+)$/,
            );
          if (!parts) throw new ControlError('Supply the tool name and one JSON object.');
          const [, name, json] = parts;
          const args = await toolArguments(name, json, command === 'read-tool');
          if (command === 'read-tool') {
            emit('result', { value: await call(name, args) });
          } else {
            const review = await call('read_my_draft');
            if (review.error) {
              emit('result', { value: review });
              continue;
            }
            remember(
              label,
              {
                name,
                arguments: {
                  ...args,
                  version: review.version,
                  contentVersion: review.contentVersion,
                },
              },
              review,
            );
          }
        } else if (command === 'read' || command === 'map') {
          const query = line.trim().slice(command.length).trim();
          emit('result', {
            value: await call(
              command === 'read' ? 'read_my_draft' : 'read_map',
              command === 'map' && query ? { query } : {},
            ),
          });
        } else if (command === 'capture-save' || command === 'capture-object') {
          const review = await call('read_my_draft');
          if (review.error) {
            emit('result', { value: review });
            continue;
          }
          const versions = { version: review.version, contentVersion: review.contentVersion };
          if (command === 'capture-save') {
            remember(
              label,
              { name: 'save_draft', arguments: { ...versions, operationId: randomUUID() } },
              review,
            );
          } else {
            const body = JSON.parse(
              line
                .trim()
                .slice(command.length + 1 + label.length)
                .trim(),
            );
            if (
              typeof body.id !== 'string' ||
              !body.id.startsWith('manual-') ||
              typeof body.name !== 'string' ||
              typeof body.type !== 'string' ||
              Object.keys(body).some((key) => !['id', 'name', 'type', 'identity'].includes(key)) ||
              (body.identity !== undefined &&
                !['unspecified', 'unresolved'].includes(body.identity))
            ) {
              throw new ControlError(
                'Use a manual- ID, exact type name, object name and optional identity.',
              );
            }
            const catalog = await call('read_type_catalog');
            const definitions = catalog.types.filter(
              (type: { name: string }) => type.name === body.type,
            );
            const saved = await call('read_map', { objectId: body.id });
            const prior = review.changes.find((change: { id: string }) => change.id === body.id);
            if (
              definitions.length !== 1 ||
              saved.objects.length ||
              prior?.before ||
              (prior && !prior.after)
            ) {
              throw new ControlError(
                'Requires one current type and a new, unsaved synthetic object.',
              );
            }
            remember(
              label,
              {
                name: 'propose_object',
                arguments: {
                  ...versions,
                  id: body.id,
                  baseRevision: null,
                  typeRevision: definitions[0].revision,
                  value: {
                    description: '',
                    ...prior?.after,
                    typeId: definitions[0].id,
                    name: body.name,
                    ...(body.identity ? { identity: body.identity } : {}),
                  },
                },
              },
              review,
            );
          }
        } else if (command === 'send' || command === 'drop' || command === 'status') {
          const request = captured(label);
          if (command !== 'send' && request.name !== 'save_draft')
            throw new ControlError('Requires a save capture.');
          if (command === 'status') {
            emit('result', {
              label,
              value: await call('read_save_operation', {
                operationId: request.arguments.operationId,
              }),
            });
          } else if (command === 'send') {
            emit('result', { label, value: await call(request.name, request.arguments) });
          } else {
            const prepared = await call('prepare_save', request.arguments);
            if (prepared.error) {
              emit('result', { label, value: prepared });
              continue;
            }
            const result = await call(request.name, request.arguments);
            if (result.receipt?.operationId !== request.arguments.operationId) {
              emit('result', { label, value: result });
              continue;
            }
            // Fault boundary: the completed response is deliberately not delivered
            // to the command user or retained for recovery. Read durable status next.
            emit('response-dropped', {
              label,
              outcome: 'unknown',
              message: 'Controlled post-commit response loss. Use status before any new work.',
            });
          }
        } else if (command === 'discard') {
          const review = await call('read_my_draft');
          emit('result', {
            value: await call('discard_proposal', {
              version: review.version,
              contentVersion: review.contentVersion,
              kind: 'object',
              id: label,
            }),
          });
        } else throw new ControlError('Unknown command. Type help.');
      } catch (error) {
        emit('error', {
          message:
            error instanceof ControlError
              ? error.message
              : 'Command failed. If a request may have been sent, check its status before new work.',
        });
      }
    }
  } finally {
    captures.clear();
    token = '';
    stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    emit('closed', {
      message:
        'In-memory credentials and captures released. Revoke the test connection in Skyttel.',
    });
  }
}

main().catch((error) => {
  emit('error', {
    message:
      error instanceof ControlError
        ? error.message
        : 'Client failed; no credentials were logged. Check the local setup.',
  });
  process.exitCode = 1;
});
