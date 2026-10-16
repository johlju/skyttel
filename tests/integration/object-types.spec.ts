import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import { applyProposedConflictChanges } from '../support/conflict-properties.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject, readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('TYP-01: native type and field forms share a durable object save and readable history', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async () => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    const submit = page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' });
    await submit.click();
    await expect(page.getByLabel('Typens namn')).toBeFocused();
    await page.getByLabel('Typens namn').fill('Solcellsanläggning');
    await page.getByLabel('Typens beskrivning').fill('Hushållets elproduktion');
    await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
    await submit.click();
    await expect(page.getByLabel('Fältets namn')).toBeFocused();
    const fieldValues = [
      ['Leverantör', 'text', 'Namn'],
      ['Effekt', 'number', 'kW'],
      ['Installationsdatum', 'date', ''],
      ['Batteri', 'boolean', ''],
    ];
    for (const [index, [name, kind, description]] of fieldValues.entries()) {
      if (index) await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
      const field = page.getByRole('group', { name: /^Eget fält/ }).last();
      await field.getByLabel('Fältets namn').fill(name);
      await field.getByLabel('Värdeslag', { exact: true }).selectOption(kind);
      await field.getByLabel('Fältets beskrivning', { exact: true }).fill(description);
    }
    await submit.click();
    await expect(page.getByRole('status')).toContainText('Förslaget finns i ditt privata utkast');
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Paneler på taket');
    await page
      .getByLabel('Objekttyp', { exact: true })
      .selectOption({ label: 'Solcellsanläggning' });
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await page.getByLabel('Leverantör', { exact: true }).fill('Exempelsol');
    await page.getByLabel('Effekt', { exact: true }).fill('12.5');
    await page.getByLabel('Installationsdatum', { exact: true }).fill('2026-09-01');
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const staged = await read();
    expect(staged.draft.objectTypes).toHaveLength(1);
    expect(staged.draft.changes).toHaveLength(1);
    const definition = staged.draft.objectTypes[0];
    const fields = definition.after.fields;
    expect(definition.before).toBeNull();
    expect(definition.after).toMatchObject({
      id: definition.id,
      householdId: household.id,
      revision: 1,
      name: 'Solcellsanläggning',
      description: 'Hushållets elproduktion',
      fields: fieldValues.map(([name, kind, description]) => ({ name, kind, description })),
    });
    const value = {
      typeId: definition.id,
      name: 'Paneler på taket',
      description: '',
      customValues: {
        [fields[0].id]: 'Exempelsol',
        [fields[1].id]: 12.5,
        [fields[2].id]: '2026-09-01',
      },
    };
    expect(staged.draft.changes[0].after).toMatchObject(value);
    expect(staged.draft.changes[0].after.customValues).toEqual(value.customValues);
    expect(staged.types.some((type: { id: string }) => type.id === definition.id)).toBe(false);
    expect(staged.objects).toEqual([]);
    await installation.restart();
    await page.reload();
    const proposed = await read();
    expect(proposed.draft).toEqual(staged.draft);
    expect(proposed.objects).toEqual([]);
    expect(proposed.types.some((type: { id: string }) => type.id === definition.id)).toBe(false);
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Solcellsanläggning');
    await expect(draft).toContainText('Paneler på taket');
    const saved = await saveReviewedConflictDraft(page);
    expect(saved.status()).toBe(200);
    const saveRequest = saved.request().postDataJSON();
    const { receipt } = await saved.json();
    expect(receipt.objectTypes).toEqual([
      { id: definition.id, before: null, after: { ...definition.after, revision: 1 } },
    ]);
    expect(receipt.changes).toHaveLength(1);
    expect(receipt.changes[0].before).toBeNull();
    expect(receipt.changes[0].after).toEqual({
      ...staged.draft.changes[0].after,
      id: staged.draft.changes[0].id,
      householdId: household.id,
      revision: 1,
    });
    expect(receipt.changes[0].type).toEqual(receipt.objectTypes[0].after);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const current = await read();
    expect(current.objects).toEqual([receipt.changes[0].after]);
    expect(current.objects[0].customValues).not.toHaveProperty(fields[3].id);
    expect(current.types.find((type: { id: string }) => type.id === definition.id)).toEqual(
      receipt.objectTypes[0].after,
    );
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    const replay = await page.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: saveRequest,
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ receipt });
    expect(await read()).toEqual(current);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    await openTable(page);
    await editTableObject(page, 'Paneler på taket');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('Exempelsol');
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('12.5');
    await expect(page.getByLabel('Installationsdatum', { exact: true })).toHaveValue('2026-09-01');
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await page
      .getByRole('dialog', { name: 'Redigera Paneler på taket', exact: true })
      .getByRole('button', { name: 'Avbryt', exact: true })
      .click();
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history).toContainText('Solcellsanläggning');
    await expect(history).toContainText('Leverantör');
    await expect(history).toContainText('Exempelsol');
    await expect(history).toContainText('Alex Exempel');
    await expect(history.locator('time')).toHaveAttribute('datetime', /T/);
  } finally {
    await installation.close();
  }
});

