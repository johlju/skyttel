import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { DraftStatus } from '../../../src/client/DraftStatus.js';
import type { SaveOperation } from '../../../src/shared/map.js';

afterEach(cleanup);

const operation: SaveOperation = {
  operationId: 'save-lo',
  householdId: 'linden',
  userId: 'alex',
  draftVersion: 1,
  contentVersion: 1,
  createdAt: '2026-10-03T10:00:00Z',
  status: 'pending',
};
function feedback(): ComponentProps<typeof DraftStatus> {
  return {
    draft: {
      version: 2,
      changes: [
        {
          id: 'lo',
          before: null,
          after: { typeId: 'person', name: 'Lo Exempel' },
          type: {
            id: 'person',
            householdId: 'linden',
            revision: 1,
            name: 'Person',
            description: '',
          },
        },
      ],
    },
    saving: false,
    unknown: false,
    dirty: false,
    unresolved: false,
    conflicts: [],
    error: '',
    working: false,
    pending: false,
    showSave: false,
    disabled: false,
    onRefresh: vi.fn(),
    onSave: vi.fn(),
    onDraft: vi.fn(),
    onConflict: vi.fn(),
  };
}

test('retained feedback distinguishes waiting, unknown and rejected saves and keeps recovery available', async () => {
  const props = feedback();
  const recover = vi.fn();
  const view = render(<DraftStatus {...props} saving operation={operation} />);
  expect(screen.getByText('Väntar på sparkvitto')).toBeDefined();
  view.rerender(
    <DraftStatus {...props} compact pending operation={operation} onRecover={recover} />,
  );
  expect(screen.getByText('Sparutfall okänt')).toBeDefined();
  const pendingRecovery = screen.getByRole('button', { name: 'Hämta samma kvitto igen' });
  expect((pendingRecovery as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(pendingRecovery);
  expect(recover).not.toHaveBeenCalled();
  view.rerender(
    <DraftStatus
      {...props}
      unknown
      operation={operation}
      onRecover={recover}
      error="Ingen kontakt"
    />,
  );
  expect(screen.getByText('Sparutfall okänt')).toBeDefined();
  expect(screen.getByRole('alert').textContent).toBe('Ingen kontakt');
  expect(screen.queryByRole('button', { name: 'Spara hela utkastet' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Hämta samma kvitto igen' }));
  expect(recover).toHaveBeenCalledOnce();
  const refresh = screen.getByRole('button', { name: 'Hämta aktuellt underlag' });
  await userEvent.click(refresh);
  expect(props.onRefresh).toHaveBeenCalledWith(refresh);
  view.rerender(
    <DraftStatus
      {...props}
      operation={{ ...operation, status: 'rejected', error: 'draft_conflict' }}
    />,
  );
  expect(screen.getByText('Sparandet avvisades · inget sparat av försöket')).toBeDefined();
});

test('retained feedback lists every conflict and sends its exact destination to the shared draft', async () => {
  const props = feedback();
  const first = { id: 'draft-object-lo', label: 'Objekt: Lo Exempel' };
  const second = { id: 'draft-type-person', label: 'Typ: Person' };
  const opened = vi.fn();
  const view = render(
    <DraftStatus
      {...props}
      conflicts={[first]}
      conflictLinks={{ open: false, onOpenChange: opened }}
    />,
  );
  await userEvent.click(screen.getByText('Visa 1 konflikt'));
  await userEvent.click(screen.getByRole('button', { name: first.label }));
  expect(opened).toHaveBeenCalledWith(true);
  expect(props.onConflict).toHaveBeenCalledWith(first.id);
  view.rerender(<DraftStatus {...props} conflicts={[first, second]} />);
  await userEvent.click(screen.getByText('Visa 2 konflikter'));
  await userEvent.click(screen.getByRole('button', { name: second.label }));
  expect(props.onConflict).toHaveBeenCalledWith(second.id);
  await userEvent.click(screen.getByRole('button', { name: 'Lös konflikter i utkastet' }));
  expect(props.onDraft).toHaveBeenCalledOnce();
});

test('text feedback preserves unsent editing and identity resolution before offering a whole save', async () => {
  const props = feedback();
  const view = render(<DraftStatus {...props} dirty unresolved showSave />);
  expect(
    screen.getByText('Oskickad formulärtext finns kvar. Den ingår inte i utkastet.'),
  ).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Spara hela utkastet' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Red ut identiteter i utkastet' }));
  expect(props.onDraft).toHaveBeenCalledOnce();
  view.rerender(<DraftStatus {...props} unresolved showSave />);
  await userEvent.click(screen.getByRole('button', { name: 'Red ut identiteter i utkastet' }));
  expect(props.onDraft).toHaveBeenCalledTimes(2);
  view.rerender(<DraftStatus {...props} showSave />);
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect(props.onSave).toHaveBeenCalledOnce();
});

test('retained receipt feedback identifies a previous save when a newer private proposal remains', () => {
  const props = feedback();
  render(
    <DraftStatus
      {...props}
      operation={{
        ...operation,
        status: 'succeeded',
        receipt: { ...operation, savedAt: operation.createdAt, changes: [] },
      }}
    />,
  );
  expect(screen.getByText('Tidigare sparande · kvitto bekräftat')).toBeDefined();
  expect(screen.getByText('1 förslag · privat utkast')).toBeDefined();
});
