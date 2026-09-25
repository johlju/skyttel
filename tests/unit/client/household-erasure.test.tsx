import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { HouseholdErasure } from '../../../src/client/HouseholdErasure.js';
import type { ErasureReview, ErasureStatus } from '../../../src/shared/household-erasure.js';

const path = '/api/households/linden/erasure';
const selection = [{ kind: 'object' as const, id: 'lamp' }];
const catalog = {
  objects: [
    { id: 'lamp', name: 'Lampan' },
    { id: 'chair', name: 'Stolen' },
  ],
  relationships: [],
  objectTypes: [],
  relationshipTypes: [],
  status: null,
};
const reviewed: ErasureReview = {
  selection,
  token: 'reviewed-content',
  contentVersion: 1,
  objects: [{ id: 'lamp', name: 'Lampan' }],
  relationships: [],
  objectTypes: [],
  relationshipTypes: [],
  images: 2,
  positions: 3,
  imageVersions: [{ id: 'shared-image-version', objectId: 'lamp' }],
  privateImages: 1,
  privateObjects: 1,
  privateRelationships: 2,
  historyChanges: 3,
  privateChanges: 4,
};
const completed = (operationId: string): ErasureStatus => ({
  operationId,
  phase: 'completed',
  counts: { objects: 1, relationships: 0, objectTypes: 0, relationshipTypes: 0, images: 2 },
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('reviews public scope and private counts before an explicit irreversible confirmation', async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(catalog);
    const body = JSON.parse(String(init?.body));
    if (url.endsWith('/review')) {
      expect(body).toEqual({ selection });
      return Response.json(reviewed);
    }
    if (url.endsWith('/execute')) {
      bodies.push(body);
      return Response.json({ status: completed(body.operationId) });
    }
    throw new Error('Unexpected request');
  });
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  expect(screen.getByText(/kan inte ångras i Skyttel/)).toBeDefined();
  expect(screen.getByText(/Redan nedladdade exporter/)).toBeDefined();
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Lampan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  const review = await screen.findByRole('region', { name: 'Omfattning att bekräfta' });
  expect(within(review).getByText('Lampan')).toBeDefined();
  expect(within(review).queryByText('Stolen')).toBeNull();
  expect(review.textContent).toContain('Privata objekt: 1');
  expect(review.textContent).toContain('Privata samband: 2');
  expect(review.textContent).toContain('Historiska ändringar: 3');
  expect(review.textContent).toContain('Privata ändringar: 4');
  expect(review.textContent).toContain('Personliga placeringar: 3');
  expect(review.textContent).toContain('Privata bildversioner: 1');
  expect(within(review).getByText('shared-image-version')).toBeDefined();
  const execute = screen.getByRole('button', { name: 'Radera permanent' }) as HTMLButtonElement;
  expect(execute.disabled).toBe(true);
  expect(bodies).toEqual([]);
  await userEvent.type(screen.getByLabelText('Skriv RADERA PERMANENT'), 'RADERA PERMANENT');
  await userEvent.click(execute);
  expect(await screen.findByText('Den permanenta raderingen är slutförd.')).toBeDefined();
  expect(bodies).toEqual([
    {
      selection,
      token: 'reviewed-content',
      confirmation: 'RADERA PERMANENT',
      operationId: expect.any(String),
    },
  ]);
  expect(screen.queryByRole('region', { name: 'Omfattning att bekräfta' })).toBeNull();
});

test.each(['prepared', 'cleanup'] as const)(
  'reload restores %s and offers completion without claiming success',
  async (phase) => {
    const pending = { ...completed('pending-1'), phase };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === path) return Response.json({ ...catalog, status: pending });
      expect(url).toBe(`${path}/resume`);
      expect(JSON.parse(String(init?.body))).toEqual({ operationId: 'pending-1' });
      return Response.json({ status: completed('pending-1') });
    });
    render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
    const resume = await screen.findByRole('button', { name: 'Försök slutföra raderingen' });
    expect(screen.queryByText('Den permanenta raderingen är slutförd.')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/Hushållets innehåll är tillfälligt otillgängligt/)).toBeDefined();
    await userEvent.click(resume);
    expect(await screen.findByText('Den permanenta raderingen är slutförd.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Försök slutföra raderingen' })).toBeNull();
  },
);

