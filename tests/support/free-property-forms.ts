import { expect, type Locator, type Page } from '@playwright/test';
import type { PropertyKind } from '../../src/shared/properties.js';
import { openTypeDefinitions } from './domain-work.js';

/** Use the same public ordered property controls on objects and relationships. */
export async function addFreeProperty(
  form: Locator,
  label: string,
  kind: PropertyKind | '',
  value?: string,
) {
  await form.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
  const row = form.getByRole('group', { name: /^Egenskap \d+$/ }).last();
  await expect(row.getByLabel('Etikett', { exact: true })).toBeFocused();
  await row.getByLabel('Etikett', { exact: true }).fill(label);
  await row.getByLabel('Datatyp', { exact: true }).selectOption(kind);
  if (value !== undefined) {
    const control = row.getByLabel('Värde', { exact: true });
    if (kind === 'boolean') await control.selectOption(value);
    else await control.fill(value);
  }
  const labelId = await row.getByLabel('Etikett', { exact: true }).getAttribute('id');
  if (!labelId) throw new Error('A property label must have a stable input identity');
  return form.locator(`.property-editor-row:has(input[id=${JSON.stringify(labelId)}])`);
}

export function freeProperty(form: Locator, label: string) {
  return form.getByRole('group', { name: /^Egenskap \d+$/ }).filter({
    has: form
      .page()
      .getByLabel('Etikett', { exact: true })
      .and(form.page().locator(`input[value=${JSON.stringify(label)}]`)),
  });
}

export async function openFreeProperties(form: Locator) {
  const section = form.getByRole('button', { name: 'Fria egenskaper', exact: true });
  if ((await section.count()) && (await section.getAttribute('aria-expanded')) !== 'true')
    await section.click();
}

export async function openTypes(page: Page) {
  await openTypeDefinitions(page);
}
