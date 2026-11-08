import { isDeepStrictEqual } from 'node:util';
import { type APIRequestContext, request } from '@playwright/test';
import type { MapState, ObjectValue, RelationshipValue } from '../../src/shared/map.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../tests/support/client.js';
import type { createInstallation } from '../../tests/support/installation.js';
import { type ApplicationVersion, applicationAdapter } from './application.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import type {
  Catalog,
  Expected,
  FixtureProperty,
  NamedRelationship,
  Scenario,
  SemanticProperties,
  SemanticPropertyRule,
} from './types.js';

const catalog = rawCatalog as Catalog;
const sorted = <T>(values: T[]) =>
  values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

function normalDefaults<T extends Record<string, unknown>>(value: T): T {
  const result = { ...value };
  if (result.lifecycle === 'active') delete result.lifecycle;
  if (Array.isArray(result.properties) && !result.properties.length) delete result.properties;
  return result;
}

/** A fresh SQLite installation for every independent scenario. Only external
 * authentication and provider transports can be substituted. */
export async function evaluationEnvironment(
  scenario: Scenario,
  options: Parameters<typeof createInstallation>[1],
  application?: ApplicationVersion,
) {
  const adapter = await applicationAdapter(application);
  const installation = await adapter.create(options);
  let client: APIRequestContext | undefined;
  try {
    client = await request.newContext();
    await signIn(client, installation.origin);
    const { household } = await (await createHousehold(client, installation.origin)).json();
    const base = `${installation.origin}/api/households/${household.id}`;
    const active = client;
    const get = async <T>(path: string): Promise<T> => {
      const response = await active.get(`${base}/${path}`);
      if (!response.ok()) throw new Error(`evaluation_http_${response.status()}`);
      return response.json();
    };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await active.post(`${base}/${path}`, {
        headers: { origin: installation.origin },
        data,
      });
      if (!response.ok()) throw new Error(`evaluation_http_${response.status()}`);
      return response.json();
    };
    const read = () => get<MapState>('map');
    let state = await read();
    const variant = scenario.startVariant ? catalog.variants[scenario.startVariant] : undefined;
    const fixture = scenario.fixture ?? catalog.base;
    const initialObjects = [...fixture.objects, ...(variant?.addObjects ?? [])];
    const originalRelationships = fixture.relationships.filter(
      (edge) => !variant?.removeRelationships?.some((value) => isDeepStrictEqual(value, edge)),
    );
    originalRelationships.push(...(variant?.addRelationships ?? []));
    async function propose(route: string, value: unknown) {
      state = await read();
      await post(`map/${route}`, {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        ...(value as object),
      });
    }
    for (const [index, definition] of [
      ...fixture.relationshipTypes,
      ...(fixture.relationshipTypes.some((definition) => definition.name === 'Hör till')
        ? []
        : [
            {
              name: 'Hör till',
              description: '',
              forwardLabel: 'hör till',
              reverseLabel: 'har tjänstekonto',
            },
          ]),
    ].entries())
      await propose('relationship-type', {
        id: `evaluation-type-${index}`,
        baseRevision: null,
        value: definition,
      });
    state = await read();
    const types = [
      ...state.types,
      ...(state.draft.objectTypes?.flatMap((change) => (change.after ? [change.after] : [])) ?? []),
    ];
    for (const { id, type, ...value } of initialObjects) {
      const typeId = types.find((item) => item.name === type)?.id;
      if (!typeId) throw new Error(`evaluation_type_missing_${type}`);
      await propose('draft', { id, baseRevision: null, value: { ...value, typeId } });
    }
    state = await read();
    const relationshipTypes = [
      ...state.relationshipTypes,
      ...(state.draft.relationshipTypes?.flatMap((change) =>
        change.after ? [change.after] : [],
      ) ?? []),
    ];
    for (const [index, edge] of originalRelationships.entries()) {
      const typeId = relationshipTypes.find((item) => item.name === edge.type)?.id;
      if (!typeId) throw new Error(`evaluation_relationship_type_missing_${edge.type}`);
      await propose('relationship', {
        id: `initial-edge-${index}`,
        baseRevision: null,
        value: {
          typeId,
          sourceId: edge.source,
          targetId: edge.target,
          ...(edge.properties ? { properties: edge.properties } : {}),
        },
      });
    }
    state = await read();
    const seedSave = {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      operationId: 'evaluation-start',
    };
    await post('map/save', seedSave);
    state = await read();
    const savedBaseline = structuredClone(state);
    const draftObjects = { ...fixture.draft.objects, ...variant?.draftObjects };
    for (const [id, changes] of Object.entries(draftObjects)) {
      const object = state.objects.find((item) => item.id === id);
      if (!object) throw new Error('evaluation_seed_object_missing');
      const { householdId: _household, revision, ...value } = object;
      await propose('draft', { id, baseRevision: revision, value: { ...value, ...changes } });
    }
    state = await read();
    const assistant = await post<TextAssistantView>('text-assistant', adapter.approval);
    const path = `text-assistant/${assistant.id}`;
    type ExpectedState = {
      objects: Map<string, Record<string, unknown>>;
      relationships: NamedRelationship[];
      types: { name: string }[];
      saves: number;
      semanticObjects: NonNullable<Expected['semanticObjects']>;
      semanticRelationships: NonNullable<Expected['semanticRelationships']>;
    };
    let expectedState: ExpectedState = {
      objects: new Map(
        initialObjects.map((object) => [object.id, { ...object, ...draftObjects[object.id] }]),
      ),
      relationships: structuredClone(originalRelationships),
      types: [],
      saves: 0,
      semanticObjects: {},
      semanticRelationships: [],
    };
    const initialHistory = (await get<{ history: unknown[] }>('map/history')).history.length;
    const initialIds = new Set(initialObjects.map((item) => item.id));
    const appliedSteps = new Map<string, ExpectedState>();
    let observedState: Record<string, unknown> | undefined;
    const seededPropertyIds = new Set(
      initialObjects.flatMap(
        (object) => object.properties?.flatMap(({ id }) => (id ? [id] : [])) ?? [],
      ),
    );
    // Existing identities must remain stable. Newly added identities are
    // server-generated, so compare their content while retaining order.
    function normalProperties(properties: FixtureProperty[]) {
      return properties.map(({ id, ...value }) =>
        id && seededPropertyIds.has(id) ? { id, ...value } : value,
      );
    }
    function matchesProperties(
      actual: FixtureProperty[] | undefined,
      expected: FixtureProperty[] | undefined,
      contract: SemanticProperties,
    ) {
      const properties = [...(actual ?? [])];
      for (const id of contract.preserve) {
        const original = expected?.find((property) => property.id === id);
        const matches = properties.flatMap((property, index) =>
          property.id === id ? [index] : [],
        );
        if (
          !original ||
          matches.length !== 1 ||
          !isDeepStrictEqual(properties[matches[0]], original)
        )
          return false;
        properties.splice(matches[0], 1);
      }
      const matchesRule = (property: FixtureProperty, rule: SemanticPropertyRule) =>
        (!rule.id || property.id === rule.id) &&
        (rule.empty
          ? property.value === undefined
          : rule.kinds?.includes(property.kind ?? 'text') &&
            property.value !== undefined &&
            property.value !== '' &&
            (rule.value === undefined || property.value === rule.value) &&
            (rule.values?.[property.kind ?? 'text'] === undefined ||
              property.value === rule.values[property.kind ?? 'text']));
      const matchesAll = (remaining: FixtureProperty[], rules: SemanticPropertyRule[]): boolean => {
        if (remaining.length !== rules.length) return false;
        if (!rules.length) return true;
        return remaining.some(
          (property, index) =>
            matchesRule(property, rules[0]) &&
            matchesAll(
              remaining.filter((_value, current) => current !== index),
              rules.slice(1),
            ),
        );
      };
      return (contract.anyOf ?? [contract.additions ?? []]).some((rules) =>
        matchesAll(properties, rules),
      );
    }
    function normalObjects(
      map: MapState,
      effective: boolean,
      objectAliases = new Map<string, string>(),
    ): (Record<string, unknown> & {
      id: string;
      type: string;
      name: string;
      properties?: FixtureProperty[];
    })[] {
      const objects: (ObjectValue & { id: string })[] = [...map.objects];
      if (effective)
        for (const change of map.draft.changes) {
          const index = objects.findIndex((item) => item.id === change.id);
          if (index >= 0) objects.splice(index, 1);
          if (change.after) objects.push({ ...change.after, id: change.id });
        }
      const allTypes = [
        ...map.types,
        ...(map.draft.objectTypes?.flatMap((change) => (change.after ? [change.after] : [])) ?? []),
      ];
      return sorted(
        objects.map((object) => {
          const { typeId, id, ...value } = object;
          const type = allTypes.find((item) => item.id === typeId);
          const clean = { ...value } as Record<string, unknown>;
          delete clean.householdId;
          delete clean.revision;
          if (object.properties) clean.properties = normalProperties(object.properties);
          return normalDefaults({
            id: objectAliases.get(id) ?? id,
            type: type?.name ?? typeId,
            name: object.name,
            ...clean,
          });
        }),
      );
    }
    function normalRelationships(
      map: MapState,
      effective: boolean,
      objectAliases = new Map<string, string>(),
      preserveIds = new Set<string>(),
    ): NamedRelationship[] {
      const edges: (RelationshipValue & { id: string })[] = [...map.relationships];
      if (effective)
        for (const change of map.draft.relationships ?? []) {
          const index = edges.findIndex((item) => item.id === change.id);
          if (index >= 0) edges.splice(index, 1);
          if (change.after) edges.push({ ...change.after, id: change.id });
        }
      const definitions = [
        ...map.relationshipTypes,
        ...(map.draft.relationshipTypes?.flatMap((change) =>
          change.after ? [change.after] : [],
        ) ?? []),
      ];
      return sorted(
        edges.map(({ id, typeId, sourceId, targetId, ...rest }) => {
          const clean = { ...rest } as Record<string, unknown>;
          delete clean.householdId;
          delete clean.revision;
          if (rest.properties) clean.properties = normalProperties(rest.properties);
          return normalDefaults({
            ...(preserveIds.has(id) ? { id } : {}),
            source: objectAliases.get(sourceId) ?? sourceId,
            type: definitions.find((item) => item.id === typeId)?.name ?? typeId,
            target: objectAliases.get(targetId) ?? targetId,
            ...clean,
          });
        }),
      );
    }
    function applyExpected(previous: ExpectedState, expected: Expected): ExpectedState {
      const target = structuredClone(previous);
      for (const id of expected.removeObjects ?? []) {
        if (!target.objects.delete(id)) throw new Error('evaluation_invalid_expected_removal');
        delete target.semanticObjects[id];
      }
      for (const [id, changes] of Object.entries(expected.objects ?? {}))
        target.objects.set(id, { ...target.objects.get(id), id, ...changes });
      for (const edge of expected.removeRelationships ?? []) {
        const index = target.relationships.findIndex((item) =>
          isDeepStrictEqual(normalDefaults({ ...item }), normalDefaults({ ...edge })),
        );
        if (index < 0) throw new Error('evaluation_invalid_expected_removal');
        target.relationships.splice(index, 1);
      }
      target.relationships.push(...(expected.addRelationships ?? []));
      target.types.push(...(expected.objectTypes ?? []));
      target.saves += expected.saves ?? 0;
      target.semanticObjects = { ...target.semanticObjects, ...expected.semanticObjects };
      target.semanticRelationships = [
        ...target.semanticRelationships.filter(
          (rule) =>
            !expected.removeRelationships?.some(
              (edge) =>
                edge.source === rule.source &&
                edge.type === rule.type &&
                edge.target === rule.target,
            ) &&
            !expected.semanticRelationships?.some(
              (edge) =>
                edge.source === rule.source &&
                edge.type === rule.type &&
                edge.target === rule.target,
            ),
        ),
        ...(expected.semanticRelationships ?? []),
      ];
      target.objects = new Map(
        [...target.objects].map(([id, object]) => [id, normalDefaults(object)]),
      );
      target.relationships = target.relationships.map((edge) => normalDefaults({ ...edge }));
      return target;
    }
    return {
      application: adapter.version,
      installation,
      client: active,
      base,
      path,
      assistant,
      initial: state,
      get,
      post,
      read,
      stateEvidence() {
        return observedState ? structuredClone(observedState) : undefined;
      },
      judgeContext(
        step: Scenario['steps'][number],
        failures: string[],
        summary = '',
        recognizedRequest?: string,
      ) {
        if (!observedState) throw new Error('evaluation_state_evidence_missing');
        return JSON.stringify({
          scenario: scenario.title,
          group: scenario.group ?? 'everyday',
          dimensions: scenario.dimensions,
          request: step.text,
          recognizedRequest: recognizedRequest ?? null,
          historicalSummary: summary,
          fixedChecks: { checked: true, passed: failures.length === 0, failures },
          observedState,
        });
      },
      async check(
        step: Scenario['steps'][number],
        view: TextAssistantView,
        actions: { name: string; completion?: string }[],
        waiting?: Expected,
      ) {
        if (!appliedSteps.has(step.id)) appliedSteps.set(step.id, structuredClone(expectedState));
        const previous = appliedSteps.get(step.id);
        if (!previous) throw new Error('evaluation_expected_state_missing');
        const expectation = waiting ?? step.expected;
        const shared = applyExpected(previous, expectation);
        const targets = (expectation.anyOf ?? [{ requirements: [] }]).map((branch) =>
          applyExpected(shared, branch),
        );
        if (
          !expectation.requirements.length &&
          targets.some(
            (target) =>
              Object.keys(target.semanticObjects).length || target.semanticRelationships.length,
          )
        )
          throw new Error('evaluation_semantic_requirement_missing');
        const evaluate = async (target: ExpectedState) => {
          const failures: string[] = [];
          const map = await read();
          const objectAliases = new Map<string, string>();
          const actualObjects = normalObjects(map, true);
          const unbound = actualObjects.filter((object) => !initialIds.has(object.id));
          const unmatched = [...target.objects].filter(([id]) => !initialIds.has(id));
          // Bind independently stated exact names before considering a uniquely
          // remaining new object of the declared type. Existing IDs stay literal.
          for (const [id, expected] of unmatched) {
            const candidates = unbound.filter(
              (object) =>
                !objectAliases.has(object.id) &&
                object.type === expected.type &&
                object.name === expected.name,
            );
            if (candidates.length === 1) objectAliases.set(candidates[0].id, id);
          }
          for (const [id, expected] of unmatched) {
            if ([...objectAliases.values()].includes(id)) continue;
            const candidates = unbound.filter(
              (object) =>
                !objectAliases.has(object.id) &&
                object.type === expected.type &&
                (object.name === expected.name || target.semanticObjects[id]?.name),
            );
            if (candidates.length === 1) objectAliases.set(candidates[0].id, id);
            else {
              const expectedOfType = unmatched.filter(
                ([_id, value]) => value.type === expected.type,
              ).length;
              const actualOfType = unbound.filter((value) => value.type === expected.type).length;
              if (candidates.length > 1 && expectedOfType === actualOfType)
                throw new Error('evaluation_state_identity_ambiguous');
              failures.push('new_identity_unresolved');
            }
          }
          const comparableObjects = normalObjects(map, true, objectAliases).map((object) => {
            const expected = target.objects.get(object.id);
            const rule = target.semanticObjects[object.id];
            const comparable = { ...object } as Record<string, unknown>;
            if (rule?.name && expected) comparable.name = expected.name;
            if (
              rule?.properties &&
              expected &&
              matchesProperties(
                object.properties as FixtureProperty[] | undefined,
                expected.properties as FixtureProperty[] | undefined,
                rule.properties,
              )
            ) {
              if (expected.properties === undefined) delete comparable.properties;
              else comparable.properties = expected.properties;
            } else if (rule?.properties) failures.push('effective_objects');
            return comparable;
          });
          if (!isDeepStrictEqual(sorted(comparableObjects), sorted([...target.objects.values()])))
            failures.push('effective_objects');
          const comparableRelationships = normalRelationships(
            map,
            true,
            objectAliases,
            new Set(target.relationships.flatMap((edge) => (edge.id ? [edge.id] : []))),
          ).map((edge) => {
            const rule = target.semanticRelationships.find(
              (rule) =>
                rule.source === edge.source &&
                rule.type === edge.type &&
                rule.target === edge.target,
            );
            const expected = target.relationships.find(
              (value) =>
                value.source === edge.source &&
                value.type === edge.type &&
                value.target === edge.target,
            );
            if (!rule || !expected) return edge;
            if (!matchesProperties(edge.properties, expected.properties, rule.properties)) {
              failures.push('effective_relationships');
              return edge;
            }
            const comparable = { ...edge };
            if (expected.properties === undefined) delete comparable.properties;
            else comparable.properties = expected.properties;
            return comparable;
          });
          if (
            target.relationships.some(
              (expected) =>
                expected.id &&
                !comparableRelationships.some(
                  (actual) =>
                    actual.id === expected.id &&
                    actual.source === expected.source &&
                    actual.type === expected.type &&
                    actual.target === expected.target,
                ),
            )
          )
            failures.push('relationship_identity');
          const withoutIdentity = ({ id: _id, ...edge }: NamedRelationship) => edge;
          if (
            !isDeepStrictEqual(
              sorted(comparableRelationships.map(withoutIdentity)),
              sorted(target.relationships.map(withoutIdentity)),
            )
          )
            failures.push('effective_relationships');
          const extraTypes = [
            ...map.types,
            ...(map.draft.objectTypes?.flatMap((change) => (change.after ? [change.after] : [])) ??
              []),
          ].filter((type) => !savedBaseline.types.some((original) => original.id === type.id));
          if (
            !isDeepStrictEqual(
              sorted(
                extraTypes.map((type) => ({
                  name: type.name,
                })),
              ),
              sorted([...target.types]),
            )
          )
            failures.push('new_types');
          for (const original of savedBaseline.types) {
            const current = map.types.find((type) => type.id === original.id);
            if (
              !isDeepStrictEqual(current, original) ||
              map.draft.objectTypes?.some((change) => change.id === original.id)
            )
              failures.push(`changed_type_${original.name}`);
          }
          if (
            !isDeepStrictEqual(map.relationshipTypes, savedBaseline.relationshipTypes) ||
            map.draft.relationshipTypes?.length
          )
            failures.push('relationship_types');
          const saves = (waiting ?? expectation).saves ?? 0;
          const operations = view.operations.filter(
            (operation) => operation.operationId !== 'evaluation-start',
          );
          const history = await get<{ history: unknown[] }>('map/history');
          if (
            operations.length !== target.saves ||
            history.history.length !== initialHistory + target.saves ||
            operations.some((operation) => operation.status !== 'succeeded')
          )
            failures.push('save_receipts_history');
          if (
            !saves &&
            actions.some(
              (action) =>
                ['save_draft', 'prepare_save'].includes(action.name) ||
                action.completion === 'save',
            )
          )
            failures.push('unrequested_save_attempt');
          if (
            saves &&
            (!view.receipt ||
              map.draft.changes.length ||
              map.draft.relationships?.length ||
              map.draft.objectTypes?.length ||
              map.draft.relationshipTypes?.length)
          )
            failures.push('save_incomplete');
          if (
            !target.saves &&
            (!isDeepStrictEqual(map.objects, savedBaseline.objects) ||
              !isDeepStrictEqual(map.relationships, savedBaseline.relationships))
          )
            failures.push('saved_map_changed');
          if (view.error || view.phase === 'error' || view.phase === 'recovery')
            failures.push(view.error ?? view.phase);
          if (
            expectation.preservedRequests?.length &&
            !view.pendingParts?.some(
              (part) => ['waiting', 'ready'].includes(part.status) && part.request.trim(),
            )
          )
            failures.push('unfinished_instructions');
          observedState = structuredClone({
            expected: {
              objects: [...target.objects.values()],
              relationships: target.relationships,
              semanticObjects: target.semanticObjects,
              semanticRelationships: target.semanticRelationships,
              preservedRequests: expectation.preservedRequests ?? [],
            },
            saved: {
              objects: normalObjects(map, false),
              relationships: normalRelationships(map, false),
            },
            effective: {
              objects: normalObjects(map, true),
              relationships: normalRelationships(map, true),
            },
            types: map.types,
            draft: map.draft,
            saveReceipt: view.receipt ?? null,
            saveOperations: operations,
            historicalSaveOperations: view.operations.filter(
              (operation) => operation.operationId === 'evaluation-start',
            ),
            historyChanges: history.history.length - initialHistory,
            displayedSelection: view.displayedSelection ?? null,
            pendingParts: view.pendingParts ?? [],
          });
          return { failures, evidence: structuredClone(observedState) };
        };
        const results = [];
        for (const target of targets) results.push(await evaluate(target));
        const matches = results.flatMap((result, index) => (result.failures.length ? [] : [index]));
        if (matches.length > 1) throw new Error('evaluation_state_identity_ambiguous');
        const selected = matches[0] ?? 0;
        observedState = results[selected].evidence;
        if (!waiting) expectedState = targets[selected];
        return matches.length ? [] : [...new Set(results.flatMap((result) => result.failures))];
      },
      async close() {
        await active.dispose();
        await installation.close();
      },
    };
  } catch (error) {
    await client?.dispose();
    await installation.close();
    throw error;
  }
}
