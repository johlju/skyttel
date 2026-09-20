import { useEffect, useRef, useState } from 'react';
import type { MapDraft, MapObject, MapState, ObjectValue, SaveReceipt } from '../shared/map.js';

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

  async function action(kind: 'draft' | 'discard' | 'save', body: unknown) {
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
          `Sparat: ${receipt.changes.map((change) => change.after?.name ?? change.before?.name).join(', ')}. Kvitto: ${receipt.operationId}.`,
        );
        saveAttempt.current = null;
        confirmed = true;
        setEditor(null);
        setDirty(false);
        setState(await request<MapState>(path));
      } else {
        const draft = await request<MapDraft>(`${path}/${kind}`, body);
        setState({ ...state, draft });
        setStatus(
          kind === 'draft'
            ? 'Förslaget finns i ditt privata utkast. Kartan är inte ändrad.'
            : 'Utkastet är kastat. Kartan är inte ändrad.',
        );
      }
      setEditor(null);
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
          'Förslaget eller kartan har ändrats. Inget sparades av detta försök. Hämta aktuellt underlag och granska hela utkastet. Kasta utkastet och gör om förslagen om kartan har ändrats.',
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
  function typeName(id: string) {
    return state?.types.find((type) => type.id === id)?.name ?? id;
  }
  function details(value: ObjectValue | null) {
    return value ? (
      <>
        <p>Namn: {value.name}</p>
        <p>Objekttyp: {typeName(value.typeId)}</p>
        <p>Beskrivning: {value.description || 'Ingen beskrivning'}</p>
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
          <section aria-labelledby="draft-title" className="draft-review">
            <h2 id="draft-title">Hela mitt utkast</h2>
            {!state.draft.changes.length && <p>Inga förslag i utkastet.</p>}
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
              </article>
            ))}
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
                disabled={pending || blocked || dirty || !state.draft.changes.length}
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
                disabled={pending || blocked || dirty || !state.draft.changes.length}
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
