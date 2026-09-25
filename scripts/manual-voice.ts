import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import Database from 'better-sqlite3';
import { createInstallation } from '../tests/support/installation.js';
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
  let sequence = 0;
  let offset = 0;
  const live = liveProvider();
  function describe(id: string, item: Pending) {
    const user = item.request.input.findLast((part) => part.role === 'user');
    const current = user && typeof user.content === 'string' ? JSON.parse(user.content) : {};
    return {
      id,
      message: current.message,
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
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
    browserProviderScript: liveBrowserFixtureSource,
  });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const releaseAll = () => {
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
        'Disposable controlled voice: no hardware microphone, speech recognition, real provider or API key. Forward this port privately, sign in with Google as Alex, start the text assistant and voice. Type help.',
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
              'sessions',
              'user TEXT',
              'assistant TEXT',
              'delegate',
              'usage SECONDS',
              'final SECONDS',
              'finalize on|off',
              'drop',
              'pending',
              'tool REQUEST TOOL JSON',
              'reply REQUEST TEXT',
              'fail REQUEST',
              'restart',
              'quit',
            ],
          });
          continue;
        }
        if (command === 'sessions') {
          emit('sessions', { sessions: [...live.channels.keys()], sent: live.sent });
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
