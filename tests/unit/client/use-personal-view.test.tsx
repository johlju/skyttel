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
  let write: ((body: Record<string, unknown>) => Promise<Response>) | undefined;
  let read: (() => Promise<Response>) | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view')) return read ? read() : Response.json(view);
    const body = JSON.parse(init?.body as string);
    if (write) return write(body);
    if (url.endsWith('/position')) {
      const position = { ...body.position, id: body.id, version: body.version + 1 };
      view = { ...view, positions: [position] };
      return Response.json(position);
    }
    view = { ...view, settings: { ...body.settings, version: body.version + 1 } };
    return Response.json(view.settings);
  });
  const onAccessLost = vi.fn();
  const hook = renderHook(({ path }) => usePersonalView(path, onAccessLost), {
    initialProps: { path: '/map' },
  });
  await act(async () => {});
  expect(hook.result.current.view).not.toBeNull();
  return {
    ...hook,
    write(response: (body: Record<string, unknown>) => Promise<Response>) {
      write = response;
    },
    saved(next: PersonalView) {
      view = next;
    },
    read(response: () => Promise<Response>) {
      read = response;
    },
    onAccessLost,
  };
}

test('retry saves the latest failed whole position and keeps another failed object local', async () => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    await hook.result.current.move('bike', { x: 4, y: 5, z: 6 });
  });
  expect(hook.result.current.unsavedPositions.map(({ id }) => id)).toEqual(['lamp', 'bike']);
  hook.write(async (body) =>
    Response.json({ id: body.id, ...(body.position as object), version: 1 }),
  );
  await act(async () => {
    await hook.result.current.retryPosition('lamp');
  });
  expect(hook.result.current.unsavedPositions.map(({ id }) => id)).toEqual(['bike']);
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'bike', x: 4, y: 5, z: 6, version: 0 },
    { id: 'lamp', x: 1, y: 2, z: 3, version: 1 },
  ]);
  expect(hook.result.current.message).toBe('Positionen är inte sparad');
});

test('retrying a removed object preserves the changed-object warning and another failed position', async () => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    await hook.result.current.move('bike', { x: 4, y: 5, z: 6 });
  });
  hook.write(async () => Response.json({ error: 'object_unavailable' }, { status: 400 }));
  await act(async () => {
    await hook.result.current.retryPosition('lamp');
  });
  expect(hook.result.current.message).toBe(
    'Objektet eller hushållets innehåll har ändrats. Läs in kartan innan du fortsätter.',
  );
  expect(hook.result.current.positionRecovery).toBeUndefined();
  expect(hook.result.current.unsavedPositions.map(({ id }) => id)).toEqual(['bike']);
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'bike', x: 4, y: 5, z: 6, version: 0 },
  ]);
  expect(hook.result.current.pending).toBe(false);
});

test('loading one saved position leaves other unsaved positions intact and ignores its older write', async () => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    await hook.result.current.move('bike', { x: 4, y: 5, z: 6 });
  });
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
  hook.saved({
    contentVersion: 1,
    positions: [{ id: 'lamp', x: 90, y: 80, z: 70, version: 4 }],
    settings: { ...defaultViewSettings, version: 0 },
  });
  await act(async () => {
    await hook.result.current.reloadPosition('lamp');
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'bike', x: 4, y: 5, z: 6, version: 0 },
    { id: 'lamp', x: 90, y: 80, z: 70, version: 4 },
  ]);
  expect(hook.result.current.unsavedPositions.map(({ id }) => id)).toEqual(['bike']);
  await act(async () => {
    release(Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 1 }));
    await saving;
  });
  expect(hook.result.current.view?.positions.find(({ id }) => id === 'lamp')).toEqual({
    id: 'lamp',
    x: 90,
    y: 80,
    z: 70,
    version: 4,
  });
  expect(hook.result.current.unsavedPositions.map(({ id }) => id)).toEqual(['bike']);
  expect(hook.result.current.toast).toBeUndefined();
});

