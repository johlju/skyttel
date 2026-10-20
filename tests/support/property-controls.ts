import { expect, type Locator, type Page } from '@playwright/test';
import type { Property, PropertyKind } from '../../src/shared/properties.js';

/** Compare values by stable property identity when order is asserted separately. */
export function propertyValues(value: { properties?: Property[] } | null | undefined) {
  return Object.fromEntries(
    (value?.properties ?? []).map((property) => [
      property.id,
      'value' in property ? property.value : undefined,
    ]),
  );
}

/** Read one unique fixture label when the form assigns its identity. */
export function propertyValue(
  value: { properties?: Property[] } | null | undefined,
  label: string,
) {
  const matches = (value?.properties ?? []).filter((property) => property.label === label);
  if (matches.length > 1) throw new Error(`Fixture property label is ambiguous: ${label}`);
  const property = matches[0];
  return property && 'value' in property ? property.value : undefined;
}

/** Find a uniquely labelled free property through the ordinary editor. */
export function propertyRow(form: Locator | Page, label: string) {
  return form.locator(`.property-editor-row:has(input[value=${JSON.stringify(label)}])`);
}

export async function openProperties(form: Locator | Page) {
  const section = form.getByRole('button', { name: 'Fria egenskaper', exact: true });
  if ((await section.count()) && (await section.getAttribute('aria-expanded')) !== 'true')
    await section.click();
}

/** Add or correct one property without changing any other row. */
export async function setProperty(
  form: Locator | Page,
  label: string,
  value: string,
  kind: PropertyKind = 'text',
) {
  await openProperties(form);
  let row = propertyRow(form, label);
  if (!(await row.count())) {
    await form.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
    row = form.locator('.property-editor-row').last();
    await row.getByLabel('Etikett', { exact: true }).fill(label);
  }
  await expect(row).toHaveCount(1);
  await row.getByLabel('Datatyp', { exact: true }).selectOption(kind);
  if (kind === 'boolean') await row.getByLabel('Värde', { exact: true }).selectOption(value);
  else await row.getByLabel('Värde', { exact: true }).fill(value);
}
