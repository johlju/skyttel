import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failRead = false;
let loseResponse = '';
let deny = false;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;
  failRead = false;
  loseResponse = '';
  deny = false;
  // Connect the rendered browser UI to the real HTTP app and SQLite. Only
  // the external identity provider is substituted by applicationFixture.
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (deny) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (failRead && init?.method === 'GET') throw new Error('Synthetic disconnection');
    const response = await client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
    if (loseResponse && url.endsWith(loseResponse)) throw new Error('Synthetic lost response');
    return response;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture.close();
});

async function open() {
  render(<HouseholdMap householdId={householdId} />);
  await screen.findByRole('button', { name: 'Nytt objekt' });
}
async function add(name = 'Lo Exempel') {
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), name);
  await userEvent.type(screen.getByLabelText('Beskrivning'), 'En påhittad person');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
}
async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Sparat:'));
}

test('review, search, correction, discard and deletion use the real persistent map', async () => {
  await open();
  await add();
  await userEvent.click(screen.getByRole('button', { name: 'Lo Exempel' }));
  await userEvent.clear(screen.getByLabelText('Objektets namn'));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Lo Lind');
  expect(
    (screen.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await save();
  await userEvent.type(screen.getByLabelText('Sök objekt'), 'No match');
  expect(within(screen.getByRole('list', { name: 'Objekt' })).queryByRole('button')).toBeNull();
  await userEvent.clear(screen.getByLabelText('Sök objekt'));
  await userEvent.click(screen.getByRole('button', { name: 'Lo Lind' }));
  await userEvent.clear(screen.getByLabelText('Objektets namn'));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Lo Berg');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
  await waitFor(() => {
    expect(review.textContent).toContain('Lo Lind');
    expect(review.textContent).toContain('Lo Berg');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Kasta hela utkastet' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Utkastet är kastat'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lo Lind' }));
  await userEvent.click(screen.getByRole('button', { name: 'Föreslå borttagning' }));
  await waitFor(() => expect(review.textContent).toContain('Borttagning'));
  await save();
  expect(within(screen.getByRole('list', { name: 'Objekt' })).queryByRole('button')).toBeNull();
});

test('lost responses remain uncertain and the same receipt can be recovered', async () => {
  failRead = true;
  render(<HouseholdMap householdId={householdId} />);
  expect((await screen.findByRole('alert')).textContent).toContain('kunde inte hämtas');
  failRead = false;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await screen.findByRole('button', { name: 'Nytt objekt' });
  await add();
  loseResponse = '/save';
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  loseResponse = '';
  await userEvent.click(screen.getByRole('button', { name: 'Hämta samma kvitto igen' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel'),
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
});

test('a stale draft is blocked until refreshed, and a lost proposal is recovered without replacing form text', async () => {
  await open();
  await add();
  await client.json(`${path}/discard`, { version: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Inget sparades');
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Robin Exempel');
  loseResponse = '/draft';
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Ändringen kunde inte bekräftas',
  );
  loseResponse = '';
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('äldre utkast'));
  expect(
    (screen.getByRole('button', { name: 'Lägg i mitt utkast' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByLabelText('Objektets namn') as HTMLInputElement).value).toBe('Robin Exempel');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng utan att skicka texten' }));
  expect(screen.queryByLabelText('Objektets namn')).toBeNull();
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Robin Exempel',
  );
});

test('revoked access removes map contents on a refused operation', async () => {
  await open();
  await add();
  deny = true;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('inte längre tillgång');
  expect(screen.queryByRole('list', { name: 'Objekt' })).toBeNull();
});

test('a confirmed receipt remains successful when refreshing the map fails', async () => {
  await open();
  await add();
  failRead = true;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('sparade enligt kvittot');
  expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel');
  expect(screen.queryByRole('button', { name: 'Hämta samma kvitto igen' })).toBeNull();
  failRead = false;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
});
