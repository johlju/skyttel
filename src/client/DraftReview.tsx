import { useId, useLayoutEffect, useRef, useState } from 'react';
import { draftConflicts } from '../shared/draft-conflicts.js';
import { draftProposalKey } from '../shared/draft-discard.js';
import {
  draftChangeCount,
  type MapState,
  proposedObjectTypes,
  proposedRelationshipTypes,
} from '../shared/map.js';
import { ConversationDraft } from './ConversationDraft.js';
import { DraftDiscardDialog } from './DraftDiscardDialog.js';
import { DraftProposalDetails, draftProposals } from './DraftProposalDetails.js';
import { draftProposalDescriptors } from './draft-proposal-descriptors.js';
import { trapDialogTab } from './modal-focus.js';
import { type DraftRemovalOwner, useDraftRemoval } from './use-draft-removal.js';
import { WorkspaceIcon } from './WorkspaceTools.js';
import './draft-review.css';

export function draftWarnings(state: MapState) {
  const warnings: Record<string, string> = {};
  const objectTypes = proposedObjectTypes(state.types, state.draft.objectTypes);
  const relationshipTypes = proposedRelationshipTypes(
    state.relationshipTypes,
    state.draft.relationshipTypes,
  );
  for (const change of state.draft.changes) {
    if (change.after?.identity === 'unresolved')
      warnings[`object-${change.id}`] =
        'Identiteten är olöst. Rätta objektet i det ordinarie flödet.';
    if (change.after && !objectTypes.some((type) => type.id === change.after?.typeId))
      warnings[`object-${change.id}`] = 'Objekttypen saknas. Rätta objektet eller typen.';
  }
  for (const change of state.draft.relationships ?? []) {
    if (change.after && !relationshipTypes.some((type) => type.id === change.after?.typeId))
      warnings[`relationship-${change.id}`] = 'Sambandstypen saknas. Rätta sambandet eller typen.';
  }
  for (const conflict of draftConflicts(state)) {
    if (conflict.kind === 'relationship' && conflict.missingEndpoints?.length) {
      warnings[draftProposalKey(conflict.kind, conflict.id)] =
        'Blockerat samband: ett objekt saknas. Rätta ändpunkterna eller kasta förslaget i konfliktlistan. Hela utkastet väntar.';
      continue;
    }
    if ((conflict.kind === 'object' || conflict.kind === 'relationship') && conflict.type) {
      warnings[draftProposalKey(conflict.kind, conflict.id)] =
        'Typens uppgifter skiljer sig från förslagets underlag. Rätta förslaget i det ordinarie flödet.';
    }
  }
  return warnings;
}
/** Read-only review; removal and saving are supplied by the household work owner. */
export function DraftReview({
  state,
  onRemove,
  onDiscard,
  onSave,
  removalOwner,
  feedback,
  blocked = false,
}: {
  state: MapState;
  onRemove?: (key: string) => void;
  onDiscard?: () => void;
  onSave?: () => void;
  removalOwner?: DraftRemovalOwner;
  feedback?: string;
  blocked?: boolean;
}) {
  const removal = useDraftRemoval(state, blocked, removalOwner);
  const actionsBlocked = blocked || removal.pending || (!!removal.review && !removal.reviewOpen);
  const [readKey, setReadKey] = useState<string | null>(null);
  const proposals = draftProposals(state.draft);
  const read = proposals.find((proposal) => proposal.key === readKey);
  const visibleReadKey = read?.key;
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const previousKeys = useRef<string[]>([]);
  const latestProposals = useRef(proposals);
  latestProposals.current = proposals;
  const warnings = draftWarnings(state);
  useLayoutEffect(() => {
    if (!visibleReadKey) {
      if (readKey) setReadKey(null);
      return;
    }
    dialog.current?.showModal();
    heading.current?.focus();
    return () => {
      dialog.current?.close();
      const origin = opener.current;
      if (origin?.isConnected && !origin.matches(':disabled') && origin.getClientRects().length)
        origin.focus();
      else {
        const index = previousKeys.current.indexOf(visibleReadKey);
        const nextKeys = previousKeys.current
          .slice(index + 1)
          .concat(previousKeys.current.slice(0, index).reverse());
        const fallback = nextKeys
          .map((key) => latestProposals.current.find((item) => item.key === key))
          .find(Boolean);
        const button = fallback ? document.getElementById(`draft-read-${fallback.key}`) : null;
        if (button?.getClientRects().length) button.focus();
        else draftHeading.current?.focus();
      }
    };
    // The open proposal is updated in place; new data must not reset its focus.
  }, [visibleReadKey, readKey]);
  return (
    <div className="draft-review-main">
      <header className="draft-review-heading">
        <h3 ref={draftHeading} tabIndex={-1} id="text-draft-title">
          Utkast
        </h3>
        <div className="draft-heading-actions">
          <button
            type="button"
            className="draft-icon"
            aria-label="Spara hela utkastet"
            title="Spara hela utkastet"
            disabled={actionsBlocked || !draftChangeCount(state.draft) || !onSave}
            onClick={onSave}
          >
            <WorkspaceIcon name="save" />
          </button>
          <button
            type="button"
            className="draft-icon draft-remove"
            aria-label="Kasta hela utkastet"
            title="Kasta hela utkastet"
            disabled={
              actionsBlocked || !draftChangeCount(state.draft) || !(onDiscard ?? removal.discard)
            }
            onClick={onDiscard ?? removal.discard}
          >
            <WorkspaceIcon name="trash" />
          </button>
        </div>
      </header>
      <ConversationDraft
        draft={state.draft}
        blocked={actionsBlocked}
        onRemove={onRemove ?? removal.remove}
        warnings={warnings}
        onOpen={(key) => {
          opener.current = document.getElementById(`draft-read-${key}`);
          previousKeys.current = proposals.map((proposal) => proposal.key);
          setReadKey(key);
        }}
      />
      {!!Object.keys(warnings).length && <p>Rätta markerade förslag innan du sparar.</p>}
      {feedback && <p>{feedback}</p>}
      {removal.review && (
        <button
          type="button"
          hidden={removal.reviewOpen}
          disabled={removal.pending}
          onClick={removal.openReview}
        >
          Kontrollera borttagningen
        </button>
      )}
      {removal.review && removal.reviewOpen && (
        <DraftDiscardDialog
          review={removal.review}
          proposals={draftProposalDescriptors(state.draft)}
          pending={removal.pending}
          onConfirm={() => void removal.confirm()}
          onCancel={removal.cancel}
          onRefresh={() => void removal.refresh()}
        />
      )}
      {read && (
        <dialog
          ref={dialog}
          className="draft-read-modal"
          aria-labelledby={titleId}
          onKeyDown={trapDialogTab}
          onCancel={(event) => {
            event.preventDefault();
            setReadKey(null);
          }}
        >
          <header>
            <h2 ref={heading} tabIndex={-1} id={titleId}>
              {read.name}
            </h2>
            <button
              type="button"
              aria-label="Stäng dialogen"
              title="Stäng dialogen"
              onClick={() => setReadKey(null)}
            >
              <WorkspaceIcon name="close" />
            </button>
          </header>
          <div className="draft-read-body">
            <DraftProposalDetails proposal={read} />
          </div>
        </dialog>
      )}
    </div>
  );
}
