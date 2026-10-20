import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { hasEnded } from '../shared/lifecycle.js';
import type { MapObject, ObjectType } from '../shared/map.js';
import { searchFieldMatches, searchWords } from '../shared/object-search.js';
import { objectPropertyValues } from './ObjectReadDetails.js';
import './object-search.css';

export const proposalLabels = ['Nytt', 'Ändrat', 'Föreslagen borttagning'] as const;
export type ProposalFilter = (typeof proposalLabels)[number];
export type ObjectSearchState = {
  query: string;
  types: string[];
  onlySelected: boolean;
  includeEnded?: boolean;
  includeRemoved?: boolean;
  proposals?: ProposalFilter[];
};
export const initialObjectSearch: ObjectSearchState = {
  query: '',
  types: [],
  onlySelected: false,
  includeEnded: false,
  includeRemoved: false,
  proposals: [],
};
export type SearchableObject = {
  object: MapObject;
  type?: ObjectType;
  removed?: boolean;
  proposal?: ProposalFilter;
  before?: MapObject | null;
  beforeType?: ObjectType;
};

/** Only this object's own readable fields participate; relationships never do. */
export function objectSearchMatch(
  object: MapObject,
  type: ObjectType | undefined,
  query: string,
  before?: MapObject | null,
  beforeType?: ObjectType,
) {
  const words = searchWords(query);
  if (!words.length) return { match: true, reasons: [] };
  const ownValues = objectPropertyValues(object, type);
  if (before)
    for (const [key, saved] of objectPropertyValues(before, beforeType)) {
      const current = ownValues.get(key);
      ownValues.set(key, {
        label: current?.label ?? saved.label,
        value: `${current?.value ?? ''} ${saved.label} ${saved.value}`,
      });
    }
  const fields = [...ownValues].map(([key, field]) => ({
    ...field,
    detail: !['name', 'type', 'description'].includes(key),
  }));
  const match = words.every((word) => fields.some((field) => searchFieldMatches(field, word)));
  const reasons =
    match && words.length
      ? fields
          .filter((field) => field.detail && words.some((word) => searchFieldMatches(field, word)))
          .map((field) => field.label)
      : [];
  return { match, reasons };
}
export function objectSearchResults<T extends SearchableObject>(
  rows: T[],
  search: ObjectSearchState,
  selectedIds: string[],
) {
  return rows.filter(
    (row) =>
      (search.includeRemoved || !row.removed) &&
      (search.includeEnded || !hasEnded(row.object)) &&
      (!search.onlySelected || selectedIds.includes(row.object.id)) &&
      (!search.types.length || search.types.includes(row.object.typeId)) &&
      (!search.proposals?.length ||
        Boolean(row.proposal && search.proposals.includes(row.proposal))) &&
      objectSearchMatch(row.object, row.type, search.query, row.before, row.beforeType).match,
  );
}
export function searchRestricted(search: ObjectSearchState) {
  return Boolean(
    search.query ||
      search.types.length ||
      search.onlySelected ||
      search.includeEnded ||
      search.includeRemoved ||
      search.proposals?.length,
  );
}
export function useDraftFilterReset(
  hasProposals: boolean,
  search: ObjectSearchState,
  onChange: (next: ObjectSearchState) => void,
) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!hasProposals && search.proposals?.length) {
      onChange({ ...search, proposals: [] });
      setNotice('Utkastfiltret är återställt eftersom ditt utkast är tomt.');
    } else if (hasProposals) setNotice('');
  }, [hasProposals, search, onChange]);
  return notice;
}
export function ObjectSearchInput({
  search,
  onChange,
  inputRef,
  label,
  compact = false,
}: {
  search: ObjectSearchState;
  onChange: (next: ObjectSearchState) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  label: string;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <div className={`object-search-input${compact ? ' map-search-input' : ''}`}>
      <label htmlFor={id}>
        <span className={compact ? 'visually-hidden' : undefined}>{label}</span>
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={search.query}
          placeholder="Namn, typ eller uppgift"
          onChange={(event) => onChange({ ...search, query: event.target.value })}
        />
      </label>
      <button
        type="button"
        aria-label="Rensa sökning"
        onClick={() => {
          onChange({ ...search, query: '' });
          if (compact) inputRef?.current?.focus();
        }}
      >
        {compact ? '×' : 'Rensa sökning'}
      </button>
    </div>
  );
}
function ObjectFilterChoice({
  checked,
  onChange,
  compact,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <label className={compact ? 'map-filter-choice' : undefined}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {compact && (
        <svg
          className="map-filter-choice-mark"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d={checked ? 'M3 8l3 3 7-7' : 'M8 3v10M3 8h10'} />
        </svg>
      )}
      {compact ? <span>{children}</span> : children}
    </label>
  );
}