test.each(['success', 'failure'] as const)(
  'a late saved-position read %s cannot replace a newer failed move or its status',
  async (outcome) => {
    const hook = await openView();
    hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
    await act(async () => {
      await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    });
    let release!: (response: Response) => void;
    hook.read(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    let loading: Promise<void> | undefined;
    act(() => {
      loading = hook.result.current.reloadPosition('lamp');
    });
    await act(async () => {
      await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
    });
    await act(async () => {
      release(
        outcome === 'failure'
          ? Response.json({ error: 'internal_error' }, { status: 500 })
          : Response.json({
              contentVersion: 1,
              positions: [{ id: 'lamp', x: 90, y: 80, z: 70, version: 4 }],
              settings: { ...defaultViewSettings, version: 0 },
            }),
      );
      await loading;
    });
    expect(hook.result.current.view?.positions).toEqual([
      { id: 'lamp', x: 7, y: 8, z: 9, version: 0 },
    ]);
    expect(hook.result.current.unsavedPositions).toEqual([
      { id: 'lamp', saving: false, reloading: false, failed: true },
    ]);
    expect(hook.result.current.message).toBe('Positionen är inte sparad');
    expect(hook.result.current.positionRecovery).toBeUndefined();
  },
);

test('a failed saved-position read keeps recovery available and reports the retained local position', async () => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  hook.read(async () => Response.json({ error: 'internal_error' }, { status: 500 }));
  await act(async () => {
    await hook.result.current.reloadPosition('lamp');
  });
  expect(hook.result.current.view?.positions[0]).toEqual({
    id: 'lamp',
    x: 1,
    y: 2,
    z: 3,
    version: 0,
  });
  expect(hook.result.current.positionRecovery).toEqual({
    id: 'lamp',
    message: 'Positionen kunde inte hämtas. Din lokala position finns kvar. Försök igen.',
    error: true,
  });
  hook.read(async () =>
    Response.json({
      contentVersion: 1,
      positions: [],
      settings: { ...defaultViewSettings, version: 0 },
    }),
  );
  await act(async () => {
    await hook.result.current.reloadPosition('lamp');
  });
  expect(hook.result.current.view?.positions).toEqual([]);
  expect(hook.result.current.unsavedPositions).toEqual([]);
  expect(hook.result.current.positionRecovery?.message).toBe(
    'Ingen position är sparad. Automatisk placering används.',
  );
});

test.each([401, 403])('reloading saved positions respects access denial %s', async (status) => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  hook.read(async () => Response.json({ error: 'forbidden' }, { status }));
  await act(async () => {
    await hook.result.current.reloadPosition('lamp');
  });
  expect(hook.result.current.view).toBeNull();
  expect(hook.result.current.unsavedPositions).toEqual([]);
  expect(hook.onAccessLost).toHaveBeenCalledOnce();
});

test('replacement content discovered during position recovery invalidates the old arrangement', async () => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  hook.read(async () =>
    Response.json({
      contentVersion: 2,
      positions: [],
      settings: { ...defaultViewSettings, version: 0 },
    }),
  );
  await act(async () => {
    await hook.result.current.reloadPosition('lamp');
  });
  expect(hook.result.current.view).toBeNull();
  expect(hook.result.current.unsavedPositions).toEqual([]);
  expect(hook.result.current.message).toContain('Hushållets innehåll har ersatts');
});

