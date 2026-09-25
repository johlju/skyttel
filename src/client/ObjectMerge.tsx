import { useState } from 'react';
import { financialFields } from '../shared/financial-facts.js';
import type { MapState, ObjectMerge as Merge } from '../shared/map.js';
import { proposedObjectTypes, proposedRelationshipTypes } from '../shared/map.js';
import {
  mergeConnections,
  mergeFacts,
  mergeFor,
  mergeNeedsChoice,
  mergeObjects,
  mergeValues,
} from '../shared/object-merge.js';
import { FinancialFactsDetails } from './FinancialFacts.js';
import { LifecycleDetails } from './Lifecycle.js';
import { CustomFieldsDetails } from './ObjectTypes.js';
import { ProfileImage } from './ProfileImage.js';
import { relationshipLabel } from './RelationshipEditor.js';

export function MergeSourceDetails({
  merge,
  householdId,
}: {
  merge: Omit<Merge, 'previousChanges' | 'previousRelationships'>;
  householdId?: string;
}) {
  return (
    <details>
      <summary>Granskade objekt före sammanslagningen</summary>
      {merge.objects.map((object) => (
        <div key={object.id}>
          <p>
            {object.name} · Identitet: {object.id}
          </p>
          <p>
            Objekttyp: {merge.types.find((type) => type.id === object.typeId)?.name}. Beskrivning:{' '}
            {object.description || 'Ingen beskrivning'}
          </p>
          <ProfileImage householdId={householdId ?? object.householdId} value={object} />
          <FinancialFactsDetails facts={object.financialFacts} />
          <CustomFieldsDetails
            type={merge.types.find((type) => type.id === object.typeId)}
            values={object.customValues}
          />
          <LifecycleDetails value={object} />
        </div>
      ))}
      {merge.relationships.map((edge) => (
        <div key={edge.id}>
          <p>
            Granskat samband:{' '}
            {relationshipLabel(
              edge,
              { relationshipTypes: merge.relationshipTypes },
              new Map(Object.entries(merge.objectNames).map(([id, name]) => [id, { name }])),
            )}
          </p>
          <p>
            Identitet: {edge.id}. Från {edge.sourceId} till{' '}
            {edge.targetId ?? 'okänd eller ingen ändpunkt'}.
          </p>
          <LifecycleDetails value={edge} />
        </div>
      ))}
    </details>
  );
}

