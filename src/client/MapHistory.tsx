import { useEffect, useState } from 'react';
import type {
  MapObject,
  ObjectType,
  RelationshipValue,
  SavedRelationshipChange,
  SaveReceipt,
} from '../shared/map.js';
import { FinancialFactsDetails } from './FinancialFacts.js';
import { LifecycleDetails } from './Lifecycle.js';
import { MapRequestError, request } from './map-request.js';
import { MergeSourceDetails } from './ObjectMerge.js';
import { CustomFieldsDetails, ObjectTypeDetails } from './ObjectTypes.js';
import { ProfileImage } from './ProfileImage.js';
import { relationshipLabel } from './RelationshipEditor.js';
import { RelationshipTypeDetails } from './RelationshipTypes.js';

function ObjectDetails({
  value,
  type,
  absent,
  householdId,
}: {
  householdId: string;
  value: MapObject | null;
  type: ObjectType;
  absent: string;
}) {
  return value ? (
    <>
      <p>Namn: {value.name}.</p>
      <ProfileImage householdId={householdId} value={value} />
      <details>
        <summary>Objektets identitet</summary>
        <p>{value.id}</p>
      </details>
      <p>
        Objekttyp: {type.name}. Beskrivning: {value.description || 'Ingen beskrivning'}
      </p>
      {value.identity && (
        <p>
          {value.identity === 'unspecified' ? 'Ospecificerat objekt' : 'Obesvarad identitetsfråga'}
        </p>
      )}
      <FinancialFactsDetails facts={value.financialFacts} />
      <CustomFieldsDetails type={type} values={value.customValues} />
      <LifecycleDetails value={value} />
    </>
  ) : (
    <p>{absent}</p>
  );
}

function EdgeDetails({
  value,
  change,
  absent,
  before = false,
}: {
  value: RelationshipValue | null;
  change: SavedRelationshipChange;
  absent: string;
  before?: boolean;
}) {
  if (!value) return <p>{absent}</p>;
  const names = new Map(
    Object.entries(change.objectNames ?? {}).map(([id, name]) => [id, { name }]),
  );
  return (
    <>
      <p>
        {relationshipLabel(
          value,
          { relationshipTypes: [before ? (change.beforeType ?? change.type) : change.type] },
          names,
        )}
      </p>
      <details>
        <summary>Sambandets objektidentiteter</summary>
        <p>
          Från objekt {value.sourceId}
          {value.targetId !== null && ` till objekt ${value.targetId}`}.
        </p>
      </details>
      <LifecycleDetails value={value} />
    </>
  );
}

export function MapHistory({
  path,
  generation = 1,
  version,
  disabled,
  onUndo,
  onAccessLost,
}: {
  path: string;
  generation?: number;
  version: number;
  disabled: boolean;
  onUndo: (receipt: SaveReceipt, generation: number) => void;
  onAccessLost: () => void;
}) {
  const householdId = decodeURIComponent(path.split('/')[3]);
  const [loadedGeneration, setLoadedGeneration] = useState(generation);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<SaveReceipt[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void request<{ history: SaveReceipt[] }>(
      `${path}/history?version=${version}&reload=${reload}`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setHistory(result.history);
          setLoadedGeneration(generation);
        }
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setHistory(null);
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
          onAccessLost();
        else setError('Historiken kunde inte hämtas. Försök igen.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, path, version, generation, reload, onAccessLost]);
  return (
    <section aria-labelledby="map-history-title" className="draft-review">
      <h2 id="map-history-title">Ändringshistorik</h2>
      <p>
        Genomförda sparanden i hushållet. Ångra sparandet skapar ett nytt privat förslag mot dagens
        karta. Granska och spara hela utkastet för att genomföra det. Saknade typer som behövs för
        återställningen följer med som synliga definitionsförslag.
      </p>
      <button type="button" onClick={() => setOpen(!open)}>
        {open ? 'Dölj historik' : 'Visa historik'}
      </button>
      {open && (
        <>
          {loading && <p>Hämtar historik…</p>}
          {error && (
            <>
              <p role="alert">{error}</p>
              <button type="button" onClick={() => setReload(reload + 1)}>
                Hämta historik igen
              </button>
            </>
          )}
          {history?.length === 0 && <p>Inga genomförda sparanden.</p>}
          {[...(history ?? [])].reverse().map((receipt) => (
            <article key={`${receipt.userId}:${receipt.operationId}`}>
              <h3>
                <time dateTime={receipt.savedAt}>
                  {new Date(receipt.savedAt).toLocaleString('sv-SE')}
                </time>{' '}
                — {receipt.actorName ?? 'Skyttel-användare'}
              </h3>
              <details>
                <summary>Identifiera sparandet och användaren</summary>
                <p>Sparande: {receipt.operationId}</p>
                <p>Skyttel-användare: {receipt.userId}.</p>
                <p>Tidpunkt: {receipt.savedAt}</p>
              </details>
              {receipt.objectTypes?.map((change) => (
                <div key={change.id}>
                  <h4>Objekttyp: {change.after?.name ?? change.before?.name}</h4>
                  <p>Identitet: {change.id}</p>
                  <h5>Före sparandet</h5>
                  <ObjectTypeDetails type={change.before} />
                  <h5>Efter sparandet</h5>
                  {change.after ? (
                    <ObjectTypeDetails type={change.after} />
                  ) : (
                    <p>Borttagen definition</p>
                  )}
                </div>
              ))}
              {receipt.relationshipTypes?.map((change) => (
                <div key={change.id}>
                  <h4>Sambandstyp: {change.after?.name ?? change.before?.name}</h4>
                  <p>Identitet: {change.id}</p>
                  <h5>Före sparandet</h5>
                  <RelationshipTypeDetails type={change.before} />
                  <h5>Efter sparandet</h5>
                  {change.after ? (
                    <RelationshipTypeDetails type={change.after} />
                  ) : (
                    <p>Borttagen definition</p>
                  )}
                </div>
              ))}
              {receipt.changes.map((change) => (
                <div key={change.after?.id ?? change.before?.id}>
                  <h4>Objekt: {change.after?.name ?? change.before?.name}</h4>
                  {change.merge && (
                    <MergeSourceDetails householdId={householdId} merge={change.merge} />
                  )}
                  {change.merge && (
                    <p>
                      Sammanslagning: identitet {change.merge.absorbedId} tas in i{' '}
                      {change.merge.survivorId}. Samma företeelse är uttryckligen bekräftad.
                    </p>
                  )}
                  <h5>Före sparandet</h5>
                  <ObjectDetails
                    householdId={householdId}
                    value={change.before}
                    type={change.beforeType ?? change.type}
                    absent="Fanns inte i kartan"
                  />
                  <h5>Efter sparandet</h5>
                  <ObjectDetails
                    householdId={householdId}
                    value={change.after}
                    type={change.type}
                    absent="Borttaget"
                  />
                </div>
              ))}
              {receipt.relationships?.map((change) => (
                <div key={change.id}>
                  <h4>Samband: {change.type.name}</h4>
                  <p>Identitet: {change.id}</p>
                  <h5>Före sparandet</h5>
                  <EdgeDetails
                    value={change.before}
                    change={change}
                    absent="Fanns inte i kartan"
                    before
                  />
                  <h5>Efter sparandet</h5>
                  <EdgeDetails value={change.after} change={change} absent="Borttaget" />
                </div>
              ))}
              <button
                type="button"
                disabled={disabled || loading}
                onClick={() => onUndo(receipt, loadedGeneration)}
              >
                Ångra sparandet
              </button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
