import type { PrivateConflictEffect } from './conflict-effects.js';
import type { ConflictChoices, ConflictProperty } from './conflict-properties.js';
import type { DraftConflict } from './draft-conflicts.js';
import type { MapDraft, MapState, ObjectValue } from './map.js';
import { propertyValueText } from './properties.js';

export const removalCombinationMessage =
  'Objektet kan inte tas bort medan sambandet till det finns kvar. Välj att ta bort sambandet eller behåll objektet.';

export function conflictRemovalProperties(
  state: MapState,
  conflict: DraftConflict,
): ConflictProperty[] {
  if (conflict.kind === 'relationship' && conflict.current) {
    const change = state.draft.relationships?.find((change) => change.id === conflict.id);
    return [
      {
        key: 'relationship',
        label: 'Samband',
        before: change?.before,
        saved: conflict.current,
        proposed: 'Föreslagen borttagning',
      },
    ];
  }
  if (conflict.kind !== 'object' || !conflict.current) return [];
  const change = state.draft.changes.find((change) => change.id === conflict.id);
  const record = (value: Pick<ObjectValue, 'name' | 'properties'> | null) =>
    value
      ? [
          value.name,
          ...(value.properties ?? []).map(
            (property) => `${property.label}: ${propertyValueText(property)}`,
          ),
        ].join(' · ')
      : 'Borttaget';
  return [
    {
      key: 'object',
      label: 'Objekt',
      before: change?.before && 'name' in change.before ? record(change.before) : undefined,
      saved: record(conflict.current),
      proposed: 'Föreslagen borttagning',
    },
    ...(conflict.connections ?? []).map((edge) => {
      const type = state.relationshipTypes.find((type) => type.id === edge.typeId);
      const source =
        state.objects.find((object) => object.id === edge.sourceId)?.name ?? edge.sourceId;
      const target =
        state.objects.find((object) => object.id === edge.targetId)?.name ?? 'Ej uppgivet';
      return {
        key: `relationship:${edge.id}`,
        label: 'Samband',
        before: 'Inga',
        saved: `${source} ${type?.forwardLabel ?? type?.name ?? 'har samband med'} ${target}`,
        proposed: 'Föreslagen borttagning av sambandet',
      };
    }),
  ];
}
export function conflictRemovalError(
  state: MapState,
  conflict: DraftConflict,
  choices: ConflictChoices,
) {
  return choices.object === 'proposed' &&
    conflictRemovalProperties(state, conflict).some(
      (field) => field.key !== 'object' && choices[field.key] === 'saved',
    )
    ? removalCombinationMessage
    : '';
}
/** Explicit record and connection choices produce private proposals only. */
export function conflictRemovalPlan(
  state: MapState,
  conflict: DraftConflict,
  choices: ConflictChoices,
): { draft: MapDraft; effects: PrivateConflictEffect[] } | null {
  const fields = conflictRemovalProperties(state, conflict);
  if (
    !fields.length ||
    fields.some((field) => !choices[field.key]) ||
    Object.entries(choices).some(
      ([key, side]) =>
        !fields.some((field) => field.key === key) || (side !== 'saved' && side !== 'proposed'),
    ) ||
    conflictRemovalError(state, conflict, choices) ||
    !conflict.current
  )
    return null;
  const draft = structuredClone(state.draft);
  const effects: PrivateConflictEffect[] = [];
  if (conflict.kind === 'relationship') {
    const change = draft.relationships?.find((change) => change.id === conflict.id);
    if (!change || change.after) return null;
    if (choices.relationship === 'saved') {
      draft.relationships = draft.relationships?.filter((change) => change.id !== conflict.id);
      effects.push({ target: conflict, kind: 'discard' });
    } else {
      const type = state.relationshipTypes.find((type) => type.id === conflict.current?.typeId);
      if (!type) return null;
      change.before = conflict.current;
      change.type = type;
      change.beforeType = type;
      change.objectNames = Object.fromEntries(
        [conflict.current.sourceId, conflict.current.targetId].flatMap((id) => {
          if (!id) return [];
          const name =
            state.objects.find((object) => object.id === id)?.name ?? change.objectNames?.[id];
          return name === undefined ? [] : [[id, name]];
        }),
      );
      delete change.removedWithObjects;
      effects.push({ target: conflict, kind: 'retain', before: change.before, after: null });
    }
    return { draft, effects };
  }
  if (conflict.kind !== 'object') return null;
  const change = draft.changes.find((change) => change.id === conflict.id);
  if (!change || change.after) return null;
  if (choices.object === 'saved') {
    draft.changes = draft.changes.filter((change) => change.id !== conflict.id);
    effects.push({ target: conflict, kind: 'discard' });
  } else {
    change.before = conflict.current;
    const type = state.types.find((type) => type.id === conflict.current?.typeId);
    if (!type) return null;
    change.beforeType = type;
    change.type = type;
    effects.push({ target: conflict, kind: 'retain', before: change.before, after: change.after });
  }
  for (const edge of conflict.connections ?? []) {
    if (choices[`relationship:${edge.id}`] !== 'proposed') continue;
    const type = state.relationshipTypes.find((type) => type.id === edge.typeId);
    if (!type) return null;
    const removedWithObjects = draft.changes
      .filter(
        (change) => !change.after && (edge.sourceId === change.id || edge.targetId === change.id),
      )
      .map(({ id }) => id);
    draft.relationships = [
      ...(draft.relationships ?? []).filter((change) => change.id !== edge.id),
      {
        id: edge.id,
        before: edge,
        after: null,
        type,
        beforeType: type,
        proposedAt: new Date().toISOString(),
        objectNames: Object.fromEntries(state.objects.map((object) => [object.id, object.name])),
        ...(removedWithObjects.length ? { removedWithObjects } : {}),
      },
    ];
    effects.push({
      target: { kind: 'relationship', id: edge.id },
      kind: 'retain',
      before: edge,
      after: null,
    });
  }
  return { draft, effects };
}
