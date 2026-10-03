import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ConversationDraft } from '../../../src/client/ConversationDraft.js';
import { DraftChangeSummary } from '../../../src/client/DraftChangeSummary.js';
import type { DraftChange, MapDraft, ObjectType } from '../../../src/shared/map.js';

afterEach(cleanup);
const type: ObjectType = {
  id: 'account',
  householdId: 'linden',
  revision: 1,
  name: 'Konto',
  description: '',
  fields: [
    { id: 'insured', name: 'Försäkrat', kind: 'boolean', description: '' },
    { id: 'amount', name: 'Belopp', kind: 'number', description: '' },
    { id: 'date', name: 'Uppgivet datum', kind: 'date', description: '' },
    { id: 'note', name: 'Anteckning', kind: 'text', description: '' },
  ],
};

test('the draft shows checked before-and-after facts, uncertainty, custom values and identity without hiding removals', () => {
  const change: DraftChange = {
    id: 'account-1',
    type,
    beforeType: {
      ...type,
      name: 'Äldre kontotyp',
      fields: [
        ...(type.fields ?? []),
        { id: 'removed', name: 'Borttaget fält', kind: 'text', description: '' },
      ],
    },
    before: {
      id: 'account-1',
      householdId: 'linden',
      revision: 1,
      typeId: type.id,
      name: 'Gamla kontot',
      description: '',
      identity: 'unspecified',
      lifecycle: 'ended',
      profileImageId: 'old-image',
      customValues: { insured: false, amount: 0, note: '', removed: 'Gammalt' },
      financialFacts: {
        price: { knowledge: 'unknown' },
        currency: { knowledge: 'none' },
        debt: { knowledge: 'known', value: '100', reportedOn: '2026-01-01' },
      },
    },
    after: {
      typeId: type.id,
      name: 'Nya kontot',
      description: 'Kontot rättas',
      identity: 'unresolved',
      lifecycle: 'active',
      profileImageId: 'new-image',
      customValues: { insured: true, amount: 24, date: '2026-10-03', note: 'Ny uppgift' },
      financialFacts: {
        price: { knowledge: 'known', value: '120' },
        currency: { knowledge: 'known', value: 'SEK' },
        debt: { knowledge: 'uncertain', value: '90', reportedOn: '2026-10-03' },
        usedCredit: { knowledge: 'none' },
      },
    },
  };
  render(<ConversationDraft draft={{ version: 1, changes: [change] }} />);
  const row = within(screen.getByRole('table', { name: 'Osparade ändringar' })).getByRole('row', {
    name: /Nya kontot/,
  });
  const text = row.textContent;
  for (const detail of [
    'Ändra',
    'Namn: Gamla kontot → Nya kontot',
    'Beskrivning: Ej uppgivet → Kontot rättas',
    'Objekttyp: Äldre kontotyp → Konto',
    'Pris: Okänt → 120',
    'Valuta: Uttryckligen inget → SEK',
    'Senast uppgiven skuld: 100 (2026-01-01) → 90 (osäkert uppgivet) (2026-10-03)',
    'Utnyttjad kredit: Ej uppgivet → Uttryckligen inget',
    'Försäkrat: Nej → Ja',
    'Belopp: 0 → 24',
    'Uppgivet datum: Ej uppgivet → 2026-10-03',
    'Anteckning: Ej uppgivet → Ny uppgift',
    'Borttaget fält: Gammalt → Ej uppgivet',
    'Gäller: Upphört → Aktuellt',
    'Identitet: Ospecificerat objekt → Olöst identitet',
    'Profilbild: Bild finns → Ny bild',
  ])
    expect(text).toContain(detail);
});

