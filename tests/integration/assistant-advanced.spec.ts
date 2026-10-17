import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { APIRequestContext } from '@playwright/test';
import { beginAssistant, callAssistant } from '../support/assistant.js';
import {
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
import { downloadHouseholdExport } from '../support/household-export-download.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function connect(actor: APIRequestContext, origin: string, householdId: string) {
  const flow = await beginAssistant(actor, origin, 'skyttel:read skyttel:write');
  const accepted = await flow.consent(householdId);
  expect(accepted.status()).toBe(200);
  const exchanged = await flow.exchange((await accepted.json()).url);
  expect(exchanged.status).toBe(200);
  const token = (await exchanged.json()).access_token;
  async function tool(name: string, args = {}, error?: string) {
    const response = await callAssistant(origin, token, name, args);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    const value = JSON.parse(body.result.content[0].text);
    if (error) expect(value.error).toBe(error);
    else expect(body.result.isError, JSON.stringify(value)).not.toBe(true);
    return value;
  }
  const versions = (review: { version: number; contentVersion: number }) => ({
    version: review.version,
    contentVersion: review.contentVersion,
  });
  async function propose(name: string, args: Record<string, unknown>, error?: string) {
    return tool(name, { ...versions(await tool('read_my_draft')), ...args }, error);
  }
  return {
    token,
    tool,
    propose,
    async object(id: string, value: Record<string, unknown>) {
      const before = (await tool('read_map', { objectId: id })).objects[0];
      return propose('propose_object', { id, baseRevision: before?.revision ?? null, value });
    },
    async save(operationId: string) {
      return (await propose('save_draft', { operationId })).receipt;
    },
    async type(id: string, value: unknown, error?: string) {
      const before = (await tool('read_type_catalog')).types.find(
        (entry: { id: string }) => entry.id === id,
      );
      return propose(
        'propose_object_type',
        { id, baseRevision: before?.revision ?? null, value },
        error,
      );
    },
  };
}

