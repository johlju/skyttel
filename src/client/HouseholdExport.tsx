import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReadyExport } from '../shared/household-export.js';
import { MapRequestError, request } from './map-request.js';

export function HouseholdExport({
  householdId,
  onAccessLost,
}: {
  householdId: string;
  onAccessLost: () => void;
}) {
  const path = `/api/households/${encodeURIComponent(householdId)}/exports`;
  const [ready, setReady] = useState<ReadyExport | null>(null);
  const [busy, setBusy] = useState<'preparing' | 'downloading' | 'canceling' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const blobUrl = useRef<string | null>(null);
  const blobTimer = useRef<number | undefined>(undefined);
  const active = useRef<AbortController | null>(null);
  const knownExport = useRef<ReadyExport | null>(null);
  const releaseBlob = useCallback(() => {
    window.clearTimeout(blobTimer.current);
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = null;
  }, []);
  const discardKnownExport = useCallback(() => {
    const previous = knownExport.current;
    knownExport.current = null;
    if (previous)
      void request(`${path}/${encodeURIComponent(previous.id)}/cancel`, {}).catch(() => {});
  }, [path]);
  useEffect(
    () => () => {
      active.current?.abort();
      discardKnownExport();
      releaseBlob();
    },
    [discardKnownExport, releaseBlob],
  );
  useEffect(() => {
    if (!ready || busy) return;
    const timer = window.setTimeout(
      () => {
        setReady(null);
        setError('Exporten har gått ut. Förbered en ny export.');
      },
      Math.max(0, new Date(ready.expiresAt).getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [ready, busy]);

  function fail(failure: unknown, phase: 'preparing' | 'downloading' | 'canceling') {
    setReady(null);
    setNotice(null);
    discardKnownExport();
    releaseBlob();
    if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
      setAccessLost(true);
      onAccessLost();
    } else
      setError(
        failure instanceof MapRequestError && [404, 410].includes(failure.status)
          ? 'Exporten har gått ut eller kan inte längre hämtas. Förbered en ny export.'
          : phase === 'canceling'
            ? 'Avbrottet kunde inte bekräftas. Exporten kan finnas kvar tills giltighetstiden går ut.'
            : phase === 'preparing'
              ? 'Exporten kunde inte förberedas. Kontrollera anslutningen och försök igen.'
              : 'Exporten kunde inte hämtas. Kontrollera anslutningen och förbered en ny export.',
      );
  }

  async function prepare() {
    discardKnownExport();
    releaseBlob();
    const controller = new AbortController();
    active.current = controller;
    setBusy('preparing');
    setError(null);
    setNotice(null);
    try {
      const result = await request<ReadyExport>(path, {}, controller.signal);
      if (controller.signal.aborted) {
        void request(`${path}/${encodeURIComponent(result.id)}/cancel`, {}).catch(() => {});
        return;
      }
      knownExport.current = result;
      setReady(result);
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure, 'preparing');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  async function download() {
    if (!ready) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy('downloading');
    setError(null);
    try {
      const response = await fetch(`${path}/${encodeURIComponent(ready.id)}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new MapRequestError(response.status);
      if (
        response.headers.get('Content-Type') !== 'application/zip' ||
        Number(response.headers.get('Content-Length')) !== ready.bytes
      )
        throw new Error('invalid_export');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (blob.size !== ready.bytes || blob.type !== 'application/zip')
        throw new Error('incomplete_export');
      releaseBlob();
      blobUrl.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl.current;
      link.download = 'skyttel-hushall.zip';
      document.body.append(link);
      link.click();
      link.remove();
      blobTimer.current = window.setTimeout(releaseBlob, 60_000);
      knownExport.current = null;
      setReady(null);
      setNotice(
        'Webbläsarens nedladdning har startats. Kontrollera att ZIP-filen finns sparad där du valt innan du förlitar dig på den.',
      );
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure, 'downloading');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  async function cancel() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy('canceling');
    setError(null);
    setReady(null);
    try {
      if (knownExport.current)
        await request(
          `${path}/${encodeURIComponent(knownExport.current.id)}/cancel`,
          {},
          controller.signal,
        );
      if (controller.signal.aborted) return;
      knownExport.current = null;
      setReady(null);
      setNotice('Exporten har avbrutits.');
    } catch (failure) {
      if (!controller.signal.aborted) fail(failure, 'canceling');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  if (accessLost) return null;
  return (
    <section aria-labelledby="household-export-heading" aria-busy={busy !== null}>
      <h2 id="household-export-heading" className="section-heading">
        Fullständig export
      </h2>
      <p>
        Exporten innehåller hela hushållets information, inklusive andra användares privata utkast
        och personliga vyer, bilder och ändringshistorik. Som administratör kan du läsa även detta
        privata innehåll i exporten.
      </p>
      <p>
        Förvara filen säkert och dela den bara med personer som ska få läsa allt innehåll. Vid ett
        större driftfel kan ändringar sedan din senaste egna export gå förlorade.
      </p>
      {ready ? (
        <>
          {!busy && (
            <p role="status">
              Exporten är klar att hämta. Hämta den före{' '}
              <time dateTime={ready.expiresAt}>
                {new Date(ready.expiresAt).toLocaleString('sv-SE')}
              </time>
              . Filen kan hämtas en gång.
            </p>
          )}
          <button type="button" disabled={busy !== null} onClick={() => void download()}>
            Hämta ZIP-fil
          </button>
        </>
      ) : (
        <button
          type="button"
          className="primary"
          disabled={busy !== null}
          onClick={() => void prepare()}
        >
          Förbered fullständig export
        </button>
      )}
      {(ready || busy) && (
        <button type="button" disabled={busy === 'canceling'} onClick={() => void cancel()}>
          Avbryt export
        </button>
      )}
      {busy && (
        <p role="status">
          {busy === 'preparing'
            ? 'Förbereder exporten…'
            : busy === 'downloading'
              ? 'Hämtar och kontrollerar ZIP-filen…'
              : 'Avbryter exporten…'}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
