import { useState } from 'react';
import type { CustomField, CustomValues, ObjectType } from '../shared/map.js';

const kinds: Record<CustomField['kind'], string> = {
  text: 'Text',
  number: 'Tal',
  date: 'Datum',
  boolean: 'Ja/nej',
};

export function ObjectTypeDetails({ type }: { type: ObjectType | null }) {
  return type ? (
    <>
      <p>Objekttyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
      <ul>
        {type.fields?.map((field) => (
          <li key={field.id}>
            {field.name}: {kinds[field.kind]}
            {field.description && ` — ${field.description}`}
          </li>
        ))}
      </ul>
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
  onSubmit: (value: Pick<ObjectType, 'name' | 'description' | 'fields'> | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: initial.name,
    description: initial.description,
    fields: initial.fields ?? [],
  });
  function changeField(id: string, update: Partial<CustomField>) {
    onDirty();
    setValue({
      ...value,
      fields: value.fields.map((field) => (field.id === id ? { ...field, ...update } : field)),
    });
  }
  return (
    <form
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
        <p>
          Fält får lämnas obesvarade. Om ett använt fält behöver annat värdeslag skapar du ett nytt
          fält. Namn som liknar varandra kopplas inte ihop.
        </p>
        {value.fields.map((field, index) => (
          <fieldset key={field.id}>
            <legend>Eget fält {index + 1}</legend>
            <label htmlFor={`field-name-${field.id}`}>Fältets namn</label>
            <input
              id={`field-name-${field.id}`}
              required
              maxLength={200}
              value={field.name}
              onChange={(event) => changeField(field.id, { name: event.target.value })}
            />
            <label htmlFor={`field-description-${field.id}`}>Fältets beskrivning</label>
            <textarea
              id={`field-description-${field.id}`}
              maxLength={2000}
              value={field.description}
              onChange={(event) => changeField(field.id, { description: event.target.value })}
            />
            <label htmlFor={`field-kind-${field.id}`}>Värdeslag</label>
            <select
              id={`field-kind-${field.id}`}
              value={field.kind}
              onChange={(event) =>
                changeField(field.id, { kind: event.target.value as CustomField['kind'] })
              }
            >
              {Object.entries(kinds).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={stale}
              onClick={() => {
                onDirty();
                setValue({ ...value, fields: value.fields.filter((item) => item.id !== field.id) });
              }}
            >
              Ta bort fält: {field.name || `Eget fält ${index + 1}`}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={value.fields.length >= 100}
          onClick={() => {
            onDirty();
            setValue({
              ...value,
              fields: [
                ...value.fields,
                { id: crypto.randomUUID(), name: '', description: '', kind: 'text' },
              ],
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
          Lägg typförslaget i mitt utkast
        </button>
        <p>
          Använda typer och fält kan inte tas bort. Hantera först objekt och fältvärden i kartan och
          privata utkast, även upphört innehåll. Borttagning visas i utkastet före sparande.
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

export function CustomFieldsEditor({
  type,
  values = {},
  onChange,
}: {
  type?: ObjectType;
  values?: CustomValues;
  onChange: (values: CustomValues) => void;
}) {
  function change(id: string, value: string | number | boolean | undefined) {
    const next = { ...values };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  }
  return (
    <>
      {type?.fields?.map((field) => (
        <div key={field.id}>
          <label htmlFor={`custom-${field.id}`}>{field.name}</label>
          {field.description && <p id={`help-${field.id}`}>{field.description}</p>}
          {field.kind === 'boolean' ? (
            <select
              id={`custom-${field.id}`}
              aria-describedby={field.description ? `help-${field.id}` : undefined}
              value={values[field.id] === undefined ? '' : String(values[field.id])}
              onChange={(event) =>
                change(
                  field.id,
                  event.target.value === '' ? undefined : event.target.value === 'true',
                )
              }
            >
              <option value="">Obesvarat</option>
              <option value="true">Ja</option>
              <option value="false">Nej</option>
            </select>
          ) : (
            <input
              id={`custom-${field.id}`}
              aria-describedby={field.description ? `help-${field.id}` : undefined}
              type={field.kind === 'text' ? 'text' : field.kind}
              step={field.kind === 'number' ? 'any' : undefined}
              maxLength={field.kind === 'text' ? 2000 : undefined}
              value={String(values[field.id] ?? '')}
              onChange={(event) =>
                change(
                  field.id,
                  event.target.value === ''
                    ? undefined
                    : field.kind === 'number'
                      ? Number(event.target.value)
                      : event.target.value,
                )
              }
            />
          )}
        </div>
      ))}
    </>
  );
}

export function CustomFieldsDetails({
  type,
  values = {},
}: {
  type?: ObjectType;
  values?: CustomValues;
}) {
  return (
    <>
      {type?.fields?.map((field) => (
        <p key={field.id}>
          {field.name}:{' '}
          {values[field.id] === undefined
            ? 'Obesvarat'
            : values[field.id] === true
              ? 'Ja'
              : values[field.id] === false
                ? 'Nej'
                : values[field.id]}
        </p>
      ))}
    </>
  );
}