test('TYP-02: forms create, review and correct optional custom fields without confusing unanswered and no', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    await page.getByLabel('Typens namn').fill('Solcellsanläggning');
    await page.getByLabel('Typens beskrivning').fill('Hushållets elproduktion');
    for (const [name, kind] of [
      ['Leverantör', 'text'],
      ['Effekt', 'number'],
      ['Installationsdatum', 'date'],
      ['Batteri', 'boolean'],
    ]) {
      await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
      const fields = page.getByRole('group', { name: /^Eget fält/ });
      const last = fields.last();
      await last.getByLabel('Fältets namn').fill(name);
      await last.getByLabel('Värdeslag').selectOption(kind);
    }
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Paneler på taket');
    await page
      .getByLabel('Objekttyp', { exact: true })
      .selectOption({ label: 'Solcellsanläggning' });
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const review = await readDraftProposal(page, 'Paneler på taket');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Batteri(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('Ej uppgivet');
    await expect(review.locator('dt').filter({ hasText: /^Typ$/ }).locator('..')).toContainText(
      'Solcellsanläggning',
    );
    await closeSupportDialog(page, 'Paneler på taket');
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Paneler på taket');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Installationsdatum', { exact: true })).toHaveValue('');
    await page
      .getByRole('dialog', { name: 'Redigera Paneler på taket', exact: true })
      .getByRole('button', { name: 'Avbryt', exact: true })
      .click();
    await openTable(page);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Paneler på taket');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await page.getByLabel('Leverantör', { exact: true }).fill('Exempelsol');
    await page.getByLabel('Effekt', { exact: true }).fill('12.5');
    await page.getByLabel('Installationsdatum', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Batteri', { exact: true }).selectOption('false');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await readDraftProposal(page, 'Paneler på taket');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Batteri(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('Nej');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Effekt(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('12.5');
    await closeSupportDialog(page, 'Paneler på taket');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Paneler på taket');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('false');
    await page.getByLabel('Leverantör', { exact: true }).fill('Ny leverantör');
    await page.getByLabel('Effekt', { exact: true }).fill('');
    await page.getByLabel('Effekt', { exact: true }).pressSequentially('-14.25');
    await page.getByLabel('Installationsdatum', { exact: true }).fill('2026-09-02');
    await page.getByLabel('Batteri', { exact: true }).selectOption('true');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await readDraftProposal(page, 'Paneler på taket');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Batteri(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('Ja');
    await closeSupportDialog(page, 'Paneler på taket');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Paneler på taket');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('Ny leverantör');
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('-14.25');
    await expect(page.getByLabel('Installationsdatum', { exact: true })).toHaveValue('2026-09-02');
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('true');
  } finally {
    await installation.close();
  }
});

