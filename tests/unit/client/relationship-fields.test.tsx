import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
const read = async (): Promise<MapState> => (await client.request(path)).json();
const post = (route: string, value: unknown) => client.json(`${path}/${route}`, value);
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;
  const state = await read();
  for (const [version, id] of ['bike', 'garage'].entries())
    await post('draft', {
      version,
      id,
      baseRevision: null,
      value: { typeId: state.types[version].id, name: id, description: '' },
    });
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture.close();
});
async function open() {
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  await screen.findByRole('button', { name: 'Nytt samband' });
}

test('relationship field definitions and answers use the same visible map draft and retain focus after removal', async () => {
  const user = userEvent.setup();
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Ny sambandstyp' }));
  const editor = within(screen.getByRole('group', { name: 'Sambandstypens definition' }));
  for (const [label, text] of [
    ['Sambandstypens namn', 'Förvaring'],
    ['Sambandstypens beskrivning', 'Var saker finns'],
    ['Benämning från startobjektet', 'förvaras i'],
    ['Benämning från målobjektet', 'innehåller'],
  ]) {
    await user.click(editor.getByLabelText(label));
    await user.paste(text);
  }
  await userEvent.click(editor.getByRole('button', { name: 'Lägg till fält' }));
  expect(document.activeElement).toBe(editor.getByLabelText('Fältets namn'));
  await userEvent.click(editor.getByRole('button', { name: 'Ta bort fält: Eget fält 1' }));
  expect(document.activeElement).toBe(editor.getByRole('button', { name: 'Lägg till fält' }));
  for (const [name, kind] of [
    ['Anteckning', 'text'],
    ['Belopp', 'number'],
    ['Datum', 'date'],
    ['Bekräftat', 'boolean'],
  ]) {
    await userEvent.click(editor.getByRole('button', { name: 'Lägg till fält' }));
    const field = within(
      editor.getAllByRole('group', { name: /^Eget fält/ }).at(-1) as HTMLElement,
    );
    await user.click(field.getByLabelText('Fältets namn'));
    await user.paste(name);
    await user.click(field.getByLabelText('Fältets beskrivning'));
    await user.paste('Valfri uppgift');
    await userEvent.selectOptions(field.getByLabelText('Värdeslag'), kind);
  }
  await userEvent.click(editor.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
  await userEvent.selectOptions(screen.getByLabelText('Från objekt'), 'bike');
  await userEvent.selectOptions(screen.getByLabelText('Till objekt'), 'garage');
  await userEvent.selectOptions(
    screen.getByLabelText('Sambandstyp', { exact: true }),
    screen.getByRole('option', { name: 'Förvaring' }),
  );
  await userEvent.type(screen.getByLabelText('Anteckning', { exact: true }), 'Låst');
  await userEvent.type(screen.getByLabelText('Belopp', { exact: true }), '0');
  await userEvent.type(screen.getByLabelText('Datum', { exact: true }), '2026-09-27');
  await userEvent.selectOptions(screen.getByLabelText('Bekräftat', { exact: true }), 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  const review = within(screen.getByRole('region', { name: 'Hela mitt utkast' }));
  await review.findByText('Anteckning: Låst');
  expect(review.getByText('Belopp: 0')).toBeTruthy();
  expect(review.getByText('Bekräftat: Nej')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  await screen.findByText(/^Sparat:/);
  expect(Object.values((await read()).relationships[0].customValues ?? {})).toEqual([
    'Låst',
    0,
    '2026-09-27',
    false,
  ]);
});

test('relationship type changes keep previous answers visible until the user makes an explicit choice', async () => {
  const state = await read();
  const fields = [{ id: 'note', name: 'Anteckning', description: '', kind: 'text' }];
  for (const id of ['first', 'second'])
    await post('relationship-type', {
      version: (await read()).draft.version,
      id,
      baseRevision: null,
      value: { name: id, description: '', forwardLabel: 'hör till', reverseLabel: 'har', fields },
    });
  await post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
    baseRevision: null,
    value: {
      typeId: 'first',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { note: 'Tidigare svar' },
    },
  });
  await post('save', { version: (await read()).draft.version, operationId: 'initial' });
  await open();
  await userEvent.click(
    within(screen.getByRole('list', { name: 'Samband' })).getByRole('button', {
      name: 'bike → hör till → garage',
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
  await userEvent.selectOptions(screen.getByLabelText('Sambandstyp', { exact: true }), 'second');
  const previous = within(screen.getByRole('region', { name: 'Tidigare egna sambandsvärden' }));
  expect(previous.getByText('Anteckning: Tidigare svar')).toBeTruthy();
  expect((screen.getByLabelText('Anteckning', { exact: true }) as HTMLInputElement).value).toBe('');
  expect(
    (screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await userEvent.type(screen.getByLabelText('Anteckning', { exact: true }), 'Nytt svar');
  await userEvent.click(
    previous.getByRole('button', { name: 'Bekräfta borttagning av tidigare egna värden' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  expect((await read()).draft.relationships?.[0]).toMatchObject({
    beforeType: { id: 'first' },
    after: { typeId: 'second', customValues: { note: 'Nytt svar' } },
  });
  expect(state.draft.relationships).toBeUndefined();
});
