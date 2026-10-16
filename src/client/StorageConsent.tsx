// Adapted from Viscalyx CookieConsentBanner and CookieSettings; see CookieStorage.LICENSE.
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { browserBindingLock } from './browser-binding.js';
import { claimLoginOffer, setLoginOffers } from './login-offer.js';
import { trapDialogTab, usableFocusTarget } from './modal-focus.js';
import {
  readStorageConsent,
  resetStorageConsent,
  useStorageConsent,
  writeStorageConsent,
} from './storage-consent.js';
import { useStoragePreference } from './use-storage-preference.js';
import './cookie-storage.css';
import './consent-banner.css';

const ConsentContext = createContext<ReturnType<typeof useConsentManager> | null>(null);
export const useConsentManagerContext = () => useContext(ConsentContext);

export const bannerDescription =
  'Skyttel använder nödvändig lagring för säker inloggning och funktioner du begär. Du kan också tillåta preferenskakor för ihågkommen inloggning. Tillståndet aktiverar inte funktionen; det väljer du separat efter inloggning. Du kan ändra eller återkalla ditt val under Kakor och lagring.';

function useConsentManager(userId?: string) {
  const consent = useStorageConsent();
  const preference = useStoragePreference(userId);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [bannerPending, setBannerPending] = useState(false);
  const busy = useRef(false);
  const owner = useRef(userId);
  const generation = useRef(0);
  const invalidatedBinding = useRef('');
  const consentAtEntry = useRef(readStorageConsent()?.preferences ?? false);
  const initialSessionChecked = useRef(false);
  const blocked = saving || ['saving', 'checking', 'unknown'].includes(preference.state);
  useLayoutEffect(() => {
    owner.current = userId;
    generation.current++;
    busy.current = false;
    setError('');
    setMessage('');
    setSaving(false);
    setBannerPending(false);
  }, [userId]);
  useEffect(() => {
    const current = preference.saved;
    if (!current || blocked) return;
    const missingPermission =
      !consent?.preferences || (!initialSessionChecked.current && !consentAtEntry.current);
    initialSessionChecked.current = true;
    if (
      !current.remembered ||
      !missingPermission ||
      invalidatedBinding.current === current.bindingId
    )
      return;
    invalidatedBinding.current = current.bindingId;
    void preference.change(false);
  }, [consent?.preferences, blocked, preference.saved, preference.change]);

  async function save(preferences: boolean, { reset = false, showConfirmation = true } = {}) {
    if (busy.current || blocked || owner.current !== userId) return false;
    busy.current = true;
    const ticket = generation.current;
    setSaving(true);
    setBannerPending(true);
    setError('');
    setMessage('');
    try {
      // Remove permission before any server await. Other tabs re-read this
      // record before explicit activation; notifications confer no authority.
      let choice: ReturnType<typeof writeStorageConsent> | undefined;
      let consentFailed = false;
      try {
        choice = writeStorageConsent(preferences);
      } catch (error) {
        if (preferences) throw error;
        consentFailed = true;
        // A failed write must not leave an earlier permission in place when
        // deletion remains available. Server demotion is still required even
        // when both browser operations fail.
        try {
          resetStorageConsent();
        } catch {
          /* Keep the browser failure explicit after the independent demotion. */
        }
        setError('Lagringsvalet kunde inte sparas. Avstängningen kontrolleras separat.');
      }
      if (userId && !preference.saved) throw new Error('session_unconfirmed');
      if (!preferences && preference.saved?.remembered) {
        invalidatedBinding.current = preference.saved.bindingId;
        if (!(await preference.change(false, reset && !consentFailed, choice?.decidedAt)))
          return false;
      } else if (reset && !consentFailed) resetStorageConsent(choice?.decidedAt);
      if (ticket !== generation.current) return false;
      if (consentFailed) throw new Error('consent_unconfirmed');
      if (reset && readStorageConsent()?.decidedAt === choice?.decidedAt)
        throw new Error('consent_reset_unconfirmed');
      setMessage(
        reset
          ? readStorageConsent()
            ? 'Avstängningen är bekräftad. Ett nyare lagringsval bevaras.'
            : 'Lagringssamtycket är återställt.'
          : showConfirmation
            ? 'Dina lagringspreferenser är sparade.'
            : '',
      );
      setBannerPending(false);
      return true;
    } catch {
      setError(
        'Kakvalet kunde inte sparas och bekräftas. Försök spara igen. Ett tidigare sparat val kan finnas kvar i andra flikar eller efter omladdning. Du kan fortsätta med endast nödvändig lagring.',
      );
      return false;
    } finally {
      if (ticket === generation.current) {
        busy.current = false;
        setSaving(false);
      }
    }
  }
  useEffect(() => {
    if (preference.state === 'saved') setBannerPending(false);
  }, [preference.state]);
  return { consent, preference, save, error, message, saving, blocked, bannerPending };
}

