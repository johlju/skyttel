import { randomUUID } from 'node:crypto';
import type { DeliverySaveState, TaskDelivery } from '../shared/task-delivery.js';

export type DeliverySocket = {
  send: (text: string) => void;
  close: () => void;
  on: (event: 'message' | 'close' | 'error', callback: (data?: unknown) => void) => void;
};
type BoundTask = {
  value: TaskDelivery;
  guard: () => void;
  timer: NodeJS.Timeout;
  receiptBy: number;
};
type Channel = {
  id: string;
  socket: DeliverySocket;
  tasks: Map<string, BoundTask>;
  open: boolean;
};

/** Process-local connection identity. IDs correlate an authenticated socket;
 * only that actual socket can acknowledge its immutable task bindings. */
export function taskDeliveries(now: () => number) {
  const channels = new Map<string, Channel>();
  function publish(channel: Channel, value: TaskDelivery) {
    if (!channel.open) return;
    try {
      channel.socket.send(JSON.stringify({ type: 'delivery', ...value }));
    } catch {
      close(channel);
    }
  }
  function fail(channel: Channel, task: BoundTask) {
    if (task.value.state === 'received' || task.value.state === 'failed') return;
    clearTimeout(task.timer);
    task.value = { ...task.value, state: 'failed', text: undefined };
    publish(channel, task.value);
  }
  function close(channel: Channel) {
    if (!channel.open) return;
    channel.open = false;
    for (const task of channel.tasks.values()) fail(channel, task);
    channels.delete(channel.id);
    channel.socket.close();
  }
  return {
    open(socket: DeliverySocket) {
      const channel: Channel = { id: randomUUID(), socket, tasks: new Map(), open: true };
      channels.set(channel.id, channel);
      socket.on('close', () => close(channel));
      socket.on('error', () => close(channel));
      socket.on('message', (data) => {
        let body: { type?: unknown; taskId?: unknown; text?: unknown };
        try {
          const text = String(data);
          if (Buffer.byteLength(text) > 1_048_576) throw new Error('oversized_ack');
          body = JSON.parse(text);
        } catch {
          close(channel);
          return;
        }
        const task = typeof body.taskId === 'string' ? channel.tasks.get(body.taskId) : undefined;
        if (
          body.type !== 'received' ||
          !task ||
          task.value.state !== 'awaiting-receipt' ||
          body.text !== task.value.text
        ) {
          close(channel);
          return;
        }
        try {
          task.guard();
          if (now() >= task.receiptBy) throw new Error('expired');
          clearTimeout(task.timer);
          task.value = { ...task.value, state: 'received' };
          publish(channel, task.value);
        } catch {
          fail(channel, task);
        }
      });
      socket.send(JSON.stringify({ type: 'connected', id: channel.id }));
      return channel.id;
    },
    has: (id: string) => channels.has(id),
    pending: (id: string) =>
      [...(channels.get(id)?.tasks.values() ?? [])].some(
        (task) => task.value.state === 'waiting' || task.value.state === 'awaiting-receipt',
      ),
    bind(
      id: string | undefined,
      taskId: string,
      deadline: number,
      guard: () => void,
      audio = false,
    ) {
      const channel = id ? channels.get(id) : undefined;
      const value: TaskDelivery = {
        taskId,
        deadline,
        audio,
        state: channel ? 'waiting' : 'failed',
      };
      if (!channel)
        return {
          value,
          freeze: (_text: string, _saveState?: DeliverySaveState) => {},
          stop: () => {},
        };
      const task = {
        value,
        guard,
        receiptBy: deadline,
        timer: setTimeout(() => fail(channel, task), Math.max(1, deadline - now())).unref(),
      };
      channel.tasks.set(taskId, task);
      publish(channel, value);
      return {
        get value() {
          return task.value;
        },
        freeze(text: string, saveState?: DeliverySaveState) {
          if (!channel.open || task.value.state !== 'waiting') return;
          try {
            guard();
            if (
              !text ||
              Buffer.byteLength(JSON.stringify({ type: 'received', taskId, text })) > 1_000_000 ||
              now() >= deadline
            )
              throw new Error('incomplete_delivery');
            task.value = { taskId, deadline, text, audio, saveState, state: 'awaiting-receipt' };
            task.receiptBy = Math.min(deadline, now() + 5000);
            clearTimeout(task.timer);
            task.timer = setTimeout(
              () => fail(channel, task),
              Math.max(1, task.receiptBy - now()),
            ).unref();
            publish(channel, task.value);
          } catch {
            fail(channel, task);
          }
        },
        stop: () => fail(channel, task),
      };
    },
    close: (id: string) => {
      const channel = channels.get(id);
      if (channel) close(channel);
    },
    retire: (id: string) => {
      const channel = channels.get(id);
      if (!channel) return;
      try {
        if (channel.open) channel.socket.send(JSON.stringify({ type: 'retired' }));
      } catch {
        /* Socket cleanup must still release every pending task. */
      }
      close(channel);
    },
    revalidate() {
      for (const channel of channels.values())
        for (const task of channel.tasks.values()) {
          if (task.value.state === 'received' || task.value.state === 'failed') continue;
          try {
            task.guard();
            if (now() >= task.receiptBy) throw new Error('expired');
          } catch {
            fail(channel, task);
          }
        }
    },
  };
}
