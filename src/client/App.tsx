import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import type { Administration, HouseholdInvitation } from '../shared/administration.js';
import { householdNameMaxLength, normalizeHouseholdName } from '../shared/household-name.js';
import { HouseholdMap } from './HouseholdMap.js';
import { MapRequestError as RequestError, request } from './map-request.js';

type Provider = 'google' | 'microsoft';
type Household = { id: string; name: string; role: 'administrator' | 'member' };
type Bootstrap = { providers: Provider[] } & (
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
              code !== 403
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

function Heading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1}>
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
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState(
    new URLSearchParams(location.search).has('authError') ||
      new URLSearchParams(location.search).has('error'),
  );
  async function signIn(provider: Provider) {
    setPending(provider);
    setError(false);
    try {
      const result = await request<{ url: string }>('/api/auth/sign-in/social', {
        provider,
        callbackURL: '/',
        errorCallbackURL: '/?authError=1',
      });
      if (typeof result.url !== 'string') throw new Error('invalid_redirect');
      const url = new URL(result.url, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_redirect');
      window.location.assign(url.href);
    } catch {
      setPending(null);
      setError(true);
    }
  }
  return (
    <section className="panel">
      <p className="eyebrow">Hushållets gemensamma karta</p>
      <Heading>Välkommen till Skyttel</Heading>
      <p className="intro">Samla hushållets digitala och ekonomiska samband på ett ställe.</p>
      <fieldset className="sign-in-options" aria-label="Inloggningssätt">
        {providers.map((provider) => {
          const label = provider === 'google' ? 'Google' : 'Microsoft';
          return (
            <button
              type="button"
              key={provider}
              className="provider"
              disabled={pending !== null}
              onClick={() => void signIn(provider)}
            >
              <span className={`provider-mark ${provider}`} aria-hidden="true">
                {provider === 'google' ? 'G' : '⊞'}
              </span>
              {pending === provider ? `Öppnar ${label}…` : `Fortsätt med ${label}`}
            </button>
          );
        })}
      </fieldset>
      {pending && (
        <p className="muted" role="status">
          Du skickas vidare för att logga in.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          Inloggningen kunde inte slutföras. Försök igen med Google eller Microsoft.
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
  const [error, setError] = useState(new URLSearchParams(useLocation().search).has('failed'));
  async function action(step: string, provider?: Provider) {
    setPending(true);
    setError(false);
    try {
      const response = await request<{ url?: string }>(`/api/login-methods/${step}`, { provider });
      if (step === 'cancel') setRevision((value) => value + 1);
      else if (response.url && ['http:', 'https:'].includes(new URL(response.url).protocol))
        window.location.assign(response.url);
      else throw new Error('invalid_redirect');
    } catch {
      setError(true);
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
    <section className="panel">
      <Heading>Inloggningssätt</Heading>
      <p>
        Verifiera först en kopplad inloggning och sedan den nya. Ditt Skyttel-användar-ID, innehåll
        och din tillgång till hushållet bevaras. Samma e-postadress länkar aldrig inloggningar
        automatiskt.
      </p>
      <ul>
        {providers.map((provider) => (
          <li key={provider}>{labels[provider]} – kopplat</li>
        ))}
      </ul>
      {stage === 'complete' && providers.length === 2 && (
        <p role="status">
          Länkningen är verifierad. Båda inloggningssätten når samma Skyttel-användare.
        </p>
      )}
      {providers.length < 2 && (
        <>
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
            <button
              key={provider}
              type="button"
              disabled={pending}
              onClick={() => void action(stage === 'verified' ? 'add' : 'prove', provider)}
            >
              {stage === 'verified' ? 'Koppla' : 'Verifiera'} {labels[provider]}
            </button>
          ))}
        </>
      )}
      {stage && stage !== 'complete' && (
        <button type="button" disabled={pending} onClick={() => void action('cancel')}>
          Avbryt länkning
        </button>
      )}
      {pending && <p role="status">Kontrollerar inloggningen…</p>}
      {(error || stage === 'failed') && (
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
        Du är installationens första administratör. Ge hushållet ett namn för att komma igång.
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
        Den här inloggningen har inte tillgång till hushållet. Logga ut för att använda en annan
        inloggning.
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
  const [code, setCode] = useState<{ invitationId: string; value: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<string | null>(null);
  const [confirmInvitation, setConfirmInvitation] = useState<string | null>(null);
  const sessionExpired = result.status === 'error' && result.code === 401;
  useEffect(() => {
    if (sessionExpired) onReload();
  }, [sessionExpired, onReload]);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  return (
    <section className="panel administration-panel">
      <Link to={`/households/${encodeURIComponent(id ?? '')}`}>Till hushållet</Link>
      <Heading>Administrera tillgång</Heading>
      <p>
        Alla medlemmar har samma insyn i hushållets gemensamma karta. Administratörer hanterar
        tillgången.
      </p>
      <form onSubmit={(event) => void invite(event)} aria-busy={pending}>
        <h2>Bjud in en Skyttel-användare</h2>
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
          Be mottagaren logga in och dela sitt ID från Skyttel. Inbjudan gäller i sju dagar. En ny
          inbjudan ersätter tidigare väntande inbjudan till samma användare.
        </p>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? 'Skapar inbjudan…' : 'Skapa inbjudan'}
        </button>
      </form>
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
      {code &&
        result.data.invitations.some(
          (invitation) => invitation.id === code.invitationId && invitation.status === 'pending',
        ) && (
          <div className="invitation-result">
            <p role="status">
              Inbjudan är skapad. Dela koden med den avsedda mottagaren. Koden visas bara nu.
            </p>
            <label htmlFor="created-code">Inbjudningskod att dela</label>
            <input id="created-code" readOnly value={code.value} />
          </div>
        )}
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
                  Återkalla tillgång för {member.name}? Alla befintliga sessioner förlorar tillgång.
                  Personer och innehåll i kartan finns kvar.
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
                  <button type="button" disabled={pending} onClick={() => setConfirmMember(null)}>
                    Avbryt
                  </button>
                </div>
              </fieldset>
            )}
          </li>
        ))}
      </ul>
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
    </section>
  );
}

