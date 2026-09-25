import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';

const state = {
  userId: 'alex',
  contentVersion: 1,
  types: [{ id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' }],
  relationshipTypes: [],
  relationships: [],
  objects: [
    {
      id: 'lamp',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Lampan',
      description: '',
    },
  ],
  draft: { version: 0, changes: [] },
};

function service() {
  let view: PersonalView = {
    contentVersion: 1,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  };
  let failure: 'network' | 'conflict' | 'denied' | 'uncertain' | null = null;
  let readFailure = false;
  let initialFailure = false;
  let pending: Promise<void> | undefined;
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push(url);
    if (url.endsWith('/view')) {
      if (initialFailure || readFailure) throw new Error('Synthetic transport outage');
      if (failure === 'denied') return Response.json({ error: 'forbidden' }, { status: 403 });
      return Response.json(view);
    }
    if (url.includes('/view/')) {
      if (pending) await pending;
      if (failure === 'network') {
        readFailure = true;
        throw new Error('Synthetic transport outage');
      }
      if (failure === 'conflict') {
        view = {
          contentVersion: 1,
          positions: [{ id: 'lamp', x: 1, y: 4, z: -2, version: 2 }],
          settings: { ...defaultViewSettings, axisPinned: true, version: 2 },
        };
        return Response.json(
          { error: url.endsWith('position') ? 'position_conflict' : 'view_settings_conflict' },
          { status: 409 },
        );
      }
      if (failure === 'denied') return Response.json({ error: 'forbidden' }, { status: 403 });
      if (failure === 'uncertain')
        return Response.json({ error: 'internal_error' }, { status: 500 });
      const body = JSON.parse(init?.body as string);
      if (url.endsWith('position')) {
        const position = { ...body.position, id: body.id, version: body.version + 1 };
        view = { ...view, contentVersion: 1, positions: [position] };
        return Response.json(position);
      }
      const settings = { ...body.settings, version: body.version + 1 };
      view = { ...view, settings };
      return Response.json(settings);
    }
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.includes('/map?')) return Response.json(state);
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  return {
    read: () => view,
    requests,
    fail(value: typeof failure) {
      failure = value;
      readFailure = false;
    },
    initialFailure(value: boolean) {
      initialFailure = value;
    },
    pause(value: Promise<void>) {
      pending = value;
    },
  };
}
async function open() {
  render(<HouseholdMap householdId="home" />);
  await page.getByRole('button', { name: 'Lampan', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
  await page.getByText('Ordna min vy', { exact: true }).click();
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the public household editor saves personal movement and settings and reloads its latest view', async () => {
  const server = service();
  await open();
  await page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
  await expect
    .element(page.getByText('Din personliga vy är sparad.', { exact: true }))
    .toBeVisible();
  expect(server.read().positions).toHaveLength(1);
  await page.getByRole('button', { name: 'Flytta höger i rummet', exact: true }).click();
  await expect.poll(() => server.read().positions[0].version).toBe(2);
  await page.getByLabelText('Visa stjärnhimmel', { exact: true }).click();
  await expect.poll(() => server.read().settings.stars).toBe(true);
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  await expect
    .element(page.getByText('Aktuell personlig vy är inläst.', { exact: true }))
    .toBeVisible();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  expect(server.read().settings.version).toBe(1);
});

test.each(['position', 'settings'] as const)(
  'stale %s from a second client displays current values and an explicit refusal',
  async (kind) => {
    const server = service();
    await open();
    server.fail('conflict');
    if (kind === 'position')
      await page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
    else await page.getByLabelText('Visa stjärnhimmel', { exact: true }).click();
    await expect.element(page.getByText(/Din äldre ändring sparades inte/)).toBeVisible();
    await expect
      .element(page.getByLabelText('Visa axlar hela tiden', { exact: true }))
      .toBeChecked();
    await expect
      .element(page.getByLabelText('Visa stjärnhimmel', { exact: true }))
      .not.toBeChecked();
    server.fail(null);
    await page.getByRole('button', { name: 'Flytta nedåt i rummet', exact: true }).click();
    await expect
      .poll(() => server.read().positions[0])
      .toEqual({ id: 'lamp', x: 1, y: 3, z: -2, version: 3 });
  },
);

test.each(['network', 'uncertain', 'denied'] as const)(
  'an interrupted personal write handles %s without silently confirming it',
  async (failure) => {
    const server = service();
    await open();
    server.fail(failure);
    await page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
    if (failure === 'denied') {
      await expect
        .element(page.getByRole('alert'))
        .toHaveTextContent(
          'Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.',
        );
      await expect
        .element(page.getByRole('button', { name: 'Lista och detaljer', exact: true }))
        .not.toBeInTheDocument();
    } else if (failure === 'network') {
      await expect.element(page.getByText(/Din vy kunde inte sparas/)).toBeVisible();
      await expect
        .element(page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }))
        .toBeDisabled();
      server.fail(null);
      await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
      await expect
        .element(page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }))
        .toBeEnabled();
    } else await expect.element(page.getByText(/Ändringen kunde inte bekräftas/)).toBeVisible();
    expect(server.read().positions).toEqual([]);
  },
);

test('an initial read outage is recoverable and a revoked refresh clears personal content', async () => {
  const server = service();
  server.initialFailure(true);
  await open();
  await expect.element(page.getByText(/Din vy kunde inte sparas/)).toBeVisible();
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  server.initialFailure(false);
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  await expect
    .element(page.getByText('Aktuell personlig vy är inläst.', { exact: true }))
    .toBeVisible();
  server.fail('denied');
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent(
      'Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.',
    );
});

test('leaving the editor during an in-flight personal write does not render a late confirmation', async () => {
  const server = service();
  let finish = () => {};
  server.pause(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await open();
  await page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }))
    .toBeDisabled();
  cleanup();
  finish();
  await expect
    .element(page.getByText('Din personliga vy är sparad.', { exact: true }))
    .not.toBeInTheDocument();
});
