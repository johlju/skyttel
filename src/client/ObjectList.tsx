import { type ReactNode, type RefObject, useId, useLayoutEffect, useRef } from 'react';
import type { MapObject, ObjectType } from '../shared/map.js';
import './object-list.css';

export type ObjectBrowsing = {
  query: string;
  types: string[];
  onlySelected: boolean;
  sort: 'name' | 'type';
  page: number;
  filtersOpen: boolean;
};

export const initialObjectBrowsing: ObjectBrowsing = {
  query: '',
  types: [],
  onlySelected: false,
  sort: 'name',
  page: 0,
  filtersOpen: false,
};

export function objectListResults(
  objects: MapObject[],
  types: ObjectType[],
  browsing: ObjectBrowsing,
  selectedIds: string[],
) {
  const names = new Map(types.map((type) => [type.id, type.name]));
  const query = browsing.query.trim().toLocaleLowerCase('sv');
  const matching = objects.filter(
    (object) =>
      (!browsing.onlySelected || selectedIds.includes(object.id)) &&
      [object.name, names.get(object.typeId) ?? '', object.description].some((value) =>
        value.toLocaleLowerCase('sv').includes(query),
      ),
  );
  const items = matching
    .filter((object) => !browsing.types.length || browsing.types.includes(object.typeId))
    .sort((a, b) => {
      const byName =
        a.name.localeCompare(b.name, 'sv', { numeric: true }) || a.id.localeCompare(b.id);
      return browsing.sort === 'type'
        ? (names.get(a.typeId) ?? '').localeCompare(names.get(b.typeId) ?? '', 'sv') || byName
        : byName;
    });
  return { matching, items };
}

