import { randomUUID } from 'node:crypto';
import { liveProvider } from './live-provider.js';
import { modelMessage, textModel } from './text-model.js';

export function costProvider(onHeld: () => void = () => {}) {
  let mode: 'known' | 'missing' | 'held' = 'known';
  const pending = new Set<{ release: () => void; cancel: () => void }>();
  const model = textModel(() => [modelMessage('Det kontrollerade kostnadsprovet är klart.')]);
  const live = liveProvider();
  const provider: typeof fetch = async (input, init) => {
    const current = mode;
    if (current === 'held')
      await new Promise<void>((resolve, reject) => {
        const complete = (error?: Error) => {
          pending.delete(item);
          init?.signal?.removeEventListener('abort', item.cancel);
          if (error) reject(error);
          else resolve();
        };
        const item = {
          release: () => complete(),
          cancel: () => complete(new Error('controlled_provider_interrupted')),
        };
        pending.add(item);
        init?.signal?.addEventListener('abort', item.cancel, { once: true });
        onHeld();
        if (init?.signal?.aborted) item.cancel();
      });
    const response = await model.provider(input, init);
    const body = await response.json();
    body.service_tier = 'default';
    if (current === 'missing') delete body.usage;
    else
      body.usage = {
        input_tokens: 100_000,
        output_tokens: 5_000,
        total_tokens: 105_000,
        input_tokens_details: { cached_tokens: 20_000, cache_write_tokens: 10_000 },
        output_tokens_details: { reasoning_tokens: 2_000 },
      };
    return Response.json(body, { headers: response.headers });
  };
  return {
    provider,
    live,
    textMode(value: 'known' | 'missing' | 'held') {
      mode = value;
    },
    release() {
      for (const item of [...pending]) item.release();
    },
    cancel() {
      for (const item of [...pending]) item.cancel();
    },
    delegate() {
      if (live.channels.size !== 1) throw new Error('Start exactly one voice session.');
      const sessionId = [...live.channels.keys()][0];
      live.emit(sessionId, {
        type: 'session.input_transcript.delta',
        event_id: randomUUID(),
        delta: 'Prova kostnadsunderlaget.',
        start_ms: 0,
        end_ms: 100,
      });
      live.emit(sessionId, {
        type: 'session.delegation.created',
        event_id: randomUUID(),
        offset_ms: 100,
        delegation: { id: `delegation_${randomUUID()}`, type: 'delegation', target: 'client' },
      });
    },
    usage(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Use nonnegative seconds.');
      if (live.channels.size !== 1) throw new Error('Start exactly one voice session.');
      live.configure({ seconds });
      live.emit([...live.channels.keys()][0], {
        type: 'session.usage.updated',
        event_id: randomUUID(),
        usage: { seconds },
      });
    },
  };
}
