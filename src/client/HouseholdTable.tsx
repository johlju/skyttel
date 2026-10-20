import { Fragment, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { hasEnded } from '../shared/lifecycle.js';
import type { MapObject, MapState, ObjectType } from '../shared/map.js';
import { usableFocusTarget } from './modal-focus.js';
import { ObjectReadDetails } from './ObjectReadDetails.js';
import {
  initialObjectSearch,
  ObjectSearch,
  objectSearchMatch,
  objectSearchResults,
  useDraftFilterReset,
} from './ObjectSearch.js';
import { WorkspaceIcon } from './WorkspaceTools.js';
import './household-table.css';
import './object-dialog.css';

export type HouseholdTableRow = {
  object: MapObject;
  type?: ObjectType;
  before?: MapObject | null;
  beforeType?: ObjectType;
  removed: boolean;
  proposal?: 'Nytt' | 'Ändrat' | 'Föreslagen borttagning';
};

/** Includes saved deletions for table filters, without adding them to the map. */
export function householdTableRows(state: MapState, types: ObjectType[]): HouseholdTableRow[] {
  const rows = new Map<string, HouseholdTableRow>();
  for (const { object, type } of state.removedObjects ?? [])
    rows.set(object.id, { object, type, removed: true });
  for (const object of state.objects)
    rows.set(object.id, {
      object,
      type: types.find((type) => type.id === object.typeId),
      removed: false,
    });
  for (const change of state.draft.changes) {
    const value = change.after ?? change.before;
    if (!value) continue;
    rows.set(change.id, {
      object: {
        ...value,
        id: change.id,
        householdId: change.type.householdId,
        revision: change.before?.revision ?? 0,
      },
      type: change.type,
      before: change.before,
      beforeType: change.beforeType ?? change.type,
      removed: rows.get(change.id)?.removed ?? false,
      proposal: !change.after ? 'Föreslagen borttagning' : change.before ? 'Ändrat' : 'Nytt',
    });
  }
  return [...rows.values()];
}

export function HouseholdTable({
  active,
  householdName,
  workDisabled = false,
  mapAvailable = true,
  rows,
  selectedIds,
  onSelect,
  onNew,
  onEdit,
  onRelationships,
  relationshipCounts,
  onReveal,
  onFocusRelationships,
  onRemove,
  removalNotice,
  searchContent,
  hasProposals = false,
  objectTypes = [],
  statusContent,
  actionContent,
}: {
  active: boolean;
  householdName: string;
  workDisabled?: boolean;
  mapAvailable?: boolean;
  rows: HouseholdTableRow[];
  selectedIds: string[];
  onSelect: (object: MapObject) => void;
  onNew?: () => void;
  onEdit?: (object: MapObject, restoreFocus: () => void) => void;
  onRelationships?: (object: MapObject, restoreFocus: () => void) => void;
  relationshipCounts?: Map<string, number>;
  onReveal?: (object: MapObject) => void;
  onFocusRelationships?: (object: MapObject) => void;
  onRemove?: (object: MapObject) => Promise<boolean> | undefined;
  removalNotice?: (object: MapObject, id: string) => ReactNode;
  searchContent?: ReactNode;
  hasProposals?: boolean;
  objectTypes?: ObjectType[];
  statusContent?: ReactNode;
  actionContent?: ReactNode;
}) {
  const prefix = useId();
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'type-asc' | 'type-desc'>('name-asc');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [search, setSearch] = useState(initialObjectSearch);
  const [removalFocus, setRemovalFocus] = useState<{
    origin: HTMLElement;
    restore: () => void;
  } | null>(null);
  const notice = useDraftFilterReset(hasProposals, search, setSearch);
  const heading = useRef<HTMLHeadingElement>(null);
  const tableRegion = useRef<HTMLElement>(null);
  const resultRegion = useRef<HTMLElement>(null);
  const pageFocusRequested = useRef(false);
  const root = useRef<HTMLElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const scroll = useRef({ top: 0, left: 0 });
  const outerScroll = useRef(0);
  const lastRowFocus = useRef<{ id: string; action: string; order: string[] } | null>(null);
  const visited = useRef(false);
  const wasActive = useRef(false);
  const returnFrame = useRef<number | undefined>(undefined);
  const found = objectSearchResults(rows, search, selectedIds);
  const types = [
    ...new Map([
      ...objectTypes.map((type) => [type.id, type] as const),
      ...rows.flatMap((row) => (row.type ? [[row.type.id, row.type] as const] : [])),
    ]).values(),
  ];
  const descending = sort.endsWith('desc');
  const collator = new Intl.Collator('sv', { numeric: true });
  found.sort((a, b) => {
    const order = sort.startsWith('type')
      ? collator.compare(a.type?.name ?? '', b.type?.name ?? '')
      : 0;
    return (
      (order ||
        collator.compare(a.object.name, b.object.name) ||
        collator.compare(a.object.id, b.object.id)) * (descending ? -1 : 1)
    );
  });
  const pages = Math.max(1, Math.ceil(found.length / 50));
  const actualPage = Math.min(page, pages - 1);
  const visible = found.slice(actualPage * 50, (actualPage + 1) * 50);
  function replacementFocus(previous: { id: string; action: string; order: string[] } | null) {
    const index = previous?.order.indexOf(previous.id) ?? -1;
    if (previous && index >= 0) {
      const controls = [
        ...(root.current?.querySelectorAll<HTMLElement>('[data-table-action]') ?? []),
      ];
      const next = [
        ...previous.order.slice(index + 1),
        ...previous.order.slice(0, index).reverse(),
      ];
      for (const id of next) {
        const control = controls.find(
          (control) =>
            control.dataset.tableObject === id && control.dataset.tableAction === previous.action,
        );
        if (usableFocusTarget(control ?? null)) return control;
      }
    }
    return heading.current;
  }
  function captureReturnFocus(opener: HTMLButtonElement) {
    const previous = {
      id: opener.dataset.tableObject ?? '',
      action: opener.dataset.tableAction ?? '',
      order: found.map((row) => row.object.id),
    };
    return () => {
      const target = usableFocusTarget(opener) ? opener : replacementFocus(previous);
      target?.focus({ preventScroll: true });
    };
  }
  useLayoutEffect(() => {
    if (page !== actualPage) setPage(actualPage);
    if (active && pageFocusRequested.current) {
      pageFocusRequested.current = false;
      resultRegion.current?.focus({ preventScroll: true });
      resultRegion.current?.scrollIntoView({ block: 'start' });
    }
    if (active && !wasActive.current) {
      const target =
        visited.current && usableFocusTarget(lastFocus.current)
          ? lastFocus.current
          : visited.current
            ? replacementFocus(lastRowFocus.current)
            : heading.current;
      target?.focus({ preventScroll: true });
      if (tableRegion.current) {
        tableRegion.current.scrollTop = scroll.current.top;
        tableRegion.current.scrollLeft = scroll.current.left;
      }
      if (root.current) root.current.scrollTop = outerScroll.current;
      visited.current = true;
      // A full-page return can change the surrounding toolbar after this layout.
      // Keep the remembered scroll whenever the focused control remains usable.
      const revealFocusedControl = () => {
        if (!target?.isConnected || document.activeElement !== target || !usableFocusTarget(target))
          return;
        const box = target.getBoundingClientRect();
        if (box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth)
          target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      };
      revealFocusedControl();
      returnFrame.current = requestAnimationFrame(() => {
        returnFrame.current = requestAnimationFrame(revealFocusedControl);
      });
    } else if (
      active &&
      !workDisabled &&
      lastFocus.current &&
      !usableFocusTarget(lastFocus.current) &&
      document.activeElement === document.body
    ) {
      replacementFocus(lastRowFocus.current)?.focus({ preventScroll: true });
    }
    wasActive.current = active;
  });
  useLayoutEffect(() => {
    if (!removalFocus || workDisabled) return;
    setRemovalFocus(null);
    if (
      active &&
      (document.activeElement === removalFocus.origin || document.activeElement === document.body)
    )
      removalFocus.restore();
  }, [active, workDisabled, removalFocus]);
  useLayoutEffect(() => {
    if (!active && returnFrame.current !== undefined) cancelAnimationFrame(returnFrame.current);
    return () => {
      if (returnFrame.current !== undefined) cancelAnimationFrame(returnFrame.current);
    };
  }, [active]);
  function changeSort(column: 'name' | 'type') {
    setSort(sort === `${column}-asc` ? `${column}-desc` : `${column}-asc`);
  }
  function changePage(next: number) {
    pageFocusRequested.current = true;
    setPage(next);
    scroll.current.top = 0;
    if (tableRegion.current) tableRegion.current.scrollTop = 0;
  }
  return (
    <section
      ref={root}
      className="household-table"
      hidden={!active}
      aria-label="Hushållets tabell"
      onScroll={(event) => {
        if (active) outerScroll.current = event.currentTarget.scrollTop;
      }}
      onFocusCapture={(event) => {
        if (!event.target.closest('dialog')) {
          lastFocus.current = event.target;
          if (event.target.dataset.tableObject && event.target.dataset.tableAction)
            lastRowFocus.current = {
              id: event.target.dataset.tableObject,
              action: event.target.dataset.tableAction,
              order: found.map((row) => row.object.id),
            };
          else lastRowFocus.current = null;
        }
      }}
    >
      <header className="household-table-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {householdName}
          </h1>
          <span>Sparade uppgifter och ditt utkast</span>
        </div>
      </header>
      {statusContent}
      {!mapAvailable && (
        <p>
          Kartans grafik är inte tillgänglig. Du kan läsa och arbeta med alla uppgifter här i
          tabellen.
        </p>
      )}
      <div className="household-table-search">
        {searchContent}
        <ObjectSearch
          active={active}
          search={search}
          onChange={(next) => {
            setSearch(next);
            setPage(0);
          }}
          types={types}
          selectedIds={selectedIds}
          hasProposals={hasProposals}
          matchingCount={found.length}
          table
        />
        <div className="household-table-actions">
          {actionContent}
          {onNew && (
            <button type="button" className="primary" disabled={workDisabled} onClick={onNew}>
              ＋ Nytt objekt
            </button>
          )}
        </div>
      </div>
      <section
        ref={resultRegion}
        tabIndex={-1}
        className="household-table-results"
        aria-label="Objekt i läsläge"
      >
        <div className="household-table-result-heading">
          <p role="status">{active ? notice : ''}</p>
        </div>
        <section
          className="household-table-scroll"
          ref={tableRegion}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll C's wide table.
          tabIndex={0}
          aria-label="Rullbar objekttabell"
          onScroll={(event) => {
            if (active)
              scroll.current = {
                top: event.currentTarget.scrollTop,
                left: event.currentTarget.scrollLeft,
              };
          }}
        >
          <table>
            <caption className="visually-hidden">
              Hushållets objekt. Expandera en rad för alla uppgifter.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={
                    sort.startsWith('name') ? (descending ? 'descending' : 'ascending') : 'none'
                  }
                >
                  <button
                    type="button"
                    className="household-table-sort"
                    title={`Sortera namn ${sort === 'name-asc' ? 'fallande' : 'stigande'}`}
                    onClick={() => changeSort('name')}
                  >
                    Namn
                    <SortIcon active={sort.startsWith('name')} descending={descending} />
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sort.startsWith('type') ? (descending ? 'descending' : 'ascending') : 'none'
                  }
                >
                  <button
                    type="button"
                    className="household-table-sort"
                    title={`Sortera typ ${sort === 'type-asc' ? 'fallande' : 'stigande'}`}
                    onClick={() => changeSort('type')}
                  >
                    Typ
                    <SortIcon active={sort.startsWith('type')} descending={descending} />
                  </button>
                </th>
                <th scope="col">Status</th>
                <th scope="col">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const { object } = row;
                const opened = expanded.includes(object.id);
                const reasons = objectSearchMatch(
                  object,
                  row.type,
                  search.query,
                  row.before,
                  row.beforeType,
                ).reasons;
                return (
                  <Fragment key={object.id}>
                    <tr data-selected={selectedIds.includes(object.id)}>
                      <th scope="row">
                        <button
                          type="button"
                          className="household-table-row-toggle"
                          data-table-object={object.id}
                          data-table-action="expand"
                          aria-expanded={opened}
                          aria-controls={`${prefix}-details-${object.id}`}
                          onClick={() => {
                            onSelect(object);
                            setExpanded((old) =>
                              opened ? old.filter((id) => id !== object.id) : [...old, object.id],
                            );
                          }}
                        >
                          <span aria-hidden="true">{opened ? '▾' : '▸'}</span>
                          {object.name}
                        </button>
                        {selectedIds.includes(object.id) && (
                          <span className="household-table-selection">✓ Markerad</span>
                        )}
                        {reasons.length > 0 && (
                          <span className="object-search-reason">Träff i {reasons.join(', ')}</span>
                        )}
                      </th>
                      <td>{row.type?.name ?? 'Borttagen typ'}</td>
                      <td>
                        <span>
                          {row.removed ? 'Borttaget' : hasEnded(object) ? 'Upphört' : 'Aktuellt'}
                        </span>
                        {row.proposal && (
                          <span className="household-table-badge" data-kind={row.proposal}>
                            ◇ {row.proposal}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="household-table-row-actions">
                          {onEdit && !row.removed && (
                            <button
                              type="button"
                              aria-label={`Redigera ${object.name}`}
                              title="Redigera"
                              data-table-object={object.id}
                              data-table-action="edit"
                              disabled={workDisabled}
                              onClick={(event) =>
                                onEdit(object, captureReturnFocus(event.currentTarget))
                              }
                            >
                              <WorkspaceIcon name="edit" />
                            </button>
                          )}
                          {onRelationships && (
                            <button
                              type="button"
                              aria-label={`Samband för ${object.name}`}
                              title={`Samband för ${object.name}`}
                              data-table-object={object.id}
                              data-table-action="relationships"
                              aria-describedby={`${prefix}-relationship-count-${object.id}`}
                              onClick={(event) =>
                                onRelationships(object, captureReturnFocus(event.currentTarget))
                              }
                            >
                              <WorkspaceIcon name="relationships" />
                              <span id={`${prefix}-relationship-count-${object.id}`}>
                                {relationshipCounts?.get(object.id) ?? 0} samband
                              </span>
                            </button>
                          )}
                          {onReveal && !row.removed && (
                            <button
                              type="button"
                              aria-label={`Visa ${object.name} i kartan`}
                              title="Visa objektet och dess direkta samband i kartan. Rensar kartans sökning och filter och tar med upphörda vid behov."
                              aria-describedby={`${prefix}-reveal-help`}
                              data-table-object={object.id}
                              data-table-action="reveal"
                              disabled={!mapAvailable || workDisabled}
                              onClick={() => onReveal(object)}
                            >
                              <WorkspaceIcon name="reveal" />
                            </button>
                          )}
                          {onFocusRelationships && !row.removed && (
                            <button
                              type="button"
                              aria-label={`Visa samband för ${object.name} i kartan`}
                              title="Visa objektets direkta samband i kartan. Behåller kartans sökning och filter, inklusive valet för upphörda."
                              aria-describedby={`${prefix}-context-help`}
                              data-table-object={object.id}
                              data-table-action="context"
                              disabled={!mapAvailable || workDisabled}
                              onClick={() => onFocusRelationships(object)}
                            >
                              <WorkspaceIcon name="connections" />
                            </button>
                          )}
                          {onRemove && !row.removed && (
                            <button
                              type="button"
                              className="household-table-remove"
                              aria-label={`Ta bort ${object.name}`}
                              title="Lägg objektet och dess samband som borttagningar i ditt utkast. Sparad karta ändras först när du sparar hela utkastet."
                              aria-describedby={
                                removalNotice ? `${prefix}-removal-${object.id}` : undefined
                              }
                              data-table-object={object.id}
                              data-table-action="remove"
                              disabled={workDisabled || row.proposal === 'Föreslagen borttagning'}
                              onClick={async (event) => {
                                const origin = event.currentTarget;
                                const restoreFocus = captureReturnFocus(origin);
                                await onRemove(object);
                                // Completion can precede React's enabled render.
                                setRemovalFocus({ origin, restore: restoreFocus });
                              }}
                            >
                              <WorkspaceIcon name="trash" />
                            </button>
                          )}
                        </div>
                        {onRemove && !row.removed && (
                          <div className="visually-hidden">
                            {removalNotice?.(object, `${prefix}-removal-${object.id}`)}
                          </div>
                        )}
                      </td>
                    </tr>
                    <tr
                      id={`${prefix}-details-${object.id}`}
                      className="household-table-detail-row"
                      hidden={!opened}
                    >
                      <td colSpan={4}>
                        {opened && (
                          <section
                            className="household-table-inline-details"
                            aria-label={`Uppgifter för ${object.name}`}
                          >
                            <ObjectReadDetails row={row} full />
                          </section>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
        <nav className="household-table-pages" aria-label="Tabellsidor">
          <button
            type="button"
            disabled={actualPage === 0}
            onClick={() => changePage(actualPage - 1)}
          >
            Föregående
          </button>
          <span role="status">
            Sida {actualPage + 1} av {pages} · 50 objekt per sida
          </span>
          <button
            type="button"
            disabled={actualPage === pages - 1}
            onClick={() => changePage(actualPage + 1)}
          >
            Nästa
          </button>
        </nav>
      </section>
      <p id={`${prefix}-reveal-help`} className="visually-hidden">
        Visar objektet och dess direkta samband i kartan. Rensar kartans sökning och filter och tar
        med upphörda vid behov.
      </p>
      <p id={`${prefix}-context-help`} className="visually-hidden">
        Visar objektets direkta samband i kartan. Behåller kartans sökning och filter, inklusive
        valet för upphörda.
      </p>
    </section>
  );
}

function SortIcon({ active, descending }: { active: boolean; descending: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {active ? (
        <path d={descending ? 'M10 4v12m-4-4 4 4 4-4' : 'M10 16V4m-4 4 4-4 4 4'} />
      ) : (
        <path d="M6 16V4m-3 3 3-3 3 3m5-3v12m-3-3 3 3 3-3" />
      )}
    </svg>
  );
}
