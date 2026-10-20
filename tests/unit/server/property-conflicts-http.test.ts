import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { conflictBasis } from '../../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { Property } from '../../../src/shared/properties.js';
import { restartWithSession } from '../../support/client.js';
import { collaborators } from '../../support/draft-conflict-http.js';

test('independent equal-label property edits and additions combine for objects and relationships and persist after restart', async () => {
  let first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const original: Property[] = [
      { id: 'a', label: 'Samma', kind: 'number', value: 1 },
      { id: 'b', label: 'Samma', kind: 'boolean', value: true },
    ];
    for (const kind of ['draft', 'relationship'] as const) {
      const id = kind === 'draft' ? 'lo' : 'edge';
      const value =
        kind === 'draft'
          ? { typeId: initial.types[0].id, name: 'Lo Exempel' }
          : {
              typeId: initial.relationshipTypes[0].id,
              sourceId: 'lo',
              targetId: 'service',
            };
      await app.propose(first, kind, id, { ...value, properties: original });
      expect((await app.save(first, `seed-${kind}`)).status()).toBe(200);
      await app.propose(first, kind, id, {
        ...value,
        properties: [
          { id: 'a', label: 'Samma', kind: 'number', value: 0 },
          original[1],
          { id: 'd', label: 'Samma', kind: 'text', value: 'Eget tillägg' },
        ],
      });
      await app.propose(second, kind, id, {
        ...value,
        properties: [
          original[0],
          { id: 'b', label: 'Samma', kind: 'boolean', value: false },
          { id: 'c', label: 'Samma', kind: 'text', value: 'Annans tillägg' },
        ],
      });
      expect((await app.save(second, `other-${kind}`)).status()).toBe(200);
      const stale = await app.read(first);
      expect((await app.save(first, `blocked-${kind}`)).status()).toBe(409);
      const conflict = draftConflicts(stale).find((item) => item.id === id);
      expect(conflict).toBeDefined();
      if (!conflict) throw new Error('Expected property conflict');
      const response = await app.post(first, 'resolve', {
        version: stale.draft.version,
        conflict,
        basis: conflictBasis(stale, conflict),
        choices: {},
      });
      expect(response.status(), await response.text()).toBe(200);
      expect(
        (
          await app.post(first, 'save', {
            version: stale.draft.version,
            operationId: `old-${kind}`,
          })
        ).status(),
      ).toBe(409);
      expect((await app.save(first, `combined-${kind}`)).status()).toBe(200);
      const expected = [
        { id: 'a', label: 'Samma', kind: 'number', value: 0 },
        { id: 'b', label: 'Samma', kind: 'boolean', value: false },
        { id: 'c', label: 'Samma', kind: 'text', value: 'Annans tillägg' },
        { id: 'd', label: 'Samma', kind: 'text', value: 'Eget tillägg' },
      ];
      expect(
        (kind === 'draft'
          ? (await app.read(first)).objects
          : (await app.read(first)).relationships
        ).find((item) => item.id === id)?.properties,
      ).toEqual(expected);
      first = await restartWithSession(first, () => app.installation.restart());
      expect(
        (kind === 'draft'
          ? (await app.read(first)).objects
          : (await app.read(first)).relationships
        ).find((item) => item.id === id)?.properties,
      ).toEqual(expected);
    }
  } finally {
    await second.dispose();
    await first.dispose();
    await app.installation.close();
  }
});

test('atomic property and delete-edit choices preserve independent work and require fresh approval for both entity kinds', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    for (const kind of ['draft', 'relationship'] as const) {
      const id = kind === 'draft' ? 'lo' : 'edge';
      const value =
        kind === 'draft'
          ? { typeId: initial.types[0].id, name: 'Lo Exempel' }
          : {
              typeId: initial.relationshipTypes[0].id,
              sourceId: 'lo',
              targetId: 'service',
            };
      const original: Property[] = [
        { id: 'a', label: 'Samma', kind: 'number', value: 1 },
        { id: 'b', label: 'Samma', kind: 'text', value: 'Tidigare' },
        { id: 'c', label: 'Samma', kind: 'boolean', value: true },
      ];
      await app.propose(first, kind, id, { ...value, properties: original });
      expect((await app.save(first, `seed-${kind}`)).status()).toBe(200);
      await app.propose(first, kind, id, {
        ...value,
        properties: [
          { id: 'a', label: 'Egen etikett', kind: 'number', value: 1 },
          original[2],
          { id: 'own', label: 'Eget', kind: 'text' },
        ],
      });
      await app.propose(second, kind, id, {
        ...value,
        properties: [
          { id: 'a', label: 'Samma', kind: 'boolean', value: false },
          { id: 'b', label: 'Samma', kind: 'text', value: 'Sparad ändring' },
          { id: 'c', label: 'Samma', kind: 'boolean', value: false },
        ],
      });
      expect((await app.save(second, `other-${kind}`)).status()).toBe(200);
      const stale = await app.read();
      const conflict = draftConflicts(stale).find((item) => item.id === id);
      if (!conflict) throw new Error('Expected property conflict');
      expect(stale.conflictPropertyActors?.[`${conflict.kind}:${id}`]?.['properties.b']?.name).toBe(
        'Robin',
      );
      const resolution = {
        version: stale.draft.version,
        conflict,
        basis: conflictBasis(stale, conflict),
      };
      const savedHistory = await (await first.get(`${app.path}/history`)).json();
      for (const choices of [
        {},
        { 'properties.a': 'proposed' },
        { 'properties.a': 'proposed', 'properties.b': 'saved', forged: 'saved' },
      ]) {
        expect((await app.post(first, 'resolve', { ...resolution, choices })).status()).toBe(400);
        expect((await app.read()).draft).toEqual(stale.draft);
      }
      expect((await app.save(first, `blocked-${kind}`)).status()).toBe(409);
      expect(await (await first.get(`${app.path}/history`)).json()).toEqual(savedHistory);
      const response = await app.post(first, 'resolve', {
        ...resolution,
        choices: { 'properties.a': 'proposed', 'properties.b': 'saved' },
      });
      expect(response.status(), await response.text()).toBe(200);
      const expected = [
        { id: 'a', label: 'Egen etikett', kind: 'number', value: 1 },
        { id: 'b', label: 'Samma', kind: 'text', value: 'Sparad ändring' },
        { id: 'c', label: 'Samma', kind: 'boolean', value: false },
        { id: 'own', label: 'Eget', kind: 'text' },
      ];
      const draft = (await app.read()).draft;
      expect(
        (kind === 'draft' ? draft.changes : draft.relationships)?.find((item) => item.id === id)
          ?.after?.properties,
      ).toEqual(expected);
      expect(
        (
          await app.post(first, 'save', {
            version: stale.draft.version,
            operationId: `stale-${kind}`,
          })
        ).status(),
      ).toBe(409);
      expect((await app.save(first, `resolved-${kind}`)).status()).toBe(200);
      expect(
        (kind === 'draft' ? (await app.read()).objects : (await app.read()).relationships).find(
          (item) => item.id === id,
        )?.properties,
      ).toEqual(expected);
    }
  } finally {
    await second.dispose();
    await first.dispose();
    await app.installation.close();
  }
});