test.each(['success', 'failure'] as const)(
  'a saved-position read %s from a previous household cannot affect the new household',
  async (outcome) => {
    const hook = await openView();
    hook.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
    await act(async () => {
      await hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    });
    let release!: (response: Response) => void;
    hook.read(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    let loading: Promise<void> | undefined;
    act(() => {
      loading = hook.result.current.reloadPosition('lamp');
    });
    const other = {
      contentVersion: 7,
      positions: [{ id: 'other', x: 4, y: 5, z: 6, version: 8 }],
      settings: { ...defaultViewSettings, version: 9 },
    };
    hook.read(async () => Response.json(other));
    await act(async () => {
      hook.rerender({ path: '/other' });
    });
    await act(async () => {
      release(
        outcome === 'failure'
          ? Response.json({ error: 'forbidden' }, { status: 403 })
          : Response.json({ ...other, contentVersion: 1, positions: [] }),
      );
      await loading;
    });
    expect(hook.result.current.view).toEqual(other);
    expect(hook.result.current.positionRecovery).toBeUndefined();
    expect(hook.onAccessLost).not.toHaveBeenCalled();
  },
);

test('discard restores the last confirmed placement and old replies cannot erase a later move', async () => {
  const hook = await openView();
  hook.saved({
    contentVersion: 1,
    positions: [{ id: 'lamp', x: 90, y: 80, z: 70, version: 4 }],
    settings: { ...defaultViewSettings, version: 0 },
  });
  await act(async () => {
    await hook.result.current.refresh();
  });
  const releases: ((response: Response) => void)[] = [];
  hook.write(
    () =>
      new Promise<Response>((resolve) => {
        releases.push(resolve);
      }),
  );
  let old: Promise<void> | undefined;
  act(() => {
    old = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  act(() => {
    hook.result.current.discardPositions();
  });
  expect(hook.result.current.view?.positions[0]).toEqual({
    id: 'lamp',
    x: 90,
    y: 80,
    z: 70,
    version: 4,
  });
  expect(hook.result.current.unsavedPositions).toEqual([]);
  let latest: Promise<void> | undefined;
  act(() => {
    latest = hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  await act(async () => {
    releases[0](Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 5 }));
    await old;
  });
  expect(hook.result.current.view?.positions[0]).toEqual({
    id: 'lamp',
    x: 7,
    y: 8,
    z: 9,
    version: 4,
  });
  expect(hook.result.current.unsavedPositions[0].saving).toBe(true);
  await act(async () => {
    releases[1](Response.json({ id: 'lamp', x: 7, y: 8, z: 9, version: 6 }));
    await latest;
  });
  expect(hook.result.current.unsavedPositions).toEqual([]);
  expect(hook.result.current.view?.positions[0]).toEqual({
    id: 'lamp',
    x: 7,
    y: 8,
    z: 9,
    version: 6,
  });
});

test('successive moves stay local while older confirmations cannot report the newer position saved', async () => {
  const hook = await openView();
  const replies: ((response: Response) => void)[] = [];
  const bodies: Record<string, unknown>[] = [];
  hook.write((body) => {
    bodies.push(body);
    return new Promise<Response>((resolve) => replies.push(resolve));
  });
  let saving: Promise<void> | undefined;
  act(() => {
    saving = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    void hook.result.current.move('lamp', { x: 4, y: 5, z: 6 });
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 4, y: 5, z: 6, version: 0 },
  ]);
  await act(async () => {
    replies[0](Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 1 }));
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 4, y: 5, z: 6, version: 1 },
  ]);
  expect(hook.result.current.message).toBe('Din personliga vy sparas…');
  expect(hook.result.current.toast).toBeUndefined();
  expect(bodies[1]).toEqual({
    id: 'lamp',
    position: { x: 4, y: 5, z: 6 },
    version: 1,
    contentVersion: 1,
  });
  await act(async () => {
    replies[1](Response.json({ id: 'lamp', x: 4, y: 5, z: 6, version: 2 }));
    await saving;
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 4, y: 5, z: 6, version: 2 },
  ]);
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
});