test('MCP-06: importerad historik läses och vanliga rättelser använder färskt underlag', async ({
  page,
}) => {
  const source = await createInstallation();
  const target = await createInstallation();
  const sdk = new Client({ name: 'Skyttel regression client', version: '1' });
  try {
    await signIn(page.request, source.origin);
    const sourceHousehold = (await (await createHousehold(page.request, source.origin)).json())
      .household;
    const sourceMcp = await connect(page.request, source.origin, sourceHousehold.id);
    const typeId = (await sourceMcp.tool('read_type_catalog')).types[0].id;
    await sourceMcp.object('lamp', { typeId, name: 'Historisk lampa', description: '' });
    const saved = await sourceMcp.save('source-lamp');
    const sourcePath = `${source.origin}/api/households/${sourceHousehold.id}`;
    const prepared = await page.request.post(`${sourcePath}/exports`, {
      headers: { origin: source.origin },
      data: {},
    });
    expect(prepared.status()).toBe(201);
    const archive = await (
      await page.request.get(`${sourcePath}/exports/${(await prepared.json()).id}`)
    ).body();
    await page.goto(source.origin);
    const downloadedArchive = await downloadHouseholdExport(page, sourcePath);
    await signIn(page.request, target.origin);
    const targetHousehold = (await (await createHousehold(page.request, target.origin)).json())
      .household;
    const targetPath = `${target.origin}/api/households/${targetHousehold.id}`;
    const targetMcp = await connect(page.request, target.origin, targetHousehold.id);
    await sdk.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', target.origin), {
        requestInit: { headers: { authorization: `Bearer ${targetMcp.token}` } },
      }),
    );
    const names = (await sdk.listTools()).tools.map(({ name }) => name);
    expect(names).toContain('read_history');
    expect(names).toContain('save_draft');
    for (const name of ['propose_undo', 'read_merge_review', 'propose_merge']) {
      expect(names).not.toContain(name);
      expect((await sdk.callTool({ name, arguments: {} })).isError).toBe(true);
    }
    const path = `${targetPath}/map`;
    const before = await (await page.request.get(path)).json();
    for (const route of ['undo', 'merge']) {
      const response = await page.request.post(`${path}/${route}`, {
        headers: { origin: target.origin },
        data: { version: before.draft.version },
      });
      expect(response.status()).toBe(404);
    }
    expect(await (await page.request.get(path)).json()).toEqual(before);
    const old = await targetMcp.tool('read_my_draft');
    const uploaded = await page.request.post(`${targetPath}/imports`, {
      headers: {
        origin: target.origin,
        'content-type': 'application/zip',
        'x-skyttel-content-version': '1',
      },
      data: archive,
    });
    expect(uploaded.status()).toBe(201);
    // Import the archive actually downloaded by the browser. The original raw
    // upload/status check above remains independent protocol evidence.
    await page.goto(`${target.origin}/households/${targetHousehold.id}/settings/import`);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: downloadedArchive,
    });
    const checkedImport = page.waitForResponse(
      (response) =>
        response.url() === `${targetPath}/imports` && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Kontrollera importfil', exact: true }).click();
    const checked = await checkedImport;
    expect(checked.status()).toBe(201);
    const importId = (await checked.json()).id;
    await expect(page.getByText('Filen är kontrollerad.', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ersätt hushållets innehåll', exact: true }),
    ).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    const confirmation = page.waitForResponse(`${targetPath}/imports/${importId}/confirm`);
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll', exact: true }).click();
    const confirmed = await confirmation;
    expect(confirmed.status()).toBe(200);
    expect(confirmed.request().postDataJSON()).toEqual({ contentVersion: 1, confirmed: true });
    expect((await confirmed.json()).status).toBe('completed');
    await expect(
      page.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    await target.restart();
    await page.goto(target.origin);
    await openTable(page);
    await expect(page.getByRole('button', { name: 'Historisk lampa', exact: true })).toBeVisible();
    const ordinary = await targetMcp.tool('read_map', { objectId: 'lamp' });
    expect(ordinary.objects[0].name).toBe('Historisk lampa');
    const lamp = await editTableObject(page, 'Historisk lampa');
    await expect(lamp.getByLabel('Namn', { exact: true })).toHaveValue('Historisk lampa');
    await expect(lamp.getByLabel('Beskrivning', { exact: true })).toHaveValue('');
    await expect(lamp.getByLabel('Objekttyp')).toHaveValue(typeId);
    await page.keyboard.press('Escape');
    // A meaningful independent proposal must survive every historical reading.
    const privateValue = { typeId, name: 'Oberoende utkast', description: 'Privat lampanteckning' };
    await targetMcp.object('private-lamp', privateValue);
    const draft = await targetMcp.tool('read_my_draft');
    await page.reload();
    const historyBefore = await (await page.request.get(`${path}/history`)).json();
    const selected = await targetMcp.tool('read_history', {
      operationId: saved.operationId,
      userId: saved.userId,
    });
    expect(selected.receipt.actorName).toBe('Alex Exempel');
    expect(selected.receipt).toEqual(saved);
    const sdkSelected = await sdk.callTool({
      name: 'read_history',
      arguments: { operationId: saved.operationId, userId: saved.userId },
    });
    expect(sdkSelected.isError).not.toBe(true);
    expect(JSON.parse((sdkSelected.content as { text: string }[])[0].text).receipt).toEqual(saved);
    const nativeHistory = await openSavedHistory(page);
    await nativeHistory.getByText('Visa ändringarna', { exact: true }).click();
    await expect(nativeHistory).toContainText('Alex Exempel');
    await expect(nativeHistory).toContainText('Historisk lampa');
    await expect(nativeHistory).toContainText(`Objekttyp: ${before.types[0].name}.`);
    await nativeHistory.getByText('Identifiera sparandet och användaren', { exact: true }).click();
    await expect(nativeHistory).toContainText(saved.operationId);
    await expect(nativeHistory).toContainText(saved.userId);
    await expect(
      nativeHistory.getByText(`Tidpunkt: ${saved.savedAt}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('region', { name: 'Rapporter', exact: true })
      .getByRole('button', { name: 'Tillbaka till arbetet', exact: true })
      .click();
    const privateProposal = await readDraftProposal(page, 'Oberoende utkast');
    await expect(privateProposal).toContainText('Privat lampanteckning');
    await expect(privateProposal).toContainText(before.types[0].name);
    await page.keyboard.press('Escape');
    expect(await targetMcp.tool('read_my_draft')).toEqual(draft);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([saved]);
    expect(await (await page.request.get(`${path}/history`)).json()).toEqual(historyBefore);
    await targetMcp.tool(
      'propose_object_type',
      {
        version: old.version,
        contentVersion: old.contentVersion,
        id: 'manual-old-type',
        baseRevision: null,
        value: { name: 'Gammalt underlag', description: '', fields: [] },
      },
      'content_conflict',
    );
    // Discard only the independent proposal after the read-purity proof.
    await targetMcp.propose('discard_proposal', { kind: 'object', id: 'private-lamp' });
    await page.reload();
    const correction = await editTableObject(page, 'Historisk lampa');
    await correction.getByLabel('Namn', { exact: true }).fill('Rättad historisk lampa');
    await correction
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    const correctionProposal = await readDraftProposal(page, 'Rättad historisk lampa');
    await expect(correctionProposal).toContainText('Historisk lampa');
    await expect(correctionProposal).toContainText('Rättad historisk lampa');
    for (const sectionName of ['Sparade värden', 'Föreslagna värden']) {
      const values = correctionProposal.getByRole('heading', { name: sectionName }).locator('..');
      for (const [label, value] of [
        ['Typ', before.types[0].name],
        ['Beskrivning', 'Ej uppgivet'],
      ]) {
        await expect(
          values
            .locator('dt')
            .filter({ hasText: new RegExp(`^${label}$`) })
            .locator('..'),
        ).toContainText(value);
      }
    }
    await page.keyboard.press('Escape');
    expect((await targetMcp.tool('read_my_draft')).changes).toEqual([
      expect.objectContaining({
        id: 'lamp',
        before: expect.objectContaining({ typeId, name: 'Historisk lampa', description: '' }),
        after: expect.objectContaining({ typeId, name: 'Rättad historisk lampa', description: '' }),
      }),
    ]);
    await targetMcp.object('lamp', { typeId, name: 'Rättad historisk lampa', description: '' });
    const receipt = await targetMcp.save('fresh-import-correction');
    expect(receipt.contentVersion).toBe(2);
    expect(receipt.userId).not.toBe(saved.userId);
    expect((await targetMcp.tool('read_map', { objectId: 'lamp' })).objects[0].name).toBe(
      'Rättad historisk lampa',
    );
    await target.restart();
    await page.reload();
    const corrected = await editTableObject(page, 'Rättad historisk lampa');
    await expect(corrected.getByLabel('Namn', { exact: true })).toHaveValue(
      'Rättad historisk lampa',
    );
    await expect(corrected.getByLabel('Beskrivning', { exact: true })).toHaveValue('');
    await expect(corrected.getByLabel('Objekttyp')).toHaveValue(typeId);
    await page.keyboard.press('Escape');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      receipt,
      saved,
    ]);
  } finally {
    // Close the browser's connections before waiting for the servers to stop.
    await page.close();
    await sdk.close();
    await target.close();
    await source.close();
  }
});

test('MCP-03: typbyte bevarar riktade samband och äldre typers läsbara historik', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    for (const [id, name, kind] of [
      ['cycle', 'Cykel', 'text'],
      ['vehicle', 'Motorfordon', 'number'],
    ])
      await mcp.type(id, {
        name,
        description: '',
        fields: [{ id: 'serial', name: 'Nummer', description: '', kind }],
      });
    const catalog = await mcp.tool('read_type_catalog');
    await mcp.object('bike', {
      typeId: 'cycle',
      name: 'Alex blå cykel',
      description: '',
      customValues: { serial: 'SYNTH-42' },
    });
    await mcp.object('garage', { typeId: catalog.types[0].id, name: 'Garaget', description: '' });
    await mcp.propose('propose_relationship_type', {
      id: 'stored',
      baseRevision: null,
      value: {
        name: 'Förvaring',
        description: 'Sakens plats',
        forwardLabel: 'förvaras i',
        reverseLabel: 'innehåller',
      },
    });
    const edge = { typeId: 'stored', sourceId: 'bike', targetId: 'garage', knowledge: 'known' };
    await mcp.propose('propose_relationship', { id: 'parking', baseRevision: null, value: edge });
    const repeated = await mcp.propose('propose_relationship', {
      id: 'duplicate',
      baseRevision: null,
      value: edge,
    });
    expect(repeated.existingId).toBe('parking');
    expect(repeated.relationships).toHaveLength(1);
    await mcp.propose('propose_relationship', {
      id: 'second-kind',
      baseRevision: null,
      value: { ...edge, typeId: catalog.relationshipTypes[0].id },
    });
    await mcp.save('cycle-with-edges');
    const initial = await mcp.tool('read_map', { objectId: 'bike' });
    await mcp.object('bike', {
      typeId: 'vehicle',
      name: 'Alex blå cykel',
      description: '',
      customValues: { serial: 42 },
    });
    await page.goto(app.origin);
    await openTable(page);
    const proposal = await readDraftProposal(page, 'Alex blå cykel');
    await expect(proposal).toContainText('Cykel');
    await expect(proposal).toContainText('Motorfordon');
    const savedValues = proposal
      .getByRole('heading', { name: 'Sparade värden', exact: true })
      .locator('..');
    const proposedValues = proposal
      .getByRole('heading', { name: 'Föreslagna värden', exact: true })
      .locator('..');
    await expect(
      savedValues
        .locator('dt')
        .filter({ hasText: /^Nummer · ändrat$/ })
        .locator('..'),
    ).toContainText('SYNTH-42');
    await expect(
      proposedValues
        .locator('dt')
        .filter({ hasText: /^Nummer · ändrat$/ })
        .locator('..'),
    ).toContainText('42');
    for (const [values, kind, number] of [
      [savedValues, 'Cykel', 'SYNTH-42'],
      [proposedValues, 'Motorfordon', '42'],
    ] as const) {
      await expect(
        values
          .locator('dt')
          .filter({ hasText: /^Typ · ändrat$/ })
          .locator('..')
          .locator('dd'),
      ).toHaveText(kind);
      await expect(
        values
          .locator('dt')
          .filter({ hasText: /^Nummer · ändrat$/ })
          .locator('..')
          .locator('dd'),
      ).toHaveText(number);
    }
    await page.keyboard.press('Escape');
    const changed = await mcp.save('type-change');
    expect((await mcp.tool('read_map', { objectId: 'bike' })).relationships).toEqual(
      initial.relationships,
    );
    await mcp.type('cycle', null);
    await mcp.save('remove-cycle-definition');
    const selected = await mcp.tool('read_history', {
      operationId: changed.operationId,
      userId: changed.userId,
    });
    expect(selected.receipt.changes[0]).toMatchObject({
      beforeType: { name: 'Cykel' },
      before: { customValues: { serial: 'SYNTH-42' } },
      type: { name: 'Motorfordon' },
      after: { customValues: { serial: 42 } },
    });
    expect((await mcp.tool('read_my_draft')).changes).toEqual([]);
    await page.reload();
    const changedForm = await editTableObject(page, 'Alex blå cykel');
    await expect(changedForm.getByLabel('Objekttyp')).toHaveValue('vehicle');
    await expect(changedForm.getByLabel('Beskrivning', { exact: true })).toHaveValue('');
    await changedForm.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(changedForm.getByLabel('Nummer', { exact: true })).toHaveValue('42');
    await page.keyboard.press('Escape');
    const history = await openSavedHistory(page);
    const typeChange = history.getByRole('article').filter({ hasText: 'Ändrat objekt' });
    await typeChange.getByText('Visa ändringarna', { exact: true }).click();
    await expect(typeChange).toContainText('Cykel');
    await expect(typeChange).toContainText('Motorfordon');
    await expect(typeChange).toContainText('SYNTH-42');
    await expect(typeChange).toContainText('42');
    for (const [phase, kind, number] of [
      ['Före sparandet', 'Cykel', 'SYNTH-42'],
      ['Efter sparandet', 'Motorfordon', '42'],
    ]) {
      const values = typeChange
        .getByRole('heading', { name: phase, exact: true })
        .locator(
          `xpath=following-sibling::*[preceding-sibling::h5[1][normalize-space()="${phase}"]]`,
        );
      await expect(values.filter({ hasText: new RegExp(`^Objekttyp: ${kind}\\.$`) })).toHaveText(
        `Objekttyp: ${kind}.`,
      );
      await expect(values.getByText(`Nummer: ${number}`, { exact: true })).toBeVisible();
    }
  } finally {
    await app.close();
  }
});

test('MCP-04: upphört innehåll och privata utkast skyddar typer', async ({ page, browser }) => {
  const app = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    for (const [id, name] of [
      ['ended-type', 'Upphörd typ'],
      ['private-type', 'Privat använd typ'],
      ['race-type', 'Samtidig typ'],
    ])
      await mcp.type(id, { name, description: '', fields: [] });
    await mcp.object('ended', {
      typeId: 'ended-type',
      name: 'Upphört testobjekt',
      description: '',
      lifecycle: 'ended',
    });
    await mcp.save('protected-types');
    const blocked = await mcp.type('ended-type', null, 'definition_in_use');
    expect(blocked.message).toContain('upphört');
    app.setIdentity(robin);
    await signIn(other.request, app.origin);
    const { user } = await (await other.request.get(`${app.origin}/api/bootstrap`)).json();
    const householdPath = `${app.origin}/api/households/${household.id}`;
    const { code } = await (
      await page.request.post(`${householdPath}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code },
        })
      ).ok(),
    ).toBe(true);
    const otherMcp = await connect(other.request, app.origin, household.id);
    const otherPage = await other.newPage();
    await otherPage.goto(app.origin);
    await openTable(otherPage);
    let privateForm = await openNewObject(otherPage);
    await privateForm.getByLabel('Objekttyp').selectOption('private-type');
    await privateForm.getByLabel('Namn', { exact: true }).fill('Andras privata namn');
    await privateForm.getByLabel('Beskrivning', { exact: true }).fill('Privat hemlig anteckning');
    await privateForm
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    let privateProposal = await readDraftProposal(otherPage, 'Andras privata namn');
    await expect(privateProposal).toContainText('Privat använd typ');
    await expect(privateProposal).toContainText('Privat hemlig anteckning');
    await otherPage.keyboard.press('Escape');
    const nativeSecret = await otherMcp.tool('read_my_draft');
    expect(nativeSecret.changes).toEqual([
      expect.objectContaining({
        after: expect.objectContaining({
          typeId: 'private-type',
          name: 'Andras privata namn',
          description: 'Privat hemlig anteckning',
        }),
      }),
    ]);
    // Keep the original synthetic identity and exact no-disclosure guard, after
    // verifying the native proposal and discarding only its generated identity.
    await otherMcp.propose('discard_proposal', { kind: 'object', id: nativeSecret.changes[0].id });
    await otherMcp.object('secret', {
      typeId: 'private-type',
      name: 'Andras privata namn',
      description: 'Privat hemlig anteckning',
    });
    const privateBlock = await mcp.type('private-type', null, 'definition_in_use');
    expect(JSON.stringify(privateBlock)).not.toMatch(
      /Andras privata namn|Privat hemlig anteckning|"secret"/,
    );
    await mcp.type('race-type', null);
    await otherPage.reload();
    privateForm = await openNewObject(otherPage);
    await privateForm.getByLabel('Objekttyp').selectOption('race-type');
    await privateForm.getByLabel('Namn', { exact: true }).fill('Senare privat användning');
    await privateForm
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    privateProposal = await readDraftProposal(otherPage, 'Senare privat användning');
    await expect(privateProposal).toContainText('Samtidig typ');
    await expect(
      privateProposal
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..'),
    ).toContainText('Ej uppgivet');
    await otherPage.keyboard.press('Escape');
    const nativeRace = (await otherMcp.tool('read_my_draft')).changes.find(
      (change: { after: { name: string } }) => change.after.name === 'Senare privat användning',
    );
    expect(nativeRace.after).toMatchObject({
      typeId: 'race-type',
      name: 'Senare privat användning',
      description: '',
    });
    await otherMcp.propose('discard_proposal', { kind: 'object', id: nativeRace.id });
    await otherMcp.object('race', {
      typeId: 'race-type',
      name: 'Senare privat användning',
      description: '',
    });
    await mcp.propose('save_draft', { operationId: 'blocked-removal' }, 'definition_in_use');
    await page.goto(app.origin);
    await openTable(page);
    const filters = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
    await page
      .getByRole('region', { name: 'Hushållets tabell', exact: true })
      .getByRole('button', { name: 'Filter', exact: true })
      .click();
    await filters.getByLabel('Ta med upphörda', { exact: true }).check();
    await filters.getByRole('button', { name: 'Stäng filter', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).toContainText('Upphört testobjekt');
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).toContainText('Upphört');
    await expect(await openDraftReview(page)).not.toContainText('Andras privata namn');
    await otherPage.goto(app.origin);
    const otherDraft = await openDraftReview(otherPage);
    await expect(otherDraft).toContainText('Andras privata namn');
    await expect(otherDraft).toContainText('Senare privat användning');
    await app.restart();
    await otherPage.reload();
    await expect(await openDraftReview(otherPage)).toContainText('Andras privata namn');
    await expect(await openDraftReview(otherPage)).toContainText('Senare privat användning');
    const restoredPrivate = await readDraftProposal(otherPage, 'Andras privata namn');
    await expect(restoredPrivate).toContainText('Privat hemlig anteckning');
    await expect(restoredPrivate).toContainText('Privat använd typ');
    await otherPage.keyboard.press('Escape');
    const restoredRace = await readDraftProposal(otherPage, 'Senare privat användning');
    await expect(restoredRace).toContainText('Samtidig typ');
    await expect(
      restoredRace
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveText('Ej uppgivet');
    await otherPage.keyboard.press('Escape');
    const persistedPrivate = await otherMcp.tool('read_my_draft');
    expect(persistedPrivate.changes).toEqual([
      expect.objectContaining({
        id: 'secret',
        before: null,
        after: {
          typeId: 'private-type',
          name: 'Andras privata namn',
          description: 'Privat hemlig anteckning',
        },
      }),
      expect.objectContaining({
        id: 'race',
        before: null,
        after: { typeId: 'race-type', name: 'Senare privat användning', description: '' },
      }),
    ]);
    const persistedHistory = await mcp.tool('read_history');
    const restoredBlock = await mcp.type('private-type', null, 'definition_in_use');
    expect(JSON.stringify(restoredBlock)).not.toMatch(
      /Andras privata namn|Privat hemlig anteckning|Senare privat användning|"secret"|"race"/,
    );
    const restoredSaveBlock = await mcp.propose(
      'save_draft',
      { operationId: 'blocked-removal-after-restart' },
      'definition_in_use',
    );
    expect(JSON.stringify(restoredSaveBlock)).not.toMatch(
      /Andras privata namn|Privat hemlig anteckning|Senare privat användning|"secret"|"race"/,
    );
    expect(await otherMcp.tool('read_my_draft')).toEqual(persistedPrivate);
    expect(await mcp.tool('read_history')).toEqual(persistedHistory);
    expect(
      (await (await page.request.get(`${householdPath}/map`)).json()).types.some(
        (type: { id: string }) => type.id === 'race-type',
      ),
    ).toBe(true);
  } finally {
    await other.close();
    await app.close();
  }
});

