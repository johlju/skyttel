import type { TextAssistantView } from './text-assistant.js';

export const audioDeliveryNotice =
  'Ljudleveransen kan inte bekräftas. Hela svaret finns här som text. Mottagen text betyder inte att ljudet har spelats upp eller att svaret har lästs.';
export const deliveryFailureNotice =
  'Hela svaret kunde inte levereras. Redan lagrat arbete finns kvar i ditt utkast eller sparresultat. Ingen instruktion skickas igen automatiskt.';

export const deliverySaveStatus = {
  saved: 'Sparat. Hela utkastet finns i hushållets karta.',
  uncertain: 'Det är oklart om utkastet sparades. Kontrollera sparresultatet efter inloggning.',
  unconfirmed: 'Inget nytt sparande är bekräftat.',
};
export type DeliverySaveState = keyof typeof deliverySaveStatus;

export function assistantSaveState(view: TextAssistantView): DeliverySaveState {
  return view.receipt
    ? 'saved'
    : view.saving || view.phase === 'recovery'
      ? 'uncertain'
      : 'unconfirmed';
}

export type TaskDelivery = {
  taskId: string;
  deadline: number;
  state: 'waiting' | 'awaiting-receipt' | 'received' | 'failed';
  audio?: boolean;
  text?: string;
  saveState?: DeliverySaveState;
};

/** Freeze checked results, every question and conversation part together.
 * The model's words never supply the authoritative save status. */
export function completeAssistantText(view: TextAssistantView): string {
  const count =
    view.review.changes.length +
    (view.review.relationships?.length ?? 0) +
    (view.review.objectTypes?.length ?? 0) +
    (view.review.relationshipTypes?.length ?? 0);
  const parts = [
    view.requiredNotice,
    view.result?.message,
    view.saveCheck?.reply,
    view.displayedSelection
      ? `${view.displayedItem?.kind === 'relationship' ? 'Sambandet' : 'Objektet'} är markerat.`
      : undefined,
    view.displayedSelection && view.questionPending
      ? 'Markeringen är bekräftad i kartan.'
      : undefined,
    !view.receipt && !view.result
      ? `Utkast: ${count} ${count === 1 ? 'osparat förslag' : 'osparade förslag'}.`
      : undefined,
    view.reply,
    view.modelReply ? `Samtal (obekräftat): ${view.modelReply}` : undefined,
    ...(view.questions ?? []).filter(
      (question) => !view.modelReply?.includes(question) && !view.reply?.includes(question),
    ),
    deliverySaveStatus[assistantSaveState(view)],
  ];
  return [...new Set(parts.filter((part): part is string => Boolean(part?.trim())))].join('\n\n');
}