test('a same-object conflict saves the latest whole local position without changing unrelated positions', async () => {
  const hook = await openView();
  hook.saved({
    contentVersion: 1,
    positions: [
      { id: 'lamp', x: 90, y: 80, z: 70, version: 4 },
      { id: 'bike', x: 20, y: 30, z: 40, version: 2 },
    ],
    settings: { ...defaultViewSettings, version: 0 },
  });
  let release!: (response: Response) => void;
  let conflict = true;
  const bodies: Record<string, unknown>[] = [];
  hook.write(async (body) => {
    bodies.push(body);
    if (conflict) {
      conflict = false;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return Response.json({ id: body.id, ...(body.position as object), version: 5 });
  });
  let saving: Promise<void> | undefined;
  act(() => {
    saving = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    void hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  await act(async () => {
    release(Response.json({ error: 'position_conflict' }, { status: 409 }));
    await saving;
  });
  expect(bodies[1]).toEqual({
    id: 'lamp',
    position: { x: 7, y: 8, z: 9 },
    version: 4,
    contentVersion: 1,
  });
  expect(hook.result.current.view?.positions).toEqual(
    expect.arrayContaining([
      { id: 'lamp', x: 7, y: 8, z: 9, version: 5 },
      { id: 'bike', x: 20, y: 30, z: 40, version: 2 },
    ]),
  );
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
});

test('a newer local move survives an older failure and independent unsaved objects remain intact', async () => {
  const hook = await openView();
  const replies = new Map<string, ((response: Response) => void)[]>();
  hook.write(
    (body) =>
      new Promise<Response>((resolve) => {
        const id = body.id as string;
        replies.set(id, [...(replies.get(id) ?? []), resolve]);
      }),
  );
  let lamp: Promise<void> | undefined;
  let bike: Promise<void> | undefined;
  act(() => {
    lamp = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    bike = hook.result.current.move('bike', { x: 20, y: 30, z: 40 });
    void hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  await act(async () => {
    replies.get('lamp')?.[0](Response.json({ error: 'internal_error' }, { status: 500 }));
    replies.get('bike')?.[0](Response.json({ error: 'internal_error' }, { status: 500 }));
    await bike;
  });
  expect(hook.result.current.view?.positions).toEqual(
    expect.arrayContaining([
      { id: 'lamp', x: 7, y: 8, z: 9, version: 0 },
      { id: 'bike', x: 20, y: 30, z: 40, version: 0 },
    ]),
  );
  expect(hook.result.current.toast).toBeUndefined();
  expect(hook.result.current.pending).toBe(true);
  await act(async () => {
    replies.get('lamp')?.[1](Response.json({ id: 'lamp', x: 7, y: 8, z: 9, version: 1 }));
    await lamp;
  });
  expect(hook.result.current.message).toBe('Positionen är inte sparad');
  expect(hook.result.current.pending).toBe(false);
  expect(hook.result.current.view?.positions.find(({ id }) => id === 'bike')).toEqual({
    id: 'bike',
    x: 20,
    y: 30,
    z: 40,
    version: 0,
  });
});

test.each(['position_conflict', 'content_conflict'])(
  '%s cannot replay a local position into replacement household content',
  async (error) => {
    const hook = await openView();
    hook.saved({
      contentVersion: 2,
      positions: [],
      settings: { ...defaultViewSettings, version: 0 },
    });
    const write = vi.fn(async () => Response.json({ error }, { status: 409 }));
    hook.write(write);
    await act(async () => {
      await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(hook.result.current.view).toBeNull();
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.message).toContain('innehåll');
    act(() => {
      void hook.result.current.move('lamp', { x: 10, y: 20, z: 30 });
    });
    expect(write).toHaveBeenCalledTimes(1);
  },
);

test.each([401, 403])(
  'a %s position denial clears personal content and invokes access loss',
  async (status) => {
    const hook = await openView();
    hook.write(async () => Response.json({ error: 'forbidden' }, { status }));
    await act(async () => {
      await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
    });
    expect(hook.result.current.view).toBeNull();
    expect(hook.onAccessLost).toHaveBeenCalledOnce();
  },
);

test('a completed position does not confirm a settings change that is still pending', async () => {
  const hook = await openView();
  let releaseSettings!: (response: Response) => void;
  hook.write(async (body) => {
    if (body.settings)
      return new Promise<Response>((resolve) => {
        releaseSettings = resolve;
      });
    return Response.json({ id: body.id, ...(body.position as object), version: 1 });
  });
  let settings: Promise<void> | undefined;
  act(() => {
    settings = hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
  });
  await act(async () => {
    await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 7, y: 8, z: 9, version: 1 },
  ]);
  expect(hook.result.current.pending).toBe(true);
  expect(hook.result.current.message).toBe('Din personliga vy sparas…');
  expect(hook.result.current.toast).toBeUndefined();
  await act(async () => {
    releaseSettings(Response.json({ ...defaultViewSettings, allLabels: true, version: 1 }));
    await settings;
  });
  expect(hook.result.current.pending).toBe(false);
  expect(hook.result.current.view?.settings.allLabels).toBe(true);
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
});

test('a successful position save does not erase a settings-conflict refusal', async () => {
  const hook = await openView();
  let releaseSettings!: (response: Response) => void;
  let releasePosition!: (response: Response) => void;
  hook.write(
    (body) =>
      new Promise<Response>((resolve) => {
        if (body.settings) releaseSettings = resolve;
        else releasePosition = resolve;
      }),
  );
  let settings: Promise<void> | undefined;
  let position: Promise<void> | undefined;
  act(() => {
    settings = hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
    position = hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  await act(async () => {
    releaseSettings(Response.json({ error: 'view_settings_conflict' }, { status: 409 }));
    await settings;
  });
  expect(hook.result.current.message).toContain('Din äldre ändring sparades inte');
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 7, y: 8, z: 9, version: 0 },
  ]);
  await act(async () => {
    releasePosition(Response.json({ id: 'lamp', x: 7, y: 8, z: 9, version: 1 }));
    await position;
  });
  expect(hook.result.current.view?.settings.allLabels).toBe(false);
  expect(hook.result.current.view?.positions[0].version).toBe(1);
  expect(hook.result.current.pending).toBe(false);
  expect(hook.result.current.message).toContain('Din äldre ändring sparades inte');
  expect(hook.result.current.toast).toBeUndefined();
});

test.each([false, true])(
  'an unsaved object keeps its failure feedback during overlapping saves while settings refresh failure is %s',
  async (refreshFails) => {
    const hook = await openView();
    hook.write(async () => Response.json({ error: 'view_settings_conflict' }, { status: 409 }));
    if (refreshFails)
      hook.read(async () => Response.json({ error: 'internal_error' }, { status: 500 }));
    await act(async () => {
      await hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
    });
    const settingsWarning = hook.result.current.message;
    expect(settingsWarning).toContain(
      refreshFails ? 'Din vy kunde inte sparas' : 'Din äldre ändring sparades inte',
    );

    const replies = new Map<string, (response: Response) => void>();
    hook.write(
      (body) =>
        new Promise<Response>((resolve) => {
          replies.set(body.id as string, resolve);
        }),
    );
    let lamp: Promise<void> | undefined;
    let bike: Promise<void> | undefined;
    let chair: Promise<void> | undefined;
    act(() => {
      lamp = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
      bike = hook.result.current.move('bike', { x: 20, y: 30, z: 40 });
      chair = hook.result.current.move('chair', { x: 50, y: 60, z: 70 });
    });
    await act(async () => {
      replies.get('lamp')?.(Response.json({ error: 'internal_error' }, { status: 500 }));
      await lamp;
    });
    expect(hook.result.current.message).toBe('Positionen är inte sparad');
    await act(async () => {
      replies.get('bike')?.(Response.json({ id: 'bike', x: 20, y: 30, z: 40, version: 1 }));
      await bike;
    });
    expect(hook.result.current.pending).toBe(true);
    expect(hook.result.current.message).toBe('Positionen är inte sparad');
    expect(hook.result.current.toast).toBeUndefined();
    expect(hook.result.current.view?.positions).toEqual(
      expect.arrayContaining([
        { id: 'lamp', x: 1, y: 2, z: 3, version: 0 },
        { id: 'bike', x: 20, y: 30, z: 40, version: 1 },
        { id: 'chair', x: 50, y: 60, z: 70, version: 0 },
      ]),
    );
    let desk: Promise<void> | undefined;
    act(() => {
      desk = hook.result.current.move('desk', { x: 80, y: 90, z: 100 });
    });
    expect(hook.result.current.message).toBe('Positionen är inte sparad');
    expect(hook.result.current.pending).toBe(true);
    await act(async () => {
      replies.get('desk')?.(Response.json({ id: 'desk', x: 80, y: 90, z: 100, version: 1 }));
      await desk;
    });
    expect(hook.result.current.message).toBe('Positionen är inte sparad');
    expect(hook.result.current.pending).toBe(true);
    expect(hook.result.current.toast).toBeUndefined();

    hook.write(async (body) =>
      Response.json({ id: body.id, ...(body.position as object), version: 1 }),
    );
    await act(async () => {
      await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
    });
    expect(hook.result.current.view?.positions).toEqual(
      expect.arrayContaining([
        { id: 'lamp', x: 7, y: 8, z: 9, version: 1 },
        { id: 'bike', x: 20, y: 30, z: 40, version: 1 },
      ]),
    );
    expect(hook.result.current.message).toBe(settingsWarning);
    expect(hook.result.current.toast).toBeUndefined();
    expect(hook.result.current.pending).toBe(true);
    await act(async () => {
      replies.get('chair')?.(Response.json({ id: 'chair', x: 50, y: 60, z: 70, version: 1 }));
      await chair;
    });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.message).toBe(settingsWarning);
    expect(hook.result.current.toast).toBeUndefined();
  },
);

test.each([
  ['pending', 'refresh'],
  ['later', 'settings'],
])(
  'a %s position cannot confirm settings after a failed conflict refresh until %s succeeds',
  async (order, recovery) => {
    const hook = await openView();
    let releaseSettings!: (response: Response) => void;
    let releasePosition!: (response: Response) => void;
    hook.write(
      (body) =>
        new Promise<Response>((resolve) => {
          if (body.settings) releaseSettings = resolve;
          else releasePosition = resolve;
        }),
    );
    hook.read(async () => Response.json({ error: 'internal_error' }, { status: 500 }));
    let settings: Promise<void> | undefined;
    let position: Promise<void> | undefined;
    act(() => {
      settings = hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
      if (order === 'pending') position = hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
    });
    await act(async () => {
      releaseSettings(Response.json({ error: 'view_settings_conflict' }, { status: 409 }));
      await settings;
    });
    expect(hook.result.current.message).toBe(
      'Din vy kunde inte sparas. Läs in aktuella placeringar innan du fortsätter.',
    );
    expect(hook.result.current.pending).toBe(order === 'pending');
    if (order === 'later')
      act(() => {
        position = hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
      });
    await act(async () => {
      releasePosition(Response.json({ id: 'lamp', x: 7, y: 8, z: 9, version: 1 }));
      await position;
    });
    expect(hook.result.current.view?.positions).toEqual([
      { id: 'lamp', x: 7, y: 8, z: 9, version: 1 },
    ]);
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.message).toBe(
      'Din vy kunde inte sparas. Läs in aktuella placeringar innan du fortsätter.',
    );
    expect(hook.result.current.toast).toBeUndefined();
    const recovered: PersonalView = {
      contentVersion: 1,
      positions: [{ id: 'lamp', x: 7, y: 8, z: 9, version: 1 }],
      settings: { ...defaultViewSettings, version: 2 },
    };
    hook.read(async () => Response.json(recovered));
    hook.write(async (body) =>
      Response.json(
        body.settings
          ? { ...body.settings, version: 2 }
          : { id: body.id, ...(body.position as object), version: 2 },
      ),
    );
    await act(async () => {
      if (recovery === 'refresh') await hook.result.current.refresh();
      else await hook.result.current.configure(defaultViewSettings);
    });
    expect(hook.result.current.view?.settings).toEqual(recovered.settings);
    await act(async () => {
      await hook.result.current.move('lamp', { x: 10, y: 20, z: 30 });
    });
    expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
    expect(hook.result.current.toast).toBe(true);
  },
);

test('a delayed position-conflict read preserves settings confirmed after the read began', async () => {
  const hook = await openView();
  let releaseSettings!: (response: Response) => void;
  let releaseRead!: (response: Response) => void;
  hook.read(
    () =>
      new Promise<Response>((resolve) => {
        releaseRead = resolve;
      }),
  );
  let conflict = true;
  hook.write(async (body) => {
    if (body.settings)
      return new Promise<Response>((resolve) => {
        releaseSettings = resolve;
      });
    if (conflict) {
      conflict = false;
      return Response.json({ error: 'position_conflict' }, { status: 409 });
    }
    return Response.json({ id: body.id, ...(body.position as object), version: 5 });
  });
  let settings: Promise<void> | undefined;
  let position: Promise<void> | undefined;
  await act(async () => {
    settings = hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
    position = hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  await act(async () => {
    releaseSettings(Response.json({ ...defaultViewSettings, allLabels: true, version: 1 }));
    await settings;
  });
  await act(async () => {
    releaseRead(
      Response.json({
        contentVersion: 1,
        positions: [{ id: 'lamp', x: 20, y: 30, z: 40, version: 4 }],
        settings: { ...defaultViewSettings, version: 0 },
      }),
    );
    await position;
  });
  expect(hook.result.current.view?.settings).toEqual({
    ...defaultViewSettings,
    allLabels: true,
    version: 1,
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 7, y: 8, z: 9, version: 5 },
  ]);
  expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
});

test.each(['success', 'failure'])(
  'late %s from a previous household cannot change the newly opened view',
  async (outcome) => {
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
    hook.saved({
      contentVersion: 4,
      positions: [{ id: 'lamp', x: 20, y: 30, z: 40, version: 8 }],
      settings: { ...defaultViewSettings, version: 2 },
    });
    await act(async () => {
      hook.rerender({ path: '/another-household/map' });
    });
    await act(async () => {
      release(
        outcome === 'success'
          ? Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 1 })
          : Response.json({ error: 'forbidden' }, { status: 403 }),
      );
      await saving;
    });
    expect(hook.result.current.view?.positions).toEqual([
      { id: 'lamp', x: 20, y: 30, z: 40, version: 8 },
    ]);
    expect(hook.result.current.message).toBe('');
    expect(hook.result.current.pending).toBe(false);
    expect(hook.onAccessLost).not.toHaveBeenCalled();
  },
);

test.each([
  ['write', 'success'],
  ['write', 'failure'],
  ['read', 'success'],
  ['read', 'failure'],
])(
  'a late settings %s with %s cannot affect the current household or its pending position',
  async (phase, outcome) => {
    const hook = await openView();
    let releaseSettings!: (response: Response) => void;
    const delayed = () =>
      new Promise<Response>((resolve) => {
        releaseSettings = resolve;
      });
    hook.write(async () =>
      phase === 'write'
        ? delayed()
        : Response.json({ error: 'view_settings_conflict' }, { status: 409 }),
    );
    if (phase === 'read') hook.read(delayed);
    let settings: Promise<void> | undefined;
    await act(async () => {
      settings = hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
    });
    const next: PersonalView = {
      contentVersion: 4,
      positions: [],
      settings: { ...defaultViewSettings, version: 2 },
    };
    hook.read(async () => Response.json(next));
    await act(async () => {
      hook.rerender({ path: '/another-household/map' });
    });
    let releasePosition!: (response: Response) => void;
    hook.write(
      () =>
        new Promise<Response>((resolve) => {
          releasePosition = resolve;
        }),
    );
    let position: Promise<void> | undefined;
    act(() => {
      position = hook.result.current.move('bike', { x: 20, y: 30, z: 40 });
    });
    await act(async () => {
      releaseSettings(
        outcome === 'failure'
          ? Response.json({ error: 'forbidden' }, { status: 403 })
          : Response.json(
              phase === 'write'
                ? { ...defaultViewSettings, allLabels: true, version: 1 }
                : {
                    contentVersion: 1,
                    positions: [],
                    settings: { ...defaultViewSettings, allLabels: true, version: 1 },
                  },
            ),
      );
      await settings;
    });
    expect(hook.result.current.view).toEqual({
      ...next,
      positions: [{ id: 'bike', x: 20, y: 30, z: 40, version: 0 }],
    });
    expect(hook.result.current.pending).toBe(true);
    expect(hook.result.current.message).toBe('Din personliga vy sparas…');
    expect(hook.onAccessLost).not.toHaveBeenCalled();
    await act(async () => {
      releasePosition(Response.json({ id: 'bike', x: 20, y: 30, z: 40, version: 1 }));
      await position;
    });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.message).toBe('Din personliga vy är sparad.');
  },
);

