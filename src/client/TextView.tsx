import { type ReactNode, useId, useLayoutEffect, useRef } from 'react';
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
  draftOpen?: boolean;
  draftCount?: number;
  onToggleDraft?: () => void;
  draftContent?: ReactNode;
}) {
  const { session, transcript, text, pending, unknown, working } = conversation;
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
  const blocked = !session || pending || unknown || session.phase === 'recovery' || !text.trim();
  function send() {
    if (blocked) return;
    void conversation.send();
    // The message field keeps the focus, also after a click on Skicka.
    field.current?.focus();
  }
  return (
    <section
      className={`text-view${draftOpen ? ' draft-open' : ''}`}
      aria-labelledby={`${id}-title`}
      hidden={hidden}
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
            <ConversationTranscript rows={transcript} working={working} />
          </div>
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
            <button type="submit" className="primary" disabled={blocked}>
              Skicka
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
