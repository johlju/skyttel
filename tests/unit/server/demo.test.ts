import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import type { MapState, RelationshipValue } from '../../../src/shared/map.js';
import { effectiveRelationships } from '../../../src/shared/map.js';
import { signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

test('the demo preserves free properties and valid links through restart', async () => {
  const installation = await createInstallation();
  const browser = await request.newContext();
  try {
    const household = installation.seedDemo();
    await signIn(browser, installation.origin);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const response = await browser.get(path);
    expect(response.status()).toBe(200);
    const state: MapState = await response.json();
    expect(state.objects).toHaveLength(16);
    expect(state.relationships).toHaveLength(21);
    expect(state.objects.every((object) => object.householdId === household.id)).toBe(true);
    expect(state.relationships.every((edge) => edge.householdId === household.id)).toBe(true);
    const service = state.objects.find(({ name }) => name === 'Molnmusik');
    const usage = state.relationships.find((edge) => edge.sourceId === service?.id);
    expect(usage?.properties).toEqual([
      { id: expect.any(String), label: 'Osäkert uppgivet', kind: 'boolean', value: true },
    ]);
    const bicycle = state.objects.find(({ name }) => name === 'Alex blå cykel');
    expect(bicycle?.lifecycle).toBe('active');
    expect(bicycle?.properties).toEqual([
      {
        id: expect.any(String),
        label: 'Beskrivning',
        kind: 'text',
        value: 'En påhittad cykel som förvaras i garaget.',
      },
      { id: expect.any(String), label: 'Ramfärg', kind: 'text', value: 'Blå' },
      { id: expect.any(String), label: 'Extrahjul', kind: 'number', value: 0 },
      { id: expect.any(String), label: 'Kontrolldatum', kind: 'date', value: '2026-04-03' },
      { id: expect.any(String), label: 'Elcykel', kind: 'boolean', value: false },
      {
        id: expect.any(String),
        label: 'Dold rammärkning',
        kind: 'text',
        value: 'Syntetisk ram: DEMO-CYKEL',
      },
      { id: expect.any(String), label: 'Pris', kind: 'number', value: 4995 },
      { id: expect.any(String), label: 'Valuta', kind: 'text', value: 'SEK' },
      { id: expect.any(String), label: 'Startdatum', kind: 'date', value: '2026-04-03' },
    ]);
    const validateLinks = (objects: { id: string }[], relationships: RelationshipValue[]) => {
      const ids = new Set(objects.map(({ id }) => id));
      const identities = new Set<string>();
      for (const edge of relationships) {
        expect(ids.has(edge.sourceId)).toBe(true);
        expect(edge.targetId !== null && ids.has(edge.targetId)).toBe(true);
        const identity = `${edge.typeId}:${edge.sourceId}:${edge.targetId}`;
        expect(identities.has(identity)).toBe(false);
        identities.add(identity);
      }
    };
    validateLinks(state.objects, state.relationships);
    const proposed = new Map(state.objects.map((object) => [object.id, object]));
    for (const change of state.draft.changes) {
      if (change.after)
        proposed.set(change.id, {
          ...change.after,
          id: change.id,
          householdId: household.id,
          revision: 0,
        });
      else proposed.delete(change.id);
    }
    const effective = [...effectiveRelationships(state).values()];
    expect(effective).toHaveLength(21);
    validateLinks([...proposed.values()], effective);
    const association = state.objects.find(({ name }) => name === 'Lindens musikförening');
    expect(
      state.relationships.some(
        ({ sourceId, targetId }) => sourceId === association?.id || targetId === association?.id,
      ),
    ).toBe(false);
    expect(association?.properties?.map(({ label }) => label)).toEqual(['Beskrivning']);
    expect(state.draft.changes).toMatchObject([{ after: { name: 'Lo Lind' } }]);
    expect(state.objects.find(({ name }) => name === 'Lo Berg')?.properties).toMatchObject([
      { label: 'Beskrivning', value: 'Spelar piano i musikföreningen.' },
    ]);
    expect(state.draft.relationships).toHaveLength(1);
    const proposal = state.draft.relationships?.[0];
    expect(proposal?.after?.targetId).not.toBe(proposal?.before?.targetId);
    // Public duplicate submission validates all endpoints and preserves the demo draft.
    for (const edge of state.relationships) {
      const current: MapState = await (await browser.get(path)).json();
      const retained = current.draft.relationships?.find(({ id }) => id === edge.id);
      const result = await browser.post(`${path}/relationship`, {
        headers: { origin: installation.origin },
        data: {
          version: current.draft.version,
          id: crypto.randomUUID(),
          baseRevision: null,
          value: retained?.after ?? edge,
        },
      });
      const outcome = await result.json();
      expect(result.status(), JSON.stringify(outcome)).toBe(200);
      expect(outcome.existingId).toBe(edge.id);
    }
    const beforeRestart = await (await browser.get(path)).json();
    expect(beforeRestart.objects).toEqual(state.objects);
    expect(beforeRestart.relationships).toEqual(state.relationships);
    expect(beforeRestart.draft.changes).toEqual(state.draft.changes);
    expect(beforeRestart.draft.relationships).toEqual(state.draft.relationships);
    await installation.restart();
    expect(await (await browser.get(path)).json()).toEqual(beforeRestart);
  } finally {
    await browser.dispose();
    await installation.close();
  }
});
