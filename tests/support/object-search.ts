import type { APIRequestContext, Page } from '@playwright/test';
import { prepareHouseholdTable } from './household-table.js';

/** Return to the map and focus its always-visible search input. */
export async function focusMapSearch(page: Page) {
  await page.getByRole('button', { name: 'Karta', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true }).click();
}

/** Same public-HTTP Unicode preparation for manual and automated searches. */
export async function prepareObjectSearch(client: APIRequestContext, origin: string) {
  const prepared = await prepareHouseholdTable(client, origin);
  await prepared.post('draft', {
    id: 'unicode-object',
    baseRevision: null,
    value: {
      name: 'Övrigt Élan',
      typeId: 'table-type-2',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Åker äpple' },
        { id: 'note', label: 'Anteckning', kind: 'text' as const, value: 'Hemlig anteckning' },
      ],
    },
  });
  await prepared.post('relationship-type', {
    id: 'search-relationship-type',
    baseRevision: null,
    value: {
      name: 'Endast i sambandet',
      description: '',
      forwardLabel: 'går till',
      reverseLabel: 'kommer från',
    },
  });
  await prepared.post('relationship', {
    id: 'search-relationship',
    baseRevision: null,
    value: { sourceId: 'table-0', targetId: 'unicode-object', typeId: 'search-relationship-type' },
  });
  return prepared;
}

/** Open the map's filter dialog without changing search or toolbar state. */
export async function mapFilters(page: Page) {
  const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
  const button = panel.getByRole('button', { name: /^Filter/ });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  return page.getByRole('dialog', { name: 'Kartans filter', exact: true });
}

/** Existing large-list cases deliberately include the fixture's ended objects. */
export async function includeEndedInMap(page: Page) {
  const filters = await mapFilters(page);
  await filters.getByLabel('Ta med upphörda').check();
  await filters.getByRole('button', { name: 'Stäng filter', exact: true }).click();
}
