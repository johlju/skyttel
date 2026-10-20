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
} from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('AVTAL-01: freely labelled rent information can be found and corrected after reload', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Lägenhetens hyresavtal');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Hyresavtal' });
    await openFreeProperties(form);
    await addFreeProperty(form, 'Hyra', 'text', '8 200 kr per månad');
    await addFreeProperty(form, 'Betalningsdag', 'text', 'Sista vardagen');
    await addFreeProperty(form, 'Villkor', 'text', 'Tre månaders uppsägningstid');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const proposal = await readDraftProposal(page, 'Lägenhetens hyresavtal');
    await expect(proposal).toContainText('8 200 kr per månad');
    await closeSupportDialog(page, 'Lägenhetens hyresavtal');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }).fill('8 200');
    const edit = await editTableObject(page, 'Lägenhetens hyresavtal');
    await openFreeProperties(edit);
    await freeProperty(edit, 'Hyra')
      .getByLabel('Värde', { exact: true })
      .fill('8 500 kr per månad');
    await edit.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }).fill('8 500');
    const details = await readTableObject(page, 'Lägenhetens hyresavtal');
    await expect(details).toContainText('8 500 kr per månad');
    await expect(details).toContainText('Tre månaders uppsägningstid');
  } finally {
    await installation.close();
  }
});

test('AVTAL-02: independent debt and credit properties preserve values, dates and unanswered information', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Familjens kreditavtal');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Kreditavtal' });
    await openFreeProperties(form);
    await addFreeProperty(form, 'Skuld', 'text', 'Cirka 18 000');
    await addFreeProperty(form, 'Skuld uppgiven', 'date', '2026-03-01');
    await addFreeProperty(form, 'Beviljat kreditutrymme', 'number', '50000');
    await addFreeProperty(form, 'Utnyttjad kredit', 'number');
    await addFreeProperty(form, 'Slutdatum', 'date');
    await addFreeProperty(form, 'Avtalsvillkor', 'text', 'Uppgift saknas');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const edit = await editTableObject(page, 'Familjens kreditavtal');
    await openFreeProperties(edit);
    await expect(freeProperty(edit, 'Skuld').getByLabel('Värde', { exact: true })).toHaveValue(
      'Cirka 18 000',
    );
    await expect(
      freeProperty(edit, 'Beviljat kreditutrymme').getByLabel('Värde', { exact: true }),
    ).toHaveValue('50000');
    await expect(
      freeProperty(edit, 'Utnyttjad kredit').getByLabel('Värde', { exact: true }),
    ).toHaveValue('');
    await freeProperty(edit, 'Utnyttjad kredit').getByLabel('Värde', { exact: true }).fill('12000');
    await freeProperty(edit, 'Skuld')
      .getByRole('button', { name: 'Töm värdet', exact: true })
      .click();
    await edit.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const details = await readTableObject(page, 'Familjens kreditavtal');
    for (const text of ['Skuld', '2026-03-01', '50000', '12000', 'Uppgift saknas'])
      await expect(details).toContainText(text);
  } finally {
    await installation.close();
  }
});

