import { expect, test } from 'vitest';
import {
  checkOperation,
  checkSaveIdentity,
  receiptMessage,
  rejectionMessage,
  type SaveAttempt,
} from '../../../src/client/SaveOperations.js';
import type { SaveOperation, SaveReceipt } from '../../../src/shared/map.js';

const attempt: SaveAttempt = {
  operationId: 'save-42',
  version: 4,
  contentVersion: 37,
  householdId: 'home',
  userId: 'alex',
};
const receipt: SaveReceipt = {
  operationId: 'save-42',
  draftVersion: 4,
  contentVersion: 37,
  householdId: 'home',
  userId: 'alex',
  savedAt: '2026-10-18T10:00:00.000Z',
  changes: [],
};

test.each([
  { operationId: 'another-save' },
  { draftVersion: 5 },
  { contentVersion: 38 },
  { householdId: 'another-home' },
  { userId: 'robin' },
])(
  'a receipt with mismatched authority %j cannot confirm the current whole-draft save',
  (mismatch) => {
    expect(() => checkSaveIdentity({ ...receipt, ...mismatch }, attempt)).toThrow(
      'invalid_receipt',
    );
    expect(() => checkSaveIdentity(receipt, attempt)).not.toThrow();
  },
);

test('a successful operation cannot smuggle a receipt from another owner or a replaced household version', () => {
  const operation = {
    ...receipt,
    createdAt: receipt.savedAt,
    status: 'succeeded' as const,
    receipt,
  };
  expect(() => checkOperation(operation, attempt)).not.toThrow();
  for (const mismatch of [{ userId: 'robin' }, { contentVersion: 38 }])
    expect(() =>
      checkOperation({ ...operation, receipt: { ...receipt, ...mismatch } }, attempt),
    ).toThrow('invalid_receipt');
  expect(() => checkOperation({ ...operation, status: 'pending' }, attempt)).not.toThrow();
  expect(() =>
    checkOperation({ ...operation, status: 'rejected', error: 'content_conflict' }, attempt),
  ).not.toThrow();
  const unsupported: SaveOperation = JSON.parse(
    JSON.stringify({ ...operation, status: 'almost-saved' }),
  );
  expect(() => checkOperation(unsupported, attempt)).toThrow('invalid_operation');
});

test('the receipt announcement names retained identities and distinguishes removed objects, relationships and definitions', () => {
  const type = { id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' };
  const edgeType = { ...type, id: 'uses', name: 'Använder' };
  const object = { id: 'lo', householdId: 'home', revision: 1, typeId: type.id, name: 'Lo' };
  const edge = {
    id: 'edge',
    householdId: 'home',
    revision: 1,
    typeId: edgeType.id,
    sourceId: 'lo',
    targetId: 'lo',
  };
  const saved: SaveReceipt = {
    ...receipt,
    objectTypes: [
      { id: type.id, before: null, after: type },
      { id: 'old', before: { ...type, id: 'old', name: 'Äldre person' }, after: null },
    ],
    relationshipTypes: [
      { id: edgeType.id, before: null, after: edgeType },
      {
        id: 'old-edge',
        before: { ...edgeType, id: 'old-edge', name: 'Tidigare betydelse' },
        after: null,
      },
    ],
    changes: [
      { before: null, after: object, type },
      { before: { ...object, id: 'old-lo', name: 'Tidigare Lo' }, after: null, type },
    ],
    relationships: [
      { id: edge.id, before: null, after: edge, type: edgeType },
      { id: 'old-link', before: { ...edge, id: 'old-link' }, after: null, type: edgeType },
    ],
  };
  expect(receiptMessage(saved)).toBe(
    'Sparat: Person (objekttyp), Äldre person (borttagen objekttyp), Använder (sambandstyp), Tidigare betydelse (borttagen sambandstyp), Lo, Tidigare Lo, Använder (samband), Använder (borttaget samband). Kvitto: save-42.',
  );
});

test.each([
  ['restoration_conflict', /Inget sparades.*granska aktuellt underlag igen/s],
  ['definition_in_use', /privata utkast.*Ingen ändring genomfördes/s],
  ['invalid_relationship_type', /benämningar från båda hållen/],
  ['duplicate_relationship', /Inget sparades.*befintliga sambandet/s],
  ['invalid_properties', /egenskapens etikett, datatyp och värde.*Inga uppgifter sparades/s],
  ['invalid_type_definition', /namn och beskrivning för objekttypen/],
  ['client_outdated', /Kopiera osänd text.*Kontrollera tidigare sparförsök/s],
  ['operation_conflict', /Kontrollera det ursprungliga försöket/],
  ['content_conflict', /gamla försöket kan inte bekräfta eller spara det nya innehållet/],
  ['operation_pending', /Kontrollera och återförsök det innan du ändrar utkastet/],
  ['unexpected_rejection', /Inget sparades.*granska hela utkastet/s],
] as const)(
  'rejected saves explain a recoverable next step for %s without claiming success',
  (code, instruction) => {
    expect(rejectionMessage(code)).toMatch(instruction);
  },
);
