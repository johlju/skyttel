import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';

const context = {
  user: { id: 'alex', name: 'Alex Exempel' },
  households: [{ id: 'linden', name: 'Hushållet Linden', role: 'administrator' }],
  client: { clientId: 'synthetic-client', name: 'Påhittad assistent' },
  connections: [
    {
      id: 'synthetic-grant',
      householdId: 'linden',
      userId: 'alex',
      clientName: 'Påhittad assistent',
      userName: 'Alex Exempel',
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

function mount(
  path: string,
  responder: (path: string) => Response,
  scope = 'skyttel:read offline_access',
) {
  window.history.replaceState(
    {},
    '',
    `${path}?client_id=synthetic-client&scope=${encodeURIComponent(scope)}`,
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/bootstrap')
        return Response.json({
          status: 'ready',
          user: context.user,
          household: context.households[0],
          providers: ['google', 'microsoft'],
        });
      return responder(url);
    }),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

test('consent shows exact identity and read access, and failed approval permits a deliberate retry', async () => {
  mount('/assistant-consent', (path) =>
    path.startsWith('/api/assistants/context')
      ? Response.json(context)
      : Response.json({ error: 'forbidden' }, { status: 403 }),
  );
  await screen.findByText('Inloggad som Alex Exempel (alex).');
  expect(screen.getByText(/även när denna webbsida är stängd/)).toBeTruthy();
  const user = userEvent.setup();
  const approve = screen.getByRole('button', { name: 'Godkänn läsåtkomst' }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText('Välj hushåll'), 'linden');
  expect(approve.disabled).toBe(true);
  await user.click(screen.getByRole('checkbox'));
  expect(approve.disabled).toBe(false);
  await user.click(approve);
  expect((await screen.findByRole('alert')).textContent).toContain('Kontrollera din tillgång');
  expect(approve.disabled).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Nej, anslut inte' }));
  expect((await screen.findByRole('alert')).textContent).toContain('starta anslutningen igen');
});

test('map work consent requires its own choice and clearly separates connection access from a save instruction', async () => {
  mount('/assistant-consent', () => Response.json(context), 'skyttel:read skyttel:write');
  await screen.findByText('Inloggad som Alex Exempel (alex).');
  const user = userEvent.setup();
  const approve = screen.getByRole('button', { name: 'Godkänn kartarbete' }) as HTMLButtonElement;
  await user.selectOptions(screen.getByLabelText('Välj hushåll'), 'linden');
  await user.click(screen.getByLabelText(/Jag tillåter extern AI-behandling/));
  expect(approve.disabled).toBe(true);
  await user.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
  expect(approve.disabled).toBe(false);
  expect(screen.getByText(/Medgivandet sparar inga kartuppgifter/)).toBeTruthy();
});

test('revocation failure preserves the visible connection, successful retry refreshes it', async () => {
  let failed = true;
  let revoked = false;
  mount('/assistants', (path) => {
    if (path.startsWith('/api/assistants/context'))
      return Response.json({ ...context, connections: revoked ? [] : context.connections });
    if (failed) {
      failed = false;
      return Response.json({}, { status: 503 });
    }
    revoked = true;
    return Response.json({ revoked: true });
  });
  const user = userEvent.setup();
  const button = await screen.findByRole('button', {
    name: 'Återkalla anslutning för Påhittad assistent',
  });
  await user.click(button);
  await screen.findByRole('alert');
  expect(screen.getByText('Påhittad assistent – Alex Exempel – Hushållet Linden')).toBeTruthy();
  await user.click(button);
  expect(await screen.findByText('Inga aktiva assistentanslutningar.')).toBeTruthy();
});

test('context failure displays recovery guidance without a consent action', async () => {
  mount('/assistant-consent', () => Response.json({}, { status: 403 }));
  expect((await screen.findByRole('alert')).textContent).toContain('Kontrollera din tillgång');
  expect(screen.queryByRole('button', { name: 'Godkänn läsåtkomst' })).toBeNull();
});
