import { randomUUID } from 'node:crypto';
import type { TextAssistantView } from '../shared/text-assistant.js';
import { assistantFailureMessage } from './assistant-feedback.js';
import type { LiveSideband } from './live-provider.js';
import { type VoiceAnswer, voiceAnswerText, voiceCommentary } from './voice-commentary.js';

type Anchor = { revision: number; draftVersion: number; contentVersion: number };
type Fragment = { role: 'user' | 'assistant'; text: string; startMs: number; endMs: number };

/** One executor for delegated tasks and replies to pending server questions.
 * Only new user deltas can authorize a save; conversation context cannot. */
export function voiceWork({
  channel,
  initial,
  request,
  interrupt,
  update,
  failed,
  transcript,
  response,
  delivered,
  input,
  observe,
}: {
  channel: LiveSideband;
  initial: TextAssistantView;
  request: (action?: string, body?: unknown, signal?: AbortSignal) => Promise<TextAssistantView>;
  interrupt: (revision?: number) => void;
  /** The conversation as the voice last saw it, and whether the voice has a task in progress. */
  update: (view: TextAssistantView, working: boolean) => void;
  failed: () => void;
  transcript?: (role: Fragment['role'], text: string) => void;
  response?: (
    value: NonNullable<import('../shared/voice-assistant.js').VoiceAssistantView['response']>,
  ) => void;
  delivered?: (value: { id: string; voiced: boolean }) => void;
  input?: (pending: boolean, text?: string) => void;
  observe?: (
    kind: 'voice_event' | 'voice_commentary' | 'backend_request' | 'backend_result',
    data: unknown,
  ) => void;
}) {
  let rendered: Anchor = {
    revision: initial.revision,
    draftVersion: initial.review.version,
    contentVersion: initial.review.contentVersion,
  };
  let anchor: Anchor | undefined;
  let fragments: Fragment[] = [];
  let pending: (Fragment & { inputVersion: number; anchor: Anchor })[] = [];
  let generation = 0;
  let inputVersion = 0;
  let lastInputAt = 0;
  let microphoneActive = false;
  let collecting: symbol | undefined;
  let stopped = false;
  let questionRevision = initial.revision;
  let questionPending = initial.phase === 'ready' && Boolean(initial.questionPending);
  let questionInputVersion = 0;
  let automaticReplyConsumed = false;
  let owned: number | undefined;
  let dispatching: AbortController | undefined;
  let canceling: Promise<{ revision: number; view: TextAssistantView } | undefined> =
    Promise.resolve(undefined);
  const inFlight = new Map<number, number>();
  const events = new Set<string>();
  const delegations = new Set<string>();
  const answered = new Set<number>([initial.revision]);
  const answeredReplies = new Set((initial.completedReplies ?? []).map((reply) => reply.id));
  const commentary = voiceCommentary(channel, (event) => observe?.('voice_event', event));

  function rememberQuestion(view: TextAssistantView) {
    if (view.revision < questionRevision) return;
    if (view.questionPending && (!questionPending || view.revision > questionRevision))
      questionInputVersion = inputVersion;
    questionRevision = view.revision;
    questionPending = view.phase === 'ready' && Boolean(view.questionPending);
  }
  function collectReply() {
    if (
      !stopped &&
      questionPending &&
      inputVersion > questionInputVersion &&
      pending.length &&
      !collecting &&
      !inFlight.size
    )
      void collect(null);
  }

  function cancel() {
    commentary.cancel();
    const hadWork = (inFlight.get(generation) ?? 0) > 0;
    generation++;
    collecting = undefined;
    dispatching?.abort();
    dispatching = undefined;
    const revision = owned ?? (hadWork ? rendered.revision : undefined);
    owned = undefined;
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
        update(view, false);
        return { revision, view };
      })
      .catch(() => undefined);
  }
  function append(delegationId: string | null, answer: VoiceAnswer, view?: TextAssistantView) {
    const content = voiceAnswerText(answer);
    observe?.('voice_commentary', { delegationId, content, revision: view?.revision });
    // The acknowledgement of this command is transport receipt, never proof
    // that a person heard it. No transcript/audio is logged or persisted here.
    const task = generation;
    const acceptedInput = inputVersion;
    commentary.send(
      delegationId,
      answer,
      () =>
        !stopped &&
        generation === task &&
        (Boolean(view?.receipt) || inputVersion === acceptedInput),
      view && !view.receipt && view.phase === 'ready' && !view.saveCheck
        ? 'unconfirmed'
        : undefined,
    );
    if (view) {
      answered.add(view.revision);
      response?.({
        id: `${view.id}:${view.revision}`,
        revision: view.revision,
        text: view.saveCheck
          ? view.saveCheck.reply + (view.receipt ? ' Sparat.' : '')
          : view.receipt
            ? 'Sparat.'
            : [view.reply, view.modelReply].filter(Boolean).join('\n'),
        questionPending: Boolean(view.questionPending),
        receiptOperationId: view.receipt?.operationId,
      });
    }
  }
  function completion(view: TextAssistantView): VoiceAnswer {
    if (view.saveCheck) return view.saveCheck.reply + (view.receipt ? ' Sparat.' : '');
    if (view.receipt) return 'Sparat.';
    if (view.questionPending && view.modelReply)
      return [
        { kind: 'notice', text: view.requiredNotice ?? '' },
        { kind: 'result', text: view.result?.message ?? '' },
        {
          kind: 'status',
          text: view.displayedSelection ? 'Markeringen är bekräftad i kartan.' : '',
        },
        { kind: 'question', text: view.modelReply },
      ];
    if (view.phase === 'recovery')
      return 'Det är oklart om utkastet sparades. Skyttel kontrollerar det.';
    if (view.error) return view.reply ?? assistantFailureMessage(view.error);
    const count =
      view.review.changes.length +
      (view.review.relationships?.length ?? 0) +
      (view.review.objectTypes?.length ?? 0) +
      (view.review.relationshipTypes?.length ?? 0);
    const verified = [
      view.result?.message,
      view.displayedSelection
        ? `${view.displayedItem?.kind === 'relationship' ? 'Sambandet' : 'Objektet'} är markerat.`
        : undefined,
    ].filter(Boolean);
    return [
      { kind: 'notice', text: view.requiredNotice ?? '' },
      {
        kind: verified.length ? 'result' : 'status',
        text: verified.length
          ? verified.join('\n')
          : `Utkast: ${count} ${count === 1 ? 'osparat förslag' : 'osparade förslag'}.`,
      },
      { kind: 'conversation', text: view.modelReply ?? '' },
    ];
  }
  async function execute(
    id: string | null,
    text: string,
    expected: Anchor,
    context: string,
    task: number,
  ) {
    const acceptedInput = inputVersion;
    const current = () => !stopped && generation === task;
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
      if (view.phase === 'recovery') {
        view = await request('recover', {});
        if (!current()) return;
        const pending = view.operations.filter((operation) => operation.status === 'pending');
        if (pending.length === 1 && /^slutför samma sparförsök[.!]?$/iu.test(text.trim())) {
          const controller = new AbortController();
          dispatching = controller;
          view = await request(
            'retry',
            { operationId: pending[0].operationId, revision: view.revision },
            controller.signal,
          );
        }
      } else {
        const controller = new AbortController();
        dispatching = controller;
        const requestId = randomUUID();
        observe?.('backend_request', { delegationId: id, requestId, text, context });
        owned = view.phase === 'working' ? view.revision : view.revision + 1;
        view = await request(
          'messages',
          {
            ...expected,
            revision: view.phase === 'working' ? view.revision : expected.revision,
            requestId,
            text,
            voiceContext: context,
          },
          controller.signal,
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
        owned = view.revision;
        while (current() && (view.taskStatus === 'queued' || view.taskStatus === 'working')) {
          update(view, true);
          await new Promise((resolve) => setTimeout(resolve, 50));
          view = await request(`messages/${requestId}`);
        }
        if (view.taskStatus === 'canceled') {
          // The task was stopped or replaced in the conversation, outside the
          // voice. The voice no longer works with it and says nothing about it.
          if (current()) {
            owned = undefined;
            dispatching = undefined;
            update(view, false);
          }
          return;
        }
      }
      if (!current()) return;
      rememberQuestion(view);
      observe?.('backend_result', { delegationId: id, view });
      while (
        current() &&
        inputVersion === acceptedInput &&
        (microphoneActive || Date.now() - lastInputAt < 2000)
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (!current()) return;
      if (inputVersion !== acceptedInput || pending.length) {
        // New speech supersedes the answer, but cannot undo a verified save.
        // Deliver only its receipt; leave the newer input and view untouched.
        if (view.receipt)
          append(id, 'Sparat.', {
            ...view,
            saveCheck: undefined,
            modelReply: undefined,
            reply: undefined,
            questionPending: false,
          });
        return;
      }
      owned = undefined;
      dispatching = undefined;
      rendered = { ...rendered, revision: Math.max(rendered.revision, view.revision) };
      update(view, false);
      append(id, completion(view), view);
    } catch {
      if (!current()) return;
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
        if (!stopped && generation === recoveryGeneration) failed();
      }
    } finally {
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
    if (stopped) return;
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
    observe?.('voice_event', { role, ...event });
    transcript?.(role, event.delta);
    if (role === 'user') {
      inputVersion++;
      lastInputAt = Date.now();
      input?.(true, event.delta);
      anchor ??= { ...rendered };
      pending.push({
        role,
        text: event.delta,
        startMs: event.start_ms,
        endMs: event.end_ms,
        inputVersion,
        anchor: { ...rendered },
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
  async function collect(id: string | null) {
    const collection = Symbol();
    collecting = collection;
    const task = generation;
    const current = () => !stopped && generation === task && collecting === collection;
    // A delegation offset is not a completed utterance. Accumulate late deltas
    // before sending a task, including corrections made while still speaking.
    // Further delegations during collection share this input, consumed once.
    while (current() && (microphoneActive || Date.now() - lastInputAt < 2000))
      await new Promise((resolve) => setTimeout(resolve, 50));
    if (!current()) return;
    collecting = undefined;
    // A typed answer or another task may have resolved the question while
    // the person was speaking. Unsolicited tasks still require delegation.
    if (id === null && (!questionPending || inFlight.size)) return;
    // Speech preceding the question remains context, never authority for its
    // automatic reply. A normal delegation retains its original input batch.
    const selected =
      id === null ? pending.filter((item) => item.inputVersion > questionInputVersion) : pending;
    const text = selected.map((item) => item.text).join('');
    const expected = id === null ? selected[0]?.anchor : anchor;
    pending = [];
    anchor = undefined;
    input?.(false);
    if (text.trim() && expected) {
      automaticReplyConsumed = id === null;
      commentary.working(id);
      void execute(id, text, expected, JSON.stringify(fragments), task);
    }
  }
  channel.on('session.input_transcript.delta', (event) => fragment('user', event));
  channel.on('session.output_transcript.delta', (event) => fragment('assistant', event));
  channel.on('session.delegation.created', (event) => {
    if (stopped) return;
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
    observe?.('voice_event', event);
    const selected = pending.filter((item) => item.startMs <= event.offset_ms);
    if (!anchor || !selected.some((item) => item.text.trim())) {
      // Live can delegate after the application has already forwarded a reply.
      // Without fresh input this is neither a second task nor a new save request.
      if (automaticReplyConsumed && !selected.length) return;
      pending = pending.filter((item) => !selected.includes(item));
      if (!pending.length) anchor = undefined;
      input?.(pending.length > 0 || microphoneActive);
      append(
        event.delegation.id,
        'Be om ett nytt tydligt uppdrag. En paus eller tidigare repliker är inget nytt sparbesked.',
      );
      return;
    }
    void collect(event.delegation.id);
  });
  function retire() {
    commentary.close();
    stopped = true;
    input?.(false);
    generation++;
    collecting = undefined;
    dispatching?.abort();
    dispatching = undefined;
    owned = undefined;
    fragments = [];
    pending = [];
    anchor = undefined;
  }
  return {
    activity(active: boolean) {
      if (stopped || (!active && !microphoneActive)) return;
      microphoneActive = active;
      lastInputAt = Date.now();
      input?.(active || pending.length > 0);
    },
    // Starting over owns cancellation of the conversation. Retiring its old
    // voice must invalidate late replies without sending a second cancel.
    retire,
    readyForSummary: () =>
      !microphoneActive &&
      owned === undefined &&
      inFlight.size === 0 &&
      pending.length === 0 &&
      !commentary.pending(),
    /** Consume each typed FIFO completion once, including while the next task works. */
    answer(view: TextAssistantView, microphoneOn = true) {
      if (stopped) return;
      rememberQuestion(view);
      collectReply();
      for (const reply of view.completedReplies ?? []) {
        if (answeredReplies.has(reply.id)) continue;
        if (reply.saveCheck && reply.revision !== undefined && answered.has(reply.revision)) {
          answeredReplies.add(reply.id);
          delivered?.({ id: reply.id, voiced: true });
          continue;
        }
        // Spoken executors hand their own results to Live. OFF completions are
        // consumed too: enabling capture later must not replay old text.
        if (reply.source === 'voice' || !microphoneOn) {
          answeredReplies.add(reply.id);
          delivered?.({ id: reply.id, voiced: reply.source === 'voice' });
          if (reply.revision !== undefined) answered.add(reply.revision);
          continue;
        }
        if (owned !== undefined) continue;
        answeredReplies.add(reply.id);
        const completed: TextAssistantView = {
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
          error: undefined,
        };
        // Keep the complete reply and source boundary through silent assembly.
        const content: VoiceAnswer =
          reply.receipt || reply.questionPending || reply.saveCheck || reply.requiredNotice
            ? completion(completed)
            : [
                { kind: 'result', text: reply.reply ?? '' },
                { kind: 'conversation', text: reply.text },
              ];
        const hasContent = Boolean(voiceAnswerText(content));
        if (hasContent) append(null, content, completed);
        delivered?.({ id: reply.id, voiced: hasContent });
      }
      if (!microphoneOn) {
        if (view.phase !== 'working') answered.add(view.revision);
        return;
      }
      if (owned !== undefined || answered.has(view.revision) || view.phase !== 'ready') return;
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
      retire();
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
