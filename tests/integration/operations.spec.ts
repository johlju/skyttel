import type { MapState, SaveOperation, SaveReceipt } from '../../src/shared/map.js';
import {
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import { openSavedHistory } from '../support/conversation-page.js';
import { editTableObject } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('SPAR-01: find a committed save after losing its response and reopening on another client', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recovered = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const draft = await openDraftReview(page);
    let committedReceipt: SaveReceipt | undefined;
    await page.route('**/map/save', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedReceipt = (await response.json()).receipt;
      await route.abort();
    });
    await draft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Kasta hela utkastet' })).toBeDisabled();
    // Retire the original client's request connections before restarting the fixture.
    await page.context().close();
    await installation.restart();

    await signIn(recovered.request, installation.origin);
    const reopened = await recovered.newPage();
    await reopened.goto(installation.origin);
    const historyView = await openSavedHistory(reopened);
    await expect(historyView).toContainText('Lo Exempel');
    if (!committedReceipt) throw new Error('The save must commit before its response is lost');
    const receipt = historyView.locator('article').filter({ hasText: 'Lo Exempel' });
    await receipt.getByText('Identifiera sparandet och användaren', { exact: true }).click();
    await expect(receipt).toContainText(committedReceipt.operationId);
    await reopened.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(await openDraftReview(reopened)).toContainText('Utkastet är tomt.');
    await openTable(reopened);
    await expect(
      reopened.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }),
    ).toHaveCount(1);
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

test('SPAR-02: automatically recover the same pending save on another client after interruption before commit', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const recovered = await createPreparedContext(browser);
  let releaseCheck = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const draft = await openDraftReview(page);
    await page.route('**/map/save', (route) => route.abort());
    await draft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeDisabled();
    await page.close();
    await installation.restart();

    await signIn(recovered.request, installation.origin);
    const reopened = await recovered.newPage();
    const heldCheck = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    let checking = () => {};
    const checkStarted = new Promise<void>((resolve) => {
      checking = resolve;
    });
    let checks = 0;
    await reopened.route('**/text-assistant/recover', async (route) => {
      checks++;
      checking();
      await heldCheck;
      await route.continue();
    });
    await reopened.goto(installation.origin);
    await checkStarted;
    const followUp = reopened.getByRole('button', { name: 'Visa sparandet', exact: true });
    await expect(followUp).toBeVisible();
    await followUp.click();
    const recoveryDialog = reopened.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(recoveryDialog).toContainText('Sparandet kunde inte bekräftas.');
    await reopened.keyboard.press('Escape');
    const recoveryDraft = await openDraftReview(reopened);
    await expect(recoveryDraft).toContainText('Lo Exempel');
    await expect(reopened.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeDisabled();
    await expect(reopened.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await expect(reopened.getByRole('button', { name: 'Kasta hela utkastet' })).toBeDisabled();
    const pending: MapState = await (await recovered.request.get(path)).json();
    expect(pending.objects).toEqual([]);
    expect(pending.draft.changes).toHaveLength(1);
    expect((await (await recovered.request.get(`${path}/history`)).json()).history).toEqual([]);

    const originalOperations: { operations: SaveOperation[] } = await (
      await recovered.request.get(`${path}/operations`)
    ).json();
    expect(originalOperations.operations).toHaveLength(1);
    expect(originalOperations.operations[0].status).toBe('pending');
    releaseCheck();
    await expect(reopened.getByRole('status', { name: 'Sparbekräftelse' })).toHaveText(
      'Utkastet är sparat',
    );
    await expect(followUp).toHaveCount(0);
    const discovered: { operations: SaveOperation[] } = await (
      await recovered.request.get(`${path}/operations`)
    ).json();
    expect(discovered.operations).toHaveLength(1);
    const attempt = discovered.operations[0];
    expect(attempt.operationId).toBe(originalOperations.operations[0].operationId);
    expect(checks).toBe(1);
    if (attempt.status !== 'succeeded') throw new Error('Retry must have a durable receipt');
    const receipt = attempt.receipt;
    const saved: MapState = await (await recovered.request.get(path)).json();
    expect(saved.objects.map((object) => object.name)).toEqual(['Lo Exempel']);
    expect(saved.draft.changes).toEqual([]);

    await openNewObject(reopened);
    await reopened.getByLabel('Namn', { exact: true }).fill('Kim Exempel');
    await reopened.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
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
    await expect(await openDraftReview(reopened)).toContainText('Kim Exempel');
  } finally {
    releaseCheck();
    await recovered.close();
    await installation.close();
  }
});

