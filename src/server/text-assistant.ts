import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
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
import { assistantSaveState, completeAssistantText } from '../shared/task-delivery.js';
import type {
  MapSelection,
  TextAssistantReview,
  TextAssistantView,
} from '../shared/text-assistant.js';
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
import {
  type CheckTurnActions,
  compareTurnActions,
  interpretTurnScope,
  turnActionData,
} from './assistant-turn-scope.js';
import type { Auth } from './auth.js';
import { sessionDeadline } from './browser-binding.js';
import type { Config } from './config.js';
import { contentOwner } from './content-identities.js';
import { ConversationCapacity, voiceConversationModel } from './conversation-capacity.js';
import type { ConversationConsents } from './conversation-consent.js';
import {
  conversationModelProfile,
  enabledModelChoices,
  modelChoiceSchema,
  personalModelChoice,
  requireEnabledChoice,
} from './conversation-model.js';
import type { ConversationMessage, ConversationState } from './conversation-state.js';
import {
  contextSummaryMessage,
  historicalSummary,
  summarizeConversation,
} from './conversation-summary.js';
import { draftUpdateDetails } from './draft-completion.js';
import { draftDiscards } from './draft-discards.js';
import { householdAccess } from './households.js';
import { householdMap, MapError } from './map.js';
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
  mcp: Mcp;
  reads: ReturnType<typeof assistantReadCache>;
  parts: ReturnType<typeof pendingParts>;
  timer: NodeJS.Timeout;
  messageTimers: Map<Message, NodeJS.Timeout>;
  deliveries: Map<string, ReturnType<ReturnType<typeof taskDeliveries>['bind']>>;
  task?: AbortController;
  capacity: ConversationCapacity;
  summaryTask?: AbortController;
  /** Context status and canceled handoffs wait for the complete reset. */
  resetCompletion?: Promise<void>;
  displayed?: (value: boolean) => void;
};
type Session = { state: ConversationState; execution: ConversationExecution };
const savedReply = 'Sparat. Hela utkastet finns i hushållets karta.';

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
  onStop?: (sessionId: string) => void;
  onResetStart?: (sessionId: string) => void;
  onSummary?: (sessionId: string, signal: AbortSignal) => Promise<void> | undefined;
  onWork?: (browserSessionId: string, until: number | undefined) => void;
  onActivity?: (browserSessionId: string) => void;
  /** A conversation has started over, so its voice can do the same and say the statement. */
  onNewConversation?: (view: TextAssistantView, deferVoiceClose?: boolean) => void;
  now?: () => number;
}) {
  const routes = new Hono<{ Variables: { actorId: string; browserSessionId: string } }>();
  const sessions = new Map<string, Session>();
  const unsubscribeDiscards = draftDiscards(database).subscribe((event) => {
    for (const session of sessions.values()) {
      if (session.state.householdId !== event.householdId || session.state.owner !== event.userId)
        continue;
      session.execution.parts.discard();
      syncQuestions(session);
      session.state.saveIntent = undefined;
      if (!session.execution.task) session.state.workVersion = event.version;
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
  const textWork = new AsyncLocalStorage<{
    session: Session;
    guard: () => void;
  }>();
  // Observation identity is independent of the authorization context. Voice
  // keeps its existing access checks while sharing the backend's one owner.
  const observationWork = new AsyncLocalStorage<{
    session: Session;
    context: AssistantObservationContext;
    revision: number;
    deadline: number;
    providerCallId?: string;
  }>();
  // The conversations that a revoked consent has ended, until the time they
  // would have expired by themselves. Work with them is refused with the reason.
  const revoked = new Map<string, { actorId: string; householdId: string }>();
  // How many times each user has revoked the consent for each household, so
  // that a start can tell whether a revocation came while it connected. It
  // holds one number for each user and household that has revoked.
  const revocations = new Map<string, number>();
  const consentKey = (actorId: string, householdId: string) =>
    JSON.stringify([householdId, actorId]);
  const modelWork = new AsyncLocalStorage<TextModelProfile>();
  const respond = config.openaiApiKey
    ? textModel(
        config.openaiApiKey,
        modelFetch,
        modelUsage,
        modelProfile,
        (attempt, content) => {
          if (!observe) return;
          const work = observationWork.getStore();
          if (work) work.providerCallId = attempt.attemptId;
          observe({
            at: now(),
            sessionId: work?.session.state.id ?? '',
            taskId: work?.context.requestId,
            revision: work?.revision,
            consentTextVersion: work?.session.state.consentTextVersion,
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
        () => {
          const selected = modelWork.getStore();
          if (!selected) throw new MapError('assistant_model_unsupported', 409);
          return selected;
        },
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
  async function stop(session: Session, retireDelivery = true) {
    sessions.delete(session.state.id);
    for (const [id, owner] of deliveryOwners) {
      if (owner !== session) continue;
      if (retireDelivery) deliveries.retire(id);
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
    onStop?.(session.state.id);
    session.execution.displayed?.(false);
    session.state.input = [];
    session.execution.reads.clear();
    session.state.conversation = [];
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
    return {
      id,
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
      phase,
      activity: phase === 'working' ? session.state.activity : undefined,
      activitySteps: session.state.canceled ? undefined : session.state.activitySteps,
      review,
      reply,
      modelReply,
      requiredNotice,
      securityReference,
      questions,
      questionPending: Boolean(questions?.length),
      newQuestions: session.state.newQuestions ?? [],
      pendingParts: session.execution.parts.read(),
      saveBlocked: session.execution.parts.blocked(),
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
        dialogue: session.state.conversation.slice(session.state.contextOffset),
      }),
    );
  }
  function providerConversation(session: Session) {
    if (!session.state.conversation.length && !session.state.unfinishedRequests.length) return [];
    return [
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
      // Current draft is independently read by the server; a summary is never
      // the authority for its state or for any new action.
      {
        role: 'assistant' as const,
        text: JSON.stringify({
          currentDraft: session.state.review,
          unfinishedRequests: activeRequests(session),
          pendingParts: contextParts(session),
          saveOperations: session.state.operations,
          historical: true,
        }),
      },
    ];
  }
  function activeRequests(session: Session) {
    return session.state.unfinishedRequests
      .filter((request) => !request.paused)
      .map(({ id, text }) => ({ id, text }));
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
  function appendConversation(session: Session, entry: Session['state']['conversation'][number]) {
    session.state.conversation.push({
      ...entry,
      // Raw voice fragments have no authenticated task provenance. Retain them
      // conservatively rather than assigning them to whichever task is active.
      requestId: entry.partial ? undefined : session.state.activeMessage?.id,
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
    });
  }
  function contextConversation(session: Session) {
    const unfinished = new Set(activeRequests(session).map((request) => request.id));
    return session.state.conversation.filter(
      (entry, index) =>
        index >= (session.state.scopeOffset ?? 0) &&
        (index >= (session.state.summaryOffset ?? 0) ||
          (entry.requestId !== undefined && unfinished.has(entry.requestId)) ||
          (entry.partial && entry.requestId === undefined)),
    );
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
  function refreshContext(session: Session, outdated: { name: string }[]) {
    const rereadable = new Set([
      'read_map',
      'read_type_catalog',
      'read_my_draft',
      'search_object_icons',
    ]);
    const changed = new Set(outdated.map((read) => read.name));
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
      if (previous) removed.add(previous);
      latest.set(key, item.call_id);
      // The current work envelope replaces the complete draft read. Other
      // source changes keep their warning until the model rereads that source.
      if (item.name === 'read_my_draft' && changed.has(item.name)) removed.add(item.call_id);
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
          if (
            value.review &&
            !value.review.superseded &&
            (value.review.version !== session.state.review.version ||
              value.review.contentVersion !== session.state.review.contentVersion)
          ) {
            // Keep checked effects and receipts; replace the obsolete draft picture.
            value.review = {
              version: value.review.version,
              contentVersion: value.review.contentVersion,
              superseded: true,
            };
            replaced = true;
            item.output = JSON.stringify(value);
          }
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
          draft: session.state.review,
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
    const identity = {
      sessionId: session.state.id,
      consentTextVersion: session.state.consentTextVersion,
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
        { session, context, revision: session.state.revision, deadline: Number.POSITIVE_INFINITY },
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
      if (revoked.has(session.state.id)) throw new MapError('forbidden', 403);
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
  ) {
    guard?.();
    checkViewAccess(session);
    const work = textWork.getStore();
    if (work?.session === session) work.guard();
    const value = await session.execution.reads.read(name, args, async () => {
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
        consentTextVersion: session.state.consentTextVersion,
        taskId: parent?.requestId,
        revision: session.state.revision,
        context,
        ...(!parent ? { evidenceGap: 'unknown_parent' as const } : {}),
      };
      if (work?.session === session && session.state.phase === 'working') {
        session.state.activity = assistantToolActivity(name);
        const steps = session.state.activitySteps ?? [];
        if (steps.at(-1)?.text !== session.state.activity)
          session.state.activitySteps = [
            ...steps,
            { id: randomUUID(), text: session.state.activity },
          ].slice(-8);
      }
      observe?.({
        at,
        ...identity,
        kind: 'mcp_started',
        status: 'incomplete',
        data: { name, args },
      });
      let result: Awaited<ReturnType<Mcp['call']>>;
      try {
        result = await session.execution.mcp.call(name, args, guard, work?.session === session);
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
          observedError instanceof MapError && observedError.code === 'assistant_canceled';
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
    });
    guard?.();
    checkViewAccess(session);
    if (work?.session === session) work.guard();
    return value;
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
      '(?:\\s+(?:nu|direkt|allt|allting|det|detta|det här|hela utkastet|utkastet|ändringarna|alla ändringar|förslaget|förslagen))*(?:\\s+med alla de här ändringarna)?';
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
    const review = await call(session, 'read_my_draft', {}, guard);
    guard?.();
    session.state.review = review;
    const { operations } = await call(session, 'read_my_save_operations', {}, guard);
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
      );
      guard?.();
      if (operation) session.state.operations.push(operation);
    }
  }
  async function selectedItem(
    session: Session,
    selection: MapSelection,
    review: TextAssistantReview,
    guard?: () => void,
  ) {
    const changes = selection.kind === 'object' ? review.changes : review.relationships;
    const change = changes?.find(({ id }) => id === selection.id);
    if (change) return change.after;
    const map = await call(
      session,
      'read_map',
      selection.kind === 'object' ? { objectId: selection.id } : {},
      guard,
    );
    return (selection.kind === 'object' ? map.objects : map.relationships).find(
      (item: { id: string }) => item.id === selection.id,
    );
  }
  function verifiedReply(session: Session) {
    return session.state.result?.message ?? (session.state.receipt ? savedReply : undefined);
  }
  function syncQuestions(session: Session) {
    const questions = session.execution.parts.questions();
    session.state.questions = questions.length ? questions : undefined;
    session.state.newQuestions = session.state.newQuestions?.filter((question) =>
      questions.includes(question),
    );
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
    syncQuestions(session);
    session.state.newQuestions = [...(session.state.newQuestions ?? []), ...result.questions];
    session.state.answers = [...(session.state.answers ?? []), ...result.answers];
    session.state.modelReply = turnReply(session);
    return result;
  }
  function saved(session: Session, receipt: TextAssistantView['receipt']) {
    session.state.saveIntent = undefined;
    session.state.receipt = receipt;
    session.state.workVersion = receipt ? receipt.draftVersion + 1 : session.state.workVersion;
    session.state.pendingSave = undefined;
    session.state.reply = savedReply;
    appendConversation(session, { role: 'assistant', text: session.state.reply });
    session.state.modelReply = undefined;
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
      throw new Error('invalid_receipt');
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
  async function startOver(session: Session, discard = false, deferVoiceClose = false) {
    const completion = resetContext(session, discard, deferVoiceClose);
    session.execution.resetCompletion = completion;
    try {
      await completion;
    } finally {
      if (session.execution.resetCompletion === completion)
        session.execution.resetCompletion = undefined;
    }
  }
  async function resetContext(session: Session, discard: boolean, deferVoiceClose: boolean) {
    session.state.modelChoice = personalModelChoice(database, session.state.actorId).read();
    session.state.modelChoiceRevision = (session.state.modelChoiceRevision ?? 0) + 1;
    // Retire the old executor before its task records disappear. A delayed
    // status response must not cancel work belonging to the new conversation.
    onResetStart?.(session.state.id);
    for (const [id, owner] of deliveryOwners) if (owner === session) deliveries.retire(id);
    session.execution.task?.abort();
    clearWorkTimers(session);
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
    session.state.activitySteps = [];
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
    session.state.saveIntent = undefined;
    session.state.voiceInputPending = false;
    await refresh(session);
    session.state.phase = session.state.pendingSave ? 'recovery' : 'ready';
    if (discard) {
      session.state.review = await call(session, 'discard_draft', {
        version: session.state.review.version,
        contentVersion: session.state.review.contentVersion,
      });
    }
    session.state.workVersion = session.state.review.version;
    session.state.input = [];
    session.state.conversation = [];
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
      session.state.pendingSave ||
      session.state.operations.some((item) => item.status === 'pending')
        ? 'recovery'
        : 'ready';
    session.state.reply = newConversationMessage(session.state.review);
    onNewConversation?.(view(session), deferVoiceClose);
  }
  async function run(
    session: Session,
    text: string,
    revision: number,
    task: AbortController,
    expected: { version: number; contentVersion: number },
    scopeReady: (check: CheckTurnActions, mode: 'read' | 'work') => void,
  ) {
    const serial = session.state.inputSerial ?? 0;
    // Only the current whole-message command grants discard authority. Model
    // output, stored content and earlier dialogue cannot expand this turn.
    const discardRequested = conversationCommand(text)?.discard === true;
    const checkDiscard = (name: string) => {
      if (name === 'discard_draft' && !discardRequested)
        throw new MapError('assistant_discard_not_requested', 409);
    };
    let originalSaveIntent = Boolean(session.state.saveIntent);
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
      const scope = await interpretTurnScope(
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
        task.signal,
        session.state.activeMessage?.restate,
      );
      guard();
      if (scope.mode === 'read') {
        session.state.saveIntent = undefined;
        originalSaveIntent = false;
      }
      if (scope.mode === 'clarify') {
        session.state.saveIntent = undefined;
        session.state.phase = 'ready';
        session.state.questions = [...session.execution.parts.questions(), scope.request];
        session.state.reply = scope.request;
        appendConversation(session, { role: 'assistant', text: scope.request });
        return;
      }
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
      const checkActions = async (
        operations: { name: string; arguments: Record<string, unknown> }[],
      ) => {
        guard();
        if (!operations.length) return;
        if (scope.mode === 'read') rejectAction(operations[0].name, 'read_only_turn');
        const reference = session.state.activeMessage?.queuedReference;
        const checksQueuedTarget = operations.some(
          (operation) => !['save_draft', 'prepare_save'].includes(operation.name),
        );
        if (reference === null && checksQueuedTarget)
          throw new MapError('assistant_scope_unclear', 409);
        const map = await call(session, 'read_map', {}, guard);
        guard();
        const decision = await compareTurnActions(
          respond,
          { current: text, scope },
          operations,
          {
            map: turnActionData(map, operations),
            draft: session.state.review,
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
        if (decision.decision === 'clarify') throw new MapError('assistant_scope_unclear', 409);
        if (decision.decision === 'incomplete')
          throw new MapError('assistant_batch_incomplete', 409);
      };
      scopeReady(checkActions, scope.mode);
      const review = (await call(session, 'read_my_draft', {}, guard)) as TextAssistantReview;
      guard();
      if (
        review.version !== expected.version ||
        review.contentVersion !== expected.contentVersion
      ) {
        session.state.review = review;
        throw new MapError('assistant_draft_changed', 409);
      }
      session.state.review = review;
      session.state.operations = (
        await call(session, 'read_my_save_operations', {}, guard)
      ).operations;
      if (session.state.operations.some((operation) => operation.status === 'pending'))
        throw new MapError('operation_pending', 409);
      const summaryRequested = session.state.contextSummaryState === 'needed';
      rebuildContext(session);
      if (summaryRequested || needsSummary(session)) await summarize(session, guard);
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
      ) {
        session.execution.parts.operation(resolves, name, args, before, after);
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
      const dialogue = session.state.conversation.slice(session.state.contextOffset);
      session.state.contextOffset = session.state.conversation.length;
      let turnStart = session.state.input.length;
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
          draft: review,
          saveOperations: session.state.operations.map(
            ({ operationId, status, draftVersion, contentVersion }) => ({
              operationId,
              status,
              draftVersion,
              contentVersion,
            }),
          ),
          outdatedReads: session.execution.reads.outdated(),
          voiceContext: dialogue.length ? JSON.stringify(dialogue) : undefined,
          previousFailure: session.state.previousFailure
            ? { message: session.state.previousFailure, historical: true }
            : undefined,
        }),
      });
      for (let step = 0; step < 48; step++) {
        guard();
        if (!respond) throw new Error('assistant_unavailable');
        const outdatedReads = session.execution.reads.outdated();
        refreshContext(session, outdatedReads);
        if (needsSummary(session)) {
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
        // The executor owns the atomic transport command. The work model
        // proposes submit_changes, which must pass independent batch review.
        const tools = session.execution.mcp.tools
          .filter((tool) => tool.name !== 'apply_draft_batch')
          .map((tool) => ({
            type: 'function' as const,
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            strict: false,
          }));
        tools.push({
          type: 'function',
          name: 'show_map_object',
          description:
            'Begär markering av ett specifikt tillåtet objekt i den öppna webbläsaren. Vänta på displayed:true innan du bekräftar markeringen. Detta är en visningsbegäran, inte en ändring av kartinnehåll.',
          parameters: {
            type: 'object',
            properties: { objectId: { type: 'string' } },
            required: ['objectId'],
            additionalProperties: false,
          },
          strict: false,
        });
        tools.push({
          type: 'function',
          name: 'show_map_item',
          description:
            'Visa ett specifikt objekt eller samband i webbläsarens karta och inspektör. Bekräfta bara ett faktiskt displayed:true från aktuell kartvy.',
          parameters: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['object', 'relationship'] },
              id: { type: 'string' },
            },
            required: ['kind', 'id'],
            additionalProperties: false,
          },
          strict: false,
        });
        const draftTools = session.execution.mcp.tools.filter(
          (tool) =>
            tool.annotations?.readOnlyHint === false &&
            !['save_draft', 'prepare_save', 'apply_draft_batch'].includes(tool.name),
        );
        tools.push({
          type: 'function',
          name: 'submit_changes',
          description:
            'Utför en sammanhängande ordnad ändringsbatch atomiskt med aktuella versioner. Ett nytt objekt och dess nödvändiga samband ska ingå i samma batch; ett fel lämnar hela batchen ogenomförd. Lägg självständiga delar i separata batcher. Behåll andra förslag. completion draft lämnar allt osparat; save kräver ett aktuellt uttryckligt besked om hela utkastet. questions registrerar nya väntande delar med kind, request, question och dependsOnDraft. resolves anger id och revision för förtydligade ändringsdelar som batchens återstående operationer slutför. Ofärdiga ändringsdelar hindrar sparande även efter förtydligande; oberoende informationsfrågor gör det inte. Sätt continueResponse true om faktasvar, detaljer eller markering återstår. Annars avslutar servern.',
          parameters: {
            type: 'object',
            properties: {
              version: { type: 'integer', minimum: 0 },
              contentVersion: { type: 'integer', minimum: 1 },
              completion: { type: 'string', enum: ['draft', 'save'] },
              continueResponse: { type: 'boolean' },
              questions: z.toJSONSchema(pendingQuestions),
              resolves: z.toJSONSchema(z.array(partReference)),
              operations: {
                type: 'array',
                minItems: 1,
                maxItems: 24,
                items: {
                  anyOf: draftTools.map((tool) => ({
                    type: 'object',
                    properties: {
                      name: { const: tool.name, type: 'string' },
                      arguments: {
                        ...tool.inputSchema,
                        properties: Object.fromEntries(
                          Object.entries(tool.inputSchema.properties ?? {}).filter(
                            ([key]) => key !== 'version' && key !== 'contentVersion',
                          ),
                        ),
                        required: tool.inputSchema.required?.filter(
                          (key) => key !== 'version' && key !== 'contentVersion',
                        ),
                      },
                    },
                    required: ['name', 'arguments'],
                    additionalProperties: false,
                  })),
                },
              },
            },
            required: ['version', 'contentVersion', 'completion', 'operations'],
            additionalProperties: false,
          },
          strict: false,
        });
        tools.push({
          type: 'function',
          name: 'ask_questions',
          description:
            'Registrera väntande delar i questions. Uppdatera endast angiven identitet och revision från pendingParts genom updates, med aktuellt messageId och ordagrant evidence ur message. clarify utan ny fråga gör en ändring redo för submit_changes.resolves; answer avslutar en informationsdel med sitt faktasvar. withdraw kräver uttryckligt återtagande; replace ersätter begäran. rephrase ändrar bara frågans formulering. Sätt continueResponse true när arbete återstår. Detta sparar ingenting.',
          parameters: {
            type: 'object',
            properties: {
              questions: z.toJSONSchema(pendingQuestions),
              updates: z.toJSONSchema(partUpdates),
              continueResponse: { type: 'boolean' },
            },
            required: ['questions'],
            additionalProperties: false,
          },
          strict: false,
        });
        tools.push({
          type: 'function',
          name: 'report_result',
          description:
            'Ge detaljer från aktuellt utkast eller ett verkligt sparande. latest_save hämtar senaste kvittot; save kräver operationId och userId från historiken. last_failure återger det senaste registrerade felet i samtalet utan att upprepa uppdraget. Texten skapas av servern från faktiska poster och fel, inte av modellen. Sätt continueResponse true om andra beställda faktasvar eller markeringar återstår; serverns detaljer behålls och resten slutförs i nästa modellomgång. Annars avslutar servern och medföljande modelltext används inte.',
          parameters: {
            type: 'object',
            properties: {
              source: { type: 'string', enum: ['draft', 'latest_save', 'save', 'last_failure'] },
              continueResponse: { type: 'boolean' },
              operationId: { type: 'string' },
              userId: { type: 'string' },
            },
            required: ['source'],
            additionalProperties: false,
          },
          strict: false,
        });
        session.state.activity = 'Bearbetar uppgiften';
        if (outdatedReads.length)
          session.state.input.push({
            role: 'developer',
            content: JSON.stringify({ outdatedReads }),
          });
        const instructions = `${session.execution.mcp.instructions}\n\n${textAssistantInstructions}`;
        if (exceedsRequestBudget(session, instructions, tools)) {
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
        const response = await respond(instructions, session.state.input, tools, task.signal);
        guard();
        // Recheck the actual MCP grant and content owner after provider await,
        // including plain text replies that would otherwise call no tool.
        const afterProvider = (await call(
          session,
          'read_my_draft',
          {},
          guard,
        )) as TextAssistantReview;
        if (afterProvider.version !== version || afterProvider.contentVersion !== contentVersion)
          throw new MapError('assistant_draft_changed', 409);
        if (response.status !== 'completed') throw new Error('assistant_incomplete');
        session.state.input.push(...toResponseInputItems(response.output));
        session.execution.capacity.text(response.usage, contextBytes(session));
        let calls = response.output.filter((item) => item.type === 'function_call');
        const observed = observationWork.getStore();
        for (const action of calls)
          observe?.({
            at: now(),
            sessionId: session.state.id,
            consentTextVersion: session.state.consentTextVersion,
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
        let combined:
          | {
              completion: 'draft' | 'save';
              questions: z.infer<typeof pendingQuestions>;
              resolves: z.infer<typeof partReference>[];
              callId: string;
              continueResponse: boolean;
            }
          | undefined;
        if (calls.some((action) => action.name === 'submit_changes')) {
          if (calls.length !== 1) throw new MapError('invalid_request', 400);
          const parsed = z
            .object({
              version: z.number().int().nonnegative(),
              contentVersion: z.number().int().positive(),
              completion: z.enum(['draft', 'save']),
              continueResponse: z.boolean().default(false),
              questions: pendingQuestions.default([]),
              resolves: z.array(partReference).max(12).default([]),
              operations: z
                .array(
                  z
                    .object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) })
                    .strict(),
                )
                .min(1)
                .max(24),
            })
            .strict()
            .safeParse(JSON.parse(calls[0].arguments));
          if (!parsed.success) throw new MapError('invalid_request', 400);
          const batch = parsed.data;
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
          await checkActions([
            ...batch.operations,
            ...(batch.completion === 'save' ? [{ name: 'save_draft', arguments: {} }] : []),
          ]);
          if (batch.completion === 'save' && !session.state.saveIntent && !originalSaveIntent)
            throw new MapError('assistant_save_not_requested', 409);
          for (const operation of batch.operations) checkDiscard(operation.name);
          const original = calls[0];
          session.execution.parts.validateCompletion(batch.resolves);
          updateParts(session, batch.questions, [], original.call_id);
          combined = { ...batch, callId: original.call_id };
          const operations = batch.operations.filter((operation) =>
            session.execution.parts.shouldRun(
              batch.resolves,
              operation.name,
              operation.arguments,
              session.state.review,
            ),
          );
          if (operations.length) {
            const value = await call(
              session,
              'apply_draft_batch',
              {
                version,
                contentVersion,
                operations,
              },
              guard,
            );
            // No operation is recorded as completed until the whole batch has
            // committed. A failed batch preserves its pending parts unchanged.
            for (const applied of value.applied as {
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
            session.state.workVersion = value.version;
            session.state.review = await call(session, 'read_my_draft', {}, guard);
            version = session.state.review.version;
            contentVersion = session.state.review.contentVersion;
          }
          calls =
            batch.completion === 'save'
              ? [{ ...original, name: 'save_draft', arguments: '{}' }]
              : [];
        }
        if (!calls.length && !combined) {
          session.state.modelReply = turnReply(session, response.output_text, '\n');
          if (response.output_text)
            appendConversation(session, { role: 'assistant', text: response.output_text });
          session.state.reply =
            verifiedReply(session) ??
            (session.state.displayedSelection ? 'Markerat i kartan.' : undefined);
          session.state.phase = session.state.pendingSave ? 'recovery' : 'ready';
          return;
        }
        if (!combined) {
          const operations = [];
          for (const action of calls) {
            if (!tools.some((tool) => tool.name === action.name))
              throw new MapError('assistant_unknown_tool', 409);
            const tool = session.execution.mcp.tools.find((tool) => tool.name === action.name);
            if (!tool) continue; // Local conversation/display tools do not mutate the draft.
            const args = JSON.parse(action.arguments) as Record<string, unknown>;
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
                !originalSaveIntent
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
          if (
            operations.filter((operation) =>
              draftTools.some((tool) => tool.name === operation.name),
            ).length > 1
          )
            throw new MapError('assistant_batch_required', 409);
          await checkActions(operations);
        }
        for (const action of calls) {
          guard();
          const args = JSON.parse(action.arguments) as Record<string, unknown>;
          if (combined) Object.assign(args, { version, contentVersion });
          if (action.name === 'ask_questions') {
            if (calls.length !== 1) throw new MapError('invalid_request', 400);
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
            updateParts(session, value.questions, value.updates, action.call_id);
            session.state.reply = verifiedReply(session);
            session.state.phase = 'ready';
            session.state.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify({
                questionPending: Boolean(session.state.questions?.length),
                questions: session.state.questions ?? [],
                pendingParts: session.execution.parts.read(),
              }),
            });
            if (session.state.modelReply)
              appendConversation(session, {
                role: 'assistant',
                text: session.state.modelReply,
              });
            if (value.continueResponse) {
              session.state.phase = 'working';
              break;
            }
            return;
          }
          if (action.name === 'report_result') {
            const continuation = { continueResponse: z.boolean().default(false) };
            const parsed = z
              .discriminatedUnion('source', [
                z.object({ source: z.literal('draft'), ...continuation }).strict(),
                z.object({ source: z.literal('latest_save'), ...continuation }).strict(),
                z.object({ source: z.literal('last_failure'), ...continuation }).strict(),
                z
                  .object({
                    source: z.literal('save'),
                    ...continuation,
                    operationId: z.string().regex(/^[\w-]{1,128}$/),
                    userId: z.string().min(1).max(200),
                  })
                  .strict(),
              ])
              .safeParse(args);
            if (!parsed.success || calls.length !== 1) throw new MapError('invalid_request', 400);
            const report = parsed.data;
            if (report.source === 'last_failure' && mutations.size)
              throw new MapError('invalid_request', 400);
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
              session.state.result = historyResult(
                identity
                  ? (await call(session, 'read_history', identity, guard)).receipt
                  : undefined,
              );
            }
            guard();
            session.state.reply = session.state.result.message;
            session.state.modelReply = turnReply(session);
            session.state.phase = 'ready';
            appendConversation(session, { role: 'assistant', text: session.state.reply });
            session.state.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify(session.state.result),
            });
            if (report.continueResponse) {
              session.state.phase = 'working';
              break;
            }
            return;
          }
          if (action.name === 'show_map_object' || action.name === 'show_map_item') {
            const item =
              action.name === 'show_map_object' ? { kind: 'object', id: args.objectId } : args;
            if (
              typeof item.id !== 'string' ||
              !/^[\w-]{1,128}$/.test(item.id) ||
              (item.kind !== 'object' && item.kind !== 'relationship') ||
              Object.keys(args).length !== (action.name === 'show_map_object' ? 1 : 2)
            )
              throw new MapError('invalid_request', 400);
            const selection = { kind: item.kind, id: item.id } as MapSelection;
            const selected = await selectedItem(session, selection, session.state.review, guard);
            if (!selected) throw new MapError('assistant_object_missing', 409);
            guard();
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
            session.state.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify({ ...selection, displayed }),
            });
            continue;
          }
          const tool = session.execution.mcp.tools.find((tool) => tool.name === action.name);
          if (!tool) throw new MapError('assistant_unknown_tool', 409);
          checkDiscard(action.name);
          const isSave = action.name === 'save_draft' || action.name === 'prepare_save';
          if (isSave && combined) {
            session.execution.parts.complete(combined.resolves);
            combined.resolves = [];
            syncQuestions(session);
          }
          let previousReview: TextAssistantReview | undefined;
          if (isSave && session.execution.parts.blocked()) {
            session.state.phase = 'ready';
            return;
          }
          if (isSave && !session.state.saveIntent && !originalSaveIntent)
            throw new MapError('assistant_save_not_requested', 409);
          if (isSave && !(await saveReady(session, serial, guard))) {
            session.state.phase = 'ready';
            session.state.modelReply = undefined;
            session.state.reply = undefined;
            return;
          }
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
            if (isSave && current.conflicts.length) throw new MapError('assistant_conflict', 409);
            previousReview = current;
          }
          if (isSave) {
            session.state.pendingSave ??= { operationId: randomUUID(), version, contentVersion };
            Object.assign(args, session.state.pendingSave);
            if (action.name === 'save_draft')
              await call(
                session,
                'prepare_save',
                session.state.pendingSave,
                currentSaveGuard(session, serial, guard),
              );
          }
          if (
            combined &&
            !isSave &&
            !session.execution.parts.shouldRun(
              combined.resolves,
              action.name,
              args,
              session.state.review,
            )
          )
            continue;
          const value = await call(
            session,
            action.name,
            args,
            isSave ? currentSaveGuard(session, serial, guard) : guard,
          );
          guard();
          if (action.name === 'save_draft') {
            if (!session.state.pendingSave) throw new Error('invalid_receipt');
            verifyReceipt(session, value.receipt, session.state.pendingSave);
            saved(session, value.receipt);
            await refreshConfirmed(session, guard);
            originalSaveIntent = false;
            if (combined) {
              version = session.state.review.version;
              contentVersion = session.state.review.contentVersion;
              continue;
            }
            session.state.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify(value),
            });
            return;
          }
          if (!combined)
            session.state.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify(value),
            });
          if (tool.annotations?.readOnlyHint !== true) {
            if (Number.isSafeInteger(value.version)) session.state.workVersion = value.version;
            const before = previousReview ?? session.state.review;
            session.state.review = await call(session, 'read_my_draft', {}, guard);
            version = session.state.review.version;
            if (!isSave) recordMutation(action.name, args, before, session.state.review);
          }
        }
        if (combined) {
          session.execution.parts.complete(combined.resolves);
          syncQuestions(session);
          session.state.reply = verifiedReply(session);
          session.state.phase = 'ready';
          session.state.input.push({
            type: 'function_call_output',
            call_id: combined.callId,
            output: JSON.stringify({
              result: session.state.result,
              receipt: session.state.receipt,
              reply: session.state.reply,
              review: session.state.review,
              questions: combined.questions,
              pendingParts: session.execution.parts.read(),
            }),
          });
          if (session.state.reply)
            appendConversation(session, { role: 'assistant', text: session.state.reply });
          if (session.state.modelReply)
            appendConversation(session, { role: 'assistant', text: session.state.modelReply });
          if (combined.continueResponse) {
            session.state.phase = 'working';
            continue;
          }
          return;
        }
      }
      throw new Error('assistant_step_limit');
    } catch (error) {
      if (
        task.signal.aborted ||
        session.state.revision !== revision ||
        !sessions.has(session.state.id)
      )
        return;
      if (authorityLost(error)) {
        if (stopExpiredVoice(session)) return;
        await stop(session);
        return;
      }
      session.state.phase =
        session.state.pendingSave ||
        (error instanceof MapError && error.code === 'operation_pending')
          ? 'recovery'
          : 'error';
      session.state.error = error instanceof MapError ? error.code : 'assistant_provider_failed';
      if (session.state.error === 'assistant_context_capacity') pauseCapacity(session);
      session.state.previousFailure = assistantFailureMessage(session.state.error);
      if (session.state.saveIntent) {
        session.state.saveIntent = undefined;
        session.state.previousFailure +=
          ' Din tidigare sparbegäran gäller inte längre. Be om sparande igen när detta är löst.';
      }
      appendConversation(session, { role: 'assistant', text: session.state.previousFailure });
      session.state.reply = session.state.previousFailure;
      session.state.modelReply = undefined;
      session.state.requiredNotice = undefined;
      if (session.state.securityReference) {
        session.state.requiredNotice = blockedActionMessage(session.state.securityReference);
        session.state.reply = session.state.requiredNotice;
      }
      if (error instanceof MapError && error.code === 'assistant_task_expired') return;
      try {
        await refresh(session, guard);
      } catch {
        if (
          task.signal.aborted ||
          session.state.revision !== revision ||
          !sessions.has(session.state.id)
        )
          return;
        await stop(session);
      }
    }
  }
  function nextMessage(session: Session) {
    if (
      session.state.phase === 'working' ||
      session.state.phase === 'recovery' ||
      session.state.error === 'assistant_context_capacity' ||
      session.state.capacityPaused ||
      session.state.contextSummaryState === 'failed' ||
      session.state.contextSummaryState === 'summarizing'
    )
      return;
    const next = session.state.queue.shift();
    if (next) beginMessage(session, next);
  }
  function expireMessage(session: Session, message: Message) {
    if (sessions.get(session.state.id) !== session) return;
    const accepted = session.state.accepted.get(message.id);
    if (!accepted || !['queued', 'working'].includes(accepted.status)) return;
    accepted.status = 'expired';
    session.state.queue = session.state.queue.filter((item) => item !== message);
    if (session.state.activeMessage === message) {
      session.execution.task?.abort();
      session.execution.summaryTask?.abort();
      session.execution.task = undefined;
      session.state.activeMessage = undefined;
      session.state.taskId = undefined;
      session.state.taskSource = undefined;
      session.state.saveIntent = undefined;
      session.state.phase = session.state.pendingSave ? 'recovery' : 'error';
      session.state.error = 'assistant_task_expired';
      session.state.reply =
        'Uppgiftens tid är slut. Redan lagrat arbete finns kvar i ditt utkast eller sparresultat.';
    }
    accepted.result = captureAssistantResult(view(session), 'live');
    session.execution.deliveries.get(message.id)?.stop();
    syncWork();
    nextMessage(session);
  }
  function expireConversation(session: Session) {
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
    } else void stop(session, false);
  }
  function expireVoiceWork(session: Session) {
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
      session.state.phase = session.state.pendingSave ? 'recovery' : 'ready';
      if (accepted) {
        accepted.status = 'canceled';
        session.execution.deliveries.get(messageId || '')?.stop();
        accepted.result = captureAssistantResult(view(session), 'live');
      }
    }
    session.state.voiceInputPending = false;
    syncWork();
    nextMessage(session);
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
    if (sessions.get(session.state.id) !== session || revoked.has(session.state.id))
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
  function beginMessage(session: Session, message: Message) {
    const accepted = session.state.accepted.get(message.id);
    if (!accepted) return;
    accepted.status = 'working';
    const task = new AbortController();
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
    if (message.saveScopeChanged) session.state.saveIntent = undefined;
    if (requestsSave(message.text) && !withdrawsSave(message.text) && !message.saveScopeChanged) {
      session.state.saveIntent = message.text;
      session.state.saveIntentDeadline = message.deadline;
    }
    session.state.revision++;
    session.state.phase = 'working';
    session.state.activity = 'Förbereder uppgiften';
    session.state.activitySteps = [];
    session.state.resetSource = undefined;
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
    if (!message.voice) appendConversation(session, { role: 'user', text: message.text });
    session.state.userRequests = [...session.state.userRequests, message.text].slice(-24);
    session.state.unfinishedRequests.push({
      id: message.id,
      text: message.text,
    });
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
      consentTextVersion: session.state.consentTextVersion,
      taskId: message.id,
      revision,
      context: observationContext,
      kind: 'task_started',
      status: 'incomplete',
      data: {
        source: message.voice ? 'voice' : 'text',
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
      if (
        message.queuedReference !== undefined &&
        !requestsSave(message.text) &&
        !conversationCommand(message.text)?.discard
      ) {
        const current = (await call(session, 'read_my_draft', {}, guard)) as TextAssistantReview;
        guard();
        if (current.contentVersion !== expected.contentVersion)
          throw new MapError('content_conflict', 409);
        if (current.version !== session.state.workVersion) invalidateQueuedSaves(session);
        // Fresh facts do not change the fixed request or its admitted target.
        // Only checked effects may advance the FIFO's save scope.
        expected.version = current.version;
        session.state.review = current;
      }
      if (message.answerTo) session.execution.parts.validateReply(message.answerTo);
      if (conversationCommand(message.text)?.discard) {
        session.state.review = await call(session, 'discard_draft', expected, guard);
        guard();
        session.state.workVersion = session.state.review.version;
        session.state.phase = 'ready';
        session.state.result = { kind: 'draft', message: 'Utkastet är kastat.' };
        session.state.reply = session.state.result.message;
        session.state.discarded = true;
        appendConversation(session, { role: 'assistant', text: session.state.reply });
        finishInterruptedInput(session);
        session.state.input.push(
          { role: 'user', content: JSON.stringify({ message: message.text }) },
          { role: 'assistant', content: session.state.reply },
        );
        settleRequests(session, message.id, true);
      } else {
        let checkTurnActions: CheckTurnActions | undefined;
        let readOnly = false;
        await run(session, message.text, revision, task, expected, (check, mode) => {
          checkTurnActions = check;
          readOnly = mode === 'read';
        });
        guard();
        const unregisteredQuestion = session.execution.parts
          .read()
          .filter((part) => part.kind === 'information' && part.status === 'waiting')
          .reduce(
            (reply, part) => reply.replaceAll(part.question, ''),
            session.state.modelReply ?? '',
          )
          .includes('?');
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
        } else if (
          session.state.phase === 'ready' &&
          session.state.saveIntent &&
          !session.state.receipt &&
          !session.state.pendingSave
        ) {
          const serial = session.state.inputSerial ?? 0;
          if (await saveReady(session, serial, guard)) {
            const saveGuard = currentSaveGuard(session, serial, guard);
            const review = await call(session, 'read_my_draft', {}, saveGuard);
            if (review.conflicts.length) throw new MapError('assistant_conflict', 409);
            if (
              ![
                review.changes,
                review.relationships,
                review.objectTypes,
                review.relationshipTypes,
              ].some((changes) => changes?.length)
            ) {
              session.state.saveIntent = undefined;
              return;
            }
            const pendingSave = {
              operationId: randomUUID(),
              version: review.version,
              contentVersion: review.contentVersion,
            };
            if (!checkTurnActions) throw new MapError('assistant_scope_unavailable', 409);
            await checkTurnActions([
              { name: 'prepare_save', arguments: pendingSave },
              { name: 'save_draft', arguments: pendingSave },
            ]);
            saveGuard();
            session.state.pendingSave = pendingSave;
            await call(session, 'prepare_save', session.state.pendingSave, saveGuard);
            const value = await call(session, 'save_draft', session.state.pendingSave, saveGuard);
            verifyReceipt(session, value.receipt, session.state.pendingSave);
            saved(session, value.receipt);
            await refreshConfirmed(session, guard);
          }
        }
        if (session.state.phase === 'ready' && !unregisteredQuestion)
          settleRequests(
            session,
            message.id,
            readOnly ||
              (Boolean(session.state.result || session.state.receipt) &&
                !session.execution.parts
                  .read()
                  .some((part) => part.status === 'waiting' || part.status === 'ready')),
          );
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
    const executing = modelWork.run(conversationModelProfile(selectedModel), () =>
      observationWork.run(
        { session, context: observationContext, revision, deadline: message.deadline },
        async () => {
          try {
            requireEnabledChoice(selectedModel, config.conversationModels);
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
        session.state.phase = session.state.pendingSave ? 'recovery' : 'error';
        session.state.error = session.state.pendingSave
          ? 'assistant_save_unknown'
          : error instanceof MapError &&
              [
                'assistant_task_expired',
                'assistant_pending_part_changed',
                'assistant_action_out_of_scope',
                'assistant_scope_unclear',
                'assistant_scope_unavailable',
                'assistant_batch_incomplete',
                'assistant_model_unsupported',
                'assistant_model_access',
                'assistant_model_temporary',
                'assistant_context_capacity',
              ].includes(error.code)
            ? error.code
            : 'assistant_draft_changed';
        if (session.state.error === 'assistant_context_capacity') pauseCapacity(session);
        session.state.reply = assistantFailureMessage(session.state.error);
        if (session.state.saveIntent)
          session.state.reply +=
            ' Din tidigare sparbegäran gäller inte längre. Be om sparande igen när detta är löst.';
        session.state.saveIntent = undefined;
        if (session.state.securityReference) {
          session.state.requiredNotice = blockedActionMessage(session.state.securityReference);
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
          appendConversation(session, { role: 'assistant', text: session.state.reply });
        }
      })
      .finally(() => {
        observe?.({
          at: now(),
          sessionId: session.state.id,
          consentTextVersion: session.state.consentTextVersion,
          taskId: message.id,
          revision,
          context: observationContext,
          kind: 'task_completed',
          status: observationStatus,
          ...(observationStatus === 'incomplete' ? { evidenceGap: 'missing_end' as const } : {}),
          data: {
            source: message.voice ? 'voice' : 'text',
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
        )
          return;
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
        nextMessage(session);
      });
  }
  const base = '/households/:id/text-assistant';
  routes.get(base, (context) => context.json({ available: Boolean(config.openaiApiKey) }));
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
    if (!config.openaiApiKey) return context.json({ error: 'assistant_unavailable' }, 503);
    const body = await context.req.json().catch(() => null);
    const actorId = context.get('actorId');
    const browserSessionId = context.get('browserSessionId');
    const householdId = context.req.param('id');
    // A conversation is the only way to conversation work, spoken or written.
    // Without a valid consent none starts, and the client is told why.
    if (!consents.valid(actorId, householdId, body?.consent))
      return context.json({ error: conversationConsentRequired }, 403);
    const revocationsAtStart = revocations.get(consentKey(actorId, householdId));
    for (const previous of sessions.values())
      if (
        previous.execution.browserSessionId === browserSessionId &&
        previous.state.householdId === householdId
      )
        await stop(previous);
    let contentVersion: number | undefined;
    const guard = (generation?: number) => {
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
    if (!mcp) return context.json({ error: 'assistant_connection_failed' }, 503);
    try {
      const owner = contentOwner(database, householdId, actorId);
      const reads = assistantReadCache(database, householdId, owner);
      const review = await reads.read('read_my_draft', {}, async () => {
        const result = await mcp.call('read_my_draft', {});
        if (result.isError || !Array.isArray(result.content)) throw new Error('draft_unavailable');
        const text = result.content.find((item) => item.type === 'text');
        if (!text || typeof text.text !== 'string') throw new Error('draft_unavailable');
        return JSON.parse(text.text) as TextAssistantReview;
      });
      contentVersion = review.contentVersion;
      const modelChoice = personalModelChoice(database, actorId).read();
      const state: ConversationState = {
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
      const session: Session = {
        state,
        execution: {
          browserSessionId,
          mcp,
          reads,
          parts: pendingParts(state.pendingPartsLedger),
          capacity: new ConversationCapacity(
            modelProfile?.tokens ?? conversationModelProfile(modelChoice).tokens,
            voiceTokens,
          ),
          messageTimers: new Map(),
          deliveries: new Map(),
          timer: setTimeout(
            () => expireConversation(session),
            Math.max(1, mcp.expiresAt - now()),
          ).unref(),
        },
      };
      try {
        await refresh(session);
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
      sessions.set(session.state.id, session);
      return context.json(view(session), 201);
    } catch {
      await mcp.close();
      return context.json({ error: 'assistant_connection_failed' }, 503);
    }
  });
  /** Why the user cannot work with a conversation that is not going on. */
  function ended(sessionId: string, actorId: string, householdId: string) {
    const ending = revoked.get(sessionId);
    return ending?.actorId === actorId && ending.householdId === householdId
      ? ({ error: conversationConsentRevoked, status: 403 } as const)
      : ({ error: 'assistant_session_expired', status: 404 } as const);
  }
  routes.use(`${base}/:sessionId/*`, async (context, next) => {
    const sessionId = context.req.param('sessionId') ?? '';
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
      if (context.req.method === 'GET' && now() >= session.execution.mcp.expiresAt) {
        checkViewAccess(session);
      } else if (context.req.method === 'GET') await refreshConfirmed(session);
      else await call(session, 'read_my_draft', {});
    } catch {
      await stop(session);
      return context.json({ error: 'assistant_session_expired' }, 404);
    }
    await next();
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
      await session.execution.resetCompletion;
      checkViewAccess(session);
      if (now() < session.execution.mcp.expiresAt) await refreshConfirmed(session);
      checkViewAccess(session);
      await session.execution.resetCompletion;
      checkViewAccess(session);
    } catch {
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
  routes.post(`${base}/:sessionId/messages`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (session.state.contextSummaryState === 'failed' && !session.state.capacityPaused)
      return context.json({ error: 'assistant_context_summary_failed' }, 409);
    if (session.state.contextSummaryState === 'summarizing')
      return context.json({ error: 'assistant_busy' }, 409);
    const body = await context.req.json().catch(() => null);
    if (
      !body ||
      typeof body.text !== 'string' ||
      !body.text.trim() ||
      body.text.length > 4000 ||
      (body.restate !== undefined && typeof body.restate !== 'boolean') ||
      (body.queue !== undefined && typeof body.queue !== 'boolean') ||
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
        }),
      )
      .digest('hex');
    const accepted = session.state.accepted.get(body.requestId);
    if (accepted)
      return accepted.hash === requestHash
        ? context.json(view(session), 202)
        : context.json({ error: 'assistant_turn_changed' }, 409);
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
      (session.state.pendingSave || session.state.phase === 'recovery') &&
      session.state.phase !== 'working'
    )
      return context.json({ error: 'operation_pending' }, 409);
    const current = await call(session, 'read_my_draft', {});
    if (!currentTurn()) return context.json({ error: 'assistant_turn_changed' }, 409);
    if (answerTo.data) session.execution.parts.validateReply(answerTo.data);
    if (
      body.contentVersion !== current.contentVersion ||
      (session.state.phase !== 'working' && body.draftVersion !== current.version)
    )
      return context.json({ error: 'assistant_draft_changed' }, 409);
    if (context.req.raw.signal.aborted) return context.json({ error: 'assistant_canceled' }, 409);
    const control = conversationCommand(body.text);
    if (control?.reset) {
      await startOver(session, control.discard, body.voiceContext !== undefined);
      return context.json(view(session));
    }
    if (session.execution.task && !session.execution.task.signal.aborted && body.queue === false)
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
      (typeof body.deliveryConnectionId !== 'string' ||
        deliveryOwners.get(body.deliveryConnectionId) !== session ||
        !deliveries.has(body.deliveryConnectionId))
    )
      return context.json({ error: 'assistant_delivery_unavailable' }, 409);
    const message: Message = {
      id: body.requestId,
      text: body.text,
      restate: body.restate === true,
      queuedReference:
        session.execution.task && !session.execution.task.signal.aborted
          ? captureQueuedReference(current)
          : undefined,
      voice: body.voiceContext !== undefined,
      answerTo: answerTo.data,
      contentVersion: current.contentVersion,
      owner: contentOwner(database, session.state.householdId, session.state.actorId),
      receivedAt,
      deadline: receivedAt + 30 * 60_000,
    };
    // The body, draft check and queue wait above can cross login expiry.
    // Admission is synchronous, and retries retain this original receipt.
    authorize(session.state.actorId, session.execution.browserSessionId, session.state.householdId);
    session.execution.mcp.acceptTask(message.deadline);
    session.state.accepted.set(message.id, {
      hash: requestHash,
      voice: message.voice,
      status: 'queued',
      receivedAt: message.receivedAt,
      deadline: message.deadline,
    });
    session.execution.deliveries.set(
      message.id,
      deliveries.bind(
        body.deliveryConnectionId,
        message.id,
        message.deadline,
        () => messageAccess(session, message),
        message.voice || body.deliveryAudio === true,
      ),
    );
    syncWork();
    session.execution.messageTimers.set(
      message,
      setTimeout(
        () => expireMessage(session, message),
        Math.max(1, message.deadline - now()),
      ).unref(),
    );
    session.state.inputSerial = (session.state.inputSerial ?? 0) + 1;
    if (withdrawsSave(message.text)) session.state.saveIntent = undefined;
    if (session.execution.task && !session.execution.task.signal.aborted)
      session.state.queue.push(message);
    else {
      session.state.review = current;
      session.state.workVersion = current.version;
      beginMessage(session, message);
    }
    return context.json(
      { ...view(session), taskStatus: session.state.accepted.get(message.id)?.status },
      202,
    );
  });
  routes.post(`${base}/:sessionId/summarize`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    await session.execution.resetCompletion;
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
    await session.execution.resetCompletion;
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
    session.execution.task?.abort();
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
    session.state.phase = session.state.pendingSave ? 'recovery' : 'ready';
    await refresh(session, checkContext);
    checkContext();
    for (const [id, accepted] of session.state.accepted) {
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
    const body = await context.req.json().catch(() => ({}));
    if (body.discard !== undefined && typeof body.discard !== 'boolean')
      return context.json({ error: 'invalid_request' }, 400);
    await startOver(session, body.discard === true);
    return context.json(view(session));
  });
  routes.post(`${base}/:sessionId/recover`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (session.state.phase === 'working')
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
    if (body.checkId && session.state.saveCheck?.id === body.checkId)
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
        const ids = session.state.pendingSave
          ? [session.state.pendingSave.operationId]
          : session.state.receipt
            ? [session.state.receipt.operationId]
            : undefined;
        const checked = checkSaves(
          database,
          session.state.actorId,
          session.state.householdId,
          ids,
          body.checkId,
        );
        await refresh(session);
        if (checked.receipt) {
          const operation = checked.operations.find((item) => item.status === 'succeeded');
          if (!operation) throw new Error('invalid_receipt');
          verifyReceipt(session, checked.receipt, {
            operationId: operation.operationId,
            version: operation.draftVersion,
            contentVersion: operation.contentVersion,
          });
          saved(session, checked.receipt);
        }
        if (session.state.saveCheck?.id !== checked.id) {
          session.state.revision++;
          appendConversation(session, { role: 'assistant', text: checked.reply });
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
        session.state.saveCheck = checked;
        session.state.reply = checked.reply;
        session.state.modelReply = undefined;
        syncQuestions(session);
        session.state.newQuestions = [];
        session.state.answers = [];
        session.state.requiredNotice = undefined;
        session.state.error = undefined;
        session.state.result = undefined;
        session.state.pendingSave = undefined;
        session.state.phase = 'ready';
        finish('completed', observationResult(session));
        nextMessage(session);
        return context.json(view(session));
      },
      body,
    );
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
          if (operation.status === 'succeeded') {
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
                session.state.error = 'assistant_save_unknown';
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
    conversation: (sessionId: string) => {
      const session = sessions.get(sessionId);
      return session ? providerConversation(session) : [];
    },
    /** Export eligibility belongs to the original conversation, never later saved consent. */
    consentVersion: (sessionId: string) => sessions.get(sessionId)?.state.consentTextVersion,
    prepareVoiceContext: async (
      sessionId: string,
      signal?: AbortSignal,
      voiceLink?: { traceId: string; spanId: string },
    ) => {
      const session = sessions.get(sessionId);
      if (!session) return;
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
    transcript: (sessionId: string, role: 'user' | 'assistant', text: string) => {
      const session = sessions.get(sessionId);
      if (session) appendConversation(session, { role, text, partial: true });
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
      const guard = () =>
        textWork.exit(() => {
          if (sessions.get(sessionId) !== session || revoked.has(sessionId))
            throw new MapError('forbidden', 403);
          authorize(
            session.state.actorId,
            session.execution.browserSessionId,
            session.state.householdId,
          );
          session.execution.mcp.checkAccess();
          return loginDeadline(session.state.actorId, session.execution.browserSessionId);
        });
      return { expiresAt: guard(), guard };
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
        try {
          session.execution.mcp.checkTaskAccess();
        } catch {
          void stop(session);
        }
        for (const message of [session.state.activeMessage, ...session.state.queue])
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
      const key = consentKey(actorId, householdId);
      revocations.set(key, (revocations.get(key) ?? 0) + 1);
      const ending = [...sessions.values()].filter(
        (session) => session.state.actorId === actorId && session.state.householdId === householdId,
      );
      for (const session of ending) {
        revoked.set(session.state.id, { actorId, householdId });
        session.execution.summaryTask?.abort();
        setTimeout(
          () => revoked.delete(session.state.id),
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
      unsubscribeDiscards();
      await Promise.all([...sessions.values()].map((session) => stop(session, false)));
    },
  };
}