test('MCP-01: egna typer och frivilliga fält bevarar obesvarat och nej', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    const fields = [
      { id: 'supplier', name: 'Leverantör', description: '', kind: 'text' },
      { id: 'power', name: 'Effekt', description: 'kW', kind: 'number' },
      { id: 'installed', name: 'Installationsdatum', description: '', kind: 'date' },
      { id: 'battery', name: 'Batteri', description: '', kind: 'boolean' },
    ];
    const definition = {
      name: 'Solcellsanläggning',
      description: 'Hushållets elproduktion',
      fields,
    };
    await mcp.type('solar', definition);
    await mcp.object('roof', {
      typeId: 'solar',
      name: 'Paneler på taket',
      description: '',
      customValues: { supplier: 'Exempelsol', power: 12.5, installed: '2026-09-01' },
    });
    await mcp.object('garage', {
      typeId: 'solar',
      name: 'Paneler på garaget',
      description: '',
      customValues: { battery: false },
    });
    await page.goto(app.origin);
    await openTable(page);
    let proposal = await readDraftProposal(page, 'Paneler på taket');
    for (const [label, value] of [
      ['Leverantör', 'Exempelsol'],
      ['Effekt', '12.5'],
      ['Installationsdatum', '2026-09-01'],
    ])
      await expect(
        proposal
          .locator('dt')
          .filter({ hasText: new RegExp(`^${label}$`) })
          .locator('..'),
      ).toContainText(value);
    await expect(proposal).toContainText('Solcellsanläggning');
    await expect(
      proposal
        .locator('dt')
        .filter({ hasText: /^Batteri$/ })
        .locator('..'),
    ).toContainText('Ej uppgivet');
    await page.keyboard.press('Escape');
    proposal = await readDraftProposal(page, 'Paneler på garaget');
    for (const label of ['Leverantör', 'Effekt', 'Installationsdatum'])
      await expect(
        proposal
          .locator('dt')
          .filter({ hasText: new RegExp(`^${label}$`) })
          .locator('..'),
      ).toContainText('Ej uppgivet');
    await expect(
      proposal
        .locator('dt')
        .filter({ hasText: /^Batteri$/ })
        .locator('..'),
    ).toContainText('Nej');
    await page.keyboard.press('Escape');
    expect((await mcp.tool('read_map')).objects).toEqual([]);
    await mcp.save('solar');
    const blocked = await mcp.type(
      'solar',
      {
        ...definition,
        fields: fields.map((field) => (field.id === 'power' ? { ...field, kind: 'text' } : field)),
      },
      'field_kind_in_use',
    );
    expect(blocked.message).toContain('nytt fält');
    await mcp.type('solar', {
      ...definition,
      fields: [
        ...fields,
        { id: 'power-note', name: 'Effektanteckning', description: '', kind: 'text' },
      ],
    });
    const catalog = await mcp.tool('read_type_catalog');
    const unused = catalog.types.find((type: { name: string }) => type.name === 'Fordon');
    const person = catalog.types.find((type: { name: string }) => type.name === 'Person');
    await mcp.type(person.id, {
      name: 'Person i hushållet',
      description: 'Personer ger ingen inloggning',
      fields: [],
    });
    await mcp.type(unused.id, null);
    await mcp.save('catalog-changes');
    await app.restart();
    await page.reload();
    const roof = await editTableObject(page, 'Paneler på taket');
    await expect(roof.getByLabel('Objekttyp')).toHaveValue('solar');
    await expect(roof.getByLabel('Beskrivning', { exact: true })).toHaveValue('');
    await roof.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('Exempelsol');
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('12.5');
    await expect(page.getByLabel('Installationsdatum', { exact: true })).toHaveValue('2026-09-01');
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Effektanteckning', { exact: true })).toHaveValue('');
    await page.keyboard.press('Escape');
    const garage = await editTableObject(page, 'Paneler på garaget');
    await expect(garage.getByLabel('Objekttyp')).toHaveValue('solar');
    await expect(garage.getByLabel('Beskrivning', { exact: true })).toHaveValue('');
    await garage.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('false');
    for (const label of ['Leverantör', 'Effekt', 'Installationsdatum', 'Effektanteckning'])
      await expect(garage.getByLabel(label, { exact: true })).toHaveValue('');
    expect(
      (await mcp.tool('read_type_catalog')).types.map((type: { name: string }) => type.name),
    ).toContain('Person i hushållet');
    expect(
      (await mcp.tool('read_type_catalog')).types.some(
        (type: { id: string }) => type.id === unused.id,
      ),
    ).toBe(false);
  } finally {
    await app.close();
  }
});

