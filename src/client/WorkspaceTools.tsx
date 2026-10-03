import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import logo from '../../docs/images/shuttle-logo-transparent-small.png';
import { microphoneShortcut, useMicrophonePress } from './use-microphone-press.js';
import { type TextButtonStatus, textButtonStatusWords } from './use-text-button-status.js';
import type { Voice } from './use-voice.js';

const paths = {
  navigate: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M16 8l-2 6-6 2 2-6 6-2',
  minimize: 'M3 3h18v18H3zM13 13h6v6h-6zM6 6l5 5M7 11h4V7',
  maximize: 'M3 3h18v18H3zM13 13l5 5m-5 0h5v-5M11 11 6 6m0 5V6h5',
  panLeft: 'M20 12H4m6-6-6 6 6 6',
  panRight: 'M4 12h16m-6-6 6 6-6 6',
  panUp: 'M12 20V4m-6 6 6-6 6 6',
  panDown: 'M12 4v16m-6-6 6 6 6-6',
  rotateLeft: 'M4 4v6h6M4 10a8 8 0 1 1 1 8',
  rotateRight: 'M20 4v6h-6M20 10a8 8 0 1 0-1 8',
  tiltUp: 'M4 18h16M7 14V9a5 5 0 0 1 10 0v5m-4-4 4 4 4-4',
  tiltDown: 'M4 6h16M7 10v5a5 5 0 0 0 10 0v-5m-4 4 4-4 4 4',
  zoomIn: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M7 10h6M10 7v6',
  zoomOut: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M7 10h6',
  depthForward: 'M5 17h10v4H5zM10 16V3m-4 4 4-4 4 4M18 9l3 3-3 3',
  depthBackward: 'M5 3h10v4H5zM10 8v13m-4-4 4 4 4-4M18 9l3 3-3 3',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  text: 'M4 5h16M12 5v15M8 20h8',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 11v6M12 7h.01',
  expand: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M18 6 6 18',
  draft: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  detail: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  focus: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  overview: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 12h8M12 8v8',
  returnView: 'm9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-4',
};

export function WorkspaceIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export type WorkspaceTarget = 'list' | 'conversation' | 'voice' | 'search' | 'draft';

/** The name of the toolbar button that opens and closes the text view. */
export const textViewButtonName = 'Skriv till Skyttel';

