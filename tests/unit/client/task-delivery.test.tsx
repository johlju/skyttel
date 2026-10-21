import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
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

test('the conversation owns normal replies and the fallback can be expanded and dismissed after expiry', () => {
  const received = vi.fn();
  const first = {
    taskId: 'first',
    deadline: Date.now() + 30_000,
    state: 'awaiting-receipt' as const,
    text: 'Ett helt svar.',
  };
  function Application({ active, second = false }: { active: boolean; second?: boolean }) {
    return (
      <TaskDeliveryContext value={{ connect: async () => undefined, received }}>
        <TaskDeliveryResults
          conversationAvailable={active}
          unavailableReason="Din inloggning har gått ut."
          results={
            second ? [first, { ...first, taskId: 'second', text: 'Ett nytt svar.' }] : [first]
          }
        />
      </TaskDeliveryContext>
    );
  }
  const view = render(<Application active />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(received).toHaveBeenCalledWith('first', first.text);
  view.rerender(<Application active={false} />);
  expect(screen.getByRole('region', { name: 'Svar från ditt samtal' }).textContent).toContain(
    'Din inloggning har gått ut.',
  );
  expect(screen.queryByText(first.text)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  expect(screen.getByText(first.text)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Visa mindre' }));
  expect(screen.queryByText(first.text)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Stäng svarsnotisen' }));
  view.rerender(<Application active={false} />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<Application active={false} second />);
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  expect(screen.getByText('Ett nytt svar.')).toBeTruthy();
  expect(screen.queryByText(first.text)).toBeNull();
});

test('a browser policy rejecting the delivery socket reports an unavailable connection', async () => {
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor() {
        throw new DOMException('Blocked by browser policy', 'SecurityError');
      }
    },
  );
  const { result } = renderHook(() => useTaskDelivery('alex', 'login'));
  await expect(
    result.current.client.connect('/api/households/home/text-assistant/chat'),
  ).resolves.toBeUndefined();
});

test('a dismissed answer stays closed after receipt, but a later delivery failure is shown', () => {
  const answer = {
    taskId: 'one',
    deadline: Date.now() + 30_000,
    state: 'awaiting-receipt' as const,
    text: 'Svaret.',
  };
  const view = render(<TaskDeliveryResults results={[answer]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Stäng svarsnotisen' }));
  view.rerender(<TaskDeliveryResults results={[{ ...answer, state: 'received' }]} />);
  expect(screen.queryByRole('region')).toBeNull();
  view.rerender(<TaskDeliveryResults results={[{ ...answer, state: 'failed' }]} />);
  expect(screen.getByRole('alert').textContent).toContain(
    'Ett svar kunde inte levereras fullständigt.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  expect(screen.getByRole('alert').textContent).toContain('Hela svaret kunde inte levereras.');
});

test('accepted HTTP snapshots cannot replace complete socket text or downgrade its receipt', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  const { result } = renderHook(() => useTaskDelivery('alex', 'login'));
  const ready = result.current.client.connect('/api/households/home/text-assistant/chat');
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'original' }));
  const connection = await ready;
  if (!connection) throw new Error('An authenticated delivery connection is required');
  const delivery = { taskId: 'one', deadline: Date.now() + 30_000, audio: false };
  act(() =>
    connection.observeAccepted({ ...delivery, state: 'awaiting-receipt', text: 'HTTP text' }),
  );
  expect(result.current.results).toEqual([{ ...delivery, state: 'waiting' }]);
  expect(socket.sent).toEqual([]);
  act(() =>
    socket.receive({
      type: 'delivery',
      ...delivery,
      state: 'awaiting-receipt',
      text: 'Hela svaret.',
    }),
  );
  act(() =>
    socket.receive({ type: 'delivery', ...delivery, state: 'received', text: 'Hela svaret.' }),
  );
  act(() => socket.close());
  const received = result.current.results;
  act(() => {
    connection.observeAccepted({ ...delivery, state: 'waiting', text: 'Försenad HTTP-text' });
    connection.observeAccepted({ ...delivery, state: 'failed' });
  });
  expect(result.current.results).toBe(received);
  expect(result.current.results[0]).toMatchObject({ state: 'received', text: 'Hela svaret.' });
});

test.each(['owner', 'login', 'retired', 'clear'] as const)(
  'an original closed handle preserves anonymous failure but rejects late HTTP after %s changes',
  async (change) => {
    vi.stubGlobal('WebSocket', BrowserSocket);
    const initialOwner: { actorId?: string; loginId?: string } = {
      actorId: 'alex',
      loginId: 'first',
    };
    const { result, rerender } = renderHook(
      ({ actorId, loginId }) => useTaskDelivery(actorId, loginId),
      { initialProps: initialOwner },
    );
    const path = '/api/households/home/text-assistant/chat';
    const ready = result.current.client.connect(path);
    const socket = BrowserSocket.opened[0];
    act(() => socket.receive({ type: 'connected', id: 'original' }));
    const connection = await ready;
    if (!connection) throw new Error('An authenticated delivery connection is required');
    const delivery = { taskId: 'one', deadline: Date.now() + 30_000, state: 'waiting' as const };
    if (change === 'retired') act(() => socket.receive({ type: 'retired' }));
    else {
      act(() => socket.close());
      rerender({ actorId: undefined, loginId: undefined });
      act(() =>
        connection.observeAccepted({ ...delivery, text: 'HTTP text must not be delivered' }),
      );
      expect(result.current.results).toEqual([{ ...delivery, audio: undefined, state: 'failed' }]);
      const failed = result.current.results;
      act(() => connection.observeAccepted({ ...delivery, state: 'failed' }));
      expect(result.current.results).toBe(failed);
      if (change === 'clear') act(() => result.current.clear());
      else rerender({ actorId: change === 'owner' ? 'robin' : 'alex', loginId: 'second' });
    }
    const next = result.current.client.connect(path);
    const replacement = BrowserSocket.opened.at(-1);
    act(() => replacement?.receive({ type: 'connected', id: 'replacement' }));
    expect((await next)?.id).toBe('replacement');
    act(() => connection.observeAccepted({ ...delivery, state: 'failed' }));
    expect(result.current.results).toEqual([]);
    expect(replacement?.sent).toEqual([]);
  },
);

test('complete text is acknowledged when retained without waiting for the reader to expand it', async () => {
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
  let ready: ReturnType<typeof manager.client.connect> = Promise.resolve(undefined);
  act(() => {
    ready = manager.client.connect('/api/households/home/text-assistant/chat');
  });
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'channel' }));
  expect((await ready)?.id).toBe('channel');
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
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  expect(screen.getByRole('region', { name: 'Hela svaret som text' }).textContent).toContain(
    'Alex hela svar.',
  );
  expect(screen.getByRole('status').textContent).toBe(
    'Hela svaret finns här som text. Kontrollera sparstatus i svaret.',
  );
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
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
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

