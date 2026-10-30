import { useEffect, useRef, useState } from 'react';
import type { TraceSendingStatus } from '../shared/trace-sending.js';
import { request } from './map-request.js';

const states = {
  not_connected: 'Inte ansluten',
  sending: 'Sändning aktiverad',
  disabled: 'Sändning avstängd',
  suspended: 'Sändning spärrad',
};
const errors = {
  quota: 'Kostnadsfri kvot förbrukad',
  credentials: 'Ogiltiga inloggningsuppgifter för LangSmith',
  network: 'Nätverksfel',
  timeout: 'Leveransen tog för lång tid',
  capacity: 'Minnesgräns nådd',
  oversized: 'För stor händelse',
  expired: 'Händelsens leveranstid löpte ut',
  export: 'Leveransfel',
};

export function TraceSending() {
  const [value, setValue] = useState<TraceSendingStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    const version = ++requestVersion.current;
    void request<TraceSendingStatus>('/api/operator/tracing', undefined, controller.signal)
      .then((next) => {
        if (requestVersion.current === version) setValue(next);
      })
      .catch(() => {
        if (!controller.signal.aborted && requestVersion.current === version) setError(true);
      });
    return () => {
      requestVersion.current++;
      controller.abort();
    };
  }, []);
  async function update(action?: 'enable' | 'disable' | 'restart') {
    if (busy) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const next = await request<TraceSendingStatus>(
        '/api/operator/tracing',
        action ? { action } : undefined,
      );
      if (requestVersion.current !== version) return;
      setValue(next);
      setMessage(action ? 'Sändningsvalet är sparat.' : 'Leveransstatusen är uppdaterad.');
    } catch {
      if (requestVersion.current === version) setError(true);
    } finally {
      if (requestVersion.current === version) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-busy={busy}>
      <h1 ref={heading} tabIndex={-1}>
        Diagnostik med LangSmith
      </h1>
      <p>
        Installationsansvarig styr sändningen för hela installationen. Varje persons
        samtalsmedgivande är ett separat val.
      </p>
      <p>
        När sändningen är aktiv kan LangSmith ta emot exakt samtalstext, modellens in- och utdata
        samt hushållets verktygsfrågor och resultat. Rått ljud ingår inte.
      </p>
      <p>
        Avstängning kastar väntande händelser och avbryter pågående leverans där det är möjligt.
        Skickade förfrågningar kan inte återkallas. Ny aktivering skickar bara nya händelser.
        Radering hos LangSmith är en separat åtgärd.
      </p>
      {value && (
        <>
          <dl>
            <dt>Sändningsläge</dt>
            <dd>{states[value.state]}</dd>
            <dt>Senaste lyckade leverans</dt>
            <dd>
              {value.lastSuccessfulDelivery === null
                ? 'Ingen registrerad leverans sedan start'
                : new Date(value.lastSuccessfulDelivery).toLocaleString('sv-SE')}
            </dd>
            <dt>Förlorade händelser sedan start</dt>
            <dd>{value.droppedEvents}</dd>
            <dt>Senaste felkategori</dt>
            <dd>{value.lastError ? errors[value.lastError] : 'Ingen registrerad'}</dd>
          </dl>
          {!value.connected && (
            <p>
              Leveransen är inte ansluten eller konfigurerad. Ett aktiverat val innebär ingen
              bekräftad leverans.
            </p>
          )}
          <p>
            Leveransstatusen och felräknaren finns bara i minnet och nollställs vid omstart. De
            bevisar inte att samtalet lyckas eller att historiken är fullständig. Sändningsval och
            spärrar finns kvar efter omstart.
          </p>
          <button
            type="button"
            aria-disabled={busy}
            onClick={() => void update(value.enabled ? 'disable' : 'enable')}
          >
            {value.enabled ? 'Stäng av sändning' : 'Aktivera sändning'}
          </button>
          {value.suspension && (
            <>
              <p>
                Sändningen är spärrad: {errors[value.suspension]}. Kontrollera och åtgärda orsaken
                innan du startar om sändningen. Omstart av Skyttel häver inte spärren. Lägg inte
                till betalningsmetod eller betaltjänst för återhämtning.
              </p>
              <button
                type="button"
                disabled={busy || !value.connected}
                onClick={() => void update('restart')}
              >
                Starta om sändning efter kontroll
              </button>
            </>
          )}
        </>
      )}
      <button type="button" disabled={busy} onClick={() => void update()}>
        Uppdatera leveransstatus
      </button>
      <p role="status">{message}</p>
      {error && (
        <p role="alert">
          Sändningsvalet eller leveransstatusen kunde inte bekräftas. Uppdatera statusen innan du
          försöker igen.
        </p>
      )}
    </section>
  );
}
