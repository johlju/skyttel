import { expect, test } from 'vitest';
import { draftResult, historyResult } from '../../../src/server/text-assistant-results.js';
import type {
  MapObject,
  MapRelationship,
  ObjectType,
  RelationshipType,
  SaveReceipt,
} from '../../../src/shared/map.js';

const cardType: ObjectType = {
  id: 'card',
  householdId: 'household',
  revision: 1,
  name: 'Kort',
  description: '',
  fields: [
    { id: 'last-digits', name: 'Sista siffror', description: '', kind: 'text' },
    { id: 'active', name: 'Aktivt', description: '', kind: 'boolean' },
    { id: 'limit', name: 'Köpgräns', description: '', kind: 'number' },
  ],
};
const usageType: RelationshipType = {
  id: 'usage',
  householdId: 'household',
  revision: 1,
  name: 'Användning',
  description: '',
  forwardLabel: 'används av',
};

function card(value: Partial<MapObject> = {}): MapObject {
  return {
    id: 'household-card',
    householdId: 'household',
    revision: 1,
    typeId: 'card',
    name: 'Hushållskortet',
    description: '',
    ...value,
  };
}

function usage(value: Partial<MapRelationship> = {}): MapRelationship {
  return {
    id: 'subscription-user',
    householdId: 'household',
    revision: 1,
    typeId: 'usage',
    sourceId: 'subscription',
    targetId: 'alex',
    knowledge: 'known',
    ...value,
  };
}

function receipt(value: Partial<SaveReceipt> = {}): SaveReceipt {
  return {
    operationId: 'save-card',
    householdId: 'household',
    userId: 'user',
    savedAt: '2026-09-24T12:00:00.000Z',
    contentVersion: 2,
    draftVersion: 3,
    changes: [],
    ...value,
  };
}

test('draft details report corrected card values, knowledge and dates without claiming a save', () => {
  const before = card({
    name: 'Gamla kortnamnet',
    description: 'Extrkort',
    financialFacts: {
      price: { knowledge: 'known', value: '119' },
      currency: { knowledge: 'known', value: 'SEK' },
      debt: { knowledge: 'known', value: '2500', reportedOn: '2026-08-01' },
    },
    customValues: { 'last-digits': '1234', active: true, limit: 100 },
  });
  const after = card({
    financialFacts: {
      price: { knowledge: 'known', value: '129' },
      currency: { knowledge: 'known', value: 'SEK' },
      debt: { knowledge: 'uncertain', value: '2400', reportedOn: '2026-09-01' },
    },
    customValues: { 'last-digits': '9876', active: false, limit: 0 },
  });

  const result = draftResult({
    version: 3,
    changes: [{ id: before.id, type: cardType, before, after }],
  });

  expect(result.kind).toBe('draft');
  expect(result.message).toContain('namn: Gamla kortnamnet → Hushållskortet');
  expect(result.message).toContain('beskrivning: Extrkort → tom');
  expect(result.message).toContain('Pris: 119 → 129');
  expect(result.message).toContain(
    'Senast uppgiven skuld: 2500 (2026-08-01) → osäkert uppgivet: 2400 (2026-09-01)',
  );
  expect(result.message).toContain('Sista siffror: 1234 → 9876');
  expect(result.message).toContain('Aktivt: ja → nej');
  expect(result.message).toContain('Köpgräns: 100 → 0');
  expect(result.message).not.toMatch(/Valuta|[Ss]parat/);
});

test('a corrected relationship names both people and preserves uncertainty', () => {
  const before = usage();
  const result = draftResult({
    version: 4,
    changes: [],
    relationships: [
      {
        id: before.id,
        before,
        after: usage({ targetId: 'lo', knowledge: 'uncertain' }),
        type: usageType,
        objectNames: { subscription: 'Musikabonnemanget', alex: 'Alex', lo: 'Lo' },
      },
    ],
  });

  expect(result).toEqual({
    kind: 'draft',
    message:
      'Utkast: Ändra sambandet Musikabonnemanget används av Alex → Musikabonnemanget används av Lo (osäkert uppgivet).',
  });
});