test('SPAR-03: a rejected stale save survives restart without consuming newer proposals', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const second = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const draft = await openDraftReview(page);
    await signIn(second.request, installation.origin);
    const newer = await second.newPage();
    await newer.goto(installation.origin);
    await editTableObject(newer, 'Lo Exempel');
    await newer.getByLabel('Namn', { exact: true }).fill('Lo Lind');
    await newer.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const unchanged: MapState = await (await second.request.get(path)).json();

    await draft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Avvisat');
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    await page.keyboard.press('Escape');
    await openMap(page);
    await expect(page.getByRole('region', { name: 'Kartans status', exact: true })).toContainText(
      'Avvisat',
    );
    await expect(
      page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true }),
    ).toBeVisible();
    await page.close();
    await installation.restart();
    await newer.reload();
    await expect(newer.getByRole('region', { name: 'Kartans status', exact: true })).toContainText(
      'Utkastet kunde inte sparas.',
    );
    await newer.getByRole('button', { name: 'Visa sparandet', exact: true }).click();
    await expect(newer.getByRole('dialog', { name: 'Spara utkastet', exact: true })).toContainText(
      'Utkastet kunde inte sparas.',
    );
    await newer.keyboard.press('Escape');
    const currentDraft = await openDraftReview(newer);
    await expect(currentDraft).toContainText('Lo Lind');
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
    await expect(newer.getByRole('status', { name: 'Sparbekräftelse' })).toHaveText(
      'Utkastet är sparat',
    );
    await expect(await openSavedHistory(newer)).toContainText('Lo Lind');
    const results: { operations: SaveOperation[] } = await (
      await second.request.get(`${path}/operations`)
    ).json();
    expect(results.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationId: attempt.operationId, status: 'rejected' }),
        expect.objectContaining({ status: 'succeeded' }),
      ]),
    );
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
  const member = await createPreparedContext(browser);
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
    await openNewObject(memberPage);
    await memberPage.getByLabel('Namn', { exact: true }).fill('Privat förslag');
    await memberPage.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const memberDraft = await openDraftReview(memberPage);
    await memberPage.route('**/map/save', (route) => route.abort());
    await memberDraft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(memberPage.getByRole('alert')).toContainText('Utfallet är okänt');
    const discovered: { operations: SaveOperation[] } = await (
      await member.request.get(`${path}/operations`)
    ).json();
    expect(discovered.operations).toHaveLength(1);
    const attempt = discovered.operations[0];
    expect(attempt.status).toBe('pending');

    await page.goto(installation.origin);
    await expect(
      page.getByRole('region', { name: 'Kartans status', exact: true }),
    ).not.toContainText('Sparutfall okänt');
    await expect(await openDraftReview(page)).not.toContainText('Sparutfall okänt');
    expect(await (await page.request.get(`${path}/operations`)).json()).toEqual({ operations: [] });
    expect(
      await (await page.request.get(`${path}/operations/${attempt.operationId}`)).json(),
    ).toEqual({ operation: null });
    await expect(page.getByRole('region', { name: 'Utkastet', exact: true })).not.toContainText(
      'Privat förslag',
    );

    await openSettings(page);
    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    const memberRow = page
      .getByRole('list', { name: 'Medlemmar' })
      .getByRole('listitem')
      .filter({ hasText: robin.name });
    await memberRow.getByRole('button', { name: 'Återkalla tillgång', exact: true }).click();
    const revocationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/members/${user.id}/revoke`) &&
        response.request().method() === 'POST',
    );
    await memberRow.getByRole('button', { name: 'Bekräfta återkallelse', exact: true }).click();
    const revoked = await revocationResponse;
    expect(revoked.status()).toBe(200);
    await expect(memberRow).toHaveCount(0);
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
    await expect(memberPage.getByRole('region', { name: 'Utkastet', exact: true })).toHaveCount(0);
    expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
  } finally {
    await member.close();
    await installation.close();
  }
});
