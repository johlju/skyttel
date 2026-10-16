import { type KeyboardEvent, useId } from 'react';
import type { MapObject, MapState } from '../shared/map.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

export type ObjectActionCallbacks = {
  onEdit: (object: MapObject) => void;
  onRead?: (object: MapObject) => void;
  onRelationships?: (object: MapObject) => void;
  onReveal?: (object: MapObject) => void;
  onFocus?: (id: string) => void;
  onFocusSelection?: () => void;
  onRemove?: (object: MapObject) => Promise<boolean> | undefined;
};

export function moveObjectActionFocus(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled')];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  const button = buttons[next];
  if (button) {
    button.focus({ preventScroll: true });
    // Native focus can leave a partially visible action clipped in compact readers.
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/** Shared object actions for the context toolbar and movable property windows. */
export function ObjectActionButtons({
  object,
  state,
  disabled,
  mapAvailable = true,
  contextual = false,
  removed = false,
  selectionAvailable = false,
  onEdit,
  onRead,
  onRelationships,
  onReveal,
  onFocus,
  onFocusSelection,
  onRemove,
}: ObjectActionCallbacks & {
  object: MapObject;
  state: MapState;
  disabled: boolean;
  mapAvailable?: boolean;
  contextual?: boolean;
  removed?: boolean;
  selectionAvailable?: boolean;
}) {
  const prefix = useId();
  const revealHelp = `Markera ${object.name} och rama in objektet och dess direkta grannar i kartan. Rensar kartans sökning och filter och tar med upphörda vid behov. Behåller kamerans riktning.`;
  const contextHelp = `Markera ${object.name}, visa dess direkta grannar och rama in dem i kartan. Behåller kartans sökning och filter, inklusive valet för upphörda, samt tidigare visat innehåll och kamerans riktning.`;
  const selectionHelp =
    'Rama in alla markerade objekt och deras direkta grannar genom att panorera och anpassa zoom. Behåller markeringen, kartans sökning och filter samt kamerans riktning. Kräver minst ett markerat objekt.';
  return (
    <>
      <button
        type="button"
        aria-label={contextual ? 'Redigera objekt' : `Redigera ${object.name}`}
        title={`Redigera ${object.name}. Öppnar objektets redigeringsformulär.`}
        disabled={disabled || removed}
        onClick={() => onEdit(object)}
      >
        <WorkspaceIcon name="edit" />
      </button>
      {onRead && (
        <button
          type="button"
          aria-label={`Visa uppgifter för ${object.name}`}
          title={`Visa alla detaljuppgifter för ${object.name}. Öppnar objektets uppgiftsfönster.`}
          onClick={() => onRead(object)}
        >
          <WorkspaceIcon name="detail" />
        </button>
      )}
      {onRelationships && (
        <button
          type="button"
          aria-label={`Samband för ${object.name}`}
          title={`Visa och hantera samband för ${object.name}. Öppnar sambandsformuläret.`}
          onClick={() => onRelationships(object)}
        >
          <WorkspaceIcon name="relationships" />
        </button>
      )}
      {onReveal && (
        <button
          type="button"
          aria-label="Visa i kartan"
          title={revealHelp}
          aria-describedby={`${prefix}-reveal`}
          disabled={disabled || !mapAvailable || removed}
          onClick={() => onReveal(object)}
        >
          <WorkspaceIcon name="reveal" />
        </button>
      )}
      {onFocus && (
        <button
          type="button"
          aria-label="Visa samband i kartan"
          title={contextHelp}
          aria-describedby={`${prefix}-context`}
          disabled={disabled || !mapAvailable || removed}
          onClick={() => onFocus(object.id)}
        >
          <WorkspaceIcon name="connections" />
        </button>
      )}
      {onFocusSelection && (
        <button
          type="button"
          aria-label="Fokusera markering"
          title={selectionHelp}
          aria-describedby={`${prefix}-selection`}
          disabled={!mapAvailable || !selectionAvailable}
          onClick={onFocusSelection}
        >
          <WorkspaceIcon name="focus" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={contextual ? 'Ta bort objekt' : `Ta bort ${object.name}`}
          title={`Ta bort ${object.name} och dess samband i ditt utkast. Sparad karta ändras först när du sparar hela utkastet.`}
          className="spatial-object-remove"
          aria-describedby={`${prefix}-removal`}
          disabled={
            disabled ||
            removed ||
            state.draft.changes.some((change) => change.id === object.id && !change.after)
          }
          onClick={() => void onRemove(object)}
        >
          <WorkspaceIcon name="trash" />
        </button>
      )}
      <span id={`${prefix}-reveal`} hidden>
        {revealHelp}
      </span>
      <span id={`${prefix}-context`} hidden>
        {contextHelp}
      </span>
      <span id={`${prefix}-selection`} hidden>
        {selectionHelp}
      </span>
      <div hidden>
        <ObjectRemovalNotice state={state} objectId={object.id} id={`${prefix}-removal`} />
      </div>
    </>
  );
}
