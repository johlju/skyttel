import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import logo from '../../docs/images/shuttle-logo-transparent-small.png';
import type { Administration, HouseholdInvitation } from '../shared/administration.js';
import { householdNameMaxLength, normalizeHouseholdName } from '../shared/household-name.js';
import type { PersonalView } from '../shared/personal-view.js';
import { Assistants } from './Assistants.js';
import { ContentOwners } from './ContentOwners.js';
import { Costs } from './Costs.js';
import { HouseholdErasure } from './HouseholdErasure.js';
import { HouseholdExport } from './HouseholdExport.js';
import { HouseholdImport } from './HouseholdImport.js';
import { HouseholdMap } from './HouseholdMap.js';
import { MapRequestError as RequestError, request } from './map-request.js';
import { SettingsOverview, SettingsScreen, settingsEntries } from './SettingsScreen.js';
import { useWorkspaceTheme } from './WorkspaceTheme.js';
import './access.css';

type Provider = 'google' | 'microsoft';
type Household = { id: string; name: string; role: 'administrator' | 'member' };
type Bootstrap = { providers: Provider[]; operator: boolean } & (
  | { status: 'anonymous'; user?: never }
  | { status: 'setup'; user: { id: string; name: string } }
  | { status: 'forbidden'; user: { id: string; name: string } }
  | { status: 'ready'; user: { id: string; name: string }; household: Household }
);
type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; code?: number }
  | { status: 'loaded'; data: T };

function useResource<T>(path: string, revision = 0, refreshAccess = false): LoadState<T> {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{ key: string; state: LoadState<T> }>({
    key,
    state: { status: 'loading' },
  });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, state: { status: 'loading' } });
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const data = await request<T>(path, undefined, controller.signal);
        if (!controller.signal.aborted) setResult({ key, state: { status: 'loaded', data } });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult((previous) => {
            const code = error instanceof RequestError ? error.status : undefined;
            if (
              previous.key === key &&
              previous.state.status === 'loaded' &&
              code !== 401 &&
              code !== 403 &&
              code !== 409
            )
              return previous;
            return { key, state: { status: 'error', code } };
          });
      } finally {
        pending = false;
      }
    }
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = refreshAccess ? window.setInterval(() => void refresh(), 5_000) : undefined;
    if (refreshAccess) {
      window.addEventListener('focus', onVisible);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [path, key, refreshAccess]);
  return result.key === key ? result.state : { status: 'loading' };
}

function Heading({
  children,
  active = true,
  focus = true,
}: {
  children: ReactNode;
  active?: boolean;
  focus?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (active && focus) ref.current?.focus();
  }, [active, focus]);
  return (
    <h1 ref={ref} tabIndex={-1} hidden={!active}>
      {children}
    </h1>
  );
}

function Loading() {
  return (
    <p className="loading" role="status">
      Öppnar Skyttel…
    </p>
  );
}

function Failure({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="panel">
      <p className="eyebrow">Anslutningen avbröts</p>
      <Heading>Skyttel kunde inte öppnas</Heading>
      <p>Kontrollera din internetanslutning och försök igen.</p>
      <button type="button" className="primary" onClick={onRetry}>
        Försök igen
      </button>
    </section>
  );
}