function HouseholdPage({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { id } = useParams();
  const [revision, setRevision] = useState(0);
  const result = useResource<{ household: Household }>(
    `/api/households/${encodeURIComponent(id ?? '')}`,
    revision,
    true,
  );
  const sessionExpired = result.status === 'error' && result.code === 401;
  useEffect(() => {
    if (sessionExpired) onSessionExpired();
  }, [sessionExpired, onSessionExpired]);
  if (result.status === 'loading' || sessionExpired) return <Loading />;
  if (result.status === 'error') {
    return result.code === 403 ? (
      <Forbidden />
    ) : (
      <Failure onRetry={() => setRevision((value) => value + 1)} />
    );
  }
  return (
    <section className="panel household-panel">
      <p className="eyebrow">Din privata hushållskarta</p>
      <Heading>{result.data.household.name}</Heading>
      <p className="membership">
        {result.data.household.role === 'administrator' ? 'Administratör' : 'Medlem'}
      </p>
      {result.data.household.role === 'administrator' && (
        <p>
          <Link to={`/households/${encodeURIComponent(result.data.household.id)}/administration`}>
            Administrera tillgång
          </Link>
        </p>
      )}
      <HouseholdMap key={result.data.household.id} householdId={result.data.household.id} />
      <div className="empty-state">
        <div className="weave-mark" aria-hidden="true">
          ↗
        </div>
        <h2>Hushållet är redo</h2>
        <p>
          Ditt hushåll är skapat. Du kan återkomma hit genom att logga in med samma inloggningssätt.
        </p>
      </div>
    </section>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
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
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Hoppa till innehållet
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Skyttel, startsida">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M6 8h12a8 8 0 0 1 0 16H6M26 8H14a8 8 0 0 0 0 16h12" />
            <path d="m20 3-8 26" />
          </svg>
          Skyttel
        </Link>
        {data && data.status !== 'anonymous' ? (
          <div className="session-controls">
            <Link to="/login-methods">Inloggningssätt</Link>
            <span className="session-name">{data.user?.name}</span>
            <button type="button" disabled={signingOut} onClick={() => void signOut()}>
              {signingOut ? 'Loggar ut…' : 'Logga ut'}
            </button>
          </div>
        ) : (
          <span className="header-note">Ett hushåll. En gemensam bild.</span>
        )}
      </header>
      {signOutError && (
        <p className="error sign-out-error" role="alert">
          Du kunde inte loggas ut. Kontrollera anslutningen och försök igen.
        </p>
      )}
      <main id="main" tabIndex={-1}>
        {bootstrap.status === 'loading' && <Loading />}
        {bootstrap.status === 'error' && <Failure onRetry={reload} />}
        {data?.status === 'anonymous' && <Login providers={data.providers} />}
        {data && data.status !== 'anonymous' && location.pathname === '/login-methods' && (
          <LoginMethods />
        )}
        {data?.status === 'forbidden' && location.pathname !== '/login-methods' && <Forbidden />}
        {data &&
          location.pathname !== '/login-methods' &&
          (data.status === 'setup' || data.status === 'ready') && (
            <Routes>
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
              <Route path="/households/:id" element={<HouseholdPage onSessionExpired={reload} />} />
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
        {data && (data.status === 'forbidden' || data.status === 'ready') && (
          <InvitationEntry
            userId={data.user.id}
            showInvitation={data.status === 'forbidden' || data.household.role !== 'administrator'}
            onAccepted={created}
            onReload={reload}
          />
        )}
      </main>
      <footer>Det som hör ihop, samlat.</footer>
    </div>
  );
}
