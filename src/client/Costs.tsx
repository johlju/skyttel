import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CostAssumptions,
  CostCategory,
  CostCount,
  CostIssue,
  CostMonth,
} from '../shared/costs.js';
import { MapRequestError, request } from './map-request.js';
import './costs.css';

const number = (value: number) => value.toLocaleString('sv-SE', { maximumFractionDigits: 6 });
function money(value: number, currency: 'SEK' | 'USD') {
  if (value > 0 && value < 0.01 && currency === 'SEK') return '<0,01 SEK';
  return `${value.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: currency === 'SEK' ? 2 : 6,
  })} ${currency}`;
}
const issueLabels: Record<CostIssue, string> = {
  unfinished: 'Slutliga uppgifter saknas',
  missing_usage: 'Saknat förbrukningsunderlag',
  inconsistent_usage: 'Mätvärden som inte går ihop',
  unsupported_model: 'Modell utan tillämpligt prisunderlag',
  unsupported_tier: 'Servicenivå utan tillämpligt prisunderlag',
  assumed_requested_model: 'Begärd Terra-modell antas eftersom leverantörens modelluppgift saknas',
  assumed_standard: 'Standardnivå antas eftersom leverantörens nivå saknas',
};
function Amount({ estimatedSek, estimatedUsd }: { estimatedSek: number; estimatedUsd: number }) {
  return (
    <>
      {money(estimatedSek, 'SEK')} ({money(estimatedUsd, 'USD')})
    </>
  );
}
function Usage({ value, unit }: { value: CostCount; unit: string }) {
  return (
    <>
      {number(value.known)} {unit}
      {value.missing > 0 && `; ${value.missing} saknar mätvärde`}
    </>
  );
}
function Category({ value }: { value: CostCategory }) {
  return (
    <>
      <p className="cost-amount">
        {value.attempts > 0 &&
        value.unpricedAttempts === value.attempts &&
        value.estimatedUsd === 0 ? (
          'Belopp saknas'
        ) : (
          <Amount {...value} />
        )}
      </p>
      <p>
        {value.attempts} registrerade försök; {value.uncertainAttempts} med osäkert underlag;{' '}
        {value.unpricedAttempts} utan fullständig prisberäkning.
      </p>
      {value.issues.length > 0 && (
        <ul>
          {value.issues.map((issue) => (
            <li key={issue.code}>
              {issueLabels[issue.code]}: {issue.count}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Overview({ data }: { data: CostMonth }) {
  return (
    <>
      <p>
        Period: {data.month} (UTC). Modellförbrukning hänförs till månaden då försöket startar.
        Senast hämtat underlag: <time dateTime={data.generatedAt}>{data.generatedAt}</time>.
      </p>
      {data.coverageIncomplete && (
        <p className="error">
          Månaden har ofullständig mätning. Registreringen börjar {data.coverageStartedAt}; tidigare
          förbrukning är okänd.
        </p>
      )}
      {data.recordingUnavailable && (
        <p className="error" role="alert">
          Registreringen av förbrukning har haft ett fel sedan senaste serverstart. Ytterligare
          uppgifter kan saknas. Visade kända värden bevaras.
        </p>
      )}
      <div className="cost-categories">
        <section aria-labelledby="render-cost-heading">
          <h2 id="render-cost-heading">Render – hel månad</h2>
          <p className="cost-amount">
            <Amount {...data.render} />
          </p>
          <p>
            Fast månadsantagande: tjänst {money(data.assumptions.computeUsd, 'USD')} +{' '}
            {number(data.assumptions.diskGb)} GB tilldelad disk ×{' '}
            {money(data.assumptions.diskUsdPerGb, 'USD')}/GB + arbetsyta{' '}
            {money(data.assumptions.workspaceUsd, 'USD')}.
          </p>
          <p>
            Gäller en hel månad, även när modellmätningen bara täcker en del av månaden. Extra
            trafik, byggen, domäner, andra tjänster, skatt och krediter ingår inte.
          </p>
        </section>
        <section aria-labelledby="live-cost-heading">
          <h2 id="live-cost-heading">Live – uppmätt hittills</h2>
          <Category value={data.live} />
          <p>
            <Usage value={data.live.seconds} unit="sekunder rapporterade" />.{' '}
            {number(data.live.estimatedBillableSeconds)} sekunder i prisuppskattningen.
          </p>
          <p>
            Rapporterad tid och antagen debiterbar tid visas separat. Saknade slutvärden är osäkra,
            inte bekräftad nollförbrukning.
          </p>
        </section>
        <section aria-labelledby="terra-cost-heading">
          <h2 id="terra-cost-heading">Terra – uppmätt hittills</h2>
          <Category value={data.terra} />
          <dl>
            <dt>Indata</dt>
            <dd>
              <Usage value={data.terra.usage.input} unit="token" />
            </dd>
            <dt>Cacheläsning, del av indata</dt>
            <dd>
              <Usage value={data.terra.usage.cached} unit="token" />
            </dd>
            <dt>Cacheskrivning, del av indata</dt>
            <dd>
              <Usage value={data.terra.usage.cacheWrite} unit="token" />
            </dd>
            <dt>Utdata inklusive resonemang</dt>
            <dd>
              <Usage value={data.terra.usage.output} unit="token" />
            </dd>
            <dt>Resonemang, del av utdata</dt>
            <dd>
              <Usage value={data.terra.usage.reasoning} unit="token" />
            </dd>
          </dl>
          <p>
            Resonemang läggs inte till en gång till. Saknade detaljvärden markeras även när
            leverantörens totalvärde går att prissätta.
          </p>
        </section>
      </div>
      <p className="cost-total">
        {data.total.incomplete ? 'Delsumma för beräkningsbara delar' : 'Uppskattad totalsumma'}:{' '}
        <Amount {...data.total} />.
      </p>
      {data.total.incomplete && (
        <p>
          Totalsumman är ofullständig. Okända eller ännu inte prissatta delar tillkommer; deras
          belopp är inte noll.
        </p>
      )}
      <p>
        Detta är en uppskattning, inte leverantörens slutliga faktura. Cirka 200 kronor per månad är
        ett riktmärke; kartarbetet får ingen automatisk budgetspärr.
      </p>
      <section aria-labelledby="rates-heading">
        <h2 id="rates-heading">Prisunderlag</h2>
        <p>
          Omräkning: 1 USD = {number(data.assumptions.sekPerUsd)} SEK. Detta är ett sparat
          antagande, inte en automatiskt hämtad valutakurs. Antagandeversion{' '}
          {data.assumptions.version}
          {data.assumptions.updatedAt
            ? `, sparad ${data.assumptions.updatedAt}`
            : ', förvalda uppskattningar'}
          .
        </p>
        {data.rates.map((rate) => (
          <details key={rate.id}>
            <summary>
              Modellpriser kontrollerade {rate.checkedAt} ({rate.id})
            </summary>
            <p>
              Live: {money(rate.liveUsdPerMinute, 'USD')}/minut, beräknat per sekund. Uppskattningen
              använder minst {rate.liveMinimumSeconds} sekunder per prissatt session. Startkrediten
              antas ingå i dessa sekunder, inte läggas ovanpå. Leverantörens hantering av avbrott
              och återbetalning kan skilja sig.
            </p>
            <p>
              Terra: USD per miljon token. Över {number(rate.terra.threshold)} indatatoken används
              det högre priset för hela anropet.
            </p>
            <div className="cost-table-scroll">
              <table>
                <caption>Terra-priser per miljon token</caption>
                <thead>
                  <tr>
                    <th scope="col">Indata i anropet</th>
                    <th scope="col">Vanlig indata</th>
                    <th scope="col">Cacheläsning</th>
                    <th scope="col">Cacheskrivning</th>
                    <th scope="col">Utdata</th>
                  </tr>
                </thead>
                <tbody>
                  {(['short', 'long'] as const).map((length) => (
                    <tr key={length}>
                      <th scope="row">
                        {length === 'short' ? 'Upp till och med' : 'Över'}{' '}
                        {number(rate.terra.threshold)}
                      </th>
                      <td>{number(rate.terra[length].input)}</td>
                      <td>{number(rate.terra[length].cached)}</td>
                      <td>{number(rate.terra[length].cacheWrite)}</td>
                      <td>{number(rate.terra[length].output)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Cacheläsning och cacheskrivning ersätter motsvarande vanliga indatapris. Priserna
              gäller Standard; annan eller okänd modell eller servicenivå markeras i underlaget.
            </p>
            <ul>
              {rate.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </>
  );
}

const assumptionFields = [
  ['sekPerUsd', 'SEK per USD'],
  ['computeUsd', 'Tjänst (USD/månad)'],
  ['diskGb', 'Tilldelad disk (GB)'],
  ['diskUsdPerGb', 'Disk (USD/GB och månad)'],
  ['workspaceUsd', 'Arbetsyta (USD/månad)'],
] as const;

function AssumptionEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: CostMonth['assumptions'];
  disabled: boolean;
  onSave: (values: CostAssumptions, version: number) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => ({
    sekPerUsd: String(initial.sekPerUsd),
    computeUsd: String(initial.computeUsd),
    diskGb: String(initial.diskGb),
    diskUsdPerGb: String(initial.diskUsdPerGb),
    workspaceUsd: String(initial.workspaceUsd),
    workspace: initial.workspace,
  }));
  const [error, setError] = useState('');
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const numeric = Object.fromEntries(
          assumptionFields.map(([key]) => [key, Number(values[key])]),
        ) as Omit<CostAssumptions, 'workspace'>;
        if (
          assumptionFields.some(
            ([key]) => !values[key].trim() || !Number.isFinite(numeric[key]) || numeric[key] < 0,
          ) ||
          numeric.sekPerUsd <= 0
        ) {
          setError(
            'Ange en positiv valutakurs och giltiga belopp eller storlekar som är noll eller större.',
          );
          return;
        }
        setError('');
        onSave({ ...numeric, workspace: values.workspace }, initial.version);
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Antaganden för vald månad</legend>
        <p>
          Du utgår från version {initial.version}. Ändringen gäller bara den valda månaden.
          Kontrollera själv aktuella Render-priser och valutakurs; inga inställningar hos
          leverantören ändras här.
        </p>
        {assumptionFields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={values[key]}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </label>
        ))}
        <label>
          Render-arbetsyta
          <select
            value={values.workspace}
            onChange={(event) =>
              setValues({
                ...values,
                workspace: event.target.value as CostAssumptions['workspace'],
              })
            }
          >
            <option value="hobby">Hobby</option>
            <option value="pro">Pro</option>
            <option value="scale">Scale</option>
            <option value="custom">Eget antagande</option>
          </select>
        </label>
        <p>
          Namnet på arbetsytan ändrar inte beloppet automatiskt. Ange den del av arbetsytans
          månadskostnad som ska räknas till denna installation.
        </p>
        <button type="submit">Spara månadens antaganden</button>
      </fieldset>
      <button type="button" onClick={onCancel}>
        Stäng redigering
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

function AssumptionHistory({ data }: { data: CostMonth }) {
  return (
    <section aria-labelledby="assumptions-heading">
      <h2 id="assumptions-heading">Månadens antaganden</h2>
      <p>
        Render-arbetsyta: {data.assumptions.workspace}. Valutakurs och driftantaganden gäller{' '}
        {data.month}. Modellpriserna ovan följer det registrerade underlaget för respektive anrop.
      </p>
      {data.assumptionHistory.length > 0 && (
        <details>
          <summary>Tidigare antaganden för månaden</summary>
          <ul>
            {data.assumptionHistory.map((item) => (
              <li key={item.version}>
                Version {item.version}, {item.updatedAt}: 1 USD = {number(item.sekPerUsd)} SEK;
                tjänst {money(item.computeUsd, 'USD')}/månad; {number(item.diskGb)} GB disk à{' '}
                {money(item.diskUsdPerGb, 'USD')}/GB och månad; arbetsyta {item.workspace},{' '}
                {money(item.workspaceUsd, 'USD')}/månad.
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function Costs({ onAccessLost }: { onAccessLost: () => void }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CostMonth | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<'read' | 'write' | null>(null);
  const [denied, setDenied] = useState(false);
  const [editor, setEditor] = useState<CostMonth['assumptions'] | null>(null);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState('');
  const lockedRef = useRef(false);
  const pendingRef = useRef<'read' | 'write' | null>(null);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const accessLost = useRef(onAccessLost);
  accessLost.current = onAccessLost;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const load = useCallback(
    async (write?: { values: CostAssumptions; version: number }) => {
      if (pendingRef.current === 'write') return;
      const generation = ++epoch.current;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      pendingRef.current = write ? 'write' : 'read';
      setPending(pendingRef.current);
      if (write) setStatus('');
      try {
        const result = await request<CostMonth>(
          write ? '/api/operator/costs/assumptions' : `/api/operator/costs?month=${month}`,
          write ? { month, version: write.version, ...write.values } : undefined,
          current.signal,
        );
        if (current.signal.aborted || generation !== epoch.current) return;
        setData(result);
        setError('');
        if (write || lockedRef.current) {
          setEditor(null);
          setStatus(
            write
              ? 'Månadens antaganden är sparade.'
              : 'Aktuella antaganden är hämtade. Granska dem innan du ändrar igen.',
          );
        }
        lockedRef.current = false;
        setLocked(false);
      } catch (failure) {
        if (current.signal.aborted || generation !== epoch.current) return;
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
          setDenied(true);
          setData(null);
          setEditor(null);
          setStatus('');
          setError('Du har inte längre tillgång till installationens kostnadsöversikt.');
          accessLost.current();
        } else if (write) {
          const invalid = failure instanceof MapRequestError && failure.status === 400;
          lockedRef.current = !invalid;
          setLocked(!invalid);
          setError(
            invalid
              ? 'Antagandena kunde inte sparas. Kontrollera värdena och försök igen.'
              : failure instanceof MapRequestError && failure.status === 409
                ? 'Antagandena har ändrats i en annan vy. Uppdatera underlaget och granska den aktuella versionen innan du ändrar igen.'
                : 'Sparresultatet är okänt. Uppdatera underlaget och kontrollera månadens antaganden innan du försöker spara igen.',
          );
        } else
          setError(
            'Underlaget kunde inte uppdateras. Tidigare hämtade värden är inaktuella; kontrollera anslutningen och försök igen.',
          );
      } finally {
        if (!current.signal.aborted && generation === epoch.current) {
          pendingRef.current = null;
          setPending(null);
        }
      }
    },
    [month],
  );
  useEffect(() => {
    if (denied) return;
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible' && !pendingRef.current) void load();
    };
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      ++epoch.current;
      controller.current?.abort();
      pendingRef.current = null;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, denied]);
  const current = data?.month === month ? data : null;
  return (
    <section className="panel costs-panel" aria-busy={pending !== null}>
      <p className="eyebrow">Installationens driftansvarige</p>
      <h1 ref={heading} tabIndex={-1}>
        Månadskostnad
      </h1>
      <p>
        Hela installationen, oavsett hushåll. Kostnadsunderlaget innehåller tekniska mätvärden, inte
        karttexter, bilder, ljud eller samtal.
      </p>
      {!denied && (
        <div className="cost-controls">
          <label>
            Månad (UTC)
            <input
              type="month"
              disabled={pending === 'write'}
              value={month}
              onChange={(event) => {
                if (event.target.value) {
                  setMonth(event.target.value);
                  setError('');
                  setEditor(null);
                  setStatus('');
                  lockedRef.current = false;
                  setLocked(false);
                }
              }}
            />
          </label>
          <button type="button" disabled={pending === 'write'} onClick={() => void load()}>
            Uppdatera underlaget
          </button>
        </div>
      )}
      {pending && (
        <p role="status">
          {pending === 'write' ? 'Sparar antaganden…' : 'Hämtar kostnadsunderlag…'}
        </p>
      )}
      {!pending && status && <p role="status">{status}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {current && (
        <>
          <Overview data={current} />
          <AssumptionHistory data={current} />
          {editor ? (
            <AssumptionEditor
              initial={editor}
              disabled={pending === 'write' || locked}
              onSave={(values, version) => void load({ values, version })}
              onCancel={() => setEditor(null)}
            />
          ) : (
            <button
              type="button"
              disabled={pending !== null || locked}
              onClick={() => {
                setEditor(current.assumptions);
                setStatus('');
              }}
            >
              Ändra månadens antaganden
            </button>
          )}
        </>
      )}
    </section>
  );
}
