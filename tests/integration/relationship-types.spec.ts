import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openTable,
  signIn,
} from '../support/client.js';
import {
  applyProposedConflictChanges,
  conflictCollaborators,
} from '../support/conflict-properties.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  openObjectRelationships,
  openTypeDefinitions,
  readDraftProposal,
} from '../support/domain-work.js';
import { addFreeProperty, openTypes } from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('STY-01: type definition and free relationship properties save together durably', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async () => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openTypes(page);
    await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    const submit = page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' });
    for (const [label, value] of [
      ['Sambandstypens namn', 'Förvaring'],
      ['Benämning från startobjektet', 'förvaras i'],
      ['Benämning från målobjektet', 'innehåller'],
    ]) {
      await submit.click();
      await expect(page.getByLabel(label, { exact: true })).toBeFocused();
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByLabel('Sambandstypens beskrivning').fill('Var hushållets saker finns');
    await submit.click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    for (const [name, type] of [
      ['Alex blå cykel', 'Fordon'],
      ['Garaget', 'Bostad'],
    ]) {
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await form.getByLabel('Namn', { exact: true }).fill(name);
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: type });
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    }
    const dialog = await openObjectRelationships(page, 'Alex blå cykel');
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
    const garageId = (await read()).draft.changes.find(
      (change: { id: string; after: { name: string } }) => change.after.name === 'Garaget',
    ).id;
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption(garageId);
    await addFreeProperty(dialog, 'Anteckning', 'text', 'Låst skåp');
    await stageRelationshipAndClose(page);
    const proposed = await read();
    const properties = proposed.draft.relationships[0].after.properties;
    await installation.restart();
    await page.reload();
    expect((await read()).draft).toEqual(proposed.draft);
    const proposal = await readDraftProposal(page, 'Alex blå cykel → förvaras i → Garaget');
    await expect(proposal).toContainText('Låst skåp');
    await closeSupportDialog(page, 'Alex blå cykel → förvaras i → Garaget');
    const saved = await saveReviewedConflictDraft(page);
    const { receipt } = await saved.json();
    expect(receipt.relationshipTypes).toHaveLength(1);
    expect(receipt.relationships[0].after.properties).toEqual(properties);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    expect((await read()).relationships[0].properties).toEqual(properties);
    await expect(await openObjectRelationships(page, 'Alex blå cykel')).toContainText('Låst skåp');
  } finally {
    await installation.close();
  }
});

