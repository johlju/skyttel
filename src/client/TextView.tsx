import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { conversationModels, reasoningLabels } from '../shared/conversation-model.js';
import {
  conversationWidths,
  defaultConversationPreferences,
} from '../shared/conversation-preferences.js';
import { ContextMeter } from './ConversationContext.js';
import { ConversationModel } from './ConversationModel.js';
import { ConversationTranscript } from './ConversationTranscript.js';
import { ConversationWidthHandle } from './ConversationWidthHandle.js';
import type { Conversation } from './use-conversation.js';
import type { useConversationPreferences } from './use-conversation-preferences.js';
import { useConversationViewport } from './use-conversation-viewport.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

export type TextOpeningFocus = 'text' | 'draft';

/**
 * The text view: the conversation text and the message field. It reads the
 * conversation and calls its commands. Closing it ends nothing: the
 * conversation, the microphone and the unsent text are kept by the caller.
 */
export function TextView({
  conversation,
  hidden = false,
  focusRequest,
  openingFocus = 'text',
  onClose,
  children,
  notice,
  draftOpen = false,
  draftCount = 0,
  onToggleDraft,
  draftContent,
  widthPreferences,
  onStartConversation,
}: {
  conversation: Conversation;
  hidden?: boolean;
  focusRequest?: number;
  openingFocus?: TextOpeningFocus;
  onClose: () => void;
  /** What is shown above the conversation text. */
  children?: ReactNode;
  /** The conversation notice, immediately above the editable message field. */
  notice?: ReactNode;
  draftOpen?: boolean;
  draftCount?: number;
  onToggleDraft?: () => void;
  draftContent?: ReactNode;
  widthPreferences?: ReturnType<typeof useConversationPreferences>;
  onStartConversation?: (chosen: HTMLElement | null) => void;
}) {
  const { session, transcript, text, pending, unknown, working } = conversation;
  const viewport = useConversationViewport();
  const { computer, mobile } = viewport;
  // A short desktop window needs the same room for composing as a touch view.
  const short = viewport.height < 520;
  const root = useRef<HTMLElement>(null);
  const widths = conversationWidths(
    widthPreferences?.preferences ?? defaultConversationPreferences,
    viewport.width,
    draftOpen,
  );
  useLayoutEffect(() => {
    const map = root.current?.closest<HTMLElement>('.household-map');
    map?.style.setProperty('--text-view-width', `${computer ? widths.textWidth : 400}px`);
    map?.style.setProperty('--draft-view-width', `${computer ? widths.draftWidth : 340}px`);
  }, [computer, widths.textWidth, widths.draftWidth]);
  const initialComputer = useRef(computer);
  const stop = working && !computer;
  const stopFocused = useRef(false);
  const endFocused = useRef(false);
  const retainedOpening = useRef<string | null>(null);
  const resumeFocused = useRef(false);
  const resume = useRef<HTMLButtonElement>(null);
  const newConversation = useRef<HTMLButtonElement>(null);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (retainedOpening.current === session?.id && session?.paused) {
      retainedOpening.current = null;
      resume.current?.focus();
    }
    if (resumeFocused.current && !session?.paused) {
      resumeFocused.current = false;
      field.current?.focus();
    }
  }, [session]);
  const firstMessage = useRef<{ text: string; asked: boolean } | null>(null);
  useEffect(() => {
    const first = firstMessage.current;
    if (!first) return;
    if (conversation.consent.asking) first.asked = true;
    if (session) {
      firstMessage.current = null;
      if (conversation.text === first.text) void conversation.send(computer);
    } else if (
      (first.asked && !conversation.consent.asking && !conversation.consent.valid && !pending) ||
      conversation.error ||
      conversation.inputBlocked
    ) {
      firstMessage.current = null;
    }
  }, [conversation, session, pending, computer]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only an explicit text-view request moves focus; resizing must preserve the current control.
  useLayoutEffect(() => {
    // On a computer the message field gets the focus when the text view opens.
    // On a mobile device and a narrow screen it does not, so that the on-screen
    // keyboard stays down. The focus then stays in the toolbar or goes to the heading.
    if (hidden || openingFocus === 'draft') return;
    if (initialComputer.current) field.current?.focus();
    else if (!document.activeElement?.closest('.workspace-tools')) heading.current?.focus();
    // Opening is the only focus trigger; resizing or revealing a keyboard must
    // preserve the user's current focus.
  }, [focusRequest]);
  const focusedDraftOpening = useRef<number | undefined | null>(null);
  useLayoutEffect(() => {
    if (
      openingFocus !== 'draft' ||
      hidden ||
      !draftOpen ||
      focusedDraftOpening.current === focusRequest
    )
      return;
    const draftHeading = root.current?.querySelector<HTMLElement>('#text-draft-title');
    if (!draftHeading) return;
    draftHeading.focus();
    focusedDraftOpening.current = focusRequest;
  }, [openingFocus, focusRequest, draftOpen, hidden]);
  // The newest row stays in view, unless the user has scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new rows
  useLayoutEffect(() => {
    if (body.current && follow.current) body.current.scrollTop = body.current.scrollHeight;
  }, [transcript, working, session?.activity, session?.activitySteps?.length]);
  useLayoutEffect(() => {
    // Present the paused state and deadline on return, above the retained text.
    if (session?.paused && body.current) body.current.scrollTop = 0;
    follow.current = !session?.paused;
  }, [session?.paused]);
  useLayoutEffect(() => {
    if (!stop && stopFocused.current) {
      stopFocused.current = false;
      field.current?.focus();
    }
  }, [stop]);
  useLayoutEffect(() => {
    if (pending) return;
    if (!session && endFocused.current && document.activeElement === document.body)
      newConversation.current?.focus();
    endFocused.current = false;
  }, [session, pending]);
  const blocked =
    conversation.inputBlocked ||
    session?.paused ||
    session?.workFailure?.code === 'assistant_draft_changed' ||
    pending ||
    unknown ||
    session?.phase === 'recovery' ||
    session?.contextSummaryState === 'summarizing' ||
    !text.trim();
  function startConversation() {
    if (onStartConversation)
      onStartConversation(
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      );
    else conversation.begin('text');
  }
  function send() {
    if (blocked || stop) return;
    if (!session) {
      firstMessage.current = { text, asked: false };
      startConversation();
      return;
    }
    void conversation.send(computer);
    // The message field keeps the focus, also after a click on Skicka.
    field.current?.focus();
  }
  return (
    <section
      ref={root}
      className={`text-view${draftOpen ? ' draft-open' : ''}`}
      data-short={short}
      data-mobile={mobile}
      aria-labelledby={`${id}-title`}
      hidden={hidden}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && working && !mobile) {
          event.preventDefault();
          event.stopPropagation();
          void conversation.cancel();
        }
      }}
    >
      <div className="text-view-columns">
        <div className="text-view-header">
          <header className="text-view-heading">
            <div className="text-view-title">
              <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
                Skriv till Skyttel
              </h2>
              <ContextMeter percentage={session?.contextPercentage} />
            </div>
            <button
              ref={newConversation}
              type="button"
              className="text-view-new"
              disabled={conversation.inputBlocked || pending}
              onClick={() => (session ? void conversation.newConversation() : startConversation())}
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
          {widthPreferences?.widthFeedback &&
            !widthPreferences.widthFeedback.includes('återställda') && (
              <p role="status">{widthPreferences.widthFeedback}</p>
            )}
          {onToggleDraft && (
            <button
              type="button"
              className="text-view-draft-toggle"
              aria-expanded={draftOpen}
              aria-label={`${draftOpen ? 'Dölj utkastet' : 'Visa utkastet'} (${draftCount})`}
              aria-controls={`${id}-draft`}
              onClick={onToggleDraft}
            >
              <span aria-hidden="true" className="draft-direction">
                {draftOpen ? '▸' : '◂'}
              </span>
              <WorkspaceIcon name="draft" />
              <span>{short ? 'Utkast' : draftOpen ? 'Dölj utkastet' : 'Visa utkastet'}</span>
              <span className="text-view-draft-count">
                {short
                  ? draftCount
                  : `${draftCount} ${draftCount === 1 ? 'osparad ändring' : 'osparade ändringar'}`}
              </span>
            </button>
          )}
        </div>
        {computer && widthPreferences?.known && draftOpen && (
          <ConversationWidthHandle
            name="Ändra utkastlistans bredd"
            value={widths.draftWidth}
            minimum={260}
            maximum={widths.available - widths.textWidth}
            controls={`${id}-draft`}
            onPreview={(draftWidth) => widthPreferences.previewWidths({ draftWidth })}
            onCommit={(draftWidth) => {
              void widthPreferences.resize({ draftWidth });
            }}
            onCancel={widthPreferences.cancelPreview}
          />
        )}
        <section
          id={`${id}-draft`}
          className="text-view-draft"
          aria-label="Utkastet"
          hidden={!draftOpen}
        >
          <h3>Utkast</h3>
          {draftContent}
        </section>
        {computer && widthPreferences?.known && (
          <div className="text-view-text-handle">
            <ConversationWidthHandle
              name="Ändra samtalstextens bredd"
              value={widths.textWidth}
              minimum={300}
              maximum={widths.available - (draftOpen ? widths.draftWidth : 0)}
              controls={`${id}-conversation`}
              onPreview={(textWidth) => widthPreferences.previewWidths({ textWidth })}
              onCommit={(textWidth) => {
                void widthPreferences.resize({ textWidth });
              }}
              onCancel={widthPreferences.cancelPreview}
            />
          </div>
        )}
        <div id={`${id}-conversation`} className="text-view-conversation">
          <div
            ref={body}
            className="text-view-body"
            onScroll={(event) => {
              const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
              follow.current = scrollHeight - scrollTop - clientHeight < 80;
            }}
          >
            {session && (
              <div className="text-view-lifetime">
                {session.expiresAt && (
                  <p role="status" aria-label="Samtalets livslängd">
                    {session.paused && 'Samtalet är pausat. '}
                    Löper ut{' '}
                    <time dateTime={new Date(session.expiresAt).toISOString()}>
                      {new Date(session.expiresAt).toLocaleString('sv-SE')}
                    </time>{' '}
                    efter sju dygn utan ditt meddelande eller uttrycklig återupptagning.
                    {session.paused &&
                      ' Nytt samtal tar bort det tidigare samtalet; utkastet ligger kvar.'}
                  </p>
                )}
                {session.paused && conversation.resumeConversation && (
                  <button
                    ref={resume}
                    type="button"
                    disabled={pending}
                    onClick={(event) => {
                      resumeFocused.current = document.activeElement === event.currentTarget;
                      void conversation.resumeConversation?.();
                    }}
                  >
                    Återuppta samtalet
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={(event) => {
                    endFocused.current = document.activeElement === event.currentTarget;
                    void conversation.endConversation();
                  }}
                >
                  Avsluta samtalet
                </button>
              </div>
            )}
            {conversation.listRetained && (
              <div className="text-view-lifetime">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void conversation.listRetained?.()}
                >
                  Bevarade samtal
                </button>
                {conversation.retainedConversations && (
                  <section aria-label="Bevarade samtal">
                    {conversation.retainedConversations.length ? (
                      <ul>
                        {conversation.retainedConversations.map((retained) => (
                          <li key={retained.id}>
                            <p>
                              {retained.paused ? 'Pausat samtal.' : 'Pågående samtal.'}{' '}
                              {
                                conversationModels.find(
                                  (model) => model.id === retained.modelChoice.model,
                                )?.name
                              }
                              , {reasoningLabels[retained.modelChoice.effort]}. Löper ut{' '}
                              <time dateTime={new Date(retained.expiresAt).toISOString()}>
                                {new Date(retained.expiresAt).toLocaleString('sv-SE')}
                              </time>
                              .
                            </p>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                retainedOpening.current = retained.id;
                                void conversation.openRetained?.(retained.id).then((opened) => {
                                  if (!opened) retainedOpening.current = null;
                                });
                              }}
                            >
                              Öppna {retained.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Inga bevarade samtal.</p>
                    )}
                  </section>
                )}
              </div>
            )}
            {children}
            <ConversationTranscript
              rows={transcript}
              working={working}
              activity={
                session?.contextSummaryState === 'summarizing'
                  ? 'Sammanfattar samtalet'
                  : session?.activity
              }
              activitySteps={session?.activitySteps}
              computer={computer}
              announce={!hidden}
              announceWorking={false}
            />
            {session?.capacityPaused && (
              <p id={`${id}-scope-help`}>
                Skriv ett nytt avgränsat uppdrag som står för sig självt. Ange mål och alla
                begränsningar som gäller. Tidigare oavslutat arbete och kön ligger kvar pausade.
              </p>
            )}
          </div>
          <p className="text-view-canceled" aria-live="polite" aria-atomic="true">
            {session?.canceled ? 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.' : ''}
          </p>
          {notice}
          <div className="text-view-model">
            <ConversationModel conversation={conversation} />
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
              rows={short ? 1 : 2}
              maxLength={4000}
              aria-describedby={session?.capacityPaused ? `${id}-scope-help` : undefined}
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
                {session?.capacityPaused ? 'Avgränsa uppdraget' : 'Skicka'}
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
