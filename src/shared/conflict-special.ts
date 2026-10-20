import { conflictChange } from './conflict-properties.js';
import type { DraftConflict } from './draft-conflicts.js';
import type { MapState } from './map.js';

export type SpecialConflict = {
  kind:
    | 'removed'
    | 'removed-definition'
    | 'discard-relationship'
    | 'own-removal'
    | 'missing-object-type'
    | 'outside-correction';
  reason: string;
  warning: string;
  instruction?: string;
  afterDiscard?: string;
  additionalBlockers?: { reason: string; warning: string; instruction?: string }[];
  action?:
    | 'Acceptera borttagningen och kasta ditt förslag'
    | 'Ta bort sambandet ur ditt utkast'
    | 'Ta bort objektet ur ditt utkast'
    | 'Lägg valen i utkastet';
};

const missingRelationshipType = {
  reason: 'Den föreslagna sambandstypen saknas i det aktuella underlaget.',
  warning: 'Sambandet kan inte läggas till eftersom sambandstypen saknas.',
  instruction:
    'Stäng konfliktfönstret och lägg till sambandstypen under Inställningar → Typer. Justera sedan sambandet i den vanliga sambandsdialogen så att det använder rätt typ och lägg ändringen i ditt utkast. När du kommer tillbaka kontrolleras konflikten på nytt.',
};

/** A missing saved record differs from a proposal that has never been saved. */
export function specialConflict(state: MapState, conflict: DraftConflict): SpecialConflict | null {
  const change = conflictChange(state, conflict);
  const correctionInstruction =
    conflict.kind === 'object'
      ? 'Stäng konfliktfönstret och rätta uppgiften i den vanliga objektdialogen. Lägg ändringen i ditt utkast och kom sedan tillbaka hit. Ditt förslag ligger kvar under tiden.'
      : 'Stäng konfliktfönstret och rätta uppgiften i den vanliga sambandsdialogen. Lägg ändringen i ditt utkast och kom sedan tillbaka hit. Ditt förslag ligger kvar under tiden.';
  if (
    (conflict.kind === 'objectType' || conflict.kind === 'relationshipType') &&
    !conflict.current &&
    change?.after
  ) {
    return {
      kind: 'removed-definition',
      reason: 'Typdefinitionen saknas nu i kartan. Ditt förslag innehåller ändringar i den.',
      warning: '',
      action: 'Lägg valen i utkastet',
    };
  }
  if (
    (conflict.kind === 'object' || conflict.kind === 'relationship') &&
    change?.before &&
    !conflict.current &&
    !(conflict.kind === 'relationship' && conflict.missingEndpoints?.length)
  ) {
    const object = conflict.kind === 'object';
    return {
      kind: 'removed',
      reason: object
        ? 'Objektet togs bort från den gemensamma kartan medan du redigerade det.'
        : 'Sambandet togs bort från den gemensamma kartan medan du redigerade det.',
      warning: object
        ? 'Objektet är borttaget. Ditt ändringsförslag kan inte återställa det.'
        : 'Ett ändringsförslag kan inte återställa ett borttaget samband.',
      action: 'Acceptera borttagningen och kasta ditt förslag',
    };
  }
  if (
    (conflict.kind === 'object' || conflict.kind === 'relationship') &&
    conflict.current &&
    change &&
    !change.after
  ) {
    const actor =
      state.conflictActors?.[`${conflict.kind}:${conflict.id}`]?.name ?? 'En annan användare';
    return {
      kind: 'own-removal',
      reason: conflict.connections?.length
        ? 'Du föreslår borttagning. Ytterligare ett sparat samband berör nu objektet.'
        : `Du föreslår borttagning. ${actor} sparade ändringar i ${conflict.kind === 'object' ? 'objektet' : 'sambandet'} innan du hann spara ditt förslag.`,
      warning: '',
      action: 'Lägg valen i utkastet',
    };
  }
  if (
    conflict.kind === 'relationship' &&
    (conflict.duplicates?.length || conflict.missingEndpoints?.length)
  ) {
    const duplicate = Boolean(conflict.duplicates?.length);
    const savedDuplicate = conflict.duplicates?.some((edge) =>
      state.relationships.some((saved) => saved.id === edge.id),
    );
    return {
      kind: 'discard-relationship',
      reason: duplicate
        ? savedDuplicate
          ? 'Ett sparat samband har redan samma typ, riktning och objekt.'
          : 'Ett annat förslag i ditt utkast har samma typ, riktning och objekt.'
        : 'Ett objekt som sambandet pekar på saknas.',
      warning: duplicate
        ? 'Sambandet finns redan. Ta bort det föreslagna sambandet ur ditt utkast.'
        : 'Sambandet kan inte läggas till eftersom ett objekt som det pekar på saknas.',
      action: 'Ta bort sambandet ur ditt utkast',
      afterDiscard: duplicate
        ? savedDuplicate
          ? 'Det redan sparade sambandet och dess uppgifter behålls.'
          : 'Det andra förslaget i ditt utkast och dess uppgifter behålls.'
        : 'Övrigt utkastarbete finns kvar. Du kan också rätta ändpunkterna och behålla förslaget.',
      ...(!duplicate
        ? {
            instruction:
              'Förslaget är blockerat och visas inte som ett aktuellt samband. Hela utkastet kan sparas först när du har rättat ändpunkterna eller kastat förslaget. Välj Rätta ändpunkter för att behålla förslagets uppgifter.',
          }
        : {}),
      ...(conflict.type === null ? { additionalBlockers: [missingRelationshipType] } : {}),
    };
  }
  if ((conflict.kind === 'object' || conflict.kind === 'relationship') && conflict.type === null) {
    const object = conflict.kind === 'object';
    return {
      kind: object ? 'missing-object-type' : 'outside-correction',
      reason: object
        ? 'Den föreslagna objekttypen saknas i det aktuella underlaget.'
        : missingRelationshipType.reason,
      warning: object
        ? 'Objektet kan inte läggas till eftersom objekttypen saknas.'
        : missingRelationshipType.warning,
      instruction: object
        ? 'Stäng konfliktfönstret och lägg till objekttypen under Inställningar → Typer. Ditt förslag ligger kvar. Alternativt kan du ta bort objektet ur ditt utkast nedan.'
        : missingRelationshipType.instruction,
      ...(object ? { action: 'Ta bort objektet ur ditt utkast' as const } : {}),
      ...(object ? { afterDiscard: 'Övriga objekt och samband i kartan påverkas inte.' } : {}),
    };
  }
  if (
    (conflict.kind === 'object' || conflict.kind === 'relationship') &&
    change?.after &&
    !change.before &&
    !conflict.current &&
    conflict.type
  ) {
    return {
      kind: 'outside-correction',
      reason: `${conflict.kind === 'object' ? 'Objektet' : 'Sambandet'} har ännu inte sparats i kartan. Typdefinitionen har ändrats medan du arbetade med förslaget.`,
      warning: `Typdefinitionen har ändrats: ${conflict.type.name}.`,
      instruction: correctionInstruction,
    };
  }
  return null;
}
