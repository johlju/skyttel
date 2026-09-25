import { expect, test } from '@playwright/test';
import type { MapState, SaveOperation, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('SPAR-01: find a committed save after losing its response and reopening on another client', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recovered = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    let committedReceipt: SaveReceipt | undefined;
    await page.route('**/map/save', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedReceipt = (await response.json()).receipt;
      await route.abort();
    });
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Kasta hela utkastet' })).toBeDisabled();
    await page.close();
    await installation.restart();

    await signIn(recovered.request, installation.origin);
    const reopened = await recovered.newPage();
    await reopened.goto(installation.origin);
    const operations = reopened.getByRole('region', { name: 'Mina sparförsök' });
    await expect(operations).toContainText('Genomfört');
    await expect(operations).toContainText('Lo Exempel');
    if (!committedReceipt) throw new Error('The save must commit before its response is lost');
    await expect(operations).toContainText(committedReceipt.operationId);
    await expect(reopened.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
    const state: MapState = await (await recovered.request.get(path)).json();
    expect(state.objects.map((object) => object.name)).toEqual(['Lo Exempel']);
    const { history } = await (await recovered.request.get(`${path}/history`)).json();
    expect(history).toEqual([committedReceipt]);
    const repeated = await recovered.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: {
        operationId: committedReceipt.operationId,
        version: committedReceipt.draftVersion,
      },
    });
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).receipt).toEqual(committedReceipt);
    expect((await (await recovered.request.get(`${path}/history`)).json()).history).toEqual(
      history,
    );
    expect((await (await recovered.request.get(path)).json()).objects).toEqual(state.objects);
  } finally {
    await recovered.close();
    await installation.close();
  }
});

test('SPAR-02: retry a pending save on another client after interruption before commit', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recovered = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    await page.route('**/map/save', (route) => route.abort());
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeDisabled();
    await page.close();
    await installation.restart();

    await signIn(recovered.request, installation.origin);
    const reopened = await recovered.newPage();
    await reopened.goto(installation.origin);
    const operations = reopened.getByRole('region', { name: 'Mina sparförsök' });
    await expect(operations).toContainText('Väntande');
    await expect(reopened.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Lo Exempel',
    );
    await expect(reopened.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeDisabled();
    await expect(reopened.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await expect(reopened.getByRole('button', { name: 'Kasta hela utkastet' })).toBeDisabled();
    const pending: MapState = await (await recovered.request.get(path)).json();
    expect(pending.objects).toEqual([]);
    expect(pending.draft.changes).toHaveLength(1);
    expect((await (await recovered.request.get(`${path}/history`)).json()).history).toEqual([]);

    await operations.getByRole('button', { name: 'Återförsök sparandet' }).click();
    await expect(reopened.getByRole('status')).toContainText('Sparat: Lo Exempel');
    await expect(operations).toContainText('Genomfört');
    await expect(operations).not.toContainText('Väntande');
    const discovered: { operations: SaveOperation[] } = await (
      await recovered.request.get(`${path}/operations`)
    ).json();
    expect(discovered.operations).toHaveLength(1);
    const attempt = discovered.operations[0];
    if (attempt.status !== 'succeeded') throw new Error('Retry must have a durable receipt');
    const receipt = attempt.receipt;
    const saved: MapState = await (await recovered.request.get(path)).json();
    expect(saved.objects.map((object) => object.name)).toEqual(['Lo Exempel']);
    expect(saved.draft.changes).toEqual([]);

    await reopened.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await reopened.getByLabel('Objektets namn').fill('Kim Exempel');
    await reopened.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    const newerDraft: MapState = await (await recovered.request.get(path)).json();
    const repeated = await recovered.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: {
        operationId: attempt.operationId,
        version: attempt.draftVersion,
        contentVersion: attempt.contentVersion,
      },
    });
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).receipt).toEqual(receipt);
    const afterRetry: MapState = await (await recovered.request.get(path)).json();
    expect(afterRetry.objects).toEqual(saved.objects);
    expect(afterRetry.draft).toEqual(newerDraft.draft);
    expect(afterRetry.draft.changes.map((change) => change.after?.name)).toEqual(['Kim Exempel']);
    expect((await (await recovered.request.get(`${path}/history`)).json()).history).toEqual([
      receipt,
    ]);
  } finally {
    await recovered.close();
    await installation.close();
  }
});

