import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { CustomField, CustomValues, ObjectType } from '../shared/map.js';
import { objectTypePresentation } from '../shared/map.js';

const kinds: Record<CustomField['kind'], string> = {
  text: 'Text',
  number: 'Tal',
  date: 'Datum',
  boolean: 'Ja/nej',
};
function moved<T>(items: T[], from: number, to: number) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function ObjectTypeDetails({ type }: { type: ObjectType | null }) {
  return type ? (
    <>
      <p>Objekttyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
      <p>
        Avsnitt:{' '}
        {objectTypePresentation(type)
          .sections.map(({ name }) => name)
          .join(' → ') || 'Inga'}
      </p>
      <ul>
        {type.fields?.map((field) => (
          <li key={field.id}>
            {field.name}: {kinds[field.kind]}
            {field.description && ` — ${field.description}`}
            {' · '}
            {objectTypePresentation(type).sections.find(
              ({ id }) => id === (field.sectionId ?? 'custom-fields'),
            )?.name ?? 'Dold, behåll värden'}
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
  onSubmit: (
    value: Pick<ObjectType, 'name' | 'description' | 'fields' | 'sections'> | null,
  ) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: initial.name,
    description: initial.description,
    ...objectTypePresentation(initial),
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
        <p>
          Fält får lämnas obesvarade. Om ett använt fält behöver annat värdeslag skapar du ett nytt
          fält. Namn som liknar varandra kopplas inte ihop.
        </p>
        <details className="type-section-editor" open>
          <summary>
            Avsnitt <span>{value.sections.length}</span>
          </summary>
          <p>Avsnitten visas i denna ordning i formulär och detaljer.</p>
          {value.sections.map((section, index) => {
            const count = value.fields.filter((field) => field.sectionId === section.id).length;
            return (
              <div className="type-section-row" key={section.id}>
                <label htmlFor={`section-${section.id}`}>Avsnitt {index + 1}</label>
                <input
                  id={`section-${section.id}`}
                  required
                  pattern=".*\S.*"
                  maxLength={200}
                  value={section.name}
                  onChange={(event) => {
                    onDirty();
                    setValue({
                      ...value,
                      sections: value.sections.map((item) =>
                        item.id === section.id ? { ...item, name: event.target.value } : item,
                      ),
                    });
                  }}
                />
                <div className="type-row-actions">
                  <span>{count} fält</span>
                  {([-1, 1] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      disabled={
                        stale ||
                        (direction === -1 ? index === 0 : index === value.sections.length - 1)
                      }
                      aria-label={`Flytta avsnittet ${section.name} ${direction === -1 ? 'upp' : 'ned'}`}
                      onClick={() => {
                        onDirty();
                        focusRequest.current = `section-${section.id}`;
                        setValue({
                          ...value,
                          sections: moved(value.sections, index, index + direction),
                        });
                      }}
                    >
                      {direction === -1 ? '↑ Upp' : '↓ Ned'}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={stale || count > 0}
                    aria-label={`Ta bort det tomma avsnittet ${section.name}`}
                    onClick={() => {
                      onDirty();
                      focusRequest.current = 'add-type-section';
                      setValue({
                        ...value,
                        sections: value.sections.filter((item) => item.id !== section.id),
                      });
                    }}
                  >
                    Ta bort
                  </button>
                </div>
                {count > 0 && <p>Flytta eller dölj fälten för att ta bort avsnittet.</p>}
              </div>
            );
          })}
          {!value.sections.length && (
            <p>Inga avsnitt ännu. Lägg till ett avsnitt för att visa fält.</p>
          )}
          <button
            id="add-type-section"
            type="button"
            disabled={stale || value.sections.length >= 100}
            onClick={() => {
              onDirty();
              const id = crypto.randomUUID();
              focusRequest.current = `section-${id}`;
              setValue({ ...value, sections: [...value.sections, { id, name: '' }] });
            }}
          >
            Lägg till avsnitt
          </button>
        </details>
        <p>
          Ordningen gäller inom varje avsnitt. Dolda fält behåller sina värden och kan visas igen.
        </p>
        {value.fields.map((field, index) => (
          <details className="type-field-editor" key={field.id} open>
            <summary>
              {field.name || `Eget fält ${index + 1}`} · {kinds[field.kind]} ·{' '}
              {value.sections.find(({ id }) => id === field.sectionId)?.name || 'Dold'}
            </summary>
            <fieldset>
              <legend>Eget fält {index + 1}</legend>
              <label htmlFor={`field-name-${field.id}`}>Fältets namn</label>
              <input
                id={`field-name-${field.id}`}
                required
                pattern=".*\S.*"
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
              <label htmlFor={`field-section-${field.id}`}>Visa i avsnitt</label>
              <select
                id={`field-section-${field.id}`}
                value={field.sectionId}
                onChange={(event) => changeField(field.id, { sectionId: event.target.value })}
              >
                <option value="">Dold, behåll värden</option>
                {value.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name || 'Namnlöst avsnitt'}
                  </option>
                ))}
              </select>
              <div className="type-row-actions">
                {([-1, 1] as const).map((direction) => {
                  const siblings = value.fields.filter(
                    (item) => item.sectionId === field.sectionId,
                  );
                  const position = siblings.findIndex((item) => item.id === field.id);
                  const target = siblings[position + direction];
                  return (
                    <button
                      key={direction}
                      type="button"
                      disabled={stale || !target}
                      aria-label={`Flytta fältet ${field.name} ${direction === -1 ? 'upp' : 'ned'}`}
                      onClick={() => {
                        onDirty();
                        focusRequest.current = `field-name-${field.id}`;
                        setValue({
                          ...value,
                          fields: moved(
                            value.fields,
                            index,
                            value.fields.findIndex((item) => item.id === target.id),
                          ),
                        });
                      }}
                    >
                      {direction === -1 ? '↑ Upp' : '↓ Ned'}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={stale || !field.sectionId}
                  aria-label={`Dölj ${field.name}, behåll värden`}
                  onClick={() => {
                    focusRequest.current = `field-section-${field.id}`;
                    changeField(field.id, { sectionId: '' });
                  }}
                >
                  Dölj
                </button>
              </div>
              <button
                type="button"
                disabled={stale}
                onClick={() => {
                  onDirty();
                  focusRequest.current = 'add-type-field';
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
          id="add-type-field"
          type="button"
          disabled={value.fields.length >= 100}
          onClick={() => {
            onDirty();
            const id = crypto.randomUUID();
            focusRequest.current = `field-name-${id}`;
            setValue({
              ...value,
              fields: [
                ...value.fields,
                {
                  id,
                  name: '',
                  description: '',
                  kind: 'text',
                  sectionId: value.sections[0]?.id ?? '',
                },
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
  const prefix = useId();
  const presentation = objectTypePresentation(type ?? {});
  function change(id: string, value: string | number | boolean | undefined) {
    const next = { ...values };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  }
  return (
    <>
      {presentation.sections.map(
        (section) =>
          presentation.fields.some((field) => field.sectionId === section.id) && (
            <fieldset key={section.id} className="custom-field-section">
              <legend>{section.name}</legend>
              {presentation.fields
                .filter((field) => field.sectionId === section.id)
                .map((field) => (
                  <div key={field.id}>
                    <label htmlFor={`${prefix}-custom-${field.id}`}>{field.name}</label>
                    {field.description && (
                      <p id={`${prefix}-help-${field.id}`}>{field.description}</p>
                    )}
                    {field.kind === 'boolean' ? (
                      <select
                        id={`${prefix}-custom-${field.id}`}
                        aria-describedby={
                          field.description ? `${prefix}-help-${field.id}` : undefined
                        }
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
                        id={`${prefix}-custom-${field.id}`}
                        aria-describedby={
                          field.description ? `${prefix}-help-${field.id}` : undefined
                        }
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
            </fieldset>
          ),
      )}
    </>
  );
}

export function CustomFieldsDetails({
  type,
  values = {},
  showHidden = false,
}: {
  type?: ObjectType;
  values?: CustomValues;
  showHidden?: boolean;
}) {
  const presentation = objectTypePresentation(type ?? {});
  const sections = [
    ...presentation.sections,
    ...(showHidden ? [{ id: '', name: 'Dolda fält – bevarade värden' }] : []),
  ];
  return (
    <>
      {sections.map(
        (section) =>
          presentation.fields.some((field) => field.sectionId === section.id) && (
            <section key={section.id} className="custom-field-section" aria-label={section.name}>
              <h4>{section.name}</h4>
              {presentation.fields
                .filter((field) => field.sectionId === section.id)
                .map((field) => (
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
            </section>
          ),
      )}
    </>
  );
}