test('a corrected object type retains the historical names of removed custom fields', () => {
  const before = card({ customValues: { 'last-digits': '1234' } });
  const bankType: ObjectType = { ...cardType, id: 'bank', name: 'Bankkonto', fields: [] };
  const result = draftResult({
    version: 4,
    changes: [
      {
        id: before.id,
        before,
        after: card({ typeId: 'bank' }),
        type: bankType,
        beforeType: cardType,
      },
    ],
  });

  expect(result.message).toContain('objekttyp: Kort → Bankkonto');
  expect(result.message).toContain('Sista siffror: 1234 → ej angivet');
});

test('history details distinguish missing facts, unknown facts and explicitly no value', () => {
  const before = card({
    financialFacts: {
      price: { knowledge: 'known', value: '0' },
      currency: { knowledge: 'known', value: 'SEK' },
      debt: { knowledge: 'unknown', reportedOn: '2026-08-01' },
      creditLimit: { knowledge: 'known', value: '20000' },
    },
  });
  const after = card({
    revision: 2,
    description: 'Reserverat för hushållet',
    financialFacts: {
      price: { knowledge: 'none' },
      currency: { knowledge: 'unknown' },
      paymentInterval: { knowledge: 'known', value: 'månadsvis' },
      startDate: { knowledge: 'known', value: '2026-09-01' },
      endDate: { knowledge: 'unknown' },
      terms: { knowledge: 'uncertain', value: 'Räntefritt första månaden' },
      debt: { knowledge: 'none', reportedOn: '2026-09-01' },
      usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-01' },
    },
    customValues: { 'last-digits': '5678' },
  });

  const result = historyResult(receipt({ changes: [{ type: cardType, before, after }] }));

  expect(result.kind).toBe('history');
  expect(result.message).toContain('Sparandet: Ändrade Hushållskortet');
  expect(result.message).toContain('beskrivning: tom → Reserverat för hushållet');
  expect(result.message).toContain('Pris: 0 → uttryckligen inget');
  expect(result.message).toContain('Valuta: SEK → okänt');
  expect(result.message).toContain('Betalningsintervall: ej angivet → månadsvis');
  expect(result.message).toContain('Startdatum: ej angivet → 2026-09-01');
  expect(result.message).toContain('Slutdatum: ej angivet → okänt');
  expect(result.message).toContain(
    'Avtalsvillkor: ej angivet → osäkert uppgivet: Räntefritt första månaden',
  );
  expect(result.message).toContain(
    'Senast uppgiven skuld: okänt (2026-08-01) → uttryckligen inget (2026-09-01)',
  );
  expect(result.message).toContain('Beviljat kreditutrymme: 20000 → ej angivet');
  expect(result.message).toContain('Utnyttjad kredit: ej angivet → 0 (2026-09-01)');
  expect(result.message).toContain('Sista siffror: ej angivet → 5678');
});

test('draft details include object, relationship and type additions and removals', () => {
  const removedCard = card({ id: 'old-card', name: 'Gamla kortet' });
  const removedType = { ...cardType, id: 'old-type', name: 'Gammal korttyp' };
  const removedRelationshipType = { ...usageType, id: 'old-usage', name: 'Tidigare användning' };
  const result = draftResult({
    version: 8,
    changes: [
      { id: 'new-card', type: cardType, before: null, after: card() },
      { id: removedCard.id, type: cardType, before: removedCard, after: null },
    ],
    relationships: [
      {
        id: 'new-usage',
        before: null,
        after: usage({ targetId: null, knowledge: 'unknown' }),
        type: usageType,
        objectNames: { subscription: 'Musikabonnemanget' },
      },
      {
        id: 'old-usage',
        before: usage({ targetId: null, knowledge: 'none' }),
        after: null,
        type: usageType,
        objectNames: { subscription: 'Filmabonnemanget' },
      },
    ],
    objectTypes: [
      { id: cardType.id, before: null, after: cardType },
      { id: removedType.id, before: removedType, after: null },
    ],
    relationshipTypes: [
      { id: usageType.id, before: null, after: usageType },
      { id: removedRelationshipType.id, before: removedRelationshipType, after: null },
    ],
  });

  expect(result.message).toContain('Lägg till Hushållskortet');
  expect(result.message).toContain('Ta bort Gamla kortet');
  expect(result.message).toContain('Lägg till sambandet Musikabonnemanget används av okänt');
  expect(result.message).toContain(
    'Ta bort sambandet Filmabonnemanget används av uttryckligen ingen',
  );
  expect(result.message).toContain('Lägg till objekttypen Kort');
  expect(result.message).toContain('Ta bort objekttypen Gammal korttyp');
  expect(result.message).toContain('Lägg till sambandstypen Användning');
  expect(result.message).toContain('Ta bort sambandstypen Tidigare användning');
});

