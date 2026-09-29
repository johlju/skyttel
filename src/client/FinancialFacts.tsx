import { useId } from 'react';
import {
  type FinancialFact,
  type FinancialFacts,
  financialFields,
} from '../shared/financial-facts.js';

const knowledgeLabels = {
  known: 'Känt',
  unknown: 'Okänt',
  none: 'Uttryckligen inget',
  uncertain: 'Osäkert uppgivet',
} as const;

export function FinancialFactEditor({
  field,
  fact,
  label = field.label,
  onChange,
}: {
  field: (typeof financialFields)[number];
  fact?: FinancialFact;
  label?: string;
  onChange: (fact?: FinancialFact) => void;
}) {
  const id = useId();
  const hasValue = fact?.knowledge === 'known' || fact?.knowledge === 'uncertain';
  return (
    <div>
      <label htmlFor={`${id}-knowledge`}>{label}: uppgiftens säkerhet</label>
      <select
        id={`${id}-knowledge`}
        value={fact?.knowledge ?? ''}
        onChange={(event) => {
          const knowledge = event.target.value as FinancialFact['knowledge'] | '';
          if (!knowledge) {
            onChange();
            return;
          }
          const dated = fact?.reportedOn ? { reportedOn: fact.reportedOn } : {};
          onChange(
            knowledge === 'known' || knowledge === 'uncertain'
              ? { knowledge, value: fact?.value ?? '', ...dated }
              : { knowledge, ...dated },
          );
        }}
      >
        <option value="">Ej uppgivet</option>
        {Object.entries(knowledgeLabels).map(([knowledge, label]) => (
          <option key={knowledge} value={knowledge}>
            {label}
          </option>
        ))}
      </select>
      {hasValue && (
        <>
          <label htmlFor={id}>{label}</label>
          {field.input === 'textarea' ? (
            <textarea
              id={id}
              required
              maxLength={2000}
              value={fact.value}
              onChange={(event) => onChange({ ...fact, value: event.target.value })}
            />
          ) : (
            <input
              id={id}
              type={field.input}
              required
              maxLength={200}
              value={fact.value}
              onChange={(event) => onChange({ ...fact, value: event.target.value })}
            />
          )}
        </>
      )}
      {field.dated && fact && (
        <>
          <label htmlFor={`${id}-date`}>{label}: datum för uppgiften</label>
          <input
            id={`${id}-date`}
            type="date"
            value={fact.reportedOn ?? ''}
            onChange={(event) => {
              const next = { ...fact };
              if (event.target.value) next.reportedOn = event.target.value;
              else delete next.reportedOn;
              onChange(next);
            }}
          />
        </>
      )}
    </div>
  );
}

export function FinancialFactsEditor({
  facts = {},
  onChange,
  fields = financialFields,
}: {
  facts?: FinancialFacts;
  onChange: (facts: FinancialFacts) => void;
  fields?: readonly (typeof financialFields)[number][];
}) {
  return (
    <details>
      <summary>Ekonomiska uppgifter och avtalsvillkor</summary>
      <p>
        Alla uppgifter är frivilliga och beskrivande. Belopp används inte för att beräkna ränta
        eller betalningar.
      </p>
      {fields.map((field) => (
        <FinancialFactEditor
          key={field.key}
          field={field}
          fact={facts[field.key]}
          onChange={(fact) => {
            const next = { ...facts };
            if (fact) next[field.key] = fact;
            else delete next[field.key];
            onChange(next);
          }}
        />
      ))}
    </details>
  );
}

export function FinancialFactDetails({ fact, label }: { fact?: FinancialFact; label: string }) {
  return fact ? (
    <p>
      {label}: {fact.value ?? knowledgeLabels[fact.knowledge]}
      {fact.knowledge === 'uncertain' && ` (${knowledgeLabels.uncertain})`}
      {fact.reportedOn && ` — datum för uppgiften: ${fact.reportedOn}`}
    </p>
  ) : null;
}

export function FinancialFactsDetails({ facts }: { facts?: FinancialFacts }) {
  return financialFields.map(({ key, label }) => (
    <FinancialFactDetails key={key} fact={facts?.[key]} label={label} />
  ));
}
