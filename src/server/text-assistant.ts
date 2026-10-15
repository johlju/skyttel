import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { conversationCommand } from '../shared/conversation-command.js';
import {
  conversationConsentRequired,
  conversationConsentRevoked,
} from '../shared/conversation-consent.js';
import { assistantSaveState, completeAssistantText } from '../shared/task-delivery.js';
import type {
  MapSelection,
  TextAssistantReview,
  TextAssistantView,
} from '../shared/text-assistant.js';
import { assistantFailureMessage, newConversationMessage } from './assistant-feedback.js';
import { textAssistantInstructions } from './assistant-instructions.js';
import type { ObserveAssistant } from './assistant-observation.js';
import type { Auth } from './auth.js';
import { sessionDeadline } from './browser-binding.js';
import type { Config } from './config.js';
import { contentOwner } from './content-identities.js';
import { ConversationCapacity, voiceConversationModel } from './conversation-capacity.js';
import type { ConversationConsents } from './conversation-consent.js';
import {
  contextSummaryMessage,
  historicalSummary,
  summarizeConversation,
} from './conversation-summary.js';
import { householdAccess } from './households.js';
import { householdMap, MapError } from './map.js';
import { checkSaves } from './save-check.js';
import { type DeliverySocket, taskDeliveries } from './task-delivery.js';
import { connectTextAssistant, type LocalDispatch } from './text-assistant-mcp.js';
import { type TextModelProfile, type TextModelUsage, textModel } from './text-assistant-model.js';
import { draftResult, historyResult } from './text-assistant-results.js';

