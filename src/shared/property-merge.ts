import type { Property } from './properties.js';

export function sameProperty(left?: Property, right?: Property) {
  return (
    left?.id === right?.id &&
    left?.label === right?.label &&
    left?.kind === right?.kind &&
    (left && 'value' in left ? left.value : undefined) ===
      (right && 'value' in right ? right.value : undefined)
  );
}

export function propertyMergeSide(before?: Property, saved?: Property, proposed?: Property) {
  return sameProperty(saved, proposed) || sameProperty(before, proposed)
    ? ('saved' as const)
    : sameProperty(before, saved)
      ? ('proposed' as const)
      : undefined;
}

export function propertyOrderSide(before: string[], saved: string[], proposed: string[]) {
  // Only identities present on both sides can express contradictory positions.
  const common = new Set(saved.filter((id) => proposed.includes(id)));
  const sequence = (ids: string[]) => ids.filter((id) => common.has(id)).join(',');
  return sequence(saved) === sequence(proposed) || sequence(before) === sequence(proposed)
    ? ('saved' as const)
    : sequence(before) === sequence(saved)
      ? ('proposed' as const)
      : undefined;
}

/** Keep the selected spine; additions in the same gap have a stable identity order. */
export function mergedPropertyOrder(
  before: string[],
  saved: string[],
  proposed: string[],
  ids: string[],
  side: 'saved' | 'proposed',
) {
  const selected = side === 'saved' ? saved : proposed;
  const other = side === 'saved' ? proposed : saved;
  const spineIds = new Set([...before, ...saved.filter((id) => proposed.includes(id))]);
  const spine = selected.filter((id) => spineIds.has(id) && ids.includes(id));
  // A property restored by a delete/edit choice may be absent from the selected order.
  for (const id of other.filter(
    (id) => spineIds.has(id) && ids.includes(id) && !spine.includes(id),
  )) {
    const next = other.slice(other.indexOf(id) + 1).find((candidate) => spine.includes(candidate));
    spine.splice(next ? spine.indexOf(next) : spine.length, 0, id);
  }
  const buckets = new Map<string | undefined, string[]>();
  for (const id of ids.filter((id) => !spine.includes(id))) {
    const source = saved.includes(id) ? saved : proposed;
    const next = source
      .slice(source.indexOf(id) + 1)
      .find((candidate) => spine.includes(candidate));
    const bucket = buckets.get(next) ?? [];
    bucket.push(id);
    buckets.set(next, bucket);
  }
  // Within one author's additions, retain their explicit relative order. Across
  // authors, ready identities sort consistently regardless of who saved first.
  const ordered = (bucket: string[]) => {
    const members = new Set(bucket);
    const queues = [saved, proposed].map((source) => source.filter((id) => members.has(id)));
    const result: string[] = [];
    while (queues.some((queue) => queue.length)) {
      const next = queues.flatMap((queue) => (queue.length ? [queue[0]] : [])).sort()[0];
      result.push(next);
      for (const queue of queues) if (queue[0] === next) queue.shift();
    }
    return result;
  };
  return [
    ...spine.flatMap((id) => [...ordered(buckets.get(id) ?? []), id]),
    ...ordered(buckets.get(undefined) ?? []),
  ];
}

/** Legacy whole-proposal rebasing still retains independent saved properties. */
export function resolvedProperties(
  before: Property[] = [],
  saved: Property[] = [],
  proposed: Property[] = [],
) {
  const ids = [...new Set([...before, ...saved, ...proposed].map(({ id }) => id))];
  const [previousValues, savedValues, proposedValues] = [before, saved, proposed].map(
    (properties) => new Map(properties.map((property) => [property.id, property])),
  );
  const values = new Map(
    ids.flatMap((id) => {
      const previous = previousValues.get(id);
      const current = savedValues.get(id);
      const after = proposedValues.get(id);
      const value = propertyMergeSide(previous, current, after) === 'saved' ? current : after;
      return value ? [[id, value] as const] : [];
    }),
  );
  const order = [before, saved, proposed].map((properties) => properties.map(({ id }) => id));
  return mergedPropertyOrder(
    order[0],
    order[1],
    order[2],
    [...values.keys()],
    propertyOrderSide(...(order as [string[], string[], string[]])) ?? 'proposed',
  ).flatMap((id) => {
    const value = values.get(id);
    return value ? [value] : [];
  });
}
