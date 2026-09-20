import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import type { Administration, HouseholdInvitation } from '../../../src/shared/administration.js';

const household = { id: 'linden', name: 'Hushållet Linden', role: 'administrator' };
const ready = {
  status: 'ready',
  providers: ['google', 'microsoft'],
  user: { id: 'alex', name: 'Alex Exempel' },
  household,
};
const forbidden = { ...ready, status: 'forbidden' };
const anonymous = { status: 'anonymous', providers: ['google', 'microsoft'] };
const administration: Administration = {
  members: [
    { userId: 'alex', name: 'Alex Exempel', role: 'administrator' },
    { userId: 'lo', name: 'Lo Exempel', role: 'member' },
  ],
  invitations: [],
};
const administrationWithTwoAdministrators: Administration = {
  ...administration,
  members: administration.members.map((member) => ({ ...member, role: 'administrator' })),
};
const invitation: HouseholdInvitation = {
  id: 'invitation-sam',
  userId: 'sam',
  name: 'Sam Exempel',
  status: 'pending',
  createdAt: '2026-09-20T12:00:00.000Z',
  expiresAt: '2026-09-27T12:00:00.000Z',
};
const administrationPath = '/api/households/linden/administration';
type Reply = { data?: unknown; status?: number; error?: Error; response?: Promise<Response> };
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
    if (reply.response) return reply.response;
    return Response.json(reply.data ?? {}, { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function mount(path = '/households/linden/administration') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function member(name: string) {
  const heading = screen.getByRole('heading', { name });
  const item = heading.closest('li');
  if (!item) throw new Error(`Member ${name} is not listed`);
  return within(item);
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => {
    throw new Error('Synthetic request is not ready');
  };
  const response = new Promise<Response>((finish) => {
    resolve = finish;
  });
  return { response, resolve };
}

beforeEach(() => {
  unexpectedRequests.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(unexpectedRequests).toEqual([]);
});

describe('household administration interface', () => {
  test('retries an unavailable membership list and shows the current members', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [{ status: 503 }, { data: administration }],
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }));
    expect(await screen.findByRole('heading', { name: 'Administrera tillgång' })).toBeDefined();
    expect(member('Alex Exempel (du)').getByText('Administratör')).toBeDefined();
    expect(member('Lo Exempel').getByText('Medlem')).toBeDefined();
    expect(screen.getByText('Inga inbjudningar ännu.')).toBeDefined();
  });

  test('returns to sign-in when the administration session expires', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }, { data: anonymous }],
      [administrationPath]: [{ status: 401 }],
    });
    mount();
    expect(await screen.findByRole('heading', { name: 'Välkommen till Skyttel' })).toBeDefined();
  });

  test('denies administration to a current member and links back to their household', async () => {
    serve({
      '/api/bootstrap': [{ data: { ...ready, household: { ...household, role: 'member' } } }],
      [administrationPath]: [{ status: 403 }],
      '/api/households/linden': [{ data: { household: { ...household, role: 'member' } } }],
    });
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Skapa inbjudan' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Till startsidan' }));
    expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Administrera tillgång' })).toBeNull();
  });

  test('creates an invitation for the entered identity and hides its code after acceptance', async () => {
    const fetch = serve({
      '/api/bootstrap': [{ data: ready }, { data: ready }],
      [administrationPath]: [
        { data: administration },
        { data: { ...administration, invitations: [invitation] } },
        { data: { ...administration, invitations: [{ ...invitation, status: 'accepted' }] } },
      ],
      '/api/households/linden/invitations': [
        { data: { invitation, code: 'synthetic-invitation-code' }, status: 201 },
      ],
    });
    mount();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Skyttel-användar-ID att bjuda in' }),
      '  sam  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
    const code = await screen.findByRole('textbox', { name: 'Inbjudningskod att dela' });
    expect((code as HTMLInputElement).value).toBe('synthetic-invitation-code');
    expect(screen.getByText('Väntar på svar')).toBeDefined();
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Skyttel-användar-ID att bjuda in',
        }) as HTMLInputElement
      ).value,
    ).toBe('');
    const [, request] =
      fetch.mock.calls.find(([path]) => path === '/api/households/linden/invitations') ?? [];
    expect(JSON.parse((request as RequestInit).body as string)).toEqual({ userId: 'sam' });
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText('Accepterad')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Inbjudningskod att dela' })).toBeNull();
  });

  test.each([
    ['user_not_found', 404, 'Skyttel-användaren finns inte.'],
    ['already_member', 409, 'Skyttel-användaren har redan tillgång till hushållet.'],
    ['invalid_user', 400, 'Inbjudan kunde inte skapas.'],
  ])(
    'explains invitation failure %s and preserves the recipient',
    async (error, status, message) => {
      serve({
        '/api/bootstrap': [{ data: ready }],
        [administrationPath]: [{ data: administration }],
        '/api/households/linden/invitations': [{ status: Number(status), data: { error } }],
      });
      mount();
      const recipient = await screen.findByRole('textbox', {
        name: 'Skyttel-användar-ID att bjuda in',
      });
      await userEvent.type(recipient, 'sam');
      await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
      expect((await screen.findByRole('alert')).textContent).toContain(message);
      expect((recipient as HTMLInputElement).value).toBe('sam');
      expect(
        (screen.getByRole('button', { name: 'Skapa inbjudan' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    },
  );

  test('can replace an invitation after losing its creation response', async () => {
    const request = deferredResponse();
    serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [
        { data: administration },
        { data: { ...administration, invitations: [invitation] } },
      ],
      '/api/households/linden/invitations': [
        { error: new Error('Synthetic response lost') },
        { response: request.response },
      ],
    });
    mount();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Skyttel-användar-ID att bjuda in' }),
      'sam',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Inbjudan kunde inte skapas.');
    await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
    expect(screen.getByRole('status').textContent).toBe('Sparar ändringen…');
    expect(
      (screen.getByRole('button', { name: 'Skapar inbjudan…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => request.resolve(Response.json({ invitation, code: 'replacement-code' })));
    expect(
      (
        (await screen.findByRole('textbox', {
          name: 'Inbjudningskod att dela',
        })) as HTMLInputElement
      ).value,
    ).toBe('replacement-code');
  });

  test.each([401, 403])('refreshes access when invitation creation returns %s', async (status) => {
    serve({
      '/api/bootstrap': [{ data: ready }, { data: forbidden }],
      [administrationPath]: [{ data: administration }],
      '/api/households/linden/invitations': [{ status }],
    });
    mount();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Skyttel-användar-ID att bjuda in' }),
      'sam',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
    expect(
      await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
  });

  test('promotes a member and presents the resulting administrator role', async () => {
    const fetch = serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [
        { data: administration },
        {
          data: {
            ...administration,
            members: [
              administration.members[0],
              { ...administration.members[1], role: 'administrator' },
            ],
          },
        },
      ],
      '/api/households/linden/members/lo/role': [{ data: {} }],
    });
    mount();
    await screen.findByRole('heading', { name: 'Lo Exempel' });
    await userEvent.click(
      member('Lo Exempel').getByRole('button', { name: 'Gör till administratör' }),
    );
    expect(await screen.findByText('Rollen har ändrats.')).toBeDefined();
    expect(member('Lo Exempel').getByText('Administratör')).toBeDefined();
    const [, request] =
      fetch.mock.calls.find(([path]) => path === '/api/households/linden/members/lo/role') ?? [];
    expect(JSON.parse((request as RequestInit).body as string)).toEqual({ role: 'administrator' });
  });

  test.each([
    {
      status: 409,
      data: { error: 'last_administrator' },
      message: 'Hushållet måste ha minst en administratör.',
    },
    { status: 503, message: 'Ändringen kunde inte bekräftas.' },
    { error: new Error('Synthetic response lost'), message: 'Ändringen kunde inte bekräftas.' },
  ])('explains a failed access change and permits another attempt', async (failure) => {
    serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [{ data: administrationWithTwoAdministrators }],
      '/api/households/linden/members/lo/role': [failure],
    });
    mount();
    await screen.findByRole('heading', { name: 'Lo Exempel' });
    await userEvent.click(member('Lo Exempel').getByRole('button', { name: 'Gör till medlem' }));
    expect((await screen.findByRole('alert')).textContent).toContain(failure.message);
    expect(
      (
        member('Lo Exempel').getByRole('button', {
          name: 'Gör till medlem',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  test('refreshes access when a role change is denied', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }, { data: forbidden }],
      [administrationPath]: [{ data: administration }],
      '/api/households/linden/members/lo/role': [{ status: 403 }],
    });
    mount();
    await screen.findByRole('heading', { name: 'Lo Exempel' });
    await userEvent.click(
      member('Lo Exempel').getByRole('button', { name: 'Gör till administratör' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
  });

  test('changes another administrator to a member and retains its own access', async () => {
    const fetch = serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [
        { data: administrationWithTwoAdministrators },
        { data: administration },
      ],
      '/api/households/linden/members/lo/role': [{ data: {} }],
    });
    mount();
    await screen.findByRole('heading', { name: 'Lo Exempel' });
    await userEvent.click(member('Lo Exempel').getByRole('button', { name: 'Gör till medlem' }));
    expect(await screen.findByText('Rollen har ändrats.')).toBeDefined();
    expect(member('Lo Exempel').getByText('Medlem')).toBeDefined();
    expect(member('Alex Exempel (du)').getByText('Administratör')).toBeDefined();
    const [, request] =
      fetch.mock.calls.find(([path]) => path === '/api/households/linden/members/lo/role') ?? [];
    expect(JSON.parse((request as RequestInit).body as string)).toEqual({ role: 'member' });
  });

  test('allows keyboard cancellation before confirming that a member loses access', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [
        { data: administration },
        { data: { ...administration, members: [administration.members[0]] } },
      ],
      '/api/households/linden/members/lo/revoke': [{ data: {} }],
    });
    mount();
    await screen.findByRole('heading', { name: 'Lo Exempel' });
    await userEvent.click(member('Lo Exempel').getByRole('button', { name: 'Återkalla tillgång' }));
    expect(
      screen.getByRole('group', { name: 'Återkalla tillgång för Lo Exempel' }).textContent,
    ).toContain('Personer och innehåll i kartan finns kvar.');
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avbryt' }));
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('group', { name: 'Återkalla tillgång för Lo Exempel' })).toBeNull();
    expect(member('Lo Exempel').getByText('Medlem')).toBeDefined();
    await userEvent.click(member('Lo Exempel').getByRole('button', { name: 'Återkalla tillgång' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Bekräfta återkallelse' }),
    );
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Tillgången har återkallats.')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Lo Exempel' })).toBeNull();
  });

  test.each([administration, administrationWithTwoAdministrators])(
    'keeps own membership actions visible but disabled regardless of other administrators',
    async (data) => {
      serve({
        '/api/bootstrap': [{ data: ready }],
        [administrationPath]: [{ data }],
      });
      mount();
      await screen.findByRole('heading', { name: 'Alex Exempel (du)' });
      const ownRow = member('Alex Exempel (du)');
      for (const name of ['Gör till medlem', 'Återkalla tillgång']) {
        const button = ownRow.getByRole('button', { name }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        await userEvent.click(button);
      }
      expect(
        ownRow.getByText('Din roll och tillgång ändras av en annan administratör.'),
      ).toBeDefined();
      expect(
        screen.queryByRole('group', { name: 'Återkalla tillgång för Alex Exempel' }),
      ).toBeNull();
      for (const button of member('Lo Exempel').getAllByRole('button')) {
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    },
  );

  test('allows canceling and then revoking a pending invitation', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }],
      [administrationPath]: [
        { data: { ...administration, invitations: [invitation] } },
        { data: { ...administration, invitations: [{ ...invitation, status: 'revoked' }] } },
      ],
      '/api/households/linden/invitations/invitation-sam/revoke': [{ data: {} }],
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Återkalla inbjudan' }));
    expect(
      screen.getByRole('group', { name: 'Återkalla inbjudan till Sam Exempel' }).textContent,
    ).toContain('Koden slutar fungera.');
    await userEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    expect(screen.queryByRole('group', { name: 'Återkalla inbjudan till Sam Exempel' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Återkalla inbjudan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bekräfta återkallelse' }));
    expect(await screen.findByText('Inbjudan har återkallats.')).toBeDefined();
    expect(screen.getByText('Återkallad')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Återkalla inbjudan' })).toBeNull();
  });
});

describe('invitation acceptance interface', () => {
  test('accepts an invitation using the current identity and opens its household', async () => {
    const request = deferredResponse();
    const fetch = serve({
      '/api/bootstrap': [{ data: forbidden }, { data: ready }],
      '/api/invitations/accept': [{ response: request.response }],
      '/api/households/linden': [{ data: { household } }],
    });
    mount('/');
    expect(
      (
        (await screen.findByRole('textbox', {
          name: 'Ditt Skyttel-användar-ID',
        })) as HTMLInputElement
      ).value,
    ).toBe('alex');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Inbjudningskod' }),
      '  synthetic-code  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
    expect(screen.getByRole('status').textContent).toBe('Kontrollerar din inbjudan…');
    expect(
      (screen.getByRole('button', { name: 'Accepterar inbjudan…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => request.resolve(Response.json({ household })));
    expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
    const [, init] = fetch.mock.calls.find(([path]) => path === '/api/invitations/accept') ?? [];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'synthetic-code' });
  });

  test.each([400, 409])('explains an unusable invitation returned as %s', async (status) => {
    serve({
      '/api/bootstrap': [{ data: forbidden }],
      '/api/invitations/accept': [{ status }],
    });
    mount('/');
    const code = await screen.findByRole('textbox', { name: 'Inbjudningskod' });
    await userEvent.type(code, 'expired-code');
    await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Inbjudan kan inte användas.');
    expect((code as HTMLInputElement).value).toBe('expired-code');
    expect(screen.getByRole('button', { name: 'Kontrollera tillgång' })).toBeDefined();
  });

  test.each([{ status: 503 }, { error: new Error('Synthetic response lost') }])(
    'checks current access after an uncertain acceptance result',
    async (failure) => {
      serve({
        '/api/bootstrap': [{ data: forbidden }, { data: ready }],
        '/api/invitations/accept': [failure],
        '/api/households/linden': [{ data: { household } }],
      });
      mount('/');
      await userEvent.type(
        await screen.findByRole('textbox', { name: 'Inbjudningskod' }),
        'used-code',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Inbjudan kunde inte bekräftas.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Kontrollera tillgång' }));
      expect(await screen.findByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
    },
  );

  test('requests sign-in again after the accepting session expires', async () => {
    serve({
      '/api/bootstrap': [{ data: forbidden }, { data: anonymous }],
      '/api/invitations/accept': [{ status: 401 }],
    });
    mount('/');
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Inbjudningskod' }),
      'valid-code',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
    expect(await screen.findByRole('heading', { name: 'Välkommen till Skyttel' })).toBeDefined();
  });
});

describe('current household access', () => {
  test('keeps loaded membership visible after a temporary background failure', async () => {
    serve({
      '/api/bootstrap': [{ data: ready }, { status: 503 }],
      [administrationPath]: [{ data: administration }, { status: 503 }],
    });
    mount();
    expect(await screen.findByRole('heading', { name: 'Administrera tillgång' })).toBeDefined();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(member('Lo Exempel').getByText('Medlem')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Skyttel kunde inte öppnas' })).toBeNull();
  });

  test('updates a changed role and revoked access while the household stays open', async () => {
    vi.useFakeTimers();
    serve({
      '/api/bootstrap': [
        { data: ready },
        { data: { ...ready, household: { ...household, role: 'member' } } },
        { data: forbidden },
      ],
      '/api/households/linden': [
        { data: { household } },
        { data: { household: { ...household, role: 'member' } } },
        { status: 403 },
      ],
    });
    await act(async () => mount('/'));
    expect(screen.getByRole('link', { name: 'Administrera tillgång' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Din Skyttel-användare' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Inbjudningskod' })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText('Medlem')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Administrera tillgång' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Inbjudningskod' })).toBeDefined();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(
      screen.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Inbjudningskod' })).toBeDefined();
  });

  test('refreshes current access when a hidden page becomes visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    serve({
      '/api/bootstrap': [{ data: ready }, { data: forbidden }],
      '/api/households/linden': [{ data: { household } }, { status: 403 }],
    });
    mount('/');
    expect(await screen.findByRole('link', { name: 'Administrera tillgång' })).toBeDefined();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByRole('heading', { name: 'Hushållet Linden' })).toBeDefined();
    visibility.mockReturnValue('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(
      await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeDefined();
  });

  test('keeps opening the membership list while a focus event arrives during its request', async () => {
    const request = deferredResponse();
    serve({
      '/api/bootstrap': [{ data: ready }, { data: ready }],
      [administrationPath]: [{ response: request.response }],
    });
    await act(async () => mount());
    expect(screen.getByRole('status').textContent).toBe('Öppnar Skyttel…');
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => request.resolve(Response.json(administration)));
    expect(await screen.findByRole('heading', { name: 'Administrera tillgång' })).toBeDefined();
  });
});
