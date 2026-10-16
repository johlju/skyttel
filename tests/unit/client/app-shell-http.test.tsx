import { type APIRequestContext, request } from '@playwright/test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import {
  authenticatedHttpFetch,
  authenticatedHttpWebSocket,
} from '../../support/authenticated-http-fetch.js';
import { createHousehold, signIn } from '../../support/client.js';
import { prepareHouseholdReading } from '../../support/household-reading.js';
import { createInstallation, robin } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let other: APIRequestContext;
let delivery: Awaited<ReturnType<typeof authenticatedHttpWebSocket>> | undefined;
beforeEach(async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: Reset jsdom's cookie boundary between independent installations.
  document.cookie = 'skyttel_binding=; Max-Age=0; Path=/';
  installation = await createInstallation();
  client = await request.newContext();
  other = await request.newContext();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
});
afterEach(async () => {
  cleanup();
  delivery?.close();
  delivery = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await client?.dispose();
  await other?.dispose();
  await installation?.close();
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: 'http://localhost:3000' });
});

function mount(path = '/') {
  window.history.replaceState(null, '', path);
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}
async function post(actor: APIRequestContext, path: string, data: unknown) {
  const response = await actor.post(`${installation.origin}${path}`, {
    headers: { origin: installation.origin },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function prepareAccess(accept = true) {
  await signIn(client, installation.origin);
  const created = await createHousehold(client, installation.origin);
  expect(created.status()).toBe(201);
  const { household } = await created.json();
  installation.setIdentity(robin);
  await signIn(other, installation.origin, 'microsoft');
  const { user } = await (await other.get(`${installation.origin}/api/bootstrap`)).json();
  const issued = await post(client, `/api/households/${household.id}/invitations`, {
    userId: user.id,
  });
  if (accept) await post(other, '/api/invitations/accept', { code: issued.code });
  return { household, user, issued, path: `/households/${household.id}` };
}
async function foreground() {
  await act(async () => {
    fireEvent(window, new Event('focus'));
  });
}

async function installModel(model: ReturnType<typeof textModel>) {
  await installation.close();
  // Restore the server's Node boundary while constructing the provider SDK.
  const browserWindow = window;
  vi.stubGlobal('window', undefined);
  try {
    installation = await createInstallation(undefined, { modelFetch: model.provider });
  } finally {
    vi.stubGlobal('window', browserWindow);
  }
  vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  delivery = await authenticatedHttpWebSocket(client, installation.origin);
  vi.stubGlobal('WebSocket', delivery.WebSocket);
  return `/households/${household.id}`;
}

test('a lost setup reply is recovered through status without creating another household', async () => {
  await signIn(client, installation.origin);
  const transport = authenticatedHttpFetch(client, installation.origin);
  let dropped = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/households' && init?.method === 'POST' && !dropped) {
      dropped = true;
      throw new TypeError('Reply interrupted after the server created the household');
    }
    return response;
  });
  mount();
  await screen.findByRole('heading', { name: 'Skapa ditt hushåll' });
  await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Ange ett namn med 1–100 tecken.',
  );
  await userEvent.type(screen.getByLabelText('Hushållets namn'), '  Hushållet Eken  ');
  await userEvent.click(screen.getByRole('button', { name: 'Skapa hushåll' }));
  await screen.findByRole('button', { name: 'Kontrollera status' });
  expect(dropped).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera status' }));
  await screen.findByRole('heading', { name: 'Hushållet Eken' });
  const { household } = await (await client.get(`${installation.origin}/api/bootstrap`)).json();
  expect(household.name).toBe('Hushållet Eken');
  expect(window.location.pathname).toBe(`/households/${household.id}`);
  const duplicate = await createHousehold(client, installation.origin, 'Ett annat hushåll');
  expect(duplicate.status()).toBe(409);
}, 30_000);