test('SPAR-03: a rejected stale save survives restart without consuming newer proposals', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const second = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    await signIn(second.request, installation.origin);
    const newer = await second.newPage();
    await newer.goto(installation.origin);
    await newer.getByRole('button', { name: 'Lo Exempel', exact: true }).click();
    await newer.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await newer.getByLabel('Objektets namn').fill('Lo Lind');
    await newer.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    const unchanged: MapState = await (await second.request.get(path)).json();

    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Avvisat');
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    await page.close();
    await installation.restart();
    await newer.reload();
    const operations = newer.getByRole('region', { name: 'Mina sparförsök' });
    await expect(operations).toContainText('Avvisat');
    await expect(operations).toContainText('Förslaget eller kartan har ändrats');
    await expect(operations).not.toContainText('Genomfört');
    await expect(newer.getByRole('region', { name: 'Hela mitt utkast' })).toContainText('Lo Lind');
    const discovered: { operations: SaveOperation[] } = await (
      await second.request.get(`${path}/operations`)
    ).json();
    expect(discovered.operations).toHaveLength(1);
    const attempt = discovered.operations[0];
    expect(attempt.status).toBe('rejected');
    const repeated = await second.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: {
        operationId: attempt.operationId,
        version: attempt.draftVersion,
        contentVersion: attempt.contentVersion,
      },
    });
    expect(repeated.status()).toBe(409);
    expect(await repeated.json()).toEqual({ error: 'draft_conflict' });
    const afterRetry: MapState = await (await second.request.get(path)).json();
    expect(afterRetry.draft).toEqual(unchanged.draft);
    expect(afterRetry.objects).toEqual([]);
    expect((await (await second.request.get(`${path}/history`)).json()).history).toEqual([]);
    await newer.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(newer.getByRole('status')).toContainText('Sparat: Lo Lind');
    await expect(operations).toContainText('Genomfört');
    await expect(operations).toContainText('Avvisat');
  } finally {
    await second.close();
    await installation.close();
  }
});

test('SPAR-04: private pending saves stay hidden from administrators and revoked members', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const member = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const headers = { origin: installation.origin };
    installation.setIdentity(robin);
    await signIn(member.request, installation.origin, 'microsoft');
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const invitation = await page.request.post(
      `${installation.origin}/api/households/${household.id}/invitations`,
      { headers, data: { userId: user.id } },
    );
    const { code } = await invitation.json();
    const accepted = await member.request.post(`${installation.origin}/api/invitations/accept`, {
      headers,
      data: { code },
    });
    expect(accepted.status()).toBe(200);
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await memberPage.getByLabel('Objektets namn').fill('Privat förslag');
    await memberPage.getByRole('button', { name: 'Lägg i mitt utkast' }).click();
    await memberPage.route('**/map/save', (route) => route.abort());
    await memberPage.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(memberPage.getByRole('alert')).toContainText('Utfallet är okänt');
    const discovered: { operations: SaveOperation[] } = await (
      await member.request.get(`${path}/operations`)
    ).json();
    expect(discovered.operations).toHaveLength(1);
    const attempt = discovered.operations[0];
    expect(attempt.status).toBe('pending');

    await page.goto(installation.origin);
    await expect(page.getByRole('region', { name: 'Mina sparförsök' })).toContainText(
      'Inga registrerade sparförsök',
    );
    expect(await (await page.request.get(`${path}/operations`)).json()).toEqual({ operations: [] });
    expect(
      await (await page.request.get(`${path}/operations/${attempt.operationId}`)).json(),
    ).toEqual({ operation: null });
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).not.toContainText(
      'Privat förslag',
    );

    const revoked = await page.request.post(
      `${installation.origin}/api/households/${household.id}/members/${user.id}/revoke`,
      { headers, data: {} },
    );
    expect(revoked.status()).toBe(200);
    for (const suffix of ['/operations', `/operations/${attempt.operationId}`]) {
      const denied = await member.request.get(`${path}${suffix}`);
      expect(denied.status()).toBe(403);
      expect(await denied.json()).toEqual({ error: 'forbidden' });
    }
    const retry = await member.request.post(`${path}/save`, {
      headers,
      data: {
        operationId: attempt.operationId,
        version: attempt.draftVersion,
        contentVersion: attempt.contentVersion,
      },
    });
    expect(retry.status()).toBe(403);
    expect(await retry.json()).toEqual({ error: 'forbidden' });
    await memberPage.unroute('**/map/save');
    await memberPage.reload();
    await expect(
      memberPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeVisible();
    await expect(memberPage.getByRole('region', { name: 'Mina sparförsök' })).toHaveCount(0);
    expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
  } finally {
    await member.close();
    await installation.close();
  }
});