test('contradictory property orders require a choice and preserve every selected identity and independent value', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    for (const kind of ['draft', 'relationship'] as const) {
      const id = kind === 'draft' ? 'lo' : 'edge';
      const value =
        kind === 'draft'
          ? { typeId: initial.types[0].id, name: 'Lo Exempel' }
          : {
              typeId: initial.relationshipTypes[0].id,
              sourceId: 'lo',
              targetId: 'service',
            };
      const a: Property = { id: 'a', label: 'Samma', kind: 'number', value: 1 };
      const b: Property = { id: 'b', label: 'Samma', kind: 'text' };
      const c: Property = { id: 'c', label: 'Samma', kind: 'boolean', value: true };
      await app.propose(first, kind, id, { ...value, properties: [a, b, c] });
      expect((await app.save(first, `seed-${kind}`)).status()).toBe(200);
      await app.propose(first, kind, id, {
        ...value,
        properties: [a, c, b, { id: 'own', label: 'Egen' }],
      });
      await app.propose(second, kind, id, {
        ...value,
        properties: [b, { ...a, value: 0 }, c, { id: 'other', label: 'Annan' }],
      });
      expect((await app.save(second, `other-${kind}`)).status()).toBe(200);
      const stale = await app.read();
      const conflict = draftConflicts(stale).find((item) => item.id === id);
      if (!conflict) throw new Error('Expected property conflict');
      const resolution = {
        version: stale.draft.version,
        conflict,
        basis: conflictBasis(stale, conflict),
      };
      expect((await app.post(first, 'resolve', { ...resolution, choices: {} })).status()).toBe(400);
      const response = await app.post(first, 'resolve', {
        ...resolution,
        choices: { propertiesOrder: 'proposed' },
      });
      expect(response.status(), await response.text()).toBe(200);
      expect((await app.save(first, `resolved-${kind}`)).status()).toBe(200);
      expect(
        (kind === 'draft' ? (await app.read()).objects : (await app.read()).relationships).find(
          (item) => item.id === id,
        )?.properties,
      ).toEqual([
        { ...a, value: 0 },
        c,
        b,
        { id: 'other', label: 'Annan' },
        { id: 'own', label: 'Egen' },
      ]);
    }
  } finally {
    await second.dispose();
    await first.dispose();
    await app.installation.close();
  }
});

test('concurrent insertion order is independent of the saving user and retains author order and arbitrary valid identities', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const entry = (id: string): Property => ({ id, label: 'Samma' });
    const original = ['a', 'b', 'c'].map(entry);
    const own = ['__proto__', 'z', 'y', 'a', 'm', 'l', 'b', 'c'].map(entry);
    const other = ['x', 'w', 'a', 'n', 'k', 'b', 'c'].map(entry);
    for (const [index, savingUser] of [second, first].entries()) {
      const id = `object-${index}`;
      const value = { typeId: initial.types[0].id, name: 'Cykeln' };
      await app.propose(first, 'draft', id, { ...value, properties: original });
      expect((await app.save(first, `seed-${index}`)).status()).toBe(200);
      await app.propose(first, 'draft', id, { ...value, properties: own });
      await app.propose(second, 'draft', id, { ...value, properties: other });
      expect((await app.save(savingUser, `first-${index}`)).status()).toBe(200);
      const resolvingUser = savingUser === first ? second : first;
      const stale = await app.read(resolvingUser);
      const conflict = draftConflicts(stale).find((item) => item.id === id);
      if (!conflict) throw new Error('Expected property conflict');
      const response = await app.post(resolvingUser, 'resolve', {
        version: stale.draft.version,
        conflict,
        basis: conflictBasis(stale, conflict),
        choices: {},
      });
      expect(response.status(), await response.text()).toBe(200);
      expect((await app.save(resolvingUser, `combined-${index}`)).status()).toBe(200);
      expect((await app.read()).objects.find((item) => item.id === id)?.properties).toEqual(
        ['__proto__', 'x', 'w', 'z', 'y', 'a', 'm', 'l', 'n', 'k', 'b', 'c'].map(entry),
      );
    }
  } finally {
    await second.dispose();
    await first.dispose();
    await app.installation.close();
  }
});