export function ObjectMerge({
  state,
  selectedId,
  disabled,
  onSubmit,
  onClose,
}: {
  state: MapState;
  selectedId?: string;
  disabled: boolean;
  onSubmit: (body: unknown) => void;
  onClose: () => void;
}) {
  const objects = mergeObjects(state);
  const available = [...objects.values()].filter(
    (object) => !mergeFor(state.draft, 'object', object.id),
  );
  const [survivorId, setSurvivorId] = useState(selectedId ?? '');
  const [absorbedId, setAbsorbedId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [edges, setEdges] = useState<Record<string, string>>({});
  const left = objects.get(survivorId);
  const right = objects.get(absorbedId);
  const validPair = left && right && survivorId !== absorbedId;
  const connections = validPair ? mergeConnections(state, [survivorId, absorbedId]) : [];
  const types = proposedObjectTypes(state.types, state.draft.objectTypes);
  const effective = {
    ...state,
    relationshipTypes: proposedRelationshipTypes(
      state.relationshipTypes,
      state.draft.relationshipTypes,
    ),
  };
  const a = left ? mergeFacts(left) : {};
  const b = right ? mergeFacts(right) : {};
  const differing = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) =>
    mergeNeedsChoice(key, a[key], b[key]),
  );
  function label(key: string) {
    if (key.startsWith('financialFacts:'))
      return financialFields.find((field) => `financialFacts:${field.key}` === key)?.label ?? key;
    if (key.startsWith('customValues:')) {
      for (const type of types)
        for (const field of type.fields ?? [])
          if (key === `customValues:${type.id}:${field.id}`) return `${type.name}: ${field.name}`;
    }
    return (
      (
        {
          name: 'Namn',
          description: 'Beskrivning',
          typeId: 'Objekttyp',
          lifecycle: 'Status',
          identity: 'Identitetsstatus',
          profileImageId: 'Profilbild',
        } as Record<string, string>
      )[key] ?? key
    );
  }
  function fact(key: string, value: unknown) {
    if (key === 'identity')
      return value === 'unspecified'
        ? 'Ospecificerat objekt'
        : value === 'unresolved'
          ? 'Obesvarad identitetsfråga'
          : 'Identifierat objekt';
    if (value === undefined || value === '') return 'Ingen uppgift';
    if (key === 'typeId') return types.find((type) => type.id === value)?.name;
    if (key === 'profileImageId') return 'Profilbilden som visas ovan';
    if (key === 'lifecycle') return value === 'ended' ? 'Upphört' : 'Aktuellt';
    if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
    if (typeof value === 'object' && value !== null) {
      const entry = value as { knowledge: string; value?: string; reportedOn?: string };
      const knowledge = {
        known: '',
        unknown: 'Okänt',
        none: 'Uttryckligen inget',
        uncertain: 'Osäkert uppgivet',
      }[entry.knowledge];
      return [knowledge, entry.value, entry.reportedOn].filter(Boolean).join(' · ');
    }
    return String(value);
  }
  function reset() {
    setChoices({});
    setEdges({});
    setConfirmed(false);
  }
  return (
    <section aria-label="Sammanslagning">
      <h2>Slå samman objekt</h2>
      <p>
        Lika namn eller e-postadresser visar inte att det är samma företeelse. Granska båda
        identiteterna, uppgifterna och varje samband.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!validPair) return;
          onSubmit({
            version: state.draft.version,
            survivorId,
            absorbedId,
            identityConfirmed: confirmed,
            choices,
            reviewed: {
              objects: [left, right],
              relationships: connections,
              types: types.filter((type) => [left.typeId, right.typeId].includes(type.id)),
              relationshipTypes: effective.relationshipTypes.filter((type) =>
                connections.some((edge) => edge.typeId === type.id),
              ),
            },
            relationships: connections.map((edge) => ({ id: edge.id, action: edges[edge.id] })),
          });
        }}
      >
        <fieldset disabled={disabled}>
          <legend>Välj och identifiera två objekt</legend>
          <label>
            Objekt som behåller sin identitet
            <select
              value={survivorId}
              onChange={(event) => {
                setSurvivorId(event.target.value);
                reset();
              }}
            >
              <option value="">Välj objekt</option>
              {available.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name} · {object.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objekt som tas in i det första
            <select
              value={absorbedId}
              onChange={(event) => {
                setAbsorbedId(event.target.value);
                reset();
              }}
            >
              <option value="">Välj objekt</option>
              {available
                .filter((object) => object.id !== survivorId)
                .map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name} · {object.id}
                  </option>
                ))}
            </select>
          </label>
          {validPair && (
            <>
              {[left, right].map((object, index) => (
                <article key={object.id}>
                  <h3>
                    {index === 0 ? 'Första objektet' : 'Andra objektet'}: {object.name}
                  </h3>
                  <p>
                    Identitet: {object.id}. Typ:{' '}
                    {types.find((type) => type.id === object.typeId)?.name}.
                  </p>
                  <p>{object.description || 'Ingen beskrivning'}</p>
                  {object.identity && (
                    <p>
                      {object.identity === 'unspecified'
                        ? 'Ospecificerat objekt'
                        : 'Obesvarad identitetsfråga'}
                    </p>
                  )}
                  <ProfileImage householdId={object.householdId} value={object} />
                  <FinancialFactsDetails facts={object.financialFacts} />
                  <CustomFieldsDetails
                    type={types.find((type) => type.id === object.typeId)}
                    values={object.customValues}
                  />
                  <LifecycleDetails value={object} />
                </article>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Jag bekräftar att objekten är samma företeelse
              </label>
              <p>
                Utan bekräftelse kan förslaget ligga kvar, men hela sparandet är blockerat.
                Ospecificerat är inte en bekräftelse på sammanslagning.
              </p>
              <h3>Välj varje uppgift som skiljer sig</h3>
              {differing.map((key) => (
                <div key={key}>
                  <p>
                    {label(key)}: Första: {fact(key, a[key])}. Andra: {fact(key, b[key])}.
                  </p>
                  <label>
                    Välj {label(key)}
                    <select
                      value={choices[key] ?? ''}
                      onChange={(event) => setChoices({ ...choices, [key]: event.target.value })}
                      required
                    >
                      <option value="">Välj uppgift</option>
                      <option value="survivor">Första objektets uppgift</option>
                      <option value="absorbed">Andra objektets uppgift</option>
                      {!['typeId', 'name', 'description'].includes(key) && (
                        <option value="omit">
                          {key === 'identity' ? 'Identifierat objekt' : 'Utelämna uppgiften'}
                        </option>
                      )}
                    </select>
                  </label>
                </div>
              ))}
              <h3>Granska alla berörda samband</h3>
              <p>
                Behåll flyttar ändpunkten från det andra objektet till det första. Om flera samband
                får samma typ, riktning och ändpunkter måste du uttryckligen välja vilket som finns
                kvar.
              </p>
              {connections.map((edge) => (
                <div key={edge.id}>
                  <p>
                    {relationshipLabel(edge, effective, objects)}. Identitet: {edge.id}.
                  </p>
                  <LifecycleDetails value={edge} />
                  <p>
                    Från identitet {edge.sourceId} till{' '}
                    {edge.targetId ?? 'ingen identifierad ändpunkt'}.
                  </p>
                  {edges[edge.id] === 'keep' && (
                    <p>
                      Efter sammanslagning: från identitet{' '}
                      {edge.sourceId === absorbedId ? survivorId : edge.sourceId} till{' '}
                      {edge.targetId === absorbedId
                        ? survivorId
                        : (edge.targetId ?? 'ingen identifierad ändpunkt')}
                      .
                    </p>
                  )}
                  <label>
                    Val för samband {edge.id}
                    <select
                      value={edges[edge.id] ?? ''}
                      onChange={(event) => setEdges({ ...edges, [edge.id]: event.target.value })}
                      required
                    >
                      <option value="">Välj samband</option>
                      <option value="keep">Behåll sambandet</option>
                      <option value="remove">Ta bort sambandet</option>
                    </select>
                  </label>
                </div>
              ))}
              {differing.every((key) => choices[key]) && !mergeValues(left, right, choices) && (
                <p role="alert">
                  Välj egna fält från den valda objekttypen. Utelämna uttryckligen fält som hör till
                  den andra typen.
                </p>
              )}
              <button
                type="submit"
                disabled={
                  !mergeValues(left, right, choices) || connections.some((edge) => !edges[edge.id])
                }
              >
                Lägg sammanslagningen i mitt utkast
              </button>
            </>
          )}
        </fieldset>
        <button type="button" disabled={disabled} onClick={onClose}>
          Stäng sammanslagningen utan att skicka
        </button>
      </form>
    </section>
  );
}
