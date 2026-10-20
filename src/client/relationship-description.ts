import type { RelationshipValue } from '../shared/map.js';

export function relationshipTarget(
  value: RelationshipValue,
  objectNames: Record<string, string> = {},
) {
  return objectNames[value.targetId] ?? value.targetId;
}

export function relationshipDetails(
  value: RelationshipValue,
  forwardLabel = 'Samband',
  objectNames: Record<string, string> = {},
) {
  const source = objectNames[value.sourceId] ?? value.sourceId;
  const target = relationshipTarget(value, objectNames);
  return `${source} → ${forwardLabel} → ${target}`;
}
