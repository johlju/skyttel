import { randomUUID } from 'node:crypto';
import { assistantChangeSummary } from '../shared/assistant-change-summary.js';
import { conversationCommand } from '../shared/conversation-command.js';
import type {
  ConversationReply,
  PendingPartReference,
  TextAssistantView,
} from '../shared/text-assistant.js';
import { voiceTranscriptBoundaries } from '../shared/voice-transcript.js';
import { assistantFailureMessage } from './assistant-feedback.js';
import type { LiveSideband } from './live-provider.js';
import { type VoiceAnswer, voiceAnswerText, voiceCommentary } from './voice-commentary.js';
import { VoiceMessageRefusal, type VoiceMessageRefusalCode } from './voice-message-refusal.js';

type Anchor = { revision: number; draftVersion: number; contentVersion: number };
type Fragment = { role: 'user' | 'assistant'; text: string; startMs: number; endMs: number };
type Delegation = { id: string; offsetMs: number; afterInputMs?: number };
type EarlyDelegation = Delegation & {
  expiresAt: number;
  firstUtterance: boolean;
  precedingResponseId?: string;
  noticeTimer?: ReturnType<typeof setTimeout>;
};
type VoiceCompletionView = TextAssistantView & Pick<ConversationReply, 'failed'>;
type VoiceDispatch = {
  controller: AbortController;
  requestId?: string;
  revision?: number;
  draftAdvance?: { from: Anchor; to: Anchor; inputVersion: number };
};

function draftAnchor(view: TextAssistantView): Anchor {
  return {
    revision: view.revision,
    draftVersion: view.review.version,
    contentVersion: view.review.contentVersion,
  };
}

function sameDraftAnchor(left: Anchor, right: Anchor) {
  return (
    left.revision === right.revision &&
    left.draftVersion === right.draftVersion &&
    left.contentVersion === right.contentVersion
  );
}

const speechSettleMs = 2000;

/** One executor for delegated tasks and replies to pending server questions.
 * Only new user deltas can authorize a save; conversation context cannot. */
