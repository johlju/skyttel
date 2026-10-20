import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { HouseholdReadDialog } from '../../../src/client/HouseholdReadDialog.js';
import { householdTableRows } from '../../../src/client/HouseholdTable.js';
import type { MapState } from '../../../src/shared/map.js';

afterEach(cleanup);

const person = { id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' };
const uses = {
  id: 'uses',
  householdId: 'home',
  revision: 1,
  name: 'Använder',
  description: '',
  forwardLabel: 'använder',
  reverseLabel: 'används av',
};
const state: MapState = {
  userId: 'alex',
  contentVersion: 2,
  types: [person],
  objects: [{ id: 'lo', householdId: 'home', revision: 1, typeId: person.id, name: 'Lo Exempel' }],
  relationshipTypes: [uses],
  relationships: [],
  draft: {
    version: 3,
    changes: [],
    relationships: [
      {
        id: 'retained',
        before: null,
        after: {
          typeId: uses.id,
          sourceId: 'lo',
          targetId: 'removed',
          properties: [{ id: 'note', label: 'Anteckning', kind: 'text', value: 'Bevarad text' }],
        },
        type: uses,
        objectNames: { lo: 'Lo Exempel', removed: 'Molnmusik' },
        endpointRecovery: { removedRevision: 1 },
      },
    ],
  },
};

/** The owner closes a reading surface and may return to the conflict comparison. */
function Session({
  correction = false,
  active = true,
  suspended = false,
}: {
  correction?: boolean;
  active?: boolean;
  suspended?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [returned, setReturned] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öppna uppgifterna
      </button>
      {returned && (
        <h1 tabIndex={-1} ref={(heading) => heading?.focus()}>
          Jämför konflikten
        </h1>
      )}
      {open && (
        <HouseholdReadDialog
          entry={
            correction
              ? {
                  kind: 'relationships',
                  id: 'blocked-retained',
                  retainedRelationshipId: 'retained',
                  restoreFocus: () => setReturned(true),
                }
              : { kind: 'object', id: 'lo' }
          }
          active={active}
          suspended={suspended}
          rows={householdTableRows(state, state.types)}
          state={state}
          relationshipTypes={state.relationshipTypes}
          onClose={() => setOpen(false)}
          onStageRelationship={async () => ({ state, outcome: null })}
          onCheckRelationship={async () => ({ state, outcome: null })}
        />
      )}
    </>
  );
}

test('StrictMode keeps retained correction focused and returns to the comparison only on genuine close', async () => {
  render(
    <StrictMode>
      <Session correction />
    </StrictMode>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Öppna uppgifterna' }));
  const correction = within(screen.getByRole('dialog', { name: 'Rätta blockerat samband' }));
  expect(correction.getByRole('heading', { name: 'Rätta blockerat samband' })).toBe(
    document.activeElement,
  );
  expect(correction.getByLabelText('Värde', { exact: true })).toHaveProperty(
    'value',
    'Bevarad text',
  );
  expect(screen.queryByRole('heading', { name: 'Jämför konflikten' })).toBeNull();

  await userEvent.click(correction.getByRole('button', { name: 'Stäng dialogen' }));
  const comparison = await screen.findByRole('heading', { name: 'Jämför konflikten' });
  expect(comparison).toBe(document.activeElement);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('StrictMode ordinary readers return to their original opener after closing', async () => {
  render(
    <StrictMode>
      <Session />
    </StrictMode>,
  );
  const opener = screen.getByRole('button', { name: 'Öppna uppgifterna' });
  // jsdom has no layout; this is the native focusability boundary for this opener.
  Object.defineProperty(opener, 'getClientRects', {
    value: () => [opener.getBoundingClientRect()],
  });
  await userEvent.click(opener);
  const reader = within(screen.getByRole('dialog', { name: 'Uppgifter för Lo Exempel' }));
  expect(reader.getByRole('heading', { name: 'Uppgifter för Lo Exempel' })).toBe(
    document.activeElement,
  );
  await userEvent.click(reader.getByRole('button', { name: 'Stäng dialogen' }));
  await waitFor(() => expect(document.activeElement).toBe(opener));
});

test('suspending a StrictMode correction retains unsent values without returning to the comparison', async () => {
  const view = render(
    <StrictMode>
      <Session correction />
    </StrictMode>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Öppna uppgifterna' }));
  const correction = within(screen.getByRole('dialog', { name: 'Rätta blockerat samband' }));
  const value = correction.getByLabelText('Värde', { exact: true });
  await userEvent.clear(value);
  await userEvent.type(value, 'Oskickad rättning');
  view.rerender(
    <StrictMode>
      <Session correction active={false} suspended />
    </StrictMode>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Jämför konflikten' })).toBeNull();
  view.rerender(
    <StrictMode>
      <Session correction />
    </StrictMode>,
  );
  const resumed = within(screen.getByRole('dialog', { name: 'Rätta blockerat samband' }));
  expect(resumed.getByLabelText('Värde', { exact: true })).toHaveProperty(
    'value',
    'Oskickad rättning',
  );
  expect(screen.queryByRole('heading', { name: 'Jämför konflikten' })).toBeNull();
});
