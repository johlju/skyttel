import type { MapState } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openNewObject,
  openTable,
  signIn,
} from '../support/client.js';
import {
  applyProposedConflictChanges,
  conflictCollaborators,
} from '../support/conflict-properties.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject, readDraftProposal, readTableObject } from '../support/domain-work.js';
import {
  addFreeProperty,
  freeProperty,
  openFreeProperties,
  openTypes,
} from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('TYP-01: type definition and individual properties share a durable save and readable history', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openTypes(page);
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await expect(page.getByLabel('Typens namn')).toBeFocused();
    await page.getByLabel('Typens namn').fill('Solcellsanläggning');
    await page.getByLabel('Typens beskrivning').fill('Hushållets elproduktion');
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Paneler på taket');
    await form
      .getByLabel('Objekttyp', { exact: true })
      .selectOption({ label: 'Solcellsanläggning' });
    await openFreeProperties(form);
    await addFreeProperty(form, 'Leverantör', 'text', 'Exempelsol');
    await addFreeProperty(form, 'Effekt', 'number', '12.5');
    await addFreeProperty(form, 'Installationsdatum', 'date', '2026-09-01');
    await addFreeProperty(form, 'Batteri', 'boolean');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const staged = await read();
    const proposed = staged.draft.changes[0].after;
    expect(proposed?.properties).toMatchObject([
      { label: 'Leverantör', kind: 'text', value: 'Exempelsol' },
      { label: 'Effekt', kind: 'number', value: 12.5 },
      { label: 'Installationsdatum', kind: 'date', value: '2026-09-01' },
      { label: 'Batteri', kind: 'boolean' },
    ]);
    expect(staged.objects).toEqual([]);
    await installation.restart();
    await page.reload();
    expect((await read()).draft).toEqual(staged.draft);
    const review = await readDraftProposal(page, 'Paneler på taket');
    await expect(review).toContainText('Exempelsol');
    await expect(review).toContainText('Batteri');
    await closeSupportDialog(page, 'Paneler på taket');
    const response = await saveReviewedConflictDraft(page);
    const { receipt } = await response.json();
    expect(receipt.objectTypes).toHaveLength(1);
    expect(receipt.changes[0].after.properties).toEqual(proposed?.properties);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    expect((await read()).objects[0].properties).toEqual(proposed?.properties);
    const details = await readTableObject(page, 'Paneler på taket');
    await expect(details).toContainText('Exempelsol');
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history).toContainText('Hushållets elproduktion');
    await expect(history).toContainText('Leverantör');
    await expect(history).toContainText('Exempelsol');
  } finally {
    await installation.close();
  }
});

test('TYP-02: individual properties distinguish empty, zero and false during correction', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    let form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Paneler');
    await openFreeProperties(form);
    await addFreeProperty(form, 'Leverantör', 'text');
    await addFreeProperty(form, 'Effekt', 'number', '0');
    await addFreeProperty(form, 'Installationsdatum', 'date', '2026-09-01');
    await addFreeProperty(form, 'Batteri', 'boolean', 'false');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    form = await editTableObject(page, 'Paneler');
    await openFreeProperties(form);
    await expect(freeProperty(form, 'Leverantör').getByLabel('Värde', { exact: true })).toHaveValue(
      '',
    );
    await expect(freeProperty(form, 'Effekt').getByLabel('Värde', { exact: true })).toHaveValue(
      '0',
    );
    await expect(freeProperty(form, 'Batteri').getByLabel('Värde', { exact: true })).toHaveValue(
      'false',
    );
    await freeProperty(form, 'Leverantör')
      .getByLabel('Värde', { exact: true })
      .fill('Ny leverantör');
    await freeProperty(form, 'Effekt')
      .getByRole('button', { name: 'Töm värdet', exact: true })
      .click();
    await freeProperty(form, 'Installationsdatum')
      .getByLabel('Värde', { exact: true })
      .fill('2026-09-02');
    await freeProperty(form, 'Batteri').getByLabel('Värde', { exact: true }).selectOption('true');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const state: MapState = await (await page.request.get(path)).json();
    expect(state.objects[0].properties).toMatchObject([
      { label: 'Leverantör', value: 'Ny leverantör' },
      { label: 'Effekt', kind: 'number' },
      { label: 'Installationsdatum', value: '2026-09-02' },
      { label: 'Batteri', value: true },
    ]);
    expect(state.objects[0].properties?.[1]).not.toHaveProperty('value');
    const details = await readTableObject(page, 'Paneler');
    await expect(details).toContainText('Ny leverantör');
    await expect(details).toContainText('Ja');
  } finally {
    await installation.close();
  }
});

