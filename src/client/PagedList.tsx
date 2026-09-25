import { type ReactNode, useId, useState } from 'react';

export function PagedList<T extends { id: string }>({
  label,
  items,
  selectedId,
  renderItem,
  className,
}: {
  label: string;
  items: T[];
  selectedId?: string;
  renderItem: (item: T) => ReactNode;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const pageId = useId();
  const pages = Math.ceil(items.length / 50);
  const current = Math.min(page, Math.max(0, pages - 1));
  const selectedPage = Math.floor(items.findIndex((item) => item.id === selectedId) / 50);
  return (
    <>
      {pages > 1 && (
        <nav aria-label={`Bläddra bland ${label.toLocaleLowerCase('sv')}`}>
          <p aria-live="polite">
            {label} {current * 50 + 1}–{Math.min((current + 1) * 50, items.length)} av{' '}
            {items.length}
          </p>
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Föregående sida
          </button>
          <label htmlFor={pageId}>Sida för {label.toLocaleLowerCase('sv')}</label>
          <select
            id={pageId}
            value={current + 1}
            onChange={(event) => setPage(Number(event.target.value) - 1)}
          >
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Nästa sida
          </button>
          {selectedPage >= 0 && selectedPage !== current && (
            <button type="button" onClick={() => setPage(selectedPage)}>
              Visa valt innehåll i listan
            </button>
          )}
        </nav>
      )}
      <ul aria-label={label} className={className}>
        {items.slice(current * 50, (current + 1) * 50).map(renderItem)}
      </ul>
    </>
  );
}
