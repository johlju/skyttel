import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { DraftProposalDetails, draftProposals } from '../../../src/client/DraftProposalDetails.js';
import { HistoricalMergeDetails } from '../../../src/client/HistoricalMergeDetails.js';
import { ObjectReadDetails } from '../../../src/client/ObjectReadDetails.js';
import {
  SpecialConflictDetails,
  SpecialConflictResult,
} from '../../../src/client/SpecialConflictDetails.js';
import { specialConflict } from '../../../src/shared/conflict-special.js';
import type { DraftConflict } from '../../../src/shared/draft-conflicts.js';
import type {
  MapObject,
  MapState,
  ObjectMerge,
  ObjectType,
  RelationshipType,
} from '../../../src/shared/map.js';

afterEach(cleanup);

const objectType: ObjectType = {
  id: 'person',
  householdId: 'home',
  revision: 1,
  name: 'Person',
  description: '',
};
const relationshipType: RelationshipType = {
  id: 'uses',
  householdId: 'home',
  revision: 1,
  name: 'Använder',
  description: '',
};
function emptyState(): MapState {
  return {
    userId: 'alex',
    contentVersion: 37,
    types: [objectType],
    relationshipTypes: [relationshipType],
    objects: [],
    relationships: [],
    draft: { version: 3, changes: [] },
  };
}

test('blocked new relationships retain both vanished endpoint names and typed properties while explaining every blocker', async () => {
  const state = emptyState();
  state.relationshipTypes = [];
  state.draft.relationships = [
    {
      id: 'edge',
      before: null,
      type: relationshipType,
      objectNames: { source: 'Alex i Umeå', target: 'Molnmusik' },
      after: {
        typeId: 'uses',
        sourceId: 'source',
        targetId: 'target',
        properties: [
          { id: 'empty', label: 'Uppgift', kind: 'text' },
          { id: 'false', label: 'Uppgift', kind: 'boolean', value: false },
          { id: 'zero', label: 'Belopp', kind: 'number', value: 0 },
        ],
      },
    },
  ];
  const conflict: DraftConflict = {
    kind: 'relationship',
    id: 'edge',
    current: null,
    type: null,
    missingEndpoints: ['source', 'target'],
  };
  const special = specialConflict(state, conflict);
  if (!special) throw new Error('Expected a blocked relationship');
  const onCorrect = vi.fn();
  const onApply = vi.fn();
  const props = {
    state,
    conflict,
    special,
    pending: false,
    disabled: false,
    onCorrect,
    onApply,
    onClose: vi.fn(),
  };
  const view = render(<SpecialConflictDetails {...props} />);
  const saved = within(screen.getByRole('region', { name: 'Sparat i kartan nu' }));
  const proposed = within(screen.getByRole('region', { name: 'Ditt förslag' }));
  expect(saved.getAllByText('Borttaget')).toHaveLength(2);
  for (const text of ['Alex i Umeå', 'Molnmusik', 'Tomt (Text)', 'Nej (Ja/nej)', '0 (Tal)'])
    expect(proposed.getByText(text)).toBeTruthy();
  expect(
    screen.getByText(/Sambandet kan inte läggas till eftersom sambandstypen saknas\./),
  ).toBeTruthy();
  expect(screen.getByText(/lägg till sambandstypen under Inställningar → Typer/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Rätta ändpunkter' }));
  expect(onCorrect).toHaveBeenCalledOnce();
  expect(onApply).not.toHaveBeenCalled();
  view.rerender(<SpecialConflictDetails {...props} disabled pending />);
  expect(screen.getByRole('button', { name: 'Rätta ändpunkter' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Ta bort sambandet ur ditt utkast' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(proposed.getByText('0 (Tal)')).toBeTruthy();
});

test('an unavailable object type leaves the entire proposal readable before explicitly discarding only that object', async () => {
  const state = emptyState();
  state.types = [];
  state.draft.changes = [
    {
      id: 'lo',
      before: null,
      type: objectType,
      after: {
        typeId: 'person',
        name: 'Lo',
        identity: 'unresolved',
        properties: [{ id: 'code', label: 'Kod', kind: 'text', value: '0012' }],
      },
    },
  ];
  const conflict: DraftConflict = { kind: 'object', id: 'lo', current: null, type: null };
  const special = specialConflict(state, conflict);
  if (!special) throw new Error('Expected a missing object type');
  const apply = vi.fn();
  render(
    <SpecialConflictDetails
      state={state}
      conflict={conflict}
      special={special}
      disabled={false}
      pending={false}
      onApply={apply}
      onClose={vi.fn()}
    />,
  );
  expect(
    within(screen.getByRole('region', { name: 'Sparat i kartan nu' })).getByText('Saknas'),
  ).toBeTruthy();
  const proposal = within(screen.getByRole('region', { name: 'Ditt förslag' }));
  expect(proposal.getByText('0012 (Text)')).toBeTruthy();
  expect(proposal.getByText('Identiteten behöver redas ut')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Rätta ändpunkter' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Ta bort objektet ur ditt utkast' }));
  expect(apply).toHaveBeenCalledOnce();
  expect(screen.getByText('Övriga objekt och samband i kartan påverkas inte.')).toBeTruthy();
});

test('a removed object comparison retains the saved property label and the replacement value without offering restoration', () => {
  const before: MapObject = {
    id: 'lo',
    householdId: 'home',
    revision: 1,
    typeId: 'person',
    name: 'Lo',
    properties: [{ id: 'note', label: 'Tidigare etikett', kind: 'text', value: 'Sparat' }],
  };
  const state = emptyState();
  state.draft.changes = [
    {
      id: 'lo',
      type: objectType,
      before,
      after: {
        ...before,
        properties: [{ id: 'note', label: 'Ny etikett', kind: 'text', value: 'Mitt förslag' }],
      },
    },
  ];
  const conflict: DraftConflict = { kind: 'object', id: 'lo', current: null };
  const special = specialConflict(state, conflict);
  if (!special) throw new Error('Expected removed-object conflict');
  render(
    <SpecialConflictDetails
      state={state}
      conflict={conflict}
      special={special}
      disabled={false}
      pending={false}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Acceptera borttagningen och kasta ditt förslag' }),
  ).toBeTruthy();
  const proposal = within(screen.getByRole('region', { name: 'Ditt förslag' }));
  expect(proposal.getByText('Ny etikett')).toBeTruthy();
  expect(proposal.getByText('Mitt förslag (Text)')).toBeTruthy();
  expect(proposal.getByText('Ditt föreslagna värde')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /återställ/i })).toBeNull();
});

test('a missing relationship type asks for ordinary correction and keeps closure available until a request is pending', async () => {
  const state = emptyState();
  state.relationshipTypes = [];
  state.draft.relationships = [
    {
      id: 'edge',
      before: null,
      type: relationshipType,
      after: { typeId: 'uses', sourceId: 'a', targetId: 'b' },
    },
  ];
  const conflict: DraftConflict = { kind: 'relationship', id: 'edge', current: null, type: null };
  const special = specialConflict(state, conflict);
  if (!special) throw new Error('Expected ordinary type correction');
  const close = vi.fn();
  const props = {
    state,
    conflict,
    special,
    disabled: true,
    pending: false,
    onClose: close,
    onApply: vi.fn(),
  };
  const view = render(<SpecialConflictDetails {...props} />);
  expect(screen.getByText('Behöver rättas')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Resultat av valen' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Stäng konfliktfönstret' }));
  expect(close).toHaveBeenCalledOnce();
  view.rerender(<SpecialConflictDetails {...props} pending />);
  expect(screen.getByRole('button', { name: 'Stäng konfliktfönstret' })).toHaveProperty(
    'disabled',
    true,
  );
});

