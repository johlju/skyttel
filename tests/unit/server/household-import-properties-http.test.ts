import { createHash } from 'node:crypto';
import { request } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { expect, test } from 'vitest';
import type { ImportContent } from '../../../src/server/import-schema.js';
import type { MapState } from '../../../src/shared/map.js';
import type { Property } from '../../../src/shared/properties.js';
import { restartWithSession, signIn } from '../../support/client.js';
import { collaborators } from '../../support/draft-conflict-http.js';
import { applicationFixture } from './fixture.js';

const properties: Property[] = [
  { id: 'untyped', label: 'Samma' },
  { id: 'empty-date', label: 'Samma', kind: 'date' },
  { id: 'empty-text', label: 'Samma', kind: 'text', value: '' },
  { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
  { id: 'false', label: 'Samma', kind: 'boolean', value: false },
  { id: 'text', label: 'Telefon', kind: 'text', value: '0700123456' },
  { id: 'date', label: 'Datum', kind: 'date', value: '2026-10-18' },
];

function retainedDraft(content: ImportContent) {
  const draft = content.drafts.find(({ relationships }) =>
    relationships.some(({ id }) => id === 'retained'),
  );
  if (!draft) throw new Error('Missing retained draft');
  return draft;
}

for (const suppressed of [false, true]) {
  test(`historically proven recovery survives another member saving first${suppressed ? ' while suppressed' : ''} without granting stale save authority`, async () => {
    let first = await request.newContext();
    const second = await request.newContext();
    const third = await request.newContext();
    const app = await collaborators(first, second);
    const householdPath = app.path.slice(0, -4);
    const headers = { origin: app.installation.origin };
    try {
      app.installation.setIdentity({
        subject: 'third-user',
        name: 'Kim Exempel',
        email: 'kim@example.test',
      });
      await signIn(third, app.installation.origin);
      const { user } = await (await third.get(`${app.installation.origin}/api/bootstrap`)).json();
      const { code } = await (
        await first.post(`${householdPath}/invitations`, { headers, data: { userId: user.id } })
      ).json();
      expect(
        (
          await third.post(`${app.installation.origin}/api/invitations/accept`, {
            headers,
            data: { code },
          })
        ).status(),
      ).toBe(200);
      const initial = await app.read();
      const value = {
        typeId: initial.relationshipTypes[0].id,
        sourceId: 'lo',
        targetId: 'service',

        properties,
      };
      await app.propose(first, 'relationship', 'retained', value);
      expect((await app.save(first, 'shared-edge')).status()).toBe(200);
      for (const actor of [first, second])
        await app.propose(actor, 'relationship', 'retained', {
          ...value,
          properties: [...properties].reverse(),
        });
      await app.propose(third, 'draft', 'service', null);
      expect((await app.save(third, 'third-removal')).status()).toBe(200);
      for (const actor of [first, second]) {
        const state = await app.read(actor);
        expect(
          (
            await app.post(actor, 'relationship', {
              version: state.draft.version,
              id: 'retained',
              baseRevision: 1,
              value: { ...value, targetId: 'lo', properties: [...properties].reverse() },
            })
          ).status(),
        ).toBe(200);
        expect((await app.read(actor)).draft.relationships?.[0].endpointRecovery).toEqual({
          removedRevision: 2,
        });
      }
      expect((await app.save(second, 'first-correction')).status()).toBe(200);
      if (suppressed) await app.propose(first, 'draft', 'lo', null);
      const archived = await app.read();
      expect(archived.relationships[0].revision).toBe(3);
      const prepared = await (
        await first.post(`${householdPath}/exports`, { headers, data: {} })
      ).json();
      const bytes = await (await first.get(`${householdPath}/exports/${prepared.id}`)).body();
      const uploaded = await first.post(`${householdPath}/imports`, {
        headers: {
          ...headers,
          'content-type': 'application/zip',
          'X-Skyttel-Content-Version': String(archived.contentVersion),
        },
        data: bytes,
      });
      expect(uploaded.status(), await uploaded.text()).toBe(201);
      const ready = await uploaded.json();
      expect(
        (
          await first.post(`${householdPath}/imports/${ready.id}/confirm`, {
            headers,
            data: { confirmed: true, contentVersion: ready.contentVersion },
          })
        ).status(),
      ).toBe(200);
      first = await restartWithSession(first, () => app.installation.restart());
      const restored = await app.read(first);
      expect(restored.draft).toEqual(archived.draft);
      expect(restored.relationships).toEqual(archived.relationships);
      if (suppressed)
        expect(
          (
            await app.post(first, 'discard-change', {
              version: restored.draft.version,
              contentVersion: restored.contentVersion,
              kind: 'object',
              id: 'lo',
            })
          ).status(),
        ).toBe(200);
      const beforeSave = await app.read(first);
      expect(
        (
          await app.post(first, 'save', {
            version: beforeSave.draft.version,
            contentVersion: beforeSave.contentVersion,
            operationId: 'stale-correction',
          })
        ).status(),
      ).toBe(409);
      expect((await app.read(first)).relationships).toEqual(archived.relationships);
      expect((await app.read(first)).draft).toEqual(beforeSave.draft);
    } finally {
      await first.dispose();
      await second.dispose();
      await third.dispose();
      await app.installation.close();
    }
  });
}

function mutateArchive(bytes: Uint8Array, change: (content: ImportContent) => void) {
  const parts = unzipSync(bytes);
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  change(content);
  parts['content.json'] = Buffer.from(JSON.stringify(content));
  const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  const part = manifest.parts.find((part: { path: string }) => part.path === 'content.json');
  part.bytes = parts['content.json'].length;
  part.sha256 = createHash('sha256').update(parts['content.json']).digest('hex');
  parts['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  return zipSync(parts);
}

for (const variant of ['blocked', 'corrected', 'suppressed'] as const) {
  test(`full property archive preserves ${variant} retained proposals and permits correction after process restart`, async () => {
    let first = await request.newContext();
    const second = await request.newContext();
    const app = await collaborators(first, second);
    const householdPath = app.path.slice(0, -4);
    const headers = { origin: app.installation.origin };
    try {
      const initial = await app.read();
      await app.propose(first, 'draft', 'lo', { ...initial.objects[0], properties });
      const value = {
        typeId: initial.relationshipTypes[0].id,
        sourceId: 'lo',
        targetId: 'service',

        properties,
      };
      await app.propose(first, 'relationship', 'retained', value);
      expect((await app.save(first, 'saved-properties')).status()).toBe(200);
      await app.propose(first, 'relationship', 'retained', {
        ...value,
        properties: [...properties].reverse(),
      });
      await app.propose(second, 'draft', 'service', null);
      expect((await app.save(second, 'removed-endpoint')).status()).toBe(200);
      if (variant !== 'blocked') {
        const state = await app.read();
        expect(
          (
            await app.post(first, 'relationship', {
              version: state.draft.version,
              id: 'retained',
              baseRevision: 1,
              value: { ...value, targetId: 'lo', properties: [...properties].reverse() },
            })
          ).status(),
        ).toBe(200);
        expect((await app.read()).draft.relationships?.[0].endpointRecovery).toEqual({
          removedRevision: 2,
        });
      }
      if (variant === 'suppressed') {
        await app.propose(first, 'relationship', 'new', {
          ...value,
          sourceId: 'lo',
          targetId: 'lo',
          typeId: initial.relationshipTypes[1].id,
        });
        await app.propose(first, 'draft', 'lo', null);
      }
      const archived = await app.read();
      const history = await (await first.get(`${app.path}/history`)).json();
      const exported = await first.post(`${householdPath}/exports`, { headers, data: {} });
      expect(exported.status()).toBe(201);
      const bytes = await (
        await first.get(`${householdPath}/exports/${(await exported.json()).id}`)
      ).body();
      const upload = (bytes: Uint8Array) =>
        first.post(`${householdPath}/imports`, {
          headers: {
            ...headers,
            'content-type': 'application/zip',
            'X-Skyttel-Content-Version': String(archived.contentVersion),
          },
          data: bytes,
        });
      if (variant === 'suppressed') {
        const target = await applicationFixture();
        try {
          const administrator = target.client();
          await administrator.signIn();
          const { household } = await (
            await administrator.json('/api/households', { name: 'Ny installation' })
          ).json();
          const targetPath = `/api/households/${household.id}`;
          const uploaded = await administrator.request(`${targetPath}/imports`, {
            method: 'POST',
            headers: {
              origin: target.config.origin,
              'content-type': 'application/zip',
              'X-Skyttel-Content-Version': '1',
            },
            body: new Uint8Array(bytes).buffer,
          });
          expect(uploaded.status).toBe(201);
          const ready = await uploaded.json();
          expect(
            (
              await administrator.json(`${targetPath}/imports/${ready.id}/confirm`, {
                confirmed: true,
                contentVersion: ready.contentVersion,
              })
            ).status,
          ).toBe(200);
          const current = await (await administrator.request(`${targetPath}/map`)).json();
          expect(current.draft).toEqual({ version: 0, changes: [] });
          const exported = await (await administrator.json(`${targetPath}/exports`, {})).json();
          const parts = unzipSync(
            new Uint8Array(
              await (
                await administrator.request(`${targetPath}/exports/${exported.id}`)
              ).arrayBuffer(),
            ),
          );
          const rehomed = JSON.parse(
            Buffer.from(parts['content.json']).toString(),
          ) as ImportContent;
          const nested = retainedDraft(rehomed).relationships.find(
            ({ id }) => id === 'retained',
          )?.suppressed;
          expect(nested?.before?.householdId).toBe(household.id);
          expect(nested?.type.householdId).toBe(household.id);
          expect(nested?.beforeType?.householdId).toBe(household.id);
          expect(nested?.after?.properties).toEqual([...properties].reverse());
          expect(rehomed.saves.map(({ receipt }) => receipt)).toEqual(
            (
              JSON.parse(Buffer.from(unzipSync(bytes)['content.json']).toString()) as ImportContent
            ).saves.map(({ receipt }) => receipt),
          );
        } finally {
          target.close();
        }
        for (const corrupt of [
          (content: ImportContent) => {
            retainedDraft(content).relationships[0].endpointRecovery = { removedRevision: 999 };
          },
          (content: ImportContent) => {
            const suppressed = retainedDraft(content).relationships[0].suppressed;
            if (!suppressed) throw new Error('Missing suppressed proposal');
            suppressed.endpointRecovery = { removedRevision: 999 };
          },
          (content: ImportContent) => {
            retainedDraft(content).relationships[0].removedWithObjects = ['service'];
          },
          (content: ImportContent) => {
            retainedDraft(content).relationships[0].removedWithObjects = ['lo', 'lo'];
          },
          (content: ImportContent) => {
            const suppressed = retainedDraft(content).relationships[0].suppressed;
            if (!suppressed) throw new Error('Missing suppressed proposal');
            suppressed.id = 'other';
          },
          (content: ImportContent) => {
            retainedDraft(content).changes = [];
          },
          (content: ImportContent) => {
            content.relationships[0].deleted = 0;
          },
          (content: ImportContent) => {
            const saved = content.saves.find((save) => save.operationId === 'removed-endpoint');
            const history = content.history.find((save) => save.operationId === 'removed-endpoint');
            if (!saved || !history) throw new Error('Missing deletion receipt');
            saved.receipt.changes = [];
            history.changes = [];
          },
          (content: ImportContent) => {
            const live = {
              ...content.relationships[0],
              sourceId: 'lo',
              targetId: 'lo',
              deleted: 0 as const,
            };
            content.relationships = [live, { ...live, id: 'duplicate-current' }];
          },
        ]) {
          expect((await upload(mutateArchive(bytes, corrupt))).status()).toBe(400);
          expect(await app.read()).toEqual(archived);
          expect(await (await first.get(`${app.path}/history`)).json()).toEqual(history);
        }
      }
      const uploaded = await upload(bytes);
      expect(uploaded.status(), await uploaded.text()).toBe(201);
      const ready = await uploaded.json();
      const confirmed = await first.post(`${householdPath}/imports/${ready.id}/confirm`, {
        headers,
        data: { confirmed: true, contentVersion: ready.contentVersion },
      });
      expect(confirmed.status(), await confirmed.text()).toBe(200);
      first = await restartWithSession(first, () => app.installation.restart());
      const restored = await app.read(first);
      expect(restored).toEqual({ ...archived, contentVersion: restored.contentVersion });
      expect(restored.contentVersion).toBeGreaterThan(archived.contentVersion);
      expect(await (await first.get(`${app.path}/history`)).json()).toEqual(history);
      if (variant === 'suppressed') {
        expect(
          (
            await app.post(first, 'discard-change', {
              version: restored.draft.version,
              contentVersion: restored.contentVersion,
              kind: 'object',
              id: 'lo',
            })
          ).status(),
        ).toBe(200);
      }
      let state: MapState = await app.read(first);
      if (variant === 'blocked') {
        expect((await app.save(first, 'blocked-after-import')).status()).toBe(409);
        expect(
          (
            await app.post(first, 'relationship', {
              version: state.draft.version,
              contentVersion: state.contentVersion,
              id: 'retained',
              baseRevision: 1,
              value: { ...value, targetId: 'lo', properties: [...properties].reverse() },
            })
          ).status(),
        ).toBe(200);
      }
      state = await app.read(first);
      expect(
        (
          await app.post(first, 'save', {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            operationId: 'continued-after-import',
          })
        ).status(),
      ).toBe(200);
      const final = await app.read(first);
      expect(final.objects[0].properties).toEqual(properties);
      expect(final.relationships.find(({ id }) => id === 'retained')?.properties).toEqual(
        [...properties].reverse(),
      );
      expect(final.relationships.find(({ id }) => id === 'retained')?.targetId).toBe('lo');
      expect((await second.get(app.path)).status()).toBe(200);
    } finally {
      await first.dispose();
      await second.dispose();
      await app.installation.close();
    }
  });
}
