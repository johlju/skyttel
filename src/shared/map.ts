import type { Lifecycle } from './lifecycle.js';
import type { Property } from './properties.js';

export interface TypeDefinition {
  id: string;
  householdId: string;
  revision: number;
  name: string;
  description: string;
}
export interface ObjectType extends TypeDefinition {}
export interface ObjectTypeChange {
  id: string;
  before: ObjectType | null;
  after: ObjectType | null;
}
export interface RelationshipType extends TypeDefinition {
  forwardLabel?: string;
  reverseLabel?: string;
}
export interface RelationshipTypeChange {
  id: string;
  before: RelationshipType | null;
  after: RelationshipType | null;
}
/** Private authority granted only by explicitly reviewing the actual removed definition. */
export interface DefinitionRestoration<T extends TypeDefinition> {
  contentVersion: number;
  definition: T;
}
export interface DraftObjectTypeChange extends ObjectTypeChange {
  restoration?: DefinitionRestoration<ObjectType>;
}
export interface DraftRelationshipTypeChange extends RelationshipTypeChange {
  restoration?: DefinitionRestoration<RelationshipType>;
}

export interface ObjectValue {
  properties?: Property[];
  profileImageId?: string;
  iconId?: string;
  typeId: string;
  name: string;
  identity?: 'unspecified' | 'unresolved';
  lifecycle?: Lifecycle;
}
export interface MapObject extends ObjectValue {
  id: string;
  householdId: string;
  revision: number;
}
export interface DraftChange {
  proposedAt?: string;
  /** Private identifier of a complete object-form staging attempt. */
  stagingId?: string;
  id: string;
  before: MapObject | null;
  after: ObjectValue | null;
  type: ObjectType;
  beforeType?: ObjectType;
}
export interface ObjectMerge {
  survivorId: string;
  absorbedId: string;
  identityConfirmed: boolean;
  objects: MapObject[];
  types: ObjectType[];
  relationships: MapRelationship[];
  relationshipTypes: RelationshipType[];
  objectNames: Record<string, string>;
  imageCopy?: { sourceObjectId: string; sourceImageId: string; copiedImageId: string };
}
export interface MapDraft {
  version: number;
  changes: DraftChange[];
  relationships?: DraftRelationshipChange[];
  objectTypes?: DraftObjectTypeChange[];
  relationshipTypes?: DraftRelationshipTypeChange[];
}
export function draftChangeCount(draft?: MapDraft) {
  return draft
    ? draft.changes.length +
        (draft.relationships?.length ?? 0) +
        (draft.objectTypes?.length ?? 0) +
        (draft.relationshipTypes?.length ?? 0)
    : 0;
}
export interface ConflictActor {
  name: string;
  savedAt: string;
}
export interface MapState {
  removedDefinitions?: { objectTypes: ObjectType[]; relationshipTypes: RelationshipType[] };
  conflictActors?: Record<string, ConflictActor>;
  conflictPropertyActors?: Record<string, Record<string, ConflictActor>>;
  userId: string;
  contentVersion: number;
  types: ObjectType[];
  objects: MapObject[];
  removedObjects?: { object: MapObject; type?: ObjectType }[];
  relationshipTypes: RelationshipType[];
  relationships: MapRelationship[];
  draft: MapDraft;
}
export interface SaveReceipt {
  contentVersion: number;
  operationId: string;
  draftVersion: number;
  householdId: string;
  userId: string;
  savedAt: string;
  relationships?: SavedRelationshipChange[];
  actorName?: string;
  objectTypes?: ObjectTypeChange[];
  relationshipTypes?: RelationshipTypeChange[];
  changes: {
    before: MapObject | null;
    after: MapObject | null;
    type: ObjectType;
    beforeType?: ObjectType;
    merge?: ObjectMerge;
  }[];
}

interface SaveOperationIdentity {
  operationId: string;
  householdId: string;
  userId: string;
  draftVersion: number;
  contentVersion: number;
  createdAt: string;
}
export type SaveOperation = SaveOperationIdentity &
  (
    | { status: 'pending' }
    | { status: 'succeeded'; receipt: SaveReceipt }
    | { status: 'rejected'; error: string }
  );

export interface RelationshipValue {
  properties?: Property[];
  typeId: string;
  sourceId: string;
  targetId: string;
  lifecycle?: Lifecycle;
}
export interface MapRelationship extends RelationshipValue {
  id: string;
  householdId: string;
  revision: number;
}
export interface RelationshipChange {
  proposedAt?: string;
  id: string;
  before: MapRelationship | null;
  after: RelationshipValue | null;
  type: RelationshipType;
  beforeType?: RelationshipType;
  objectNames?: Record<string, string>;
}
export interface DraftRelationshipChange extends RelationshipChange {
  /** Server-issued authority to correct this retained proposal after endpoint loss. */
  endpointRecovery?: { removedRevision: number };
  // Object deletions that require this generated relationship deletion.
  removedWithObjects?: string[];
  /** Original private proposal retained while object removals suppress it. */
  suppressed?: RelationshipChange & {
    endpointRecovery?: { removedRevision: number };
  };
}
export interface SavedRelationshipChange extends RelationshipChange {
  after: MapRelationship | null;
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

/** Endpoint-blocked proposals stay in the draft, outside ordinary map readers. */
export function effectiveRelationships(state: MapState) {
  const ids = new Set(state.objects.map(({ id }) => id));
  for (const change of state.draft.changes) {
    if (change.after && (!change.before || ids.has(change.id))) ids.add(change.id);
    else ids.delete(change.id);
  }
  const valid = (edge: RelationshipValue) => ids.has(edge.sourceId) && ids.has(edge.targetId);
  return proposedRelationships(
    state.relationships.filter(valid),
    state.draft.relationships?.filter((change) => !change.after || valid(change.after)),
  );
}

export function proposedObjectTypes(saved: ObjectType[], changes: ObjectTypeChange[] = []) {
  const result = new Map(saved.map((type) => [type.id, type]));
  for (const change of changes) {
    if (change.after) result.set(change.id, change.after);
    else result.delete(change.id);
  }
  return [...result.values()];
}

export function proposedRelationshipTypes(
  saved: RelationshipType[],
  changes: RelationshipTypeChange[] = [],
) {
  const result = new Map(saved.map((type) => [type.id, type]));
  for (const change of changes) {
    if (change.after) result.set(change.id, change.after);
    else result.delete(change.id);
  }
  return [...result.values()];
}
