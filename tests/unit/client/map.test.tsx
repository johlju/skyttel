import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState, ObjectValue, RelationshipValue } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failRead = false;
let loseResponse = '';
let deny = false;
let preventSave = false;
let wrongReceipt: Record<string, unknown> | null = null;
let beforeOperationsRead: (() => Promise<void>) | null = null;
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
  preventSave = false;
  wrongReceipt = null;
  beforeOperationsRead = null;
  // Connect the rendered browser UI to the real HTTP app and SQLite. Only
  // the external identity provider is substituted by applicationFixture.
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (deny) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (failRead && init?.method === 'GET') throw new Error('Synthetic disconnection');
    if (preventSave && url.endsWith('/save')) throw new Error('Synthetic unsent save');
    if (beforeOperationsRead && init?.method === 'GET' && url.endsWith('/operations')) {
      const callback = beforeOperationsRead;
      beforeOperationsRead = null;
      await callback();
    }
    const response = await client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
    if (loseResponse && url.endsWith(loseResponse)) throw new Error('Synthetic lost response');
    if (wrongReceipt && url.endsWith('/save') && response.ok) {
      const result = await response.json();
      return Response.json({ receipt: { ...result.receipt, ...wrongReceipt } });
    }
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

test('a reopened client finds a completed save without retaining the original attempt', async () => {
  await open();
  await add();
  loseResponse = '/save';
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  cleanup();
  loseResponse = '';
  await open();
  const operations = await screen.findByRole('region', { name: 'Mina sparförsök' });
  await waitFor(() => expect(operations.textContent).toContain('Genomfört'));
  expect(operations.textContent).toContain('Lo Exempel');
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
});

