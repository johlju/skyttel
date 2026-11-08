import { useRef, useState } from 'react';
import type { RelationshipType } from '../shared/map.js';

export function RelationshipTypeDetails({ type }: { type: RelationshipType | null }) {
  return type ? (
    <>
      <p>Sambandstyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
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
  onSubmit: (value: Pick<RelationshipType, 'name' | 'description'> | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: initial.name,
    description: initial.description,
  });
  const form = useRef<HTMLFormElement>(null);
  function change(key: keyof typeof value, text: string) {
    onDirty();
    setValue({ ...value, [key]: text });
  }
  return (
    <form
      ref={form}
      className="object-type-editor"
      onInvalidCapture={(event) => {
        let parent = (event.target as HTMLElement).parentElement;
        while (parent && parent !== form.current) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
      }}
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
        <p>Typen är en gruppering. Varje enskilt samband har sitt eget fria verb.</p>
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
          Borttagning omfattar typens samband, även upphörda. Granska alla följder i ditt utkast
          före samlat sparande. Ändpunkternas objekt finns kvar. Andras utkast hindrar inte
          borttagningen.
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
