import { expect, test } from 'vitest';
import rawCatalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { evaluationEnvironment } from '../../../scripts/model-evaluation/environment.js';
import type {
  FixtureObject,
  NamedRelationship,
  Scenario,
} from '../../../scripts/model-evaluation/types.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { textModel } from '../../support/text-model.js';

type SubscriptionCase = {
  scenarioId: string;
  subscriptionId: string;
  serviceId: string;
  newSubscription?: FixtureObject;
  otherRelationships: NamedRelationship[];
};

const cases: SubscriptionCase[] = [
  {
    scenarioId: 'everyday-12',
    subscriptionId: 'netflix-sub',
    serviceId: 'netflix',
    otherRelationships: [],
  },
  {
    scenarioId: 'everyday-32',
    subscriptionId: 'new-disney-subscription',
    serviceId: 'disney',
    newSubscription: {
      id: 'new-disney-subscription',
      type: 'Abonnemang',
      name: 'Disney+-abonnemang',
      properties: [
        { id: 'monthly-price', label: 'Månadskostnad (SEK)', kind: 'number', value: 99 },
      ],
    },
    otherRelationships: [{ source: 'sonja', type: 'Betalar', target: 'new-disney-subscription' }],
  },
  {
    scenarioId: 'everyday-46',
    subscriptionId: 'new-broadband-subscription',
    serviceId: 'bahnhof',
    newSubscription: {
      id: 'new-broadband-subscription',
      type: 'Abonnemang',
      name: 'Bredband från Bahnhof',
    },
    otherRelationships: [
      { source: 'new-broadband-subscription', type: 'Hör till', target: 'home' },
    ],
  },
];

async function checkObservedSubscription(
  example: SubscriptionCase,
  relationshipType: string,
  variant = 'valid',
) {
  const scenario = (rawCatalog.scenarios as Scenario[]).find(
    (item) => item.id === example.scenarioId,
  );
  if (!scenario) throw new Error('Missing approved subscription scenario.');
  const model = textModel(() => {
    throw new Error('State verification must never call a provider.');
  });
  const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    if (example.newSubscription) {
      const map = await environment.read();
      const { id, type, ...value } = example.newSubscription;
      if (variant === 'wrong-price' || variant === 'invented-price')
        value.properties = [
          { id: 'monthly-price', label: 'Månadskostnad (SEK)', kind: 'number', value: 199 },
        ];
      await environment.post('map/draft', {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        id,
        baseRevision: null,
        value: { typeId: map.types.find((item) => item.name === type)?.id, ...value },
      });
    }
    const serviceLink = {
      source: example.subscriptionId,
      type: relationshipType,
      target: example.serviceId,
    };
    if (variant === 'reversed') {
      serviceLink.source = example.serviceId;
      serviceLink.target = example.subscriptionId;
    }
    if (variant === 'wrong-target') serviceLink.target = 'unrelated';
    if (variant === 'wrong-type') serviceLink.type = 'Använder';
    const relationships = [
      ...(variant === 'missing-service' ? [] : [serviceLink]),
      ...example.otherRelationships
        .filter(() => variant !== 'missing-required')
        .map((relationship) => ({
          ...relationship,
          ...(variant === 'reversed-required'
            ? { source: relationship.target, target: relationship.source }
            : {}),
          ...(variant === 'wrong-required-target' ? { target: 'unrelated' } : {}),
        })),
      ...(variant === 'both-types' ? [{ ...serviceLink, type: 'Gäller' }] : []),
      ...(variant === 'extra-edge'
        ? [{ source: 'unrelated', type: 'Använder', target: example.serviceId }]
        : []),
    ];
    for (const [index, relationship] of relationships.entries()) {
      const map = await environment.read();
      await environment.post('map/relationship', {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        id: `observed-relationship-${index}`,
        baseRevision: null,
        value: {
          typeId: map.relationshipTypes.find((item) => item.name === relationship.type)?.id,
          sourceId: relationship.source,
          targetId: relationship.target,
        },
      });
    }
    if (variant === 'extra-object' || variant === 'unrelated-change') {
      const map = await environment.read();
      const unrelated = map.objects.find((object) => object.id === 'unrelated');
      await environment.post('map/draft', {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        id: variant === 'extra-object' ? 'extra-person' : 'unrelated',
        baseRevision: variant === 'extra-object' ? null : unrelated?.revision,
        value: {
          typeId: map.types.find((item) => item.name === 'Person')?.id,
          name: 'Obegärd ändring',
        },
      });
    }
    if (variant === 'saved') {
      const map = await environment.read();
      await environment.post('map/save', {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        operationId: 'unrequested-subscription-save',
      });
    }
    const view = await environment.get<TextAssistantView>(environment.path);
    const failures = await environment.check(scenario.steps[0], view, []);
    expect(model.requests).toEqual([]);
    expect(model.authorizationRequests).toEqual([]);
    return failures;
  } finally {
    await environment.close();
  }
}

test.each(
  cases.flatMap((example) =>
    ['Gäller', 'Tillhör tjänsten'].map((relationshipType) => ({ ...example, relationshipType })),
  ),
)(
  '$scenarioId accepts $relationshipType from subscription to service',
  { tags: ['technical'] },
  async ({ relationshipType, ...example }) => {
    expect(await checkObservedSubscription(example, relationshipType)).toEqual([]);
  },
);

test.each(
  cases.flatMap((example) =>
    [
      ['reversed', 'effective_relationships'],
      ['wrong-target', 'effective_relationships'],
      ['wrong-type', 'effective_relationships'],
      ['missing-service', 'effective_relationships'],
      ['both-types', 'effective_relationships'],
      ['extra-edge', 'effective_relationships'],
      ['extra-object', 'effective_objects'],
      ['unrelated-change', 'effective_objects'],
      ['saved', 'saved_map_changed'],
    ].map(([variant, failure]) => ({ ...example, variant, failure })),
  ),
)(
  '$scenarioId rejects a subscription state with $variant',
  { tags: ['technical'] },
  async ({ variant, failure, ...example }) => {
    expect(await checkObservedSubscription(example, 'Tillhör tjänsten', variant)).toContain(
      failure,
    );
  },
);

test.each(
  cases
    .filter((example) => example.otherRelationships.length)
    .flatMap((example) =>
      ['missing-required', 'reversed-required', 'wrong-required-target'].map((variant) => ({
        ...example,
        variant,
      })),
    ),
)(
  '$scenarioId still rejects $variant payer or home relationship',
  { tags: ['technical'] },
  async ({ variant, ...example }) => {
    expect(await checkObservedSubscription(example, 'Tillhör tjänsten', variant)).toContain(
      'effective_relationships',
    );
  },
);

test.each([
  { example: cases[1], variant: 'wrong-price' },
  { example: cases[2], variant: 'invented-price' },
])(
  '$example.scenarioId rejects $variant on the new subscription',
  { tags: ['technical'] },
  async ({ example, variant }) => {
    expect(await checkObservedSubscription(example, 'Tillhör tjänsten', variant)).toContain(
      'effective_objects',
    );
  },
);
