import { expect, type Page } from '@playwright/test';
import { propertyRow } from './property-controls.js';

/** Exercise both explicit loss decisions before leaving the ordinary object form. */
export async function verifyObjectDepartureAndDiscard(page: Page, values: Record<string, string>) {
  const labels = Object.keys(values);
  const control = (label: string) =>
    label === 'Beskrivning'
      ? propertyRow(page, label).getByLabel('Värde', { exact: true })
      : page.getByLabel(label, { exact: true });
  const focus = control(labels[labels.length - 1]);
  await focus.focus();
  await page.keyboard.press('Escape');
  const leave = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
  await leave.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
  for (const [label, value] of Object.entries(values))
    await expect(control(label)).toHaveValue(value);
  await expect(focus).toBeFocused();
  await page.keyboard.press('Escape');
  await leave.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
  await expect(leave).not.toBeVisible();
  await expect(focus).toHaveCount(0);
}
