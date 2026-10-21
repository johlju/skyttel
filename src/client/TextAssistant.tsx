import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MapDraft } from '../shared/map.js';
import { ConversationDraft, draftCount } from './ConversationDraft.js';
import './voice.css';
import { type TextOpeningFocus, TextView } from './TextView.js';
import type { Conversation } from './use-conversation.js';
import type { useConversationPreferences } from './use-conversation-preferences.js';

type AssistantActivity = { working: boolean; needsAnswer: boolean };

export function conversationFeedback({
  session,
  working,
  needsAnswer,
}: Pick<Conversation, 'session' | 'working' | 'needsAnswer'>) {
  if (!session || working || needsAnswer || session.receipt) return null;
  return session.displayedSelection || session.displayedItem
    ? 'Markerat i kartan.'
    : 'Nya förslag är osparade tills du uttryckligen ber om ett samlat sparande.';
}

export type ConversationPresentation = {
  draftFeedback?: (assistant: AssistantActivity & { compact: boolean }) => ReactNode;
  active?: boolean;
  /** The text view is open. It shows the conversation text and the message field. */
  textViewOpen?: boolean;
  textViewHidden?: boolean;
  textFocusRequest?: number;
  textOpeningFocus?: TextOpeningFocus;
  onDraftOpenChange?: (open: boolean) => void;
  draftOpenRequest?: number;
  draftContent?: ReactNode;
  onStartConversation?: (chosen: HTMLElement | null) => void;
  onCloseTextView?: () => void;
  householdId: string;
  notice?: ReactNode;
  draft?: MapDraft;
  showDraftOnStart?: boolean;
  preferencesKnown?: boolean;
  widthPreferences?: ReturnType<typeof useConversationPreferences>;
};

/**
 * Shows the conversation text, draft and shared draft feedback and calls its
 * commands. The conversation itself is kept by the caller.
 */
export function ConversationWorkspace({
  conversation,
  active: workVisible = true,
  draft,
  showDraftOnStart = false,
  preferencesKnown = true,
  widthPreferences,
  textViewOpen = false,
  textViewHidden = false,
  textFocusRequest,
  textOpeningFocus,
  onDraftOpenChange,
  draftOpenRequest,
  draftContent,
  onStartConversation,
  onCloseTextView,
  draftFeedback,
  notice,
}: ConversationPresentation & { conversation: Conversation }) {
  const { session, needsAnswer } = conversation;
  const review = session?.review;
  const visibleDraft = draft && (!review || draft.version >= review.version) ? draft : review;
  const count = draftCount(visibleDraft);
  const [draftOpen, setDraftOpen] = useState(false);
  useLayoutEffect(() => {
    if (draftOpenRequest) {
      manuallyToggled.current = true;
      setDraftOpen(true);
    }
  }, [draftOpenRequest]);
  useLayoutEffect(() => onDraftOpenChange?.(draftOpen), [draftOpen, onDraftOpenChange]);
  const manuallyToggled = useRef(false);
  const resetRow = conversation.transcript[0]?.id.startsWith('new-')
    ? conversation.transcript[0].id
    : '';
  const conversationKey = `${session?.id ?? ''}:${resetRow}`;
  const initialChoice = useRef<boolean | null>(null);
  const previousConversation = useRef('');
  useEffect(() => {
    if (previousConversation.current !== conversationKey) {
      const keepManualReview =
        manuallyToggled.current && !previousConversation.current && Boolean(session);
      previousConversation.current = conversationKey;
      if (!keepManualReview) manuallyToggled.current = false;
      initialChoice.current = null;
      if (!keepManualReview) setDraftOpen(false);
    }
    if (!session || !preferencesKnown) return;
    initialChoice.current ??= showDraftOnStart;
    if (!manuallyToggled.current && initialChoice.current && count > 0) setDraftOpen(true);
  }, [session, conversationKey, preferencesKnown, showDraftOnStart, count]);
  const activity = { working: conversation.working, needsAnswer };
  const resultFeedback = conversationFeedback(conversation);
  const feedback = (
    <section className="workspace-draft-feedback" aria-label="Utkastets återkoppling">
      {resultFeedback && <p role="status">{resultFeedback}</p>}
      {draftFeedback?.({ ...activity, compact: !workVisible })}
    </section>
  );
  return (
    <section
      aria-label="Arbetsyta"
      className="assistant-workspace"
      data-session-active={Boolean(session)}
      id="workspace-work"
      tabIndex={-1}
    >
      {!workVisible && feedback}
      {textViewOpen && (
        <TextView
          conversation={conversation}
          onStartConversation={onStartConversation}
          widthPreferences={widthPreferences}
          hidden={!workVisible || textViewHidden}
          focusRequest={textFocusRequest}
          openingFocus={textOpeningFocus}
          onClose={() => onCloseTextView?.()}
          draftOpen={draftOpen}
          draftCount={count}
          onToggleDraft={() => {
            manuallyToggled.current = true;
            setDraftOpen(!draftOpen);
          }}
          draftContent={draftContent ?? <ConversationDraft draft={visibleDraft} />}
          notice={notice}
        >
          {!notice && conversation.error && <p role="alert">{conversation.error}</p>}
          {conversation.deliveryError && <p role="alert">{conversation.deliveryError}</p>}
        </TextView>
      )}
    </section>
  );
}
