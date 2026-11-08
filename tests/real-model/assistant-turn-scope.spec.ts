import { expect, test } from '@playwright/test';
import { compareTurnActions, interpretTurnScope } from '../../src/server/assistant-turn-scope.js';
import { textModel } from '../../src/server/text-assistant-model.js';
import { realModelKey } from '../support/model-mcp.js';

// Synthetic household data only. Run solely with explicit billable-call authorization.
const current =
  'Addera Driftmolnet och Vindmolnet som objekttyp "plattform som tjänst.", sen skapa en webbtjänst Testportalen som använder Driftmolnet';
const operations = [
  {
    name: 'propose_object_type',
    arguments: {
      id: 'platform',
      baseRevision: null,
      value: { name: 'Plattform som tjänst', description: '' },
    },
  },
  {
    name: 'propose_object_type',
    arguments: {
      id: 'service',
      baseRevision: null,
      value: { name: 'Webbtjänst', description: '' },
    },
  },
  {
    name: 'propose_object',
    arguments: {
      id: 'cloud',
      baseRevision: null,
      value: { typeId: 'platform', name: 'Driftmolnet' },
    },
  },
  {
    name: 'propose_object',
    arguments: {
      id: 'other-cloud',
      baseRevision: null,
      value: { typeId: 'platform', name: 'Vindmolnet' },
    },
  },
  {
    name: 'propose_object',
    arguments: {
      id: 'portal',
      baseRevision: null,
      value: { typeId: 'service', name: 'Testportalen' },
    },
  },
  {
    name: 'propose_relationship',
    arguments: {
      id: 'uses',
      baseRevision: null,
      value: { sourceId: 'portal', targetId: 'cloud', verb: 'använder' },
    },
  },
];
const data = {
  map: { objects: [], relationships: [], types: [], relationshipTypes: [] },
  draft: {
    version: 0,
    contentVersion: 1,
    changes: [],
    relationships: [],
    objectTypes: [],
    relationshipTypes: [],
  },
};

test('ordinary category naming permits capitalization and an incidental period with all dependent creations', async () => {
  const respond = textModel(realModelKey());
  const signal = new AbortController().signal;
  const scope = await interpretTurnScope(respond, current, [], signal);
  expect(scope.mode).toBe('work');
  expect(
    await compareTurnActions(respond, { current, scope }, operations, data, signal),
  ).toMatchObject({
    decision: 'allow',
    complete: true,
    fulfillsRequest: true,
  });
});

test('explicit exact type spelling asks for clarification when the proposed label loses its period', async () => {
  const request =
    'Skapa ett objekt Driftmolnet av en ny typ. Typens namn ska vara exakt "plattform som tjänst.", inklusive liten begynnelsebokstav och slutpunkt.';
  const decision = await compareTurnActions(
    textModel(realModelKey()),
    {
      current: request,
      scope: { mode: 'work', request, responseRequired: false },
    },
    [operations[0], operations[2]],
    data,
    new AbortController().signal,
  );
  expect(decision.decision).toBe('clarify');
});

test('ordinary type naming does not authorize an unrelated category or saving', async () => {
  const respond = textModel(realModelKey());
  const authority = {
    current,
    scope: { mode: 'work' as const, request: current, responseRequired: false },
  };
  for (const extra of [
    {
      name: 'propose_object_type',
      arguments: {
        id: 'unrelated',
        baseRevision: null,
        value: { name: 'Bankkonto', description: '' },
      },
    },
    { name: 'save_draft', arguments: {} },
  ]) {
    expect(
      await compareTurnActions(
        respond,
        authority,
        [...operations, extra],
        data,
        new AbortController().signal,
      ),
    ).toMatchObject({
      decision: 'deny',
      operation: operations.length,
    });
  }
});