test('a text answer after workspace expiry announces its checked save result once without moving focus', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  let manager: ReturnType<typeof useTaskDelivery>;
  function Application({ signedIn }: { signedIn: boolean }) {
    manager = useTaskDelivery(signedIn ? 'alex' : undefined);
    return (
      <TaskDeliveryContext value={manager.client}>
        {signedIn && <section aria-label="Arbetsyta">Samtalstext</section>}
        <button type="button">Logga in</button>
        <TaskDeliveryResults results={manager.results} />
      </TaskDeliveryContext>
    );
  }
  const view = render(<Application signedIn />);
  const status = view.container.querySelector('[aria-live="polite"][aria-atomic="true"]');
  expect(status).not.toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(status?.textContent).toBe('');
  act(() => {
    void manager.client.connect('/api/households/home/text-assistant/chat');
  });
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'channel' }));
  view.rerender(<Application signedIn={false} />);
  expect(screen.queryByRole('region', { name: 'Arbetsyta' })).toBeNull();
  const login = screen.getByRole('button', { name: 'Logga in' });
  login.focus();
  const packet = {
    type: 'delivery',
    taskId: 'saved-answer',
    deadline: Date.now() + 30_000,
    state: 'awaiting-receipt',
    text: `${'Alla delar av svaret. '.repeat(100)}\n\nSparat. Hela utkastet finns i hushållets karta.`,
    saveState: 'saved',
    audio: false,
  };
  act(() => socket.receive(packet));
  await waitFor(() =>
    expect(status?.textContent).toBe(
      'Hela svaret finns här som text. Sparat. Hela utkastet finns i hushållets karta.',
    ),
  );
  expect(screen.getByRole('status')).toBe(status);
  expect(document.activeElement).toBe(login);
  if (screen.queryByRole('button', { name: 'Läs mer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  expect(screen.getByRole('region', { name: 'Hela svaret som text' }).textContent).toContain(
    packet.text,
  );
  const changes: MutationRecord[] = [];
  const observer = new MutationObserver((records) => changes.push(...records));
  observer.observe(screen.getByRole('status'), {
    childList: true,
    subtree: true,
    characterData: true,
  });
  act(() => socket.receive({ ...packet, state: 'received' }));
  await act(async () => {});
  observer.disconnect();
  expect(changes).toEqual([]);
  expect(document.activeElement).toBe(login);
});

test('audio text announces uncertain saving without treating model words or a failed receipt as success', async () => {
  vi.stubGlobal('WebSocket', BrowserSocket);
  let manager: ReturnType<typeof useTaskDelivery>;
  function Application() {
    manager = useTaskDelivery('alex');
    return (
      <TaskDeliveryContext value={manager.client}>
        <TaskDeliveryResults results={manager.results} />
      </TaskDeliveryContext>
    );
  }
  const view = render(<Application />);
  const status = view.container.querySelector('[aria-live="polite"][aria-atomic="true"]');
  expect(status).not.toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  act(() => {
    void manager.client.connect('/api/households/home/text-assistant/chat');
  });
  const socket = BrowserSocket.opened[0];
  act(() => socket.receive({ type: 'connected', id: 'channel' }));
  const packet = {
    type: 'delivery',
    taskId: 'uncertain-answer',
    deadline: Date.now() + 30_000,
    state: 'awaiting-receipt',
    text: 'Samtal (obekräftat): Sparat!\n\nDet är oklart om utkastet sparades. Kontrollera sparresultatet efter inloggning.',
    saveState: 'uncertain',
    audio: true,
  };
  act(() => socket.receive(packet));
  await waitFor(() =>
    expect(status?.textContent).toBe(
      'Hela svaret finns här som text. Det är oklart om utkastet sparades. Kontrollera sparresultatet efter inloggning. Ljudleveransen kan inte bekräftas.',
    ),
  );
  expect(screen.getByRole('status')).toBe(status);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  expect(screen.getByText(/Mottagen text betyder inte att ljudet har spelats upp/)).toBeTruthy();
  const availability = status?.textContent;
  act(() => socket.receive({ ...packet, state: 'failed', text: undefined }));
  expect(screen.getByRole('alert').textContent).toContain('Hela svaret kunde inte levereras.');
  expect(status?.textContent).toBe(availability);
  expect(screen.getByRole('region', { name: 'Hela svaret som text' }).textContent).toContain(
    packet.text,
  );
});
