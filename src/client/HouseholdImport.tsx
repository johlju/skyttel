import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ImportDiscovery, ImportStatus } from '../shared/household-import.js';
import type { MapState } from '../shared/map.js';
import { buildHeader, notifyOutdatedClient } from './build-guard.js';
import { MapRequestError, request } from './map-request.js';
import './household-recovery.css';

type Attempt = { id: string; contentVersion: number };

export function HouseholdImport({
  householdId,
  onAccessLost,
}: {
  householdId: string;
  onAccessLost: () => void;
}) {
  const path = `/api/households/${encodeURIComponent(householdId)}`;
  const storageKey = `skyttel-import:${householdId}`;
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportStatus | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      return value && typeof value.id === 'string' && Number.isSafeInteger(value.contentVersion)
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const knownAttempt = useRef(attempt);
  const [discoveryNeeded, setDiscoveryNeeded] = useState(!attempt);
  const active = useRef<AbortController | null>(null);
  const submittedFocus = useRef<Element | null>(null);
  const nextAction = useRef<HTMLButtonElement>(null);
  const fileControl = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLLegendElement>(null);
  useLayoutEffect(() => {
    if (busy) return;
    const previous = submittedFocus.current;
    submittedFocus.current = null;
    if (
      previous &&
      (document.activeElement === previous || document.activeElement === document.body)
    )
      (result?.status === 'ready'
        ? reviewHeading.current
        : (nextAction.current ?? fileControl.current)
      )?.focus();
  }, [busy, result?.status]);
  useEffect(() => () => active.current?.abort(), []);
  const remember = useCallback(
    (value: Attempt | null, blockedAction = '') => {
      try {
        if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
        else sessionStorage.removeItem(storageKey);
      } catch {
        setStorageError(
          `Webbläsarens återhämtningsminne kunde inte uppdateras. ${blockedAction} Behåll sidan öppen. Kontrollera webbläsarens lagringsinställningar och försök igen. Återhämtning efter omladdning kan inte garanteras.`,
        );
        return false;
      }
      knownAttempt.current = value;
      setAttempt(value);
      setStorageError('');
      return true;
    },
    [storageKey],
  );
  const observeAttempt = useCallback(
    (value: Attempt) => {
      if (!remember(value)) {
        // Keep the real server identity available for exact status reads.
        knownAttempt.current = value;
        setAttempt(value);
      }
    },
    [remember],
  );
  const discover = useCallback(() => {
    if (knownAttempt.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    void request<ImportDiscovery>(`${path}/imports`, undefined, controller.signal)
      .then(({ attempt: durable, ready }) => {
        if (controller.signal.aborted) return;
        const found =
          durable && ['prepared', 'cleanup'].includes(durable.status)
            ? durable
            : (ready ?? durable);
        setResult(found);
        setConfirmed(false);
        if (found && ['ready', 'cancel-cleanup', 'prepared', 'cleanup'].includes(found.status))
          observeAttempt({ id: found.id, contentVersion: found.confirmationContentVersion });
        setDiscoveryNeeded(false);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
          onAccessLost();
        setError(
          'Importens status kunde inte hämtas. Kontrollera anslutningen och hämta status innan du väljer en ny fil.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [path, observeAttempt, onAccessLost]);
  useEffect(() => {
    // A locally known uncertain attempt must be checked by that exact ID.
    // A newer operation cannot resolve its outcome.
    if (!knownAttempt.current) return discover();
  }, [discover]);
  function fail(failure: unknown, confirming = false) {
    if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) onAccessLost();
    if (
      failure instanceof MapRequestError &&
      ['content_conflict', 'import_unavailable'].includes(failure.code)
    ) {
      remember(null);
      setResult(null);
    }
    setError(
      failure instanceof MapRequestError && failure.code === 'import_unavailable'
        ? 'Den förberedda importen finns inte längre. Välj filen och förbered den igen.'
        : failure instanceof MapRequestError && failure.code === 'content_conflict'
          ? 'Hushållets innehåll har ändrats. Förbered filen igen och granska en ny ersättning.'
          : failure instanceof MapRequestError &&
              [
                'invalid_archive',
                'unsupported_archive',
                'archive_too_large',
                'archive_identity_conflict',
              ].includes(failure.code)
            ? 'Filen kan inte importeras. Kontrollera att det är en hel Skyttel-export i ett format och en storlek som stöds.'
            : confirming
              ? 'Ersättningen kunde inte bekräftas. Utfallet är okänt. Hämta importens status innan du försöker något annat.'
              : 'Importen kunde inte förberedas eller hämtas. Kontrollera anslutningen och försök igen.',
    );
  }
  async function prepare() {
    if (!file || busy || !remember(null, 'Ingen filkontroll har startats.')) return;
    submittedFocus.current = document.activeElement;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setCancelled(false);
    setConfirmed(false);
    setResult(null);
    let submitted = false;
    try {
      const state = await request<MapState>(`${path}/map`, undefined, controller.signal);
      submitted = true;
      const response = await fetch(`${path}/imports`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/zip',
          'X-Skyttel-Build': buildHeader,
          'X-Skyttel-Content-Version': String(state.contentVersion),
        },
        body: file,
      });
      const value = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        notifyOutdatedClient(value.error);
        throw new MapRequestError(response.status, value.error);
      }
      setResult(value as ImportStatus);
      observeAttempt({ id: value.id, contentVersion: state.contentVersion });
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (submitted && (!(failure instanceof MapRequestError) || failure.status >= 500)) {
          setDiscoveryNeeded(true);
          setError(
            'Svaret från filkontrollen saknas. Hämta importens status för att återfå din granskning innan du väljer en ny fil. Innehållet har inte ersatts.',
          );
        } else fail(failure);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function recover(confirm = false) {
    if (!attempt || busy) return;
    if (confirm && !remember(attempt, 'Ingen ersättning har startats eller fortsatt.')) return;
    submittedFocus.current = document.activeElement;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    if (confirm) setResult(null);
    try {
      const value = await request<ImportStatus>(
        `${path}/imports/${encodeURIComponent(attempt.id)}${confirm ? '/confirm' : ''}`,
        confirm ? { confirmed: true, contentVersion: attempt.contentVersion } : undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult(value);
      if (value.status === 'completed' || value.status === 'failed') remember(null);
      else remember(attempt);
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure, confirm);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function cancel() {
    if (!attempt || busy) return;
    submittedFocus.current = document.activeElement;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setConfirmed(false);
    setResult(null);
    try {
      const value = await request<{ cancelled: true } | ImportStatus>(
        `${path}/imports/${encodeURIComponent(attempt.id)}/cancel`,
        {},
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if ('cancelled' in value) {
        remember(null);
        setFile(null);
        if (fileControl.current) fileControl.current.value = '';
        setCancelled(true);
      } else setResult(value);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) onAccessLost();
      setError(
        'Svaret från avbrottet saknas. Utfallet är okänt. Hämta importens status innan du försöker något annat.',
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const uncertain = discoveryNeeded || Boolean(attempt && result?.status !== 'ready');
  const step = result?.status === 'ready' ? 1 : result || attempt ? 2 : 0;
  const attemptId = result?.id ?? attempt?.id;
  return (
    <section
      className="panel household-import"
      aria-labelledby="household-import-heading"
      aria-busy={busy}
    >
      <h1 id="household-import-heading" tabIndex={-1}>
        Återimportera hushållet
      </h1>
      <ol className="import-steps" aria-label="Importens steg">
        {['Välj underlag', 'Granska ersättningen', 'Resultat'].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            data-reached={index <= step}
          >
            <span>{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      {result?.status !== 'ready' && (
        <p className="recovery-note">
          En fullständig import ersätter hushållets karta, bilder, ändringshistorik, alla privata
          utkast och personliga vyer. Nuvarande medlemmar, administratörer, inbjudningar och
          inloggningar behålls.
        </p>
      )}
      <p>
        Exportera först om du vill behålla det innehåll som finns nu. Gamla identiteter i filen ger
        inte någon ny åtkomst. Privata utkast från andra installationer förblir utan ägare tills en
        administratör uttryckligen kopplar dem.
      </p>
      <label>
        Skyttel-export (ZIP)
        <input
          ref={fileControl}
          type="file"
          accept=".zip,application/zip"
          disabled={busy || uncertain}
          onChange={(event) => {
            if (!remember(null)) {
              setFile(null);
              event.target.value = '';
              return;
            }
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
            setConfirmed(false);
            setCancelled(false);
          }}
        />
      </label>
      <button type="button" disabled={!file || busy || uncertain} onClick={() => void prepare()}>
        Kontrollera importfil
      </button>
      {result?.status === 'ready' && (
        <fieldset>
          <legend ref={reviewHeading} tabIndex={-1}>
            Granska ersättningen
          </legend>
          <div className="import-comparison">
            <section>
              <h2>Ersätts</h2>
              <p>Karta, bilder, ändringshistorik, alla privata utkast och personliga vyer.</p>
              <p>
                {result.counts.objects ?? 0} objekt och {result.counts.relationships ?? 0} samband i
                filen.
              </p>
            </section>
            <section>
              <h2>Behålls</h2>
              <p>Nuvarande medlemmar, administratörer, inbjudningar och inloggningar.</p>
              <p>Historiska identiteter ger ingen ny tillgång. Två kartor slås inte ihop.</p>
            </section>
          </div>
          <p>
            Filen är kontrollerad. Den innehåller {result.counts.objects ?? 0} objekt,{' '}
            {result.counts.relationships ?? 0} samband och {result.counts.saves ?? 0} sparanden.
            Innehållet är ännu inte ersatt.
          </p>
          <p>
            Alla användare måste läsa in aktuellt innehåll efter ersättningen. Gamla osparade
            formulär kan inte sparas.
          </p>
          <p>
            Förberedelsen gäller i tio minuter och försvinner vid en omstart. Granska den på nytt om
            den inte längre finns.
          </p>
          <label className="recovery-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Jag vill ersätta allt hushållsinnehåll med den kontrollerade filen.
          </label>
          <button
            type="button"
            className="primary"
            disabled={!confirmed || busy}
            onClick={() => void recover(true)}
          >
            Ersätt hushållets innehåll
          </button>
          <button type="button" disabled={busy} onClick={() => void cancel()}>
            Avbryt förberedelsen
          </button>
        </fieldset>
      )}
      {attempt && (
        <button
          ref={
            ['cleanup', 'cancel-cleanup'].includes(result?.status ?? '') ? undefined : nextAction
          }
          type="button"
          disabled={busy}
          onClick={() => void recover()}
        >
          Hämta importens status
        </button>
      )}
      {discoveryNeeded && (
        <button ref={nextAction} type="button" disabled={busy} onClick={() => discover()}>
          Hämta importens status
        </button>
      )}
      {attemptId && (
        <dl className="recovery-facts">
          <dt>{result?.status === 'ready' ? 'Obekräftad förberedelse' : 'Importförsök'}</dt>
          <dd>{attemptId}</dd>
        </dl>
      )}
      {result?.status === 'prepared' && (
        <p role="status">Importen pågår. Hämta status igen innan du fortsätter.</p>
      )}
      {result?.status === 'cancel-cleanup' && (
        <>
          <p role="status">
            Förberedelsen kan inte längre användas. Tillfälliga filer behöver rensas. Hushållets
            innehåll är inte ersatt och kartan kan användas.
          </p>
          <button ref={nextAction} type="button" disabled={busy} onClick={() => void cancel()}>
            Slutför förberedelsens rensning
          </button>
        </>
      )}
      {cancelled && (
        <p role="status">Förberedelsen är avbruten och tillfälliga filer är borttagna.</p>
      )}
      {result?.status === 'cleanup' && (
        <>
          <p role="status">
            Innehållet är ersatt. Tillfälliga filer behöver rensas innan kartan kan öppnas.
          </p>
          <button
            ref={nextAction}
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void recover(true)}
          >
            Slutför importens rensning
          </button>
        </>
      )}
      {result?.status === 'completed' && (
        <>
          <p role="status">Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.</p>
          <button
            ref={nextAction}
            type="button"
            className="primary"
            onClick={() => window.location.reload()}
          >
            Läs in det återställda hushållet
          </button>
        </>
      )}
      {result?.status === 'failed' && (
        <p role="alert">
          Importen genomfördes inte. Hushållets tidigare innehåll är kvar. Förbered filen igen.
        </p>
      )}
      {busy && <p role="status">Behandlar importen…</p>}
      {storageError && (
        <p role="alert" className="error">
          {storageError}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
