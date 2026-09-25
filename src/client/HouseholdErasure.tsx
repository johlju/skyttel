import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ErasureItem,
  ErasureKind,
  ErasureReview,
  ErasureSelection,
  ErasureStatus,
} from '../shared/household-erasure.js';
import { MapRequestError, request } from './map-request.js';

type Catalog = {
  objects: ErasureItem[];
  relationships: ErasureItem[];
  objectTypes: ErasureItem[];
  relationshipTypes: ErasureItem[];
  status: ErasureStatus | null;
};
const groups = [
  ['objects', 'object', 'Objekt'],
  ['relationships', 'relationship', 'Samband'],
  ['objectTypes', 'objectType', 'Objekttyper'],
  ['relationshipTypes', 'relationshipType', 'Sambandstyper'],
] as const;
type Attempt = {
  selection: ErasureSelection;
  token: string;
  operationId: string;
  confirmation: string;
};

export function HouseholdErasure({
  householdId,
  onAccessLost,
}: {
  householdId: string;
  onAccessLost: () => void;
}) {
  const path = `/api/households/${encodeURIComponent(householdId)}/erasure`;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selection, setSelection] = useState<ErasureSelection>([]);
  const [review, setReview] = useState<ErasureReview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<ErasureStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const alive = useRef(true);
  const denied = useCallback(
    (failure: unknown) => {
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
        setAccessLost(true);
        onAccessLost();
        return true;
      }
      return false;
    },
    [onAccessLost],
  );
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setBusy(true);
    void request<Catalog>(path, undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setCatalog(result);
        setStatus(result.status);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && !denied(failure))
          setError('Innehållet och raderingsstatus kunde inte hämtas. Försök läsa in dem igen.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [path, denied]);
  function select(kind: ErasureKind, id: string, checked: boolean) {
    setSelection((previous) =>
      checked
        ? [...previous, { kind, id }]
        : previous.filter((item) => item.kind !== kind || item.id !== id),
    );
    setReview(null);
    setStatus(null);
    setConfirmation('');
  }
  async function inspect() {
    setBusy(true);
    setError(null);
    try {
      const result = await request<ErasureReview>(`${path}/review`, { selection });
      if (!alive.current) return;
      setReview(result);
      setConfirmation('');
    } catch (failure) {
      if (alive.current && !denied(failure))
        setError('Omfattningen kunde inte hämtas. Läs in aktuellt innehåll och granska igen.');
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError(null);
    setReview(null);
    setConfirmation('');
    try {
      const result = await request<Catalog>(path);
      if (!alive.current) return;
      setCatalog(result);
      if (attempt && result.status?.operationId !== attempt.operationId) {
        setStatus(null);
        setError(
          'Inget bekräftat resultat hittades för ditt försök. Utfallet är fortfarande oklart. Återförsök samma radering.',
        );
      } else {
        setStatus(result.status);
        setSelection([]);
        setAttempt(null);
        setUncertain(false);
      }
    } catch (failure) {
      if (alive.current && !denied(failure))
        setError(
          'Raderingsstatus kunde inte hämtas. Utfallet är fortfarande oklart. Försök kontrollera status igen.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ status: ErasureStatus }>(`${path}/resume`, {
        operationId: status.operationId,
      });
      if (!alive.current) return;
      setStatus(result.status);
      setCatalog(null);
      setUncertain(false);
    } catch (failure) {
      if (alive.current && !denied(failure)) {
        setUncertain(true);
        setError('Utfallet är oklart. Kontrollera raderingsstatus innan du fortsätter.');
      }
    } finally {
      setBusy(false);
    }
  }
  const unfinished = status && ['prepared', 'cleanup'].includes(status.phase);
  async function execute() {
    if (!attempt && (!review || confirmation !== 'RADERA PERMANENT')) return;
    const body = attempt ?? {
      selection: (review as ErasureReview).selection,
      token: (review as ErasureReview).token,
      operationId: crypto.randomUUID(),
      confirmation,
    };
    setAttempt(body);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await request<{ status: ErasureStatus }>(`${path}/execute`, body);
      if (!alive.current) return;
      setStatus(result.status);
      setReview(null);
      setCatalog(null);
      setSelection([]);
      setConfirmation('');
      setAttempt(null);
      setUncertain(false);
    } catch (failure) {
      if (!alive.current || denied(failure)) return;
      setReview(null);
      setConfirmation('');
      if (failure instanceof MapRequestError && failure.code === 'erasure_review_changed') {
        setAttempt(null);
        setUncertain(false);
        setError(
          'Innehållet har ändrats. Granska raderingen igen och bekräfta den nya omfattningen.',
        );
      } else {
        setUncertain(true);
        setError('Utfallet är oklart. Kontrollera raderingsstatus innan du fortsätter.');
      }
    } finally {
      setBusy(false);
    }
  }
  if (accessLost) return null;
  return (
    <section aria-labelledby="household-erasure-heading" aria-busy={busy}>
      <h2 id="household-erasure-heading" className="section-heading">
        Permanent radering
      </h2>
      <p>
        Permanent radering kan inte ångras i Skyttel. Den tar bort berörd information även ur
        historik, privata utkast, personliga vyer och bildversioner. Det skiljer sig från vanlig
        borttagning och att markera något som upphört.
      </p>
      <p>
        Redan nedladdade exporter ändras inte. En senare uttrycklig import kan återföra innehållet.
        Omedelbar fysisk radering ur leverantörens alla interna kopior garanteras inte.
      </p>
      {busy && <p role="status">Arbetar med raderingsärendet…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!uncertain && status?.phase === 'completed' && (
        <p role="status">Den permanenta raderingen är slutförd.</p>
      )}
      {!uncertain && status?.phase === 'failed' && (
        <p role="status">
          Raderingen misslyckades innan innehållet ändrades. Ingen information raderades genom detta
          försök. Läs in aktuellt innehåll och granska på nytt.
        </p>
      )}
      {unfinished && (
        <>
          <p role="status">
            Raderingen är inte slutförd. Hushållets innehåll är tillfälligt otillgängligt tills
            raderingen och städningen har verifierats.
          </p>
          <button type="button" disabled={busy || uncertain} onClick={() => void resume()}>
            Försök slutföra raderingen
          </button>
        </>
      )}
      <button type="button" disabled={busy} onClick={() => void refresh()}>
        Kontrollera raderingsstatus och läs in aktuellt innehåll
      </button>
      {uncertain && attempt && (
        <button type="button" disabled={busy} onClick={() => void execute()}>
          Återförsök samma radering
        </button>
      )}
      {catalog && !unfinished && !uncertain && (
        <fieldset disabled={busy}>
          <legend>Välj information att radera</legend>
          {groups.map(([key, kind, label]) => (
            <fieldset key={kind}>
              <legend>{label}</legend>
              {catalog[key].map((item) => (
                <div key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selection.some(
                        (selected) => selected.kind === kind && selected.id === item.id,
                      )}
                      onChange={(event) => select(kind, item.id, event.target.checked)}
                    />
                    {item.name}
                  </label>
                  <small>
                    Identitet: <code>{item.id}</code>
                  </small>
                </div>
              ))}
            </fieldset>
          ))}
          <button type="button" disabled={!selection.length} onClick={() => void inspect()}>
            Granska raderingen
          </button>
        </fieldset>
      )}
      {review && (
        <section aria-labelledby="erasure-review-heading">
          <h3 id="erasure-review-heading">Omfattning att bekräfta</h3>
          {groups.map(([key, kind, label]) => (
            <div key={kind}>
              <h4>
                {label}: {review[key].length}
              </h4>
              <ul aria-label={`Berörda ${label.toLocaleLowerCase('sv')}`}>
                {review[key].map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span> · <code>{item.id}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p>
            Privata objekt: {review.privateObjects}. Privata samband: {review.privateRelationships}.
          </p>
          <p>
            Historiska ändringar: {review.historyChanges}. Privata ändringar:{' '}
            {review.privateChanges}. Bildversioner: {review.images}.
          </p>
          <p>
            Personliga placeringar: {review.positions}. Privata bildversioner:{' '}
            {review.privateImages}.
          </p>
          <h4>Berörda bildversioner</h4>
          <ul aria-label="Berörda bildversioner">
            {review.imageVersions.map((image) => (
              <li key={image.id}>
                {review.objects.find((object) => object.id === image.objectId)?.name ??
                  image.objectId}{' '}
                (<code>{image.objectId}</code>), bildversion <code>{image.id}</code>
              </li>
            ))}
          </ul>
          <p>
            Andra användares privata innehåll visas bara som antal. Kontrollera omfattningen innan
            du bekräftar.
          </p>
          <label htmlFor="erasure-confirmation">Skriv RADERA PERMANENT</label>
          <input
            id="erasure-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || confirmation !== 'RADERA PERMANENT'}
            onClick={() => void execute()}
          >
            Radera permanent
          </button>
        </section>
      )}
    </section>
  );
}
