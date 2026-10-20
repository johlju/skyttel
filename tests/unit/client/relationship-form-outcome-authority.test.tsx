import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import {
  RelationshipForm,
  type RelationshipFormSubmission,
} from '../../../src/client/RelationshipForm.js';
import type { MapState, RelationshipValue } from '../../../src/shared/map.js';
import type { RelationshipFormResult } from '../../../src/shared/relationship-form.js';

afterEach(cleanup);

test.each(['another-owner', 'replaced-content', 'another-attempt', 'missing-proof'] as const)(
  'an apparent staged reply for %s keeps the complete relationship locked until the original attempt is checked',
  async (corruption) => {
    const type = {
      id: 'person',
      householdId: 'home',
      revision: 1,
      name: 'Person',
      description: '',
    };
    const edgeType = { ...type, id: 'uses', name: 'Använder' };
    const objects = [
      { id: 'alex-umea', householdId: 'home', revision: 1, typeId: 'person', name: 'Alex i Umeå' },
      { id: 'music', householdId: 'home', revision: 1, typeId: 'person', name: 'Molnmusik' },
    ];
    const value: RelationshipValue = {
      typeId: 'uses',
      sourceId: 'alex-umea',
      targetId: 'music',
      properties: [
        { id: 'empty', label: 'Notering', kind: 'text' },
        { id: 'false', label: 'Notering', kind: 'boolean', value: false },
      ],
    };
    const state: MapState = {
      userId: 'alex',
      contentVersion: 37,
      types: [type],
      relationshipTypes: [edgeType],
      objects,
      relationships: [],
      draft: { version: 7, changes: [] },
    };
    let original: { editor: RelationshipFormSubmission; stagingId: string } | undefined;
    function confirmation(): RelationshipFormResult {
      if (!original) throw new Error('The ordinary form must submit before recovery');
      return {
        state: {
          ...state,
          draft: {
            version: 8,
            changes: [],
            relationships: [
              {
                id: 'edge',
                before: null,
                after: value,
                type: edgeType,
              },
            ],
          },
        },
        outcome: {
          status: 'staged',
          stagingId: original.stagingId,
          relationshipId: 'edge',
          draftVersion: 8,
          value,
        },
      };
    }
    const completed = vi.fn();
    render(
      <RelationshipForm
        initial={{ id: 'edge', version: 7, contentVersion: 37, baseRevision: null, value }}
        state={state}
        objects={new Map(objects.map((object) => [object.id, object]))}
        onStage={async (editor, stagingId) => {
          original = { editor, stagingId };
          const reply = confirmation();
          if (corruption === 'another-owner') reply.state = { ...reply.state, userId: 'robin' };
          else if (corruption === 'replaced-content')
            reply.state = { ...reply.state, contentVersion: 38 };
          else if (corruption === 'another-attempt' && reply.outcome)
            reply.outcome.stagingId = 'another-attempt';
          else reply.outcome = null;
          return reply;
        }}
        onCheck={async (stagingId, contentVersion) => {
          expect(stagingId).toBe(original?.stagingId);
          expect(contentVersion).toBe(37);
          return confirmation();
        }}
        onComplete={completed}
        onCancel={vi.fn()}
        onExisting={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet' }));
    const check = await screen.findByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
    });
    expect(completed).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      'Det är oklart om ändringen lades i utkastet',
    );
    expect(screen.getByLabelText('Från objekt', { exact: true })).toHaveProperty(
      'value',
      'alex-umea',
    );
    expect(screen.getByLabelText('Till objekt', { exact: true })).toHaveProperty('value', 'music');
    expect(
      screen
        .getAllByLabelText('Värde', { exact: true })
        .map((control) => (control as HTMLInputElement).value),
    ).toEqual(['', 'false']);
    expect(screen.getByRole('button', { name: 'Lägg i utkastet' }).matches(':disabled')).toBe(true);
    expect(original?.editor.value).toEqual(value);
    await userEvent.click(check);
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(completed.mock.calls[0][0].outcome.value).toEqual(value);
  },
);
