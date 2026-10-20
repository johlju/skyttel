import { useId, useRef, useState } from 'react';
import type { MapObject, MapState } from '../shared/map.js';
import { ObjectReadDetails } from './ObjectReadDetails.js';
import { objectSearchMatch } from './ObjectSearch.js';

/** Inspecting a candidate never changes the selected endpoint. */
export function EndpointPicker({
  label,
  searchLabel,
  value,
  objects,
  state,
  onChange,
  query,
  onQueryChange,
}: {
  label: string;
  searchLabel: string;
  value: string;
  objects: MapObject[];
  state: MapState;
  onChange: (id: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const prefix = useId();
  const select = useRef<HTMLSelectElement>(null);
  const [inspected, setInspected] = useState<string[]>([]);
  const rows = objects.map((object) => {
    const change = state.draft.changes.find((change) => change.id === object.id);
    return {
      object,
      type: change?.type ?? state.types.find((type) => type.id === object.typeId),
      before: change?.before,
      beforeType: change?.beforeType ?? change?.type,
      proposal: change ? (change.before ? ('Ändrat' as const) : ('Nytt' as const)) : undefined,
      removed: false,
    };
  });
  const found = rows.filter(
    (row) => objectSearchMatch(row.object, row.type, query, row.before, row.beforeType).match,
  );
  const optionRows = rows.filter((row) => row.object.id === value || found.includes(row));
  return (
    <section className="endpoint-picker" aria-label={`${label}: välj eller granska`}>
      <label htmlFor={`${prefix}-search`}>{searchLabel}</label>
      <input
        id={`${prefix}-search`}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <label htmlFor={`${prefix}-select`}>{label}</label>
      <select
        ref={select}
        id={`${prefix}-select`}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Välj objekt</option>
        {optionRows.map(({ object, type }) => (
          <option key={object.id} value={object.id}>
            {object.name} · {type?.name ?? 'Typ saknas'} [{object.id}]
          </option>
        ))}
      </select>
      <p role="status">{found.length} kandidater. Granska uppgifterna före ditt val.</p>
      {found.map((row) => (
        <details
          key={row.object.id}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setInspected((previous) =>
              open
                ? [...new Set([...previous, row.object.id])]
                : previous.filter((id) => id !== row.object.id),
            );
          }}
        >
          <summary>
            Granska {row.object.name} [{row.object.id}]
          </summary>
          {inspected.includes(row.object.id) && (
            <ObjectReadDetails row={row} full showHeading={false} />
          )}
          <button
            type="button"
            onClick={() => {
              onChange(row.object.id);
              select.current?.focus();
            }}
          >
            Välj {row.object.name} [{row.object.id}]
          </button>
        </details>
      ))}
    </section>
  );
}
