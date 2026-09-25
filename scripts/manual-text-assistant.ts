import { createInterface } from 'node:readline';
import { createInstallation } from '../tests/support/installation.js';
import {
  lastToolResult,
  type ModelRequest,
  modelMessage,
  modelTool,
  textModel,
} from '../tests/support/text-model.js';

// Development-only controls: both outside providers are replaced. All browser,
// OAuth/MCP and SQLite behavior belongs to the ordinary application fixture.
type Pending = {
  request: ModelRequest;
  resolve: (output: unknown[]) => void;
  reject: (error: Error) => void;
};
const emit = (event: string, values = {}) => console.log(JSON.stringify({ event, ...values }));

async function main() {
  const pending = new Map<string, Pending>();
  let sequence = 0;
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
        // Intentionally retain a response after cancellation so a human can release
        // late provider work and check the application's own stale-work guard.
      }),
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  function releaseAll() {
    for (const item of pending.values()) item.reject(new Error('controlled_provider_shutdown'));
    pending.clear();
  }
  try {
    emit('ready', {
      origin: app.origin,
      directory: app.directory,
      message:
        'Synthetic providers and disposable data only. Forward the printed port privately; sign in with Google as Alex Exempel. Type help.',
    });
    for await (const line of input) {
      const [command, id = ''] = line.trim().split(/\s+/);
      try {
        if (command === 'quit') break;
        if (command === 'help') {
          emit('help', {
            commands: [
              'pending',
              'tool REQUEST TOOL JSON',
              'reply REQUEST TEXT',
              'fail REQUEST',
              'restart',
              'quit',
            ],
          });
        } else if (command === 'pending') {
          emit('pending', { requests: [...pending].map(([key, item]) => describe(key, item)) });
        } else if (command === 'restart') {
          releaseAll();
          await app.restart();
          emit('restarted', { origin: app.origin });
        } else {
          const item = pending.get(id);
          if (!item) throw new Error('Use a currently held request ID from this terminal.');
          if (command === 'fail') {
            pending.delete(id);
            item.reject(new Error('controlled_provider_failure'));
          } else if (command === 'reply') {
            const text = line.trim().replace(/^reply\s+\S+\s*/, '');
            if (!text) throw new Error('Supply a reply after the request ID.');
            pending.delete(id);
            item.resolve([modelMessage(text)]);
          } else if (command === 'tool') {
            const parts = line.trim().match(/^tool\s+\S+\s+(\S+)\s+([\s\S]+)$/);
            if (!parts || !item.request.tools.some((tool) => tool.name === parts[1]))
              throw new Error('Supply a tool listed in this held request and a JSON object.');
            let args: unknown;
            try {
              args = JSON.parse(parts[2]);
            } catch {
              throw new Error('Tool arguments must be valid JSON.');
            }
            if (!args || typeof args !== 'object' || Array.isArray(args))
              throw new Error('Tool arguments must be a JSON object.');
            pending.delete(id);
            item.resolve([modelTool(parts[1], args as Record<string, unknown>)]);
          } else throw new Error('Unknown command. Type help.');
          emit('released', { id, kind: command });
        }
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : 'Command failed.' });
      }
    }
  } finally {
    releaseAll();
    input.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await app.close();
    emit('closed', {
      message: 'Disposable database removed. Close the private browser and port forward.',
    });
  }
}

main().catch(() => {
  emit('error', { message: 'Fixture failed. Check the build and available local ports.' });
  process.exitCode = 1;
});
