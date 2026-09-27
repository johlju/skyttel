import { useLayoutEffect, useRef, useState } from 'react';
import type { CustomField, RelationshipType } from '../shared/map.js';
import { CustomFieldDefinition, customFieldKinds } from './ObjectTypes.js';

export function RelationshipTypeDetails({ type }: { type: RelationshipType | null }) {
  return type ? (
    <>
      <p>Sambandstyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
      <p>Benämning från startobjektet: {type.forwardLabel ?? type.name}</p>
      <p>Benämning från målobjektet: {type.reverseLabel ?? 'Visar den ursprungliga riktningen'}</p>
      <ul>
        {type.fields?.map((field) => (
          <li key={field.id}>
            {field.name}: {customFieldKinds[field.kind]}
            {field.description && ` — ${field.description}`}
          </li>
        ))}
      </ul>
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
    value: Pick<
      RelationshipType,
      'name' | 'description' | 'forwardLabel' | 'reverseLabel' | 'fields'
    > | null,
  ) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    fields: initial.fields ?? [],
    name: initial.name,
    description: initial.description,
    forwardLabel: initial.forwardLabel ?? initial.name,
    reverseLabel: initial.reverseLabel ?? '',
  });
  const form = useRef<HTMLFormElement>(null);
  const focusRequest = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest.current) return;
    form.current?.querySelector<HTMLElement>(`[id="${focusRequest.current}"]`)?.focus();
    focusRequest.current = null;
  });
  function changeField(id: string, update: Partial<CustomField>) {
    onDirty();
    setValue({
      ...value,
      fields: value.fields.map((field) => (field.id === id ? { ...field, ...update } : field)),
    });
  }
  function change(key: Exclude<keyof typeof value, 'fields'>, text: string) {
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
          Alla objekt kan kopplas samman. Egna fält får lämnas obesvarade. Lika namn betyder inte
          samma typ. Skapa ett nytt fält om en använd uppgift behöver annat värdeslag.
        </p>
        {value.fields.map((field, index) => (
          <details className="type-field-editor" key={field.id} open>
            <summary>
              {field.name || `Eget fält ${index + 1}`} · {customFieldKinds[field.kind]}
            </summary>
            <fieldset>
              <legend>Eget fält {index + 1}</legend>
              <CustomFieldDefinition
                field={field}
                onChange={(update) => changeField(field.id, update)}
              />
              <button
                type="button"
                disabled={stale}
                onClick={() => {
                  onDirty();
                  focusRequest.current = 'add-relationship-field';
                  setValue({
                    ...value,
                    fields: value.fields.filter((item) => item.id !== field.id),
                  });
                }}
              >
                Ta bort fält: {field.name || `Eget fält ${index + 1}`}
              </button>
            </fieldset>
          </details>
        ))}
        <button
          id="add-relationship-field"
          type="button"
          disabled={stale || value.fields.length >= 100}
          onClick={() => {
            onDirty();
            const id = crypto.randomUUID();
            focusRequest.current = `field-name-${id}`;
            setValue({
              ...value,
              fields: [...value.fields, { id, name: '', description: '', kind: 'text' }],
            });
          }}
        >
          Lägg till fält
        </button>
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
          Använda typer och fält kan inte tas bort. Ta bort eller byt typ på sambanden först, även
          upphörda samband och förslag i privata utkast. Objekten kan finnas kvar.
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
