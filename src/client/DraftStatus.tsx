import type { MapDraft, SaveOperation } from '../shared/map.js';
import { receiptMessage, rejectionMessage } from './SaveOperations.js';
import { ProposalSymbol } from './SpatialMap.js';

export function DraftStatus({
  draft,
  operation,
  saving,
  unknown,
  dirty,
  unresolved,
  conflicts,
  expanded,
  error,
  working,
  onRefresh,
  onRecover,
  pending,
  showSave,
  disabled,
  onSave,
  onDraft,
  onContinue,
}: {
  draft: MapDraft;
  operation?: SaveOperation;
  saving: boolean;
  unknown: boolean;
  dirty: boolean;
  unresolved: boolean;
  conflicts: boolean;
  expanded: boolean;
  error: string;
  working: boolean;
  pending: boolean;
  onRefresh: (origin: HTMLElement) => void;
  onRecover?: () => void;
  showSave: boolean;
  disabled: boolean;
  onSave: () => void;
  onDraft: () => void;
  onContinue: () => void;
}) {
  const count =
    draft.changes.length +
    (draft.relationships?.length ?? 0) +
    (draft.objectTypes?.length ?? 0) +
    (draft.relationshipTypes?.length ?? 0);
  const result = saving
    ? 'Väntar på sparkvitto'
    : unknown || operation?.status === 'pending'
      ? 'Sparutfall okänt'
      : operation?.status === 'succeeded'
        ? count > 0 && draft.version > operation.draftVersion
          ? 'Tidigare sparande · kvitto bekräftat'
          : 'Sparat · kvitto bekräftat'
        : operation?.status === 'rejected'
          ? 'Sparandet avvisades · inget sparat av försöket'
          : '';
  return (
    <div className="draft-status">
      <p className="draft-status-summary" aria-live="polite" aria-atomic="true">
        <strong>{count ? `${count} förslag · privat utkast` : 'Inga osparade förslag'}</strong>
        {result && <span>{result}</span>}
      </p>
      {working && <p>Hämtar aktuellt underlag…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {dirty && <p>Oskickad formulärtext finns kvar. Den ingår inte i utkastet.</p>}
      {unresolved && <p>Vilka objekt avses? Red ut obesvarade identiteter före sparande.</p>}
      {conflicts && <p>Utkastet har konflikter. Välj hur de ska lösas före ett nytt sparbesked.</p>}
      {unknown && <p>Kontrollera samma sparförsök innan du ändrar eller sparar mer.</p>}
      <div className="draft-status-actions">
        {onRecover && (
          <button type="button" disabled={pending} onClick={onRecover}>
            Hämta samma kvitto igen
          </button>
        )}
        {error && (
          <button
            type="button"
            disabled={pending}
            data-refresh-map
            onClick={(event) => onRefresh(event.currentTarget)}
          >
            Hämta aktuellt underlag
          </button>
        )}
        {dirty && unresolved && (
          <button type="button" onClick={onDraft}>
            Red ut identiteter i utkastet
          </button>
        )}
        {dirty ? (
          <button type="button" onClick={onContinue}>
            Fortsätt redigera
          </button>
        ) : unresolved || conflicts ? (
          <button type="button" onClick={onDraft}>
            {conflicts ? 'Lös konflikter i utkastet' : 'Red ut identiteter i utkastet'}
          </button>
        ) : showSave && count ? (
          <button type="button" className="primary" disabled={disabled} onClick={onSave}>
            Spara hela utkastet
          </button>
        ) : null}
        <button type="button" onClick={onDraft}>
          {count ? 'Visa hela utkastet' : 'Sparförsök och kvitton'}
        </button>
      </div>
      {expanded && operation && (
        <p className="draft-status-receipt">
          {operation.status === 'succeeded'
            ? receiptMessage(operation.receipt)
            : operation.status === 'rejected'
              ? rejectionMessage(operation.error)
              : `Sparförsök: ${operation.operationId}. Slutresultatet är inte bekräftat.`}
        </p>
      )}
      {count > 0 && (
        <section aria-label="Förslag i kartan" className="proposal-legend">
          <p>Privata förslag</p>
          <span>
            <ProposalSymbol change={{ before: null, after: true }} /> Föreslås läggas till
          </span>
          <span>
            <ProposalSymbol change={{ before: true, after: true }} /> Föreslås ändras
          </span>
          <span>
            <ProposalSymbol change={{ before: true, after: null }} /> Föreslås tas bort
          </span>
          <span className="proposal-previous">Tidigare samband är streckade</span>
          <span className="proposal-selection">Ring visar markering</span>
        </section>
      )}
    </div>
  );
}
