import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState, ObjectValue, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let historyFailure = 0;
const read = async (): Promise<MapState> => (await client.request(path)).json();
const post = (route: string, body: unknown) => client.json(`${path}/${route}`, body);
async function object(id: string, value: Partial<ObjectValue> | null) {
  const state = await read();
  const before = state.objects.find((item) => item.id === id);
  expect(
    (
      await post('draft', {
        version: state.draft.version,
        id,
        baseRevision: before?.revision ?? null,
        value:
          value === null
            ? null
            : { typeId: state.types[0].id, name: id, description: '', ...before, ...value },
      })
    ).status,
  ).toBe(200);
}
async function save(operationId: string): Promise<SaveReceipt> {
  const response = await post('save', { version: (await read()).draft.version, operationId });
  expect(response.status).toBe(200);
  return (await response.json()).receipt;
}
async function open() {
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Visa historik' }));
  return screen.getByRole('region', { name: 'Ändringshistorik' });
}
async function group(id: string) {
  const history = screen.getByRole('region', { name: 'Ändringshistorik' });
  await within(history).findByText(`Sparande: ${id}`);
  const article = within(history)
    .getAllByRole('article')
    .find((item) => item.textContent?.includes(`Sparande: ${id}`));
  if (!article) throw new Error('Expected saved group');
  return within(article);
}

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;
  historyFailure = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.includes('/history?') && historyFailure) {
      if (historyFailure === 503) throw new Error('Synthetic network failure');
      return Response.json({ error: 'forbidden' }, { status: historyFailure });
    }
    return client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture.close();
});

test('saved history shows definitions, historical direction labels and ended content, then restores the whole removal', async () => {
  const state = await read();
  const defineObject = {
    name: 'Växt',
    description: 'Odling',
    fields: [{ id: 'color', name: 'Färg', description: '', kind: 'text' }],
  };
  expect(
    (
      await post('object-type', {
        version: 0,
        id: 'plant',
        baseRevision: null,
        value: defineObject,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post('relationship-type', {
        version: 1,
        id: 'supports',
        baseRevision: null,
        value: {
          name: 'Stödjer',
          description: 'Stöd',
          forwardLabel: 'stödjer',
          reverseLabel: 'stöds av',
        },
      })
    ).status,
  ).toBe(200);
  await object('flower', {
    typeId: 'plant',
    name: 'Rosen',
    customValues: { color: 'röd' },
    lifecycle: 'ended',
    financialFacts: { endDate: { knowledge: 'known', value: '2024-01-01' } },
  });
  await object('person', { name: 'Lo', identity: 'unspecified' });
  expect(
    (
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'support',
        baseRevision: null,
        value: { typeId: 'supports', sourceId: 'person', targetId: 'flower', knowledge: 'known' },
      })
    ).status,
  ).toBe(200);
  const created = await save('created');
  const before = await read();
  expect(
    (
      await post('relationship', {
        version: before.draft.version,
        id: 'support',
        baseRevision: 1,
        value: {
          ...before.relationships[0],
          typeId: state.relationshipTypes[0].id,
          lifecycle: 'ended',
          endDate: { knowledge: 'unknown' },
        },
      })
    ).status,
  ).toBe(200);
  await save('changed-direction');
  await object('flower', { typeId: state.types[0].id, customValues: {}, name: 'Rosen II' });
  await save('changed-object-type');
  const renamed = await read();
  expect(
    (
      await post('relationship-type', {
        version: renamed.draft.version,
        id: 'supports',
        baseRevision: 1,
        value: {
          name: 'Hjälper',
          description: '',
          forwardLabel: 'hjälper',
          reverseLabel: 'hjälps av',
        },
      })
    ).status,
  ).toBe(200);
  await save('renamed-type');
  // Return the later edits first so the whole original creation can be reversed.
  for (const id of ['renamed-type', 'changed-object-type', 'changed-direction']) {
    const { history } = await (await client.request(`${path}/history`)).json();
    const receipt = history.find((item: SaveReceipt) => item.operationId === id);
    expect(
      (
        await post('undo', {
          version: (await read()).draft.version,
          userId: receipt.userId,
          operationId: id,
        })
      ).status,
    ).toBe(200);
    await save(`undo-${id}`);
  }
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        userId: created.userId,
        operationId: created.operationId,
      })
    ).status,
  ).toBe(200);
  await save('removed');
  const history = await open();
  const changed = await group('changed-direction');
  expect(changed.getByText('Lo → stödjer → Rosen').textContent).toContain('stödjer');
  expect(
    changed.getByText(`Lo → ${state.relationshipTypes[0].name} → Rosen`).textContent,
  ).toContain(state.relationshipTypes[0].name);
  const retyped = await group('changed-object-type');
  expect(retyped.getByText(/Objekttyp: Växt/)).toBeDefined();
  expect(retyped.getByText(/Färg/).textContent).toContain('röd');
  const removed = await group('removed');
  expect(removed.getAllByText('Borttagen definition')).toHaveLength(2);
  expect(removed.getAllByText('Borttaget').length).toBeGreaterThan(0);
  await userEvent.click(removed.getByRole('button', { name: 'Ångra sparandet' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain('Rosen'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Sparat'));
  expect((await read()).objects.find((item) => item.id === 'flower')).toMatchObject({
    name: 'Rosen',
    lifecycle: 'ended',
    customValues: { color: 'röd' },
  });
  await userEvent.click(within(history).getByRole('button', { name: 'Dölj historik' }));
  expect(within(history).queryAllByRole('article')).toHaveLength(0);
});

test('empty history and a failed read can be retried without a fabricated result', async () => {
  historyFailure = 503;
  await open();
  expect((await screen.findByRole('alert')).textContent).toContain('Historiken kunde inte hämtas');
  historyFailure = 0;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta historik igen' }));
  expect(await screen.findByText('Inga genomförda sparanden.')).toBeDefined();
});

test('a history request after revoked access clears the household content', async () => {
  await object('private', { name: 'Privat objekt' });
  await save('saved');
  historyFailure = 403;
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Visa historik' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('inte längre tillgång'),
  );
  expect(screen.queryByRole('region', { name: 'Ändringshistorik' })).toBeNull();
  expect(screen.queryByText('Privat objekt')).toBeNull();
});
