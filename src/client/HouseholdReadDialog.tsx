import { useId, useLayoutEffect, useRef, useState } from 'react';
import { hasEnded } from '../shared/lifecycle.js';
import type { MapRelationship, MapState, RelationshipType } from '../shared/map.js';
import { effectiveRelationships } from '../shared/map.js';
import { relationshipLabel } from '../shared/relationship-label.js';
import { useFormLeave } from './FormLeave.js';
import type { HouseholdTableRow } from './HouseholdTable.js';
import { trapDialogTab, usableFocusTarget } from './modal-focus.js';
import { ObjectReadDetails } from './ObjectReadDetails.js';
import {
  RelationshipForm,
  type RelationshipFormSubmission,
  type RelationshipFormValue,
  type RelationshipStageResult,
} from './RelationshipForm.js';
import { RelationshipReadDetails } from './RelationshipReadDetails.js';
import { useConversationViewport } from './use-conversation-viewport.js';
import './household-read-dialog.css';

export type HouseholdReadEntry = {
  kind: 'object' | 'relationships';
  id: string;
  restoreFocus?: () => void;
  relationshipId?: string;
  startNewRelationship?: boolean;
  retainedRelationshipId?: string;
};

/** Keep proposed deletions readable until the entire draft is saved. */
export function householdReadRelationships(state: MapState, types: RelationshipType[]) {
  const effective = effectiveRelationships(state);
  const rows = new Map(
    state.relationships.map((value) => [
      value.id,
      {
        value,
        type: types.find((type) => type.id === value.typeId),
        before: null as MapRelationship | null,
        beforeType: undefined as RelationshipType | undefined,
        proposal: undefined as 'Nytt' | 'Ändrat' | 'Föreslagen borttagning' | undefined,
      },
    ]),
  );
  for (const change of state.draft.relationships ?? []) {
    const shown = effective.get(change.id);
    if (
      change.after &&
      (!shown ||
        shown.sourceId !== change.after.sourceId ||
        shown.targetId !== change.after.targetId)
    ) {
      continue;
    }
    const value = change.after ?? change.before;
    if (!value) continue;
    rows.set(change.id, {
      value: {
        ...value,
        id: change.id,
        householdId: change.type.householdId,
        revision: change.before?.revision ?? 0,
      },
      type: change.type,
      before: change.before,
      beforeType: change.beforeType ?? change.type,
      proposal: !change.after ? 'Föreslagen borttagning' : change.before ? 'Ändrat' : 'Nytt',
    });
  }
  return [...rows.values()];
}

/** Restore non-table openers, falling back to an available workspace control. */
function returnFocus() {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return () => {
    const target = usableFocusTarget(opener)
      ? opener
      : document.querySelector<HTMLElement>('.workspace-tools button');
    if (usableFocusTarget(target ?? null)) target?.focus({ preventScroll: true });
  };
}

