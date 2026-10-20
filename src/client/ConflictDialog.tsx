import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  type ConflictChoices,
  type ConflictProperty,
  type ConflictSide,
  combineConflictProperties,
  conflictBasis,
  conflictChange,
  conflictCombinationError,
  conflictProperties,
  conflictPropertyLabel,
  conflictPropertyValue,
  conflictValueText,
  sameConflictValue,
} from '../shared/conflict-properties.js';
import {
  conflictRemovalError,
  conflictRemovalPlan,
  conflictRemovalProperties,
} from '../shared/conflict-removal.js';
import { specialConflict } from '../shared/conflict-special.js';
import { removedConflictDefinition } from '../shared/definition-restoration.js';
import { type DraftConflict, draftConflicts } from '../shared/draft-conflicts.js';
import type { MapState, ObjectType, RelationshipValue } from '../shared/map.js';
import { definitionPropertyValues } from './DraftProposalDetails.js';
import { relationshipPropertyValues } from './RelationshipReadDetails.js';
import {
  type AppliedConflictResolution,
  type ConflictResolution,
  useConflictResolution,
} from './use-conflict-resolution.js';

export type { ConflictResolution } from './use-conflict-resolution.js';

import { relationshipLabel } from '../shared/relationship-label.js';
import { trapDialogTab } from './modal-focus.js';
import { SpecialConflictDetails, SpecialConflictResult } from './SpecialConflictDetails.js';
import './conflict-dialog.css';

