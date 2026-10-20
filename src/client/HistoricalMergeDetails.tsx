import type { SaveReceipt } from '../shared/map.js';
import { relationshipLabel } from '../shared/relationship-label.js';
import { HistoricalProperties } from './HistoricalProperties.js';
import { LifecycleDetails } from './Lifecycle.js';
import { ProfileImage } from './ProfileImage.js';

export function HistoricalMergeDetails({
  merge,
  householdId,
}: {
  merge: NonNullable<SaveReceipt['changes'][number]['merge']>;
  householdId?: string;
}) {
  return (
    <details>
      <summary>Granskade objekt före sammanslagningen</summary>
      {merge.objects.map((object) => {
        const type = merge.types.find((item) => item.id === object.typeId);
        return (
          <div key={object.id}>
            <p>
              {object.name} · Identitet: {object.id}
            </p>
            <p>Objekttyp: {type?.name}.</p>
            <p>Typens beskrivning: {type?.description || 'Ingen beskrivning'}</p>
            <ProfileImage
              householdId={householdId ?? object.householdId}
              value={object}
              typeName={type?.name}
            />
            <HistoricalProperties properties={object.properties} />
            <LifecycleDetails value={object} />
          </div>
        );
      })}
      {merge.relationships.map((edge) => {
        const type = merge.relationshipTypes.find((item) => item.id === edge.typeId);
        return (
          <div key={edge.id}>
            <p>
              Granskat samband:{' '}
              {relationshipLabel(
                edge,
                { relationshipTypes: merge.relationshipTypes },
                new Map(Object.entries(merge.objectNames).map(([id, name]) => [id, { name }])),
              )}
            </p>
            <p>Typens beskrivning: {type?.description || 'Ingen beskrivning'}</p>
            <p>Benämning från startobjektet: {type?.forwardLabel || type?.name}</p>
            <p>
              Benämning från målobjektet:{' '}
              {type?.reverseLabel || 'Visar den ursprungliga riktningen'}
            </p>
            <p>
              Identitet: {edge.id}. Från {edge.sourceId} till {edge.targetId}.
            </p>
            <HistoricalProperties properties={edge.properties} />
            <LifecycleDetails value={edge} />
          </div>
        );
      })}
    </details>
  );
}