test('history reports saved additions, removals and relationship corrections in the past tense', () => {
  const result = historyResult(
    receipt({
      changes: [
        { type: cardType, before: null, after: card() },
        { type: cardType, before: card({ name: 'Gamla kortet' }), after: null },
      ],
      relationships: [
        {
          id: 'subscription-user',
          before: usage({ targetId: null, knowledge: 'unknown' }),
          after: usage({ targetId: null, knowledge: 'none', revision: 2 }),
          type: usageType,
          objectNames: { subscription: 'Musikabonnemanget' },
        },
        {
          id: 'second-user',
          before: null,
          after: usage({ id: 'second-user', targetId: 'lo', knowledge: 'uncertain' }),
          type: usageType,
          objectNames: { subscription: 'Filmabonnemanget', lo: 'Lo' },
        },
      ],
      objectTypes: [
        {
          id: cardType.id,
          before: cardType,
          after: { ...cardType, name: 'Betalkort', revision: 2 },
        },
      ],
      relationshipTypes: [
        {
          id: usageType.id,
          before: usageType,
          after: { ...usageType, name: 'Använder', revision: 2 },
        },
      ],
    }),
  );

  expect(result.kind).toBe('history');
  expect(result.message).toContain('Lade till Hushållskortet');
  expect(result.message).toContain('Tog bort Gamla kortet');
  expect(result.message).toContain(
    'Ändrade sambandet Musikabonnemanget används av okänt → Musikabonnemanget används av uttryckligen ingen',
  );
  expect(result.message).toContain(
    'Lade till sambandet Filmabonnemanget används av Lo (osäkert uppgivet)',
  );
  expect(result.message).toContain('Ändrade objekttypen Betalkort');
  expect(result.message).toContain('Ändrade sambandstypen Använder');
  expect(result.message).not.toMatch(/Utkast|Lägg till|Ta bort|Ångrat/);
});

test('an empty draft and absent history are explicit rather than implied changes', () => {
  expect(draftResult({ version: 0, changes: [] })).toEqual({
    kind: 'draft',
    message: 'Utkastet är tomt.',
  });
  expect(historyResult(undefined)).toEqual({
    kind: 'history',
    message: 'Det finns inget tidigare sparande i hushållets historik.',
  });
});

test('requested details include the financial and custom values entered with a new object', () => {
  const after = card({
    financialFacts: {
      price: { knowledge: 'known', value: '129' },
      currency: { knowledge: 'known', value: 'SEK' },
      paymentInterval: { knowledge: 'known', value: 'månadsvis' },
    },
    customValues: { 'last-digits': '9876' },
  });
  const changes = [{ id: after.id, type: cardType, before: null, after }];
  const draft = draftResult({ version: 1, changes });
  const history = historyResult(receipt({ changes }));

  for (const result of [draft, history]) {
    expect(result.message).toContain('Pris: ej angivet → 129');
    expect(result.message).toContain('Valuta: ej angivet → SEK');
    expect(result.message).toContain('Betalningsintervall: ej angivet → månadsvis');
    expect(result.message).toContain('Sista siffror: ej angivet → 9876');
  }
});