export function ObjectSearchFilters({
  search,
  onChange,
  types,
  selectedIds,
  hasProposals,
  table = false,
  compact = false,
  matchingCount,
}: {
  search: ObjectSearchState;
  onChange: (next: ObjectSearchState) => void;
  types: ObjectType[];
  selectedIds: string[];
  hasProposals: boolean;
  table?: boolean;
  compact?: boolean;
  matchingCount?: number;
}) {
  function toggle<T extends string>(values: T[], value: T) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }
  return (
    <div className={`object-search-filters${compact ? ' map-quick-filters' : ''}`}>
      {compact && <p className="map-filter-hint">Välj flera typer. Utan val visas alla typer.</p>}
      <fieldset>
        <legend>Objekttyp</legend>
        {!compact && (
          <>
            <p>Välj en eller flera typer. Utan val visas alla typer.</p>
            <button type="button" onClick={() => onChange({ ...search, types: [] })}>
              Alla typer
            </button>
          </>
        )}
        <div>
          {[...types]
            .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
            .map((type) => (
              <ObjectFilterChoice
                key={type.id}
                compact={compact}
                checked={search.types.includes(type.id)}
                onChange={() => onChange({ ...search, types: toggle(search.types, type.id) })}
              >
                {type.name}
              </ObjectFilterChoice>
            ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Status</legend>
        <div>
          <ObjectFilterChoice
            compact={compact}
            checked={Boolean(search.includeEnded)}
            onChange={(checked) => onChange({ ...search, includeEnded: checked })}
          >
            Ta med upphörda
          </ObjectFilterChoice>
          {table && (
            <ObjectFilterChoice
              compact={compact}
              checked={Boolean(search.includeRemoved)}
              onChange={(checked) => onChange({ ...search, includeRemoved: checked })}
            >
              Ta med borttagna
            </ObjectFilterChoice>
          )}
          <ObjectFilterChoice
            compact={compact}
            checked={search.onlySelected}
            onChange={(checked) => onChange({ ...search, onlySelected: checked })}
          >
            Bara markerade ({selectedIds.length})
          </ObjectFilterChoice>
        </div>
      </fieldset>
      {hasProposals && (
        <fieldset>
          <legend>Förslag i ditt utkast</legend>
          <div>
            {proposalLabels.map((proposal) => (
              <ObjectFilterChoice
                key={proposal}
                compact={compact}
                checked={search.proposals?.includes(proposal) ?? false}
                onChange={() =>
                  onChange({ ...search, proposals: toggle(search.proposals ?? [], proposal) })
                }
              >
                {proposal}
              </ObjectFilterChoice>
            ))}
          </div>
        </fieldset>
      )}
      <div className={`object-search-filter-footer${compact ? ' map-filter-footer' : ''}`}>
        {compact && matchingCount !== undefined && (
          <span role="status">
            {matchingCount} {matchingCount === 1 ? 'träff' : 'träffar'}
            <span className="map-filter-result-note"> · uppdateras direkt</span>
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            onChange(table ? initialObjectSearch : { ...initialObjectSearch, query: search.query })
          }
        >
          {table ? 'Återställ sökning och filter' : 'Återställ filter'}
        </button>
      </div>
    </div>
  );
}
export function ObjectSearch({
  active,
  entryRequestId,
  search,
  onChange,
  onReturnToMap,
  types,
  selectedIds,
  hasProposals,
  matchingCount,
  table = false,
}: {
  active: boolean;
  entryRequestId?: number;
  search: ObjectSearchState;
  onChange: (next: ObjectSearchState) => void;
  onReturnToMap?: () => void;
  types: ObjectType[];
  selectedIds: string[];
  hasProposals: boolean;
  matchingCount?: number;
  table?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const activeChoices = useRef<HTMLFieldSetElement>(null);
  const dialogId = useId();
  const previousEntryRequestId = useRef(entryRequestId);
  const [expanded, setExpanded] = useState(false);
  const selectedFilters = [
    ...types
      .filter((type) => search.types.includes(type.id))
      .map((type) => ({
        key: `type-${type.id}`,
        label: type.name,
        clear: () => onChange({ ...search, types: search.types.filter((id) => id !== type.id) }),
      })),
    ...(search.includeEnded
      ? [
          {
            key: 'ended',
            label: 'Ta med upphörda',
            clear: () => onChange({ ...search, includeEnded: false }),
          },
        ]
      : []),
    ...(table && search.includeRemoved
      ? [
          {
            key: 'removed',
            label: 'Ta med borttagna',
            clear: () => onChange({ ...search, includeRemoved: false }),
          },
        ]
      : []),
    ...(search.onlySelected
      ? [
          {
            key: 'selected',
            label: `Bara markerade (${selectedIds.length})`,
            clear: () => onChange({ ...search, onlySelected: false }),
          },
        ]
      : []),
    ...(search.proposals ?? []).map((proposal) => ({
      key: `proposal-${proposal}`,
      label: proposal,
      clear: () =>
        onChange({ ...search, proposals: search.proposals?.filter((value) => value !== proposal) }),
    })),
  ];
  const filtersActive = Boolean(
    search.types.length ||
      search.includeEnded ||
      search.includeRemoved ||
      search.onlySelected ||
      search.proposals?.length,
  );
  function closeFilters() {
    setExpanded(false);
    filterButton.current?.focus();
  }
  useEffect(() => {
    if (active && entryRequestId !== previousEntryRequestId.current) {
      setExpanded(false);
      input.current?.focus();
    }
    previousEntryRequestId.current = entryRequestId;
  }, [active, entryRequestId]);
  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);
  useEffect(() => {
    if (!expanded || !active) return;
    const positionFilters = () => {
      if (!table || !dialog.current || !filterButton.current) return;
      const trigger = filterButton.current.getBoundingClientRect();
      const width = Math.min(440, window.innerWidth - 24);
      const below = window.innerHeight - trigger.bottom - 20;
      const top =
        below >= Math.min(240, window.innerHeight - 24) ? Math.max(12, trigger.bottom + 8) : 12;
      Object.assign(dialog.current.style, {
        width: `${width}px`,
        left: `${Math.max(12, Math.min(trigger.right - width, window.innerWidth - width - 12))}px`,
        top: `${top}px`,
        maxHeight: `${Math.min(600, window.innerHeight - top - 12)}px`,
      });
    };
    positionFilters();
    title.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !dialog.current?.contains(event.target) &&
        !filterButton.current?.contains(event.target)
      ) {
        setExpanded(false);
        filterButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    if (table) {
      window.addEventListener('resize', positionFilters);
      document.addEventListener('scroll', positionFilters, true);
    }
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('resize', positionFilters);
      document.removeEventListener('scroll', positionFilters, true);
    };
  }, [expanded, active, table]);
  return (
    <section
      className={table ? 'table-object-search' : 'map-object-search'}
      aria-label={table ? 'Tabellens sökning och filter' : 'Kartans sökning och filter'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          if (expanded) closeFilters();
          else onReturnToMap?.();
        }
      }}
    >
      <ObjectSearchInput
        search={search}
        onChange={onChange}
        inputRef={input}
        label={table ? 'Sök objekt i tabellen' : 'Sök objekt i kartan'}
        compact
      />
      <div className="map-search-filter">
        <div className="map-filter-trigger">
          <button
            ref={filterButton}
            type="button"
            aria-label={filtersActive ? 'Filter · aktiva' : 'Filter'}
            aria-expanded={expanded}
            aria-controls={dialogId}
            aria-haspopup="dialog"
            onClick={() => {
              if (expanded) closeFilters();
              else setExpanded(true);
            }}
          >
            Filter
          </button>
          <div
            ref={dialog}
            id={dialogId}
            role="dialog"
            aria-labelledby={`${dialogId}-title`}
            className="map-filter-dialog"
            hidden={!expanded}
          >
            <header>
              <div>
                <small aria-hidden="true">SNABBVAL</small>
                <h2 ref={title} id={`${dialogId}-title`} tabIndex={-1}>
                  {table ? 'Tabellens filter' : 'Kartans filter'}
                </h2>
              </div>
              <button type="button" aria-label="Stäng filter" onClick={closeFilters}>
                ×
              </button>
            </header>
            <ObjectSearchFilters
              search={search}
              onChange={onChange}
              types={types}
              selectedIds={selectedIds}
              hasProposals={hasProposals}
              table={table}
              compact
              matchingCount={expanded ? matchingCount : undefined}
            />
          </div>
        </div>
        {/* Keep the search area's geometry stable beneath the filter overlay. */}
        {selectedFilters.length > 0 && (
          <fieldset ref={activeChoices} className="map-active-filters" aria-label="Aktiva filter">
            {selectedFilters.map((filter, index) => (
              <button
                key={filter.key}
                type="button"
                aria-label={`Ta bort filter: ${filter.label}`}
                onClick={() => {
                  filter.clear();
                  requestAnimationFrame(() => {
                    const buttons =
                      activeChoices.current?.querySelectorAll<HTMLButtonElement>('button');
                    (
                      buttons?.[Math.min(index, buttons.length - 1)] ?? filterButton.current
                    )?.focus();
                  });
                }}
              >
                {filter.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </fieldset>
        )}
      </div>
    </section>
  );
}

export function MapSearchContext({
  search,
  onChange,
  notice,
  contextCount,
  hiddenEnded,
  explored,
  onReturnToHits,
}: {
  search: ObjectSearchState;
  onChange: (next: ObjectSearchState) => void;
  notice: string;
  contextCount: number;
  hiddenEnded: boolean;
  explored: boolean;
  onReturnToHits: () => void;
}) {
  return (
    <aside
      className="map-search-context"
      aria-label="Kartans sökresultat"
      hidden={!contextCount && !hiddenEnded && !explored && !notice}
    >
      {contextCount > 0 && <p>{contextCount} objekt visas som sammanhang, utöver sökträffarna.</p>}
      {hiddenEnded && (
        <p>
          Upphörda objekt eller samband döljs.{' '}
          <button type="button" onClick={() => onChange({ ...search, includeEnded: true })}>
            Ta med upphörda
          </button>
        </p>
      )}
      {explored && (
        <button type="button" onClick={onReturnToHits}>
          Tillbaka till sökträffarna
        </button>
      )}
      <p role="status">{notice}</p>
    </aside>
  );
}
