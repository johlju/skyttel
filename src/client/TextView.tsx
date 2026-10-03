import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ContextMeter } from './ConversationContext.js';
import { ConversationTranscript } from './ConversationTranscript.js';
import type { Conversation } from './use-conversation.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

/**
 * A computer: the main pointer is not a finger, and the window is wider than
 * 700 px. Everything else is a mobile device or a narrow screen.
 */
function onComputer() {
  return (
    !window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(max-width: 700px)').matches
  );
}

/**
 * The text view: the conversation text and the message field. It reads the
 * conversation and calls its commands. Closing it ends nothing: the
 * conversation, the microphone and the unsent text are kept by the caller.
 */
export function TextView({
  conversation,
  hidden = false,
  onClose,
  children,
  notice,
  draftOpen = false,
  draftCount = 0,
  onToggleDraft,
  draftContent,
}: {
  conversation: Conversation;
  hidden?: boolean;
  onClose: () => void;
  /** What is shown above the conversation text. */
  children?: ReactNode;
  /** The conversation notice, immediately above the editable message field. */
  notice?: ReactNode;
  draftOpen?: boolean;
  draftCount?: number;
  onToggleDraft?: () => void;
  draftContent?: ReactNode;
}) {
  const { session, transcript, text, pending, unknown, working } = conversation;
  const [computer, setComputer] = useState(onComputer);
  useEffect(() => {
    const width = window.matchMedia('(max-width: 700px)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const changed = () => setComputer(onComputer());
    width.addEventListener('change', changed);
    pointer.addEventListener('change', changed);
    return () => {
      width.removeEventListener('change', changed);
      pointer.removeEventListener('change', changed);
    };
  }, []);
  const stop = working && !computer;
  const stopFocused = useRef(false);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    // On a computer the message field gets the focus when the text view opens.
    // On a mobile device and a narrow screen it does not, so that the on-screen
    // keyboard stays down. The focus then stays in the toolbar or goes to the heading.
    if (onComputer()) field.current?.focus();
    else if (!document.activeElement?.closest('.workspace-tools')) heading.current?.focus();
  }, []);
  // The newest row stays in view, unless the user has scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new rows
  useLayoutEffect(() => {
    if (body.current && follow.current) body.current.scrollTop = body.current.scrollHeight;
  }, [transcript, working]);
  useLayoutEffect(() => {
    if (!stop && stopFocused.current) {
      stopFocused.current = false;
      field.current?.focus();
    }
  }, [stop]);
  const blocked =
    conversation.inputBlocked ||
    !session ||
    pending ||
    unknown ||
    session.phase === 'recovery' ||
    !text.trim();
  function send() {
    if (blocked || stop) return;
    void conversation.send(computer);
    // The message field keeps the focus, also after a click on Skicka.
    field.current?.focus();
  }
  return (
    <section
      className={`text-view${draftOpen ? ' draft-open' : ''}`}
      aria-labelledby={`${id}-title`}
      hidden={hidden}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && working && !window.matchMedia('(pointer: coarse)').matches) {
          event.preventDefault();
          event.stopPropagation();
          void conversation.cancel();
        }
      }}
    >
      <header className="text-view-heading">
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
          Skriv till Skyttel
        </h2>
        <button
          type="button"
          className="text-view-new"
          disabled={!session}
          onClick={() => void conversation.newConversation()}
        >
          Nytt samtal
        </button>
        <button
          type="button"
          className="text-view-close"
          aria-label="Stäng textvyn"
          title="Stäng textvyn"
          onClick={onClose}
        >
          <WorkspaceIcon name="close" />
        </button>
      </header>
      <ContextMeter percentage={session?.contextPercentage} />
      {onToggleDraft && (
        <button
          type="button"
          className="text-view-draft-toggle"
          aria-expanded={draftOpen}
          aria-controls={`${id}-draft`}
          onClick={onToggleDraft}
        >
          <span aria-hidden="true" className="draft-direction">
            {draftOpen ? '›' : '‹'}
          </span>
          {draftOpen ? 'Dölj utkastet' : 'Visa utkastet'} <span>({draftCount})</span>
        </button>
      )}
      <div className="text-view-columns">
        <section
          id={`${id}-draft`}
          className="text-view-draft"
          aria-label="Utkastet"
          hidden={!draftOpen}
        >
          {draftContent}
        </section>
        <div className="text-view-conversation">
          <div
            ref={body}
            className="text-view-body"
            onScroll={(event) => {
              const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
              follow.current = scrollHeight - scrollTop - clientHeight < 80;
            }}
          >
            {children}
            <ConversationTranscript
              rows={transcript}
              working={working}
              queued={session?.queuedMessages ?? 0}
              computer={computer}
            />
          </div>
          <p className="text-view-canceled" aria-live="polite" aria-atomic="true">
            {session?.canceled ? 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.' : ''}
          </p>
          {notice}
          <form
            className="text-view-message"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label htmlFor={`${id}-message`}>Meddelande till Skyttel</label>
            <textarea
              ref={field}
              id={`${id}-message`}
              rows={2}
              maxLength={4000}
              placeholder="Berätta vad du vill göra…"
              value={text}
              onChange={(event) => conversation.setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, and Shift+Enter makes a new line.
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                send();
              }}
            />
            {stop ? (
              <button
                type="button"
                className="primary text-view-stop"
                aria-label="Avbryt"
                title="Avbryt"
                onFocus={() => {
                  stopFocused.current = true;
                }}
                onBlur={(event) => {
                  if (event.currentTarget.isConnected) stopFocused.current = false;
                }}
                onClick={() => void conversation.cancel()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button type="submit" className="primary" disabled={blocked}>
                Skicka
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
