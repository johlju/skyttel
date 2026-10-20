import { expect, test } from 'vitest';
import { propertiesSchema } from '../../../src/shared/properties.js';

test('free properties retain repeated labels, order, typed and untyped empty values, zero and false', () => {
  const properties = [
    { id: 'empty', label: 'Uppgift' },
    { id: 'typed-empty', label: 'Uppgift', kind: 'number' },
    { id: 'zero', label: 'Uppgift', kind: 'number', value: 0 },
    { id: 'false', label: 'Uppgift', kind: 'boolean', value: false },
    { id: 'text', label: 'Beskrivning', kind: 'text', value: 'Lampa' },
    { id: 'date', label: 'Datum', kind: 'date', value: '2024-02-29' },
    ...Array.from({ length: 101 }, (_, index) => ({ id: `extra-${index}`, label: 'Fri' })),
  ];
  expect(propertiesSchema.parse(properties)).toEqual(properties);
});

test.each([
  [{ id: 'a', label: 'Text', value: 'saknar datatyp' }],
  [{ id: 'a', label: 'Tal', kind: 'number', value: '0' }],
  [{ id: 'a', label: 'Ja/nej', kind: 'boolean', value: 0 }],
  [{ id: 'a', label: 'Datum', kind: 'date', value: '2025-02-29' }],
  [{ id: 'a', label: 'Text', kind: 'text', value: null }],
  [{ id: 'a', label: 'Lista', kind: 'list', value: ['a'] }],
  [{ id: 'a', label: 'Tal', kind: 'number', value: Number.POSITIVE_INFINITY }],
  [{ id: 'a', label: ' ' }],
  [{ id: '', label: 'Text' }],
  [
    { id: 'a', label: 'Första' },
    { id: 'a', label: 'Andra' },
  ],
])('rejects invalid properties without coercion: %j', (...properties) => {
  expect(propertiesSchema.safeParse(properties).success).toBe(false);
});
