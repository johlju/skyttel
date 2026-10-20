import type {
  DraftRelationshipChange,
  MapDraft,
  MapObject,
  MapRelationship,
} from '../shared/map.js';

export type ProposalKind = 'existing' | 'added' | 'changed' | 'removed';

export function proposalKind(change?: { before: unknown; after: unknown }): ProposalKind {
  return change ? (!change.after ? 'removed' : !change.before ? 'added' : 'changed') : 'existing';
}

/** Directed endpoints, rather than type or properties, determine replacement geometry. */
function replacesConnection(change?: DraftRelationshipChange) {
  return Boolean(
    change?.before &&
      change.after &&
      (change.before.sourceId !== change.after.sourceId ||
        change.before.targetId !== change.after.targetId),
  );
}

/** The filtered graph representation shared by the renderer and its legend. */
export function mapConnections(
  draft: MapDraft,
  objects: Map<string, MapObject>,
  relationships: Map<string, MapRelationship>,
  previousIds?: ReadonlySet<string>,
) {
  const changes = new Map(
    (draft.relationships ?? [])
      .filter((change) => {
        const current = relationships.get(change.id);
        // A blocked endpoint move leaves the saved edge in the effective map.
        // Its retained proposal must not turn that edge into proposed geometry.
        return (
          !change.after ||
          !current ||
          (current.sourceId === change.after.sourceId && current.targetId === change.after.targetId)
        );
      })
      .map((change) => [change.id, change]),
  );
  const current = [...relationships.values()].map((edge) => ({
    edge,
    previous: false,
    kind: replacesConnection(changes.get(edge.id))
      ? ('added' as const)
      : proposalKind(changes.get(edge.id)),
  }));
  const previous = [...changes.values()].flatMap((change) =>
    replacesConnection(change) && change.before && (!previousIds || previousIds.has(change.id))
      ? [{ edge: change.before, previous: true, kind: 'removed' as const }]
      : [],
  );
  return [...current, ...previous].filter(
    ({ edge }) => objects.has(edge.sourceId) && (!edge.targetId || objects.has(edge.targetId)),
  );
}

export function mapLegendKinds(
  draft: MapDraft,
  objects: Map<string, MapObject>,
  relationships: Map<string, MapRelationship>,
  selectedIds: string[],
  previousIds?: ReadonlySet<string>,
) {
  const kinds = new Set<ProposalKind | 'selection' | 'connector'>();
  for (const change of draft.changes) {
    if (objects.has(change.id)) kinds.add(proposalKind(change));
  }
  const connections = mapConnections(draft, objects, relationships, previousIds);
  for (const { kind } of connections) if (kind !== 'existing') kinds.add(kind);
  if (selectedIds.some((id) => objects.has(id))) kinds.add('selection');
  // Every eligible name/relationship label has a dotted connector. Camera
  // movement and collision placement do not change the filtered inventory.
  if (objects.size || connections.length) kinds.add('connector');
  return kinds;
}
