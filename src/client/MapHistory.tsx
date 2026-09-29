import { useEffect, useId, useRef, useState } from 'react';
import type {
  MapObject,
  ObjectType,
  RelationshipValue,
  SavedRelationshipChange,
  SaveReceipt,
} from '../shared/map.js';
import { LifecycleDetails } from './Lifecycle.js';
import { MapRequestError, request } from './map-request.js';
import { MergeSourceDetails } from './ObjectMerge.js';
import { ObjectPropertiesDetails } from './ObjectProperties.js';
import { CustomFieldsDetails, ObjectTypeDetails } from './ObjectTypes.js';
import { ProfileImage } from './ProfileImage.js';
import { relationshipLabel } from './RelationshipEditor.js';
import { RelationshipTypeDetails } from './RelationshipTypes.js';
import './map-history.css';

function ReceiptOverview({ receipt }: { receipt: SaveReceipt }) {
  const counts = [
    [receipt.changes.length, 'objekt', 'objekt'],
    [receipt.relationships?.length ?? 0, 'samband', 'samband'],
    [receipt.objectTypes?.length ?? 0, 'objekttyp', 'objekttyper'],
    [receipt.relationshipTypes?.length ?? 0, 'sambandstyp', 'sambandstyper'],
  ] as const;
  return (
    <div className="history-overview">
      <p className="history-counts">
        {counts
          .filter(([count]) => count > 0)
          .map(([count, singular, plural]) => `${count} ${count === 1 ? singular : plural}`)
          .join(' · ')}
      </p>
      <ul>
        {receipt.changes.map((change) => (
          <li key={`object:${change.after?.id ?? change.before?.id}`}>
            <span>
              {change.merge
                ? 'Sammanslagning'
                : !change.before
                  ? 'Tillagt objekt'
                  : !change.after
                    ? 'Borttaget objekt'
                    : 'Ändrat objekt'}
            </span>
            <strong>{change.after?.name ?? change.before?.name}</strong>
          </li>
        ))}
        {receipt.relationships?.map((change) => {
          const value = change.after ?? change.before;
          return (
            <li key={`relationship:${change.id}`}>
              <span>
                {!change.before
                  ? 'Tillagt samband'
                  : !change.after
                    ? 'Borttaget samband'
                    : 'Ändrat samband'}
              </span>
              <strong>
                {value
                  ? relationshipLabel(
                      value,
                      {
                        relationshipTypes: [
                          change.after ? change.type : (change.beforeType ?? change.type),
                        ],
                      },
                      new Map(
                        Object.entries(change.objectNames ?? {}).map(([id, name]) => [
                          id,
                          { name },
                        ]),
                      ),
                    )
                  : change.type.name}
              </strong>
            </li>
          );
        })}
        {(
          [
            ['object', receipt.objectTypes ?? []],
            ['relationship', receipt.relationshipTypes ?? []],
          ] as const
        ).flatMap(([kind, changes]) =>
          changes.map((change) => (
            <li key={`${kind}:${change.id}`}>
              <span>
                {!change.before
                  ? 'Tillagd typdefinition'
                  : !change.after
                    ? 'Borttagen typdefinition'
                    : 'Ändrad typdefinition'}
              </span>
              <strong>{change.after?.name ?? change.before?.name}</strong>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

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
      <ProfileImage householdId={householdId} value={value} typeName={type.name} />
      <details>
        <summary>Objektets identitet</summary>
        <p>{value.id}</p>
      </details>
      <p>Objekttyp: {type.name}.</p>
      {value.identity && (
        <p>
          {value.identity === 'unspecified' ? 'Ospecificerat objekt' : 'Obesvarad identitetsfråga'}
        </p>
      )}
      <ObjectPropertiesDetails type={type} value={value} showHidden />
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
      <CustomFieldsDetails
        type={before ? (change.beforeType ?? change.type) : change.type}
        values={value.customValues}
        showHidden
      />
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
  const contentId = useId();
  const title = useRef<HTMLHeadingElement>(null);
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
    <section aria-labelledby="map-history-title" className="map-history">
      <h2 id="map-history-title" ref={title} tabIndex={-1}>
        Ändringshistorik
      </h2>
      <p>
        Hushållets sparade ändringar, med det senaste sparandet först. Privata utkast visas inte
        här.
      </p>
      <p>Ångring blir ett privat förslag. Du väljer sedan om du vill spara hela utkastet.</p>
      <details className="history-help">
        <summary>Så fungerar ångring</summary>
        <p>
          Ångra sparandet skapar ett nytt privat förslag mot dagens karta. Oberoende senare
          ändringar bevaras. Spara hela utkastet när du vill genomföra förslaget. Saknade typer som
          behövs för återställningen följer med som synliga definitionsförslag.
        </p>
      </details>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Dölj historik' : 'Visa historik'}
      </button>
      <div id={contentId} className="history-content" hidden={!open}>
        <p aria-live="polite" className="history-state">
          {loading ? 'Hämtar historik…' : history?.length === 0 ? 'Inga genomförda sparanden.' : ''}
        </p>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => {
                title.current?.focus();
                setReload(reload + 1);
              }}
            >
              Hämta historik igen
            </button>
          </>
        )}
        {[...(history ?? [])].reverse().map((receipt) => (
          <article className="history-receipt" key={`${receipt.userId}:${receipt.operationId}`}>
            <h3>
              <time dateTime={receipt.savedAt}>
                {new Date(receipt.savedAt).toLocaleString('sv-SE')}
              </time>{' '}
              — {receipt.actorName ?? 'Skyttel-användare'}
            </h3>
            <ReceiptOverview receipt={receipt} />
            <details>
              <summary>Identifiera sparandet och användaren</summary>
              <p>Sparande: {receipt.operationId}</p>
              <p>Skyttel-användare: {receipt.userId}.</p>
              <p>Tidpunkt: {receipt.savedAt}</p>
            </details>
            <details className="history-changes">
              <summary>Visa ändringarna</summary>
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
            </details>
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => onUndo(receipt, loadedGeneration)}
            >
              Ångra sparandet
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
