import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  audioDeliveryNotice,
  deliveryFailureNotice,
  deliverySaveStatus,
  type TaskDelivery,
} from '../shared/task-delivery.js';
import { useAppShellReservedHeight } from './use-app-shell-reserved-height.js';

export type TaskDeliveryConnection = {
  id: string;
  /** Observe this connection's authenticated admission, never HTTP answer text. */
  observeAccepted: (delivery: TaskDelivery) => void;
};
type DeliveryClient = {
  connect: (path: string) => Promise<TaskDeliveryConnection | undefined>;
  received: (taskId: string, text: string) => void;
};
export const TaskDeliveryContext = createContext<DeliveryClient | null>(null);

/** Owned by App, so natural login expiry cannot unmount the bounded stream.
 * It retains only individual deliveries, never the assistant or household view. */
export function useTaskDelivery(actorId: string | undefined, loginId?: string) {
  const connections = useRef(
    new Map<
      string,
      {
        socket: WebSocket;
        ready: Promise<TaskDeliveryConnection | undefined>;
        awaiting: Map<string, string>;
      }
    >(),
  );
  const [results, setResults] = useState<TaskDelivery[]>([]);
  const owner = useRef({ actorId, loginId });
  const ownerGeneration = useRef(0);
  const close = () => {
    ownerGeneration.current++;
    const previous = [...connections.current.values()];
    connections.current.clear();
    for (const connection of previous) connection.socket.close();
    setResults([]);
  };
  useLayoutEffect(() => {
    if (actorId) {
      if (
        owner.current.actorId &&
        (owner.current.actorId !== actorId ||
          (loginId && owner.current.loginId && owner.current.loginId !== loginId))
      )
        close();
      owner.current = { actorId, loginId };
    }
  });
  useEffect(
    () => () => {
      ownerGeneration.current++;
      const previous = [...connections.current.values()];
      connections.current.clear();
      for (const connection of previous) connection.socket.close();
    },
    [],
  );
  const client = useRef<DeliveryClient>({
    async connect(path) {
      const existing = connections.current.get(path);
      if (existing) return existing.ready;
      if (typeof WebSocket === 'undefined') return;
      const url = new URL(`${path}/delivery`, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        return;
      }
      const tasks = new Set<string>();
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      const generation = ownerGeneration.current;
      let open = true;
      let retired = false;
      let finish: (connection?: TaskDeliveryConnection) => void = () => {};
      const ready = new Promise<TaskDeliveryConnection | undefined>((resolve) => {
        finish = resolve;
      });
      const awaiting = new Map<string, string>();
      const connection = { socket, ready, awaiting };
      connections.current.set(path, connection);
      const timeout = setTimeout(() => {
        finish();
        socket.close();
      }, 5000);
      const expire = (taskId: string, deadline: number) => {
        if (timers.has(taskId)) return;
        timers.set(
          taskId,
          setTimeout(
            () => {
              setResults((previous) =>
                previous.map((item) =>
                  item.taskId === taskId && item.state !== 'received'
                    ? { ...item, state: 'failed' }
                    : item,
                ),
              );
              timers.delete(taskId);
            },
            Math.max(1, deadline - Date.now()),
          ),
        );
      };
      const observeAccepted = (value: TaskDelivery) => {
        if (retired || generation !== ownerGeneration.current || value.state === 'received') return;
        tasks.add(value.taskId);
        const failed = !open || value.state === 'failed';
        if (failed) {
          clearTimeout(timers.get(value.taskId));
          timers.delete(value.taskId);
        } else expire(value.taskId, value.deadline);
        setResults((previous) => {
          const existing = previous.find((item) => item.taskId === value.taskId);
          if (existing?.state === 'received' || existing?.state === 'failed') return previous;
          if (existing && !failed) return previous;
          return [
            ...previous.filter((item) => item.taskId !== value.taskId),
            existing
              ? { ...existing, state: 'failed' }
              : {
                  taskId: value.taskId,
                  deadline: value.deadline,
                  audio: value.audio,
                  state: failed ? 'failed' : 'waiting',
                },
          ];
        });
      };
      socket.addEventListener('message', (event) => {
        if (connections.current.get(path) !== connection) return;
        let body: TaskDelivery & { type: string; id?: string };
        try {
          body = JSON.parse(event.data);
        } catch {
          socket.close();
          return;
        }
        if (body.type === 'connected' && typeof body.id === 'string') {
          clearTimeout(timeout);
          finish({ id: body.id, observeAccepted });
          return;
        }
        if (body.type === 'retired') {
          retired = true;
          clearTimeout(timeout);
          for (const timer of timers.values()) clearTimeout(timer);
          connections.current.delete(path);
          finish();
          socket.close();
          setResults((previous) => previous.filter((item) => !tasks.has(item.taskId)));
          return;
        }
        if (
          body.type !== 'delivery' ||
          typeof body.taskId !== 'string' ||
          !Number.isFinite(body.deadline) ||
          !['waiting', 'awaiting-receipt', 'received', 'failed'].includes(body.state)
        ) {
          socket.close();
          return;
        }
        tasks.add(body.taskId);
        if (body.state === 'received' || body.state === 'failed') {
          awaiting.delete(body.taskId);
          clearTimeout(timers.get(body.taskId));
          timers.delete(body.taskId);
        } else expire(body.taskId, body.deadline);
        // One complete WebSocket message is required. No fragment or receipt
        // for another answer can become a full-text acknowledgement.
        if (body.state === 'awaiting-receipt') {
          if (typeof body.text !== 'string' || !body.text) {
            socket.close();
            return;
          }
          awaiting.set(body.taskId, body.text);
        }
        setResults((previous) => [
          ...previous.filter((item) => item.taskId !== body.taskId),
          {
            taskId: body.taskId,
            deadline: body.deadline,
            state: body.state,
            text: body.text ?? previous.find((item) => item.taskId === body.taskId)?.text,
            audio: body.audio,
            saveState: body.saveState,
          },
        ]);
      });
      const ended = () => {
        open = false;
        clearTimeout(timeout);
        for (const timer of timers.values()) clearTimeout(timer);
        finish();
        if (connections.current.get(path) !== connection) return;
        connections.current.delete(path);
        setResults((previous) =>
          previous.map((item) =>
            tasks.has(item.taskId) && item.state !== 'received'
              ? { ...item, state: 'failed' }
              : item,
          ),
        );
      };
      socket.addEventListener('close', ended, { once: true });
      socket.addEventListener('error', () => socket.close(), { once: true });
      return ready;
    },
    received(taskId, text) {
      for (const connection of connections.current.values()) {
        if (connection.awaiting.get(taskId) !== text) continue;
        connection.awaiting.delete(taskId);
        try {
          connection.socket.send(JSON.stringify({ type: 'received', taskId, text }));
        } catch {
          connection.socket.close();
        }
      }
    },
  });
  return { client: client.current, results, clear: close };
}