function Login({ providers }: { providers: Provider[] }) {
  const location = useLocation();
  const [selected, setSelected] = useState<Provider | null>(null);
  const [pending, setPending] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState(() => {
    const query = new URLSearchParams(location.search);
    return query.get('error') ?? (query.has('authError') ? 'failed' : null);
  });
  const options = useRef<HTMLFieldSetElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const attempt = useRef<AbortController | null>(null);
  const lastProvider = useRef<Provider | null>(null);
  const label = selected === 'google' ? 'Google' : 'Microsoft';
  useEffect(() => {
    if (selected) continueButton.current?.focus();
    else if (lastProvider.current)
      options.current
        ?.querySelector<HTMLButtonElement>(`[data-provider="${lastProvider.current}"]`)
        ?.focus();
  }, [selected]);
  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      attempt.current?.abort();
      setSelected(null);
      setPending(false);
      setCancelled(true);
    };
    window.addEventListener('pageshow', returned);
    return () => {
      attempt.current?.abort();
      window.removeEventListener('pageshow', returned);
    };
  }, []);
  function cancel() {
    attempt.current?.abort();
    setPending(false);
    setSelected(null);
    setCancelled(true);
  }
  async function signIn(provider: Provider) {
    const controller = new AbortController();
    attempt.current = controller;
    setPending(true);
    setError(null);
    try {
      const result = await request<{ url: string }>(
        '/api/auth/sign-in/social',
        {
          provider,
          callbackURL: location.pathname === '/costs' ? '/costs' : '/',
          ...(location.pathname === '/assistant-consent'
            ? { oauth_query: location.search.slice(1) }
            : {}),
          errorCallbackURL: '/?authError=1',
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (typeof result.url !== 'string') throw new Error('invalid_redirect');
      const url = new URL(result.url, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_redirect');
      window.location.assign(url.href);
    } catch {
      if (controller.signal.aborted) return;
      setPending(false);
      setSelected(null);
      setError('failed');
    }
  }
  return (
    <section className="panel access-gate">
      <p className="eyebrow">Skyttel · ditt hushåll, sammanbundet</p>
      <Heading>Välkommen till Skyttel</Heading>
      <p className="intro">
        En gemensam plats för det som hör ihop. Logga in med ditt eget Google- eller
        Microsoft-konto.
      </p>
      {selected ? (
        <div className="access-transition">
          <p className="access-note">
            Du går vidare till {label}. Efter inloggningen kommer du tillbaka till Skyttel.
          </p>
          <div className="access-actions">
            <button
              ref={continueButton}
              type="button"
              className="primary"
              disabled={pending}
              onClick={() => void signIn(selected)}
            >
              {pending ? `Öppnar ${label}…` : `Fortsätt till ${label}`}
              <span aria-hidden="true"> ↗</span>
            </button>
            <button type="button" onClick={cancel}>
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <fieldset ref={options} className="sign-in-options" aria-label="Inloggningssätt">
          {providers.map((provider) => (
            <button
              type="button"
              key={provider}
              data-provider={provider}
              className={provider === 'google' ? 'provider primary' : 'provider'}
              onClick={() => {
                lastProvider.current = provider;
                setCancelled(false);
                setError(null);
                setSelected(provider);
              }}
            >
              Fortsätt med {provider === 'google' ? 'Google' : 'Microsoft'}
            </button>
          ))}
        </fieldset>
      )}
      {pending && (
        <p className="muted" role="status">
          Öppnar {label} för att verifiera din inloggning…
        </p>
      )}
      {cancelled && (
        <p role="status">Inloggningen avbröts. Välj ett inloggningssätt när du vill fortsätta.</p>
      )}
      {error && (
        <p className="error access-note" role="alert">
          {error === 'access_denied'
            ? 'Inloggningen kunde inte slutföras eftersom den avbröts hos leverantören. Du är tillbaka i Skyttel och kan försöka igen.'
            : ['state_mismatch', 'state_not_found', 'state_invalid'].includes(error)
              ? 'Inloggningsförsöket har gått ut eller kan inte verifieras. Börja om med Google eller Microsoft.'
              : 'Inloggningen kunde inte slutföras. Försök igen med Google eller Microsoft.'}
        </p>
      )}
      <p className="muted">
        Använd det inloggningssätt som är kopplat till din tillgång till hushållet.
      </p>
      <div className="privacy-note">
        <span aria-hidden="true">●</span>
        <p>
          Din hushållskarta är privat. Bara Skyttel-användare med tillgång till hushållet kan öppna
          den.
        </p>
      </div>
    </section>
  );
}

function LoginMethods() {
  const [revision, setRevision] = useState(0);
  const result = useResource<{ providers: Provider[]; stage: string | null }>(
    '/api/login-methods',
    revision,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'request' | 'verification' | null>(
    new URLSearchParams(useLocation().search).has('failed') ? 'request' : null,
  );
  const [cancelled, setCancelled] = useState(false);
  async function action(step: string, provider?: Provider) {
    setPending(true);
    setError(null);
    setCancelled(false);
    try {
      const response = await request<{ url?: string; status?: string }>(
        `/api/login-methods/${step}`,
        { provider },
      );
      if (step === 'cancel') {
        setCancelled(response.status === 'cancelled');
        setRevision((value) => value + 1);
      } else if (response.url && ['http:', 'https:'].includes(new URL(response.url).protocol))
        window.location.assign(response.url);
      else throw new Error('invalid_redirect');
    } catch (cause) {
      if (
        step === 'add' &&
        cause instanceof RequestError &&
        cause.status === 409 &&
        cause.code === 'verification_required'
      ) {
        setError('verification');
        setRevision((value) => value + 1);
      } else setError('request');
    } finally {
      setPending(false);
    }
  }
  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error')
    return <Failure onRetry={() => setRevision((value) => value + 1)} />;
  const { providers, stage } = result.data;
  const labels = { google: 'Google', microsoft: 'Microsoft' };
  return (
    <section className="panel login-methods">
      <Heading>Inloggningssätt</Heading>
      <p>
        Verifiera först en kopplad inloggning och sedan den nya. Ditt Skyttel-användar-ID, innehåll
        och din tillgång till hushållet bevaras. Samma e-postadress länkar aldrig inloggningar
        automatiskt.
      </p>
      <ul className="login-method-providers" aria-label="Status för inloggningssätt">
        {(['google', 'microsoft'] as Provider[]).map((provider) => (
          <li key={provider}>
            <strong>
              {labels[provider]} – {providers.includes(provider) ? 'kopplat' : 'inte kopplat'}
            </strong>
          </li>
        ))}
      </ul>
      {stage === 'complete' && providers.length === 2 && (
        <p role="status">
          Länkningen är verifierad. Båda inloggningssätten når samma Skyttel-användare.
        </p>
      )}
      {stage === 'expired' && (
        <p role="status">
          Verifieringen har gått ut. Dina tidigare inloggningar och din tillgång finns kvar.
          Verifiera på nytt när du vill koppla ett inloggningssätt.
        </p>
      )}
      {cancelled && stage !== 'complete' && (
        <p role="status">
          Länkningen är avbruten. Dina tidigare inloggningar och din tillgång finns kvar. Verifiera
          på nytt när du vill koppla ett inloggningssätt.
        </p>
      )}
      {providers.length < 2 && (
        <>
          <ol className="login-method-steps" aria-label="Länkningens steg">
            <li aria-current={stage !== 'verified' ? 'step' : undefined}>
              Verifiera befintlig inloggning
            </li>
            <li aria-current={stage === 'verified' ? 'step' : undefined}>
              Koppla det andra inloggningssättet
            </li>
          </ol>
          <p>
            {stage === 'verified'
              ? 'Din befintliga inloggning är verifierad. Koppla nu den andra inom tio minuter.'
              : 'Välj din befintliga inloggning för att börja.'}
          </p>
          {(stage === 'verified'
            ? (['google', 'microsoft'] as Provider[]).filter(
                (provider) => !providers.includes(provider),
              )
            : providers
          ).map((provider) => (
            <div className="login-method-action" key={provider}>
              <p>
                Du går till {labels[provider]}{' '}
                {stage === 'verified'
                  ? 'för att bevisa din andra inloggning.'
                  : 'för att verifiera inloggningen som redan hör till dig.'}{' '}
                Därefter kommer du tillbaka hit.
              </p>
              <button
                type="button"
                className="primary"
                disabled={pending}
                onClick={() => void action(stage === 'verified' ? 'add' : 'prove', provider)}
              >
                {stage === 'verified' ? 'Koppla' : 'Verifiera'} {labels[provider]}
              </button>
            </div>
          ))}
        </>
      )}
      {stage && stage !== 'complete' && (
        <button type="button" disabled={pending} onClick={() => void action('cancel')}>
          Avbryt länkning
        </button>
      )}
      {pending && <p role="status">Kontrollerar inloggningen…</p>}
      {((error && (error !== 'verification' || stage !== 'expired')) || stage === 'failed') && (
        <p role="alert">
          Länkningen kunde inte slutföras. Åtkomst kan ha nekats, fel identitet valts eller
          leverantören kan ha ett fel. En inloggning som tillhör en annan Skyttel-användare kan inte
          tas över. Dina tidigare inloggningar och din tillgång finns kvar. Försök igen.
        </p>
      )}
      <p>
        <Link to="/">Till startsidan</Link>
      </p>
    </section>
  );
}

function Setup({
  onCreated,
  onReload,
}: {
  onCreated: (household: Household) => void;
  onReload: () => void;
}) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'name' | 'request' | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = normalizeHouseholdName(name);
    if (normalizedName === null) {
      setError('name');
      input.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await request<{ household: Household }>('/api/households', {
        name: normalizedName,
      });
      onCreated(result.household);
    } catch (failure) {
      if (failure instanceof RequestError && [401, 403, 409].includes(failure.status)) {
        onReload();
      } else {
        setError(failure instanceof RequestError && failure.status === 400 ? 'name' : 'request');
        setPending(false);
      }
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Kom igång</p>
      <Heading>Skapa ditt hushåll</Heading>
      <p className="intro">
        Du är utsedd till installationens första administratör. Börja med hushållets namn. Du kan
        bjuda in andra när kartan öppnas.
      </p>
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={pending}>
        <label htmlFor="household-name">Hushållets namn</label>
        <input
          ref={input}
          id="household-name"
          name="household-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={householdNameMaxLength}
          autoComplete="off"
          aria-invalid={error === 'name'}
          aria-describedby={error === 'name' ? 'name-hint name-error' : 'name-hint'}
          readOnly={pending}
        />
        <p id="name-hint" className="muted">
          Välj ett namn som ni känner igen, till exempel Hushållet Linden.
        </p>
        {error === 'name' && (
          <p id="name-error" className="error" role="alert">
            Ange ett namn med 1–100 tecken.
          </p>
        )}
        <button className="primary full-width" disabled={pending} type="submit">
          {pending ? 'Skapar hushåll…' : 'Skapa hushåll'}
        </button>
        {pending && (
          <p className="form-status" role="status">
            Hushållet skapas. Vänta en stund.
          </p>
        )}
        {error === 'request' && (
          <div className="form-status">
            <p className="error" role="alert">
              Vi kunde inte bekräfta att hushållet skapades. Kontrollera anslutningen och hushållets
              status.
            </p>
            <button type="button" onClick={onReload}>
              Kontrollera status
            </button>
          </div>
        )}
      </form>
      <div className="privacy-note">
        <span aria-hidden="true">●</span>
        <p>
          Hushållet är privat. Du återkommer till det genom att logga in med samma inloggningssätt.
        </p>
      </div>
    </section>
  );
}

function Forbidden() {
  return (
    <section className="panel">
      <p className="eyebrow">Privat hushåll</p>
      <Heading>Du har inte tillgång till hushållet</Heading>
      <p>
        Din inloggning fungerar, men du har inte tillgång till hushållet. Be administratören om en
        inbjudan för ditt Skyttel-användar-ID. Att logga in igen återställer inte ett återkallat
        medlemskap.
      </p>
      <p className="muted">
        Dela ditt Skyttel-användar-ID nedan med en administratör för att få en inbjudan.
      </p>
      <Link to="/">Till startsidan</Link>
    </section>
  );
}

function InvitationEntry({
  userId,
  showInvitation,
  onAccepted,
  onReload,
}: {
  userId: string;
  showInvitation: boolean;
  onAccepted: (household: Household) => void;
  onReload: () => void;
}) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { household } = await request<{ household: Household }>('/api/invitations/accept', {
        code: code.trim(),
      });
      onAccepted(household);
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 401) onReload();
      else
        setError(
          failure instanceof RequestError && [400, 409].includes(failure.status)
            ? 'Inbjudan kan inte användas. Kontrollera koden och att du är inloggad med rätt Skyttel-användare. Be administratören om en ny inbjudan om den har upphört.'
            : 'Inbjudan kunde inte bekräftas. Kontrollera anslutningen och försök igen.',
        );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel invitation-panel">
      <h2>Din Skyttel-användare</h2>
      <label htmlFor="own-user-id">Ditt Skyttel-användar-ID</label>
      <input
        id="own-user-id"
        readOnly
        value={userId}
        aria-describedby={showInvitation ? 'user-id-hint' : undefined}
      />
      {showInvitation && (
        <>
          <p id="user-id-hint" className="muted">
            Dela detta ID med administratören som ska bjuda in dig. Namn och e-postadress ger inte
            tillgång.
          </p>
          <form onSubmit={(event) => void accept(event)} aria-busy={pending}>
            <h2>Har du en inbjudan?</h2>
            <label htmlFor="invitation-code">Inbjudningskod</label>
            <input
              id="invitation-code"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              readOnly={pending}
            />
            <button type="submit" disabled={pending}>
              {pending ? 'Accepterar inbjudan…' : 'Acceptera inbjudan'}
            </button>
            {pending && (
              <p className="form-status" role="status">
                Kontrollerar din inbjudan…
              </p>
            )}
            {error && (
              <div className="form-status">
                <p className="error" role="alert">
                  {error}
                </p>
                <button type="button" onClick={onReload}>
                  Kontrollera tillgång
                </button>
              </div>
            )}
          </form>
        </>
      )}
    </section>
  );
}

