import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type DraftConflict,
  draftConflicts,
  resolvedRelationshipType,
} from '../shared/draft-conflicts.js';
import type {
  CustomValues,
  MapDraft,
  MapObject,
  MapRelationship,
  MapState,
  ObjectType,
  ObjectValue,
  RelationshipType,
  RelationshipValue,
  SaveOperation,
  SaveReceipt,
} from '../shared/map.js';
import {
  proposedObjectTypes,
  proposedRelationships,
  proposedRelationshipTypes,
} from '../shared/map.js';
import { mergeFor } from '../shared/object-merge.js';
import type { MapSelection } from '../shared/text-assistant.js';
import { buildHeader, notifyOutdatedClient } from './build-guard.js';
import { FinancialFactsDetails, FinancialFactsEditor } from './FinancialFacts.js';
import { LifecycleDetails, LifecycleEditor, LifecycleStatus } from './Lifecycle.js';
import { MapHistory } from './MapHistory.js';
import { type MapRevealRequest, waitForMapDisplay } from './map-display.js';
import { MapRequestError, request } from './map-request.js';
import { MergeSourceDetails, ObjectMerge } from './ObjectMerge.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import {
  CustomFieldsDetails,
  CustomFieldsEditor,
  ObjectTypeDetails,
  ObjectTypeEditor,
} from './ObjectTypes.js';
import { PagedList } from './PagedList.js';
import { ProfileImage, ProfileImageEditor } from './ProfileImage.js';
import { RelationshipEditor, relationshipLabel } from './RelationshipEditor.js';
import { RelationshipTypeDetails, RelationshipTypeEditor } from './RelationshipTypes.js';
import {
  checkOperation,
  checkSaveIdentity,
  receiptMessage,
  rejectionMessage,
  type SaveAttempt,
  SaveOperations,
} from './SaveOperations.js';
import { ProposalSymbol, SpatialMap } from './SpatialMap.js';
import { TextAssistant } from './TextAssistant.js';
import { usePersonalView } from './use-personal-view.js';

type Editor = {
  id: string;
  version: number;
  contentVersion: number;
  baseRevision: number | null;
  typeRevision: number;
  value: ObjectValue;
  displacedFields?: { id: string; type: ObjectType; values: CustomValues }[];
  fieldsHandled?: boolean;
};

function checkOperations(operations: SaveOperation[], householdId: string, current: MapState) {
  for (const operation of operations)
    checkOperation(operation, {
      operationId: operation.operationId,
      version: operation.draftVersion,
      contentVersion: current.contentVersion,
      householdId,
      userId: current.userId,
    });
}

async function readOperations(path: string, householdId: string, current: MapState) {
  const result = await request<{ operations: SaveOperation[] }>(`${path}/operations`);
  checkOperations(result.operations, householdId, current);
  return result.operations;
}

