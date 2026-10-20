import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect } from 'vitest';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';

/** Supply the same public type-settings mount used by the application shell. */
export function renderHouseholdWork(householdId: string) {
  const types = document.createElement('section');
  types.setAttribute('aria-label', 'Typer');
  const view = render(
    <FormLeaveProvider>
      <HouseholdMap householdId={householdId} typeSettingsTarget={types} />
    </FormLeaveProvider>,
  );
  view.container.append(types);
  return view;
}

export async function openNewObjectForm() {
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  const button = tools.getByRole('button', { name: 'Nytt objekt' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(button);
  return within(await screen.findByRole('dialog', { name: 'Nytt objekt' }));
}

export async function editTableObjectForm(name: string) {
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  const table = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(await table.findByRole('button', { name: `Redigera ${name}` }));
  return within(await screen.findByRole('dialog', { name: `Redigera ${name}` }));
}

export async function readTableObject(name: string) {
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  const table = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
  const expand = await table.findByRole('button', { name });
  if (expand.getAttribute('aria-expanded') !== 'true') await userEvent.click(expand);
  return within(await table.findByRole('region', { name: `Uppgifter för ${name}` }));
}

export async function openObjectRelationships(name: string) {
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  const table = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(await table.findByRole('button', { name: `Samband för ${name}` }));
  return within(await screen.findByRole('dialog', { name: `Samband för ${name}` }));
}

export async function openConflictReview() {
  await userEvent.click(
    await screen.findByRole('button', { name: /^\d+ konflikt(?:er)? i ditt utkast$/ }),
  );
  const dialog = within(await screen.findByRole('dialog', { name: 'Granska konflikter' }));
  await waitFor(() =>
    expect(
      (dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  return dialog;
}

export async function openDraftReview() {
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  const text = tools.getByRole('button', { name: /^Skriv till Skyttel/ });
  if (text.getAttribute('aria-expanded') !== 'true') await userEvent.click(text);
  if (!screen.queryByRole('region', { name: 'Utkastet' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Visa utkastet/ }));
  return within(await screen.findByRole('region', { name: 'Utkastet' }));
}

export async function readDraftProposal(name: string) {
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: `Visa förslaget: ${name}` }));
  return within(await screen.findByRole('dialog', { name }));
}

export async function saveHouseholdDraft() {
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Spara utkastet' })).toBeNull();
    expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe(
      'Utkastet är sparat',
    );
  });
}