test('TYP-03: members share editable definitions while private proposals and used field kinds stay protected', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    installation.setIdentity({
      subject: 'member-google',
      name: 'Lo Exempel',
      email: 'lo@example.test',
    });
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await other.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    const read = async (client = page.request) => (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const field = {
      id: 'note',
      name: 'Anteckning',
      description: 'Frivillig uppgift',
      kind: 'text',
    };
    const value = { name: 'Solcellsanläggning', description: 'Elproduktion', fields: [field] };
    expect(
      (
        await post(
          'object-type',
          { version: 0, id: 'solar', baseRevision: null, value },
          other.request,
        )
      ).status(),
    ).toBe(200);
    expect((await read()).types.some((type: { id: string }) => type.id === 'solar')).toBe(false);
    expect((await read()).draft).toEqual({ version: 0, changes: [] });
    await page.goto(installation.origin);
    await openNewObject(page);
    await expect(
      page
        .getByLabel('Objekttyp', { exact: true })
        .getByRole('option', { name: 'Solcellsanläggning', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(
      (
        await post('draft', {
          version: 0,
          id: 'hidden',
          baseRevision: null,
          value: { typeId: 'solar', name: 'Kan inte använda privat typ', description: '' },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await post('save', { version: 1, operationId: 'definition' }, other.request)).status(),
    ).toBe(200);
    expect(
      (
        await post('draft', {
          version: 0,
          id: 'panels',
          baseRevision: null,
          value: {
            typeId: 'solar',
            name: 'Paneler',
            description: '',
            customValues: { note: 'Privat värde' },
          },
        })
      ).status(),
    ).toBe(200);
    const memberPage = await other.newPage();
    await memberPage.goto(installation.origin);
    await openSettings(memberPage);
    await memberPage.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await memberPage.getByText('Objekttyper och egna fält', { exact: true }).click();
    await memberPage
      .getByRole('button', { name: 'Ändra typ: Solcellsanläggning', exact: true })
      .click();
    await memberPage.getByLabel('Värdeslag', { exact: true }).selectOption('number');
    await memberPage.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await expect(memberPage.getByRole('alert')).toContainText('Skapa ett nytt fält');
    const kindChange = await post(
      'object-type',
      {
        version: 2,
        id: 'solar',
        baseRevision: 1,
        value: { ...value, fields: [{ ...field, kind: 'number' }] },
      },
      other.request,
    );
    expect(kindChange.status()).toBe(409);
    expect(await kindChange.json()).toEqual({ error: 'field_kind_in_use' });
    const renamed = {
      name: 'Solkraft',
      description: 'Ny förklaring',
      fields: [
        { ...field, name: 'Kommentar', description: 'Rättad förklaring' },
        { id: 'numeric-note', name: 'Anteckning', description: '', kind: 'number' },
      ],
    };
    expect(
      (
        await post(
          'object-type',
          { version: 2, id: 'solar', baseRevision: 1, value: renamed },
          other.request,
        )
      ).status(),
    ).toBe(200);
    expect(
      (await post('save', { version: 3, operationId: 'rename' }, other.request)).status(),
    ).toBe(200);
    const newer = await read();
    expect((await post('save', { version: 1, operationId: 'stale-object' })).status()).toBe(409);
    expect((await read()).objects).toEqual([]);
    expect((await read()).draft).toEqual(newer.draft);
    const historyBeforeReview = await (await page.request.get(`${path}/history`)).json();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(conflict).toContainText('Typdefinitionen har ändrats: Solkraft');
    await expect(conflict).toContainText('Objektet har ännu inte sparats i kartan');
    await expect(conflict.getByRole('region', { name: 'Sparat i kartan nu' })).not.toContainText(
      'Borttaget',
    );
    await expect(conflict).not.toContainText('Det föreslagna värdet måste vara ett tal');
    await expect(
      conflict.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect((await read()).draft).toEqual(newer.draft);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera Paneler', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Redigera Paneler', exact: true });
    await expect(form.getByLabel('Objekttyp', { exact: true })).toHaveValue('solar');
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(form.getByLabel('Kommentar', { exact: true })).toHaveValue('Privat värde');
    await expect(form.getByLabel('Anteckning', { exact: true })).toHaveValue('');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form).not.toBeVisible();
    const reviewed = await read();
    expect(reviewed.draft.version).toBe(newer.draft.version + 1);
    expect(newer.draft.changes[0].type).toMatchObject({ revision: 1, name: 'Solcellsanläggning' });
    expect(reviewed.draft.changes[0]).toMatchObject({
      before: null,
      after: { customValues: { note: 'Privat värde' } },
      type: { revision: 2, name: 'Solkraft' },
    });
    expect(reviewed.draft.changes[0].after.customValues).not.toHaveProperty('numeric-note');
    expect(reviewed.objects).toEqual([]);
    expect(await (await page.request.get(`${path}/history`)).json()).toEqual(historyBeforeReview);
    await expect(
      page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }),
    ).toHaveCount(0);
    await saveReviewedConflictDraft(page);
    const saved = await read();
    expect(saved.objects[0].customValues).toEqual({ note: 'Privat värde' });
    expect(saved.types.find((type: { id: string }) => type.id === 'solar')).toMatchObject(renamed);
    await installation.restart();
    expect((await read()).objects[0].customValues).toEqual({ note: 'Privat värde' });
    await memberPage.goto(installation.origin);
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const memberForm = memberPage.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await memberForm.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Solkraft' });
    await memberForm.getByLabel('Namn', { exact: true }).fill('Medlemmens paneler');
    await memberForm.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await memberForm.getByLabel('Kommentar', { exact: true }).fill('Eget objekt');
    await expect(memberForm.getByLabel('Anteckning', { exact: true })).toHaveValue('');
    await memberForm
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await saveReviewedConflictDraft(memberPage);
    await memberPage.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await memberForm.getByLabel('Namn', { exact: true }).fill('Lo');
    await memberForm.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
    await memberForm
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await saveReviewedConflictDraft(memberPage);
    await memberPage.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await openSettings(memberPage);
    await memberPage.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await memberPage.getByText('Objekttyper och egna fält', { exact: true }).click();
    await memberPage.getByRole('button', { name: 'Ändra typ: Person', exact: true }).click();
    await memberPage.getByLabel('Typens namn').fill('Människa');
    await memberPage.getByLabel('Typens beskrivning').fill('En person i kartan');
    await memberPage.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await memberPage.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await saveReviewedConflictDraft(memberPage);
    await memberPage.reload();
    const closeText = memberPage.getByRole('button', { name: 'Stäng textvyn', exact: true });
    if (await closeText.isVisible()) await closeText.click();
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await expect(
      memberForm
        .getByLabel('Objekttyp', { exact: true })
        .getByRole('option', { name: 'Människa', exact: true }),
    ).toHaveCount(1);
  } finally {
    await other.close();
    await installation.close();
  }
});

