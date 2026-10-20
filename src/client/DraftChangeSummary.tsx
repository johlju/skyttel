import { hasEnded, type LifecycleValue } from '../shared/lifecycle.js';
import type {
  DraftChange,
  DraftRelationshipChange,
  MapDraft,
  ObjectType,
  RelationshipType,
} from '../shared/map.js';
import { objectIconLabel } from '../shared/object-icons.js';
import { propertyDifferences } from '../shared/properties.js';
import { lifecycleText } from './read-field-values.js';
import { relationshipDetails, relationshipTarget } from './relationship-description.js';

function valueText(value: string | number | boolean | undefined) {
  return value === undefined || value === ''
    ? 'Ej uppgivet'
    : value === true
      ? 'Ja'
      : value === false
        ? 'Nej'
        : String(value);
}
function difference(label: string, before: string, after: string) {
  return before === after ? [] : [`${label}: ${before} → ${after}`];
}
function lifecycleDifferences(before: LifecycleValue, after: LifecycleValue) {
  return [
    ...difference(
      'Gäller',
      hasEnded(before) ? 'Upphört' : 'Aktuellt',
      hasEnded(after) ? 'Upphört' : 'Aktuellt',
    ),
    ...difference('Status', lifecycleText(before.lifecycle), lifecycleText(after.lifecycle)),
  ];
}
export function objectDifferences({ before, after, type, beforeType }: DraftChange) {
  if (!before || !after) return [];
  return [
    ...difference('Namn', before.name, after.name),
    ...propertyDifferences(before.properties, after.properties),
    ...difference(
      'Ikon',
      objectIconLabel(before.iconId, (beforeType ?? type).name),
      objectIconLabel(after.iconId, type.name),
    ),
    ...difference('Objekttyp', (beforeType ?? type).name, type.name),
    ...lifecycleDifferences(before, after),
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
    ...difference('Namn', before.name, after.name),
    ...difference('Beskrivning', valueText(before.description), valueText(after.description)),
  ];
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
  if (change.removedWithObjects?.length)
    return [
      `Följer objektborttagning: ${change.removedWithObjects.map((id) => change.objectNames?.[id] ?? id).join(', ')}.`,
      ...(change.suppressed
        ? ['Ditt sambandsförslag bevaras och återkommer när objektborttagningen återtas.']
        : []),
    ];
  if (!change.before || !change.after) return [];
  const names = change.objectNames ?? {};
  const target = (value: NonNullable<typeof change.after>) => relationshipTarget(value, names);
  return [
    ...difference(
      'Från',
      names[change.before.sourceId] ?? change.before.sourceId,
      names[change.after.sourceId] ?? change.after.sourceId,
    ),
    ...difference('Sambandstyp', (change.beforeType ?? change.type).name, change.type.name),
    ...difference('Till', target(change.before), target(change.after)),
    ...propertyDifferences(change.before.properties, change.after.properties),
    ...lifecycleDifferences(change.before, change.after),
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
            {lines(relationshipDifferences(change))}
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
