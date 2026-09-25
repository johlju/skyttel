import { useState } from 'react';
import type { RelationshipType } from '../shared/map.js';

export function RelationshipTypeDetails({ type }: { type: RelationshipType | null }) {
  return type ? (
    <>
      <p>Sambandstyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
      <p>Benämning från startobjektet: {type.forwardLabel ?? type.name}</p>
      <p>Benämning från målobjektet: {type.reverseLabel ?? 'Visar den ursprungliga riktningen'}</p>
    </>
  ) : (
    <p>Finns inte i kartan</p>
  );
}

export function RelationshipTypeEditor({
  initial,
  disabled,
  stale,
  onDirty,
  onSubmit,
  onClose,
}: {
  initial: RelationshipType;
  disabled: boolean;
  stale: boolean;
  onDirty: () => void;
  onSubmit: (
    value: Pick<RelationshipType, 'name' | 'description' | 'forwardLabel' | 'reverseLabel'> | null,
  ) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: initial.name,
    description: initial.description,
    forwardLabel: initial.forwardLabel ?? initial.name,
    reverseLabel: initial.reverseLabel ?? '',
  });
  function change(key: keyof typeof value, text: string) {
    onDirty();
    setValue({ ...value, [key]: text });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Sambandstypens definition</legend>
        <label htmlFor="edge-type-name">Sambandstypens namn</label>
        <input
          id="edge-type-name"
          required
          maxLength={200}
          value={value.name}
          onChange={(event) => change('name', event.target.value)}
        />
        <label htmlFor="edge-type-description">Sambandstypens beskrivning</label>
        <textarea
          id="edge-type-description"
          maxLength={2000}
          value={value.description}
          onChange={(event) => change('description', event.target.value)}
        />
        <p>
          Benämningarna beskriver samma samband från båda objekten. Exempel: cykeln förvaras i
          garaget och garaget innehåller cykeln.
        </p>
        <label htmlFor="edge-type-forward">Benämning från startobjektet</label>
        <input
          id="edge-type-forward"
          required
          maxLength={200}
          value={value.forwardLabel}
          onChange={(event) => change('forwardLabel', event.target.value)}
        />
        <label htmlFor="edge-type-reverse">Benämning från målobjektet</label>
        <input
          id="edge-type-reverse"
          required
          maxLength={200}
          value={value.reverseLabel}
          onChange={(event) => change('reverseLabel', event.target.value)}
        />
        <p>
          Alla objekt kan kopplas samman. Typen har inga egna fält. Lika namn betyder inte samma
          typ.
        </p>
        {stale && (
          <p role="alert">
            Formuläret bygger på ett äldre utkast. Kopiera text du vill behålla och öppna
            definitionen igen.
          </p>
        )}
        <button type="submit" disabled={stale}>
          Lägg sambandstypen i mitt utkast
        </button>
        <p>
          En använd typ kan inte tas bort. Ta bort eller byt typ på sambanden först, även upphörda
          samband och förslag i privata utkast. Objekten kan finnas kvar.
        </p>
        {initial.revision > 0 && (
          <button type="button" disabled={stale} onClick={() => onSubmit(null)}>
            Ta bort sambandstypen
          </button>
        )}
      </fieldset>
      <button type="button" disabled={disabled} onClick={onClose}>
        Stäng sambandstypen utan att skicka
      </button>
    </form>
  );
}
