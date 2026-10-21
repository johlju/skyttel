import type { ConversationReply, TextAssistantView } from '../shared/text-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';

export function draftUpdated(reply: Pick<ConversationReply, 'result'>) {
  return reply.result?.kind === 'draft' && reply.result.message === 'Utkastet är uppdaterat.';
}

/** Collect checked outcomes until the server has finished the whole run of messages. */
export function conversationCompletion() {
  let context = '';
  const seen = new Set<string>();
  let pending: ConversationReply[] = [];
  let questions: string[] = [];
  let sequence = 0;
  return (view: TextAssistantView): TranscriptRow | undefined => {
    const nextContext = `${view.id}-${view.contextRevision ?? 0}`;
    if (nextContext !== context) {
      context = nextContext;
      seen.clear();
      pending = [];
      questions = [];
    }
    const busy =
      view.phase === 'working' ||
      view.phase === 'recovery' ||
      Boolean(view.queuedMessages) ||
      view.contextSummaryState === 'summarizing' ||
      view.tasks?.some((task) => task.status === 'queued' || task.status === 'working');
    const replies = [...(view.completedReplies ?? [])];
    if (!busy && !view.canceled && (view.result || view.error || view.questionPending))
      replies.push({
        id: `current-${view.revision}`,
        revision: view.revision,
        text: view.modelReply ?? '',
        result: view.result,
        reply: view.reply,
        failed: Boolean(view.error),
        questionPending: view.questionPending,
        questions: view.questions,
        receipt: view.receipt,
      });
    for (const reply of replies) {
      const key = reply.revision === undefined ? reply.id : `revision-${reply.revision}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(reply);
      if (reply.questions) questions = reply.questions;
      else if (reply.questionPending === false) questions = [];
    }
    if (view.questions) questions = view.questions;
    else if (view.questionPending === false) questions = [];
    else if (view.questionPending && !questions.length && view.modelReply)
      questions = [view.modelReply];
    if (busy || !pending.length) return;
    const finished = pending;
    pending = [];
    const changes = new Map<string, Set<string>>();
    for (const { subject, action } of finished.flatMap((reply) => reply.result?.changes ?? [])) {
      const subjects = changes.get(action) ?? new Set<string>();
      subjects.add(subject);
      changes.set(action, subjects);
    }
    const failures = [
      ...new Set(
        finished
          .filter((reply) => reply.failed)
          .map((reply) => {
            const message = reply.reply ?? reply.result?.message;
            return message && (reply.request ? `”${reply.request}”: ${message}` : message);
          })
          .filter((text): text is string => Boolean(text)),
      ),
    ];
    const answers = finished.flatMap((reply) => {
      if (!reply.questionPending || !reply.questions?.length) return [];
      const answer = reply.questions
        .reduce((text, question) => text.replaceAll(question, ''), reply.text)
        .trim();
      return answer && answer !== reply.result?.message ? [answer] : [];
    });
    if (!changes.size && !failures.length && !questions.length && !answers.length) return;
    const sections: string[] = [];
    if (view.canceled) sections.push('Arbetet avbröts. Återstående uppgifter slutfördes inte.');
    else if (view.discarded) sections.push('Utkastet är kastat.');
    if (!view.discarded)
      for (const [action, subjects] of changes)
        sections.push(`${new Intl.ListFormat('sv').format([...subjects])} ${action}.`);
    sections.push(...answers, ...failures, ...questions);
    return {
      id: `completion-${context}-${++sequence}`,
      role: 'assistant',
      text: sections.join(' '),
      // This summary is text presentation, separate from the voice handoff of each reply.
      voiced: false,
    };
  };
}