test('relationship details report corrected status and end date when the people are unchanged', () => {
  const before = usage({
    lifecycle: 'active',
    endDate: { knowledge: 'known', value: '2026-12-31' },
  });
  const after = usage({
    lifecycle: 'ended',
    endDate: { knowledge: 'uncertain', value: '2026-09-20' },
    revision: 2,
  });
  const relationships = [
    {
      id: before.id,
      type: usageType,
      before,
      after,
      objectNames: { subscription: 'Musikabonnemanget', alex: 'Alex' },
    },
  ];
  const draft = draftResult({ version: 2, changes: [], relationships });
  const history = historyResult(receipt({ relationships }));

  for (const result of [draft, history]) {
    expect(result.message).toContain('sambandet Musikabonnemanget används av Alex');
    expect(result.message).toContain('Gäller: aktuellt → upphört');
    expect(result.message).toContain('Slutdatum: 2026-12-31 → osäkert uppgivet: 2026-09-20');
    expect(result.message).not.toContain('Alex → Musikabonnemanget används av Alex');
    expect(result.message).not.toContain('bort');
  }
});

test.each([
  [{ lifecycle: 'active' }, { lifecycle: 'ended' }, 'Gäller: aktuellt → upphört'],
  [
    { identity: 'unspecified' },
    { identity: 'unresolved' },
    'Identitet: ospecificerat objekt → olöst identitet',
  ],
  [{ identity: 'unresolved' }, {}, 'Identitet: olöst identitet → identifierat'],
  [{}, { profileImageId: 'private-new-image' }, 'Profilbild: ingen bild → ny bild'],
  [
    { profileImageId: 'private-old-image' },
    { profileImageId: 'private-new-image' },
    'Profilbild: bild finns → ny bild',
  ],
  [{ profileImageId: 'private-old-image' }, {}, 'Profilbild: bild finns → ingen bild'],
] satisfies [Partial<MapObject>, Partial<MapObject>, string][])(
  'requested details describe a single object correction: %s → %s',
  (oldValues, newValues, expected) => {
    const before = card(oldValues);
    const after = card(newValues);
    const changes = [{ id: before.id, type: cardType, before, after }];

    for (const result of [
      draftResult({ version: 1, changes }),
      historyResult(receipt({ changes })),
    ]) {
      expect(result.message).toContain(expected);
      expect(result.message).not.toMatch(/private-|profileImageId|https?:|data:|bort/);
    }
  },
);

test.each(['addition', 'removal'])(
  'requested object %s details include its type, description, identity, status and image presence',
  (operation) => {
    const object = card({
      description: 'Bara för matinköp',
      identity: 'unspecified',
      lifecycle: 'ended',
      profileImageId: 'private-card-image',
    });
    const changes = [
      {
        id: object.id,
        type: cardType,
        before: operation === 'removal' ? object : null,
        after: operation === 'addition' ? object : null,
      },
    ];

    for (const result of [
      draftResult({ version: 1, changes }),
      historyResult(receipt({ changes })),
    ]) {
      expect(result.message).toContain(
        operation === 'addition' ? 'objekttyp: ej angivet → Kort' : 'objekttyp: Kort → ej angivet',
      );
      expect(result.message).toContain(
        operation === 'addition'
          ? 'beskrivning: ej angivet → Bara för matinköp'
          : 'beskrivning: Bara för matinköp → ej angivet',
      );
      expect(result.message).toContain('ospecificerat objekt');
      expect(result.message).toContain('upphört');
      expect(result.message).toContain(
        operation === 'addition'
          ? 'Profilbild: ingen bild → ny bild'
          : 'Profilbild: bild finns → ingen bild',
      );
      expect(result.message).not.toContain('private-card-image');
    }
  },
);

