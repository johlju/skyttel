import { expect, test } from 'vitest';
import {
  type ConflictChoices,
  type ConflictProperty,
  combineConflictProperties,
  conflictBasis,
  conflictCombinationError,
  conflictProperties,
  conflictPropertyLabel,
  conflictPropertyValue,
  conflictValueText,
  sameConflictValue,
} from '../../../src/shared/conflict-properties.js';
import {
  conflictRemovalPlan,
  conflictRemovalProperties,
} from '../../../src/shared/conflict-removal.js';
import { specialConflict } from '../../../src/shared/conflict-special.js';
import {
  removedConflictDefinition,
  restorationIsCurrent,
} from '../../../src/shared/definition-restoration.js';
import type { DraftConflict } from '../../../src/shared/draft-conflicts.js';
import { draftDiscardPlan, draftProposalRefs } from '../../../src/shared/draft-discard.js';
import type {
  MapObject,
  MapRelationship,
  MapState,
  ObjectType,
  RelationshipType,
} from '../../../src/shared/map.js';

const objectType: ObjectType = {
  id: 'vehicle',
  householdId: 'home',
  revision: 1,
  name: 'Fordon',
  description: 'Fullständig definition',
};
const edgeType: RelationshipType = {
  id: 'uses',
  householdId: 'home',
  revision: 1,
  name: 'Använder',
  description: '',
  forwardLabel: 'använder',
  reverseLabel: 'används av',
};
const alex: MapObject = {
  id: 'alex',
  householdId: 'home',
  revision: 1,
  typeId: 'vehicle',
  name: 'Alex',
};
const bike: MapObject = {
  ...alex,
  id: 'bike',
  name: 'Cykeln',

  profileImageId: 'saved-image',
  properties: [
    { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Hela beskrivningen' },
  ],
};
const edge: MapRelationship = {
  id: 'edge',
  householdId: 'home',
  revision: 1,
  typeId: 'uses',
  sourceId: 'alex',
  targetId: 'bike',
};
function household(): MapState {
  return {
    userId: 'alex',
    contentVersion: 1,
    types: [structuredClone(objectType)],
    relationshipTypes: [structuredClone(edgeType)],
    objects: [structuredClone(alex), structuredClone(bike)],
    relationships: [structuredClone(edge)],
    draft: { version: 3, changes: [] },
  };
}
const property = (key: string): ConflictProperty => ({
  key,
  label: key,
  before: undefined,
  saved: undefined,
  proposed: undefined,
});

test('combining property choices preserves atomic values, false and zero without mutation', () => {
  const before = { id: 'debt', label: 'Skuld', kind: 'number' as const, value: 0 };
  const proposed = { ...before, label: 'Skuld idag', value: 1200 };
  const fields: ConflictProperty[] = [
    { ...property('name'), saved: 'Sparat', proposed: 'Föreslaget' },
    { ...property('properties.debt'), saved: before, proposed },
    {
      ...property('properties.flag'),
      saved: { id: 'flag', label: 'Ja', kind: 'boolean', value: false },
      proposed: { id: 'flag', label: 'Ja', kind: 'boolean', value: false },
    },
    {
      ...property('propertiesOrder'),
      before: ['debt', 'flag'],
      saved: ['debt', 'flag'],
      proposed: ['debt', 'flag'],
      automatic: 'saved',
    },
  ];
  const original = structuredClone(fields);
  expect(combineConflictProperties(fields, {})).toBeNull();
  expect(
    combineConflictProperties(fields, { name: 'proposed', 'properties.debt': 'saved' }),
  ).toEqual({
    name: 'Föreslaget',
    properties: [before, { id: 'flag', label: 'Ja', kind: 'boolean', value: false }],
  });
  expect(
    combineConflictProperties(fields, { name: 'saved', 'properties.debt': 'proposed' }),
  ).toEqual({
    name: 'Sparat',
    properties: [proposed, { id: 'flag', label: 'Ja', kind: 'boolean', value: false }],
  });
  expect(fields).toEqual(original);
  expect(sameConflictValue({ a: { b: false }, c: 0 }, { c: 0, a: { b: false } })).toBe(true);
  expect(sameConflictValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  expect(sameConflictValue({ a: 1 }, { a: 2 })).toBe(false);
  expect(sameConflictValue(null, {})).toBe(false);
  expect(sameConflictValue('1', 1)).toBe(false);
  expect(conflictPropertyValue({ properties: [before] }, 'properties.debt')).toEqual(before);
  expect(conflictPropertyValue(null, 'properties.debt')).toBeUndefined();
  expect(conflictPropertyLabel({ ...property('note'), label: 'Anteckning' })).toBe('Anteckning');
});

test('combined object and relationship choices validate actual types and endpoints', () => {
  const state = household();
  const objectConflict: DraftConflict = { kind: 'object', id: 'bike', current: bike };
  const valid = {
    name: 'Cykeln',
    typeId: 'vehicle',

    properties: [
      { id: 'note', label: 'note', kind: 'text', value: '' },
      { id: 'count', label: 'count', kind: 'number', value: 0 },
      { id: 'date', label: 'date', kind: 'text', value: '2024-02-29' },
      { id: 'flag', label: 'flag', kind: 'boolean', value: false },
    ],
  };
  expect(conflictCombinationError(state, objectConflict, valid)).toBe('');
  expect(conflictCombinationError(state, objectConflict, null)).toBe('');
  expect(conflictCombinationError(state, objectConflict, { definition: objectType })).toBe('');
  expect(conflictCombinationError(state, objectConflict, { ...valid, name: '  ' })).toBe(
    'Objektet behöver ett namn.',
  );
  expect(
    conflictCombinationError(state, objectConflict, { ...valid, typeId: 'missing' }),
  ).toContain('typen finns inte');
  const relationshipConflict: DraftConflict = { kind: 'relationship', id: 'edge', current: edge };
  expect(
    conflictCombinationError(state, relationshipConflict, {
      ...edge,
    }),
  ).toBe('');
  expect(
    conflictCombinationError(state, relationshipConflict, {
      ...edge,

      targetId: 'bike',
    }),
  ).toBe('');
  for (const update of [{ targetId: null }, { targetId: null }, { targetId: null }])
    expect(conflictCombinationError(state, relationshipConflict, { ...edge, ...update })).toContain(
      'tillobjekt',
    );
  expect(
    conflictCombinationError(state, relationshipConflict, { ...edge, sourceId: 'absent' }),
  ).toContain('valt objekt');
  expect(
    conflictCombinationError(state, relationshipConflict, { ...edge, targetId: 'absent' }),
  ).toContain('valt objekt');
  expect(
    conflictCombinationError(state, { ...relationshipConflict, id: 'another' }, { ...edge }),
  ).toBe('Det valda sambandet finns redan i kartan.');
  state.draft.changes = [{ id: 'bike', before: bike, after: null, type: objectType }];
  expect(conflictCombinationError(state, relationshipConflict, { ...edge })).toContain(
    'valt objekt',
  );
  state.draft.changes = [
    { id: 'new-bike', before: null, after: { ...bike, name: 'Ny cykel' }, type: objectType },
  ];
  expect(
    conflictCombinationError(state, relationshipConflict, { ...edge, targetId: 'new-bike' }),
  ).toBe('');
});

test('comparison text retains type meaning, empty properties and actual proposed endpoint names', () => {
  const state = household();
  state.draft.changes = [
    { id: 'alex', before: alex, after: { ...alex, name: 'Mitt Alex' }, type: objectType },
  ];
  state.draft.objectTypes = [
    { id: 'vehicle', before: objectType, after: { ...objectType, name: 'Mitt fordon' } },
  ];
  state.draft.relationshipTypes = [
    { id: 'uses', before: edgeType, after: { ...edgeType, name: 'Mitt samband' } },
  ];
  const text = (key: string, value: unknown) => conflictValueText(state, property(key), value);
  expect(text('definition', null)).toBe('Borttaget');
  expect(text('definition', objectType)).toBe('Fordon · Fullständig definition');
  expect(text('definition', edgeType)).toBe('Använder');
  expect(text('identity', 'unresolved')).toBe('Behöver redas ut');
  expect(text('name', null)).toBe('Ej uppgivet');
  expect(text('typeId', 'vehicle')).toBe('Fordon');
  expect(text('typeId', 'absent')).toBe('absent');
  expect(text('sourceId', 'alex')).toBe('Mitt Alex');
  expect(text('targetId', 'bike')).toBe('Cykeln');
  expect(text('targetId', 'absent')).toBe('absent');
  expect(text('iconId', 'bike')).toBe('Cykel');
  expect(text('profileImageId', 'saved-image')).toBe('Den sparade profilbilden');
  expect(text('profileImageId', 'new-image')).toBe('Din föreslagna profilbild');
  expect(text('relationship', edge)).toBe('Alex → använder → Cykeln');
  expect(text('properties.flag', { id: 'flag', label: 'Ja', kind: 'boolean', value: false })).toBe(
    'Ja: Nej (Ja/nej)',
  );
  expect(text('properties.empty', { id: 'empty', label: 'Tom' })).toBe('Tom: Tomt (ingen datatyp)');
  expect(text('propertiesOrder', ['one', 'two'])).toBe('1. one → 2. two');
  expect(text('flag', false)).toBe('Nej');
  expect(text('flag', true)).toBe('Ja');
  expect(text('count', 0)).toBe('0');
  expect(text('other', { full: 'value' })).toBe('{"full":"value"}');
});

test('restoration basis expires on generation, removed revision and household changes for both definition kinds', () => {
  const state = household();
  state.removedDefinitions = { objectTypes: [objectType], relationshipTypes: [edgeType] };
  for (const [kind, definition] of [
    ['objectType', objectType],
    ['relationshipType', edgeType],
  ] as const) {
    const conflict = { kind, id: definition.id };
    const authority = { contentVersion: 1, definition };
    expect(removedConflictDefinition(state, conflict)).toEqual(definition);
    expect(restorationIsCurrent(state, conflict, authority)).toBe(true);
    expect(restorationIsCurrent(state, conflict, { ...authority, contentVersion: 2 })).toBe(false);
    expect(
      restorationIsCurrent(state, conflict, {
        ...authority,
        definition: { ...definition, revision: 2 },
      }),
    ).toBe(false);
    expect(
      restorationIsCurrent(state, conflict, {
        ...authority,
        definition: { ...definition, householdId: 'other' },
      }),
    ).toBe(false);
    expect(restorationIsCurrent(state, { ...conflict, id: 'absent' }, authority)).toBe(false);
    const empty = { ...state, removedDefinitions: undefined };
    expect(removedConflictDefinition(empty, conflict)).toBeUndefined();
  }
  expect(removedConflictDefinition(state, { kind: 'object', id: 'bike' })).toBeUndefined();
  state.draft.objectTypes = [
    { id: objectType.id, before: objectType, after: { ...objectType, name: 'Nytt namn' } },
  ];
  const conflict: DraftConflict = { kind: 'objectType', id: objectType.id, current: null };
  expect(conflictProperties(state, conflict)).toEqual([
    {
      key: 'definition',
      label: 'Typdefinition',
      before: objectType,
      saved: null,
      proposed: { ...objectType, name: 'Nytt namn' },
    },
  ]);
  expect(conflictBasis(state, conflict)).toMatchObject({
    restoration: { contentVersion: 1, definition: objectType },
  });
  const oldBasis = conflictBasis(state, conflict);
  state.contentVersion = 2;
  expect(conflictBasis(state, conflict)).not.toEqual(oldBasis);
  expect(conflictProperties(state, { kind: 'object', id: 'absent', current: null })).toEqual([]);
});

test('special conflicts distinguish saved and private duplicates, simultaneous missing type and ordinary correction', () => {
  const state = household();
  state.draft.relationships = [{ id: 'mine', before: null, after: edge, type: edgeType }];
  const conflict: DraftConflict = {
    kind: 'relationship',
    id: 'mine',
    current: null,
    duplicates: [edge],
    type: edgeType,
  };
  expect(specialConflict(state, conflict)).toMatchObject({
    kind: 'discard-relationship',
    reason: 'Ett sparat samband har redan samma typ, riktning och objekt.',
    afterDiscard: 'Det redan sparade sambandet och dess uppgifter behålls.',
  });
  state.relationships = [];
  expect(specialConflict(state, conflict)).toMatchObject({
    reason: 'Ett annat förslag i ditt utkast har samma typ, riktning och objekt.',
    afterDiscard: 'Det andra förslaget i ditt utkast och dess uppgifter behålls.',
  });
  const missingType = specialConflict(state, { ...conflict, type: null });
  expect(missingType?.additionalBlockers).toHaveLength(1);
  expect(missingType?.additionalBlockers?.[0].instruction).toContain('Inställningar → Typer');
  expect(
    specialConflict(state, { ...conflict, duplicates: [], missingEndpoints: ['bike'] }),
  ).toMatchObject({
    reason: 'Ett objekt som sambandet pekar på saknas.',
    afterDiscard:
      'Övrigt utkastarbete finns kvar. Du kan också rätta ändpunkterna och behålla förslaget.',
  });
  expect(specialConflict(state, { ...conflict, duplicates: undefined, type: null })).toMatchObject({
    kind: 'outside-correction',
  });
  expect(specialConflict(state, { ...conflict, duplicates: undefined })).toMatchObject({
    kind: 'outside-correction',
    instruction: expect.stringContaining('vanliga sambandsdialogen'),
  });
  state.draft.changes = [{ id: 'bike', before: null, after: bike, type: objectType }];
  expect(
    specialConflict(state, { kind: 'object', id: 'bike', current: null, type: objectType }),
  ).toMatchObject({
    kind: 'outside-correction',
    instruction: expect.stringContaining('vanliga objektdialogen'),
  });
  expect(
    specialConflict(state, { kind: 'object', id: 'bike', current: null, type: null }),
  ).toMatchObject({ kind: 'missing-object-type', action: 'Ta bort objektet ur ditt utkast' });
  state.draft.changes[0].before = bike;
  expect(specialConflict(state, { kind: 'object', id: 'bike', current: null })).toMatchObject({
    kind: 'removed',
  });
  state.draft.relationships[0].before = edge;
  expect(specialConflict(state, { kind: 'relationship', id: 'mine', current: null })).toMatchObject(
    { kind: 'removed', warning: 'Ett ändringsförslag kan inte återställa ett borttaget samband.' },
  );
  expect(specialConflict(state, { kind: 'object', id: 'absent', current: bike })).toBeNull();
});

test('own removal explains actual actor or new incident edges and keeps unnamed endpoints readable', () => {
  const state = household();
  state.draft.changes = [{ id: 'bike', before: bike, after: null, type: objectType }];
  state.draft.relationships = [{ id: 'edge', before: edge, after: null, type: edgeType }];
  expect(specialConflict(state, { kind: 'object', id: 'bike', current: bike })?.reason).toContain(
    'En annan användare sparade ändringar i objektet',
  );
  state.conflictActors = {
    'relationship:edge': { name: 'Robin', savedAt: '2026-01-01T12:00:00Z' },
  };
  expect(
    specialConflict(state, { kind: 'relationship', id: 'edge', current: edge })?.reason,
  ).toContain('Robin sparade ändringar i sambandet');
  expect(
    specialConflict(state, { kind: 'object', id: 'bike', current: bike, connections: [edge] })
      ?.reason,
  ).toBe('Du föreslår borttagning. Ytterligare ett sparat samband berör nu objektet.');
  const missingNames = { ...state, objects: [], relationshipTypes: [] };
  expect(
    conflictRemovalProperties(missingNames, {
      kind: 'object',
      id: 'bike',
      current: bike,
      connections: [edge],
    })[1].saved,
  ).toBe('alex har samband med Ej uppgivet');
  expect(
    conflictRemovalProperties(
      { ...missingNames, relationshipTypes: [{ ...edgeType, forwardLabel: undefined }] },
      { kind: 'object', id: 'bike', current: bike, connections: [edge] },
    )[1].saved,
  ).toBe('alex Använder Ej uppgivet');
  expect(
    conflictRemovalProperties(state, {
      kind: 'object',
      id: 'bike',
      current: { ...bike },
    })[0].saved,
  ).toBe('Cykeln · Beskrivning: Hela beskrivningen (Text)');
});

test('object removal review retains ordered free facts including empty, zero and false values', () => {
  const state = household();
  state.draft.changes = [{ id: 'bike', before: bike, after: null, type: objectType }];
  const current: MapObject = {
    ...bike,
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Nya sparade fakta' },
      { id: 'empty', label: 'Anteckning', kind: 'text' },
      { id: 'count', label: 'Antal', kind: 'number', value: 0 },
      { id: 'insured', label: 'Försäkrad', kind: 'boolean', value: false },
    ],
  };
  expect(
    conflictRemovalProperties(state, { kind: 'object', id: 'bike', current })[0],
  ).toMatchObject({
    before: 'Cykeln · Beskrivning: Hela beskrivningen (Text)',
    saved:
      'Cykeln · Beskrivning: Nya sparade fakta (Text) · Anteckning: Tomt (Text) · Antal: 0 (Tal) · Försäkrad: Nej (Ja/nej)',
    proposed: 'Föreslagen borttagning',
  });
});

test('removal choices reject incomplete, invented and stale combinations while retaining independent proposals', () => {
  const state = household();
  state.draft.changes = [
    { id: 'bike', before: bike, after: null, type: objectType },
    { id: 'independent', before: null, after: { ...alex, name: 'Annat objekt' }, type: objectType },
  ];
  const conflict: DraftConflict = {
    kind: 'object',
    id: 'bike',
    current: bike,
    connections: [edge],
  };
  const before = structuredClone(state);
  for (const choices of [
    {},
    { object: 'saved' },
    { object: 'proposed', 'relationship:edge': 'saved' },
    { object: 'saved', 'relationship:edge': 'saved', invented: 'saved' },
    { object: 'invalid', 'relationship:edge': 'saved' },
  ])
    expect(conflictRemovalPlan(state, conflict, choices as ConflictChoices)).toBeNull();
  const keep = conflictRemovalPlan(state, conflict, {
    object: 'saved',
    'relationship:edge': 'saved',
  });
  expect(keep?.draft.changes.map((change) => change.id)).toEqual(['independent']);
  expect(keep?.effects).toEqual([{ target: conflict, kind: 'discard' }]);
  const remove = conflictRemovalPlan(state, conflict, {
    object: 'proposed',
    'relationship:edge': 'proposed',
  });
  expect(remove?.draft.changes.map((change) => change.id)).toEqual(['bike', 'independent']);
  expect(remove?.draft.relationships).toEqual([
    {
      id: 'edge',
      before: edge,
      after: null,
      type: edgeType,
      beforeType: edgeType,
      proposedAt: expect.any(String),
      objectNames: { alex: 'Alex', bike: 'Cykeln' },
      removedWithObjects: ['bike'],
    },
  ]);
  expect(remove?.effects).toHaveLength(2);
  expect(
    conflictRemovalPlan({ ...state, types: [] }, conflict, {
      object: 'proposed',
      'relationship:edge': 'proposed',
    }),
  ).toBeNull();
  expect(
    conflictRemovalPlan({ ...state, relationshipTypes: [] }, conflict, {
      object: 'saved',
      'relationship:edge': 'proposed',
    }),
  ).toBeNull();
  expect(
    conflictRemovalPlan({ ...state, draft: { version: 3, changes: [] } }, conflict, {
      object: 'saved',
      'relationship:edge': 'saved',
    }),
  ).toBeNull();
  expect(
    conflictRemovalProperties(state, { kind: 'objectType', id: 'vehicle', current: objectType }),
  ).toEqual([]);
  expect(state).toEqual(before);
  state.draft.relationships = [
    {
      id: 'edge',
      before: edge,
      after: null,
      type: edgeType,
      objectNames: { bike: 'Historisk cykel' },
      removedWithObjects: ['bike'],
    },
  ];
  const relationshipConflict: DraftConflict = { kind: 'relationship', id: 'edge', current: edge };
  expect(
    conflictRemovalPlan(state, relationshipConflict, { relationship: 'saved' })?.draft
      .relationships,
  ).toEqual([]);
  const retained = conflictRemovalPlan(state, relationshipConflict, { relationship: 'proposed' });
  expect(retained?.draft.relationships?.[0]).toMatchObject({
    before: edge,
    after: null,
    type: edgeType,
    beforeType: edgeType,
    objectNames: { alex: 'Alex', bike: 'Cykeln' },
  });
  expect(retained?.draft.relationships?.[0]).not.toHaveProperty('removedWithObjects');
  expect(conflictBasis(state, relationshipConflict)).toMatchObject({
    types: [edgeType],
    endpoints: [
      { id: 'alex', revision: 1 },
      { id: 'bike', revision: 1 },
    ],
  });
  const absent = { ...state, objects: [] };
  expect(
    conflictRemovalPlan(absent, relationshipConflict, { relationship: 'proposed' })?.draft
      .relationships?.[0].objectNames,
  ).toEqual({ bike: 'Historisk cykel' });
  expect(
    conflictRemovalPlan({ ...state, relationshipTypes: [] }, relationshipConflict, {
      relationship: 'proposed',
    }),
  ).toBeNull();
  expect(
    conflictRemovalPlan({ ...state, draft: { version: 3, changes: [] } }, relationshipConflict, {
      relationship: 'proposed',
    }),
  ).toBeNull();
});

test('discarding type proposals reports dependent corrections without removing their values or independent proposals', () => {
  const state = household();
  state.draft.changes = [{ id: 'bike', before: null, after: bike, type: objectType }];
  state.draft.relationships = [{ id: 'edge', before: null, after: edge, type: edgeType }];
  state.draft.objectTypes = [{ id: 'vehicle', before: objectType, after: objectType }];
  state.draft.relationshipTypes = [{ id: 'uses', before: edgeType, after: edgeType }];
  const before = structuredClone(state);
  const objectAfter = { ...state.draft, objectTypes: [] };
  expect(draftDiscardPlan(state, objectAfter, 'objectType', 'vehicle')).toEqual({
    removed: ['Objekttyp-vehicle'],
    affected: [
      {
        key: 'object-bike',
        reason: 'Förslaget använder den sparade typen i stället för typförslaget.',
      },
    ],
  });
  expect(draftDiscardPlan({ ...state, types: [] }, objectAfter, 'objectType', 'vehicle')).toEqual({
    removed: ['Objekttyp-vehicle'],
    affected: [{ key: 'object-bike', reason: 'Objekttypen saknas.' }],
  });
  const relationshipAfter = { ...state.draft, relationshipTypes: [] };
  expect(
    draftDiscardPlan(
      { ...state, relationshipTypes: [] },
      relationshipAfter,
      'relationshipType',
      'uses',
    ),
  ).toEqual({
    removed: ['Sambandstyp-uses'],
    affected: [{ key: 'relationship-edge', reason: 'Sambandstypen saknas.' }],
  });
  expect(draftDiscardPlan(state, { version: 4, changes: [] }, 'all', '')).toEqual({
    removed: ['object-bike', 'relationship-edge', 'Objekttyp-vehicle', 'Sambandstyp-uses'],
    affected: [],
  });
  expect(draftProposalRefs({ version: 0, changes: [] })).toEqual([]);
  expect(state).toEqual(before);
});