test('a settings conflict with replacement content stops pending personal work', async () => {
  const hook = await openView();
  hook.saved({
    contentVersion: 2,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  });
  hook.write(async () => Response.json({ error: 'content_conflict' }, { status: 409 }));
  await act(async () => {
    await hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
  });
  expect(hook.result.current.view).toBeNull();
  expect(hook.result.current.pending).toBe(false);
  expect(hook.result.current.message).toBe(
    'Hushållets innehåll har ersatts. Läs in kartan innan du fortsätter.',
  );
  const write = vi.fn();
  hook.write(write);
  act(() => {
    void hook.result.current.configure(defaultViewSettings);
  });
  expect(write).not.toHaveBeenCalled();
});

test.each([401, 403])(
  'a %s denial while refreshing a settings conflict clears the view and reports access loss',
  async (status) => {
    const hook = await openView();
    hook.write(async () => Response.json({ error: 'view_settings_conflict' }, { status: 409 }));
    hook.read(async () => Response.json({ error: 'forbidden' }, { status }));
    await act(async () => {
      await hook.result.current.configure({ ...defaultViewSettings, allLabels: true });
    });
    expect(hook.result.current.view).toBeNull();
    expect(hook.result.current.pending).toBe(false);
    expect(hook.onAccessLost).toHaveBeenCalledOnce();
  },
);

