import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openNewObject,
  openSettings,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { readCommittedHistoryCard } from '../support/conversation-page.js';
import { editTableObject } from '../support/domain-work.js';
import { downloadHouseholdExport } from '../support/household-export-download.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('historical field kinds and exact receipts survive replacement and request corrections', {
  tag: '@technical',
}, async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const householdPath = `${installation.origin}/api/households/${household.id}`;
    const path = `${householdPath}/map`;
    const headers = { origin: installation.origin };
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = async (route: string, body: Record<string, unknown>) => {
      const state = await read();
      const response = await page.request.post(`${path}/${route}`, {
        headers,
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...body },
      });
      expect(response.status(), await response.text()).toBe(200);
      return response;
    };
    const save = async (operationId: string): Promise<SaveReceipt> =>
      (await (await post('save', { operationId })).json()).receipt;
    const typeId = (await read()).types[0].id;
    const define = async (kind: 'number' | 'text') => {
      const type = (await read()).types.find((value) => value.id === typeId);
      expect(type).toBeDefined();
      await post('object-type', {
        id: typeId,
        baseRevision: type?.revision,
        value: {
          ...type,
          fields: [{ id: 'serial', name: 'Serienummer', description: '', kind }],
        },
      });
    };
    await define('text');
    await save('text-definition');
    await define('number');
    await post('draft', {
      id: 'measured-object',
      baseRevision: null,
      value: { typeId, name: 'Mätare', description: '', customValues: { serial: 42 } },
    });
    const addition = await save('number-and-object');
    const removed = (await read()).objects.find((value) => value.id === 'measured-object');
    await post('draft', { id: 'measured-object', baseRevision: removed?.revision, value: null });
    await define('text');
    const inverse = await save('remove-object-and-use-text');
    expect(inverse.changes[0].before?.customValues).toEqual({ serial: 42 });
    expect(inverse.changes[0].beforeType?.fields?.[0].kind).toBe('number');
    expect(inverse.changes[0].type.fields?.[0].kind).toBe('text');
    expect((await read()).objects).toEqual([]);
    const history = (await (await page.request.get(`${path}/history`)).json()).history;

    const prepared = await page.request.post(`${householdPath}/exports`, { headers, data: {} });
    expect(prepared.status()).toBe(201);
    const exportId = (await prepared.json()).id;
    const downloaded = await page.request.get(`${householdPath}/exports/${exportId}`);
    expect(downloaded.status()).toBe(200);
    const imported = await page.request.post(`${householdPath}/imports`, {
      headers: {
        ...headers,
        'content-type': 'application/zip',
        'X-Skyttel-Content-Version': String((await read()).contentVersion),
      },
      data: await downloaded.body(),
    });
    expect(imported.status(), await imported.text()).toBe(201);
    const ready = await imported.json();
    const confirmed = await page.request.post(`${householdPath}/imports/${ready.id}/confirm`, {
      headers,
      data: { contentVersion: ready.contentVersion, confirmed: true },
    });
    expect(confirmed.status(), await confirmed.text()).toBe(200);
    expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
    await installation.restart();
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual(history);
    await define('number');
    await post('draft', {
      id: 'new-measured-object',
      baseRevision: null,
      value: { typeId, name: 'Ny mätare', description: '', customValues: { serial: 43 } },
    });
    const correction = await save('ordinary-correction');
    await installation.restart();
    const restored = await read();
    expect(restored.objects).toEqual([
      expect.objectContaining({ id: 'new-measured-object', customValues: { serial: 43 } }),
    ]);
    expect(restored.types.find((value) => value.id === typeId)?.fields?.[0].kind).toBe('number');
    const finalHistory = (await (await page.request.get(`${path}/history`)).json()).history;
    expect(finalHistory).toContainEqual(inverse);
    expect(finalHistory).toContainEqual(addition);
    expect(finalHistory).toContainEqual(correction);
  } finally {
    await installation.close();
  }
});

test('IMPORT-07: browser field editing, replacement and historical reading preserve old meanings and ordinary corrections', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    await page.goto(installation.origin);
    const editDefinition = async (kind: 'text' | 'number', first = false) => {
      await openSettings(page);
      await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
      const summary = page.getByText('Objekttyper och egna fält', { exact: true });
      if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
      await page.getByRole('button', { name: 'Ändra typ: Person', exact: true }).click();
      if (first) {
        await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
        await page.getByLabel('Fältets namn', { exact: true }).fill('Serienummer');
      }
      await page.getByLabel('Värdeslag', { exact: true }).selectOption(kind);
      await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await expect(
        page.getByText('Förslaget finns i ditt privata utkast', { exact: false }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    };
    const save = async () => {
      const saved = page.waitForResponse(
        (response) =>
          response.url() === `${path}/map/save` && response.request().method() === 'POST',
      );
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      return (await (await saved).json()).receipt as SaveReceipt;
    };
    const createMeter = async (name: string, value: string) => {
      const form = await openNewObject(page);
      await form.getByLabel('Namn', { exact: true }).fill(name);
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
      await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
      await form.getByLabel('Serienummer', { exact: true }).fill(value);
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    };
    await editDefinition('text', true);
    const definitionReceipt = await save();
    await editDefinition('number');
    await createMeter('Mätare', '42');
    const additionReceipt = await save();
    await openTable(page);
    await page.getByRole('button', { name: 'Ta bort Mätare', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ta bort Mätare', exact: true })).toBeDisabled();
    await editDefinition('text');
    const removalReceipt = await save();
    const before = (await (await page.request.get(`${path}/map/history`)).json()).history;
    const archive = await downloadHouseholdExport(page, path);
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(page.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await installation.restart();
    await page.goto(installation.origin);
    await (await utilityButton(page, 'Rapporter')).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await expect(history.getByText('Visa ändringarna', { exact: true })).toHaveCount(before.length);
    for (const details of await history.getByText('Visa ändringarna', { exact: true }).all()) {
      await details.click();
    }
    await expect(history).toContainText('Mätare');
    await expect(history).toContainText('Serienummer');
    await expect(history).toContainText('42');
    await expect(history).toContainText('Tal');
    await expect(history).toContainText('Text');
    await expect(history).toContainText('Alex Exempel');
    const removal = history.locator(`article[data-save="${before[0].operationId}"]`);
    await expect(removal).toContainText('Objekt: Mätare');
    await expect(removal).toContainText('42');
    await expect(removal).toContainText('Serienummer: Tal');
    await expect(removal).toContainText('Serienummer: Text');
    await expect(removal.locator('time')).toHaveAttribute('datetime', before[0].savedAt);
    for (const receipt of [removalReceipt, additionReceipt, definitionReceipt])
      await readCommittedHistoryCard(history, receipt);
    expect(before).toEqual([removalReceipt, additionReceipt, definitionReceipt]);
    expect((await (await page.request.get(`${path}/map/history`)).json()).history).toEqual(before);
    await page.goto(installation.origin);
    await editDefinition('number');
    await createMeter('Ny mätare', '43');
    await save();
    await installation.restart();
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Ny mätare');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Serienummer', { exact: true })).toHaveValue('43');
    const after = (await (await page.request.get(`${path}/map/history`)).json()).history;
    expect(after).toHaveLength(before.length + 1);
    for (const receipt of before) expect(after).toContainEqual(receipt);
  } finally {
    await installation.close();
  }
});
