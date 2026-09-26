import type { DraftConflict } from './draft-conflicts.js';
import type { MapDraft, ObjectType, RelationshipType, SaveOperation, SaveReceipt } from './map.js';

export type TextAssistantReview = MapDraft & {
  contentVersion: number;
  readyToSave: boolean;
  conflicts: DraftConflict[];
  unresolvedIdentities: { kind: string; id: string }[];
  pendingOperations: SaveOperation[];
  current?: { types: ObjectType[]; relationshipTypes: RelationshipType[] };
};
export type MapSelection = { kind: 'object' | 'relationship'; id: string };
export type TextAssistantResult = {
  kind: 'draft' | 'undo' | 'restored' | 'history' | 'failure';
  /** Server-produced text grounded in checked MCP results or recorded failures. */
  message: string;
};
export interface TextAssistantView {
  id: string;
  revision: number;
  phase: 'ready' | 'working' | 'error' | 'recovery';
  review: TextAssistantReview;
  reply?: string;
  /** Provider conversation is never evidence of a saved or displayed result. */
  modelReply?: string;
  result?: TextAssistantResult;
  error?: string;
  receipt?: SaveReceipt;
  operations: SaveOperation[];
  selection?: (
    | { objectId: string; kind?: undefined; id?: undefined }
    | (MapSelection & { objectId?: string })
  ) & { revision: number; draftVersion?: number; contentVersion?: number };
  displayedSelection?: string;
  displayedItem?: MapSelection;
}
