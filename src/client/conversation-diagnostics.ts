import type { TextAssistantView } from '../shared/text-assistant.js';
import type { ConversationNotice } from './conversation-notice.js';

/** Bind the report to the failed task, never to the latest typed or queued text. */
export function conversationDiagnosticReport(
  notice: ConversationNotice,
  session: TextAssistantView | null,
) {
  if (notice.id !== 'actionBlocked' && notice.id !== 'taskFailed') return undefined;
  const replies = session?.completedReplies ?? [];
  const failure =
    notice.id === 'actionBlocked'
      ? replies.findLast(
          (reply) => reply.securityReference && notice.text.includes(reply.securityReference),
        )
      : notice.id === 'taskFailed'
        ? replies.findLast((reply) =>
            session?.workFailure
              ? reply.id === session.workFailure.requestId
              : reply.failed && reply.revision === session?.revision,
          )
        : undefined;
  const work = notice.id === 'taskFailed' ? session?.workFailure : undefined;
  const request = work?.request ?? failure?.request;
  return [
    notice.text,
    failure?.reply && !failure.securityReference && !notice.text.includes(failure.reply)
      ? `Uppdragets felbesked:\n${failure.reply}`
      : undefined,
    `Begäran där felet uppstod:\n${request ?? 'Ingen kopplad begäran är tillgänglig.'}`,
    session ? `Samtals-ID: ${session.id}` : undefined,
    work || failure ? `Uppdrags-ID: ${work?.requestId ?? failure?.id}` : undefined,
    failure?.source ? `Inmatning: ${failure.source === 'voice' ? 'röst' : 'text'}` : undefined,
    work?.code ? `Felkod: ${work.code}` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join('\n\n');
}
