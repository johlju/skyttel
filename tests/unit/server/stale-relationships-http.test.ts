import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { Property } from '../../../src/shared/properties.js';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { restartWithSession } from '../../support/client.js';
import { collaborators } from '../../support/draft-conflict-http.js';

for (const saved of [false, true]) {
  test(`previously valid ${saved ? 'edited' : 'new'} relationship survives endpoint loss, restart and correction without partial saving`, async () => {
    let first = await request.newContext();
    const second = await request.newContext();
    const app = await collaborators(first, second);
    try {
      const initial = await app.read();
      const properties: Property[] = [
        { id: 'empty-text', label: 'Samma', kind: 'text', value: '' },
        { id: 'untyped', label: 'Tomt' },
        { id: 'typed', label: 'Tomt', kind: 'date' },
        { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
        { id: 'false', label: 'Samma', kind: 'boolean', value: false },
      ];
      const value = {
        typeId: initial.relationshipTypes[0].id,
        sourceId: 'lo',
        targetId: 'service',

        properties,
      };
      if (saved) {
        await app.propose(first, 'relationship', 'mine', value);
        expect((await app.save(first, 'saved-edge')).status()).toBe(200);
      }
      await app.propose(first, 'relationship', 'mine', { ...value });
      await app.propose(first, 'draft', 'independent', {
        typeId: initial.types[0].id,
        name: 'Mitt andra arbete',
      });
      const proposal = (await app.read()).draft.relationships?.[0];
      expect(proposal?.after?.properties).toEqual(properties);
      await app.propose(second, 'draft', 'service', null);
      expect((await app.save(second, 'remove-endpoint')).status()).toBe(200);
      const blocked = await app.read();
      expect(blocked.draft.relationships?.[0]).toEqual(proposal);
      expect(draftConflicts(blocked)).toMatchObject([
        { id: 'mine', missingEndpoints: ['service'] },
      ]);
      expect(blocked.relationships).toEqual([]);
      const history = await (await first.get(`${app.path}/history`)).json();
      expect((await app.save(first, 'blocked-save')).status()).toBe(409);
      expect((await app.read()).draft).toEqual(blocked.draft);
      expect(await (await first.get(`${app.path}/history`)).json()).toEqual(history);
      expect(blocked.objects.some(({ id }) => id === 'independent')).toBe(false);
      first = await restartWithSession(first, () => app.installation.restart());
      const reloaded = await app.read(first);
      expect(reloaded.draft).toEqual(blocked.draft);
      expect(reloaded.relationships).toEqual([]);
      const correction = {
        version: reloaded.draft.version,
        id: 'mine',
        baseRevision: proposal?.before?.revision ?? null,
        value: { ...proposal?.after, targetId: 'lo' },
      };
      expect(
        (
          await app.post(first, 'relationship', {
            ...correction,
            value: { ...correction.value, targetId: 'invented' },
          })
        ).status(),
      ).toBe(400);
      expect((await app.read(first)).draft).toEqual(blocked.draft);
      expect((await app.post(first, 'relationship', correction)).status()).toBe(200);
      const corrected = await app.read(first);
      expect(draftConflicts(corrected)).toEqual([]);
      expect(corrected.draft.relationships?.[0]).toMatchObject({
        id: 'mine',
        after: { targetId: 'lo' },
      });
      expect(corrected.draft.relationships?.[0].after?.properties).toEqual(properties);
      const approved = {
        operationId: 'corrected-save',
        version: corrected.draft.version,
        contentVersion: corrected.contentVersion,
      };
      const savedResponse = await app.post(first, 'save', approved);
      expect(savedResponse.status()).toBe(200);
      const { receipt } = await savedResponse.json();
      expect(receipt.relationships).toMatchObject([
        {
          id: 'mine',
          before: null,
          after: { sourceId: 'lo', targetId: 'lo', revision: saved ? 3 : 1, properties },
          objectNames: { lo: 'Lo Exempel' },
        },
      ]);
      expect(receipt.relationships[0].objectNames).not.toHaveProperty('service');
      const final = await app.read(first);
      expect(final.relationships).toMatchObject([{ id: 'mine', targetId: 'lo' }]);
      expect(final.relationships[0].properties).toEqual(properties);
      expect(final.objects.map(({ id }) => id).sort()).toEqual(['independent', 'lo']);
      first = await restartWithSession(first, () => app.installation.restart());
      expect(await (await app.post(first, 'save', approved)).json()).toEqual({ receipt });
      expect(await app.read(first)).toEqual(final);
      const finalHistory = (await (await first.get(`${app.path}/history`)).json()).history;
      expect(
        finalHistory.filter(
          (item: { operationId: string }) => item.operationId === 'corrected-save',
        ),
      ).toEqual([receipt]);
      expect(finalHistory.slice(1)).toEqual(history.history);
    } finally {
      await first.dispose();
      await second.dispose();
      await app.installation.close();
    }
  });
}

test('MCP explains blocked proposals, rejects invalid correction, and discards only that proposal', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const householdId = initial.types[0].householdId;
    const flow = await beginAssistant(
      first,
      app.installation.origin,
      'skyttel:read skyttel:write offline_access',
    );
    const accepted = await flow.consent(householdId);
    const exchanged = await flow.exchange((await accepted.json()).url);
    const token = (await exchanged.json()).access_token;
    async function tool(name: string, args = {}) {
      const response = await callAssistant(app.installation.origin, token, name, args);
      expect(response.status).toBe(200);
      const result = (await response.json()).result;
      return { error: result.isError === true, value: JSON.parse(result.content[0].text) };
    }
    await app.propose(first, 'relationship', 'mine', {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
    });
    await app.propose(first, 'draft', 'independent', {
      typeId: initial.types[0].id,
      name: 'Mitt arbete',
    });
    await app.propose(second, 'draft', 'service', null);
    expect((await app.save(second, 'remove-endpoint')).status()).toBe(200);
    const blocked = await app.read();
    const review = await tool('read_my_draft');
    expect(review.value.readyToSave).toBe(false);
    expect(review.value.blockedRelationships).toMatchObject([
      {
        id: 'mine',
        missingEndpoints: ['service'],
        reason: expect.stringContaining('blockerar hela utkastets sparande'),
      },
    ]);
    expect((await tool('read_map')).value.relationships).toEqual([]);
    expect(
      (
        await tool('save_draft', {
          version: blocked.draft.version,
          contentVersion: blocked.contentVersion,
          operationId: 'blocked-mcp',
        })
      ).error,
    ).toBe(true);
    expect((await app.read()).draft).toEqual(blocked.draft);
    const proposal = review.value.relationships?.[0];
    expect(
      (
        await tool('propose_relationship', {
          version: blocked.draft.version,
          contentVersion: blocked.contentVersion,
          id: 'mine',
          baseRevision: null,
          value: { ...proposal?.after, targetId: 'invented' },
        })
      ).error,
    ).toBe(true);
    expect((await app.read()).draft).toEqual(blocked.draft);
    expect(
      (
        await tool('discard_proposal', {
          version: blocked.draft.version,
          contentVersion: blocked.contentVersion,
          kind: 'relationship',
          id: 'mine',
        })
      ).error,
    ).toBe(false);
    const remaining = await app.read();
    expect(remaining.draft.changes).toEqual(blocked.draft.changes);
    expect(remaining.draft.relationships ?? []).toEqual([]);
    expect((await tool('read_my_draft')).value.readyToSave).toBe(true);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

test('endpoint correction authority cannot be supplied to restore an independently deleted relationship', async () => {
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
    await app.propose(first, 'relationship', 'mine', value);
    expect((await app.save(first, 'initial-edge')).status()).toBe(200);
    await app.propose(first, 'relationship', 'mine', { ...value });
    await app.propose(second, 'relationship', 'mine', null);
    expect((await app.save(second, 'explicit-removal')).status()).toBe(200);
    const blocked = await app.read();
    expect(
      (
        await app.post(first, 'relationship', {
          version: blocked.draft.version,
          id: 'mine',
          baseRevision: 1,
          endpointRecovery: { removedRevision: 2 },
          value: { ...value, targetId: 'lo' },
        })
      ).status(),
    ).toBe(200);
    expect((await app.read()).draft.relationships?.[0].endpointRecovery).toBeUndefined();
    expect((await app.save(first, 'cannot-restore')).status()).toBe(409);
    expect((await app.read()).relationships).toEqual([]);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});