test('TYP-03: ordinary members share saved type edits while individual property proposals stay private', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request, [
    ['shared', 'Gemensamt objekt'],
  ]);
  try {
    const state = await app.read();
    const type = state.types[0];
    await app.propose(page.request, 'draft', 'private', {
      typeId: type.id,
      name: 'Privat objekt',
      properties: [{ id: 'note', label: 'Anteckning', kind: 'text', value: 'Privat värde' }],
    });
    const member = await other.newPage();
    await member.goto(app.installation.origin);
    await openTypes(member);
    await member.getByText('Objekttyper', { exact: true }).click();
    await member.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await member.getByLabel('Typens namn').fill('Människa');
    await member.getByLabel('Typens beskrivning').fill('En person i kartan');
    await member.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    expect((await app.read(other.request)).draft.changes).toEqual([]);
    await member.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await saveReviewedConflictDraft(member);
    await page.goto(app.installation.origin);
    const form = await editTableObject(page, 'Privat objekt');
    await expect(form.getByLabel('Objekttyp', { exact: true })).toHaveValue(type.id);
    await openFreeProperties(form);
    await expect(freeProperty(form, 'Anteckning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Privat värde',
    );
    expect((await app.read(other.request)).objects.some((object) => object.id === 'private')).toBe(
      false,
    );
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('TYP-04: concurrent type changes require explicit conflict choices before the whole draft saves', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request, [
    ['shared', 'Gemensamt objekt'],
  ]);
  try {
    const type = (await app.read()).types[0];
    for (const [client, name, description] of [
      [page.request, 'Människor', 'Mitt förslag'],
      [other.request, 'Personer', 'Annans rättelse'],
    ] as const) {
      expect(
        (
          await app.post(client, 'object-type', {
            version: (await app.read(client)).draft.version,
            id: type.id,
            baseRevision: type.revision,
            value: { name, description },
          })
        ).status(),
      ).toBe(200);
    }
    await app.propose(page.request, 'draft', 'alex', {
      typeId: type.id,
      name: 'Alex',
      properties: [{ id: 'alias', label: 'Smeknamn', kind: 'text', value: 'Al' }],
    });
    expect((await app.save(other.request, 'other-definition')).status()).toBe(200);
    const before = await app.read();
    expect((await app.save(page.request, 'blocked-definition')).status()).toBe(409);
    expect((await app.read()).draft).toEqual(before.draft);
    await page.goto(app.installation.origin);
    await openTable(page);
    await applyProposedConflictChanges(page, 'Annans rättelse');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await app.installation.restart();
    await page.reload();
    const details = await readTableObject(page, 'Alex');
    await expect(details).toContainText('Människor');
    await expect(details).toContainText('Al');
    expect((await app.read()).types.find((item) => item.id === type.id)).toMatchObject({
      name: 'Människor',
      description: 'Mitt förslag',
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('TYP-05: invalid property input preserves the complete existing draft', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    let form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Bevara mig');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const before = await (await page.request.get(path)).json();
    await openNewObject(page);
    form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Ogiltigt datum');
    await openFreeProperties(form);
    const row = await addFreeProperty(form, 'Kontrolldatum', 'date', '2026-02-30');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
    await expect(row.getByLabel('Värde', { exact: true })).toHaveValue('2026-02-30');
    expect(await (await page.request.get(path)).json()).toEqual(before);
    await row.getByLabel('Värde', { exact: true }).fill('2026-02-28');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const review = await readDraftProposal(page, 'Ogiltigt datum');
    await expect(review).toContainText('2026-02-28');
  } finally {
    await installation.close();
  }
});