test('STY-03: members edit shared relationship definitions while private type proposals remain private', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request, [
    ['shared', 'Gemensamt objekt'],
  ]);
  try {
    const type = (await app.read()).relationshipTypes[0];
    const member = await other.newPage();
    await member.goto(app.installation.origin);
    await openTypes(member);
    await member.getByText('Sambandstyper och riktning', { exact: true }).click();
    await member
      .getByRole('button', { name: `Ändra sambandstyp: ${type.name}`, exact: true })
      .click();
    await member.getByLabel('Sambandstypens beskrivning').fill('Medlemmens förklaring');
    await member.getByLabel('Benämning från målobjektet', { exact: true }).fill('används av');
    const staged = member.waitForResponse(
      (response) =>
        response.url() === `${app.path}/relationship-type` &&
        response.request().method() === 'POST',
    );
    await member.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
    expect((await staged).status()).toBe(200);
    const privateTypes = (await app.read(other.request)).draft.relationshipTypes;
    expect(privateTypes).toHaveLength(1);
    expect(privateTypes?.[0]).toMatchObject({
      id: type.id,
      before: type,
      after: {
        name: type.name,
        description: 'Medlemmens förklaring',
        forwardLabel: type.forwardLabel ?? type.name,
        reverseLabel: 'används av',
      },
    });
    expect((await app.read()).draft.relationshipTypes ?? []).toEqual([]);
    expect(
      (await app.read()).relationshipTypes.find((item) => item.id === type.id)?.description,
    ).toBe(type.description);
    await member.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await saveReviewedConflictDraft(member);
    await page.goto(app.installation.origin);
    await openTypes(page);
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await page
      .getByRole('button', { name: `Ändra sambandstyp: ${type.name}`, exact: true })
      .click();
    await expect(page.getByLabel('Sambandstypens beskrivning')).toHaveValue(
      'Medlemmens förklaring',
    );
    await expect(page.getByLabel('Benämning från målobjektet', { exact: true })).toHaveValue(
      'används av',
    );
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('STY-04: stale definitions stop the whole save and explicit resolution preserves independent edits', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const member = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    installation.setIdentity({
      subject: 'member-google',
      name: 'Lo Exempel',
      email: 'lo@example.test',
    });
    await signIn(member.request, installation.origin);
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await member.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    const read = async () => (await page.request.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const value = {
      name: 'Förvaring',
      description: 'Förvaringsplats',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
    };
    expect(
      (
        await post('relationship-type', { version: 0, id: 'storage', baseRevision: null, value })
      ).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'type' })).status()).toBe(200);
    expect(
      (
        await post('relationship-type', {
          version: 2,
          id: 'storage',
          baseRevision: 1,
          value: { ...value, name: 'Plats', reverseLabel: 'har' },
        })
      ).status(),
    ).toBe(200);
    const initial = await read();
    expect(
      (
        await post('draft', {
          version: 3,
          id: 'bike',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Cykeln', properties: [] },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('draft', {
          version: 4,
          id: 'garage',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Garaget', properties: [] },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('relationship', {
          version: 5,
          id: 'storage-edge',
          baseRevision: null,
          value: { typeId: 'storage', sourceId: 'bike', targetId: 'garage' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(
          'relationship-type',
          {
            version: 0,
            id: 'storage',
            baseRevision: 1,
            value: { ...value, description: 'Los nya förklaring', reverseLabel: 'rymmer' },
          },
          member.request,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('save', { version: 1, operationId: 'member-definition' }, member.request)
      ).status(),
    ).toBe(200);
    const before = await read();
    expect((await post('save', { version: 6, operationId: 'stale-save' })).status()).toBe(409);
    expect((await read()).objects).toEqual([]);
    expect((await read()).draft).toEqual(before.draft);
    await page.goto(installation.origin);
    await openTable(page);
    await applyProposedConflictChanges(page, 'Los nya förklaring');
    const proposal = await readDraftProposal(page, 'Plats');
    await expect(proposal).toContainText('Los nya förklaring');
    await closeSupportDialog(page, 'Plats');
    expect((await read()).objects).toEqual([]);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    const current = await read();
    expect(
      current.relationshipTypes.find((type: { id: string }) => type.id === 'storage'),
    ).toMatchObject({
      name: 'Plats',
      description: 'Los nya förklaring',
      reverseLabel: 'har',
      revision: 3,
    });
    expect(current.relationships).toHaveLength(1);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history[0].relationshipTypes[0].before).toMatchObject({
      description: 'Los nya förklaring',
      reverseLabel: 'rymmer',
      revision: 2,
    });
    expect(history[0].relationships[0].type).toMatchObject({
      name: 'Plats',
      description: 'Los nya förklaring',
      reverseLabel: 'har',
      revision: 3,
    });
  } finally {
    await member.close();
    await installation.close();
  }
});

