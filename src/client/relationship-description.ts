import type { RelationshipValue } from '../shared/map.js';

export function relationshipDetails(
  value: RelationshipValue,
  forwardLabel = 'Samband',
  objectNames: Record<string, string> = {},
) {
  const source = objectNames[value.sourceId] ?? value.sourceId;
  const target = value.targetId
    ? (objectNames[value.targetId] ?? value.targetId)
    : value.knowledge === 'none'
      ? 'Uttryckligen inget'
      : value.knowledge === 'unresolved'
        ? 'Olöst identitet'
        : 'Okänt';
  return `${source} → ${forwardLabel} → ${target}${value.knowledge === 'uncertain' ? ' (osäkert uppgivet)' : ''}`;
}