test.each(['object', 'relationship'] as const)(
  'confirmed %s removal never claims to delete unrelated proposals or restore shared content',
  (kind) => {
    render(
      <SpecialConflictResult
        kind={kind}
        special={{ kind: 'removed', reason: '', warning: '' }}
        confirmed
      />,
    );
    expect(
      screen.getByText(
        kind === 'object' ? 'Objektet förblir borttaget.' : 'Sambandet förblir borttaget.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Övriga förslag i utkastet finns kvar.')).toBeTruthy();
    expect(screen.queryByText('Tas bort ur ditt utkast')).toBeNull();
  },
);

test('object reading distinguishes a removed field, a renamed false value and an explicit empty property alongside image removal', async () => {
  const before: MapObject = {
    id: 'lo',
    householdId: 'home',
    revision: 1,
    typeId: 'person',
    name: 'Lo',
    profileImageId: 'saved/image',
    properties: [
      { id: 'flag', label: 'Bekräftat', kind: 'boolean', value: false },
      { id: 'removed', label: 'Tidigare anteckning', kind: 'text', value: 'Sparat' },
    ],
  };
  const view = render(
    <ObjectReadDetails
      full
      showHeading={false}
      status="Aktuellt"
      row={{
        object: {
          ...before,
          profileImageId: undefined,
          properties: [
            { id: 'flag', label: 'Kontrollerat', kind: 'boolean', value: false },
            { id: 'empty', label: 'Anteckning', kind: 'text' },
          ],
        },
        before,
        type: objectType,
        beforeType: objectType,
        removed: false,
        proposal: 'Ändrat',
      }}
    />,
  );
  const value = (label: string) =>
    screen.getByText(label, { selector: 'dt' }).parentElement?.querySelector('dd');
  expect(value('Kontrollerat')?.textContent).toBe(
    'Sparat (Bekräftat): Nej (Ja/nej)◇ Ditt förslag: Nej (Ja/nej)',
  );
  expect(value('Tidigare anteckning')?.textContent).toBe(
    'Sparat (Tidigare anteckning): Sparat (Text)◇ Ditt förslag: Ej uppgivet',
  );
  expect(value('Anteckning')?.textContent).toBe('Sparat: Ej uppgivet◇ Ditt förslag: Tomt (Text)');
  expect(screen.getByRole('img', { name: 'Profilbild för Lo' }).getAttribute('src')).toBe(
    '/api/households/home/profile-images/saved%2Fimage',
  );
  await userEvent.click(screen.getByText('Sparade egenskaper i sin ordning'));
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Bekräftat: Nej (Ja/nej)',
    'Tidigare anteckning: Sparat (Text)',
  ]);
  view.rerender(<ObjectReadDetails full row={{ object: before, removed: false }} />);
  expect(screen.getByText('Borttagen typ')).toBeTruthy();
});

