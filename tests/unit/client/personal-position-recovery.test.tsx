import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { FormLeaveProvider, useFormLeave } from '../../../src/client/FormLeave.js';
import { FormLossGuard } from '../../../src/client/FormLossGuard.js';
import { PersonalPositionRecovery } from '../../../src/client/PersonalPositionRecovery.js';
import { usePersonalView } from '../../../src/client/use-personal-view.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.body.dataset.signedOut;
});

function Work() {
  const onAccessLost = useCallback(() => {}, []);
  const personal = usePersonalView('/map', onAccessLost);
  const [dirty, setDirty] = useState(false);
  const { requestLeave, requestHouseholdLeave } = useFormLeave();
  return (
    <>
      <button type="button" onClick={() => void personal.move('lamp', { x: 1, y: 2, z: 3 })}>
        Ordna Lampan
      </button>
      <button type="button" onClick={() => setDirty(true)}>
        Redigera uppgift
      </button>
      <p>{dirty ? 'Oskickad uppgift' : 'Inga oskickade uppgifter'}</p>
      <FormLossGuard
        dirty={dirty}
        busy={false}
        householdId="home"
        onDiscard={() => setDirty(false)}
        onBlocked={() => {}}
      />
      <PersonalPositionRecovery
        personal={personal}
        householdId="home"
        objectName={(id) => (id === 'lamp' ? 'Lampan' : id)}
      />
      <Link to="/households/home/settings">Inställningar</Link>
      <Link to="/households/other">Annat hushåll</Link>
      <button type="button" onClick={() => requestLeave(() => {})}>
        Öppna ett annat objekt
      </button>
      <button
        type="button"
        onClick={() =>
          requestHouseholdLeave(() => {
            document.body.dataset.signedOut = 'true';
          })
        }
      >
        Logga ut
      </button>
    </>
  );
}

async function openWork(write?: () => Promise<Response>) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (init?.method === 'POST')
      return write ? write() : Response.json({ error: 'unavailable' }, { status: 503 });
    throw new Error('Unexpected request');
  });
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <FormLeaveProvider>
            <Work />
          </FormLeaveProvider>
        ),
      },
    ],
    { initialEntries: ['/households/home'] },
  );
  render(<RouterProvider router={router} />);
  await act(async () => {});
  await userEvent.click(screen.getByRole('button', { name: 'Ordna Lampan' }));
  return router;
}

test('recovery remains available without Navigation and same-household actions retain positions', async () => {
  const router = await openWork();
  const recovery = within(screen.getByRole('region', { name: 'Osparade personliga positioner' }));
  expect(recovery.getByText('Positionen är inte sparad')).toBeTruthy();
  expect(recovery.getByRole('button', { name: 'Försök igen' })).toBeTruthy();
  expect(recovery.getByRole('button', { name: 'Läs in sparad position' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Öppna ett annat objekt' }));
  expect(screen.queryByRole('dialog', { name: 'Lämna osparade positioner?' })).toBeNull();
  await userEvent.click(screen.getByRole('link', { name: 'Inställningar' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/households/home/settings'));
  expect(recovery.getByText('Positionen är inte sparad')).toBeTruthy();
});

test('later cancellation keeps both unsent form work and positions until every guard agrees', async () => {
  const router = await openWork();
  await userEvent.click(screen.getByRole('button', { name: 'Redigera uppgift' }));
  const warning = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(warning);
  expect(warning.defaultPrevented).toBe(true);
  await userEvent.click(screen.getByRole('link', { name: 'Annat hushåll' }));
  const form = await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' });
  await userEvent.click(
    within(form).getByRole('button', { name: 'Kasta ändringarna och fortsätt' }),
  );
  const positions = await screen.findByRole('dialog', { name: 'Lämna osparade positioner?' });
  expect(within(positions).getByRole('button', { name: 'Stanna kvar' })).toBe(
    document.activeElement,
  );
  fireEvent(positions, new Event('cancel', { cancelable: true }));
  expect(router.state.location.pathname).toBe('/households/home');
  expect(screen.getByText('Oskickad uppgift')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Osparade personliga positioner' })).toBeTruthy();
  await userEvent.click(screen.getByRole('link', { name: 'Annat hushåll' }));
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' })).getByRole(
      'button',
      { name: 'Kasta ändringarna och fortsätt' },
    ),
  );
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Lämna osparade positioner?' })).getByRole(
      'button',
      { name: 'Lämna och kasta positionerna' },
    ),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe('/households/other'));
  expect(screen.getByText('Inga oskickade uppgifter')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Osparade personliga positioner' })).toBeNull();
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});

test('logout waits for the position decision and loading an automatic position returns usable focus', async () => {
  await openWork();
  await userEvent.click(screen.getByRole('button', { name: 'Logga ut' }));
  let loss = within(await screen.findByRole('dialog', { name: 'Lämna osparade positioner?' }));
  await userEvent.click(loss.getByRole('button', { name: 'Stanna kvar' }));
  expect(document.body.dataset.signedOut).toBeUndefined();
  await userEvent.click(screen.getByRole('button', { name: 'Läs in sparad position' }));
  const result = await screen.findByRole('status');
  expect(result.textContent).toContain('Ingen position är sparad. Automatisk placering används.');
  expect(result).toBe(document.activeElement);
  expect(screen.queryByRole('region', { name: 'Osparade personliga positioner' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Ordna Lampan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Logga ut' }));
  loss = within(await screen.findByRole('dialog', { name: 'Lämna osparade positioner?' }));
  await userEvent.click(loss.getByRole('button', { name: 'Lämna och kasta positionerna' }));
  expect(document.body.dataset.signedOut).toBe('true');
});

test('a pending save that finishes during the leave prompt updates its status before the user decides', async () => {
  let release!: (response: Response) => void;
  const router = await openWork(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  await userEvent.click(screen.getByRole('link', { name: 'Annat hushåll' }));
  const loss = within(await screen.findByRole('dialog', { name: 'Lämna osparade positioner?' }));
  expect(loss.getByText(/Dina senaste positioner är inte sparade/)).toBeTruthy();
  await act(async () => {
    release(Response.json({ id: 'lamp', x: 1, y: 2, z: 3, version: 1 }));
  });
  expect(loss.getByText('Alla positioner är nu sparade. Du kan lämna hushållet.')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/households/home');
  await userEvent.click(loss.getByRole('button', { name: 'Lämna hushållet' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/households/other'));
});