const sideNames = { saved: 'Sparat i kartan nu', proposed: 'Ditt förslag' };
const kindNames = {
  object: 'Objekt',
  relationship: 'Samband',
  objectType: 'Objekttyp',
  relationshipType: 'Sambandstyp',
};
const keyFor = (conflict: DraftConflict) => `${conflict.kind}:${conflict.id}`;
export function ConflictDialog({
  state,
  open,
  initialKey,
  disabled,
  onClose,
  onResolve,
  onRefresh,
  onStatus,
  onUnknownChange,
  onCorrectRelationship,
}: {
  state: MapState;
  open: boolean;
  initialKey?: string;
  disabled: boolean;
  onClose: () => void;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
  onRefresh: () => Promise<MapState>;
  onStatus?: (message: string) => void;
  onUnknownChange?: (unknown: boolean) => void;
  onCorrectRelationship?: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const caseHeading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const prefix = useId();
  const live = draftConflicts(state);
  const [entries, setEntries] = useState(live.map((conflict) => ({ conflict, state })));
  const [selectedKey, setSelectedKey] = useState(initialKey ?? '');
  const [choices, setChoices] = useState<Record<string, ConflictChoices>>({});
  const [resolved, setResolved] = useState<Record<string, AppliedConflictResolution>>({});
  const [comparisonPending, setComparisonPending] = useState(false);
  const [staleKeys, setStaleKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const report = useCallback(
    (message: string) => {
      setStatus(message);
      onStatus?.(message);
    },
    [onStatus],
  );
  const resolution = useConflictResolution({
    onResolve,
    onRefresh,
    onStatus: report,
    onApplied: (result) => setResolved((previous) => ({ ...previous, [result.key]: result })),
    onStale: (key) => setStaleKeys((previous) => new Set([...previous, key])),
  });
  const { unknown } = resolution;
  useEffect(() => onUnknownChange?.(unknown), [unknown, onUnknownChange]);
  const pending = resolution.pending || comparisonPending;
  useEffect(() => {
    const next = [...entries];
    let changed = false;
    for (const conflict of draftConflicts(state)) {
      const index = next.findIndex((entry) => keyFor(entry.conflict) === keyFor(conflict));
      if (index < 0) {
        next.push({ conflict, state });
        changed = true;
      } else if (
        !sameConflictValue(
          conflictBasis(next[index].state, next[index].conflict),
          conflictBasis(state, conflict),
        )
      ) {
        // Keep the reviewed basis until the user explicitly asks for a current comparison.
        const entryKey = keyFor(conflict);
        if (!staleKeys.has(entryKey)) {
          setStaleKeys((previous) => new Set([...previous, entryKey]));
          setResolved((previous) =>
            Object.fromEntries(Object.entries(previous).filter(([key]) => key !== entryKey)),
          );
          report(
            'Underlaget har ändrats. Visa aktuell jämförelse innan du bekräftar. Opåverkade val finns kvar.',
          );
        }
      } else if (next[index].state !== state) {
        next[index] = { conflict, state };
        changed = true;
      }
    }
    if (changed) setEntries(next);
  }, [state, entries, staleKeys, report]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Read current data once per explicit opening; background renders must not start another opening request.
  useEffect(() => {
    if (!open) return;
    let current = true;
    setComparisonPending(true);
    void onRefresh()
      .catch(() => {
        if (current) {
          setStaleKeys(new Set(entries.map((entry) => keyFor(entry.conflict))));
          report(
            'Aktuellt underlag kunde inte hämtas. Kontrollera jämförelsen innan du bekräftar.',
          );
        }
      })
      .finally(() => {
        if (current) setComparisonPending(false);
      });
    return () => {
      current = false;
    };
  }, [open]);
  useLayoutEffect(() => {
    const modal = dialog.current;
    if (open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal?.showModal();
      heading.current?.focus({ preventScroll: true });
      if (initialKey) setSelectedKey(initialKey);
    } else if (modal?.open) {
      modal.close();
      const target = [
        opener.current,
        ...document.querySelectorAll<HTMLElement>('.workspace-tools button'),
      ].find(
        (element) =>
          element?.isConnected &&
          element.matches('button, a[href], input, select, textarea, [tabindex]') &&
          element.getClientRects().length &&
          !element.matches(':disabled') &&
          !element.closest('[hidden], [inert]') &&
          getComputedStyle(element).visibility === 'visible',
      );
      target?.focus({ preventScroll: true });
    }
  }, [open, initialKey]);
  useLayoutEffect(() => {
    const modal = dialog.current;
    return () => modal?.close();
  }, []);
  const entry = entries.find((entry) => keyFor(entry.conflict) === selectedKey) ?? entries[0];
  const noLongerConflicted = Boolean(
    entry && !live.some((conflict) => keyFor(conflict) === keyFor(entry.conflict)),
  );
  useEffect(() => {
    if (
      open &&
      entry &&
      noLongerConflicted &&
      !pending &&
      !unknown &&
      !resolved[keyFor(entry.conflict)]
    )
      report('Konflikten finns inte längre i aktuellt underlag. Granska ditt aktuella utkast.');
  }, [open, entry, noLongerConflicted, pending, unknown, resolved, report]);
  if (!entry) return null;
  const { conflict, state: comparison } = entry;
  const key = keyFor(conflict);
  const stale = staleKeys.has(key);
  const comparisonNoLongerNeeded = noLongerConflicted && !pending && !unknown && !resolved[key];
  const change = conflictChange(comparison, conflict);
  const special = specialConflict(comparison, conflict);
  const removal = special?.kind === 'own-removal';
  const restoration = special?.kind === 'removed-definition';
  const removedDefinition = restoration
    ? removedConflictDefinition(comparison, conflict)
    : undefined;
  const fields = removal
    ? conflictRemovalProperties(comparison, conflict)
    : conflictProperties(comparison, conflict);
  const selected = choices[key] ?? {};
  const differing = fields.filter(
    (field) => !sameConflictValue(field.saved, field.proposed) && !field.automatic,
  );
  const remaining = differing.filter((field) => !selected[field.key]).length;
  const value = combineConflictProperties(fields, selected);
  const invalid = removal
    ? conflictRemovalError(comparison, conflict, selected)
    : conflictCombinationError(comparison, conflict, value);
  const blocked =
    !fields.length ||
    (!removal &&
      Boolean(
        conflict.duplicates ||
          conflict.missingEndpoints ||
          conflict.type === null ||
          conflict.connections,
      ));
  const actor = comparison.conflictActors?.[key];
  const proposedAt = change && 'proposedAt' in change ? change.proposedAt : undefined;
  const savedAfterProposal = (savedAt: string) =>
    Boolean(proposedAt && Date.parse(savedAt) > Date.parse(proposedAt));
  const person = actor?.name ?? 'En annan användare';
  const name = (c: DraftConflict, source: MapState) => {
    const proposal = conflictChange(source, c);
    if (c.kind === 'relationship') {
      const objects = new Map<string, { name: string }>(
        Object.entries(
          proposal && 'objectNames' in proposal ? (proposal.objectNames ?? {}) : {},
        ).map(([id, name]) => [id, { name }]),
      );
      for (const object of source.objects) objects.set(object.id, object);
      const types = [
        ...source.relationshipTypes,
        ...(proposal && 'type' in proposal ? [proposal.type] : []),
      ];
      const edge = proposal?.after ?? proposal?.before;
      return edge && 'sourceId' in edge
        ? relationshipLabel(edge, { relationshipTypes: types }, objects)
        : c.id;
    }
    const item = proposal?.after ?? proposal?.before ?? c.current;
    return item && 'name' in item ? item.name : c.id;
  };
  function choose(field: string, side: ConflictSide) {
    setChoices((previous) => ({ ...previous, [key]: { ...previous[key], [field]: side } }));
  }
  function propertyValue(field: ConflictProperty, value: unknown) {
    if (field.key === 'relationship' && value && typeof value === 'object') {
      const edge = value as RelationshipValue;
      const type =
        comparison.relationshipTypes.find((type) => type.id === edge.typeId) ??
        (change && 'type' in change && change.type.id === edge.typeId ? change.type : undefined);
      return (
        <>
          {[
            ...relationshipPropertyValues(
              edge,
              type,
              new Map(comparison.objects.map((object) => [object.id, object])),
              change && 'objectNames' in change ? change.objectNames : undefined,
            ),
          ].map(([key, property]) => (
            <span key={key} className="cp-definition-property">
              <strong>{property.label}: </strong>
              {property.value}
            </span>
          ))}
        </>
      );
    }
    if (field.key === 'definition' && value)
      return (
        <>
          {definitionPropertyValues(value as ObjectType)?.map((property) => (
            <span key={property.key} className="cp-definition-property">
              <strong>{property.label}: </strong>
              {property.value}
            </span>
          ))}
        </>
      );
    const text = conflictValueText(comparison, field, value);
    return (
      <>
        {text}
        {field.key === 'profileImageId' && typeof value === 'string' && conflict.current && (
          <img
            className="cp-profile-image"
            width="96"
            height="96"
            src={`/api/households/${encodeURIComponent(conflict.current.householdId)}/profile-images/${encodeURIComponent(value)}`}
            alt={text}
          />
        )}
      </>
    );
  }
  function selectConflict(entryKey: string) {
    if (pending || unknown) return;
    setSelectedKey(entryKey);
    setStatus('');
    requestAnimationFrame(() => caseHeading.current?.focus());
  }
  function apply() {
    if (
      pending ||
      noLongerConflicted ||
      !value ||
      remaining ||
      invalid ||
      blocked ||
      stale ||
      unknown ||
      disabled
    )
      return;
    caseHeading.current?.focus();
    if (restoration) {
      const discarded = selected.definition === 'saved';
      if (!change?.after || (!discarded && !removedDefinition)) return;
      const after = removedDefinition
        ? { ...change.after, revision: removedDefinition.revision + 1 }
        : change.after;
      const authority = removedDefinition
        ? { contentVersion: comparison.contentVersion, definition: removedDefinition }
        : undefined;
      void resolution.apply({
        key,
        comparison,
        discard: discarded,
        value: discarded ? {} : { definition: after },
        resolution: {
          conflict,
          command: 'definition-choice',
          definitionChoice: selected.definition,
          basis: conflictBasis(comparison, conflict),
        },
        effects: [
          {
            target: conflict,
            ...(discarded
              ? { kind: 'discard' as const }
              : { kind: 'retain' as const, before: null, after, restoration: authority }),
          },
        ],
      });
      return;
    }
    if (removal) {
      const result = conflictRemovalPlan(comparison, conflict, selected);
      if (!result) return;
      void resolution.apply({
        key,
        comparison,
        discard: false,
        value,
        resolution: {
          conflict,
          command: 'removal-choices',
          removalChoices: selected,
          basis: conflictBasis(comparison, conflict),
        },
        effects: result.effects,
      });
      return;
    }
    void resolution.apply({
      key,
      resolution: { conflict, choices: selected, basis: conflictBasis(comparison, conflict) },
      value,
      comparison,
      discard: fields.every(
        (field) =>
          sameConflictValue(field.saved, field.proposed) ||
          (field.automatic ?? selected[field.key]) === 'saved',
      ),
    });
  }
  async function refreshComparison() {
    if (pending || unknown) return;
    caseHeading.current?.focus({ preventScroll: true });
    setComparisonPending(true);
    try {
      const latest = await onRefresh();
      const latestConflicts = draftConflicts(latest);
      setChoices((previous) =>
        Object.fromEntries(
          entries.map((entry) => {
            const entryKey = keyFor(entry.conflict);
            const current = latestConflicts.find((conflict) => keyFor(conflict) === entryKey);
            if (!current) return [entryKey, previous[entryKey] ?? {}];
            const reviewed = conflictProperties(entry.state, entry.conflict);
            const fresh = conflictProperties(latest, current);
            const retained = Object.entries(previous[entryKey] ?? {}).filter(([key]) => {
              const before = reviewed.find((field) => field.key === key);
              const after = fresh.find((field) => field.key === key);
              return (
                before &&
                after &&
                sameConflictValue(before.saved, after.saved) &&
                sameConflictValue(before.proposed, after.proposed)
              );
            });
            return [entryKey, Object.fromEntries(retained)];
          }),
        ),
      );
      setEntries((previous) =>
        previous.map((entry) => {
          const current = latestConflicts.find(
            (conflict) => keyFor(conflict) === keyFor(entry.conflict),
          );
          return current ? { state: latest, conflict: current } : entry;
        }),
      );
      setStaleKeys(new Set());
      report('Aktuell jämförelse visas. Opåverkade val finns kvar.');
    } catch {
      report('Aktuellt underlag kunde inte hämtas. Dina val finns kvar. Försök igen.');
    } finally {
      setComparisonPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="cp-dialog cp-product"
      aria-labelledby={`${prefix}-title`}
      aria-describedby={`${prefix}-subtitle`}
      onKeyDown={trapDialogTab}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <header className="cp-top">
        <div>
          <small>Ditt utkast · {live.length} olösta</small>
          <div className="cp-title-line">
            <h1 id={`${prefix}-title`} ref={heading} tabIndex={-1}>
              Granska konflikter
            </h1>
            <p id={`${prefix}-subtitle`}>Valen ändrar ditt utkast. Kartan sparas separat.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          aria-label="Stäng konfliktdialogen"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="cp-body">
        <nav className="cp-case-list" aria-label="Alla konflikter">
          {entries.map((entry) => (
            <button
              key={keyFor(entry.conflict)}
              type="button"
              disabled={pending || unknown}
              aria-current={keyFor(entry.conflict) === key ? 'true' : undefined}
              onClick={() => selectConflict(keyFor(entry.conflict))}
            >
              <span className="cp-case-text">
                <small>{kindNames[entry.conflict.kind]}</small>
                <span>{name(entry.conflict, entry.state)}</span>
              </span>
              {resolved[keyFor(entry.conflict)] && (
                <>
                  <span className="cp-resolved-mark" aria-hidden="true">
                    ✓
                  </span>
                  <span className="cp-visually-hidden">Vald lösning</span>
                </>
              )}
            </button>
          ))}
        </nav>
        <article className="cp-detail">
          <small>
            {kindNames[conflict.kind]} · {entries.indexOf(entry) + 1} av {entries.length}
          </small>
          <h2 ref={caseHeading} tabIndex={-1}>
            {name(conflict, comparison)}
          </h2>
          {!comparisonNoLongerNeeded && special ? (
            <p>{special.reason}</p>
          ) : (
            !comparisonNoLongerNeeded && (
              <p>
                Ditt förslag skiljer sig från det som är sparat i kartan nu.{' '}
                {actor && savedAfterProposal(actor.savedAt)
                  ? `${person} sparade ändringar efter att du gjorde ditt förslag, men innan du hann spara det.`
                  : actor
                    ? `${person} sparade det aktuella underlaget.`
                    : 'Det sparade underlaget skiljer sig från ditt förslag.'}
              </p>
            )
          )}
          {resolved[key] ? (
            <section className="cp-preview">
              <h3>
                {resolved[key].removed && special?.kind === 'removed'
                  ? '✓ Ditt ändringsförslag har kastats'
                  : resolved[key].removed && restoration
                    ? '✓ Typdefinitionen förblir borttagen'
                    : resolved[key].removed && special && !removal
                      ? `✓ ${conflict.kind === 'object' ? 'Objektet' : 'Sambandet'} har tagits bort ur ditt utkast`
                      : resolved[key].removed && !removal
                        ? '✓ Förslaget har tagits bort ur ditt utkast'
                        : '✓ Valen finns i ditt utkast'}
              </h3>
              {resolved[key].removed && special && !restoration && !removal ? (
                <SpecialConflictResult kind={conflict.kind} special={special} confirmed />
              ) : (
                <dl className="cp-fields">
                  {fields.map((field) => (
                    <div key={field.key}>
                      <dt>{conflictPropertyLabel(field, selected[field.key])}</dt>
                      <dd>
                        {propertyValue(
                          field,
                          conflictPropertyValue(resolved[key].value, field.key),
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <button
                type="button"
                disabled={pending || unknown}
                onClick={() =>
                  selectConflict(
                    keyFor(entries[(entries.indexOf(entry) + 1) % entries.length].conflict),
                  )
                }
              >
                Nästa konflikt
              </button>
            </section>
          ) : comparisonNoLongerNeeded ? (
            <section className="cp-preview">
              <h3>Aktuellt underlag</h3>
              <p>
                Granska ditt aktuella utkast innan du sparar. Den tidigare jämförelsen behöver inte
                bekräftas igen.
              </p>
            </section>
          ) : special && !removal && !restoration ? (
            <SpecialConflictDetails
              state={comparison}
              conflict={conflict}
              special={special}
              disabled={pending || stale || unknown || disabled}
              pending={pending}
              onClose={onClose}
              onCorrect={
                conflict.kind === 'relationship' &&
                conflict.missingEndpoints?.length &&
                onCorrectRelationship
                  ? () => onCorrectRelationship(conflict.id)
                  : undefined
              }
              onApply={() => {
                caseHeading.current?.focus({ preventScroll: true });
                void resolution.apply({
                  key,
                  comparison,
                  value: {},
                  discard: true,
                  resolution: {
                    conflict,
                    command: 'discard-proposal',
                    basis: conflictBasis(comparison, conflict),
                  },
                });
              }}
            />
          ) : (
            <>
              {blocked ? (
                <div className="cp-warning">
                  <p>
                    Den här konflikten behöver rättas innan egenskapsval kan läggas i utkastet. Ditt
                    förslag ligger kvar.
                  </p>
                  <button type="button" disabled={pending} onClick={onClose}>
                    Stäng konfliktfönstret
                  </button>
                </div>
              ) : (
                <p>
                  Välj ett värde för varje egenskap. Du kan klicka på hela rutan och blanda vänster
                  och höger sida.
                </p>
              )}
              {restoration && !removedDefinition && (
                <p>
                  Typdefinitionen kan inte återställas med det aktuella underlaget. Välj den sparade
                  sidans Borttaget för att kasta ditt förslag.
                </p>
              )}
              <div className="cp-comparison">
                {(['saved', 'proposed'] as const).map((side) => (
                  <section key={side} aria-label={sideNames[side]}>
                    <h3>{sideNames[side]}</h3>
                    <div className="cp-pick-fields">
                      {fields.map((field) => {
                        const same = sameConflictValue(field.saved, field.proposed);
                        if (same || field.automatic)
                          return (
                            <div key={field.key} className="cp-field-same">
                              <span className="cp-field-name">
                                {conflictPropertyLabel(field, side)}
                              </span>
                              <span className="cp-field-value">
                                {propertyValue(field, field[side])}
                              </span>
                              <span className="cp-tag">
                                {field.automatic && !same
                                  ? 'Oberoende ändring · kombineras'
                                  : 'Samma värde · inget val behövs'}
                              </span>
                            </div>
                          );
                        const overlap =
                          !sameConflictValue(field.saved, field.before) &&
                          !sameConflictValue(field.proposed, field.before);
                        const picked = selected[field.key] === side;
                        const propertyActor =
                          removal && field.key === conflict.kind
                            ? actor
                            : comparison.conflictPropertyActors?.[key]?.[field.key];
                        return (
                          <button
                            key={field.key}
                            className={`cp-field-choice${overlap ? ' cp-overlap' : !sameConflictValue(field[side], field.before) ? ' cp-change' : ''}`}
                            type="button"
                            aria-label={`${conflictPropertyLabel(field, side)}: ${sideNames[side]} – ${conflictValueText(comparison, field, field[side])}`}
                            aria-pressed={picked}
                            disabled={
                              blocked ||
                              pending ||
                              stale ||
                              unknown ||
                              disabled ||
                              (restoration && side === 'proposed' && !removedDefinition)
                            }
                            onClick={() => choose(field.key, side)}
                          >
                            <span className="cp-field-name">
                              {conflictPropertyLabel(field, side)}
                            </span>
                            {side === 'saved' && !sameConflictValue(field.saved, field.before) && (
                              <span className="cp-tag">
                                {propertyActor ? (
                                  <>
                                    {propertyActor.name} sparade ett nytt värde
                                    {overlap && savedAfterProposal(propertyActor.savedAt)
                                      ? ' efter att du började ändra den här uppgiften.'
                                      : '.'}
                                  </>
                                ) : (
                                  'Ett nytt värde har sparats'
                                )}
                              </span>
                            )}
                            {side === 'proposed' &&
                              !sameConflictValue(field.proposed, field.before) && (
                                <span className="cp-tag">Ditt föreslagna värde</span>
                              )}
                            {sameConflictValue(field[side], field.before) && (
                              <span className="cp-tag">Oförändrat från tidigare</span>
                            )}
                            <span className="cp-field-value">
                              {propertyValue(field, field[side])}
                            </span>
                            {(field.key.startsWith('properties.') ||
                              field.key === 'propertiesOrder') && (
                              <span>Tidigare: {propertyValue(field, field.before)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {!blocked && (
                <>
                  <p>
                    {remaining
                      ? `${remaining} av ${differing.length} egenskaper återstår att välja.`
                      : 'Alla egenskaper har ett valt värde.'}
                  </p>
                  {invalid && (
                    <div className="cp-warning" role="alert">
                      <strong>Valen fungerar inte tillsammans</strong>
                      <p>{invalid}</p>
                    </div>
                  )}
                  <section className="cp-preview" aria-label="Resultat av valen">
                    <h3>Efter dina val</h3>
                    {restoration && selected.definition === 'proposed' && (
                      <p>Typdefinitionen föreslås återställas med din ändring.</p>
                    )}
                    <dl className="cp-fields">
                      {fields.map((field) => (
                        <div key={field.key}>
                          <dt>{conflictPropertyLabel(field, selected[field.key])}</dt>
                          <dd>
                            {value
                              ? propertyValue(field, conflictPropertyValue(value, field.key))
                              : field.automatic
                                ? propertyValue(field, field[field.automatic])
                                : sameConflictValue(field.saved, field.proposed)
                                  ? propertyValue(field, field.saved)
                                  : selected[field.key]
                                    ? propertyValue(field, field[selected[field.key]])
                                    : 'Välj ett värde'}
                            {!sameConflictValue(field.saved, field.proposed) &&
                              selected[field.key] && (
                                <small> · {sideNames[selected[field.key]]}</small>
                              )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p>Övriga förslag i utkastet finns kvar.</p>
                  </section>
                  <footer className="cp-actions">
                    <button
                      className="cp-primary"
                      type="button"
                      disabled={Boolean(
                        remaining || invalid || pending || stale || unknown || disabled,
                      )}
                      onClick={() => void apply()}
                    >
                      Lägg valen i utkastet
                    </button>
                  </footer>
                </>
              )}
            </>
          )}
          {stale && !noLongerConflicted && !resolved[key] && (
            <div className="cp-warning">
              <strong>Underlaget har ändrats.</strong>
              <button
                type="button"
                disabled={pending || unknown}
                onClick={() => void refreshComparison()}
              >
                Visa aktuell jämförelse
              </button>
            </div>
          )}
          {unknown && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                caseHeading.current?.focus();
                void resolution.check();
              }}
            >
              Kontrollera om valet lades i utkastet
            </button>
          )}
          <p className="cp-status" role="status" aria-live={open ? 'polite' : 'off'}>
            {comparisonPending ? 'Kontrollerar aktuellt underlag…' : status}
          </p>
        </article>
      </div>
    </dialog>
  );
}
