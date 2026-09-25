import { type APIRequestContext, expect, test } from '@playwright/test';
import type { SaveReceipt } from '../../src/shared/map.js';
import { beginAssistant, callAssistant } from '../support/assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function connection(actor: APIRequestContext, origin: string, householdId: string) {
  const flow = await beginAssistant(actor, origin, 'skyttel:read skyttel:write');
  const accepted = await flow.consent(householdId);
  expect(accepted.status()).toBe(200);
  const tokens = await flow.exchange((await accepted.json()).url);
  expect(tokens.status).toBe(200);
  return (await tokens.json()).access_token as string;
}
async function tool(origin: string, token: string, name: string, args = {}) {
  const response = await callAssistant(origin, token, name, args);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  return JSON.parse(body.result.content[0].text);
}

test('AI-08: kartmedgivande fortsätter webbutkast och sparar hela familjeärendet', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    const household = app.seedDemo();
    await signIn(page.request, app.origin);
    await page.goto(app.origin);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText('Lo Lind');
    const flow = await beginAssistant(page.request, app.origin, 'skyttel:read skyttel:write');
    await page.goto(flow.consentUrl.href);
    await page.getByLabel('Välj hushåll').selectOption(household.id);
    await page.getByLabel(/Jag tillåter extern AI-behandling/).check();
    const approve = page.getByRole('button', { name: 'Godkänn kartarbete' });
    await expect(approve).toBeDisabled();
    await expect(page.getByText(/Medgivandet sparar inga kartuppgifter/)).toBeVisible();
    const permission = page.getByLabel(/Jag tillåter förslag och sparande/);
    await permission.focus();
    await page.keyboard.press('Space');
    const callback = page.waitForRequest('http://127.0.0.1:7777/callback**');
    await page.route('http://127.0.0.1:7777/callback**', (route) =>
      route.fulfill({ body: 'Påhittad klient' }),
    );
    await approve.focus();
    await page.keyboard.press('Enter');
    const exchanged = await flow.exchange((await callback).url());
    expect(exchanged.status).toBe(200);
    const token = (await exchanged.json()).access_token;
    let review = await tool(app.origin, token, 'read_my_draft');
    expect(
      review.changes.some((change: { after: { name: string } }) => change.after.name === 'Lo Lind'),
    ).toBe(true);
    expect(JSON.stringify(review)).toContain('familjen@example.test');
    expect(JSON.stringify(review)).toContain('musik@example.test');
    expect(review.readyToSave).toBe(false);
    review = await tool(app.origin, token, 'resolve_conflict', {
      version: review.version,
      contentVersion: review.contentVersion,
      choice: 'proposed',
      conflict: review.conflicts[0],
    });
    expect(
      review.changes.find((change: { after: { name: string } }) => change.after.name === 'Lo Lind')
        ?.after,
    ).toMatchObject({ description: 'Spelar piano i musikföreningen.' });
    const savedMap = await tool(app.origin, token, 'read_map', { query: 'Familjens Molnmusik' });
    expect(savedMap.relationshipTypes.map((type: { name: string }) => type.name)).toEqual(
      expect.arrayContaining(['Betalar', 'Står på avtalet', 'Betalas med']),
    );
    const { id, revision, householdId: _household, ...value } = savedMap.objects[0];
    review = await tool(app.origin, token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id,
      baseRevision: revision,
      value: {
        ...value,
        description: 'Familjeabonnemang, 189 kr per månad.',
        financialFacts: {
          price: { knowledge: 'known', value: '189' },
          currency: { knowledge: 'known', value: 'SEK' },
          paymentInterval: { knowledge: 'known', value: 'månad' },
        },
      },
    });
    const attempt = {
      version: review.version,
      contentVersion: review.contentVersion,
      operationId: 'ai-family-whole-save',
    };
    const saved = await tool(app.origin, token, 'save_draft', attempt);
    expect(saved.receipt.changes).toHaveLength(2);
    expect(saved.receipt.relationships).toHaveLength(1);
    await app.restart();
    expect(await tool(app.origin, token, 'save_draft', attempt)).toEqual(saved);
    await page.goto(app.origin);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toContainText('Lo Lind');
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Familjens musikkonto → Inloggningsadress → musik@example.test',
    );
    await page.getByRole('button', { name: 'Familjens Molnmusik', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toHaveValue('189');
    const lo = await tool(app.origin, token, 'read_map', { query: 'Lo Lind' });
    expect(lo.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Lo Lind',
          description: 'Spelar piano i musikföreningen.',
        }),
      ]),
    );
  } finally {
    await app.close();
  }
});