export function ObjectList({
  objects,
  types,
  results,
  browsing,
  onBrowse,
  selectedIds,
  selectedId,
  onClearSelection,
  renderItem,
  active,
  mapAvailable,
  resumeFocus,
}: {
  objects: MapObject[];
  types: ObjectType[];
  results: ReturnType<typeof objectListResults>;
  browsing: ObjectBrowsing;
  onBrowse: (next: ObjectBrowsing) => void;
  selectedIds: string[];
  selectedId?: string;
  onClearSelection: () => void;
  renderItem: (object: MapObject) => ReactNode;
  active: boolean;
  mapAvailable: boolean;
  resumeFocus: RefObject<() => boolean>;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const focusResults = useRef(false);
  const scroll = useRef(0);
  const flowScroll = useRef(0);
  const listFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    resumeFocus.current = () => {
      const list = listRef.current;
      const body = list?.closest<HTMLElement>('.workspace-panel-body');
      const flow = body?.closest<HTMLElement>('.household-map');
      const target = listFocus.current;
      if (
        !body ||
        !flow ||
        !target?.isConnected ||
        !list?.contains(target) ||
        !target.offsetHeight ||
        target.closest('[hidden], [inert]') ||
        target.matches(':disabled')
      )
        return false;
      if (getComputedStyle(body).overflowY !== 'visible') {
        // Ordinary panel returns keep the panel owner's heading focus.
        body.scrollTop = scroll.current;
        return false;
      }
      flow.scrollTop = flowScroll.current;
      target.focus({ preventScroll: true });
      const bounds = target.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight)
        target.scrollIntoView({ block: 'nearest' });
      return true;
    };
    return () => {
      resumeFocus.current = () => false;
    };
  }, [resumeFocus]);
  useLayoutEffect(() => {
    const body = listRef.current?.closest<HTMLElement>('.workspace-panel-body');
    if (!body || !active) return;
    const flow = body.closest<HTMLElement>('.household-map');
    const remember = () => {
      if (!body.offsetHeight) return;
      scroll.current = body.scrollTop;
      if (flow && getComputedStyle(body).overflowY === 'visible')
        flowScroll.current = flow.scrollTop;
    };
    body.addEventListener('scroll', remember, { passive: true });
    flow?.addEventListener('scroll', remember, { passive: true });
    return () => {
      body.removeEventListener('scroll', remember);
      flow?.removeEventListener('scroll', remember);
    };
  }, [active]);
  const { matching, items } = results;
  const catalogue = [...types].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const pages = Math.max(1, Math.ceil(items.length / 50));
  const page = Math.min(browsing.page, pages - 1);
  const shown = items.slice(page * 50, (page + 1) * 50);
  const selectedPage = Math.floor(items.findIndex((object) => object.id === selectedId) / 50);
  useLayoutEffect(() => {
    if (page !== browsing.page) onBrowse({ ...browsing, page });
    if (!focusResults.current) return;
    focusResults.current = false;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: 'nearest' });
  });
  function filter(next: Partial<ObjectBrowsing>) {
    onBrowse({ ...browsing, ...next, page: 0 });
  }
  function showPage(next: number) {
    focusResults.current = true;
    onBrowse({ ...browsing, page: next });
  }
  return (
    <div
      className="object-browser"
      ref={listRef}
      onFocusCapture={(event) => {
        listFocus.current = event.target;
        // A visible inactive panel may have scrolled before its first click.
        const body = event.currentTarget.closest<HTMLElement>('.workspace-panel-body');
        if (body) scroll.current = body.scrollTop;
      }}
    >
      <label htmlFor={`${id}-search`}>
        Sök objekt
        <input
          id={`${id}-search`}
          type="search"
          value={browsing.query}
          placeholder="Namn, typ eller beskrivning"
          onChange={(event) => filter({ query: event.target.value })}
        />
      </label>
      <details
        className="object-list-filters"
        open={browsing.filtersOpen}
        onToggle={(event) => {
          if (browsing.filtersOpen !== event.currentTarget.open)
            onBrowse({ ...browsing, filtersOpen: event.currentTarget.open });
        }}
      >
        <summary>
          Filter
          {browsing.types.length > 0 &&
            ` · ${browsing.types.map((typeId) => types.find((type) => type.id === typeId)?.name ?? 'Borttagen typ').join(', ')}`}
          {browsing.onlySelected && ' · Bara markerade'}
        </summary>
        <fieldset>
          <legend>Objekttyper</legend>
          <p>Välj en eller flera typer. Utan val visas alla typer.</p>
          <button type="button" onClick={() => filter({ types: [] })}>
            Alla typer · {matching.length}
          </button>
          <div className="object-list-types">
            {catalogue.map((type) => (
              <label key={type.id} data-checked={browsing.types.includes(type.id)}>
                <input
                  type="checkbox"
                  aria-label={type.name}
                  checked={browsing.types.includes(type.id)}
                  onChange={() =>
                    filter({
                      types: browsing.types.includes(type.id)
                        ? browsing.types.filter((typeId) => typeId !== type.id)
                        : [...browsing.types, type.id],
                    })
                  }
                />
                <span>{type.name}</span>
                <b>{matching.filter((object) => object.typeId === type.id).length}</b>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="object-list-selected">
          <input
            type="checkbox"
            checked={browsing.onlySelected}
            onChange={(event) => filter({ onlySelected: event.target.checked })}
          />
          Bara markerade ({selectedIds.length})
        </label>
        <button
          type="button"
          onClick={() => {
            focusResults.current = true;
            onBrowse({ ...browsing, filtersOpen: false });
          }}
        >
          Visa {items.length} objekt
        </button>
      </details>
      <label className="object-list-sort" htmlFor={`${id}-sort`}>
        Sortering
        <select
          id={`${id}-sort`}
          value={browsing.sort}
          onChange={(event) => filter({ sort: event.target.value as ObjectBrowsing['sort'] })}
        >
          <option value="name">Namn, A–Ö</option>
          <option value="type">Typ, sedan namn</option>
        </select>
      </label>
      <div className="object-list-count" aria-live="polite" aria-atomic="true">
        <strong>
          {items.length} av {objects.length} objekt
        </strong>
        <span>{selectedIds.length} markerade</span>
      </div>
      <button type="button" onClick={onClearSelection}>
        Avmarkera alla
      </button>
      <p className="object-list-hint" aria-live="polite" aria-atomic="true">
        {mapAvailable
          ? 'Namnet visar objektet i kartan. Uppgifter öppnas i ett eget fönster.'
          : 'Kartan kan inte visas. Använd Uppgifter för att läsa och redigera objekten.'}
      </p>
      <section
        ref={resultRef}
        tabIndex={-1}
        aria-label="Sökträffar"
        className="object-list-results"
      >
        {!items.length && (
          <div className="object-list-empty">
            <h3>Inga objekt matchar</h3>
            <p>Prova ett annat sökord, välj alla typer eller visa även omarkerade objekt.</p>
            <button
              type="button"
              onClick={() => filter({ query: '', types: [], onlySelected: false })}
            >
              Rensa sökning och filter
            </button>
          </div>
        )}
        <ul aria-label="Objekt" className="object-list-groups">
          {catalogue
            .filter((type) => shown.some((object) => object.typeId === type.id))
            .map((type) => (
              <li key={type.id} role="presentation" className="object-list-group">
                <h3>
                  {type.name} · {items.filter((object) => object.typeId === type.id).length} träffar
                </h3>
                <ul aria-label={type.name}>
                  {shown.filter((object) => object.typeId === type.id).map(renderItem)}
                </ul>
              </li>
            ))}
        </ul>
      </section>
      {pages > 1 && (
        <nav className="object-list-pages" aria-label="Bläddra bland objekt">
          <p aria-live="polite">
            Objekt {page * 50 + 1}–{Math.min((page + 1) * 50, items.length)} av {items.length}
          </p>
          <button type="button" disabled={page === 0} onClick={() => showPage(page - 1)}>
            Föregående sida
          </button>
          <label htmlFor={`${id}-page`}>
            Sida för objekt
            <select
              id={`${id}-page`}
              value={page + 1}
              onChange={(event) => showPage(Number(event.target.value) - 1)}
            >
              {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={page === pages - 1} onClick={() => showPage(page + 1)}>
            Nästa sida
          </button>
          {selectedPage >= 0 && selectedPage !== page && (
            <button type="button" onClick={() => showPage(selectedPage)}>
              Visa valt innehåll i listan
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