test('invitation failures preserve the entered code and a lost acceptance reply recovers actual access', async () => {
  const fixture = await prepareAccess(false);
  const transport = authenticatedHttpFetch(other, installation.origin);
  let dropNext = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/invitations/accept' && dropNext) {
      dropNext = false;
      throw new TypeError('Acceptance reply interrupted');
    }
    return response;
  });
  mount();
  await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' });
  expect((screen.getByLabelText('Ditt Skyttel-användar-ID') as HTMLInputElement).value).toBe(
    fixture.user.id,
  );
  await userEvent.type(screen.getByLabelText('Inbjudningskod'), 'Felaktig kod');
  await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
  await screen.findByText(/Inbjudan kan inte användas\./);
  expect((screen.getByLabelText('Inbjudningskod') as HTMLInputElement).value).toBe('Felaktig kod');
  await userEvent.clear(screen.getByLabelText('Inbjudningskod'));
  await userEvent.type(screen.getByLabelText('Inbjudningskod'), ` ${fixture.issued.code} `);
  dropNext = true;
  await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
  await screen.findByText(
    'Inbjudan kunde inte bekräftas. Kontrollera anslutningen och försök igen.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera tillgång' }));
  await screen.findByRole('heading', { name: 'Hushållet Linden' });
  const { household } = await (await other.get(`${installation.origin}/api/bootstrap`)).json();
  expect(household).toEqual({ id: fixture.household.id, name: 'Hushållet Linden', role: 'member' });
}, 30_000);

test('administration reads actual invitation status, changes roles and confirms membership revocation', async () => {
  const fixture = await prepareAccess();
  mount(`${fixture.path}/administration`);
  await screen.findByRole('heading', { name: 'Administrera tillgång' });
  const robinRow = () => {
    const members = within(screen.getByRole('list', { name: 'Medlemmar' }));
    const memberElement = members.getByRole('heading', { name: 'Robin Exempel' }).closest('li');
    if (!memberElement) throw new Error('Missing member in the actual administration list');
    return within(memberElement);
  };
  await userEvent.click(robinRow().getByRole('button', { name: 'Gör till administratör' }));
  await screen.findByText('Rollen har ändrats.');
  await waitFor(() =>
    expect(robinRow().getByRole('button', { name: 'Gör till medlem' })).toBeTruthy(),
  );
  await userEvent.click(robinRow().getByRole('button', { name: 'Gör till medlem' }));
  await waitFor(() =>
    expect(robinRow().getByRole('button', { name: 'Gör till administratör' })).toBeTruthy(),
  );
  await userEvent.click(robinRow().getByRole('button', { name: 'Återkalla tillgång' }));
  await userEvent.click(
    within(screen.getByRole('group', { name: 'Återkalla tillgång för Robin Exempel' })).getByRole(
      'button',
      { name: 'Avbryt' },
    ),
  );
  expect(screen.queryByRole('group', { name: 'Återkalla tillgång för Robin Exempel' })).toBeNull();
  await userEvent.click(robinRow().getByRole('button', { name: 'Återkalla tillgång' }));
  await userEvent.click(screen.getByRole('button', { name: 'Bekräfta återkallelse' }));
  await screen.findByText('Tillgången har återkallats.');
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Robin Exempel' })).toBeNull());
  const revoked = await other.get(
    `${installation.origin}${fixture.path.replace('/households', '/api/households')}/map/view`,
  );
  expect(revoked.status()).toBe(403);
  await userEvent.click(screen.getByRole('button', { name: 'Inbjudningar' }));
  expect(
    within(screen.getByRole('list', { name: 'Inbjudningar' })).getByText('Accepterad'),
  ).toBeTruthy();
}, 30_000);

