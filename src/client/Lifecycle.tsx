import { useEffect, useState } from 'react';
import type { FinancialFact } from '../shared/financial-facts.js';
import { hasEnded, type Lifecycle, type LifecycleValue } from '../shared/lifecycle.js';

export function LifecycleStatus({ value }: { value: LifecycleValue }) {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const update = () => setToday(new Date().toISOString().slice(0, 10));
    const nextDay = new Date(`${today}T00:00:00Z`).getTime() + 86_400_000;
    const timeout = window.setTimeout(update, Math.max(0, nextDay - Date.now()));
    // Browsers can suspend timers while the page is hidden.
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', update);
    };
  }, [today]);
  return hasEnded(value, today) ? <span className="ended-status">Upphört</span> : null;
}

export function LifecycleDetails({ value }: { value: LifecycleValue }) {
  return (
    <>
      <p>
        Status:{' '}
        {value.lifecycle === 'active'
          ? 'Gäller fortfarande'
          : value.lifecycle === 'ended'
            ? 'Manuellt upphört'
            : 'Följ slutdatum'}
      </p>
      {value.endDate && (
        <p>
          Slutdatum: {value.endDate.value ?? dateKnowledge[value.endDate.knowledge]}
          {value.endDate.knowledge === 'uncertain' && ' (Osäkert uppgivet)'}
        </p>
      )}
      <LifecycleStatus value={value} />
    </>
  );
}

export function LifecycleEditor({
  kind,
  value,
  onChange,
}: {
  kind: 'object' | 'relationship';
  value?: Lifecycle;
  onChange: (value: Lifecycle | undefined) => void;
}) {
  return (
    <>
      <label htmlFor={`${kind}-status`}>
        {kind === 'object' ? 'Objektets status' : 'Sambandets status'}
      </label>
      <select
        id={`${kind}-status`}
        value={value ?? ''}
        onChange={(event) => onChange((event.target.value || undefined) as Lifecycle | undefined)}
      >
        <option value="">Följ slutdatum</option>
        <option value="ended">Upphört</option>
        <option value="active">Gäller fortfarande</option>
      </select>
      <p>
        Ett känt slutdatum ger Upphört dagen efter angivet datum, vid midnatt UTC. Gäller
        fortfarande åsidosätter slutdatumet tills du väljer Följ slutdatum igen.
      </p>
    </>
  );
}

const dateKnowledge = {
  known: 'Känt',
  uncertain: 'Osäkert uppgivet',
  unknown: 'Okänt',
  none: 'Uttryckligen inget',
} as const;

export function RelationshipEndDate({
  value,
  onChange,
}: {
  value?: FinancialFact;
  onChange: (value: FinancialFact | undefined) => void;
}) {
  return (
    <>
      <label htmlFor="relationship-end-date-knowledge">
        Sambandets slutdatum: uppgiftens säkerhet
      </label>
      <select
        id="relationship-end-date-knowledge"
        value={value?.knowledge ?? ''}
        onChange={(event) => {
          const knowledge = event.target.value as FinancialFact['knowledge'] | '';
          onChange(
            !knowledge
              ? undefined
              : knowledge === 'known' || knowledge === 'uncertain'
                ? { knowledge, value: value?.value ?? '' }
                : { knowledge },
          );
        }}
      >
        <option value="">Ej uppgivet</option>
        {Object.entries(dateKnowledge).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {(value?.knowledge === 'known' || value?.knowledge === 'uncertain') && (
        <>
          <label htmlFor="relationship-end-date">Sambandets slutdatum</label>
          <input
            id="relationship-end-date"
            type="date"
            required
            value={value.value}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
          />
        </>
      )}
    </>
  );
}