test('AI-09: ett nytt webbförslag stoppar gammalt MCP-sparbesked utan delsparande', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const token = await connection(page.request, app.origin, household.id);
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const reviewed = await tool(app.origin, token, 'read_my_draft');
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Kim Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const attempt = {
      version: reviewed.version,
      contentVersion: reviewed.contentVersion,
      operationId: 'old-approval',
    };
    const denied = await tool(app.origin, token, 'save_draft', attempt);
    expect(denied.error).toBe('draft_conflict');
    expect(denied.message).toContain('nytt sparbesked');
    expect(denied.review.changes).toHaveLength(2);
    expect((await tool(app.origin, token, 'read_map')).objects).toEqual([]);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Lo Exempel',
    );
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Kim Exempel',
    );
    const saved = await tool(app.origin, token, 'save_draft', {
      ...attempt,
      operationId: 'fresh-whole-approval',
      version: denied.review.version,
    });
    expect(saved.receipt.changes).toHaveLength(2);
    const mapBeforeRetry = await tool(app.origin, token, 'read_map');
    const historyPath = `${app.origin}/api/households/${household.id}/map/history`;
    const historyBeforeRetry = await (await page.request.get(historyPath)).json();
    expect(historyBeforeRetry.history).toEqual([saved.receipt]);
    const rejectedAgain = await tool(app.origin, token, 'save_draft', attempt);
    expect(rejectedAgain.error).toBe('draft_conflict');
    expect(rejectedAgain).not.toHaveProperty('receipt');
    expect(await tool(app.origin, token, 'read_map')).toEqual(mapBeforeRetry);
    expect(await (await page.request.get(historyPath)).json()).toEqual(historyBeforeRetry);
    expect(
      await tool(app.origin, token, 'read_save_operation', {
        operationId: saved.receipt.operationId,
      }),
    ).toMatchObject({ operation: { status: 'succeeded', receipt: saved.receipt } });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
  } finally {
    await app.close();
  }
});

test('AI-10: förlorat MCP-kvittosvar återfinns efter omstart utan dubbelt sparande', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const token = await connection(page.request, app.origin, household.id);
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('privata utkast');
    const review = await tool(app.origin, token, 'read_my_draft');
    const attempt = {
      version: review.version,
      contentVersion: review.contentVersion,
      operationId: 'lost-mcp-reply',
    };
    await tool(app.origin, token, 'prepare_save', attempt);
    let committedReceipt: SaveReceipt | undefined;
    await page.route('**/mcp', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committedReceipt = JSON.parse((await response.json()).result.content[0].text).receipt;
      await route.abort();
    });
    const outcome = await page.evaluate(
      async ({ token, attempt }) => {
        try {
          await fetch('/mcp', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: { name: 'save_draft', arguments: attempt },
            }),
          });
          return 'response';
        } catch {
          return 'unknown';
        }
      },
      { token, attempt },
    );
    expect(outcome).toBe('unknown');
    expect(committedReceipt?.operationId).toBe(attempt.operationId);
    await page.unroute('**/mcp');
    await app.restart();
    const recoveredToken = await connection(page.request, app.origin, household.id);
    const recovered = await tool(app.origin, recoveredToken, 'read_save_operation', {
      operationId: attempt.operationId,
    });
    expect(recovered.operation).toMatchObject({ status: 'succeeded', receipt: committedReceipt });
    expect(await tool(app.origin, recoveredToken, 'save_draft', attempt)).toEqual({
      receipt: committedReceipt,
    });
    const history = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map/history`)
    ).json();
    expect(history.history).toEqual([committedReceipt]);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Mina sparförsök' })).toContainText('Genomfört');
    await expect(page.getByRole('region', { name: 'Mina sparförsök' })).toContainText('Lo Exempel');
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
  } finally {
    await app.close();
  }
});

test('AI-11: identitetsfrågor blockerar och kastade MCP-förslag förblir kastade', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const token = await connection(page.request, app.origin, household.id);
    const catalog = await tool(app.origin, token, 'read_type_catalog');
    const type = catalog.types.find((type: { name: string }) => type.name === 'Bankkonto');
    const value = { typeId: type.id, name: 'Betalkonto', description: '', identity: 'unresolved' };
    let review = await tool(app.origin, token, 'propose_object', {
      version: 0,
      contentVersion: catalog.contentVersion,
      id: 'bank',
      baseRevision: null,
      value,
    });
    review = await tool(app.origin, token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'other',
      baseRevision: null,
      value: { typeId: type.id, name: 'Hushållskonto', description: '' },
    });
    expect(
      (
        await tool(app.origin, token, 'save_draft', {
          version: review.version,
          contentVersion: review.contentVersion,
          operationId: 'unresolved',
        })
      ).error,
    ).toBe('unresolved_identity');
    expect((await tool(app.origin, token, 'read_map')).objects).toEqual([]);
    await page.goto(app.origin);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    review = await tool(app.origin, token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'bank',
      baseRevision: null,
      value: { ...value, identity: 'unspecified' },
    });
    const staleVersion = review.version;
    review = await tool(app.origin, token, 'discard_proposal', {
      version: review.version,
      contentVersion: review.contentVersion,
      kind: 'object',
      id: 'other',
    });
    expect(review.changes).toHaveLength(1);
    const stale = await tool(app.origin, token, 'propose_object', {
      version: staleVersion,
      contentVersion: review.contentVersion,
      id: 'other',
      baseRevision: null,
      value: { typeId: type.id, name: 'Hushållskonto', description: '' },
    });
    expect(stale.error).toBe('draft_conflict');
    await tool(app.origin, token, 'save_draft', {
      version: review.version,
      contentVersion: review.contentVersion,
      operationId: 'unspecified',
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Hushållskonto', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Betalkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets identitet')).toHaveValue('unspecified');
  } finally {
    await app.close();
  }
});
