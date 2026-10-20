import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { conflictBasis } from '../../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState } from '../../../src/shared/map.js';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { collaborators } from '../../support/draft-conflict-http.js';

function removalReview(state: MapState) {
  const conflict = draftConflicts(state).find((item) => item.id === 'lo');
  if (!conflict) throw new Error('Missing changed removal consequences');
  return {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    command: 'removal-choices',
    conflict,
    basis: conflictBasis(state, conflict),
    removalChoices: {
      object: 'proposed',
      ...Object.fromEntries(
        (conflict.connections ?? []).map(({ id }) => [`relationship:${id}`, 'proposed']),
      ),
    },
  };
}

test('withdrawing an object removal restores newly reviewed connections while preserving independent deletions and work', async () => {
  const first = await request.newContext();
  const second = await request.newContext();
  const app = await collaborators(first, second);
  try {
    const initial = await app.read();
    const value = {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',

      properties: [{ id: 'note', label: 'Anteckning', kind: 'text' as const, value: 'Bevara' }],
    };
    await app.propose(first, 'relationship', 'explicit', value);
    expect((await app.save(first, 'initial-edge')).status()).toBe(200);
    await app.propose(first, 'relationship', 'explicit', null);
    await app.propose(first, 'draft', 'lo', null);
    await app.propose(first, 'draft', 'independent', {
      typeId: initial.types[0].id,
      name: 'Oberoende arbete',

      properties: [{ id: 'empty', label: 'Tomt', kind: 'date' }],
    });
    await app.propose(second, 'relationship', 'incoming', {
      ...value,
      sourceId: 'service',
      targetId: 'lo',
    });
    await app.propose(second, 'relationship', 'self', { ...value, targetId: 'lo' });
    expect((await app.save(second, 'new-consequences')).status()).toBe(200);
    const before = await app.read();
    expect((await app.post(first, 'resolve', removalReview(before))).status()).toBe(200);
    const reviewed = await app.read();
    expect(
      (
        await app.post(first, 'discard-change', {
          version: reviewed.draft.version,
          kind: 'object',
          id: 'lo',
        })
      ).status(),
    ).toBe(200);
    const withdrawn = await app.read();
    expect(withdrawn.draft.relationships).toEqual(
      before.draft.relationships?.filter(({ id }) => id === 'explicit'),
    );
    expect(withdrawn.draft.changes).toEqual(
      before.draft.changes.filter(({ id }) => id === 'independent'),
    );
    expect((await app.save(first, 'withdrawn-removal')).status()).toBe(200);
    const final = await app.read();
    expect(final.objects.map(({ id }) => id).sort()).toEqual(['independent', 'lo', 'service']);
    expect(final.relationships.map(({ id }) => id).sort()).toEqual(['incoming', 'self']);
    expect(final.relationships.map(({ properties }) => properties)).toEqual([
      value.properties,
      value.properties,
    ]);
  } finally {
    await first.dispose();
    await second.dispose();
    await app.installation.close();
  }
});

