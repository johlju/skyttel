import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { MapDraft } from '../shared/map.js';
import { ConversationDraft, draftCount } from './ConversationDraft.js';
import './voice.css';
import { TextView } from './TextView.js';
import type { Conversation } from './use-conversation.js';
import { useConversationViewport } from './use-conversation-viewport.js';

type AssistantActivity = { working: boolean; needsAnswer: boolean };

export type ConversationPresentation = {
  draftFeedback?: (assistant: AssistantActivity & { compact: boolean }) => ReactNode;
  active?: boolean;
  /** The text view is open. It shows the conversation text and the message field. */
  textViewOpen?: boolean;
  onCloseTextView?: () => void;
  householdId: string;
  notice?: ReactNode;
  children?: ReactNode | ((assistant: AssistantActivity) => ReactNode);
  draft?: MapDraft;
  showDraftOnStart?: boolean;
  preferencesKnown?: boolean;
  inspector?: ReactNode;
  renderWorkspace?: (
    work: ReactNode,
    floatingStatus: RefObject<HTMLDivElement | null>,
  ) => ReactNode;
};

/**
 * Shows the conversation text, draft and shared draft feedback and calls its
 * commands. The conversation itself is kept by the caller.
 */
export function ConversationWorkspace({
  conversation,
  active: workVisible = true,
  children,
  draft,
  showDraftOnStart = false,
  preferencesKnown = true,
  inspector,
  renderWorkspace,
  textViewOpen = false,
  onCloseTextView,
  draftFeedback,
  notice,
}: ConversationPresentation & { conversation: Conversation }) {
  const { session, needsAnswer } = conversation;
  const { narrow } = useConversationViewport();
  const feedbackInText = narrow && textViewOpen;
  const [floatingSlot, setFloatingSlot] = useState<HTMLDivElement | null>(null);
  const floatingVoice = useRef<HTMLDivElement | null>(null);
  const attachFloatingSlot = useCallback((element: HTMLDivElement | null) => {
    floatingVoice.current = element;
    setFloatingSlot(element);
  }, []);
  const workspace = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!renderWorkspace || !floatingSlot) return;
    const measure = () =>
      workspace.current
        ?.closest<HTMLElement>('.household-map')
        ?.style.setProperty('--voice-height', `${floatingSlot.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(floatingSlot);
    return () => observer.disconnect();
  }, [floatingSlot, renderWorkspace]);
  const review = session?.review;
  const visibleDraft = draft && (!review || draft.version >= review.version) ? draft : review;
  const count = draftCount(visibleDraft);
  const [draftOpen, setDraftOpen] = useState(false);
  const manuallyToggled = useRef(false);
  const resetRow = conversation.transcript[0]?.id.startsWith('new-')
    ? conversation.transcript[0].id
    : '';
  const conversationKey = `${session?.id ?? ''}:${resetRow}`;
  const initialChoice = useRef<boolean | null>(null);
  const previousConversation = useRef('');
  useEffect(() => {
    if (previousConversation.current !== conversationKey) {
      previousConversation.current = conversationKey;
      manuallyToggled.current = false;
      initialChoice.current = null;
      setDraftOpen(false);
    }
    if (!session || !preferencesKnown) return;
    initialChoice.current ??= showDraftOnStart;
    if (!manuallyToggled.current && initialChoice.current && count > 0) setDraftOpen(true);
  }, [session, conversationKey, preferencesKnown, showDraftOnStart, count]);
  const activity = { working: conversation.working, needsAnswer };
  const work = typeof children === 'function' ? children(activity) : children;
  const feedback = (
    <section className="workspace-draft-feedback" aria-label="Utkastets återkoppling">
      {session && !conversation.working && !needsAnswer && !session.receipt && (
        <p role="status">
          {session.displayedSelection || session.displayedItem
            ? 'Markerat i kartan.'
            : 'Nya förslag är osparade tills du uttryckligen ber om ett samlat sparande.'}
        </p>
      )}
      {draftFeedback?.({ ...activity, compact: !workVisible })}
    </section>
  );
  return (
    <section
      ref={workspace}
      aria-label="Arbetsyta"
      className="assistant-workspace"
      data-session-active={Boolean(session)}
      id="workspace-work"
      tabIndex={-1}
    >
      {floatingSlot && !feedbackInText && createPortal(feedback, floatingSlot)}
      {renderWorkspace ? (
        renderWorkspace(
          <>
            {inspector}
            {work}
          </>,
          floatingVoice,
        )
      ) : (
        <>
          {feedback}
          <div className="assistant-layout" hidden={!workVisible}>
            {work && <div className="assistant-map-panel">{work}</div>}
            {inspector && (
              <div className="assistant-side">
                <div className="assistant-panel">{inspector}</div>
              </div>
            )}
          </div>
        </>
      )}
      {textViewOpen && (
        <TextView
          conversation={conversation}
          hidden={!workVisible}
          onClose={() => onCloseTextView?.()}
          draftOpen={draftOpen}
          draftCount={count}
          onToggleDraft={() => {
            manuallyToggled.current = true;
            setDraftOpen(!draftOpen);
          }}
          draftContent={<ConversationDraft draft={visibleDraft} />}
          notice={notice}
        >
          {feedbackInText && feedback}
          {!notice && conversation.error && <p role="alert">{conversation.error}</p>}
        </TextView>
      )}
      {/* Shared draft feedback stays outside the text view and the conversation notice. */}
      {renderWorkspace && <div ref={attachFloatingSlot} className="workspace-voice-controls" />}
    </section>
  );
}