export function StorageConsentProvider({
  userId,
  loginId,
  children,
  suppressBanner = false,
}: {
  userId?: string;
  loginId?: string;
  children: ReactNode;
  suppressBanner?: boolean;
}) {
  const manager = useConsentManager(userId);
  const [bypassed, setBypassed] = useState(false);
  const show = !suppressBanner && !bypassed && (!manager.consent || manager.bannerPending);
  return (
    <ConsentContext value={manager}>
      {children}
      {show && <ConsentBanner onLeave={() => setBypassed(true)} />}
      {!suppressBanner &&
        !show &&
        (['saving', 'checking', 'saved', 'unknown', 'rejected', 'restored'].includes(
          manager.preference.state,
        ) ||
          manager.preference.recoveryMessage ||
          manager.error ||
          manager.message) && (
          <div className="cookie-storage storage-notice">
            <ConsentFeedback />
          </div>
        )}
      {userId && loginId && !show && <RememberedLoginOffer userId={userId} loginId={loginId} />}
    </ConsentContext>
  );
}

function RememberedLoginOffer({ userId, loginId }: { userId: string; loginId: string }) {
  const manager = useContext(ConsentContext);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const checkedLogin = useRef('');
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (
      !manager?.consent?.preferences ||
      manager.preference.saved?.sessionId !== loginId ||
      manager.preference.saved.remembered ||
      checkedLogin.current === loginId
    )
      return;
    checkedLogin.current = loginId;
    void navigator.locks?.request(browserBindingLock, () => {
      try {
        if (claimLoginOffer(userId, loginId) && !manager.blocked) {
          origin.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setOpen(true);
        }
      } catch {
        /* Do not repeat an offer whose claim cannot be recorded. */
      }
    });
  }, [userId, loginId, manager?.consent?.preferences, manager?.preference.saved, manager?.blocked]);
  useEffect(() => {
    if (!open) return;
    const shown = dialog.current;
    shown?.showModal();
    shown?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      shown?.close();
      if (usableFocusTarget(origin.current)) origin.current.focus();
    };
  }, [open]);
  if (!open || !manager) return null;
  const pending = manager.saving || ['saving', 'checking'].includes(manager.preference.state);
  const unknown = manager.preference.state === 'unknown';
  return (
    <dialog
      ref={dialog}
      className="cookie-storage cookie-storage-reset-dialog"
      aria-labelledby="remembered-login-offer-title"
      onKeyDown={trapDialogTab}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending && !unknown) setOpen(false);
      }}
    >
      <h2 id="remembered-login-offer-title">Kom ihåg mig i Skyttel</h2>
      <p>
        Vill du behålla din inloggning i Skyttel i den här webbläsaren? Det gäller högst sju dygn
        från den ursprungliga inloggningen. Detta ändrar inte ditt Google- eller Microsoft-konto.
        Välj bara detta på en egen enhet.
      </p>
      <ConsentFeedback onLogin={() => setOpen(false)} />
      {error && <p role="alert">{error}</p>}
      <footer>
        <button
          type="button"
          disabled={manager.blocked}
          onClick={() =>
            void manager.preference.change(true).then((saved) => {
              if (saved) setOpen(false);
            })
          }
        >
          Kom ihåg mig i Skyttel
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}>
          {unknown ? 'Lämna med okänt utfall' : 'Inte nu'}
        </button>
        <button
          type="button"
          disabled={manager.blocked}
          onClick={() => {
            try {
              setLoginOffers(userId, false);
              setOpen(false);
            } catch {
              setError('Förslagsvalet kunde inte sparas. Försök igen.');
            }
          }}
        >
          Fråga inte igen
        </button>
      </footer>
    </dialog>
  );
}

