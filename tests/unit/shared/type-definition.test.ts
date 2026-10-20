import { expect, test } from 'vitest';
import type { ObjectType, RelationshipType } from '../../../src/shared/map.js';
import { resolveTypeDefinition } from '../../../src/shared/type-definition.js';

const before: ObjectType = {
  id: 'type',
  householdId: 'home',
  revision: 1,
  name: 'Fordon',
  description: 'En sak',
};
test('independent type meaning changes merge without losing identity', () => {
  const current = { ...before, revision: 2 };
  expect(
    resolveTypeDefinition('objectType', before, { ...before, name: 'Cykel' }, current),
  ).toEqual({ ...current, revision: 3, name: 'Cykel' });
});
test('relationship directions retain independent saved and proposed explanations', () => {
  const value: RelationshipType = {
    ...before,
    forwardLabel: 'förvaras i',
    reverseLabel: 'förvarar',
  };
  const current = { ...value, revision: 2, reverseLabel: 'innehåller' };
  expect(resolveTypeDefinition('relationshipType', value, { ...value }, current)).toEqual({
    ...current,
    revision: 3,
  });
});
test('a newly retained definition takes the chosen meaning with a fresh revision', () => {
  expect(
    resolveTypeDefinition(
      'objectType',
      null,
      { ...before, name: 'Cykel' },
      { ...before, revision: 4 },
    ),
  ).toEqual({ ...before, name: 'Cykel', revision: 5 });
});
