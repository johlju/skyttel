import { useState } from 'react';
import { draftChangeCount, type MapDraft } from '../shared/map.js';
import {
  objectDifferences,
  relationshipDifferences,
  typeDifferences,
} from './DraftChangeSummary.js';
import { draftProposalDescriptors } from './draft-proposal-descriptors.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

export { draftChangeCount as draftCount } from '../shared/map.js';

const draftStatuses = {
  added: { symbol: '+', label: 'Läggs till' },
  changed: { symbol: '✎', label: 'Ändras' },
  removed: { symbol: '×', label: 'Tas bort' },
};

/** One row per proposal, including relationships and the household's own types. */
export function ConversationDraft({
  draft,
  onOpen,
  onRemove,
  warnings,
  blocked = false,
}: {
  draft?: MapDraft;
  onOpen?: (key: string) => void;
  onRemove?: (key: string) => void;
  warnings?: Record<string, string>;
  blocked?: boolean;
}) {
  const [hoverSuppressedKey, setHoverSuppressedKey] = useState<string>();

  function openProposal(key: string) {
    setHoverSuppressedKey(key);
    onOpen?.(key);
  }

  if (!draftChangeCount(draft) || !draft) return <p>Utkastet är tomt.</p>;
  const rows = draftProposalDescriptors(draft).map((proposal) => {
    const { before, after } = proposal.change;
    const action = after ? (before ? 'changed' : 'added') : 'removed';
    const differences =
      proposal.kind === 'Objekt'
        ? objectDifferences(proposal.change)
        : proposal.kind === 'Samband'
          ? relationshipDifferences(proposal.change)
          : proposal.change.before && proposal.change.after
            ? typeDifferences(proposal.change.before, proposal.change.after)
            : [];
    return {
      key: proposal.key,
      name: proposal.name,
      action,
      status: draftStatuses[action],
      type:
        proposal.kind === 'Objekt' || proposal.kind === 'Samband'
          ? proposal.change.type.name
          : proposal.kind,
      differences,
    };
  });
  return (
    <div className="conversation-draft-table">
      <table aria-label="Osparade ändringar">
        <thead>
          <tr>
            <th scope="col">Namn</th>
            <th scope="col">Typ</th>
            <th scope="col">Vad som ändras</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={onOpen ? 'draft-clickable-row' : undefined}
              data-hover-suppressed={row.key === hoverSuppressedKey || undefined}
              onPointerMove={
                row.key === hoverSuppressedKey ? () => setHoverSuppressedKey(undefined) : undefined
              }
              onClick={
                onOpen
                  ? (event) => {
                      if (!(event.target as HTMLElement).closest('button')) openProposal(row.key);
                    }
                  : undefined
              }
            >
              <th scope="row">
                {onOpen ? (
                  <button
                    type="button"
                    id={`draft-read-${row.key}`}
                    className="draft-open-proposal"
                    aria-label={`Visa förslaget: ${row.name}`}
                    aria-haspopup="dialog"
                    onClick={() => openProposal(row.key)}
                  >
                    {row.name}
                  </button>
                ) : (
                  row.name
                )}
              </th>
              <td>{row.type}</td>
              <td>
                <div className="draft-change">
                  <div className="draft-change-details">
                    <span
                      className="conversation-draft-symbol"
                      data-action={row.action}
                      aria-hidden="true"
                    >
                      {row.status.symbol}
                    </span>
                    <div>
                      {row.differences.length ? (
                        <>
                          <span className="visually-hidden">{row.status.label}</span>
                          {row.differences.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </>
                      ) : (
                        row.status.label
                      )}
                    </div>
                  </div>
                  {onOpen && (
                    <button
                      type="button"
                      id={`draft-remove-${row.key}`}
                      className="draft-icon draft-remove"
                      disabled={blocked || !onRemove}
                      title={`Ta bort förslaget: ${row.name}`}
                      aria-label={`Ta bort förslaget: ${row.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove?.(row.key);
                      }}
                    >
                      <WorkspaceIcon name="trash" />
                    </button>
                  )}
                </div>
                {warnings?.[row.key] && (
                  <p className="draft-row-warning">
                    <WorkspaceIcon name="warning" />
                    {warnings[row.key]}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
