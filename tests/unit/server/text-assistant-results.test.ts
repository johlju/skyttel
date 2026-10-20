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

test('draft and history details report complete typed properties and explicit status', () => {
  const before = card({
    properties: [
      { id: 'price', label: 'Pris', kind: 'number', value: 129 },
      { id: 'flag', label: 'Aktivt', kind: 'boolean', value: false },
    ],
  });
  const after = card({
    name: 'Nytt kort',
    lifecycle: 'ended',
    properties: [
      { id: 'price', label: 'Pris', kind: 'number', value: 0 },
      { id: 'flag', label: 'Aktivt', kind: 'boolean' },
      { id: 'date', label: 'Slutdatum', kind: 'date', value: '2024-02-29' },
      { id: 'unknown', label: 'Anteckning' },
    ],
  });
  for (const result of [
    draftResult({ version: 1, changes: [{ id: after.id, type: cardType, before, after }] }),
    historyResult(receipt({ changes: [{ type: cardType, before, after }] })),
  ]) {
    expect(result.message).toContain('Pris: 129 (Tal) → Pris: 0 (Tal)');
    expect(result.message).toContain('Aktivt: Nej (Ja/nej) → Aktivt: Tomt (Ja/nej)');
    expect(result.message).toContain('Slutdatum: 2024-02-29 (Datum)');
    expect(result.message).toContain('Anteckning: Tomt (ingen datatyp)');
    expect(result.message).toContain('Gäller: ej angivet → upphört');
  }
});
test('corrected relationships name both endpoints and retain ordinary uncertainty properties', () => {
  const before = usage();
  const after = usage({
    targetId: 'kim',
    properties: [{ id: 'uncertain', label: 'Osäkert uppgivet', kind: 'boolean', value: true }],
  });
  const result = draftResult({
    version: 1,
    changes: [],
    relationships: [
      {
        id: before.id,
        type: usageType,
        before,
        after,
        objectNames: { subscription: 'Musik', alex: 'Alex', kim: 'Kim' },
      },
    ],
  });
  expect(result.message).toContain('Musik används av Alex → Musik används av Kim');
  expect(result.message).toContain('Osäkert uppgivet: Ja (Ja/nej)');
});
test.each(['addition', 'removal'] as const)(
  'requested summaries retain all values during %s',
  (kind) => {
    const object = card({
      identity: 'unspecified',
      iconId: 'bike',
      profileImageId: 'image',
      properties: [{ id: 'memo', label: 'Beskrivning', kind: 'text', value: 'Påhittad uppgift' }],
    });
    const before = kind === 'removal' ? object : null,
      after = kind === 'addition' ? object : null;
    const result = historyResult(receipt({ changes: [{ type: cardType, before, after }] }));
    expect(result.message).toContain(
      kind === 'addition' ? 'Lade till Hushållskortet' : 'Tog bort Hushållskortet',
    );
    expect(result.message).toContain('Påhittad uppgift');
    expect(result.message).toContain('ospecificerat objekt');
    expect(result.message).toContain('Cykel');
    expect(result.message).toContain('bild');
  },
);
test('type explanations and directional labels remain readable before and after a correction', () => {
  const after = {
    ...usageType,
    name: 'Ägande',
    description: 'Ägarens koppling',
    forwardLabel: 'ägs av',
    reverseLabel: 'äger',
  };
  const result = historyResult(
    receipt({ relationshipTypes: [{ id: usageType.id, before: usageType, after }] }),
  );
  expect(result.message).toContain('namn: Användning → Ägande');
  expect(result.message).toContain('beskrivning: tom → Ägarens koppling');
  expect(result.message).toContain('Framåtriktning: används av → ägs av');
  expect(result.message).toContain('Omvänd riktning: ej angivet → äger');
});
test('icon descriptions preserve historical type defaults when resetting the visible choice', () => {
  const result = historyResult(
    receipt({
      changes: [
        { type: { ...cardType, name: 'Fordon' }, before: card({ iconId: 'bike' }), after: card() },
      ],
    }),
  );
  expect(result.message).toContain('Ikon: Cykel → Typens standardikon');
});
test('relationship corrections use endpoint names from the matching side of object renames', () => {
  const before = card({ id: 'subscription', name: 'Gamla abonnemanget' }),
    after = card({ id: 'subscription', name: 'Nya abonnemanget' });
  const result = historyResult(
    receipt({
      changes: [{ type: cardType, before, after }],
      relationships: [
        {
          id: 'usage',
          type: usageType,
          before: usage(),
          after: usage({ lifecycle: 'ended' }),
          objectNames: { subscription: 'Nya abonnemanget', alex: 'Alex' },
        },
      ],
    }),
  );
  expect(result.message).toContain(
    'Gamla abonnemanget används av Alex → Nya abonnemanget används av Alex',
  );
});
test('missing historical definitions stay unknown when the selected type changes', () => {
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
          objectNames: { subscription: 'Musik', alex: 'Alex' },
        },
      ],
    }),
  );
  expect(result.message).toContain('objekttyp: okänd objekttyp → Bankkonto');
  expect(result.message).toContain('Musik okänd sambandstyp Alex → Musik ägs av Alex');
  expect(result.message).toContain('sambandstyp: okänd sambandstyp → Ägande');
});
test('an empty draft and missing history explicitly describe the available result', () => {
  expect(draftResult({ version: 0, changes: [] }).message).toBe('Utkastet är tomt.');
  expect(historyResult(undefined).message).toBe(
    'Det finns inget tidigare sparande i hushållets historik.',
  );
});

