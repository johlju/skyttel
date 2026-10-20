import { hasEnded } from '../shared/lifecycle.js';
import type {
  MapDraft,
  ObjectType,
  ObjectValue,
  RelationshipType,
  RelationshipValue,
} from '../shared/map.js';
import { propertyValueText } from '../shared/properties.js';
import {
  draftProposalDescriptors,
  proposedRelationshipNames,
} from './draft-proposal-descriptors.js';
import { objectPropertyValues } from './ObjectReadDetails.js';
import { ProfileImage } from './ProfileImage.js';
import { lifecycleText } from './read-field-values.js';

type Property = { key: string; label: string; value: string };
export type DraftProposal = {
  key: string;
  name: string;
  kind: string;
  before: Property[] | null;
  after: Property[] | null;
  images?: { before?: ObjectValue; after?: ObjectValue; householdId: string };
  suppression?: { causes: string[]; values: Property[] | null };
};
function text(value: string | number | boolean | undefined) {
  return value === undefined || value === ''
    ? 'Ej uppgivet'
    : value === true
      ? 'Ja'
      : value === false
        ? 'Nej'
        : String(value);
}
function property(key: string, label: string, value: string): Property {
  return { key, label, value };
}
function object(value: ObjectValue | null, type: ObjectType): Property[] | null {
  if (!value) return null;
  return [
    ...Array.from(objectPropertyValues(value, type)).flatMap(([key, entry]) => [
      ...(key === 'lifecycle'
        ? [property('applies', 'Gäller', hasEnded(value) ? 'Upphört' : 'Aktuellt')]
        : []),
      { key, ...entry },
    ]),
  ];
}
function relationship(
  value: RelationshipValue | null,
  type: RelationshipType,
  names: Record<string, string>,
): Property[] | null {
  if (!value) return null;
  return [
    property('source', 'Från', names[value.sourceId] ?? value.sourceId),
    property('type', 'Sambandstyp', type.name),
    property('target', 'Till', names[value.targetId] ?? value.targetId),
    property('applies', 'Gäller', hasEnded(value) ? 'Upphört' : 'Aktuellt'),
    property('lifecycle', 'Status', lifecycleText(value.lifecycle)),
    ...(value.properties ?? []).map((entry) =>
      property(`property:${entry.id}`, entry.label, propertyValueText(entry)),
    ),
  ];
}
export function definitionPropertyValues(
  value: (ObjectType & RelationshipType) | null,
): Property[] | null {
  if (!value) return null;
  return [
    property('name', 'Namn', value.name),
    property('description', 'Beskrivning', text(value.description)),
    ...(value.forwardLabel !== undefined
      ? [property('forward', 'Framåtriktning', text(value.forwardLabel))]
      : []),
    ...(value.reverseLabel !== undefined
      ? [property('reverse', 'Omvänd riktning', text(value.reverseLabel))]
      : []),
  ];
}
/** Uses the proposal's historical type snapshots, independently of current map filters. */
export function draftProposals(draft: MapDraft): DraftProposal[] {
  return draftProposalDescriptors(draft).map((proposal) => {
    const { key, name, kind } = proposal;
    if (proposal.kind === 'Objekt') {
      const change = proposal.change;
      return {
        key,
        name,
        kind,
        before: object(change.before, change.beforeType ?? change.type),
        after: object(change.after, change.type),
        images: {
          before: change.before ?? undefined,
          after: change.after ?? undefined,
          householdId: change.type.householdId,
        },
      };
    }
    if (proposal.kind === 'Samband') {
      const change = proposal.change;
      return {
        key,
        name,
        kind,
        before: relationship(
          change.before,
          change.beforeType ?? change.type,
          change.objectNames ?? {},
        ),
        after: relationship(change.after, change.type, proposedRelationshipNames(draft, change)),
        ...(change.removedWithObjects?.length
          ? {
              suppression: {
                causes: change.removedWithObjects.map((id) => change.objectNames?.[id] ?? id),
                values: change.suppressed
                  ? relationship(
                      change.suppressed.after,
                      change.suppressed.type,
                      change.suppressed.objectNames ?? {},
                    )
                  : null,
              },
            }
          : {}),
      };
    }
    return {
      key,
      name,
      kind,
      before: definitionPropertyValues(proposal.change.before),
      after: definitionPropertyValues(proposal.change.after),
    };
  });
}
export function DraftProposalDetails({ proposal }: { proposal: DraftProposal }) {
  const paired = !!proposal.before && !!proposal.after;
  const keys = [
    ...new Set([...(proposal.before ?? []), ...(proposal.after ?? [])].map(({ key }) => key)),
  ];
  return (
    <>
      <p className="draft-read-note">
        {proposal.kind} ·{' '}
        {proposal.after ? (proposal.before ? 'Ändras' : 'Läggs till') : 'Tas bort'}. Här läser du
        förslaget. Rättningar görs i det ordinarie flödet.
      </p>
      <div className={`draft-values${paired ? ' draft-values-pair' : ''}`}>
        {(
          [
            ['Sparade värden', proposal.before],
            ['Föreslagna värden', proposal.after],
          ] as const
        ).map(
          ([title, values]) =>
            values && (
              <section key={title}>
                <h3>{title}</h3>
                <dl>
                  {keys.map((key) => {
                    const before = proposal.before?.find((item) => item.key === key);
                    const after = proposal.after?.find((item) => item.key === key);
                    const entry = values.find((item) => item.key === key);
                    const changed =
                      paired &&
                      (before?.value !== after?.value ||
                        before?.label !== after?.label ||
                        (key === 'profileImage' &&
                          proposal.images?.before?.profileImageId !==
                            proposal.images?.after?.profileImageId));
                    const image =
                      title === 'Sparade värden' ? proposal.images?.before : proposal.images?.after;
                    return (
                      <div key={key} className={changed ? 'draft-value-changed' : undefined}>
                        <dt>
                          {entry?.label ?? before?.label ?? after?.label}
                          {changed && <span> · ändrat</span>}
                        </dt>
                        <dd>
                          {entry?.value ?? 'Ej uppgivet'}
                          {key === 'profileImage' && image?.profileImageId && proposal.images && (
                            <ProfileImage householdId={proposal.images.householdId} value={image} />
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ),
        )}
      </div>
      {proposal.suppression && (
        <section aria-label="Följder av objektborttagning">
          <p>Följer objektborttagning: {proposal.suppression.causes.join(', ')}.</p>
          {proposal.suppression.values && (
            <>
              <h3>Bevarat sambandsförslag</h3>
              <p>
                Förslaget återkommer för granskning när alla berörda objektborttagningar återtas.
                Separata sambandsborttagningar behålls.
              </p>
              <dl>
                {proposal.suppression.values.map(({ key, label, value }) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
      )}
    </>
  );
}
