import { describe, expect, test } from 'vitest';
import { normalizeHouseholdName } from '../../../src/shared/household-name.js';

describe('household names', () => {
  test('preserves a Swedish household name while removing surrounding whitespace', () => {
    expect(normalizeHouseholdName('  Hushållet Örnen  ')).toBe('Hushållet Örnen');
  });

  test.each([
    undefined,
    null,
    12,
    {},
    [],
    '',
    ' \n\t ',
    'a'.repeat(101),
    'Hem\u0000ma',
    'Hem\u007fma',
  ])('rejects an invalid name: %j', (value) => {
    expect(normalizeHouseholdName(value)).toBeNull();
  });

  test('accepts the shortest and longest allowed names', () => {
    expect(normalizeHouseholdName('Ö')).toBe('Ö');
    expect(normalizeHouseholdName('a'.repeat(100))).toHaveLength(100);
  });
});
