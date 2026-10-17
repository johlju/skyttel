import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { HouseholdTable, type HouseholdTableRow } from '../../src/client/HouseholdTable.js';
import '../../src/client/styles.css';

afterEach(cleanup);

const rows: HouseholdTableRow[] = ['Cykel', 'Garage'].map((name) => ({
  object: {
    id: name,
    householdId: 'home',
    revision: 1,
    typeId: 'thing',
    name,
    description: '',
  },
  removed: false,
}));

for (const outcome of ['removed', 'unchanged', 'later-focus'] as const) {
  test(`table removal waits for enabled controls before restoring focus: ${outcome}`, {
    tags: ['technical'],
  }, async () => {
    let completeRemoval!: (result: boolean) => void;
    const removal = new Promise<boolean>((resolve) => {
      completeRemoval = resolve;
    });
    const table = (workDisabled: boolean, proposed = false) => (
      <>
        <HouseholdTable
          active
          householdName="Linden"
          workDisabled={workDisabled}
          rows={rows.map((row, index) =>
            proposed && index === 0 ? { ...row, proposal: 'Föreslagen borttagning' } : row,
          )}
          selectedIds={[]}
          onSelect={() => {}}
          onRemove={() => removal}
        />
        <button type="button">Läs vidare</button>
      </>
    );
    const view = render(table(false));
    const origin = page.getByRole('button', { name: 'Ta bort Cykel', exact: true });
    await origin.click();
    view.rerender(table(true));
    await expect.element(origin).toBeDisabled();
    if (outcome === 'later-focus')
      page.getByRole('button', { name: 'Läs vidare', exact: true }).element().focus();

    completeRemoval(outcome !== 'unchanged');
    // Let completion callbacks run before the parent commits the enabled result.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    view.rerender(table(false, outcome !== 'unchanged'));

    await expect
      .element(
        page.getByRole('button', {
          name:
            outcome === 'later-focus'
              ? 'Läs vidare'
              : outcome === 'unchanged'
                ? 'Ta bort Cykel'
                : 'Ta bort Garage',
          exact: true,
        }),
      )
      .toHaveFocus();
  });
}