test('requested type corrections include each definition before and after, including removed fields and direction labels', () => {
  const beforeType: ObjectType = {
    ...cardType,
    description: 'Kort för hushållet',
    fields: [
      { id: 'digits', name: 'Siffror', description: 'De fyra sista', kind: 'number' },
      { id: 'old-field', name: 'Giltigt', description: '', kind: 'boolean' },
      { id: 'note', name: 'Anteckning', description: '', kind: 'text' },
    ],
  };
  const afterType: ObjectType = {
    ...beforeType,
    name: 'Betalkort',
    description: '',
    fields: [
      { id: 'digits', name: 'Sista siffror', description: 'Även inledande nollor', kind: 'text' },
      { id: 'new-field', name: 'Giltigt till', description: 'Sista giltighetsdagen', kind: 'date' },
      { id: 'note', name: 'Anteckning', description: '', kind: 'text' },
    ],
  };
  const objectTypes = [{ id: cardType.id, before: beforeType, after: afterType }];
  const relationshipTypes = [
    {
      id: usageType.id,
      before: { ...usageType, description: 'Vem som använder', reverseLabel: 'använder' },
      after: {
        ...usageType,
        name: 'Ägande',
        description: 'Vem som äger',
        forwardLabel: 'ägs av',
        reverseLabel: 'äger',
      },
    },
  ];

  for (const result of [
    draftResult({ version: 1, changes: [], objectTypes, relationshipTypes }),
    historyResult(receipt({ objectTypes, relationshipTypes })),
  ]) {
    expect(result.message).toContain('namn: Kort → Betalkort');
    expect(result.message).toContain('beskrivning: Kort för hushållet → tom');
    expect(result.message).toContain(
      'Eget fält: Siffror (tal): De fyra sista → Sista siffror (text): Även inledande nollor',
    );
    expect(result.message).toContain('Eget fält: Giltigt (ja/nej): ingen beskrivning → ej angivet');
    expect(result.message).toContain(
      'Eget fält: ej angivet → Giltigt till (datum): Sista giltighetsdagen',
    );
    expect(result.message).toContain('namn: Användning → Ägande');
    expect(result.message).toContain('beskrivning: Vem som använder → Vem som äger');
    expect(result.message).toContain('Framåtriktning: används av → ägs av');
    expect(result.message).toContain('Omvänd riktning: använder → äger');
    expect(result.message).not.toMatch(/Anteckning|old-field|new-field|digits/);
  }
});

test.each(['addition', 'removal'])(
  'requested type %s details include their full definitions',
  (operation) => {
    const objectType = { ...cardType, description: 'Betalningsmedel med kortnummer' };
    const relationshipType = {
      ...usageType,
      description: 'Kopplar användare till tjänst',
      reverseLabel: 'använder',
    };
    const objectTypes = [
      {
        id: objectType.id,
        before: operation === 'removal' ? objectType : null,
        after: operation === 'addition' ? objectType : null,
      },
    ];
    const relationshipTypes = [
      {
        id: relationshipType.id,
        before: operation === 'removal' ? relationshipType : null,
        after: operation === 'addition' ? relationshipType : null,
      },
    ];

    for (const result of [
      draftResult({ version: 1, changes: [], objectTypes, relationshipTypes }),
      historyResult(receipt({ objectTypes, relationshipTypes })),
    ]) {
      expect(result.message).toContain(
        operation === 'addition'
          ? 'beskrivning: ej angivet → Betalningsmedel med kortnummer'
          : 'beskrivning: Betalningsmedel med kortnummer → ej angivet',
      );
      expect(result.message).toContain('Sista siffror (text): ingen beskrivning');
      expect(result.message).toContain('Aktivt (ja/nej): ingen beskrivning');
      expect(result.message).toContain('Köpgräns (tal): ingen beskrivning');
      expect(result.message).toContain('Kopplar användare till tjänst');
      expect(result.message).toContain(
        operation === 'addition'
          ? 'Framåtriktning: ej angivet → används av'
          : 'Framåtriktning: används av → ej angivet',
      );
      expect(result.message).toContain(
        operation === 'addition'
          ? 'Omvänd riktning: ej angivet → använder'
          : 'Omvänd riktning: använder → ej angivet',
      );
    }
  },
);

