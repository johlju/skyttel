import type { MapDraft } from '../shared/map.js';
import {
  objectDifferences,
  relationshipDifferences,
  typeDifferences,
} from './DraftChangeSummary.js';
import { relationshipDetails } from './relationship-description.js';

/** The same plus, pencil and cross as the map, with a textual action too. */
function symbol(before: unknown, after: unknown) {
  const action = after ? (before ? 'Ändra' : 'Lägg till') : 'Ta bort';
  return (
    <>
      <span aria-hidden="true">{after ? (before ? '✎' : '+') : '×'}</span>
      <span className="visually-hidden">{action}</span>
    </>
  );
}

export function draftCount(draft?: MapDraft) {
  return draft
    ? draft.changes.length +
        (draft.relationships?.length ?? 0) +
        (draft.objectTypes?.length ?? 0) +
        (draft.relationshipTypes?.length ?? 0)
    : 0;
}

/** One row per proposal, including relationships and the household's own types. */
export function ConversationDraft({ draft }: { draft?: MapDraft }) {
  if (!draftCount(draft) || !draft) return <p>Utkastet är tomt.</p>;
  const rows = [
    ...draft.changes.map((change) => ({
      ...change,
      key: `object-${change.id}`,
      name: change.after?.name ?? change.before?.name,
      type: change.type.name,
      differences: objectDifferences(change),
    })),
    ...(draft.relationships ?? []).map((change) => {
      const describe = (value: NonNullable<typeof change.after>) =>
        relationshipDetails(
          value,
          change.type.forwardLabel ?? change.type.name,
          change.objectNames,
        );
      const differences = relationshipDifferences(change);
      return {
        ...change,
        key: `relationship-${change.id}`,
        name: change.after
          ? describe(change.after)
          : change.before
            ? describe(change.before)
            : 'Samband',
        type: change.type.name,
        differences,
      };
    }),
    ...(
      [
        ['Objekttyp', draft.objectTypes],
        ['Sambandstyp', draft.relationshipTypes],
      ] as const
    ).flatMap(([type, changes]) =>
      (changes ?? []).map((change) => ({
        ...change,
        key: `${type}-${change.id}`,
        name: change.after?.name ?? change.before?.name,
        type,
        differences:
          change.before && change.after ? typeDifferences(change.before, change.after) : [],
      })),
    ),
  ];
  return (
    <div className="conversation-draft-table">
      <table aria-label="Osparade ändringar">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Namn</th>
            <th scope="col">Typ</th>
            <th scope="col">Vad som ändras</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{symbol(row.before, row.after)}</td>
              <th scope="row">{row.name}</th>
              <td>{row.type}</td>
              <td>
                {row.differences.length
                  ? row.differences.map((line) => <div key={line}>{line}</div>)
                  : row.after
                    ? row.before
                      ? 'Ändras'
                      : 'Läggs till'
                    : 'Tas bort'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
