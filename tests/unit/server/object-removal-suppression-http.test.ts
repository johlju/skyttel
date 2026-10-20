import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import { effectiveRelationships } from '../../../src/shared/map.js';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { restartWithSession } from '../../support/client.js';
import { collaborators } from '../../support/draft-conflict-http.js';

test('object removal suppresses new and edited relationships until every cause is undone, preserving exact proposals after restart', async () => {
  let first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const value = {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
    };
    await app.propose(first, 'relationship', 'edited', value);
    expect((await app.save(first, 'edge')).status()).toBe(200);
    await app.propose(first, 'relationship', 'edited', {
      ...value,
      properties: [
        { id: 'second', label: 'Samma', kind: 'boolean', value: false },
        { id: 'first', label: 'Samma', kind: 'number', value: 0 },
      ],
    });
    await app.propose(first, 'relationship', 'new', {
      ...value,
      sourceId: 'service',
      targetId: 'lo',
    });
    await app.propose(first, 'relationship', 'self', { ...value, sourceId: 'lo', targetId: 'lo' });
    const proposals = (await app.read()).draft.relationships;
    await app.propose(first, 'draft', 'lo', null);
    const suppressed = await app.read();
    expect(suppressed.draft.relationships?.map(({ id }) => id)).toEqual(['edited', 'new', 'self']);
    expect([...effectiveRelationships(suppressed).values()]).toEqual([]);
    await app.propose(first, 'draft', 'service', null);
    first = await restartWithSession(first, () => app.installation.restart());
    const reloaded = await app.read(first);
    expect(
      reloaded.draft.relationships?.find(({ id }) => id === 'edited')?.removedWithObjects,
    ).toEqual(['lo', 'service']);
    async function undo(id: string) {
      const state = await app.read(first);
      expect(
        (
          await app.post(first, 'discard-change', {
            version: state.draft.version,
            kind: 'object',
            id,
          })
        ).status(),
      ).toBe(200);
    }
    await undo('lo');
    expect(
      (await app.read(first)).draft.relationships?.find(({ id }) => id === 'new')?.after,
    ).toBeNull();
    await undo('service');
    expect((await app.read(first)).draft.relationships).toEqual(proposals);
    expect((await app.save(first, 'restored')).status()).toBe(200);
    expect((await app.read(first)).relationships.map(({ id }) => id).sort()).toEqual([
      'edited',
      'new',
      'self',
    ]);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

test('explicit relationship deletion survives undo while cascade save records only saved relationships atomically', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const value = {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
    };
    await app.propose(first, 'relationship', 'explicit', value);
    await app.propose(first, 'relationship', 'incoming', {
      ...value,
      sourceId: 'service',
      targetId: 'lo',
    });
    await app.propose(first, 'relationship', 'self', { ...value, targetId: 'lo' });
    expect((await app.save(first, 'edges')).status()).toBe(200);
    await app.propose(first, 'relationship', 'explicit', null);
    await app.propose(first, 'relationship', 'new', {
      ...value,
      sourceId: 'service',
      targetId: 'service',
    });
    await app.propose(first, 'draft', 'lo', null);
    const state = await app.read();
    expect(
      (
        await app.post(first, 'discard-change', {
          version: state.draft.version,
          kind: 'object',
          id: 'lo',
        })
      ).status(),
    ).toBe(200);
    expect(
      (await app.read()).draft.relationships?.find(({ id }) => id === 'explicit')?.after,
    ).toBeNull();
    await app.propose(first, 'draft', 'lo', null);
    await app.propose(first, 'draft', 'service', null);
    const response = await app.save(first, 'cascade');
    expect(response.status()).toBe(200);
    const receipt = (await response.json()).receipt;
    expect(receipt.changes).toHaveLength(2);
    expect(receipt.relationships.map(({ id }: { id: string }) => id).sort()).toEqual([
      'explicit',
      'incoming',
      'self',
    ]);
    expect(receipt.relationships.every(({ after }: { after: unknown }) => after === null)).toBe(
      true,
    );
    const final = await app.read();
    expect(final.objects).toEqual([]);
    expect(final.relationships).toEqual([]);
    expect(final.draft.relationships ?? []).toEqual([]);
    expect((await (await first.get(`${app.path}/history`)).json()).history[0].operationId).toBe(
      'cascade',
    );
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

test('undo restores a proposal that remains blocked by another member removal without resurrecting objects or partially saving', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    await app.propose(first, 'relationship', 'mine', {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',

      properties: [{ id: 'retained', label: 'Text', kind: 'text', value: 'Bevarat' }],
    });
    expect((await app.save(first, 'saved-before-suppression')).status()).toBe(200);
    const saved = (await app.read()).relationships[0];
    await app.propose(first, 'relationship', 'mine', { ...saved });
    const original = (await app.read()).draft.relationships?.[0];
    await app.propose(first, 'draft', 'lo', null);
    await app.propose(second, 'draft', 'service', null);
    expect((await app.save(second, 'other-removal')).status()).toBe(200);
    const state = await app.read();
    expect(
      (
        await app.post(first, 'discard-change', {
          version: state.draft.version,
          kind: 'object',
          id: 'lo',
        })
      ).status(),
    ).toBe(200);
    const restored = await app.read();
    expect(restored.draft.relationships).toEqual([original]);
    expect(draftConflicts(restored)).toMatchObject([{ id: 'mine', missingEndpoints: ['service'] }]);
    expect([...effectiveRelationships(restored).values()]).toEqual([]);
    await app.propose(first, 'draft', 'independent', {
      typeId: initial.types[0].id,
      name: 'Oberoende arbete',
    });
    const blocked = await app.read();
    expect((await app.save(first, 'blocked')).status()).toBe(409);
    expect((await app.read()).draft).toEqual(blocked.draft);
    expect((await app.read()).objects.map(({ id }) => id)).toEqual(['lo']);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

test('MCP object removal and undo retain suppressed contents and independently requested relationship deletions', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const flow = await beginAssistant(
      first,
      app.installation.origin,
      'skyttel:read skyttel:write offline_access',
    );
    const accepted = await flow.consent(initial.types[0].householdId);
    const exchanged = await flow.exchange((await accepted.json()).url);
    const token = (await exchanged.json()).access_token;
    async function tool(name: string, args: Record<string, unknown> = {}) {
      const state = await app.read();
      const response = await callAssistant(
        app.installation.origin,
        token,
        name,
        name === 'read_my_draft'
          ? {}
          : { version: state.draft.version, contentVersion: state.contentVersion, ...args },
      );
      expect(response.status).toBe(200);
      const result = (await response.json()).result;
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0].text);
    }
    const value = {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',

      properties: [{ id: 'property', label: 'Tomt', kind: 'date' }],
    };
    await tool('propose_relationship', { id: 'new', baseRevision: null, value });
    const original = (await app.read()).draft.relationships;
    await tool('propose_object', { id: 'lo', baseRevision: 1, value: null });
    const review = await tool('read_my_draft');
    expect(review.relationships[0].suppressed.after.properties).toEqual(value.properties);
    await tool('discard_proposal', { kind: 'object', id: 'lo' });
    expect((await app.read()).draft.relationships).toEqual(original);
    await tool('propose_object', { id: 'lo', baseRevision: 1, value: null });
    await tool('propose_relationship', { id: 'new', baseRevision: null, value: null });
    await tool('discard_proposal', { kind: 'object', id: 'lo' });
    expect((await app.read()).draft.relationships ?? []).toEqual([]);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

test('removing a saved endpoint suppresses an edit that moves away from it and undo restores that exact edit', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second, [
    ['lo', 'Lo Exempel'],
    ['service', 'Molnmusik'],
    ['other', 'Annan tjänst'],
  ]);
  try {
    const initial = await app.read();
    const value = {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
    };
    await app.propose(first, 'relationship', 'edited', value);
    expect((await app.save(first, 'edge')).status()).toBe(200);
    await app.propose(first, 'relationship', 'edited', {
      ...value,
      targetId: 'other',
      properties: [{ id: 'note', label: 'Anteckning', kind: 'text', value: 'Bevara flytten' }],
    });
    const original = (await app.read()).draft.relationships;
    await app.propose(first, 'draft', 'service', null);
    expect((await app.read()).draft.relationships?.[0].after).toBeNull();
    await app.propose(first, 'draft', 'service', null);
    const removed = await app.read();
    expect(removed.draft.relationships?.[0].suppressed).toEqual(original?.[0]);
    expect(removed.draft.relationships?.[0].suppressed).not.toHaveProperty('suppressed');
    expect(
      (
        await app.post(first, 'discard-change', {
          version: removed.draft.version,
          kind: 'object',
          id: 'service',
        })
      ).status(),
    ).toBe(200);
    expect((await app.read()).draft.relationships).toEqual(original);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

test('permanent erasure reviews and removes suppressed new relationship contents', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    await app.propose(first, 'relationship', 'suppressed', {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',

      properties: [{ id: 'private', label: 'Anteckning', kind: 'text', value: 'ERASE-SUPPRESSED' }],
    });
    await app.propose(first, 'draft', 'lo', null);
    const selection = [{ kind: 'object', id: 'lo' }];
    const path = app.path.replace(/\/map$/, '/erasure');
    const response = await first.post(`${path}/review`, {
      headers: { origin: app.installation.origin },
      data: { selection },
    });
    expect(response.status()).toBe(200);
    const review = await response.json();
    expect(review.relationships).toMatchObject([{ id: 'suppressed' }]);
    expect(
      (
        await first.post(`${path}/execute`, {
          headers: { origin: app.installation.origin },
          data: {
            selection,
            token: review.token,
            operationId: 'erase-suppressed',
            confirmation: 'RADERA PERMANENT',
          },
        })
      ).status(),
    ).toBe(200);
    const final = await app.read();
    expect(final.draft.relationships ?? []).toEqual([]);
    expect(JSON.stringify(final)).not.toContain('ERASE-SUPPRESSED');
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});