export function ConsentIcon({
  kind = 'cookie',
}: {
  kind?: 'cookie' | 'settings' | 'shield' | 'palette';
}) {
  return (
    <svg
      aria-hidden="true"
      className={`consent-icon consent-icon-${kind}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {kind === 'settings' ? (
        <>
          <path d="m9 3 1-1h4l1 1 .5 2 2 1 2-.5 2 3-.5 2-1.5 1v2l1.5 1 .5 2-2 3-2-.5-2 1-.5 2-1 1h-4l-1-1-.5-2-2-1-2 .5-2-3 .5-2 1.5-1v-2l-1.5-1-.5-2 2-3 2 .5 2-1Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : kind === 'palette' ? (
        <>
          <path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-3-5-6-9-6Z" />
          <path d="M7 8h.01M12 6h.01M17 8h.01M5 13h.01" />
        </>
      ) : kind === 'shield' ? (
        <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-6" />
      ) : (
        <>
          <path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 5 5Z" />
          <path d="M7 9h.01M8 15h.01M13 12h.01M14 17h.01" />
        </>
      )}
    </svg>
  );
}

type StorageEntry = { name: string; purpose: string; duration: string };
export const necessaryStorageEntries: StorageEntry[] = [
  {
    name: 'better-auth.session_token',
    purpose: 'Sessionsnyckel för säker inloggning. Vid HTTPS: __Secure-better-auth.session_token.',
    duration:
      'Sessionskaka. Vanlig serveråtkomst har högst åtta timmar och 30 minuters inaktivitet.',
  },
  {
    name: 'skyttel_binding',
    purpose:
      'Binder begärd inloggning till den här webbläsaren. Vid HTTPS: __Host-skyttel_binding.',
    duration: 'Sessionskaka. Serverns åtkomstgränser gäller separat.',
  },
  {
    name: 'better-auth.state',
    purpose: 'Kontrollerar begärd leverantörsinloggning. Vid HTTPS: __Secure-better-auth.state.',
    duration: 'Fem minuter från starten. Tas bort när svaret kontrolleras.',
  },
  {
    name: 'skyttel-storage-consent',
    purpose: 'Sparar versionsbundet lagringssamtycke och beslutstid i localStorage.',
    duration:
      'Tills valet ändras, återställs, lagringen rensas eller ändrat ändamål kräver förnyelse.',
  },
  {
    name: 'skyttel-login-offer:<användar-ID>',
    purpose:
      'Sparar förslagsvalet och senaste bekräftade inloggningens referens i localStorage. Hindrar upprepade förslag och ger ingen behörighet.',
    duration:
      'Bevaras över utloggning och återställning av samtycke. Rensad webbläsarlagring kan ta bort valet.',
  },
  {
    name: 'skyttel-storage-operation:<användar-ID>',
    purpose:
      'Referens och avsikt för begärd aktivering, avstängning eller återställning i sessionStorage. Ger ingen behörighet.',
    duration:
      'Till bekräftat eller avvisat resultat, eller tills fliklagringen försvinner. Serverns resultatkontroll: 24 timmar från ändringen.',
  },
  {
    name: 'skyttel-import:<hushålls-ID>',
    purpose: 'Referens för återhämtning av samma begärda import i sessionStorage.',
    duration: 'Till avslutad återhämtning eller tills fliklagringen försvinner.',
  },
  {
    name: 'skyttel-erasure:<hushålls-ID>',
    purpose: 'Referens för återhämtning av samma begärda permanenta radering i sessionStorage.',
    duration: 'Till avslutad återhämtning eller tills fliklagringen försvinner.',
  },
];
export const preferenceStorageEntries: StorageEntry[] = [
  {
    name: 'better-auth.session_token',
    purpose: 'Behåller din inloggning i Skyttel. Vid HTTPS: __Secure-better-auth.session_token.',
    duration: 'Högst sju dygn från ursprunglig inloggning; åtkomsten kan avslutas tidigare.',
  },
  {
    name: 'skyttel_binding',
    purpose: 'Binder ihågkommen inloggning till webbläsaren. Vid HTTPS: __Host-skyttel_binding.',
    duration: 'Högst sju dygn från ursprunglig inloggning; åtkomsten kan avslutas tidigare.',
  },
];

function StorageDetails({ title, entries }: { title: string; entries: StorageEntry[] }) {
  return (
    <details className="consent-storage-details">
      <summary>
        {title} ({entries.length})
      </summary>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari needs an explicit role when list markers are hidden. */}
      <ul role="list">
        {entries.map((entry) => (
          <li key={entry.name}>
            <div className="consent-storage-name">
              <code>{entry.name}</code>
            </div>
            <div>{entry.purpose}</div>
            <div className="consent-storage-duration">
              Varaktighet: {entry.duration} • Leverantör: Skyttel
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ConsentCategories({
  preferences,
  onChange,
  disabled = false,
  feedback,
}: {
  preferences: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  feedback?: ReactNode;
}) {
  return (
    <div className="consent-categories">
      <section className="cookie-storage-card" aria-labelledby="consent-necessary-title">
        <div className="cookie-storage-card-header">
          <h3 id="consent-necessary-title">
            <ConsentIcon kind="shield" /> Nödvändig lagring{' '}
            <span className="cookie-storage-badge">Alltid aktiv</span>
          </h3>
          <label className="cookie-storage-choice">
            <input
              type="checkbox"
              role="switch"
              aria-label="Nödvändig lagring, alltid aktiv"
              aria-checked="true"
              checked
              disabled
            />
            <span aria-hidden="true" />
          </label>
        </div>
        <p>
          Säker inloggning och återhämtning av funktioner du begär. Den här lagringen kan inte
          väljas bort.
        </p>
        <StorageDetails
          title="Visa nödvändiga lagringsuppgifter"
          entries={necessaryStorageEntries}
        />
      </section>
      <section className="cookie-storage-card" aria-labelledby="consent-preferences-title">
        <div className="cookie-storage-card-header">
          <h3 id="consent-preferences-title">
            <ConsentIcon kind="palette" /> Preferenskakor
          </h3>
          <label className="cookie-storage-choice">
            <input
              type="checkbox"
              role="switch"
              aria-label="Preferenskakor"
              aria-checked={preferences}
              aria-describedby="consent-preferences-description"
              checked={preferences}
              disabled={disabled}
              onChange={(event) => onChange(event.target.checked)}
            />
            <span aria-hidden="true" />
          </label>
        </div>
        <p id="consent-preferences-description">
          Tillåt beständig lagring för ihågkommen inloggning i Skyttel. Samtycket aktiverar inte Kom
          ihåg mig; funktionen väljer du separat efter inloggningen. Det gäller Skyttel, inte ditt
          Google- eller Microsoft-konto.
        </p>
        {feedback}
        <StorageDetails
          title="Visa preferenskakornas lagringsuppgifter"
          entries={preferenceStorageEntries}
        />
      </section>
    </div>
  );
}

export function ConsentFeedback({
  alwaysRender = false,
  onLogin,
  quietSuccess = false,
}: {
  alwaysRender?: boolean;
  onLogin?: () => void;
  quietSuccess?: boolean;
}) {
  const manager = useContext(ConsentContext);
  if (!manager) return null;
  const { preference, error, message } = manager;
  if (
    !alwaysRender &&
    !error &&
    !message &&
    !preference.recoveryMessage &&
    !['saving', 'checking', 'saved', 'unknown', 'rejected', 'unavailable', 'restored'].includes(
      preference.state,
    ) &&
    !manager.saving
  )
    return null;
  return (
    <div
      className={`cookie-storage-feedback${quietSuccess ? ' cookie-storage-feedback-quiet' : ''}`}
    >
      <p
        role="status"
        className={
          quietSuccess &&
          !manager.saving &&
          !preference.resultChecked &&
          !['saving', 'checking'].includes(preference.state)
            ? 'sr-only'
            : undefined
        }
      >
        {manager.saving || preference.state === 'saving'
          ? 'Sparar…'
          : preference.state === 'checking'
            ? 'Kontrollerar samma åtgärd…'
            : preference.state === 'saved'
              ? `Ihågkommen inloggning är ${preference.confirmedRemembered ? 'aktiverad' : 'avstängd'}. ${preference.reauthenticated ? 'Resultatet gäller din tidigare begäran. Du har loggat in på nytt.' : preference.continued ? 'Du är fortfarande inloggad.' : 'Logga in igen för att fortsätta.'} ${message}`.trim()
              : message}
        {!quietSuccess && preference.state === 'saved' && preference.recoveryMessage
          ? ` ${preference.recoveryMessage}`
          : ''}
      </p>
      <p role="alert">
        {error}
        {error ? ' ' : ''}
        {preference.state === 'unknown'
          ? 'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes. Åtgärdens referens bevaras. Att lämna vyn skickar inget nytt sparande.'
          : preference.state === 'rejected'
            ? 'Ändringen kunde inte sparas. Försök igen.'
            : preference.state === 'unavailable'
              ? preference.recoveryMessage ||
                'Aktuellt val kunde inte hämtas. Logga in igen för att fortsätta.'
              : preference.state === 'restored'
                ? preference.recoveryMessage
                : ''}
        {preference.state === 'unknown' && preference.recoveryMessage
          ? ` ${preference.recoveryMessage}`
          : ''}
        {quietSuccess &&
        ['saved', 'rejected'].includes(preference.state) &&
        preference.recoveryMessage
          ? ` ${preference.recoveryMessage}`
          : ''}
      </p>
      {preference.requiresLogin && (
        <p>
          {quietSuccess &&
            preference.state === 'saved' &&
            'Fortsatt inloggning kunde inte bekräftas. '}
          <Link to="/login" onClick={onLogin}>
            Logga in igen
          </Link>
        </p>
      )}
      {(preference.state === 'unknown' ||
        preference.state === 'checking' ||
        preference.resultChecked) && (
        <button
          type="button"
          aria-disabled={preference.state !== 'unknown'}
          onClick={() => void preference.checkAgain()}
        >
          Kontrollera igen
        </button>
      )}
    </div>
  );
}

function ConsentBanner({ onLeave }: { onLeave: () => void }) {
  const manager = useContext(ConsentContext);
  if (!manager) throw new Error('consent_context_required');
  const dialog = useRef<HTMLDialogElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const customize = useRef<HTMLButtonElement>(null);
  const accept = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  const origin = useRef(
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState(readStorageConsent()?.preferences ?? false);
  const unknown = manager.preference.state === 'unknown';
  const pending = manager.saving || ['saving', 'checking'].includes(manager.preference.state);
  useLayoutEffect(() => {
    const shown = dialog.current;
    shown?.showModal();
    accept.current?.focus();
    return () => {
      shown?.close();
      if (usableFocusTarget(origin.current)) origin.current.focus({ preventScroll: true });
      else
        document.querySelector<HTMLElement>('main h1, main button')?.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (expanded) close.current?.focus();
    else if (wasExpanded.current) customize.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);
  const save = (value: boolean) => {
    setPreferences(value);
    void manager.save(value, { showConfirmation: false });
  };
  return (
    <dialog
      ref={dialog}
      className="cookie-storage consent-banner"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-description"
      onKeyDown={(event) => {
        trapDialogTab(event);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (pending || unknown) return;
          if (expanded) setExpanded(false);
          else reject.current?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (pending || unknown) return;
        if (expanded) setExpanded(false);
        else reject.current?.focus();
      }}
    >
      <div className={`consent-banner-inner${expanded ? ' consent-expanded' : ''}`}>
        {expanded ? (
          <>
            <div className="consent-banner-heading">
              <h2 id="consent-banner-title">Kakinställningar</h2>
              <button
                ref={close}
                type="button"
                aria-label="Tillbaka till kakbannern"
                disabled={pending || unknown}
                onClick={() => setExpanded(false)}
              >
                ×
              </button>
            </div>
            <p id="consent-banner-description" className="sr-only">
              {bannerDescription}
            </p>
            <ConsentCategories
              preferences={preferences}
              onChange={setPreferences}
              disabled={manager.blocked}
            />
          </>
        ) : (
          <div className="consent-banner-copy">
            <ConsentIcon />
            <div>
              <h2 id="consent-banner-title">Vi använder kakor</h2>
              <p id="consent-banner-description">
                {bannerDescription}{' '}
                <button type="button" className="consent-learn" onClick={() => setExpanded(true)}>
                  Läs mer
                </button>
              </p>
            </div>
          </div>
        )}
        <ConsentFeedback onLogin={onLeave} />
        <div className="consent-banner-buttons">
          <button ref={reject} type="button" disabled={manager.blocked} onClick={() => save(false)}>
            Endast nödvändiga
          </button>
          {!expanded && (
            <button
              ref={customize}
              type="button"
              className="consent-customize"
              disabled={pending}
              onClick={() => setExpanded(true)}
            >
              <ConsentIcon kind="settings" /> Anpassa Inställningar
            </button>
          )}
          <button
            ref={accept}
            type="button"
            className="cookie-storage-primary"
            disabled={manager.blocked}
            onClick={() => save(true)}
          >
            Acceptera Alla
          </button>
          {expanded && (
            <button
              type="button"
              className="cookie-storage-primary"
              disabled={manager.blocked}
              onClick={() => save(preferences)}
            >
              Spara Preferenser
            </button>
          )}
        </div>
        {manager.error &&
          !pending &&
          !unknown &&
          (manager.preference.saved?.remembered || manager.preference.requiresLogin ? (
            <Link to="/login" onClick={onLeave}>
              Logga in på nytt med endast nödvändig lagring
            </Link>
          ) : (
            <button type="button" onClick={onLeave}>
              Fortsätt med endast nödvändig lagring
            </button>
          ))}
        {unknown && (
          <button type="button" onClick={onLeave}>
            Fortsätt med okänt utfall
          </button>
        )}
      </div>
    </dialog>
  );
}