test('AVTAL-04: contract property proposals recover and a zero credit correction survives restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Exempelkredit');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Kreditavtal' });
    await openFreeProperties(form);
    await addFreeProperty(form, 'Senast uppgiven skuld', 'number', '125000.5');
    await addFreeProperty(form, 'Skuld uppgiven', 'date', '2026-09-01');
    await addFreeProperty(form, 'Beviljat kreditutrymme', 'number', '80000');
    await addFreeProperty(form, 'Utnyttjad kredit', 'number', '12500');
    await addFreeProperty(form, 'Osäkert uppgivet', 'boolean', 'true');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const before = await read();
    await installation.restart();
    await page.reload();
    const proposal = await readDraftProposal(page, 'Exempelkredit');
    await expect(proposal).toContainText('2026-09-01');
    expect((await read()).draft).toEqual(before.draft);
    await closeSupportDialog(page, 'Exempelkredit');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const edit = await editTableObject(page, 'Exempelkredit');
    await openFreeProperties(edit);
    await freeProperty(edit, 'Utnyttjad kredit').getByLabel('Värde', { exact: true }).fill('0');
    await edit.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const correction = await readDraftProposal(page, 'Exempelkredit');
    await expect(correction).toContainText('12500');
    await expect(correction).toContainText('0');
    await closeSupportDialog(page, 'Exempelkredit');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const state = await read();
    const properties = state.objects[0].properties;
    expect(properties?.find((property) => property.label === 'Utnyttjad kredit')).toMatchObject({
      value: 0,
    });
    expect(properties?.map((property) => property.id)).toEqual(
      before.draft.changes[0].after?.properties?.map((property) => property.id),
    );
    const details = await readTableObject(page, 'Exempelkredit');
    await expect(details).toContainText('125000.5');
    await expect(details).toContainText('2026-09-01');
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    await history.getByText('Visa ändringarna', { exact: true }).first().click();
    await expect(history).toContainText('12500');
    await expect(history).toContainText('Utnyttjad kredit');
  } finally {
    await installation.close();
  }
});

test('AVTAL-07: invalid number input preserves the independent contract proposal', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    for (const name of ['Ofullständigt åtagande', 'Felaktigt åtagande']) {
      await openNewObject(page);
      const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await form.getByLabel('Namn', { exact: true }).fill(name);
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Låneavtal' });
      if (name === 'Ofullständigt åtagande') {
        await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        continue;
      }
      const before = await (await page.request.get(path)).json();
      await openFreeProperties(form);
      const row = await addFreeProperty(form, 'Senast uppgiven skuld', 'number', 'Inte ett tal');
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
      await expect(row.getByLabel('Värde', { exact: true })).toHaveValue('Inte ett tal');
      expect(await (await page.request.get(path)).json()).toEqual(before);
      await row.getByRole('button', { name: 'Töm värdet', exact: true }).click();
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      const review = await readDraftProposal(page, 'Felaktigt åtagande');
      await expect(review).toContainText('Senast uppgiven skuld');
    }
  } finally {
    await installation.close();
  }
});

test('AVTAL-08: explicit property conflict choices preserve another members independent contract terms', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request, [
    ['contract', 'Familjens kreditavtal'],
  ]);
  try {
    const initial = (await app.read()).objects[0];
    const properties = [
      { id: 'debt', label: 'Skuld', kind: 'number' as const, value: 150000 },
      { id: 'terms', label: 'Avtalsvillkor', kind: 'text' as const, value: 'Preliminära villkor' },
    ];
    await app.propose(page.request, 'draft', initial.id, { ...initial, properties });
    expect((await app.save(page.request, 'initial-properties')).status()).toBe(200);
    const saved = (await app.read()).objects[0];
    await page.goto(app.installation.origin);
    const form = await editTableObject(page, saved.name);
    await openFreeProperties(form);
    await freeProperty(form, 'Skuld').getByLabel('Värde', { exact: true }).fill('140000');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await app.propose(other.request, 'draft', saved.id, {
      ...saved,
      properties: [
        { id: 'debt', label: 'Skuld', kind: 'number', value: 145000 },
        { id: 'terms', label: 'Avtalsvillkor', kind: 'text', value: 'Rättade villkor' },
      ],
    });
    expect((await app.save(other.request, 'other-contract')).status()).toBe(200);
    expect((await app.save(page.request, 'blocked-contract')).status()).toBe(409);
    await page.reload();
    await openTable(page);
    await applyProposedConflictChanges(page, 'Rättade villkor');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await app.installation.restart();
    await page.reload();
    const details = await readTableObject(page, saved.name);
    await expect(details).toContainText('140000');
    await expect(details).toContainText('Rättade villkor');
  } finally {
    await other.close();
    await app.installation.close();
  }
});
