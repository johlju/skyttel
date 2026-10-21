import type { DraftConflict } from './draft-conflicts.js';
import type { MapDraft, ObjectType, RelationshipType, SaveOperation, SaveReceipt } from './map.js';
import type { SaveCheck } from './save-check.js';
import type { TaskDelivery } from './task-delivery.js';

export type TextAssistantReview = MapDraft & {
  contentVersion: number;
  readyToSave: boolean;
  conflicts: DraftConflict[];
  unresolvedIdentities: { kind: string; id: string }[];
  pendingOperations: SaveOperation[];
  current?: { types: ObjectType[]; relationshipTypes: RelationshipType[] };
};
export type MapSelection = { kind: 'object' | 'relationship'; id: string };
export type TextAssistantChange = { subject: string; action: string };
export type TextAssistantResult = {
  kind: 'draft' | 'restored' | 'history' | 'failure';
  /** Server-produced text grounded in checked MCP results or recorded failures. */
  message: string;
  /** Checked proposal changes made by this task, for the text conversation's final summary. */
  changes?: TextAssistantChange[];
};
/** Ephemeral FIFO completion, including its delivery origin and checked outcome. */
export type ConversationReply = {
  id: string;
  /** The instruction whose checked outcome this completion describes. */
  request?: string;
  text: string;
  revision?: number;
  source?: 'voice' | 'text';
  /** Voice poll handoff disposition; absent until that connection consumes the reply. */
  voiced?: boolean;
  reply?: string;
  requiredNotice?: string;
  questionPending?: boolean;
  questions?: string[];
  receipt?: SaveReceipt;
  result?: TextAssistantResult;
  /** A checked task failure, even when some draft changes succeeded first. */
  failed?: boolean;
  saveCheck?: SaveCheck;
};
export interface TextAssistantView {
  id: string;
  revision: number;
  /** Advances only when the conversation text and context are explicitly cleared. */
  contextRevision?: number;
  /** Server-calculated occupancy of the conversation, from 0 to 100. */
  contextPercentage?: number;
  /** A provider handoff is separate from clearing the visible conversation. */
  contextSummaryState?: 'needed' | 'summarizing' | 'failed';
  contextGeneration?: number;
  contextSummaries?: { id: string; text: string }[];
  /** Origin of the explicit reset; pre-release spoken work still gets its voice reply. */
  resetSource?: 'voice' | 'text';
  /** Startup handoff disposition for the reset statement. */
  replyVoiced?: boolean;
  /** Verified whole-draft discard, shown as conversation text. */
  discarded?: boolean;
  /** Accepted messages waiting on the server, excluding the current task. */
  queuedMessages?: number;
  taskId?: string;
  /** Origin of the current task; queued messages keep their own origin. */
  taskSource?: 'text' | 'voice';
  taskStatus?: 'queued' | 'working' | 'completed' | 'canceled' | 'expired';
  /** Process-local work only. Available text is not a delivery acknowledgement. */
  tasks?: {
    id: string;
    receivedAt: number;
    deadline: number;
    status: NonNullable<TextAssistantView['taskStatus']>;
    delivery?: TaskDelivery;
  }[];
  /** Completed replies remain available when the next queued task starts. */
  completedReplies?: ConversationReply[];
  canceled?: boolean;
  /** An explicitly authorized immutable save is durably registered and unfinished. */
  saving?: boolean;
  phase: 'ready' | 'working' | 'error' | 'recovery';
  /** Current public executor stage and recent actual MCP steps in this task. */
  activity?: string;
  activitySteps?: { id: string; text: string }[];
  review: TextAssistantReview;
  reply?: string;
  /** Provider conversation is never evidence of a saved or displayed result. */
  modelReply?: string;
  /** Mandatory server guidance, also included in reply for text display. */
  requiredNotice?: string;
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
