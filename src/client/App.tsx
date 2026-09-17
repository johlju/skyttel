import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { householdNameMaxLength, normalizeHouseholdName } from '../shared/household-name.js';

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

class RequestError extends Error {
  constructor(readonly status: number) {
    super('request_failed');
  }
}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new RequestError(response.status);
  return response.json() as Promise<T>;
}

function useResource<T>(path: string, revision = 0): LoadState<T> {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{ key: string; state: LoadState<T> }>({
    key,
    state: { status: 'loading' },
  });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, state: { status: 'loading' } });
    request<T>(path, undefined, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'loaded', data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            state: {
              status: 'error',
              code: error instanceof RequestError ? error.status : undefined,
            },
          });
      },
    );
    return () => controller.abort();
  }, [path, key]);
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
      <p className="muted">Kontakta den som ansvarar för installationen om du behöver hjälp.</p>
      <Link to="/">Till startsidan</Link>
    </section>
  );
}

function HouseholdPage({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { id } = useParams();
  const [revision, setRevision] = useState(0);
  const result = useResource<{ household: Household }>(
    `/api/households/${encodeURIComponent(id ?? '')}`,
    revision,
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
  const [revision, setRevision] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const bootstrap = useResource<Bootstrap>('/api/bootstrap', revision);
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
        {data?.status === 'forbidden' && <Forbidden />}
        {data && (data.status === 'setup' || data.status === 'ready') && (
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
      </main>
      <footer>Det som hör ihop, samlat.</footer>
    </div>
  );
}