test('a terminal failure leaves content selectable without claiming erasure or offering resume', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ ...catalog, status: { ...completed('failed-1'), phase: 'failed' } }),
  );
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  expect(await screen.findByText(/Ingen information raderades genom detta försök/)).toBeDefined();
  expect((screen.getByRole('checkbox', { name: 'Lampan' }) as HTMLInputElement).disabled).toBe(
    false,
  );
  expect(screen.queryByRole('button', { name: 'Försök slutföra raderingen' })).toBeNull();
  expect(screen.queryByText('Den permanenta raderingen är slutförd.')).toBeNull();
});

async function confirm() {
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Lampan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  await userEvent.type(await screen.findByLabelText('Skriv RADERA PERMANENT'), 'RADERA PERMANENT');
  await userEvent.click(screen.getByRole('button', { name: 'Radera permanent' }));
}

test.each([true, false])(
  'a lost execute reply is recovered without a new operation when registered=%s',
  async (registered) => {
    const attempts: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === path)
        return Response.json({
          ...catalog,
          status: attempts.length && registered ? completed(String(attempts[0].operationId)) : null,
        });
      if (url.endsWith('/review')) return Response.json(reviewed);
      if (url.endsWith('/execute')) {
        attempts.push(JSON.parse(String(init?.body)));
        if (attempts.length === 1) throw new TypeError('Lost reply');
        return Response.json({ status: completed(String(attempts[0].operationId)) });
      }
      throw new Error('Unexpected request');
    });
    render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
    await confirm();
    expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är oklart');
    expect(screen.queryByText('Den permanenta raderingen är slutförd.')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
      }),
    );
    if (!registered) {
      expect((await screen.findByRole('alert')).textContent).toContain('Inget bekräftat resultat');
      await userEvent.click(screen.getByRole('button', { name: 'Återförsök samma radering' }));
      expect(attempts).toEqual([attempts[0], attempts[0]]);
    } else expect(attempts).toHaveLength(1);
    expect(await screen.findByText('Den permanenta raderingen är slutförd.')).toBeDefined();
    if (registered) {
      const lamp = screen.getByRole('checkbox', { name: 'Lampan' }) as HTMLInputElement;
      expect(lamp.checked).toBe(false);
      await userEvent.click(lamp);
      expect(screen.queryByText('Den permanenta raderingen är slutförd.')).toBeNull();
    }
  },
);

test('changed content invalidates confirmation and requires a new scope review', async () => {
  let changed = false;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === path) return Response.json(catalog);
    if (url.endsWith('/review')) return Response.json({ ...reviewed, images: changed ? 5 : 2 });
    changed = true;
    return Response.json({ error: 'erasure_review_changed' }, { status: 409 });
  });
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  await confirm();
  expect((await screen.findByRole('alert')).textContent).toContain('Granska raderingen igen');
  expect(screen.queryByRole('button', { name: 'Radera permanent' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Återförsök samma radering' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  expect(
    (await screen.findByRole('region', { name: 'Omfattning att bekräfta' })).textContent,
  ).toContain('Bildversioner: 5');
  expect((screen.getByLabelText('Skriv RADERA PERMANENT') as HTMLInputElement).value).toBe('');
  expect(
    (screen.getByRole('button', { name: 'Radera permanent' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test.each([401, 403])(
  'access denial %s hides the administrative action and refreshes access',
  async (status) => {
    const onAccessLost = vi.fn();
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === path) return Response.json(catalog);
      return Response.json({ error: 'forbidden' }, { status });
    });
    render(<HouseholdErasure householdId="linden" onAccessLost={onAccessLost} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Lampan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
    expect(onAccessLost).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Permanent radering' })).toBeNull();
  },
);

test('failed initial read can be retried and a failed review offers no confirmation', async () => {
  let unavailable = true;
  vi.stubGlobal('fetch', async (url: string) => {
    if (unavailable || url.endsWith('/review')) throw new TypeError('Disconnected');
    return Response.json(catalog);
  });
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('kunde inte hämtas');
  unavailable = false;
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
    }),
  );
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Lampan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Omfattningen kunde inte hämtas',
  );
  expect(screen.queryByLabelText('Skriv RADERA PERMANENT')).toBeNull();
});

test('a failed resumption keeps completion uncertain until a durable status can be read', async () => {
  let resumed = false;
  let unavailable = true;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/resume')) {
      resumed = true;
      throw new TypeError('Lost reply');
    }
    if (resumed && unavailable) throw new TypeError('Offline');
    return Response.json({
      ...catalog,
      status: resumed ? completed('pending-1') : { ...completed('pending-1'), phase: 'cleanup' },
    });
  });
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Försök slutföra raderingen' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är oklart');
  expect(screen.queryByText('Den permanenta raderingen är slutförd.')).toBeNull();
  const read = screen.getByRole('button', {
    name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
  });
  await userEvent.click(read);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Raderingsstatus kunde inte hämtas',
  );
  unavailable = false;
  await userEvent.click(read);
  expect(await screen.findByText('Den permanenta raderingen är slutförd.')).toBeDefined();
});

