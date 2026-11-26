import type { ObjectValue } from '../../src/shared/map.js';
import type { PendingPart, TextAssistantReview } from '../../src/shared/text-assistant.js';
import {
  lastToolResult,
  type ModelRequest,
  modelMessage,
  modelTool,
  pendingUpdate,
} from './text-model.js';

export const bike = 'Alex blå cykel';
export const proposeBike = `Föreslå ${bike} av typen Fordon.`;
export const chooseBike = `Till utflykten väljer jag ${bike}. Fråga om låsets färg och cykelns märke.`;
export const colorQuestion = 'Vilken färg har låset?';
export const brandQuestion = 'Vilket märke har cykeln?';

function propose(
  draft: TextAssistantReview,
  id: string,
  value: ObjectValue,
  resolves: Pick<PendingPart, 'id' | 'revision'>[] = [],
) {
  return [
    modelTool('submit_changes', {
      version: draft.version,
      contentVersion: draft.contentVersion,
      completion: 'draft',
      resolves,
      operations: [{ name: 'propose_object', arguments: { id, baseRevision: null, value } }],
    }),
  ];
}

/** Controlled replies use only evidence supplied to the model on this turn. */
export function bikeDraftReply(request: ModelRequest) {
  const current = JSON.parse(
    String(request.input.findLast((item) => item.role === 'user')?.content),
  ) as {
    message: string;
    draft: TextAssistantReview;
    pendingParts: PendingPart[];
  };
  const { message, draft } = current;
  if (message === proposeBike) {
    const catalog = lastToolResult(request);
    if (!catalog?.types) return [modelTool('read_type_catalog', {})];
    const type = catalog.types.find(({ name }: { name: string }) => name === 'Fordon');
    return propose(draft, crypto.randomUUID(), { typeId: type.id, name: bike });
  }
  if (message === chooseBike)
    return [modelTool('ask_questions', { questions: [colorQuestion, brandQuestion] })];
  if (message === 'Vilken cykel väljer jag till utflykten?') {
    const choice = request.input
      .map(({ content }) =>
        typeof content === 'string'
          ? /Till utflykten väljer jag ([^.]+)\./u.exec(content)?.[1]
          : undefined,
      )
      .findLast(Boolean);
    return [
      modelMessage(choice ? `Till utflykten väljer du ${choice}.` : 'Vilken cykel menar du?'),
    ];
  }
  const change = draft.changes.find(({ after }) => after?.name === bike);
  if (message === 'Den har ett grönt lås.') {
    const ready: PendingPart | undefined = lastToolResult(request)?.pendingParts?.find(
      (part: PendingPart) => part.question === colorQuestion && part.status === 'ready',
    );
    if (!ready)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [pendingUpdate(request, colorQuestion)],
          continueResponse: true,
        }),
      ];
    if (!change?.after) throw new Error('Missing proposed bike');
    return propose(
      draft,
      change.id,
      {
        ...change.after,
        properties: [
          ...(change.after.properties ?? []),
          { id: 'lock-color', label: 'Låsfärg', kind: 'text', value: 'Grönt' },
        ],
      },
      [{ id: ready.id, revision: ready.revision }],
    );
  }
  if (message === 'Strunta i märket.')
    return [
      modelTool('ask_questions', {
        questions: [],
        updates: [pendingUpdate(request, brandQuestion, { action: 'withdraw' })],
      }),
    ];
  if (message === 'Vad ändrades i förslaget och vilken fråga återstår?') {
    const pending = current.pendingParts.filter(({ status }) => status === 'waiting');
    const color = change?.after?.properties?.find(({ label }) => label === 'Låsfärg');
    if (!change?.after || color?.kind !== 'text' || !color.value)
      return [modelMessage('Jag hittar ingen låsfärg i utkastet.')];
    const questions = pending.map(({ question }) => question).join(' ');
    return [
      modelMessage(
        `${change.after.name} har nu låsfärgen ${color.value.toLocaleLowerCase('sv')}. Kvar: ${questions}`,
      ),
    ];
  }
}
