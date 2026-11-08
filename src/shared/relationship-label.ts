import type { MapState, RelationshipValue } from './map.js';
import { relationshipReverseVerb, relationshipVerb } from './relationship-verb.js';

export function relationshipLabel(
  value: RelationshipValue,
  _state: Pick<MapState, 'relationshipTypes'>,
  objects: Map<string, { name: string }>,
  perspectiveId?: string,
) {
  const source = objects.get(value.sourceId)?.name ?? value.sourceId;
  const target = objects.get(value.targetId)?.name ?? value.targetId;
  const reverse = perspectiveId === value.targetId && relationshipReverseVerb(value);
  return `${reverse ? target : source} → ${reverse || relationshipVerb(value)} → ${reverse ? source : target}`;
}
