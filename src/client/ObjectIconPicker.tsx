import { useId, useLayoutEffect, useRef, useState } from 'react';
import lucideLicense from '../shared/icon-assets/LICENSE-lucide.txt?url';
import { objectIconLabel, objectIcons, searchObjectIcons } from '../shared/object-icons.js';
import { ObjectIconGlyph } from './ObjectIconGlyph.js';
import './object-icons.css';

export function ObjectIconPicker({
  value,
  name,
  hasImage,
  disabled,
  needsText,
  onStageText,
  onChange,
}: {
  value?: string;
  name: string;
  hasImage: boolean;
  disabled: boolean;
  needsText: boolean;
  onStageText: () => Promise<boolean>;
  onChange: (id: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [requestedPage, setPage] = useState(0);
  const [proposalFocus, setProposalFocus] = useState<{
    origin: HTMLElement;
    target: HTMLElement;
  } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLFieldSetElement>(null);
  const pageFocus = useRef<number | null>(null);
  const matches = searchObjectIcons(query);
  const pages = Math.max(1, Math.ceil(matches.length / 24));
  const page = Math.min(requestedPage, pages - 1);
  const blocked = disabled || needsText;
  useLayoutEffect(() => {
    if (!proposalFocus || blocked) return;
    setProposalFocus(null);
    const { origin, target } = proposalFocus;
    if (
      (document.activeElement === origin || document.activeElement === document.body) &&
      target.isConnected &&
      !target.closest('[hidden], [inert], [aria-hidden="true"]') &&
      !target.matches(':disabled') &&
      getComputedStyle(target).visibility !== 'hidden' &&
      getComputedStyle(target).display !== 'none'
    )
      target.focus();
  }, [proposalFocus, blocked]);
  useLayoutEffect(() => {
    if (pageFocus.current !== page) return;
    pageFocus.current = null;
    results.current?.querySelector('button')?.focus();
  }, [page]);
  function changePage(next: number) {
    pageFocus.current = next;
    setPage(next);
  }
  return (
    <section className="object-icon-panel" aria-labelledby={`${id}-heading`}>
      <div className="object-icon-heading">
        <h3 id={`${id}-heading`}>Ikon</h3>
        <span>Valfritt</span>
      </div>
      <div className="object-icon-content">
        <div className="object-icon-selection">
          <div className="object-icon-selected-symbol">
            {value ? (
              <ObjectIconGlyph iconId={value} />
            ) : (
              <span className="object-icon-default-symbol" aria-hidden="true" />
            )}
          </div>
          <div className="object-icon-selected-name">
            <strong>{objectIconLabel(value)}</strong>
          </div>
        </div>
        <p className="object-icon-help">
          {hasImage
            ? 'Profilbilden visas i kartan och listan. Ikonen finns kvar och visas när objektet saknar profilbild.'
            : 'Ikonen visas i kartan och listan. Om du lägger till en profilbild visas bilden i stället.'}
        </p>
        <p className="object-icon-help">
          Alla ikoner kan användas för alla objekt. Ett ikonval blir direkt ett privat förslag.
          Spara hela utkastet för att dela det med hushållet.
        </p>
        {needsText && (
          <div className="object-icon-stage-text">
            <p>
              Lägg först objektet och dina oskickade uppgifter i utkastet. Sedan kan du ändra
              ikonen.
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={async (event) => {
                const trigger = event.currentTarget;
                if ((await onStageText()) && search.current)
                  setProposalFocus({ origin: trigger, target: search.current });
              }}
            >
              Lägg uppgifterna i utkastet först
            </button>
          </div>
        )}
        <label className="object-icon-search" htmlFor={`${id}-query`}>
          Sök ikon
          <input
            ref={search}
            id={`${id}-query`}
            type="search"
            value={query}
            placeholder="Till exempel cykel, musik eller bike"
            disabled={blocked}
            aria-controls={`${id}-results`}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <p className="object-icon-help" id={`${id}-hint`}>
          Sök bland {objectIcons.length.toLocaleString('sv')} ikoner med engelska namn eller vanliga
          svenska sökord.
        </p>
        {query && (
          <button
            className="object-icon-clear"
            type="button"
            disabled={blocked}
            onClick={() => {
              setQuery('');
              setPage(0);
              search.current?.focus();
            }}
          >
            Rensa sökningen
          </button>
        )}
        <div id={`${id}-results`}>
          <button
            className="object-icon-default-choice"
            type="button"
            disabled={blocked}
            aria-pressed={!value}
            onClick={async (event) => {
              const trigger = event.currentTarget;
              if (value && (await onChange(null)))
                setProposalFocus({ origin: trigger, target: trigger });
            }}
          >
            <span className="object-icon-default-symbol" aria-hidden="true" />
            <span>Typens standardikon</span>
            {!value && <span aria-hidden="true">✓</span>}
          </button>
          <p className="object-icon-result-count" aria-live="polite">
            {matches.length
              ? `${matches.length.toLocaleString('sv')} ikoner · visar ${page * 24 + 1}–${Math.min((page + 1) * 24, matches.length)}`
              : `Inga ikoner matchar ”${query}”. Prova ett annat sökord eller rensa sökningen.`}
          </p>
          <fieldset
            className="object-icon-grid"
            aria-label={`Välj ikon för ${name || 'objektet'}`}
            ref={results}
            disabled={blocked}
          >
            {matches.slice(page * 24, (page + 1) * 24).map((icon) => (
              <button
                type="button"
                key={icon.id}
                className="object-icon-choice"
                aria-label={`Välj ${icon.label}`}
                aria-pressed={value === icon.id}
                onClick={async (event) => {
                  const trigger = event.currentTarget;
                  if (value !== icon.id && (await onChange(icon.id)))
                    setProposalFocus({ origin: trigger, target: trigger });
                }}
              >
                <ObjectIconGlyph iconId={icon.id} className="object-icon-glyph" />
                <span>{icon.label}</span>
                {value === icon.id && (
                  <span className="object-icon-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </fieldset>
          {pages > 1 && (
            <nav className="object-icon-pages" aria-label="Bläddra bland ikoner">
              <button
                type="button"
                disabled={blocked || page === 0}
                onClick={() => changePage(page - 1)}
              >
                Föregående
              </button>
              <span>
                Sida {page + 1} av {pages}
              </span>
              <button
                type="button"
                disabled={blocked || page === pages - 1}
                onClick={() => changePage(page + 1)}
              >
                Nästa
              </button>
            </nav>
          )}
        </div>
        <p className="object-icon-help">
          <a href={lucideLicense}>Lucide 1.48.0 · Licens</a>
        </p>
      </div>
    </section>
  );
}
