import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  type Property,
  type PropertyKind,
  propertiesSchema,
  propertyKindLabels,
  propertySchema,
} from '../shared/properties.js';
import './property-editor.css';

type Entry = { id: string; label: string; kind: PropertyKind | ''; raw: string; present: boolean };
function entry(property: Property): Entry {
  const value = 'value' in property ? property.value : undefined;
  return {
    id: property.id,
    label: property.label,
    kind: property.kind ?? '',
    raw: value === undefined ? '' : String(value),
    present: value !== undefined,
  };
}
function candidate(row: Entry) {
  const value =
    row.kind === 'number'
      ? row.raw.trim()
        ? Number(row.raw)
        : Number.NaN
      : row.kind === 'boolean'
        ? row.raw === 'true'
          ? true
          : row.raw === 'false'
            ? false
            : row.raw
        : row.raw;
  return {
    id: row.id,
    label: row.label,
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.present ? { value } : {}),
  };
}
function problem(row: Entry) {
  if (!row.label.trim()) return 'Ange en etikett.';
  if (propertySchema.safeParse(candidate(row)).success) return '';
  if (!row.kind) return 'Välj en datatyp eller töm värdet.';
  return row.kind === 'number'
    ? 'Ange ett giltigt tal eller töm värdet.'
    : row.kind === 'date'
      ? 'Ange ett giltigt datum som ÅÅÅÅ-MM-DD eller töm värdet.'
      : row.kind === 'boolean'
        ? 'Välj Ja, Nej eller Tomt.'
        : 'Texten får innehålla högst 10 000 tecken.';
}

/** Keep unaccepted input locally until the complete ordered list is valid. */
export function PropertyEditor({
  value,
  onChange,
  onInvalidChange,
}: {
  value: Property[];
  onChange: (value: Property[]) => void;
  onInvalidChange?: (invalid: boolean) => void;
}) {
  const prefix = useId();
  const [rows, setRows] = useState(() => value.map(entry));
  const [status, setStatus] = useState('');
  const focus = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (focus.current) {
      document.getElementById(focus.current)?.focus();
      focus.current = undefined;
    }
  });
  function update(next: Entry[]) {
    setRows(next);
    const accepted = propertiesSchema.safeParse(next.map(candidate));
    onInvalidChange?.(!accepted.success);
    if (accepted.success) onChange(accepted.data);
  }
  function change(id: string, patch: Partial<Entry>) {
    update(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function move(index: number, offset: number) {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + offset, 0, row);
    focus.current = `${prefix}-${row.id}-label`;
    update(next);
    setStatus(`${row.label || 'Egenskapen'} har position ${index + offset + 1} av ${next.length}.`);
  }
  return (
    <div className="property-editor object-wide">
      <p>
        Välj en egen etikett. Samma etikett kan användas flera gånger. Uppgifterna hör till detta
        objekt eller samband, oberoende av dess typ.
      </p>
      <p role="status" aria-label="Egenskapernas ordning">
        {status}
      </p>
      {rows.map((row, index) => {
        const id = `${prefix}-${row.id}`;
        const error = problem(row);
        const valueError = row.label.trim() ? error : '';
        return (
          <fieldset key={row.id} className="property-editor-row">
            <legend>Egenskap {index + 1}</legend>
            <div className="property-editor-fields">
              <label htmlFor={`${id}-label`}>Etikett</label>
              <input
                id={`${id}-label`}
                required
                maxLength={200}
                value={row.label}
                aria-invalid={!row.label.trim() || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                ref={(element) =>
                  element?.setCustomValidity(row.label.trim() ? '' : 'Ange en etikett.')
                }
                onChange={(event) => change(row.id, { label: event.target.value })}
              />
              <label htmlFor={`${id}-kind`}>Datatyp</label>
              <select
                id={`${id}-kind`}
                value={row.kind}
                onChange={(event) => change(row.id, { kind: event.target.value as Entry['kind'] })}
                aria-invalid={Boolean(valueError) || undefined}
                aria-describedby={valueError ? `${id}-error` : undefined}
                ref={(element) => element?.setCustomValidity(valueError)}
              >
                <option value="">Ingen datatyp</option>
                {Object.entries(propertyKindLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor={`${id}-value`}>Värde</label>
              {row.kind === 'boolean' ? (
                <select
                  id={`${id}-value`}
                  value={row.present ? row.raw : ''}
                  onChange={(event) =>
                    change(row.id, { raw: event.target.value, present: event.target.value !== '' })
                  }
                >
                  {row.present && !['true', 'false'].includes(row.raw) && (
                    <option value={row.raw}>Ogiltigt: {row.raw}</option>
                  )}
                  <option value="">Tomt</option>
                  <option value="true">Ja</option>
                  <option value="false">Nej</option>
                </select>
              ) : (
                <input
                  id={`${id}-value`}
                  value={row.raw}
                  disabled={!row.kind}
                  inputMode={row.kind === 'number' ? 'decimal' : 'text'}
                  placeholder={row.kind === 'date' ? 'ÅÅÅÅ-MM-DD' : undefined}
                  aria-invalid={Boolean(valueError) || undefined}
                  aria-describedby={valueError ? `${id}-error` : undefined}
                  ref={(element) => element?.setCustomValidity(valueError)}
                  onChange={(event) =>
                    change(row.id, {
                      raw: event.target.value,
                      present: row.kind === 'text' || event.target.value !== '',
                    })
                  }
                />
              )}
            </div>
            {error && (
              <p id={`${id}-error`} role="alert">
                {error}
              </p>
            )}
            <p>
              {!row.present
                ? 'Tomt värde'
                : row.kind === 'text' && !row.raw
                  ? 'Tom text'
                  : 'Värde angivet'}
            </p>
            <div className="property-editor-actions">
              {row.kind === 'text' && !row.present && (
                <button type="button" onClick={() => change(row.id, { raw: '', present: true })}>
                  Ange tom text
                </button>
              )}
              <button type="button" onClick={() => change(row.id, { raw: '', present: false })}>
                Töm värdet
              </button>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                Flytta upp
              </button>
              <button
                type="button"
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                Flytta ned
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = rows.filter(({ id }) => id !== row.id);
                  focus.current = next.length
                    ? `${prefix}-${next[Math.min(index, next.length - 1)].id}-label`
                    : `${prefix}-add`;
                  update(next);
                  setStatus(
                    `Egenskap ${index + 1} är borttagen. ${next.length} egenskaper finns kvar.`,
                  );
                }}
              >
                Ta bort egenskapen
              </button>
            </div>
          </fieldset>
        );
      })}
      <button
        id={`${prefix}-add`}
        type="button"
        onClick={() => {
          const row: Entry = {
            id: crypto.randomUUID(),
            label: '',
            kind: '',
            raw: '',
            present: false,
          };
          focus.current = `${prefix}-${row.id}-label`;
          update([...rows, row]);
          setStatus(`En ny egenskap har position ${rows.length + 1}.`);
        }}
      >
        Lägg till egenskap
      </button>
    </div>
  );
}
