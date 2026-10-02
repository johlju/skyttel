import {
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { ObjectType, ObjectValue } from '../shared/map.js';
import type { MapSelection } from '../shared/text-assistant.js';
import { ConversationTranscript } from './ConversationTranscript.js';
import { LifecycleDetails } from './Lifecycle.js';
import { MergeSourceDetails } from './ObjectMerge.js';
import { ObjectPropertiesDetails } from './ObjectProperties.js';
import { CustomFieldsDetails, ObjectTypeDetails } from './ObjectTypes.js';
import { ProfileImage } from './ProfileImage.js';
import { RelationshipTypeDetails } from './RelationshipTypes.js';
import { receiptMessage, rejectionMessage } from './SaveOperations.js';
import { VoicePanel } from './VoiceAssistant.js';
import './voice.css';
import { AssistantWorkTime } from './AssistantWorkTime.js';
import { DraftChangeSummary } from './DraftChangeSummary.js';
import { relationshipDetails } from './relationship-description.js';
import { type Conversation, useConversation } from './use-conversation.js';

function ObjectDetails({ value, type }: { value: ObjectValue | null; type: ObjectType }) {
  return value ? (
    <>
      <p>
        {value.name} · {type.name}
      </p>
      <ProfileImage householdId={type.householdId} value={value} typeName={type.name} />
      <ObjectPropertiesDetails type={type} value={value} showHidden />
      <LifecycleDetails value={value} />
      {value.identity && (
        <p>
          {value.identity === 'unresolved'
            ? 'Identiteten behöver redas ut.'
            : 'Uttryckligen ospecificerat objekt.'}
        </p>
      )}
    </>
  ) : (
    <p>Borttaget</p>
  );
}
function errorMessage(code: string) {
  if (code === 'assistant_save_not_requested')
    return 'Inget sparades. Skriv ett tydligt aktuellt sparbesked, till exempel ”Spara hela utkastet nu”, när du vill spara.';
  if (code === 'assistant_draft_changed' || code === 'assistant_conflict')
    return 'Utkastet eller kartan har ändrats. Hämta aktuellt underlag, red ut eventuella konflikter och ge ett nytt besked.';
  if (code === 'operation_pending' || code === 'assistant_save_unknown')
    return 'Sparresultatet behöver kontrolleras innan nytt arbete kan börja.';
  return 'Assistenten kunde inte slutföra uppdraget. Kontrollera utkastet och tidigare sparförsök. Du kan fortsätta i kartans formulär.';
}

type AssistantActivity = { working: boolean; needsAnswer: boolean };

type ConversationPresentation = {
  statusContent?: (assistant: AssistantActivity & { compact: boolean }) => ReactNode;
  statusOpen?: boolean;
  onCloseStatus?: () => void;
  onOpenStatus?: () => void;
  active?: boolean;
  conversationVisible?: boolean;
  onOpenConversation?: () => void;
  householdId: string;
  children?: ReactNode | ((assistant: AssistantActivity) => ReactNode);
  draftSummary?: ReactNode;
  inspector?: ReactNode;
  renderWorkspace?: (
    work: ReactNode,
    conversation: ReactNode,
    floatingStatus: RefObject<HTMLDivElement | null>,
  ) => ReactNode;
};

/** A conversation that keeps its own state, for use outside the household's map. */
export function TextAssistant({
  onMapChange,
  onAccessLost,
  onSelectItem,
  ...presentation
}: ConversationPresentation & {
  onMapChange: () => void;
  onAccessLost: () => void;
  onSelectItem: (target: MapSelection, signal: AbortSignal) => Promise<boolean>;
}) {
  const conversation = useConversation({
    householdId: presentation.householdId,
    onMapChange,
    onAccessLost,
    onSelectItem,
  });
  return <ConversationWorkspace conversation={conversation} {...presentation} />;
}

/**
 * Shows the conversation in the status card and the panels and calls its
 * commands. The conversation itself is kept by the caller.
 */
export function ConversationWorkspace({
  conversation,
  active: workVisible = true,
  householdId,
  children,
  draftSummary,
  inspector,
  renderWorkspace,
  conversationVisible = true,
  onOpenConversation,
  statusContent,
  statusOpen = false,
  onCloseStatus,
  onOpenStatus,
}: ConversationPresentation & { conversation: Conversation }) {
  const { available, session, transcript, text, pending, error, unknown, needsAnswer } =
    conversation;
  const { externalAi, mapWork } = conversation.consent;
  // The status card is shown in the conversation panel, or floats over the map
  // when that panel is not visible. It is rendered where it is shown.
  const [statusSlot, setStatusSlot] = useState<HTMLDivElement | null>(null);
  const [floatingSlot, setFloatingSlot] = useState<HTMLDivElement | null>(null);
  const floatingVoice = useRef<HTMLDivElement | null>(null);
  const attachFloatingSlot = useCallback((element: HTMLDivElement | null) => {
    floatingVoice.current = element;
    setFloatingSlot(element);
  }, []);
  const [voiceInformationSession, setVoiceInformationSession] = useState<string | null>(null);
  const workspace = useRef<HTMLElement>(null);
  const floating = Boolean(
    renderWorkspace &&
      (session || statusContent) &&
      (statusOpen || !workVisible || !conversationVisible),
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
            ? 'Assistenten arbetar… Du kan avbryta eller ge ett nytt uppdrag.'
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
        {conversation.workStarted !== null && (
          <AssistantWorkTime started={conversation.workStarted} />
        )}
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
          {onOpenConversation && (
            <button type="button" onClick={onOpenConversation}>
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
        {floating && onOpenConversation && (
          <button type="button" onClick={onOpenConversation}>
            Öppna samtalet
          </button>
        )}
        {(unknown || session.phase === 'recovery') && (
          <button type="button" disabled={pending} onClick={() => void conversation.recover()}>
            Kontrollera sparresultat
          </button>
        )}
      </div>
      <details className="conversation-more" open={!floating} hidden={compactStatus}>
        <summary>Samtalskontroller</summary>
        <div className="voice-controls">
          {!unknown && session.phase !== 'recovery' && (
            <button type="button" disabled={pending} onClick={() => void conversation.recover()}>
              Kontrollera sparresultat
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => void conversation.end()}>
            Avsluta samtalet
          </button>
        </div>
        <p className="conversation-retention">
          Avslut tar bort samtalsminnet. Utkast och sparresultat finns kvar.
        </p>
      </details>
    </div>
  );
  const voice = (
    <section
      aria-label="Talsamtal"
      className="assistant-bar"
      hidden={!workVisible && !session && !statusContent}
    >
      {session ? (
        <VoicePanel
          voice={conversation.voice}
          working={conversation.working}
          compact={floating}
          information={{
            open: voiceInformationSession === session.id,
            onOpenChange: (open) => setVoiceInformationSession(open ? session.id : null),
          }}
        >
          {conversationControls}
        </VoicePanel>
      ) : floating ? (
        <div className="assistant-bar-heading">
          <span className="microphone-state">Mikrofonen är av</span>
          <button type="button" onClick={onOpenConversation}>
            Tala eller skriv
          </button>
        </div>
      ) : (
        <>
          <div className="assistant-bar-heading">
            <h3>Tala med Skyttel</h3>
            <span className="microphone-state">Mikrofonen är av</span>
          </div>
          {available === null && (
            <p className="assistant-loading">Hämtar samtalets tillgänglighet…</p>
          )}
          {available === false && (
            <p>Textassistenten är inte tillgänglig. Du kan använda kartan och formulären.</p>
          )}
          {!session && available && (
            <>
              <p>
                OpenAI behandlar ditt meddelande, hela ditt eget utkast och relevanta kartuppgifter.
                Om du startar röst behandlas även ditt ljud. Mikrofonen startar först när du väljer
                det. Samtalet sparas inte i Skyttels hushållsinnehåll. Skriv inga lösenord eller
                fullständiga konto- och kortnummer.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={externalAi}
                  onChange={(event) =>
                    conversation.setConsent({ externalAi: event.target.checked })
                  }
                />{' '}
                Jag tillåter att OpenAI behandlar uppgifterna i detta samtal.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={mapWork}
                  onChange={(event) => conversation.setConsent({ mapWork: event.target.checked })}
                />{' '}
                Jag tillåter förslag och sparande av hela mitt utkast när jag uttryckligen ber om
                det.
              </label>
              <div className="voice-controls">
                <button
                  type="button"
                  className="primary"
                  disabled={pending || !externalAi || !mapWork}
                  onClick={() => void conversation.start(true)}
                >
                  Starta talsamtal
                </button>
                <button
                  type="button"
                  disabled={pending || !externalAi || !mapWork}
                  onClick={() => void conversation.start()}
                >
                  Starta textassistenten
                </button>
              </div>
            </>
          )}
        </>
      )}
      {!session && error && <p role="alert">{error}</p>}
    </section>
  );
  const changes = (
    <section aria-label="Ändringar under samtalet" className="assistant-panel assistant-changes">
      <h3>Ändringar under samtalet</h3>
      {review ? (
        <section aria-label="Assistentens hela utkast">
          <h4>Hela ditt utkast</h4>
          <p>
            Även tidigare förslag från formulär och andra klienter ingår. Ett sparbesked gäller allt
            som visas här.
          </p>
          {!review.changes.length &&
            !review.relationships?.length &&
            !review.objectTypes?.length &&
            !review.relationshipTypes?.length && <p>Inga förslag.</p>}
          <DraftChangeSummary review={review} />
          {Boolean(review.conflicts.length || review.unresolvedIdentities.length) && (
            <p>Utkastet har konflikter eller olösta identiteter. Red ut dem före sparande.</p>
          )}
          <details>
            <summary>Visa hela utkastets detaljer</summary>
            {review.changes.map((change) => (
              <article key={change.id}>
                <h5>{change.after?.name ?? change.before?.name}</h5>
                {change.before && (
                  <>
                    <p>Tidigare:</p>
                    <ObjectDetails value={change.before} type={change.beforeType ?? change.type} />
                  </>
                )}
                <p>Förslag:</p>
                <ObjectDetails value={change.after} type={change.type} />
                {change.merge && (
                  <MergeSourceDetails merge={change.merge} householdId={householdId} />
                )}
              </article>
            ))}
            {review.relationships?.map((change) => (
              <article key={change.id}>
                <h5>{change.type.name}</h5>
                {[change.before, change.after].map((value, index) => (
                  <div key={index === 0 ? 'before' : 'after'}>
                    <p>
                      {index === 0 ? 'Tidigare' : 'Förslag'}:{' '}
                      {value
                        ? relationshipDetails(
                            value,
                            change.type.forwardLabel ?? change.type.name,
                            change.objectNames,
                          )
                        : 'Borttaget'}
                    </p>
                    {value && (
                      <>
                        <CustomFieldsDetails
                          type={index === 0 ? (change.beforeType ?? change.type) : change.type}
                          values={value.customValues}
                          showHidden
                        />
                        <LifecycleDetails value={value} />
                      </>
                    )}
                  </div>
                ))}
              </article>
            ))}
            {review.objectTypes?.map((change) => (
              <article key={change.id}>
                <p>Objekttyp före:</p>
                <ObjectTypeDetails type={change.before} />
                <p>Objekttyp efter:</p>
                <ObjectTypeDetails
                  type={
                    change.after
                      ? { ...change.after, id: change.id, householdId, revision: 0 }
                      : null
                  }
                />
              </article>
            ))}
            {review.relationshipTypes?.map((change) => (
              <article key={change.id}>
                <p>Sambandstyp före:</p>
                <RelationshipTypeDetails type={change.before} />
                <p>Sambandstyp efter:</p>
                <RelationshipTypeDetails
                  type={
                    change.after
                      ? { ...change.after, id: change.id, householdId, revision: 0 }
                      : null
                  }
                />
              </article>
            ))}
            {review.conflicts.map((conflict) => {
              const objectChange = review.changes.find((change) => change.id === conflict.id);
              const edgeChange = review.relationships?.find((change) => change.id === conflict.id);
              return (
                <article key={`${conflict.kind}-${conflict.id}`}>
                  <h5>Konflikt: aktuellt sparat värde</h5>
                  {conflict.kind === 'object' && objectChange && (
                    <ObjectDetails
                      value={conflict.current}
                      type={
                        review.current?.types.find(
                          (type) => type.id === conflict.current?.typeId,
                        ) ?? objectChange.type
                      }
                    />
                  )}
                  {conflict.kind === 'objectType' && <ObjectTypeDetails type={conflict.current} />}
                  {conflict.kind === 'relationshipType' && (
                    <RelationshipTypeDetails type={conflict.current} />
                  )}
                  {conflict.kind === 'relationship' && (
                    <>
                      <p>
                        {conflict.current
                          ? relationshipDetails(
                              conflict.current,
                              review.current?.relationshipTypes.find(
                                (type) => type.id === conflict.current?.typeId,
                              )?.forwardLabel,
                              edgeChange?.objectNames,
                            )
                          : 'Finns inte i kartan'}
                      </p>
                      {conflict.current && <LifecycleDetails value={conflict.current} />}
                    </>
                  )}
                  {conflict.type !== undefined && (
                    <p>
                      {conflict.type
                        ? `Typen har ändrats: ${conflict.type.name}. ${conflict.type.description}`
                        : 'Typen finns inte längre.'}
                    </p>
                  )}
                  {Boolean(conflict.missingEndpoints?.length) && (
                    <p>Sambandet hänvisar till borttagna objekt.</p>
                  )}
                  {Boolean(conflict.duplicates?.length) && (
                    <p>Motsvarande samband finns redan i kartan.</p>
                  )}
                  {Boolean(conflict.connections?.length) && (
                    <p>Borttagningen berör även sparade samband.</p>
                  )}
                </article>
              );
            })}
          </details>
        </section>
      ) : (
        (draftSummary ?? (
          <p className="assistant-empty">
            Inga ändringar föreslås ännu. Berätta för att lägga till eller rätta en uppgift.
          </p>
        ))
      )}
      <p className="assistant-save-note">
        Förslag ligger i ditt privata utkast tills du sparar hela utkastet.
      </p>
    </section>
  );
  const conversationPanel = (
    <section aria-label="Samtalet" className="assistant-panel assistant-conversation">
      <div className="assistant-panel-heading">
        <h3>Samtalet</h3>
        <span className="muted">Svenska · tal och text</span>
      </div>
      {!session && (
        <div className="assistant-transcript-empty">
          Här visas vad du säger och vad Skyttel svarar.
        </div>
      )}
      {session && (
        <>
          {transcript.length > 0 && <ConversationTranscript rows={transcript} />}
          <form
            className="assistant-message-form"
            onSubmit={(event) => {
              event.preventDefault();
              void conversation.send();
            }}
          >
            <label htmlFor="text-assistant-message">Meddelande till textassistenten</label>
            <textarea
              placeholder="Berätta vad du vill göra…"
              id="text-assistant-message"
              maxLength={4000}
              value={text}
              onChange={(event) => conversation.setText(event.target.value)}
            />
            <button
              type="submit"
              disabled={pending || unknown || session.phase === 'recovery' || !text.trim()}
            >
              Skicka
            </button>
          </form>
          {session.receipt && (
            <details>
              <summary>Visa kvittot</summary>
              <p>{receiptMessage(session.receipt)}</p>
              <p>Sparat: {session.receipt.savedAt}</p>
            </details>
          )}
          <details open={session.phase === 'recovery'}>
            <summary>Tidigare sparförsök</summary>
            {!session.operations.length && <p>Inga registrerade sparförsök.</p>}
            {session.operations.map((operation) => (
              <article key={operation.operationId}>
                <p>
                  {operation.status === 'succeeded'
                    ? receiptMessage(operation.receipt)
                    : operation.status === 'rejected'
                      ? rejectionMessage(operation.error)
                      : `Väntande sparförsök: ${operation.operationId}`}
                </p>
                {operation.status === 'pending' && (
                  <button
                    type="button"
                    disabled={pending || session.phase === 'working'}
                    onClick={() => void conversation.retry(operation.operationId)}
                  >
                    Slutför samma sparförsök
                  </button>
                )}
              </article>
            ))}
          </details>
        </>
      )}
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
      {statusOpen && text && (
        <p>
          Oskickat samtalsmeddelande finns kvar.{' '}
          <button type="button" onClick={onOpenConversation}>
            Fortsätt skriva
          </button>
        </p>
      )}
    </section>
  );
  return (
    <section
      ref={workspace}
      aria-label="Skyttels textassistent"
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
          <>
            <div ref={setStatusSlot} />
            {conversationPanel}
            {changes}
          </>,
          floatingVoice,
        )
      ) : (
        <>
          <div ref={setStatusSlot} />
          <div className="assistant-layout" hidden={!workVisible}>
            {work && <div className="assistant-map-panel">{work}</div>}
            <div className="assistant-side">
              {inspector && <div className="assistant-panel">{inspector}</div>}
              {changes}
              {conversationPanel}
            </div>
          </div>
        </>
      )}
      {/* In scroll flow, the floating status card must not shift a panel
          heading that received focus during the same commit. */}
      {renderWorkspace && <div ref={attachFloatingSlot} className="workspace-voice-controls" />}
    </section>
  );
}