test('recovery reads the consumed draft after another client completes the discovered operation', async () => {
  await open();
  await add();
  cleanup();
  const attempt = { operationId: 'concurrent-recovery', version: 1, contentVersion: 1 };
  await client.json(`${path}/operations`, attempt);
  beforeOperationsRead = async () => {
    expect((await client.json(`${path}/save`, attempt)).status).toBe(200);
  };
  await open();
  expect(screen.getByRole('region', { name: 'Mina sparförsök' }).textContent).toContain(
    'Genomfört',
  );
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
  expect(
    (screen.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test('refreshing an unknown save keeps the draft locked until the registered attempt is retried', async () => {
  await open();
  await add();
  preventSave = true;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('väntande'));
  for (const name of ['Nytt objekt', 'Kasta hela utkastet', 'Spara hela utkastet'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Lo Exempel',
  );
  preventSave = false;
  await userEvent.click(screen.getByRole('button', { name: 'Återförsök sparandet' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel'),
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
});

test.each([
  { operationId: 'another-operation' },
  { draftVersion: 99 },
  { householdId: 'another-household' },
  { userId: 'another-user' },
  { contentVersion: 99 },
])('a receipt with mismatched identity %j cannot confirm the current save', async (identity) => {
  await open();
  await add();
  wrongReceipt = identity;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  expect(screen.getByRole('status').textContent).not.toContain('Sparat:');
  expect((screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  wrongReceipt = null;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel'),
  );
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(1);
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

test('relationship forms distinguish equal names, preserve meanings, correct and remove links', async () => {
  await open();
  await add('Lo');
  await add('Lo');
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
  const source = screen.getByLabelText('Från objekt') as HTMLSelectElement;
  const choices = [...source.options].filter((option) => option.value);
  expect(choices).toHaveLength(2);
  expect(choices[0].text).not.toBe(choices[1].text);
  expect(choices[0].text).toContain('En påhittad person');
  await userEvent.selectOptions(source, choices[0].value);
  const type = screen.getByLabelText('Sambandstyp') as HTMLSelectElement;
  await userEvent.selectOptions(type, type.options[1].value);
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'unresolved');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await screen.findByRole('button', { name: /Lo → .* → Obesvarad identitetsfråga/ });
  expect(
    (screen.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole('button', { name: /Lo → .* → Obesvarad identitetsfråga/ }),
  );
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'uncertain');
  await userEvent.selectOptions(screen.getByLabelText('Till objekt'), choices[1].value);
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await screen.findByRole('button', { name: /Lo → .* → Lo \(Osäkert uppgivet\)/ });
  await save();
  for (const [knowledge, label] of [
    ['unknown', 'Okänt'],
    ['none', 'Uttryckligen inget'],
  ]) {
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Samband' })).getByRole('button'),
    );
    await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), knowledge);
    await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
    await screen.findByRole('button', { name: new RegExp(`Lo → .* → ${label}`) });
    await save();
  }
  await userEvent.click(within(screen.getByRole('list', { name: 'Samband' })).getByRole('button'));
  await userEvent.click(screen.getByRole('button', { name: 'Föreslå borttagning av sambandet' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Borttagning av samband',
    ),
  );
  await save();
  expect(within(screen.getByRole('list', { name: 'Samband' })).queryByRole('button')).toBeNull();
});

test('a duplicate displays its existing relationship and stale relationship text cannot overwrite a draft', async () => {
  await open();
  await add('Alex');
  await add('Kim');
  async function proposeLink() {
    await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
    for (const label of ['Från objekt', 'Sambandstyp', 'Till objekt']) {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      await userEvent.selectOptions(select, select.options[label === 'Till objekt' ? 2 : 1].value);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
    await waitFor(() => expect(screen.queryByLabelText('Från objekt')).toBeNull());
  }
  await proposeLink();
  await proposeLink();
  expect(screen.getByRole('status').textContent).toContain('Sambandet finns redan');
  await userEvent.click(within(screen.getByRole('list', { name: 'Samband' })).getByRole('button'));
  const state = await (await client.request(path)).json();
  await client.json(`${path}/draft`, {
    version: state.draft.version,
    id: 'concurrent',
    baseRevision: null,
    value: { typeId: state.types[0].id, name: 'Robin', description: '' },
  });
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'unknown');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Inget sparades'));
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('äldre utkast'));
  expect(
    (screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }) as HTMLButtonElement)
      .disabled ||
      (screen.getByLabelText('Från objekt').closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Stäng sambandet utan att skicka' }));
  await userEvent.click(within(screen.getByRole('list', { name: 'Samband' })).getByRole('button'));
  expect((screen.getByLabelText('Uppgiftens säkerhet') as HTMLSelectElement).value).toBe('known');
});

test('object identity can be explicitly unspecified and later identified', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Betalkonto');
  await userEvent.selectOptions(screen.getByLabelText('Objektets identitet'), 'unresolved');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await screen.findByRole('button', { name: 'Betalkonto' });
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Obesvarad identitetsfråga',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Betalkonto' }));
  await userEvent.selectOptions(screen.getByLabelText('Objektets identitet'), 'unspecified');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.queryByLabelText('Objektets identitet')).toBeNull());
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Ospecificerat objekt',
  );
  await save();
  await userEvent.click(screen.getByRole('button', { name: 'Betalkonto' }));
  expect((screen.getByLabelText('Objektets identitet') as HTMLSelectElement).value).toBe(
    'unspecified',
  );
  await userEvent.selectOptions(screen.getByLabelText('Objektets identitet'), 'identified');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.queryByLabelText('Objektets identitet')).toBeNull());
  await save();
});