test('invitation administration validates the exact user and observes acceptance while sharing the code', async () => {
  const fixture = await prepareAccess(false);
  mount(`${fixture.path}/administration`);
  await screen.findByRole('heading', { name: 'Administrera tillgång' });
  await userEvent.click(screen.getByRole('button', { name: 'Jag har personens användar-ID' }));
  await userEvent.type(screen.getByLabelText('Skyttel-användar-ID att bjuda in'), 'unknown-user');
  await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
  await screen.findByText(
    'Skyttel-användaren finns inte. Be mottagaren logga in och dela sitt Skyttel-användar-ID.',
  );
  await userEvent.clear(screen.getByLabelText('Skyttel-användar-ID att bjuda in'));
  await userEvent.type(screen.getByLabelText('Skyttel-användar-ID att bjuda in'), fixture.user.id);
  await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
  const code = ((await screen.findByLabelText('Inbjudningskod att dela')) as HTMLInputElement)
    .value;
  expect(code.length).toBeGreaterThan(10);
  await userEvent.click(screen.getByRole('button', { name: 'Kopiera koden' }));
  await screen.findByText('Koden kunde inte kopieras. Markera och kopiera koden i fältet själv.');
  await post(other, '/api/invitations/accept', { code });
  await foreground();
  await screen.findByText(
    'Inbjudan väntar inte längre på svar. Kontrollera dess aktuella status under Inbjudningar.',
  );
  expect(screen.queryByLabelText('Inbjudningskod att dela')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Klar med inbjudan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Jag har personens användar-ID' }));
  await userEvent.type(screen.getByLabelText('Skyttel-användar-ID att bjuda in'), fixture.user.id);
  await userEvent.click(screen.getByRole('button', { name: 'Skapa inbjudan' }));
  await screen.findByText('Skyttel-användaren har redan tillgång till hushållet.');
}, 30_000);

test.each(['export', 'import', 'content-owners', 'erasure'])(
  'member direct route %s denies administrator capability without exposing household tools',
  async (page) => {
    const fixture = await prepareAccess();
    vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
    mount(`${fixture.path}/settings/${page}`);
    await screen.findByRole('heading', { name: 'Du kan inte administrera hushållet' });
    expect(screen.queryByRole('button', { name: 'Skapa fullständig export' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Tillbaka till kartan' }));
    await screen.findByRole('heading', { name: 'Hushållet Linden' });
    await userEvent.click(screen.getByRole('button', { name: 'Din profil' }));
    expect(
      within(screen.getByRole('region', { name: 'Din profil' })).getByText('Medlem'),
    ).toBeTruthy();
  },
  30_000,
);

test('an open workspace retires access after public membership revocation and accepts a replacement invitation', async () => {
  const fixture = await prepareAccess();
  vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
  mount(fixture.path);
  await screen.findByRole('region', { name: 'Arbetsyta' });
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  await post(
    client,
    `/api/households/${fixture.household.id}/members/${fixture.user.id}/revoke`,
    {},
  );
  await foreground();
  await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' });
  expect(screen.queryByRole('region', { name: 'Arbetsyta' })).toBeNull();
  const issued = await post(client, `/api/households/${fixture.household.id}/invitations`, {
    userId: fixture.user.id,
  });
  await userEvent.type(screen.getByLabelText('Inbjudningskod'), issued.code);
  await userEvent.click(screen.getByRole('button', { name: 'Acceptera inbjudan' }));
  await screen.findByRole('region', { name: 'Arbetsyta' });
  expect(window.location.pathname).toBe(fixture.path);
}, 30_000);

test('a failed bootstrap retries the actual session and a missing route returns to household work', async () => {
  const fixture = await prepareAccess();
  const transport = authenticatedHttpFetch(client, installation.origin);
  let failed = false;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/bootstrap' && !failed) {
      failed = true;
      return Promise.reject(new TypeError('Connection unavailable'));
    }
    return transport(input, init);
  });
  mount('/missing-page');
  await screen.findByRole('heading', { name: 'Skyttel kunde inte öppnas' });
  await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
  await screen.findByRole('heading', { name: 'Sidan finns inte' });
  await userEvent.click(screen.getByRole('link', { name: 'Till startsidan' }));
  await screen.findByRole('heading', { name: 'Hushållet Linden' });
  expect(window.location.pathname).toBe(fixture.path);
}, 30_000);

test('household loading retries and a later connection failure preserves unsent text and the loaded table', async () => {
  const fixture = await prepareAccess();
  const transport = authenticatedHttpFetch(client, installation.origin);
  let failed = false;
  let disconnected = false;
  let failedRefreshes = 0;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === `/api${fixture.path}` && (!failed || disconnected)) {
      failed = true;
      failedRefreshes++;
      return Promise.reject(new TypeError('Household connection unavailable'));
    }
    return transport(input, init);
  });
  mount(fixture.path);
  await screen.findByRole('heading', { name: 'Skyttel kunde inte öppnas' });
  await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
  await screen.findByRole('region', { name: 'Arbetsyta' });
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  await userEvent.click(screen.getByRole('button', { name: /^Skriv till Skyttel/ }));
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Min oskickade fråga');
  disconnected = true;
  await foreground();
  await waitFor(() => expect(failedRefreshes).toBeGreaterThan(1));
  expect(screen.getByRole('region', { name: 'Hushållets tabell' })).toBeTruthy();
  expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
    'Min oskickade fråga',
  );
  expect(screen.queryByRole('heading', { name: 'Skyttel kunde inte öppnas' })).toBeNull();
}, 30_000);

