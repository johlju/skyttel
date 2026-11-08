import { expect, test } from 'vitest';
import { evaluationEnvironment } from '../../../scripts/model-evaluation/environment.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import type { ObjectValue, RelationshipValue } from '../../../src/shared/map.js';
import { textModel } from '../../support/text-model.js';

function householdScenario(): Scenario {
  return {
    id: 'household-state-defaults',
    title: 'Add a service and its user',
    voice: false,
    fixture: {
      objects: [{ id: 'lo', type: 'Person', name: 'Lo' }],
      relationships: [],
      relationshipTypes: [],
      draft: { objects: {} },
    },
    steps: [
      {
        id: 'add-service',
        text: 'Lägg till Spotify för Lo.',
        expected: {
          objects: { spotify: { type: 'Tjänst', name: 'Spotify' } },
          addRelationships: [{ source: 'lo', type: 'Använder', target: 'spotify' }],
          requirements: [],
        },
      },
    ],
  };
}

async function checkHouseholdFacts(
  scenario: Scenario,
  object: Partial<ObjectValue> = {},
  relationship: Partial<RelationshipValue> = {},
) {
  const model = textModel(() => {
    throw new Error('State verification must not call a provider.');
  });
  const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    const initial = await environment.read();
    await environment.post('map/draft', {
      version: initial.draft.version,
      contentVersion: initial.contentVersion,
      id: 'spotify',
      baseRevision: null,
      value: {
        typeId: initial.types.find((type) => type.name === 'Tjänst')?.id,
        name: 'Spotify',
        ...object,
      },
    });
    const map = await environment.read();
    await environment.post('map/relationship', {
      version: map.draft.version,
      contentVersion: map.contentVersion,
      id: 'lo-uses-spotify',
      baseRevision: null,
      value: {
        typeId: map.relationshipTypes.find((type) => type.name === 'Använder')?.id,
        sourceId: 'lo',
        targetId: 'spotify',
        ...relationship,
      },
    });
    return await environment.check(scenario.steps[0], environment.assistant, []);
  } finally {
    await environment.close();
  }
}

test('state checks accept explicit active status and empty properties for new household facts', {
  tags: ['technical'],
}, async () => {
  expect(
    await checkHouseholdFacts(
      householdScenario(),
      { lifecycle: 'active', properties: [] },
      { lifecycle: 'active', properties: [] },
    ),
  ).toEqual([]);
});

test.each(['strict', 'semantic'])(
  'state checks accept omitted defaults when the expected household explicitly supplies them (%s)',
  { tags: ['technical'] },
  async (mode) => {
    const scenario = householdScenario();
    scenario.steps[0].expected.objects = {
      spotify: { type: 'Tjänst', name: 'Spotify', lifecycle: 'active', properties: [] },
    };
    scenario.steps[0].expected.addRelationships = [
      { source: 'lo', type: 'Använder', target: 'spotify', lifecycle: 'active', properties: [] },
    ];
    if (mode === 'semantic') {
      scenario.steps[0].expected.requirements = ['Only Spotify and its current user are added.'];
      scenario.steps[0].expected.semanticObjects = {
        spotify: { name: true, properties: { preserve: [], additions: [] } },
      };
      scenario.steps[0].expected.semanticRelationships = [
        {
          source: 'lo',
          type: 'Använder',
          target: 'spotify',
          properties: { preserve: [], additions: [] },
        },
      ];
    }
    expect(await checkHouseholdFacts(scenario)).toEqual([]);
  },
);

test.each(['object', 'relationship'] as const)(
  'default normalization still rejects an unrequested ended %s',
  { tags: ['technical'] },
  async (kind) => {
    const changes = { lifecycle: 'ended' } as const;
    expect(
      await checkHouseholdFacts(
        householdScenario(),
        kind === 'object' ? changes : {},
        kind === 'relationship' ? changes : {},
      ),
    ).toContain(kind === 'object' ? 'effective_objects' : 'effective_relationships');
  },
);

test.each(['object', 'relationship'] as const)(
  'default normalization still rejects an unrequested property on a %s',
  { tags: ['technical'] },
  async (kind) => {
    const changes = {
      properties: [{ id: 'invented', label: 'Pris', kind: 'number', value: 99 }],
    } as const;
    expect(
      await checkHouseholdFacts(
        householdScenario(),
        kind === 'object' ? { properties: [...changes.properties] } : {},
        kind === 'relationship' ? { properties: [...changes.properties] } : {},
      ),
    ).toContain(kind === 'object' ? 'effective_objects' : 'effective_relationships');
  },
);

test('an explicit ended expectation does not match omitted active status', {
  tags: ['technical'],
}, async () => {
  const scenario = householdScenario();
  scenario.steps[0].expected.objects = {
    spotify: { type: 'Tjänst', name: 'Spotify', lifecycle: 'ended' },
  };
  scenario.steps[0].expected.addRelationships = [
    { source: 'lo', type: 'Använder', target: 'spotify', lifecycle: 'ended' },
  ];
  expect(await checkHouseholdFacts(scenario)).toEqual([
    'effective_objects',
    'effective_relationships',
  ]);
});

test('relationship removal matches equivalent explicit defaults in the request contract', {
  tags: ['technical'],
}, async () => {
  const scenario = householdScenario();
  if (!scenario.fixture) throw new Error('Missing independent household fixture.');
  scenario.fixture.objects.push({ id: 'spotify', type: 'Tjänst', name: 'Spotify' });
  scenario.fixture.relationships = [{ source: 'lo', type: 'Använder', target: 'spotify' }];
  scenario.steps[0].expected = {
    requirements: [],
    removeRelationships: [
      { source: 'lo', type: 'Använder', target: 'spotify', lifecycle: 'active', properties: [] },
    ],
  };
  const model = textModel(() => {
    throw new Error('State verification must not call a provider.');
  });
  const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    const map = await environment.read();
    const relationship = map.relationships[0];
    await environment.post('map/relationship', {
      version: map.draft.version,
      contentVersion: map.contentVersion,
      id: relationship.id,
      baseRevision: relationship.revision,
      value: null,
    });
    expect(await environment.check(scenario.steps[0], environment.assistant, [])).toEqual([]);
  } finally {
    await environment.close();
  }
});
