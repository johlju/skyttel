import { expect, type Page } from '@playwright/test';
import { closeSupportDialog } from './client.js';
import { readDraftProposal } from './domain-work.js';

/** Read the complete fictional proposal without saving or replacing it. */
export async function readVoiceProposal(
  page: Page,
  name = 'Lo Exempel',
  description: string | null = 'Påhittad uppgift',
) {
  const proposal = await readDraftProposal(page, name);
  const proposed = proposal
    .getByRole('heading', { name: 'Föreslagna värden', exact: true })
    .locator('..');
  await expect(proposed).toContainText('Person');
  await expect(
    proposed
      .locator('dt')
      .filter({ hasText: /^Typ(?: · ändrat)?$/ })
      .locator('..')
      .getByRole('definition'),
  ).toHaveText('Person');
  await expect(
    proposed
      .locator('dt')
      .filter({ hasText: /^Namn(?: · ändrat)?$/ })
      .locator('..')
      .getByRole('definition'),
  ).toHaveText(name);
  const descriptionField = proposed
    .locator('dt')
    .filter({ hasText: /^Beskrivning(?: · ändrat)?$/ });
  if (description === null) await expect(descriptionField).toHaveCount(0);
  else
    await expect(descriptionField.locator('..').getByRole('definition')).toHaveText(
      `${description} (Text)`,
    );
  await closeSupportDialog(page, name);
}