test('STY-02: forms show the same directed relationship from both objects and edit the shared definition', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    for (const [version, id, name] of [
      [0, 'bike', 'Alex blå cykel'],
      [1, 'garage', 'Garaget'],
    ] as const) {
      expect(
        (
          await post('draft', {
            version,
            id,
            baseRevision: null,
            value: { typeId: state.types[version].id, name, properties: [] },
          })
        ).status(),
      ).toBe(200);
    }
    await page.goto(installation.origin);
    await openTypeDefinitions(page);
    await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    await page.getByLabel('Sambandstypens namn').fill('Förvaring');
    await page.getByLabel('Sambandstypens beskrivning').fill('Var hushållets saker finns');
    await page.getByLabel('Benämning från startobjektet').fill('förvaras i');
    await page.getByLabel('Benämning från målobjektet').fill('innehåller');
    await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openObjectRelationships(page, 'Alex blå cykel');
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await expect(page.getByLabel('Sambandstyp', { exact: true })).toHaveValue('');
    await page.getByLabel('Från objekt', { exact: true }).selectOption('bike');
    await page.getByLabel('Till objekt', { exact: true }).selectOption('garage');
    await page
      .getByRole('dialog', { name: /^Samband för / })
      .getByRole('button', { name: 'Lägg i utkastet', exact: true })
      .click();
    expect((await (await page.request.get(path)).json()).draft.relationships).toBeUndefined();
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
    await stageRelationshipAndClose(page);
    const definition = await readDraftProposal(page, 'Förvaring');
    await expect(
      definition
        .locator('dt')
        .filter({ hasText: /^Omvänd riktning/ })
        .locator('..'),
    ).toContainText('innehåller');
    await closeSupportDialog(page, 'Förvaring');
    const review = await openDraftReview(page);
    await expect(review).toContainText('Alex blå cykel → förvaras i → Garaget');
    await closeTextView(page);
    await openObjectRelationships(page, 'Alex blå cykel');
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await page.getByLabel('Från objekt', { exact: true }).selectOption('bike');
    await page.getByLabel('Till objekt', { exact: true }).selectOption('garage');
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
    const duplicate = page.getByRole('dialog', { name: /^Samband för / });
    await duplicate.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(duplicate.getByRole('alert')).toContainText('Sambandet finns redan');
    await expect(
      duplicate.getByRole('region', { name: 'Sambandet före inskickning', exact: true }),
    ).toContainText('Alex blå cykel förvaras i Garaget');
    await duplicate.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true })
      .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
      .click();
    await duplicate.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    expect((await (await page.request.get(path)).json()).relationshipTypes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Förvaring' })]),
    );
    const originalRelationship = (await (await page.request.get(path)).json()).relationships[0];
    await page.reload();
    await openTable(page);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex blå cykel', exact: true }).click();
    const relationships = page.getByRole('dialog', { name: /^Samband för / });
    await expect(relationships).toContainText('Alex blå cykel → förvaras i → Garaget');
    await closeSupportDialog(page, 'Samband för Alex blå cykel');
    await page.getByRole('button', { name: 'Samband för Garaget', exact: true }).click();
    await expect(relationships).toContainText('Garaget → innehåller → Alex blå cykel');
    await relationships.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await expect(page.getByLabel('Från objekt', { exact: true })).toHaveValue('bike');
    await expect(page.getByLabel('Till objekt', { exact: true })).toHaveValue('garage');
    await relationships.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
    await closeSupportDialog(page, 'Samband för Garaget');
    await openTypeDefinitions(page);
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }).click();
    await page.getByLabel('Sambandstypens namn').fill('Plats');
    await page.getByLabel('Sambandstypens beskrivning').fill('Hushållets förvaringsplatser');
    await page.getByLabel('Benämning från startobjektet').fill('finns i');
    await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    const changedDefinition = await readDraftProposal(page, 'Plats');
    await expect(changedDefinition).toContainText('Var hushållets saker finns');
    await expect(changedDefinition).toContainText('Hushållets förvaringsplatser');
    await closeSupportDialog(page, 'Plats');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await expect(await openObjectRelationships(page, 'Alex blå cykel')).toContainText(
      'Alex blå cykel → finns i → Garaget',
    );
    const saved = await (await page.request.get(path)).json();
    expect(saved.relationships).toHaveLength(1);
    expect(saved.relationships[0]).toMatchObject({
      id: originalRelationship.id,
      sourceId: 'bike',
      targetId: 'garage',
      revision: 1,
    });
  } finally {
    await installation.close();
  }
});