test('an object removed during conflict handling cannot be retried while another object stays local', async () => {
  const hook = await openView();
  hook.write(async (body) =>
    Response.json(
      { error: body.id === 'lamp' ? 'object_unavailable' : 'internal_error' },
      { status: body.id === 'lamp' ? 400 : 500 },
    ),
  );
  await act(async () => {
    await Promise.all([
      hook.result.current.move('lamp', { x: 1, y: 2, z: 3 }),
      hook.result.current.move('bike', { x: 7, y: 8, z: 9 }),
    ]);
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'bike', x: 7, y: 8, z: 9, version: 0 },
  ]);
  expect(hook.result.current.toast).toBeUndefined();
});

test('a delayed conflict read preserves a different object whose newer save has already completed', async () => {
  const hook = await openView();
  let releaseRead!: (response: Response) => void;
  hook.read(
    () =>
      new Promise<Response>((resolve) => {
        releaseRead = resolve;
      }),
  );
  let conflict = true;
  hook.write(async (body) => {
    if (body.id === 'lamp' && conflict) {
      conflict = false;
      return Response.json({ error: 'position_conflict' }, { status: 409 });
    }
    return Response.json({
      id: body.id,
      ...(body.position as object),
      version: body.id === 'bike' ? 1 : 5,
    });
  });
  let saving: Promise<void> | undefined;
  await act(async () => {
    saving = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
  });
  await act(async () => {
    await hook.result.current.move('bike', { x: 7, y: 8, z: 9 });
  });
  await act(async () => {
    releaseRead(
      Response.json({
        contentVersion: 1,
        positions: [{ id: 'lamp', x: 20, y: 30, z: 40, version: 4 }],
        settings: { ...defaultViewSettings, version: 0 },
      }),
    );
    await saving;
  });
  expect(hook.result.current.view?.positions).toEqual(
    expect.arrayContaining([
      { id: 'lamp', x: 1, y: 2, z: 3, version: 5 },
      { id: 'bike', x: 7, y: 8, z: 9, version: 1 },
    ]),
  );
});

