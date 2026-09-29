import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { CustomField, CustomValues, ObjectType } from '../shared/map.js';
import { objectTypePresentation } from '../shared/map.js';
import { builtinProperties, objectProperties } from '../shared/object-properties.js';

export const customFieldKinds: Record<CustomField['kind'], string> = {
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

export function CustomFieldDefinition({
  field,
  onChange,
}: {
  field: CustomField;
  onChange: (update: Partial<CustomField>) => void;
}) {
  return (
    <>
      <label htmlFor={`field-name-${field.id}`}>Fältets namn</label>
      <input
        id={`field-name-${field.id}`}
        required
        pattern=".*\S.*"
        maxLength={200}
        value={field.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <label htmlFor={`field-description-${field.id}`}>Fältets beskrivning</label>
      <textarea
        id={`field-description-${field.id}`}
        maxLength={2000}
        value={field.description}
        onChange={(event) => onChange({ description: event.target.value })}
      />
      <label htmlFor={`field-kind-${field.id}`}>Värdeslag</label>
      <select
        id={`field-kind-${field.id}`}
        value={field.kind}
        onChange={(event) => onChange({ kind: event.target.value as CustomField['kind'] })}
      >
        {Object.entries(customFieldKinds).map(([kind, label]) => (
          <option key={kind} value={kind}>
            {label}
          </option>
        ))}
      </select>
    </>
  );
}

export function ObjectTypeDetails({ type }: { type: ObjectType | null }) {
  return type ? (
    <>
      <p>Objekttyp: {type.name}</p>
      <p>{type.description || 'Ingen beskrivning'}</p>
      <TypeFieldsDetails type={type} />
    </>
  ) : (
    <p>Finns inte i kartan</p>
  );
}

export function TypeFieldsDetails({
  type,
}: {
  type: Pick<ObjectType, 'fields' | 'sections' | 'builtins' | 'propertyOrder'>;
}) {
  return (
    <>
      <p>
        Avsnitt:{' '}
        {objectTypePresentation(type)
          .sections.map(({ name }) => name)
          .join(' → ') || 'Inga'}
      </p>
      <ul>
        {objectProperties(type).map((property) => (
          <li key={property.ref}>
            {property.name}:{' '}
            {property.kind === 'custom'
              ? customFieldKinds[property.field.kind]
              : `Gemensam egenskap: ${builtinProperties.find(({ key }) => key === property.field.key)?.label}`}
            {property.kind === 'custom' &&
              property.field.description &&
              ` — ${property.field.description}`}
            {' · '}
            {objectTypePresentation(type).sections.find(({ id }) => id === property.sectionId)
              ?.name ?? 'Dold, behåll värden'}
          </li>
        ))}
      </ul>
    </>
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
    value: Pick<
      ObjectType,
      'name' | 'description' | 'fields' | 'sections' | 'builtins' | 'propertyOrder'
    > | null,
  ) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: initial.name,
    description: initial.description,
    ...objectTypePresentation(initial),
    ...(initial.builtins !== undefined ? { builtins: initial.builtins } : {}),
    ...(initial.propertyOrder !== undefined ? { propertyOrder: initial.propertyOrder } : {}),
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
        <p>
          Fält får lämnas obesvarade. Om ett använt fält behöver annat värdeslag skapar du ett nytt
          fält. Namn som liknar varandra kopplas inte ihop.
        </p>
        <TypeFieldsDefinition
          allowBuiltins
          value={value}
          stale={stale}
          onChange={(presentation) => {
            onDirty();
            setValue({ ...value, ...presentation });
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

type FieldPresentation = ReturnType<typeof objectTypePresentation> &
  Pick<ObjectType, 'builtins' | 'propertyOrder'>;

export function TypeFieldsDefinition({
  value,
  allowBuiltins = false,
  stale,
  onChange: setValue,
}: {
  value: FieldPresentation;
  allowBuiltins?: boolean;
  stale: boolean;
  onChange: (value: FieldPresentation) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest.current) return;
    container.current?.querySelector<HTMLElement>(`[id="${focusRequest.current}"]`)?.focus();
    focusRequest.current = null;
  });
  const properties = objectProperties(value);
  function changeField(ref: string, update: Partial<CustomField>) {
    setValue(
      ref.startsWith('builtin:')
        ? {
            ...value,
            builtins: value.builtins?.map((field) =>
              `builtin:${field.key}` === ref ? { ...field, ...update } : field,
            ),
          }
        : {
            ...value,
            fields: value.fields.map((field) =>
              `field:${field.id}` === ref ? { ...field, ...update } : field,
            ),
          },
    );
  }
  function reorder(order: string[]) {
    setValue({
      ...value,
      fields: order.flatMap((ref) => value.fields.filter((field) => ref === `field:${field.id}`)),
      ...(value.propertyOrder !== undefined ? { propertyOrder: order } : {}),
    });
  }
  return (
    <div ref={container}>
      <details className="type-section-editor" open>
        <summary>
          Avsnitt <span>{value.sections.length}</span>
        </summary>
        <p>Avsnitten visas i denna ordning i formulär och detaljer.</p>
        {value.sections.map((section, index) => {
          const count = properties.filter((field) => field.sectionId === section.id).length;
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
      {properties.map((property, index) => {
        const builtin = property.kind === 'builtin' ? property.field : undefined;
        const field =
          property.kind === 'custom'
            ? property.field
            : {
                id: `builtin:${property.field.key}`,
                name: property.name,
                sectionId: property.sectionId,
              };
        const canonical = builtinProperties.find(({ key }) => key === builtin?.key)?.label;
        return (
          <details className="type-field-editor" key={property.ref} open>
            <summary>
              {field.name || `Eget fält ${index + 1}`} ·{' '}
              {property.kind === 'builtin'
                ? 'Gemensam egenskap'
                : customFieldKinds[property.field.kind]}{' '}
              · {value.sections.find(({ id }) => id === field.sectionId)?.name || 'Dold'}
            </summary>
            <fieldset>
              <legend>
                {builtin ? `Gemensam egenskap: ${canonical}` : `Eget fält ${index + 1}`}
              </legend>
              {builtin ? (
                <>
                  <p>Gemensam egenskap: {canonical}. Befintliga värden följer med.</p>
                  <label htmlFor={`field-name-${field.id}`}>Fältets namn</label>
                  <input
                    id={`field-name-${field.id}`}
                    required
                    pattern=".*\S.*"
                    maxLength={200}
                    value={field.name}
                    onChange={(event) => changeField(property.ref, { name: event.target.value })}
                  />
                </>
              ) : property.kind === 'custom' ? (
                <CustomFieldDefinition
                  field={property.field}
                  onChange={(update) => changeField(property.ref, update)}
                />
              ) : null}
              <label htmlFor={`field-section-${field.id}`}>Visa i avsnitt</label>
              <select
                id={`field-section-${field.id}`}
                value={field.sectionId}
                onChange={(event) => changeField(property.ref, { sectionId: event.target.value })}
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
                  const siblings = properties.filter((item) => item.sectionId === field.sectionId);
                  const position = siblings.findIndex((item) => item.ref === property.ref);
                  const target = siblings[position + direction];
                  return (
                    <button
                      key={direction}
                      type="button"
                      disabled={stale || !target}
                      aria-label={`Flytta fältet ${field.name} ${direction === -1 ? 'upp' : 'ned'}`}
                      onClick={() => {
                        focusRequest.current = `field-name-${field.id}`;
                        reorder(
                          moved(
                            properties.map(({ ref }) => ref),
                            index,
                            properties.findIndex((item) => item.ref === target.ref),
                          ),
                        );
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
                    changeField(property.ref, { sectionId: '' });
                  }}
                >
                  Dölj
                </button>
              </div>
              {property.kind === 'custom' && (
                <button
                  type="button"
                  disabled={stale}
                  onClick={() => {
                    focusRequest.current = 'add-type-field';
                    setValue({
                      ...value,
                      fields: value.fields.filter((item) => property.ref !== `field:${item.id}`),
                      ...(value.propertyOrder !== undefined
                        ? {
                            propertyOrder: value.propertyOrder.filter(
                              (ref) => ref !== property.ref,
                            ),
                          }
                        : {}),
                    });
                  }}
                >
                  Ta bort fält: {field.name || `Eget fält ${index + 1}`}
                </button>
              )}
            </fieldset>
          </details>
        );
      })}
      <button
        id="add-type-field"
        type="button"
        disabled={stale || value.fields.length >= 100}
        onClick={() => {
          const id = crypto.randomUUID();
          focusRequest.current = `field-name-${id}`;
          setValue({
            ...value,
            ...(value.propertyOrder !== undefined
              ? { propertyOrder: [...value.propertyOrder, `field:${id}`] }
              : {}),
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
      {allowBuiltins && (
        <>
          <label htmlFor="add-builtin-property">Lägg till gemensam egenskap</label>
          <select
            id="add-builtin-property"
            value=""
            disabled={stale || value.builtins?.length === builtinProperties.length}
            onChange={(event) => {
              const definition = builtinProperties.find(({ key }) => key === event.target.value);
              if (!definition) return;
              focusRequest.current = `field-name-builtin:${definition.key}`;
              setValue({
                ...value,
                builtins: [
                  ...(value.builtins ?? []),
                  {
                    key: definition.key,
                    name: definition.label,
                    sectionId: value.sections[0]?.id ?? '',
                  },
                ],
                propertyOrder: [...properties.map(({ ref }) => ref), `builtin:${definition.key}`],
              });
            }}
          >
            <option value="">Välj gemensam egenskap</option>
            {builtinProperties
              .filter(({ key }) => !value.builtins?.some((field) => field.key === key))
              .map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </>
      )}
    </div>
  );
}

export function CustomFieldsEditor({
  type,
  values = {},
  onChange,
}: {
  type?: Pick<ObjectType, 'fields' | 'sections'>;
  values?: CustomValues;
  onChange: (values: CustomValues) => void;
}) {
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
                  <CustomFieldValueEditor
                    key={field.id}
                    field={field}
                    value={values[field.id]}
                    onChange={(value) => change(field.id, value)}
                  />
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
  type?: Pick<ObjectType, 'fields' | 'sections'>;
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
                  <CustomFieldValueDetails
                    key={field.id}
                    name={field.name}
                    value={values[field.id]}
                  />
                ))}
            </section>
          ),
      )}
    </>
  );
}

export function CustomFieldValueDetails({
  name,
  value,
}: {
  name: string;
  value: CustomValues[string] | undefined;
}) {
  return (
    <p>
      {name}:{' '}
      {value === undefined ? 'Obesvarat' : value === true ? 'Ja' : value === false ? 'Nej' : value}
    </p>
  );
}

export function CustomFieldValueEditor({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const prefix = useId();
  return (
    <div>
      <label htmlFor={`${prefix}-custom-${field.id}`}>{field.name}</label>
      {field.description && <p id={`${prefix}-help-${field.id}`}>{field.description}</p>}
      {field.kind === 'boolean' ? (
        <select
          id={`${prefix}-custom-${field.id}`}
          aria-describedby={field.description ? `${prefix}-help-${field.id}` : undefined}
          value={value === undefined ? '' : String(value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : event.target.value === 'true')
          }
        >
          <option value="">Obesvarat</option>
          <option value="true">Ja</option>
          <option value="false">Nej</option>
        </select>
      ) : (
        <input
          id={`${prefix}-custom-${field.id}`}
          aria-describedby={field.description ? `${prefix}-help-${field.id}` : undefined}
          type={field.kind === 'text' ? 'text' : field.kind}
          step={field.kind === 'number' ? 'any' : undefined}
          maxLength={field.kind === 'text' ? 2000 : undefined}
          value={String(value ?? '')}
          onChange={(event) =>
            onChange(
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
  );
}
