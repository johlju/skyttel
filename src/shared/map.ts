export interface ObjectType {
  id: string;
  householdId: string;
  revision: number;
  name: string;
  description: string;
}
export interface ObjectValue {
  typeId: string;
  name: string;
  description: string;
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
}
export interface MapState {
  types: ObjectType[];
  objects: MapObject[];
  draft: MapDraft;
}
export interface SaveReceipt {
  operationId: string;
  draftVersion: number;
  householdId: string;
  userId: string;
  savedAt: string;
  changes: { before: MapObject | null; after: MapObject | null; type: ObjectType }[];
}