test('suppressed relationship proposals read their own historical type and captured identities without inventing a value for removed content', () => {
  const state = emptyState();
  state.draft.relationships = [
    {
      id: 'edge',
      type: relationshipType,
      before: null,
      after: null,
      removedWithObjects: ['source', 'other'],
      objectNames: { source: 'Alex i Umeå' },
      suppressed: {
        id: 'edge',
        type: { ...relationshipType, name: 'Tidigare betydelse' },
        before: null,
        after: {
          typeId: 'uses',
          sourceId: 'source',
          targetId: 'target',
          properties: [{ id: 'empty', label: 'Fråga', kind: 'boolean' }],
        },
        objectNames: { source: 'Alex i Umeå', target: 'Molnmusik' },
      },
    },
  ];
  const [proposal] = draftProposals(state.draft);
  render(<DraftProposalDetails proposal={proposal} />);
  const retained = within(screen.getByRole('region', { name: 'Följder av objektborttagning' }));
  expect(retained.getByText('Följer objektborttagning: Alex i Umeå, other.')).toBeTruthy();
  expect(retained.getByText('Tidigare betydelse')).toBeTruthy();
  expect(retained.getByText('Molnmusik')).toBeTruthy();
  expect(retained.getByText('Tomt (Ja/nej)')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Föreslagna värden' })).toBeNull();
});

test('historical merge reading preserves missing type snapshots, exact object identities and real endpoint names', async () => {
  const merge: ObjectMerge = {
    survivorId: 'lo',
    absorbedId: 'other',
    identityConfirmed: true,
    objects: [
      {
        id: 'lo',
        householdId: 'original/home',
        revision: 2,
        name: 'Lo',
        typeId: 'missing',
        profileImageId: 'old-image',
        properties: [{ id: 'note', label: 'Notering', kind: 'text', value: '' }],
      },
    ],
    types: [],
    objectNames: { lo: 'Lo vid granskningen', other: 'Det andra objektet' },
    relationships: [
      {
        id: 'edge',
        householdId: 'original/home',
        revision: 1,
        typeId: 'missing-edge',
        sourceId: 'lo',
        targetId: 'other',
        lifecycle: 'ended',
      },
    ],
    relationshipTypes: [],
  };
  render(<HistoricalMergeDetails merge={merge} />);
  await userEvent.click(screen.getByText('Granskade objekt före sammanslagningen'));
  expect(screen.getByText('Lo · Identitet: lo')).toBeTruthy();
  expect(screen.getByText(/Lo vid granskningen → missing-edge → Det andra objektet/)).toBeTruthy();
  expect(screen.getAllByText('Typens beskrivning: Ingen beskrivning')).toHaveLength(2);
  expect(
    screen.getByText('Benämning från målobjektet: Visar den ursprungliga riktningen'),
  ).toBeTruthy();
  expect(screen.getByText('Notering: Tom text (Text)')).toBeTruthy();
  expect(screen.getByText('Identitet: note')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Profilbild för Lo' }).getAttribute('src')).toBe(
    '/api/households/original%2Fhome/profile-images/old-image',
  );
});
