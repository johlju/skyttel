import { type FinancialFact, financialFields } from '../shared/financial-facts.js';
import type {
  CustomField,
  MapDraft,
  ObjectType,
  ObjectValue,
  RelationshipType,
  RelationshipValue,
  SaveReceipt,
} from '../shared/map.js';
import type { TextAssistantResult, TextAssistantReview } from '../shared/text-assistant.js';

function fact(value: FinancialFact | undefined) {
  if (!value) return 'ej angivet';
  const text =
    value.knowledge === 'none'
      ? 'uttryckligen inget'
      : value.knowledge === 'unknown'
        ? 'okänt'
        : `${value.knowledge === 'uncertain' ? 'osäkert uppgivet: ' : ''}${value.value}`;
  return `${text}${value.reportedOn ? ` (${value.reportedOn})` : ''}`;
}

function lifecycle(value: RelationshipValue['lifecycle']) {
  return value === 'ended' ? 'upphört' : value === 'active' ? 'aktuellt' : 'ej angivet';
}

function identity(value: ObjectValue | null) {
  return !value
    ? 'ej angivet'
    : value.identity === 'unspecified'
      ? 'ospecificerat objekt'
      : value.identity === 'unresolved'
        ? 'olöst identitet'
        : 'identifierat';
}

function description(value: string | undefined) {
  return value === undefined ? 'ej angivet' : value || 'tom';
}

function customValue(value: string | number | boolean | undefined) {
  if (value === undefined) return 'ej angivet';
  if (typeof value === 'boolean') return value ? 'ja' : 'nej';
  return String(value) || 'tom';
}

function difference(label: string, before: string, after: string) {
  return before === after ? [] : [`${label}: ${before} → ${after}`];
}

function fieldDefinition(field: CustomField | undefined) {
  const kinds = { text: 'text', number: 'tal', date: 'datum', boolean: 'ja/nej' };
  return field
    ? `${field.name} (${kinds[field.kind]}): ${field.description || 'ingen beskrivning'}`
    : 'ej angivet';
}

function typeDetails(
  before: (ObjectType & RelationshipType) | null,
  after: (ObjectType & RelationshipType) | null,
) {
  const fields = [
    ...(before && after ? difference('namn', before.name, after.name) : []),
    ...difference('beskrivning', description(before?.description), description(after?.description)),
  ];
  for (const id of new Set(
    [...(before?.fields ?? []), ...(after?.fields ?? [])].map((field) => field.id),
  ))
    fields.push(
      ...difference(
        'Eget fält',
        fieldDefinition(before?.fields?.find((field) => field.id === id)),
        fieldDefinition(after?.fields?.find((field) => field.id === id)),
      ),
    );
  const oldOrder =
    before?.fields?.filter((field) => after?.fields?.some(({ id }) => id === field.id)) ?? [];
  const newOrder =
    after?.fields?.filter((field) => before?.fields?.some(({ id }) => id === field.id)) ?? [];
  if (JSON.stringify(oldOrder.map(({ id }) => id)) !== JSON.stringify(newOrder.map(({ id }) => id)))
    fields.push(
      ...difference(
        'Fältordning',
        oldOrder.map(({ name }) => name).join(', '),
        newOrder.map(({ name }) => name).join(', '),
      ),
    );
  for (const [key, label] of [
    ['forwardLabel', 'Framåtriktning'],
    ['reverseLabel', 'Omvänd riktning'],
  ] as const)
    fields.push(...difference(label, description(before?.[key]), description(after?.[key])));
  return fields;
}