test('the whole draft names additions, removals and changed relationship and type definitions before saving', () => {
  const changedType: ObjectType = {
    ...type,
    name: 'Betalkonto',
    description: 'Ny typbeskrivning',
    fields: [{ id: 'new', name: 'Stängt', kind: 'boolean', description: 'Kontot är stängt' }],
  };
  const oldType: ObjectType = {
    ...type,
    fields: [{ id: 'old', name: 'Gammalt fält', kind: 'text', description: 'Tidigare uppgift' }],
  };
  const relationshipType = {
    id: 'uses',
    householdId: 'linden',
    revision: 1,
    name: 'Använder',
    description: '',
    forwardLabel: 'använder',
    reverseLabel: 'används av',
    fields: [{ id: 'shared', name: 'Delat', kind: 'boolean' as const, description: '' }],
  };
  const review: MapDraft = {
    version: 2,
    changes: [
      {
        id: 'added',
        before: null,
        after: { typeId: type.id, name: 'Nytt konto', description: '' },
        type,
      },
      {
        id: 'deleted',
        before: {
          id: 'deleted',
          householdId: 'linden',
          revision: 1,
          typeId: type.id,
          name: 'Borttaget konto',
          description: '',
        },
        after: null,
        type,
      },
    ],
    relationships: [
      {
        id: 'corrected',
        type: relationshipType,
        beforeType: {
          ...relationshipType,
          fields: [{ id: 'old', name: 'Gammal uppgift', kind: 'text', description: '' }],
        },
        objectNames: { alex: 'Alex', bike: 'Cykeln' },
        before: {
          id: 'corrected',
          householdId: 'linden',
          revision: 1,
          sourceId: 'alex',
          typeId: 'uses',
          targetId: null,
          knowledge: 'unknown',
          lifecycle: 'active',
          customValues: { old: 'Tas bort', shared: false },
        },
        after: {
          sourceId: 'alex',
          typeId: 'uses',
          targetId: 'bike',
          knowledge: 'uncertain',
          lifecycle: 'ended',
          customValues: { shared: true },
          endDate: { knowledge: 'known', value: '2026-10-03' },
        },
      },
      {
        id: 'new-relation',
        type: relationshipType,
        before: null,
        after: { sourceId: 'alex', typeId: 'uses', targetId: null, knowledge: 'none' },
        objectNames: { alex: 'Alex' },
      },
      {
        id: 'removed-relation',
        type: { ...relationshipType, forwardLabel: undefined },
        before: {
          id: 'removed-relation',
          householdId: 'linden',
          revision: 1,
          sourceId: 'alex',
          typeId: 'uses',
          targetId: null,
          knowledge: 'unresolved',
        },
        after: null,
        objectNames: { alex: 'Alex' },
      },
    ],
    objectTypes: [
      { id: type.id, before: oldType, after: changedType },
      { id: 'new-type', before: null, after: { ...type, id: 'new-type', name: 'Ny typ' } },
      {
        id: 'removed-type',
        before: { ...type, id: 'removed-type', name: 'Borttagen typ' },
        after: null,
      },
    ],
    relationshipTypes: [
      {
        id: 'uses',
        before: relationshipType,
        after: {
          ...relationshipType,
          description: 'Rättat samband',
          forwardLabel: 'ny framåtriktning',
          reverseLabel: undefined,
        },
      },
    ],
  };
  render(
    <>
      <ConversationDraft draft={review} />
      <DraftChangeSummary review={review} />
    </>,
  );
  const table = screen.getByRole('table', { name: 'Osparade ändringar' });
  for (const detail of [
    'Lägg tillNytt konto',
    'Ta bortBorttaget konto',
    'Gäller: Aktuellt → Upphört',
    'Gammal uppgift: Tas bort → Ej uppgivet',
    'Delat: Nej → Ja',
    'Slutdatum: Ej uppgivet → 2026-10-03',
    'Alex → använder → Uttryckligen inget',
    'Alex → Använder → Olöst identitet',
    'Eget fält: Gammalt fält (text): Tidigare uppgift → Borttaget',
    'Eget fält: Inget → Stängt (ja/nej): Kontot är stängt',
    'Framåtriktning: använder → ny framåtriktning',
    'Omvänd riktning: används av → Ej uppgivet',
  ])
    expect(table.textContent).toContain(detail);
  const summary = screen.getByRole('list', { name: 'Alla föreslagna ändringar' });
  expect(summary.textContent).toContain('Rätta Objekttyp: Konto → Betalkonto');
  expect(summary.textContent).toContain('Lägg till Objekttyp: Ny typ');
  expect(summary.textContent).toContain('Ta bort Objekttyp: Borttagen typ');
  expect(summary.textContent).toContain('Slutdatum: Ej uppgivet → 2026-10-03');
});
