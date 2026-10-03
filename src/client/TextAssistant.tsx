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
import { VoicePanel } from './VoiceAssistant.js';
import './voice.css';
import { TextView } from './TextView.js';
import type { Conversation } from './use-conversation.js';

function errorMessage(code: string) {
  if (code === 'assistant_save_not_requested')
    return 'Inget sparades. Skriv ett tydligt aktuellt sparbesked, till exempel ”Spara hela utkastet nu”, när du vill spara.';
  if (code === 'assistant_draft_changed' || code === 'assistant_conflict')
    return 'Utkastet eller kartan har ändrats. Hämta aktuellt underlag, red ut eventuella konflikter och ge ett nytt besked.';
  if (code === 'operation_pending' || code === 'assistant_save_unknown')
    return 'Sparresultatet behöver kontrolleras innan nytt arbete kan börja.';
  return 'Skyttel kunde inte slutföra uppdraget. Kontrollera utkastet och tidigare sparförsök. Du kan fortsätta i kartans formulär.';
}

type AssistantActivity = { working: boolean; needsAnswer: boolean };

export type ConversationPresentation = {
  statusContent?: (assistant: AssistantActivity & { compact: boolean }) => ReactNode;
  statusOpen?: boolean;
  onCloseStatus?: () => void;
  onOpenStatus?: () => void;
  active?: boolean;
  /** The text view is open. It shows the conversation text and the message field. */
  textViewOpen?: boolean;
  onOpenTextView?: () => void;
  onCloseTextView?: () => void;
  householdId: string;
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
 * Shows the conversation in the status card and the text view and calls its
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
  onOpenTextView,
  onCloseTextView,
  statusContent,
  statusOpen = false,
  onCloseStatus,
  onOpenStatus,
}: ConversationPresentation & { conversation: Conversation }) {
  const { available, session, pending, error, unknown, needsAnswer } = conversation;
  // The status card is shown in the text view, or floats over the map when
  // the text view is not open. It is rendered where it is shown.
  const [statusSlot, setStatusSlot] = useState<HTMLDivElement | null>(null);
  const [floatingSlot, setFloatingSlot] = useState<HTMLDivElement | null>(null);
  const floatingVoice = useRef<HTMLDivElement | null>(null);
  const attachFloatingSlot = useCallback((element: HTMLDivElement | null) => {
    floatingVoice.current = element;
    setFloatingSlot(element);
  }, []);
  const workspace = useRef<HTMLElement>(null);
  const floating = Boolean(
    renderWorkspace && (session || statusContent) && (statusOpen || !workVisible || !textViewOpen),
  );
  const statusHost = floating ? floatingSlot : statusSlot;
  const statusHeading = useRef<HTMLHeadingElement>(null);
  const statusToggle = useRef<HTMLButtonElement>(null);
  const compactStatus = !workVisible && !statusOpen;
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
  useLayoutEffect(() => {
    if (statusOpen && statusHost) statusHeading.current?.focus();
  }, [statusOpen, statusHost]);
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
  const conversationControls = session && (
    <div className="conversation-controls">
      <div
        className={`assistant-work-indicator${session.phase === 'working' ? ' is-working' : ''}`}
      >
        <p
          role="status"
          className={`assistant-work-status${session.phase === 'working' ? ' is-working' : ''}`}
        >
          {session.phase === 'working'
            ? 'Skyttel arbetar… Du kan avbryta eller ge ett nytt uppdrag.'
            : session.phase === 'recovery'
              ? 'Kontrollera det tidigare sparförsöket innan du fortsätter.'
              : needsAnswer
                ? 'Skyttel behöver ett svar. Red ut frågorna före sparande.'
                : session.receipt
                  ? 'Sparat. Hela utkastet finns i hushållets karta.'
                  : session.displayedSelection || session.displayedItem
                    ? 'Markerat i kartan.'
                    : 'Nya förslag är osparade tills du uttryckligen ber om ett samlat sparande.'}
        </p>
      </div>
      {!compactStatus &&
        session.reply &&
        !session.receipt &&
        !session.displayedSelection &&
        !session.displayedItem && (
          <div>
            <h4>Besked från Skyttel</h4>
            <p>{session.reply}</p>
          </div>
        )}
      {session.error && <p role="alert">{errorMessage(session.error)}</p>}
      {error && <p role="alert">{error}</p>}
      {needsAnswer && (
        <section aria-label="Nödvändigt svar" className="conversation-question">
          {session.questions?.map((question) => (
            <p key={question}>{question}</p>
          ))}
          {Boolean(review?.unresolvedIdentities.length) && (
            <p>Vilka objekt avses? Utkastets obesvarade identiteter behöver redas ut.</p>
          )}
          {Boolean(review?.conflicts.length) && (
            <p>Utkastet har konflikter. Red ut dem före ett nytt sparbesked.</p>
          )}
          {onOpenTextView && (
            <button type="button" onClick={onOpenTextView}>
              Svara i samtalet
            </button>
          )}
        </section>
      )}
      <div className="voice-controls">
        {session.phase === 'working' && (
          <button type="button" disabled={pending} onClick={() => void conversation.cancel()}>
            Avbryt uppdrag
          </button>
        )}
        {(unknown || session.phase === 'recovery') && (
          <button type="button" disabled={pending} onClick={() => void conversation.recover()}>
            Kontrollera sparresultat
          </button>
        )}
      </div>
    </div>
  );
  const voice = (
    <section
      aria-label="Samtal med Skyttel"
      className="assistant-bar"
      hidden={!workVisible && !session && !statusContent}
    >
      {session ? (
        <VoicePanel voice={conversation.voice}>{conversationControls}</VoicePanel>
      ) : floating ? (
        <div className="assistant-bar-heading">
          <span>Samtal med Skyttel</span>
        </div>
      ) : (
        <>
          <div className="assistant-bar-heading">
            <h3>Tala med Skyttel</h3>
          </div>
          {available === null && (
            <p className="assistant-loading">Hämtar samtalets tillgänglighet…</p>
          )}
          {available === false && (
            <p>Samtal med Skyttel är inte tillgängligt. Du kan använda kartan och formulären.</p>
          )}
        </>
      )}
      {!session && error && <p role="alert">{error}</p>}
    </section>
  );
  const status = (
    <section
      aria-label="Aktuell status"
      className="workspace-status-card"
      data-expanded={statusOpen}
      data-compact={compactStatus}
    >
      {statusOpen && (
        <div className="workspace-status-heading">
          <h2 tabIndex={-1} ref={statusHeading}>
            Aktuell status
          </h2>
          <button
            type="button"
            onClick={() => {
              onCloseStatus?.();
              if (!workVisible) requestAnimationFrame(() => statusToggle.current?.focus());
            }}
            aria-label="Stäng aktuell status"
          >
            ×
          </button>
        </div>
      )}
      {voice}
      {statusContent?.({ ...activity, compact: compactStatus })}
      {!workVisible && !statusOpen && (
        <button type="button" ref={statusToggle} onClick={onOpenStatus} aria-expanded={false}>
          Visa samtals- och utkastdetaljer
        </button>
      )}
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
      {statusHost && createPortal(<div>{status}</div>, statusHost)}
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
          {!textViewOpen && <div ref={setStatusSlot} />}
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
        >
          <div ref={setStatusSlot} />
        </TextView>
      )}
      {/* In scroll flow, the floating status card must not shift a panel
          heading that received focus during the same commit. */}
      {renderWorkspace && <div ref={attachFloatingSlot} className="workspace-voice-controls" />}
    </section>
  );
}
