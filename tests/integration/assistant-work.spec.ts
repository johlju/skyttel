import type { APIRequestContext } from '@playwright/test';
import type { SaveReceipt } from '../../src/shared/map.js';
import { beginAssistant, callAssistant } from '../support/assistant.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  openTable,
  signIn,
} from '../support/client.js';
import { openSavedHistory } from '../support/conversation-page.js';
import {
  editTableObject,
  openObjectRelationships,
  readDraftProposal,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { openProperties, propertyRow } from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

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
    await openTable(page);
    await expect(await openDraftReview(page)).toContainText('Lo Lind');
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
    ).toMatchObject({
      properties: expect.arrayContaining([
        expect.objectContaining({
          label: 'Beskrivning',
          kind: 'text',
          value: 'Spelar piano i musikföreningen.',
        }),
      ]),
    });
    const savedMap = await tool(app.origin, token, 'read_map', { query: 'Familjens Molnmusik' });
    expect(savedMap.relationshipTypes.map((type: { name: string }) => type.name)).toEqual(
      expect.arrayContaining(['Betalar', 'Står på avtalet', 'Betalas med']),
    );
    const names = new Map<string, string>(
      [...savedMap.objects, ...savedMap.contextObjects].map(
        (object: { id: string; name: string }) => [object.id, object.name],
      ),
    );
    expect(
      savedMap.relationships.map(
        (edge: { sourceId: string; targetId: string; typeId: string }) => ({
          source: names.get(edge.sourceId),
          target: names.get(edge.targetId),
          type: savedMap.relationshipTypes.find((type: { id: string }) => type.id === edge.typeId)
            .name,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          source: 'Familjens Molnmusik',
          target: 'Alex Exempel',
          type: 'Står på avtalet',
        },
        {
          source: 'Kim Exempel',
          target: 'Familjens Molnmusik',
          type: 'Betalar',
        },
        {
          source: 'Familjens Molnmusik',
          target: 'Familjens musikkort',
          type: 'Betalas med',
        },
      ]),
    );
    const { id, revision, householdId: _household, ...value } = savedMap.objects[0];
    review = await tool(app.origin, token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id,
      baseRevision: revision,
      value: {
        ...value,
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Familjeabonnemang, 189 kr per månad.',
          },
          { id: 'price', label: 'Pris', kind: 'text' as const, value: '189' },
          { id: 'currency', label: 'Valuta', kind: 'text' as const, value: 'SEK' },
          {
            id: 'paymentInterval',
            label: 'Betalningsintervall',
            kind: 'text' as const,
            value: 'månad',
          },
        ],
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
    await openTable(page);
    await expect(await openDraftReview(page)).toContainText('Utkastet är tomt.');
    await closeTextView(page);
    await openTable(page);
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).toContainText('Lo Lind');
    const relationships = await openObjectRelationships(page, 'Familjens musikkonto');
    await expect(relationships).toContainText('Inloggningsadress');
    await expect(relationships).toContainText('musik@example.test');
    await page.keyboard.press('Escape');
    const subscription = await editTableObject(page, 'Familjens Molnmusik');
    await openProperties(subscription);
    await expect(
      propertyRow(subscription, 'Pris').getByLabel('Värde', { exact: true }),
    ).toHaveValue('189');
    await expect(
      propertyRow(subscription, 'Beskrivning').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Familjeabonnemang, 189 kr per månad.');
    for (const [label, value] of [
      ['Pris', '189'],
      ['Valuta', 'SEK'],
      ['Betalningsintervall', 'månad'],
    ]) {
      const row = propertyRow(subscription, label);
      await expect(row.getByLabel('Värde', { exact: true })).toHaveValue(value);
      await expect(row.getByLabel('Datatyp', { exact: true })).toHaveValue('text');
    }
    await expect(subscription.locator('.property-editor-row')).toHaveCount(4);
    await page.keyboard.press('Escape');
    const loForm = await editTableObject(page, 'Lo Lind');
    await expect(loForm.getByLabel('Namn', { exact: true })).toHaveValue('Lo Lind');
    await openProperties(loForm);
    await expect(
      propertyRow(loForm, 'Beskrivning').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Spelar piano i musikföreningen.');
    await page.keyboard.press('Escape');
    const lo = await tool(app.origin, token, 'read_map', { query: 'Lo Lind' });
    expect(lo.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Lo Lind',
          properties: expect.arrayContaining([
            expect.objectContaining({
              label: 'Beskrivning',
              kind: 'text',
              value: 'Spelar piano i musikföreningen.',
            }),
          ]),
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
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const reviewed = await tool(app.origin, token, 'read_my_draft');
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Kim Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
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
    await openTable(page);
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Lo Exempel');
    await expect(draft).toContainText('Kim Exempel');
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
    await openTable(page);
    await expect(await openDraftReview(page)).toContainText('Utkastet är tomt.');
    for (const name of ['Lo Exempel', 'Kim Exempel']) {
      const person = await editTableObject(page, name);
      await expect(person.getByLabel('Namn', { exact: true })).toHaveValue(name);
      await openProperties(person);
      await expect(propertyRow(person, 'Beskrivning')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
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
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(await openDraftReview(page)).toContainText('Lo Exempel');
    const proposal = await readDraftProposal(page, 'Lo Exempel');
    for (const [label, value] of [
      ['Namn', 'Lo Exempel'],
      ['Typ', 'Person'],
    ])
      await expect(
        proposal
          .locator('dt')
          .filter({ hasText: new RegExp(`^${label}$`) })
          .locator('..')
          .locator('dd'),
      ).toHaveText(value);
    await expect(proposal.locator('dt').filter({ hasText: /^Beskrivning$/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
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
    await page.reload();
    await openTable(page);
    const committedPerson = await editTableObject(page, 'Lo Exempel');
    await expect(committedPerson.getByLabel('Objekttyp').locator('option:checked')).toHaveText(
      'Person',
    );
    await expect(committedPerson.getByLabel('Namn', { exact: true })).toHaveValue('Lo Exempel');
    await openProperties(committedPerson);
    await expect(propertyRow(committedPerson, 'Beskrivning')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await app.restart();
    const recoveredToken = await connection(page.request, app.origin, household.id);
    const recovered = await tool(app.origin, recoveredToken, 'read_save_operation', {
      operationId: attempt.operationId,
    });
    expect(recovered.operation).toMatchObject({ status: 'succeeded', receipt: committedReceipt });
    await page.reload();
    const recoveredHistory = await openSavedHistory(page);
    await expect(recoveredHistory.getByRole('article')).toHaveCount(1);
    await expect(recoveredHistory).toContainText('Lo Exempel');
    await recoveredHistory
      .getByText('Identifiera sparandet och användaren', { exact: true })
      .click();
    await expect(recoveredHistory).toContainText(attempt.operationId);
    await expect(
      recoveredHistory.getByText(`Skyttel-användare: ${committedReceipt?.userId}.`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      recoveredHistory.getByText(`Tidpunkt: ${committedReceipt?.savedAt}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('region', { name: 'Rapporter', exact: true })
      .getByRole('button', { name: 'Tillbaka till arbetet', exact: true })
      .click();
    expect(await tool(app.origin, recoveredToken, 'save_draft', attempt)).toEqual({
      receipt: committedReceipt,
    });
    const history = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map/history`)
    ).json();
    expect(history.history).toEqual([committedReceipt]);
    await page.reload();
    await openTable(page);
    const person = await editTableObject(page, 'Lo Exempel');
    await expect(person.getByLabel('Objekttyp').locator('option:checked')).toHaveText('Person');
    await expect(person.getByLabel('Namn', { exact: true })).toHaveValue('Lo Exempel');
    await openProperties(person);
    await expect(propertyRow(person, 'Beskrivning')).toHaveCount(0);
    await page.keyboard.press('Escape');
    const savedHistory = await openSavedHistory(page);
    await expect(savedHistory.getByRole('article')).toHaveCount(1);
    await expect(savedHistory).toContainText('Lo Exempel');
    await savedHistory.getByText('Identifiera sparandet och användaren', { exact: true }).click();
    await expect(savedHistory).toContainText(attempt.operationId);
    await expect(
      savedHistory.getByText(`Skyttel-användare: ${committedReceipt?.userId}.`, { exact: true }),
    ).toBeVisible();
    await expect(
      savedHistory.getByText(`Tidpunkt: ${committedReceipt?.savedAt}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('region', { name: 'Rapporter', exact: true })
      .getByRole('button', { name: 'Tillbaka till arbetet', exact: true })
      .click();
    await expect(await openDraftReview(page)).toContainText('Utkastet är tomt.');
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
    const value = { typeId: type.id, name: 'Betalkonto', identity: 'unresolved' };
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
      value: { typeId: type.id, name: 'Hushållskonto' },
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
    await openTable(page);
    await openDraftReview(page);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    const unresolved = await readDraftProposal(page, 'Betalkonto');
    await expect(unresolved).toContainText('Identiteten behöver redas ut');
    await expect(unresolved).toContainText('Bankkonto');
    await page.keyboard.press('Escape');
    const independent = await readDraftProposal(page, 'Hushållskonto');
    await expect(independent).toContainText('Bankkonto');
    await page.keyboard.press('Escape');
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
      value: { typeId: type.id, name: 'Hushållskonto' },
    });
    expect(stale.error).toBe('draft_conflict');
    await tool(app.origin, token, 'save_draft', {
      version: review.version,
      contentVersion: review.contentVersion,
      operationId: 'unspecified',
    });
    await page.reload();
    await openTable(page);
    await expect(page.getByRole('button', { name: 'Hushållskonto', exact: true })).toHaveCount(0);
    const account = await editTableObject(page, 'Betalkonto');
    await expect(account.getByLabel('Identitet')).toHaveValue('unspecified');
    await expect(account.getByLabel('Namn', { exact: true })).toHaveValue('Betalkonto');
    await openProperties(account);
    await expect(propertyRow(account, 'Beskrivning')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