export function HouseholdReadDialog({
  entry,
  rows,
  state,
  relationshipTypes,
  onClose,
  onEdit,
  onStageRelationship,
  onCheckRelationship,
  active = true,
  suspended = false,
  onDirty,
}: {
  entry: HouseholdReadEntry;
  active?: boolean;
  suspended?: boolean;
  onDirty?: (dirty: boolean) => void;
  rows: HouseholdTableRow[];
  state: MapState;
  relationshipTypes: RelationshipType[];
  onClose: () => void;
  onEdit?: (id: string, restoreFocus: () => void) => void;
  onStageRelationship?: (
    editor: RelationshipFormSubmission,
    stagingId: string,
  ) => Promise<RelationshipStageResult>;
  onCheckRelationship?: (
    stagingId: string,
    contentVersion: number,
  ) => Promise<RelationshipStageResult>;
}) {
  const [chain, setChain] = useState([entry]);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const openerFocus = useRef(returnFocus());
  const restoreFocus = useRef<(() => void) | null>(null);
  const prefix = useId();
  const { requestLeave } = useFormLeave();
  const [editor, setEditor] = useState<RelationshipFormValue | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editorOrigin, setEditorOrigin] = useState(entry.id);
  const started = useRef(false);
  const viewport = useConversationViewport();
  const editingFocus = useRef<HTMLElement | null>(null);
  const formPane = useRef<HTMLDivElement>(null);
  const editorOwnsFocus = useRef(false);
  const restoreEditorFocus = useRef(false);
  const current = chain[chain.length - 1] ?? entry;
  const row = rows.find((row) => row.object.id === current.id);
  const objects = new Map(rows.map((row) => [row.object.id, row.object]));
  const relationships = householdReadRelationships(state, relationshipTypes).filter(
    ({ value }) => value.sourceId === current.id || value.targetId === current.id,
  );
  const title = entry.retainedRelationshipId
    ? 'Rätta blockerat samband'
    : row
      ? current.kind === 'relationships'
        ? `Samband för ${row.object.name}`
        : `Uppgifter för ${row.object.name}`
      : 'Objektet finns inte längre';
  useLayoutEffect(() => {
    restoreFocus.current = entry.restoreFocus ?? openerFocus.current;
  }, [entry.restoreFocus]);
  useLayoutEffect(() => {
    const modal = dialog.current;
    return () => {
      const restore = restoreFocus.current;
      modal?.close();
      // Layout cleanup precedes DOM removal. StrictMode replays it while the
      // dialog stays mounted; only a genuine removal should navigate back.
      queueMicrotask(() => {
        if (modal && !modal.isConnected) restore?.();
      });
    };
  }, []);
  useLayoutEffect(() => {
    if (active) {
      if (!dialog.current?.open) {
        dialog.current?.showModal();
        (usableFocusTarget(editingFocus.current) ? editingFocus.current : heading.current)?.focus({
          preventScroll: true,
        });
      }
    } else {
      if (
        document.activeElement instanceof HTMLElement &&
        dialog.current?.contains(document.activeElement)
      )
        editingFocus.current = document.activeElement;
      dialog.current?.close();
      if (!suspended) onClose();
    }
  }, [active, suspended, onClose]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each navigation step starts at its own heading.
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (body.current) body.current.scrollTop = 0;
  }, [current]);
  useLayoutEffect(() => {
    if (editor || !restoreEditorFocus.current) return;
    restoreEditorFocus.current = false;
    if (
      active &&
      (document.activeElement === document.body || document.activeElement === dialog.current)
    )
      heading.current?.focus({ preventScroll: true });
  }, [editor, active]);
  function finishEditing() {
    restoreEditorFocus.current = Boolean(
      formPane.current?.contains(document.activeElement) ||
        (document.activeElement === document.body && editorOwnsFocus.current),
    );
    setEditor(null);
  }
  function visit(next: HouseholdReadEntry) {
    setChain((old) => [...old, next]);
  }
  function editRelationship(value?: MapRelationship) {
    const proposal = state.draft.relationships?.find((change) => change.id === value?.id);
    setNotice('');
    setEditorOrigin(current.id);
    setEditor({
      id: value?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (value?.revision ?? null),
      value: proposal?.after ?? value ?? { typeId: '', sourceId: current.id, targetId: '' },
    });
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: An ordinary edit entry initializes once; later server state never replaces unsent form values.
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    if (entry.retainedRelationshipId) {
      const proposal = state.draft.relationships?.find(
        ({ id }) => id === entry.retainedRelationshipId,
      );
      if (proposal?.after)
        editRelationship({
          ...proposal.after,
          id: proposal.id,
          householdId: proposal.type.householdId,
          revision: proposal.before?.revision ?? 0,
        });
    } else if (entry.startNewRelationship) editRelationship();
    else if (entry.relationshipId) {
      const existing = householdReadRelationships(state, relationshipTypes).find(
        ({ value }) => value.id === entry.relationshipId,
      );
      if (existing && existing.proposal !== 'Föreslagen borttagning')
        editRelationship(existing.value);
    }
  }, []);
  return (
    <dialog
      ref={dialog}
      style={
        {
          '--relationship-viewport-height': `${viewport.height}px`,
          '--relationship-viewport-top': `${viewport.offset}px`,
        } as React.CSSProperties
      }
      className="household-read-dialog"
      aria-labelledby={`${prefix}-title`}
      onFocusCapture={(event) => {
        editorOwnsFocus.current = Boolean(formPane.current?.contains(event.target));
      }}
      onCancel={(event) => {
        event.preventDefault();
        requestLeave(onClose);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          requestLeave(onClose);
        } else trapDialogTab(event);
      }}
    >
      <header>
        <div>
          <h2 ref={heading} id={`${prefix}-title`} tabIndex={-1}>
            {title}
          </h2>
          <p>
            {current.kind === 'relationships'
              ? 'Ändringar läggs i ditt utkast. Kartan sparas separat.'
              : 'Sparade uppgifter och ditt utkast'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Stäng dialogen"
          onClick={() => requestLeave(onClose)}
        >
          ×
        </button>
      </header>
      <div ref={body} className="household-read-body">
        <div className={current.kind === 'relationships' ? 'relationship-work-layout' : undefined}>
          <div>
            {entry.retainedRelationshipId ? (
              <p>
                Förslaget finns kvar. Välj befintliga ändpunkter och lägg rättningen i ditt utkast.
                Borttagna objekt återställs inte.
              </p>
            ) : !row ? (
              <p>Objektet är inte längre tillgängligt. Du kan gå tillbaka eller stänga dialogen.</p>
            ) : current.kind === 'object' ? (
              <>
                <p>
                  {row.removed ? 'Borttaget' : hasEnded(row.object) ? 'Upphört' : 'Aktuellt'}
                  {row.proposal && ` · ◇ ${row.proposal}`}
                </p>
                <ObjectReadDetails row={row} full />
                {onEdit && !row.removed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      requestLeave(() => onEdit(current.id, restoreFocus.current ?? (() => {})))
                    }
                  >
                    Redigera {row.object.name}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Samband för ${row.object.name}`}
                  aria-describedby={`${prefix}-count`}
                  onClick={() => visit({ kind: 'relationships', id: current.id })}
                >
                  <span aria-hidden="true">↔</span> Samband ·{' '}
                  <span id={`${prefix}-count`}>{relationships.length} samband</span>
                </button>
              </>
            ) : (
              <section aria-label="Befintliga samband">
                <h3>Befintliga samband · {relationships.length}</h3>
                {!relationships.length && <p>Inga samband finns för objektet.</p>}
                <ul className="household-read-relationships">
                  {relationships.map(({ value, type, before, beforeType, proposal }) => {
                    const otherId = value.sourceId === current.id ? value.targetId : value.sourceId;
                    const other = otherId
                      ? rows.find((row) => row.object.id === otherId)
                      : undefined;
                    return (
                      <li key={value.id}>
                        <h4>
                          {relationshipLabel(
                            value,
                            { relationshipTypes: type ? [type] : [] },
                            objects,
                            current.id,
                          )}
                        </h4>
                        <p>
                          {hasEnded(value) ? 'Upphört' : 'Aktuellt'}
                          {proposal && ` · ◇ ${proposal}`}
                        </p>
                        {other ? (
                          <button
                            type="button"
                            className="household-read-link"
                            onClick={() => visit({ kind: 'object', id: other.object.id })}
                          >
                            {other.object.name}
                          </button>
                        ) : (
                          <p>Objektet finns inte längre</p>
                        )}
                        <RelationshipReadDetails
                          value={value}
                          type={type}
                          before={before}
                          beforeType={beforeType}
                          objects={objects}
                        />
                        {onStageRelationship && proposal !== 'Föreslagen borttagning' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => requestLeave(() => editRelationship(value))}
                          >
                            Redigera samband
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {onStageRelationship && !row.removed && (
                  <>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => requestLeave(() => editRelationship())}
                    >
                      Nytt samband
                    </button>
                    <p>
                      Saknas det andra objektet? Skapa det separat med Nytt objekt och återvänd hit.
                    </p>
                  </>
                )}
              </section>
            )}
          </div>
          <div
            ref={formPane}
            hidden={current.kind !== 'relationships' || current.id !== editorOrigin}
          >
            {editor && onStageRelationship && onCheckRelationship && (
              <RelationshipForm
                key={editor.id}
                initial={editor}
                state={{ ...state, relationshipTypes }}
                objects={
                  new Map(
                    rows.filter((row) => !row.removed).map((row) => [row.object.id, row.object]),
                  )
                }
                onDirty={onDirty}
                onBusy={setBusy}
                onStage={onStageRelationship}
                onCheck={onCheckRelationship}
                onExisting={(id) => {
                  const edge = householdReadRelationships(state, relationshipTypes).find(
                    ({ value }) => value.id === id,
                  );
                  if (edge && edge.proposal !== 'Föreslagen borttagning')
                    editRelationship(edge.value);
                  else {
                    finishEditing();
                    setNotice('Det befintliga sambandet har ändrats. Granska aktuellt underlag.');
                  }
                }}
                onComplete={(result) => {
                  finishEditing();
                  setNotice(
                    result.outcome?.status === 'staged' && result.outcome.value === null
                      ? 'Föreslagen borttagning lades i ditt utkast.'
                      : 'Sambandet lades i ditt utkast. Du kan hantera nästa samband.',
                  );
                }}
                onCancel={finishEditing}
              />
            )}
          </div>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      {busy && current.id !== editorOrigin && (
        <p role="status">
          Ändringen måste bekräftas. Gå tillbaka till formuläret för att kontrollera utfallet.
        </p>
      )}
      {(chain.length > 1 || (current.kind === 'relationships' && onStageRelationship)) && (
        <footer>
          {chain.length > 1 && (
            <button type="button" onClick={() => setChain((old) => old.slice(0, -1))}>
              Tillbaka
            </button>
          )}
          {current.kind === 'relationships' && onStageRelationship && (
            <button type="button" disabled={busy} onClick={() => requestLeave(onClose)}>
              Stäng samband
            </button>
          )}
        </footer>
      )}
    </dialog>
  );
}
