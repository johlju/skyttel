import type { DraftConflict } from './draft-conflicts.js';
import type { MapDraft, ObjectType, RelationshipType, SaveOperation, SaveReceipt } from './map.js';
import type { SaveCheck } from './save-check.js';

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
/** Ephemeral FIFO completion, including its delivery origin and checked outcome. */
export type ConversationReply = {
  id: string;
  text: string;
  revision?: number;
  source?: 'voice' | 'text';
  /** Voice poll handoff disposition; absent until that connection consumes the reply. */
  voiced?: boolean;
  reply?: string;
  questionPending?: boolean;
  receipt?: SaveReceipt;
  result?: TextAssistantResult;
  saveCheck?: SaveCheck;
};
export interface TextAssistantView {
  id: string;
  revision: number;
  /** Advances only when the conversation text and context are explicitly cleared. */
  contextRevision?: number;
  /** Server-calculated occupancy of the conversation, from 0 to 100. */
  contextPercentage?: number;
  /** Origin of the explicit reset; pre-release spoken work still gets its voice reply. */
  resetSource?: 'voice' | 'text';
  /** Startup handoff disposition for the reset statement. */
  replyVoiced?: boolean;
  /** Verified whole-draft discard, shown as conversation text. */
  discarded?: boolean;
  /** Accepted messages waiting on the server, excluding the current task. */
  queuedMessages?: number;
  taskId?: string;
  taskStatus?: 'queued' | 'working' | 'completed' | 'canceled';
  /** Completed replies remain available when the next queued task starts. */
  completedReplies?: ConversationReply[];
  canceled?: boolean;
  phase: 'ready' | 'working' | 'error' | 'recovery';
  review: TextAssistantReview;
  reply?: string;
  /** Provider conversation is never evidence of a saved or displayed result. */
  modelReply?: string;
  /** Explicit follow-up questions from a validated assistant action, never a save receipt. */
  questions?: string[];
  /** The server has asked a necessary question in this conversation and awaits an answer. */
  questionPending?: boolean;
  result?: TextAssistantResult;
  error?: string;
  receipt?: SaveReceipt;
  saveCheck?: SaveCheck;
  operations: SaveOperation[];
  selection?: (
    | { objectId: string; kind?: undefined; id?: undefined }
    | (MapSelection & { objectId?: string })
  ) & { revision: number; draftVersion?: number; contentVersion?: number };
  displayedSelection?: string;
  displayedItem?: MapSelection;
}
