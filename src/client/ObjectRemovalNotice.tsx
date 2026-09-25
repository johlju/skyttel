import { type MapState, proposedRelationships } from '../shared/map.js';

export function ObjectRemovalNotice({
  state,
  objectId,
  id,
}: {
  state: MapState;
  objectId: string;
  id: string;
}) {
  const count = [
    ...proposedRelationships(state.relationships, state.draft.relationships).values(),
  ].filter((edge) => edge.sourceId === objectId || edge.targetId === objectId).length;
  return (
    <p id={id} className="muted">
      Objektet och dess {count} samband läggs som borttagningar i ditt utkast. Sparad karta ändras
      först när du sparar hela utkastet.
    </p>
  );
}
