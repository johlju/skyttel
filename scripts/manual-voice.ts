import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import Database from 'better-sqlite3';
import { alex, createInstallation, robin } from '../tests/support/installation.js';
import { liveBrowserFixtureSource } from '../tests/support/live-browser.js';
import { liveProvider } from '../tests/support/live-provider.js';
import {
  lastToolResult,
  type ModelRequest,
  modelMessage,
  modelTool,
  textModel,
} from '../tests/support/text-model.js';

type Pending = {
  request: ModelRequest;
  resolve: (output: unknown[]) => void;
  reject: (error: Error) => void;
};
const emit = (event: string, values = {}) => console.log(JSON.stringify({ event, ...values }));

async function main() {
  if (process.env.NODE_ENV === 'production' || process.argv.length > 2)
    throw new Error('Run without arguments in the development environment.');
  process.umask(0o077);
  const pending = new Map<string, Pending>();
  let holdSave = false;
  let releaseSave: (() => void) | undefined;
  let sequence = 0;
  let offset = 0;
  let textContextPercent: number | undefined;
  const live = liveProvider();
  let retiredContextSource:
    | (typeof live.channels extends Map<string, infer Channel> ? Channel : never)
    | undefined;
  let voiceFailureStatus: 401 | 503 | undefined;
  function describe(id: string, item: Pending) {
    const user = item.request.input.findLast((part) => part.role === 'user');
    const current = user && typeof user.content === 'string' ? JSON.parse(user.content) : {};
    return {
      id,
      message: current.message,
      input: item.request.input,
      draft: current.draft,
      lastToolResult: lastToolResult(item.request),
      tools: item.request.tools.map((tool) => tool.name),
    };
  }
  const model = textModel(
    (request) =>
      new Promise<unknown[]>((resolve, reject) => {
        const id = String(++sequence);
        const item = { request, resolve, reject };
        pending.set(id, item);
        emit('held', describe(id, item));
        // Delayed external results remain releasable after cancellation. The real
        // application's task/version checks, not this fixture, must reject them.
      }),
  );
  const app = await createInstallation(undefined, {
    modelFetch: async (input, init) => {
      const response = await model.provider(input, init);
      if (textContextPercent === undefined) return response;
      const body = await response.json();
      body.usage.output_tokens = textContextPercent === 0 ? 0 : 30;
      body.usage.input_tokens = 10_500 * textContextPercent - body.usage.output_tokens;
      body.usage.total_tokens = body.usage.input_tokens + body.usage.output_tokens;
      body.usage.input_tokens_details.cached_tokens = Math.min(20, body.usage.input_tokens);
      body.usage.output_tokens_details.reasoning_tokens = Math.min(10, body.usage.output_tokens);
      return Response.json(body, { headers: response.headers });
    },
    liveFetch: (url, init) =>
      voiceFailureStatus
        ? Promise.resolve(
            Response.json(
              { error: { message: 'controlled_voice_failure' } },
              { status: voiceFailureStatus },
            ),
          )
        : live.provider(url, init),
    liveSideband: live.attach,
    browserProviderScript: liveBrowserFixtureSource,
    assistantDispatch: async (request, dispatch) => {
      const body =
        request.method === 'POST'
          ? await request
              .clone()
              .json()
              .catch(() => null)
          : null;
      const response = await dispatch(request);
      if (holdSave && body?.method === 'tools/call' && body.params?.name === 'prepare_save') {
        emit('save-registered', { operationId: body.params.arguments.operationId });
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
        releaseSave = undefined;
      }
      return response;
    },
  });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const releaseAll = () => {
    releaseSave?.();
    for (const item of pending.values()) item.reject(new Error('controlled_provider_shutdown'));
    pending.clear();
  };
  function voiceEvent(type: string, values: Record<string, unknown>) {
    if (live.channels.size !== 1)
      throw new Error('Start exactly one voice session in this fixture.');
    const id = [...live.channels.keys()][0];
    live.emit(id, { type, event_id: randomUUID(), ...values });
    return id;
  }
  try {
    emit('ready', {
      origin: app.origin,
      directory: app.directory,
      message:
        'Disposable controlled voice: no hardware microphone, speech recognition, real provider or API key. Forward this port privately, sign in with Google as Alex and choose Prata med Skyttel. Type help.',
    });
    for await (const raw of input) {
      const line = raw.trim();
      const [command, id = ''] = line.split(/\s+/);
      try {
        if (command === 'quit') break;
        if (command === 'help') {
          emit('help', {
            commands: [
              'seed-family',
              'identity alex|robin',
              'sessions',
              'voice-failure startup|administration|off',
              'user TEXT',
              'assistant TEXT',
              'delegate',
              'usage SECONDS',
              'context PERCENT',
              'text-context PERCENT',
              'capture-context-source',
              'context-old PERCENT',
              'context-invalid',
              'final SECONDS',
              'finalize on|off',
              'drop',
              'hold-save on|off',
              'release-save',
              'pending',
              'tool REQUEST TOOL JSON',
              'reply REQUEST TEXT',
              'fail REQUEST',
              'available on|off',
              'restart',
              'quit',
            ],
          });
          continue;
        }
        if (command === 'hold-save') {
          if (id !== 'on' && id !== 'off') throw new Error('Use hold-save on or off.');
          holdSave = id === 'on';
          emit('hold-save', { enabled: holdSave });
          continue;
        }
        if (command === 'release-save') {
          if (!releaseSave) throw new Error('Wait for save-registered before releasing.');
          releaseSave();
          emit('save-released');
          continue;
        }
        if (command === 'voice-failure') {
          if (!['startup', 'administration', 'off'].includes(id))
            throw new Error('Use voice-failure startup, administration or off.');
          voiceFailureStatus = id === 'startup' ? 503 : id === 'administration' ? 401 : undefined;
          emit('voice-failure', { group: id });
          continue;
        }
        if (command === 'sessions') {
          emit('sessions', { sessions: [...live.channels.keys()], sent: live.sent });
          continue;
        }
        if (command === 'identity') {
          if (id !== 'alex' && id !== 'robin') throw new Error('Use identity alex or robin.');
          app.setIdentity(id === 'alex' ? alex : robin);
          emit('identity', { name: id });
          continue;
        }
        if (command === 'seed-family') {
          // Fixture arrangement only, before anyone signs in. Never reset an
          // existing household or seed partially over an initialized app.
          const database = new Database(join(app.directory, 'skyttel.db'), {
            readonly: true,
            fileMustExist: true,
          });
          try {
            if (database.prepare('SELECT 1 FROM user LIMIT 1').get())
              throw new Error('Family setup requires a fresh launcher before any sign-in.');
          } finally {
            database.close();
          }
          const household = app.seedDemo();
          emit('seeded', { householdId: household.id, householdName: household.name });
          continue;
        }
        if (command === 'pending') {
          emit('pending', { requests: [...pending].map(([key, item]) => describe(key, item)) });
          continue;
        }
        if (command === 'restart') {
          releaseAll();
          await app.restart();
          emit('restarted', { origin: app.origin });
          continue;
        }
        if (command === 'user' || command === 'assistant') {
          const delta = line.slice(command.length).trim();
          if (!delta) throw new Error('Supply a synthetic transcript fragment.');
          voiceEvent(`session.${command === 'user' ? 'input' : 'output'}_transcript.delta`, {
            delta,
            start_ms: offset,
            end_ms: offset + 100,
          });
          offset += 100;
        } else if (command === 'delegate') {
          voiceEvent('session.delegation.created', {
            offset_ms: offset,
            delegation: { id: `delegation_${randomUUID()}`, type: 'delegation', target: 'client' },
          });
        } else if (command === 'capture-context-source') {
          if (live.channels.size !== 1) throw new Error('Start exactly one voice session.');
          retiredContextSource = [...live.channels.values()][0];
        } else if (command === 'context-invalid') {
          voiceEvent('session.usage.updated', {
            usage: { seconds: 0 },
            context_window: { usage_ratio: '0.99' },
          });
        } else if (
          command === 'context' ||
          command === 'text-context' ||
          command === 'context-old'
        ) {
          const percent = Number(id);
          if (!id || !Number.isInteger(percent) || percent < 0 || percent > 100)
            throw new Error('Supply a whole percentage from 0 to 100.');
          if (command === 'context')
            voiceEvent('session.usage.updated', {
              usage: { seconds: 0 },
              context_window: { usage_ratio: percent / 100 },
            });
          else if (command === 'context-old') {
            if (!retiredContextSource)
              throw new Error('Use capture-context-source before Nytt samtal.');
            retiredContextSource.emit('session.usage.updated', {
              type: 'session.usage.updated',
              event_id: randomUUID(),
              usage: { seconds: 0 },
              context_window: { usage_ratio: percent / 100 },
            });
          } else textContextPercent = percent;
        } else if (command === 'usage' || command === 'final') {
          const seconds = Number(id);
          if (!id || !Number.isFinite(seconds) || seconds < 0)
            throw new Error('Supply nonnegative seconds.');
          live.configure({ seconds });
          if (command === 'usage') voiceEvent('session.usage.updated', { usage: { seconds } });
          else {
            const sessionId = [...live.channels.keys()][0];
            voiceEvent('session.closed', {
              session: {
                id: sessionId,
                status: 'active',
                model: 'gpt-live-1',
                expires_at: 9999999999,
              },
              usage: { seconds },
              reason: 'close_requested',
            });
          }
        } else if (command === 'available') {
          if (id !== 'on' && id !== 'off') throw new Error('Use available on or available off.');
          app.setConversationAvailable(id === 'on');
        } else if (command === 'finalize') {
          if (id !== 'on' && id !== 'off') throw new Error('Use finalize on or finalize off.');
          live.configure({ finalize: id === 'on' });
        } else if (command === 'drop') {
          if (live.channels.size !== 1) throw new Error('Start exactly one voice session first.');
          [...live.channels.values()][0].emit('close', 1006, '', []);
        } else {
          const item = pending.get(id);
          if (!item) throw new Error('Use a held request ID from this terminal.');
          if (command === 'fail') {
            pending.delete(id);
            item.reject(new Error('controlled_provider_failure'));
          } else if (command === 'reply') {
            const text = line.replace(/^reply\s+\S+\s*/, '');
            if (!text) throw new Error('Supply a synthetic reply.');
            pending.delete(id);
            item.resolve([modelMessage(text)]);
          } else if (command === 'tool') {
            const match = line.match(/^tool\s+\S+\s+(\S+)\s+([\s\S]+)$/);
            if (!match || !item.request.tools.some((tool) => tool.name === match[1]))
              throw new Error('Use a tool listed by this held request.');
            const args: unknown = JSON.parse(match[2]);
            if (!args || typeof args !== 'object' || Array.isArray(args))
              throw new Error('Tool arguments must be a JSON object.');
            pending.delete(id);
            item.resolve([modelTool(match[1], args as Record<string, unknown>)]);
          } else throw new Error('Unknown command. Type help.');
        }
        emit('released', { kind: command, id });
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : 'Control failed.' });
      }
    }
  } finally {
    releaseAll();
    input.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
    emit('closed', { removedDirectory: app.directory });
  }
}

main().catch(() => {
  emit('error', { message: 'Disposable voice fixture failed. Check the local build and ports.' });
  process.exitCode = 1;
});
