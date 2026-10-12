import { isDeepStrictEqual } from 'node:util';
import { type APIRequestContext, request } from '@playwright/test';
import type { MapState, ObjectValue, RelationshipValue } from '../../src/shared/map.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../tests/support/client.js';
import { approvedForVisit } from '../../tests/support/conversation.js';
import { createInstallation } from '../../tests/support/installation.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import type { Catalog, NamedRelationship, Scenario } from './types.js';

const catalog = rawCatalog as Catalog;
const sorted = <T>(values: T[]) =>
  values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** A fresh SQLite installation for every independent scenario. Only external
 * authentication and provider transports can be substituted. */
export async function evaluationEnvironment(
  scenario: Scenario,
  options: Parameters<typeof createInstallation>[1],
) {
  const installation = await createInstallation(undefined, options);
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
    const initialObjects = [...catalog.base.objects, ...(variant?.addObjects ?? [])];
    const originalRelationships = catalog.base.relationships.filter(
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
      ...catalog.base.relationshipTypes,
      {
        name: 'Hör till',
        description: '',
        forwardLabel: 'hör till',
        reverseLabel: 'har tjänstekonto',
      },
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
        value: { typeId, sourceId: edge.source, targetId: edge.target, knowledge: edge.knowledge },
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
    const draftObjects = { ...catalog.base.draft.objects, ...variant?.draftObjects };
    for (const [id, changes] of Object.entries(draftObjects)) {
      const object = state.objects.find((item) => item.id === id);
      if (!object) throw new Error('evaluation_seed_object_missing');
      const { householdId: _household, revision, ...value } = object;
      await propose('draft', { id, baseRevision: revision, value: { ...value, ...changes } });
    }
    state = await read();
    const assistant = await post<TextAssistantView>('text-assistant', approvedForVisit);
    const path = `text-assistant/${assistant.id}`;
    const expectedObjects = new Map(
      initialObjects.map((object) => {
        return [object.id, { ...object, ...draftObjects[object.id] } as Record<string, unknown>];
      }),
    );
    const expectedRelationships: NamedRelationship[] = structuredClone(originalRelationships);
    let expectedTypes: { name: string; fields: { name: string; kind: string }[] }[] = [];
    let expectedSaves = 0;
    const initialHistory = (await get<{ history: unknown[] }>('map/history')).history.length;
    const objectIds = new Map(initialObjects.map((item) => [item.name, item.id]));
    const appliedSteps = new Set<string>();
    let observedState: Record<string, unknown> | undefined;
    function normalObjects(map: MapState, effective: boolean) {
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
          const fields = new Map(type?.fields?.map((item) => [item.id, item.name]));
          const clean = { ...value } as Record<string, unknown>;
          delete clean.householdId;
          delete clean.revision;
          if (object.customValues)
            clean.customValues = Object.fromEntries(
              Object.entries(object.customValues).map(([key, field]) => [
                fields.get(key) ?? key,
                field,
              ]),
            );
          return {
            id: objectIds.get(object.name) ?? (object.name === 'Soltak Norr 7' ? 'solar' : id),
            type: type?.name ?? typeId,
            ...clean,
          };
        }),
      );
    }
    function normalRelationships(map: MapState, effective: boolean): NamedRelationship[] {
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
        edges.map(({ id: _id, typeId, sourceId, targetId, knowledge, ...rest }) => {
          const clean = { ...rest } as Record<string, unknown>;
          delete clean.householdId;
          delete clean.revision;
          return {
            source: sourceId,
            type: definitions.find((item) => item.id === typeId)?.name ?? typeId,
            target: targetId,
            knowledge,
            ...clean,
          };
        }),
      );
    }
    return {
      installation,
      client: active,
      base,
      path,
      assistant,
      initial: state,
      get,
      post,
      read,
      judgeContext(step: Scenario['steps'][number], failures: string[], summary = '') {
        if (!observedState) throw new Error('evaluation_state_evidence_missing');
        return JSON.stringify({
          scenario: scenario.title,
          request: step.text,
          historicalSummary: summary,
          fixedChecks: { checked: true, passed: failures.length === 0, failures },
          observedState,
        });
      },
      async check(
        step: Scenario['steps'][number],
        view: TextAssistantView,
        actions: { name: string; completion?: string }[],
      ) {
        const failures: string[] = [];
        const expectation = step.expected;
        if (!appliedSteps.has(step.id)) {
          for (const [id, changes] of Object.entries(expectation.objects ?? {})) {
            const values = { ...changes } as Record<string, unknown>;
            expectedObjects.set(id, { ...expectedObjects.get(id), id, ...values });
          }
          for (const edge of expectation.removeRelationships ?? []) {
            const index = expectedRelationships.findIndex((item) => isDeepStrictEqual(item, edge));
            if (index < 0) throw new Error('evaluation_invalid_expected_removal');
            expectedRelationships.splice(index, 1);
          }
          expectedRelationships.push(...(expectation.addRelationships ?? []));
          expectedTypes = [...expectedTypes, ...(expectation.objectTypes ?? [])];
          expectedSaves += expectation.saves ?? 0;
          appliedSteps.add(step.id);
        }
        const map = await read();
        if (!isDeepStrictEqual(normalObjects(map, true), sorted([...expectedObjects.values()])))
          failures.push('effective_objects');
        if (!isDeepStrictEqual(normalRelationships(map, true), sorted(expectedRelationships)))
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
                fields: (type.fields ?? []).map((field) => ({
                  name: field.name,
                  kind: field.kind,
                })),
              })),
            ),
            sorted(expectedTypes),
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
        const saves = expectation.saves ?? 0;
        const operations = view.operations.filter(
          (operation) => operation.operationId !== 'evaluation-start',
        );
        const history = await get<{ history: unknown[] }>('map/history');
        if (
          operations.length !== expectedSaves ||
          history.history.length !== initialHistory + expectedSaves ||
          operations.some((operation) => operation.status !== 'succeeded')
        )
          failures.push('save_receipts_history');
        if (
          !saves &&
          actions.some(
            (action) =>
              ['save_draft', 'prepare_save'].includes(action.name) || action.completion === 'save',
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
          !expectedSaves &&
          (!isDeepStrictEqual(map.objects, savedBaseline.objects) ||
            !isDeepStrictEqual(map.relationships, savedBaseline.relationships))
        )
          failures.push('saved_map_changed');
        if (view.error || view.phase === 'error' || view.phase === 'recovery')
          failures.push(view.error ?? view.phase);
        observedState = structuredClone({
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
          historyChanges: history.history.length - initialHistory,
          displayedSelection: view.displayedSelection ?? null,
        });
        return failures;
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