test('STY-05: duplicate adds, edits and concurrent saves preserve identity and reject every partial write', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const member = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    installation.setIdentity({
      subject: 'member-google',
      name: 'Lo Exempel',
      email: 'lo@example.test',
    });
    await signIn(member.request, installation.origin);
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await member.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    const read = async (client = page.request) => (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const value = {
      name: 'Förvaring',
      description: 'Förvaringsplats',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
    };
    const propose = async (
      route: string,
      id: string,
      value: unknown,
      baseRevision: number | null = null,
      client = page.request,
    ) =>
      post(route, { id, value, baseRevision, version: (await read(client)).draft.version }, client);
    const save = async (operationId: string, client = page.request) =>
      post('save', { operationId, version: (await read(client)).draft.version }, client);
    expect((await propose('relationship-type', 'storage', value)).status()).toBe(200);
    expect(
      (await propose('relationship-type', 'other', { ...value, name: 'Annan betydelse' })).status(),
    ).toBe(200);
    const typeId = (await read()).types[0].id;
    for (const id of ['bike', 'garage', 'shed'])
      expect((await propose('draft', id, { typeId, name: id, properties: [] })).status()).toBe(200);
    const edge = { typeId: 'storage', sourceId: 'bike', targetId: 'garage' };
    expect((await propose('relationship', 'first', edge)).status()).toBe(200);
    expect((await propose('relationship', 'second', { ...edge, typeId: 'other' })).status()).toBe(
      200,
    );
    expect((await save('initial')).status()).toBe(200);
    const repeated = await propose('relationship', 'repeated', edge);
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).existingId).toBe('first');
    const untouched = await read();
    const duplicateEdit = await propose('relationship', 'second', edge, 1);
    expect(duplicateEdit.status()).toBe(409);
    expect(await duplicateEdit.json()).toEqual({ error: 'duplicate_relationship' });
    expect(await read()).toEqual(untouched);
    expect(
      (
        await propose(
          'relationship',
          'second',
          {
            ...edge,
            sourceId: 'garage',
            targetId: 'bike',
            lifecycle: 'ended',
          },
          1,
        )
      ).status(),
    ).toBe(200);
    expect((await save('reverse')).status()).toBe(200);
    expect((await read()).relationships).toHaveLength(2);
    expect(
      (await read()).relationships.find((item: { id: string }) => item.id === 'second'),
    ).toMatchObject({
      sourceId: 'garage',
      targetId: 'bike',
      typeId: 'storage',
      lifecycle: 'ended',
    });
    const concurrent = { ...edge, targetId: 'shed' };
    expect(
      (
        await propose('relationship-type', 'storage', { ...value, name: 'Mitt nya namn' }, 1)
      ).status(),
    ).toBe(200);
    expect((await propose('relationship', 'mine', concurrent)).status()).toBe(200);
    expect(
      (
        await propose('draft', 'unrelated', {
          typeId,
          name: 'Privat följeslagare',
          properties: [],
        })
      ).status(),
    ).toBe(200);
    expect(
      (await propose('relationship', 'theirs', concurrent, null, member.request)).status(),
    ).toBe(200);
    expect((await save('winner', member.request)).status()).toBe(200);
    const before = await read();
    expect((await save('loser')).status()).toBe(409);
    expect(await read()).toEqual(before);
    expect(
      (await read()).relationshipTypes.find((type: { id: string }) => type.id === 'storage').name,
    ).toBe('Förvaring');
    expect((await read()).objects.some((object: { id: string }) => object.id === 'unrelated')).toBe(
      false,
    );
    await page.goto(installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(conflict).toContainText(
      'Ett sparat samband har redan samma typ, riktning och objekt.',
    );
    await expect(
      conflict.getByRole('region', { name: 'Ditt förslag' }).getByRole('button'),
    ).toHaveCount(0);
    await expect(
      conflict.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await read()).toEqual(before);
    const priorHistory = await (await page.request.get(`${path}/history`)).json();
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await conflict
      .getByRole('button', { name: 'Ta bort sambandet ur ditt utkast', exact: true })
      .click();
    await expect(conflict.getByRole('status')).toContainText(
      'Förslaget har tagits bort ur ditt utkast',
    );
    const resolved = await read();
    expect(resolved.draft.changes).toEqual(before.draft.changes);
    expect(resolved.draft.relationshipTypes).toEqual(before.draft.relationshipTypes);
    expect(resolved.draft.relationships ?? []).toEqual([]);
    expect(resolved.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${path}/history`)).json()).toEqual(priorHistory);
    await saveReviewedConflictDraft(page);
    const current = await read();
    expect(current.relationships).toHaveLength(3);
    expect(
      current.relationships.find((item: { id: string }) => item.id === 'second'),
    ).toMatchObject({
      lifecycle: 'ended',
    });
    expect(current.relationships.some((item: { id: string }) => item.id === 'mine')).toBe(false);
    expect(current.relationships.some((item: { id: string }) => item.id === 'theirs')).toBe(true);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(4);
    const reversed = history.find(
      (receipt: { operationId: string }) => receipt.operationId === 'reverse',
    );
    expect(reversed.relationships[0].before).toMatchObject({
      id: 'second',
      typeId: 'other',
      sourceId: 'bike',
      targetId: 'garage',
    });
    expect(reversed.relationships[0].after).toMatchObject({
      id: 'second',
      typeId: 'storage',
      sourceId: 'garage',
      targetId: 'bike',
      lifecycle: 'ended',
    });
  } finally {
    await member.close();
    await installation.close();
  }
});
