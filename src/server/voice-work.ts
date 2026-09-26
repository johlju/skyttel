import { randomUUID } from 'node:crypto';
import type { TextAssistantView } from '../shared/text-assistant.js';
import { assistantFailureMessage } from './assistant-feedback.js';
import type { LiveSideband } from './live-provider.js';

type Anchor = { revision: number; draftVersion: number; contentVersion: number };
type Fragment = { role: 'user' | 'assistant'; text: string; startMs: number; endMs: number };

/** One executor for the server sideband. Raw deltas stay in memory; only a
 * delegation makes a task, and only its new user deltas can authorize a save. */
export function voiceWork({
  channel,
  initial,
  request,
  interrupt,
  update,
  failed,
}: {
  channel: LiveSideband;
  initial: TextAssistantView;
  request: (action?: string, body?: unknown, signal?: AbortSignal) => Promise<TextAssistantView>;
  interrupt: (revision: number) => void;
  update: (view: TextAssistantView) => void;
  failed: () => void;
}) {
  let rendered: Anchor = {
    revision: initial.revision,
    draftVersion: initial.review.version,
    contentVersion: initial.review.contentVersion,
  };
  let anchor: Anchor | undefined;
  let fragments: Fragment[] = [];
  let pending: Fragment[] = [];
  let generation = 0;
  let stopped = false;
  let owned: number | undefined;
  let dispatching: AbortController | undefined;
  let canceling: Promise<{ revision: number; view: TextAssistantView } | undefined> =
    Promise.resolve(undefined);
  const events = new Set<string>();
  const delegations = new Set<string>();

  function cancel() {
    generation++;
    dispatching?.abort();
    dispatching = undefined;
    const revision = owned;
    owned = undefined;
    if (revision === undefined) return;
    interrupt(revision);
    canceling = request('cancel', { revision })
      .then((view) => {
        update(view);
        return { revision, view };
      })
      .catch(() => undefined);
  }
  function append(delegationId: string, content: string) {
    // The acknowledgement of this command is transport receipt, never proof
    // that a person heard it. No transcript/audio is logged or persisted here.
    const points = Array.from(content);
    while (Buffer.byteLength(points.join(''), 'utf8') > 480) points.pop();
    channel.send({
      type: 'session.commentary.append',
      delegation_id: delegationId,
      content: points.join(''),
    });
  }
  function completion(view: TextAssistantView) {
    if (view.phase === 'recovery')
      return 'Sparresultatet är inte bekräftat. Tidigare sparförsök kontrolleras innan nytt arbete. Säg ”slutför samma sparförsök” om du vill slutföra exakt det väntande försöket.';
    if (view.error) return assistantFailureMessage(view.error);
    const count =
      view.review.changes.length +
      (view.review.relationships?.length ?? 0) +
      (view.review.objectTypes?.length ?? 0) +
      (view.review.relationshipTypes?.length ?? 0);
    const fullResult = view.receipt
      ? 'Skyttels resultat (verifierat): Sparat.'
      : view.displayedSelection
        ? `Skyttels resultat (verifierat): ${view.displayedItem?.kind === 'relationship' ? 'Sambandet' : 'Objektet'} är markerat.`
        : view.result
          ? `Skyttels resultat (verifierat): ${view.result.message}`
          : `Utkast: ${count} ${count === 1 ? 'osparat förslag' : 'osparade förslag'}.`;
    const resultPoints = Array.from(fullResult).slice(0, 480);
    const resultBudget = view.modelReply ? 210 : 480;
    while (Buffer.byteLength(resultPoints.join(''), 'utf8') > resultBudget - 3) resultPoints.pop();
    const result =
      resultPoints.join('') + (resultPoints.length < Array.from(fullResult).length ? '…' : '');
    if (!view.modelReply) return result;
    // Keep the source boundary and quoted conversation intact within Live's
    // byte limit. Provider prose is data, never part of the verified result.
    const prefix = `${result}\nSamtal (obekräftat): `;
    const points = Array.from(view.modelReply).slice(0, 480);
    while (Buffer.byteLength(prefix + JSON.stringify(points.join('')), 'utf8') > 480) points.pop();
    return prefix + JSON.stringify(points.join(''));
  }
  async function execute(
    id: string,
    text: string,
    expected: Anchor,
    context: string,
    task: number,
  ) {
    const current = () => !stopped && generation === task;
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
        view = await request(
          'messages',
          {
            ...expected,
            requestId: randomUUID(),
            text,
            voiceContext: context,
          },
          controller.signal,
        );
        if (!current()) {
          interrupt(view.revision);
          await request('cancel', { revision: view.revision }).catch(() => {});
          return;
        }
        owned = view.revision;
        const revision = owned;
        const deadline = Date.now() + 120_000;
        while (current() && view.phase === 'working' && view.revision === revision) {
          update(view);
          if (Date.now() > deadline) throw new Error('voice_task_timeout');
          await new Promise((resolve) => setTimeout(resolve, 50));
          view = await request();
        }
        if (view.revision !== revision) return;
      }
      if (!current()) return;
      owned = undefined;
      dispatching = undefined;
      rendered = { ...rendered, revision: Math.max(rendered.revision, view.revision) };
      update(view);
      append(id, completion(view));
    } catch {
      if (!current()) return;
      cancel();
      const recoveryGeneration = generation;
      try {
        const view = await request();
        if (stopped || generation !== recoveryGeneration) return;
        update(view);
        append(
          id,
          view.phase === 'recovery'
            ? completion(view)
            : 'Underlaget har ändrats eller uppdraget kunde inte slutföras. Inget nytt sparande är bekräftat. Ge ett nytt tydligt uppdrag utifrån det aktuella utkastet.',
        );
      } catch {
        if (!stopped && generation === recoveryGeneration) failed();
      }
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
    if (role === 'user') {
      cancel();
      anchor ??= { ...rendered };
      pending.push({ role, text: event.delta, startMs: event.start_ms, endMs: event.end_ms });
      if (pending.map((item) => item.text).join('').length > 4000) {
        failed();
        return;
      }
    }
    fragments.push({ role, text: event.delta, startMs: event.start_ms, endMs: event.end_ms });
    while (fragments.length > 40 || JSON.stringify(fragments).length > 8000) fragments.shift();
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
    // Do not splice words or invent a complete utterance across the provider's
    // delegation boundary. Later/overlapping fragments require a later task.
    const complete =
      Number.isFinite(event.offset_ms) && pending.every((item) => item.endMs <= event.offset_ms);
    const text = complete ? pending.map((item) => item.text).join('') : '';
    const expected = anchor;
    if (complete) {
      pending = [];
      anchor = undefined;
    }
    if (!text.trim() || !expected) {
      append(
        event.delegation.id,
        'Be om ett nytt tydligt uppdrag. En paus eller tidigare repliker är inget nytt sparbesked.',
      );
      return;
    }
    cancel();
    void execute(event.delegation.id, text, expected, JSON.stringify(fragments), generation);
  });
  return {
    rendered(value: Anchor) {
      if (
        value.revision >= rendered.revision &&
        value.contentVersion >= rendered.contentVersion &&
        (value.contentVersion > rendered.contentVersion ||
          value.draftVersion >= rendered.draftVersion)
      )
        rendered = { ...value };
    },
    stop() {
      stopped = true;
      cancel();
      fragments = [];
      pending = [];
      anchor = undefined;
      return canceling;
    },
  };
}