test('an expired real session removes the open workspace before offering a new sign-in', async () => {
  const fixture = await prepareAccess();
  mount(fixture.path);
  await screen.findByRole('region', { name: 'Arbetsyta' });
  await userEvent.click(screen.getByRole('button', { name: /^Skriv till Skyttel/ }));
  await userEvent.type(
    screen.getByLabelText('Meddelande till Skyttel'),
    'Text i den gamla sessionen',
  );
  await post(client, '/api/auth/sign-out', {});
  await foreground();
  await screen.findByRole('heading', { name: 'Välkommen till Skyttel' });
  expect(screen.queryByRole('region', { name: 'Arbetsyta' })).toBeNull();
  expect(screen.queryByLabelText('Meddelande till Skyttel')).toBeNull();
}, 30_000);

test('a lost role-change reply checks current membership and an invitation revocation has an explicit confirmation', async () => {
  const fixture = await prepareAccess();
  const transport = authenticatedHttpFetch(client, installation.origin);
  let interrupted = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input).endsWith(`/members/${fixture.user.id}/role`) && !interrupted) {
      interrupted = true;
      throw new TypeError('Role reply interrupted after delivery');
    }
    return response;
  });
  mount(`${fixture.path}/administration`);
  await screen.findByRole('heading', { name: 'Administrera tillgång' });
  await userEvent.click(screen.getByRole('button', { name: 'Gör till administratör' }));
  await screen.findByText(
    'Ändringen kunde inte bekräftas. Kontrollera den aktuella listan och försök igen.',
  );
  await foreground();
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Gör till medlem' })).toHaveLength(2),
  );
  await post(client, `/api${fixture.path}/members/${fixture.user.id}/revoke`, {});
  const issued = await post(client, `/api${fixture.path}/invitations`, { userId: fixture.user.id });
  await foreground();
  await userEvent.click(screen.getByRole('button', { name: 'Inbjudningar' }));
  await screen.findByText('Väntar på svar');
  await userEvent.click(screen.getByRole('button', { name: 'Återkalla inbjudan' }));
  await userEvent.click(
    within(screen.getByRole('group', { name: 'Återkalla inbjudan till Robin Exempel' })).getByRole(
      'button',
      { name: 'Avbryt' },
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Återkalla inbjudan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Bekräfta återkallelse' }));
  await screen.findByText('Inbjudan har återkallats.');
  const administration = await (
    await client.get(`${installation.origin}/api${fixture.path}/administration`)
  ).json();
  expect(
    administration.invitations.find((entry: { id: string }) => entry.id === issued.invitation.id)
      .status,
  ).toBe('revoked');
  const acceptance = await other.post(`${installation.origin}/api/invitations/accept`, {
    headers: { origin: installation.origin },
    data: { code: issued.code },
  });
  expect(acceptance.status()).toBe(409);
}, 30_000);

test('a current member cannot open administration or the operator cost overview', async () => {
  const fixture = await prepareAccess();
  vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
  mount(`${fixture.path}/administration`);
  await screen.findByRole('heading', { name: 'Du kan inte administrera hushållet' });
  expect(screen.queryByRole('button', { name: 'Jag har personens användar-ID' })).toBeNull();
  cleanup();
  mount('/costs');
  await screen.findByRole('heading', {
    name: 'Endast installationens driftansvarige har tillgång till kostnadsöversikten',
  });
  expect(screen.queryByRole('heading', { name: 'Månadskostnad' })).toBeNull();
}, 30_000);

test('a saved report direct link opens the saved operation and returns to the same household', async () => {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  const state = await fixture.read();
  const householdId = state.objects[0].householdId;
  const { history } = await (await client.get(`${fixture.path}/history`)).json();
  const receipt = history[0];
  mount(
    `/households/${householdId}?report=history&save=${receipt.operationId}&savedBy=${receipt.userId}`,
  );
  const reports = within(await screen.findByRole('region', { name: 'Rapporter' }));
  const article = within(await reports.findByRole('article'));
  await waitFor(() =>
    expect(
      article
        .getByText('Visa ändringarna', { selector: 'summary' })
        .parentElement?.hasAttribute('open'),
    ).toBe(true),
  );
  expect(article.getByText('Pris: 2000 SEK')).toBeTruthy();
  expect(article.queryByText('Pris: 2500 SEK')).toBeNull();
  await userEvent.click(reports.getByRole('button', { name: 'Tillbaka till arbetet' }));
  expect(screen.getByRole('region', { name: 'Rymdkarta' })).toBeTruthy();
  expect(window.location.search).toBe(
    `?report=history&save=${receipt.operationId}&savedBy=${receipt.userId}`,
  );
  expect(window.location.pathname).toBe(`/households/${householdId}`);
}, 30_000);

