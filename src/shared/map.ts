export interface TypeDefinition {
  id: string;
  householdId: string;
  revision: number;
  name: string;
  description: string;
}
export type ObjectType = TypeDefinition;
export type RelationshipType = TypeDefinition;

export interface ObjectValue {
  typeId: string;
  name: string;
  description: string;
  identity?: 'unspecified' | 'unresolved';
}
export interface MapObject extends ObjectValue {
  id: string;
  householdId: string;
  revision: number;
}
export interface DraftChange {
  id: string;
  before: MapObject | null;
  after: ObjectValue | null;
  type: ObjectType;
}
export interface MapDraft {
  version: number;
  changes: DraftChange[];
  relationships?: DraftRelationshipChange[];
}
export interface MapState {
  types: ObjectType[];
  objects: MapObject[];
  relationshipTypes: RelationshipType[];
  relationships: MapRelationship[];
  draft: MapDraft;
}
export interface SaveReceipt {
  operationId: string;
  draftVersion: number;
  householdId: string;
  userId: string;
  savedAt: string;
  relationships?: RelationshipChange[];
  changes: { before: MapObject | null; after: MapObject | null; type: ObjectType }[];
}

export type Knowledge = 'known' | 'unknown' | 'none' | 'uncertain' | 'unresolved';
export interface RelationshipValue {
  typeId: string;
  sourceId: string;
  targetId: string | null;
  knowledge: Knowledge;
}
export interface MapRelationship extends RelationshipValue {
  id: string;
  householdId: string;
  revision: number;
}
export interface RelationshipChange {
  id: string;
  before: MapRelationship | null;
  after: RelationshipValue | null;
  type: RelationshipType;
  objectNames?: Record<string, string>;
}
export interface DraftRelationshipChange extends RelationshipChange {
  // Object deletions that require this generated relationship deletion.
  removedWithObjects?: string[];
}

export function proposedRelationships(
  saved: MapRelationship[],
  changes: RelationshipChange[] = [],
) {
  const result = new Map(saved.map((value) => [value.id, value]));
  for (const change of changes) {
    if (change.after)
      result.set(change.id, {
        ...change.after,
        id: change.id,
        householdId: change.type.householdId,
        revision: change.before?.revision ?? 0,
      });
    else result.delete(change.id);
  }
  return result;
}
