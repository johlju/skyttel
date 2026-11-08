import type { ResponseInputItem } from 'openai/resources/responses/responses';
import type { ConversationModelChoice } from '../shared/conversation-model.js';
import type { PendingPartReference, TextAssistantView } from '../shared/text-assistant.js';
import type { PendingPartsState } from './pending-parts.js';
import type { QueuedRequestReference } from './queued-request-context.js';
import type { AssistantResultSnapshot } from './text-assistant-snapshot.js';

export type ConversationMessage = {
  id: string;
  text: string;
  voice: boolean;
  restate?: boolean;
  /** Server-owned evidence bound at queued admission, never new authority. */
  queuedReference?: QueuedRequestReference | null;
  /** A manual scope change cannot be crossed by an older queued save request. */
  saveScopeChanged?: boolean;
  answerTo?: PendingPartReference[];
  contentVersion: number;
  owner: string;
  receivedAt: number;
  deadline: number;
};
type AcceptedMessage = {
  hash: string;
  voice: boolean;
  status: NonNullable<TextAssistantView['taskStatus']>;
  result?: AssistantResultSnapshot;
  receivedAt: number;
  deadline: number;
};
/** The single owner of recoverable conversation data; no live process resources. */
export type ConversationState = TextAssistantView & {
  modelChoice: ConversationModelChoice;
  readonly consentTextVersion: number;
  pendingPartsLedger: PendingPartsState;
  answers?: string[];
  id: string;
  actorId: string;
  householdId: string;
  owner: string;
  activeMessage?: ConversationMessage;
  input: ResponseInputItem[];
  conversation: {
    role: 'user' | 'assistant';
    text: string;
    partial?: boolean;
    /** Server-owned causal identity, independent of repeated transcript text. */
    requestId?: string;
    /** Checked outcomes survive replacement of provider-native tool history. */
    result?: TextAssistantView['result'];
    receipt?: Pick<
      NonNullable<TextAssistantView['receipt']>,
      'operationId' | 'draftVersion' | 'contentVersion' | 'savedAt'
    >;
  }[];
  /** User-originated executed turns, separate from model/history context. */
  userRequests: string[];
  /** Authenticated wording survives context summaries until work is verified. */
  unfinishedRequests: {
    id: string;
    text: string;
    paused?: boolean;
  }[];
  /** Dialogue already included in Responses input; add new fragments once. */
  contextOffset: number;
  queue: ConversationMessage[];
  /** Revisions before an explicit stop/reset cannot introduce new queued work. */
  boundaryRevision: number;
  /** Version reached by this FIFO, unaffected by view reads of external edits. */
  workVersion?: number;
  accepted: Map<string, AcceptedMessage>;
  /** Request IDs may be reused only after an explicit conversation reset. */
  resetGeneration: number;
  summary?: string;
  summaryOffset?: number;
  /** An explicit standalone scope pauses earlier dialogue without deleting it. */
  scopeOffset?: number;
  /** The request's binding survives the browser's deferred voice handoff. */
  pendingSummaryChoice?: ConversationModelChoice;
  previousFailure?: string;
  pendingSave?: { operationId: string; version: number; contentVersion: number };
  /** Authority belongs to unfinished current work, never historical dialogue. */
  saveIntent?: string;
  saveIntentDeadline?: number;
  inputSerial?: number;
  voiceInputPending?: boolean;
  lastVoiceInputAt?: number;
};