test('return from a cancelled external sign-in restores provider choice and ignores its late real reply', async () => {
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: installation.origin });
  const transport = authenticatedHttpFetch(client, installation.origin);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/auth/sign-in/social') {
      requested = true;
      await held;
    }
    return response;
  });
  mount('/assistant-consent?client_id=external-assistant');
  await screen.findByRole('heading', { name: 'Välkommen till Skyttel' });
  await userEvent.click(screen.getByRole('button', { name: 'Fortsätt med Microsoft' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fortsätt till Microsoft' }));
  await waitFor(() => expect(requested).toBe(true));
  await act(async () => {
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await screen.findByText('Inloggningen avbröts. Välj ett inloggningssätt när du vill fortsätta.');
  await act(async () => {
    release?.();
    await held;
  });
  expect(screen.getByRole('button', { name: 'Fortsätt med Microsoft' })).toBeTruthy();
  expect(window.location.pathname).toBe('/assistant-consent');
  const bootstrap = await (await client.get(`${installation.origin}/api/bootstrap`)).json();
  expect(bootstrap.status).toBe('anonymous');
}, 30_000);

test('lost conversation message replies recover the real conversation before accepting another instruction', async () => {
  const model = textModel(() => [modelMessage('Jag hör din fråga.')]);
  const householdPath = await installModel(model);
  const transport = authenticatedHttpFetch(client, installation.origin);
  let lost = false;
  let recovered = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input).includes('/text-assistant/') && String(input).endsWith('/recover'))
      recovered++;
    if (String(input).endsWith('/messages') && !lost) {
      lost = true;
      throw new TypeError('Message accepted, reply interrupted');
    }
    return response;
  });
  mount(householdPath);
  await screen.findByRole('region', { name: 'Arbetsyta' });
  await userEvent.click(screen.getByRole('button', { name: /^Skriv till Skyttel/ }));
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Vad hör till hushållet?');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  let consent = within(await screen.findByRole('dialog', { name: 'Samtal med Skyttel' }));
  await userEvent.click(consent.getByRole('button', { name: 'Avbryt' }));
  expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
    'Vad hör till hushållet?',
  );
  expect(
    screen.getByRole('region', { name: 'Arbetsyta' }).getAttribute('data-session-active'),
  ).toBe('false');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  consent = within(await screen.findByRole('dialog', { name: 'Samtal med Skyttel' }));
  await userEvent.click(consent.getByRole('button', { name: 'Godkänn och starta' }));
  await waitFor(() => expect(lost).toBe(true));
  await waitFor(() => expect(recovered).toBeGreaterThan(0));
  await screen.findByText('Jag hör din fråga.');
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  await userEvent.clear(screen.getByLabelText('Meddelande till Skyttel'));
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'nytt samtal');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() => expect(screen.queryByText('Vad hör till hushållet?')).toBeNull());
  const state = await (await client.get(`${installation.origin}/api${householdPath}/map`)).json();
  expect(state.objects).toEqual([]);
  expect(state.draft.changes).toEqual([]);
}, 30_000);