const invitationStatuses: Record<HouseholdInvitation['status'], string> = {
  pending: 'Väntar på svar',
  accepted: 'Accepterad',
  revoked: 'Återkallad',
  expired: 'Utgången',
};

function AdministrationPage({ userId, onReload }: { userId: string; onReload: () => void }) {
  const { id } = useParams();
  const path = `/api/households/${encodeURIComponent(id ?? '')}`;
  const [revision, setRevision] = useState(0);
  const result = useResource<Administration>(`${path}/administration`, revision, true);
  const [recipient, setRecipient] = useState('');
  const [code, setCode] = useState<{
    invitationId: string;
    value: string;
    copyNotice?: string;
  } | null>(null);
  const [invitationStep, setInvitationStep] = useState<'identity' | 'create' | 'share'>('identity');
  const [accessList, setAccessList] = useState<'members' | 'invitations'>('members');
  const administrationHeading = useRef<HTMLHeadingElement>(null);
  const invitationHeading = useRef<HTMLHeadingElement>(null);
  const invitationFocusFrom = useRef<Element | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<string | null>(null);
  const [confirmInvitation, setConfirmInvitation] = useState<string | null>(null);
  const sessionExpired = result.status === 'error' && result.code === 401;
  useEffect(() => {
    if (sessionExpired) onReload();
  }, [sessionExpired, onReload]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit step transitions must place focus after their new controls mount.
  useEffect(() => {
    if (result.status !== 'loaded') return;
    if (!invitationFocusFrom.current) administrationHeading.current?.focus();
    else if (
      document.activeElement === document.body ||
      document.activeElement === invitationFocusFrom.current
    )
      invitationHeading.current?.focus();
    invitationFocusFrom.current = null;
  }, [invitationStep, result.status]);
  function moveInvitationStep(step: 'identity' | 'create') {
    invitationFocusFrom.current = document.activeElement;
    setInvitationStep(step);
  }
  async function copyCode() {
    if (!code) return;
    const issued = code;
    let copyNotice: string;
    try {
      await navigator.clipboard.writeText(issued.value);
      copyNotice = 'Koden är kopierad. Dela den privat med rätt person.';
    } catch {
      copyNotice = 'Koden kunde inte kopieras. Markera och kopiera koden i fältet själv.';
    }
    setCode((current) => (current === issued ? { ...current, copyNotice } : current));
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedFrom = document.activeElement;
    setPending(true);
    setError(null);
    setNotice(null);
    setCode(null);
    try {
      const created = await request<{ invitation: HouseholdInvitation; code: string }>(
        `${path}/invitations`,
        {
          userId: recipient.trim(),
        },
      );
      setCode({ invitationId: created.invitation.id, value: created.code });
      setRecipient('');
      invitationFocusFrom.current = submittedFrom;
      setInvitationStep('share');
      setRevision((value) => value + 1);
    } catch (failure) {
      if (failure instanceof RequestError && [401, 403].includes(failure.status)) onReload();
      else
        setError(
          failure instanceof RequestError && failure.code === 'user_not_found'
            ? 'Skyttel-användaren finns inte. Be mottagaren logga in och dela sitt Skyttel-användar-ID.'
            : failure instanceof RequestError && failure.code === 'already_member'
              ? 'Skyttel-användaren har redan tillgång till hushållet.'
              : 'Inbjudan kunde inte skapas. Kontrollera uppgifterna och anslutningen och försök igen.',
        );
    } finally {
      setPending(false);
    }
  }
  async function changeAccess(suffix: string, body: unknown, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await request(`${path}/${suffix}`, body);
      setConfirmMember(null);
      setConfirmInvitation(null);
      setNotice(success);
      setRevision((value) => value + 1);
    } catch (failure) {
      if (failure instanceof RequestError && [401, 403].includes(failure.status)) onReload();
      else
        setError(
          failure instanceof RequestError && failure.code === 'last_administrator'
            ? 'Hushållet måste ha minst en administratör. Gör en annan medlem till administratör först.'
            : 'Ändringen kunde inte bekräftas. Kontrollera den aktuella listan och försök igen.',
        );
    } finally {
      setPending(false);
    }
  }
  if (sessionExpired || result.status === 'loading') return <Loading />;
  if (result.status === 'error')
    return result.code === 403 ? (
      <section className="panel">
        <Heading>Du kan inte administrera hushållet</Heading>
        <p>Endast aktuella administratörer kan hantera tillgång.</p>
        <Link to="/">Till startsidan</Link>
      </section>
    ) : (
      <Failure onRetry={() => setRevision((value) => value + 1)} />
    );
  const currentInvitation = code
    ? result.data.invitations.find(
        (invitation) => invitation.id === code.invitationId && invitation.status === 'pending',
      )
    : undefined;
  return (
    <section className="panel administration-panel">
      <Link to={`/households/${encodeURIComponent(id ?? '')}`}>Till hushållet</Link>
      <h1 ref={administrationHeading} tabIndex={-1}>
        Administrera tillgång
      </h1>
      <p>
        Alla medlemmar har samma insyn i hushållets gemensamma karta. Administratörer hanterar
        tillgången.
      </p>
      <section className="invitation-flow" aria-label="Bjud in en Skyttel-användare">
        <h2>Bjud in en Skyttel-användare</h2>
        <ol className="invitation-steps" aria-label="Inbjudans steg">
          <li aria-current={invitationStep === 'identity' ? 'step' : undefined}>
            Be om användar-ID
          </li>
          <li aria-current={invitationStep === 'create' ? 'step' : undefined}>Skapa inbjudan</li>
          <li aria-current={invitationStep === 'share' ? 'step' : undefined}>
            Kopiera och dela koden
          </li>
        </ol>
        <h3 ref={invitationHeading} tabIndex={-1}>
          {invitationStep === 'identity'
            ? 'Be om användar-ID'
            : invitationStep === 'create'
              ? 'Skapa inbjudan'
              : 'Kopiera och dela koden'}
        </h3>
        {invitationStep === 'identity' && (
          <>
            <p>Be personen logga in i Skyttel och dela sitt Skyttel-användar-ID privat med dig.</p>
            <p>
              Ett namn eller en e-postadress identifierar inte säkert rätt Skyttel-användare.
              Kontrollera ID:t tillsammans.
            </p>
            <button type="button" className="primary" onClick={() => moveInvitationStep('create')}>
              Jag har personens användar-ID
            </button>
          </>
        )}
        {invitationStep === 'create' && (
          <form onSubmit={(event) => void invite(event)} aria-busy={pending}>
            <label htmlFor="recipient-id">Skyttel-användar-ID att bjuda in</label>
            <input
              id="recipient-id"
              autoComplete="off"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              required
              readOnly={pending}
            />
            <p className="muted">
              Be mottagaren logga in och dela sitt ID från Skyttel. Inbjudan gäller i sju dagar. En
              ny inbjudan ersätter tidigare väntande inbjudan till samma användare.
            </p>
            <div className="access-actions">
              <button type="submit" className="primary" disabled={pending}>
                {pending ? 'Skapar inbjudan…' : 'Skapa inbjudan'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => moveInvitationStep('identity')}
              >
                Tillbaka
              </button>
            </div>
          </form>
        )}
        {invitationStep === 'share' && (
          <div className="invitation-result">
            {code && currentInvitation ? (
              <>
                <p role="status">
                  {code.copyNotice ??
                    'Inbjudan är skapad. Dela koden med den avsedda mottagaren. Koden visas bara nu.'}
                </p>
                <p>
                  Koden visas bara här, en gång. Inbjudan gäller i sju dagar och kan användas en
                  gång.
                </p>
                <p>
                  Skicka koden privat till <strong>{currentInvitation.userId}</strong>. Skyttel
                  skickar ingen e-post.
                </p>
                <label htmlFor="created-code">Inbjudningskod att dela</label>
                <input id="created-code" readOnly value={code.value} />
                <button type="button" onClick={() => void copyCode()}>
                  Kopiera koden
                </button>
              </>
            ) : (
              <p>
                Inbjudan väntar inte längre på svar. Kontrollera dess aktuella status under
                Inbjudningar.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setCode(null);
                setRecipient('');
                moveInvitationStep('identity');
              }}
            >
              Klar med inbjudan
            </button>
          </div>
        )}
      </section>
      {pending && (
        <p className="form-status" role="status">
          Sparar ändringen…
        </p>
      )}
      {notice && (
        <p className="form-status" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error form-status" role="alert">
          {error}
        </p>
      )}
      <fieldset className="access-actions section-heading" aria-label="Visa tillgång">
        <button
          type="button"
          aria-pressed={accessList === 'members'}
          onClick={() => setAccessList('members')}
        >
          Medlemmar
        </button>
        <button
          type="button"
          aria-pressed={accessList === 'invitations'}
          onClick={() => setAccessList('invitations')}
        >
          Inbjudningar
        </button>
      </fieldset>
      {accessList === 'members' && (
        <>
          <h2 className="section-heading">Medlemmar</h2>
          <ul className="access-list" aria-label="Medlemmar">
            {result.data.members.map((member) => (
              <li
                key={member.userId}
                className={member.userId === userId ? 'own-membership' : undefined}
              >
                <h3>
                  {member.name}
                  {member.userId === userId ? ' (du)' : ''}
                </h3>
                <p className="muted">{member.userId}</p>
                <p>{member.role === 'administrator' ? 'Administratör' : 'Medlem'}</p>
                <div className="access-actions">
                  <button
                    type="button"
                    disabled={pending || member.userId === userId}
                    aria-describedby={member.userId === userId ? 'own-access-hint' : undefined}
                    onClick={() =>
                      void changeAccess(
                        `members/${encodeURIComponent(member.userId)}/role`,
                        { role: member.role === 'administrator' ? 'member' : 'administrator' },
                        'Rollen har ändrats.',
                      )
                    }
                  >
                    {member.role === 'administrator' ? 'Gör till medlem' : 'Gör till administratör'}
                  </button>
                  <button
                    type="button"
                    disabled={pending || member.userId === userId}
                    aria-describedby={member.userId === userId ? 'own-access-hint' : undefined}
                    onClick={() => setConfirmMember(member.userId)}
                  >
                    Återkalla tillgång
                  </button>
                </div>
                {member.userId === userId && (
                  <p id="own-access-hint" className="muted">
                    Din roll och tillgång ändras av en annan administratör.
                  </p>
                )}
                {confirmMember === member.userId && (
                  <fieldset
                    className="confirmation"
                    aria-label={`Återkalla tillgång för ${member.name}`}
                  >
                    <p>
                      Återkalla tillgång för {member.name}? Alla befintliga sessioner förlorar
                      tillgång. Personer och innehåll i kartan finns kvar.
                    </p>
                    <div className="access-actions">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void changeAccess(
                            `members/${encodeURIComponent(member.userId)}/revoke`,
                            {},
                            'Tillgången har återkallats.',
                          )
                        }
                      >
                        Bekräfta återkallelse
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmMember(null)}
                      >
                        Avbryt
                      </button>
                    </div>
                  </fieldset>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {accessList === 'invitations' && (
        <>
          <h2 className="section-heading">Inbjudningar</h2>
          {result.data.invitations.length === 0 ? (
            <p>Inga inbjudningar ännu.</p>
          ) : (
            <ul className="access-list" aria-label="Inbjudningar">
              {result.data.invitations.map((invitation) => (
                <li key={invitation.id}>
                  <h3>{invitation.name}</h3>
                  <p className="muted">{invitation.userId}</p>
                  <p>{invitationStatuses[invitation.status]}</p>
                  <p className="muted">
                    Gäller till{' '}
                    <time dateTime={invitation.expiresAt}>
                      {new Date(invitation.expiresAt).toLocaleString('sv-SE')}
                    </time>
                  </p>
                  {invitation.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmInvitation(invitation.id)}
                      >
                        Återkalla inbjudan
                      </button>
                      {confirmInvitation === invitation.id && (
                        <fieldset
                          className="confirmation"
                          aria-label={`Återkalla inbjudan till ${invitation.name}`}
                        >
                          <p>Återkalla inbjudan till {invitation.name}? Koden slutar fungera.</p>
                          <div className="access-actions">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                void changeAccess(
                                  `invitations/${encodeURIComponent(invitation.id)}/revoke`,
                                  {},
                                  'Inbjudan har återkallats.',
                                )
                              }
                            >
                              Bekräfta återkallelse
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => setConfirmInvitation(null)}
                            >
                              Avbryt
                            </button>
                          </div>
                        </fieldset>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p>
        <Link to={`/households/${encodeURIComponent(id ?? '')}/settings/export`}>
          Fullständig export
        </Link>
        {' av hushållets information finns på en egen sida i Inställningar.'}
      </p>
      <p>
        <Link to={`/households/${encodeURIComponent(id ?? '')}/settings/erasure`}>
          Permanent radering
        </Link>
        {' har en egen sida för granskning och uppföljning i Inställningar.'}
      </p>
      <p>
        <Link to={`/households/${encodeURIComponent(id ?? '')}/settings/import`}>
          Återimportera hushållet
        </Link>
        {' och '}
        <Link to={`/households/${encodeURIComponent(id ?? '')}/settings/content-owners`}>
          Koppla historiskt innehåll
        </Link>
        {' finns på egna sidor i Inställningar.'}
      </p>
    </section>
  );
}

function HouseholdExportPage({
  household,
  onReload,
}: {
  household: Household | undefined;
  onReload: () => void;
}) {
  const { id } = useParams();
  if (household?.id !== id || household?.role !== 'administrator')
    return (
      <section className="panel">
        <Heading>Du kan inte administrera hushållet</Heading>
        <p>Endast aktuella administratörer kan göra en fullständig export.</p>
        <Link to="/">Till startsidan</Link>
      </section>
    );
  return <HouseholdExport key={household.id} householdId={household.id} onAccessLost={onReload} />;
}

function HouseholdRecoveryPage({
  household,
  onReload,
  page,
}: {
  household: Household | undefined;
  onReload: () => void;
  page: 'import' | 'owners' | 'erasure';
}) {
  const { id } = useParams();
  if (household?.id !== id || household?.role !== 'administrator')
    return (
      <section className="panel">
        <Heading>Du kan inte administrera hushållet</Heading>
        <p>
          Endast aktuella administratörer kan återimportera, koppla historiskt innehåll och radera
          permanent.
        </p>
        <Link to="/">Till startsidan</Link>
      </section>
    );
  if (page === 'erasure')
    return (
      <HouseholdErasure key={household.id} householdId={household.id} onAccessLost={onReload} />
    );
  return page === 'import' ? (
    <HouseholdImport key={household.id} householdId={household.id} onAccessLost={onReload} />
  ) : (
    <ContentOwners key={household.id} householdId={household.id} onAccessLost={onReload} />
  );
}

function HouseholdWork({
  onSessionExpired,
  account,
  typeSettingsTarget,
  mapSettingsTarget,
}: {
  onSessionExpired: () => void;
  account: ReactNode;
  typeSettingsTarget: HTMLElement | null;
  mapSettingsTarget: HTMLElement | null;
}) {
  const { pathname } = useLocation();
  const routeId = matchPath('/households/:id', pathname)?.params.id;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const settingsId = matchPath('/households/:id/settings/*', pathname)?.params.id;
  const requestedId = routeId ?? settingsId;
  if (requestedId && requestedId !== currentId) setCurrentId(requestedId);
  const id = requestedId ?? currentId;
  if (!id) return null;
  return (
    <HouseholdPage
      key={id}
      id={id}
      active={Boolean(routeId)}
      onSessionExpired={onSessionExpired}
      account={account}
      typeSettingsTarget={typeSettingsTarget}
      mapSettingsTarget={mapSettingsTarget}
    />
  );
}

function HouseholdPage({
  id,
  active,
  onSessionExpired,
  account,
  typeSettingsTarget,
  mapSettingsTarget,
}: {
  id: string;
  active: boolean;
  onSessionExpired: () => void;
  account: ReactNode;
  typeSettingsTarget: HTMLElement | null;
  mapSettingsTarget: HTMLElement | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [workRevision, setWorkRevision] = useState(0);
  const retireWork = useCallback(() => setWorkRevision((value) => value + 1), []);
  const result = useResource<{ household: Household }>(
    `/api/households/${encodeURIComponent(id ?? '')}`,
    revision,
    true,
  );
  const content = useResource<PersonalView>(
    `/api/households/${encodeURIComponent(id)}/map/view`,
    revision,
    true,
  );
  const sessionExpired =
    (result.status === 'error' && result.code === 401) ||
    (content.status === 'error' && content.code === 401);
  useEffect(() => {
    if (sessionExpired) onSessionExpired();
  }, [sessionExpired, onSessionExpired]);
  if (result.status === 'loading' || sessionExpired) return active ? <Loading /> : null;
  if (
    result.status === 'error' ||
    (content.status === 'error' && [401, 403, 409].includes(content.code ?? 0))
  ) {
    const code =
      result.status === 'error'
        ? result.code
        : content.status === 'error'
          ? content.code
          : undefined;
    if (code === 409)
      return (
        <p role="alert">
          Hushållets innehåll ändras. Kartarbetet och mikrofonen är stoppade tills innehållet är
          tillgängligt igen.
        </p>
      );
    return code === 403 ? (
      <Forbidden />
    ) : (
      <Failure onRetry={() => setRevision((value) => value + 1)} />
    );
  }
  return (
    <section className={active ? 'panel household-panel' : 'household-work-background'}>
      <p className="eyebrow" hidden={!active}>
        Din privata hushållskarta
      </p>
      <Heading active={active} focus={location.state?.conversation !== true}>
        {result.data.household.name}
      </Heading>
      <p className="membership" hidden={!active}>
        {result.data.household.role === 'administrator' ? 'Administratör' : 'Medlem'}
      </p>
      <HouseholdMap
        key={`${result.data.household.id}:${workRevision}`}
        householdId={result.data.household.id}
        active={active}
        householdName={result.data.household.name}
        account={account}
        profileRequested={location.state?.profile === true}
        onSettings={(section) =>
          navigate(`/households/${encodeURIComponent(id)}/settings${section ? `/${section}` : ''}`)
        }
        onReturnToMap={() =>
          navigate(`/households/${encodeURIComponent(id)}`, { state: { conversation: true } })
        }
        typeSettingsTarget={typeSettingsTarget}
        mapSettingsTarget={mapSettingsTarget}
        contentVersion={content.status === 'loaded' ? content.data.contentVersion : undefined}
        onContentReplaced={retireWork}
      />
    </section>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useWorkspaceTheme();
  const [mapSettingsTarget, setMapSettingsTarget] = useState<HTMLDivElement | null>(null);
  const [typeSettingsTarget, setTypeSettingsTarget] = useState<HTMLDivElement | null>(null);
  const [revision, setRevision] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const bootstrap = useResource<Bootstrap>('/api/bootstrap', revision, true);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const data = bootstrap.status === 'loaded' ? bootstrap.data : undefined;
  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await request('/api/auth/sign-out', {});
      navigate('/', { replace: true });
      reload();
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }
  function created(household: Household) {
    navigate(`/households/${encodeURIComponent(household.id)}`, { replace: true });
    reload();
  }
  const mapActive =
    data?.status === 'ready' && Boolean(matchPath('/households/:id', location.pathname));
  const authenticated = data && data.status !== 'anonymous';
  const personal = ['/profile', '/login-methods', '/assistants', '/assistant-consent'].includes(
    location.pathname,
  );
  const settingsPage =
    authenticated &&
    !mapActive &&
    (personal ||
      location.pathname === '/costs' ||
      (data.status === 'ready' &&
        Boolean(matchPath('/households/:id/settings/*', location.pathname))) ||
      (data.status === 'ready' &&
        Boolean(matchPath('/households/:id/administration', location.pathname))));
  const household = data?.status === 'ready' ? data.household : undefined;
  const accessGate =
    data?.status === 'anonymous' || (authenticated && data.status !== 'ready' && !settingsPage);
  const logout = (
    <>
      <button type="button" disabled={signingOut} onClick={() => void signOut()}>
        {signingOut ? 'Loggar ut…' : 'Logga ut'}
      </button>
      {signOutError && (
        <p className="error" role="alert">
          Du kunde inte loggas ut. Kontrollera anslutningen och försök igen.
        </p>
      )}
    </>
  );
  const account = authenticated && (
    <>
      <p className="intro">{data.user.name}</p>
      {household && <p>{household.role === 'administrator' ? 'Administratör' : 'Medlem'}</p>}
      <InvitationEntry
        userId={data.user.id}
        showInvitation={
          data.status === 'forbidden' ||
          (data.status === 'ready' && data.household.role !== 'administrator')
        }
        onAccepted={created}
        onReload={reload}
      />
      <h2>Ditt konto</h2>
      <p>Hantera hur du loggar in och vilka assistenter som får tillgång till din karta.</p>
      <div className="settings-profile-links">
        <Link to="/login-methods">Inloggningssätt</Link>
        <Link to="/assistants">Assistentanslutningar</Link>
      </div>
      {logout}
    </>
  );
  const pages = authenticated && (
    <>
      {location.pathname === '/login-methods' && <LoginMethods />}
      {data.status === 'forbidden' &&
        ['/assistants', '/assistant-consent'].includes(location.pathname) && (
          <>
            <Forbidden />
            <InvitationEntry
              userId={data.user.id}
              showInvitation
              onAccepted={created}
              onReload={reload}
            />
          </>
        )}
      {location.pathname === '/profile' &&
        (data.status === 'ready' ? (
          <Navigate
            to={`/households/${encodeURIComponent(data.household.id)}`}
            state={{ profile: true }}
            replace
          />
        ) : (
          <section className="panel settings-profile">
            <Heading>Din profil</Heading>
            {account}
          </section>
        ))}
      {location.pathname === '/costs' &&
        (data.operator ? (
          <Costs key={`costs-${data.user.id}`} onAccessLost={reload} />
        ) : (
          <section className="panel">
            <Heading>
              Endast installationens driftansvarige har tillgång till kostnadsöversikten
            </Heading>
            <Link to="/">Till startsidan</Link>
          </section>
        ))}
      {!['/login-methods', '/profile', '/costs'].includes(location.pathname) &&
        (data.status === 'ready' || data.status === 'setup') && (
          <Routes>
            <Route path="/assistant-consent" element={<Assistants consent />} />
            <Route path="/assistants" element={<Assistants />} />
            <Route
              path="/"
              element={
                data.status === 'setup' ? (
                  <Setup onCreated={created} onReload={reload} />
                ) : (
                  <Navigate to={`/households/${encodeURIComponent(data.household.id)}`} replace />
                )
              }
            />
            <Route path="/households/:id" element={null} />
            <Route
              path="/households/:id/settings"
              element={<SettingsOverview entries={settingsEntries(household, data.operator)} />}
            />
            <Route
              path="/households/:id/settings/map"
              element={
                <section className="panel">
                  <Heading>Rymdkartan</Heading>
                  <p>Välj bakgrund för din personliga vy. Hushållets karta påverkas inte.</p>
                  <div ref={setMapSettingsTarget} />
                </section>
              }
            />
            <Route
              path="/households/:id/settings/types"
              element={
                <section className="panel">
                  <Heading>Typer och egna fält</Heading>
                  <p>
                    Ändringarna blir förslag i ditt privata utkast. Återgå till kartan för att
                    granska och spara hela utkastet tillsammans.
                  </p>
                  <div ref={setTypeSettingsTarget} />
                </section>
              }
            />
            <Route
              path="/households/:id/settings/export"
              element={<HouseholdExportPage household={household} onReload={reload} />}
            />
            <Route
              path="/households/:id/settings/import"
              element={
                <HouseholdRecoveryPage household={household} onReload={reload} page="import" />
              }
            />
            <Route
              path="/households/:id/settings/content-owners"
              element={
                <HouseholdRecoveryPage household={household} onReload={reload} page="owners" />
              }
            />
            <Route
              path="/households/:id/settings/erasure"
              element={
                <HouseholdRecoveryPage household={household} onReload={reload} page="erasure" />
              }
            />
            <Route
              path="/households/:id/administration"
              element={<AdministrationPage userId={data.user.id} onReload={reload} />}
            />
            <Route
              path="*"
              element={
                <section className="panel">
                  <Heading>Sidan finns inte</Heading>
                  <Link to="/">Till startsidan</Link>
                </section>
              }
            />
          </Routes>
        )}
    </>
  );
  return (
    <div
      className={`app-shell${mapActive ? ' has-workspace' : ''}${settingsPage ? ' has-settings' : ''}${accessGate ? ' access-shell' : ''}`}
      data-theme={theme.theme}
    >
      <a className="skip-link" href="#main">
        Hoppa till innehållet
      </a>
      <header className="site-header" hidden={mapActive || Boolean(settingsPage)}>
        <Link className="brand" to="/" aria-label="Skyttel, startsida">
          <img className="brand-logo" src={logo} alt="" />
          Skyttel
        </Link>
        {authenticated ? (
          <div className={`session-controls${data.operator ? ' operator-controls' : ''}`}>
            <Link to="/profile">Din profil</Link>
            <Link to="/login-methods">Inloggningssätt</Link>
            {data.operator && <Link to="/costs">Månadskostnad</Link>}
            <span className="session-name">{data.user.name}</span>
            {logout}
          </div>
        ) : (
          <span className="header-note">Ett hushåll. En gemensam bild.</span>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        {bootstrap.status === 'loading' && <Loading />}
        {bootstrap.status === 'error' && <Failure onRetry={reload} />}
        {data?.status === 'anonymous' && <Login providers={data.providers} />}
        {data?.status === 'ready' && (
          <HouseholdWork
            key={data.user.id}
            account={account}
            onSessionExpired={reload}
            typeSettingsTarget={typeSettingsTarget}
            mapSettingsTarget={mapSettingsTarget}
          />
        )}
        {settingsPage ? (
          <SettingsScreen
            household={household}
            userName={data.user.name}
            operator={data.operator}
            personal={personal}
            signOut={location.pathname === '/profile' ? null : logout}
          >
            {pages}
          </SettingsScreen>
        ) : (
          pages
        )}
        {data?.status === 'forbidden' && !settingsPage && (
          <>
            <Forbidden />
            <InvitationEntry
              userId={data.user.id}
              showInvitation
              onAccepted={created}
              onReload={reload}
            />
          </>
        )}
      </main>
      <footer hidden={mapActive || Boolean(settingsPage)}>Det som hör ihop, samlat.</footer>
    </div>
  );
}
