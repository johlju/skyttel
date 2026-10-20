import { useRef, useState } from 'react';
import type { ObjectType } from '../shared/map.js';

export function ObjectTypeDetails({ type }: { type: ObjectType | null }) {
  return type ? (
    <>
      <p>Objekttyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
    </>
  ) : (
    <p>Finns inte i kartan</p>
  );
}

export function ObjectTypeEditor({
  initial,
  disabled,
  stale,
  onDirty,
  onSubmit,
  onClose,
}: {
  initial: ObjectType;
  disabled: boolean;
  stale: boolean;
  onDirty: () => void;
  onSubmit: (value: Pick<ObjectType, 'name' | 'description'> | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: initial.name,
    description: initial.description,
  });
  const form = useRef<HTMLFormElement>(null);
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
        <legend>Objekttypens definition</legend>
        <label htmlFor="type-name">Typens namn</label>
        <input
          id="type-name"
          required
          pattern=".*\S.*"
          maxLength={200}
          value={value.name}
          onChange={(event) => {
            onDirty();
            setValue({ ...value, name: event.target.value });
          }}
        />
        <label htmlFor="type-description">Typens beskrivning</label>
        <textarea
          id="type-description"
          maxLength={2000}
          value={value.description}
          onChange={(event) => {
            onDirty();
            setValue({ ...value, description: event.target.value });
          }}
        />
        {stale && (
          <p role="alert">
            Formuläret bygger på ett äldre utkast. Kopiera text du vill behålla och öppna
            definitionen igen.
          </p>
        )}
        <button type="submit" disabled={stale}>
          Lägg typförslaget i mitt utkast
        </button>
        <p>
          Använda typer kan inte tas bort. Hantera först objekt i kartan och privata utkast, även
          upphört innehåll. Borttagning visas i utkastet före sparande.
        </p>
        {initial.revision > 0 && (
          <button type="button" disabled={stale} onClick={() => onSubmit(null)}>
            Ta bort objekttypen
          </button>
        )}
      </fieldset>
      <button type="button" disabled={disabled} onClick={onClose}>
        Stäng typformuläret utan att skicka
      </button>
    </form>
  );
}
