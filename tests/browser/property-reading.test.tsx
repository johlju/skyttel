import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { RelationshipForm } from '../../src/client/RelationshipForm.js';
import type { MapState } from '../../src/shared/map.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';
import '../../src/client/household-read-dialog.css';

afterEach(cleanup);

test('endpoint inspection searches property labels and values without choosing a same-name candidate at 320px', {
  tags: ['technical'],
}, async () => {
  await page.viewport(320, 900);
  const state: MapState = {
    userId: 'user',
    contentVersion: 1,
    types: [{ id: 'cycle', householdId: 'home', revision: 1, name: 'Fordon', description: '' }],
    objects: ['one', 'two'].map((id) => ({
      id,
      householdId: 'home',
      revision: 1,
      name: 'Cykel',
      typeId: 'cycle',

      properties: [
        {
          id: 'mark',
          label: 'Ramnummer',
          kind: 'text' as const,
          value: id === 'one' ? 'Röd' : 'Blå',
        },
      ],
    })),
    relationshipTypes: [
      { id: 'uses', householdId: 'home', revision: 1, name: 'Använder', description: '' },
    ],
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  state.draft.changes.push({
    id: 'two',
    type: state.types[0],
    before: {
      ...state.objects[1],
      properties: [{ id: 'mark', label: 'Ramnummer', kind: 'text', value: 'Röd' }],
    },
    after: state.objects[1],
  });
  render(
    <FormLeaveProvider>
      <main className="household-map workspace-shell" data-theme="light">
        <RelationshipForm
          initial={{
            id: 'edge',
            version: 0,
            contentVersion: 1,
            baseRevision: null,
            value: { sourceId: 'one', targetId: '', typeId: 'uses' },
          }}
          state={state}
          objects={new Map(state.objects.map((object) => [object.id, object]))}
          onStage={async () => ({ state, outcome: null })}
          onCheck={async () => ({ state, outcome: null })}
          onComplete={() => {}}
          onCancel={() => {}}
          onExisting={() => {}}
        />
      </main>
    </FormLeaveProvider>,
  );
  await page
    .getByRole('searchbox', { name: 'Sök det andra objektet', exact: true })
    .fill('ramnummer blå');
  const target = page.getByRole('region', { name: 'Till objekt: välj eller granska', exact: true });
  const inspect = target.getByText('Granska Cykel [two]', { exact: true });
  inspect.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.poll(() => target.element().textContent).toContain('Blå (Text)');
  expect(target.element().textContent).toContain('Sparat: Röd (Text)');
  expect(target.element().textContent).not.toContain('Borttagen typ');
  await expect.element(page.getByLabelText('Till objekt', { exact: true })).toHaveValue('');
  await target.getByRole('button', { name: 'Välj Cykel [two]', exact: true }).click();
  await expect.element(page.getByLabelText('Till objekt', { exact: true })).toHaveValue('two');
  await expect.element(page.getByLabelText('Till objekt', { exact: true })).toHaveFocus();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
});