test('relationship details retain old labels and distinguish an unresolved identity from an unknown target', () => {
  const before = usage({ targetId: null, knowledge: 'unknown' });
  const after = usage({ targetId: null, knowledge: 'unresolved' });
  const type = { ...usageType, revision: 2, forwardLabel: 'nyttjar', reverseLabel: 'nyttjas av' };
  const relationships = [
    {
      id: before.id,
      before,
      after,
      type,
      objectNames: { subscription: 'Musikabonnemanget' },
    },
  ];
  const draft = draftResult({
    version: 1,
    changes: [],
    relationships,
    relationshipTypes: [{ id: type.id, before: usageType, after: type }],
  });
  const history = historyResult(
    receipt({
      relationships: [{ ...relationships[0], beforeType: usageType }],
    }),
  );

  for (const result of [draft, history])
    expect(result.message).toContain(
      'Musikabonnemanget används av okänt → Musikabonnemanget nyttjar olöst identitet',
    );
});

test('relationship type changes remain visible when both types use the same direction label', () => {
  const beforeType = { ...usageType, forwardLabel: 'har' };
  const type = { ...beforeType, id: 'ownership', name: 'Ägande' };
  const result = historyResult(
    receipt({
      relationships: [
        {
          id: 'usage',
          before: usage(),
          after: usage({ typeId: type.id }),
          type,
          beforeType,
          objectNames: { subscription: 'Musikabonnemanget', alex: 'Alex' },
        },
      ],
    }),
  );

  expect(result.message).toContain('sambandstyp: Användning → Ägande');
});

test('a relationship uses each endpoint name from the same side of an object rename', () => {
  const before = card({ id: 'subscription', name: 'Gamla abonnemanget' });
  const after = card({ id: 'subscription', name: 'Nya abonnemanget' });
  const result = historyResult(
    receipt({
      changes: [{ type: cardType, before, after }],
      relationships: [
        {
          id: 'usage',
          before: usage(),
          after: usage({ knowledge: 'uncertain' }),
          type: usageType,
          objectNames: { subscription: 'Nya abonnemanget', alex: 'Alex' },
        },
      ],
    }),
  );

  expect(result.message).toContain(
    'Gamla abonnemanget används av Alex → Nya abonnemanget används av Alex (osäkert uppgivet)',
  );
});

test('missing historical definitions stay unknown instead of borrowing the new type name', () => {
  const afterType = { ...cardType, id: 'bank', name: 'Bankkonto' };
  const result = historyResult(
    receipt({
      changes: [{ before: card(), after: card({ typeId: afterType.id }), type: afterType }],
      relationships: [
        {
          id: 'usage',
          before: usage(),
          after: usage({ typeId: 'ownership' }),
          type: { ...usageType, id: 'ownership', name: 'Ägande', forwardLabel: 'ägs av' },
          objectNames: { subscription: 'Musikabonnemanget', alex: 'Alex' },
        },
      ],
    }),
  );

  expect(result.message).toContain('objekttyp: okänd objekttyp → Bankkonto');
  expect(result.message).toContain(
    'Musikabonnemanget okänd sambandstyp Alex → Musikabonnemanget ägs av Alex',
  );
  expect(result.message).toContain('sambandstyp: okänd sambandstyp → Ägande');
});

test('requested type details report a change to the order of existing custom fields', () => {
  const objectTypes = [
    {
      id: cardType.id,
      before: cardType,
      after: { ...cardType, fields: [...(cardType.fields ?? [])].reverse() },
    },
  ];

  for (const result of [
    draftResult({ version: 1, changes: [], objectTypes }),
    historyResult(receipt({ objectTypes })),
  ]) {
    expect(result.message).toContain(
      'Fältordning: Sista siffror, Aktivt, Köpgräns → Köpgräns, Aktivt, Sista siffror',
    );
    expect(result.message).not.toContain('Eget fält:');
  }
});
