import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ErasureItem,
  ErasureKind,
  ErasureReview,
  ErasureSelection,
  ErasureStatus,
} from '../shared/household-erasure.js';
import { MapRequestError, request } from './map-request.js';
import './household-recovery.css';

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
  const storageKey = `skyttel-erasure:${householdId}`;
  const [operationId, setOperationId] = useState<string | null>(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      return value && /^[\w-]{1,128}$/.test(value) ? value : null;
    } catch {
      return null;
    }
  });
  const knownOperation = useRef(operationId);
  const remember = useCallback(
    (id: string | null) => {
      knownOperation.current = id;
      setOperationId(id);
      if (id) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    },
    [storageKey],
  );
  const readCurrent = useCallback(
    async (signal?: AbortSignal) => {
      const id = knownOperation.current;
      if (!id) {
        const catalog = await request<Catalog>(path, undefined, signal);
        return { catalog, status: catalog.status, catalogUnavailable: false };
      }
      // A newer catalog result cannot resolve a locally known operation.
      const { status } = await request<{ status: ErasureStatus }>(
        `${path}/${encodeURIComponent(id)}`,
        undefined,
        signal,
      );
      try {
        const catalog = await request<Catalog>(path, undefined, signal);
        return { catalog, status, catalogUnavailable: false };
      } catch (failure) {
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
          throw failure;
        return { catalog: null, status, catalogUnavailable: true };
      }
    },
    [path],
  );
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selection, setSelection] = useState<ErasureSelection>([]);
  const [review, setReview] = useState<ErasureReview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<ErasureStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [uncertain, setUncertain] = useState(Boolean(operationId));
  const alive = useRef(true);
  const submittedFocus = useRef<Element | null>(null);
  const selectionHeading = useRef<HTMLLegendElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const nextAction = useRef<HTMLButtonElement>(null);
  const unfinished = status && ['prepared', 'cleanup'].includes(status.phase);
  const step = review ? 1 : status || uncertain ? 2 : 0;
  useLayoutEffect(() => {
    if (busy) return;
    const previous = submittedFocus.current;
    submittedFocus.current = null;
    if (
      previous &&
      (document.activeElement === previous || document.activeElement === document.body)
    )
      (review ? reviewHeading.current : (nextAction.current ?? selectionHeading.current))?.focus();
  }, [busy, review]);
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
    void readCurrent(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setCatalog(result.catalog);
        setStatus(result.status);
        remember(result.status?.operationId ?? null);
        setUncertain(false);
        if (result.catalogUnavailable)
          setError(
            'Raderingsstatusen är återläst, men aktuellt innehåll kunde inte hämtas. Försök läsa in det igen.',
          );
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && !denied(failure))
          setError(
            knownOperation.current
              ? 'Raderingsstatus kunde inte hämtas. Utfallet är fortfarande oklart. Kontrollera samma raderingsstatus igen.'
              : 'Innehållet och raderingsstatus kunde inte hämtas. Försök läsa in dem igen.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [readCurrent, denied, remember]);
  function select(kind: ErasureKind, id: string, checked: boolean) {
    remember(null);
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
    submittedFocus.current = document.activeElement;
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
    submittedFocus.current = document.activeElement;
    setBusy(true);
    setError(null);
    setReview(null);
    setConfirmation('');
    try {
      const result = await readCurrent();
      if (!alive.current) return;
      setCatalog(result.catalog);
      setStatus(result.status);
      remember(result.status?.operationId ?? null);
      setSelection([]);
      setAttempt(null);
      setUncertain(false);
      if (result.catalogUnavailable)
        setError(
          'Raderingsstatusen är återläst, men aktuellt innehåll kunde inte hämtas. Försök läsa in det igen.',
        );
    } catch (failure) {
      if (alive.current && !denied(failure)) {
        setUncertain(Boolean(knownOperation.current));
        setError(
          failure instanceof MapRequestError && failure.status === 404
            ? 'Inget bekräftat resultat hittades för ditt försök. Utfallet är fortfarande oklart. Kontrollera samma raderingsstatus igen.'
            : 'Raderingsstatus kunde inte hämtas. Utfallet är fortfarande oklart. Försök kontrollera status igen.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    if (!status) return;
    remember(status.operationId);
    submittedFocus.current = document.activeElement;
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
  async function execute() {
    if (!attempt && (!review || confirmation !== 'RADERA PERMANENT')) return;
    submittedFocus.current = document.activeElement;
    const body = attempt ?? {
      selection: (review as ErasureReview).selection,
      token: (review as ErasureReview).token,
      operationId: crypto.randomUUID(),
      confirmation,
    };
    remember(body.operationId);
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
        remember(null);
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
    <section
      className="panel household-erasure"
      aria-labelledby="household-erasure-heading"
      aria-busy={busy}
    >
      <h1 id="household-erasure-heading" tabIndex={-1}>
        Permanent radering
      </h1>
      <ol className="erasure-steps" aria-label="Raderingens steg">
        {['Välj information', 'Granska hela omfattningen', 'Resultat'].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            data-reached={index <= step}
          >
            <span>{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <p className="recovery-note">
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
      {operationId && (
        <dl className="recovery-facts">
          <dt>Raderingsförsök</dt>
          <dd>{operationId}</dd>
        </dl>
      )}
      {!uncertain && status?.phase === 'completed' && (
        <ul aria-label="Raderingens resultat">
          <li>Objekt: {status.counts.objects}</li>
          <li>Samband: {status.counts.relationships}</li>
          <li>Objekttyper: {status.counts.objectTypes}</li>
          <li>Sambandstyper: {status.counts.relationshipTypes}</li>
          <li>Bildversioner: {status.counts.images}</li>
        </ul>
      )}
      {!uncertain && status?.phase === 'completed' && (
        <>
          <p role="status">Den permanenta raderingen är slutförd.</p>
          <p>Läs in aktuellt innehåll innan du fortsätter. Skicka inte gamla ändringar igen.</p>
          <button
            ref={nextAction}
            type="button"
            className="primary"
            onClick={() => window.location.assign(`/households/${encodeURIComponent(householdId)}`)}
          >
            Läs in kartan på nytt
          </button>
        </>
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
          <button
            ref={uncertain ? undefined : nextAction}
            type="button"
            disabled={busy || uncertain}
            onClick={() => void resume()}
          >
            Försök slutföra raderingen
          </button>
        </>
      )}
      <button
        ref={uncertain || status?.phase === 'failed' ? nextAction : undefined}
        type="button"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Kontrollera raderingsstatus och läs in aktuellt innehåll
      </button>
      {uncertain && attempt && (
        <button type="button" disabled={busy} onClick={() => void execute()}>
          Återförsök samma radering
        </button>
      )}
      {catalog && !unfinished && !review && !uncertain && (
        <fieldset disabled={busy}>
          <legend ref={selectionHeading} tabIndex={-1}>
            Välj information att radera
          </legend>
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
          <h2 id="erasure-review-heading" ref={reviewHeading} tabIndex={-1}>
            Omfattning att bekräfta
          </h2>
          {groups.map(([key, kind, label]) => (
            <div key={kind}>
              <h3>
                {label}: {review[key].length}
              </h3>
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
          <h3>Berörda bildversioner</h3>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              submittedFocus.current = document.activeElement;
              setReview(null);
              setConfirmation('');
            }}
          >
            Avbryt
          </button>
        </section>
      )}
    </section>
  );
}
