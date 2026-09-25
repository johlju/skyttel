export type ErasureKind = 'object' | 'relationship' | 'objectType' | 'relationshipType';
export type ErasureSelection = { kind: ErasureKind; id: string }[];
export type ErasureItem = { id: string; name: string };
export type ErasureReview = {
  token: string;
  selection: ErasureSelection;
  objects: ErasureItem[];
  relationships: ErasureItem[];
  objectTypes: ErasureItem[];
  relationshipTypes: ErasureItem[];
  images: number;
  imageVersions: { id: string; objectId: string }[];
  privateImages: number;
  positions: number;
  privateObjects: number;
  privateRelationships: number;
  historyChanges: number;
  privateChanges: number;
  contentVersion: number;
};
export type ErasureStatus = {
  operationId: string;
  phase: 'prepared' | 'cleanup' | 'completed' | 'failed';
  counts: {
    objects: number;
    relationships: number;
    objectTypes: number;
    relationshipTypes: number;
    images: number;
  };
};