export function WorkspaceTools({
  onOpen,
  account,
  onSettings,
  profileRequested = false,
  onReturnWork,
  theme,
  onDetails,
  detailsAvailable = false,
  detailsVisible = false,
  voiceControl,
  voiceBox,
  holdVoice,
  textViewOpen = false,
  textButton,
  cameraMount,
  expanded,
  onExpandedChange,
  conversationUnavailable = false,
  conversationOngoing = false,
}: {
  conversationUnavailable?: boolean;
  conversationOngoing?: boolean;
  /** Opens a tool. The chosen button is where a conversation's consent box opens. */
  onOpen: (target: WorkspaceTarget, chosen: HTMLElement) => void;
  account?: ReactNode;
  onSettings?: () => void;
  profileRequested?: boolean;
  onReturnWork?: () => boolean;
  theme?: ReactNode;
  onDetails?: () => void;
  detailsAvailable?: boolean;
  detailsVisible?: boolean;
  /** The microphone of the conversation that is going on. Null when none is. */
  voiceControl?: Pick<Voice, 'microphone' | 'starting' | 'disabled' | 'activate'> | null;
  holdVoice?: { canHold: boolean; prepare: () => void; start: () => void; release: () => void };
  /** The voice box. It follows the conversation buttons in the reading order. */
  voiceBox?: ReactNode;
  textViewOpen?: boolean;
  textButton?: { status: TextButtonStatus | null };
  cameraMount?: (element: HTMLDivElement | null) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [utility, setUtility] = useState<'help' | 'profile' | null>(
    profileRequested ? 'profile' : null,
  );
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const expansionControl = useRef<HTMLButtonElement>(null);
  const tools = useRef<HTMLElement>(null);
  const microphoneButton = useRef<HTMLButtonElement>(null);
  const microphonePress = useMicrophonePress({
    button: microphoneButton,
    canHold: () =>
      Boolean(
        holdVoice?.canHold &&
          !conversationUnavailable &&
          !voiceControl?.disabled &&
          !voiceControl?.starting &&
          voiceControl?.microphone !== 'on' &&
          navigator.onLine !== false,
      ),
    prepare: () => holdVoice?.prepare(),
    startHeld: () => holdVoice?.start(),
    releaseHeld: () => holdVoice?.release(),
    short: () => {
      onExpandedChange(false);
      setUtility(null);
      if (voiceControl && !conversationUnavailable) voiceControl.activate();
      else if (microphoneButton.current) onOpen('voice', microphoneButton.current);
    },
  });
  const [touch, setTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const change = () => setTouch(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const microphoneDescription = voiceControl?.starting
    ? 'Avbryt starten av rösten'
    : `Prata med Skyttel (${microphoneShortcut()}). Håll in för att tala tills du släpper.`;
  const voiceDescription = `${microphoneDescription}${conversationUnavailable && !conversationOngoing ? ' Inte tillgängligt just nu.' : ''}`;
  const utilityPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (utility) utilityPanel.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [utility]);
  useEffect(() => {
    if (!utility) return;
    const dismissWhenLeaving = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || utilityPanel.current?.contains(target)) return;
      if (tools.current?.contains(target)) {
        const box = target.getBoundingClientRect();
        const covering = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (!utilityPanel.current?.contains(covering)) return;
      }
      setUtility(null);
    };
    document.addEventListener('focusin', dismissWhenLeaving);
    return () => document.removeEventListener('focusin', dismissWhenLeaving);
  }, [utility]);
  function closeUtility() {
    setUtility(null);
    if (utility === 'profile' && onReturnWork?.()) return;
    const trigger = returnFocus.current;
    if (trigger?.offsetWidth && trigger.offsetHeight) trigger.focus();
    else expansionControl.current?.focus();
  }
  return (
    <>
      <nav
        ref={tools}
        className={`workspace-tools${expanded ? ' expanded' : ''}`}
        aria-label="Kartans verktyg"
        id="workspace-tools"
        tabIndex={-1}
      >
        <a
          className="workspace-brand"
          href="#workspace-tools"
          aria-label="Skyttel, kartans verktyg"
        >
          <img src={logo} alt="" />
          <span>skyttel.</span>
        </a>
        {(
          [
            ['mic', 'Prata med Skyttel', 'voice'],
            ['text', textViewButtonName, 'conversation'],
            ['search', 'Sök i kartan', 'search'],
            ['list', 'Lista', 'list'],
            ['draft', 'Utkast och historik', 'draft'],
          ] as const
        ).map(([icon, label, target]) => (
          <Fragment key={target}>
            <button
              ref={target === 'voice' ? microphoneButton : undefined}
              type="button"
              // The name stays. The description says what a press does while the voice starts.
              title={
                target === 'voice'
                  ? touch
                    ? undefined
                    : voiceDescription
                  : target === 'conversation' && conversationUnavailable && !conversationOngoing
                    ? `${label}. Inte tillgängligt just nu.`
                    : label
              }
              aria-label={
                target === 'conversation' && textButton?.status
                  ? `${label}. ${textButtonStatusWords[textButton.status]}.`
                  : label
              }
              aria-description={
                target === 'voice' && !touch
                  ? voiceDescription
                  : (target === 'voice' || target === 'conversation') &&
                      conversationUnavailable &&
                      !conversationOngoing
                    ? `${label}. Inte tillgängligt just nu.`
                    : undefined
              }
              data-held={(target === 'voice' && microphonePress.held) || undefined}
              data-secondary={target === 'draft' || target === 'search' || undefined}
              className={
                target === 'voice'
                  ? 'workspace-talk'
                  : target === 'conversation'
                    ? 'workspace-text'
                    : undefined
              }
              data-unavailable={
                (conversationUnavailable &&
                  (target === 'voice' || (target === 'conversation' && !conversationOngoing))) ||
                undefined
              }
              disabled={
                target === 'voice' && conversationOngoing
                  ? !conversationUnavailable && voiceControl?.disabled
                  : undefined
              }
              aria-disabled={
                (target === 'voice' && conversationOngoing && conversationUnavailable) || undefined
              }
              aria-pressed={target === 'voice' ? voiceControl?.microphone === 'on' : undefined}
              aria-expanded={target === 'conversation' ? textViewOpen : undefined}
              onClick={(event) => {
                if (target === 'voice') {
                  microphonePress.onClick(event);
                  return;
                }
                onExpandedChange(false);
                setUtility(null);
                onOpen(target, event.currentTarget);
              }}
              onPointerDown={target === 'voice' ? microphonePress.onPointerDown : undefined}
              onPointerUp={target === 'voice' ? microphonePress.onPointerUp : undefined}
              onPointerCancel={target === 'voice' ? microphonePress.onPointerCancel : undefined}
              onLostPointerCapture={
                target === 'voice' ? microphonePress.onLostPointerCapture : undefined
              }
              onContextMenu={target === 'voice' ? microphonePress.onContextMenu : undefined}
            >
              <WorkspaceIcon name={icon} />
              <span>{label}</span>
              {target === 'conversation' && textButton?.status && (
                <i
                  className="text-button-marker"
                  data-status={textButton.status}
                  aria-hidden="true"
                >
                  {textButton.status === 'working' ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3a9 9 0 1 1-9 9" />
                    </svg>
                  ) : textButton.status === 'waiting' ? (
                    '?'
                  ) : (
                    '•••'
                  )}
                </i>
              )}
            </button>
            {target === 'conversation' && voiceBox}
          </Fragment>
        ))}
        {onDetails && (
          <button
            type="button"
            title="Visa detaljer"
            aria-label="Visa detaljer"
            aria-pressed={detailsVisible}
            disabled={!detailsAvailable}
            onClick={() => {
              onExpandedChange(false);
              setUtility(null);
              onDetails();
            }}
          >
            <WorkspaceIcon name="detail" />
            <span>Visa detaljer</span>
          </button>
        )}
        <div className="workspace-camera-tools" ref={cameraMount} />
        <div className="workspace-tools-footer">
          {(
            [
              ['settings', 'Inställningar', 'settings'],
              ['profile', 'Din profil', 'profile'],
              ['info', 'Information och hjälp', 'help'],
            ] as const
          ).map(([icon, label, target]) => (
            <button
              key={target}
              type="button"
              title={label}
              aria-label={label}
              data-secondary
              aria-expanded={target === 'settings' ? undefined : utility === target}
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                if (target === 'settings') onSettings?.();
                else setUtility(utility === target ? null : target);
              }}
            >
              <WorkspaceIcon name={icon} />
              <span>{label}</span>
            </button>
          ))}
          <div className="workspace-theme-tool" data-secondary>
            {theme}
          </div>
          <button
            type="button"
            ref={expansionControl}
            aria-label={expanded ? 'Dölj verktygens namn' : 'Visa verktygens namn'}
            aria-expanded={expanded}
            onClick={() => onExpandedChange(!expanded)}
          >
            <WorkspaceIcon name="expand" />
            <span>Fäll ihop</span>
          </button>
        </div>
      </nav>
      {utility && (
        <section
          ref={utilityPanel}
          className="workspace-utility"
          aria-label={utility === 'help' ? 'Information och hjälp' : 'Din profil'}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeUtility();
            }
          }}
        >
          <button
            type="button"
            className="workspace-close"
            aria-label="Stäng verktyget"
            onClick={closeUtility}
          >
            <WorkspaceIcon name="close" />
          </button>
          {utility === 'help' ? (
            <>
              <h2 tabIndex={-1}>Information och hjälp</h2>
              <p>
                Välj Lista för att läsa och ändra objekt och samband. Skriv till Skyttel fungerar
                utan mikrofon.
              </p>
              <p>
                Alla förslag samlas i ditt privata utkast. Spara hela utkastet när du vill dela
                ändringarna med hushållet.
              </p>
              <p>
                Kartan kan också styras med tangentbord genom Navigera. Stäng arbetsytan för att
                återgå till kartan; din oskickade text finns kvar.
              </p>
            </>
          ) : (
            <>
              <h2 tabIndex={-1}>Din profil</h2>
              {account}
              <button type="button" onClick={closeUtility}>
                Tillbaka till arbetet
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