/** These words describe actual tool records. Provider prose never enters here. */
function details(
  value: MapDraft | SaveReceipt,
  saved: boolean,
  current?: TextAssistantReview['current'],
) {
  const verb = (before: unknown, after: unknown) =>
    !before
      ? saved
        ? 'Lade till'
        : 'Lägg till'
      : !after
        ? saved
          ? 'Tog bort'
          : 'Ta bort'
        : saved
          ? 'Ändrade'
          : 'Ändra';
  const lines: string[] = [];
  for (const change of value.changes) {
    const name = change.after?.name ?? change.before?.name;
    const beforeType =
      change.beforeType ??
      value.objectTypes?.find((type) => type.before?.id === change.before?.typeId)?.before ??
      current?.types.find((type) => type.id === change.before?.typeId) ??
      (change.type.id === change.before?.typeId ? change.type : undefined);
    const fields: string[] = [];
    if (change.before?.typeId !== change.after?.typeId)
      fields.push(
        `objekttyp: ${change.before ? (beforeType?.name ?? 'okänd objekttyp') : 'ej angivet'} → ${change.after ? change.type.name : 'ej angivet'}`,
      );
    if (change.before && change.after)
      if (change.before.name !== change.after.name)
        fields.push(`namn: ${change.before.name} → ${change.after.name}`);
    if (change.before?.description !== change.after?.description)
      fields.push(
        `beskrivning: ${description(change.before?.description)} → ${description(change.after?.description)}`,
      );
    if (change.before?.lifecycle !== change.after?.lifecycle)
      fields.push(
        `Gäller: ${lifecycle(change.before?.lifecycle)} → ${lifecycle(change.after?.lifecycle)}`,
      );
    if (change.before?.identity !== change.after?.identity)
      fields.push(`Identitet: ${identity(change.before)} → ${identity(change.after)}`);
    if (change.before?.profileImageId !== change.after?.profileImageId)
      fields.push(
        `Profilbild: ${change.before?.profileImageId ? 'bild finns' : 'ingen bild'} → ${change.after?.profileImageId ? 'ny bild' : 'ingen bild'}`,
      );
    for (const { key, label } of financialFields) {
      const before = change.before?.financialFacts?.[key];
      const after = change.after?.financialFacts?.[key];
      if (JSON.stringify(before) !== JSON.stringify(after))
        fields.push(`${label}: ${fact(before)} → ${fact(after)}`);
    }
    for (const id of new Set([
      ...Object.keys(change.before?.customValues ?? {}),
      ...Object.keys(change.after?.customValues ?? {}),
    ])) {
      const before = change.before?.customValues?.[id];
      const after = change.after?.customValues?.[id];
      if (before !== after)
        fields.push(
          `${change.type.fields?.find((field) => field.id === id)?.name ?? beforeType?.fields?.find((field) => field.id === id)?.name ?? id}: ${customValue(before)} → ${customValue(after)}`,
        );
    }
    lines.push(
      `${verb(change.before, change.after)} ${name}${fields.length ? ` (${fields.join('; ')})` : ''}`,
    );
  }
  for (const change of value.relationships ?? []) {
    const edge = change.after ?? change.before;
    if (!edge) continue;
    const beforeType =
      ('beforeType' in change ? change.beforeType : undefined) ??
      value.relationshipTypes?.find((type) => type.before?.id === change.before?.typeId)?.before ??
      current?.relationshipTypes.find((type) => type.id === change.before?.typeId) ??
      (change.type.id === change.before?.typeId ? change.type : undefined);
    const describe = (
      relationship: RelationshipValue,
      type: RelationshipType | undefined,
      side: 'before' | 'after',
    ) => {
      const objectName = (id: string) => {
        const object = value.changes.find(
          (item) => ('id' in item ? item.id : (item.before?.id ?? item.after?.id)) === id,
        );
        return object?.[side]?.name ?? change.objectNames?.[id] ?? id;
      };
      const source = objectName(relationship.sourceId);
      const target = relationship.targetId
        ? objectName(relationship.targetId)
        : relationship.knowledge === 'none'
          ? 'uttryckligen ingen'
          : relationship.knowledge === 'unresolved'
            ? 'olöst identitet'
            : 'okänt';
      return `${source} ${type?.forwardLabel ?? type?.name ?? 'okänd sambandstyp'} ${target}${relationship.knowledge === 'uncertain' ? ' (osäkert uppgivet)' : ''}`;
    };
    const beforeDescription = change.before ? describe(change.before, beforeType, 'before') : '';
    const afterDescription = change.after
      ? describe(change.after, change.type, 'after')
      : beforeDescription;
    const description =
      beforeDescription && beforeDescription !== afterDescription
        ? `${beforeDescription} → ${afterDescription}`
        : afterDescription;
    const fields: string[] = [];
    if (change.before && change.after && change.before.typeId !== change.after.typeId)
      fields.push(`sambandstyp: ${beforeType?.name ?? 'okänd sambandstyp'} → ${change.type.name}`);
    if (change.before?.lifecycle !== change.after?.lifecycle)
      fields.push(
        `Gäller: ${lifecycle(change.before?.lifecycle)} → ${lifecycle(change.after?.lifecycle)}`,
      );
    if (JSON.stringify(change.before?.endDate) !== JSON.stringify(change.after?.endDate))
      fields.push(`Slutdatum: ${fact(change.before?.endDate)} → ${fact(change.after?.endDate)}`);
    lines.push(
      `${verb(change.before, change.after)} sambandet ${description}${fields.length ? ` (${fields.join('; ')})` : ''}`,
    );
  }
  for (const [kind, changes] of [
    ['objekttypen', value.objectTypes],
    ['sambandstypen', value.relationshipTypes],
  ] as const)
    for (const change of changes ?? []) {
      const fields = typeDetails(change.before, change.after);
      lines.push(
        `${verb(change.before, change.after)} ${kind} ${change.after?.name ?? change.before?.name}${fields.length ? ` (${fields.join('; ')})` : ''}`,
      );
    }
  return lines.join('. ');
}

export function draftResult(
  draft: MapDraft & Pick<TextAssistantReview, 'current'>,
): TextAssistantResult {
  const changes = details(draft, false, draft.current);
  return {
    kind: 'draft',
    message: changes ? `Utkast: ${changes}.` : 'Utkastet är tomt.',
  };
}

export function historyResult(receipt: SaveReceipt | undefined): TextAssistantResult {
  return {
    kind: 'history',
    message: receipt
      ? `Sparandet: ${details(receipt, true)}.`
      : 'Det finns inget tidigare sparande i hushållets historik.',
  };
}
