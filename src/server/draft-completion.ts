import { hasEnded } from '../shared/lifecycle.js';
import { objectIconLabel } from '../shared/object-icons.js';
import { type Property, propertyKindLabels } from '../shared/properties.js';
import type { TextAssistantChange, TextAssistantReview } from '../shared/text-assistant.js';

/** Plain-language statements from checked changes, never from provider success claims. */
export function draftUpdateDetails(before: TextAssistantReview, after: TextAssistantReview) {
  const changes: TextAssistantChange[] = [];
  const say = (subject: string, action: string) => changes.push({ subject, action });
  const properties = (subject: string, old: Property[] = [], next: Property[] = []) => {
    for (const property of next) {
      const previous = old.find(({ id }) => id === property.id);
      if (JSON.stringify(previous) === JSON.stringify(property)) continue;
      const value = 'value' in property ? property.value : undefined;
      const name = `${property.label} för ${subject}`;
      if (value === undefined) say(name, previous ? 'tömdes' : 'lades till utan värde');
      else
        say(
          name,
          `sattes till ${value === '' ? 'tom text' : value === true ? 'ja' : value === false ? 'nej' : value}`,
        );
      if (previous && previous.kind !== property.kind && property.kind)
        say(name, `fick datatypen ${propertyKindLabels[property.kind]}`);
    }
    for (const property of old)
      if (!next.some(({ id }) => id === property.id))
        say(`${property.label} för ${subject}`, 'togs bort');
  };
  for (const change of after.changes) {
    const previous = before.changes.find(({ id }) => id === change.id);
    if (JSON.stringify(previous) === JSON.stringify(change)) continue;
    const old = previous ? previous.after : change.before;
    const next = change.after;
    const name = next?.name ?? old?.name;
    if (!name) continue;
    if (!old && next) say(name, 'lades till');
    else if (old && !next) say(name, 'togs bort');
    if (!next) continue;
    if (old && old.name !== next.name) say(old.name, `bytte namn till ${next.name}`);
    if (old && old.typeId !== next.typeId) say(name, `ändrades till typen ${change.type.name}`);
    properties(name, old?.properties, next.properties);
    if (hasEnded(old ?? {}) !== hasEnded(next))
      say(`Status för ${name}`, `ändrades till ${hasEnded(next) ? 'upphört' : 'aktuellt'}`);
    if (old?.identity !== next.identity)
      say(
        `Identiteten för ${name}`,
        next.identity === 'unresolved'
          ? 'markerades som olöst'
          : next.identity === 'unspecified'
            ? 'lämnades ospecificerad'
            : 'bekräftades',
      );
    if (old?.iconId !== next.iconId)
      say(`Ikonen för ${name}`, `ändrades till ${objectIconLabel(next.iconId, change.type.name)}`);
    if (old?.profileImageId !== next.profileImageId)
      say(`Profilbilden för ${name}`, next.profileImageId ? 'uppdaterades' : 'togs bort');
  }
  for (const change of after.relationships ?? []) {
    const previous = before.relationships?.find(({ id }) => id === change.id);
    if (JSON.stringify(previous) === JSON.stringify(change)) continue;
    const old = previous ? previous.after : change.before;
    const next = change.after;
    const edge = next ?? old;
    if (!edge) continue;
    const name = (id: string) => {
      const object = after.changes.find((item) => item.id === id);
      return object?.after?.name ?? object?.before?.name ?? change.objectNames?.[id] ?? 'objektet';
    };
    const source = name(edge.sourceId);
    const target = name(edge.targetId);
    const label = change.type.forwardLabel ?? change.type.name;
    const subject = `Sambandet ”${source} ${label} ${target}”`;
    if (!old && next)
      say(
        source,
        change.type.forwardLabel
          ? `${label[0].toLocaleLowerCase('sv')}${label.slice(1)} ${target}`
          : `fick sambandet ”${change.type.name}” till ${target}`,
      );
    else if (old && !next) say(subject, 'togs bort');
    else if (
      old?.sourceId !== next?.sourceId ||
      old?.targetId !== next?.targetId ||
      old?.typeId !== next?.typeId
    )
      say(subject, 'uppdaterades');
    if (next) {
      properties(subject, old?.properties, next.properties);
      if (hasEnded(old ?? {}) !== hasEnded(next))
        say(
          `Status för sambandet ”${source} ${label} ${target}”`,
          `ändrades till ${hasEnded(next) ? 'upphört' : 'aktuellt'}`,
        );
    }
  }
  for (const [old, next, kind] of [
    [before.objectTypes, after.objectTypes, 'Objekttypen'],
    [before.relationshipTypes, after.relationshipTypes, 'Sambandstypen'],
  ] as const)
    for (const change of next ?? []) {
      const previous = old?.find(({ id }) => id === change.id);
      if (JSON.stringify(previous) === JSON.stringify(change)) continue;
      say(
        `${kind} ${change.after?.name ?? change.before?.name}`,
        !change.after
          ? 'togs bort'
          : !(previous ? previous.after : change.before)
            ? 'lades till'
            : 'uppdaterades',
      );
    }
  for (const [old, next] of [
    [before.changes, after.changes],
    [before.objectTypes, after.objectTypes],
    [before.relationshipTypes, after.relationshipTypes],
  ] as const)
    for (const item of old ?? [])
      if (!next?.some(({ id }) => id === item.id))
        say(`Förslaget om ${item.after?.name ?? item.before?.name}`, 'togs bort ur utkastet');
  for (const item of before.relationships ?? [])
    if (!after.relationships?.some(({ id }) => id === item.id)) {
      const edge = item.after ?? item.before;
      if (edge)
        say(
          `Förslaget om sambandet ”${item.objectNames?.[edge.sourceId] ?? 'objektet'} ${item.type.forwardLabel ?? item.type.name} ${item.objectNames?.[edge.targetId] ?? 'objektet'}”`,
          'togs bort ur utkastet',
        );
    }
  return changes;
}