test('MCP-02: daterade avtal kan rättas utan påhittade uppgifter', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    const catalog = await mcp.tool('read_type_catalog');
    const type = (name: string) =>
      catalog.types.find((entry: { name: string }) => entry.name === name).id;
    for (const [id, kind, name, facts] of [
      [
        'rent',
        'Hyresavtal',
        'Hyra för lägenheten',
        { price: { knowledge: 'known', value: '9 500' }, terms: { knowledge: 'unknown' } },
      ],
      [
        'garage-rent',
        'Hyresavtal',
        'Hyra för garaget',
        { price: { knowledge: 'uncertain', value: '650' } },
      ],
      [
        'loan',
        'Låneavtal',
        'Exempellån',
        { debt: { knowledge: 'uncertain', value: '125 000,50', reportedOn: '2026-09-01' } },
      ],
      [
        'credit',
        'Kreditavtal',
        'Exempelkredit',
        {
          creditLimit: { knowledge: 'known', value: '80 000', reportedOn: '2026-08-01' },
          usedCredit: { knowledge: 'known', value: '12 500', reportedOn: '2026-09-02' },
          terms: { knowledge: 'none' },
        },
      ],
      [
        'installment',
        'Avbetalningsavtal',
        'Bilens avbetalning',
        { debt: { knowledge: 'unknown', reportedOn: '2026-09-03' } },
      ],
    ] as const)
      await mcp.object(id, { typeId: type(kind), name, description: '', financialFacts: facts });
    await mcp.object('car', {
      typeId: type('Fordon'),
      name: 'Familjens bil',
      description: '',
      identity: 'unspecified',
    });
    for (const [id, name, kind] of [
      ['home', 'Lägenheten', 'Bostad'],
      ['garage', 'Garaget', 'Garage'],
    ]) {
      await mcp.object(id, { typeId: type(kind), name, description: '' });
    }
    for (const [id, sourceId, targetId] of [
      ['home-rent-link', 'rent', 'home'],
      ['garage-rent-link', 'garage-rent', 'garage'],
    ]) {
      await mcp.propose('propose_relationship', {
        id,
        baseRevision: null,
        value: {
          typeId: catalog.relationshipTypes.find(
            (entry: { name: string }) => entry.name === 'Gäller',
          ).id,
          sourceId,
          targetId,
          knowledge: 'known',
        },
      });
    }
    await mcp.propose('propose_relationship', {
      id: 'finance-car',
      baseRevision: null,
      value: {
        typeId: catalog.relationshipTypes.find(
          (entry: { name: string }) => entry.name === 'Finansierar',
        ).id,
        sourceId: 'installment',
        targetId: 'car',
        knowledge: 'known',
      },
    });
    await page.goto(app.origin);
    await openTable(page);
    let proposal = await readDraftProposal(page, 'Exempellån');
    await expect(proposal).toContainText('125 000,50 (Osäkert uppgivet)');
    await expect(proposal).toContainText('2026-09-01');
    await expect(proposal).toContainText('Låneavtal');
    await page.keyboard.press('Escape');
    proposal = await readDraftProposal(page, 'Exempelkredit');
    for (const text of ['Kreditavtal', '80 000', '2026-08-01', '12 500', '2026-09-02'])
      await expect(proposal).toContainText(text);
    await expect(
      proposal
        .locator('dt')
        .filter({ hasText: /^Avtalsvillkor$/ })
        .locator('..'),
    ).toContainText('Uttryckligen inget');
    await page.keyboard.press('Escape');
    proposal = await readDraftProposal(page, 'Familjens bil');
    await expect(proposal).toContainText('Ospecificerat objekt');
    await expect(proposal).toContainText('Fordon');
    await page.keyboard.press('Escape');
    proposal = await readDraftProposal(page, 'Bilens avbetalning');
    await expect(
      proposal
        .locator('dt')
        .filter({ hasText: /^Senast uppgiven skuld$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveText('Okänt · datum för uppgiften: 2026-09-03');
    await page.keyboard.press('Escape');
    await mcp.save('agreements');
    const credit = (await mcp.tool('read_map', { objectId: 'credit' })).objects[0];
    await mcp.object('credit', {
      typeId: credit.typeId,
      name: credit.name,
      description: '',
      financialFacts: {
        ...credit.financialFacts,
        usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-20' },
      },
    });
    const receipt = await mcp.save('correct-used-credit');
    await app.restart();
    await page.reload();
    const creditForm = await editTableObject(page, 'Exempelkredit');
    await expect(creditForm.getByLabel('Objekttyp')).toHaveValue(type('Kreditavtal'));
    await creditForm.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(page.getByLabel('Beviljat kreditutrymme', { exact: true })).toHaveValue('80 000');
    await expect(creditForm.getByLabel('Beviljat kreditutrymme: datum för uppgiften')).toHaveValue(
      '2026-08-01',
    );
    await expect(creditForm.getByLabel('Beviljat kreditutrymme: uppgiftens säkerhet')).toHaveValue(
      'known',
    );
    await expect(page.getByLabel('Utnyttjad kredit', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Utnyttjad kredit: datum för uppgiften')).toHaveValue(
      '2026-09-20',
    );
    await expect(page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue('');
    await expect(creditForm.getByLabel('Utnyttjad kredit: uppgiftens säkerhet')).toHaveValue(
      'known',
    );
    await expect(creditForm.getByLabel('Avtalsvillkor: uppgiftens säkerhet')).toHaveValue('none');
    const selected = await mcp.tool('read_history', {
      operationId: receipt.operationId,
      userId: receipt.userId,
    });
    expect(selected.receipt.changes[0].before.financialFacts.usedCredit.value).toBe('12 500');
    expect(selected.receipt.changes[0].before.financialFacts.usedCredit.reportedOn).toBe(
      '2026-09-02',
    );
    await page.keyboard.press('Escape');
    const creditHistory = await openSavedHistory(page);
    const creditChange = creditHistory.getByRole('article').filter({ hasText: 'Ändrat objekt' });
    await creditChange.getByText('Visa ändringarna', { exact: true }).click();
    await expect(
      creditChange.getByText('Utnyttjad kredit: 12 500 — datum för uppgiften: 2026-09-02', {
        exact: true,
      }),
    ).toBeVisible();
    for (const [phase, amount, date] of [
      ['Före sparandet', '12 500', '2026-09-02'],
      ['Efter sparandet', '0', '2026-09-20'],
    ]) {
      const values = creditChange
        .getByRole('heading', { name: phase, exact: true })
        .locator(
          `xpath=following-sibling::*[preceding-sibling::h5[1][normalize-space()="${phase}"]]`,
        );
      await expect(
        values.getByText(`Utnyttjad kredit: ${amount} — datum för uppgiften: ${date}`, {
          exact: true,
        }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    for (const [name, kind, label, knowledge, amount, date] of [
      ['Hyra för lägenheten', 'Hyresavtal', 'Pris', 'known', '9 500', undefined],
      ['Hyra för garaget', 'Hyresavtal', 'Pris', 'uncertain', '650', undefined],
      ['Exempellån', 'Låneavtal', 'Senast uppgiven skuld', 'uncertain', '125 000,50', '2026-09-01'],
      [
        'Bilens avbetalning',
        'Avbetalningsavtal',
        'Senast uppgiven skuld',
        'unknown',
        undefined,
        '2026-09-03',
      ],
    ] as const) {
      const form = await editTableObject(page, name);
      await expect(form.getByLabel('Objekttyp')).toHaveValue(type(kind));
      await form.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
      await expect(form.getByLabel(`${label}: uppgiftens säkerhet`, { exact: true })).toHaveValue(
        knowledge,
      );
      if (amount !== undefined)
        await expect(form.getByLabel(label, { exact: true })).toHaveValue(amount);
      else await expect(form.getByLabel(label, { exact: true })).toHaveCount(0);
      if (date !== undefined)
        await expect(form.getByLabel(`${label}: datum för uppgiften`, { exact: true })).toHaveValue(
          date,
        );
      if (name === 'Hyra för lägenheten')
        await expect(form.getByLabel('Avtalsvillkor: uppgiftens säkerhet')).toHaveValue('unknown');
      await page.keyboard.press('Escape');
    }
    for (const name of [
      'Hyra för lägenheten',
      'Hyra för garaget',
      'Exempellån',
      'Bilens avbetalning',
    ])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    for (const [source, target, kind] of [
      ['Bilens avbetalning', 'Familjens bil', 'Finansierar'],
      ['Hyra för lägenheten', 'Lägenheten', 'Gäller'],
      ['Hyra för garaget', 'Garaget', 'Gäller'],
    ]) {
      const relationships = await openObjectRelationships(page, source);
      await expect(relationships).toContainText(target);
      for (const [label, value] of [
        ['Typ', kind],
        ['Från objekt', source],
        ['Till objekt', target],
      ])
        await expect(
          relationships
            .locator('dt')
            .filter({ hasText: new RegExp(`^${label}$`) })
            .locator('..')
            .locator('dd'),
        ).toHaveText(value);
      await page.keyboard.press('Escape');
    }
  } finally {
    await app.close();
  }
});
