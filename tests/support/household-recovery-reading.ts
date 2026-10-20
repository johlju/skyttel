import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { closeSupportDialog, closeTextView, openDraftReview } from './client.js';
import { readDraftProposal, readTableObject } from './domain-work.js';

export async function reloadRestoredHousehold(page: Page) {
  const loaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Läs in det återställda hushållet', exact: true }).click();
  await loaded;
  await expect(
    page.getByRole('heading', { name: 'Återimportera hushållet', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
}

/** Saved public-seam fixture content makes recovery readbacks observable. */
export async function seedRecoveryContent(
  client: APIRequestContext,
  path: string,
  name = 'Lampa från exporten',
) {
  const state = await (await client.get(`${path}/map`)).json();
  const headers = { origin: new URL(path).origin };
  const proposed = await client.post(`${path}/map/draft`, {
    headers,
    data: {
      id: 'recovery-lamp',
      version: state.draft.version,
      baseRevision: null,
      value: {
        typeId: state.types[0].id,
        name,
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Sparat provinnehåll',
          },
        ],
      },
    },
  });
  expect(proposed.status(), await proposed.text()).toBe(200);
  const current = await (await client.get(`${path}/map`)).json();
  const saved = await client.post(`${path}/map/save`, {
    headers,
    data: { version: current.draft.version, operationId: 'recovery-reading-fixture' },
  });
  expect(saved.status(), await saved.text()).toBe(200);
}

export async function expectRecoveryContent(
  page: Page,
  name = 'Lampa från exporten',
  description = 'Sparat provinnehåll',
) {
  const details = await readTableObject(page, name);
  await expect(details).toContainText(name);
  if (description) await expect(details).toContainText(description);
}

/** Read the actual full-value private proposal, then leave the draft unchanged. */
export async function expectRecoveryDraft(
  page: Page,
  name: string,
  absentName?: string,
  description = `Privat uppgift för ${name}`,
  absentDescription = absentName ? `Privat uppgift för ${absentName}` : undefined,
) {
  const draft = await openDraftReview(page);
  await expect(draft).toContainText(name);
  if (absentName) await expect(draft).not.toContainText(absentName);
  const proposal = await readDraftProposal(page, name);
  await expect(proposal).toContainText(name);
  await expect(proposal).toContainText(description);
  if (absentName) {
    await expect(proposal).not.toContainText(absentName);
    if (absentDescription) await expect(proposal).not.toContainText(absentDescription);
  }
  await closeSupportDialog(page, name);
  await closeTextView(page);
}

export async function expectEmptyRecoveryDraft(page: Page, absentName: string) {
  const draft = await openDraftReview(page);
  await expect(draft).toContainText('Utkastet är tomt');
  await expect(draft).not.toContainText(absentName);
  await closeTextView(page);
}
