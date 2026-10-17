import type { IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import type { Duplex } from 'node:stream';
import type { DeliverySocket } from './task-delivery.js';

// ws has no bundled declarations. Keep its untyped boundary here; the rest of
// the application uses only the small delivery socket contract.
const { WebSocketServer } = createRequire(import.meta.url)('ws') as {
  WebSocketServer: new (options: {
    noServer: boolean;
    maxPayload: number;
  }) => {
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      connected: (socket: DeliverySocket) => void,
    ): void;
  };
};

export function attachTaskDelivery(
  server: {
    on(
      event: 'upgrade',
      listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
    ): unknown;
  },
  origin: string,
  prepare: (request: Request) => Promise<((socket: DeliverySocket) => void) | undefined>,
) {
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });
  server.on('upgrade', (request, socket, head) => {
    const timeout = setTimeout(() => socket.destroy(), 5000).unref();
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    void prepare(new Request(new URL(request.url ?? '/', origin), { headers }))
      .then((connect) => {
        clearTimeout(timeout);
        if (!connect || socket.destroyed) {
          socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          return;
        }
        websocket.handleUpgrade(request, socket, head, (channel) => {
          try {
            connect(channel);
          } catch {
            channel.close();
          }
        });
      })
      .catch(() => {
        clearTimeout(timeout);
        socket.destroy();
      });
  });
}
