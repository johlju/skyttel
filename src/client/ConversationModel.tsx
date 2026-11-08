import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  type ConversationModelChoice,
  conversationModels,
  reasoningEfforts,
  reasoningLabels,
  sameModelChoice,
} from '../shared/conversation-model.js';
import type { Conversation } from './use-conversation.js';
import './conversation-model.css';

/** Both entry points edit the same conversation; a dialog never starts model work. */
export function ConversationModel({
  conversation,
}: {
  conversation: Pick<Conversation, 'session'> & Partial<Pick<Conversation, 'configureModel'>>;
}) {
  const [dialog, setDialog] = useState<'reasoning' | 'model' | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const id = useId();
  const modal = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const choice = conversation.session?.modelChoice;
  useLayoutEffect(() => {
    if (!dialog) return;
    previous.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    const node = modal.current;
    node?.showModal();
    node?.querySelector<HTMLElement>('h2')?.focus();
    return () => {
      node?.close();
      if (previous.current?.isConnected) previous.current.focus();
      else trigger.current?.focus();
    };
  }, [dialog]);
  useLayoutEffect(() => {
    const shown = modal.current;
    // Selecting an enabled pair removes its recovery button after the save.
    if (shown?.open && !shown.contains(document.activeElement))
      shown.querySelector<HTMLElement>('h2')?.focus();
  });
  if (!choice || !conversation.configureModel) return null;
  const enabled = conversation.session?.enabledModelChoices ?? [];
  const available = (next: ConversationModelChoice) =>
    enabled.some((entry) => sameModelChoice(entry, next));
  const explicitChoices = enabled.filter(
    (entry) =>
      conversation.session?.modelChoiceUnavailable ||
      (!available({ ...choice, model: entry.model }) &&
        !available({ ...choice, effort: entry.effort })),
  );
  const modelName =
    conversationModels.find((entry) => entry.id === choice.model)?.name ?? choice.model;
  async function change(next: ConversationModelChoice) {
    if (pending) return;
    if (!available(next)) {
      setFeedback('Den kombinationen är inte aktiverad på installationen.');
      return;
    }
    setPending(true);
    setFeedback('');
    const saved = await conversation.configureModel?.(next);
    setFeedback(
      saved
        ? 'Valet är sparat. Det gäller när nästa begäran börjar behandlas.'
        : 'Valet kunde inte sparas. Försök igen.',
    );
    setPending(false);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="conversation-model-button"
        aria-label={`Modell och resonemang: ${modelName}, ${reasoningLabels[choice.effort]}`}
        title="Modell och resonemang"
        onClick={() => setDialog('reasoning')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M4 17h16M8 4v6M16 14v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <p className="conversation-model-announcement" role="status">
        {dialog ? '' : feedback}
      </p>
      {dialog && (
        <dialog
          ref={modal}
          className="conversation-model-dialog"
          aria-labelledby={`${id}-title`}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            setDialog(null);
          }}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDialog(null);
          }}
        >
          <h2 id={`${id}-title`} tabIndex={-1}>
            {dialog === 'reasoning' ? 'Resonemangsnivå' : 'Modellval'}
          </h2>
          {dialog === 'reasoning' ? (
            <>
              <button
                type="button"
                className="conversation-model-name"
                onClick={() => setDialog('model')}
              >
                {modelName}
              </button>
              <label htmlFor={`${id}-effort`}>
                Resonemangsnivå: {reasoningLabels[choice.effort]}
              </label>
              <input
                id={`${id}-effort`}
                type="range"
                min="0"
                max="2"
                step="1"
                value={reasoningEfforts.indexOf(choice.effort)}
                aria-valuetext={reasoningLabels[choice.effort]}
                aria-disabled={pending}
                onChange={(event) =>
                  void change({ ...choice, effort: reasoningEfforts[Number(event.target.value)] })
                }
              />
              <div className="conversation-reasoning-steps">
                {reasoningEfforts.map((effort) => (
                  <button
                    type="button"
                    key={effort}
                    aria-pressed={choice.effort === effort}
                    disabled={!available({ ...choice, effort })}
                    aria-disabled={pending}
                    onClick={() => void change({ ...choice, effort })}
                  >
                    {reasoningLabels[effort]}
                    {!available({ ...choice, effort }) && ' – inte aktiverad'}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <fieldset aria-busy={pending}>
              <legend>Välj modell</legend>
              {conversationModels.map((model) => (
                <label key={model.id}>
                  <input
                    type="radio"
                    name={`${id}-model`}
                    checked={choice.model === model.id}
                    disabled={!available({ ...choice, model: model.id })}
                    onChange={() => void change({ ...choice, model: model.id })}
                  />{' '}
                  {model.name}
                  {!available({ ...choice, model: model.id }) && ' – inte aktiverad för denna nivå'}
                </label>
              ))}
            </fieldset>
          )}
          {(conversation.session?.modelChoiceUnavailable || explicitChoices.length > 0) && (
            <div>
              {conversation.session?.modelChoiceUnavailable && (
                <p role="status">
                  Det sparade valet är inte aktiverat på installationen. Välj ett aktiverat
                  alternativ eller kontakta installationsansvarig. Valet behålls tills du ändrar
                  det.
                </p>
              )}
              {explicitChoices.length > 0 && (
                <p>Du kan också uttryckligen välja både modell och nivå tillsammans.</p>
              )}
              {explicitChoices.map((entry) => (
                <button
                  type="button"
                  key={`${entry.model}-${entry.effort}`}
                  aria-disabled={pending}
                  onClick={() => void change(entry)}
                >
                  Välj {conversationModels.find((model) => model.id === entry.model)?.name},{' '}
                  {reasoningLabels[entry.effort]}
                </button>
              ))}
            </div>
          )}
          <p>
            Valet gäller tolkning, arbete, kontroll av föreslagna ändringar och sammanfattning.
            GPT-Live 1 fortsätter att lyssna och tala.
          </p>
          <p>
            Pågående arbete behåller sitt val. Nästa begäran, även en köad, använder det nya valet.
            Ditt senaste uttryckliga val används i nya samtal i alla dina hushåll och på andra
            enheter.
          </p>
          <p>Aktiverade alternativ garanterar inte att installationens konto har åtkomst.</p>
          <p role="status">{feedback}</p>
          <button type="button" onClick={() => setDialog(null)}>
            Stäng
          </button>
        </dialog>
      )}
    </>
  );
}