async function concurrentEditors() {
  fixture.setSubject('robin-concurrent');
  const other = fixture.client();
  await other.signIn();
  const { user } = await (await other.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`/api/households/${householdId}/invitations`, { userId: user.id })
  ).json();
  await other.json('/api/invitations/accept', { code });
  const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
  async function propose(
    actor: typeof client,
    kind: 'draft' | 'relationship',
    id: string,
    value: ObjectValue | RelationshipValue | null,
  ) {
    const state = await read(actor);
    const pending = (kind === 'draft' ? state.draft.changes : state.draft.relationships)?.find(
      (item) => item.id === id,
    );
    const saved = (kind === 'draft' ? state.objects : state.relationships).find(
      (item) => item.id === id,
    );
    expect(
      (
        await actor.json(`${path}/${kind}`, {
          version: state.draft.version,
          id,
          baseRevision: pending ? (pending.before?.revision ?? null) : (saved?.revision ?? null),
          value,
        })
      ).status,
    ).toBe(200);
  }
  async function commit(actor = client) {
    expect(
      (
        await actor.json(`${path}/save`, {
          version: (await read(actor)).draft.version,
          operationId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(200);
  }
  const state = await read();
  for (const [id, name] of [
    ['lo', 'Lo'],
    ['kim', 'Kim'],
  ])
    await propose(client, 'draft', id, { typeId: state.types[0].id, name, description: '' });
  await commit();
  return { other, read, propose, commit, state };
}

test('conflict choices retain independent object fields and cannot reuse stale approval', async () => {
  const { other, read, propose, commit, state } = await concurrentEditors();
  const value = { typeId: state.types[0].id, name: 'Lo Lind', description: '' };
  await propose(client, 'draft', 'lo', value);
  await propose(other, 'draft', 'lo', {
    ...value,
    name: 'Lo Berg',
    description: 'Spelar piano',
    identity: 'unspecified',
  });
  await commit(other);
  const oldVersion = (await read()).draft.version;
  await open();
  const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
  expect(review.textContent).toContain('Lo Berg');
  await userEvent.click(screen.getByRole('button', { name: 'Behåll mitt förslag' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
  );
  expect((await read()).draft.changes[0].after).toMatchObject({
    name: 'Lo Lind',
    description: 'Spelar piano',
    identity: 'unspecified',
  });
  expect(
    (await client.json(`${path}/save`, { version: oldVersion, operationId: 'stale' })).status,
  ).toBe(409);
  expect(
    (await client.json(`${path}/resolve`, { version: oldVersion, choice: 'saved', conflict: {} }))
      .status,
  ).toBe(409);
  const version = (await read()).draft.version;
  expect((await client.json(`${path}/resolve`, { version, choice: 'invalid' })).status).toBe(400);
  expect(
    (await client.json(`${path}/resolve`, { version, choice: 'saved', conflict: {} })).status,
  ).toBe(409);
  await save();
  expect((await read(other)).objects.find((object) => object.id === 'lo')?.description).toBe(
    'Spelar piano',
  );
});

test.each(['changed', 'duplicate', 'endpoint', 'deletion'] as const)(
  'relationship conflict recovery: %s',
  async (scenario) => {
    const { other, read, propose, commit, state } = await concurrentEditors();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'kim',
      knowledge: 'known',
    };
    if (scenario === 'changed') {
      await propose(client, 'relationship', 'link', value);
      await commit();
      await propose(client, 'relationship', 'link', { ...value, knowledge: 'uncertain' });
      await propose(other, 'relationship', 'link', {
        ...value,
        targetId: null,
        knowledge: 'unknown',
      });
    } else if (scenario === 'duplicate') {
      await propose(client, 'relationship', 'mine', value);
      await propose(other, 'relationship', 'link', value);
    } else if (scenario === 'endpoint') {
      await propose(client, 'relationship', 'mine', value);
      await propose(other, 'draft', 'kim', null);
    } else {
      await propose(client, 'draft', 'lo', null);
      await propose(other, 'relationship', 'link', value);
    }
    await commit(other);
    await open();
    const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
    expect(review.textContent).toContain('Konflikt');
    const keep = scenario === 'changed' || scenario === 'deletion';
    await userEvent.click(
      screen.getByRole('button', { name: keep ? 'Behåll mitt förslag' : 'Använd sparat värde' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
    );
    if (keep) {
      await save();
      expect((await read()).relationships).toHaveLength(scenario === 'changed' ? 1 : 0);
    } else {
      expect((await read()).draft.relationships ?? []).toEqual([]);
    }
  },
);

test('accepting a saved object removes only that proposal after another user deletes it', async () => {
  const { other, read, propose, commit, state } = await concurrentEditors();
  await propose(client, 'draft', 'lo', {
    typeId: state.types[0].id,
    name: 'Lo Lind',
    description: '',
  });
  await propose(other, 'draft', 'lo', null);
  await commit(other);
  const current = await read();
  const conflict = { kind: 'object', id: 'lo', current: null };
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: current.draft.version,
        conflict,
        choice: 'proposed',
      })
    ).status,
  ).toBe(409);
  await open();
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'borttaget',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Använd sparat värde' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
  );
  expect((await read()).draft.changes).toEqual([]);
});

test.each(['lo', 'new'])(
  'changed type definitions must be reviewed before keeping proposal %s',
  async (id) => {
    const { read, propose, state } = await concurrentEditors();
    await propose(client, 'draft', id, {
      typeId: state.types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    // Catalog editing is not exposed yet; arrange its concurrent revision in SQLite.
    fixture.database
      .prepare('UPDATE object_type SET description = ?, revision = revision + 1 WHERE id = ?')
      .run('Ny typbeskrivning', state.types[0].id);
    await open();
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Ny typbeskrivning',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Behåll mitt förslag' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
    );
    await save();
    expect((await read()).objects.find((object) => object.id === id)?.name).toBe('Lo Lind');
  },
);
