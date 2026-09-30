import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;
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
  await userEvent.click(await screen.findByRole('button', { name: 'Ny sambandstyp' }));
  const editor = within(screen.getByRole('group', { name: 'Sambandstypens definition' }));
  await userEvent.type(editor.getByLabelText('Sambandstypens namn'), 'Förvaring');
  await userEvent.type(editor.getByLabelText('Benämning från startobjektet'), 'förvaras i');
  await userEvent.type(editor.getByLabelText('Benämning från målobjektet'), 'innehåller');
  return editor;
}

test('relationship section and field controls retain focus, descriptions and placement through the actual map draft', async () => {
  const editor = await open();
  const first = editor.getByLabelText('Avsnitt 1');
  await userEvent.clear(first);
  await userEvent.type(first, 'Uppgifter');
  await userEvent.click(editor.getByRole('button', { name: 'Lägg till avsnitt' }));
  expect(document.activeElement).toBe(editor.getByLabelText('Avsnitt 2'));
  await userEvent.type(editor.getByLabelText('Avsnitt 2'), 'Service');
  await userEvent.click(editor.getByRole('button', { name: 'Flytta avsnittet Service upp' }));
  expect((document.activeElement as HTMLInputElement).value).toBe('Service');
  await userEvent.click(editor.getByRole('button', { name: 'Flytta avsnittet Service ned' }));
  for (const name of ['Effekt', 'Anteckning']) {
    await userEvent.click(editor.getByRole('button', { name: 'Lägg till fält' }));
    const groups = editor.getAllByRole('group', { name: /^Eget fält/ });
    const field = within(groups[groups.length - 1]);
    expect(document.activeElement).toBe(field.getByLabelText('Fältets namn'));
    await userEvent.type(field.getByLabelText('Fältets namn'), name);
    await userEvent.type(field.getByLabelText('Fältets beskrivning'), 'kW');
  }
  await userEvent.selectOptions(
    within(editor.getByRole('group', { name: 'Eget fält 1' })).getByLabelText('Värdeslag'),
    'number',
  );
  await userEvent.click(editor.getByRole('button', { name: 'Flytta fältet Anteckning upp' }));
  expect((document.activeElement as HTMLInputElement).value).toBe('Anteckning');
  await userEvent.click(editor.getByRole('button', { name: 'Flytta fältet Anteckning ned' }));
  await userEvent.click(editor.getByRole('button', { name: 'Dölj Effekt, behåll värden' }));
  const power = within(editor.getByRole('group', { name: 'Eget fält 1' }));
  expect(document.activeElement).toBe(power.getByLabelText('Visa i avsnitt'));
  expect((power.getByLabelText('Visa i avsnitt') as HTMLSelectElement).value).toBe('');
  await userEvent.selectOptions(
    power.getByLabelText('Visa i avsnitt'),
    editor.getAllByRole('option', { name: 'Service' })[0],
  );
  await userEvent.click(editor.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const state = await read();
  const type = state.draft.relationshipTypes?.[0].after;
  expect(type?.sections?.map(({ name }) => name)).toEqual(['Uppgifter', 'Service']);
  expect(type?.fields?.map(({ name, description }) => [name, description])).toEqual([
    ['Effekt', 'kW'],
    ['Anteckning', 'kW'],
  ]);
});

test('the visible relationship conflict preview matches saved independent section names and proposed placement', async () => {
  const definition = {
    name: 'Förvaring',
    description: '',
    forwardLabel: 'förvaras i',
    reverseLabel: 'innehåller',
    sections: [
      { id: 'facts', name: 'Uppgifter' },
      { id: 'service', name: 'Service' },
    ],
    fields: [{ id: 'note', name: 'Anteckning', description: '', kind: 'text', sectionId: 'facts' }],
  };
  await client.json(`${path}/relationship-type`, {
    version: 0,
    id: 'storage',
    baseRevision: null,
    value: definition,
  });
  await client.json(`${path}/save`, { version: 1, operationId: 'initial' });
  fixture.setSubject('member');
  const other = fixture.client();
  await other.signIn();
  const { user } = await (await other.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`/api/households/${householdId}/invitations`, { userId: user.id })
  ).json();
  await other.json('/api/invitations/accept', { code });
  await client.json(`${path}/relationship-type`, {
    version: 2,
    id: 'storage',
    baseRevision: 1,
    value: { ...definition, fields: [{ ...definition.fields[0], sectionId: 'service' }] },
  });
  await other.json(`${path}/relationship-type`, {
    version: 0,
    id: 'storage',
    baseRevision: 1,
    value: {
      ...definition,
      sections: [definition.sections[0], { id: 'service', name: 'Underhåll' }],
    },
  });
  await other.json(`${path}/save`, { version: 1, operationId: 'other' });
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  const heading = await screen.findByText('Mitt förslag med oberoende rättelser bevarade');
  const preview = heading.nextElementSibling;
  expect(preview?.parentElement?.textContent).toContain('Avsnitt: Uppgifter → Underhåll');
  expect(preview?.parentElement?.textContent).toContain('Anteckning: Text · Underhåll');
  await userEvent.click(screen.getByRole('button', { name: 'Behåll min sambandstyp' }));
  await waitFor(() => expect(screen.queryByText('Konflikt: sparad sambandstyp')).toBeNull());
  expect((await read()).draft.relationshipTypes?.[0].after).toMatchObject({
    sections: [definition.sections[0], { id: 'service', name: 'Underhåll' }],
    fields: [{ ...definition.fields[0], sectionId: 'service' }],
  });
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Sparat:/));
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject({
    sections: [definition.sections[0], { id: 'service', name: 'Underhåll' }],
    fields: [{ ...definition.fields[0], sectionId: 'service' }],
  });
});
