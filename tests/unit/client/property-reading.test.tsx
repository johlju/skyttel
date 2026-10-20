import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { HouseholdTable } from '../../../src/client/HouseholdTable.js';
import { LifecycleStatus } from '../../../src/client/Lifecycle.js';
import { RelationshipReadDetails } from '../../../src/client/RelationshipReadDetails.js';

afterEach(cleanup);

test('table search finds a free property label and reads repeated empty and false values in order', async () => {
  render(
    <HouseholdTable
      active
      householdName="Provet"
      rows={[
        {
          object: {
            id: 'bike',
            householdId: 'home',
            revision: 1,
            name: 'Cykel',
            typeId: 'cycle',

            properties: [
              { id: 'empty', label: 'Märkning' },
              { id: 'false', label: 'Märkning', kind: 'boolean', value: false },
            ],
          },
          type: { id: 'cycle', householdId: 'home', revision: 1, name: 'Fordon', description: '' },
          removed: false,
        },
      ]}
      selectedIds={[]}
      onSelect={() => {}}
    />,
  );
  await userEvent.type(screen.getByRole('searchbox'), 'märkning');
  await userEvent.click(screen.getByRole('button', { name: 'Cykel' }));
  expect(screen.getAllByText('Märkning', { selector: 'dt' })).toHaveLength(2);
  expect(screen.getByText('Tomt (ingen datatyp)')).toBeTruthy();
  expect(screen.getByText('Nej (Ja/nej)')).toBeTruthy();
  expect(screen.getAllByRole('columnheader').map((node) => node.textContent)).toEqual([
    'Namn',
    'Typ',
    'Status',
    'Åtgärder',
  ]);
});

test('elapsed date fields and Slutdatum properties never end content without an explicit status', () => {
  const value = {
    lifecycle: undefined,
    properties: [{ id: 'date', label: 'Slutdatum', kind: 'date', value: '2000-01-01' }],
  };
  const view = render(<LifecycleStatus value={value} />);
  expect(screen.queryByText('Upphört')).toBeNull();
  view.rerender(<LifecycleStatus value={{ ...value, lifecycle: 'ended' }} />);
  expect(screen.getByText('Upphört')).toBeTruthy();
});

test('relationship reading retains the complete saved order beside a reordered proposal', async () => {
  const value = {
    lifecycle: undefined,
    sourceId: 'a',
    targetId: 'b',
    typeId: 'edge',

    properties: [
      { id: 'second', label: 'Avtal', kind: 'boolean' as const, value: false },
      { id: 'first', label: 'Avtal' },
    ],
  };
  render(
    <RelationshipReadDetails
      value={value}
      before={{ ...value, properties: [...value.properties].reverse() }}
      objects={new Map()}
    />,
  );
  await userEvent.click(screen.getByText('Sparade egenskaper i sin ordning'));
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Avtal: Tomt (ingen datatyp)',
    'Avtal: Nej (Ja/nej)',
  ]);
});

test('search keeps a saved property label discoverable beside its renamed proposal', async () => {
  const before = {
    id: 'bike',
    householdId: 'home',
    revision: 1,
    typeId: 'cycle',
    name: 'Cykel',

    properties: [{ id: 'mark', label: 'Registrering' }],
  };
  render(
    <HouseholdTable
      active
      householdName="Provet"
      rows={[
        {
          object: { ...before, properties: [{ id: 'mark', label: 'Märkning' }] },
          before,
          removed: false,
          proposal: 'Ändrat',
        },
      ]}
      selectedIds={[]}
      onSelect={() => {}}
    />,
  );
  await userEvent.type(screen.getByRole('searchbox'), 'registrering');
  expect(screen.getByRole('button', { name: 'Cykel' })).toBeTruthy();
});

test('relationship reading distinguishes the saved label from a label-only proposal', () => {
  const before = {
    sourceId: 'a',
    targetId: 'b',
    typeId: 'edge',

    properties: [{ id: 'reference', label: 'Avtal', kind: 'text' as const, value: 'A-12' }],
  };
  render(
    <RelationshipReadDetails
      before={before}
      value={{ ...before, properties: [{ ...before.properties[0], label: 'Referens' }] }}
      objects={new Map()}
    />,
  );
  expect(screen.getByText('Referens', { selector: 'dt' })).toBeTruthy();
  expect(screen.getByText('Sparat: Avtal: A-12 (Text)')).toBeTruthy();
});