export function voiceWork({
  channel,
  confirmBrowserInput = false,
  requestNewConversation,
  initial,
  request,
  interrupt,
  update,
  failed,
  transcript,
  response,
  refusal,
  delivered,
  input,
  observe,
  allowed = () => true,
  now = () => Date.now(),
}: {
  allowed?: () => boolean;
  now?: () => number;
  channel: LiveSideband;
  confirmBrowserInput?: boolean;
  requestNewConversation?: () => void;
  initial: TextAssistantView;
  request: (
    action?: string,
    body?: unknown,
    signal?: AbortSignal,
    observation?: { requestId: string },
  ) => Promise<TextAssistantView>;
  interrupt: (revision?: number) => void;
  /** The conversation as the voice last saw it, and whether the voice has a task in progress. */
  update: (view: TextAssistantView, working: boolean) => void;
  failed: () => void;
  transcript?: (
    role: Fragment['role'],
    text: string,
    utteranceStart: boolean,
    eventId: string,
  ) => ((requestId?: string) => void) | undefined;
  response?: (value: import('../shared/voice-assistant.js').VoiceAssistantView['response']) => void;
  refusal?: (value: import('../shared/voice-assistant.js').VoiceAssistantView['refusal']) => void;
  delivered?: (value: { id: string; voiced: boolean }) => void;
  input?: (pending: boolean, text?: string) => void;
  observe?: (
    kind: 'voice_event' | 'voice_commentary' | 'backend_request' | 'backend_result',
    data: unknown,
  ) => void;
}) {
  let rendered = draftAnchor(initial);
  const transcriptBoundaries = voiceTranscriptBoundaries();
  let nextUserUtterance = false;
  let anchor: Anchor | undefined;
  let fragments: Fragment[] = [];
  let pending: (Fragment & {
    inputVersion: number;
    receivedAt: number;
    anchor: Anchor;
    predecessor?: VoiceDispatch;
    answerTo?: PendingPartReference[];
    startTranscriptUtterance?: (requestId?: string) => void;
  })[] = [];
  let generation = 0;
  let inputVersion = 0;
  let confirmedInput = 0;
  let consumedInputThroughMs = -1;
  let precedingResponse: { id: string; acknowledged: boolean } | undefined;
  let interruptedThrough = -1;
  let awaitingCorrectionAfterRevision: number | undefined;
  let lastInputAt = 0;
  let microphoneActive = false;
  let collecting: { delegation: Delegation | null } | undefined;
  let awaitingInterrupt: EarlyDelegation | undefined;
  let stopped = false;
  let questionRevision = initial.revision;
  let questionPending = initial.phase === 'ready' && Boolean(initial.questionPending);
  const questionKey = (view: TextAssistantView) =>
    view.pendingParts
      ?.filter((part) => part.status === 'waiting')
      .map((part) => `${part.id}:${part.revision}`)
      .join('|');
  let questions = questionKey(initial);
  let waitingParts = initial.pendingParts
    ?.filter((part) => part.status === 'waiting')
    .map(({ id, revision }) => ({ id, revision }));
  let questionInputVersion = 0;
  let automaticReplyConsumed = false;
  let dispatching: VoiceDispatch | undefined;
  let canceling: Promise<{ revision: number; view: TextAssistantView } | undefined> =
    Promise.resolve(undefined);
  let cutoffCancellation = canceling;
  let canceledThroughMs = -1;
  const inFlight = new Map<number, number>();
  const events = new Set<string>();
  const delegations = new Set<string>();
  const answered = new Set<number>([initial.revision]);
  const answeredReplies = new Set((initial.completedReplies ?? []).map((reply) => reply.id));
  const commentary = voiceCommentary(channel, (event) => observe?.('voice_event', event), now);

  function rememberQuestion(view: TextAssistantView) {
    if (view.revision < questionRevision) return;
    const key = questionKey(view);
    if (
      view.questionPending &&
      (key === undefined ? !questionPending || view.revision > questionRevision : key !== questions)
    )
      questionInputVersion = inputVersion;
    questions = key;
    waitingParts = view.pendingParts
      ?.filter((part) => part.status === 'waiting')
      .map(({ id, revision }) => ({ id, revision }));
    questionRevision = view.revision;
    questionPending = view.phase === 'ready' && Boolean(view.questionPending);
  }
  function collectReply() {
    if (
      !stopped &&
      allowed() &&
      questionPending &&
      inputVersion > questionInputVersion &&
      pending.length &&
      !collecting &&
      !inFlight.size
    )
      void collect(null);
  }

  function clearAwaitingInterrupt() {
    clearTimeout(awaitingInterrupt?.noticeTimer);
    awaitingInterrupt = undefined;
  }

  function hasSpeechAwaitingInterrupt(delegation: EarlyDelegation) {
    return pending.some(
      (item) =>
        item.receivedAt < delegation.expiresAt &&
        (!confirmBrowserInput || item.inputVersion > confirmedInput) &&
        item.startMs <= delegation.offsetMs &&
        item.text.trim(),
    );
  }

  function settleEarlyDelegation() {
    const candidate = awaitingInterrupt;
    if (!candidate) return;
    // A later delegation can belong to the previous turn. Its new media
    // interval must follow consumed speech and the browser must have
    // acknowledged playback of the response that preceded this delegation.
    const followsPlayback =
      precedingResponse?.acknowledged &&
      precedingResponse.id === candidate.precedingResponseId &&
      !inFlight.size &&
      !questionPending &&
      pending.every((item) => item.startMs > consumedInputThroughMs);
    if (
      (candidate.firstUtterance || followsPlayback) &&
      !collecting &&
      confirmedInput === inputVersion &&
      pending.some(
        (item) =>
          item.receivedAt < candidate.expiresAt &&
          item.startMs <= candidate.offsetMs &&
          candidate.offsetMs <= item.endMs &&
          item.text.trim(),
      )
    ) {
      clearAwaitingInterrupt();
      void collect({
        ...candidate,
        afterInputMs: followsPlayback ? consumedInputThroughMs : undefined,
      });
      return;
    }
    if (microphoneActive || now() < candidate.expiresAt || hasSpeechAwaitingInterrupt(candidate))
      return;
    clearAwaitingInterrupt();
    if (!collecting && !automaticReplyConsumed) requestFreshSpeech(candidate.id);
  }

  function cancel(revisionIfIdle?: number) {
    commentary.cancel();
    refusal?.(undefined);
    const hadWork = (inFlight.get(generation) ?? 0) > 0;
    const cancellation = ++generation;
    collecting = undefined;
    precedingResponse = undefined;
    awaitingCorrectionAfterRevision = undefined;
    clearAwaitingInterrupt();
    const revision = dispatching?.revision ?? (hadWork ? rendered.revision : revisionIfIdle);
    dispatching?.controller.abort();
    dispatching = undefined;
    if (revision === undefined) return;
    // A spoken task may already have advanced from the queue, beyond its
    // last observed revision. A stop covers the conversation's current work.
    interrupt();
    canceling = request('cancel', {
      revision,
      all: true,
      contextRevision: initial.contextRevision ?? 0,
    })
      .then((view) => {
        if (!stopped && generation === cancellation && !dispatching) update(view, false);
        return { revision, view };
      })
      .catch(() => undefined);
  }
  function notices(view: VoiceCompletionView): Exclude<VoiceAnswer, string> {
    const failure =
      view.error || view.failed
        ? (view.reply ?? (view.error ? assistantFailureMessage(view.error) : ''))
        : '';
    return [
      { kind: 'notice' as const, text: view.requiredNotice ?? '' },
      {
        kind: 'notice' as const,
        text: failure !== view.requiredNotice ? failure : '',
      },
    ].filter(({ text }) => text);
  }
  function resultText(view: VoiceCompletionView) {
    return [view.result?.message, ...assistantChangeSummary(view.result?.changes ?? [])]
      .filter(Boolean)
      .join('\n');
  }
  function pendingQuestion(view: VoiceCompletionView) {
    return view.questionPending
      ? (view.modelReply ?? (view.newQuestions ?? view.questions)?.join('\n'))
      : undefined;
  }
  function receiptParts(view: VoiceCompletionView): Exclude<VoiceAnswer, string> {
    return [
      { kind: 'result' as const, text: 'Sparat.' },
      { kind: 'result' as const, text: resultText(view) },
      ...notices(view),
      {
        kind: view.questionPending ? ('question' as const) : ('conversation' as const),
        text: pendingQuestion(view) ?? view.modelReply ?? '',
      },
    ].filter(({ text }) => text);
  }
  function append(
    delegationId: string | null,
    answer: VoiceAnswer,
    view?: VoiceCompletionView,
    settled?: (voiced: boolean) => void,
    publishResponse = true,
  ) {
    if (!allowed()) return;
    const content = voiceAnswerText(answer);
    observe?.('voice_commentary', { delegationId, content, revision: view?.revision });
    // The acknowledgement of this command is transport receipt, never proof
    // that a person heard it. No transcript/audio is logged or persisted here.
    const task = generation;
    const acceptedInput = inputVersion;
    if (view) answered.add(view.revision);
    function publish() {
      if (!view || !publishResponse) return;
      const id = `${view.id}:${view.revision}`;
      const conversationalText =
        typeof answer !== 'string' &&
        answer.every(({ kind }) => kind === 'conversation' || kind === 'status') &&
        view.phase === 'ready' &&
        !view.questionPending &&
        !view.receipt &&
        !view.saveCheck &&
        !view.requiredNotice &&
        !view.error &&
        !view.failed
          ? answer.find(({ kind }) => kind === 'conversation')?.text
          : undefined;
      precedingResponse =
        view.phase === 'ready' && !view.questionPending && !view.error && !view.failed
          ? { id, acknowledged: false }
          : undefined;
      response?.({
        id,
        revision: view.revision,
        text:
          typeof answer === 'string'
            ? answer
            : answer
                .map(({ text }) => text)
                .filter(Boolean)
                .join('\n'),
        questionPending: Boolean(view.questionPending),
        receiptOperationId: view.receipt?.operationId,
        conversationalText,
      });
    }
    commentary.send(
      delegationId,
      answer,
      () =>
        !stopped &&
        allowed() &&
        generation === task &&
        (Boolean(view?.receipt) || inputVersion === acceptedInput),
      view && !view.receipt && view.phase === 'ready' && !view.saveCheck
        ? 'unconfirmed'
        : undefined,
      settled,
      view && confirmBrowserInput
        ? { id: `${view.id}:${view.revision}`, prepare: publish }
        : undefined,
    );
    if (!confirmBrowserInput) publish();
  }
  function completion(view: VoiceCompletionView): VoiceAnswer {
    if (view.saveCheck) return view.saveCheck.reply + (view.receipt ? ' Sparat.' : '');
    if (view.receipt) {
      const parts = receiptParts(view);
      return parts.length > 1 ? parts : 'Sparat.';
    }
    const question = pendingQuestion(view);
    if (question)
      return [
        ...notices(view),
        { kind: 'result', text: resultText(view) },
        {
          kind: 'status',
          text: view.displayedSelection ? 'Markeringen är bekräftad i kartan.' : '',
        },
        { kind: 'question', text: question },
      ];
    if (view.phase === 'recovery')
      return 'Det är oklart om utkastet sparades. Skyttel kontrollerar det.';
    if (view.error && !view.result && !view.requiredNotice && !view.modelReply)
      return view.reply ?? assistantFailureMessage(view.error);
    if (view.error || view.failed)
      return [
        { kind: 'result', text: resultText(view) },
        ...notices(view),
        { kind: 'conversation', text: view.modelReply ?? '' },
      ];
    const count =
      view.review.changes.length +
      (view.review.relationships?.length ?? 0) +
      (view.review.objectTypes?.length ?? 0) +
      (view.review.relationshipTypes?.length ?? 0);
    const verified = [
      resultText(view),
      view.displayedSelection
        ? `${view.displayedItem?.kind === 'relationship' ? 'Sambandet' : 'Objektet'} är markerat.`
        : undefined,
    ].filter(Boolean);
    return [
      ...notices(view),
      {
        kind: verified.length ? 'result' : 'status',
        text: verified.length
          ? verified.join('\n')
          : `Utkast: ${count} ${count === 1 ? 'osparat förslag' : 'osparade förslag'}.`,
      },
      { kind: 'conversation', text: view.modelReply ?? '' },
    ];
  }
  function requestFreshSpeech(id: string) {
    append(
      id,
      'Be om ett nytt tydligt uppdrag. En paus eller tidigare repliker är inget nytt sparbesked.',
    );
  }
  async function execute(
    id: string | null,
    text: string,
    expected: Anchor,
    context: string,
    task: number,
    answerTo?: PendingPartReference[],
    continuedVoiceRead?: boolean,
    markRequest?: (id: string) => void,
  ) {
    const acceptedInput = inputVersion;
    let requestId: string | undefined;
    let dispatch: VoiceDispatch | undefined;
    const release = (view: TextAssistantView) => {
      if (dispatching !== dispatch) return false;
      dispatching = undefined;
      rendered.revision = Math.max(rendered.revision, view.revision);
      update(view, false);
      return true;
    };
    let resultObserved = false;
    let resultStatus: 'failed' | 'canceled' | 'incomplete' = 'incomplete';
    const result = (
      status: 'completed' | 'failed' | 'canceled' | 'incomplete',
      view?: TextAssistantView,
      refusal?: VoiceMessageRefusalCode,
    ) => {
      if (resultObserved) return;
      resultObserved = true;
      observe?.('backend_result', {
        delegationId: id,
        requestId,
        status,
        ...(view ? { view } : {}),
        ...(status !== 'completed'
          ? { error: status === 'failed' ? (refusal ?? 'backend_failed') : `task_${status}` }
          : {}),
      });
    };
    const current = () => !stopped && allowed() && generation === task;
    const recover = async (operation: 'recover' | 'retry', body: unknown, signal?: AbortSignal) => {
      const recoveryRequestId = randomUUID();
      observe?.('backend_request', {
        delegationId: id,
        requestId: recoveryRequestId,
        operation,
        text,
        context,
      });
      let status: 'completed' | 'failed' | 'canceled' = 'failed';
      let observedView: TextAssistantView | undefined;
      try {
        observedView = await request(operation, body, signal, { requestId: recoveryRequestId });
        status =
          stopped || generation !== task || signal?.aborted
            ? 'canceled'
            : observedView.error
              ? 'failed'
              : 'completed';
        return observedView;
      } catch (error) {
        status = stopped || generation !== task || signal?.aborted ? 'canceled' : 'failed';
        throw error;
      } finally {
        observe?.('backend_result', {
          delegationId: id,
          requestId: recoveryRequestId,
          operation,
          status,
          ...(observedView ? { view: observedView } : {}),
          ...(status !== 'completed'
            ? { error: status === 'failed' ? 'backend_failed' : 'task_canceled' }
            : {}),
        });
      }
    };
    inFlight.set(task, (inFlight.get(task) ?? 0) + 1);
    try {
      const canceled = await canceling;
      if (!current()) return;
      // Our own cancellation advances only the conversation revision. Preserve
      // the original displayed draft/content versions; a web edit still fails.
      if (
        canceled &&
        (expected.revision === canceled.revision || expected.revision === canceled.revision - 1)
      )
        expected = { ...expected, revision: canceled.view.revision };
      let view = await request();
      if (!current()) return;
      if (
        continuedVoiceRead &&
        (view.phase !== 'ready' || !sameDraftAnchor(expected, draftAnchor(view)))
      )
        throw new VoiceMessageRefusal('assistant_draft_changed');
      if (answerTo) {
        if (
          (view.contextRevision ?? 0) !== (initial.contextRevision ?? 0) ||
          view.review.version !== expected.draftVersion ||
          view.review.contentVersion !== expected.contentVersion ||
          answerTo.some(
            (ref) =>
              !view.pendingParts?.some(
                (part) =>
                  part.id === ref.id && part.revision === ref.revision && part.status === 'waiting',
              ),
          )
        )
          throw new VoiceMessageRefusal('assistant_pending_part_changed');
        expected = { ...expected, revision: view.revision };
      }
      if (view.phase === 'recovery') {
        resultObserved = true;
        view = await recover('recover', {});
        if (!current()) return;
        const pending = view.operations.filter((operation) => operation.status === 'pending');
        if (pending.length === 1 && /^slutför samma sparförsök[.!]?$/iu.test(text.trim())) {
          const controller = new AbortController();
          dispatch = { controller };
          dispatching = dispatch;
          view = await recover(
            'retry',
            { operationId: pending[0].operationId, revision: view.revision },
            controller.signal,
          );
        }
      } else {
        const controller = new AbortController();
        const from = draftAnchor(view);
        requestId = randomUUID();
        try {
          markRequest?.(requestId);
        } catch {
          // Transcript storage can fail independently of the authorized voice request.
        }
        dispatch = {
          controller,
          requestId,
          revision: view.phase === 'working' ? view.revision : view.revision + 1,
        };
        dispatching = dispatch;
        observe?.('backend_request', { delegationId: id, requestId, text, context });
        // A legacy peer can renew only its existing context. Modern peers
        // hand a plain reset to the browser before dispatching a message.
        const command = conversationCommand(text);
        const legacyReset = command?.reset && !command.discard;
        view = await request(
          legacyReset ? 'new' : 'messages',
          {
            ...expected,
            revision: view.phase === 'working' ? view.revision : expected.revision,
            requestId,
            text,
            voiceContext: context,
            answerTo,
            continuedVoiceRead,
          },
          controller.signal,
          legacyReset ? { requestId } : undefined,
        );
        // A spoken reset retires this executor. Its new revision must not be
        // mistaken for stale work and cancelled after the reset completes.
        if ((view.contextRevision ?? 0) > (initial.contextRevision ?? 0)) return;
        if (!current()) {
          interrupt(view.revision);
          await request('cancel', {
            revision: view.revision,
            contextRevision: initial.contextRevision ?? 0,
          }).catch(() => {});
          return;
        }
        dispatch.revision = view.revision;
        while (current() && (view.taskStatus === 'queued' || view.taskStatus === 'working')) {
          if (dispatching === dispatch) update(view, true);
          await new Promise((resolve) => setTimeout(resolve, 50));
          view = await request(`messages/${requestId}`);
        }
        if (view.taskStatus === 'canceled') {
          resultStatus = 'canceled';
          // The task was stopped or replaced in the conversation, outside the
          // voice. The voice no longer works with it and says nothing about it.
          if (current()) release(view);
          return;
        }
        if (
          dispatching === dispatch &&
          view.taskStatus === 'completed' &&
          view.phase === 'ready' &&
          !view.error &&
          !view.receipt &&
          view.result?.kind === 'draft' &&
          view.result.changes?.length &&
          view.review.contentVersion === from.contentVersion &&
          view.review.version === from.draftVersion + 1
        ) {
          dispatch.draftAdvance = { from, to: draftAnchor(view), inputVersion };
        }
      }
      if (!current()) return;
      rememberQuestion(view);
      result(view.error ? 'failed' : 'completed', view);
      while (
        current() &&
        inputVersion === acceptedInput &&
        (microphoneActive || now() - lastInputAt < speechSettleMs)
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (!current()) return;
      const released = release(view);
      if (!released || inputVersion !== acceptedInput || pending.length) {
        // New speech supersedes the answer, but cannot undo a verified save.
        // Keep its receipt tied to this task without replacing a later response.
        if (view.receipt)
          append(
            id,
            'Sparat.',
            {
              ...view,
              saveCheck: undefined,
              modelReply: undefined,
              reply: undefined,
              questionPending: false,
            },
            undefined,
            released,
          );
        return;
      }
      append(id, completion(view), view);
    } catch (error) {
      if (!current()) {
        resultStatus = 'canceled';
        return;
      }
      resultStatus = 'failed';
      if (error instanceof VoiceMessageRefusal) {
        result('failed', undefined, error.code);
        if (dispatch && dispatching === dispatch) dispatching = undefined;
        if (!current() || inputVersion !== acceptedInput) return;
        const text = error.userMessage();
        refusal?.({ id: requestId ?? randomUUID(), text });
        append(id, text);
        const view = await request().catch(() => undefined);
        if (!current() || inputVersion !== acceptedInput) return;
        if (view && !dispatching) {
          rememberQuestion(view);
          update(view, false);
        }
        return;
      }
      cancel();
      const recoveryGeneration = generation;
      try {
        const view = await request();
        if (stopped || generation !== recoveryGeneration) return;
        update(view, false);
        append(
          id,
          view.phase === 'recovery'
            ? completion(view)
            : 'Underlaget har ändrats eller uppdraget kunde inte slutföras. Inget nytt sparande är bekräftat. Ge ett nytt tydligt uppdrag utifrån det aktuella utkastet.',
        );
      } catch {
        if (!stopped && allowed() && generation === recoveryGeneration) failed();
      }
    } finally {
      if (dispatch && dispatching === dispatch) dispatching = undefined;
      if (!resultObserved && (requestId || resultStatus === 'failed'))
        result(
          resultStatus === 'incomplete' && (stopped || generation !== task)
            ? 'canceled'
            : resultStatus,
        );
      const remaining = (inFlight.get(task) ?? 1) - 1;
      if (remaining) inFlight.set(task, remaining);
      else inFlight.delete(task);
      if (current()) collectReply();
    }
  }
  function fragment(
    role: Fragment['role'],
    event: { event_id: string; delta: string; start_ms: number; end_ms: number },
  ) {
    if (stopped || !allowed()) return;
    if (!event || typeof event.event_id !== 'string' || !/^[\w-]{1,200}$/.test(event.event_id)) {
      failed();
      return;
    }
    if (events.has(event.event_id)) return;
    if (
      events.size >= 2000 ||
      typeof event.delta !== 'string' ||
      !Number.isFinite(event.start_ms) ||
      event.start_ms < 0 ||
      !Number.isFinite(event.end_ms) ||
      event.end_ms < event.start_ms
    ) {
      failed();
      return;
    }
    events.add(event.event_id);
    observe?.('voice_event', {
      type: role === 'user' ? 'session.input_transcript.delta' : 'session.output_transcript.delta',
      role,
      event_id: event.event_id,
      delta: event.delta,
      start_ms: event.start_ms,
      end_ms: event.end_ms,
    });
    if (role === 'user' && event.end_ms <= interruptedThrough) return;
    let startTranscriptUtterance: ((requestId?: string) => void) | undefined;
    if (event.delta) {
      if (role === 'assistant') commentary.output();
      const utteranceStart = transcriptBoundaries.append(role, event.start_ms, event.end_ms, {
        newUtterance: role === 'user' && nextUserUtterance,
      });
      startTranscriptUtterance = transcript?.(role, event.delta, utteranceStart, event.event_id);
      if (role === 'user') nextUserUtterance = false;
    }
    if (role === 'user') {
      inputVersion++;
      if (event.delta.trim()) {
        refusal?.(undefined);
        commentary.userSpeech();
      }
      lastInputAt = now();
      input?.(true, event.delta);
      anchor ??= { ...rendered };
      pending.push({
        role,
        text: event.delta,
        startMs: event.start_ms,
        endMs: event.end_ms,
        inputVersion,
        receivedAt: lastInputAt,
        anchor: { ...rendered },
        predecessor: dispatching,
        answerTo: waitingParts,
        startTranscriptUtterance,
      });
      if (pending.map((item) => item.text).join('').length > 4000) {
        failed();
        return;
      }
    }
    fragments.push({ role, text: event.delta, startMs: event.start_ms, endMs: event.end_ms });
    while (fragments.length > 40 || JSON.stringify(fragments).length > 8000) fragments.shift();
    if (role === 'user') collectReply();
  }
  async function collect(delegation: Delegation | null) {
    const collection = { delegation };
    collecting = collection;
    const task = generation;
    const awaitingTranscriptUntil = delegation && !anchor ? now() + speechSettleMs : 0;
    const current = () => !stopped && allowed() && generation === task && collecting === collection;
    // A delegation offset is not a completed utterance. Accumulate late deltas
    // before sending a task, including corrections made while still speaking.
    // Further delegations during collection share this input, consumed once.
    // A poll acknowledging this input was sent after it reached Skyttel. The
    // browser withholds that acknowledgement while its interrupt is in flight.
    // A delegation received without any input gets the same settling window.
    while (
      current() &&
      (microphoneActive ||
        now() < Math.max(lastInputAt + speechSettleMs, awaitingTranscriptUntil) ||
        (confirmBrowserInput && anchor && confirmedInput < inputVersion))
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    if (!current()) return;
    collecting = undefined;
    // A typed answer or another task may have resolved the question while
    // the person was speaking. Unsolicited tasks still require delegation.
    if (!delegation && (!questionPending || inFlight.size)) return;
    // An interruption can remove all the input that preceded this delegation.
    // Require some retained speech at its offset before collecting the suffix.
    if (
      delegation &&
      (!pending.some((item) => item.startMs <= delegation.offsetMs && item.text.trim()) ||
        pending.some((item) => item.startMs <= (delegation.afterInputMs ?? -1)))
    ) {
      collectReply();
      return;
    }
    // Speech preceding the question remains context, never authority for its
    // automatic reply. A normal delegation retains its original input batch.
    const selected = !delegation
      ? pending.filter((item) => item.inputVersion > questionInputVersion)
      : pending;
    const text = selected.map((item) => item.text).join('');
    let expected = delegation ? anchor : selected[0]?.anchor;
    const answerTo = selected[0]?.answerTo?.length ? selected[0].answerTo : undefined;
    const advance = selected[0]?.predecessor?.draftAdvance;
    // A continued utterance can follow one checked proposal of its own voice.
    // Its first fragment must precede that commit and fresh audio must follow it.
    // A browser poll must have confirmed the new view before collection ends.
    const continuedVoiceRead = Boolean(
      delegation &&
        !answerTo &&
        expected &&
        advance &&
        advance.from.contentVersion === expected.contentVersion &&
        advance.from.draftVersion === expected.draftVersion &&
        (expected.revision === advance.from.revision ||
          expected.revision === advance.to.revision) &&
        sameDraftAnchor(rendered, advance.to) &&
        selected.some((part) => part.inputVersion > advance.inputVersion && part.text.trim()),
    );
    if (continuedVoiceRead && advance) expected = advance.to;
    const id = delegation?.id ?? null;
    pending = [];
    anchor = undefined;
    input?.(false);
    if (text.trim()) {
      nextUserUtterance = true;
      for (const item of selected)
        consumedInputThroughMs = Math.max(consumedInputThroughMs, item.endMs);
      precedingResponse = undefined;
      awaitingCorrectionAfterRevision = undefined;
      clearAwaitingInterrupt();
    }
    if (
      selected.some(
        (fragment) => JSON.stringify(fragment.answerTo) !== JSON.stringify(selected[0]?.answerTo),
      )
    ) {
      if (text.trim()) append(id, assistantFailureMessage('assistant_pending_part_changed'));
      return;
    }
    if (text.trim() && expected) {
      const command = conversationCommand(text);
      if (requestNewConversation && command?.reset && !command.discard) {
        requestNewConversation();
        return;
      }
      automaticReplyConsumed = id === null;
      commentary.working(id);
      void execute(
        id,
        text,
        expected,
        JSON.stringify(fragments),
        task,
        answerTo,
        continuedVoiceRead || undefined,
        selected.find((item) => item.startTranscriptUtterance)?.startTranscriptUtterance,
      );
    }
  }
  channel.on('session.input_transcript.delta', (event) => fragment('user', event));
  channel.on('session.output_transcript.delta', (event) => fragment('assistant', event));
  channel.on('session.delegation.created', (event) => {
    if (stopped || !allowed()) return;
    if (
      !event?.delegation ||
      typeof event.delegation.id !== 'string' ||
      !/^[\w-]{1,200}$/.test(event.delegation.id) ||
      !Number.isFinite(event.offset_ms)
    ) {
      failed();
      return;
    }
    if (event.delegation.target !== 'client' || delegations.has(event.delegation.id)) return;
    if (delegations.size >= 500) {
      failed();
      return;
    }
    delegations.add(event.delegation.id);
    observe?.('voice_event', {
      type: 'session.delegation.created',
      event_id: event.event_id,
      offset_ms: event.offset_ms,
      delegation: {
        id: event.delegation.id,
        target: event.delegation.target,
        type: event.delegation.type,
      },
    });
    if (event.offset_ms <= interruptedThrough) return;
    const delegation = { id: event.delegation.id, offsetMs: event.offset_ms };
    const activeDelegation = collecting?.delegation;
    if (activeDelegation && delegation.offsetMs < activeDelegation.offsetMs) return;
    // The sideband can delegate the correction before sending its first delta.
    if (!pending.length) {
      if (awaitingCorrectionAfterRevision !== undefined) {
        void collect(delegation);
        return;
      }
      // A browser interrupt may still be in transit. An empty delegation
      // cannot block a context handoff while it waits for evidence of speech.
      const receivedAt = now();
      if (
        !awaitingInterrupt ||
        awaitingInterrupt.expiresAt <= receivedAt ||
        delegation.offsetMs >= awaitingInterrupt.offsetMs
      ) {
        clearAwaitingInterrupt();
        const candidate = {
          ...delegation,
          expiresAt: receivedAt + speechSettleMs,
          firstUtterance: inputVersion === 0 && interruptedThrough < 0,
          precedingResponseId: precedingResponse?.id,
        };
        awaitingInterrupt = candidate;
        if (confirmBrowserInput && !automaticReplyConsumed) {
          awaitingInterrupt.noticeTimer = setTimeout(settleEarlyDelegation, speechSettleMs);
          awaitingInterrupt.noticeTimer.unref();
        }
      }
      if (confirmBrowserInput) return;
    }
    const selected = pending.filter((item) => item.startMs <= event.offset_ms);
    if (!anchor || !selected.some((item) => item.text.trim())) {
      // Live can delegate after the application has already forwarded a reply.
      // Without fresh input this is neither a second task nor a new save request.
      if (automaticReplyConsumed && !selected.length) return;
      pending = pending.filter((item) => !selected.includes(item));
      if (!pending.length) anchor = undefined;
      input?.(pending.length > 0 || microphoneActive);
      requestFreshSpeech(event.delegation.id);
      return;
    }
    void collect(delegation);
  });
  function retire(resetRequestId?: string) {
    commentary.close();
    refusal?.(undefined);
    stopped = true;
    input?.(false);
    generation++;
    collecting = undefined;
    clearAwaitingInterrupt();
    // The validated reset owns retirement of this executor. Keep only its
    // own dispatch alive, and reachable by a later Stop or newer reset.
    if (!resetRequestId || dispatching?.requestId !== resetRequestId) {
      dispatching?.controller.abort();
      dispatching = undefined;
    }
    fragments = [];
    pending = [];
    anchor = undefined;
  }
  return {
    confirmInput(version: unknown, playedResponseId?: unknown) {
      if (!confirmBrowserInput) return undefined;
      if (precedingResponse && playedResponseId === precedingResponse.id)
        precedingResponse.acknowledged = true;
      commentary.played(playedResponseId);
      if (typeof version === 'number' && Number.isSafeInteger(version) && version <= inputVersion) {
        confirmedInput = Math.max(confirmedInput, version);
        settleEarlyDelegation();
      }
      return inputVersion;
    },
    async interruptSpeech(interruptedThroughMs?: number) {
      if (stopped || !allowed()) throw new Error('voice_session_expired');
      if (interruptedThroughMs !== undefined && interruptedThroughMs <= interruptedThrough) {
        if (interruptedThroughMs > canceledThroughMs && !(await cutoffCancellation))
          throw new Error('voice_interruption_failed');
        return request();
      }
      // Input can reach the sideband before the browser's interrupt request.
      // Preserve fragments and a delegation for a correction already underway.
      let delegation = collecting?.delegation;
      if (interruptedThroughMs !== undefined) interruptedThrough = interruptedThroughMs;
      pending = pending.filter((item) => item.endMs > interruptedThrough);
      const correction = pending.find(({ text }) => text.length > 0);
      transcriptBoundaries.reset({ preserveUser: correction !== undefined });
      anchor = pending[0]?.anchor;
      if (
        interruptedThroughMs !== undefined &&
        awaitingInterrupt &&
        (awaitingInterrupt.expiresAt > now() || hasSpeechAwaitingInterrupt(awaitingInterrupt)) &&
        (!delegation || awaitingInterrupt.offsetMs > delegation.offsetMs)
      )
        delegation = awaitingInterrupt;
      response?.(undefined);
      cancel(rendered.revision);
      if (interruptedThroughMs !== undefined) {
        cutoffCancellation = canceling;
        awaitingCorrectionAfterRevision = rendered.revision;
      }
      channel.send({
        type: 'session.instructions.append',
        delegation_id: null,
        content:
          'Stop speaking immediately. Listen to the correction and handle it normally in Swedish.',
      });
      if (interruptedThroughMs !== undefined) {
        try {
          correction?.startTranscriptUtterance?.();
        } catch {
          // Keep the cancellation and speech collection independent of the display write.
        }
      }
      if (delegation && delegation.offsetMs > interruptedThrough) void collect(delegation);
      else collectReply();
      const cancellation = canceling;
      const canceled = await cancellation;
      if (canceling !== cancellation) return request();
      if (!canceled) throw new Error('voice_interruption_failed');
      if (interruptedThroughMs !== undefined)
        canceledThroughMs = Math.max(canceledThroughMs, interruptedThroughMs);
      answered.add(canceled.view.revision);
      rendered.revision = Math.max(rendered.revision, canceled.view.revision);
      if (
        interruptedThroughMs === interruptedThrough &&
        awaitingCorrectionAfterRevision !== undefined
      )
        awaitingCorrectionAfterRevision = rendered.revision;
      return canceled.view;
    },
    speaker(active: boolean) {
      if (!stopped) commentary.speaker(active);
    },
    activity(active: boolean) {
      if (stopped || (!active && !microphoneActive)) return;
      microphoneActive = active;
      lastInputAt = now();
      input?.(active || pending.length > 0);
    },
    // Starting over owns cancellation of the conversation. Retiring its old
    // voice must invalidate late replies without sending a second cancel.
    retire,
    readyForSummary: () =>
      !microphoneActive &&
      dispatching === undefined &&
      inFlight.size === 0 &&
      !collecting &&
      pending.length === 0 &&
      !commentary.pending(),
    /** Consume each typed FIFO completion once, including while the next task works. */
    answer(view: TextAssistantView, microphoneOn = true) {
      if (stopped || !allowed()) return;
      rememberQuestion(view);
      collectReply();
      for (const reply of view.completedReplies ?? []) {
        if (answeredReplies.has(reply.id)) continue;
        if (
          awaitingCorrectionAfterRevision !== undefined &&
          reply.source === 'text' &&
          reply.revision !== undefined &&
          reply.revision > awaitingCorrectionAfterRevision
        )
          awaitingCorrectionAfterRevision = undefined;
        if (reply.saveCheck && reply.revision !== undefined && answered.has(reply.revision)) {
          answeredReplies.add(reply.id);
          delivered?.({ id: reply.id, voiced: true });
          continue;
        }
        // A reset retires the spoken executor before its queued discard can
        // finish. Its replacement delivers that outcome, including after OFF.
        const resetReply = reply.resetContextRevision !== undefined;
        const spokenExecutorDelivered = reply.source === 'voice' && !resetReply;
        if (
          spokenExecutorDelivered ||
          (!microphoneOn && !(resetReply && reply.source === 'voice'))
        ) {
          answeredReplies.add(reply.id);
          delivered?.({ id: reply.id, voiced: spokenExecutorDelivered });
          if (reply.revision !== undefined) answered.add(reply.revision);
          continue;
        }
        if (dispatching) continue;
        answeredReplies.add(reply.id);
        const completed: VoiceCompletionView = {
          ...view,
          phase: 'ready',
          revision: reply.revision ?? view.revision,
          modelReply: reply.text || undefined,
          reply: reply.reply,
          requiredNotice: reply.requiredNotice,
          receipt: reply.receipt,
          result: reply.result,
          saveCheck: reply.saveCheck,
          questionPending: reply.questionPending,
          questions: reply.questions,
          newQuestions: reply.newQuestions,
          failed: reply.failed,
          error: undefined,
          displayedSelection: undefined,
          displayedItem: undefined,
        };
        // Keep the complete reply and source boundary through silent assembly.
        const content: VoiceAnswer =
          reply.receipt ||
          reply.questionPending ||
          reply.saveCheck ||
          reply.requiredNotice ||
          reply.result ||
          reply.failed
            ? completion(completed)
            : [
                { kind: 'result', text: reply.reply ?? '' },
                { kind: 'conversation', text: reply.text },
              ];
        const hasContent = Boolean(voiceAnswerText(content));
        if (hasContent)
          append(null, content, completed, (voiced) => delivered?.({ id: reply.id, voiced }));
        else delivered?.({ id: reply.id, voiced: false });
      }
      if (!microphoneOn) {
        if (view.phase !== 'working') answered.add(view.revision);
        return;
      }
      if (dispatching || answered.has(view.revision) || view.phase !== 'ready') return;
      if (!view.questionPending && !view.receipt) return;
      append(null, completion(view), view);
    },
    rendered(value: Anchor) {
      if (
        value.revision >= rendered.revision &&
        value.contentVersion >= rendered.contentVersion &&
        (value.contentVersion > rendered.contentVersion ||
          value.draftVersion >= rendered.draftVersion)
      )
        rendered = { ...value };
    },
    /** The conversation has started over. Its own work is already stopped, and nothing said before is passed on. */
    reset(view: TextAssistantView) {
      if (!stopped) retire();
      answeredReplies.clear();
      answered.add(view.revision);
      rendered = {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
      };
    },
    stop() {
      commentary.close();
      stopped = true;
      input?.(false);
      cancel();
      fragments = [];
      pending = [];
      anchor = undefined;
      return canceling;
    },
  };
}