type Mcp = Awaited<ReturnType<typeof connectTextAssistant>>;
type Message = {
  id: string;
  text: string;
  voice: boolean;
  contentVersion: number;
  owner: string;
  receivedAt: number;
  deadline: number;
  timer?: NodeJS.Timeout;
};
type AcceptedMessage = {
  hash: string;
  voice: boolean;
  status: NonNullable<TextAssistantView['taskStatus']>;
  result?: TextAssistantView;
  receivedAt: number;
  deadline: number;
  delivery?: ReturnType<ReturnType<typeof taskDeliveries>['bind']>;
};
const savedReply = 'Sparat. Hela utkastet finns i hushållets karta.';
type Session = TextAssistantView & {
  id: string;
  actorId: string;
  browserSessionId: string;
  householdId: string;
  owner: string;
  mcp: Mcp;
  timer: NodeJS.Timeout;
  task?: AbortController;
  activeMessage?: Message;
  input: ResponseInputItem[];
  conversation: { role: 'user' | 'assistant'; text: string; partial?: boolean }[];
  /** Dialogue already included in Responses input; add new fragments once. */
  contextOffset: number;
  queue: Message[];
  /** Revisions before an explicit stop/reset cannot introduce new queued work. */
  boundaryRevision: number;
  /** Version reached by this FIFO, unaffected by view reads of external edits. */
  workVersion?: number;
  accepted: Map<string, AcceptedMessage>;
  capacity: ConversationCapacity;
  summary?: string;
  summaryOffset?: number;
  summaryTask?: AbortController;
  /** Context status and canceled handoffs wait for the complete reset. */
  resetCompletion?: Promise<void>;
  previousFailure?: string;
  pendingSave?: { operationId: string; version: number; contentVersion: number };
  /** Authority belongs to unfinished current work, never historical dialogue. */
  saveIntent?: string;
  saveIntentDeadline?: number;
  inputSerial?: number;
  voiceInputPending?: boolean;
  lastVoiceInputAt?: number;
  displayed?: (value: boolean) => void;
};

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
  /** A conversation has started over, so its voice can do the same and say the statement. */
  onNewConversation?: (view: TextAssistantView, deferVoiceClose?: boolean) => void;
  now?: () => number;
}) {
  const routes = new Hono<{ Variables: { actorId: string; browserSessionId: string } }>();
  const sessions = new Map<string, Session>();
  const deliveries = taskDeliveries(now);
  const deliveryOwners = new Map<string, Session>();
  const textWork = new AsyncLocalStorage<{
    session: Session;
    guard: () => void;
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
  const respond = config.openaiApiKey
    ? textModel(config.openaiApiKey, modelFetch, modelUsage, modelProfile)
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
    clearTimeout(session.activeMessage?.timer);
    for (const message of session.queue) clearTimeout(message.timer);
  }
  async function stop(session: Session, retireDelivery = true) {
    sessions.delete(session.id);
    for (const [id, owner] of deliveryOwners) {
      if (owner !== session) continue;
      if (retireDelivery) deliveries.retire(id);
      else deliveries.close(id);
      deliveryOwners.delete(id);
    }
    session.task?.abort();
    clearWorkTimers(session);
    session.summaryTask?.abort();
    session.queue = [];
    for (const accepted of session.accepted.values()) accepted.delivery?.stop();
    session.accepted.clear();
    onStop?.(session.id);
    session.displayed?.(false);
    session.input = [];
    session.conversation = [];
    session.contextOffset = 0;
    session.reply = undefined;
    session.modelReply = undefined;
    session.questions = undefined;
    session.requiredNotice = undefined;
    session.previousFailure = undefined;
    session.receipt = undefined;
    session.saveCheck = undefined;
    session.operations = [];
    session.completedReplies = [];
    session.result = undefined;
    clearTimeout(session.timer);
    await session.mcp.close();
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
      work.session.actorId === actorId &&
      work.session.browserSessionId === browserSessionId &&
      work.session.householdId === householdId
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
    session.mcp.checkAccess();
    session.mcp.checkTaskAccess();
    if (contentOwner(database, session.householdId, session.actorId) !== session.owner)
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
      questions,
      result,
      error,
      receipt,
      saveCheck,
      operations,
      selection,
      displayedSelection,
      displayedItem,
    } = session;
    return {
      id,
      revision,
      contextRevision,
      contextGeneration: session.contextGeneration,
      contextSummaryState: session.contextSummaryState,
      contextSummaries: session.contextSummaries,
      contextPercentage: session.capacity.percent(
        contextBytes(session),
        Buffer.byteLength(JSON.stringify(providerConversation(session))),
      ),
      resetSource,
      discarded,
      canceled,
      completedReplies,
      taskId,
      taskSource,
      tasks: [...session.accepted].map(([id, accepted]) => ({
        id,
        receivedAt: accepted.receivedAt,
        deadline: accepted.deadline,
        status: accepted.status,
        delivery: accepted.delivery?.value,
      })),
      queuedMessages: session.queue.length,
      saving: Boolean(
        session.pendingSave &&
          householdMap(database, session.actorId, session.householdId).operation(
            session.pendingSave.operationId,
          ).operation?.status === 'pending',
      ),
      phase,
      review,
      reply,
      modelReply,
      requiredNotice,
      questions,
      questionPending: Boolean(questions?.length),
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
    if (!session.input.length && !session.conversation.length) return 0;
    return Buffer.byteLength(
      JSON.stringify({
        instructions: `${session.mcp.instructions}\n\n${textAssistantInstructions}`,
        tools: session.mcp.tools,
        input: session.input,
        dialogue: session.conversation.slice(session.contextOffset),
      }),
    );
  }
  function providerConversation(session: Session) {
    if (!session.summary) return session.conversation;
    return [
      {
        role: 'assistant' as const,
        text: JSON.stringify({ historical: true, untrusted: true, summary: session.summary }),
      },
      ...session.conversation.slice(session.summaryOffset),
      // Current draft is independently read by the server; a summary is never
      // the authority for its state or for any new action.
      {
        role: 'assistant' as const,
        text: JSON.stringify({ currentDraft: session.review, historical: true }),
      },
    ];
  }
  function needsSummary(session: Session) {
    return session.capacity.needsSummary(
      contextBytes(session),
      Buffer.byteLength(JSON.stringify(providerConversation(session))),
    );
  }
  async function summarize(
    session: Session,
    parentGuard?: () => void,
    continuation: ResponseInputItem[] = [],
    handoff = false,
    parentSignal?: AbortSignal,
  ) {
    if (session.summaryTask || session.contextSummaryState === 'failed') return;
    const task = new AbortController();
    // A voice startup owns only the summary it starts here. An already active
    // text summary returns above and never inherits this signal.
    const aborted = () => task.abort();
    parentSignal?.addEventListener('abort', aborted, { once: true });
    if (parentSignal?.aborted) aborted();
    session.summaryTask = task;
    const revision = session.revision;
    const guard = () => {
      if (
        task.signal.aborted ||
        sessions.get(session.id) !== session ||
        session.revision !== revision
      )
        throw new MapError('assistant_canceled', 409);
      if (revoked.has(session.id)) throw new MapError('forbidden', 403);
      authorize(session.actorId, session.browserSessionId, session.householdId);
      parentGuard?.();
    };
    session.contextSummaryState = 'summarizing';
    try {
      guard();
      if (!respond) throw new Error('assistant_unavailable');
      if (handoff) await onSummary?.(session.id, task.signal);
      guard();
      const snapshot = session.conversation.length;
      const summary = await summarizeConversation(
        respond,
        JSON.stringify({
          previousSummary: session.summary,
          conversation: session.conversation.slice(session.summaryOffset ?? 0),
          providerResults: session.input,
        }),
        task.signal,
        guard,
      );
      const review = (await call(session, 'read_my_draft', {}, guard)) as TextAssistantReview;
      guard();
      // Atomic installation: failure keeps the whole old ledger and provider
      // input. The visible transcript is never truncated by this operation.
      session.review = review;
      session.summary = summary;
      session.summaryOffset = Math.max(0, snapshot - 8);
      while (
        session.summaryOffset < snapshot &&
        JSON.stringify(session.conversation.slice(session.summaryOffset, snapshot)).length > 16_000
      )
        session.summaryOffset++;
      session.contextOffset = snapshot;
      session.input = [
        historicalSummary(summary),
        {
          role: 'assistant',
          content: JSON.stringify({
            historical: true,
            recentConversation: session.conversation.slice(session.summaryOffset, snapshot),
          }),
        },
        ...continuation,
      ];
      session.contextGeneration = (session.contextGeneration ?? 0) + 1;
      session.contextSummaries ??= [];
      session.contextSummaries.push({ id: randomUUID(), text: contextSummaryMessage });
      session.contextSummaryState = undefined;
      session.capacity.reset();
    } catch (error) {
      if (task.signal.aborted || session.revision !== revision || !sessions.has(session.id)) return;
      if (authorityLost(error)) {
        if (stopExpiredVoice(session)) return;
        await stop(session);
        return;
      }
      session.contextSummaryState = 'failed';
      // A distinct DTO state, not a generic task/provider failure.
    } finally {
      parentSignal?.removeEventListener('abort', aborted);
      if (session.summaryTask === task) {
        session.summaryTask = undefined;
        if (session.contextSummaryState === 'summarizing') session.contextSummaryState = 'needed';
      }
    }
  }
  async function call(
    session: Session,
    name: string,
    args: Record<string, unknown>,
    guard?: () => void,
  ) {
    guard?.();
    const at = now();
    observe?.({
      at,
      sessionId: session.id,
      taskId: session.taskId,
      revision: session.revision,
      kind: 'mcp_started',
      data: { name, args },
    });
    const work = textWork.getStore();
    const result = await session.mcp.call(name, args, guard, work?.session === session);
    guard?.();
    if (work?.session === session) work.guard();
    observe?.({
      at: now(),
      sessionId: session.id,
      taskId: session.taskId,
      revision: session.revision,
      kind: 'mcp_completed',
      data: { name, result, startedAt: at },
    });
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
      if (session.saveIntentDeadline !== undefined && now() >= session.saveIntentDeadline)
        session.saveIntent = undefined;
      if (!session.saveIntent || session.inputSerial !== serial || session.queue.length)
        return false;
      if (!session.voiceInputPending && now() - (session.lastVoiceInputAt ?? 0) >= 2000)
        return true;
      if (now() >= deadline) throw new MapError('assistant_input_incomplete', 409);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  function currentSaveGuard(session: Session, serial: number, guard: () => void) {
    return () => {
      guard();
      if (
        !session.saveIntent ||
        (session.saveIntentDeadline !== undefined && now() >= session.saveIntentDeadline) ||
        session.inputSerial !== serial ||
        session.queue.length ||
        session.voiceInputPending ||
        now() - (session.lastVoiceInputAt ?? 0) < 2000
      )
        throw new MapError('assistant_save_superseded', 409);
    };
  }
  async function refresh(session: Session, guard?: () => void) {
    const review = await call(session, 'read_my_draft', {}, guard);
    guard?.();
    session.review = review;
    const { operations } = await call(session, 'read_my_save_operations', {}, guard);
    guard?.();
    session.operations = operations;
    if (
      session.pendingSave &&
      !session.operations.some((item) => item.operationId === session.pendingSave?.operationId)
    ) {
      const { operation } = await call(
        session,
        'read_save_operation',
        { operationId: session.pendingSave.operationId },
        guard,
      );
      guard?.();
      if (operation) session.operations.push(operation);
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
    return session.result?.message ?? (session.receipt ? savedReply : undefined);
  }
  function rememberQuestions(session: Session, questions: string[]) {
    if (!questions.length) return;
    session.questions = [...new Set([...(session.questions ?? []), ...questions])];
    session.modelReply = session.questions.join(' ');
  }
  function saved(session: Session, receipt: TextAssistantView['receipt']) {
    session.saveIntent = undefined;
    session.receipt = receipt;
    session.workVersion = receipt ? receipt.draftVersion + 1 : session.workVersion;
    session.pendingSave = undefined;
    session.reply = savedReply;
    session.conversation.push({ role: 'assistant', text: session.reply });
    session.modelReply = undefined;
    session.questions = undefined;
    session.requiredNotice = undefined;
    session.error = undefined;
    session.phase = 'ready';
    session.result = undefined;
    // The atomic receipt confirms that this exact whole draft was consumed.
    // A later view read is useful, but is not evidence required for saving.
    if (
      receipt &&
      session.review.version === receipt.draftVersion &&
      session.review.contentVersion === receipt.contentVersion
    ) {
      session.review = {
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
    session.mcp.checkAccess();
    if (
      !receipt ||
      receipt.operationId !== expected.operationId ||
      receipt.draftVersion !== expected.version ||
      receipt.contentVersion !== expected.contentVersion ||
      receipt.householdId !== session.householdId ||
      receipt.userId !== contentOwner(database, session.householdId, session.actorId)
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
        !session.receipt ||
        authorityLost(error) ||
        (error instanceof MapError && error.code === 'assistant_session_expired')
      )
        throw error;
      authorize(session.actorId, session.browserSessionId, session.householdId);
      session.mcp.checkAccess();
      guard?.();
    }
  }
  function finishInterruptedInput(session: Session) {
    const answered = new Set(
      session.input
        .filter((item) => item.type === 'function_call_output')
        .map((item) => item.call_id),
    );
    for (const item of [...session.input]) {
      if (item.type !== 'function_call' || answered.has(item.call_id)) continue;
      session.input.push({
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
    session.resetCompletion = completion;
    try {
      await completion;
    } finally {
      if (session.resetCompletion === completion) session.resetCompletion = undefined;
    }
  }
  async function resetContext(session: Session, discard: boolean, deferVoiceClose: boolean) {
    // Retire the old executor before its task records disappear. A delayed
    // status response must not cancel work belonging to the new conversation.
    onResetStart?.(session.id);
    for (const [id, owner] of deliveryOwners) if (owner === session) deliveries.retire(id);
    session.task?.abort();
    clearWorkTimers(session);
    session.summaryTask?.abort();
    session.summaryTask = undefined;
    session.summary = undefined;
    session.summaryOffset = undefined;
    session.contextSummaryState = undefined;
    session.contextSummaries = [];
    session.contextGeneration = 0;
    session.queue = [];
    for (const accepted of session.accepted.values()) accepted.delivery?.stop();
    session.accepted.clear();
    session.taskId = undefined;
    session.taskSource = undefined;
    session.canceled = undefined;
    session.completedReplies = [];
    session.revision++;
    session.boundaryRevision = session.revision;
    session.saveIntent = undefined;
    session.voiceInputPending = false;
    await refresh(session);
    session.phase = session.pendingSave ? 'recovery' : 'ready';
    if (discard) {
      session.review = await call(session, 'discard_draft', {
        version: session.review.version,
        contentVersion: session.review.contentVersion,
      });
    }
    session.workVersion = session.review.version;
    session.input = [];
    session.conversation = [];
    session.contextOffset = 0;
    session.contextRevision = (session.contextRevision ?? 0) + 1;
    session.capacity.reset();
    session.resetSource = deferVoiceClose ? 'voice' : 'text';
    session.previousFailure = undefined;
    session.selection = undefined;
    session.displayedSelection = undefined;
    session.displayedItem = undefined;
    session.modelReply = undefined;
    session.reply = undefined;
    session.questions = undefined;
    session.requiredNotice = undefined;
    session.result = undefined;
    session.error = undefined;
    session.receipt = undefined;
    session.saveCheck = undefined;
    session.discarded = undefined;
    session.phase =
      session.pendingSave || session.operations.some((item) => item.status === 'pending')
        ? 'recovery'
        : 'ready';
    session.reply = newConversationMessage(session.review);
    onNewConversation?.(view(session), deferVoiceClose);
  }
  async function run(
    session: Session,
    text: string,
    revision: number,
    task: AbortController,
    expected: { version: number; contentVersion: number },
  ) {
    const serial = session.inputSerial ?? 0;
    let originalSaveIntent = Boolean(session.saveIntent);
    const guard = () => {
      if (task.signal.aborted || session.revision !== revision || !sessions.has(session.id))
        throw new MapError('assistant_canceled', 409);
      authorize(session.actorId, session.browserSessionId, session.householdId);
    };
    try {
      guard();
      const review = (await call(session, 'read_my_draft', {}, guard)) as TextAssistantReview;
      guard();
      if (
        review.version !== expected.version ||
        review.contentVersion !== expected.contentVersion
      ) {
        session.review = review;
        throw new MapError('assistant_draft_changed', 409);
      }
      session.review = review;
      session.operations = (await call(session, 'read_my_save_operations', {}, guard)).operations;
      if (session.operations.some((operation) => operation.status === 'pending'))
        throw new MapError('operation_pending', 409);
      if (needsSummary(session)) await summarize(session, guard);
      guard();
      if (session.contextSummaryState === 'failed') {
        session.phase = 'ready';
        return;
      }
      let version = review.version;
      const mutations = new Set<string>();
      let contentVersion = review.contentVersion;
      finishInterruptedInput(session);
      const dialogue = session.conversation.slice(session.contextOffset);
      session.contextOffset = session.conversation.length;
      let turnStart = session.input.length;
      session.input.push({
        role: 'user',
        content: JSON.stringify({
          message: text,
          draft: review,
          voiceContext: dialogue.length ? JSON.stringify(dialogue) : undefined,
          previousFailure: session.previousFailure
            ? { message: session.previousFailure, historical: true }
            : undefined,
        }),
      });
      for (let step = 0; step < 48; step++) {
        guard();
        if (!respond) throw new Error('assistant_unavailable');
        if (needsSummary(session)) {
          const continuation = session.input.slice(turnStart);
          await summarize(session, guard, continuation);
          guard();
          turnStart = session.input.length - continuation.length;
          if (view(session).contextSummaryState === 'failed' || needsSummary(session)) {
            session.contextSummaryState = 'failed';
            session.phase = 'ready';
            return;
          }
        }
        const tools = session.mcp.tools.map((tool) => ({
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
        const draftTools = session.mcp.tools.filter(
          (tool) =>
            tool.annotations?.readOnlyHint === false &&
            !['save_draft', 'prepare_save'].includes(tool.name),
        );
        tools.push({
          type: 'function',
          name: 'submit_changes',
          description:
            'Utför ändringarna som en ordnad batch med vanliga MCP-verktyg och aktuella versioner. Behåll andra förslag. completion draft lämnar allt osparat; save kräver ett aktuellt uttryckligt besked om hela utkastet. questions är korta riktade följdfrågor, aldrig resultatpåståenden. Sätt continueResponse true om oberoende faktasvar, detaljer eller markering återstår, även när frågor väntar. Servern behåller frågorna och hindrar sparande tills användaren svarar. Annars avslutar servern.',
          parameters: {
            type: 'object',
            properties: {
              version: { type: 'integer', minimum: 0 },
              contentVersion: { type: 'integer', minimum: 1 },
              completion: { type: 'string', enum: ['draft', 'save'] },
              continueResponse: { type: 'boolean' },
              questions: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 240 } },
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
            'Ställ nödvändiga riktade frågor i samtalet och invänta svar. Använd även utan ändringsoperationer, till exempel för obesvarade identiteter eller konflikter. Beskriv de berörda namnen och konkreta valen från aktuellt underlag; gissa inga svar. Sätt continueResponse true när oberoende beställda delar återstår. Frågorna behålls; detta ändrar eller sparar ingenting.',
          parameters: {
            type: 'object',
            properties: {
              questions: {
                type: 'array',
                minItems: 1,
                maxItems: 3,
                items: { type: 'string', maxLength: 240 },
              },
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
        const response = await respond(
          `${session.mcp.instructions}\n\n${textAssistantInstructions}`,
          session.input,
          tools,
          task.signal,
        );
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
        session.input.push(...toResponseInputItems(response.output));
        session.capacity.text(response.usage, contextBytes(session));
        let calls = response.output.filter((item) => item.type === 'function_call');
        for (const action of calls)
          observe?.({
            at: now(),
            sessionId: session.id,
            taskId: session.taskId,
            revision,
            kind: 'model_action',
            data: { name: action.name, arguments: action.arguments, callId: action.call_id },
          });
        let combined:
          | {
              completion: 'draft' | 'save';
              questions: string[];
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
              questions: z.array(z.string().min(1).max(240)).max(3).default([]),
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
          if (batch.completion === 'save' && !session.saveIntent && !originalSaveIntent)
            throw new MapError('assistant_save_not_requested', 409);
          if (batch.completion === 'save' && batch.questions.length)
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
          const original = calls[0];
          combined = { ...batch, callId: original.call_id };
          calls = batch.operations.map((operation) => ({
            ...original,
            name: operation.name,
            arguments: JSON.stringify(operation.arguments),
          }));
          if (batch.completion === 'save')
            calls.push({ ...original, name: 'save_draft', arguments: '{}' });
        }
        if (!calls.length) {
          session.modelReply = [
            response.output_text,
            ...(session.questions ?? []).filter(
              (question) => !response.output_text.includes(question),
            ),
          ]
            .filter(Boolean)
            .join('\n');
          if (response.output_text)
            session.conversation.push({ role: 'assistant', text: response.output_text });
          session.reply =
            verifiedReply(session) ??
            (session.displayedSelection ? 'Markerat i kartan.' : undefined);
          session.phase = session.pendingSave ? 'recovery' : 'ready';
          return;
        }
        for (const action of calls) {
          guard();
          const args = JSON.parse(action.arguments) as Record<string, unknown>;
          if (combined) Object.assign(args, { version, contentVersion });
          if (action.name === 'ask_questions') {
            if (calls.length !== 1) throw new MapError('invalid_request', 400);
            const value = z
              .object({
                questions: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
                continueResponse: z.boolean().default(false),
              })
              .strict()
              .parse(args);
            rememberQuestions(session, value.questions);
            session.reply = verifiedReply(session);
            session.phase = 'ready';
            session.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify({ questionPending: true }),
            });
            session.conversation.push({ role: 'assistant', text: value.questions.join(' ') });
            if (value.continueResponse) {
              session.phase = 'working';
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
            if (report.source === 'draft') session.result = draftResult(afterProvider);
            else if (report.source === 'last_failure')
              session.result = {
                kind: 'failure',
                message: session.previousFailure
                  ? `Det senaste registrerade felbeskedet var: ${session.previousFailure}`
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
              session.result = historyResult(
                identity
                  ? (await call(session, 'read_history', identity, guard)).receipt
                  : undefined,
              );
            }
            guard();
            session.reply = session.result.message;
            session.modelReply = session.questions?.join(' ');
            session.phase = 'ready';
            session.conversation.push({ role: 'assistant', text: session.reply });
            session.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify(session.result),
            });
            if (report.continueResponse) {
              session.phase = 'working';
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
            const selected = await selectedItem(session, selection, session.review, guard);
            if (!selected) throw new MapError('assistant_object_missing', 409);
            guard();
            session.selection = {
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
                session.displayed = undefined;
                resolve(value);
              };
              const abort = () => finish(false);
              const timer = setTimeout(() => finish(false), 15_000).unref();
              session.displayed = finish;
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
            session.selection = undefined;
            session.displayedSelection = displayed ? selection.id : undefined;
            session.displayedItem = displayed ? selection : undefined;
            session.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify({ ...selection, displayed }),
            });
            continue;
          }
          const tool = session.mcp.tools.find((tool) => tool.name === action.name);
          if (!tool) throw new MapError('assistant_unknown_tool', 409);
          const isSave = action.name === 'save_draft' || action.name === 'prepare_save';
          let previousReview: TextAssistantReview | undefined;
          if (isSave && session.questions?.length) {
            session.phase = 'ready';
            return;
          }
          if (isSave && !session.saveIntent && !originalSaveIntent)
            throw new MapError('assistant_save_not_requested', 409);
          if (isSave && !(await saveReady(session, serial, guard))) {
            session.phase = 'ready';
            session.modelReply = undefined;
            session.reply = undefined;
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
            session.pendingSave ??= { operationId: randomUUID(), version, contentVersion };
            Object.assign(args, session.pendingSave);
            if (action.name === 'save_draft')
              await call(
                session,
                'prepare_save',
                session.pendingSave,
                currentSaveGuard(session, serial, guard),
              );
          }
          const value = await call(
            session,
            action.name,
            args,
            isSave ? currentSaveGuard(session, serial, guard) : guard,
          );
          guard();
          if (action.name === 'save_draft') {
            if (!session.pendingSave) throw new Error('invalid_receipt');
            verifyReceipt(session, value.receipt, session.pendingSave);
            saved(session, value.receipt);
            await refreshConfirmed(session, guard);
            originalSaveIntent = false;
            if (combined) {
              version = session.review.version;
              contentVersion = session.review.contentVersion;
              continue;
            }
            session.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify(value),
            });
            return;
          }
          if (!combined)
            session.input.push({
              type: 'function_call_output',
              call_id: action.call_id,
              output: JSON.stringify(value),
            });
          if (tool.annotations?.readOnlyHint !== true) {
            if (Number.isSafeInteger(value.version)) session.workVersion = value.version;
            const before = previousReview ?? session.review;
            session.review = await call(session, 'read_my_draft', {}, guard);
            version = session.review.version;
            if (version !== before.version && !isSave) {
              const restored =
                action.name === 'discard_proposal' &&
                [
                  before.changes,
                  before.relationships,
                  before.objectTypes,
                  before.relationshipTypes,
                ].some((changes) =>
                  changes?.some(
                    (change) => change.id === args.id && change.before && !change.after,
                  ),
                );
              mutations.add(restored ? 'restored' : 'draft');
              const kind = mutations.size === 1 && mutations.has('restored') ? 'restored' : 'draft';
              session.result = {
                kind,
                message: kind === 'restored' ? 'Återställt i utkastet.' : 'Utkastet är uppdaterat.',
              };
            }
          }
        }
        if (combined) {
          session.reply = verifiedReply(session);
          rememberQuestions(session, combined.questions);
          session.phase = 'ready';
          session.input.push({
            type: 'function_call_output',
            call_id: combined.callId,
            output: JSON.stringify({
              result: session.result,
              receipt: session.receipt,
              reply: session.reply,
              review: session.review,
              questions: combined.questions,
            }),
          });
          if (session.reply) session.conversation.push({ role: 'assistant', text: session.reply });
          if (session.modelReply)
            session.conversation.push({ role: 'assistant', text: session.modelReply });
          if (combined.continueResponse) {
            session.phase = 'working';
            continue;
          }
          return;
        }
      }
      throw new Error('assistant_step_limit');
    } catch (error) {
      if (task.signal.aborted || session.revision !== revision || !sessions.has(session.id)) return;
      if (authorityLost(error)) {
        if (stopExpiredVoice(session)) return;
        await stop(session);
        return;
      }
      session.phase =
        session.pendingSave || (error instanceof MapError && error.code === 'operation_pending')
          ? 'recovery'
          : 'error';
      session.error = error instanceof MapError ? error.code : 'assistant_provider_failed';
      session.previousFailure = assistantFailureMessage(session.error);
      if (session.saveIntent) {
        session.saveIntent = undefined;
        session.previousFailure +=
          ' Din tidigare sparbegäran gäller inte längre. Be om sparande igen när detta är löst.';
      }
      session.conversation.push({ role: 'assistant', text: session.previousFailure });
      session.reply = session.previousFailure;
      session.modelReply = undefined;
      session.questions = undefined;
      session.requiredNotice = undefined;
      if (error instanceof MapError && error.code === 'assistant_task_expired') return;
      try {
        await refresh(session, guard);
      } catch {
        if (task.signal.aborted || session.revision !== revision || !sessions.has(session.id))
          return;
        await stop(session);
      }
    }
  }
  function nextMessage(session: Session) {
    if (
      session.phase === 'working' ||
      session.phase === 'recovery' ||
      session.contextSummaryState === 'failed' ||
      session.contextSummaryState === 'summarizing'
    )
      return;
    const next = session.queue.shift();
    if (next) beginMessage(session, next);
  }
  function expireMessage(session: Session, message: Message) {
    if (sessions.get(session.id) !== session) return;
    const accepted = session.accepted.get(message.id);
    if (!accepted || !['queued', 'working'].includes(accepted.status)) return;
    accepted.status = 'expired';
    session.queue = session.queue.filter((item) => item !== message);
    if (session.activeMessage === message) {
      session.task?.abort();
      session.summaryTask?.abort();
      session.task = undefined;
      session.activeMessage = undefined;
      session.taskId = undefined;
      session.taskSource = undefined;
      session.saveIntent = undefined;
      session.phase = session.pendingSave ? 'recovery' : 'error';
      session.error = 'assistant_task_expired';
      session.reply =
        'Uppgiftens tid är slut. Redan lagrat arbete finns kvar i ditt utkast eller sparresultat.';
    }
    accepted.result = view(session);
    accepted.delivery?.stop();
    nextMessage(session);
  }
  function expireConversation(session: Session) {
    const activeUntil = Math.max(
      0,
      ...[...session.accepted.values()]
        .filter(
          (accepted) =>
            ['queued', 'working'].includes(accepted.status) ||
            ['waiting', 'awaiting-receipt'].includes(accepted.delivery?.value.state ?? ''),
        )
        .map((accepted) => accepted.deadline),
    );
    if (activeUntil > now()) {
      session.timer = setTimeout(() => expireConversation(session), activeUntil - now()).unref();
    } else void stop(session, false);
  }
  function expireVoiceWork(session: Session) {
    for (const accepted of session.accepted.values()) if (accepted.voice) accepted.delivery?.stop();
    const queued = session.queue.filter((message) => message.voice);
    session.queue = session.queue.filter((message) => !message.voice);
    for (const message of queued) {
      clearTimeout(message.timer);
      const accepted = session.accepted.get(message.id);
      if (accepted) {
        accepted.status = 'canceled';
        accepted.delivery?.stop();
        accepted.result = view(session);
      }
    }
    if (session.taskSource === 'voice') {
      session.task?.abort();
      session.summaryTask?.abort();
      clearTimeout(session.activeMessage?.timer);
      const accepted = session.activeMessage && session.accepted.get(session.activeMessage.id);
      session.task = undefined;
      session.activeMessage = undefined;
      session.taskId = undefined;
      session.taskSource = undefined;
      session.saveIntent = undefined;
      session.phase = session.pendingSave ? 'recovery' : 'ready';
      if (accepted) {
        accepted.status = 'canceled';
        accepted.delivery?.stop();
        accepted.result = view(session);
      }
    }
    session.voiceInputPending = false;
    nextMessage(session);
  }
  function stopExpiredVoice(session: Session) {
    if (
      session.taskSource !== 'voice' ||
      !(loginDeadline(session.actorId, session.browserSessionId) <= now())
    )
      return false;
    try {
      session.mcp.checkTaskAccess();
    } catch {
      return false;
    } // Explicit revocation stops every source.
    expireVoiceWork(session);
    return true;
  }
  function messageAccess(session: Session, message: Message) {
    if (sessions.get(session.id) !== session || revoked.has(session.id))
      throw new MapError('forbidden', 403);
    if (!Number.isFinite(message.deadline) || now() >= message.deadline)
      throw new MapError('assistant_task_expired', 409);
    session.mcp.checkTaskAccess();
    if (contentOwner(database, session.householdId, session.actorId) !== message.owner)
      throw new MapError('forbidden', 403);
    const generation = database
      .prepare('SELECT contentVersion FROM household WHERE id = ?')
      .get(session.householdId) as { contentVersion: number } | undefined;
    if (generation?.contentVersion !== message.contentVersion)
      throw new MapError('assistant_content_changed', 409);
    if (message.voice)
      textWork.exit(() =>
        authorize(session.actorId, session.browserSessionId, session.householdId),
      );
  }
  function beginMessage(session: Session, message: Message) {
    const accepted = session.accepted.get(message.id);
    if (!accepted) return;
    accepted.status = 'working';
    const task = new AbortController();
    session.task = task;
    session.activeMessage = message;
    session.taskId = message.id;
    session.taskSource = message.voice ? 'voice' : 'text';
    if (requestsSave(message.text) && !withdrawsSave(message.text)) {
      session.saveIntent = message.text;
      session.saveIntentDeadline = message.deadline;
    }
    session.revision++;
    session.phase = 'working';
    session.resetSource = undefined;
    session.canceled = undefined;
    session.error = undefined;
    session.reply = undefined;
    session.modelReply = undefined;
    session.questions = undefined;
    session.requiredNotice = undefined;
    session.receipt = undefined;
    session.saveCheck = undefined;
    session.discarded = undefined;
    session.result = undefined;
    session.selection = undefined;
    session.displayedSelection = undefined;
    session.displayedItem = undefined;
    if (!message.voice) session.conversation.push({ role: 'user', text: message.text });
    const revision = session.revision;
    const guard = () => {
      if (
        task.signal.aborted ||
        session.revision !== revision ||
        sessions.get(session.id) !== session
      )
        throw new MapError('assistant_canceled', 409);
      if (!Number.isFinite(message.deadline) || now() >= message.deadline)
        throw new MapError('assistant_task_expired', 409);
      messageAccess(session, message);
    };
    const expected = {
      version: session.workVersion ?? session.review.version,
      contentVersion: message.contentVersion,
    };
    const execute = async () => {
      guard();
      if (conversationCommand(message.text)?.discard) {
        session.review = await call(session, 'discard_draft', expected, guard);
        guard();
        session.workVersion = session.review.version;
        session.phase = 'ready';
        session.result = { kind: 'draft', message: 'Utkastet är kastat.' };
        session.reply = session.result.message;
        session.discarded = true;
        session.conversation.push({ role: 'assistant', text: session.reply });
        finishInterruptedInput(session);
        session.input.push(
          { role: 'user', content: JSON.stringify({ message: message.text }) },
          { role: 'assistant', content: session.reply },
        );
      } else {
        await run(session, message.text, revision, task, expected);
        guard();
        if (
          (session.questions?.length || session.modelReply?.includes('?')) &&
          // Speech may omit the sentence boundary before a final save request.
          // Explain renewal in that case without granting save authority.
          (session.saveIntent || (message.voice && requestsSave(message.text, 'clarification')))
        ) {
          session.saveIntent = undefined;
          const notice =
            'Din tidigare sparbegäran gäller inte längre. Be om sparande igen när frågorna är lösta.';
          session.requiredNotice = notice;
          session.reply = [session.reply, notice].filter(Boolean).join('\n');
          session.conversation.push({ role: 'assistant', text: notice });
        } else if (
          session.phase === 'ready' &&
          session.saveIntent &&
          !session.receipt &&
          !session.pendingSave
        ) {
          const serial = session.inputSerial ?? 0;
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
              session.saveIntent = undefined;
              return;
            }
            session.pendingSave = {
              operationId: randomUUID(),
              version: review.version,
              contentVersion: review.contentVersion,
            };
            await call(session, 'prepare_save', session.pendingSave, saveGuard);
            const value = await call(session, 'save_draft', session.pendingSave, saveGuard);
            verifyReceipt(session, value.receipt, session.pendingSave);
            saved(session, value.receipt);
            await refreshConfirmed(session, guard);
          }
        }
        if (
          !task.signal.aborted &&
          session.revision === revision &&
          session.phase === 'ready' &&
          needsSummary(session)
        )
          if (message.voice) session.contextSummaryState = 'needed';
          else await summarize(session, guard);
      }
    };
    const executing = message.voice ? execute() : textWork.run({ session, guard }, execute);
    void executing
      .catch((error) => {
        if (task.signal.aborted || session.revision !== revision) return;
        session.phase = session.pendingSave ? 'recovery' : 'error';
        session.error = session.pendingSave
          ? 'assistant_save_unknown'
          : error instanceof MapError && error.code === 'assistant_task_expired'
            ? 'assistant_task_expired'
            : 'assistant_draft_changed';
        session.reply = assistantFailureMessage(session.error);
        if (session.saveIntent)
          session.reply +=
            ' Din tidigare sparbegäran gäller inte längre. Be om sparande igen när detta är löst.';
        session.saveIntent = undefined;
      })
      .finally(() => {
        clearTimeout(message.timer);
        if (task.signal.aborted || session.task !== task || !sessions.has(session.id)) return;
        accepted.status = now() >= message.deadline ? 'expired' : 'completed';
        if (
          (!session.saveIntent || (!session.queue.length && !session.voiceInputPending)) &&
          (session.modelReply || session.reply)
        )
          session.completedReplies?.push({
            id: message.id,
            text: session.modelReply ?? '',
            revision,
            source: message.voice ? 'voice' : 'text',
            reply: session.reply,
            requiredNotice: session.requiredNotice,
            questionPending: view(session).questionPending,
            receipt: session.receipt,
            result: session.result,
          });
        session.task = undefined;
        session.activeMessage = undefined;
        session.taskId = undefined;
        session.taskSource = undefined;
        accepted.result = {
          ...view(session),
          completedReplies: [...(session.completedReplies ?? [])],
        };
        if (accepted.status === 'completed' && session.phase === 'ready')
          accepted.delivery?.freeze(
            completeAssistantText(accepted.result),
            assistantSaveState(accepted.result),
          );
        else accepted.delivery?.stop();
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
        session.householdId === context.req.param('id') &&
        session.phase === 'working' &&
        householdAccess(database, session.actorId, session.householdId) &&
        contentOwner(database, session.householdId, session.actorId) === owner &&
        (!body.operationIds ||
          (session.pendingSave && body.operationIds.includes(session.pendingSave.operationId))),
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
      if (previous.browserSessionId === browserSessionId && previous.householdId === householdId)
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
      const result = await mcp.call('read_my_draft', {});
      if (result.isError || !Array.isArray(result.content)) throw new Error('draft_unavailable');
      const text = result.content.find((item) => item.type === 'text');
      if (!text || typeof text.text !== 'string') throw new Error('draft_unavailable');
      const review = JSON.parse(text.text) as TextAssistantReview;
      contentVersion = review.contentVersion;
      const session: Session = {
        id: randomUUID(),
        actorId,
        browserSessionId,
        householdId,
        owner: contentOwner(database, householdId, actorId),
        revision: 0,
        phase: 'ready',
        mcp,
        review,
        operations: [],
        input: [],
        conversation: [],
        contextOffset: 0,
        capacity: new ConversationCapacity(modelProfile?.tokens, voiceTokens),
        contextRevision: 0,
        queue: [],
        boundaryRevision: 0,
        accepted: new Map(),
        completedReplies: [],
        timer: setTimeout(
          () => expireConversation(session),
          Math.max(1, mcp.expiresAt - now()),
        ).unref(),
      };
      try {
        await refresh(session);
      } catch (error) {
        await stop(session);
        throw error;
      }
      if (session.operations.some((operation) => operation.status === 'pending'))
        session.phase = 'recovery';
      // A consent that was revoked while the conversation connected starts none.
      if (revocations.get(consentKey(actorId, householdId)) !== revocationsAtStart) {
        await stop(session);
        return context.json({ error: conversationConsentRequired }, 403);
      }
      sessions.set(session.id, session);
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
      session.actorId !== context.get('actorId') ||
      session.browserSessionId !== context.get('browserSessionId') ||
      session.householdId !== context.req.param('id')
    ) {
      const { error, status } = ended(sessionId, context.get('actorId'), context.req.param('id'));
      return context.json({ error }, status);
    }
    try {
      if (context.req.method === 'GET' && now() >= session.mcp.expiresAt) {
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
      session.actorId !== context.get('actorId') ||
      session.browserSessionId !== context.get('browserSessionId') ||
      session.householdId !== context.req.param('id')
    ) {
      const { error, status } = ended(sessionId, context.get('actorId'), context.req.param('id'));
      return context.json({ error }, status);
    }
    try {
      await session.resetCompletion;
      checkViewAccess(session);
      if (now() < session.mcp.expiresAt) await refreshConfirmed(session);
      checkViewAccess(session);
      await session.resetCompletion;
      checkViewAccess(session);
    } catch {
      await stop(session);
      return context.json({ error: 'assistant_session_expired' }, 404);
    }
    return context.json(view(session));
  });
  routes.post(`${base}/:sessionId/stop`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (session) await stop(session);
    return context.json({ stopped: true });
  });
  routes.post(`${base}/:sessionId/messages`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (session.contextSummaryState === 'failed')
      return context.json({ error: 'assistant_context_summary_failed' }, 409);
    if (session.contextSummaryState === 'summarizing')
      return context.json({ error: 'assistant_busy' }, 409);
    const body = await context.req.json().catch(() => null);
    if (
      !body ||
      typeof body.text !== 'string' ||
      !body.text.trim() ||
      body.text.length > 4000 ||
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
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          revision: body.revision,
          draftVersion: body.draftVersion,
          contentVersion: body.contentVersion,
          text: body.text,
          voiceContext: body.voiceContext,
        }),
      )
      .digest('hex');
    const accepted = session.accepted.get(body.requestId);
    if (accepted)
      return accepted.hash === requestHash
        ? context.json(view(session), 202)
        : context.json({ error: 'assistant_turn_changed' }, 409);
    const currentTurn = () =>
      body.revision === session.revision ||
      (session.phase === 'working' &&
        Number.isSafeInteger(body.revision) &&
        body.revision >= session.boundaryRevision &&
        body.revision < session.revision);
    if (!currentTurn()) return context.json({ error: 'assistant_turn_changed' }, 409);
    if ((session.pendingSave || session.phase === 'recovery') && session.phase !== 'working')
      return context.json({ error: 'operation_pending' }, 409);
    const current = await call(session, 'read_my_draft', {});
    if (!currentTurn()) return context.json({ error: 'assistant_turn_changed' }, 409);
    if (
      body.contentVersion !== current.contentVersion ||
      (session.phase !== 'working' && body.draftVersion !== current.version)
    )
      return context.json({ error: 'assistant_draft_changed' }, 409);
    if (context.req.raw.signal.aborted) return context.json({ error: 'assistant_canceled' }, 409);
    const control = conversationCommand(body.text);
    if (control?.reset) {
      await startOver(session, control.discard, body.voiceContext !== undefined);
      return context.json(view(session));
    }
    if (session.task && !session.task.signal.aborted && body.queue === false)
      return context.json({ error: 'assistant_busy' }, 409);
    // Keep delivery records for same-session retries, but only pending work
    // consumes queue capacity. Completed or canceled turns do not end a conversation.
    if (session.queue.length + Number(Boolean(session.task && !session.task.signal.aborted)) >= 200)
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
      voice: body.voiceContext !== undefined,
      contentVersion: current.contentVersion,
      owner: contentOwner(database, session.householdId, session.actorId),
      receivedAt,
      deadline: receivedAt + 30 * 60_000,
    };
    // The body, draft check and queue wait above can cross login expiry.
    // Admission is synchronous, and retries retain this original receipt.
    authorize(session.actorId, session.browserSessionId, session.householdId);
    session.mcp.acceptTask(message.deadline);
    session.accepted.set(message.id, {
      hash: requestHash,
      voice: message.voice,
      status: 'queued',
      receivedAt: message.receivedAt,
      deadline: message.deadline,
      delivery: deliveries.bind(
        body.deliveryConnectionId,
        message.id,
        message.deadline,
        () => messageAccess(session, message),
        message.voice || body.deliveryAudio === true,
      ),
    });
    message.timer = setTimeout(
      () => expireMessage(session, message),
      Math.max(1, message.deadline - now()),
    ).unref();
    session.inputSerial = (session.inputSerial ?? 0) + 1;
    if (withdrawsSave(message.text)) session.saveIntent = undefined;
    if (session.task && !session.task.signal.aborted) session.queue.push(message);
    else {
      session.review = current;
      session.workVersion = current.version;
      beginMessage(session, message);
    }
    return context.json(
      { ...view(session), taskStatus: session.accepted.get(message.id)?.status },
      202,
    );
  });
  routes.post(`${base}/:sessionId/summarize`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    await session.resetCompletion;
    if (session.phase === 'working' || session.phase === 'recovery' || session.pendingSave)
      return context.json(view(session));
    if (session.contextSummaryState === 'needed' || needsSummary(session)) {
      // The browser has paused local capture and retired the peer before this
      // handoff. Close its server sideband before taking the ledger snapshot.
      await summarize(session, undefined, [], true);
    }
    await session.resetCompletion;
    return context.json(view(session));
  });
  // Poll a particular accepted message: a subsequent FIFO task may already be
  // running when a voice executor observes its own verified completion.
  routes.get(`${base}/:sessionId/messages/:requestId`, (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    const accepted = session.accepted.get(context.req.param('requestId'));
    if (!accepted) return context.json({ error: 'assistant_turn_changed' }, 409);
    return context.json({
      ...(accepted.result ?? view(session)),
      tasks: view(session).tasks,
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
      body.contextRevision !== (session.contextRevision ?? 0)
    )
      return context.json({ error: 'assistant_turn_changed' }, 409);
    if (session.canceled && session.phase !== 'working') return context.json(view(session));
    if (body?.all !== true && body?.revision !== session.revision)
      return context.json({ error: 'assistant_turn_changed' }, 409);
    const contextRevision = session.contextRevision ?? 0;
    const checkContext = () => {
      if ((session.contextRevision ?? 0) !== contextRevision)
        throw new MapError('assistant_turn_changed', 409);
    };
    session.task?.abort();
    session.summaryTask?.abort();
    session.saveIntent = undefined;
    clearWorkTimers(session);
    session.voiceInputPending = false;
    session.queue = [];
    session.taskId = undefined;
    session.taskSource = undefined;
    session.revision++;
    session.boundaryRevision = session.revision;
    session.canceled = true;
    session.selection = undefined;
    session.error = undefined;
    session.reply = 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.';
    session.conversation.push({ role: 'assistant', text: session.reply });
    session.modelReply = undefined;
    session.questions = undefined;
    session.requiredNotice = undefined;
    session.phase = session.pendingSave ? 'recovery' : 'ready';
    await refresh(session, checkContext);
    checkContext();
    for (const accepted of session.accepted.values()) {
      accepted.delivery?.stop();
      if (accepted.status === 'queued' || accepted.status === 'working') {
        accepted.status = 'canceled';
        accepted.result = view(session);
      }
    }
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
    if (session.phase === 'working') return context.json(view(session));
    const body = await context.req.json().catch(() => ({}));
    if (
      body.checkId !== undefined &&
      (typeof body.checkId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.checkId))
    )
      return context.json({ error: 'invalid_request' }, 400);
    if (body.checkId && session.saveCheck?.id === body.checkId) return context.json(view(session));
    const ids = session.pendingSave
      ? [session.pendingSave.operationId]
      : session.receipt
        ? [session.receipt.operationId]
        : undefined;
    const checked = checkSaves(database, session.actorId, session.householdId, ids, body.checkId);
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
    if (session.saveCheck?.id !== checked.id) {
      session.revision++;
      session.conversation.push({ role: 'assistant', text: checked.reply });
      session.completedReplies?.push({
        id: `check-${checked.id}`,
        source: 'text',
        revision: session.revision,
        text: '',
        reply: checked.reply,
        receipt: checked.receipt,
        saveCheck: checked,
      });
    }
    session.saveCheck = checked;
    session.reply = checked.reply;
    session.modelReply = undefined;
    session.questions = undefined;
    session.requiredNotice = undefined;
    session.error = undefined;
    session.result = undefined;
    session.pendingSave = undefined;
    session.phase = 'ready';
    nextMessage(session);
    return context.json(view(session));
  });
  routes.post(`${base}/:sessionId/retry`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    if (!session) return context.json({ error: 'assistant_session_expired' }, 404);
    if (session.phase === 'working') return context.json({ error: 'assistant_turn_changed' }, 409);
    let revision = session.revision;
    const body = await context.req.json().catch(() => null);
    const task = new AbortController();
    const abort = () => task.abort();
    context.req.raw.signal.addEventListener('abort', abort, { once: true });
    if (context.req.raw.signal.aborted) abort();
    const guard = () => {
      if (task.signal.aborted || session.revision !== revision || !sessions.has(session.id))
        throw new MapError('assistant_canceled', 409);
      authorize(session.actorId, session.browserSessionId, session.householdId);
    };
    try {
      guard();
      if (body?.revision !== undefined && body.revision !== revision)
        throw new MapError('assistant_turn_changed', 409);
      await refresh(session, guard);
      guard();
      const operation = session.operations.find((item) => item.operationId === body?.operationId);
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
        session.task?.abort();
        session.task = task;
        revision = ++session.revision;
        session.phase = 'working';
        session.pendingSave = {
          operationId: operation.operationId,
          version: operation.draftVersion,
          contentVersion: operation.contentVersion,
        };
        try {
          const result = await call(session, 'save_draft', session.pendingSave, guard);
          guard();
          verifyReceipt(session, result.receipt, session.pendingSave);
          saved(session, result.receipt);
          await refreshConfirmed(session, guard);
        } catch (error) {
          if (authorityLost(error)) await stop(session);
          if (sessions.has(session.id) && session.revision === revision) {
            session.phase = 'recovery';
            session.error = 'assistant_save_unknown';
            session.previousFailure = assistantFailureMessage(session.error);
          }
        }
      }
      if (!sessions.has(session.id))
        return context.json({ error: 'assistant_session_expired' }, 404);
      authorize(session.actorId, session.browserSessionId, session.householdId);
      if (session.task === task) session.task = undefined;
      if (session.revision === revision && !task.signal.aborted) nextMessage(session);
      return context.json(view(session));
    } finally {
      context.req.raw.signal.removeEventListener('abort', abort);
      if (session.task === task) session.task = undefined;
    }
  });
  routes.post(`${base}/:sessionId/selection`, async (context) => {
    const session = sessions.get(context.req.param('sessionId'));
    const body = await context.req.json().catch(() => null);
    if (
      !session?.selection ||
      body?.revision !== session.revision ||
      (body?.kind !== undefined
        ? body.kind !== session.selection.kind || body.id !== session.selection.id
        : session.selection.kind !== 'object' ||
          typeof body?.objectId !== 'string' ||
          body.objectId !== session.selection.objectId) ||
      (body?.draftVersion !== undefined && body.draftVersion !== session.selection.draftVersion) ||
      (body?.contentVersion !== undefined &&
        body.contentVersion !== session.selection.contentVersion) ||
      typeof body.displayed !== 'boolean'
    )
      return context.json({ error: 'assistant_turn_changed' }, 409);
    const current = await call(session, 'read_my_draft', {});
    if (
      current.version !== session.selection.draftVersion ||
      current.contentVersion !== session.selection.contentVersion
    ) {
      session.displayed?.(false);
      return context.json({ error: 'assistant_draft_changed' }, 409);
    }
    session.displayed?.(body.displayed);
    return context.json(view(session));
  });
  return {
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
        session.householdId !== match[1] ||
        session.actorId !== login.user.id ||
        session.browserSessionId !== login.session.id
      )
        return;
      const originalBinding = database
        .prepare(`SELECT id, revision FROM browser_binding
        WHERE sessionId = ? AND confirmed = 1 AND expiresAt > ?`)
        .get(login.session.id, now()) as { id: string; revision: number } | undefined;
      if (!originalBinding) return;
      const guard = () => {
        if (sessions.get(session.id) !== session) throw new MapError('forbidden', 403);
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
          authorize(session.actorId, session.browserSessionId, session.householdId);
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
          const end = loginDeadline(session.actorId, session.browserSessionId);
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
          Math.max(1, loginDeadline(session.actorId, session.browserSessionId) - now()),
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
        session.task ||
        session.queue.length ||
        session.pendingSave ||
        session.summaryTask ||
        session.voiceInputPending
      )
        throw new Error('evaluation_summary_not_idle');
      await onSummary?.(sessionId, new AbortController().signal);
      const conversation = [...session.conversation, ...history];
      const source = JSON.stringify({
        previousSummary: session.summary,
        conversation: conversation.slice(session.summaryOffset ?? 0),
        providerResults: session.input,
      });
      if (source.length > 240_000) throw new Error('evaluation_summary_source_too_large');
      session.conversation = conversation;
      const generation = session.contextGeneration ?? 0;
      await summarize(session);
      return {
        source,
        summary: session.summary,
        installed: (session.contextGeneration ?? 0) === generation + 1,
        retained: session.conversation.slice(session.summaryOffset),
        view: view(session),
      };
    },
    voiceInput: (sessionId: string, pending: boolean, text?: string) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      session.voiceInputPending = pending;
      session.lastVoiceInputAt = now();
      if (text !== undefined) {
        session.inputSerial = (session.inputSerial ?? 0) + 1;
        session.lastVoiceInputAt = now();
        if (withdrawsSave(text)) session.saveIntent = undefined;
      }
    },
    /** Private ephemeral context shared by text and every voice connection.
     * Never expose it in status responses or write it to the household. */
    conversation: (sessionId: string) => {
      const session = sessions.get(sessionId);
      return session ? providerConversation(session) : [];
    },
    prepareVoiceContext: async (sessionId: string, signal?: AbortSignal) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      const bytes = Buffer.byteLength(JSON.stringify(providerConversation(session)));
      if (!session.contextSummaryState && bytes / 3 >= voiceTokens * 0.89)
        await summarize(session, undefined, [], false, signal);
      if (signal?.aborted || sessions.get(sessionId) !== session) return;
      if (
        Buffer.byteLength(JSON.stringify(providerConversation(session))) / 3 >=
        voiceTokens * 0.89
      )
        session.contextSummaryState = 'failed';
      return view(session);
    },
    contextUsage: (sessionId: string, revision: number, source: string, ratio?: unknown) => {
      const session = sessions.get(sessionId);
      if (session && (session.contextRevision ?? 0) === revision) {
        if (ratio === undefined) session.capacity.beginVoice(source);
        else session.capacity.voice(source, ratio);
        if (!session.contextSummaryState && needsSummary(session))
          session.contextSummaryState = 'needed';
      }
    },
    transcript: (sessionId: string, role: 'user' | 'assistant', text: string) => {
      const session = sessions.get(sessionId);
      if (session) session.conversation.push({ role, text, partial: true });
    },
    // Interrupt current in-memory work synchronously. The normal HTTP cancel
    // route refreshes status; durable operations remain available for recovery.
    interrupt: (sessionId: string, revision?: number) => {
      const session = sessions.get(sessionId);
      if (
        session &&
        (revision === undefined || session.revision === revision) &&
        session.phase === 'working'
      )
        session.task?.abort();
    },
    /** Live never receives the accepted-text exception. */
    voiceAccess: (sessionId: string) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      const guard = () =>
        textWork.exit(() => {
          if (sessions.get(sessionId) !== session || revoked.has(sessionId))
            throw new MapError('forbidden', 403);
          authorize(session.actorId, session.browserSessionId, session.householdId);
          session.mcp.checkAccess();
          return loginDeadline(session.actorId, session.browserSessionId);
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
          session.mcp.checkTaskAccess();
        } catch {
          void stop(session);
        }
      }
      deliveries.revalidate();
      for (const [id, session] of deliveryOwners) {
        if (
          now() >= loginDeadline(session.actorId, session.browserSessionId) &&
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
        (session) => session.actorId === actorId && session.householdId === householdId,
      );
      for (const session of ending) {
        revoked.set(session.id, { actorId, householdId });
        session.summaryTask?.abort();
        setTimeout(
          () => revoked.delete(session.id),
          Math.max(1, session.mcp.expiresAt - now()),
        ).unref();
      }
      // Revocation never authorizes a fresh save. Complete only an immutable
      // operation that was registered under the earlier explicit save command.
      // SQLite serializes this with an already executing save using the same ID.
      const receipts: NonNullable<TextAssistantView['receipt']>[] = [];
      for (const session of ending) {
        if (session.pendingSave) {
          try {
            const checked = checkSaves(database, actorId, householdId, [
              session.pendingSave.operationId,
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
      await Promise.all([...sessions.values()].map((session) => stop(session, false)));
    },
  };
}