export function TaskDeliveryResults({
  results,
  workspace = false,
}: {
  results: TaskDelivery[];
  workspace?: boolean;
}) {
  const client = useContext(TaskDeliveryContext);
  const surface = useRef<HTMLElement>(null);
  const visible = results.filter((item) => item.state !== 'waiting');
  const hasResults = visible.length > 0;
  useAppShellReservedHeight(surface, workspace && hasResults, '--task-delivery-height');
  const announced = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState({ count: 0, text: '' });
  useEffect(() => {
    const current = new Set(results.map((item) => item.taskId));
    announced.current = new Set([...announced.current].filter((id) => current.has(id)));
    const notices: string[] = [];
    for (const item of results) {
      if (!item.text || item.state === 'failed' || announced.current.has(item.taskId)) continue;
      announced.current.add(item.taskId);
      notices.push(
        'Hela svaret finns här som text.',
        item.saveState ? deliverySaveStatus[item.saveState] : 'Kontrollera sparstatus i svaret.',
      );
      if (item.audio) notices.push('Ljudleveransen kan inte bekräftas.');
    }
    if (notices.length)
      setAnnouncement(({ count }) => ({ count: count + 1, text: notices.join(' ') }));
    else if (!results.length)
      setAnnouncement((value) => (value.text ? { ...value, text: '' } : value));
  }, [results]);
  // Layout effects run after the entire accessible fallback is committed.
  // Receipt never waits for a human to read or confirm it.
  useLayoutEffect(() => {
    for (const item of results)
      if (item.state === 'awaiting-receipt' && item.text) client?.received(item.taskId, item.text);
  }, [client, results]);
  return (
    <>
      <p
        className="task-delivery-announcement"
        role={announcement.text ? 'status' : undefined}
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={announcement.count}>{announcement.text}</span>
      </p>
      {!!visible.length && (
        <section
          ref={surface}
          className="task-delivery-results panel"
          aria-label="Hela svaret som text"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The named scroll region needs keyboard scrolling without a pointer.
          tabIndex={0}
        >
          <h2>Hela svaret som text</h2>
          {visible.map((item) => (
            <article key={item.taskId}>
              {item.audio && item.text && <p>{audioDeliveryNotice}</p>}
              {item.text && <div className="task-delivery-text">{item.text}</div>}
              {item.state === 'failed' && <p role="alert">{deliveryFailureNotice}</p>}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