test('pending and saved object corrections explain identity, active override and removed images without implying a save', () => {
  const before = card({
    identity: 'unresolved',
    lifecycle: 'ended',
    profileImageId: 'old-image',
    properties: [{ id: 'memo', label: 'Anteckning', kind: 'text', value: '' }],
  });
  const after = card({ lifecycle: 'active' });
  const change = { id: before.id, before, after, type: cardType };
  const pending = draftResult({ version: 4, changes: [change] });
  const saved = historyResult(receipt({ changes: [change] }));
  for (const result of [pending, saved]) {
    expect(result.message).toContain('Identitet: olöst identitet → identifierat');
    expect(result.message).toContain('Gäller: upphört → aktuellt');
    expect(result.message).toContain('Profilbild: bild finns → ingen bild');
    expect(result.message).toContain('Anteckning: Tom text (Text) → Saknas');
  }
  expect(pending.message).toMatch(/^Utkast: Ändra Hushållskortet/);
  expect(saved.message).toMatch(/^Sparandet: Ändrade Hushållskortet/);
});

test('type additions and removals report complete explanations and direction labels with the correct operation tense', () => {
  const created = { ...usageType, id: 'new-usage', description: 'Tjänstens användare' };
  const removed = { ...usageType, reverseLabel: 'använder' };
  const draft = {
    version: 5,
    changes: [],
    objectTypes: [
      { id: cardType.id, before: null, after: cardType },
      { id: 'removed-card', before: { ...cardType, id: 'removed-card' }, after: null },
    ],
    relationshipTypes: [
      { id: created.id, before: null, after: created },
      { id: removed.id, before: removed, after: null },
    ],
  };
  const pending = draftResult(draft);
  const saved = historyResult(receipt(draft));
  expect(pending.message).toContain('Lägg till objekttypen Kort');
  expect(pending.message).toContain('Ta bort objekttypen Kort');
  expect(saved.message).toContain('Lade till objekttypen Kort');
  expect(saved.message).toContain('Tog bort objekttypen Kort');
  for (const result of [pending, saved]) {
    expect(result.message).toContain('beskrivning: ej angivet → Tjänstens användare');
    expect(result.message).toContain('Framåtriktning: ej angivet → används av');
    expect(result.message).toContain('Framåtriktning: används av → ej angivet');
    expect(result.message).toContain('Omvänd riktning: använder → ej angivet');
  }
});

test('pending relationship additions and removals use real identifiers when no endpoint name was captured', () => {
  const value = usage({ lifecycle: 'active' });
  const draft = {
    version: 2,
    changes: [],
    relationships: [
      {
        id: 'new-edge',
        before: null,
        after: value,
        type: { ...usageType, forwardLabel: undefined },
      },
      { id: 'old-edge', before: value, after: null, type: usageType },
    ],
  };
  const pending = draftResult(draft);
  expect(pending.message).toContain('Lägg till sambandet subscription Användning alex');
  expect(pending.message).toContain('Ta bort sambandet subscription används av alex');
  expect(pending.message).toContain('Gäller: ej angivet → aktuellt');
  expect(pending.message).toContain('Gäller: aktuellt → ej angivet');
});

test('unchanged records remain readable and a type switch names the historical catalogue supplied with the review', () => {
  const before = card();
  const afterType = { ...cardType, id: 'account', name: 'Konto' };
  const unchanged = draftResult({
    version: 1,
    changes: [{ id: before.id, before, after: before, type: cardType }],
  });
  expect(unchanged.message).toBe('Utkast: Ändra Hushållskortet.');
  const switched = draftResult({
    version: 2,
    current: { types: [cardType, afterType], relationshipTypes: [usageType] },
    changes: [
      { id: before.id, before, after: { ...before, typeId: afterType.id }, type: afterType },
    ],
  });
  expect(switched.message).toContain('objekttyp: Kort → Konto');
});
