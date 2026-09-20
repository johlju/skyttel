import { expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('AVTAL-04: dated debt and credit facts survive draft recovery, correction and history', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const financialFacts = {
      debt: { knowledge: 'uncertain', value: '125 000,50', reportedOn: '2026-09-01' },
      creditLimit: { knowledge: 'known', value: '80 000', reportedOn: '2026-08-01' },
      usedCredit: { knowledge: 'known', value: '12 500', reportedOn: '2026-09-02' },
      currency: { knowledge: 'known', value: 'SEK' },
      price: { knowledge: 'unknown' },
      terms: { knowledge: 'none' },
    };
    const value = {
      typeId: initial.types.find((type) => type.name === 'Kreditavtal')?.id,
      name: 'Exempelkredit',
      description: '',
      financialFacts,
    };
    expect(
      (
        await post('draft', {
          version: initial.draft.version,
          id: 'credit',
          baseRevision: null,
          value,
        })
      ).status(),
    ).toBe(200);
    const proposed = await read();
    expect(proposed.objects).toEqual([]);
    expect(proposed.draft.changes[0].after).toEqual(value);
    await installation.restart();
    expect((await read()).draft).toEqual(proposed.draft);
    const response = await post('save', { version: proposed.draft.version, operationId: 'credit' });
    expect(response.status()).toBe(200);
    const { receipt } = await response.json();
    expect(receipt.userId).toBe(initial.userId);
    expect(Number.isNaN(Date.parse(receipt.savedAt))).toBe(false);
    expect(receipt.changes[0].after).toMatchObject(value);
    const saved = await read();
    expect(saved.objects[0]).toEqual(receipt.changes[0].after);
    const corrected = {
      ...value,
      financialFacts: {
        ...financialFacts,
        usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-20' },
      },
    };
    expect(
      (
        await post('draft', {
          version: saved.draft.version,
          id: 'credit',
          baseRevision: 1,
          value: corrected,
        })
      ).status(),
    ).toBe(200);
    const correction = await read();
    expect(correction.draft.changes[0].before).toEqual(saved.objects[0]);
    expect(
      (
        await post('save', { version: correction.draft.version, operationId: 'correct-credit' })
      ).status(),
    ).toBe(200);
    await installation.restart();
    expect((await read()).objects[0]).toMatchObject({ ...corrected, id: 'credit', revision: 2 });
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(receipt);
    expect(history[1]).toMatchObject({
      userId: initial.userId,
      changes: [{ before: saved.objects[0], after: corrected }],
    });
  } finally {
    await installation.close();
  }
});

test('AVTAL-08: resolving financial conflicts preserves independent facts and requires a whole new save', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (client = page.request): Promise<MapState> =>
      (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers: { origin: installation.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    const state = await read();
    const value = {
      typeId: state.types.find((type) => type.name === 'Låneavtal')?.id,
      name: 'Exempellån',
      description: '',
      financialFacts: {
        debt: { knowledge: 'uncertain', value: '150000', reportedOn: '2026-08-01' },
        creditLimit: { knowledge: 'known', value: '200000' },
        terms: { knowledge: 'known', value: 'Preliminära villkor' },
      },
    };
    expect(
      (await post('draft', { version: 0, id: 'loan', baseRevision: null, value })).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'initial' })).status()).toBe(200);
    const proposedFacts = {
      debt: { knowledge: 'known', value: '140000', reportedOn: '2026-09-01' },
      creditLimit: value.financialFacts.creditLimit,
    };
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id: 'loan',
          baseRevision: 1,
          value: { ...value, financialFacts: proposedFacts },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id: 'unrelated',
          baseRevision: null,
          value: { typeId: state.types[0].id, name: 'Lo', description: '' },
        })
      ).status(),
    ).toBe(200);
    expect((await read(other.request)).draft.changes).toEqual([]);
    const otherFacts = {
      ...value.financialFacts,
      creditLimit: { knowledge: 'known', value: '250000' },
      currency: { knowledge: 'known', value: 'SEK' },
    };
    expect(
      (
        await post(
          'draft',
          {
            version: 0,
            id: 'loan',
            baseRevision: 1,
            value: { ...value, financialFacts: otherFacts },
          },
          other.request,
        )
      ).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'other' }, other.request)).status()).toBe(
      200,
    );
    const before = await read();
    expect(
      (await post('save', { version: before.draft.version, operationId: 'conflict' })).status(),
    ).toBe(409);
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).objects).toHaveLength(1);
    expect((await read()).draft).toEqual(before.draft);
    expect(
      (
        await post('resolve', {
          version: before.draft.version,
          choice: 'proposed',
          conflict: { kind: 'object', id: 'loan', current: before.objects[0] },
        })
      ).status(),
    ).toBe(200);
    const resolved = await read();
    const expectedFacts = {
      debt: proposedFacts.debt,
      creditLimit: otherFacts.creditLimit,
      currency: otherFacts.currency,
    };
    expect(resolved.draft.changes.find((change) => change.id === 'loan')?.after).toMatchObject({
      financialFacts: expectedFacts,
    });
    expect(
      resolved.draft.changes.find((change) => change.id === 'loan')?.after?.financialFacts,
    ).not.toHaveProperty('terms');
    expect(resolved.objects).toEqual(before.objects);
    expect(
      (await post('save', { version: resolved.draft.version, operationId: 'resolved' })).status(),
    ).toBe(200);
    await installation.restart();
    const saved = await read();
    expect(saved.objects).toHaveLength(2);
    expect(saved.objects.find((object) => object.id === 'loan')?.financialFacts).toEqual(
      expectedFacts,
    );
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(3);
    expect(history[1].userId).toBe(user.id);
    expect(history[2].userId).toBe(state.userId);
    expect(history[2].changes[0].before.financialFacts).toEqual(otherFacts);
  } finally {
    await other.close();
    await installation.close();
  }
});

test('AVTAL-07: invalid financial facts preserve the entire current draft and saved map', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const value = { typeId: initial.types[0].id, name: 'Ofullständigt åtagande', description: '' };
    expect(
      (await post('draft', { version: 0, id: 'partial', baseRevision: null, value })).status(),
    ).toBe(200);
    const unchanged = await read();
    const response = await post('draft', {
      version: unchanged.draft.version,
      id: 'invalid',
      baseRevision: null,
      value: {
        ...value,
        financialFacts: { debt: { knowledge: 'known', value: '100', reportedOn: '2026-02-30' } },
      },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(await read()).toEqual(unchanged);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
    expect(
      (await post('save', { version: unchanged.draft.version, operationId: 'partial' })).status(),
    ).toBe(200);
    expect((await read()).objects[0]).toMatchObject(value);
    expect((await read()).objects[0]).not.toHaveProperty('financialFacts');
  } finally {
    await installation.close();
  }
});