for (const interfaceName of ['HTTP', 'MCP'] as const)
  test(`${interfaceName} rejects each expanded removal approval until current review and a fresh atomic save`, async () => {
    const first = await request.newContext();
    const second = await request.newContext();
    const app = await collaborators(first, second);
    try {
      const initial = await app.read();
      let token = '';
      if (interfaceName === 'MCP') {
        const flow = await beginAssistant(
          first,
          app.installation.origin,
          'skyttel:read skyttel:write offline_access',
        );
        const accepted = await flow.consent(initial.types[0].householdId);
        const exchanged = await flow.exchange((await accepted.json()).url);
        token = (await exchanged.json()).access_token;
      }
      async function invoke(
        route: 'operations' | 'save' | 'resolve',
        body: Record<string, unknown>,
      ) {
        if (interfaceName === 'HTTP') {
          const response = await app.post(first, route, body);
          return { rejected: !response.ok(), value: await response.json() };
        }
        const name = {
          operations: 'prepare_save',
          save: 'save_draft',
          resolve: 'resolve_conflict',
        }[route];
        const response = await callAssistant(app.installation.origin, token, name, body);
        expect(response.status).toBe(200);
        const result = (await response.json()).result;
        return { rejected: result.isError === true, value: JSON.parse(result.content[0].text) };
      }
      function approve(state: MapState, operationId: string) {
        return { version: state.draft.version, contentVersion: state.contentVersion, operationId };
      }
      async function resolve(state: MapState) {
        const review = removalReview(state);
        return invoke(
          'resolve',
          interfaceName === 'HTTP'
            ? review
            : {
                version: review.version,
                contentVersion: review.contentVersion,
                conflict: review.conflict,
                choice: 'proposed',
              },
        );
      }
      async function addEdge(id: string, sourceId: string, targetId: string) {
        await app.propose(second, 'relationship', id, {
          typeId: initial.relationshipTypes[0].id,
          sourceId,
          targetId,

          properties: [{ id: `${id}-note`, label: 'Tomt', kind: 'text' }],
        });
        expect((await app.save(second, `added-${id}`)).status()).toBe(200);
      }
      const history = async () => (await (await first.get(`${app.path}/history`)).json()).history;
      await app.propose(first, 'draft', 'lo', null);
      await app.propose(first, 'draft', 'independent', {
        typeId: initial.types[0].id,
        name: 'Oberoende arbete',

        properties: [{ id: 'zero', label: 'Antal', kind: 'number', value: 0 }],
      });
      const firstApproval = approve(await app.read(), 'old-approval');
      expect((await invoke('operations', firstApproval)).rejected).toBe(false);
      await addEdge('outgoing', 'lo', 'service');
      const unreviewed = await app.read();
      const beforeHistory = await history();
      const rejected = await invoke('save', firstApproval);
      expect(rejected.rejected).toBe(true);
      expect(rejected.value.error).toBe('endpoint_conflict');
      expect((await app.read()).draft).toEqual(unreviewed.draft);
      expect((await app.read()).objects).toEqual(unreviewed.objects);
      expect(await history()).toEqual(beforeHistory);
      if (interfaceName === 'MCP') {
        expect(rejected.value.message).toContain('nytt sparbesked');
        expect(rejected.value.review.conflicts[0].connections).toMatchObject([{ id: 'outgoing' }]);
      }
      await addEdge('incoming', 'service', 'lo');
      expect((await resolve(unreviewed)).rejected).toBe(true);
      expect((await app.read()).draft).toEqual(unreviewed.draft);
      expect((await resolve(await app.read())).rejected).toBe(false);
      const reviewed = await app.read();
      expect(reviewed.draft.relationships?.map(({ id }) => id).sort()).toEqual([
        'incoming',
        'outgoing',
      ]);
      expect((await invoke('save', firstApproval)).rejected).toBe(true);
      expect(
        (await invoke('save', { ...firstApproval, operationId: 'stale-version' })).rejected,
      ).toBe(true);
      expect((await app.read()).draft).toEqual(reviewed.draft);
      const secondApproval = approve(reviewed, 'second-approval');
      await addEdge('self', 'lo', 'lo');
      const raced = await app.read();
      const racedHistory = await history();
      expect((await invoke('save', secondApproval)).rejected).toBe(true);
      expect(await app.read()).toEqual(raced);
      expect(await history()).toEqual(racedHistory);
      expect((await resolve(raced)).rejected).toBe(false);
      expect((await invoke('save', secondApproval)).rejected).toBe(true);
      const latest = await app.read();
      const saved = await invoke('save', approve(latest, 'fresh-approval'));
      expect(saved.rejected).toBe(false);
      expect(saved.value.receipt.changes).toHaveLength(2);
      expect(saved.value.receipt.relationships.map(({ id }: { id: string }) => id).sort()).toEqual([
        'incoming',
        'outgoing',
        'self',
      ]);
      expect(
        saved.value.receipt.relationships.every(({ after }: { after: unknown }) => after === null),
      ).toBe(true);
      const final = await app.read();
      expect(final.objects.map(({ id }) => id).sort()).toEqual(['independent', 'service']);
      expect(final.objects.find(({ id }) => id === 'independent')?.properties).toEqual([
        { id: 'zero', label: 'Antal', kind: 'number', value: 0 },
      ]);
      expect(final.relationships).toEqual([]);
      expect(final.draft.changes).toEqual([]);
      expect(final.draft.relationships ?? []).toEqual([]);
      const finalHistory = await history();
      expect(finalHistory.slice(1)).toEqual(racedHistory);
      if (interfaceName === 'HTTP') expect(finalHistory[0]).toEqual(saved.value.receipt);
      else {
        expect(finalHistory[0]).toMatchObject(saved.value.receipt);
        const response = await callAssistant(app.installation.origin, token, 'read_history', {
          operationId: saved.value.receipt.operationId,
          userId: saved.value.receipt.userId,
        });
        expect(response.status).toBe(200);
        const result = (await response.json()).result;
        expect(result.isError).not.toBe(true);
        expect(JSON.parse(result.content[0].text).receipt).toEqual(saved.value.receipt);
      }
    } finally {
      await first.dispose();
      await second.dispose();
      await app.installation.close();
    }
  });
