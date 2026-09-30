import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import logo from '../../docs/images/shuttle-logo-transparent-small.png';
import { useWorkspaceTheme, WorkspaceTheme } from './WorkspaceTheme.js';
import './settings.css';

type Entry = { to: string; title: string; description: string; group: string };

export function settingsEntries(
  household: { id: string; role: 'administrator' | 'member' } | undefined,
  operator: boolean,
): Entry[] {
  const householdPath = household && `/households/${encodeURIComponent(household.id)}`;
  return [
    ...(householdPath
      ? [
          {
            to: `${householdPath}/settings/map`,
            title: 'Rymdkartan',
            description: 'Stjärnhimmel och minskad rörelse i din personliga vy.',
            group: 'Hushållets karta',
          },
          {
            to: `${householdPath}/settings/types`,
            title: 'Typer och egna fält',
            description:
              'Hushållets objekt- och sambandstyper. Förslag samlas i ditt privata utkast.',
            group: 'Hushållets karta',
          },
        ]
      : []),
    ...(household?.role === 'administrator'
      ? [
          {
            to: `${householdPath}/administration`,
            title: 'Administrera tillgång',
            description: 'Medlemmar och inbjudningar, permanent radering.',
            group: 'Administration',
          },
          {
            to: `${householdPath}/settings/export`,
            title: 'Fullständig export',
            description: 'Hämta hela hushållets information, inklusive privata uppgifter.',
            group: 'Administration',
          },
          {
            to: `${householdPath}/settings/import`,
            title: 'Återimportera hushållet',
            description: 'Granska en fullständig ersättning och följ samma importförsök.',
            group: 'Administration',
          },
          {
            to: `${householdPath}/settings/content-owners`,
            title: 'Koppla historiskt innehåll',
            description: 'Granska identiteter och bevara varje persons privata arbete.',
            group: 'Administration',
          },
        ]
      : []),
    ...(operator
      ? [
          {
            to: '/costs',
            title: 'Månadskostnad',
            description: 'Installationens drift, förbrukning, priser och antaganden.',
            group: 'Drift',
          },
        ]
      : []),
  ];
}

export function SettingsOverview({ entries }: { entries: Entry[] }) {
  return (
    <section className="settings-overview">
      <h1 tabIndex={-1}>Inställningar</h1>
      <p className="settings-intro">
        Hushållets karta, utseende och administration. Ditt pågående kartarbete finns kvar när du
        återvänder.
      </p>
      {Array.from(new Set(entries.map((entry) => entry.group))).map((group) => (
        <section key={group}>
          <h2>{group}</h2>
          <div className="settings-cards">
            {entries
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <Link to={entry.to} key={entry.to}>
                  <strong>
                    {entry.title}
                    <span aria-hidden="true">→</span>
                  </strong>
                  <span>{entry.description}</span>
                </Link>
              ))}
          </div>
        </section>
      ))}
      <section className="settings-appearance">
        <h2>Utseende</h2>
        <p>
          Välj ljust, mörkt eller systemstyrt tema med temaknappen högst upp. Ditt val följer med
          mellan kartan och inställningarna.
        </p>
      </section>
    </section>
  );
}

export function SettingsScreen({
  children,
  household,
  userName,
  operator,
  personal,
  signOut,
}: {
  children: ReactNode;
  household?: { id: string; name: string; role: 'administrator' | 'member' };
  userName: string;
  operator: boolean;
  personal: boolean;
  signOut: ReactNode;
}) {
  const location = useLocation();
  const theme = useWorkspaceTheme();
  const content = useRef<HTMLDivElement>(null);
  const focusedPath = useRef<string | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(() => window.innerWidth > 800);
  const mapPath = household ? `/households/${encodeURIComponent(household.id)}` : '/';
  const entries = personal
    ? [
        { to: '/profile', title: 'Din profil', group: 'Ditt Skyttel' },
        { to: '/login-methods', title: 'Inloggningssätt', group: 'Ditt Skyttel' },
        { to: '/assistants', title: 'Assistentanslutningar', group: 'Ditt Skyttel' },
      ].filter((entry) => location.pathname !== '/profile' || entry.to === '/profile')
    : [
        ...(household
          ? [{ to: `${mapPath}/settings`, title: 'Översikt', group: 'Inställningar' }]
          : []),
        ...settingsEntries(household, operator),
      ];
  useEffect(() => {
    const media = window.matchMedia('(min-width: 801px)');
    const update = () => setNavigationOpen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    if (focusedPath.current === location.pathname) return;
    if (window.innerWidth <= 800 && navigationOpen) {
      setNavigationOpen(false);
      return;
    }
    // Focus against the collapsed layout so the browser scrolls to the final heading position.
    focusedPath.current = location.pathname;
    content.current?.scrollTo(0, 0);
    content.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [location.pathname, navigationOpen]);
  return (
    <section className="settings-screen">
      <header className="settings-header">
        <Link className="settings-brand" to={mapPath} aria-label="Skyttel, till kartan">
          <img src={logo} alt="" />
          <span>
            Skyttel<small>{personal ? 'Ditt konto' : 'Inställningar'}</small>
          </span>
        </Link>
        <div className="settings-actions">
          <WorkspaceTheme mode={theme.mode} onChange={theme.changeMode} />
          <Link to={mapPath} className="settings-return">
            {household ? 'Tillbaka till kartan' : 'Till startsidan'}
          </Link>
        </div>
      </header>
      <div className="settings-layout">
        <nav
          className="settings-navigation"
          aria-label={personal ? 'Dina kontosidor' : 'Inställningarnas sidor'}
        >
          <details
            open={navigationOpen}
            onToggle={(event) => setNavigationOpen(event.currentTarget.open)}
          >
            <summary>Välj inställning</summary>
            <p className="settings-identity">
              {personal ? userName : (household?.name ?? 'Installationen')}
              <small>
                {personal
                  ? 'Din Skyttel-användare'
                  : household
                    ? 'Hushållets inställningar'
                    : 'Driftens inställningar'}
              </small>
            </p>
            {Array.from(new Set(entries.map((entry) => entry.group))).map((group) => (
              <section key={group}>
                <h2>{group}</h2>
                {entries
                  .filter((entry) => entry.group === group)
                  .map((entry) => (
                    <Link
                      key={entry.to}
                      to={entry.to}
                      aria-current={location.pathname === entry.to ? 'page' : undefined}
                    >
                      {entry.title}
                    </Link>
                  ))}
              </section>
            ))}
            {personal && signOut}
          </details>
        </nav>
        <div ref={content} className="settings-content">
          {children}
        </div>
      </div>
    </section>
  );
}
