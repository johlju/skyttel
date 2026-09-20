import {
  type FinancialFact,
  type FinancialFacts,
  type FinancialField,
  financialFields,
} from '../shared/financial-facts.js';

const knowledgeLabels = {
  known: 'Känt',
  unknown: 'Okänt',
  none: 'Uttryckligen inget',
  uncertain: 'Osäkert uppgivet',
} as const;

export function FinancialFactsEditor({
  facts = {},
  onChange,
}: {
  facts?: FinancialFacts;
  onChange: (facts: FinancialFacts) => void;
}) {
  function change(field: FinancialField, fact?: FinancialFact) {
    const next = { ...facts };
    if (fact) next[field] = fact;
    else delete next[field];
    onChange(next);
  }

  return (
    <details>
      <summary>Ekonomiska uppgifter och avtalsvillkor</summary>
      <p>
        Alla uppgifter är frivilliga och beskrivande. Belopp används inte för att beräkna ränta
        eller betalningar.
      </p>
      {financialFields.map((field) => {
        const fact = facts[field.key];
        const id = `financial-${field.key}`;
        const hasValue = fact?.knowledge === 'known' || fact?.knowledge === 'uncertain';
        return (
          <div key={field.key}>
            <label htmlFor={`${id}-knowledge`}>{field.label}: uppgiftens säkerhet</label>
            <select
              id={`${id}-knowledge`}
              value={fact?.knowledge ?? ''}
              onChange={(event) => {
                const knowledge = event.target.value as FinancialFact['knowledge'] | '';
                if (!knowledge) {
                  change(field.key);
                  return;
                }
                const dated = fact?.reportedOn ? { reportedOn: fact.reportedOn } : {};
                change(
                  field.key,
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
                <label htmlFor={id}>{field.label}</label>
                {field.input === 'textarea' ? (
                  <textarea
                    id={id}
                    required
                    maxLength={2000}
                    value={fact.value}
                    onChange={(event) => change(field.key, { ...fact, value: event.target.value })}
                  />
                ) : (
                  <input
                    id={id}
                    type={field.input}
                    required
                    maxLength={200}
                    value={fact.value}
                    onChange={(event) => change(field.key, { ...fact, value: event.target.value })}
                  />
                )}
              </>
            )}
            {field.dated && fact && (
              <>
                <label htmlFor={`${id}-date`}>{field.label}: datum för uppgiften</label>
                <input
                  id={`${id}-date`}
                  type="date"
                  value={fact.reportedOn ?? ''}
                  onChange={(event) => {
                    const next = { ...fact };
                    if (event.target.value) next.reportedOn = event.target.value;
                    else delete next.reportedOn;
                    change(field.key, next);
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </details>
  );
}

export function FinancialFactsDetails({ facts }: { facts?: FinancialFacts }) {
  return financialFields.map(({ key, label }) => {
    const fact = facts?.[key];
    return fact ? (
      <p key={key}>
        {label}: {fact.value ?? knowledgeLabels[fact.knowledge]}
        {fact.knowledge === 'uncertain' && ` (${knowledgeLabels.uncertain})`}
        {fact.reportedOn && ` — datum för uppgiften: ${fact.reportedOn}`}
      </p>
    ) : null;
  });
}