test('TYP-04: concurrent definition changes reject the whole draft until an explicit current choice', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    installation.setIdentity({
      subject: 'other-google',
      name: 'Kim Exempel',
      email: 'kim@example.test',
    });
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await other.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    const read = async (client = page.request) => (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const type = (await read()).types[0];
    const value = { name: 'Människor', description: 'Mitt förslag', fields: [] };
    const independentField = { id: 'alias', name: 'Smeknamn', description: '', kind: 'text' };
    expect(
      (await post('object-type', { version: 0, id: type.id, baseRevision: 1, value })).status(),
    ).toBe(200);
    expect(
      (
        await post('draft', {
          version: 1,
          id: 'alex',
          baseRevision: null,
          value: { typeId: type.id, name: 'Alex', description: '' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(
          'object-type',
          {
            version: 0,
            id: type.id,
            baseRevision: 1,
            value: {
              ...value,
              name: 'Personer',
              description: 'Annans rättelse',
              fields: [independentField],
            },
          },
          other.request,
        )
      ).status(),
    ).toBe(200);
    expect(
      (await post('save', { version: 1, operationId: 'other-definition' }, other.request)).status(),
    ).toBe(200);
    const before = await read();
    expect((await post('save', { version: 2, operationId: 'blocked-definition' })).status()).toBe(
      409,
    );
    expect((await read()).objects).toEqual([]);
    expect((await read()).draft).toEqual(before.draft);
    await page.goto(installation.origin);
    await openTable(page);
    await applyProposedConflictChanges(page, 'Annans rättelse');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    const after = await read();
    expect(after.types.find((item: { id: string }) => item.id === type.id)).toMatchObject({
      name: 'Människor',
      description: 'Mitt förslag',
      fields: [independentField],
      revision: 3,
    });
    expect(after.objects).toHaveLength(1);
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Alex');
    await page.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(page.getByLabel('Smeknamn', { exact: true })).toHaveValue('');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(2);
    expect(history[0].objectTypes[0].before).toMatchObject({
      name: 'Personer',
      description: 'Annans rättelse',
      fields: [independentField],
      revision: 2,
    });
    expect(history[0].changes[0].type).toMatchObject({
      name: 'Människor',
      revision: 3,
      fields: [independentField],
    });
  } finally {
    await other.close();
    await installation.close();
  }
});

test('TYP-05: invalid values and newly used field kinds preserve the entire draft and map', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    installation.setIdentity({
      subject: 'other-google',
      name: 'Kim Exempel',
      email: 'kim@example.test',
    });
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await other.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    const read = async (client = page.request) => (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const fields = [
      { id: 'power', name: 'Effekt', description: '', kind: 'number' },
      { id: 'date', name: 'Datum', description: '', kind: 'date' },
    ];
    expect(
      (
        await post('object-type', {
          version: 0,
          id: 'solar',
          baseRevision: null,
          value: { name: 'Solkraft', description: '', fields },
        })
      ).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'type' })).status()).toBe(200);
    expect(
      (
        await post('object-type', {
          version: 2,
          id: 'solar',
          baseRevision: 1,
          value: {
            name: 'Solkraft',
            description: '',
            fields: [{ ...fields[0], kind: 'text' }, fields[1]],
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('draft', {
          version: 3,
          id: 'independent',
          baseRevision: null,
          value: { typeId: (await read()).types[0].id, name: 'Oberoende förslag', description: '' },
        })
      ).status(),
    ).toBe(200);
    const unchanged = await read();
    expect(
      (
        await post('draft', {
          version: 4,
          id: 'invalid',
          baseRevision: null,
          value: {
            typeId: 'solar',
            name: 'Ogiltigt datum',
            description: '',
            customValues: { date: '2026-02-30' },
          },
        })
      ).status(),
    ).toBe(400);
    expect(await read()).toEqual(unchanged);
    expect(
      (
        await post(
          'draft',
          {
            version: 0,
            id: 'private',
            baseRevision: null,
            value: {
              typeId: 'solar',
              name: 'Hemligt förslag',
              description: '',
              customValues: { power: 12 },
            },
          },
          other.request,
        )
      ).status(),
    ).toBe(200);
    await page.goto(installation.origin);
    await openTable(page);
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    const rejected = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(rejected).toContainText('Skapa ett nytt fält');
    await expect(rejected).not.toContainText('Hemligt');
    expect((await read()).objects).toEqual([]);
    expect((await read()).draft).toEqual(unchanged.draft);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(1);
    expect((await read()).types.find((type: { id: string }) => type.id === 'solar').fields).toEqual(
      fields,
    );
    await page.keyboard.press('Escape');
    await expect(rejected).not.toBeVisible();
    await expect(draft).toContainText('Oberoende förslag');
    await expect(draft).toContainText('Solkraft');
  } finally {
    await other.close();
    await installation.close();
  }
});
