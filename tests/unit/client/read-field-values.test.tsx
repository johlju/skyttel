import { describe, expect, test } from 'vitest';
import { objectPropertyValues } from '../../../src/client/ObjectReadDetails.js';
import { relationshipPropertyValues } from '../../../src/client/RelationshipReadDetails.js';
import type { ObjectType, RelationshipType } from '../../../src/shared/map.js';
import type { Property } from '../../../src/shared/properties.js';

const type: ObjectType & RelationshipType = {
  id: 'type',
  householdId: 'household',
  revision: 1,
  name: 'Exempel',
  description: '',
};

describe.each([undefined, 'active', 'ended'] as const)('read lifecycle %s', (lifecycle) => {
  test('object and relationship readers preserve typed values, empty values, zero and false', () => {
    const properties: Property[] = [
      { id: 'yes', label: 'Ja-uppgift', kind: 'boolean', value: true },
      { id: 'missing', label: 'Saknad uppgift', kind: 'text' },
      { id: 'unlisted', label: 'Annan uppgift', kind: 'boolean', value: false },
      { id: 'amount', label: 'Belopp', kind: 'number', value: 0 },
      { id: 'note', label: 'Anteckning', kind: 'text', value: '' },
    ];
    const readers = [
      objectPropertyValues({ name: 'Objekt', typeId: type.id, lifecycle, properties }, type),
      relationshipPropertyValues(
        {
          typeId: type.id,
          sourceId: 'source',
          targetId: 'target',
          properties,

          lifecycle,
        },
        type,
        new Map(),
      ),
    ];
    for (const fields of readers) {
      expect(fields.get('property:yes')).toEqual({ label: 'Ja-uppgift', value: 'Ja (Ja/nej)' });
      expect(fields.get('property:missing')).toEqual({
        label: 'Saknad uppgift',
        value: 'Tomt (Text)',
      });
      expect(fields.get('property:unlisted')).toEqual({
        label: 'Annan uppgift',
        value: 'Nej (Ja/nej)',
      });
      expect(fields.get('property:amount')?.value).toBe('0 (Tal)');
      expect(fields.get('property:note')?.value).toBe('Tom text (Text)');
      expect(fields.get('lifecycle')?.value).toBe(
        lifecycle === 'active'
          ? 'Gäller fortfarande'
          : lifecycle === 'ended'
            ? 'Manuellt upphört'
            : 'Gäller fortfarande',
      );
    }
  });
});
