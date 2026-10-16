import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import { sessionWarningMessage } from '../../../src/shared/session-activity.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('an explicit binding revision change is not reported as inactivity even after the former deadline', async () => {
  let ended = false;
  const channels: EventTarget[] = [];
  class Channel extends EventTarget {
    constructor() {
      super();
      channels.push(this);
    }
    close() {}
    postMessage() {}
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    if (String(input) === '/api/bootstrap')
      return Response.json(
        ended
          ? { status: 'anonymous', providers: ['google'], operator: false }
          : {
              status: 'setup',
              providers: ['google'],
              operator: true,
              user: { id: 'alex', name: 'Alex' },
              loginId: 'session-1',
            },
      );
    if (String(input) === '/api/browser-binding/status')
      return Response.json(
        ended
          ? {
              state: 'anonymous',
              serverTime: 2_800_000,
              bindingId: 'binding-1',
              bindingRevision: 2,
            }
          : {
              state: 'active',
              serverTime: 1_000_000,
              expiresAt: 2_800_000,
              reason: 'inactivity',
              sessionId: 'session-1',
              bindingId: 'binding-1',
              bindingRevision: 1,
            },
      );
    return Response.json({ theme: 'system' });
  });
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByLabelText('Hushållets namn');
  await waitFor(() => expect(channels).toHaveLength(1));
  ended = true;
  channels[0].dispatchEvent(new MessageEvent('message', { data: 'activity' }));
  await screen.findByRole('heading', { name: 'Välkommen till Skyttel' });
  await waitFor(() =>
    expect(document.querySelector('.session-expiry-announcement')?.textContent).toBe(
      'Din inloggning har gått ut. Logga in igen.',
    ),
  );
});

test('background route changes do not count as navigation while an actual edit reports activity', async () => {
  const activity: unknown[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/bootstrap')
      return Response.json({
        status: 'setup',
        providers: ['google'],
        operator: true,
        user: { id: 'alex', name: 'Alex' },
        loginId: 'session-1',
      });
    if (String(input) === '/api/browser-binding/activity')
      activity.push(JSON.parse(String(init?.body)));
    if (String(input).startsWith('/api/browser-binding/'))
      return Response.json({
        state: 'active',
        serverTime: 1_000_000,
        expiresAt: 2_800_000,
        reason: 'inactivity',
        sessionId: 'session-1',
        bindingId: 'binding-1',
        bindingRevision: 1,
      });
    return Response.json({ theme: 'system' });
  });
  let navigate: ReturnType<typeof useNavigate> = () => Promise.resolve();
  function Application() {
    navigate = useNavigate();
    return <App />;
  }
  render(
    <MemoryRouter>
      <Application />
    </MemoryRouter>,
  );
  await screen.findByLabelText('Hushållets namn');
  await act(async () => navigate('/cookies'));
  expect(activity).toEqual([]);
  await act(async () => navigate('/'));
  const field = await screen.findByLabelText('Hushållets namn');
  fireEvent.input(field, { target: { value: 'Mitt hushåll' } });
  await waitFor(() => expect(activity).toContainEqual({ kind: 'write' }));
});

test('server expiry warning remains polite and visible without moving the current keyboard focus', async () => {
  let release: () => void = () => {};
  const policy = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    if (String(input) === '/api/bootstrap')
      return Response.json({
        status: 'setup',
        providers: ['google'],
        operator: true,
        user: { id: 'alex', name: 'Alex' },
        loginId: 'session-1',
      });
    if (String(input) === '/api/browser-binding/status') {
      await policy;
      return Response.json({
        state: 'active',
        serverTime: 1_000_000,
        expiresAt: 1_300_000,
        reason: 'inactivity',
        sessionId: 'session-1',
        bindingId: 'binding-1',
        bindingRevision: 1,
      });
    }
    return Response.json({ theme: 'system' });
  });
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  const field = await screen.findByLabelText('Hushållets namn');
  field.focus();
  await act(async () => release());
  const warning = await screen.findByText(sessionWarningMessage);
  expect(warning.getAttribute('role')).toBe('status');
  expect(warning.getAttribute('aria-live')).toBe('polite');
  expect(document.activeElement).toBe(field);
});

test('an old anonymous status during OFF is reconciled with the current cookie without ending the same login', async () => {
  let bootstraps = 0;
  let reads = 0;
  const activity: unknown[] = [];
  let release: () => void = () => {};
  const oldStatus = new Promise<void>((resolve) => {
    release = resolve;
  });
  const active = () =>
    Response.json({
      state: 'active',
      serverTime: 1_000_000,
      expiresAt: 2_800_000,
      reason: 'inactivity',
      sessionId: 'session-1',
      bindingId: 'binding-1',
      bindingRevision: 1,
    });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/bootstrap') {
      bootstraps++;
      return Response.json({
        status: 'setup',
        providers: ['google'],
        operator: true,
        user: { id: 'alex', name: 'Alex' },
        loginId: 'session-1',
      });
    }
    if (String(input) === '/api/browser-binding/status') {
      reads++;
      if (reads === 2) {
        await oldStatus;
        return Response.json({ state: 'anonymous', serverTime: 1_000_000 });
      }
      return active();
    }
    if (String(input) === '/api/browser-binding/activity') {
      activity.push(JSON.parse(String(init?.body)));
      return active();
    }
    return Response.json({ theme: 'system' });
  });
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByLabelText('Hushållets namn');
  await waitFor(() => expect(reads).toBe(1));
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(reads).toBe(2));
  const before = bootstraps;
  await act(async () => release());
  await waitFor(() => expect(reads).toBeGreaterThanOrEqual(3));
  expect(bootstraps).toBe(before);
  fireEvent.input(screen.getByLabelText('Hushållets namn'), {
    target: { value: 'Fortsatt arbete' },
  });
  await waitFor(() => expect(activity).toContainEqual({ kind: 'write' }));
});