test.each(['assistants', 'assistant-consent'])(
  'revoked membership retains profile identity and gates the personal %s route',
  async (page) => {
    const fixture = await prepareAccess();
    await post(client, `/api${fixture.path}/members/${fixture.user.id}/revoke`, {});
    vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
    mount('/profile');
    await screen.findByRole('heading', { name: 'Din profil' });
    expect((screen.getByLabelText('Ditt Skyttel-användar-ID') as HTMLInputElement).value).toBe(
      fixture.user.id,
    );
    expect(screen.getByLabelText('Inbjudningskod')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Arbetsyta' })).toBeNull();
    if (page === 'assistants')
      await userEvent.click(screen.getByRole('link', { name: 'Assistentanslutningar' }));
    else {
      cleanup();
      mount('/assistant-consent');
    }
    await screen.findByRole('heading', { name: 'Du har inte tillgång till hushållet' });
    expect((screen.getByLabelText('Ditt Skyttel-användar-ID') as HTMLInputElement).value).toBe(
      fixture.user.id,
    );
    expect(screen.queryByRole('button', { name: 'Godkänn och fortsätt' })).toBeNull();
  },
  30_000,
);

test.each([
  ['export', 'Fullständig export'],
  ['import', 'Återimportera hushållet'],
  ['content-owners', 'Koppla historiskt innehåll'],
  ['erasure', 'Permanent radering'],
])(
  'administrator route %s opens its separate public review page and returns to current household work',
  async (page, heading) => {
    const fixture = await prepareAccess();
    mount(`${fixture.path}/settings/${page}`);
    await screen.findByRole('heading', { name: heading });
    expect(
      screen.queryByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeNull();
    if (page === 'content-owners') {
      await userEvent.click(
        screen.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' }),
      );
      await screen.findByText(
        'Aktuella innehållskopplingar är hämtade. Granska den visade kopplingen efter ett osäkert resultat.',
      );
    }
    await userEvent.click(screen.getByRole('link', { name: 'Tillbaka till kartan' }));
    await screen.findByRole('heading', { name: 'Hushållet Linden' });
    expect(window.location.pathname).toBe(fixture.path);
  },
  30_000,
);

test('direct profile entry returns to household work and help closes through its visible keyboard control', async () => {
  const fixture = await prepareAccess();
  mount('/profile');
  await screen.findByRole('region', { name: 'Rymdkarta' });
  if (!screen.queryByRole('region', { name: 'Din profil' }))
    await userEvent.click(screen.getByRole('button', { name: 'Din profil' }));
  const profile = within(screen.getByRole('region', { name: 'Din profil' }));
  expect(profile.getByText('Alex Exempel')).toBeTruthy();
  expect(profile.getByText('Administratör')).toBeTruthy();
  await userEvent.click(profile.getByRole('button', { name: 'Tillbaka till arbetet' }));
  expect(screen.queryByRole('region', { name: 'Din profil' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Information och hjälp' }));
  await screen.findByRole('region', { name: 'Information och hjälp' });
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'Information och hjälp' })).toBeNull();
  expect(window.location.pathname).toBe(fixture.path);
}, 30_000);

test('cancelling real in-flight model work retires its reply while keeping household work intact', async () => {
  // The narrow text view exposes its ordinary stop control. This is a media
  // query boundary only; layout and physical interaction belong to Chromium.
  const matchMedia = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    Object.assign(matchMedia(query), { matches: query === '(max-width: 700px)' }),
  );
  let started = false;
  const model = textModel(
    (_request, signal) =>
      new Promise<unknown[]>((_resolve, reject) => {
        started = true;
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  );
  const path = await installModel(model);
  mount(path);
  await screen.findByRole('region', { name: 'Arbetsyta' });
  await userEvent.click(screen.getByRole('button', { name: /^Skriv till Skyttel/ }));
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Vilka uppgifter saknas?');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Samtal med Skyttel' })).getByRole('button', {
      name: 'Godkänn och starta',
    }),
  );
  await waitFor(() => expect(started).toBe(true));
  const stop = await screen.findByRole('button', { name: 'Avbryt' });
  await userEvent.click(stop);
  await screen.findByText('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.');
  const state = await (await client.get(`${installation.origin}/api${path}/map`)).json();
  expect(state.objects).toEqual([]);
  expect(state.draft.changes).toEqual([]);
  expect(
    screen.getByRole('region', { name: 'Arbetsyta' }).getAttribute('data-session-active'),
  ).toBe('true');
}, 30_000);

test('consent revoked through public HTTP retires the conversation while retaining unsent text and household access', async () => {
  const model = textModel(() => [modelMessage('Ett svar innan återkallandet.')]);
  const path = await installModel(model);
  const transport = authenticatedHttpFetch(client, installation.origin);
  const sent: string[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/messages')) sent.push(String(input));
    return transport(input, init);
  });
  mount(path);
  await screen.findByRole('region', { name: 'Arbetsyta' });
  await userEvent.click(screen.getByRole('button', { name: /^Skriv till Skyttel/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Samtal med Skyttel' })).getByRole('button', {
      name: 'Godkänn och starta',
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Arbetsyta' }).getAttribute('data-session-active'),
    ).toBe('true'),
  );
  await post(client, `/api${path}/conversation-consent/revoke`, {});
  await userEvent.type(
    screen.getByLabelText('Meddelande till Skyttel'),
    'Text efter återkallat medgivande',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Arbetsyta' }).getAttribute('data-session-active'),
    ).toBe('false'),
  );
  await userEvent.click(screen.getByRole('button', { name: /^Skriv till Skyttel/ }));
  expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
    'Text efter återkallat medgivande',
  );
  expect(sent).toEqual([]);
  expect(model.requests).toHaveLength(0);
  const { household } = await (await client.get(`${installation.origin}/api/bootstrap`)).json();
  expect(household.role).toBe('administrator');
  expect(screen.getByRole('heading', { name: 'Hushållet Linden' })).toBeTruthy();
}, 30_000);
