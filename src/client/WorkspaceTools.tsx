import { type ReactNode, useEffect, useRef, useState } from 'react';
import logo from '../../docs/images/shuttle-logo-transparent-small.png';

const paths = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
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
}: {
  onOpen: (target: WorkspaceTarget) => void;
  account?: ReactNode;
  onSettings?: () => void;
  profileRequested?: boolean;
  onReturnWork?: () => boolean;
  theme?: ReactNode;
  onDetails?: () => void;
  detailsAvailable?: boolean;
  detailsVisible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [utility, setUtility] = useState<'help' | 'profile' | null>(
    profileRequested ? 'profile' : null,
  );
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const expansionControl = useRef<HTMLButtonElement>(null);
  const tools = useRef<HTMLElement>(null);
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
            ['text', 'Samtal och text', 'conversation'],
            ['search', 'Sök i kartan', 'search'],
            ['list', 'Lista', 'list'],
            ['draft', 'Utkast och historik', 'draft'],
          ] as const
        ).map(([icon, label, target]) => (
          <button
            key={target}
            type="button"
            title={label}
            aria-label={label}
            data-secondary={target === 'draft' || target === 'search' || undefined}
            className={target === 'voice' ? 'workspace-talk' : undefined}
            onClick={() => {
              setExpanded(false);
              setUtility(null);
              onOpen(target);
            }}
          >
            <WorkspaceIcon name={icon} />
            <span>{label}</span>
          </button>
        ))}
        {onDetails && (
          <button
            type="button"
            title="Visa detaljer"
            aria-label="Visa detaljer"
            aria-pressed={detailsVisible}
            disabled={!detailsAvailable}
            onClick={() => {
              setExpanded(false);
              setUtility(null);
              onDetails();
            }}
          >
            <WorkspaceIcon name="detail" />
            <span>Visa detaljer</span>
          </button>
        )}
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
            onClick={() => setExpanded(!expanded)}
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
                Välj Lista för att läsa och ändra objekt och samband. Samtal och text fungerar utan
                mikrofon.
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
