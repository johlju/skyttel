import { type screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

type Scope = Pick<typeof screen, 'queryByRole' | 'getByRole' | 'getAllByRole' | 'queryAllByRole'>;

/** Select the concrete property row through its visible label and controls. */
export async function propertyInput(scope: Scope, label: string, kind = 'text') {
  const section = scope.queryByRole('button', { name: 'Fria egenskaper' });
  if (section?.getAttribute('aria-expanded') === 'false') await userEvent.click(section);
  let row = scope
    .queryAllByRole('group', { name: /^Egenskap \d+$/ })
    .find((group) => within(group).queryByDisplayValue(label));
  if (!row) {
    await userEvent.click(scope.getByRole('button', { name: 'Lägg till egenskap' }));
    row = scope.getAllByRole('group', { name: /^Egenskap \d+$/ }).at(-1);
    if (!row) throw new Error('Missing new property row');
    await userEvent.type(within(row).getByLabelText('Etikett', { exact: true }), label);
    await userEvent.selectOptions(within(row).getByLabelText('Datatyp', { exact: true }), kind);
  }
  return within(row).getByLabelText('Värde', { exact: true });
}
