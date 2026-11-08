import { useId, useLayoutEffect, useRef, useState } from 'react';
import { sameConflictValue } from '../shared/conflict-properties.js';
import type { MapObject, MapState, RelationshipValue } from '../shared/map.js';
import { proposedRelationships, proposedRelationshipTypes } from '../shared/map.js';
import type { RelationshipFormResult } from '../shared/relationship-form.js';
import { relationshipVerb } from '../shared/relationship-verb.js';
import { EndpointPicker } from './EndpointPicker.js';
import { useFormLeave } from './FormLeave.js';
import { FormLossGuard } from './FormLossGuard.js';
import { validateFormControls } from './form-validation.js';
import { LifecycleEditor } from './Lifecycle.js';
import { MapRequestError } from './map-request.js';
import { PropertyEditor } from './PropertyEditor.js';
import { RelationshipReadDetails } from './RelationshipReadDetails.js';

export type RelationshipFormValue = {
  id: string;
  version: number;
  contentVersion: number;
  baseRevision: number | null;
  value: RelationshipValue;
};
export type RelationshipStageResult = RelationshipFormResult;
export type RelationshipFormSubmission = Omit<RelationshipFormValue, 'value'> & {
  value: RelationshipValue | null;
  typeRevision?: number;
};

/** One complete relationship at a time; staging leaves the relationship reader open. */
export function RelationshipForm({
  initial,
  state,
  objects,
  onStage,
  onPrepare,
  onReview,
  onComplete,
  onCancel,
  onCheck,
  onExisting,
  onDirty,
  onBusy,
}: {
  initial: RelationshipFormValue;
  state: MapState;
  objects: Map<string, MapObject>;
  onPrepare: (contentVersion: number) => Promise<string>;
  onReview: () => Promise<MapState>;
  onStage: (
    editor: RelationshipFormSubmission,
    stagingId: string,
  ) => Promise<RelationshipStageResult>;
  onCheck: (stagingId: string, contentVersion: number) => Promise<RelationshipStageResult>;
  onExisting: (id: string) => void;
  onComplete: (result: RelationshipStageResult) => void;
  onCancel: () => void;
  onDirty?: (dirty: boolean) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const prefix = useId();
  const [basis, setBasis] = useState(initial);
  const [unavailable, setUnavailable] = useState(false);
  const [review, setReview] = useState<MapState | null>(null);
  const [value, setValue] = useState(initial.value);
  const [invalidProperties, setInvalidProperties] = useState(false);
  const [typeRevisions, setTypeRevisions] = useState(
    () => new Map(state.relationshipTypes.map((type) => [type.id, type.revision])),
  );
  const [sourceQuery, setSourceQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [stale, setStale] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string>();
  const attempt = useRef<{ stagingId: string; editor: RelationshipFormSubmission } | null>(null);
  const busy = pending || unknown;
  const lock = useRef(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterTransition = useRef<'review' | 'details' | 'form' | null>(null);
  const [errors, setErrors] = useState<{ id: string; label: string; message: string }[]>([]);
  const { requestLeave } = useFormLeave();
  const dirty =
    invalidProperties ||
    !sameConflictValue(value, initial.value) ||
    Boolean(sourceQuery || targetQuery);
  useLayoutEffect(() => {
    onDirty?.(dirty || busy);
    return () => onDirty?.(false);
  }, [dirty, busy, onDirty]);
  useLayoutEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  useLayoutEffect(() => {
    if (errors.length) summary.current?.focus();
  }, [errors]);
  useLayoutEffect(() => {
    if (pending) return;
    if (focusAfterTransition.current === 'review' && unavailable) reviewButton.current?.focus();
    if (focusAfterTransition.current === 'details' && review) reviewHeading.current?.focus();
    if (focusAfterTransition.current === 'form' && !review)
      form.current?.querySelector<HTMLSelectElement>('select')?.focus();
    focusAfterTransition.current = null;
  }, [pending, unavailable, review]);
  function validate() {
    const problems = validateFormControls(form.current);
    setErrors(problems);
    return !problems.length;
  }
  const choices = [...objects.values()].filter(
    (object) => !state.draft.changes.some((change) => change.id === object.id && !change.after),
  );
  const source = objects.get(value.sourceId)?.name ?? 'Välj frånobjekt';
  const target = objects.get(value.targetId ?? '')?.name ?? 'Välj tillobjekt';
  const label = value.verb || 'har samband med';
  async function submit(remove = false) {
    if (lock.current || stale || (!remove && !validate())) return;
    lock.current = true;
    setPending(true);
    setError('');
    setDuplicateId(undefined);
    try {
      const stagingId = await onPrepare(basis.contentVersion);
      attempt.current = {
        stagingId,
        editor: {
          ...basis,
          value: remove ? null : { ...value, verb: value.verb?.trim() || 'har samband med' },
          typeRevision: typeRevisions.get(remove ? basis.value.typeId : value.typeId),
        },
      };
      confirm(await onStage(attempt.current.editor, stagingId));
    } catch (failure) {
      if (
        failure instanceof MapRequestError &&
        failure.code === 'relationship_confirmation_unavailable'
      ) {
        expire();
      } else if (
        attempt.current &&
        (!(failure instanceof MapRequestError) || failure.status >= 500)
      ) {
        setUnknown(true);
        setError(
          'Det är oklart om ändringen lades i utkastet. Kontrollera utfallet innan du försöker igen. Alla uppgifter finns kvar.',
        );
      } else {
        lock.current = false;
        attempt.current = null;
        setError(
          failure instanceof MapRequestError &&
            failure.code === 'relationship_confirmation_capacity'
            ? 'Tillfälligt fullt för nya sambandsbekräftelser. Inget ändrades av detta försök. Dina uppgifter finns kvar. Försök igen senare.'
            : 'Ändringen kunde inte bekräftas. Dina uppgifter finns kvar.',
        );
      }
    } finally {
      setPending(false);
    }
  }
  function confirm(result: RelationshipFormResult) {
    const outcome = result.outcome;
    if (
      !outcome ||
      outcome.stagingId !== attempt.current?.stagingId ||
      result.state.userId !== state.userId ||
      result.state.contentVersion !== initial.contentVersion
    )
      throw new Error('invalid_form_outcome');
    lock.current = false;
    setUnknown(false);
    if (outcome.status === 'duplicate') {
      const existing = proposedRelationships(
        result.state.relationships,
        result.state.draft.relationships,
      ).get(outcome.relationshipId);
      const submitted = attempt.current?.editor.value;
      if (
        existing &&
        submitted &&
        (!submitted.typeId || existing.typeId === submitted.typeId) &&
        existing.sourceId === submitted.sourceId &&
        existing.targetId === submitted.targetId &&
        relationshipVerb(existing) === relationshipVerb(submitted)
      ) {
        setDuplicateId(outcome.relationshipId);
        setError('Sambandet finns redan');
      } else {
        setDuplicateId(undefined);
        setError(
          'Försöket hittade ett befintligt samband, men det har ändrats eller tagits bort sedan dess. Dina uppgifter finns kvar. Granska aktuellt underlag innan du fortsätter.',
        );
      }
    } else {
      const current = result.state.draft.relationships?.find(
        (change) => change.id === outcome.relationshipId,
      );
      if (
        (current && sameConflictValue(current.after, outcome.value)) ||
        (outcome.value === null &&
          !current &&
          !result.state.relationships.some((edge) => edge.id === outcome.relationshipId))
      )
        onComplete(result);
      else
        setError(
          'Ändringen lades i utkastet, men det aktuella underlaget har ändrats sedan dess. Dina uppgifter finns kvar. Granska det aktuella sambandet innan du fortsätter.',
        );
    }
    attempt.current = null;
  }
  function expire() {
    if (document.activeElement === document.body || form.current?.contains(document.activeElement))
      focusAfterTransition.current = 'review';
    lock.current = false;
    attempt.current = null;
    setUnknown(false);
    setStale(true);
    setUnavailable(true);
    setReview(null);
    setError(
      'Bekräftelsen är inte längre tillgänglig. Den kan ha gått ut efter sju dygn. Det betyder inte att ändringen aldrig lades i utkastet. Dina uppgifter finns kvar. Granska aktuellt underlag före ett nytt försök.',
    );
  }
  async function reviewCurrent() {
    setPending(true);
    try {
      const latest = await onReview();
      if (latest.userId !== state.userId || latest.contentVersion !== basis.contentVersion)
        throw new Error('changed_authority');
      if (
        document.activeElement === document.body ||
        document.activeElement === reviewButton.current
      )
        focusAfterTransition.current = 'details';
      setReview({
        ...latest,
        relationshipTypes: proposedRelationshipTypes(
          latest.relationshipTypes,
          latest.draft.relationshipTypes,
        ),
      });
    } catch {
      setError(
        'Aktuellt underlag kunde inte hämtas. Dina uppgifter finns kvar. Försök granska igen.',
      );
    } finally {
      setPending(false);
    }
  }
  function acceptReview() {
    if (!review) return;
    focusAfterTransition.current = 'form';
    const saved = review.relationships.find((edge) => edge.id === initial.id);
    setBasis({ ...basis, version: review.draft.version, baseRevision: saved?.revision ?? null });
    setTypeRevisions(new Map(review.relationshipTypes.map((type) => [type.id, type.revision])));
    setStale(false);
    setUnavailable(false);
    setReview(null);
    setError(
      'Du granskar ett nytt försök. Kontrollera dina bevarade uppgifter och välj Lägg i utkastet när du är klar.',
    );
  }
  const reviewedChange = review?.draft.relationships?.find((change) => change.id === initial.id);
  const reviewedRelationships =
    review && proposedRelationships(review.relationships, review.draft.relationships);
  const reviewedEdge =
    reviewedRelationships?.get(initial.id) ??
    reviewedChange?.before ??
    review?.relationships.find((edge) => edge.id === initial.id) ??
    [...(reviewedRelationships?.values() ?? [])].find(
      (edge) =>
        edge.typeId === value.typeId &&
        edge.sourceId === value.sourceId &&
        edge.targetId === value.targetId &&
        relationshipVerb(edge) === (value.verb?.trim() || 'har samband med'),
    );
  async function check() {
    const current = attempt.current;
    if (pending || !unknown || !current) return;
    setPending(true);
    try {
      const result = await onCheck(current.stagingId, current.editor.contentVersion);
      if (
        result.state.userId !== state.userId ||
        result.state.contentVersion !== current.editor.contentVersion
      )
        throw new Error('invalid_form_outcome');
      if (result.outcome) confirm(result);
      else if (
        result.state.draft.version === current.editor.version &&
        result.state.contentVersion === current.editor.contentVersion
      ) {
        lock.current = false;
        attempt.current = null;
        setUnknown(false);
        setError(
          'Kontrollen visar att ändringen inte lades i utkastet. Alla uppgifter finns kvar. Du kan försöka igen.',
        );
      } else if (result.state.draft.version > current.editor.version) {
        // The serialized version guard rejects any delayed original request. Keep
        // the old editing basis: a newer private edit could otherwise be overwritten.
        lock.current = false;
        attempt.current = null;
        setUnknown(false);
        setStale(true);
        setError(
          'Kontrollen saknar en bevarad bekräftelse och utkastet har ändrats. Det gamla försöket kan inte ändra det aktuella utkastet. Dina uppgifter finns kvar. Stäng formuläret och öppna det igen för att granska aktuellt underlag innan du försöker igen.',
        );
      } else
        setError(
          'Utkastet har ändrats och utfallet kan inte bekräftas. Dina uppgifter finns kvar. Kontrollera samma ändring igen innan du lämnar eller försöker igen.',
        );
    } catch (failure) {
      if (
        failure instanceof MapRequestError &&
        failure.code === 'relationship_confirmation_unavailable'
      )
        expire();
      else
        setError(
          'Utkastet kunde inte kontrolleras. Dina uppgifter finns kvar. Kontrollera igen innan du försöker lägga ändringen i utkastet.',
        );
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label={initial.baseRevision === null ? 'Nytt samband' : 'Redigera samband'}>
      <h3>
        {state.draft.relationships?.some((change) => change.id === initial.id) ||
        initial.baseRevision !== null
          ? 'Redigera samband'
          : 'Nytt samband'}
      </h3>
      <form
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {errors.length > 0 && (
          <div ref={summary} role="alert" aria-label="Formuläret innehåller fel" tabIndex={-1}>
            <h4>Rätta uppgifterna innan du lägger dem i utkastet</h4>
            <ul>
              {errors.map((problem) => (
                <li key={problem.id}>
                  <a
                    href={`#${problem.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(problem.id)?.focus();
                    }}
                  >
                    {problem.label}: {problem.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {unavailable && (
          <button
            ref={reviewButton}
            type="button"
            disabled={pending}
            onClick={() => void reviewCurrent()}
          >
            Granska aktuellt underlag
          </button>
        )}
        {review && (
          <section aria-label="Aktuellt underlag för nytt försök">
            <h4 ref={reviewHeading} tabIndex={-1}>
              Aktuellt underlag för nytt försök
            </h4>
            {reviewedChange?.after === null && (
              <p>Ditt utkast föreslår att sambandet tas bort. De sparade uppgifterna visas här.</p>
            )}
            {reviewedEdge ? (
              <RelationshipReadDetails
                value={reviewedEdge}
                type={review.relationshipTypes.find((item) => item.id === reviewedEdge.typeId)}
                before={review.relationships.find((item) => item.id === reviewedEdge.id)}
                objects={objects}
              />
            ) : (
              <p>
                Sambandet finns inte i den aktuella kartan och ditt utkast. Dina försökta uppgifter
                visas nedan.
              </p>
            )}
            <button type="button" onClick={acceptReview}>
              Fortsätt med bevarade uppgifter
            </button>
          </section>
        )}
        {pending && <p role="status">Lägger sambandet i ditt utkast…</p>}
        {unknown && (
          <button ref={checkButton} type="button" disabled={pending} onClick={() => void check()}>
            Kontrollera om ändringen lades i utkastet
          </button>
        )}
        {duplicateId && (
          <button type="button" onClick={() => requestLeave(() => onExisting(duplicateId))}>
            Redigera befintligt samband
          </button>
        )}
        <fieldset disabled={busy} className="relationship-form-fields">
          <legend className="sr-only">Sambandets detaljer</legend>
          <div className="">
            {' '}
            <label htmlFor={`${prefix}-type`}>Sambandstyp</label>
            <select
              id={`${prefix}-type`}
              value={value.typeId}
              onChange={(event) => setValue({ ...value, typeId: event.target.value })}
            >
              <option value="">Ingen särskild gruppering</option>
              {state.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div className="relationship-form-wide">
            <label htmlFor={`${prefix}-verb`}>Verb</label>
            <input
              id={`${prefix}-verb`}
              maxLength={200}
              value={value.verb ?? ''}
              placeholder="har samband med"
              onChange={(event) => {
                const { reverseVerb: _reverseVerb, ...current } = value;
                setValue({ ...current, verb: event.target.value });
              }}
            />
            <p>Välj ord för just det här sambandet, oavsett typ av objekt och gruppering.</p>
            <label htmlFor={`${prefix}-reverse-verb`}>Omvänd benämning (valfri)</label>
            <input
              id={`${prefix}-reverse-verb`}
              maxLength={200}
              value={value.reverseVerb ?? ''}
              onChange={(event) =>
                setValue({ ...value, reverseVerb: event.target.value || undefined })
              }
            />
          </div>
          <div className="relationship-form-wide">
            <EndpointPicker
              label="Från objekt"
              searchLabel="Sök frånobjekt"
              query={sourceQuery}
              onQueryChange={setSourceQuery}
              value={value.sourceId}
              objects={choices}
              state={state}
              onChange={(sourceId) => setValue({ ...value, sourceId })}
            />
          </div>
          <button
            type="button"
            disabled={!value.targetId}
            onClick={() =>
              setValue({ ...value, sourceId: value.targetId ?? '', targetId: value.sourceId })
            }
          >
            Byt riktning
          </button>
          <div className="relationship-form-wide">
            <EndpointPicker
              label="Till objekt"
              searchLabel="Sök det andra objektet"
              query={targetQuery}
              onQueryChange={setTargetQuery}
              value={value.targetId ?? ''}
              objects={choices}
              state={state}
              onChange={(targetId) => setValue({ ...value, targetId })}
            />
          </div>
          <div className="relationship-form-wide">
            {' '}
            <PropertyEditor
              value={value.properties ?? []}
              onChange={(properties) => setValue({ ...value, properties })}
              onInvalidChange={setInvalidProperties}
            />
            <LifecycleEditor
              kind="relationship"
              value={value.lifecycle}
              onChange={(lifecycle) => setValue({ ...value, lifecycle })}
            />
          </div>{' '}
          <section
            aria-label="Sambandet före inskickning"
            className="relationship-sentence relationship-form-wide"
          >
            {source} {label[0].toLocaleLowerCase('sv') + label.slice(1)} {target}
          </section>
          <div className="relationship-form-actions relationship-form-wide">
            <button type="submit" className="primary" disabled={stale}>
              Lägg i utkastet
            </button>
            <button type="button" onClick={() => requestLeave(onCancel)}>
              Avbryt redigeringen
            </button>{' '}
            {(initial.baseRevision !== null ||
              state.draft.relationships?.some((change) => change.id === initial.id)) && (
              <button
                type="button"
                disabled={stale}
                onClick={() => requestLeave(() => void submit(true))}
              >
                Föreslå borttagning
              </button>
            )}
          </div>
        </fieldset>
      </form>
      <FormLossGuard
        dirty={dirty}
        busy={busy}
        householdId={state.types[0]?.householdId ?? ''}
        onDiscard={() => {
          setValue(initial.value);
          setSourceQuery('');
          setTargetQuery('');
          setError('');
          setErrors([]);
          setDuplicateId(undefined);
        }}
        onBlocked={() =>
          setError(
            unknown
              ? 'Kontrollera om ändringen lades i utkastet innan du lämnar formuläret. Alla uppgifter finns kvar.'
              : 'Vänta tills ändringen har bekräftats innan du lämnar formuläret.',
          )
        }
      />
    </section>
  );
}