test('changing selection removes the old scope and confirmation', async () => {
  vi.stubGlobal('fetch', async (url: string) => Response.json(url === path ? catalog : reviewed));
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  const lamp = await screen.findByRole('checkbox', { name: 'Lampan' });
  await userEvent.click(lamp);
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  await userEvent.type(await screen.findByLabelText('Skriv RADERA PERMANENT'), 'RADERA PERMANENT');
  await userEvent.click(lamp);
  expect(screen.queryByRole('region', { name: 'Omfattning att bekräfta' })).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Granska raderingen' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test('equal public names show stable identities for selection and final scope', async () => {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path)
      return Response.json({
        ...catalog,
        objects: [
          { id: 'lamp', name: 'Lampan' },
          { id: 'second-lamp', name: 'Lampan' },
        ],
      });
    expect(JSON.parse(String(init?.body))).toEqual({
      selection: [{ kind: 'object', id: 'second-lamp' }],
    });
    return Response.json({ ...reviewed, objects: [{ id: 'second-lamp', name: 'Lampan' }] });
  });
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  expect(await screen.findByText('second-lamp')).toBeDefined();
  await userEvent.click(screen.getAllByRole('checkbox', { name: 'Lampan' })[1]);
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  const review = await screen.findByRole('region', { name: 'Omfattning att bekräfta' });
  expect(within(review).getByText('second-lamp')).toBeDefined();
});

test.each(['initial', 'execute', 'resume', 'refresh'])(
  'access lost during %s closes the administrative flow',
  async (stage) => {
    const onAccessLost = vi.fn();
    let reads = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === path) {
        reads += 1;
        if (stage === 'initial' || (stage === 'refresh' && reads > 1))
          return Response.json({ error: 'forbidden' }, { status: 403 });
        return Response.json({
          ...catalog,
          status: stage === 'resume' ? { ...completed('pending-1'), phase: 'cleanup' } : null,
        });
      }
      if (url.endsWith('/review')) return Response.json(reviewed);
      return Response.json({ error: 'forbidden' }, { status: 403 });
    });
    render(<HouseholdErasure householdId="linden" onAccessLost={onAccessLost} />);
    if (stage === 'execute') await confirm();
    if (stage === 'resume')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Försök slutföra raderingen' }),
      );
    if (stage === 'refresh') {
      await screen.findByRole('checkbox', { name: 'Lampan' });
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
        }),
      );
    }
    await vi.waitFor(() => expect(onAccessLost).toHaveBeenCalledOnce());
    expect(screen.queryByRole('heading', { name: 'Permanent radering' })).toBeNull();
    expect(screen.queryByText('Den permanenta raderingen är slutförd.')).toBeNull();
  },
);

test('objects, relationships and both definition kinds can be selected independently', async () => {
  const collections = {
    ...catalog,
    relationships: [{ id: 'edge', name: 'Äger lampan' }],
    objectTypes: [{ id: 'object-type', name: 'Lampa' }],
    relationshipTypes: [{ id: 'edge-type', name: 'Äger' }],
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(collections);
    expect(JSON.parse(String(init?.body)).selection).toEqual([
      { kind: 'relationship', id: 'edge' },
      { kind: 'objectType', id: 'object-type' },
      { kind: 'relationshipType', id: 'edge-type' },
    ]);
    return Response.json({ ...reviewed, ...collections });
  });
  render(<HouseholdErasure householdId="linden" onAccessLost={vi.fn()} />);
  const lamp = await screen.findByRole('checkbox', { name: 'Lampan' });
  await userEvent.click(lamp);
  for (const name of ['Äger lampan', 'Lampa', 'Äger'])
    await userEvent.click(screen.getByRole('checkbox', { name }));
  await userEvent.click(lamp);
  await userEvent.click(screen.getByRole('button', { name: 'Granska raderingen' }));
  const review = await screen.findByRole('region', { name: 'Omfattning att bekräfta' });
  for (const name of ['Äger lampan', 'Lampa', 'Äger'])
    expect(within(review).getByText(name, { exact: true })).toBeDefined();
});