test('failure to read a conflicting saved position keeps the latest local position unsaved', async () => {
  const hook = await openView();
  hook.write(async () => Response.json({ error: 'position_conflict' }, { status: 409 }));
  hook.read(async () => Response.json({ error: 'internal_error' }, { status: 500 }));
  await act(async () => {
    await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 7, y: 8, z: 9, version: 0 },
  ]);
  expect(hook.result.current.pending).toBe(false);
  expect(hook.result.current.message).toBe('Positionen är inte sparad');
  expect(hook.result.current.toast).toBeUndefined();
  expect(hook.onAccessLost).not.toHaveBeenCalled();
  hook.read(async () =>
    Response.json({
      contentVersion: 1,
      positions: [{ id: 'lamp', x: 20, y: 30, z: 40, version: 4 }],
      settings: { ...defaultViewSettings, version: 0 },
    }),
  );
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.view?.positions).toEqual([
    { id: 'lamp', x: 7, y: 8, z: 9, version: 4 },
  ]);
  expect(hook.result.current.message).toBe('Positionen är inte sparad');
});

test.each(['success', 'failure'])(
  'a late explicit refresh %s cannot affect another household',
  async (outcome) => {
    const hook = await openView();
    let releaseRead!: (response: Response) => void;
    hook.read(
      () =>
        new Promise<Response>((resolve) => {
          releaseRead = resolve;
        }),
    );
    let reading!: Promise<void>;
    act(() => {
      reading = hook.result.current.refresh();
    });
    const next: PersonalView = {
      contentVersion: 4,
      positions: [{ id: 'bike', x: 20, y: 30, z: 40, version: 8 }],
      settings: { ...defaultViewSettings, version: 2 },
    };
    hook.read(async () => Response.json(next));
    await act(async () => {
      hook.rerender({ path: '/another-household/map' });
    });
    await act(async () => {
      releaseRead(
        outcome === 'success'
          ? Response.json({
              contentVersion: 1,
              positions: [],
              settings: { ...defaultViewSettings, version: 0 },
            })
          : Response.json({ error: 'forbidden' }, { status: 403 }),
      );
      await reading;
    });
    expect(hook.result.current.view).toEqual(next);
    expect(hook.result.current.message).toBe('');
    expect(hook.onAccessLost).not.toHaveBeenCalled();
  },
);

