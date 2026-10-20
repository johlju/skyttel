import { expect, type Locator, type Page } from '@playwright/test';
import { closeSupportDialog, openTable, utilityButton } from './client.js';
import {
  openObjectRelationships,
  openTypeDefinitions,
  readDraftProposal,
  readTableObject,
} from './domain-work.js';

/** Read the other authenticated browser's refreshed household through its native table. */
export async function refreshConflictReader(page: Page, origin: string) {
  if (page.url().startsWith(origin)) await page.reload();
  else await page.goto(origin);
  await openTable(page);
}

/** Match a complete visible property, including the proposal's changed-field marker. */
export async function expectConflictReadValue(
  details: Locator,
  label: string,
  value: string | RegExp,
) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const field = details
    .locator('dt')
    .filter({ hasText: new RegExp(`^${escaped}(?:\\s+· ändrat)?$`) })
    .locator('..')
    .locator('dd');
  if (typeof value === 'string') {
    if (
      (value === 'Ej uppgivet' ||
        (label === 'Uppgiftens säkerhet' && ['Känt', 'Bekräftat'].includes(value))) &&
      !(await field.count())
    ) {
      await expect(field).toHaveCount(0);
      return;
    }
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(field).toHaveText(
      new RegExp(`^${escapedValue}(?: \\((?:Text|Tal|Datum|Ja/nej)\\))?$`),
    );
  } else await expect(field).toHaveText(value);
}

export async function expectSavedConflictObject(
  page: Page,
  name: string,
  description = 'Ej uppgivet',
) {
  const details = await readTableObject(page, name);
  await expectConflictReadValue(details, 'Namn', name);
  if (description !== 'Ej uppgivet')
    await expectConflictReadValue(details, 'Beskrivning', description);
  else await expect(details.locator('dt').filter({ hasText: /^Beskrivning$/ })).toHaveCount(0);
  return details;
}

export async function expectConflictDraftValues(
  page: Page,
  name: string,
  values: Record<string, string>,
  side: 'Sparade värden' | 'Föreslagna värden' = 'Föreslagna värden',
) {
  const proposal = await readDraftProposal(page, name);
  const details = proposal.getByRole('heading', { name: side, exact: true }).locator('..');
  for (const [label, value] of Object.entries(values))
    await expectConflictReadValue(details, label, value);
  await closeSupportDialog(page, name);
}

export async function expectSavedConflictRelationship(
  page: Page,
  source: string,
  name: string,
  values: Record<string, string>,
) {
  const dialog = await openObjectRelationships(page, source);
  const details = dialog.getByRole('heading', { name, exact: true }).locator('..');
  for (const [label, value] of Object.entries(values))
    await expectConflictReadValue(details, label, value);
  await closeSupportDialog(page, `Samband för ${source}`);
}

export async function expectNoSavedConflictRelationships(page: Page, source: string) {
  const dialog = await openObjectRelationships(page, source);
  await expect(dialog.getByText('Inga samband finns för objektet.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 4 })).toHaveCount(0);
  await closeSupportDialog(page, `Samband för ${source}`);
}

/** Inspect the newest actual save and its expanded values, then return to the work. */
export async function expectConflictHistory(
  page: Page,
  count: number,
  summary: string[],
  changes: string[],
) {
  await (await utilityButton(page, 'Rapporter')).click();
  const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
  await expect(history.getByRole('article')).toHaveCount(count);
  const newest = history.getByRole('article').first();
  for (const text of summary) await expect(newest).toContainText(text);
  await newest.getByText('Visa ändringarna', { exact: true }).click();
  for (const text of new Set(changes)) {
    const values = newest.getByText(text, { exact: true });
    const expected = changes.filter((value) => value === text).length;
    await expect(values).toHaveCount(expected);
    for (let index = 0; index < expected; index++) await expect(values.nth(index)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
}

/** Inspect the saved definition in its ordinary form without staging a change. */
export async function expectSavedConflictDefinition(
  page: Page,
  objectType: boolean,
  name: string,
  description: string,
) {
  await openTypeDefinitions(page);
  await page
    .getByText(objectType ? 'Objekttyper' : 'Sambandstyper och riktning', {
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: `${objectType ? 'Ändra typ' : 'Ändra sambandstyp'}: ${name}`,
      exact: true,
    })
    .click();
  const definition = page.getByRole('group', {
    name: objectType ? 'Objekttypens definition' : 'Sambandstypens definition',
    exact: true,
  });
  await expect(
    definition.getByLabel(objectType ? 'Typens namn' : 'Sambandstypens namn', { exact: true }),
  ).toHaveValue(name);
  await expect(
    definition.getByLabel(objectType ? 'Typens beskrivning' : 'Sambandstypens beskrivning', {
      exact: true,
    }),
  ).toHaveValue(description);
  await page
    .getByRole('button', {
      name: objectType
        ? 'Stäng typformuläret utan att skicka'
        : 'Stäng sambandstypen utan att skicka',
      exact: true,
    })
    .click();
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
}
