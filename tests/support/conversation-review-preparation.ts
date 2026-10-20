import type { MapState } from '../../src/shared/map.js';

/** Prepare review-only fictional data through the public household HTTP routes. */
export async function prepareConversationReview({
  read,
  post,
}: {
  read: () => Promise<MapState>;
  post: (route: string, data: object) => Promise<void>;
}) {
  const existing = await read();
  if (
    existing.objects.length ||
    existing.relationships.length ||
    existing.draft.relationships?.length ||
    existing.draft.objectTypes?.length ||
    existing.draft.relationshipTypes?.length ||
    (existing.draft.changes ?? []).some(
      (change) =>
        change.id !== 'lo' ||
        change.before !== null ||
        change.after?.name !== 'Lo Exempel' ||
        Boolean(change.after?.properties?.length) ||
        change.after?.typeId !== existing.types[0].id,
    )
  )
    throw new Error('Use an empty installation or only the fictional Lo proposal');
  if (!(existing.draft.changes ?? []).some((change) => change.id === 'lo'))
    await post('draft', {
      id: 'lo',
      baseRevision: null,
      value: { typeId: existing.types[0].id, name: 'Lo Exempel' },
    });
  await post('draft', {
    id: 'kim',
    baseRevision: null,
    value: { typeId: (await read()).types[0].id, name: 'Kim' },
  });
  const initial = await read();
  await post('object-type', {
    id: 'card-type',
    baseRevision: null,
    value: { name: 'Provkort', description: '' },
  });
  const card = {
    typeId: 'card-type',
    name: 'Kortet',
    properties: [{ id: 'last-four', label: 'Sista fyra', kind: 'text' as const, value: '1111' }],
  };
  await post('draft', { id: 'card', baseRevision: null, value: card });
  const accountName = 'Familjens gemensamma musikkonto hos Molnmusik';
  for (const [id, type, name] of [
    ['account', 'Tjänstekonto', accountName],
    ['email', 'E-postadress', 'familjen@example.test'],
    ['new-email', 'E-postadress', 'musik@example.test'],
  ]) {
    await post('draft', {
      id,
      baseRevision: null,
      value: { typeId: initial.types.find((entry) => entry.name === type)?.id, name },
    });
  }
  const login = {
    typeId: initial.relationshipTypes.find((entry) => entry.name === 'Inloggningsadress')?.id,
    sourceId: 'account',
    targetId: 'email',
  };
  await post('relationship', { id: 'login', baseRevision: null, value: login });
  await post('save', { operationId: 'draft-initial' });
  const state = await read();
  await post('draft', {
    id: 'lo',
    baseRevision: 1,
    value: { typeId: state.types[0].id, name: 'Lo Rättad' },
  });
  await post('draft', { id: 'kim', baseRevision: 1, value: null });
  await post('relationship', {
    id: 'login',
    baseRevision: 1,
    value: { ...login, targetId: 'new-email' },
  });
  await post('object-type', {
    id: 'custom',
    baseRevision: null,
    value: { name: 'Provtyp', description: '' },
  });
  await post('draft', {
    id: 'new',
    baseRevision: null,
    value: { typeId: 'custom', name: 'Nytt objekt' },
  });
  await post('draft', {
    id: 'card',
    baseRevision: 1,
    value: {
      ...card,
      properties: [{ id: 'last-four', label: 'Sista fyra', kind: 'text' as const, value: '2222' }],
    },
  });
  await post('relationship', {
    id: 'payment',
    baseRevision: null,
    value: {
      typeId: initial.relationshipTypes.find((entry) => entry.name === 'Betalar')?.id,
      sourceId: 'lo',
      targetId: 'card',
    },
  });
  await post('relationship-type', {
    id: 'storage-link',
    baseRevision: null,
    value: {
      name: 'Förvaras',
      description: '',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
    },
  });
}
