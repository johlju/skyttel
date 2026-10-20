import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import {
  RelationshipForm,
  type RelationshipFormSubmission,
} from '../../src/client/RelationshipForm.js';
import type { MapState, RelationshipValue } from '../../src/shared/map.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';

afterEach(cleanup);

test('relationship invalid property input blocks staging, preserves dirty work and survives type changes at 320px', {
  tags: ['technical'],
}, async () => {
  await page.viewport(320, 900);
  const staged: RelationshipFormSubmission[] = [];
  const dirty: boolean[] = [];
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    objects: [
      {
        id: 'alex',
        householdId: 'home',
        typeId: 'person',
        revision: 1,
        name: 'Alex',
      },
      {
        id: 'bike',
        householdId: 'home',
        typeId: 'cycle',
        revision: 1,
        name: 'Cykeln',
      },
    ],
    relationshipTypes: ['uses', 'owns'].map((id) => ({
      id,
      householdId: 'home',
      revision: 1,
      name: id,
      description: 'Typens förklaring',
      forwardLabel: id,
      reverseLabel: `omvänd ${id}`,
    })),
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  const value: RelationshipValue = {
    typeId: 'uses',
    sourceId: 'alex',
    targetId: 'bike',

    properties: [
      { id: 'one', label: 'Pris', kind: 'text', value: 'Gratis idag' },
      { id: 'two', label: 'Pris', kind: 'boolean', value: false },
    ],
  };
  render(
    <FormLeaveProvider>
      <main className="household-map workspace-shell" data-theme="light">
        <RelationshipForm
          initial={{ id: 'edge', version: 0, contentVersion: 1, baseRevision: 1, value }}
          state={state}
          objects={new Map(state.objects.map((object) => [object.id, object]))}
          onStage={async (editor, stagingId) => {
            staged.push(editor);
            return {
              state: {
                ...state,
                draft: {
                  version: 1,
                  changes: [],
                  relationships: [
                    {
                      id: 'edge',
                      before: null,
                      after: editor.value,
                      type: state.relationshipTypes[0],
                    },
                  ],
                },
              },
              outcome: {
                stagingId,
                relationshipId: 'edge',
                status: 'staged',
                draftVersion: 1,
                value: editor.value,
              },
            };
          }}
          onCheck={async () => ({ state, outcome: null })}
          onExisting={() => {}}
          onComplete={() => {}}
          onCancel={() => {}}
          onDirty={(value) => dirty.push(value)}
        />
      </main>
    </FormLeaveProvider>,
  );
  const first = page.getByRole('group', { name: 'Egenskap 1', exact: true });
  const second = page.getByRole('group', { name: 'Egenskap 2', exact: true });
  await first.getByLabelText('Datatyp', { exact: true }).selectOptions('number');
  await page.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
  expect(staged).toEqual([]);
  expect(dirty.at(-1)).toBe(true);
  await expect
    .element(page.getByRole('alert', { name: 'Formuläret innehåller fel' }))
    .toHaveFocus();
  await expect.element(first.getByLabelText('Värde', { exact: true })).toHaveValue('Gratis idag');
  await page.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
  await first.getByLabelText('Värde', { exact: true }).fill('0');
  second.getByRole('button', { name: 'Flytta upp', exact: true }).element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(first.getByLabelText('Etikett', { exact: true })).toHaveFocus();
  await expect
    .element(page.getByRole('status', { name: 'Egenskapernas ordning' }))
    .toHaveTextContent('Pris har position 1 av 2.');
  await first.getByRole('button', { name: 'Töm värdet', exact: true }).click();
  await page.getByLabelText('Sambandstyp', { exact: true }).selectOptions('owns');
  await second.getByRole('button', { name: 'Ta bort egenskapen', exact: true }).click();
  await page.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
  expect(staged).toHaveLength(1);
  expect(staged[0].value).toEqual({
    ...value,
    typeId: 'owns',

    properties: [{ id: 'two', label: 'Pris', kind: 'boolean' }],
  });
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
});
