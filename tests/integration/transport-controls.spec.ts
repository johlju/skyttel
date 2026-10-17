import type { Route } from '@playwright/test';
import { createManualTransport } from '../../scripts/manual-transport-control.js';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openTable,
  signIn,
} from '../support/client.js';
import { openSavedHistory } from '../support/conversation-page.js';
import { editTableObject, readDraftProposal } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('SPAR-05: scoped transport holds real staging, rejects stale saves and recovers a lost committed receipt', async ({
  page,
  browser,
}) => {
  const app = await createInstallation();
  const other = await createPreparedContext(browser);
  const reopened = await createPreparedContext(browser);
  let transport: Awaited<ReturnType<typeof createManualTransport>> | undefined;
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const history = async (): Promise<SaveReceipt[]> =>
      (await (await page.request.get(`${path}/history`)).json()).history;
    const events: { phase: string; route?: string; status?: number }[] = [];
    transport = await createManualTransport({
      publicOrigin: app.origin,
      upstreamOrigin: app.origin,
      householdId: household.id,
      report: (event) => events.push(event),
    });
    const proxy = transport;
    const host = new URL(app.origin).host;
    // The transport neither supplies authentication nor accepts another public Host.
    expect(
      (
        await other.request.get(`${proxy.address}/api/households/${household.id}/map`, {
          headers: { host },
        })
      ).status(),
    ).toBe(401);
    expect((await other.request.get(`${proxy.address}/api/bootstrap`)).status()).toBe(421);
    const deliver = async (route: Route) => {
      try {
        const result = await route.fetch({
          url: `${proxy.address}${new URL(route.request().url()).pathname}`,
          headers: { ...(await route.request().allHeaders()), host },
        });
        await route.fulfill({ response: result });
      } catch {
        await route.abort();
      }
    };
    await page.route('**/map/object-form', deliver);
    await page.route('**/map/save', deliver);
    await page.goto(app.origin);

    proxy.command('arm stage:before');
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    await expect.poll(() => events.at(-1)?.phase).toBe('held-before');
    await expect(form.getByRole('button', { name: 'Lägg i utkastet och stäng' })).toBeDisabled();
    expect((await read()).draft.changes).toEqual([]);
    expect((await read()).objects).toEqual([]);
    expect(await history()).toEqual([]);
    expect(() => proxy.command('arm save:before')).toThrow();
    proxy.command('release');
    await expect(form).toBeHidden();
    expect((await read()).draft.changes.map((change) => change.after?.name)).toEqual([
      'Lo Exempel',
    ]);
    await expect.poll(() => proxy.command('status').active).toBeUndefined();

    proxy.command('arm stage:after');
    await openNewObject(page);
    await form.getByLabel('Namn', { exact: true }).fill('Kim Exempel');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    await expect.poll(() => events.at(-1)?.phase).toBe('held-after');
    expect(events.at(-1)?.status).toBe(200);
    const staged = await read();
    expect(staged.draft.changes.map((change) => change.after?.name).sort()).toEqual([
      'Kim Exempel',
      'Lo Exempel',
    ]);
    expect(staged.objects).toEqual([]);
    expect(await history()).toEqual([]);
    await expect(form.getByRole('button', { name: 'Lägg i utkastet och stäng' })).toBeDisabled();
    proxy.command('drop');
    await expect(form.getByRole('alert')).toContainText(
      'Det är oklart om ändringen lades i utkastet',
    );
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Kim Exempel');
    await form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }).click();
    await expect(form).toBeHidden();
    expect((await read()).draft).toEqual(staged.draft);
    await expect.poll(() => proxy.command('status').active).toBeUndefined();

    proxy.command('arm save:drop-after');
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    const save = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(save.getByRole('status')).toContainText('Sparandet kunde inte bekräftas.');
    expect(events).toContainEqual({ phase: 'application-completed', route: 'save', status: 200 });
    await expect(draft.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    const receipts = await history();
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    expect((await read()).objects.map((object) => object.name).sort()).toEqual([
      'Kim Exempel',
      'Lo Exempel',
    ]);
    await page.context().close();
    await app.restart();
    await signIn(reopened.request, app.origin);
    const fresh = await reopened.newPage();
    await fresh.goto(app.origin);
    const historyView = await openSavedHistory(fresh);
    await expect(historyView.getByRole('article')).toHaveCount(1);
    await historyView.getByText('Identifiera sparandet och användaren', { exact: true }).click();
    await expect(historyView).toContainText(receipt.operationId);
    await fresh.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(await openDraftReview(fresh)).toContainText('Utkastet är tomt.');
    await closeTextView(fresh);
    await openTable(fresh);
    for (const name of ['Lo Exempel', 'Kim Exempel'])
      await expect(
        fresh.getByRole('button', { name: `Redigera ${name}`, exact: true }),
      ).toHaveCount(1);
    await fresh.reload();
    const reloadedHistory = await openSavedHistory(fresh);
    await expect(reloadedHistory.getByRole('article')).toHaveCount(1);
    await reloadedHistory
      .getByText('Identifiera sparandet och användaren', { exact: true })
      .click();
    await expect(reloadedHistory).toContainText(receipt.operationId);
    const repeated = await reopened.request.post(`${path}/save`, {
      headers: { origin: app.origin },
      data: {
        operationId: receipt.operationId,
        version: receipt.draftVersion,
        contentVersion: receipt.contentVersion,
      },
    });
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).receipt).toEqual(receipt);
    expect((await (await reopened.request.get(`${path}/history`)).json()).history).toEqual(
      receipts,
    );
    // Recovery without a conversation uses the same authenticated transport boundary.
    await expect.poll(() => proxy.command('status').active).toBeUndefined();
    proxy.command('arm recover:before');
    const recovery = reopened.request
      .post(`${proxy.address}/api/households/${household.id}/text-assistant/recover`, {
        headers: {
          host,
          origin: app.origin,
          cookie: (await reopened.cookies(app.origin))
            .map(({ name, value }) => `${name}=${value}`)
            .join('; '),
        },
        data: { operationIds: [receipt.operationId] },
      })
      .then(async (response) => ({ status: response.status(), body: await response.json() }))
      .catch((error: unknown) => ({ error }));
    await expect.poll(() => events.at(-1)?.phase).toBe('held-before');
    expect(events.at(-1)?.route).toBe('recover');
    proxy.command('release');
    const checked = await recovery;
    expect(checked).toMatchObject({ status: 200, body: { receipt } });
    expect((await (await reopened.request.get(`${path}/history`)).json()).history).toEqual(
      receipts,
    );
    await fresh.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    if (await fresh.getByRole('button', { name: 'Stäng textvyn', exact: true }).isVisible())
      await closeTextView(fresh);

    // A second ordinary member changes the same saved object while delivery waits.
    app.setIdentity(robin);
    await signIn(other.request, app.origin, 'microsoft');
    const { user } = await (await other.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await reopened.request.post(
      `${app.origin}/api/households/${household.id}/invitations`,
      {
        headers: { origin: app.origin },
        data: { userId: user.id },
      },
    );
    expect(invitation.status()).toBe(201);
    expect(
      (
        await other.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code: (await invitation.json()).code },
        })
      ).status(),
    ).toBe(200);
    await fresh.route('**/map/save', deliver);
    await editTableObject(fresh, 'Lo Exempel');
    await fresh.getByLabel('Beskrivning', { exact: true }).fill('Alex privata beskrivning');
    await fresh.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const before: MapState = await (await reopened.request.get(path)).json();
    proxy.command('arm save:before');
    await (await openDraftReview(fresh))
      .getByRole('button', { name: 'Spara hela utkastet' })
      .click();
    await expect.poll(() => events.at(-1)?.phase).toBe('held-before');
    const member: MapState = await (await other.request.get(path)).json();
    const lo = member.objects.find((object) => object.name === 'Lo Exempel');
    if (!lo) throw new Error('The saved object must be readable by both members');
    const memberPage = await other.newPage();
    await memberPage.goto(app.origin);
    const memberForm = await editTableObject(memberPage, 'Lo Exempel');
    await memberForm.getByLabel('Beskrivning', { exact: true }).fill('Robins sparade beskrivning');
    const stageResponse = memberPage.waitForResponse(
      (response) =>
        response.url().endsWith('/map/object-form') && response.request().method() === 'POST',
    );
    await memberForm.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    expect((await stageResponse).status()).toBe(200);
    const changed: MapState = await (await other.request.get(path)).json();
    const memberSave = memberPage.waitForResponse(
      (response) => response.url().endsWith('/map/save') && response.request().method() === 'POST',
    );
    await (await openDraftReview(memberPage))
      .getByRole('button', { name: 'Spara hela utkastet', exact: true })
      .click();
    const savedMember = await memberSave;
    expect(savedMember.status()).toBe(200);
    expect(savedMember.request().postDataJSON()).toMatchObject({
      version: changed.draft.version,
      contentVersion: changed.contentVersion,
    });
    await expect(
      memberPage.getByRole('status', { name: 'Sparbekräftelse', exact: true }),
    ).toHaveText('Utkastet är sparat');
    const shared: MapState = await (await other.request.get(path)).json();
    const historyBefore = (await (await other.request.get(`${path}/history`)).json()).history;
    proxy.command('release');
    await expect(fresh.getByRole('dialog', { name: 'Spara utkastet', exact: true })).toContainText(
      'Utkastet kunde inte sparas',
    );
    const rejected: MapState = await (await reopened.request.get(path)).json();
    expect(rejected.draft).toEqual(before.draft);
    expect(rejected.objects).toEqual(shared.objects);
    expect(rejected.relationships).toEqual(shared.relationships);
    expect((await (await reopened.request.get(`${path}/history`)).json()).history).toEqual(
      historyBefore,
    );
    expect(historyBefore).toHaveLength(2);
    expect(rejected.objects.find((object) => object.id === lo.id)?.description).toBe(
      'Robins sparade beskrivning',
    );
    await fresh.keyboard.press('Escape');
    const privateProposal = await readDraftProposal(fresh, 'Lo Exempel');
    await expect(privateProposal).toContainText('Alex privata beskrivning');
    await fresh.keyboard.press('Escape');
    await closeTextView(fresh);
    await openMap(fresh);
    await fresh.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await fresh.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = fresh.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(conflict.getByRole('region', { name: 'Sparat i kartan nu' })).toContainText(
      'Robins sparade beskrivning',
    );
    await expect(conflict.getByRole('region', { name: 'Ditt förslag' })).toContainText(
      'Alex privata beskrivning',
    );
    await fresh.keyboard.press('Escape');
    const finalHistory = await openSavedHistory(fresh);
    await expect(finalHistory.getByRole('article')).toHaveCount(2);
  } finally {
    await transport?.close();
    await other.close();
    await reopened.close();
    await app.close();
  }
});
