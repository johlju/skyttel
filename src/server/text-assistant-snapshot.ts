import type { TextAssistantView } from '../shared/text-assistant.js';

type RecoveryView = Pick<
  TextAssistantView,
  'paused' | 'expiresAt' | 'conversation' | 'queuedRequests' | 'unfinishedRequests'
>;

/** Task status is always current; completed turns retain only a reply-prefix index. */
export type AssistantResultSnapshot = {
  view: Omit<TextAssistantView, 'tasks' | 'completedReplies' | keyof RecoveryView>;
  completedReplyCount: number | undefined;
};

export function captureAssistantResult(
  current: TextAssistantView,
  history: 'prefix' | 'live',
): AssistantResultSnapshot {
  const {
    tasks: _tasks,
    completedReplies,
    paused: _paused,
    expiresAt: _expiresAt,
    conversation: _conversation,
    queuedRequests: _queuedRequests,
    unfinishedRequests: _unfinishedRequests,
    ...view
  } = current;
  return {
    view,
    // Timer expiry and cancellation historically observe the live reply array.
    completedReplyCount: history === 'prefix' ? (completedReplies?.length ?? 0) : undefined,
  };
}

export function restoreAssistantResult(
  snapshot: AssistantResultSnapshot,
  current: Pick<TextAssistantView, 'tasks' | 'completedReplies' | 'phase'> & RecoveryView,
): TextAssistantView {
  return {
    ...snapshot.view,
    paused: current.paused,
    expiresAt: current.expiresAt,
    conversation: current.conversation,
    queuedRequests: current.queuedRequests,
    unfinishedRequests: current.unfinishedRequests,
    phase: current.paused ? current.phase : snapshot.view.phase,
    tasks: current.tasks,
    completedReplies:
      snapshot.completedReplyCount === undefined
        ? current.completedReplies
        : (current.completedReplies ?? []).slice(0, snapshot.completedReplyCount),
  };
}
