import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';

const anonymous = { status: 'anonymous', providers: ['google', 'microsoft'] };
const setup = {
  status: 'setup',
  providers: ['google', 'microsoft'],
  user: { id: 'alex', name: 'Alex Exempel' },
};
const household = { id: 'linden', name: 'Hushållet Linden', role: 'administrator' };
const ready = { ...setup, status: 'ready', household };
type Reply = { data?: unknown; status?: number; error?: Error };
const unexpectedRequests: string[] = [];

function serve(routes: Record<string, Reply[]>) {
  routes['/api/households/linden/map?reload=0'] ??= [
    {
      data: {
        userId: 'alex',
        contentVersion: 1,
        types: [],
        objects: [],
        relationshipTypes: [],
        relationships: [],
        draft: { version: 0, changes: [] },
      },
    },
  ];
  routes['/api/households/linden/map/operations'] ??= [{ data: { operations: [] } }];
  const fetch = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    const reply = routes[path]?.shift();
    if (!reply) {
      unexpectedRequests.push(path);
      throw new Error(`Unexpected synthetic HTTP request: ${path}`);
    }
    if (reply.error) throw reply.error;
    return new Response(JSON.stringify(reply.data ?? {}), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
function mount(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  unexpectedRequests.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(unexpectedRequests).toEqual([]);
});

describe('Skyttel application interface', () => {
  test('shows loading while opening and then offers both sign-in providers', async () => {
    let finishRequest: (value: Response) => void = () => {
      throw new Error('The synthetic request has not started');
    };
    const response = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response),
    );
    mount();
    expect(screen.getByRole('status').textContent).toBe('Öppnar Skyttel…');
    await act(async () => finishRequest(Response.json(anonymous)));
    expect(await screen.findByRole('button', { name: 'Fortsätt med Google' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Fortsätt med Microsoft' })).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Välkommen till Skyttel' }),
    );
  });

  test.each([{ status: 503 }, { error: new Error('Synthetic network failure') }])(
    'recovers from a failed initial request',
    async (failure) => {
      serve({ '/api/bootstrap': [failure, { data: anonymous }] });
      mount();
      await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }));
      expect(await screen.findByRole('heading', { name: 'Välkommen till Skyttel' })).toBeDefined();
    },
  );

  test.each(['/?authError=1', '/?error=access_denied'])(
    'explains provider errors returned in %s',
    async (path) => {
      serve({ '/api/bootstrap': [{ data: anonymous }] });
      mount(path);
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Inloggningen kunde inte slutföras',
      );
    },
  );

  test.each([{ status: 503 }, { data: { url: 42 } }, { data: { url: 'javascript:alert(1)' } }])(
    'allows another sign-in attempt after an invalid provider response',
    async (reply) => {
      serve({ '/api/bootstrap': [{ data: anonymous }], '/api/auth/sign-in/social': [reply] });
      mount();
      await userEvent.click(await screen.findByRole('button', { name: 'Fortsätt med Google' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Inloggningen kunde inte slutföras',
      );
      expect(
        (screen.getByRole('button', { name: 'Fortsätt med Microsoft' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    },
  );

  test.each(['Google', 'Microsoft'])(
    'starts %s sign-in and explains the pending navigation',
    async (provider) => {
      const fetch = serve({
        '/api/bootstrap': [{ data: anonymous }],
        '/api/auth/sign-in/social': [{ data: { url: '#provider-authorized' } }],
      });
      mount();
      await userEvent.click(
        await screen.findByRole('button', { name: `Fortsätt med ${provider}` }),
      );
      expect((await screen.findByRole('status')).textContent).toBe(
        'Du skickas vidare för att logga in.',
      );
      expect(
        (screen.getByRole('button', { name: `Öppnar ${provider}…` }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(window.location.hash).toBe('#provider-authorized');
      const [, init] = fetch.mock.calls.find(([path]) => path === '/api/auth/sign-in/social') ?? [];
      expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
        provider: provider.toLowerCase(),
        callbackURL: '/',
      });
    },
  );

  test('explains denied household access and offers sign-out', async () => {
    serve({ '/api/bootstrap': [{ data: { ...setup, status: 'forbidden' } }] });
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Hushållets namn' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Logga ut' })).toBeDefined();
  });

  test('focuses an invalid household name and permits correction', async () => {
    serve({ '/api/bootstrap': [{ data: setup }] });
    mount();
    const name = await screen.findByRole('textbox', { name: 'Hushållets namn' });
    await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
    expect(screen.getByRole('alert').textContent).toBe('Ange ett namn med 1–100 tecken.');
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');
  });

  test('creates a named household and opens its resulting page', async () => {
    const fetch = serve({
      '/api/bootstrap': [{ data: setup }, { data: ready }],
      '/api/households': [{ data: { household }, status: 201 }],
      '/api/households/linden': [{ data: { household } }],
    });
    mount();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Hushållets namn' }),
      '  Hushållet Linden  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
    expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
    const [, init] = fetch.mock.calls.find(([path]) => path === '/api/households') ?? [];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Hushållet Linden' });
  });

  test('shows server-side name validation without losing the entered name', async () => {
    serve({ '/api/bootstrap': [{ data: setup }], '/api/households': [{ status: 400 }] });
    mount();
    const name = await screen.findByRole('textbox', { name: 'Hushållets namn' });
    await userEvent.type(name, 'Linden');
    await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ange ett namn med 1–100 tecken.');
    expect((name as HTMLInputElement).value).toBe('Linden');
    expect(
      (screen.getByRole('button', { name: 'Skapa hushåll' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test.each([401, 403, 409])('refreshes access when creation returns %s', async (status) => {
    serve({
      '/api/bootstrap': [{ data: setup }, { data: { ...setup, status: 'forbidden' } }],
      '/api/households': [{ status }],
    });
    mount();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Hushållets namn' }), 'Linden');
    await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
    expect(
      await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
  });

  test.each([{ status: 503 }, { error: new Error('Synthetic connection interrupted') }])(
    'offers a status check after an uncertain creation outcome',
    async (failure) => {
      serve({
        '/api/bootstrap': [{ data: setup }, { data: ready }],
        '/api/households': [failure],
        '/api/households/linden': [{ data: { household } }],
      });
      mount();
      await userEvent.type(
        await screen.findByRole('textbox', { name: 'Hushållets namn' }),
        'Linden',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Kontrollera status' }));
      expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
    },
  );

  test.each(['administrator', 'member'])(
    'opens the current household and displays the %s role',
    async (role) => {
      serve({
        '/api/bootstrap': [{ data: { ...ready, household: { ...household, role } } }],
        '/api/households/linden': [{ data: { household: { ...household, role } } }],
      });
      mount();
      expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
      expect(screen.getByText(role === 'administrator' ? 'Administratör' : 'Medlem')).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Din Skyttel-användare' })).toBeDefined();
      const userId = screen.getByRole('textbox', { name: 'Ditt Skyttel-användar-ID' });
      expect((userId as HTMLInputElement).value).toBe('alex');
      const invitationHeading = screen.queryByRole('heading', { name: 'Har du en inbjudan?' });
      const invitationHint = screen.queryByText(/Dela detta ID med administratören/);
      if (role === 'administrator') {
        expect(invitationHeading).toBeNull();
        expect(invitationHint).toBeNull();
        expect(userId.getAttribute('aria-describedby')).toBeNull();
      } else {
        expect(invitationHeading).not.toBeNull();
        expect(invitationHint).not.toBeNull();
        expect(userId.getAttribute('aria-describedby')).toBe(invitationHint?.id);
      }
    },
  );

  test('returns to sign-in when a household request discovers an expired session', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }, { data: anonymous }],
      '/api/households/linden': [{ status: 401 }],
    });
    mount('/households/linden');
    expect(await screen.findByRole('heading', { name: 'Välkommen till Skyttel' })).toBeDefined();
  });

  test('explains membership revocation discovered while opening a household', async () => {
    serve({ '/api/bootstrap': [{ data: ready }], '/api/households/linden': [{ status: 403 }] });
    mount('/households/linden');
    expect(
      await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
  });

  test('retries a failed household request', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }],
      '/api/households/linden': [{ status: 503 }, { data: { household } }],
    });
    mount('/households/linden');
    await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }));
    expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
  });

  test('explains an unknown page and links back to the household', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }],
      '/api/households/linden': [{ data: { household } }],
    });
    mount('/unknown');
    expect(await screen.findByRole('heading', { name: 'Sidan finns inte' })).toBeDefined();
    await userEvent.click(screen.getByRole('link', { name: 'Till startsidan' }));
    expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
  });

  test('keeps sign-out recoverable after failure and returns to login on retry', async () => {
    serve({
      '/api/bootstrap': [{ data: { ...setup, status: 'forbidden' } }, { data: anonymous }],
      '/api/auth/sign-out': [{ status: 503 }, { data: { success: true } }],
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Logga ut' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Du kunde inte loggas ut');
    await userEvent.click(screen.getByRole('button', { name: 'Logga ut' }));
    expect(await screen.findByRole('heading', { name: 'Välkommen till Skyttel' })).toBeDefined();
  });
});
