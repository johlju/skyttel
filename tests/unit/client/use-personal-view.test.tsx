import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { usePersonalView } from '../../../src/client/use-personal-view.js';
import { defaultViewSettings, type PersonalView } from '../../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openView() {
  vi.useFakeTimers();
  let view: PersonalView = {
    contentVersion: 1,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  };
  let write: (() => Promise<Response>) | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view')) return Response.json(view);
    if (write) return write();
    const body = JSON.parse(init?.body as string);
    if (url.endsWith('/position')) {
      const position = { ...body.position, id: body.id, version: body.version + 1 };
      view = { ...view, positions: [position] };
      return Response.json(position);
    }
    view = { ...view, settings: { ...body.settings, version: body.version + 1 } };
    return Response.json(view.settings);
  });
  const onAccessLost = vi.fn();
  const hook = renderHook(() => usePersonalView('/map', onAccessLost));
  await act(async () => {});
  expect(hook.result.current.view).not.toBeNull();
  return {
    ...hook,
    write(response: () => Promise<Response>) {
      write = response;
    },
  };
}

test('personal success feedback starts after confirmation and expires after exactly three seconds', async () => {
  const hook = await openView();
  let release!: (response: Response) => void;
  hook.write(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  let saving: Promise<void> | undefined;
  act(() => {
    saving = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  act(() => vi.advanceTimersByTime(5000));
  expect(hook.result.current.message).toBe('Din personliga vy sparas…');
  expect(hook.result.current.pending).toBe(true);
  expect(hook.result.current.toast).toBeUndefined();
  await act(async () => {
    release(Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 1 }));
    await saving;
  });
  expect(hook.result.current.toast).toBe(true);
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
  act(() => vi.advanceTimersByTime(2999));
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
  act(() => vi.advanceTimersByTime(1));
  expect(hook.result.current.message).toBe('');
  expect(hook.result.current.view?.positions).toHaveLength(1);
});

test('a repeated save gets a fresh announcement and three seconds from the latest confirmation', async () => {
  const hook = await openView();
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  const first = hook.result.current.messageId;
  act(() => vi.advanceTimersByTime(2000));
  await act(async () => {
    await hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
  });
  expect(hook.result.current.messageId).not.toBe(first);
  act(() => vi.advanceTimersByTime(1000));
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
  act(() => vi.advanceTimersByTime(2000));
  expect(hook.result.current.message).toBe('');
  expect(hook.result.current.view?.settings.allLabels).toBe(true);
});

test('an old save timer cannot clear a later conflict or explicit reload feedback', async () => {
  const hook = await openView();
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  hook.write(async () => Response.json({ error: 'view_settings_conflict' }, { status: 409 }));
  await act(async () => {
    await hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
  });
  expect(hook.result.current.message).toContain('Din äldre ändring sparades inte');
  expect(hook.result.current.toast).toBeUndefined();
  act(() => vi.advanceTimersByTime(6000));
  expect(hook.result.current.message).toContain('Din äldre ändring sparades inte');
  await act(async () => {
    await hook.result.current.refresh();
  });
  act(() => vi.advanceTimersByTime(6000));
  expect(hook.result.current.message).toBe('Aktuell personlig vy är inläst.');
});

test('unmount cancels the toast timer', async () => {
  const hook = await openView();
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
