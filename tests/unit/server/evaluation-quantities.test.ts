import { expect, test } from 'vitest';
import rawCatalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { evaluationEnvironment } from '../../../scripts/model-evaluation/environment.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import { textModel } from '../../support/text-model.js';

test('a numeric monthly price on the service preserves the preceding add-and-use dialog', {
  tags: ['technical'],
}, async () => {
  const scenario = (rawCatalog.scenarios as Scenario[]).find((item) => item.id === 'everyday-49');
  if (!scenario) throw new Error('Missing approved add-and-use dialog.');
  const model = textModel(() => {
    throw new Error('State verification must not call a provider.');
  });
  const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    const initial = await environment.read();
    const serviceType = initial.types.find((type) => type.name === 'Tjänst');
    const serviceId = 'new-streaming-service';
    await environment.post('map/draft', {
      version: initial.draft.version,
      contentVersion: initial.contentVersion,
      id: serviceId,
      baseRevision: null,
      value: { typeId: serviceType?.id, name: 'Disney+' },
    });
    expect(await environment.check(scenario.steps[0], environment.assistant, [])).toEqual([]);
    const added = await environment.read();
    await environment.post('map/relationship', {
      version: added.draft.version,
      contentVersion: added.contentVersion,
      id: 'new-service-user',
      baseRevision: null,
      value: {
        typeId: added.relationshipTypes.find((type) => type.name === 'Använder')?.id,
        sourceId: 'sonja',
        targetId: serviceId,
      },
    });
    expect(await environment.check(scenario.steps[1], environment.assistant, [])).toEqual([]);
    const linked = await environment.read();
    await environment.post('map/draft', {
      version: linked.draft.version,
      contentVersion: linked.contentVersion,
      id: serviceId,
      baseRevision: null,
      value: {
        typeId: serviceType?.id,
        name: 'Disney+',
        properties: [
          { id: 'monthly-price', label: 'Månadskostnad (kr)', kind: 'number', value: 99 },
        ],
      },
    });
    expect(await environment.check(scenario.steps[2], environment.assistant, [])).toEqual([]);
  } finally {
    await environment.close();
  }
});

type QuantityCase = {
  name: string;
  type: string;
  amount: number;
  label: string;
  meaning: string;
};

function quantityScenario(quantity: QuantityCase): Scenario {
  const subscription = (rawCatalog.scenarios as Scenario[]).find(
    (item) => item.id === 'everyday-32',
  );
  const approved = subscription?.steps[0].expected.semanticObjects?.['disney-sub'].properties;
  if (!approved) throw new Error('Missing approved bounded price representations.');
  const properties = structuredClone(approved);
  for (const rules of properties.anyOf ?? [])
    for (const rule of rules) if (rule.kinds?.includes('number')) rule.value = quantity.amount;
  properties.meaning = quantity.meaning;
  return {
    id: 'bounded-quantity',
    title: 'Store the requested quantity without unrelated changes',
    voice: false,
    fixture: {
      objects: [
        { id: 'charged-item', type: quantity.type, name: quantity.name },
        {
          id: 'unrelated-person',
          type: 'Person',
          name: 'Ebba',
          properties: [{ id: 'note', label: 'Beskrivning', kind: 'text', value: 'Behåll.' }],
        },
      ],
      relationships: [],
      relationshipTypes: [],
      draft: { objects: {} },
    },
    steps: [
      {
        id: 'quantity',
        text: quantity.meaning,
        expected: {
          semanticObjects: { 'charged-item': { properties } },
          requirements: [quantity.meaning, 'Alla andra fakta bevaras och inget sparas.'],
        },
      },
    ],
  };
}

async function checkQuantity(quantity: QuantityCase, mutation?: string) {
  const scenario = quantityScenario(quantity);
  const model = textModel(() => {
    throw new Error('State verification must not call a provider.');
  });
  const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    const map = await environment.read();
    const target = map.objects.find((item) => item.id === 'charged-item');
    if (!target) throw new Error('Missing independent quantity target.');
    await environment.post('map/draft', {
      version: map.draft.version,
      contentVersion: map.contentVersion,
      id: target.id,
      baseRevision: target.revision,
      value: {
        typeId: target.typeId,
        name: target.name,
        properties: [
          {
            id: 'amount',
            label: quantity.label,
            kind: 'number',
            value: mutation === 'wrong-amount' ? quantity.amount + 1 : quantity.amount,
          },
          ...(mutation === 'extra-property'
            ? [{ id: 'extra', label: 'Obegärt tal', kind: 'number', value: quantity.amount }]
            : []),
        ],
      },
    });
    if (mutation === 'unrelated-change') {
      const latest = await environment.read();
      const unrelated = latest.objects.find((item) => item.id === 'unrelated-person');
      if (!unrelated) throw new Error('Missing independent unchanged fact.');
      await environment.post('map/draft', {
        version: latest.draft.version,
        contentVersion: latest.contentVersion,
        id: unrelated.id,
        baseRevision: unrelated.revision,
        value: { typeId: unrelated.typeId, name: 'Annat namn' },
      });
    }
    if (mutation === 'saved') {
      const latest = await environment.read();
      await environment.post('map/save', {
        version: latest.draft.version,
        contentVersion: latest.contentVersion,
        operationId: 'unrequested-quantity-save',
      });
    }
    const failures = await environment.check(scenario.steps[0], environment.assistant, []);
    const context = JSON.parse(environment.judgeContext(scenario.steps[0], failures));
    return { failures, context };
  } finally {
    await environment.close();
  }
}

test.each<QuantityCase>([
  {
    name: 'Simhallen',
    type: 'Abonnemang',
    amount: 24.5,
    label: 'Årsavgift (EUR)',
    meaning: 'Simhallen kostar 24,50 EUR per år.',
  },
  {
    name: 'Parkeringen',
    type: 'Tjänst',
    amount: 195,
    label: 'Pris per kvartal i SEK',
    meaning: 'Parkeringen kostar 195 SEK per kvartal.',
  },
  {
    name: 'Tidningen',
    type: 'Abonnemang',
    amount: 1.25,
    label: 'USD per dag',
    meaning: 'Tidningen kostar 1,25 USD per dag.',
  },
  {
    name: 'Föreningsportalen',
    type: 'Tjänst',
    amount: 0,
    label: 'Månadsavgift (SEK)',
    meaning: 'Föreningsportalen kostar 0 SEK per månad.',
  },
])(
  'bounded numeric quantities retain full labels and independent meaning for $name',
  { tags: ['technical'] },
  async (quantity) => {
    const { failures, context } = await checkQuantity(quantity);
    expect(failures).toEqual([]);
    expect(context.observedState.effective.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'charged-item',
          properties: [{ label: quantity.label, kind: 'number', value: quantity.amount }],
        }),
      ]),
    );
    expect(context.observedState.expected.semanticObjects['charged-item'].properties.meaning).toBe(
      quantity.meaning,
    );
  },
);

test.each(['wrong-amount', 'extra-property', 'unrelated-change', 'saved'])(
  'bounded numeric quantities still reject %s',
  { tags: ['technical'] },
  async (mutation) => {
    const { failures } = await checkQuantity(
      {
        name: 'Parkeringen',
        type: 'Tjänst',
        amount: 195,
        label: 'Pris per kvartal (SEK)',
        meaning: 'Parkeringen kostar 195 SEK per kvartal.',
      },
      mutation,
    );
    expect(failures.length).toBeGreaterThan(0);
  },
);
