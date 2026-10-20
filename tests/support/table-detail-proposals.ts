import type { APIRequestContext } from '@playwright/test';
import { prepareHouseholdTable } from './household-table.js';

/** Public request preparation for the same full-detail browser scenario. */
export async function prepareTableDetailProposals(client: APIRequestContext, origin: string) {
  const app = await prepareHouseholdTable(client, origin);
  const prepared = await app.read();
  const type = prepared.types.find((value) => value.id === 'table-type-2');
  const proposal = prepared.draft.changes.find((change) => change.id === 'table-0');
  if (!type || !proposal?.after) throw new Error('Missing prepared type or object proposal');
  await app.post('object-type', {
    id: type.id,
    baseRevision: type.revision,
    value: { ...type },
  });
  await app.post('draft', {
    id: proposal.id,
    baseRevision: proposal.before?.revision ?? null,
    value: {
      ...proposal.after,
      properties: [
        ...(proposal.after.properties ?? [])
          .filter((property) => !['frame', 'count', 'reserve'].includes(property.id))
          .map((property) =>
            property.id === 'note' ? { ...property, label: 'Föreslagen anteckning' } : property,
          ),
        { id: 'frame', label: 'Ramnummer', kind: 'text' as const, value: 'RAM-2026-42' },
        { id: 'count', label: 'Antal', kind: 'number' as const, value: 0 },
        { id: 'reserve', label: 'Reserv', kind: 'boolean' as const, value: false },
      ],
    },
  });
  return app;
}
