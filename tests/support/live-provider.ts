import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { LiveCreateParams } from 'openai/resources/live/live';
import type { ConnectClientEvent } from 'openai/resources/live/sideband/sideband';
import type { LiveSideband, LiveSidebandFactory } from '../../src/server/live-provider.js';

export function liveProvider() {
  const requests: LiveCreateParams[] = [];
  const sent: { sessionId: string; event: ConnectClientEvent }[] = [];
  const channels = new Map<string, EventEmitter>();
  const sockets = new Map<string, EventEmitter & { readyState: number }>();
  let finalize = true;
  let seconds = 0;
  const provider: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({
      session: { id: `live_${randomUUID()}` },
      transport: { type: 'webrtc', sdp: 'synthetic-answer' },
    });
  };
  const attach: LiveSidebandFactory = (_client, sessionId) => {
    const channel = new EventEmitter();
    channels.set(sessionId, channel);
    const socket = Object.assign(new EventEmitter(), { readyState: 1 });
    sockets.set(sessionId, socket);
    return Object.assign(channel, {
      socket,
      send(event: ConnectClientEvent) {
        sent.push({ sessionId, event });
        if (event.type === 'session.close' && finalize)
          queueMicrotask(() =>
            channel.emit('session.closed', {
              type: 'session.closed',
              event_id: randomUUID(),
              reason: 'close_requested',
              session: {
                id: sessionId,
                status: 'active',
                model: 'gpt-live-1',
                expires_at: 9999999999,
              },
              usage: { seconds },
            }),
          );
      },
      close() {
        channels.delete(sessionId);
        sockets.delete(sessionId);
        channel.emit('close', 1000, '', []);
      },
    }) as unknown as LiveSideband;
  };
  return {
    provider,
    attach,
    requests,
    sent,
    channels,
    sockets,
    configure(options: { finalize?: boolean; seconds?: number }) {
      finalize = options.finalize ?? finalize;
      seconds = options.seconds ?? seconds;
    },
    emit(sessionId: string, event: Record<string, unknown>) {
      channels.get(sessionId)?.emit(String(event.type), event);
    },
  };
}
