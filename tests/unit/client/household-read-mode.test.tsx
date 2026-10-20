import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { HouseholdReadDialog } from '../../../src/client/HouseholdReadDialog.js';
import { householdTableRows } from '../../../src/client/HouseholdTable.js';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

afterEach(cleanup);

test('read-only relationship chains keep cross and Escape closure while ordinary work retains its C footer', async () => {
  const fixture = await applicationFixture();
  try {
    const client = fixture.client();
    await client.signIn();
    const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
    const path = `/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await client.request(path)).json();
    const initial = await read();
    for (const [version, id, name] of [
      [0, 'alex', 'Alex'],
      [1, 'bike', 'Blå cykeln'],
    ] as const)
      expect(
        (
          await client.json(`${path}/draft`, {
            version,
            id,
            baseRevision: null,
            value: { typeId: initial.types[0].id, name },
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await client.json(`${path}/relationship`, {
          version: 2,
          id: 'uses',
          baseRevision: null,
          value: {
            typeId: initial.relationshipTypes[0].id,
            sourceId: 'alex',
            targetId: 'bike',
          },
        })
      ).status,
    ).toBe(200);
    const state = await read();
    const onClose = vi.fn();
    const props = {
      entry: { kind: 'relationships', id: 'alex' } as const,
      rows: householdTableRows(state, state.types),
      state,
      relationshipTypes: state.relationshipTypes,
      onClose,
    };
    const view = render(<HouseholdReadDialog {...props} />);
    const dialog = within(screen.getByRole('dialog', { name: 'Samband för Alex' }));
    expect(dialog.queryByRole('button', { name: 'Stäng samband' })).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Nytt samband' })).toBeNull();
    await userEvent.click(dialog.getByRole('button', { name: 'Blå cykeln' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tillbaka' }));
    expect(dialog.getByRole('heading', { name: 'Samband för Alex' })).toBe(document.activeElement);
    await userEvent.click(dialog.getByRole('button', { name: 'Stäng dialogen' }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    view.rerender(
      <HouseholdReadDialog
        {...props}
        onStageRelationship={async () => ({ state, outcome: null })}
      />,
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Stäng samband' }));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(await read()).toEqual(state);
  } finally {
    fixture.close();
  }
});
