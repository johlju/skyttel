import { type FinancialFact, financialFields } from '../shared/financial-facts.js';
import type {
  DraftChange,
  DraftRelationshipChange,
  MapDraft,
  ObjectType,
  RelationshipType,
} from '../shared/map.js';
import { objectIconLabel } from '../shared/object-icons.js';
import { builtinPresentationChanges } from '../shared/object-properties.js';
import { relationshipDetails } from './relationship-description.js';

function valueText(value: string | number | boolean | undefined) {
  return value === undefined || value === ''
    ? 'Ej uppgivet'
    : value === true
      ? 'Ja'
      : value === false
        ? 'Nej'
        : String(value);
}
function factText(fact: FinancialFact | undefined) {
  if (!fact) return 'Ej uppgivet';
  const text =
    fact.knowledge === 'unknown'
      ? 'Okänt'
      : fact.knowledge === 'none'
        ? 'Uttryckligen inget'
        : `${fact.value}${fact.knowledge === 'uncertain' ? ' (osäkert uppgivet)' : ''}`;
  return `${text}${fact.reportedOn ? ` (${fact.reportedOn})` : ''}`;
}
function difference(label: string, before: string, after: string) {
  return before === after ? [] : [`${label}: ${before} → ${after}`];
}
export function objectDifferences({ before, after, type, beforeType }: DraftChange) {
  if (!before || !after) return [];
  const fields = new Map(
    [...((beforeType ?? type).fields ?? []), ...(type.fields ?? [])].map((field) => [
      field.id,
      field,
    ]),
  );
  return [
    ...difference('Namn', before.name, after.name),
    ...difference(
      'Ikon',
      objectIconLabel(before.iconId, (beforeType ?? type).name),
      objectIconLabel(after.iconId, type.name),
    ),
    ...difference('Beskrivning', valueText(before.description), valueText(after.description)),
    ...difference('Objekttyp', (beforeType ?? type).name, type.name),
    ...financialFields.flatMap(({ key, label }) =>
      difference(
        label,
        factText(before.financialFacts?.[key]),
        factText(after.financialFacts?.[key]),
      ),
    ),
    ...[...fields.values()].flatMap((field) =>
      difference(
        field.name,
        valueText(before.customValues?.[field.id]),
        valueText(after.customValues?.[field.id]),
      ),
    ),
    ...difference(
      'Gäller',
      before.lifecycle === 'ended' ? 'Upphört' : 'Aktuellt',
      after.lifecycle === 'ended' ? 'Upphört' : 'Aktuellt',
    ),
    ...difference('Identitet', identity(before.identity), identity(after.identity)),
    ...(before.profileImageId !== after.profileImageId
      ? [
          `Profilbild: ${before.profileImageId ? 'Bild finns' : 'Ingen bild'} → ${after.profileImageId ? 'Ny bild' : 'Ingen bild'}`,
        ]
      : []),
  ];
}
function identity(value: 'unspecified' | 'unresolved' | undefined) {
  return value === 'unspecified'
    ? 'Ospecificerat objekt'
    : value === 'unresolved'
      ? 'Olöst identitet'
      : 'Identifierat';
}
export function typeDifferences(
  before: ObjectType & RelationshipType,
  after: ObjectType & RelationshipType,
) {
  const changes = [
    ...builtinPresentationChanges(before, after),
    ...difference('Beskrivning', valueText(before.description), valueText(after.description)),
  ];
  if ('fields' in before || 'fields' in after) {
    const oldFields = before.fields ?? [];
    const newFields = after.fields ?? [];
    const kinds = { text: 'text', number: 'tal', date: 'datum', boolean: 'ja/nej' };
    for (const id of new Set([...oldFields, ...newFields].map((field) => field.id))) {
      const oldField = oldFields.find((field) => field.id === id);
      const newField = newFields.find((field) => field.id === id);
      changes.push(
        ...difference(
          'Eget fält',
          oldField
            ? `${oldField.name} (${kinds[oldField.kind]}): ${oldField.description}`
            : 'Inget',
          newField
            ? `${newField.name} (${kinds[newField.kind]}): ${newField.description}`
            : 'Borttaget',
        ),
      );
    }
  }
  for (const key of ['forwardLabel', 'reverseLabel'] as const)
    changes.push(
      ...difference(
        key === 'forwardLabel' ? 'Framåtriktning' : 'Omvänd riktning',
        valueText(before[key]),
        valueText(after[key]),
      ),
    );
  return changes;
}
function action(before: unknown, after: unknown) {
  return after ? (before ? 'Rätta' : 'Lägg till') : 'Ta bort';
}

