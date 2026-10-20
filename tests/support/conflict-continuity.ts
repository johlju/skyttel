import { type APIRequestContext, expect } from '@playwright/test';
import { type ConflictSide, conflictBasis } from '../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../src/shared/draft-conflicts.js';
import { conflictCollaborators } from './conflict-properties.js';

export async function prepareConflictContinuity(
  first: APIRequestContext,
  second: APIRequestContext,
) {
  const app = await conflictCollaborators(first, second);
  const initial = await app.read();
  const value = {
    typeId: initial.types[0].id,
    name: 'Lo Lind',
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Min anteckning' },
    ],
  };
  await app.propose(first, 'draft', 'lo', value);
  await app.propose(second, 'draft', 'lo', {
    ...value,
    name: 'Lo Berg',
    properties: [
      {
        id: 'description',
        label: 'Beskrivning',
        kind: 'text' as const,
        value: 'Robins anteckning',
      },
    ],
  });
  expect((await app.save(second, 'first-conflict')).status()).toBe(200);
  return { ...app, value };
}

export async function prepareConflictTypeContinuity(
  first: APIRequestContext,
  second: APIRequestContext,
) {
  const app = await conflictCollaborators(first, second);
  for (const [id, name] of [
    ['notes', 'Anteckningsobjekt'],
    ['numbers', 'Mätobjekt'],
  ]) {
    expect(
      (
        await app.post(first, 'object-type', {
          version: (await app.read()).draft.version,
          id,
          baseRevision: null,
          value: { name, description: '' },
        })
      ).status(),
    ).toBe(200);
  }
  expect((await app.save(first, 'custom-types')).status()).toBe(200);
  await app.propose(first, 'draft', 'lo', {
    typeId: 'notes',
    name: 'Lo Exempel',
    properties: [
      { id: 'note', label: 'Anteckning', kind: 'text' as const, value: 'Första texten' },
    ],
  });
  expect((await app.save(first, 'typed-object')).status()).toBe(200);
  const value = {
    typeId: 'notes',
    name: 'Lo Lind',
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Min anteckning' },
      { id: 'note', label: 'Anteckning', kind: 'text' as const, value: 'Min text' },
    ],
  };
  await app.propose(first, 'draft', 'lo', value);
  await app.propose(second, 'draft', 'lo', {
    ...value,
    name: 'Lo Berg',
    properties: [
      {
        id: 'description',
        label: 'Beskrivning',
        kind: 'text' as const,
        value: 'Robins anteckning',
      },
      { id: 'note', label: 'Anteckning', kind: 'text' as const, value: 'Robins text' },
    ],
  });
  expect((await app.save(second, 'typed-conflict')).status()).toBe(200);
  return { ...app, value };
}

export async function prepareConflictReferenceContinuity(
  first: APIRequestContext,
  second: APIRequestContext,
) {
  const app = await conflictCollaborators(first, second);
  const initial = await app.read();
  const value = {
    typeId: initial.relationshipTypes[0].id,
    sourceId: 'lo',
    targetId: 'service',
    properties: [
      {
        id: 'certainty',
        label: 'Uppgiftens säkerhet',
        kind: 'text' as const,
        value: 'Osäkert uppgivet',
      },
    ],
  };
  await app.propose(first, 'relationship', 'edge', { ...value, properties: [] });
  expect((await app.save(first, 'initial-edge')).status()).toBe(200);
  await app.propose(first, 'relationship', 'edge', value);
  await app.propose(second, 'relationship', 'edge', {
    ...value,
    targetId: 'lo',
    properties: [
      {
        id: 'certainty',
        label: 'Uppgiftens säkerhet',
        kind: 'text' as const,
        value: 'Uttryckligen inget',
      },
    ],
  });
  expect((await app.save(second, 'edge-conflict')).status()).toBe(200);
  return { ...app, value };
}

export async function saveNewerConflictType(
  app: Awaited<ReturnType<typeof conflictCollaborators>>,
  client: APIRequestContext,
) {
  await app.propose(client, 'draft', 'lo', {
    typeId: 'numbers',
    name: 'Lo Berg',
    properties: [
      {
        id: 'description',
        label: 'Beskrivning',
        kind: 'text' as const,
        value: 'Robins anteckning',
      },
      { id: 'note', label: 'Anteckning', kind: 'number' as const, value: 42 },
    ],
  });
  const state = await app.read(client);
  const type = state.types.find(({ id }) => id === 'notes');
  if (!type) throw new Error('Missing fixture type');
  expect(
    (
      await app.post(client, 'object-type', {
        version: state.draft.version,
        id: type.id,
        baseRevision: type.revision,
        value: { ...type, description: 'Typens aktuella förklaring' },
      })
    ).status(),
  ).toBe(200);
  expect((await app.save(client, 'newer-object-type')).status()).toBe(200);
}

export async function resolveConflictElsewhere(
  app: Awaited<ReturnType<typeof conflictCollaborators>>,
  client: APIRequestContext,
  side: ConflictSide = 'saved',
) {
  const state = await app.read(client);
  const conflict = draftConflicts(state).find(({ kind, id }) => kind === 'object' && id === 'lo');
  if (!conflict) throw new Error('Missing fixture conflict');
  expect(
    (
      await app.post(client, 'resolve', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        conflict,
        basis: conflictBasis(state, conflict),
        choices: { name: side, 'properties.description': side },
      })
    ).status(),
  ).toBe(200);
}

export async function saveConflictElsewhere(
  app: Awaited<ReturnType<typeof conflictCollaborators>>,
  client: APIRequestContext,
) {
  if (
    draftConflicts(await app.read(client)).some(({ kind, id }) => kind === 'object' && id === 'lo')
  )
    await resolveConflictElsewhere(app, client, 'proposed');
  expect((await app.save(client, 'other-client-after-unknown')).status()).toBe(200);
}