test.each([
  ['position_conflict', 'success'],
  ['position_conflict', 'failure'],
  ['object_unavailable', 'success'],
  ['object_unavailable', 'failure'],
])(
  'a late %s read with %s from a previous household cannot replace its newly opened view',
  async (error, outcome) => {
    const hook = await openView();
    let releaseRead!: (response: Response) => void;
    hook.write(async () => Response.json({ error }, { status: 409 }));
    hook.read(
      () =>
        new Promise<Response>((resolve) => {
          releaseRead = resolve;
        }),
    );
    let saving: Promise<void> | undefined;
    await act(async () => {
      saving = hook.result.current.move('lamp', { x: 1, y: 2, z: 3 });
    });
    const next: PersonalView = {
      contentVersion: 4,
      positions: [{ id: 'lamp', x: 20, y: 30, z: 40, version: 8 }],
      settings: { ...defaultViewSettings, version: 2 },
    };
    hook.read(async () => Response.json(next));
    await act(async () => {
      hook.rerender({ path: '/another-household/map' });
    });
    await act(async () => {
      releaseRead(
        outcome === 'success'
          ? Response.json({
              contentVersion: 1,
              positions: [],
              settings: { ...defaultViewSettings, version: 0 },
            })
          : Response.json({ error: 'forbidden' }, { status: 403 }),
      );
      await saving;
    });
    expect(hook.result.current.view).toEqual(next);
    expect(hook.result.current.message).toBe('');
    expect(hook.result.current.pending).toBe(false);
    expect(hook.onAccessLost).not.toHaveBeenCalled();
  },
);

test.each([401, 403])(
  'a %s denial while reading a conflicting position clears the view and reports lost access',
  async (status) => {
    const hook = await openView();
    hook.write(async () => Response.json({ error: 'position_conflict' }, { status: 409 }));
    hook.read(async () => Response.json({ error: 'forbidden' }, { status }));
    await act(async () => {
      await hook.result.current.move('lamp', { x: 7, y: 8, z: 9 });
    });
    expect(hook.result.current.view).toBeNull();
    expect(hook.result.current.pending).toBe(false);
    expect(hook.onAccessLost).toHaveBeenCalledOnce();
  },
);

test('refreshing replacement content invalidates a late success from the prior content', async () => {
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
  hook.saved({
    contentVersion: 2,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  });
  await act(async () => {
    await hook.result.current.refresh();
  });
  await act(async () => {
    release(Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 1 }));
    await saving;
  });
  expect(hook.result.current.view?.contentVersion).toBe(2);
  expect(hook.result.current.view?.positions).toEqual([]);
  expect(hook.result.current.message).toBe('Aktuell personlig vy är inläst.');
  expect(hook.result.current.pending).toBe(false);
});

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
