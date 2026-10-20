import { expect, type Page } from '@playwright/test';
import { openDraftReview, openSettings, openTable } from './client.js';

/** Read a complete object through its actual expanded table row. */
export async function readTableObject(page: Page, name: string) {
  await openTable(page);
  const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
  const expansion = table.getByRole('button', { name, exact: true });
  if ((await expansion.getAttribute('aria-expanded')) !== 'true') await expansion.click();
  const details = table.getByRole('region', { name: `Uppgifter för ${name}`, exact: true });
  await expect(details).toBeVisible();
  return details;
}

export async function closeTableObject(page: Page, name: string) {
  const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
  await table.getByRole('button', { name, exact: true }).click();
  await expect(
    table.getByRole('region', { name: `Uppgifter för ${name}`, exact: true }),
  ).not.toBeVisible();
}

/** Open the ordinary full object form from the table's named edit action. */
export async function editTableObject(page: Page, name: string) {
  await openTable(page);
  await page
    .getByRole('region', { name: 'Hushållets tabell', exact: true })
    .getByRole('button', { name: `Redigera ${name}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: `Redigera ${name}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Follow the actual table relationship action into the native reading chain. */
export async function openObjectRelationships(page: Page, name: string) {
  await openTable(page);
  await page
    .getByRole('region', { name: 'Hushållets tabell', exact: true })
    .getByRole('button', { name: `Samband för ${name}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: `Samband för ${name}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Edit one named relationship, retaining its originating object's reading chain. */
export async function editObjectRelationship(
  page: Page,
  objectName: string,
  relationshipName: string,
) {
  const dialog = await openObjectRelationships(page, objectName);
  const item = dialog.getByRole('heading', { name: relationshipName, exact: true }).locator('..');
  await item.getByRole('button', { name: 'Redigera samband', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Redigera samband', exact: true }),
  ).toBeVisible();
  return dialog;
}

/** Read the named persistent proposal through D's actual full-value action. */
export async function readDraftProposal(page: Page, name: string) {
  const draft = await openDraftReview(page);
  await draft.getByRole('button', { name: `Visa förslaget: ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Open the administrator's actual catalogue entry in Settings. */
export async function openTypeDefinitions(page: Page) {
  await openSettings(page);
  const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor', exact: true });
  const link = navigation.getByRole('link', {
    name: 'Typer',
    exact: true,
    includeHidden: true,
  });
  await expect(link).toBeAttached();
  if (!(await link.isVisible()))
    await navigation.getByText('Välj inställning', { exact: true }).click();
  await link.click();
  const definitions = page.getByRole('heading', { name: 'Typer', exact: true });
  await expect(definitions).toBeVisible();
  return definitions;
}