export function relationshipDifferences(change: DraftRelationshipChange) {
  if (!change.before || !change.after) return [];
  const describe = (value: NonNullable<typeof change.after>) =>
    relationshipDetails(value, change.type.forwardLabel ?? change.type.name, change.objectNames);
  return [
    ...difference('Samband', describe(change.before), describe(change.after)),
    ...[
      ...new Map(
        [...(change.beforeType?.fields ?? []), ...(change.type.fields ?? [])].map((field) => [
          field.id,
          field,
        ]),
      ).values(),
    ].flatMap((field) =>
      difference(
        field.name,
        valueText(change.before?.customValues?.[field.id]),
        valueText(change.after?.customValues?.[field.id]),
      ),
    ),
    ...difference(
      'Gäller',
      change.before.lifecycle === 'ended' ? 'Upphört' : 'Aktuellt',
      change.after.lifecycle === 'ended' ? 'Upphört' : 'Aktuellt',
    ),
    ...difference('Slutdatum', factText(change.before.endDate), factText(change.after.endDate)),
  ];
}
function lines(values: string[]) {
  return values.map((line) => <div key={line}>{line}</div>);
}

export function DraftChangeSummary({ review }: { review: MapDraft }) {
  return (
    <ul aria-label="Alla föreslagna ändringar" className="draft-change-summary">
      {review.changes.map((change) => (
        <li key={`object-${change.id}`}>
          <span>
            {action(change.before, change.after)}: {change.before?.name ?? change.after?.name}
          </span>
          {lines(objectDifferences(change))}
        </li>
      ))}
      {review.relationships?.map((change) => {
        const describe = (value: NonNullable<typeof change.after>) =>
          relationshipDetails(
            value,
            change.type.forwardLabel ?? change.type.name,
            change.objectNames,
          );
        return (
          <li key={`relationship-${change.id}`}>
            {action(change.before, change.after)} samband:{' '}
            {change.before && change.after
              ? `${describe(change.before)} → ${describe(change.after)}`
              : change.after
                ? describe(change.after)
                : change.before
                  ? describe(change.before)
                  : ''}
            {change.before &&
              change.after &&
              lines([
                ...[
                  ...new Map(
                    [...(change.beforeType?.fields ?? []), ...(change.type.fields ?? [])].map(
                      (field) => [field.id, field],
                    ),
                  ).values(),
                ].flatMap((field) =>
                  difference(
                    field.name,
                    valueText(change.before?.customValues?.[field.id]),
                    valueText(change.after?.customValues?.[field.id]),
                  ),
                ),
                ...difference(
                  'Gäller',
                  change.before.lifecycle === 'ended' ? 'Upphört' : 'Aktuellt',
                  change.after.lifecycle === 'ended' ? 'Upphört' : 'Aktuellt',
                ),
                ...difference(
                  'Slutdatum',
                  factText(change.before.endDate),
                  factText(change.after.endDate),
                ),
              ])}
          </li>
        );
      })}
      {(
        [
          ['Objekttyp', review.objectTypes],
          ['Sambandstyp', review.relationshipTypes],
        ] as const
      ).flatMap(([label, changes]) =>
        changes?.map((change) => (
          <li key={`${label}-${change.id}`}>
            {action(change.before, change.after)} {label}:{' '}
            {change.before && change.after
              ? `${change.before.name} → ${change.after.name}`
              : (change.after?.name ?? change.before?.name)}
            {change.before && change.after && lines(typeDifferences(change.before, change.after))}
          </li>
        )),
      )}
    </ul>
  );
}
