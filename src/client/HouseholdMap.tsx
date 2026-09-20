import { useEffect, useRef, useState } from 'react';
import { type DraftConflict, draftConflicts } from '../shared/draft-conflicts.js';
import type {
  MapDraft,
  MapObject,
  MapRelationship,
  MapState,
  ObjectValue,
  RelationshipValue,
  SaveReceipt,
} from '../shared/map.js';
import { proposedRelationships } from '../shared/map.js';

import { RelationshipEditor, relationshipLabel } from './RelationshipEditor.js';

class MapRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new MapRequestError(response.status, result.error);
  return result;
}

type Editor = { id: string; version: number; baseRevision: number | null; value: ObjectValue };

export function HouseholdMap({ householdId }: { householdId: string }) {
  const path = `/api/households/${encodeURIComponent(householdId)}/map`;
  const [state, setState] = useState<MapState | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<{
    id: string;
    version: number;
    baseRevision: number | null;
    value: RelationshipValue;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const saveAttempt = useRef<{ version: number; operationId: string } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const [load, setLoad] = useState(0);

  useEffect(() => {
    let active = true;
    setPending(true);
    void request<MapState>(`${path}?reload=${load}`)
      .then((value) => {
        if (!active) return;
        setState(value);
        setBlocked(false);
        setError('');
      })
      .catch(() => {
        if (active) setError('Kartan kunde inte hämtas. Försök igen.');
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [path, load]);

  useEffect(() => {
    if (editor?.id) nameInput.current?.focus();
  }, [editor?.id]);

  async function action(
    kind: 'draft' | 'relationship' | 'discard' | 'save' | 'resolve',
    body: unknown,
  ) {
    if (!state || pending) return;
    setPending(true);
    setError('');
    setStatus('');
    let confirmed = false;
    try {
      if (kind === 'save') {
        const { receipt } = await request<{ receipt: SaveReceipt }>(`${path}/save`, body);
        if (
          receipt.operationId !== saveAttempt.current?.operationId ||
          receipt.draftVersion !== saveAttempt.current.version
        )
          throw new Error('invalid_receipt');
        setStatus(
          `Sparat: ${[...receipt.changes.map((change) => change.after?.name ?? change.before?.name), ...(receipt.relationships ?? []).map((change) => `${change.type.name} (${change.after ? 'samband' : 'borttaget samband'})`)].join(', ')}. Kvitto: ${receipt.operationId}.`,
        );
        saveAttempt.current = null;
        confirmed = true;
        setEditor(null);
        setDirty(false);
        setState(await request<MapState>(path));
      } else {
        const draft = await request<MapDraft & { existingId?: string }>(`${path}/${kind}`, body);
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
              ? `Sambandet finns redan: ${relationshipLabel(edge, latest, objects)}. Ingen dubblett skapades.`
              : 'Det befintliga sambandet har ändrats. Granska aktuellt underlag.',
          );
        } else {
          setState({ ...state, draft });
          setStatus(
            kind === 'resolve'
              ? 'Konfliktvalet finns i ditt privata utkast. Granska hela utkastet och ge ett nytt sparbesked.'
              : kind === 'discard'
                ? 'Utkastet är kastat. Kartan är inte ändrad.'
                : 'Förslaget finns i ditt privata utkast. Kartan är inte ändrad.',
          );
        }
      }
      setEditor(null);
      setEdgeEditor(null);
      setDirty(false);
      setBlocked(false);
      newButton.current?.focus();
    } catch (failure) {
      setBlocked(true);
      if (
        failure instanceof MapRequestError &&
        (failure.status === 401 || failure.status === 403)
      ) {
        setState(null);
        setEditor(null);
        setEdgeEditor(null);
        setStatus('');
        setError(
          'Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.',
        );
      } else if (confirmed) {
        setError(
          'Ändringarna är sparade enligt kvittot, men kartan kunde inte hämtas. Hämta aktuellt underlag.',
        );
      } else if (failure instanceof MapRequestError && failure.status === 409) {
        saveAttempt.current = null;
        setError(
          'Förslaget eller kartan har ändrats. Inget sparades av detta försök. Hämta aktuellt underlag och granska hela utkastet. Välj hur varje konflikt ska lösas.',
        );
      } else {
        setError(
          kind === 'save'
            ? 'Sparandet kunde inte bekräftas. Utfallet är okänt. Försök hämta samma kvitto igen.'
            : 'Ändringen kunde inte bekräftas. Hämta aktuellt underlag innan du fortsätter.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  const conflicts = state ? draftConflicts(state) : [];
  function conflictReview(conflict: DraftConflict) {
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
                <li key={edge.id}>{relationshipLabel(edge, state, displayed)}</li>
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
          !deleted && (
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
            Objektet eller sambandet är borttaget. Skapa ett nytt förslag om det fortfarande behövs.
          </p>
        )}
      </div>
    );
  }

  function edit(object?: MapObject) {
    if (!state) return;
    const proposal = state.draft.changes.find((change) => change.id === object?.id);
    setEditor({
      id: object?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (object?.revision ?? null),
      value: proposal?.after ??
        object ?? { typeId: state.types[0]?.id ?? '', name: '', description: '' },
    });
    setDirty(false);
  }
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
  const savedObjects = new Map((state?.objects ?? []).map((object) => [object.id, object]));
  const hasChanges = Boolean(
    state && (state.draft.changes.length || state.draft.relationships?.length),
  );
  const unresolved =
    state?.draft.changes.some((change) => change.after?.identity === 'unresolved') ||
    state?.draft.relationships?.some((change) => change.after?.knowledge === 'unresolved');
  function editRelationship(edge?: MapRelationship) {
    if (!state) return;
    const proposal = state.draft.relationships?.find((change) => change.id === edge?.id);
    setEditor(null);
    setEdgeEditor({
      id: edge?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (edge?.revision ?? null),
      value: proposal?.after ??
        edge ?? { typeId: '', sourceId: '', targetId: '', knowledge: 'known' },
    });
    setDirty(true);
  }
  function typeName(id: string) {
    return state?.types.find((type) => type.id === id)?.name ?? id;
  }
  function details(value: ObjectValue | null) {
    return value ? (
      <>
        <p>Namn: {value.name}</p>
        <p>Objekttyp: {typeName(value.typeId)}</p>
        <p>Beskrivning: {value.description || 'Ingen beskrivning'}</p>
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
    <div className="household-map">
      <h2>Objekt i hushållet</h2>
      <p>Förslag ligger i ditt privata, beständiga utkast tills du sparar hela utkastet.</p>
      <p className="muted">
        Skriv inte fullständiga konto- eller kortnummer, lösenord, pinkoder, säkerhetskoder eller
        återställningskoder.
      </p>
      <p role="status">{pending ? 'Arbetar…' : status}</p>
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
            saveAttempt.current = null;
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
          onClick={() => void action('save', saveAttempt.current)}
        >
          Hämta samma kvitto igen
        </button>
      )}
      {state && (
        <>
          <label htmlFor="object-search">Sök objekt</label>
          <input
            id="object-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul aria-label="Objekt" className="access-list">
            {[...displayed.values()]
              .filter((object) =>
                object.name.toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')),
              )
              .map((object) => (
                <li key={object.id}>
                  <button type="button" disabled={pending || dirty} onClick={() => edit(object)}>
                    {object.name}
                  </button>
                  <span>
                    {' '}
                    {typeName(object.typeId)}
                    {state.draft.changes.some((change) => change.id === object.id)
                      ? ' — förslag i ditt utkast'
                      : ''}
                  </span>
                </li>
              ))}
          </ul>
          <button
            ref={newButton}
            type="button"
            disabled={pending || dirty || blocked}
            onClick={() => edit()}
          >
            Nytt objekt
          </button>
          {editor && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action('draft', editor);
              }}
            >
              <fieldset disabled={pending || blocked}>
                <legend>Objektets detaljer</legend>
                <label htmlFor="object-name">Objektets namn</label>
                <input
                  ref={nameInput}
                  id="object-name"
                  required
                  maxLength={200}
                  value={editor.value.name}
                  onChange={(event) => {
                    setDirty(true);
                    setEditor({ ...editor, value: { ...editor.value, name: event.target.value } });
                  }}
                />
                <label htmlFor="object-type">Objekttyp</label>
                <select
                  id="object-type"
                  required
                  value={editor.value.typeId}
                  onChange={(event) => {
                    setDirty(true);
                    setEditor({
                      ...editor,
                      value: { ...editor.value, typeId: event.target.value },
                    });
                  }}
                >
                  {state.types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
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
                <p>Texten i formuläret skickas först när du lägger den i utkastet.</p>
                {editor.version !== state.draft.version && (
                  <p role="alert">
                    Formuläret bygger på ett äldre utkast. Kopiera eventuell text du vill behålla,
                    stäng formuläret och öppna objektets aktuella förslag innan du fortsätter.
                  </p>
                )}
                <div className="access-actions">
                  <button type="submit" disabled={editor.version !== state.draft.version}>
                    Lägg i mitt utkast
                  </button>
                  {(editor.baseRevision !== null ||
                    state.draft.changes.some((change) => change.id === editor.id)) && (
                    <button
                      type="button"
                      disabled={dirty || editor.version !== state.draft.version}
                      onClick={() =>
                        void action('draft', {
                          version: editor.version,
                          id: editor.id,
                          baseRevision: editor.baseRevision,
                          value: null,
                        })
                      }
                    >
                      Föreslå borttagning
                    </button>
                  )}
                </div>
              </fieldset>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditor(null);
                  setDirty(false);
                  newButton.current?.focus();
                }}
              >
                Stäng utan att skicka texten
              </button>
            </form>
          )}
          <h2>Samband</h2>
          <ul aria-label="Samband">
            {[...displayedEdges.values()].map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  disabled={pending || dirty || blocked}
                  onClick={() => editRelationship(edge)}
                >
                  {relationshipLabel(edge, state, displayed)}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending || dirty || blocked}
            onClick={() => editRelationship()}
          >
            Nytt samband
          </button>
          {edgeEditor && (
            <RelationshipEditor
              key={edgeEditor.id}
              state={state}
              objects={displayed}
              initial={edgeEditor}
              disabled={pending || blocked}
              onSubmit={(body) => void action('relationship', body)}
              onClose={() => {
                setEdgeEditor(null);
                setDirty(false);
              }}
            />
          )}
          <section aria-labelledby="draft-title" className="draft-review">
            <h2 id="draft-title">Hela mitt utkast</h2>
            {!hasChanges && <p>Inga förslag i utkastet.</p>}
            {state.draft.changes.map((change) => (
              <article key={change.id}>
                <h3>
                  {!change.after ? 'Borttagning' : !change.before ? 'Nytt objekt' : 'Ändring'}:{' '}
                  {change.after?.name ?? change.before?.name}
                </h3>
                <h4>Sparat underlag</h4>
                {details(change.before)}
                <h4>Förslag</h4>
                {details(change.after)}
                {conflicts
                  .filter((conflict) => conflict.kind === 'object' && conflict.id === change.id)
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
                <h4>Förslag</h4>
                <p>
                  {change.after
                    ? relationshipLabel(
                        change.after,
                        state,
                        new Map([
                          ...Object.entries(change.objectNames ?? {}).map(
                            ([id, name]) => [id, { name }] as const,
                          ),
                          ...displayed,
                        ]),
                      )
                    : 'Borttaget'}
                </p>
                {conflicts
                  .filter(
                    (conflict) => conflict.kind === 'relationship' && conflict.id === change.id,
                  )
                  .map((conflict) => (
                    <div key={conflict.id}>{conflictReview(conflict)}</div>
                  ))}
              </article>
            ))}
            {unresolved && (
              <p role="alert">
                Obesvarad identitetsfråga: välj rätt objekt eller uttryckligen ett ospecificerat
                objekt före sparande.
              </p>
            )}
            {dirty && (
              <p>
                Lägg formulärets text i utkastet eller stäng formuläret innan du sparar eller kastar
                utkastet.
              </p>
            )}
            <div className="access-actions">
              <button
                type="button"
                className="primary"
                disabled={
                  pending || blocked || dirty || !hasChanges || unresolved || conflicts.length > 0
                }
                onClick={() => {
                  saveAttempt.current = {
                    version: state.draft.version,
                    operationId: crypto.randomUUID(),
                  };
                  void action('save', saveAttempt.current);
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
        </>
      )}
    </div>
  );
}
