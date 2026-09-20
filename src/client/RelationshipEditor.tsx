import { useState } from 'react';
import type { Knowledge, MapObject, MapState, RelationshipValue } from '../shared/map.js';

export const knowledgeLabels: Record<Knowledge, string> = {
  known: 'Känt',
  unknown: 'Okänt',
  none: 'Uttryckligen inget',
  uncertain: 'Osäkert uppgivet',
  unresolved: 'Obesvarad identitetsfråga',
};
export function relationshipLabel(
  value: RelationshipValue,
  state: MapState,
  objects: Map<string, MapObject>,
) {
  return `${objects.get(value.sourceId)?.name ?? value.sourceId} → ${state.relationshipTypes.find((type) => type.id === value.typeId)?.name ?? value.typeId} → ${value.targetId ? (objects.get(value.targetId)?.name ?? value.targetId) : knowledgeLabels[value.knowledge]}${value.knowledge === 'uncertain' ? ' (Osäkert uppgivet)' : ''}`;
}
export function RelationshipEditor({
  state,
  objects,
  initial,
  disabled,
  onSubmit,
  onClose,
}: {
  state: MapState;
  objects: Map<string, MapObject>;
  initial: { id: string; version: number; baseRevision: number | null; value: RelationshipValue };
  disabled: boolean;
  onSubmit: (body: unknown) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial.value);
  const stale = initial.version !== state.draft.version;
  const choices = [...objects.values()].filter(
    (object) => !state.draft.changes.some((change) => change.id === object.id && !change.after),
  );
  function options() {
    return (
      <>
        <option value="">Välj ett objekt uttryckligen</option>
        {choices.map((object) => (
          <option key={object.id} value={object.id}>
            {object.name} ({state.types.find((type) => type.id === object.typeId)?.name})
            {choices.filter((other) => other.name === object.name && other.typeId === object.typeId)
              .length > 1
              ? ` — ${object.description || 'Ingen beskrivning'} [${object.id}]`
              : ''}
          </option>
        ))}
      </>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ ...initial, value });
      }}
    >
      <fieldset disabled={disabled || stale}>
        <legend>Sambandets detaljer</legend>
        <p>
          Välj riktning och båda objekten. Lika namn betyder inte samma objekt. Skapa ett
          ospecificerat objekt om du uttryckligen vill lämna identiteten öppen.
        </p>
        <label htmlFor="relationship-source">Från objekt</label>
        <select
          id="relationship-source"
          required
          value={value.sourceId}
          onChange={(event) => setValue({ ...value, sourceId: event.target.value })}
        >
          {options()}
        </select>
        <label htmlFor="relationship-type">Sambandstyp</label>
        <select
          id="relationship-type"
          required
          value={value.typeId}
          onChange={(event) => setValue({ ...value, typeId: event.target.value })}
        >
          <option value="">Välj sambandstyp</option>
          {state.relationshipTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <p>{state.relationshipTypes.find((type) => type.id === value.typeId)?.description}</p>
        <label htmlFor="relationship-knowledge">Uppgiftens säkerhet</label>
        <select
          id="relationship-knowledge"
          value={value.knowledge}
          onChange={(event) => {
            const knowledge = event.target.value as Knowledge;
            setValue({
              ...value,
              knowledge,
              targetId: ['known', 'uncertain'].includes(knowledge) ? (value.targetId ?? '') : null,
            });
          }}
        >
          {Object.entries(knowledgeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {['known', 'uncertain'].includes(value.knowledge) && (
          <>
            <label htmlFor="relationship-target">Till objekt</label>
            <select
              id="relationship-target"
              required
              value={value.targetId ?? ''}
              onChange={(event) => setValue({ ...value, targetId: event.target.value })}
            >
              {options()}
            </select>
          </>
        )}
        <button type="submit">Lägg sambandet i mitt utkast</button>
        {(initial.baseRevision !== null ||
          state.draft.relationships?.some((change) => change.id === initial.id)) && (
          <button type="button" onClick={() => onSubmit({ ...initial, value: null })}>
            Föreslå borttagning av sambandet
          </button>
        )}
      </fieldset>
      {stale && (
        <p role="alert">
          Formuläret bygger på ett äldre utkast. Stäng och öppna det aktuella sambandet.
        </p>
      )}
      <button type="button" disabled={disabled} onClick={onClose}>
        Stäng sambandet utan att skicka
      </button>
    </form>
  );
}
