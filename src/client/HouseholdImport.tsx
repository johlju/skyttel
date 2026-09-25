import { useEffect, useRef, useState } from 'react';
import type { MapState } from '../shared/map.js';
import { buildHeader, notifyOutdatedClient } from './build-guard.js';
import { MapRequestError, request } from './map-request.js';

type ImportStatus = {
  id: string;
  status: 'ready' | 'prepared' | 'cleanup' | 'completed' | 'failed';
  contentVersion: number;
  counts: Record<string, number>;
  expiresAt?: string;
  error?: string;
};
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
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function remember(value: Attempt | null) {
    setAttempt(value);
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }
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
    if (!file || busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setConfirmed(false);
    setResult(null);
    try {
      const state = await request<MapState>(`${path}/map`, undefined, controller.signal);
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
      if (!response.ok) {
        notifyOutdatedClient(value.error);
        throw new MapRequestError(response.status, value.error);
      }
      setResult(value as ImportStatus);
      remember({ id: value.id, contentVersion: state.contentVersion });
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function recover(confirm = false) {
    if (!attempt || busy) return;
    setBusy(true);
    setError('');
    if (confirm) setResult(null);
    try {
      const value = await request<ImportStatus>(
        `${path}/imports/${encodeURIComponent(attempt.id)}${confirm ? '/confirm' : ''}`,
        confirm ? { confirmed: true, contentVersion: attempt.contentVersion } : undefined,
      );
      setResult(value);
      if (value.status === 'completed' || value.status === 'failed') remember(null);
    } catch (failure) {
      fail(failure, confirm);
    } finally {
      setBusy(false);
    }
  }
  const uncertain = Boolean(attempt && result?.status !== 'ready');
  return (
    <section aria-labelledby="household-import-heading" aria-busy={busy}>
      <h2 id="household-import-heading" className="section-heading">
        Återimportera hushållet
      </h2>
      <p>
        En fullständig import ersätter hushållets karta, bilder, ändringshistorik, alla privata
        utkast och personliga vyer. Nuvarande medlemmar, administratörer, inbjudningar och
        inloggningar behålls.
      </p>
      <p>
        Exportera först om du vill behålla det innehåll som finns nu. Gamla identiteter i filen ger
        inte någon ny åtkomst. Privata utkast från andra installationer förblir utan ägare tills en
        administratör uttryckligen kopplar dem.
      </p>
      <label>
        Skyttel-export (ZIP)
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={busy || uncertain}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
            setConfirmed(false);
            remember(null);
          }}
        />
      </label>
      <button type="button" disabled={!file || busy || uncertain} onClick={() => void prepare()}>
        Kontrollera importfil
      </button>
      {result?.status === 'ready' && (
        <fieldset>
          <legend>Granska ersättningen</legend>
          <p>
            Filen är kontrollerad. Den innehåller {result.counts.objects ?? 0} objekt,{' '}
            {result.counts.relationships ?? 0} samband och {result.counts.saves ?? 0} sparanden.
            Innehållet är ännu inte ersatt.
          </p>
          <p>
            Alla användare måste läsa in aktuellt innehåll efter ersättningen. Gamla osparade
            formulär kan inte sparas.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Jag vill ersätta allt hushållsinnehåll med den kontrollerade filen.
          </label>
          <button type="button" disabled={!confirmed || busy} onClick={() => void recover(true)}>
            Ersätt hushållets innehåll
          </button>
        </fieldset>
      )}
      {attempt && (
        <button type="button" disabled={busy} onClick={() => void recover()}>
          Hämta importens status
        </button>
      )}
      {result?.status === 'prepared' && (
        <p role="status">Importen pågår. Hämta status igen innan du fortsätter.</p>
      )}
      {result?.status === 'cleanup' && (
        <>
          <p role="status">
            Innehållet är ersatt. Tillfälliga filer behöver rensas innan kartan kan öppnas.
          </p>
          <button type="button" disabled={busy} onClick={() => void recover(true)}>
            Slutför importens rensning
          </button>
        </>
      )}
      {result?.status === 'completed' && (
        <>
          <p role="status">Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.</p>
          <button type="button" onClick={() => window.location.reload()}>
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
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
