import type { RelationshipValue } from './map.js';

/** Omitted wording uses a neutral connection phrase, independently of the category. */
export function relationshipVerb(value: Pick<RelationshipValue, 'verb'>) {
  return value.verb ?? 'har samband med';
}

export function relationshipReverseVerb(value: Pick<RelationshipValue, 'reverseVerb'>) {
  return value.reverseVerb;
}