export function HouseholdMap({ householdId }: { householdId: string }) {
  const path = `/api/households/${encodeURIComponent(householdId)}/map`;
  const [state, setState] = useState<MapState | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeGeneration, setMergeGeneration] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<{
    id: string;
    version: number;
    contentVersion: number;
    baseRevision: number | null;
    value: RelationshipValue;
  } | null>(null);
  const [typeEditor, setTypeEditor] = useState<{
    type: ObjectType;
    version: number;
    contentVersion: number;
    baseRevision: number | null;
  } | null>(null);
  const [edgeTypeEditor, setEdgeTypeEditor] = useState<{
    type: RelationshipType;
    version: number;
    contentVersion: number;
    baseRevision: number | null;
  } | null>(null);
  const [presentation, setPresentation] = useState<'list' | 'combined' | 'map'>(() =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 1100px) and (pointer: fine)').matches
      ? 'combined'
      : 'list',
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const editorDialog = useRef<HTMLDialogElement>(null);
  const editMapButton = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const [revealRequest, setRevealRequest] = useState<MapRevealRequest>();
  const revealAbort = useRef<AbortController | null>(null);
  useEffect(() => () => revealAbort.current?.abort(), []);
  const listModeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (presentation !== 'map') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const hidden: { node: HTMLElement; inert: boolean }[] = [];
    let current = workspace.current;
    while (current?.parentElement) {
      for (const sibling of current.parentElement.children)
        if (sibling !== current && sibling instanceof HTMLElement) {
          hidden.push({ node: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      current = current.parentElement;
      if (current === document.body) break;
    }
    listModeButton.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      for (const item of hidden) item.node.inert = item.inert;
    };
  }, [presentation]);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    kind: 'object' | 'relationship';
    id: string;
    previous?: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!state && error) workspace.current?.focus();
  }, [state, error]);
  const saveAttempt = useRef<SaveAttempt | null>(null);
  const [operations, setOperations] = useState<SaveOperation[]>([]);
  const nameInput = useRef<HTMLInputElement>(null);
  const hasMap = state !== null;
  useLayoutEffect(() => {
    const dialog = editorDialog.current;
    if (!dialog || !hasMap) return;
    if (presentation !== 'map' || (detailsOpen && !editorOpen)) {
      if (dialog.matches(':modal')) dialog.close();
      dialog.open = true;
      setEditorOpen(false);
    } else if (editorOpen) {
      if (!dialog.matches(':modal')) {
        dialog.close();
        dialog.showModal();
      }
      (
        nameInput.current ?? dialog.querySelector<HTMLSelectElement>('#relationship-source')
      )?.focus();
    } else {
      const wasModal = dialog.matches(':modal');
      dialog.close();
      if (wasModal) editMapButton.current?.focus();
    }
  }, [presentation, editorOpen, detailsOpen, hasMap]);
  useEffect(() => {
    if (!editorOpen || presentation !== 'map') return;
    const viewport = window.visualViewport;
    const resize = () => {
      const dialog = editorDialog.current;
      if (!dialog) return;
      dialog.style.setProperty('--editor-height', `${viewport?.height ?? window.innerHeight}px`);
      dialog.style.setProperty('--editor-top', `${viewport?.offsetTop ?? 0}px`);
      const field = document.activeElement;
      if (field instanceof HTMLElement && dialog.contains(field)) {
        const bounds = dialog.getBoundingClientRect();
        const target = field.getBoundingClientRect();
        if (target.top < bounds.top + 12) dialog.scrollTop += target.top - bounds.top - 12;
        else if (target.bottom > bounds.bottom - 12)
          dialog.scrollTop += target.bottom - bounds.bottom + 12;
      }
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, [editorOpen, presentation]);
  const newButton = useRef<HTMLButtonElement>(null);
  const focusAfterClose = useRef(false);
  const [load, setLoad] = useState(0);

  const loseAccess = useCallback(() => {
    revealAbort.current?.abort();
    setPresentation('list');
    setDetailsOpen(false);
    setEditorOpen(false);
    setFiltersOpen(false);
    setSelection(null);
    setFocusId(null);
    setQuery('');
    setTypeFilter('');
    setState(null);
    setMergeOpen(false);
    setOperations([]);
    setEditor(null);
    setEdgeEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
    setDirty(false);
    saveAttempt.current = null;
    setStatus('');
    setError('Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.');
  }, []);
  const personal = usePersonalView(path, loseAccess);

  useEffect(() => {
    let active = true;
    setPending(true);
    void (async () => {
      const result = await request<{ operations: SaveOperation[] }>(`${path}/operations`);
      const attempt = saveAttempt.current;
      const operation = attempt
        ? (
            await request<{ operation: SaveOperation | null }>(
              `${path}/operations/${encodeURIComponent(attempt.operationId)}`,
            )
          ).operation
        : null;
      // Read the map after the results: another client may have completed a
      // pending save while this client was discovering its durable receipt.
      const value = await request<MapState>(`${path}?reload=${load}`);
      if (!active) return;
      checkOperations(result.operations, householdId, value);
      let recent = result.operations;
      let message = '';
      if (attempt) {
        if (
          attempt.contentVersion !== value.contentVersion ||
          attempt.userId !== value.userId ||
          attempt.householdId !== householdId
        ) {
          saveAttempt.current = null;
          setStatus('');
          message = rejectionMessage('content_conflict');
        } else if (operation) {
          checkOperation(operation, attempt);
          recent = [
            operation,
            ...recent.filter((item) => item.operationId !== operation.operationId),
          ];
          if (operation.status === 'succeeded') {
            setStatus(receiptMessage(operation.receipt));
            saveAttempt.current = null;
          } else if (operation.status === 'rejected') {
            message = rejectionMessage(operation.error);
            saveAttempt.current = null;
          }
        } else {
          message =
            'Utfallet är okänt. Inget registrerat resultat hittades. Återförsök samma sparande.';
        }
      }
      const waiting = recent.some((item) => item.status === 'pending');
      setState(value);
      setOperations(recent);
      setBlocked(waiting || Boolean(saveAttempt.current));
      setError(message || (waiting ? rejectionMessage('operation_pending') : ''));
    })()
      .catch((failure) => {
        if (!active) return;
        setBlocked(true);
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) loseAccess();
        else setError('Kartan och sparförsöken kunde inte hämtas. Försök igen.');
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [path, load, householdId, loseAccess]);

  useEffect(() => {
    if (editor?.id) nameInput.current?.focus();
    else if (edgeEditor?.id)
      editorDialog.current?.querySelector<HTMLSelectElement>('#relationship-source')?.focus();
    else if (focusAfterClose.current) {
      focusAfterClose.current = false;
      newButton.current?.focus();
    }
  }, [editor?.id, edgeEditor?.id]);

  async function save(attempt: SaveAttempt, recover = false) {
    if (!state || pending) return;
    saveAttempt.current = attempt;
    setPending(true);
    setError('');
    setStatus('');
    let confirmed = false;
    try {
      const body = {
        operationId: attempt.operationId,
        version: attempt.version,
        contentVersion: attempt.contentVersion,
      };
      let operation: SaveOperation | null = null;
      if (recover) {
        const result = await request<{ operation: SaveOperation | null }>(
          `${path}/operations/${encodeURIComponent(attempt.operationId)}`,
        );
        operation = result.operation;
      }
      if (!operation) {
        const result = await request<{ operation: SaveOperation }>(`${path}/operations`, body);
        operation = result.operation;
      }
      checkOperation(operation, attempt);
      setOperations((previous) => [
        operation,
        ...previous.filter((item) => item.operationId !== attempt.operationId),
      ]);
      if (operation.status === 'rejected') throw new MapRequestError(409, operation.error);
      const receipt =
        operation.status === 'succeeded'
          ? operation.receipt
          : (await request<{ receipt: SaveReceipt }>(`${path}/save`, body)).receipt;
      checkSaveIdentity(receipt, attempt);
      setStatus(receiptMessage(receipt));
      setOperations((previous) =>
        previous.map((item) =>
          item.operationId === attempt.operationId
            ? { ...item, status: 'succeeded', receipt }
            : item,
        ),
      );
      saveAttempt.current = null;
      confirmed = true;
      // Recovery can happen while an older form has unsent text. Keep that text
      // and let its draft-version check prevent it from overwriting newer work.
      if (!dirty) {
        setEditor(null);
        setEdgeEditor(null);
        setTypeEditor(null);
        setEdgeTypeEditor(null);
      }
      const { operations: recent } = await request<{ operations: SaveOperation[] }>(
        `${path}/operations`,
      );
      const latest = await request<MapState>(path);
      checkOperations(recent, householdId, latest);
      setState(latest);
      setOperations(recent);
      setBlocked(recent.some((item) => item.status === 'pending'));
      if (!dirty) newButton.current?.focus();
    } catch (failure) {
      setBlocked(true);
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
        loseAccess();
      } else if (confirmed) {
        setError(
          'Ändringarna är sparade enligt kvittot, men kartan kunde inte hämtas. Hämta aktuellt underlag.',
        );
      } else if (failure instanceof MapRequestError && failure.status === 409) {
        // An ID mismatch does not disprove an earlier successful save.
        if (!['operation_conflict', 'client_outdated'].includes(failure.code))
          saveAttempt.current = null;
        setError(rejectionMessage(failure.code));
        try {
          setOperations(await readOperations(path, householdId, state));
        } catch {
          // Keep the received rejection visible when the follow-up read fails.
        }
      } else {
        setError(
          'Sparandet kunde inte bekräftas. Utfallet är okänt. Försök hämta samma kvitto igen.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  async function changeImage(file: File | null) {
    if (!state || !editor || pending || dirty || blocked) return;
    setPending(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(
        `/api/households/${encodeURIComponent(householdId)}/profile-images/${encodeURIComponent(editor.id)}`,
        {
          method: file ? 'POST' : 'DELETE',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Skyttel-Build': buildHeader,
            'X-Skyttel-Draft-Version': String(editor.version),
            'X-Skyttel-Content-Version': String(editor.contentVersion),
            'X-Skyttel-Object-Revision': String(editor.baseRevision),
          },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        notifyOutdatedClient(result.error);
        throw new MapRequestError(response.status, result.error);
      }
      const draft = result as MapDraft;
      const value = draft.changes.find((change) => change.id === editor.id)?.after;
      if (!value) throw new Error('invalid_image_result');
      setState({ ...state, draft });
      setEditor({ ...editor, value, version: draft.version });
      setStatus('Bildförslaget finns i ditt privata utkast. Kartan är inte ändrad.');
    } catch (failure) {
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) loseAccess();
      else if (failure instanceof MapRequestError && failure.status === 413)
        setError('Bilden är för stor. Välj en bild på högst 10 MB. Dina förslag är kvar.');
      else if (
        failure instanceof MapRequestError &&
        ['invalid_image', 'image_processing_failed', 'image_size'].includes(failure.code)
      )
        setError(
          'Bilden kunde inte behandlas. Välj en hel JPEG-, PNG- eller WebP-bild inom gränserna. Dina förslag är kvar.',
        );
      else {
        setBlocked(true);
        setError(
          'Bildändringen kunde inte bekräftas. Hämta aktuellt underlag innan du försöker igen.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  async function action(
    kind:
      | 'merge'
      | 'draft'
      | 'relationship'
      | 'object-type'
      | 'relationship-type'
      | 'discard'
      | 'resolve'
      | 'undo'
      | 'discard-change',
    body: unknown,
  ) {
    if (!state || pending || blocked) return;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const draft = await request<MapDraft & { existingId?: string }>(`${path}/${kind}`, {
        contentVersion: state.contentVersion,
        ...(body as Record<string, unknown>),
      });
      if (draft.existingId) {
        const latest = await request<MapState>(path);
        setState(latest);
        const edge = proposedRelationships(latest.relationships, latest.draft.relationships).get(
          draft.existingId,
        );
        const objects = new Map(latest.objects.map((object) => [object.id, object]));
        for (const change of latest.draft.changes) {
          if (change.after)
            objects.set(change.id, {
              ...change.after,
              id: change.id,
              householdId,
              revision: change.before?.revision ?? 0,
            });
        }
        setStatus(
          edge
            ? `Sambandet finns redan: ${relationshipLabel(edge, { ...latest, relationshipTypes: proposedRelationshipTypes(latest.relationshipTypes, latest.draft.relationshipTypes) }, objects)}. Ingen dubblett skapades.`
            : 'Det befintliga sambandet har ändrats. Granska aktuellt underlag.',
        );
      } else {
        setState(kind === 'undo' ? await request<MapState>(path) : { ...state, draft });
        setStatus(
          kind === 'resolve'
            ? 'Konfliktvalet finns i ditt privata utkast. Granska hela utkastet och ge ett nytt sparbesked.'
            : kind === 'discard'
              ? 'Utkastet är kastat. Kartan är inte ändrad.'
              : 'Förslaget finns i ditt privata utkast. Kartan är inte ändrad.',
        );
      }
      setMergeOpen(false);
      setEditor(null);
      setEdgeEditor(null);
      setTypeEditor(null);
      setEdgeTypeEditor(null);
      setDirty(false);
      setBlocked(false);
      newButton.current?.focus();
    } catch (failure) {
      if (
        failure instanceof MapRequestError &&
        [
          'merge_choices_required',
          'merge_review_required',
          'merge_conflict',
          'duplicate_relationship',
          'invalid_custom_value',
          'invalid_type_definition',
          'invalid_relationship_type',
          'field_kind_in_use',
          'undo_draft_overlap',
          'undo_unavailable',
          'definition_in_use',
          'field_in_use',
        ].includes(failure.code)
      ) {
        setError(rejectionMessage(failure.code));
        return;
      }
      setBlocked(true);
      if (
        failure instanceof MapRequestError &&
        (failure.status === 401 || failure.status === 403)
      ) {
        loseAccess();
      } else if (failure instanceof MapRequestError && failure.status === 409) {
        saveAttempt.current = null;
        setError(rejectionMessage(failure.code));
      } else {
        setError('Ändringen kunde inte bekräftas. Hämta aktuellt underlag innan du fortsätter.');
      }
    } finally {
      setPending(false);
    }
  }

  const effectiveTypes = useMemo(
    () => proposedObjectTypes(state?.types ?? [], state?.draft.objectTypes),
    [state],
  );
  const effectiveEdgeTypes = proposedRelationshipTypes(
    state?.relationshipTypes ?? [],
    state?.draft.relationshipTypes,
  );
  const effectiveState = state
    ? { ...state, types: effectiveTypes, relationshipTypes: effectiveEdgeTypes }
    : null;
  const conflicts = state ? draftConflicts(state) : [];
  function conflictReview(conflict: DraftConflict) {
    if (conflict.kind === 'objectType' || conflict.kind === 'relationshipType') return null;
    const proposal = (
      conflict.kind === 'object' ? state?.draft.changes : state?.draft.relationships
    )?.find((change) => change.id === conflict.id);
    const deleted = Boolean(proposal?.before && !conflict.current);
    return (
      <div className="conflict-review">
        <h4>Konflikt: sparat i kartan nu</h4>
        {conflict.kind === 'object' ? (
          details(conflict.current)
        ) : (
          <p>
            {conflict.current && state
              ? relationshipLabel(conflict.current, state, savedObjects)
              : 'Finns inte i kartan'}
          </p>
        )}
        {conflict.kind === 'relationship' && conflict.current && (
          <LifecycleDetails value={conflict.current} />
        )}
        <p>Välj vilket värde du vill behålla. Valet ändrar bara ditt utkast.</p>
        {conflict.type !== undefined && (
          <p>
            Typdefinitionen har ändrats:{' '}
            {conflict.type
              ? `${conflict.type.name}. ${conflict.type.description}`
              : 'Typen finns inte längre.'}
          </p>
        )}
        {conflict.missingEndpoints && (
          <p>
            Sambandet hänvisar till ett borttaget objekt. Ta bort förslaget eller öppna sambandet
            och välj ett annat objekt.
          </p>
        )}
        {conflict.duplicates && state && (
          <>
            <p>
              Samma samband finns redan. Använd sparat värde för att ta bort ditt överlappande
              förslag.
            </p>
            <ul>
              {conflict.duplicates.map((edge) => (
                <li key={edge.id}>{relationshipLabel(edge, effectiveState ?? state, displayed)}</li>
              ))}
            </ul>
          </>
        )}
        {conflict.connections && state && (
          <>
            <p>
              Borttagningen berör också dessa samband. Behåll förslaget för att lägga deras
              borttagningar i utkastet.
            </p>
            <ul>
              {conflict.connections.map((edge) => (
                <li key={edge.id}>{relationshipLabel(edge, state, savedObjects)}</li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          disabled={pending || blocked || dirty}
          onClick={() =>
            void action('resolve', { version: state?.draft.version, conflict, choice: 'saved' })
          }
        >
          Använd sparat värde
        </button>
        {conflict.type !== null &&
          !conflict.duplicates &&
          !conflict.missingEndpoints &&
          (!deleted || proposal?.undo) && (
            <button
              type="button"
              disabled={pending || blocked || dirty}
              onClick={() =>
                void action('resolve', {
                  version: state?.draft.version,
                  conflict,
                  choice: 'proposed',
                })
              }
            >
              Behåll mitt förslag
            </button>
          )}
        {deleted && (
          <p>
            {proposal?.undo
              ? 'Objektet eller sambandet är borttaget. Behåll förslaget för att återställa det i ditt utkast.'
              : 'Objektet eller sambandet är borttaget. Skapa ett nytt förslag om det fortfarande behövs.'}
          </p>
        )}
      </div>
    );
  }

  function edit(object?: MapObject) {
    if (!state) return;
    if (presentation === 'map') setEditorOpen(true);
    else setDetailsOpen(true);
    if (object) setSelection({ kind: 'object', id: object.id });
    if (object && editor?.id === object.id) {
      nameInput.current?.focus();
      nameInput.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const proposal = state.draft.changes.find((change) => change.id === object?.id);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
    setEdgeEditor(null);
    setEditor({
      typeRevision:
        effectiveTypes.find(
          (type) =>
            type.id === (proposal?.after?.typeId ?? object?.typeId ?? effectiveTypes[0]?.id),
        )?.revision ?? 0,
      id: object?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (object?.revision ?? null),
      value: proposal?.after ??
        object ?? { typeId: effectiveTypes[0]?.id ?? '', name: '', description: '' },
    });
    setDirty(false);
  }
  const { displayed, displayedEdges, visibleObjects, visibleEdges } = useMemo(() => {
    const displayed = state
      ? new Map(state.objects.map((object) => [object.id, object]))
      : new Map<string, MapObject>();
    for (const change of state?.draft.changes ?? []) {
      if (change.after)
        displayed.set(change.id, {
          ...change.after,
          id: change.id,
          householdId,
          revision: change.before?.revision ?? 0,
        });
    }
    const displayedEdges = proposedRelationships(
      state?.relationships ?? [],
      state?.draft.relationships,
    );
    const spatialEdges = new Map(displayedEdges);
    for (const change of state?.draft.relationships ?? []) {
      if (!change.after && change.before) spatialEdges.set(change.id, change.before);
    }
    const connected = new Set([focusId]);
    const beforeEdges = (state?.draft.relationships ?? []).flatMap((change) =>
      change.before ? [change.before] : [],
    );
    for (const edge of [...spatialEdges.values(), ...beforeEdges]) {
      if (edge.sourceId === focusId || edge.targetId === focusId) {
        connected.add(edge.sourceId);
        connected.add(edge.targetId);
      }
    }
    const visibleObjects = new Map(
      [...displayed].filter(
        ([, object]) =>
          (!focusId || connected.has(object.id)) &&
          (!typeFilter || object.typeId === typeFilter) &&
          `${object.name} ${effectiveTypes.find((type) => type.id === object.typeId)?.name ?? ''}`
            .toLocaleLowerCase('sv')
            .includes(query.toLocaleLowerCase('sv')),
      ),
    );
    const visibleEdges = new Map(
      [...spatialEdges].filter(
        ([, edge]) =>
          visibleObjects.has(edge.sourceId) &&
          (!edge.targetId || visibleObjects.has(edge.targetId)) &&
          (!focusId || edge.sourceId === focusId || edge.targetId === focusId),
      ),
    );
    return { displayed, displayedEdges, visibleObjects, visibleEdges };
  }, [state, householdId, effectiveTypes, focusId, typeFilter, query]);
  function showAll() {
    setQuery('');
    setTypeFilter('');
    setFocusId(null);
    setSelection(null);
    setStatus('Hela rymden visas. Kameran behåller sin vinkel, zoom och panorering.');
  }
  function focusObject(id: string) {
    setFocusId(id);
    setQuery('');
    setTypeFilter('');
    setSelection({ kind: 'object', id });
    setStatus(
      `Visar direkta samband för ${displayed.get(id)?.name}. Visa hela rymden lämnar fokus.`,
    );
  }
  const savedObjects = new Map((state?.objects ?? []).map((object) => [object.id, object]));
  const hasChanges = Boolean(
    state &&
      (state.draft.changes.length ||
        state.draft.relationships?.length ||
        state.draft.objectTypes?.length ||
        state.draft.relationshipTypes?.length),
  );
  const unresolved =
    state?.draft.changes.some((change) => change.after?.identity === 'unresolved') ||
    state?.draft.relationships?.some((change) => change.after?.knowledge === 'unresolved');
  function editRelationship(edge?: MapRelationship, previous = false) {
    if (!state) return;
    if (presentation === 'map') setEditorOpen(true);
    else setDetailsOpen(true);
    if (edge) setSelection({ kind: 'relationship', id: edge.id, previous });
    if (previous) {
      setEditor(null);
      setEdgeEditor(null);
      setTypeEditor(null);
      setEdgeTypeEditor(null);
      setDirty(false);
      return;
    }
    if (edge && edgeEditor?.id === edge.id) {
      editorDialog.current?.querySelector<HTMLSelectElement>('#relationship-source')?.focus();
      return;
    }
    const proposal = state.draft.relationships?.find((change) => change.id === edge?.id);
    setEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
    setEdgeEditor({
      id: edge?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (edge?.revision ?? null),
      value: proposal?.after ??
        edge ?? { typeId: '', sourceId: '', targetId: '', knowledge: 'known' },
    });
    setDirty(true);
  }
  function selectObject(object: MapObject) {
    setSelection({ kind: 'object', id: object.id });
    if (editor?.id !== object.id) setEditor(null);
    setEdgeEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
  }
  function selectRelationship(edge: MapRelationship, previous = false) {
    setSelection({ kind: 'relationship', id: edge.id, previous });
    setEditor(null);
    if (previous || edgeEditor?.id !== edge.id) setEdgeEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
  }
  const selectedObject = selection?.kind === 'object' ? displayed.get(selection.id) : undefined;
  const selectedEdge =
    selection?.kind === 'relationship' && !selection.previous
      ? displayedEdges.get(selection.id)
      : undefined;
  async function revealAssistantItem(target: MapSelection, signal: AbortSignal) {
    revealAbort.current?.abort();
    if (!state || dirty || pending || blocked || !workspace.current || signal.aborted) return false;
    const object = target.kind === 'object' ? displayed.get(target.id) : undefined;
    const edge = target.kind === 'relationship' ? displayedEdges.get(target.id) : undefined;
    if (!object && !edge) return false;
    const objectIds = object
      ? [object.id]
      : edge
        ? [edge.sourceId, ...(edge.targetId ? [edge.targetId] : [])]
        : [];
    const request: MapRevealRequest = {
      id: crypto.randomUUID(),
      objectIds,
      ...(edge ? { relationshipId: edge.id } : {}),
    };
    const abort = new AbortController();
    revealAbort.current = abort;
    const cancel = () => abort.abort();
    signal.addEventListener('abort', cancel, { once: true });
    setQuery('');
    setTypeFilter('');
    setFocusId(null);
    setPresentation('combined');
    if (object) selectObject(object);
    else if (edge) selectRelationship(edge);
    setRevealRequest(request);
    try {
      return await waitForMapDisplay(workspace.current, request, target, abort.signal);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
  function remove(kind: 'draft' | 'relationship', item: MapObject | MapRelationship) {
    if (!state) return;
    const changes = kind === 'draft' ? state.draft.changes : state.draft.relationships;
    const proposal = changes?.find((change) => change.id === item.id);
    void action(kind, {
      id: item.id,
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : item.revision,
      value: null,
    });
  }
  function typeName(id: string) {
    return effectiveTypes.find((type) => type.id === id)?.name ?? id;
  }
  function details(value: ObjectValue | null, definition?: ObjectType) {
    return value ? (
      <>
        <p>Namn: {value.name}</p>
        <ProfileImage householdId={householdId} value={value} />
        <p>Objekttyp: {definition?.name ?? typeName(value.typeId)}</p>
        <p>Beskrivning: {value.description || 'Ingen beskrivning'}</p>
        <FinancialFactsDetails facts={value.financialFacts} />
        <CustomFieldsDetails
          type={definition ?? effectiveTypes.find((type) => type.id === value.typeId)}
          values={value.customValues}
        />
        <LifecycleDetails value={value} />
        {value.identity && (
          <p>
            {value.identity === 'unspecified'
              ? 'Ospecificerat objekt'
              : 'Obesvarad identitetsfråga'}
          </p>
        )}
      </>
    ) : (
      <p>Finns inte i kartan</p>
    );
  }

  return (
    <section
      ref={workspace}
      tabIndex={-1}
      className={`household-map presentation-${presentation}${detailsOpen ? ' map-details-open' : ''}${editorOpen ? ' map-editor-open' : ''}`}
      aria-label="Hushållskarta"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !(
            event.target instanceof HTMLElement &&
            event.target.closest('form, input, select, textarea, dialog')
          )
        )
          showAll();
      }}
    >
      <header className="household-intro">
        <p className="eyebrow">Från samtal till hushållets karta</p>
        <h2>Berätta. Rätta. Spara med rösten.</h2>
        <p>Följ ändringarna medan du pratar. Du kan också skriva eller använda kartans formulär.</p>
      </header>
      <p role="status">
        {pending
          ? saveAttempt.current
            ? 'Väntande: kontrollerar sparandet…'
            : 'Arbetar…'
          : status}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {(error || blocked) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setLoad((value) => value + 1);
          }}
        >
          Hämta aktuellt underlag
        </button>
      )}
      {saveAttempt.current && blocked && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (saveAttempt.current) void save(saveAttempt.current, true);
          }}
        >
          Hämta samma kvitto igen
        </button>
      )}
      {!state && !error && (
        <div className="map-loading" role="status" aria-busy="true">
          <span className="assistant-spinner" aria-hidden="true" />
          Hushållets karta hämtas…
        </div>
      )}
      {state && (
        <TextAssistant
          householdId={householdId}
          onMapChange={() => setLoad((value) => value + 1)}
          onAccessLost={loseAccess}
          onSelectItem={revealAssistantItem}
          inspector={
            <dialog
              ref={editorDialog}
              className="map-editor-dialog"
              role={editorOpen ? 'dialog' : 'presentation'}
              aria-label={editorOpen ? 'Redigera val' : undefined}
              onCancel={(event) => {
                event.preventDefault();
                setEditorOpen(false);
              }}
            >
              {presentation === 'map' && editorOpen && (
                <button type="button" onClick={() => setEditorOpen(false)}>
                  Till kartan
                </button>
              )}
              <section
                className="map-inspector"
                aria-label="Val och redigering"
                data-selection-kind={
                  selectedObject ? 'object' : selectedEdge ? 'relationship' : undefined
                }
                data-selection-id={
                  !editor && !edgeEditor
                    ? (selectedObject?.id ?? selectedEdge?.id)
                    : editor?.version === state.draft.version &&
                        editor.contentVersion === state.contentVersion
                      ? editor.id
                      : edgeEditor?.version === state.draft.version &&
                          edgeEditor.contentVersion === state.contentVersion
                        ? edgeEditor.id
                        : undefined
                }
              >
                <h3>Val och redigering</h3>
                {(editor || edgeEditor) && (
                  <p className="muted">
                    Skriv inte fullständiga konto- eller kortnummer, lösenord, pinkoder,
                    säkerhetskoder eller återställningskoder.
                  </p>
                )}
                {!editor && !edgeEditor && !selection && (
                  <p className="muted">
                    Välj ett objekt eller samband för att se uppgifter och samband.
                  </p>
                )}
                {!editor && selectedObject && (
                  <>
                    {details(selectedObject)}
                    <button
                      type="button"
                      disabled={pending || blocked}
                      onClick={() => edit(selectedObject)}
                    >
                      Redigera valt objekt
                    </button>
                  </>
                )}
                {!edgeEditor && selectedEdge && (
                  <>
                    <p>{relationshipLabel(selectedEdge, effectiveState ?? state, displayed)}</p>
                    <LifecycleDetails value={selectedEdge} />
                    <button
                      type="button"
                      disabled={pending || blocked}
                      onClick={() => editRelationship(selectedEdge)}
                    >
                      Redigera valt samband
                    </button>
                  </>
                )}
                {editor && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (editor.displacedFields?.length && !editor.fieldsHandled) return;
                      void action('draft', editor);
                    }}
                  >
                    <fieldset disabled={pending || blocked}>
                      <legend>Objektets detaljer</legend>
                      <ProfileImageEditor
                        householdId={householdId}
                        value={editor.value}
                        disabled={
                          pending ||
                          blocked ||
                          dirty ||
                          editor.version !== state.draft.version ||
                          !displayed.has(editor.id)
                        }
                        onChange={(file) => void changeImage(file)}
                      />
                      <label htmlFor="object-name">Objektets namn</label>
                      <input
                        ref={nameInput}
                        id="object-name"
                        required
                        maxLength={200}
                        value={editor.value.name}
                        onChange={(event) => {
                          setDirty(true);
                          setEditor({
                            ...editor,
                            value: { ...editor.value, name: event.target.value },
                          });
                        }}
                      />
                      <label htmlFor="object-type">Objekttyp</label>
                      <select
                        id="object-type"
                        required
                        value={editor.value.typeId}
                        onChange={(event) => {
                          setDirty(true);
                          const previousType = effectiveTypes.find(
                            (type) => type.id === editor.value.typeId,
                          );
                          const values = editor.value.customValues ?? {};
                          const displacedFields = [...(editor.displacedFields ?? [])];
                          if (previousType && Object.keys(values).length)
                            displacedFields.push({
                              id: crypto.randomUUID(),
                              type: previousType,
                              values,
                            });
                          setEditor({
                            ...editor,
                            displacedFields,
                            fieldsHandled: false,
                            typeRevision:
                              effectiveTypes.find((type) => type.id === event.target.value)
                                ?.revision ?? 0,
                            value: {
                              ...editor.value,
                              typeId: event.target.value,
                              customValues: {},
                            },
                          });
                        }}
                      >
                        {effectiveTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                      <p>
                        Ett typbyte behåller objektet och alla dess samband. Den nya typens fält
                        börjar obesvarade. Fyll själv i uppgifterna som ska gälla efter bytet.
                      </p>
                      {!!editor.displacedFields?.length && (
                        <section aria-label="Tidigare fältvärden">
                          <h3>Tidigare fältvärden</h3>
                          {editor.displacedFields.map(({ id, type, values }) => (
                            <div key={id}>
                              <p>Objekttyp: {type.name}</p>
                              <CustomFieldsDetails type={type} values={values} />
                            </div>
                          ))}
                          <p>
                            Dessa värden följer inte med till den nya typen. För över de uppgifter
                            du vill behålla genom att fylla i de nya fälten. Tidigare sparade
                            uppgifter finns kvar i historiken.
                          </p>
                          <label>
                            <input
                              type="checkbox"
                              checked={editor.fieldsHandled ?? false}
                              onChange={(event) =>
                                setEditor({ ...editor, fieldsHandled: event.target.checked })
                              }
                            />
                            Jag har hanterat tidigare fältvärden för typbytet
                          </label>
                        </section>
                      )}
                      <label htmlFor="object-identity">Objektets identitet</label>
                      <select
                        id="object-identity"
                        value={editor.value.identity ?? 'identified'}
                        onChange={(event) => {
                          setDirty(true);
                          const value = { ...editor.value };
                          if (event.target.value === 'identified') delete value.identity;
                          else value.identity = event.target.value as 'unspecified' | 'unresolved';
                          setEditor({ ...editor, value });
                        }}
                      >
                        <option value="identified">Identifierat objekt</option>
                        <option value="unspecified">Ospecificerat objekt</option>
                        <option value="unresolved">Obesvarad identitetsfråga</option>
                      </select>
                      <label htmlFor="object-description">Beskrivning</label>
                      <textarea
                        id="object-description"
                        maxLength={2000}
                        value={editor.value.description}
                        onChange={(event) => {
                          setDirty(true);
                          setEditor({
                            ...editor,
                            value: { ...editor.value, description: event.target.value },
                          });
                        }}
                      />
                      <CustomFieldsEditor
                        type={effectiveTypes.find((type) => type.id === editor.value.typeId)}
                        values={editor.value.customValues}
                        onChange={(customValues) => {
                          setDirty(true);
                          setEditor({ ...editor, value: { ...editor.value, customValues } });
                        }}
                      />
                      <p>Texten i formuläret skickas först när du lägger den i utkastet.</p>
                      <LifecycleEditor
                        kind="object"
                        value={editor.value.lifecycle}
                        onChange={(lifecycle) => {
                          setDirty(true);
                          setEditor({ ...editor, value: { ...editor.value, lifecycle } });
                        }}
                      />
                      <FinancialFactsEditor
                        key={editor.id}
                        facts={editor.value.financialFacts}
                        onChange={(financialFacts) => {
                          setDirty(true);
                          const value = { ...editor.value };
                          if (Object.keys(financialFacts).length)
                            value.financialFacts = financialFacts;
                          else delete value.financialFacts;
                          setEditor({ ...editor, value });
                        }}
                      />
                      {editor.version !== state.draft.version && (
                        <p role="alert">
                          Formuläret bygger på ett äldre utkast. Kopiera eventuell text du vill
                          behålla, stäng formuläret och öppna objektets aktuella förslag innan du
                          fortsätter.
                        </p>
                      )}
                      <div className="access-actions">
                        <button
                          type="submit"
                          disabled={
                            editor.version !== state.draft.version ||
                            (!!editor.displacedFields?.length && !editor.fieldsHandled)
                          }
                        >
                          Lägg i mitt utkast
                        </button>
                        {(editor.baseRevision !== null ||
                          state.draft.changes.some((change) => change.id === editor.id)) && (
                          <button
                            type="button"
                            aria-describedby="editor-removal"
                            disabled={dirty || editor.version !== state.draft.version}
                            onClick={() =>
                              void action('draft', {
                                version: editor.version,
                                contentVersion: editor.contentVersion,
                                id: editor.id,
                                baseRevision: editor.baseRevision,
                                value: null,
                              })
                            }
                          >
                            Ta bort
                          </button>
                        )}
                      </div>
                      {(editor.baseRevision !== null ||
                        state.draft.changes.some((change) => change.id === editor.id)) && (
                        <ObjectRemovalNotice
                          state={state}
                          objectId={editor.id}
                          id="editor-removal"
                        />
                      )}
                    </fieldset>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        focusAfterClose.current = true;
                        setEditor(null);
                        setDirty(false);
                      }}
                    >
                      Stäng utan att skicka texten
                    </button>
                  </form>
                )}
                {selectedObject && effectiveState && (
                  <section aria-label={`Samband för ${selectedObject.name}`}>
                    <h2>Samband för {selectedObject.name}</h2>
                    <ul>
                      {[...displayedEdges.values()]
                        .filter(
                          (edge) =>
                            edge.sourceId === selectedObject.id ||
                            edge.targetId === selectedObject.id,
                        )
                        .map((edge) => (
                          <li key={edge.id}>
                            <button
                              type="button"
                              disabled={pending || dirty || blocked}
                              onClick={() => selectRelationship(edge)}
                            >
                              {relationshipLabel(
                                edge,
                                effectiveState,
                                displayed,
                                selectedObject.id,
                              )}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}
                {selection?.kind === 'relationship' &&
                  selection.previous &&
                  (() => {
                    const before = state.draft.relationships?.find(
                      (change) => change.id === selection.id,
                    )?.before;
                    return before ? (
                      <section aria-label="Tidigare samband">
                        <h2>Tidigare samband</h2>
                        <p>× Ersätts i utkastet. Detta är det sparade sambandet före ändringen.</p>
                        <p>{relationshipLabel(before, effectiveState ?? state, displayed)}</p>
                        <LifecycleDetails value={before} />
                        <button type="button" onClick={() => setSelection(null)}>
                          Stäng tidigare samband
                        </button>
                      </section>
                    ) : null;
                  })()}
                {edgeEditor && (
                  <RelationshipEditor
                    key={edgeEditor.id}
                    state={effectiveState ?? state}
                    objects={displayed}
                    initial={edgeEditor}
                    disabled={pending || blocked}
                    onSubmit={(body) =>
                      void action('relationship', {
                        ...(body as Record<string, unknown>),
                        contentVersion: edgeEditor.contentVersion,
                      })
                    }
                    onClose={() => {
                      setEdgeEditor(null);
                      setDirty(false);
                    }}
                  />
                )}
              </section>
            </dialog>
          }
          draftSummary={
            <>
              {!hasChanges ? (
                <p className="assistant-empty">Inga förslag i utkastet.</p>
              ) : (
                <ul className="assistant-change-list">
                  {[
                    ...state.draft.changes,
                    ...(state.draft.relationships ?? []),
                    ...(state.draft.objectTypes ?? []),
                    ...(state.draft.relationshipTypes ?? []),
                  ].map((change) => (
                    <li key={change.id}>
                      {change.after ? (change.before ? 'Ändra' : 'Lägg till') : 'Ta bort'}:{' '}
                      {change.after && 'name' in change.after
                        ? change.after.name
                        : change.before && 'name' in change.before
                          ? change.before.name
                          : 'Samband'}
                    </li>
                  ))}
                </ul>
              )}
              {Boolean(conflicts.length || unresolved) && (
                <p className="error">
                  Utkastet har konflikter eller olösta identiteter. Red ut dem före sparande.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(true);
                  requestAnimationFrame(() => document.getElementById('draft-title')?.focus());
                }}
              >
                Granska utkastet
              </button>
            </>
          }
        >
          <div className="household-map-heading">
            <h2>Hushållets karta</h2>
            <span className={`map-state-badge${hasChanges ? ' has-changes' : ''}`}>
              {hasChanges ? 'Med förslag' : 'Sparad'}
            </span>
          </div>
          <nav className="map-presentation" aria-label="Kartans visning">
            <button
              type="button"
              ref={listModeButton}
              aria-pressed={presentation === 'list'}
              onClick={() => setPresentation('list')}
            >
              Lista och detaljer
            </button>
            <button
              type="button"
              className="combined-mode-button"
              aria-pressed={presentation === 'combined'}
              onClick={() => setPresentation('combined')}
            >
              Samlad vy
            </button>
            <button
              type="button"
              className="open-map-button"
              aria-pressed={presentation === 'map'}
              onClick={() => {
                setPresentation('map');
                setDetailsOpen(false);
              }}
            >
              Öppna rymdkartan
            </button>
            {presentation === 'map' && (
              <button
                ref={editMapButton}
                type="button"
                disabled={!selection || pending || blocked}
                onClick={() => {
                  if (selectedObject) edit(selectedObject);
                  else if (selectedEdge) editRelationship(selectedEdge);
                  else setEditorOpen(true);
                }}
              >
                Redigera val
              </button>
            )}
            {presentation === 'map' && (
              <button type="button" onClick={() => setDetailsOpen((open) => !open)}>
                {detailsOpen ? 'Till kartan' : 'Visa detaljer och utkast'}
              </button>
            )}
          </nav>
          <details
            className="map-filter-panel"
            open={presentation !== 'map' || filtersOpen}
            onToggle={(event) => {
              if (presentation === 'map') setFiltersOpen(event.currentTarget.open);
            }}
          >
            <summary>Sök och fokus</summary>
            <div className="map-filters">
              <label htmlFor="object-search">Sök objekt</label>
              <input
                id="object-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <label htmlFor="map-type-filter">Filtrera objekttyp</label>
              <select
                id="map-type-filter"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="">Alla typer</option>
                {effectiveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={showAll}>
                Visa hela rymden
              </button>
              <button
                type="button"
                disabled={selection?.kind !== 'object'}
                onClick={() => {
                  if (selection?.kind === 'object') focusObject(selection.id);
                }}
              >
                Visa objektets kopplingar
              </button>
              <p aria-live="polite">
                {visibleObjects.size} objekt och {visibleEdges.size} samband
                {focusId && (
                  <>
                    {' '}
                    · <span>Fokus: {displayed.get(focusId)?.name}</span>
                  </>
                )}
              </p>
            </div>
          </details>
          <div className="map-workspace">
            <div
              className="map-space"
              hidden={presentation === 'list' || (presentation === 'map' && detailsOpen)}
            >
              <SpatialMap
                revealRequest={revealRequest}
                personal={personal}
                active={presentation !== 'list' && !(presentation === 'map' && detailsOpen)}
                state={effectiveState ?? state}
                objects={visibleObjects}
                relationships={visibleEdges}
                selection={selection}
                disabled={pending || dirty || blocked}
                onSelect={selectObject}
                onEdit={edit}
                onSelectRelationship={selectRelationship}
                onFocus={focusObject}
                onClear={showAll}
                onReset={() => {
                  showAll();
                  setStatus('Översikt återställd. Alla objekt visas.');
                }}
                onRemove={(object) => remove('draft', object)}
              />
            </div>
            <div className="map-content" hidden={presentation === 'map' && !detailsOpen}>
              <div className="map-management">
                <PagedList
                  label="Objekt"
                  className="access-list"
                  key={`objects-${query}-${typeFilter}-${focusId}`}
                  items={[...visibleObjects.values()]}
                  selectedId={selection?.kind === 'object' ? selection.id : undefined}
                  renderItem={(object) => (
                    <li key={object.id}>
                      <button
                        type="button"
                        disabled={pending || dirty || blocked}
                        onClick={() => selectObject(object)}
                      >
                        {object.name}
                      </button>
                      <span> {typeName(object.typeId)}</span>
                      <ProposalSymbol
                        change={state.draft.changes.find((change) => change.id === object.id)}
                      />
                      {selection?.kind === 'object' && selection.id === object.id && (
                        <div className="access-actions">
                          <button
                            type="button"
                            aria-label={`Redigera ${object.name}`}
                            disabled={pending || blocked}
                            onClick={() => edit(object)}
                          >
                            Redigera
                          </button>
                          <button
                            type="button"
                            aria-label={`Ta bort ${object.name}`}
                            aria-describedby={`list-removal-${object.id}`}
                            disabled={
                              pending ||
                              dirty ||
                              blocked ||
                              state.draft.changes.some(
                                (change) => change.id === object.id && !change.after,
                              )
                            }
                            onClick={() => remove('draft', object)}
                          >
                            Ta bort
                          </button>
                          <ObjectRemovalNotice
                            state={state}
                            objectId={object.id}
                            id={`list-removal-${object.id}`}
                          />
                        </div>
                      )}
                      <LifecycleStatus value={object} />
                      {state.draft.changes.some((change) => change.id === object.id) && (
                        <span className="proposed-status">
                          {state.draft.changes.some(
                            (change) => change.id === object.id && !change.after,
                          )
                            ? 'Borttagning i ditt utkast'
                            : 'Förslag i ditt utkast'}
                        </span>
                      )}
                      {!state.draft.changes.some(
                        (change) => change.id === object.id && !change.after,
                      ) && (
                        <details>
                          <summary>Åtgärder för {object.name}</summary>
                          <button
                            type="button"
                            aria-describedby={`actions-removal-${object.id}`}
                            disabled={pending || dirty || blocked}
                            onClick={() => remove('draft', object)}
                          >
                            Ta bort
                          </button>
                          <ObjectRemovalNotice
                            state={state}
                            objectId={object.id}
                            id={`actions-removal-${object.id}`}
                          />
                        </details>
                      )}
                    </li>
                  )}
                />
                <button
                  ref={newButton}
                  type="button"
                  disabled={pending || dirty || blocked}
                  onClick={() => edit()}
                >
                  Nytt objekt
                </button>
                <button
                  type="button"
                  disabled={pending || dirty || blocked}
                  onClick={() => {
                    setEditor(null);
                    setEdgeEditor(null);
                    setMergeGeneration(state.contentVersion);
                    setMergeOpen(true);
                    setDirty(true);
                  }}
                >
                  Slå samman objekt
                </button>
                {mergeOpen && (
                  <ObjectMerge
                    state={state}
                    selectedId={selection?.kind === 'object' ? selection.id : undefined}
                    disabled={pending || blocked}
                    onSubmit={(body) =>
                      void action('merge', {
                        ...(body as Record<string, unknown>),
                        contentVersion: mergeGeneration,
                      })
                    }
                    onClose={() => {
                      setMergeOpen(false);
                      setDirty(false);
                    }}
                  />
                )}
                <h2>Samband</h2>
                <PagedList
                  label="Samband"
                  key={`edges-${query}-${typeFilter}-${focusId}`}
                  items={[...displayedEdges.values()].filter((edge) => visibleEdges.has(edge.id))}
                  selectedId={selection?.kind === 'relationship' ? selection.id : undefined}
                  renderItem={(edge) => (
                    <li key={edge.id}>
                      <button
                        type="button"
                        disabled={pending || dirty || blocked}
                        onClick={() => selectRelationship(edge)}
                      >
                        {relationshipLabel(edge, effectiveState ?? state, displayed)}
                      </button>
                      {selection?.kind === 'relationship' && selection.id === edge.id && (
                        <button
                          type="button"
                          aria-label={`Redigera ${relationshipLabel(edge, effectiveState ?? state, displayed)}`}
                          disabled={pending || blocked}
                          onClick={() => editRelationship(edge)}
                        >
                          Redigera
                        </button>
                      )}
                      <LifecycleStatus value={edge} />
                      {state.draft.relationships?.some((change) => change.id === edge.id) && (
                        <span className="proposed-status">Förslag i ditt utkast</span>
                      )}
                      <details>
                        <summary>
                          Åtgärder för {relationshipLabel(edge, effectiveState ?? state, displayed)}
                        </summary>
                        <button
                          type="button"
                          disabled={pending || dirty || blocked}
                          onClick={() => remove('relationship', edge)}
                        >
                          Ta bort
                        </button>
                      </details>
                    </li>
                  )}
                />
                <button
                  type="button"
                  disabled={pending || dirty || blocked}
                  onClick={() => editRelationship()}
                >
                  Nytt samband
                </button>
                <div className="map-definition-tools">
                  <SaveOperations
                    operations={operations}
                    disabled={pending}
                    onRetry={(operation) =>
                      void save(
                        {
                          operationId: operation.operationId,
                          version: operation.draftVersion,
                          contentVersion: operation.contentVersion,
                          householdId: operation.householdId,
                          userId: operation.userId,
                        },
                        true,
                      )
                    }
                  />
                  <MapHistory
                    generation={state.contentVersion}
                    path={path}
                    version={state.draft.version}
                    disabled={pending || dirty || blocked}
                    onAccessLost={loseAccess}
                    onUndo={(receipt, contentVersion) =>
                      void action('undo', {
                        version: state.draft.version,
                        contentVersion,
                        userId: receipt.userId,
                        operationId: receipt.operationId,
                      })
                    }
                  />
                  <details>
                    <summary>Objekttyper och egna fält</summary>
                    <p>
                      Alla medlemmar kan föreslå ändringar, även i förifyllda typer. Egna fält är
                      inte till för hemliga uppgifter.
                    </p>
                    <ul aria-label="Objekttyper">
                      {effectiveTypes.map((type) => (
                        <li key={type.id}>
                          <button
                            type="button"
                            disabled={pending || dirty || blocked}
                            onClick={() => {
                              const proposal = state.draft.objectTypes?.find(
                                (item) => item.id === type.id,
                              );
                              setEditor(null);
                              setEdgeEditor(null);
                              setDirty(false);
                              setEdgeTypeEditor(null);
                              setTypeEditor({
                                type,
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                baseRevision: proposal
                                  ? (proposal.before?.revision ?? null)
                                  : type.revision,
                              });
                            }}
                          >
                            Ändra typ: {type.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <button
                    type="button"
                    disabled={pending || dirty || blocked}
                    onClick={() => {
                      setEditor(null);
                      setEdgeEditor(null);
                      setDirty(true);
                      setEdgeTypeEditor(null);
                      setTypeEditor({
                        type: {
                          id: crypto.randomUUID(),
                          householdId,
                          revision: 0,
                          name: '',
                          description: '',
                        },
                        version: state.draft.version,
                        contentVersion: state.contentVersion,
                        baseRevision: null,
                      });
                    }}
                  >
                    Ny objekttyp
                  </button>
                  {typeEditor && (
                    <ObjectTypeEditor
                      key={typeEditor.type.id}
                      initial={typeEditor.type}
                      disabled={pending || blocked}
                      stale={
                        typeEditor.version !== state.draft.version ||
                        typeEditor.contentVersion !== state.contentVersion
                      }
                      onDirty={() => setDirty(true)}
                      onSubmit={(value) =>
                        void action('object-type', {
                          version: typeEditor.version,
                          contentVersion: typeEditor.contentVersion,
                          id: typeEditor.type.id,
                          baseRevision: typeEditor.baseRevision,
                          value,
                        })
                      }
                      onClose={() => {
                        setTypeEditor(null);
                        setEdgeTypeEditor(null);
                        setDirty(false);
                      }}
                    />
                  )}
                  <details>
                    <summary>Sambandstyper och riktning</summary>
                    <p>
                      Alla medlemmar kan ändra definitionerna, även förifyllda typer. En ändrad
                      definition kopplar inte om objekten.
                    </p>
                    <ul aria-label="Sambandstyper">
                      {effectiveEdgeTypes.map((type) => (
                        <li key={type.id}>
                          <button
                            type="button"
                            disabled={pending || dirty || blocked}
                            onClick={() => {
                              const proposal = state.draft.relationshipTypes?.find(
                                (item) => item.id === type.id,
                              );
                              setEditor(null);
                              setEdgeEditor(null);
                              setTypeEditor(null);
                              setDirty(false);
                              setEdgeTypeEditor({
                                type,
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                baseRevision: proposal
                                  ? (proposal.before?.revision ?? null)
                                  : type.revision,
                              });
                            }}
                          >
                            Ändra sambandstyp: {type.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <button
                    type="button"
                    disabled={pending || dirty || blocked}
                    onClick={() => {
                      setEditor(null);
                      setEdgeEditor(null);
                      setTypeEditor(null);
                      setDirty(true);
                      setEdgeTypeEditor({
                        type: {
                          id: crypto.randomUUID(),
                          householdId,
                          revision: 0,
                          name: '',
                          description: '',
                        },
                        version: state.draft.version,
                        contentVersion: state.contentVersion,
                        baseRevision: null,
                      });
                    }}
                  >
                    Ny sambandstyp
                  </button>
                  {edgeTypeEditor && (
                    <RelationshipTypeEditor
                      key={edgeTypeEditor.type.id}
                      initial={edgeTypeEditor.type}
                      disabled={pending || blocked}
                      stale={
                        edgeTypeEditor.version !== state.draft.version ||
                        edgeTypeEditor.contentVersion !== state.contentVersion
                      }
                      onDirty={() => setDirty(true)}
                      onSubmit={(value) =>
                        void action('relationship-type', {
                          version: edgeTypeEditor.version,
                          contentVersion: edgeTypeEditor.contentVersion,
                          id: edgeTypeEditor.type.id,
                          baseRevision: edgeTypeEditor.baseRevision,
                          value,
                        })
                      }
                      onClose={() => {
                        setEdgeTypeEditor(null);
                        setDirty(false);
                      }}
                    />
                  )}
                </div>
                <section aria-labelledby="draft-title" className="draft-review">
                  <h2 id="draft-title" tabIndex={-1}>
                    Hela mitt utkast
                  </h2>
                  <p className="muted">
                    Ta bort lägger borttagningen direkt i ditt utkast. Det är ingen permanent
                    radering.
                  </p>
                  {!hasChanges && <p>Inga förslag i utkastet.</p>}
                  {state.draft.relationshipTypes?.map((change) => (
                    <article key={change.id}>
                      <h3>
                        {!change.after
                          ? 'Borttagen sambandstyp'
                          : change.before
                            ? 'Ändrad sambandstyp'
                            : change.restoreRevision !== undefined
                              ? 'Återställ sambandstyp'
                              : 'Ny sambandstyp'}
                        : {change.after?.name ?? change.before?.name}
                      </h3>
                      <h4>Sparat underlag</h4>
                      <RelationshipTypeDetails type={change.before} />
                      <h4>Förslag</h4>
                      <RelationshipTypeDetails type={change.after} />
                      <button
                        type="button"
                        disabled={pending || blocked || dirty}
                        onClick={() =>
                          void action('discard-change', {
                            version: state.draft.version,
                            contentVersion: state.contentVersion,
                            kind: 'relationshipType',
                            id: change.id,
                          })
                        }
                      >
                        Kasta förslaget
                      </button>
                      {conflicts
                        .filter(
                          (conflict) =>
                            conflict.kind === 'relationshipType' && conflict.id === change.id,
                        )
                        .map((conflict) => (
                          <div key={conflict.id}>
                            <h4>Konflikt: sparad sambandstyp</h4>
                            <RelationshipTypeDetails
                              type={conflict.kind === 'relationshipType' ? conflict.current : null}
                            />
                            {conflict.kind === 'relationshipType' && conflict.current && (
                              <>
                                <h4>Mitt förslag med oberoende rättelser bevarade</h4>
                                <RelationshipTypeDetails
                                  type={resolvedRelationshipType(change, conflict.current)}
                                />
                              </>
                            )}
                            <p>
                              Välj definition för utkastet. Oberoende rättelser bevaras när du
                              behåller ditt förslag. Granska hela utkastet före ett nytt sparbesked.
                            </p>
                            <button
                              type="button"
                              disabled={pending || blocked || dirty}
                              onClick={() =>
                                void action('resolve', {
                                  version: state.draft.version,
                                  contentVersion: state.contentVersion,
                                  conflict,
                                  choice: 'saved',
                                })
                              }
                            >
                              Använd sparad sambandstyp
                            </button>
                            <button
                              type="button"
                              disabled={pending || blocked || dirty}
                              onClick={() =>
                                void action('resolve', {
                                  version: state.draft.version,
                                  contentVersion: state.contentVersion,
                                  conflict,
                                  choice: 'proposed',
                                })
                              }
                            >
                              Behåll min sambandstyp
                            </button>
                          </div>
                        ))}
                    </article>
                  ))}
                  {state.draft.objectTypes?.map((change) => (
                    <article key={change.id}>
                      <h3>
                        {!change.after
                          ? 'Borttagen objekttyp'
                          : change.before
                            ? 'Ändrad objekttyp'
                            : change.restoreRevision !== undefined
                              ? 'Återställ objekttyp'
                              : 'Ny objekttyp'}
                        : {change.after?.name ?? change.before?.name}
                      </h3>
                      <h4>Sparat underlag</h4>
                      <ObjectTypeDetails type={change.before} />
                      <h4>Förslag</h4>
                      <ObjectTypeDetails type={change.after} />
                      <button
                        type="button"
                        disabled={pending || blocked || dirty}
                        onClick={() =>
                          void action('discard-change', {
                            version: state.draft.version,
                            contentVersion: state.contentVersion,
                            kind: 'objectType',
                            id: change.id,
                          })
                        }
                      >
                        Kasta förslaget
                      </button>
                      {conflicts
                        .filter(
                          (conflict) => conflict.kind === 'objectType' && conflict.id === change.id,
                        )
                        .map((conflict) => (
                          <div key={conflict.id}>
                            <h4>Konflikt: sparad typdefinition</h4>
                            <ObjectTypeDetails
                              type={conflict.kind === 'objectType' ? conflict.current : null}
                            />
                            <p>
                              Välj definition för utkastet och granska hela utkastet före ett nytt
                              sparbesked.
                            </p>
                            <button
                              type="button"
                              disabled={pending || blocked || dirty}
                              onClick={() =>
                                void action('resolve', {
                                  version: state.draft.version,
                                  contentVersion: state.contentVersion,
                                  conflict,
                                  choice: 'saved',
                                })
                              }
                            >
                              Använd sparad typdefinition
                            </button>
                            <button
                              type="button"
                              disabled={pending || blocked || dirty}
                              onClick={() =>
                                void action('resolve', {
                                  version: state.draft.version,
                                  contentVersion: state.contentVersion,
                                  conflict,
                                  choice: 'proposed',
                                })
                              }
                            >
                              Behåll min typdefinition
                            </button>
                          </div>
                        ))}
                    </article>
                  ))}
                  {state.draft.changes.map((change) => (
                    <article key={change.id}>
                      <h3>
                        {!change.after ? 'Borttagning' : !change.before ? 'Nytt objekt' : 'Ändring'}
                        : {change.after?.name ?? change.before?.name}
                      </h3>
                      {change.merge && (
                        <div>
                          <h4>Sammanslagning</h4>
                          <MergeSourceDetails merge={change.merge} />
                          <p>
                            Identitet {change.merge.absorbedId} tas in i {change.merge.survivorId}.
                          </p>
                          <p>
                            {change.merge.identityConfirmed
                              ? 'Samma företeelse är uttryckligen bekräftad.'
                              : 'Identiteten är inte bekräftad. Hela sparandet är blockerat.'}
                          </p>
                          <p>
                            För att rätta: kasta sammanslagningen, rätta eventuella tidigare förslag
                            och välj objekten igen. Tidigare egna förslag återkommer; övriga förslag
                            finns kvar.
                          </p>
                          <button
                            type="button"
                            disabled={pending || blocked || dirty}
                            onClick={() =>
                              void action('discard-change', {
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                kind: 'object',
                                id: change.id,
                              })
                            }
                          >
                            Kasta sammanslagningen för att rätta
                          </button>
                        </div>
                      )}
                      <h4>Sparat underlag</h4>
                      {details(
                        change.before,
                        change.beforeType ??
                          state.types.find((type) => type.id === change.before?.typeId) ??
                          change.type,
                      )}
                      {change.before &&
                        change.after &&
                        change.before.typeId !== change.after.typeId && (
                          <p>
                            Typbyte: objektets identitet och samband finns kvar. Tidigare fältvärden
                            ersätts av den nya typens uppgifter i förslaget.
                          </p>
                        )}
                      <h4>Förslag</h4>
                      {details(change.after, change.type)}
                      <button
                        type="button"
                        disabled={pending || blocked || dirty}
                        onClick={() =>
                          void action('discard-change', {
                            version: state.draft.version,
                            contentVersion: state.contentVersion,
                            kind: 'object',
                            id: change.id,
                          })
                        }
                      >
                        {mergeFor(state.draft, 'object', change.id)
                          ? 'Kasta hela sammanslagningen'
                          : 'Kasta förslaget'}
                      </button>
                      {conflicts
                        .filter(
                          (conflict) => conflict.kind === 'object' && conflict.id === change.id,
                        )
                        .map((conflict) => (
                          <div key={conflict.id}>{conflictReview(conflict)}</div>
                        ))}
                    </article>
                  ))}
                  {(state.draft.relationships ?? []).map((change) => (
                    <article key={change.id}>
                      <h3>{change.after ? 'Samband' : 'Borttagning av samband'}</h3>
                      <h4>Sparat underlag</h4>
                      <p>
                        {change.before
                          ? relationshipLabel(
                              change.before,
                              state,
                              new Map([
                                ...savedObjects,
                                ...Object.entries(change.objectNames ?? {}).map(
                                  ([id, name]) => [id, { name }] as const,
                                ),
                              ]),
                            )
                          : 'Finns inte i kartan'}
                      </p>
                      {change.before && <LifecycleDetails value={change.before} />}
                      <h4>Förslag</h4>
                      <p>
                        {change.after
                          ? relationshipLabel(
                              change.after,
                              { ...state, relationshipTypes: [change.type] },
                              new Map([
                                ...Object.entries(change.objectNames ?? {}).map(
                                  ([id, name]) => [id, { name }] as const,
                                ),
                                ...displayed,
                              ]),
                            )
                          : 'Borttaget'}
                      </p>
                      {change.after && <LifecycleDetails value={change.after} />}
                      <button
                        type="button"
                        disabled={pending || blocked || dirty}
                        onClick={() =>
                          void action('discard-change', {
                            version: state.draft.version,
                            contentVersion: state.contentVersion,
                            kind: 'relationship',
                            id: change.id,
                          })
                        }
                      >
                        {mergeFor(state.draft, 'relationship', change.id)
                          ? 'Kasta hela sammanslagningen'
                          : 'Kasta förslaget'}
                      </button>
                      {conflicts
                        .filter(
                          (conflict) =>
                            conflict.kind === 'relationship' && conflict.id === change.id,
                        )
                        .map((conflict) => (
                          <div key={conflict.id}>{conflictReview(conflict)}</div>
                        ))}
                    </article>
                  ))}
                  {unresolved && (
                    <p role="alert">
                      Obesvarad identitetsfråga: välj rätt objekt eller uttryckligen ett
                      ospecificerat objekt före sparande.
                    </p>
                  )}
                  {dirty && (
                    <p>
                      Lägg formulärets text i utkastet eller stäng formuläret innan du sparar eller
                      kastar utkastet.
                    </p>
                  )}
                  <div className="access-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={
                        pending ||
                        blocked ||
                        dirty ||
                        !hasChanges ||
                        unresolved ||
                        conflicts.length > 0
                      }
                      onClick={() => {
                        saveAttempt.current = {
                          version: state.draft.version,
                          operationId: crypto.randomUUID(),
                          contentVersion: state.contentVersion,
                          userId: state.userId,
                          householdId,
                        };
                        void save(saveAttempt.current);
                      }}
                    >
                      Spara hela utkastet
                    </button>
                    <button
                      type="button"
                      disabled={pending || blocked || dirty || !hasChanges}
                      onClick={() => void action('discard', { version: state.draft.version })}
                    >
                      Kasta hela utkastet
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </TextAssistant>
      )}
    </section>
  );
}
