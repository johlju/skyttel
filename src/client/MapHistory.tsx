import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  MapObject,
  ObjectType,
  RelationshipValue,
  SavedRelationshipChange,
  SaveReceipt,
} from '../shared/map.js';
import { objectIconLabel } from '../shared/object-icons.js';
import { relationshipLabel } from '../shared/relationship-label.js';
import { HistoricalMergeDetails } from './HistoricalMergeDetails.js';
import { HistoricalProperties } from './HistoricalProperties.js';
import { LifecycleDetails } from './Lifecycle.js';
import { MapRequestError, request } from './map-request.js';
import { ObjectTypeDetails } from './ObjectTypes.js';
import { ProfileImage } from './ProfileImage.js';
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
      {value.profileImageId && <p>Ikon: {objectIconLabel(value.iconId, type.name)}</p>}
      <details>
        <summary>Objektets identitet</summary>
        <p>{value.id}</p>
      </details>
      <p>Objekttyp: {type.name}.</p>
      <p>Typens beskrivning: {type.description || 'Ingen beskrivning'}</p>
      {value.identity && (
        <p>
          {value.identity === 'unspecified' ? 'Ospecificerat objekt' : 'Obesvarad identitetsfråga'}
        </p>
      )}
      <HistoricalProperties properties={value.properties} />
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
  const type = before ? (change.beforeType ?? change.type) : change.type;
  const names = new Map(
    Object.entries(change.objectNames ?? {}).map(([id, name]) => [id, { name }]),
  );
  return (
    <>
      <p>{relationshipLabel(value, { relationshipTypes: [type] }, names)}</p>
      <p>Sambandstyp: {type.name}.</p>
      <p>Typens beskrivning: {type.description || 'Ingen beskrivning'}</p>
      <p>Benämning från startobjektet: {type.forwardLabel ?? type.name}</p>
      <p>Benämning från målobjektet: {type.reverseLabel || 'Visar den ursprungliga riktningen'}</p>
      <details>
        <summary>Sambandets objektidentiteter</summary>
        <p>
          Från objekt {value.sourceId} till objekt {value.targetId}.
        </p>
      </details>
      <HistoricalProperties properties={value.properties} />
      <LifecycleDetails value={value} />
    </>
  );
}

export type HistorySelection = { userId: string; operationId: string };

export function historySaveLink(householdId: string, receipt: HistorySelection) {
  const query = new URLSearchParams({
    report: 'history',
    save: receipt.operationId,
    savedBy: receipt.userId,
  });
  return `/households/${encodeURIComponent(householdId)}?${query}`;
}

export function MapHistory({
  path,
  active,
  version,
  selection,
  onSelect,
  onAccessLost,
}: {
  path: string;
  active: boolean;
  version: number;
  selection?: HistorySelection;
  onSelect: (selection: HistorySelection, href: string) => void;
  onAccessLost: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const selectedFocused = useRef<HistorySelection | undefined>(undefined);
  const householdId = decodeURIComponent(path.split('/')[3]);
  const [history, setHistory] = useState<SaveReceipt[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useLayoutEffect(() => {
    if (active) title.current?.focus({ preventScroll: true });
  }, [active]);
  useLayoutEffect(() => {
    if (!active || !history || !selection || selectedFocused.current === selection) return;
    const selected = [...(content.current?.querySelectorAll<HTMLElement>('article') ?? [])].find(
      (item) =>
        item.dataset.save === selection.operationId && item.dataset.savedBy === selection.userId,
    );
    if (!selected) return;
    selectedFocused.current = selection;
    // A delayed read must not overwrite a newer keyboard/focus choice.
    if (document.activeElement === title.current || document.activeElement === document.body) {
      selected.querySelector<HTMLElement>('h3')?.focus();
      selected.scrollIntoView?.({ block: 'nearest' });
    }
  }, [active, history, selection]);
  useEffect(() => {
    if (!active) return;
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
  }, [active, path, version, reload, onAccessLost]);
  return (
    <section aria-labelledby="map-history-title" className="map-history">
      <h2 id="map-history-title" ref={title} tabIndex={-1}>
        Ändringshistorik
      </h2>
      <p>
        Hushållets sparade ändringar, med det senaste sparandet först. Privata utkast visas inte
        här.
      </p>
      <div ref={content} className="history-content">
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
        {(history ?? []).map((receipt) => (
          <article
            className="history-receipt"
            data-save={receipt.operationId}
            data-saved-by={receipt.userId}
            key={`${receipt.userId}:${receipt.operationId}`}
          >
            <h3 tabIndex={-1}>
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
            <a
              href={historySaveLink(householdId, receipt)}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                title.current?.focus({ preventScroll: true });
                onSelect(
                  { operationId: receipt.operationId, userId: receipt.userId },
                  historySaveLink(householdId, receipt),
                );
              }}
            >
              Länk till sparandet
            </a>
            <details
              className="history-changes"
              open={
                selection?.userId === receipt.userId &&
                selection.operationId === receipt.operationId
                  ? true
                  : undefined
              }
            >
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
                    <HistoricalMergeDetails householdId={householdId} merge={change.merge} />
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
          </article>
        ))}
      </div>
    </section>
  );
}
