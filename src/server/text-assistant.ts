import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID, type UUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { RunContext, tool } from '@openai/agents';
import type Database from 'better-sqlite3';
import { type Context, Hono } from 'hono';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type { ResponseInputItem, Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { assistantToolActivity } from '../shared/assistant-activity.js';
import { conversationCommand } from '../shared/conversation-command.js';
import {
  conversationConsentRequired,
  conversationConsentRevoked,
} from '../shared/conversation-consent.js';
import { sameModelChoice } from '../shared/conversation-model.js';
import type { DraftBatchRequest } from '../shared/draft-batch.js';
import type {
  MapDraft,
  MapObject,
  MapRelationship,
  RelationshipType,
  RelationshipValue,
} from '../shared/map.js';
import { draftChangeCount, proposedRelationships } from '../shared/map.js';
import {
  equivalentRelationships,
  ungroupedRelationshipType,
} from '../shared/relationship-identity.js';
import { assistantSaveState, completeAssistantText } from '../shared/task-delivery.js';
import type {
  ConversationWorkStep,
  MapSelection,
  RetainedConversation,
  TextAssistantReview,
  TextAssistantView,
} from '../shared/text-assistant.js';
import { reconcileDraftRemovals } from '../shared/type-removal.js';
import { voiceTranscriptGapMs } from '../shared/voice-transcript.js';
import {
  assistantFailureMessage,
  blockedActionMessage,
  newConversationMessage,
} from './assistant-feedback.js';
import { textAssistantInstructions } from './assistant-instructions.js';
import {
  type AssistantObservationContext,
  backendObservationRequest,
  backendTaskObservationContext,
  type ObservationStatus,
  type ObserveAssistant,
} from './assistant-observation.js';
import { assistantReadCache, assistantReadKey } from './assistant-read-cache.js';
import { assistantStartDraft } from './assistant-start-facts.js';
import {
  ActionClarification,
  type CheckTurnActions,
  compareTurnActions,
  interpretTurnScope,
  matchClarification,
  turnActionData,
  turnActionOperations,
} from './assistant-turn-scope.js';
import { assistantDraftReview } from './assistant-work.js';
import type { Auth } from './auth.js';
import { sessionDeadline } from './browser-binding.js';
import type { Config } from './config.js';
import { contentOwner } from './content-identities.js';
import { ConversationCapacity, voiceConversationModel } from './conversation-capacity.js';
import type {
  ConversationConsentProvenance,
  ConversationConsents,
} from './conversation-consent.js';
import {
  conversationModelProfile,
  enabledModelChoices,
  modelChoiceSchema,
  personalModelChoice,
  requireEnabledChoice,
} from './conversation-model.js';
import {
  type ConversationMessage,
  type ConversationState,
  discardConversationDraftParts,
  firstRequest,
  syncConversationQuestions,
} from './conversation-state.js';
import {
  conversationBatchPending,
  conversationLifetime,
  conversationSaveBlocked,
  conversationStorage,
  conversationStorageConsentVersion,
} from './conversation-storage.js';
import {
  contextSummaryMessage,
  historicalSummary,
  summarizeConversation,
} from './conversation-summary.js';
import { draftUpdateDetails } from './draft-completion.js';
import { draftDiscards } from './draft-discards.js';
import { householdAccess } from './households.js';
import type { LiveHandoff } from './live-provider.js';
import { householdMap, MapError } from './map.js';
import { type MapAgentCall, runMapAgent } from './map-agent.js';
import { mapAgentTools, submittedChanges } from './map-agent-tools.js';
import {
  partReference,
  partUpdates,
  pendingParts,
  pendingPartsState,
  pendingQuestions,
} from './pending-parts.js';
import { captureQueuedReference, queuedActionReference } from './queued-request-context.js';
import { checkSaves } from './save-check.js';
import { type DeliverySocket, taskDeliveries } from './task-delivery.js';
import { connectTextAssistant, type LocalDispatch } from './text-assistant-mcp.js';
import { type TextModelProfile, type TextModelUsage, textModel } from './text-assistant-model.js';
import { draftResult, historyResult } from './text-assistant-results.js';
import { captureAssistantResult, restoreAssistantResult } from './text-assistant-snapshot.js';

type Mcp = Awaited<ReturnType<typeof connectTextAssistant>>;
type Message = ConversationMessage;
type ConversationExecution = {
  browserSessionId: string;
  approvedVersion?: number;
  mcp: Mcp;
  reads: ReturnType<typeof assistantReadCache>;
  parts: ReturnType<typeof pendingParts>;
  timer: NodeJS.Timeout;
  messageTimers: Map<Message, NodeJS.Timeout>;
  titleTimer?: NodeJS.Timeout;
  deliveries: Map<string, ReturnType<ReturnType<typeof taskDeliveries>['bind']>>;
  task?: AbortController;
  capacity: ConversationCapacity;
  summaryTask?: AbortController;
  /** Context status and canceled handoffs wait for the complete reset. */
  resetCompletion?: Promise<void>;
  /** Diagnostic continuation only; it never authorizes or resumes work. */
  pendingBatchAccounting?: { operationId: string; settle: (committed: boolean) => void };
  displayed?: (value: boolean) => void;
};
type Session = { state: ConversationState; execution: ConversationExecution };
const savedReply = 'Sparat. Hela utkastet finns i hushållets karta.';
const modelFailureRecovery = new Map([
  ['assistant_model_temporary', 'Försök igen'],
  ['assistant_provider_failed', 'Försök igen'],
  ['assistant_scope_unavailable', 'Försök igen'],
  ['assistant_model_access', 'Fortsätt med valt alternativ'],
  ['assistant_model_unsupported', 'Fortsätt med valt alternativ'],
]);
const reportContinuation = { continueResponse: z.boolean().default(false) };
const resultReport = z.discriminatedUnion('source', [
  z.object({ source: z.literal('draft'), ...reportContinuation }).strict(),
  z.object({ source: z.literal('latest_save'), ...reportContinuation }).strict(),
  z.object({ source: z.literal('last_failure'), ...reportContinuation }).strict(),
  z
    .object({
      source: z.literal('save'),
      ...reportContinuation,
      operationId: z.string().regex(/^[\w-]{1,128}$/),
      userId: z.string().min(1).max(200),
    })
    .strict(),
]);
const selectionId = z.string().regex(/^[\w-]{1,128}$/);
const objectSelection = z
  .strictObject({ objectId: selectionId })
  .transform(({ objectId }) => ({ kind: 'object' as const, id: objectId }));
const itemSelection = z.strictObject({
  kind: z.enum(['object', 'relationship']),
  id: selectionId,
});

class MissingMapSelection extends MapError {
  constructor() {
    super('invalid_request', 400);
  }
}

function parseMapSelection(action: MapAgentCall): MapSelection {
  let args: unknown;
  try {
    args = JSON.parse(action.arguments);
  } catch {
    throw new MapError('invalid_request', 400);
  }
  const parsed = (action.name === 'show_map_object' ? objectSelection : itemSelection).safeParse(
    args,
  );
  if (!parsed.success) throw new MapError('invalid_request', 400);
  return parsed.data;
}

const draftChangeKeys = {
  object: 'changes',
  relationship: 'relationships',
  objectType: 'objectTypes',
  relationshipType: 'relationshipTypes',
} as const;

function selectionDraft(
  review: TextAssistantReview,
  selection: MapSelection,
  preceding: DraftBatchRequest['operations'],
): MapDraft {
  if (
    !preceding.length ||
    !review[draftChangeKeys[selection.kind]]?.some(({ id, after }) => id === selection.id && !after)
  )
    return review;

  for (const { name, arguments: args } of preceding) {
    let { kind, id } = args;
    switch (name) {
      case 'discard_proposal':
        break;
      case 'resolve_conflict': {
        if (args.choice !== 'saved' || args.choices !== undefined) continue;
        const conflict = review.conflicts.find((item) => isDeepStrictEqual(item, args.conflict));
        if (!conflict) continue;
        ({ kind, id } = conflict);
        break;
      }
      case 'propose_object':
      case 'propose_object_type':
      case 'propose_relationship_type':
        if (!args.value) continue;
        kind = {
          propose_object: 'object',
          propose_object_type: 'objectType',
          propose_relationship_type: 'relationshipType',
        }[name];
        break;
      default:
        continue;
    }
    if (typeof kind !== 'string' || !Object.hasOwn(draftChangeKeys, kind)) continue;
    const key = draftChangeKeys[kind as keyof typeof draftChangeKeys];
    const index = review[key]?.findIndex((change) => change.id === id && !change.after) ?? -1;
    if (index < 0) continue;
    // Use the draft's cascade rules to see whether reversing this removal exposes the selection.
    const draft: MapDraft = structuredClone(review);
    draft[key]?.splice(index, 1);
    reconcileDraftRemovals(draft);
    return draft;
  }
  return review;
}

export function textAssistantRoutes({
  database,
  auth,
  config,
  consents,
  dispatch,
  modelFetch,
  modelUsage,
  modelProfile,
  voiceTokens = voiceConversationModel.tokens,
  observe,
  onStop,
  hasActiveVoice,
  onResetStart,
  onNewConversation,
  onSummary,
  onWork,
  onActivity,
  now = () => Date.now(),
}: {
  database: Database.Database;
  auth: Auth;
  config: Config;
  consents: ConversationConsents;
  dispatch: LocalDispatch;
  modelFetch?: typeof fetch;
  modelUsage?: TextModelUsage;
  modelProfile?: TextModelProfile;
  voiceTokens?: number;
  observe?: ObserveAssistant;
  onStop?: (sessionId: string, switched?: boolean) => void;
  hasActiveVoice?: (sessionId: string, includeListening?: boolean) => boolean;
  onResetStart?: (sessionId: string, requestId?: string) => void;
  onSummary?: (sessionId: string, signal: AbortSignal) => Promise<void> | undefined;
  onWork?: (browserSessionId: string, until: number | undefined) => void;
  onActivity?: (browserSessionId: string) => void;
  /** A conversation has started over, so its voice can do the same and say the statement. */
  onNewConversation?: (view: TextAssistantView, deferVoiceClose?: boolean) => void;
  now?: () => number;
}) {
  const routes = new Hono<{ Variables: { actorId: string; browserSessionId: string } }>();
  const sessions = new Map<string, Session>();
  let closed = false;
  const storage = conversationStorage(database, now);
  function checkConversationOpening() {
    if (closed) throw new MapError('assistant_unavailable', 503);
  }
  function generateTitle(session: Session, first: string) {
    const state = session.state;
    if (
      !titleModel ||
      state.consentTextVersion < 5 ||
      session.execution.approvedVersion !== consents.textVersion ||
      !state.storageConsentVersion ||
      state.titleRequested ||
      state.createdAt === undefined ||
      !state.expiresAt ||
      state.expiresAt <= now() ||
      !canRetainConversation(state)
    )
      return;
    state.firstRequest = first;
    state.titleRequested = true;
    persist(session);
    void modelWork
      .run(conversationModelProfile(state.modelChoice), () =>
        titleModel(
          'SKYTTEL_TITLE: Skriv en kort svensk samtalstitel på högst 80 tecken utifrån begäran. Svara med bara titeln.',
          [{ role: 'user', content: first }],
          [],
          AbortSignal.timeout(30_000),
          256,
        ),
      )
      .then((result) => {
        const title = result.output_text?.trim();
        if (
          closed ||
          result.status !== 'completed' ||
          !title ||
          title.length > 80 ||
          /[\r\n]/.test(title)
        )
          return;
        if (!storage.updateTitle(state.id, first, title)) return;
        const live = sessions.get(state.id);
        if (live) live.state.title = title;
      })
      .catch(() => {});
  }
  function recordRequest(state: ConversationState) {
    state.lastRequestAt = now();
    state.expiresAt = state.lastRequestAt + conversationLifetime;
  }
  function canRetainConversation(state: ConversationState) {
    if (!householdAccess(database, state.actorId, state.householdId)) return false;
    const current = database
      .prepare('SELECT contentVersion FROM household WHERE id = ?')
      .get(state.householdId) as { contentVersion: number } | undefined;
    return (
      current?.contentVersion === state.review.contentVersion &&
      contentOwner(database, state.householdId, state.actorId) === state.owner
    );
  }
  function persist(session: Session) {
    if (sessions.get(session.state.id) !== session) return;
    if (!canRetainConversation(session.state)) return;
    if (
      consents.textVersion >= conversationStorageConsentVersion &&
      consents.approvesCurrentText(consents.saved(session.state.actorId, session.state.householdId))
    )
      session.state.storageConsentVersion = consents.textVersion;
    const binding = storage.binding(session.execution.browserSessionId);
    if (binding) storage.write(session.state, binding);
  }
  function currentConsent(session: Session, visit?: unknown) {
    const version = consents.textVersion;
    if (
      session.execution.approvedVersion !== version &&
      !consents.valid(session.state.actorId, session.state.householdId, visit)
    )
      throw new MapError(conversationConsentRequired, 403);
    session.execution.approvedVersion = version;
    if (version >= conversationStorageConsentVersion) session.state.storageConsentVersion = version;
  }
  function pauseState(state: ConversationState, recovery: boolean) {
    state.paused = true;
    state.phase = recovery ? 'recovery' : 'ready';
    state.voiceInputPending = false;
    state.saveIntent = undefined;
    state.saveIntentDeadline = undefined;
    if (state.contextSummaryState === 'summarizing') state.contextSummaryState = 'needed';
  }
  function checkpointPause(session: Session) {
    pauseState(session.state, hasPendingOutcome(session));
    persist(session);
  }
  let messageSequence = 0;
  const draftExecutions = new Map<string, { session: Session; task: AbortController }>();
  const latestAcceptedSequences = new Map<string, number>();
  type Preparation = {
    session: Session;
    sequence: number;
    active: boolean;
    advances: { before: number; after: number; contentVersion: number }[];
    original?: {
      version: number;
      reference: ReturnType<typeof captureQueuedReference>;
      waiting: boolean;
    };
    body: Promise<unknown>;
    finished: Promise<void>;
    finish: () => void;
  };
  const preparations = new Set<Preparation>();
  const requestPreparations = new WeakMap<Request, Preparation>();
  const draftKey = (session: Session) =>
    JSON.stringify([session.state.actorId, session.state.householdId]);
  const failedDraftWork = (session: Session) =>
    [...sessions.values()].some(
      (candidate) => draftKey(candidate) === draftKey(session) && candidate.state.failedWork,
    );
  const hasPendingOutcome = (session: Session) =>
    Boolean(session.state.pendingSave || session.state.pendingBatch);
  const draftHasPendingBatch = (session: Session) =>
    conversationBatchPending(database, session.state.owner, session.state.householdId) ||
    [...sessions.values()].some(
      (candidate) => draftKey(candidate) === draftKey(session) && candidate.state.pendingBatch,
    );
  function ownedDraftTask(session: Session) {
    const claim = draftExecutions.get(draftKey(session));
    // Reset clears its executor before awaited preparation has retired the
    // already-aborted claim. Stop and a newer reset must still find that claim.
    return (
      session.execution.task ??
      (claim?.session === session && claim.task.signal.aborted ? claim.task : undefined)
    );
  }
  function reservePreparation(session: Session, body: Promise<unknown>): Preparation {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const preparation: Preparation = {
      session,
      sequence: storage.reserveMessageSequence() ?? messageSequence++,
      active: true,
      advances: [],
      body,
      finished,
      finish,
    };
    preparations.add(preparation);
    return preparation;
  }
  function hasEarlierPreparation(session: Session, sequence: number) {
    return [...preparations].some(
      (item) => item.sequence < sequence && draftKey(item.session) === draftKey(session),
    );
  }
  function waitingForRetainedWork(session: Session) {
    const first = session.state.queue[0];
    return Boolean(
      first &&
        !session.state.activeMessage &&
        !session.execution.task &&
        storage.pausedWork(
          session.state.actorId,
          session.state.householdId,
          session.state.id,
          first.sequence,
        ),
    );
  }
  function switchingWouldInterrupt(session: Session) {
    return (
      session.execution.summaryTask ||
      (session.state.phase === 'working' && !waitingForRetainedWork(session))
    );
  }
  function deletionWouldInterrupt(session: Session) {
    return Boolean(
      switchingWouldInterrupt(session) ||
        hasActiveVoice?.(session.state.id, false) ||
        [...preparations].some((item) => item.session === session),
    );
  }
  function waitsForDraft(session: Session, sequence: number, current: TextAssistantReview) {
    return (
      hasEarlierPreparation(session, sequence) ||
      draftExecutions.has(draftKey(session)) ||
      draftHasPendingBatch(session) ||
      failedDraftWork(session) ||
      storage.pausedWork(
        session.state.actorId,
        session.state.householdId,
        session.state.id,
        sequence,
      ) ||
      current.pendingOperations.length > 0 ||
      [...sessions.values()].some(
        (candidate) => draftKey(candidate) === draftKey(session) && candidate.state.queue.length,
      )
    );
  }
  function releasePreparation(preparation: Preparation) {
    if (!preparation.active) return;
    preparation.active = false;
    preparations.delete(preparation);
    preparation.finish();
    nextMessage(preparation.session);
  }
  function retirePreparations(session: Session, current?: Preparation) {
    for (const preparation of preparations)
      if (preparation.session === session && preparation !== current)
        releasePreparation(preparation);
  }
  function checkPreparation(preparation: Preparation) {
    if (sessions.get(preparation.session.state.id) !== preparation.session)
      throw new MapError('assistant_session_expired', 404);
    if (!preparation.active) throw new MapError('assistant_turn_changed', 409);
  }
  function requestPreparation(request: Request) {
    const preparation = requestPreparations.get(request);
    if (!preparation) throw new MapError('assistant_turn_changed', 409);
    checkPreparation(preparation);
    return preparation;
  }
  async function waitForOriginalPreparation(preparation: Preparation, requestId: string) {
    for (const earlier of preparations) {
      if (earlier.session !== preparation.session || earlier.sequence >= preparation.sequence)
        continue;
      const body = await Promise.race([earlier.body, earlier.finished, preparation.finished]);
      checkPreparation(preparation);
      if (
        earlier.active &&
        body &&
        typeof body === 'object' &&
        'requestId' in body &&
        body.requestId === requestId
      )
        await Promise.race([earlier.finished, preparation.finished]);
      checkPreparation(preparation);
    }
  }
  function advanceDraftVersion(session: Session, before: number, after: number) {
    if (!Number.isSafeInteger(after)) return;
    for (const candidate of sessions.values())
      if (draftKey(candidate) === draftKey(session))
        for (const message of candidate.state.queue)
          if (
            !message.continuedVoiceRead &&
            !(message.resetDiscard && message.voice) &&
            message.draftVersion === before
          )
            message.draftVersion = after;
    const predecessor = session.state.activeMessage;
    if (!predecessor) return;
    for (const preparation of preparations)
      if (
        draftKey(preparation.session) === draftKey(session) &&
        predecessor.sequence < preparation.sequence &&
        predecessor.owner === preparation.session.state.owner
      )
        preparation.advances.push({ before, after, contentVersion: predecessor.contentVersion });
  }
  function preparedDraftVersion(preparation: Preparation, version: number, contentVersion: number) {
    // Preserve the original request body/hash. Only a contiguous chain of
    // verified earlier work can advance its admitted execution version.
    if (
      preparation.session.state.owner !==
      contentOwner(
        database,
        preparation.session.state.householdId,
        preparation.session.state.actorId,
      )
    )
      return version;
    for (const advance of preparation.advances)
      if (advance.before === version && advance.contentVersion === contentVersion)
        version = advance.after;
    return version;
  }
  function supersedeSaves(session: Session, sequence: number) {
    for (const candidate of sessions.values()) {
      if (draftKey(candidate) !== draftKey(session)) continue;
      const registered =
        candidate.state.pendingSave &&
        householdMap(database, candidate.state.actorId, candidate.state.householdId).operation(
          candidate.state.pendingSave.operationId,
        ).operation;
      for (const message of candidate.state.queue)
        if (message.sequence < sequence && requestsSave(message.text))
          message.saveSuperseded = true;
      if (
        !registered &&
        (!candidate.state.activeMessage || candidate.state.activeMessage.sequence < sequence)
      ) {
        candidate.state.saveIntent = undefined;
        if (candidate.state.activeMessage && requestsSave(candidate.state.activeMessage.text))
          candidate.state.activeMessage.saveSuperseded = true;
      }
    }
  }
  const unsubscribeDiscards = draftDiscards(database).subscribe((event) => {
    storage.discardDraftParts(event.userId, event.householdId, event.version);
    for (const session of sessions.values()) {
      if (session.state.householdId !== event.householdId || session.state.owner !== event.userId)
        continue;
      discardConversationDraftParts(
        session.state,
        session.execution.parts,
        session.execution.task ? undefined : event.version,
      );
      persist(session);
    }
  });
  const pausedSessions = new Set<string>();
  function syncWork() {
    const active = new Map<string, number>();
    for (const session of sessions.values())
      for (const [id, accepted] of session.state.accepted) {
        const until = ['queued', 'working'].includes(accepted.status)
          ? accepted.deadline
          : ['waiting', 'awaiting-receipt'].includes(
                session.execution.deliveries.get(id)?.value.state ?? '',
              )
            ? (session.execution.deliveries.get(id)?.pendingUntil ?? 0)
            : 0;
        if (until > now())
          active.set(
            session.execution.browserSessionId,
            Math.max(active.get(session.execution.browserSessionId) ?? 0, until),
          );
      }
    for (const id of new Set([...pausedSessions, ...active.keys()])) onWork?.(id, active.get(id));
    pausedSessions.clear();
    for (const id of active.keys()) pausedSessions.add(id);
  }
  const deliveries = taskDeliveries(now, syncWork);
  const deliveryOwners = new Map<string, Session>();
  function availableDelivery(session: Session, id: unknown) {
    return typeof id === 'string' && deliveryOwners.get(id) === session && deliveries.has(id);
  }
  const textWork = new AsyncLocalStorage<{
    session: Session;
    guard: () => void;
  }>();
  // Observation identity is independent of the authorization context. Voice
  // keeps its existing access checks while sharing the backend's one owner.
  const observationWork = new AsyncLocalStorage<
    ConversationConsentProvenance & {
      session: Session;
      context: AssistantObservationContext;
      revision: number;
      deadline: number;
      providerCallId?: string;
      recordTool?: (name: string, kind: ConversationWorkStep['kind'], text: string) => void;
    }
  >();
  // Keep the reason until the conversation would otherwise have expired.
  const endings = new Map<
    string,
    { actorId: string; householdId: string; reason: 'deleted' | 'revoked' }
  >();
  // How many times each user has revoked the consent for each household, so
  // that a start can tell whether a revocation came while it connected. It
  // holds one number for each user and household that has revoked.
  const revocations = new Map<string, number>();
  const consentKey = (actorId: string, householdId: string) =>
    JSON.stringify([householdId, actorId]);
  const modelWork = new AsyncLocalStorage<TextModelProfile>();
  const selectedProfile = () => {
    const profile = modelWork.getStore();
    if (!profile) throw new MapError('assistant_model_unsupported', 409);
    return profile;
  };
  const titleModel = config.openaiApiKey
    ? textModel(
        config.openaiApiKey,
        modelFetch,
        modelUsage,
        modelProfile,
        undefined,
        selectedProfile,
      )
    : null;
  const workAttempt = new AsyncLocalStorage<{ id?: string }>();
  const respond = config.openaiApiKey
    ? textModel(
        config.openaiApiKey,
        modelFetch,
        modelUsage,
        modelProfile,
        (attempt, content) => {
          if (!observe) return;
          const attemptWork = workAttempt.getStore();
          if (attemptWork) attemptWork.id = attempt.attemptId;
          const work = observationWork.getStore();
          observe({
            at: now(),
            sessionId: work?.session.state.id ?? '',
            taskId: work?.context.requestId,
            revision: work?.revision,
            consentTextVersion: work?.consentTextVersion,
            conversationConsentTextVersion: work?.conversationConsentTextVersion,
            context: {
              owner: 'backend',
              traceId: work?.context.traceId ?? attempt.attemptId,
              spanId: attempt.attemptId,
              parentSpanId: work?.context.spanId,
              requestId: work?.context.requestId,
              providerCallId: attempt.attemptId,
            },
            kind: 'model_attempt',
            status:
              attempt.outcome === 'completed'
                ? 'completed'
                : attempt.outcome === 'failed'
                  ? 'failed'
                  : attempt.outcome === 'aborted'
                    ? 'canceled'
                    : 'incomplete',
            ...(!work ? { evidenceGap: 'unknown_parent' as const } : {}),
            data: {
              attemptId: attempt.attemptId,
              startedAt: attempt.startedAt,
              endedAt: attempt.endedAt,
              model: attempt.model,
              resolvedModel: attempt.resolvedModel,
              serviceTier: attempt.serviceTier,
              providerRequestId: attempt.requestId,
              responseId: attempt.responseId,
              outcome: attempt.outcome,
              completeness: attempt.completeness,
              usage: attempt.usage,
              ...content,
            },
          });
        },
        selectedProfile,
      )
    : null;
  function authorityLost(error: unknown) {
    return (
      (error instanceof Error && 'code' in error && (error.code === 401 || error.code === 403)) ||
      (error instanceof MapError &&
        (error.status === 401 ||
          error.status === 403 ||
          error.code === 'assistant_content_changed' ||
          error.code === 'forbidden'))
    );
  }
  function clearWorkTimers(session: Session) {
    for (const timer of session.execution.messageTimers.values()) clearTimeout(timer);
    session.execution.messageTimers.clear();
  }
  async function stop(
    session: Session,
    {
      conversation = 'end',
      delivery = 'retire',
      switched = false,
    }: { conversation?: 'pause' | 'end'; delivery?: 'retire' | 'close'; switched?: boolean } = {},
  ) {
    clearTimeout(session.execution.titleTimer);
    const task = ownedDraftTask(session);
    if (conversation === 'pause') {
      const first = firstRequest(session.state);
      if (!closed && first && session.execution.approvedVersion === consents.textVersion)
        generateTitle(session, first);
      checkpointPause(session);
    } else storage.erase(session.state.id);
    onStop?.(session.state.id, switched);
    sessions.delete(session.state.id);
    retirePreparations(session);
    if (![...sessions.values()].some((candidate) => draftKey(candidate) === draftKey(session)))
      latestAcceptedSequences.delete(draftKey(session));
    for (const [id, owner] of deliveryOwners) {
      if (owner !== session) continue;
      if (delivery === 'retire') deliveries.retire(id);
      else deliveries.close(id);
      deliveryOwners.delete(id);
    }
    session.execution.task?.abort();
    clearWorkTimers(session);
    session.execution.summaryTask?.abort();
    session.state.pendingSummaryChoice = undefined;
    session.state.queue = [];
    for (const id of session.state.accepted.keys()) session.execution.deliveries.get(id)?.stop();
    session.state.accepted.clear();
    session.execution.deliveries.clear();
    syncWork();
    session.execution.displayed?.(false);
    session.state.input = [];
    session.execution.reads.clear();
    session.state.conversation = [];
    session.state.workSteps = undefined;
    session.state.contextOffset = 0;
    session.state.reply = undefined;
    session.state.modelReply = undefined;
    session.state.questions = undefined;
    session.state.answers = [];
    session.execution.parts.clear();
    session.state.requiredNotice = undefined;
    session.state.previousFailure = undefined;
    session.state.receipt = undefined;
    session.state.saveCheck = undefined;
    session.state.operations = [];
    session.state.completedReplies = [];
    session.state.result = undefined;
    clearTimeout(session.execution.timer);
    await session.execution.mcp.close();
    if (task) releaseDraft(session, task);
    else nextMessage(session);
  }
  routes.use('/households/:id/text-assistant*', async (context, next) => {
    if (context.req.method !== 'GET' && context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    if (!householdAccess(database, session.user.id, context.req.param('id')))
      return context.json({ error: 'forbidden' }, 403);
    context.set('actorId', session.user.id);
    context.set('browserSessionId', session.session.id);
    await next();
  });
  function loginDeadline(actorId: string, browserSessionId: string) {
    const session = database
      .prepare('SELECT * FROM session WHERE id = ? AND userId = ?')
      .get(browserSessionId, actorId) as Parameters<typeof sessionDeadline>[0] | undefined;
    return session ? sessionDeadline(session) : 0;
  }
  function authorize(actorId: string, browserSessionId: string, householdId: string) {
    const work = textWork.getStore();
    if (
      work &&
      work.session.state.actorId === actorId &&
      work.session.execution.browserSessionId === browserSessionId &&
      work.session.state.householdId === householdId
    ) {
      work.guard();
      return;
    }
    const expiresAt = loginDeadline(actorId, browserSessionId);
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= now() ||
      !householdAccess(database, actorId, householdId)
    )
      throw new MapError('forbidden', 403);
  }
  function checkViewAccess(session: Session) {
    session.execution.mcp.checkAccess();
    session.execution.mcp.checkTaskAccess();
    if (
      contentOwner(database, session.state.householdId, session.state.actorId) !==
      session.state.owner
    )
      throw new MapError('forbidden', 403);
  }
  function view(session: Session) {
    persist(session);
    const {
      id,
      revision,
      contextRevision,
      resetSource,
      discarded,
      canceled,
      completedReplies,
      taskId,
      taskSource,
      phase,
      review,
      reply,
      modelReply,
      requiredNotice,
      securityReference,
      questions,
      result,
      error,
      receipt,
      saveCheck,
      operations,
      selection,
      displayedSelection,
      displayedItem,
    } = session.state;
    const interrupted = session.state.paused
      ? (session.state.activeMessage ?? session.state.queue[0])
      : undefined;
    const failure = session.state.failedWork;
    const workFailure =
      failure &&
      !hasPendingOutcome(session) &&
      !operations.some((item) => item.status === 'pending')
        ? {
            requestId: failure.message.id,
            request: failure.message.text,
            code: failure.code,
            message:
              failure.code === 'assistant_draft_changed'
                ? 'Utkastet har ändrats efter det genomförda arbetet. Hur vill du fortsätta med dina aktuella ändringar? Avstå från den gamla oavslutade delen innan du lämnar en ny instruktion. Det aktuella utkastet bevaras; borttagna förslag återskapas inte.'
                : assistantFailureMessage(failure.code),
            retry:
              modelFailureRecovery.get(failure.code) ??
              (failure.code === 'assistant_batch_not_committed'
                ? 'Försök igen'
                : failure.code === 'assistant_request_unfinished'
                  ? 'Fortsätt det oavslutade arbetet'
                  : undefined),
          }
        : undefined;
    return {
      id,
      workFailure,
      paused: session.state.paused,
      interruptedRequestId: interrupted?.id,
      interruptedSpeech: interrupted?.voice ? interrupted.text : undefined,
      expiresAt: session.state.expiresAt,
      conversation: session.state.conversation.map(
        ({
          role,
          text,
          partial,
          utteranceStart,
          notice,
          requestId,
          speechRequestId,
          speechEventId,
        }) => ({
          role,
          text,
          requestId: speechRequestId ?? requestId,
          speechEventId,
          partial,
          utteranceStart,
          // Older retained conversations have no presentation marker. Match only
          // the same failed task's recorded notice, never arbitrary quoted text.
          notice:
            notice ??
            (role === 'assistant' &&
            !partial &&
            completedReplies?.some(
              (reply) =>
                reply.failed &&
                reply.id === requestId &&
                (reply.securityReference || failure?.message.id === reply.id) &&
                (text === reply.reply ||
                  text === reply.requiredNotice ||
                  (reply.securityReference &&
                    text === assistantFailureMessage('assistant_action_out_of_scope'))),
            )
              ? true
              : undefined),
        }),
      ),
      unfinishedRequests: session.state.unfinishedRequests.map(({ id, text, paused }) => ({
        id,
        text,
        paused,
      })),
      queuedRequests: session.state.queue.map(({ id, text, voice }) => ({
        id,
        text,
        source: voice ? ('voice' as const) : ('text' as const),
      })),
      consentTextVersion: session.state.consentTextVersion,
      modelChoice: session.state.modelChoice,
      modelChoiceRevision: session.state.modelChoiceRevision ?? 0,
      enabledModelChoices: enabledModelChoices(config.conversationModels),
      modelChoiceUnavailable: !enabledModelChoices(config.conversationModels).some((choice) =>
        sameModelChoice(choice, session.state.modelChoice),
      ),
      revision,
      contextRevision,
      contextGeneration: session.state.contextGeneration,
      contextSummaryState: session.state.contextSummaryState,
      capacityPaused: session.state.capacityPaused,
      contextSummaryFailure: session.state.contextSummaryFailure,
      contextSummaries: session.state.contextSummaries,
      contextPercentage: session.execution.capacity.percent(
        contextBytes(session),
        Buffer.byteLength(JSON.stringify(providerConversation(session))),
      ),
      resetSource,
      resetDiscardPending: Boolean(
        session.state.activeMessage?.resetDiscard ||
          session.state.queue.some((message) => message.resetDiscard),
      ),
      discarded,
      canceled,
      completedReplies,
      taskId,
      taskSource,
      tasks: [...session.state.accepted].map(([id, accepted]) => ({
        id,
        receivedAt: accepted.receivedAt,
        deadline: accepted.deadline,
        status: accepted.status,
        delivery: session.execution.deliveries.get(id)?.value,
      })),
      queuedMessages: session.state.queue.length,
      saving: Boolean(
        session.state.pendingSave &&
          householdMap(database, session.state.actorId, session.state.householdId).operation(
            session.state.pendingSave.operationId,
          ).operation?.status === 'pending',
      ),
      batchPending: Boolean(session.state.pendingBatch && !session.execution.task),
      phase,
      waitingForRetainedWork: (phase === 'working' && waitingForRetainedWork(session)) || undefined,
      activity: phase === 'working' ? session.state.activity : undefined,
      workSteps: session.state.workSteps,
      review,
      reply,
      modelReply,
      requiredNotice,
      securityReference,
      questions,
      questionPending: Boolean(questions?.length),
      newQuestions: session.state.newQuestions ?? [],
      pendingParts: session.execution.parts.read(),
      saveBlocked:
        session.execution.parts.blocked() ||
        conversationSaveBlocked(database, session.state.owner, session.state.householdId) ||
        conversationBatchPending(database, session.state.owner, session.state.householdId),
      result,
      error,
      receipt,
      saveCheck,
      operations,
      selection,
      displayedSelection,
      displayedItem,
    };
  }
  function contextBytes(session: Session) {
    if (!session.state.input.length && !session.state.conversation.length) return 0;
    return Buffer.byteLength(
      JSON.stringify({
        instructions: `${session.execution.mcp.instructions}\n\n${textAssistantInstructions}`,
        tools: session.execution.mcp.tools,
        input: session.state.input,
        dialogue: session.state.conversation
          .slice(session.state.contextOffset)
          .map(modelTranscriptEntry),
      }),
    );
  }
  function providerConversation(session: Session) {
    const { dialogue, currentState } = liveHandoff(session);
    return currentState
      ? [...dialogue, { role: 'assistant' as const, text: currentState }]
      : dialogue;
  }
  function liveHandoff(session: Session): LiveHandoff {
    if (!session.state.conversation.length && !session.state.unfinishedRequests.length)
      return { dialogue: [] };
    const draft = draftFacts(
      session,
      session.state.activeMessage?.text ?? session.state.userRequests.at(-1) ?? '',
    );
    // Voice uses the draft as orientation. Its delegated read can retrieve
    // the complete checked values where large properties would crowd out speech.
    const { version, contentVersion, readyToSave } = draft;
    const currentDraft =
      Buffer.byteLength(JSON.stringify(draft)) <= 2500
        ? draft
        : { version, contentVersion, readyToSave, complete: false };
    const dialogue = [
      ...(session.state.summary
        ? [
            {
              role: 'assistant' as const,
              text: JSON.stringify({
                historical: true,
                untrusted: true,
                summary: session.state.summary,
              }),
            },
          ]
        : []),
      ...contextConversation(session).map(
        ({ role, text, partial, requestId, result, receipt }) => ({
          role,
          partial,
          // Live consumes role/text only. Serialize checked evidence here too,
          // independently of provider-native item IDs or stale draft pictures.
          text:
            result || receipt
              ? JSON.stringify({
                  historical: true,
                  untrusted: true,
                  requestId,
                  text,
                  result,
                  receipt,
                })
              : text,
        }),
      ),
    ];
    // Current draft is independently read by the server; a summary is never
    // the authority for its state or for any new action.
    return {
      dialogue,
      currentState: JSON.stringify({
        currentDraft,
        unfinishedRequests: activeRequests(session),
        pendingParts: contextParts(session)
          .filter(({ status }) => status === 'waiting' || status === 'ready')
          .map(({ id, revision, request, question, status }) => ({
            id,
            revision,
            request,
            question,
            status,
          })),
        // Receipts can include both full before and after versions of objects.
        // A voice restart needs the verified operation reference for lookup.
        saveOperations: saveOperationReferences(session),
        historical: true,
      }),
    };
  }
  function saveOperationReferences(session: Session) {
    return session.state.operations.map(
      ({ operationId, status, draftVersion, contentVersion }) => ({
        operationId,
        status,
        draftVersion,
        contentVersion,
      }),
    );
  }
  function activeRequests(session: Session) {
    return session.state.unfinishedRequests
      .filter((request) => !request.paused)
      .map(({ id, text }) => ({ id, text }));
  }
  function unfinishedFactReferences(session: Session) {
    return [
      ...activeRequests(session)
        .filter((request) => request.id !== session.state.activeMessage?.id)
        .map((request) => request.text),
      ...contextParts(session)
        .filter((part) => ['waiting', 'ready'].includes(part.status))
        .flatMap((part) => [part.request, part.question]),
    ];
  }
  function factRelevance(session: Session, message: string) {
    return [
      message,
      session.state.userRequests.slice(0, -1),
      unfinishedFactReferences(session),
    ] as const;
  }
  function draftFacts(session: Session, message: string, review = session.state.review) {
    return assistantStartDraft(review, ...factRelevance(session, message));
  }
  function envelopeFacts(session: Session, message: string, review = session.state.review) {
    const relevance = factRelevance(session, message);
    return {
      draft: assistantStartDraft(review, ...relevance),
      verifiedReads: session.execution.reads.facts(...relevance),
    };
  }
  function pauseCapacity(session: Session) {
    session.state.capacityPaused = true;
    session.state.saveIntent = undefined;
    session.state.saveIntentDeadline = undefined;
  }
  function failSummaryCapacity(session: Session) {
    session.state.contextSummaryState = 'failed';
    session.state.contextSummaryFailure = {
      code: 'assistant_context_capacity',
      message: assistantFailureMessage('assistant_context_capacity'),
    };
    pauseCapacity(session);
  }
  function invalidateQueuedSaves(session: Session) {
    session.state.saveIntent = undefined;
    session.state.saveIntentDeadline = undefined;
    for (const message of session.state.queue)
      if (requestsSave(message.text)) message.saveScopeChanged = true;
  }
  function contextParts(session: Session) {
    const paused = new Set(
      session.state.unfinishedRequests
        .filter((request) => request.paused)
        .map((request) => request.id),
    );
    return session.execution.parts.read().filter((part) => !paused.has(part.messageId));
  }
  function hasReadyPendingParts(session: Session) {
    return session.execution.parts.read().some((part) => part.status === 'ready');
  }
  function appendConversation(session: Session, entry: Session['state']['conversation'][number]) {
    const retained = {
      ...entry,
      // Raw voice fragments have no authenticated task provenance. Retain them
      // conservatively rather than assigning them to whichever task is active.
      requestId: entry.partial ? undefined : (entry.requestId ?? session.state.activeMessage?.id),
      ...(entry.role === 'assistant' && !entry.partial
        ? {
            result: session.state.result && structuredClone(session.state.result),
            receipt: session.state.receipt && {
              operationId: session.state.receipt.operationId,
              draftVersion: session.state.receipt.draftVersion,
              contentVersion: session.state.receipt.contentVersion,
              savedAt: session.state.receipt.savedAt,
            },
          }
        : {}),
    };
    session.state.conversation.push(retained);
    persist(session);
    return retained;
  }
  function contextConversation(session: Session) {
    const unfinished = new Set(activeRequests(session).map((request) => request.id));
    return session.state.conversation
      .filter(
        (entry, index) =>
          index >= (session.state.scopeOffset ?? 0) &&
          (index >= (session.state.summaryOffset ?? 0) ||
            (entry.requestId !== undefined && unfinished.has(entry.requestId)) ||
            (entry.partial && entry.requestId === undefined)),
      )
      .map(modelTranscriptEntry);
  }
  function modelTranscriptEntry({
    utteranceStart: _utteranceStart,
    speechRequestId: _speechRequestId,
    speechEventId: _speechEventId,
    ...entry
  }: ConversationState['conversation'][number]) {
    return entry;
  }
  function completedDiscussion(session: Session, conversation = session.state.conversation) {
    const unfinished = new Set(session.state.unfinishedRequests.map((request) => request.id));
    return conversation
      .slice(session.state.summaryOffset ?? 0)
      .filter(
        (entry) =>
          !entry.partial && (entry.requestId === undefined || !unfinished.has(entry.requestId)),
      );
  }
  function rebuildContext(session: Session) {
    const recent = contextConversation(session);
    const last = recent.at(-1);
    if (last?.role === 'user' && last.requestId === session.state.activeMessage?.id) recent.pop();
    // Provider item IDs and old tool results are never the only copy of work.
    // Fresh draft/save reads and the exact ledger are added to this turn below.
    session.state.input = [
      ...(session.state.summary ? [historicalSummary(session.state.summary)] : []),
      ...(recent.length
        ? [
            {
              role: 'assistant' as const,
              content: JSON.stringify({
                historical: true,
                untrusted: true,
                recentConversation: recent,
              }),
            },
          ]
        : []),
    ];
    session.execution.capacity.resetText();
  }
  function refreshContext(
    session: Session,
    outdated: { name: string; currentCalls?: string[] }[],
    latestRound: ReadonlySet<string>,
  ) {
    const rereadable = new Set([
      'read_map',
      'read_type_catalog',
      'read_my_draft',
      'search_object_icons',
    ]);
    const changed = new Map(outdated.map((read) => [read.name, new Set(read.currentCalls ?? [])]));
    const latest = new Map<string, string>();
    const removed = new Set<string>();
    for (const item of session.state.input) {
      if (item.type !== 'function_call' || !rereadable.has(item.name)) continue;
      let key = `${item.name}:${item.arguments}`;
      try {
        key = assistantReadKey(item.name, JSON.parse(item.arguments));
      } catch {
        // Preserve malformed provider input for its ordinary validation path.
      }
      const previous = latest.get(key);
      // Deliver each call's output once before compacting identical older reads.
      if (previous && !latestRound.has(previous)) removed.add(previous);
      latest.set(key, item.call_id);
      // Invalid facts are removed together with their call association. The
      // current envelope or an explicit new read supplies their replacement.
      if (changed.has(item.name) && !changed.get(item.name)?.has(item.call_id))
        removed.add(item.call_id);
    }
    session.state.input = session.state.input.filter(
      (item) =>
        !(
          (item.type === 'function_call' || item.type === 'function_call_output') &&
          typeof item.call_id === 'string' &&
          removed.has(item.call_id)
        ),
    );
    let replaced = removed.size > 0;
    for (const item of session.state.input) {
      if (item.type === 'function_call_output' && typeof item.output === 'string') {
        try {
          const value = JSON.parse(item.output);
          for (const snapshot of [value, value.review]) {
            if (
              !snapshot ||
              !Array.isArray(snapshot.changes) ||
              !Number.isSafeInteger(snapshot.version) ||
              !Number.isSafeInteger(snapshot.contentVersion) ||
              (snapshot.version === session.state.review.version &&
                snapshot.contentVersion === session.state.review.contentVersion)
            )
              continue;
            // Both direct mutations and batch reviews contain draft pictures.
            // Keep their versions, checked effects, receipts and result identity.
            for (const field of [
              'readyToSave',
              'complete',
              'totals',
              'changes',
              'relationships',
              'objectTypes',
              'relationshipTypes',
              'current',
              'conflicts',
              'unresolvedIdentities',
              'pendingOperations',
            ])
              delete snapshot[field];
            snapshot.superseded = true;
            replaced = true;
          }
          item.output = JSON.stringify(value);
        } catch {
          // Non-JSON tool content is preserved as returned.
        }
      }
      if (!('role' in item) || item.role !== 'user' || typeof item.content !== 'string') continue;
      try {
        const value = JSON.parse(item.content);
        if (value.messageId !== session.state.activeMessage?.id || !value.draft) continue;
        if (
          value.draft.version !== session.state.review.version ||
          value.draft.contentVersion !== session.state.review.contentVersion
        )
          replaced = true;
        item.content = JSON.stringify({
          ...value,
          ...envelopeFacts(session, value.message),
          pendingParts: contextParts(session),
        });
      } catch {
        // Historical text is not a current work envelope.
      }
    }
    if (replaced) session.execution.capacity.resetText();
  }
  function settleRequests(session: Session, currentId: string, verified: boolean) {
    const parts = session.execution.parts.read();
    session.state.unfinishedRequests = session.state.unfinishedRequests.filter((request) => {
      if (request.paused) return true;
      const related = parts.filter(
        (part) => part.messageId === request.id || part.evidence?.messageId === request.id,
      );
      if (related.some((part) => part.status === 'waiting' || part.status === 'ready')) return true;
      if (related.length) return false;
      return request.id !== currentId || !verified;
    });
  }
  function needsSummary(session: Session) {
    return session.execution.capacity.needsSummary(
      contextBytes(session),
      Buffer.byteLength(JSON.stringify(providerConversation(session))),
    );
  }
  function exceedsRequestBudget(session: Session, instructions: string, tools: Tool[]) {
    const profile =
      modelProfile ?? modelWork.getStore() ?? conversationModelProfile(session.state.modelChoice);
    // Same UTF-8 estimate as occupancy; reserve the selected output budget and
    // modest transport metadata headroom. The provider remains the final limit.
    return (
      Buffer.byteLength(JSON.stringify({ instructions, input: session.state.input, tools })) / 3 +
        profile.maxOutputTokens +
        1024 >=
      profile.tokens
    );
  }
  function observationResult(session: Session) {
    return {
      ...session.state,
      pendingParts: session.execution.parts.values(),
      questionPending: Boolean(session.state.questions?.length),
      saveBlocked: session.execution.parts.blocked(),
    };
  }
  async function observedOperation<T>(
    session: Session,
    source: 'summary' | 'recover' | 'retry',
    work: (
      finish: (
        status: ObservationStatus,
        view?: unknown,
        noOp?: 'already_working' | 'already_checked',
      ) => void,
    ) => Promise<T>,
    request?: unknown,
    voiceLink?: { traceId: string; spanId: string },
  ): Promise<T> {
    const caller = backendObservationRequest();
    if (!observe || (!caller && observationWork.getStore()?.session === session))
      return work(() => {});
    const requestId = caller?.requestId ?? randomUUID();
    const link = voiceLink ?? caller?.voiceLink;
    const context = {
      ...backendTaskObservationContext(session.state.id, requestId, session.state.resetGeneration),
      ...(link ? { links: [link] } : {}),
    };
    const startedAt = now();
    const consentTextVersion =
      source === 'summary'
        ? (session.execution.approvedVersion ?? session.state.consentTextVersion)
        : (session.state.pendingBatch?.message?.consentTextVersion ??
          session.state.activeMessage?.consentTextVersion ??
          session.state.consentTextVersion);
    const identity = {
      sessionId: session.state.id,
      consentTextVersion,
      conversationConsentTextVersion:
        source === 'summary'
          ? session.state.consentTextVersion
          : (session.state.pendingBatch?.message?.conversationConsentTextVersion ??
            session.state.activeMessage?.conversationConsentTextVersion ??
            session.state.consentTextVersion),
      taskId: requestId,
      revision: session.state.revision,
      context,
    };
    observe({
      ...identity,
      at: startedAt,
      kind: 'task_started',
      status: 'incomplete',
      data: { source, startedAt, request },
    });
    let ended = false;
    const finish = (
      status: ObservationStatus,
      view?: unknown,
      noOp?: 'already_working' | 'already_checked',
    ) => {
      if (ended) return;
      ended = true;
      observe({
        ...identity,
        at: now(),
        kind: 'task_completed',
        status,
        ...(status === 'incomplete' ? { evidenceGap: 'missing_end' as const } : {}),
        data: {
          source,
          startedAt,
          endedAt: now(),
          ...(view ? { view } : {}),
          ...(noOp ? { noOp } : {}),
          ...(status !== 'completed' ? { error: `task_${status}` } : {}),
        },
      });
    };
    try {
      return await observationWork.run(
        {
          session,
          consentTextVersion,
          conversationConsentTextVersion: identity.conversationConsentTextVersion,
          context,
          revision: session.state.revision,
          deadline: Number.POSITIVE_INFINITY,
        },
        () => work(finish),
      );
    } catch (error) {
      finish(
        error instanceof MapError && error.code === 'assistant_canceled' ? 'canceled' : 'failed',
      );
      throw error;
    } finally {
      finish('incomplete');
    }
  }
  async function summarize(
    session: Session,
    parentGuard?: () => void,
    continuation: ResponseInputItem[] = [],
    handoff = false,
    parentSignal?: AbortSignal,
    voiceLink?: { traceId: string; spanId: string },
  ): Promise<ObservationStatus | undefined> {
    if (session.execution.summaryTask || session.state.contextSummaryState === 'failed') return;
    if (observe && observationWork.getStore()?.session !== session)
      return observedOperation(
        session,
        'summary',
        async (finish) => {
          const status =
            (await summarize(session, parentGuard, continuation, handoff, parentSignal)) ??
            'incomplete';
          finish(status);
          return status;
        },
        undefined,
        voiceLink,
      );
    const task = new AbortController();
    // A voice startup owns only the summary it starts here. An already active
    // text summary returns above and never inherits this signal.
    const aborted = () => task.abort();
    parentSignal?.addEventListener('abort', aborted, { once: true });
    if (parentSignal?.aborted) aborted();
    session.execution.summaryTask = task;
    const revision = session.state.revision;
    const guard = () => {
      if (
        task.signal.aborted ||
        sessions.get(session.state.id) !== session ||
        session.state.revision !== revision
      )
        throw new MapError('assistant_canceled', 409);
      if (endings.has(session.state.id)) throw new MapError('forbidden', 403);
      authorize(
        session.state.actorId,
        session.execution.browserSessionId,
        session.state.householdId,
      );
      parentGuard?.();
    };
    session.state.contextSummaryState = 'summarizing';
    session.state.contextSummaryFailure = undefined;
    const deferredChoice = session.state.pendingSummaryChoice;
    const summaryChoice = deferredChoice ?? session.state.modelChoice;
    const summaryProfile = deferredChoice
      ? conversationModelProfile(deferredChoice)
      : (modelWork.getStore() ?? conversationModelProfile(summaryChoice));
    try {
      guard();
      if (!respond) throw new Error('assistant_unavailable');
      if (deferredChoice || !modelWork.getStore())
        requireEnabledChoice(summaryChoice, config.conversationModels);
      if (handoff) await onSummary?.(session.state.id, task.signal);
      guard();
      const snapshot = session.state.conversation.length;
      const summary = await summarizeConversation(
        (...args) => modelWork.run(summaryProfile, () => respond(...args)),
        JSON.stringify({
          previousSummary: session.state.summary,
          conversation: completedDiscussion(session),
        }),
        task.signal,
        guard,
      );
      const review = (await call(session, 'read_my_draft', {}, guard)) as TextAssistantReview;
      guard();
      // Atomic installation: failure keeps the whole old ledger and provider
      // input. The visible transcript is never truncated by this operation.
      session.state.review = review;
      session.state.summary = summary;
      session.state.summaryOffset = Math.max(0, snapshot - 8);
      while (
        session.state.summaryOffset < snapshot &&
        JSON.stringify(session.state.conversation.slice(session.state.summaryOffset, snapshot))
          .length > 16_000
      )
        session.state.summaryOffset++;
      session.state.contextOffset = snapshot;
      session.state.input = [
        historicalSummary(summary),
        {
          role: 'assistant',
          content: JSON.stringify({
            historical: true,
            recentConversation: contextConversation(session),
          }),
        },
        ...continuation,
      ];
      session.state.contextGeneration = (session.state.contextGeneration ?? 0) + 1;
      session.state.contextSummaries ??= [];
      session.state.contextSummaries.push({ id: randomUUID(), text: contextSummaryMessage });
      session.state.contextSummaryState = undefined;
      session.state.pendingSummaryChoice = undefined;
      session.execution.capacity.reset();
    } catch (error) {
      if (task.signal.aborted) return 'canceled' as const;
      if (session.state.revision !== revision || sessions.get(session.state.id) !== session)
        return 'canceled' as const;
      if (authorityLost(error)) {
        if (stopExpiredVoice(session)) return 'canceled' as const;
        await stop(session);
        return 'canceled' as const;
      }
      session.state.contextSummaryState = 'failed';
      if (
        error instanceof MapError &&
        [
          'assistant_model_access',
          'assistant_model_unsupported',
          'assistant_model_temporary',
          'assistant_context_capacity',
        ].includes(error.code)
      )
        session.state.contextSummaryFailure = {
          code: error.code,
          message: assistantFailureMessage(error.code),
        };
      if (session.state.contextSummaryFailure?.code === 'assistant_context_capacity')
        pauseCapacity(session);
      // A distinct DTO state, not a generic task/provider failure.
      return 'failed' as const;
    } finally {
      parentSignal?.removeEventListener('abort', aborted);
      if (session.execution.summaryTask === task) {
        session.execution.summaryTask = undefined;
        if (session.state.contextSummaryState === 'summarizing')
          session.state.contextSummaryState = 'needed';
      }
    }
    return 'completed' as const;
  }
  async function call(
    session: Session,
    name: string,
    args: Record<string, unknown>,
    guard?: () => void,
    readPolicy: 'shared' | 'lifecycle' = 'shared',
    contextCallId?: string,
    readSignal?: AbortSignal,
  ) {
    if (name === 'prepare_save' || name === 'save_draft') persist(session);
    guard?.();
    checkViewAccess(session);
    const work = textWork.getStore();
    if (work?.session === session) work.guard();
    const load = async () => {
      guard?.();
      checkViewAccess(session);
      if (work?.session === session) work.guard();
      const at = now();
      const observed = observationWork.getStore();
      const parent = observed?.session === session ? observed.context : undefined;
      const spanId = randomUUID();
      const context: AssistantObservationContext = {
        owner: 'backend',
        traceId: parent?.traceId ?? spanId,
        spanId,
        parentSpanId: parent?.spanId,
        requestId: parent?.requestId,
        toolExecutionId: spanId,
      };
      const identity = {
        sessionId: session.state.id,
        consentTextVersion:
          observed?.session === session
            ? observed.consentTextVersion
            : session.state.consentTextVersion,
        conversationConsentTextVersion:
          observed?.session === session
            ? observed.conversationConsentTextVersion
            : session.state.consentTextVersion,
        taskId: parent?.requestId,
        revision: session.state.revision,
        context,
        ...(!parent ? { evidenceGap: 'unknown_parent' as const } : {}),
      };
      if (observed?.session === session)
        observed.recordTool?.(name, 'mcp', assistantToolActivity(name));
      observe?.({
        at,
        ...identity,
        kind: 'mcp_started',
        status: 'incomplete',
        data: { name, args },
      });
      let result: Awaited<ReturnType<Mcp['call']>>;
      try {
        result = await session.execution.mcp.call(
          name,
          args,
          guard,
          work?.session === session,
          readSignal,
        );
      } catch (error) {
        // The MCP transport can wrap a task guard's error. Use the caller's
        // current authority for the observed ending, while preserving the
        // original exception and application failure handling below.
        let observedError = error;
        try {
          guard?.();
          if (work?.session === session) work.guard();
        } catch (reason) {
          observedError = reason;
        }
        const canceled =
          (observedError instanceof MapError && observedError.code === 'assistant_canceled') ||
          readSignal?.aborted;
        // Expiry can also abort work; the original deadline takes precedence
        // over that signal, as it does for the task's observed ending.
        const expired =
          (observed?.session === session && now() >= observed.deadline) ||
          (observedError instanceof MapError && observedError.code === 'assistant_task_expired');
        observe?.({
          at: now(),
          ...identity,
          kind: 'mcp_failed',
          status: expired ? 'incomplete' : canceled ? 'canceled' : 'failed',
          data: {
            name,
            startedAt: at,
            error: expired ? 'tool_incomplete' : canceled ? 'tool_canceled' : 'tool_failed',
          },
        });
        throw error;
      }
      observe?.({
        at: now(),
        ...identity,
        kind: 'mcp_completed',
        status: result.isError ? 'failed' : 'completed',
        data: { name, result, startedAt: at },
      });
      guard?.();
      if (work?.session === session) work.guard();
      if (!Array.isArray(result.content)) throw new Error('invalid_tool_result');
      const text = result.content.find((item) => item.type === 'text');
      if (!text || typeof text.text !== 'string') throw new Error('invalid_tool_result');
      const value = JSON.parse(text.text);
      if (result.isError)
        throw new MapError(
          typeof value.error === 'string' ? value.error : 'assistant_tool_failed',
          409,
        );
      return value;
    };
    const value = await session.execution.reads.read(name, args, load, readPolicy, contextCallId);
    guard?.();
    checkViewAccess(session);
    if (work?.session === session) work.guard();
    return value;
  }

  async function applyCheckedBatch(
    session: Session,
    batch: DraftBatchRequest,
    guard: () => void,
    resolves: z.infer<typeof partReference>[] = [],
    finishesRequest = false,
    submitted?: (pending: NonNullable<ConversationState['pendingBatch']>) => void,
  ) {
    if (session.state.pendingBatch) throw new MapError('assistant_batch_unknown', 409);
    const request = structuredClone({ ...batch, operationId: batch.operationId ?? randomUUID() });
    session.state.pendingBatch = {
      request,
      owner: session.state.owner,
      before: structuredClone(session.state.review),
      resolves: structuredClone(resolves),
      messageId: session.state.activeMessage?.id,
      message: session.state.activeMessage && {
        text: session.state.activeMessage.text,
        consentTextVersion: session.state.activeMessage.consentTextVersion,
        conversationConsentTextVersion: session.state.activeMessage.conversationConsentTextVersion,
      },
      discarded: request.operations.length === 1 && request.operations[0].name === 'discard_draft',
      finishesRequest,
    };
    submitted?.(session.state.pendingBatch);
    session.state.batchCheckId = undefined;
    persist(session);
    let value: Awaited<ReturnType<typeof call>>;
    try {
      value = await call(session, 'apply_draft_batch', request, guard);
    } catch (error) {
      // Inspect this exact identity after a missing response. Never submit
      // a replacement mutation or start new model work.
      guard();
      if (error instanceof MapError && error.code !== 'result_unknown') {
        session.state.pendingBatch = undefined;
        throw error;
      }
      try {
        value = await readBatchOutcome(session, session.state.pendingBatch, guard);
      } catch (statusError) {
        guard();
        if (statusError instanceof MapError && statusError.code !== 'result_unknown') {
          session.state.pendingBatch = undefined;
          throw statusError;
        }
        throw new MapError('assistant_batch_unknown', 409);
      }
    }
    await verifyBatchOutcome(session, session.state.pendingBatch, value, guard);
    session.state.pendingBatch = undefined;
    return value;
  }
  async function readBatchOutcome(
    session: Session,
    pending: NonNullable<ConversationState['pendingBatch']>,
    guard?: () => void,
  ) {
    const { operationId, contentVersion } = pending.request;
    const { batch } = await call(
      session,
      'read_draft_batch',
      { operationId, contentVersion },
      guard,
    );
    if (!batch) {
      settleBatchAccounting(session, pending, false);
      session.state.pendingBatch = undefined;
      throw new MapError('assistant_batch_not_committed', 409);
    }
    return batch;
  }
  function settleBatchAccounting(
    session: Session,
    pending: NonNullable<ConversationState['pendingBatch']>,
    committed: boolean,
  ) {
    const accounting = session.execution.pendingBatchAccounting;
    if (accounting?.operationId !== pending.request.operationId) return;
    session.execution.pendingBatchAccounting = undefined;
    try {
      accounting.settle(committed);
    } catch {
      // Diagnostic delivery cannot replace the operation's primary outcome.
    }
  }
  function matchesCommittedBatch(
    value: Awaited<ReturnType<typeof call>>,
    request: NonNullable<ConversationState['pendingBatch']>['request'],
  ) {
    return (
      value.operationId === request.operationId &&
      value.contentVersion === request.contentVersion &&
      value.fromVersion === request.version &&
      value.appliedCount === request.operations.length &&
      value.status === 'committed'
    );
  }
  async function verifyBatchOutcome(
    session: Session,
    pending: NonNullable<ConversationState['pendingBatch']>,
    value: Awaited<ReturnType<typeof call>>,
    guard?: () => void,
  ) {
    guard?.();
    checkViewAccess(session);
    const { contentVersion } = pending.request;
    if (
      pending.owner !== contentOwner(database, session.state.householdId, session.state.actorId) ||
      !matchesCommittedBatch(value, pending.request)
    )
      throw new MapError('assistant_batch_unknown', 409);
    settleBatchAccounting(session, pending, true);
    await call(session, 'read_my_draft', {}, guard, 'lifecycle');
    guard?.();
    checkViewAccess(session);
    // A real read response can be delayed after its snapshot is taken. Use
    // the same synchronous authoritative snapshot as admission before
    // installing recovery evidence or allowing later work to continue.
    const after = assistantDraftReview(
      householdMap(database, session.state.actorId, session.state.householdId),
    );
    if (after.contentVersion !== contentVersion) throw new MapError('content_conflict', 409);
    session.state.review = after;
    if (!value.currentDraft || after.version !== value.version) {
      session.state.pendingBatch = undefined;
      session.state.result = { kind: 'draft', message: 'Ändringarna genomfördes i utkastet.' };
      throw new MapError('assistant_batch_committed_changed', 409);
    }
    return after;
  }
  async function recoverBatch(session: Session, checkId?: string) {
    const pending = session.state.pendingBatch;
    if (!pending) return;
    const guard = () => {
      if (sessions.get(session.state.id) !== session)
        throw new MapError('assistant_session_expired', 404);
      checkViewAccess(session);
      if (session.state.pendingBatch !== pending) throw new MapError('assistant_turn_changed', 409);
    };
    try {
      guard();
      const batch = await readBatchOutcome(session, pending, guard);
      const after = await verifyBatchOutcome(session, pending, batch, guard);
      guard();
      const currentParts = session.execution.parts.read();
      const resolves = pending.resolves.filter((reference) =>
        currentParts.some(
          (part) =>
            part.id === reference.id &&
            part.revision === reference.revision &&
            part.status === 'ready',
        ),
      );
      for (const operation of pending.request.operations)
        session.execution.parts.operation(
          resolves,
          operation.name,
          operation.arguments,
          pending.before,
          after,
          pending.messageId,
        );
      const failed = session.state.failedWork;
      session.execution.parts.complete(resolves);
      for (const message of [session.state.activeMessage, failed?.message])
        if (message && message.id === pending.messageId)
          recordReplyProgress(session, resolves, message);
      advanceDraftVersion(session, pending.request.version, after.version);
      session.state.workVersion = after.version;
      session.state.result = {
        kind: 'draft',
        message: pending.discarded ? 'Utkastet är kastat.' : 'Ändringarna genomfördes i utkastet.',
        changes: [
          ...(session.state.result?.changes ?? []),
          ...draftUpdateDetails(pending.before, after),
        ],
      };
      session.state.discarded = pending.discarded;
      session.state.pendingBatch = undefined;
      const unfinished = !pending.finishesRequest || hasReadyPendingParts(session);
      if (failed && failed.message.id === pending.messageId) {
        if (unfinished) failed.code = 'assistant_request_unfinished';
        else {
          session.state.failedWork = undefined;
          if (pending.messageId) settleRequests(session, pending.messageId, true);
        }
      }
      session.state.error = unfinished ? 'assistant_request_unfinished' : undefined;
      if (unfinished) {
        const request = session.state.unfinishedRequests.find(
          (request) => request.id === pending.messageId,
        );
        if (request) request.paused = true;
        session.state.requiredNotice = [
          session.state.requiredNotice,
          assistantFailureMessage('assistant_request_unfinished'),
        ]
          .filter(Boolean)
          .join('\n');
      }
      session.state.reply = [session.state.result.message, session.state.requiredNotice]
        .filter(Boolean)
        .join('\n');
      session.state.phase =
        session.state.pendingSave || after.pendingOperations.length
          ? 'recovery'
          : unfinished
            ? 'error'
            : 'ready';
      session.state.modelReply = undefined;
      session.state.saveIntent = undefined;
      syncQuestions(session);
    } catch (error) {
      if (sessions.get(session.state.id) !== session)
        throw new MapError('assistant_session_expired', 404);
      // A closed SDK request can wrap the guard's denial. Report current
      // authority, never an uncertain operation, after revocation.
      checkViewAccess(session);
      if (authorityLost(error)) throw error;
      if (
        session.state.pendingBatch !== pending &&
        !(
          error instanceof MapError &&
          [
            'assistant_batch_not_committed',
            'assistant_batch_committed_changed',
            'content_conflict',
          ].includes(error.code)
        )
      )
        return;
      if (error instanceof MapError && error.code === 'content_conflict')
        session.state.pendingBatch = undefined;
      session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'error';
      session.state.error = session.state.pendingBatch
        ? 'assistant_batch_unknown'
        : error instanceof MapError
          ? error.code
          : 'assistant_batch_unknown';
      const failed = session.state.failedWork;
      if (!session.state.pendingBatch && failed && failed.message.id === pending.messageId)
        failed.code = session.state.error;
      session.state.reply = assistantFailureMessage(session.state.error);
      session.state.modelReply = undefined;
      session.state.saveIntent = undefined;
    }
    if (!session.state.pendingBatch) {
      session.state.batchCheckId = checkId ?? pending.request.operationId;
      session.state.revision++;
      session.state.completedReplies?.push({
        id: `batch-${pending.request.operationId}`,
        request: pending.message?.text,
        // The original spoken executor can already have ended on the unknown
        // outcome. This new status reply uses the shared completion handoff.
        source: 'text',
        revision: session.state.revision,
        text: '',
        reply: session.state.reply,
        requiredNotice: session.state.requiredNotice,
        questionPending: Boolean(session.state.questions?.length),
        questions: session.state.questions?.slice(),
        newQuestions: session.state.newQuestions?.slice(),
        result: session.state.result,
        failed: Boolean(session.state.error),
      });
      appendConversation(session, {
        role: 'assistant',
        text: session.state.reply ?? '',
        requestId: pending.messageId,
      });
      const accepted = pending.messageId && session.state.accepted.get(pending.messageId);
      if (accepted) accepted.result = captureAssistantResult(view(session), 'live');
    }
  }

  // This deliberately narrow command check is not general language
  // verification. Ambiguous, quoted, negative and hypothetical requests need
  // a new clear instruction; a model-supplied approval flag has no authority.
  function nominalTopicsForSaveCheck(description: string) {
    // A modifier such as "bara om" introduces a condition, even when its
    // subject and predicate also resemble a nominal topic. Keep it intact.
    if (
      /(?:^|[^\p{L}\p{N}_])(?:bara|endast|enbart|blott|även|som|utom|inte|ej|aldrig|oavsett)\s+om\b/u.test(
        description,
      )
    )
      return description;
    const [heading, ...topics] = description.trim().split(/\bom\b/u);
    if (!heading.trim() || !topics.length) return description;
    // Unquoted replacement data may contain coordinated nominal topics. A
    // further predicate after a complete nominal group is not field data:
    // "om bilen startar" and "om kostnaden understiger 200" stay conditional.
    // Keep uncertain parses unchanged so the ordinary om guard rejects them.
    const determiner =
      /^(?:den|det|de|min|mitt|mina|din|ditt|dina|sin|sitt|sina|vår|vårt|våra|er|ert|era|en|ett|alla|dessa)$/u;
    const plural = /^(?:de|mina|dina|sina|våra|era|alla|dessa)$/u;
    for (const topic of topics) {
      const groups = topic
        .trim()
        .split(/\s*,\s*|\s+(?:och|samt|i|på|med|för|till|från|av|hos|vid|mellan|under|över)\s+/u);
      for (const group of groups) {
        const words = group.split(/\s+/u);
        const first = words[0];
        const last = words.at(-1) ?? '';
        const modifiers = words.slice(determiner.test(first) ? 1 : 0, -1);
        if (
          !/^[\p{L}\p{N}-]+$/u.test(last) ||
          modifiers.some((word) => !/^[\p{L}]+[aå]$/u.test(word)) ||
          words.some((word) =>
            /^(?:jag|du|han|hon|vi|ni|man|är|var|vore|blir|blev|har|hade|finns|fanns|kan|kunde|ska|skall|skulle|vill|ville|får|fick|måste)$/u.test(
              word,
            ),
          ) ||
          (/^(?:den|det|de|alla)$/u.test(first) && /(?:r|s|ade|de|te)$/u.test(last)) ||
          (modifiers.length > 0 && !plural.test(first) && /(?:ar|er|ade|de|te|s)$/u.test(last))
        )
          return description;
      }
    }
    return description.replace(/\bom\b/gu, '');
  }

  function requestsSave(text: string, purpose: 'authority' | 'clarification' = 'authority') {
    // A negated map fact does not negate a separate save command. A correction
    // may precede that command in the same sentence, but its imperative must
    // itself be affirmative. Conditions and withheld saving still block it.
    const unquoted = text
      .toLocaleLowerCase('sv')
      .replace(/["'“”«»].*?["'“”«»]/gu, '')
      .trim();
    // The imperative introduces field data up to a sentence boundary or the
    // final save clause. Heading words and topic length do not grant authority;
    // the separate command and all remaining conditions are checked below.
    const instruction = unquoted
      // Speech can mark a clause break or interrupted word with a dash.
      // Keep word-internal hyphens; only a following space ends the clause.
      .replace(/\s*[-–—]\s+/gu, '. ')
      .replace(
        /(^|[.!;]\s*)((?:ändra|rätta)\s+beskrivningen\s+till\s+)([^.!;?]+)/gu,
        (_, boundary, correction, remainder: string) => {
          const commandAt = remainder.search(/\b(?:och|sedan)\s+spara\b/u);
          const payload = commandAt < 0 ? remainder : remainder.slice(0, commandAt);
          const command = commandAt < 0 ? '' : remainder.slice(commandAt);
          return `${boundary}${correction}${nominalTopicsForSaveCheck(payload)}${command}`;
        },
      )
      .replace(
        /(^|[.!;]\s*)(jag vill ordna (?:flera )?uppgifter\s+om\s+(?:våra|mina|era|dina)\s+[\p{L}\p{N}-]+)(?=[.!;]|$)/gu,
        (_, boundary, topic: string) => `${boundary}${nominalTopicsForSaveCheck(topic)}`,
      );
    const sentences = instruction
      .trim()
      .replace(/[.!;]+$/u, '')
      .split(/[.!;]\s*/u);
    const plain = sentences.at(-1) ?? '';
    // Do not infer that a final imperative cancels an earlier withheld save,
    // or turn an example/condition spanning sentences into current authority.
    if (
      /\bom\s+(?:möjligt|tillåtet|nödvändigt|lämpligt|godkänt|säkert|önskat|föreskrivet|klart|okej|ok)\b/u.test(
        unquoted,
      ) ||
      /\b(om|när|kanske|skulle|exempel|citat|förklara)\b/u.test(instruction) ||
      // Check withheld saving before splitting spoken dash boundaries: in
      // "spara - inte" the negation still belongs to the same command.
      unquoted
        .replace(/[.!;]+$/u, '')
        .split(/[.!;]/u)
        .some(
          (sentence, index, originalSentences) =>
            (index < originalSentences.length - 1 || /[-–—]\s/u.test(sentence)) &&
            /\bspara(?:r|nde)?\b/u.test(sentence) &&
            /\b(inte|ej|ingenting|aldrig|utan|vänta)\b/u.test(sentence),
        )
    )
      return false;
    const correction = plain.match(
      /^(?:ta bort|lägg till|ändra|rätta)\s+(?!inte\b|ej\b|aldrig\b)(\S.*)\b(?:och|sedan)\s+(spara.*)$/u,
    );
    const command =
      correction && !/\?|\b(spara|sparar|vänta)\b/u.test(correction[1]) ? correction[2] : plain;
    const suffix =
      '(?:\\s+(?:nu|direkt|allt|allting|det|detta|det här|hela utkastet|utkastet|ändringarna|(?:alla|mina|våra) ändringar|förslaget|förslagen))*(?:\\s+med alla de här ändringarna)?';
    return (
      !/\b(inte|ej|ingenting|aldrig|utan|vänta|om|när|kanske|skulle|exempel|citat|förklara)\b/u.test(
        command,
      ) &&
      (new RegExp(`^(?:kan du spara|jag vill att du sparar)${suffix}[.!?]?$`, 'u').test(
        command.trim(),
      ) ||
        (!command.includes('?') &&
          new RegExp(
            `(?:^|[.!;]\\s*|\\boch\\s+|\\bsedan\\s+|\\bja,?\\s+${purpose === 'clarification' ? '|\\s+' : ''})spara${suffix}[.!]?$`,
            'u',
          ).test(command.trim())))
    );
  }
  function withdrawsSave(text: string) {
    return /\b(?:spara(?:r)?\s+(?:inte|ej|aldrig)|(?:inte|ej|aldrig)\s+spara|vänta\s+med\s+(?:att\s+)?spara)\b/iu.test(
      text.replace(/["'“”«»].*?["'“”«»]/gu, ''),
    );
  }
  function unsavedDraftNotice(session: Session) {
    return !session.state.pendingSave &&
      !session.state.receipt &&
      session.state.result &&
      draftChangeCount(session.state.review) > 0 &&
      ['draft', 'restored'].includes(session.state.result.kind)
      ? ' Ändringarna ligger kvar osparade i ditt utkast.'
      : '';
  }
  function failureMessages(session: Session, error: string, detail?: string) {
    const saveRequested = !!session.state.saveIntent;
    const unsavedNotice = saveRequested ? unsavedDraftNotice(session) : '';
    const failure =
      error === 'operation_conflict' && !session.state.pendingSave
        ? 'Ändringsuppdraget stämmer inte med den tidigare begäran. Granska ditt aktuella utkast innan du fortsätter.'
        : (detail ?? assistantFailureMessage(error));
    return {
      ordinary:
        failure +
        unsavedNotice +
        (saveRequested
          ? ' Din tidigare sparbegäran gäller inte längre. Be om sparande igen när detta är löst.'
          : ''),
      security: session.state.securityReference
        ? blockedActionMessage(session.state.securityReference) + unsavedNotice
        : undefined,
    };
  }
  async function saveReady(session: Session, serial: number, guard: () => void) {
    const deadline = now() + 180_000;
    for (;;) {
      guard();
      if (
        session.state.saveIntentDeadline !== undefined &&
        now() >= session.state.saveIntentDeadline
      )
        session.state.saveIntent = undefined;
      if (
        session.execution.parts.blocked() ||
        !session.state.saveIntent ||
        session.state.inputSerial !== serial ||
        session.state.queue.length
      )
        return false;
      if (!session.state.voiceInputPending && now() - (session.state.lastVoiceInputAt ?? 0) >= 2000)
        return true;
      if (now() >= deadline) throw new MapError('assistant_input_incomplete', 409);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  function currentSaveGuard(session: Session, serial: number, guard: () => void) {
    return () => {
      guard();
      if (
        session.execution.parts.blocked() ||
        !session.state.saveIntent ||
        (session.state.saveIntentDeadline !== undefined &&
          now() >= session.state.saveIntentDeadline) ||
        session.state.inputSerial !== serial ||
        session.state.queue.length ||
        session.state.voiceInputPending ||
        now() - (session.state.lastVoiceInputAt ?? 0) < 2000
      )
        throw new MapError('assistant_save_superseded', 409);
    };
  }
  async function refresh(session: Session, guard?: () => void) {
    const review = await call(session, 'read_my_draft', {}, guard, 'lifecycle');
    guard?.();
    session.state.review = review;
    const { operations } = await call(session, 'read_my_save_operations', {}, guard, 'lifecycle');
    guard?.();
    session.state.operations = operations;
    if (
      session.state.pendingSave &&
      !session.state.operations.some(
        (item) => item.operationId === session.state.pendingSave?.operationId,
      )
    ) {
      const { operation } = await call(
        session,
        'read_save_operation',
        { operationId: session.state.pendingSave.operationId },
        guard,
        'lifecycle',
      );
      guard?.();
      if (operation) session.state.operations.push(operation);
    }
  }
  async function selectedItem(
    session: Session,
    selection: MapSelection,
    draft: MapDraft,
    guard?: () => void,
  ) {
    const change = draft[draftChangeKeys[selection.kind]]?.find(({ id }) => id === selection.id);
    let item = change?.after;
    if (!change) {
      const map: { objects: MapObject[]; relationships: MapRelationship[] } = await call(
        session,
        'read_map',
        // The filtered read accepts shorter IDs than the map's proposal tools.
        selection.kind === 'object' && selection.id.length <= 100 ? { objectId: selection.id } : {},
        guard,
      );
      item = (selection.kind === 'object' ? map.objects : map.relationships).find(
        ({ id }) => id === selection.id,
      );
    }
    if (item && 'sourceId' in item) {
      const { sourceId, targetId } = item;
      if (draft.changes.some(({ id, after }) => !after && (id === sourceId || id === targetId)))
        return;
    }
    return item;
  }
  function verifiedReply(session: Session) {
    return session.state.result?.message ?? (session.state.receipt ? savedReply : undefined);
  }
  function syncQuestions(session: Session) {
    syncConversationQuestions(session.state, session.execution.parts.questions());
  }
  function turnReply(session: Session, text = '', separator = ' ') {
    const retained = [
      ...new Set([...(session.state.answers ?? []), ...(session.state.newQuestions ?? [])]),
    ];
    return (
      [text, ...retained.filter((part) => !text.includes(part))].filter(Boolean).join(separator) ||
      undefined
    );
  }
  function updateParts(
    session: Session,
    questions: z.infer<typeof pendingQuestions>,
    updates: z.infer<typeof partUpdates>,
    callId: string,
  ) {
    const message = session.state.activeMessage;
    if (!message) throw new MapError('invalid_request', 400);
    if (
      message.answerTo &&
      updates.some((update) => !message.answerTo?.some((part) => part.id === update.id))
    )
      throw new MapError('assistant_pending_part_changed');
    const result = session.execution.parts.apply(questions, updates, { ...message, callId });
    recordReplyProgress(session, updates, message);
    syncQuestions(session);
    session.state.newQuestions = [...(session.state.newQuestions ?? []), ...result.questions];
    session.state.answers = [...(session.state.answers ?? []), ...result.answers];
    session.state.modelReply = turnReply(session);
    return result;
  }
  function recordReplyProgress(
    session: Session,
    refs: { id: string; revision: number }[],
    message = session.state.activeMessage,
  ) {
    if (!message?.answerTo || !refs.length) return;
    const previous = message.answerProgress ?? message.answerTo;
    const current = session.execution.parts.read();
    // Advance only an uninterrupted chain from this request's admitted answer.
    // Manual changes and transitions by other requests cannot enter this proof.
    message.answerProgress = previous.map((ref) => {
      if (!refs.some((item) => item.id === ref.id && item.revision === ref.revision)) return ref;
      const part = current.find((part) => part.id === ref.id);
      return part && part.revision > ref.revision ? { id: ref.id, revision: part.revision } : ref;
    });
  }
  function saved(
    session: Session,
    receipt: TextAssistantView['receipt'],
    preserveCurrentReply = false,
  ) {
    // Every caller verifies the receipt first. Preserve only its identity on
    // the original request, before clearing the pending operation. A later
    // explanation can complete without presenting this as a new receipt.
    const pending = session.state.pendingSave;
    if (
      receipt &&
      pending?.messageId &&
      pending.operationId === receipt.operationId &&
      pending.version === receipt.draftVersion &&
      pending.contentVersion === receipt.contentVersion
    ) {
      const original = [session.state.activeMessage, session.state.failedWork?.message].find(
        (message) => message?.id === pending.messageId,
      );
      if (original) original.completedSaveOperationId = receipt.operationId;
    }
    if (receipt) advanceDraftVersion(session, receipt.draftVersion, receipt.draftVersion + 1);
    session.state.saveIntent = undefined;
    session.state.receipt = receipt;
    session.state.workVersion = receipt ? receipt.draftVersion + 1 : session.state.workVersion;
    session.state.pendingSave = undefined;
    session.state.reply = savedReply;
    appendConversation(session, { role: 'assistant', text: session.state.reply });
    session.state.modelReply = preserveCurrentReply
      ? turnReply(session, session.state.modelReply ?? '')
      : undefined;
    syncQuestions(session);
    session.state.requiredNotice = undefined;
    session.state.error = undefined;
    session.state.phase = 'ready';
    session.state.result = undefined;
    // The atomic receipt confirms that this exact whole draft was consumed.
    // A later view read is useful, but is not evidence required for saving.
    if (
      receipt &&
      session.state.review.version === receipt.draftVersion &&
      session.state.review.contentVersion === receipt.contentVersion
    ) {
      session.state.review = {
        version: receipt.draftVersion + 1,
        contentVersion: receipt.contentVersion,
        changes: [],
        conflicts: [],
        unresolvedIdentities: [],
        pendingOperations: [],
        readyToSave: false,
      };
    }
  }
  function verifyReceipt(
    session: Session,
    receipt: TextAssistantView['receipt'],
    expected: { operationId: string; version: number; contentVersion: number },
  ) {
    // The login actor grants access; restored private content can have a
    // different historical owner. Check the current grant/generation before
    // resolving that trusted binding, including after a delayed save reply.
    session.execution.mcp.checkAccess();
    if (
      !receipt ||
      receipt.operationId !== expected.operationId ||
      receipt.draftVersion !== expected.version ||
      receipt.contentVersion !== expected.contentVersion ||
      receipt.householdId !== session.state.householdId ||
      receipt.userId !== contentOwner(database, session.state.householdId, session.state.actorId)
    )
      throw new MapError('assistant_provider_failed', 503);
  }
  function applyCheckedSave(
    session: Session,
    checked: ReturnType<typeof checkSaves>,
    verificationSession = session,
  ) {
    const pending = session.state.pendingSave;
    if (checked.receipt) {
      const operation = checked.operations.find((item) => item.status === 'succeeded');
      if (!operation) throw new MapError('assistant_provider_failed', 503);
      // A queued request supplies current access while its result is delivered
      // to the conversation that originally registered the attempt.
      verifyReceipt(
        verificationSession,
        checked.receipt,
        pending ?? {
          operationId: operation.operationId,
          version: operation.draftVersion,
          contentVersion: operation.contentVersion,
        },
      );
      saved(session, checked.receipt);
    }
    const changed = session.state.saveCheck?.id !== checked.id;
    if (changed) {
      session.state.revision++;
      session.state.completedReplies?.push({
        id: `check-${checked.id}`,
        source: 'text',
        revision: session.state.revision,
        text: '',
        reply: checked.reply,
        receipt: checked.receipt,
        saveCheck: checked,
      });
    }
    session.state.pendingSave = undefined;
    session.state.phase = 'ready';
    session.state.error = undefined;
    session.state.saveCheck = checked;
    session.state.reply = checked.reply;
    const failed = session.state.failedWork;
    if (pending && failed && (!pending.messageId || pending.messageId === failed.message.id)) {
      if (pending.finishesRequest && checked.receipt && !hasReadyPendingParts(session)) {
        settleRequests(session, failed.message.id, true);
        session.state.failedWork = undefined;
      } else {
        failed.code = 'assistant_request_unfinished';
        session.state.phase = 'error';
        session.state.error = failed.code;
        const request = session.state.unfinishedRequests.find(({ id }) => id === failed.message.id);
        if (request) request.paused = true;
      }
    }
    if (pending?.messageId) {
      const accepted = session.state.accepted.get(pending.messageId);
      if (accepted) accepted.result = captureAssistantResult(view(session), 'prefix');
    }
    return changed;
  }
  async function recoverSave(session: Session, ids?: string[], checkId?: UUID, guard?: () => void) {
    guard?.();
    checkViewAccess(session);
    const revision = session.state.revision;
    const pending = session.state.pendingSave;
    const checked = checkSaves(
      database,
      session.state.actorId,
      session.state.householdId,
      ids,
      checkId,
    );
    await refresh(session, guard);
    if (session.state.revision !== revision || session.state.pendingSave !== pending) return;
    if (applyCheckedSave(session, checked)) {
      appendConversation(session, { role: 'assistant', text: checked.reply });
    }
    session.state.modelReply = undefined;
    syncQuestions(session);
    session.state.newQuestions = [];
    session.state.answers = [];
    session.state.requiredNotice = undefined;
    session.state.result = undefined;
  }
  async function refreshConfirmed(session: Session, guard?: () => void) {
    try {
      await refresh(session, guard);
    } catch (error) {
      // Retain the already verified receipt on a transport outage. Access,
      // content-generation and expired-session failures still close the session.
      if (
        !session.state.receipt ||
        authorityLost(error) ||
        (error instanceof MapError && error.code === 'assistant_session_expired')
      )
        throw error;
      authorize(
        session.state.actorId,
        session.execution.browserSessionId,
        session.state.householdId,
      );
      session.execution.mcp.checkAccess();
      guard?.();
    }
  }
  function finishInterruptedInput(session: Session) {
    const answered = new Set(
      session.state.input
        .filter((item) => item.type === 'function_call_output')
        .map((item) => item.call_id),
    );
    for (const item of [...session.state.input]) {
      if (item.type !== 'function_call' || answered.has(item.call_id)) continue;
      session.state.input.push({
        type: 'function_call_output',
        call_id: item.call_id,
        output: JSON.stringify({
          interrupted: true,
          message:
            'Resultatet är inte bekräftat. Läs aktuellt utkast och sparförsök före nytt arbete.',
        }),
      });
      answered.add(item.call_id);
    }
  }
  async function startOver(
    session: Session,
    preparation: Preparation,
    discard = false,
    deferVoiceClose = false,
    requestId?: string,
    spokenDiscard?: Pick<Message, 'draftVersion' | 'contentVersion'>,
  ) {
    const completion = resetContext(
      session,
      preparation,
      discard,
      deferVoiceClose,
      requestId,
      spokenDiscard,
    );
    session.execution.resetCompletion = completion;
    try {
      await completion;
    } finally {
      if (session.execution.resetCompletion === completion)
        session.execution.resetCompletion = undefined;
    }
  }
  async function waitForReset(session: Session) {
    while (session.execution.resetCompletion) {
      const completion = session.execution.resetCompletion;
      try {
        await completion;
      } catch (error) {
        // A stopped or superseded reset rejects its own request. Status readers
        // still recheck the surviving conversation's authority and current data.
        if (!(error instanceof MapError && error.code === 'assistant_turn_changed')) throw error;
      }
      if (session.execution.resetCompletion === completion) return;
    }
  }
  async function resetContext(
    session: Session,
    preparation: Preparation,
    discard: boolean,
    deferVoiceClose: boolean,
    requestId?: string,
    spokenDiscard?: Pick<Message, 'draftVersion' | 'contentVersion'>,
  ) {
    checkPreparation(preparation);
    if (spokenDiscard) {
      // Finish asynchronous reads before retiring any work. A newer draft must
      // leave the conversation intact even if it changed during the refresh.
      const revision = session.state.revision;
      await refresh(session, () => checkPreparation(preparation));
      checkPreparation(preparation);
      if (session.state.revision !== revision) throw new MapError('assistant_turn_changed', 409);
      const current = database
        .prepare(`SELECT 1 FROM household h
        LEFT JOIN map_draft d ON d.householdId = h.id AND d.userId = ?
        WHERE h.id = ? AND h.contentVersion = ? AND COALESCE(d.version, 0) = ?`)
        .get(
          session.state.owner,
          session.state.householdId,
          spokenDiscard.contentVersion,
          spokenDiscard.draftVersion,
        );
      if (
        !current ||
        session.state.review.version !== spokenDiscard.draftVersion ||
        session.state.review.contentVersion !== spokenDiscard.contentVersion
      )
        throw new MapError('assistant_draft_changed', 409);
    }
    session.state.paused = false;
    session.state.titleRequested = undefined;
    session.state.firstRequest = undefined;
    session.state.title = undefined;
    session.state.lastRequestAt = undefined;
    session.state.expiresAt = now() + conversationLifetime;
    session.state.modelChoice = personalModelChoice(database, session.state.actorId).read();
    session.state.modelChoiceRevision = (session.state.modelChoiceRevision ?? 0) + 1;
    const task = ownedDraftTask(session);
    // Retire the old executor before its task records disappear. A delayed
    // status response must not cancel work belonging to the new conversation.
    onResetStart?.(session.state.id, requestId);
    for (const [id, owner] of deliveryOwners) if (owner === session) deliveries.retire(id);
    session.execution.task?.abort();
    session.execution.task = undefined;
    session.state.activeMessage = undefined;
    clearWorkTimers(session);
    session.state.failedWork = undefined;
    session.execution.summaryTask?.abort();
    session.execution.summaryTask = undefined;
    session.state.pendingSummaryChoice = undefined;
    session.state.summary = undefined;
    session.state.summaryOffset = undefined;
    session.state.scopeOffset = undefined;
    session.state.contextSummaryState = undefined;
    session.state.contextSummaryFailure = undefined;
    session.state.capacityPaused = undefined;
    session.state.contextSummaries = [];
    session.execution.reads.clear();
    session.state.activity = undefined;
    session.state.workSteps = undefined;
    session.state.contextGeneration = 0;
    session.state.queue = [];
    for (const id of session.state.accepted.keys()) session.execution.deliveries.get(id)?.stop();
    session.state.accepted.clear();
    session.execution.deliveries.clear();
    session.state.taskId = undefined;
    session.state.resetGeneration++;
    syncWork();
    session.state.taskSource = undefined;
    session.state.canceled = undefined;
    session.state.completedReplies = [];
    session.state.revision++;
    session.state.boundaryRevision = session.state.revision;
    retirePreparations(session, preparation);
    session.state.saveIntent = undefined;
    session.state.voiceInputPending = false;
    const boundaryRevision = session.state.boundaryRevision;
    const checkReset = () => {
      checkPreparation(preparation);
      if (sessions.get(session.state.id) !== session)
        throw new MapError('assistant_session_expired', 404);
      if (session.state.boundaryRevision !== boundaryRevision)
        throw new MapError('assistant_turn_changed', 409);
    };
    try {
      if (!spokenDiscard) await refresh(session, checkReset);
      checkReset();
      session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'ready';
      session.state.workVersion = session.state.review.version;
      session.state.input = [];
      session.state.conversation = [];
      session.state.consentTextVersion =
        session.execution.approvedVersion ?? session.state.consentTextVersion;
      session.state.userRequests = [];
      session.state.unfinishedRequests = [];
      session.state.contextOffset = 0;
      session.state.contextRevision = (session.state.contextRevision ?? 0) + 1;
      session.execution.parts.clear();
      session.state.newQuestions = [];
      session.state.answers = [];
      session.execution.capacity.reset();
      session.state.resetSource = deferVoiceClose ? 'voice' : 'text';
      session.state.previousFailure = undefined;
      session.state.selection = undefined;
      session.state.displayedSelection = undefined;
      session.state.displayedItem = undefined;
      session.state.modelReply = undefined;
      session.state.reply = undefined;
      session.state.questions = undefined;
      session.state.requiredNotice = undefined;
      session.state.result = undefined;
      session.state.error = undefined;
      session.state.securityReference = undefined;
      session.state.receipt = undefined;
      session.state.saveCheck = undefined;
      session.state.discarded = undefined;
      session.state.phase =
        hasPendingOutcome(session) ||
        session.state.operations.some((item) => item.status === 'pending')
          ? 'recovery'
          : 'ready';
      session.state.reply = newConversationMessage(session.state.review);
      onNewConversation?.(view(session), deferVoiceClose);
      if (discard) {
        const receivedAt = now();
        admitMessage(
          session,
          {
            id: randomUUID(),
            text: 'Kasta utkastet.',
            voice: deferVoiceClose,
            resetDiscard: true,
            contentVersion: spokenDiscard?.contentVersion ?? session.state.review.contentVersion,
            draftVersion: spokenDiscard?.draftVersion ?? session.state.review.version,
            owner: contentOwner(database, session.state.householdId, session.state.actorId),
            receivedAt,
            deadline: receivedAt + 30 * 60_000,
            sequence: preparation.sequence,
          },
          session.state.review,
          'reset-discard',
        );
      }
    } catch (error) {
      // Closing the MCP transport can reject before its guarded read returns.
      // A retired reset still reports its current authority instead of that
      // transport error.
      checkReset();
      throw error;
    } finally {
      if (task) releaseDraft(session, task);
      else nextMessage(session);
    }
  }
  function hasUnregisteredQuestion(session: Session) {
    const reply = session.execution.parts
      .read()
      .filter((part) => part.kind === 'information' && part.status === 'waiting')
      .reduce((text, part) => text.replaceAll(part.question, ''), session.state.modelReply ?? '');
    if (!reply.includes('?')) return false;
    // A verified save consumes the draft before the request is settled.
    const { changes, objectTypes, relationshipTypes } =
      session.state.receipt ?? session.state.review;
    const names = new Set(
      [...changes, ...(objectTypes ?? []), ...(relationshipTypes ?? [])].flatMap(
        ({ before, after }) => [before?.name, after?.name],
      ),
    );
    // A question mark inside a quoted draft name is part of the reviewed data.
    return reply
      .replace(/"[^"]*"|'[^']*'|[“”][^”]*”|[‘’][^’]*’|«[^»]*»|»[^«»]*[«»]/gu, (quote) =>
        names.has(quote.slice(1, -1)) ? '' : quote,
      )
      .includes('?');
  }
  function canCompleteSave(session: Session) {
    return (
      session.state.phase === 'ready' &&
      session.state.saveIntent &&
      session.state.contextSummaryState !== 'failed' &&
      !session.state.receipt &&
      !session.state.pendingSave &&
      !session.execution.parts.blocked() &&
      !hasUnregisteredQuestion(session)
    );
  }
  async function run(
    session: Session,
    text: string,
    revision: number,
    task: AbortController,
    expected: { version: number; contentVersion: number },
  ) {
    const serial = session.state.inputSerial ?? 0;
    const currentObservation = observationWork.getStore();
    const observed = currentObservation?.session === session ? currentObservation : undefined;
    // Deferred batch accounting belongs to this work, even after a later
    // approval or conversation reset changes the session's current context.
    const observationIdentity = {
      sessionId: session.state.id,
      taskId: observed?.context.requestId,
      revision,
      consentTextVersion: observed?.consentTextVersion ?? session.state.consentTextVersion,
      conversationConsentTextVersion:
        observed?.conversationConsentTextVersion ?? session.state.consentTextVersion,
    };
    // Only the current whole-message command grants discard authority. Model
    // output, stored content and earlier dialogue cannot expand this turn.
    const discardRequested = conversationCommand(text)?.discard === true;
    const checkDiscard = (name: string) => {
      if (name === 'discard_draft' && !discardRequested)
        throw new MapError('assistant_discard_not_requested', 409);
    };
    let originalSaveIntent = Boolean(session.state.saveIntent);
    const overlap = config.conversationWorkMode === 'overlap';
    const interpretation = new AbortController();
    const speculative = new AbortController();
    const interpretationSignal = AbortSignal.any([task.signal, interpretation.signal]);
    const workSignal = AbortSignal.any([task.signal, speculative.signal]);
    type Scope = Awaited<ReturnType<typeof interpretTurnScope>>;
    let scope!: Scope;
    let scopeOutcome: { scope: Scope } | { error: unknown } | undefined;
    let scopeJob: Promise<NonNullable<typeof scopeOutcome>> | undefined;
    let admitted = false;
    let wholeRequestComplete = false;
    let workContextStarted = false;
    let initialDraft: TextAssistantReview | undefined;
    const attempts: {
      id?: string;
      used?: boolean;
      verified?: boolean;
      unknown?: 'batch' | 'save';
      resolve?: (committed: boolean) => void;
    }[] = [];
    const batchWork: {
      pending: NonNullable<ConversationState['pendingBatch']>;
      attempts: typeof attempts;
    }[] = [];
    const recordBatchWork = (pending: NonNullable<ConversationState['pendingBatch']>) => {
      if (observe) batchWork.push({ pending, attempts: attempts.slice() });
    };
    let saveWork:
      | {
          operation: { operationId: string; version: number; contentVersion: number };
          attempts: typeof attempts;
        }
      | undefined;
    let discardReason = 'failed';
    const guard = () => {
      if (
        task.signal.aborted ||
        session.state.revision !== revision ||
        !sessions.has(session.state.id)
      )
        throw new MapError('assistant_canceled', 409);
      authorize(
        session.state.actorId,
        session.execution.browserSessionId,
        session.state.householdId,
      );
    };
    try {
      guard();
      if (!respond) throw new Error('assistant_unavailable');
      scopeJob = interpretTurnScope(
        respond,
        text,
        session.state.activeMessage?.restate
          ? []
          : [
              ...new Set([
                ...session.state.userRequests.slice(0, -1),
                ...activeRequests(session)
                  .filter((request) => request.id !== session.state.activeMessage?.id)
                  .map((request) => request.text),
              ]),
            ],
        interpretationSignal,
        session.state.activeMessage?.restate,
      ).then(
        (scope) => {
          scopeOutcome = { scope };
          if (scope.mode === 'clarify') speculative.abort();
          return scopeOutcome;
        },
        (error: unknown) => {
          scopeOutcome = { error };
          speculative.abort();
          return scopeOutcome;
        },
      );
      const admitScope = async () => {
        if (admitted) return true;
        if (!scopeJob) throw new MapError('assistant_scope_unavailable', 409);
        const outcome = await scopeJob;
        guard();
        if ('error' in outcome) {
          discardReason = 'scope_failed';
          throw outcome.error;
        }
        scope = outcome.scope;
        if (session.state.activeMessage?.continuedVoiceRead && scope.mode !== 'read')
          throw new MapError('assistant_voice_restate_edit', 409);
        if (scope.mode === 'read') {
          session.state.saveIntent = undefined;
          originalSaveIntent = false;
        }
        if (scope.mode === 'clarify') {
          session.state.saveIntent = undefined;
          const message = session.state.activeMessage;
          if (!message) throw new MapError('invalid_request', 400);
          let answers = message.answerProgress ?? message.answerTo;
          let question = scope.request;
          const pending = [...session.execution.parts.values()]
            .filter((part) => part.status === 'waiting' || part.status === 'ready')
            .map(({ id, revision, request, question }) => ({ id, revision, request, question }));
          let create = !answers;
          if (!answers && pending.length && !message.restate) {
            const target = await matchClarification(respond, text, pending, interpretationSignal);
            guard();
            create = target.decision === 'new';
            if (target.decision === 'rephrase') answers = target.parts;
            if (target.decision === 'unclear') {
              question = target.question;
              session.state.newQuestions = [...(session.state.newQuestions ?? []), question];
            }
          }
          updateParts(
            session,
            create
              ? [
                  {
                    kind: scope.clarificationKind ?? 'change',
                    request: text,
                    question,
                    dependsOnDraft: true,
                  },
                ]
              : [],
            answers?.map((part) => ({
              ...part,
              action: 'rephrase' as const,
              messageId: message.id,
              evidence: text,
              question,
            })) ?? [],
            'turn-scope',
          );
          session.state.phase = 'ready';
          session.state.reply = question;
          appendConversation(session, { role: 'assistant', text: question });
          discardReason = 'clarification';
          if (workContextStarted) rebuildContext(session);
          return false;
        }
        admitted = true;
        for (const attempt of attempts) attempt.used = true;
        return true;
      };
      const rejectAction = (name: string, reason: 'read_only_turn' | 'outside_requested_work') => {
        const reference = randomUUID();
        session.state.securityReference = reference;
        console.error(
          JSON.stringify({
            event: 'assistant_action_out_of_scope',
            reference,
            at: new Date(now()).toISOString(),
            householdId: session.state.householdId,
            actorId: session.state.actorId,
            sessionId: session.state.id,
            taskId: session.state.taskId,
            source: session.state.taskSource,
            tool: name,
            reason,
          }),
        );
        throw new MapError('assistant_action_out_of_scope', 409);
      };
      // A read/report round cannot turn a partial checked batch into completed
      // work. Keep its independent verdict within this request, across reads.
      let checkedWorkComplete = false;
      const checkActions: CheckTurnActions = async (operations) => {
        wholeRequestComplete = false;
        guard();
        if (!operations.length) return;
        checkedWorkComplete = false;
        if (scope.mode === 'read') rejectAction(operations[0].name, 'read_only_turn');
        const reference = session.state.activeMessage?.queuedReference;
        const checksQueuedTarget = operations.some(
          (operation) => !['save_draft', 'prepare_save'].includes(operation.name),
        );
        if (session.state.activeMessage?.continuation && checksQueuedTarget)
          session.execution.parts.checkContinuation(
            session.state.activeMessage.id,
            session.state.review,
          );
        if (reference === null && checksQueuedTarget)
          throw new MapError('assistant_scope_unclear', 409);
        const wholeDraft = operations.every((operation) =>
          ['save_draft', 'prepare_save'].includes(operation.name),
        );
        const [map, catalog] = await session.execution.reads.consistent(() =>
          Promise.all([
            call(session, 'read_map', {}, guard),
            call(session, 'read_type_catalog', {}, guard),
          ]),
        );
        guard();
        const decision = await compareTurnActions(
          respond,
          { current: text, scope },
          turnActionOperations(map, session.state.review, operations),
          {
            map: turnActionData(
              map,
              wholeDraft
                ? [
                    ...operations,
                    ...[
                      { name: 'propose_object', changes: session.state.review.changes },
                      { name: 'propose_relationship', changes: session.state.review.relationships },
                      { name: 'propose_object_type', changes: session.state.review.objectTypes },
                      {
                        name: 'propose_relationship_type',
                        changes: session.state.review.relationshipTypes,
                      },
                    ].flatMap(({ name, changes }) =>
                      (changes ?? []).flatMap((change) =>
                        [change.before, change.after].map((value) => ({
                          name,
                          arguments: { id: change.id, value },
                        })),
                      ),
                    ),
                  ]
                : operations,
              catalog,
            ),
            draft: session.state.review,
            ...(wholeDraft ? { wholeDraft: true, initialDraft } : {}),
            queuedReference:
              reference && checksQueuedTarget
                ? queuedActionReference(reference, operations)
                : undefined,
          },
          task.signal,
        );
        guard();
        if (decision.decision === 'deny')
          rejectAction(operations[decision.operation].name, 'outside_requested_work');
        if (decision.decision === 'unavailable')
          throw new MapError('assistant_scope_unavailable', 409);
        if (decision.decision === 'clarify') {
          const message = session.state.activeMessage;
          if (!message) throw new MapError('assistant_scope_unavailable', 409);
          let answers = message.answerProgress ?? message.answerTo;
          if (answers?.length) {
            const pending = [...session.execution.parts.values()]
              .filter(
                (part) =>
                  (part.status === 'waiting' || part.status === 'ready') &&
                  answers?.some((ref) => ref.id === part.id && ref.revision === part.revision),
              )
              .map(({ id, revision, request, question }) => ({ id, revision, request, question }));
            const target = await matchClarification(respond, text, pending, task.signal, {
              operation: operations[decision.operation],
              question: decision.question,
            });
            guard();
            if (target.decision === 'unclear') throw new ActionClarification(target.question);
            answers = target.decision === 'rephrase' ? target.parts : undefined;
          }
          updateParts(
            session,
            answers?.length
              ? []
              : [
                  {
                    kind: 'change',
                    request: text,
                    question: decision.question,
                    dependsOnDraft: true,
                  },
                ],
            answers?.map((part) => ({
              ...part,
              action: 'rephrase' as const,
              messageId: message.id,
              evidence: text,
              question: decision.question,
            })) ?? [],
            'turn-action-clarification',
          );
          throw new ActionClarification(decision.question);
        }
        if (decision.decision === 'incomplete')
          throw new MapError('assistant_batch_incomplete', 409);
        checkedWorkComplete = decision.decision === 'allow' && decision.fulfillsRequest;
        wholeRequestComplete = checkedWorkComplete && !scope.responseRequired;
      };
      if (!overlap && !(await admitScope())) return;
      const [review, saveState] = await session.execution.reads.consistent(() =>
        Promise.all([
          call(session, 'read_my_draft', {}, guard) as Promise<TextAssistantReview>,
          call(session, 'read_my_save_operations', {}, guard),
        ]),
      );
      guard();
      if (
        review.version !== expected.version ||
        review.contentVersion !== expected.contentVersion
      ) {
        session.state.review = review;
        throw new MapError('assistant_draft_changed', 409);
      }
      session.state.review = review;
      initialDraft = structuredClone(review);
      session.state.operations = saveState.operations;
      if (session.state.operations.some((operation) => operation.status === 'pending'))
        throw new MapError('operation_pending', 409);
      const summaryRequested = session.state.contextSummaryState === 'needed';
      rebuildContext(session);
      if (summaryRequested || needsSummary(session)) {
        if (!(await admitScope())) return;
        await summarize(session, guard);
      }
      guard();
      if (session.state.contextSummaryState === 'failed') {
        session.state.phase = 'ready';
        return;
      }
      let version = review.version;
      const mutations = new Set<string>();
      function recordMutation(
        name: string,
        args: Record<string, unknown>,
        before: TextAssistantReview,
        after: TextAssistantReview,
        resolves: z.infer<typeof partReference>[] = [],
        verifiedVersion = after.version,
      ) {
        for (const attempt of attempts) attempt.verified = true;
        advanceDraftVersion(session, before.version, verifiedVersion);
        session.execution.parts.operation(
          resolves,
          name,
          args,
          before,
          after,
          session.state.activeMessage?.id,
        );
        if (after.version === before.version) return;
        const restored =
          name === 'discard_proposal' &&
          [before.changes, before.relationships, before.objectTypes, before.relationshipTypes].some(
            (changes) =>
              changes?.some((change) => change.id === args.id && change.before && !change.after),
          );
        mutations.add(restored ? 'restored' : 'draft');
        const kind = mutations.size === 1 && mutations.has('restored') ? 'restored' : 'draft';
        session.state.result = {
          kind,
          message: kind === 'restored' ? 'Återställt i utkastet.' : 'Utkastet är uppdaterat.',
          changes: [...(session.state.result?.changes ?? []), ...draftUpdateDetails(before, after)],
        };
      }
      let contentVersion = review.contentVersion;
      finishInterruptedInput(session);
      const dialogue = session.state.conversation
        .slice(session.state.contextOffset)
        .map(modelTranscriptEntry);
      session.state.contextOffset = session.state.conversation.length;
      let turnStart = session.state.input.length;
      workContextStarted = true;
      session.state.input.push({
        role: 'user',
        content: JSON.stringify({
          message: text,
          unfinishedRequests: activeRequests(session),
          pausedWork: session.state.capacityPaused
            ? { preserved: true, queuePaused: true }
            : undefined,
          messageId: session.state.activeMessage?.id,
          answerTo: session.state.activeMessage?.answerTo,
          pendingQuestions: contextParts(session)
            .filter((part) => part.status === 'waiting')
            .map((part) => part.question),
          questionPending: contextParts(session).some((part) => part.status === 'waiting'),
          pendingParts: contextParts(session),
          ...envelopeFacts(session, text, review),
          saveOperations: saveOperationReferences(session),
          outdatedReads: session.execution.reads.outdated().map(({ name }) => ({ name })),
          voiceContext: dialogue.length ? JSON.stringify(dialogue) : undefined,
          previousFailure: session.state.previousFailure
            ? { message: session.state.previousFailure, historical: true }
            : undefined,
        }),
      });
      const latestRound = new Set<string>();
      async function refreshCurrentDraft() {
        const current = (await call(session, 'read_my_draft', {}, guard)) as TextAssistantReview;
        if (current.version !== version || current.contentVersion !== contentVersion)
          throw new MapError('assistant_draft_changed', 409);
        session.state.review = current;
        const outdated = session.execution.reads.outdated();
        refreshContext(session, outdated, latestRound);
        return outdated.map(({ name }) => ({ name }));
      }
      const { tools, draftTools } = mapAgentTools(session.execution.mcp.tools);
      // Both a Runner tool call and completion of an explicit request use the
      // same reviewed version, save authority and server-owned operation.
      const executeSave = async (
        name: 'prepare_save' | 'save_draft',
        runnerCall?: { callId: string; continueResponse?: boolean },
      ) => {
        const saveGuard = currentSaveGuard(session, serial, guard);
        const current: TextAssistantReview = await call(session, 'read_my_draft', {}, saveGuard);
        if (
          current.version !== version ||
          current.version !== (session.state.workVersion ?? expected.version) ||
          current.contentVersion !== expected.contentVersion
        )
          throw new MapError('assistant_draft_changed', 409);
        if (current.conflicts.length) throw new MapError('assistant_conflict', 409);
        session.state.review = current;
        if (!runnerCall && !draftChangeCount(current)) {
          session.state.saveIntent = undefined;
          return;
        }
        await checkActions([{ name, arguments: { version, contentVersion } }]);
        saveGuard();
        session.state.pendingSave ??= {
          operationId: randomUUID(),
          version,
          contentVersion,
          messageId: session.state.activeMessage?.id,
          finishesRequest: wholeRequestComplete && !runnerCall?.continueResponse,
        };
        const pending = session.state.pendingSave;
        if (observe) saveWork = { operation: { ...pending }, attempts: attempts.slice() };
        const args = {
          operationId: pending.operationId,
          version: pending.version,
          contentVersion: pending.contentVersion,
        };
        const dispatch = () => call(session, name, args, saveGuard, 'shared', runnerCall?.callId);
        let value: Awaited<ReturnType<typeof call>>;
        if (name === 'save_draft') {
          await call(session, 'prepare_save', args, saveGuard);
          // Bind the SDK failure handler to the registered operation for both
          // model-requested saves and saves completed at the end of the turn.
          const save = tool({
            name,
            description: 'Save the registered whole draft',
            parameters: z.object({}),
            execute: async () => JSON.stringify(await dispatch()),
            errorFunction: async (_context, error) => {
              if (error instanceof MapError && error.code !== 'result_unknown') throw error;
              const { operation } = await call(
                session,
                'read_save_operation',
                { operationId: pending.operationId },
                guard,
                'lifecycle',
              );
              if (operation?.status !== 'succeeded') throw error;
              return JSON.stringify({ receipt: operation.receipt });
            },
          });
          value = JSON.parse(await save.invoke(new RunContext(), '{}', { signal: task.signal }));
          guard();
          verifyReceipt(session, value.receipt, pending);
          for (const attempt of attempts) attempt.verified = true;
          saved(session, value.receipt, true);
          if (runnerCall && (!wholeRequestComplete || runnerCall.continueResponse))
            session.state.phase = 'working';
          await refreshConfirmed(session, guard);
          originalSaveIntent = false;
        } else {
          value = await dispatch();
          guard();
          session.state.review = await call(session, 'read_my_draft', {}, guard);
        }
        version = session.state.review.version;
        contentVersion = session.state.review.contentVersion;
        return value;
      };
      const callIds = new Set<string>();
      const nextRound = async () => {
        guard();
        if (!respond) throw new Error('assistant_unavailable');
        const outdatedReads = await refreshCurrentDraft();
        if (needsSummary(session)) {
          if (!(await admitScope())) return;
          const continuation = session.state.input.slice(turnStart);
          await summarize(session, guard, continuation);
          guard();
          turnStart = session.state.input.length - continuation.length;
          if (view(session).contextSummaryState === 'failed' || needsSummary(session)) {
            if (session.state.contextSummaryFailure) session.state.contextSummaryState = 'failed';
            else failSummaryCapacity(session);
            session.state.phase = 'ready';
            return;
          }
        }
        session.state.activity = 'Bearbetar uppgiften';
        if (outdatedReads.length)
          session.state.input.push({
            role: 'developer',
            content: JSON.stringify({ outdatedReads }),
          });
        const instructions = `${session.execution.mcp.instructions}\n\n${textAssistantInstructions}`;
        if (exceedsRequestBudget(session, instructions, tools)) {
          if (!(await admitScope())) return;
          const continuation = session.state.input.slice(turnStart);
          await summarize(session, guard, continuation);
          guard();
          turnStart = session.state.input.length - continuation.length;
          if (view(session).contextSummaryState === 'failed') {
            session.state.phase = 'ready';
            return;
          }
          if (exceedsRequestBudget(session, instructions, tools)) {
            failSummaryCapacity(session);
            session.state.phase = 'ready';
            return;
          }
        }
        // Summaries await a provider and rebuild context. Revalidate their
        // continuation before dispatch so an intervening edit cannot reach
        // another work call as an older draft picture.
        await refreshCurrentDraft();
        if (exceedsRequestBudget(session, instructions, tools)) {
          failSummaryCapacity(session);
          session.state.phase = 'ready';
          return;
        }
        checkViewAccess(session);
        // Each concurrent call has its own provider identity. Only server-declared
        // read contracts may run before the independent interpretation resolves.
        if (scopeOutcome && !(await admitScope())) return;
        const attempt: (typeof attempts)[number] = {};
        attempts.push(attempt);
        const observedCall = observationWork.getStore();
        let response: Awaited<ReturnType<typeof respond>>;
        try {
          const perform = () => respond(instructions, session.state.input, tools, workSignal);
          response = await workAttempt.run(attempt, () =>
            observedCall ? observationWork.run({ ...observedCall }, perform) : perform(),
          );
        } catch (error) {
          if (scopeOutcome && !(await admitScope())) return;
          throw error;
        }
        guard();
        if (observedCall) observedCall.providerCallId = attempt.id;
        // Recheck the actual MCP grant and content owner after provider await,
        // including plain text replies that would otherwise call no tool.
        const afterProvider = (await call(
          session,
          'read_my_draft',
          {},
          guard,
        )) as TextAssistantReview;
        if (
          afterProvider.version !== version ||
          afterProvider.contentVersion !== contentVersion ||
          session.execution.reads.outdated().length
        )
          throw new MapError('assistant_draft_changed', 409);
        if (response.status !== 'completed') throw new Error('assistant_incomplete');
        const calls = response.output.filter((item) => item.type === 'function_call');
        latestRound.clear();
        for (const { call_id } of calls) {
          if (callIds.has(call_id)) throw new MapError('invalid_request', 400);
          callIds.add(call_id);
          latestRound.add(call_id);
        }
        const onlyReads =
          calls.length > 0 &&
          calls.every((action) =>
            session.execution.mcp.tools.some(
              (tool) => tool.name === action.name && tool.annotations?.readOnlyHint === true,
            ),
          );
        if (!admitted && (scopeOutcome || !onlyReads)) {
          if (!(await admitScope())) return;
          await refreshCurrentDraft();
          guard();
        }
        // Speculative reads are inputs to this work, never authority. Their
        // results and any proposal are discarded if interpretation cannot admit it.
        attempt.used = admitted;
        session.state.input.push(...toResponseInputItems(response.output));
        session.execution.capacity.text(response.usage, contextBytes(session));
        wholeRequestComplete = false;
        const observed = observationWork.getStore();
        for (const action of calls)
          observe?.({
            at: now(),
            sessionId: session.state.id,
            consentTextVersion: observed?.consentTextVersion,
            conversationConsentTextVersion: observed?.conversationConsentTextVersion,
            taskId: session.state.taskId,
            revision,
            context: observed && {
              ...observed.context,
              ...(observed.providerCallId
                ? {
                    spanId: observed.providerCallId,
                    parentSpanId: observed.context.spanId,
                    providerCallId: observed.providerCallId,
                  }
                : {}),
            },
            kind: 'model_action',
            data: { name: action.name, arguments: action.arguments, callId: action.call_id },
          });
        if (!calls.length) {
          wholeRequestComplete = checkedWorkComplete && Boolean(response.output_text.trim());
          session.state.modelReply = turnReply(session, response.output_text, '\n');
          if (response.output_text)
            appendConversation(session, { role: 'assistant', text: response.output_text });
          session.state.reply =
            verifiedReply(session) ??
            (session.state.displayedSelection ? 'Markerat i kartan.' : undefined);
          session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'ready';
          return { text: response.output_text, usage: response.usage };
        }
        const submits = calls.some((action) => action.name === 'submit_changes');
        if (submits && calls.length !== 1) throw new MapError('invalid_request', 400);
        // Reject malformed work before the SDK can return a parse error to the model.
        const submission = submits
          ? submittedChanges.safeParse(JSON.parse(calls[0].arguments))
          : undefined;
        if (submission && !submission.success) throw new MapError('invalid_request', 400);
        const mapSelections = new Map<string, MapSelection>();
        if (!submits) {
          const operations: DraftBatchRequest['operations'] = [];
          for (const action of calls) {
            if (!tools.some((tool) => tool.name === action.name))
              throw new MapError('assistant_unknown_tool', 409);
            if (action.name === 'show_map_object' || action.name === 'show_map_item') {
              const selection = parseMapSelection(action);
              const proposal = operations.find(
                ({ name, arguments: args }) =>
                  name === `propose_${selection.kind}` && args.id === selection.id,
              );
              if (
                proposal
                  ? proposal.arguments.value === null
                  : !(await selectedItem(
                      session,
                      selection,
                      selectionDraft(afterProvider, selection, operations),
                      guard,
                    ))
              )
                throw new MissingMapSelection();
              mapSelections.set(action.call_id, selection);
              continue;
            }
            const args = JSON.parse(action.arguments) as Record<string, unknown>;
            const tool = session.execution.mcp.tools.find((tool) => tool.name === action.name);
            if (!tool) continue; // Local conversation tools do not mutate the draft.
            // Internal saving supplies its own operation identity at dispatch.
            // Validate the same server-owned field here without registering work.
            const checkedArgs = ['save_draft', 'prepare_save'].includes(action.name)
              ? { ...args, operationId: session.state.pendingSave?.operationId ?? randomUUID() }
              : args;
            if (
              !z
                .fromJSONSchema(tool.inputSchema as z.core.JSONSchema.JSONSchema)
                .safeParse(checkedArgs).success
            )
              throw new MapError('invalid_request', 400);
            if (tool.annotations?.readOnlyHint !== true) {
              if (
                scope.mode !== 'read' &&
                ['save_draft', 'prepare_save'].includes(action.name) &&
                !session.state.saveIntent &&
                !originalSaveIntent &&
                !session.state.activeMessage?.saveSuperseded
              )
                throw new MapError('assistant_save_not_requested', 409);
              if (args.version !== version || args.contentVersion !== contentVersion)
                throw new MapError('assistant_draft_changed', 409);
              operations.push({ name: action.name, arguments: args });
            }
          }
          // Multiple draft mutations must name their shared atomic boundary.
          // Individual MCP calls remain available for one-operation work and
          // saving remains a separate step after committed draft changes.
          const draftMutations = operations.filter((operation) =>
            draftTools.some((tool) => tool.name === operation.name),
          );
          if (draftMutations.length > 1) throw new MapError('assistant_batch_required', 409);
          if (
            draftMutations.length &&
            operations.some(({ name }) => ['save_draft', 'prepare_save'].includes(name))
          )
            throw new MapError('invalid_request', 400);
          await checkActions(
            operations.filter(
              (operation) =>
                scope.mode === 'read' || !['save_draft', 'prepare_save'].includes(operation.name),
            ),
          );
        }
        const readCalls = calls.filter((action) =>
          session.execution.mcp.tools.some(
            (tool) => tool.name === action.name && tool.annotations?.readOnlyHint === true,
          ),
        );
        const terminal = calls.find((action) =>
          ['ask_questions', 'report_result'].includes(action.name),
        );
        if (terminal) {
          const selections =
            terminal.name === 'report_result'
              ? calls.filter((action) => ['show_map_object', 'show_map_item'].includes(action.name))
              : [];
          if (selections.length > 1 || readCalls.length + selections.length + 1 !== calls.length)
            throw new MapError('invalid_request', 400);
          // Validate a report before requesting a browser selection. Companions
          // never grant authority to an invalid terminal command.
          if (terminal.name === 'report_result') {
            const report = resultReport.safeParse(JSON.parse(terminal.arguments));
            if (!report.success || (report.data.source === 'last_failure' && mutations.size))
              throw new MapError('invalid_request', 400);
          }
        }
        const guardReadSnapshot = Boolean(
          readCalls.length && (terminal || calls.length === readCalls.length),
        );
        const orderedCalls = terminal
          ? [
              ...readCalls,
              ...calls.filter((action) => action !== terminal && !readCalls.includes(action)),
              terminal,
            ]
          : calls;
        const checkSnapshot =
          guardReadSnapshot || terminal ? session.execution.reads.snapshotGuard() : undefined;
        let terminalResult: boolean | undefined;
        function continueAfterResult(required: boolean) {
          terminalResult = !required;
          if (required) session.state.phase = 'working';
        }
        const submitChanges = async (
          action: MapAgentCall,
          batch: z.infer<typeof submittedChanges>,
        ) => {
          if (batch.version !== version || batch.contentVersion !== contentVersion)
            throw new MapError('assistant_draft_changed', 409);
          if (
            batch.completion === 'save' &&
            batch.questions.some(
              (question) => typeof question === 'string' || question.kind === 'change',
            )
          )
            throw new MapError('invalid_request', 400);
          // Validate every ordinary tool's schema before the first mutation.
          // MCP still validates domain state and authority on every operation.
          for (const operation of batch.operations) {
            const tool = draftTools.find((tool) => tool.name === operation.name);
            if (
              !tool ||
              'version' in operation.arguments ||
              'contentVersion' in operation.arguments ||
              !z
                .fromJSONSchema(tool.inputSchema as z.core.JSONSchema.JSONSchema)
                .safeParse({ ...operation.arguments, version, contentVersion }).success
            )
              throw new MapError('invalid_request', 400);
          }
          // Check the entire batch before its first mutation, even when an
          // otherwise requested edit precedes the whole-draft discard.
          await checkActions(batch.operations);
          if (
            batch.completion === 'save' &&
            !session.state.saveIntent &&
            !originalSaveIntent &&
            !session.state.activeMessage?.saveSuperseded
          )
            throw new MapError('assistant_save_not_requested', 409);
          for (const operation of batch.operations) checkDiscard(operation.name);
          session.execution.parts.validateCompletion(batch.resolves);
          updateParts(session, batch.questions, [], action.call_id);
          const operations = batch.operations.filter((operation) =>
            session.execution.parts.shouldRun(
              batch.resolves,
              operation.name,
              operation.arguments,
              session.state.review,
              session.state.activeMessage?.continuation
                ? session.state.activeMessage.id
                : undefined,
            ),
          );
          if (operations.length) {
            const beforeBatch = session.state.review;
            const value = await applyCheckedBatch(
              session,
              { operations, version, contentVersion },
              guard,
              batch.resolves,
              wholeRequestComplete &&
                !batch.continueResponse &&
                batch.completion === 'draft' &&
                !session.state.saveIntent,
              recordBatchWork,
            );
            const afterBatch = session.state.review;
            // No operation is recorded as completed until the whole batch has
            // committed. A failed batch preserves its pending parts unchanged.
            const previousChanges = session.state.result?.changes ?? [];
            for (const applied of (value.applied ??
              operations.map((operation) => ({
                ...operation,
                before: beforeBatch,
                after: afterBatch,
              }))) as {
              name: string;
              arguments: Record<string, unknown>;
              before: TextAssistantReview;
              after: TextAssistantReview;
            }[]) {
              recordMutation(
                applied.name,
                applied.arguments,
                applied.before,
                applied.after,
                batch.resolves,
              );
            }
            if (!value.applied && session.state.result)
              session.state.result.changes = [
                ...previousChanges,
                ...draftUpdateDetails(beforeBatch, afterBatch),
              ];
            session.state.workVersion = value.version;
            version = session.state.review.version;
            contentVersion = session.state.review.contentVersion;
          }

          if (batch.completion === 'save') {
            const save = await executeTool(
              { ...action, name: 'save_draft', arguments: '{}' },
              batch,
            );
            if (terminalResult) return save;
          }
          session.execution.parts.complete(batch.resolves);
          recordReplyProgress(session, batch.resolves);
          syncQuestions(session);
          session.state.reply = verifiedReply(session);
          session.state.phase = 'ready';
          const result = {
            result: session.state.result,
            receipt: session.state.receipt,
            reply: session.state.reply,
            review: draftFacts(session, text),
            questions: batch.questions,
            pendingParts: session.execution.parts.read(),
          };
          if (session.state.reply)
            appendConversation(session, { role: 'assistant', text: session.state.reply });
          if (session.state.modelReply)
            appendConversation(session, { role: 'assistant', text: session.state.modelReply });
          continueAfterResult(
            batch.continueResponse || !wholeRequestComplete || hasReadyPendingParts(session),
          );
          return result;
        };

        const executeTool = async (
          action: MapAgentCall,
          combined?: z.infer<typeof submittedChanges>,
          readSignal?: AbortSignal,
        ): Promise<unknown> => {
          const args = JSON.parse(action.arguments) as Record<string, unknown>;
          if (combined) Object.assign(args, { version, contentVersion });
          if (action.name === 'ask_questions') {
            const value = z
              .object({
                questions: pendingQuestions,
                updates: partUpdates.default([]),
                continueResponse: z.boolean().default(false),
              })
              .strict()
              .parse(args);
            if (!value.questions.length && !value.updates.length)
              throw new MapError('invalid_request', 400);
            // The model interprets the requested result; only current, checked
            // map/draft values can establish that the result already exists.
            for (const update of value.updates) {
              for (const expected of update.expected ?? []) {
                const collection =
                  expected.kind === 'object'
                    ? 'changes'
                    : expected.kind === 'relationship'
                      ? 'relationships'
                      : expected.kind === 'objectType'
                        ? 'objectTypes'
                        : 'relationshipTypes';
                const proposal = afterProvider[collection]?.find((item) => item.id === expected.id);
                let actual: unknown = proposal?.after;
                if (!proposal) {
                  const map = await call(session, 'read_map', {}, guard);
                  const key =
                    expected.kind === 'object'
                      ? 'objects'
                      : expected.kind === 'relationship'
                        ? 'relationships'
                        : expected.kind === 'objectType'
                          ? 'types'
                          : 'relationshipTypes';
                  actual = map[key]?.find((item: { id: string }) => item.id === expected.id);
                }
                guard();
                if (
                  !actual ||
                  !Object.entries(expected.value).every(([key, value]) =>
                    isDeepStrictEqual((actual as Record<string, unknown>)[key], value),
                  )
                )
                  throw new MapError('assistant_draft_changed');
              }
            }
            checkSnapshot?.();
            updateParts(session, value.questions, value.updates, action.call_id);
            session.state.reply = verifiedReply(session);
            session.state.phase = 'ready';
            const result = {
              questionPending: Boolean(session.state.questions?.length),
              questions: session.state.questions ?? [],
              pendingParts: session.execution.parts.read(),
            };
            if (session.state.modelReply)
              appendConversation(session, {
                role: 'assistant',
                text: session.state.modelReply,
              });
            continueAfterResult(value.continueResponse);
            return result;
          }
          if (action.name === 'report_result') {
            const parsed = resultReport.safeParse(args);
            if (!parsed.success) throw new MapError('invalid_request', 400);
            const report = parsed.data;
            if (report.source === 'draft') session.state.result = draftResult(afterProvider);
            else if (report.source === 'last_failure')
              session.state.result = {
                kind: 'failure',
                message: session.state.previousFailure
                  ? `Det senaste registrerade felbeskedet var: ${session.state.previousFailure}`
                  : 'Det finns inget registrerat fel i det här samtalet.',
              };
            else {
              let identity =
                report.source === 'save'
                  ? { operationId: report.operationId, userId: report.userId }
                  : undefined;
              if (report.source === 'latest_save') {
                const history = await call(session, 'read_history', { limit: 1 }, guard);
                const latest = history.history[0];
                if (latest) identity = { operationId: latest.operationId, userId: latest.userId };
              }
              const receipt = identity
                ? (await call(session, 'read_history', identity, guard)).receipt
                : undefined;
              checkSnapshot?.();
              session.state.result = historyResult(receipt);
            }
            guard();
            session.state.reply = session.state.result.message;
            session.state.modelReply = turnReply(session);
            session.state.phase = 'ready';
            appendConversation(session, { role: 'assistant', text: session.state.reply });
            continueAfterResult(
              report.continueResponse ||
                scope.responseRequired ||
                (scope.mode === 'work' && (!checkedWorkComplete || hasReadyPendingParts(session))),
            );
            if (terminalResult) wholeRequestComplete = checkedWorkComplete;
            return session.state.result;
          }
          const selection = mapSelections.get(action.call_id);
          if (selection) {
            const selected = await selectedItem(session, selection, session.state.review, guard);
            if (!selected) throw new MissingMapSelection();
            guard();
            observationWork.getStore()?.recordTool?.(action.name, 'tool', 'Markerar i kartan');
            session.state.selection = {
              ...selection,
              ...(action.name === 'show_map_object' ? { objectId: selection.id } : {}),
              revision,
              draftVersion: version,
              contentVersion,
            };
            const displayed = await new Promise<boolean>((resolve) => {
              const finish = (value: boolean) => {
                clearTimeout(timer);
                task.signal.removeEventListener('abort', abort);
                session.execution.displayed = undefined;
                resolve(value);
              };
              const abort = () => finish(false);
              const timer = setTimeout(() => finish(false), 15_000).unref();
              session.execution.displayed = finish;
              task.signal.addEventListener('abort', abort, { once: true });
            });
            guard();
            const current = (await call(
              session,
              'read_my_draft',
              {},
              guard,
            )) as TextAssistantReview;
            if (
              current.version !== version ||
              current.contentVersion !== contentVersion ||
              JSON.stringify(selected) !==
                JSON.stringify(await selectedItem(session, selection, current, guard))
            )
              throw new MapError('assistant_draft_changed', 409);
            session.state.selection = undefined;
            session.state.displayedSelection = displayed ? selection.id : undefined;
            session.state.displayedItem = displayed ? selection : undefined;
            return { ...selection, displayed };
          }
          const tool = session.execution.mcp.tools.find((tool) => tool.name === action.name);
          if (!tool) throw new MapError('assistant_unknown_tool', 409);
          checkDiscard(action.name);
          const { name } = action;
          if (name === 'save_draft' || name === 'prepare_save') {
            if (combined) {
              session.execution.parts.complete(combined.resolves);
              recordReplyProgress(session, combined.resolves);
              combined.resolves = [];
              syncQuestions(session);
            }
            if (session.execution.parts.blocked()) {
              session.state.phase = 'ready';
              terminalResult = true;
              return { saved: false };
            }
            const superseded = session.state.activeMessage?.saveSuperseded;
            if (!superseded && !session.state.saveIntent && !originalSaveIntent)
              throw new MapError('assistant_save_not_requested', 409);
            if (superseded || !(await saveReady(session, serial, guard))) {
              session.state.phase = 'ready';
              session.state.modelReply = undefined;
              session.state.reply = undefined;
              terminalResult = true;
              return { saved: false };
            }
            if (args.version !== version || args.contentVersion !== contentVersion)
              throw new MapError('assistant_draft_changed', 409);
            return executeSave(name, {
              callId: action.call_id,
              continueResponse: combined?.continueResponse,
            });
          }
          let previousReview: TextAssistantReview | undefined;
          if (tool.annotations?.readOnlyHint !== true) {
            const current = (await call(
              session,
              'read_my_draft',
              {},
              guard,
            )) as TextAssistantReview;
            if (
              current.version !== version ||
              current.contentVersion !== contentVersion ||
              args.version !== version ||
              args.contentVersion !== contentVersion
            )
              throw new MapError('assistant_draft_changed', 409);
            previousReview = current;
          }
          if (
            (combined || session.state.activeMessage?.continuation) &&
            !session.execution.parts.shouldRun(
              combined?.resolves ?? [],
              action.name,
              args,
              session.state.review,
              session.state.activeMessage?.continuation
                ? session.state.activeMessage.id
                : undefined,
            )
          ) {
            return { alreadyCompleted: true, review: draftFacts(session, text) };
          }
          let value: Awaited<ReturnType<typeof call>>;
          if (draftTools.some((tool) => tool.name === action.name)) {
            const { version: _version, contentVersion: _contentVersion, ...arguments_ } = args;
            const batch = await applyCheckedBatch(
              session,
              {
                operations: [{ name: action.name, arguments: arguments_ }],
                version,
                contentVersion,
              },
              guard,
              [],
              wholeRequestComplete && calls.length === 1 && !session.state.saveIntent,
              recordBatchWork,
            );
            value = batch.applied?.[0]?.result ?? { ...session.state.review };
            // Duplicate relationship additions are successful no-ops. Their
            // original tool contract identifies the actual existing edge.
            if (action.name === 'propose_relationship' && batch.version === version) {
              const requested = args.value as Partial<RelationshipValue> &
                Pick<RelationshipValue, 'sourceId' | 'targetId'>;
              const saved: { relationships: MapRelationship[] } = await call(
                session,
                'read_map',
                { objectId: requested.sourceId },
                guard,
              );
              const catalog: { relationshipTypes: RelationshipType[] } = await call(
                session,
                'read_type_catalog',
                {},
                guard,
              );
              const changes = session.state.review.relationships ?? [];
              const proposal = changes.find((change) => change.id === args.id);
              const previous =
                proposal?.after ??
                (proposal
                  ? proposal.before
                  : saved.relationships.find((edge) => edge.id === args.id));
              const typeId =
                (requested.typeId ?? previous?.typeId) ||
                ungroupedRelationshipType(catalog.relationshipTypes)?.id;
              if (!typeId) throw new MapError('assistant_batch_committed_changed', 409);
              const edge = {
                ...requested,
                typeId,
                verb: requested.verb ?? previous?.verb ?? 'har samband med',
              };
              const candidates = [...proposedRelationships(saved.relationships, changes).values()];
              const existing = candidates.find(
                (candidate) => candidate.id !== args.id && equivalentRelationships(candidate, edge),
              );
              if (!existing || (value.existingId && value.existingId !== existing.id))
                throw new MapError('assistant_batch_committed_changed', 409);
              value.existingId = existing.id;
            }
          } else
            value = await call(
              session,
              action.name,
              args,
              guard,
              'shared',
              action.call_id,
              readSignal,
            );
          guard();
          const result =
            tool.annotations?.readOnlyHint === false && Array.isArray(value.changes)
              ? {
                  ...draftFacts(session, text, value),
                  ...(typeof value.existingId === 'string' ? { existingId: value.existingId } : {}),
                }
              : value;
          if (tool.annotations?.readOnlyHint !== true) {
            if (Number.isSafeInteger(value.version)) session.state.workVersion = value.version;
            const before = previousReview ?? session.state.review;
            session.state.review = await call(session, 'read_my_draft', {}, guard);
            version = session.state.review.version;
            recordMutation(action.name, args, before, session.state.review, [], value.version);
          }
          return result;
        };
        return {
          calls: orderedCalls,
          checkSnapshot,
          parallelReadCount: guardReadSnapshot ? readCalls.length : 0,
          usage: response.usage,
          async execute(action: MapAgentCall, signal?: AbortSignal) {
            guard();
            checkViewAccess(session);
            if (terminalResult) return { interrupted: true };
            if (submission?.success) return submitChanges(action, submission.data);
            const companionRead =
              guardReadSnapshot && readCalls.some((read) => read.call_id === action.call_id);
            if (!companionRead) checkSnapshot?.();
            return executeTool(action, undefined, companionRead ? signal : undefined);
          },
          finish() {
            guard();
            if (terminalResult !== undefined) return terminalResult;
            if (!wholeRequestComplete || hasReadyPendingParts(session)) return false;
            if (session.state.receipt) return true;
            if (!mutations.size) return false;
            session.state.reply = verifiedReply(session);
            session.state.modelReply = turnReply(session);
            session.state.phase = 'ready';
            if (session.state.reply)
              appendConversation(session, { role: 'assistant', text: session.state.reply });
            return true;
          },
        };
      };
      await runMapAgent(
        tools,
        task.signal,
        (items) => {
          guard();
          checkViewAccess(session);
          session.state.input.push(...items);
        },
        nextRound,
      );
      guard();
      if (admitted && canCompleteSave(session)) {
        // Keep Stop available during the voice quiet period and the final check.
        session.state.phase = 'working';
        if (await saveReady(session, serial, guard)) await executeSave('save_draft');
        guard();
        session.state.phase = 'ready';
      }
    } catch (error) {
      if (!admitted && workContextStarted && session.state.revision === revision)
        rebuildContext(session);
      if (error instanceof MapError && error.code === 'assistant_draft_changed')
        discardReason = 'stale';
      if (
        task.signal.aborted ||
        session.state.revision !== revision ||
        !sessions.has(session.state.id)
      ) {
        discardReason = 'stopped';
        return;
      }
      if (authorityLost(error)) {
        if (stopExpiredVoice(session)) return;
        await stop(session);
        return;
      }
      session.state.phase =
        hasPendingOutcome(session) ||
        (error instanceof MapError && error.code === 'operation_pending')
          ? 'recovery'
          : 'error';
      session.state.error = session.state.pendingBatch
        ? 'assistant_batch_unknown'
        : error instanceof MapError
          ? error.code
          : session.state.pendingSave
            ? 'assistant_save_unknown'
            : 'assistant_provider_failed';
      if (session.state.error === 'assistant_context_capacity') pauseCapacity(session);
      const messages = failureMessages(
        session,
        session.state.error,
        error instanceof ActionClarification
          ? error.question
          : error instanceof MissingMapSelection && session.state.error === error.code
            ? assistantFailureMessage('assistant_object_missing')
            : undefined,
      );
      session.state.previousFailure = messages.ordinary;
      if (session.state.saveIntent) session.state.saveIntent = undefined;
      appendConversation(session, {
        role: 'assistant',
        text: session.state.previousFailure,
        notice:
          Boolean(messages.security || modelFailureRecovery.has(session.state.error)) || undefined,
      });
      session.state.reply = session.state.previousFailure;
      session.state.modelReply = undefined;
      session.state.requiredNotice = undefined;
      if (messages.security) {
        session.state.requiredNotice = messages.security;
        session.state.reply = session.state.requiredNotice;
      }
      if (error instanceof MapError && error.code === 'assistant_task_expired') return;
      try {
        await refresh(session, guard);
      } catch (refreshError) {
        if (
          task.signal.aborted ||
          session.state.revision !== revision ||
          !sessions.has(session.state.id)
        )
          return;
        if (session.state.pendingBatch && !authorityLost(refreshError)) {
          checkViewAccess(session);
          return;
        }
        await stop(session);
      }
    } finally {
      interpretation.abort();
      speculative.abort();
      // Retain actual attempt/usage endings even when one branch fails early.
      // No new model call or tool execution is started by this cleanup.
      await scopeJob;
      for (const { pending, attempts: batchAttempts } of batchWork) {
        if (batchAttempts.every((attempt) => attempt.verified)) continue;
        try {
          // A committed batch is used even if its response and status transport
          // fail or Stop wins delivery. Inspect metadata only; keep the public
          // pending-outcome barrier and all task state unchanged.
          const batch = textWork.exit(() => {
            checkViewAccess(session);
            return householdMap(
              database,
              session.state.actorId,
              session.state.householdId,
            ).draftBatch(pending.request.operationId, pending.request.contentVersion).batch;
          });
          if (
            batch &&
            pending.owner === session.state.owner &&
            matchesCommittedBatch(batch, pending.request)
          ) {
            for (const attempt of batchAttempts) attempt.verified = true;
            continue;
          }
          if (batch) for (const attempt of batchAttempts) attempt.unknown = 'batch';
        } catch {
          // Missing authority or evidence cannot prove that work was unused.
          for (const attempt of batchAttempts) attempt.unknown = 'batch';
        }
        if (session.state.pendingBatch === pending) {
          for (const attempt of batchAttempts) attempt.unknown = 'batch';
          session.execution.pendingBatchAccounting = {
            operationId: pending.request.operationId,
            settle: (committed) => {
              for (const attempt of batchAttempts) attempt.resolve?.(committed);
            },
          };
        }
      }
      if (saveWork?.attempts.some((attempt) => !attempt.verified)) {
        const { operation: expectedSave, attempts: saveAttempts } = saveWork;
        try {
          // Registration can commit before a delayed transport reply reaches
          // the task. Verify that durable effect without reviving stopped work.
          const operation = textWork.exit(() => {
            checkViewAccess(session);
            return householdMap(
              database,
              session.state.actorId,
              session.state.householdId,
            ).operation(expectedSave.operationId).operation;
          });
          if (
            operation &&
            operation.userId === session.state.owner &&
            operation.draftVersion === expectedSave.version &&
            operation.contentVersion === expectedSave.contentVersion
          )
            for (const attempt of saveAttempts) attempt.verified = true;
        } catch {
          // Diagnostic access/read failures cannot replace the task's outcome.
          for (const attempt of saveAttempts) attempt.unknown = 'save';
        }
      }
      for (const attempt of attempts) {
        if (!attempt.id) continue;
        const used = Boolean(
          attempt.verified ||
            (attempt.used &&
              !session.state.error &&
              !task.signal.aborted &&
              discardReason !== 'stale'),
        );
        const report = (disposition: 'used' | 'discarded' | 'unknown', reason?: string) => {
          try {
            observe?.({
              ...observationIdentity,
              at: now(),
              context: observed && {
                ...observed.context,
                spanId: randomUUID(),
                parentSpanId: observed.context.spanId,
                providerCallId: attempt.id,
              },
              kind: 'work_result',
              status: disposition === 'unknown' ? 'incomplete' : 'completed',
              data: {
                providerCallId: attempt.id,
                executionMode: overlap ? 'overlap' : 'sequential',
                disposition,
                ...(reason ? { reason } : {}),
              },
            });
          } catch {
            // Diagnostic delivery cannot replace the task's primary outcome.
          }
        };
        if (used) report('used');
        else if (attempt.unknown) {
          report('unknown', `${attempt.unknown}_outcome_unknown`);
          if (attempt.unknown === 'batch')
            attempt.resolve = (committed) =>
              report(committed ? 'used' : 'discarded', 'batch_outcome_verified');
        } else report('discarded', discardReason);
      }
    }
    return { mode: scope?.mode, wholeRequestComplete };
  }
  function nextMessage(session: Session) {
    if (closed) return;
    const key = draftKey(session);
    if (draftExecutions.has(key)) return;
    if (draftHasPendingBatch(session)) return;
    if (failedDraftWork(session)) return;
    const queued = [...sessions.values()]
      .filter((candidate) => draftKey(candidate) === key)
      .flatMap((session) => session.state.queue.map((message) => ({ session, message })))
      .sort((left, right) => left.message.sequence - right.message.sequence);
    let next = queued[0];
    if (!next) return;
    if (next.message.awaitingContinuation) {
      if (!next.session.state.paused) checkpointPause(next.session);
      return;
    }
    if (
      next.session.state.paused ||
      storage.pausedWork(
        next.session.state.actorId,
        next.session.state.householdId,
        next.session.state.id,
        next.message.sequence,
      )
    )
      return;
    try {
      currentConsent(next.session);
    } catch {
      checkpointPause(next.session);
      return;
    }
    if (next.session.state.capacityPaused && !next.message.restate) {
      // A complete new scope may pass deliberately paused work. Keep that
      // work queued, with its save authority revoked, and retain every actual
      // executing, preparation and registered-save barrier below.
      const restatement = queued.find(
        ({ session, message }) => session.state.capacityPaused && message.restate,
      );
      if (!restatement) return;
      next = restatement;
    }
    const { session: waiting, message } = next;
    if (hasEarlierPreparation(waiting, message.sequence)) return;
    try {
      const members = [...sessions.values()].filter((candidate) => draftKey(candidate) === key);
      const operations = householdMap(
        database,
        waiting.state.actorId,
        waiting.state.householdId,
      ).operations().operations;
      const ids = new Set([
        ...operations
          .filter((operation) => operation.status === 'pending')
          .map((operation) => operation.operationId),
        ...members.flatMap((member) =>
          member.state.pendingSave ? [member.state.pendingSave.operationId] : [],
        ),
      ]);
      for (const id of ids) {
        const checked = checkSaves(database, waiting.state.actorId, waiting.state.householdId, [
          id,
        ]);
        const origins = members.filter((member) => member.state.pendingSave?.operationId === id);
        for (const origin of origins.length ? origins : [waiting]) {
          applyCheckedSave(origin, checked, waiting);
          origin.state.saveIntent = undefined;
          origin.state.operations = householdMap(
            database,
            origin.state.actorId,
            origin.state.householdId,
          ).operations().operations;
        }
      }
    } catch {
      // Unverified outcomes keep every later request queued; no model retry or
      // replacement save is allowed to resolve an existing attempt.
      return;
    }
    if (
      waiting.state.phase === 'recovery' ||
      (!message.restate &&
        (waiting.state.error === 'assistant_context_capacity' ||
          waiting.state.capacityPaused ||
          waiting.state.contextSummaryState === 'failed')) ||
      waiting.state.contextSummaryState === 'summarizing'
    )
      return;
    waiting.state.queue = waiting.state.queue.filter((candidate) => candidate !== message);
    beginMessage(waiting, message, true);
  }
  function releaseDraft(session: Session, task: AbortController) {
    const key = draftKey(session);
    if (draftExecutions.get(key)?.task === task) draftExecutions.delete(key);
    nextMessage(session);
  }
  function expireMessage(session: Session, message: Message) {
    if (sessions.get(session.state.id) !== session) return;
    const accepted = session.state.accepted.get(message.id);
    if (!accepted || !['queued', 'working'].includes(accepted.status)) return;
    accepted.status = 'expired';
    const task = session.state.activeMessage === message ? session.execution.task : undefined;
    session.state.queue = session.state.queue.filter((item) => item !== message);
    if (session.state.activeMessage === message) {
      session.execution.task?.abort();
      session.execution.summaryTask?.abort();
      session.execution.task = undefined;
      session.state.activeMessage = undefined;
      session.state.taskId = undefined;
      session.state.taskSource = undefined;
      session.state.saveIntent = undefined;
      session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'error';
      session.state.error = 'assistant_task_expired';
      session.state.reply =
        'Uppgiftens tid är slut. Redan lagrat arbete finns kvar i ditt utkast eller sparresultat.';
    }
    accepted.result = captureAssistantResult(view(session), 'live');
    session.execution.deliveries.get(message.id)?.stop();
    syncWork();
    if (task) releaseDraft(session, task);
    else nextMessage(session);
  }
  function expireConversation(session: Session) {
    if (session.state.expiresAt !== undefined) {
      if (session.state.expiresAt <= now()) void stop(session, { delivery: 'close' });
      else
        session.execution.timer = setTimeout(
          () => expireConversation(session),
          session.state.expiresAt - now(),
        ).unref();
      return;
    }
    const activeUntil = Math.max(
      0,
      ...[...session.state.accepted]
        .filter(
          ([id, accepted]) =>
            ['queued', 'working'].includes(accepted.status) ||
            ['waiting', 'awaiting-receipt'].includes(
              session.execution.deliveries.get(id)?.value.state ?? '',
            ),
        )
        .map(([, accepted]) => accepted.deadline),
    );
    if (activeUntil > now()) {
      session.execution.timer = setTimeout(
        () => expireConversation(session),
        activeUntil - now(),
      ).unref();
    } else void stop(session, { delivery: 'close' });
  }
  function expireVoiceWork(session: Session) {
    const task = session.state.taskSource === 'voice' ? session.execution.task : undefined;
    for (const [id, accepted] of session.state.accepted)
      if (accepted.voice) session.execution.deliveries.get(id)?.stop();
    const queued = session.state.queue.filter((message) => message.voice);
    session.state.queue = session.state.queue.filter((message) => !message.voice);
    for (const message of queued) {
      clearTimeout(session.execution.messageTimers.get(message));
      session.execution.messageTimers.delete(message);
      const accepted = session.state.accepted.get(message.id);
      if (accepted) {
        accepted.status = 'canceled';
        session.execution.deliveries.get(message.id)?.stop();
        accepted.result = captureAssistantResult(view(session), 'live');
      }
    }
    if (session.state.taskSource === 'voice') {
      session.execution.task?.abort();
      session.execution.summaryTask?.abort();
      if (session.state.activeMessage) {
        clearTimeout(session.execution.messageTimers.get(session.state.activeMessage));
        session.execution.messageTimers.delete(session.state.activeMessage);
      }
      const messageId = session.state.activeMessage?.id;
      const accepted = messageId && session.state.accepted.get(messageId);
      session.execution.task = undefined;
      session.state.activeMessage = undefined;
      session.state.taskId = undefined;
      session.state.taskSource = undefined;
      session.state.saveIntent = undefined;
      session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'ready';
      if (accepted) {
        accepted.status = 'canceled';
        session.execution.deliveries.get(messageId || '')?.stop();
        accepted.result = captureAssistantResult(view(session), 'live');
      }
    }
    session.state.voiceInputPending = false;
    syncWork();
    if (task) releaseDraft(session, task);
    else nextMessage(session);
  }
  function stopExpiredVoice(session: Session) {
    if (
      session.state.taskSource !== 'voice' ||
      !(loginDeadline(session.state.actorId, session.execution.browserSessionId) <= now())
    )
      return false;
    try {
      session.execution.mcp.checkTaskAccess();
    } catch {
      return false;
    } // Explicit revocation stops every source.
    expireVoiceWork(session);
    return true;
  }
  function messageAccess(session: Session, message: Message) {
    if (sessions.get(session.state.id) !== session || endings.has(session.state.id))
      throw new MapError('forbidden', 403);
    if (!Number.isFinite(message.deadline) || now() >= message.deadline)
      throw new MapError('assistant_task_expired', 409);
    session.execution.mcp.checkTaskAccess();
    if (contentOwner(database, session.state.householdId, session.state.actorId) !== message.owner)
      throw new MapError('forbidden', 403);
    const generation = database
      .prepare('SELECT contentVersion FROM household WHERE id = ?')
      .get(session.state.householdId) as { contentVersion: number } | undefined;
    if (generation?.contentVersion !== message.contentVersion)
      throw new MapError('assistant_content_changed', 409);
    if (message.voice)
      textWork.exit(() =>
        authorize(
          session.state.actorId,
          session.execution.browserSessionId,
          session.state.householdId,
        ),
      );
  }
  function bindMessageResources(
    session: Session,
    message: Message,
    deliveryConnectionId?: string,
    deliveryAudio = false,
  ) {
    session.execution.deliveries.set(
      message.id,
      deliveries.bind(
        deliveryConnectionId,
        message.id,
        message.deadline,
        () => messageAccess(session, message),
        deliveryAudio,
      ),
    );
    session.execution.messageTimers.set(
      message,
      setTimeout(
        () => expireMessage(session, message),
        Math.max(1, message.deadline - now()),
      ).unref(),
    );
  }
  function admitMessage(
    session: Session,
    message: Message,
    current: TextAssistantReview,
    requestHash: string,
    deliveryConnectionId?: string,
    deliveryAudio = false,
  ) {
    // Draft reads and resets can cross login expiry. Admission is synchronous,
    // and retries retain this original receipt.
    authorize(session.state.actorId, session.execution.browserSessionId, session.state.householdId);
    if (session.state.paused) throw new MapError('assistant_work_paused', 409);
    // Speech already renews retention when its transcript arrives. A delayed
    // delegation starts backend work without moving that user-message anchor.
    session.execution.mcp.acceptTask(message.deadline);
    session.state.accepted.set(message.id, {
      hash: requestHash,
      voice: message.voice,
      status: 'queued',
      receivedAt: message.receivedAt,
      deadline: message.deadline,
    });
    if (!message.voice || !firstRequest(session.state)) recordRequest(session.state);
    if (!session.state.titleRequested)
      generateTitle(session, firstRequest(session.state) ?? message.text);
    bindMessageResources(session, message, deliveryConnectionId, message.voice || deliveryAudio);
    syncWork();
    session.state.inputSerial = (session.state.inputSerial ?? 0) + 1;
    const key = draftKey(session);
    const latestSequence = latestAcceptedSequences.get(key) ?? -1;
    if (requestsSave(message.text) && latestSequence > message.sequence)
      message.saveSuperseded = true;
    latestAcceptedSequences.set(key, Math.max(latestSequence, message.sequence));
    supersedeSaves(session, message.sequence);
    if (withdrawsSave(message.text)) session.state.saveIntent = undefined;
    if (message.resetDiscard || waitsForDraft(session, message.sequence, current)) {
      session.state.queue.push(message);
      session.state.queue.sort((left, right) => left.sequence - right.sequence);
      if (!session.state.failedWork) session.state.phase = 'working';
      session.state.canceled = undefined;
      if (!session.execution.task && !session.state.failedWork)
        session.state.activity = 'Väntar på tidigare uppdrag';
      nextMessage(session);
    } else {
      session.state.review = current;
      session.state.workVersion = current.version;
      beginMessage(session, message);
    }
  }
  function continueMessage(
    session: Session,
    original: Message,
    deliveryConnectionId?: string,
    deliveryAudio = false,
  ) {
    const accepted = session.state.accepted.get(original.id);
    if (!accepted) throw new MapError('assistant_turn_changed', 409);
    const receivedAt = now();
    const message: Message = {
      ...original,
      awaitingContinuation: undefined,
      continuation:
        original.continuation ||
        session.state.unfinishedRequests.some((request) => request.id === original.id),
      saveSuperseded: true,
      receivedAt,
      deadline: receivedAt + 30 * 60_000,
    };
    session.execution.mcp.acceptTask(message.deadline);
    accepted.status = 'queued';
    accepted.receivedAt = receivedAt;
    accepted.deadline = message.deadline;
    accepted.result = undefined;
    session.execution.deliveries.get(message.id)?.stop();
    bindMessageResources(session, message, deliveryConnectionId, deliveryAudio);
    session.state.saveIntent = undefined;
    session.state.saveIntentDeadline = undefined;
    session.execution.reads.clear();
    for (const queued of session.state.queue)
      if (queued.id === original.id) {
        clearTimeout(session.execution.messageTimers.get(queued));
        session.execution.messageTimers.delete(queued);
      }
    session.state.queue = session.state.queue.filter((queued) => queued.id !== original.id);
    for (const request of session.state.unfinishedRequests)
      if (request.id === original.id) request.paused = false;
    session.state.queue.push(message);
    session.state.queue.sort((left, right) => left.sequence - right.sequence);
    syncWork();
  }
  function beginMessage(session: Session, message: Message, queued = false) {
    const accepted = session.state.accepted.get(message.id);
    if (!accepted) return;
    const consentTextVersion =
      session.execution.approvedVersion ?? session.state.consentTextVersion;
    const conversationConsentTextVersion = session.state.consentTextVersion;
    message.consentTextVersion = consentTextVersion;
    message.conversationConsentTextVersion = conversationConsentTextVersion;
    session.state.batchCheckId = undefined;
    accepted.status = 'working';
    const task = new AbortController();
    draftExecutions.set(draftKey(session), { session, task });
    session.execution.task = task;
    session.state.activeMessage = message;
    session.state.taskId = message.id;
    session.state.taskSource = message.voice ? 'voice' : 'text';
    if (message.restate) {
      for (const request of session.state.unfinishedRequests) request.paused = true;
      session.state.saveIntent = undefined;
      session.state.saveIntentDeadline = undefined;
      session.state.summary = undefined;
      session.state.pendingSummaryChoice = undefined;
      session.state.summaryOffset = session.state.conversation.length;
      session.state.scopeOffset = session.state.conversation.length;
      session.state.contextOffset = session.state.conversation.length;
      session.state.input = [];
      session.state.contextSummaryState = undefined;
      session.state.contextSummaryFailure = undefined;
      session.state.contextGeneration = (session.state.contextGeneration ?? 0) + 1;
      session.execution.capacity.reset();
      invalidateQueuedSaves(session);
    }
    if (message.saveScopeChanged || message.saveSuperseded) session.state.saveIntent = undefined;
    if (
      !message.saveSuperseded &&
      !message.saveScopeChanged &&
      !message.continuedVoiceRead &&
      requestsSave(message.text) &&
      !withdrawsSave(message.text)
    ) {
      session.state.saveIntent = message.text;
      session.state.saveIntentDeadline = message.deadline;
    }
    session.state.revision++;
    session.state.phase = 'working';
    session.state.activity = 'Förbereder uppgiften';
    if (!message.resetDiscard) session.state.resetSource = undefined;
    session.state.canceled = undefined;
    session.state.error = undefined;
    session.state.securityReference = undefined;
    session.state.reply = undefined;
    session.state.modelReply = undefined;
    session.state.newQuestions = [];
    session.state.answers = [];
    session.state.requiredNotice = undefined;
    session.state.receipt = undefined;
    session.state.saveCheck = undefined;
    session.state.discarded = undefined;
    session.state.result = undefined;
    session.state.selection = undefined;
    session.state.displayedSelection = undefined;
    session.state.displayedItem = undefined;
    if (!message.resetDiscard && !message.continuation) {
      if (!message.voice) appendConversation(session, { role: 'user', text: message.text });
      session.state.userRequests = [...session.state.userRequests, message.text].slice(-24);
      session.state.unfinishedRequests.push({
        id: message.id,
        text: message.text,
      });
    }
    // Scope clarifications are transient; ledger questions remain pending until
    // their existing identity/answer protocol resolves them.
    syncQuestions(session);
    const revision = session.state.revision;
    const startedAt = now();
    const observationContext = backendTaskObservationContext(
      session.state.id,
      message.id,
      session.state.resetGeneration,
    );
    observe?.({
      at: startedAt,
      sessionId: session.state.id,
      consentTextVersion,
      conversationConsentTextVersion,
      taskId: message.id,
      revision,
      context: observationContext,
      kind: 'task_started',
      status: 'incomplete',
      data: {
        source: message.voice ? 'voice' : 'text',
        executionMode: config.conversationWorkMode ?? 'sequential',
        startedAt,
        request: {
          text: message.text,
          draftVersion: session.state.workVersion ?? session.state.review.version,
          contentVersion: message.contentVersion,
        },
      },
    });
    const guard = () => {
      if (
        task.signal.aborted ||
        session.state.revision !== revision ||
        sessions.get(session.state.id) !== session
      )
        throw new MapError('assistant_canceled', 409);
      if (!Number.isFinite(message.deadline) || now() >= message.deadline)
        throw new MapError('assistant_task_expired', 409);
      messageAccess(session, message);
    };
    const expected = {
      version: session.state.workVersion ?? session.state.review.version,
      contentVersion: message.contentVersion,
    };
    const execute = async () => {
      guard();
      if (queued || message.queuedReference !== undefined) {
        const current = await call(session, 'read_my_draft', {}, guard);
        guard();
        if (current.contentVersion !== expected.contentVersion)
          throw new MapError('content_conflict', 409);
        if (current.version !== message.draftVersion) invalidateQueuedSaves(session);
        if (
          (message.continuedVoiceRead ||
            (requestsSave(message.text) && !message.saveSuperseded && !message.saveScopeChanged) ||
            ((!message.resetDiscard || message.voice) &&
              conversationCommand(message.text)?.discard)) &&
          current.version !== message.draftVersion
        )
          throw new MapError('assistant_draft_changed', 409);
        // Fresh facts retain the admitted target. Only checked predecessor
        // effects advance message.draftVersion; manual drift revokes old saves.
        session.state.review = current;
        session.state.workVersion = current.version;
        expected.version = current.version;
      }
      if (message.answerTo)
        session.execution.parts.validateReply(
          message.answerTo,
          message.continuation ? message.answerProgress : undefined,
        );
      if (conversationCommand(message.text)?.discard) {
        if (message.continuation)
          session.execution.parts.checkContinuation(message.id, session.state.review);
        await applyCheckedBatch(
          session,
          { ...expected, operations: [{ name: 'discard_draft', arguments: {} }] },
          guard,
          [],
          true,
        );
        guard();
        advanceDraftVersion(session, expected.version, session.state.review.version);
        session.state.workVersion = session.state.review.version;
        session.state.phase = 'ready';
        session.state.result = {
          kind: 'draft',
          message: message.resetDiscard
            ? newConversationMessage(session.state.review)
            : 'Utkastet är kastat.',
        };
        session.state.reply = session.state.result.message;
        session.state.discarded = true;
        if (!message.resetDiscard) {
          appendConversation(session, { role: 'assistant', text: session.state.reply });
          finishInterruptedInput(session);
          session.state.input.push(
            { role: 'user', content: JSON.stringify({ message: message.text }) },
            { role: 'assistant', content: session.state.reply },
          );
          settleRequests(session, message.id, true);
        }
      } else {
        const outcome = await run(session, message.text, revision, task, expected);
        guard();
        const unregisteredQuestion = hasUnregisteredQuestion(session);
        if (
          (session.execution.parts.blocked() || unregisteredQuestion) &&
          // Speech may omit the sentence boundary before a final save request.
          // Explain renewal in that case without granting save authority.
          (session.state.saveIntent ||
            (message.voice && requestsSave(message.text, 'clarification')))
        ) {
          session.state.saveIntent = undefined;
          const notice =
            'Din tidigare sparbegäran gäller inte längre. Be om sparande igen när frågorna är lösta.';
          session.state.requiredNotice = notice;
          session.state.reply = [session.state.reply, notice].filter(Boolean).join('\n');
          appendConversation(session, { role: 'assistant', text: notice });
        }
        const verifiedSave =
          session.state.receipt || (message.continuation && message.completedSaveOperationId);
        if (
          session.state.phase === 'ready' &&
          !unregisteredQuestion &&
          (outcome?.mode !== 'work' || outcome.wholeRequestComplete || verifiedSave)
        )
          settleRequests(
            session,
            message.id,
            outcome?.mode === 'read' ||
              (Boolean(session.state.result || verifiedSave) &&
                !session.execution.parts
                  .read()
                  .some((part) => part.status === 'waiting' || part.status === 'ready')),
          );
        if (
          message.saveSuperseded &&
          requestsSave(message.text) &&
          !message.completedSaveOperationId &&
          !session.state.pendingSave &&
          !session.state.receipt
        ) {
          const notice = assistantFailureMessage('assistant_save_superseded');
          session.state.requiredNotice = notice;
          session.state.reply = [session.state.reply, notice].filter(Boolean).join('\n');
          appendConversation(session, { role: 'assistant', text: notice });
        }
        if (
          !task.signal.aborted &&
          session.state.revision === revision &&
          session.state.phase === 'ready' &&
          needsSummary(session)
        )
          if (message.voice) {
            session.state.pendingSummaryChoice = selectedModel;
            session.state.contextSummaryState = 'needed';
          } else await summarize(session, guard);
      }
    };
    let observationStatus: ObservationStatus = 'incomplete';
    const selectedModel = { ...session.state.modelChoice };
    let previousTool: { name: string; kind: ConversationWorkStep['kind'] } | undefined;
    const executing = modelWork.run(conversationModelProfile(selectedModel), () =>
      observationWork.run(
        {
          session,
          consentTextVersion,
          conversationConsentTextVersion,
          context: observationContext,
          revision,
          deadline: message.deadline,
          recordTool: (name, kind, text) => {
            if (
              task.signal.aborted ||
              session.state.revision !== revision ||
              session.execution.task !== task ||
              session.state.phase !== 'working'
            )
              return;
            const steps = session.state.workSteps ?? [];
            const last = steps.at(-1);
            session.state.workSteps =
              last && previousTool?.name === name && previousTool.kind === kind
                ? [...steps.slice(0, -1), { ...last, count: last.count + 1 }]
                : [...steps, { id: randomUUID(), requestId: message.id, kind, text, count: 1 }];
            previousTool = { name, kind };
            session.state.activity = undefined;
            persist(session);
          },
        },
        async () => {
          try {
            try {
              requireEnabledChoice(selectedModel, config.conversationModels);
            } catch (error) {
              if (error instanceof MapError && error.code === 'assistant_model_unsupported')
                console.error(
                  JSON.stringify({
                    event: 'assistant_model_failed',
                    reference: randomUUID(),
                    at: new Date(now()).toISOString(),
                    model: selectedModel.model,
                    effort: selectedModel.effort,
                    category: error.code,
                  }),
                );
              throw error;
            }
            await (message.voice ? execute() : textWork.run({ session, guard }, execute));
            // Capture the outcome before a queued or concurrent request can replace
            // the mutable conversation view. A stale execution has no known success.
            observationStatus =
              now() >= message.deadline
                ? 'incomplete'
                : task.signal.aborted
                  ? 'canceled'
                  : session.state.revision !== revision ||
                      session.execution.task !== task ||
                      !sessions.has(session.state.id)
                    ? 'incomplete'
                    : session.state.error ||
                        session.state.phase === 'error' ||
                        session.state.phase === 'recovery'
                      ? 'failed'
                      : 'completed';
          } catch (error) {
            observationStatus =
              now() >= message.deadline ||
              (error instanceof MapError && error.code === 'assistant_task_expired')
                ? 'incomplete'
                : task.signal.aborted ||
                    (error instanceof MapError && error.code === 'assistant_canceled')
                  ? 'canceled'
                  : 'failed';
            throw error;
          }
        },
      ),
    );
    void executing
      .catch((error) => {
        if (task.signal.aborted || session.state.revision !== revision) return;
        session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'error';
        session.state.error = session.state.pendingBatch
          ? 'assistant_batch_unknown'
          : session.state.pendingSave
            ? 'assistant_save_unknown'
            : error instanceof MapError &&
                [
                  'assistant_task_expired',
                  'assistant_pending_part_changed',
                  'assistant_action_out_of_scope',
                  'assistant_scope_unclear',
                  'assistant_scope_unavailable',
                  'assistant_batch_incomplete',
                  'assistant_batch_committed_changed',
                  'assistant_batch_not_committed',
                  'assistant_model_unsupported',
                  'assistant_model_access',
                  'assistant_model_temporary',
                  'assistant_context_capacity',
                ].includes(error.code)
              ? error.code
              : 'assistant_draft_changed';
        if (session.state.error === 'assistant_context_capacity') pauseCapacity(session);
        const messages = failureMessages(
          session,
          session.state.error,
          error instanceof ActionClarification ? error.question : undefined,
        );
        session.state.reply = messages.ordinary;
        session.state.saveIntent = undefined;
        if (messages.security) {
          session.state.requiredNotice = messages.security;
          session.state.reply = session.state.requiredNotice;
        }
        if (
          session.state.securityReference ||
          session.state.error.startsWith('assistant_scope_') ||
          session.state.error === 'assistant_context_capacity' ||
          session.state.error === 'assistant_batch_incomplete'
        ) {
          session.state.modelReply = undefined;
          session.state.previousFailure = session.state.reply;
          appendConversation(session, {
            role: 'assistant',
            text: session.state.reply,
            notice: true,
          });
        }
      })
      .finally(() => {
        observe?.({
          at: now(),
          sessionId: session.state.id,
          consentTextVersion,
          conversationConsentTextVersion,
          taskId: message.id,
          revision,
          context: observationContext,
          kind: 'task_completed',
          status: observationStatus,
          ...(observationStatus === 'incomplete' ? { evidenceGap: 'missing_end' as const } : {}),
          data: {
            source: message.voice ? 'voice' : 'text',
            executionMode: config.conversationWorkMode ?? 'sequential',
            startedAt,
            endedAt: now(),
            ...(session.execution.task === task && session.state.revision === revision
              ? {
                  view: observationResult(session),
                }
              : {}),
            ...(observationStatus === 'completed' ? {} : { error: `task_${observationStatus}` }),
          },
        });
        clearTimeout(session.execution.messageTimers.get(message));
        session.execution.messageTimers.delete(message);
        if (
          task.signal.aborted ||
          session.execution.task !== task ||
          !sessions.has(session.state.id)
        ) {
          releaseDraft(session, task);
          return;
        }
        accepted.status = now() >= message.deadline ? 'expired' : 'completed';
        if (
          (!session.state.saveIntent ||
            (!session.state.queue.length && !session.state.voiceInputPending)) &&
          (session.state.modelReply || session.state.reply)
        )
          session.state.completedReplies?.push({
            id: message.id,
            request: message.text,
            text: session.state.modelReply ?? '',
            revision,
            resetContextRevision: message.resetDiscard ? session.state.contextRevision : undefined,
            source: message.voice ? 'voice' : 'text',
            reply: session.state.reply,
            requiredNotice: session.state.requiredNotice,
            securityReference: session.state.securityReference,
            questionPending: view(session).questionPending,
            questions: session.state.questions,
            newQuestions: session.state.newQuestions,
            receipt: session.state.receipt,
            result: session.state.result,
            failed: Boolean(session.state.error),
          });
        session.execution.task = undefined;
        if (
          (session.state.phase === 'recovery' && hasPendingOutcome(session)) ||
          (session.state.phase === 'error' &&
            (message.continuation || modelFailureRecovery.has(session.state.error ?? '')))
        )
          session.state.failedWork = {
            message,
            code: session.state.error ?? 'assistant_provider_failed',
          };
        session.state.activeMessage = undefined;
        session.state.taskId = undefined;
        session.state.taskSource = undefined;
        accepted.result = captureAssistantResult(view(session), 'prefix');
        if (accepted.status === 'completed' && session.state.phase === 'ready')
          session.execution.deliveries
            .get(message.id)
            ?.freeze(
              completeAssistantText(accepted.result.view),
              assistantSaveState(accepted.result.view),
            );
        else session.execution.deliveries.get(message.id)?.stop();
        syncWork();
        releaseDraft(session, task);
      });
  }
  const base = '/households/:id/text-assistant';
  function createSession(
    state: ConversationState,
    execution: Pick<
      ConversationExecution,
      'browserSessionId' | 'approvedVersion' | 'mcp' | 'reads'
    >,
    expiresAt: number,
  ): Session {
    const session: Session = {
      state,
      execution: {
        ...execution,
        parts: pendingParts(state.pendingPartsLedger),
        capacity: new ConversationCapacity(
          modelProfile?.tokens ?? conversationModelProfile(state.modelChoice).tokens,
          voiceTokens,
        ),
        messageTimers: new Map(),
        deliveries: new Map(),
        timer: setTimeout(
          () => expireConversation(session),
          Math.max(1, expiresAt - now()),
        ).unref(),
      },
    };
    return session;
  }
  async function restoreSession(
    actorId: string,
    browserSessionId: string,
    householdId: string,
    headers: Headers,
    id?: string,
  ) {
    checkConversationOpening();
    const binding = storage.binding(browserSessionId);
    if (!binding) return;
    let state = storage.read(actorId, householdId, binding, id);
    if (!state) return;
    const owner = contentOwner(database, householdId, actorId);
    let current = assistantDraftReview(householdMap(database, actorId, householdId));
    if (state.owner !== owner || state.review.contentVersion !== current.contentVersion) {
      storage.erase(state.id);
      return;
    }
    const guard = (generation?: number) => {
      checkConversationOpening();
      authorize(actorId, browserSessionId, householdId);
      if (contentOwner(database, householdId, actorId) !== owner)
        throw new MapError('forbidden', 403);
      if (generation !== undefined && generation !== current.contentVersion)
        throw new MapError('assistant_content_changed', 409);
    };
    const mcp = await connectTextAssistant({
      database,
      browserSessionId,
      now,
      origin: config.origin,
      headers,
      householdId,
      dispatch,
      authorize: guard,
    }).catch((error) => {
      checkConversationOpening();
      throw error;
    });
    try {
      // Shutdown takes ownership of published sessions. This connection is
      // still local to the request and must close if shutdown has started.
      checkConversationOpening();
      // Connecting can cross explicit end, withdrawal or content replacement.
      // A captured snapshot is never permission to recreate a retired row.
      const latest = storage.read(actorId, householdId, binding, state.id);
      if (!latest) {
        await mcp.close();
        return;
      }
      state = latest;
      current = assistantDraftReview(householdMap(database, actorId, householdId));
      if (state.owner !== owner || current.contentVersion !== state.review.contentVersion) {
        storage.erase(state.id);
        await mcp.close();
        return;
      }
      guard();
      mcp.checkAccess();
      mcp.checkTaskAccess();
      const existing = sessions.get(state.id);
      if (existing) {
        await mcp.close();
        return existing;
      }
      const session = createSession(
        state,
        {
          browserSessionId,
          mcp,
          reads: assistantReadCache(database, householdId, owner),
        },
        state.expiresAt ?? now(),
      );
      state.review = current;
      state.operations = householdMap(database, actorId, householdId).operations().operations;
      pauseState(
        state,
        hasPendingOutcome(session) ||
          state.operations.some((operation) => operation.status === 'pending'),
      );
      // Original sequence values remain ordered across later fresh conversations.
      messageSequence = Math.max(
        messageSequence,
        ...state.queue.map((message) => message.sequence + 1),
        (state.activeMessage?.sequence ?? -1) + 1,
      );
      sessions.set(state.id, session);
      persist(session);
      return session;
    } catch (error) {
      await mcp.close();
      throw error;
    }
  }
  routes.get(base, (context) => context.json({ available: Boolean(config.openaiApiKey) }));
  routes.get(`${base}/retained`, (context) => {
    const conversations: RetainedConversation[] = storage
      .list(context.get('actorId'), context.req.param('id'))
      .flatMap((state) => {
        const first = firstRequest(state);
        if (!first || !state.expiresAt || !canRetainConversation(state)) return [];
        const session = sessions.get(state.id);
        return [
          {
            id: state.id,
            title: state.title ?? first.slice(0, 100),
            createdAt: state.createdAt,
            lastRequestAt: state.lastRequestAt ?? [...state.accepted.values()].at(-1)?.receivedAt,
            expiresAt: state.expiresAt,
            paused: session?.state.paused ?? !session,
            busy: session ? deletionWouldInterrupt(session) : false,
            modelChoice: state.modelChoice,
          },
        ];
      })
      .sort((a, b) => (b.lastRequestAt ?? 0) - (a.lastRequestAt ?? 0));
    return context.json({ conversations });
  });
  routes.post(`${base}/retained/:conversationId/delete`, async (context) => {
    const actorId = context.get('actorId');
    const householdId = context.req.param('id');
    const id = context.req.param('conversationId');
    const binding = storage.binding(context.get('browserSessionId'));
    const retained = binding && storage.read(actorId, householdId, binding, id);
    if (!retained || !firstRequest(retained) || !canRetainConversation(retained)) {
      const { error, status } = ended(id, actorId, householdId);
      if (error === 'assistant_conversation_deleted') return context.json({ deleted: true });
      return context.json({ error }, status);
    }
    const session = sessions.get(id);
    if (session && deletionWouldInterrupt(session))
      return context.json({ error: 'assistant_conversation_busy' }, 409);
    endings.set(id, { actorId, householdId, reason: 'deleted' });
    setTimeout(
      () => endings.delete(id),
      Math.max(5_000, (retained.expiresAt ?? now()) - now()),
    ).unref();
    if (session) {
      await stop(session, { switched: true });
    } else {
      storage.erase(id);
      const waiting = [...sessions.values()].find(
        (candidate) =>
          candidate.state.householdId === householdId && candidate.state.owner === retained.owner,
      );
      if (waiting) nextMessage(waiting);
    }
    return context.json({ deleted: true });
  });
  routes.on(['GET', 'POST'], `${base}/retained/:conversationId/open`, async (context) => {
    const actorId = context.get('actorId');
    const browserSessionId = context.get('browserSessionId');
    const householdId = context.req.param('id');
    const id = context.req.param('conversationId');
    const binding = storage.binding(browserSessionId);
    if (!binding) return context.json({ error: 'assistant_session_expired' }, 404);
    const retained = storage.read(actorId, householdId, binding, id);
    if (!retained || !firstRequest(retained) || !canRetainConversation(retained)) {
      const { error, status } = ended(id, actorId, householdId);
      return context.json({ error: status === 404 ? error : 'assistant_session_expired' }, 404);
    }
    const body = context.req.method === 'POST' ? await context.req.json().catch(() => null) : null;
    const current = sessions.get(id);
    if (context.req.method === 'GET' || (!body?.activate && current && !current.state.paused)) {
      const selected =
        current ??
        (await restoreSession(actorId, browserSessionId, householdId, context.req.raw.headers, id));
      if (!selected || !canRetainConversation(selected.state))
        return context.json({ error: 'assistant_session_expired' }, 404);
      const registered = selected.state.paused && selected.state.pendingSave;
      if (registered) {
        const outcome = householdMap(database, actorId, householdId).operation(
          registered.operationId,
        ).operation;
        if (outcome && outcome.status !== 'pending') {
          const checked = checkSaves(database, actorId, householdId, [registered.operationId]);
          if (applyCheckedSave(selected, checked))
            appendConversation(selected, { role: 'assistant', text: checked.reply });
        }
      }
      return context.json({ ...view(selected), requiresActivation: true });
    }
    if (body?.activate && !consents.valid(actorId, householdId, body.consent))
      return context.json({ error: conversationConsentRequired }, 403);
    if (current && current.execution.browserSessionId !== browserSessionId) {
      if (
        current.state.phase === 'working' ||
        current.execution.summaryTask ||
        hasActiveVoice?.(id)
      )
        return context.json({ error: 'assistant_conversation_busy' }, 409);
      await stop(current, { conversation: 'pause', delivery: 'close' });
    }
    const session = await restoreSession(
      actorId,
      browserSessionId,
      householdId,
      context.req.raw.headers,
      id,
    );
    if (!session) {
      const { error, status } = ended(id, actorId, householdId);
      return context.json({ error: status === 404 ? error : 'assistant_session_expired' }, 404);
    }
    if (sessions.get(id) !== session || session.execution.browserSessionId !== browserSessionId)
      return context.json({ error: 'assistant_turn_changed' }, 409);
    if (body?.activate) {
      currentConsent(session, body.consent);
      if (
        !session.state.activeMessage &&
        !session.state.queue.length &&
        !hasPendingOutcome(session)
      )
        session.state.paused = false;
    }
    storage.move(actorId, householdId, id, binding);
    return context.json(view(session));
  });
  routes.get(`${base}/restore`, async (context) => {
    const actorId = context.get('actorId');
    const browserSessionId = context.get('browserSessionId');
    const householdId = context.req.param('id');
    // A page returning to this browser observes paused work. Polling an already
    // open conversation uses its ID and does not change its lifetime.
    for (const session of [...sessions.values()])
      if (
        session.state.actorId === actorId &&
        session.state.householdId === householdId &&
        session.execution.browserSessionId === browserSessionId
      )
        await stop(session, { conversation: 'pause', delivery: 'close' });
    const restored = await restoreSession(
      actorId,
      browserSessionId,
      householdId,
      context.req.raw.headers,
    );
    return context.json({
      available: Boolean(config.openaiApiKey),
      ...(restored ? { conversation: view(restored) } : {}),
    });
  });
  routes.post(`${base}/recover`, async (context) => {
    const body = await context.req.json().catch(() => null);
    if (
      !body ||
      (body.operationIds !== undefined &&
        (!Array.isArray(body.operationIds) ||
          body.operationIds.length > 20 ||
          body.operationIds.some(
            (id: unknown) => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id),
          )))
    )
      return context.json({ error: 'invalid_request' }, 400);
    if (
      body.checkId !== undefined &&
      (typeof body.checkId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.checkId))
    )
      return context.json({ error: 'invalid_request' }, 400);
    const owner = contentOwner(database, context.req.param('id'), context.get('actorId'));
    const activeAttempt = [...sessions.values()].some(
      (session) =>
        session.state.householdId === context.req.param('id') &&
        session.state.phase === 'working' &&
        householdAccess(database, session.state.actorId, session.state.householdId) &&
        contentOwner(database, session.state.householdId, session.state.actorId) === owner &&
        (!body.operationIds ||
          (session.state.pendingSave &&
            body.operationIds.includes(session.state.pendingSave.operationId))),
    );
    if (activeAttempt) return context.json({ checking: true });
    return context.json(
      checkSaves(
        database,
        context.get('actorId'),
        context.req.param('id'),
        body.operationIds,
        body.checkId,
      ),
    );
  });
  routes.post(base, async (context) => {
    checkConversationOpening();
    if (!config.openaiApiKey) return context.json({ error: 'assistant_unavailable' }, 503);
    const body = await context.req.json().catch(() => null);
    const actorId = context.get('actorId');
    const householdId = context.req.param('id');
    // A conversation is the only way to conversation work, spoken or written.
    // Without a valid consent none starts, and the client is told why.
    if (!consents.valid(actorId, householdId, body?.consent))
      return context.json({ error: conversationConsentRequired }, 403);
    return openConversation(context, householdId, sessions.get(body?.previousId), {
      spokenReset: body?.resetSource === 'voice',
    });
  });
  async function openConversation(
    context: Context<{ Variables: { actorId: string; browserSessionId: string } }>,
    householdId: string,
    previous?: Session,
    { validate, spokenReset }: { validate?: () => void; spokenReset?: boolean } = {},
  ) {
    const actorId = context.get('actorId');
    const browserSessionId = context.get('browserSessionId');
    const revocationsAtStart = revocations.get(consentKey(actorId, householdId));
    const ownsPrevious = () =>
      previous &&
      sessions.get(previous.state.id) === previous &&
      previous.state.actorId === actorId &&
      previous.state.householdId === householdId &&
      previous.execution.browserSessionId === browserSessionId;
    if (previous && ownsPrevious() && !previous.state.paused && switchingWouldInterrupt(previous))
      return context.json({ error: 'assistant_turn_changed' }, 409);
    let contentVersion: number | undefined;
    const guard = (generation?: number) => {
      checkConversationOpening();
      authorize(actorId, browserSessionId, householdId);
      if (generation !== undefined && contentVersion !== undefined && generation !== contentVersion)
        throw new MapError('assistant_content_changed', 409);
    };
    const mcp = await connectTextAssistant({
      database,
      browserSessionId,
      now,
      origin: config.origin,
      headers: context.req.raw.headers,
      householdId,
      dispatch,
      authorize: guard,
    }).catch(() => null);
    if (!mcp) {
      checkConversationOpening();
      return context.json({ error: 'assistant_connection_failed' }, 503);
    }
    try {
      checkConversationOpening();
      const owner = contentOwner(database, householdId, actorId);
      const reads = assistantReadCache(database, householdId, owner);
      const review = await reads.read('read_my_draft', {}, async () => {
        const result = await mcp.call('read_my_draft', {});
        if (result.isError || !Array.isArray(result.content)) throw new Error('draft_unavailable');
        const text = result.content.find((item) => item.type === 'text');
        if (!text || typeof text.text !== 'string') throw new Error('draft_unavailable');
        return JSON.parse(text.text) as TextAssistantReview;
      });
      checkConversationOpening();
      contentVersion = review.contentVersion;
      const modelChoice = personalModelChoice(database, actorId).read();
      const state: ConversationState = {
        storageConsentVersion:
          consents.textVersion >= conversationStorageConsentVersion
            ? consents.textVersion
            : undefined,
        createdAt: now(),
        expiresAt: now() + conversationLifetime,
        modelChoice,
        consentTextVersion: consents.textVersion,
        pendingPartsLedger: pendingPartsState(),
        id: randomUUID(),
        actorId,
        householdId,
        owner,
        revision: 0,
        phase: 'ready',
        review,
        operations: [],
        input: [],
        conversation: [],
        userRequests: [],
        unfinishedRequests: [],
        contextOffset: 0,
        contextRevision: 0,
        queue: [],
        boundaryRevision: 0,
        accepted: new Map(),
        resetGeneration: 0,
        completedReplies: [],
      };
      const session = createSession(
        state,
        {
          browserSessionId,
          approvedVersion: consents.textVersion,
          mcp,
          reads,
        },
        state.expiresAt ?? mcp.expiresAt,
      );
      try {
        await refresh(session, checkConversationOpening);
        checkConversationOpening();
        validate?.();
      } catch (error) {
        await stop(session);
        throw error;
      }
      if (session.state.operations.some((operation) => operation.status === 'pending'))
        session.state.phase = 'recovery';
      // A consent that was revoked while the conversation connected starts none.
      if (revocations.get(consentKey(actorId, householdId)) !== revocationsAtStart) {
        await stop(session);
        return context.json({ error: conversationConsentRequired }, 403);
      }
      if (previous && ownsPrevious()) {
        if (switchingWouldInterrupt(previous)) {
          await stop(session);
          return context.json({ error: 'assistant_turn_changed' }, 409);
        }
        if (spokenReset) session.state.resetSource = 'voice';
        void stop(previous, { conversation: 'pause', delivery: 'close', switched: true });
      }
      sessions.set(session.state.id, session);
      return context.json(view(session), 201);
    } catch (error) {
      await mcp.close();
      if (error instanceof MapError) throw error;
      checkConversationOpening();
      return context.json({ error: 'assistant_connection_failed' }, 503);
    }
  }
  /** Why the user cannot work with a conversation that is not going on. */
  function ended(sessionId: string, actorId: string, householdId: string) {
    const ending = endings.get(sessionId);
    if (ending?.actorId === actorId && ending.householdId === householdId) {
      if (ending.reason === 'revoked')
        return { error: conversationConsentRevoked, status: 403 } as const;
      return { error: 'assistant_conversation_deleted', status: 404 } as const;
    }
    return { error: 'assistant_session_expired', status: 404 } as const;
  }
  routes.use(`${base}/:sessionId/*`, async (context, next) => {
    const sessionId = context.req.param('sessionId') ?? '';
    let session = sessions.get(sessionId);
    if (!session)
      session = await restoreSession(
        context.get('actorId'),
        context.get('browserSessionId'),
        context.req.param('id'),
        context.req.raw.headers,
        sessionId,
      );
    if (
      !session ||
      session.state.actorId !== context.get('actorId') ||
      session.execution.browserSessionId !== context.get('browserSessionId') ||
      session.state.householdId !== context.req.param('id')
    ) {
      const { error, status } = ended(sessionId, context.get('actorId'), context.req.param('id'));
      return context.json({ error }, status);
    }
    if (session.state.expiresAt !== undefined && session.state.expiresAt <= now()) {
      await stop(session);
      return context.json({ error: 'assistant_session_expired' }, 404);
    }
    // Reserve authenticated arrival before draft reads or body preparation can
    // yield to another conversation sharing this draft. Rejected requests do
    // not become work, but later work cannot overtake their preparation.
    const preparation =
      context.req.method === 'POST' &&
      (context.req.path.endsWith('/messages') || context.req.path.endsWith('/new'))
        ? reservePreparation(
            session,
            context.req.json().catch(() => null),
          )
        : undefined;
    const abandon = () => preparation && releasePreparation(preparation);
    if (preparation) {
      requestPreparations.set(context.req.raw, preparation);
      context.req.raw.signal.addEventListener('abort', abandon, { once: true });
      if (context.req.raw.signal.aborted) abandon();
    }
    try {
      if (preparation) checkPreparation(preparation);
      try {
        if (preparation) {
          checkViewAccess(session);
          // Capture original server facts before any awaited preparation or
          // delegated read. Later current facts cannot prove the original target.
          const original = assistantDraftReview(
            householdMap(database, session.state.actorId, session.state.householdId),
          );
          preparation.original = {
            version: original.version,
            reference: captureQueuedReference(original),
            waiting: waitsForDraft(session, preparation.sequence, original),
          };
        }
        if (context.req.method === 'GET' && now() >= session.execution.mcp.expiresAt) {
          checkViewAccess(session);
        } else if (context.req.method === 'GET') await refreshConfirmed(session);
        else await call(session, 'read_my_draft', {}, undefined, 'lifecycle');
      } catch (error) {
        if (preparation && !preparation.active) {
          checkPreparation(preparation);
        }
        if (error instanceof MapError && error.code === 'assistant_draft_changed') {
          checkViewAccess(session);
          return context.json({ error: error.code }, 409);
        }
        await stop(session);
        return context.json({ error: 'assistant_session_expired' }, 404);
      }
      if (preparation) checkPreparation(preparation);
      if (
        context.req.method === 'POST' &&
        /\/(messages|new|summarize|resume|retry-work|abandon-work)$/.test(context.req.path)
      ) {
        const body = await context.req.json().catch(() => null);
        try {
          currentConsent(session, body?.consent);
        } catch {
          return context.json({ error: conversationConsentRequired }, 403);
        }
      }
      if (
        session.state.paused &&
        context.req.method === 'POST' &&
        /\/(messages|summarize)$/.test(context.req.path)
      )
        return context.json({ error: 'assistant_work_paused' }, 409);
      await next();
    } finally {
      if (preparation) {
        context.req.raw.signal.removeEventListener('abort', abandon);
        requestPreparations.delete(context.req.raw);
        releasePreparation(preparation);
      }
    }
  });
  routes.get(`${base}/:sessionId`, async (context) => {
    const sessionId = context.req.param('sessionId');
    const session = sessions.get(sessionId);
    if (
      !session ||
      session.state.actorId !== context.get('actorId') ||
      session.execution.browserSessionId !== context.get('browserSessionId') ||
      session.state.householdId !== context.req.param('id')
    ) {
      const { error, status } = ended(sessionId, context.get('actorId'), context.req.param('id'));
      return context.json({ error }, status);
    }
    try {
      await waitForReset(session);
      checkViewAccess(session);
      if (now() < session.execution.mcp.expiresAt) await refreshConfirmed(session);
      checkViewAccess(session);
      await waitForReset(session);
      checkViewAccess(session);
    } catch (error) {
      if (error instanceof MapError && error.code === 'assistant_draft_changed') {
        checkViewAccess(session);
        return context.json({ error: error.code }, 409);
      }
      await stop(session);
      return context.json({ error: 'assistant_session_expired' }, 404);
    }
    return context.json(view(session));
  });
  routes.post(`${base}/:sessionId/model-choice`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    const parsed = modelChoiceSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: 'invalid_request' }, 400);
    try {
      requireEnabledChoice(parsed.data, config.conversationModels);
      personalModelChoice(database, session.state.actorId).write(parsed.data);
      session.state.modelChoice = parsed.data;
      session.state.modelChoiceRevision = (session.state.modelChoiceRevision ?? 0) + 1;
      return context.json(view(session));
    } catch (error) {
      return context.json(
        { error: error instanceof MapError ? error.code : 'invalid_request' },
        409,
      );
    }
  });
  routes.post(`${base}/:sessionId/stop`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (session) await stop(session);
    return context.json({ stopped: true });
  });
  routes.post(`${base}/:sessionId/pause`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (session) await stop(session, { conversation: 'pause', delivery: 'close' });
    return context.json({ paused: true });
  });
  routes.post(`${base}/:sessionId/resume`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (!session.state.paused) return context.json(view(session));
    const guard = () => {
      checkViewAccess(session);
      if (sessions.get(session.state.id) !== session || !session.state.paused)
        throw new MapError('assistant_turn_changed', 409);
    };
    guard();
    const retry = await context.req.json().catch(() => null);
    const interruptedId = session.state.activeMessage?.id ?? session.state.queue[0]?.id;
    if (retry?.requestId !== undefined && retry.requestId !== interruptedId)
      return context.json({ error: 'assistant_turn_changed' }, 409);
    const pendingBatch = session.state.pendingBatch;
    if (pendingBatch) await recoverBatch(session);
    guard();
    let completedRequest =
      pendingBatch?.finishesRequest &&
      !session.state.pendingBatch &&
      !session.state.error &&
      !hasReadyPendingParts(session)
        ? pendingBatch.messageId
        : undefined;
    const pendingSave = session.state.pendingSave;
    const ids = [
      ...new Set([
        ...session.state.operations
          .filter((operation) => operation.status === 'pending')
          .map((operation) => operation.operationId),
        ...(session.state.pendingSave ? [session.state.pendingSave.operationId] : []),
      ]),
    ];
    if (ids.length) {
      const checked = checkSaves(database, session.state.actorId, session.state.householdId, ids);
      if (applyCheckedSave(session, checked))
        appendConversation(session, { role: 'assistant', text: checked.reply });
      if (
        pendingSave?.messageId &&
        pendingSave.finishesRequest &&
        checked.receipt?.operationId === pendingSave.operationId &&
        !hasReadyPendingParts(session)
      ) {
        verifyReceipt(session, checked.receipt, pendingSave);
        completedRequest = pendingSave.messageId;
      }
    }
    await refresh(session, guard);
    guard();
    if (
      hasPendingOutcome(session) ||
      session.state.operations.some((operation) => operation.status === 'pending')
    )
      return context.json(
        {
          error: session.state.pendingBatch ? 'assistant_batch_unknown' : 'assistant_save_unknown',
        },
        409,
      );
    const interrupted = session.state.activeMessage;
    const queued = session.state.queue.slice();
    session.state.activeMessage = undefined;
    session.state.taskId = undefined;
    session.state.taskSource = undefined;
    session.state.paused = false;
    session.state.saveIntent = undefined;
    session.state.saveIntentDeadline = undefined;
    for (const message of [interrupted, ...queued]) {
      if (
        !message ||
        message.id === completedRequest ||
        message.id === session.state.failedWork?.message.id
      )
        continue;
      if (retry?.requestId && message.id !== retry.requestId) message.awaitingContinuation = true;
      else continueMessage(session, message);
    }
    if (completedRequest) {
      for (const request of session.state.unfinishedRequests)
        if (request.id === completedRequest) request.paused = false;
      settleRequests(session, completedRequest, true);
      const accepted = session.state.accepted.get(completedRequest);
      if (accepted) {
        accepted.status = 'completed';
        accepted.result = captureAssistantResult(view(session), 'prefix');
      }
    }
    persist(session);
    nextMessage(session);
    return context.json(view(session));
  });
  routes.post(`${base}/:sessionId/messages`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    const preparation = requestPreparation(context.req.raw);
    if (session.state.contextSummaryState === 'failed' && !session.state.capacityPaused)
      return context.json({ error: 'assistant_context_summary_failed' }, 409);
    if (session.state.contextSummaryState === 'summarizing')
      return context.json({ error: 'assistant_busy' }, 409);
    const body = await context.req.json().catch(() => null);
    checkPreparation(preparation);
    if (
      !body ||
      typeof body.text !== 'string' ||
      !body.text.trim() ||
      body.text.length > 4000 ||
      (body.restate !== undefined && typeof body.restate !== 'boolean') ||
      (body.queue !== undefined && typeof body.queue !== 'boolean') ||
      (body.continuedVoiceRead !== undefined && typeof body.continuedVoiceRead !== 'boolean') ||
      (body.voiceContext !== undefined &&
        (typeof body.voiceContext !== 'string' || body.voiceContext.length > 8000)) ||
      !Number.isSafeInteger(body.draftVersion) ||
      body.draftVersion < 0 ||
      !Number.isSafeInteger(body.contentVersion) ||
      body.contentVersion < 1 ||
      typeof body.requestId !== 'string' ||
      !/^[\w-]{1,128}$/.test(body.requestId)
    )
      return context.json({ error: 'invalid_request' }, 400);
    const answerTo = z.array(partReference).min(1).max(200).optional().safeParse(body.answerTo);
    if (!answerTo.success) return context.json({ error: 'invalid_request' }, 400);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          revision: body.revision,
          draftVersion: body.draftVersion,
          contentVersion: body.contentVersion,
          text: body.text,
          restate: body.restate === true,
          voiceContext: body.voiceContext,
          answerTo: answerTo.data,
          ...(body.continuedVoiceRead === true ? { continuedVoiceRead: true } : {}),
        }),
      )
      .digest('hex');
    await waitForOriginalPreparation(preparation, body.requestId);
    const accepted = session.state.accepted.get(body.requestId);
    if (accepted) {
      if (accepted.hash !== requestHash)
        return context.json({ error: 'assistant_turn_changed' }, 409);
      const pending = session.state.pendingSave;
      if (
        accepted.result &&
        pending &&
        pending.messageId === body.requestId &&
        !session.execution.task
      ) {
        await recoverSave(session, [pending.operationId], undefined, () =>
          checkPreparation(preparation),
        );
      }
      checkViewAccess(session);
      const current = view(session);
      return context.json(
        accepted.result?.view.receipt || accepted.result?.view.saveCheck
          ? restoreAssistantResult(accepted.result, current)
          : current,
        202,
      );
    }
    if (body.restate === true && !session.state.capacityPaused)
      return context.json({ error: 'assistant_turn_changed' }, 409);
    if (body.restate === true && session.execution.task && !session.execution.task.signal.aborted)
      return context.json({ error: 'assistant_busy' }, 409);
    if (session.state.capacityPaused && body.restate !== true)
      return context.json({ error: 'assistant_context_restatement_required' }, 409);
    const currentTurn = () =>
      body.revision === session.state.revision ||
      (session.state.phase === 'working' &&
        Number.isSafeInteger(body.revision) &&
        body.revision >= session.state.boundaryRevision &&
        body.revision < session.state.revision);
    if (!currentTurn()) return context.json({ error: 'assistant_turn_changed' }, 409);
    if (
      (hasPendingOutcome(session) || session.state.phase === 'recovery') &&
      session.state.phase !== 'working'
    )
      return context.json({ error: 'operation_pending' }, 409);
    let current: TextAssistantReview;
    let draftVersion: number;
    do {
      current = await call(
        session,
        'read_my_draft',
        {},
        () => checkPreparation(preparation),
        'lifecycle',
      );
      checkPreparation(preparation);
      if (!currentTurn()) return context.json({ error: 'assistant_turn_changed' }, 409);
      draftVersion = preparedDraftVersion(preparation, body.draftVersion, body.contentVersion);
      // A held read can itself straddle verified earlier work. Read current
      // authorized evidence again only when that snapshot joins the same chain.
    } while (
      current.contentVersion === body.contentVersion &&
      current.version !== draftVersion &&
      preparedDraftVersion(preparation, current.version, current.contentVersion) === draftVersion
    );
    if (answerTo.data) session.execution.parts.validateReply(answerTo.data);
    if (
      body.contentVersion !== current.contentVersion ||
      (body.continuedVoiceRead === true &&
        (body.revision !== session.state.revision ||
          body.draftVersion !== current.version ||
          session.state.phase !== 'ready')) ||
      (session.state.phase !== 'working' && draftVersion !== current.version)
    )
      return context.json({ error: 'assistant_draft_changed' }, 409);
    if (context.req.raw.signal.aborted) return context.json({ error: 'assistant_canceled' }, 409);
    const control = conversationCommand(body.text);
    if (
      body.continuedVoiceRead === true &&
      (body.voiceContext === undefined ||
        body.restate === true ||
        answerTo.data ||
        control ||
        requestsSave(body.text, 'clarification'))
    )
      return context.json({ error: 'assistant_draft_changed' }, 409);
    if (control?.reset) {
      if (!control.discard)
        return openConversation(context, session.state.householdId, session, {
          spokenReset: body.voiceContext !== undefined,
          validate: () => {
            checkPreparation(preparation);
            if (!currentTurn()) throw new MapError('assistant_turn_changed', 409);
          },
        });
      await startOver(
        session,
        preparation,
        control.discard,
        body.voiceContext !== undefined,
        body.requestId,
        body.voiceContext === undefined ? undefined : body,
      );
      return context.json(view(session));
    }
    if (draftExecutions.has(draftKey(session)) && body.queue === false)
      return context.json({ error: 'assistant_busy' }, 409);
    // Keep delivery records for same-session retries, but only pending work
    // consumes queue capacity. Completed or canceled turns do not end a conversation.
    if (
      session.state.queue.length +
        Number(Boolean(session.execution.task && !session.execution.task.signal.aborted)) >=
      200
    )
      return context.json({ error: 'assistant_busy' }, 409);
    const receivedAt = now();
    if (
      body.deliveryConnectionId !== undefined &&
      !availableDelivery(session, body.deliveryConnectionId)
    )
      return context.json({ error: 'assistant_delivery_unavailable' }, 409);
    const message: Message = {
      id: body.requestId,
      text: body.text,
      restate: body.restate === true,
      queuedReference:
        preparation.original?.waiting ||
        waitsForDraft(session, preparation.sequence, current) ||
        current.version !== preparation.original?.version
          ? (preparation.original?.reference ?? null)
          : undefined,
      voice: body.voiceContext !== undefined,
      continuedVoiceRead: body.continuedVoiceRead === true || undefined,
      answerTo: answerTo.data,
      contentVersion: current.contentVersion,
      draftVersion,
      owner: contentOwner(database, session.state.householdId, session.state.actorId),
      receivedAt,
      deadline: receivedAt + 30 * 60_000,
      sequence: preparation.sequence,
    };
    admitMessage(
      session,
      message,
      current,
      requestHash,
      body.deliveryConnectionId,
      body.deliveryAudio === true,
    );
    return context.json(
      { ...view(session), taskStatus: session.state.accepted.get(message.id)?.status },
      202,
    );
  });
  routes.post(`${base}/:sessionId/summarize`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    await waitForReset(session);
    if (
      session.state.phase === 'working' ||
      session.state.phase === 'recovery' ||
      session.state.pendingSave
    )
      return context.json(view(session));
    if (session.state.contextSummaryState === 'needed' || needsSummary(session)) {
      // The browser has paused local capture and retired the peer before this
      // handoff. Close its server sideband before taking the ledger snapshot.
      await summarize(session, undefined, [], true);
    }
    await waitForReset(session);
    return context.json(view(session));
  });
  // Poll a particular accepted message: a subsequent FIFO task may already be
  // running when a voice executor observes its own verified completion.
  routes.get(`${base}/:sessionId/messages/:requestId`, (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    const accepted = session.state.accepted.get(context.req.param('requestId'));
    if (!accepted) return context.json({ error: 'assistant_turn_changed' }, 409);
    const current = view(session);
    return context.json({
      ...(accepted.result ? restoreAssistantResult(accepted.result, current) : current),
      taskStatus: accepted.status,
    });
  });
  routes.post(`${base}/:sessionId/cancel`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    const body = await context.req.json().catch(() => null);
    // Voice cancellation can already be in flight when a reset retires its
    // executor. Its authority ends with that conversation's context.
    if (
      body?.contextRevision !== undefined &&
      body.contextRevision !== (session.state.contextRevision ?? 0)
    )
      return context.json({ error: 'assistant_turn_changed' }, 409);
    if (session.state.canceled && session.state.phase !== 'working')
      return context.json(view(session));
    if (body?.all !== true && body?.revision !== session.state.revision)
      return context.json({ error: 'assistant_turn_changed' }, 409);
    const contextRevision = session.state.contextRevision ?? 0;
    const checkContext = () => {
      if ((session.state.contextRevision ?? 0) !== contextRevision)
        throw new MapError('assistant_turn_changed', 409);
    };
    const task = ownedDraftTask(session);
    // Completed work can still await delivery. Limit this stop to tasks
    // accepted now, so work admitted during refresh keeps its delivery.
    const acceptedIds = new Set(session.state.accepted.keys());
    const canceledIds = new Set(
      [...session.state.accepted]
        .filter(([, accepted]) => ['queued', 'working'].includes(accepted.status))
        .map(([id]) => id),
    );
    if (session.state.failedWork) canceledIds.add(session.state.failedWork.message.id);
    for (const request of session.state.unfinishedRequests)
      if (canceledIds.has(request.id)) request.paused = true;
    session.state.failedWork = undefined;
    session.execution.task?.abort();
    session.execution.task = undefined;
    session.state.activeMessage = undefined;
    session.execution.summaryTask?.abort();
    session.state.pendingSummaryChoice = undefined;
    session.state.saveIntent = undefined;
    clearWorkTimers(session);
    session.state.voiceInputPending = false;
    session.state.queue = [];
    session.state.taskId = undefined;
    session.state.taskSource = undefined;
    session.state.revision++;
    session.state.boundaryRevision = session.state.revision;
    session.state.canceled = true;
    session.state.selection = undefined;
    session.state.error = undefined;
    session.state.reply = 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.';
    appendConversation(session, { role: 'assistant', text: session.state.reply });
    session.state.modelReply = undefined;
    syncQuestions(session);
    session.state.newQuestions = [];
    session.state.answers = [];
    session.state.requiredNotice = undefined;
    session.state.phase = hasPendingOutcome(session) ? 'recovery' : 'ready';
    // Aborted work has no remaining mutation authority. Retire its claim before
    // an awaited refresh can overlap a new conversation or other queued work.
    retirePreparations(session);
    if (task) releaseDraft(session, task);
    else nextMessage(session);
    await refresh(session, checkContext);
    checkContext();
    for (const [id, accepted] of session.state.accepted) {
      if (!acceptedIds.has(id)) continue;
      session.execution.deliveries.get(id)?.stop();
      if (accepted.status === 'queued' || accepted.status === 'working') {
        accepted.status = 'canceled';
        accepted.result = captureAssistantResult(view(session), 'live');
      }
    }
    syncWork();
    return context.json(view(session));
  });
  // Nytt samtal: the conversation text and the context are emptied, and
  // ongoing work stops. The session, its consent and the draft stay. A save
  // that has begun is still checked before new work.
  routes.post(`${base}/:sessionId/new`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    const preparation = requestPreparation(context.req.raw);
    const body = await context.req.json().catch(() => ({}));
    checkPreparation(preparation);
    if (body.discard !== undefined && typeof body.discard !== 'boolean')
      return context.json({ error: 'invalid_request' }, 400);
    const voiceReset = backendObservationRequest()?.requestId;
    if (
      voiceReset &&
      (voiceReset !== body.requestId ||
        body.revision !== session.state.revision ||
        (!body.discard && body.draftVersion !== session.state.review.version) ||
        body.contentVersion !== session.state.review.contentVersion)
    )
      return context.json({ error: 'assistant_turn_changed' }, 409);
    await startOver(
      session,
      preparation,
      body.discard === true,
      Boolean(voiceReset),
      voiceReset,
      voiceReset && body.discard ? body : undefined,
    );
    return context.json(view(session));
  });
  routes.post(`${base}/:sessionId/recover`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (
      session.state.phase === 'working' &&
      (session.execution.task || !session.state.pendingBatch)
    )
      return observedOperation(session, 'recover', async (finish) => {
        finish('completed', observationResult(session), 'already_working');
        return context.json(view(session));
      });
    const body = await context.req.json().catch(() => ({}));
    if (
      body.checkId !== undefined &&
      (typeof body.checkId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.checkId))
    )
      return context.json({ error: 'invalid_request' }, 400);
    if (body.checkId && session.state.saveCheck?.id === body.checkId && !session.state.pendingBatch)
      return observedOperation(
        session,
        'recover',
        async (finish) => {
          finish('completed', observationResult(session), 'already_checked');
          return context.json(view(session));
        },
        body,
      );
    return observedOperation(
      session,
      'recover',
      async (finish) => {
        if (session.state.pendingBatch) {
          await recoverBatch(session, body.checkId);
          finish(session.state.pendingBatch ? 'failed' : 'completed', observationResult(session));
          nextMessage(session);
          return context.json(view(session));
        }
        if (
          session.state.batchCheckId &&
          !session.state.pendingSave &&
          !householdMap(database, session.state.actorId, session.state.householdId)
            .operations()
            .operations.some((operation) => operation.status === 'pending')
        ) {
          finish('completed', observationResult(session), 'already_checked');
          return context.json(view(session));
        }
        const ids = session.state.pendingSave
          ? [session.state.pendingSave.operationId]
          : session.state.receipt
            ? [session.state.receipt.operationId]
            : undefined;
        await recoverSave(session, ids, body.checkId);
        finish('completed', observationResult(session));
        nextMessage(session);
        return context.json(view(session));
      },
      body,
    );
  });
  for (const action of ['retry', 'abandon'] as const)
    routes.post(`${base}/:sessionId/${action}-work`, async (context) => {
      const session = sessions.get(context.req.param('sessionId'));
      if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
      const failed = session.state.failedWork;
      const body = await context.req.json().catch(() => null);
      if (
        !failed ||
        session.execution.task ||
        body?.revision !== session.state.revision ||
        body?.requestId !== failed.message.id
      )
        return context.json({ error: 'assistant_turn_changed' }, 409);
      if (session.state.paused) return context.json({ error: 'assistant_work_paused' }, 409);
      const revision = session.state.revision;
      const guard = () => {
        checkViewAccess(session);
        if (session.state.revision !== revision || session.state.failedWork !== failed)
          throw new MapError('assistant_turn_changed', 409);
      };
      await refresh(session, guard);
      guard();
      if (
        hasPendingOutcome(session) ||
        session.state.operations.some((item) => item.status === 'pending')
      )
        return context.json({ error: 'operation_pending' }, 409);
      if (
        body?.deliveryConnectionId !== undefined &&
        !availableDelivery(session, body.deliveryConnectionId)
      )
        return context.json({ error: 'assistant_delivery_unavailable' }, 409);
      session.state.failedWork = undefined;
      session.state.error = undefined;
      session.state.phase = 'ready';
      if (action === 'retry')
        continueMessage(
          session,
          failed.message,
          body.deliveryConnectionId,
          body.deliveryAudio === true,
        );
      else {
        session.state.revision++;
        session.execution.parts.withdrawMessage(failed.message.id);
        session.state.unfinishedRequests = session.state.unfinishedRequests.filter(
          (request) => request.id !== failed.message.id,
        );
        session.state.saveIntent = undefined;
        session.state.saveIntentDeadline = undefined;
        session.state.modelReply = undefined;
        session.state.requiredNotice = undefined;
        session.state.result = undefined;
        session.state.reply =
          'Du har avstått från det oavslutade arbetet. Ditt aktuella utkast och tidigare sparresultat påverkas inte.';
        syncQuestions(session);
        appendConversation(session, { role: 'assistant', text: session.state.reply });
      }
      persist(session);
      nextMessage(session);
      return context.json(view(session), 202);
    });
  routes.post(`${base}/:sessionId/retry`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (session.state.phase === 'working')
      return context.json({ error: 'assistant_turn_changed' }, 409);
    let revision = session.state.revision;
    const body = await context.req.json().catch(() => null);
    const task = new AbortController();
    const abort = () => task.abort();
    context.req.raw.signal.addEventListener('abort', abort, { once: true });
    if (context.req.raw.signal.aborted) abort();
    const guard = () => {
      if (
        task.signal.aborted ||
        session.state.revision !== revision ||
        !sessions.has(session.state.id)
      )
        throw new MapError('assistant_canceled', 409);
      authorize(
        session.state.actorId,
        session.execution.browserSessionId,
        session.state.householdId,
      );
    };
    try {
      guard();
      if (body?.revision !== undefined && body.revision !== revision)
        throw new MapError('assistant_turn_changed', 409);
      return await observedOperation(
        session,
        'retry',
        async (finish) => {
          await refresh(session, guard);
          guard();
          const operation = session.state.operations.find(
            (item) => item.operationId === body?.operationId,
          );
          if (!operation) throw new MapError('operation_conflict', 409);
          const pending = session.state.pendingSave;
          if (pending && pending.operationId !== operation.operationId)
            throw new MapError('operation_conflict', 409);
          if (pending?.messageId) {
            await recoverSave(session, [pending.operationId], undefined, guard);
            revision = session.state.revision;
          } else if (operation.status === 'succeeded') {
            verifyReceipt(session, operation.receipt, {
              operationId: operation.operationId,
              version: operation.draftVersion,
              contentVersion: operation.contentVersion,
            });
            saved(session, operation.receipt);
          } else if (operation.status === 'rejected') throw new MapError(operation.error, 409);
          else {
            session.execution.task?.abort();
            session.execution.task = task;
            revision = ++session.state.revision;
            session.state.phase = 'working';
            session.state.pendingSave = {
              operationId: operation.operationId,
              version: operation.draftVersion,
              contentVersion: operation.contentVersion,
            };
            try {
              const result = await call(session, 'save_draft', session.state.pendingSave, guard);
              guard();
              verifyReceipt(session, result.receipt, session.state.pendingSave);
              saved(session, result.receipt);
              await refreshConfirmed(session, guard);
            } catch (error) {
              if (authorityLost(error)) await stop(session);
              if (sessions.has(session.state.id) && session.state.revision === revision) {
                session.state.phase = 'recovery';
                session.state.error =
                  error instanceof MapError && error.code === 'assistant_provider_failed'
                    ? error.code
                    : 'assistant_save_unknown';
                session.state.previousFailure = assistantFailureMessage(session.state.error);
              }
            }
          }
          if (!sessions.has(session.state.id)) {
            finish('canceled');
            return context.json({ error: 'assistant_session_expired' }, 404);
          }
          authorize(
            session.state.actorId,
            session.execution.browserSessionId,
            session.state.householdId,
          );
          finish(
            task.signal.aborted
              ? 'canceled'
              : session.state.phase === 'recovery'
                ? 'failed'
                : 'completed',
            observationResult(session),
          );
          if (session.execution.task === task) session.execution.task = undefined;
          if (session.state.revision === revision && !task.signal.aborted) nextMessage(session);
          return context.json(view(session));
        },
        body,
      );
    } finally {
      context.req.raw.signal.removeEventListener('abort', abort);
      if (session.execution.task === task) session.execution.task = undefined;
    }
  });
  routes.post(`${base}/:sessionId/selection`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    const body = await context.req.json().catch(() => null);
    if (
      !session?.state.selection ||
      body?.revision !== session.state.revision ||
      (body?.kind !== undefined
        ? body.kind !== session.state.selection.kind || body.id !== session.state.selection.id
        : session.state.selection.kind !== 'object' ||
          typeof body?.objectId !== 'string' ||
          body.objectId !== session.state.selection.objectId) ||
      (body?.draftVersion !== undefined &&
        body.draftVersion !== session.state.selection.draftVersion) ||
      (body?.contentVersion !== undefined &&
        body.contentVersion !== session.state.selection.contentVersion) ||
      typeof body.displayed !== 'boolean'
    )
      return context.json({ error: 'assistant_turn_changed' }, 409);
    const current = await call(session, 'read_my_draft', {});
    if (
      current.version !== session.state.selection.draftVersion ||
      current.contentVersion !== session.state.selection.contentVersion
    ) {
      session.execution.displayed?.(false);
      return context.json({ error: 'assistant_draft_changed' }, 409);
    }
    session.execution.displayed?.(body.displayed);
    return context.json(view(session));
  });
  return {
    checkManualSave(id: unknown, actorId: string, browserSessionId: string, householdId: string) {
      const session = typeof id === 'string' ? sessions.get(id) : undefined;
      if (
        !session ||
        session.state.actorId !== actorId ||
        session.execution.browserSessionId !== browserSessionId ||
        session.state.householdId !== householdId
      )
        throw new MapError('assistant_session_expired');
      checkViewAccess(session);
      if (session.execution.parts.blocked()) throw new MapError('assistant_questions_pending');
      if (session.execution.task || session.state.queue.length)
        throw new MapError('assistant_busy');
    },
    routes,
    /** Handshake uses normal browser auth. The returned synchronous binder
     * repeats every check after the async auth wait and immediately before use. */
    prepareDelivery: async (request: Request) => {
      const url = new URL(request.url);
      const match = /^\/api\/households\/([^/]+)\/text-assistant\/([^/]+)\/delivery$/.exec(
        url.pathname,
      );
      if (!match || request.headers.get('Origin') !== config.origin) return;
      const login = await auth.api.getSession({ headers: request.headers });
      const session = sessions.get(match[2]);
      if (
        !login ||
        !session ||
        session.state.householdId !== match[1] ||
        session.state.actorId !== login.user.id ||
        session.execution.browserSessionId !== login.session.id
      )
        return;
      const originalBinding = database
        .prepare(`SELECT id, revision FROM browser_binding
        WHERE sessionId = ? AND confirmed = 1 AND expiresAt > ?`)
        .get(login.session.id, now()) as { id: string; revision: number } | undefined;
      if (!originalBinding) return;
      const guard = () => {
        if (sessions.get(session.state.id) !== session) throw new MapError('forbidden', 403);
        const current = database
          .prepare(`SELECT 1 FROM session JOIN browser_binding
          ON browser_binding.sessionId = session.id WHERE session.id = ? AND session.token = ?
          AND browser_binding.id = ? AND browser_binding.revision = ?
          AND browser_binding.confirmed = 1 AND browser_binding.expiresAt > ?`)
          .get(
            login.session.id,
            login.session.token,
            originalBinding.id,
            originalBinding.revision,
            now(),
          );
        if (!current) throw new MapError('forbidden', 403);
        textWork.exit(() => {
          authorize(
            session.state.actorId,
            session.execution.browserSessionId,
            session.state.householdId,
          );
          checkViewAccess(session);
        });
      };
      try {
        guard();
      } catch {
        return;
      }
      return (socket: DeliverySocket) => {
        guard();
        if ([...deliveryOwners.values()].filter((owner) => owner === session).length >= 8)
          throw new MapError('assistant_busy', 409);
        const id = deliveries.open(socket);
        deliveryOwners.set(id, session);
        let timer: NodeJS.Timeout;
        const retire = () => {
          const end = loginDeadline(session.state.actorId, session.execution.browserSessionId);
          if (now() < end) {
            timer = setTimeout(retire, end - now()).unref();
            return;
          }
          if (!deliveries.pending(id)) {
            deliveries.close(id);
            return;
          }
          timer = setTimeout(retire, 1000).unref();
        };
        timer = setTimeout(
          retire,
          Math.max(
            1,
            loginDeadline(session.state.actorId, session.execution.browserSessionId) - now(),
          ),
        ).unref();
        socket.on('close', () => {
          clearTimeout(timer);
          deliveryOwners.delete(id);
        });
      };
    },
    /** No HTTP route: only isolated evaluation support can supply historical
     * fixtures and force the ordinary summary generation/atomic installation. */
    summarizeForEvaluation: async (
      sessionId: string,
      history: { role: 'user' | 'assistant'; text: string }[],
    ) => {
      const session = sessions.get(sessionId);
      if (
        !session ||
        session.execution.task ||
        session.state.queue.length ||
        session.state.pendingSave ||
        session.execution.summaryTask ||
        session.state.voiceInputPending
      )
        throw new Error('evaluation_summary_not_idle');
      await onSummary?.(sessionId, new AbortController().signal);
      const conversation = [...session.state.conversation, ...history];
      const source = JSON.stringify({
        previousSummary: session.state.summary,
        conversation: completedDiscussion(session, conversation),
      });
      if (source.length > 240_000) throw new Error('evaluation_summary_source_too_large');
      session.state.conversation = conversation;
      const generation = session.state.contextGeneration ?? 0;
      await summarize(session);
      return {
        source,
        summary: session.state.summary,
        installed: (session.state.contextGeneration ?? 0) === generation + 1,
        retained: session.state.conversation.slice(session.state.summaryOffset),
        view: view(session),
      };
    },
    voiceInput: (sessionId: string, pending: boolean, text?: string) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      session.state.voiceInputPending = pending;
      session.state.lastVoiceInputAt = now();
      if (text !== undefined) {
        if (text.trim()) onActivity?.(session.execution.browserSessionId);
        session.state.inputSerial = (session.state.inputSerial ?? 0) + 1;
        session.state.lastVoiceInputAt = now();
        if (withdrawsSave(text)) session.state.saveIntent = undefined;
      }
    },
    /** Private ephemeral context shared by text and every voice connection.
     * Never expose it in status responses or write it to the household. */
    observationResetGeneration: (sessionId: string) =>
      sessions.get(sessionId)?.state.resetGeneration,
    liveHandoff: (sessionId: string) => {
      const session = sessions.get(sessionId);
      return session ? liveHandoff(session) : { dialogue: [] };
    },
    /** Export eligibility belongs to the original conversation, never later saved consent. */
    consentVersion: (sessionId: string) => sessions.get(sessionId)?.state.consentTextVersion,
    voiceDeliveryAvailable: (sessionId: string, connectionId: string) => {
      const session = sessions.get(sessionId);
      return session !== undefined && availableDelivery(session, connectionId);
    },
    prepareVoiceContext: async (
      sessionId: string,
      signal?: AbortSignal,
      voiceLink?: { traceId: string; spanId: string },
    ) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      if (session.state.paused) return view(session);
      currentConsent(session);
      const bytes = Buffer.byteLength(JSON.stringify(providerConversation(session)));
      if (!session.state.contextSummaryState && bytes / 3 >= voiceTokens * 0.89)
        await summarize(session, undefined, [], false, signal, voiceLink);
      if (signal?.aborted || sessions.get(sessionId) !== session) return;
      if (
        Buffer.byteLength(JSON.stringify(providerConversation(session))) / 3 >=
        voiceTokens * 0.89
      ) {
        failSummaryCapacity(session);
      }
      return view(session);
    },
    contextUsage: (sessionId: string, revision: number, source: string, ratio?: unknown) => {
      const session = sessions.get(sessionId);
      if (session && (session.state.contextRevision ?? 0) === revision) {
        if (ratio === undefined) session.execution.capacity.beginVoice(source);
        else session.execution.capacity.voice(source, ratio);
        if (!session.state.contextSummaryState && needsSummary(session))
          session.state.contextSummaryState = 'needed';
      }
    },
    transcript: (
      sessionId: string,
      role: 'user' | 'assistant',
      text: string,
      utteranceStart: boolean,
      eventId: string,
    ) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      if (role === 'user' && text.trim()) recordRequest(session.state);
      if (!session.state.titleRequested && role === 'user' && utteranceStart) {
        const first = firstRequest(session.state);
        if (first) generateTitle(session, first);
      }
      const retained = appendConversation(session, {
        role,
        text,
        partial: true,
        utteranceStart,
      });
      if (role === 'user' && !session.state.titleRequested && text.trim()) {
        clearTimeout(session.execution.titleTimer);
        session.execution.titleTimer = setTimeout(() => {
          const first = firstRequest(session.state);
          if (sessions.get(sessionId) === session && first) generateTitle(session, first);
        }, voiceTranscriptGapMs).unref();
      }
      if (role !== 'user') return;
      return (requestId?: string) => {
        if (sessions.get(sessionId) !== session || !session.state.conversation.includes(retained))
          return;
        if (requestId) {
          retained.speechRequestId = requestId;
          retained.speechEventId = eventId;
        } else if (!retained.utteranceStart) retained.utteranceStart = true;
        else return;
        persist(session);
      };
    },
    // Interrupt current in-memory work synchronously. The normal HTTP cancel
    // route refreshes status; durable operations remain available for recovery.
    interrupt: (sessionId: string, revision?: number) => {
      const session = sessions.get(sessionId);
      if (
        session &&
        (revision === undefined || session.state.revision === revision) &&
        session.state.phase === 'working'
      )
        session.execution.task?.abort();
    },
    /** Live never receives the accepted-text exception. */
    voiceAccess: (sessionId: string) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      if (session.state.paused) throw new MapError('assistant_work_paused', 409);
      currentConsent(session);
      const guard = () =>
        textWork.exit(() => {
          if (sessions.get(sessionId) !== session || endings.has(sessionId))
            throw new MapError('forbidden', 403);
          authorize(
            session.state.actorId,
            session.execution.browserSessionId,
            session.state.householdId,
          );
          session.execution.mcp.checkAccess();
          return loginDeadline(session.state.actorId, session.execution.browserSessionId);
        });
      return {
        expiresAt: guard(),
        guard,
        consentTextVersion: session.execution.approvedVersion,
        conversationConsentTextVersion: session.state.consentTextVersion,
      };
    },
    expireVoiceWork: (sessionId: string) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      expireVoiceWork(session);
    },
    /** Request mutations publish explicit stops before returning. Natural login
     * expiry does not delete the private grant and cannot enter this path. */
    stopUnauthorizedWork: () => {
      // Retire explicit access loss before natural-expiry socket cleanup, so
      // clients clear old content even after their task has already completed.
      for (const session of [...sessions.values()]) {
        if (session.state.expiresAt !== undefined && session.state.expiresAt <= now()) {
          void stop(session);
          continue;
        }
        try {
          session.execution.mcp.checkTaskAccess();
        } catch {
          const canRetain =
            canRetainConversation(session.state) &&
            (loginDeadline(session.state.actorId, session.execution.browserSessionId) <= now() ||
              session.execution.mcp.expiresAt <= now());
          void stop(session, { conversation: canRetain ? 'pause' : 'end' });
        }
        persist(session);
        for (const message of session.state.paused
          ? []
          : [session.state.activeMessage, ...session.state.queue])
          if (message && now() >= message.deadline) expireMessage(session, message);
      }
      deliveries.revalidate();
      syncWork();
      for (const [id, session] of deliveryOwners) {
        if (
          now() >= loginDeadline(session.state.actorId, session.execution.browserSessionId) &&
          !deliveries.pending(id)
        )
          deliveries.close(id);
      }
    },
    /**
     * Ends every conversation that the user has in the household, on all
     * devices, because the consent is revoked. Further work with them is
     * refused with that reason. The draft is not touched. Only already
     * registered saves may finish under their original authority; a failed
     * check remains a durable attempt for recovery without conversation consent.
     */
    endConversations: async (actorId: string, householdId: string) => {
      storage.eraseActor(actorId, householdId);
      const key = consentKey(actorId, householdId);
      revocations.set(key, (revocations.get(key) ?? 0) + 1);
      const ending = [...sessions.values()].filter(
        (session) => session.state.actorId === actorId && session.state.householdId === householdId,
      );
      for (const session of ending) {
        endings.set(session.state.id, { actorId, householdId, reason: 'revoked' });
        session.execution.summaryTask?.abort();
        setTimeout(
          () => endings.delete(session.state.id),
          Math.max(1, session.execution.mcp.expiresAt - now()),
        ).unref();
      }
      // Revocation never authorizes a fresh save. Complete only an immutable
      // operation that was registered under the earlier explicit save command.
      // SQLite serializes this with an already executing save using the same ID.
      const receipts: NonNullable<TextAssistantView['receipt']>[] = [];
      for (const session of ending) {
        if (session.state.pendingSave) {
          try {
            const checked = checkSaves(database, actorId, householdId, [
              session.state.pendingSave.operationId,
            ]);
            if (
              checked.receipt &&
              !receipts.some((item) => item.operationId === checked.receipt?.operationId)
            )
              receipts.push(checked.receipt);
          } catch {
            // A failed check remains a durable attempt for consent-independent
            // recovery; it cannot prevent revocation or retain the conversation.
          }
        }
      }
      await Promise.all(ending.map((session) => stop(session)));
      return receipts;
    },
    close: async () => {
      closed = true;
      unsubscribeDiscards();
      storage.close();
      await Promise.all(
        [...sessions.values()].map((session) =>
          stop(session, { conversation: 'pause', delivery: 'close' }),
        ),
      );
    },
  };
}
