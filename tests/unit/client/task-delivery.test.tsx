import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  TaskDeliveryContext,
  TaskDeliveryResults,
  useTaskDelivery,
} from '../../../src/client/task-delivery.js';

class BrowserSocket extends EventTarget {
  static opened: BrowserSocket[] = [];
  sent: string[] = [];
  constructor(readonly url: string) {
    super();
    BrowserSocket.opened.push(this);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.dispatchEvent(new Event('close'));
  }
  receive(body: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(body) }));
  }
}
afterEach(() => {
  cleanup();
  BrowserSocket.opened = [];
  vi.unstubAllGlobals();
});

test('complete text is acknowledged only after the accessible whole fallback is mounted', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  let manager: ReturnType<typeof useTaskDelivery>;
  function Application({ visible }: { visible: boolean }) {
    manager = useTaskDelivery('alex');
    return visible ? (
      <TaskDeliveryContext value={manager.client}>
        <TaskDeliveryResults results={manager.results} />
      </TaskDeliveryContext>
    ) : null;
  }
  const view = render(<Application visible={false} />);
  let ready = Promise.resolve<string | undefined>(undefined);
  act(() => {
    ready = manager.client.connect('/api/households/home/text-assistant/chat');
  });
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'channel' }));
  expect(await ready).toBe('channel');
  const full = `${'Hela svarets alla delar. '.repeat(100)}\n\nVem använder cykeln?\n\nInget nytt sparande är bekräftat.`;
  act(() =>
    socket.receive({
      type: 'delivery',
      taskId: 'one',
      deadline: Date.now() + 30_000,
      state: 'awaiting-receipt',
      text: full,
      audio: true,
    }),
  );
  expect(socket.sent).toEqual([]);
  view.rerender(<Application visible />);
  const panel = screen.getByRole('region', { name: 'Hela svaret som text' });
  expect(panel.textContent).toContain(full);
  expect(screen.getByRole('status').textContent).toContain('Ljudleveransen kan inte bekräftas');
  await waitFor(() =>
    expect(socket.sent).toEqual([JSON.stringify({ type: 'received', taskId: 'one', text: full })]),
  );
});

test('natural anonymous expiry preserves bounded text but a new owner rejects late old socket content', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  let manager: ReturnType<typeof useTaskDelivery>;
  function Application({ actorId }: { actorId?: string }) {
    manager = useTaskDelivery(actorId);
    return (
      <TaskDeliveryContext value={manager.client}>
        <TaskDeliveryResults results={manager.results} />
      </TaskDeliveryContext>
    );
  }
  const view = render(<Application actorId="alex" />);
  act(() => {
    void manager.client.connect('/api/households/home/text-assistant/chat');
  });
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'channel' }));
  const packet = {
    type: 'delivery',
    taskId: 'one',
    deadline: Date.now() + 30_000,
    state: 'awaiting-receipt',
    text: 'Alex hela svar.',
    audio: false,
  };
  view.rerender(<Application />);
  act(() => socket.receive(packet));
  expect(screen.getByRole('region', { name: 'Hela svaret som text' }).textContent).toContain(
    'Alex hela svar.',
  );
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<Application actorId="robin" />);
  expect(screen.queryByRole('region', { name: 'Hela svaret som text' })).toBeNull();
  act(() => socket.receive({ ...packet, text: 'Försenat privat svar från Alex.' }));
  expect(screen.queryByText('Försenat privat svar från Alex.')).toBeNull();
});

test('a fresh login of the same owner clears old completed content and rejects late callbacks', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  let manager: ReturnType<typeof useTaskDelivery>;
  function Application({ loginId }: { loginId?: string }) {
    manager = useTaskDelivery('alex', loginId);
    return (
      <TaskDeliveryContext value={manager.client}>
        <TaskDeliveryResults results={manager.results} />
      </TaskDeliveryContext>
    );
  }
  const view = render(<Application loginId="first" />);
  act(() => {
    void manager.client.connect('/api/households/home/text-assistant/chat');
  });
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'channel' }));
  const packet = {
    type: 'delivery',
    taskId: 'one',
    deadline: Date.now() + 30_000,
    state: 'awaiting-receipt',
    text: 'Det första svaret.',
    audio: true,
  };
  act(() => socket.receive(packet));
  expect(screen.getByText('Det första svaret.')).toBeTruthy();
  act(() => socket.close());
  view.rerender(<Application loginId="second" />);
  expect(screen.queryByText('Det första svaret.')).toBeNull();
  act(() => socket.receive({ ...packet, text: 'Försenat gammalt svar.' }));
  expect(screen.queryByText('Försenat gammalt svar.')).toBeNull();
});

test('retirement clears old text and the next new instruction gets a new channel immediately', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  let manager: ReturnType<typeof useTaskDelivery>;
  function Application() {
    manager = useTaskDelivery('alex', 'login');
    return (
      <TaskDeliveryContext value={manager.client}>
        <TaskDeliveryResults results={manager.results} />
      </TaskDeliveryContext>
    );
  }
  render(<Application />);
  const path = '/api/households/home/text-assistant/chat';
  act(() => {
    void manager.client.connect(path);
  });
  const old = BrowserSocket.opened[0];
  act(() => old.receive({ type: 'connected', id: 'old' }));
  act(() =>
    old.receive({
      type: 'delivery',
      taskId: 'one',
      deadline: Date.now() + 30_000,
      state: 'awaiting-receipt',
      text: 'Ett gammalt svar.',
      audio: false,
    }),
  );
  act(() => old.receive({ type: 'retired' }));
  expect(screen.queryByText('Ett gammalt svar.')).toBeNull();
  act(() => {
    void manager.client.connect(path);
  });
  expect(BrowserSocket.opened).toHaveLength(2);
  act(() =>
    old.receive({
      type: 'delivery',
      taskId: 'one',
      deadline: Date.now() + 30_000,
      state: 'awaiting-receipt',
      text: 'Försenat efter nytt samtal.',
      audio: false,
    }),
  );
  expect(screen.queryByText('Försenat efter nytt samtal.')).toBeNull();
});
