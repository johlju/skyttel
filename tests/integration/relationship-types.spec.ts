import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openTable,
  signIn,
} from '../support/client.js';
import { applyProposedConflictChanges } from '../support/conflict-properties.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  editObjectRelationship,
  openObjectRelationships,
  openTypeDefinitions,
  readDraftProposal,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('STY-01: native type and field forms share a durable directed relationship save', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async () => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openTypeDefinitions(page);
    await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    const submit = page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' });
    for (const [label, value] of [
      ['Sambandstypens namn', 'Förvaring'],
      ['Benämning från startobjektet', 'förvaras i'],
      ['Benämning från målobjektet', 'innehåller'],
    ]) {
      await submit.click();
      await expect(page.getByLabel(label, { exact: true })).toBeFocused();
      expect((await read()).draft.relationshipTypes ?? []).toEqual([]);
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByLabel('Sambandstypens beskrivning').fill('Var hushållets saker finns');
    await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
    await submit.click();
    await expect(page.getByLabel('Fältets namn', { exact: true })).toBeFocused();
    expect((await read()).draft.relationshipTypes ?? []).toEqual([]);
    await page.getByLabel('Fältets namn', { exact: true }).fill('Anteckning');
    await page.getByLabel('Värdeslag', { exact: true }).selectOption('text');
    await submit.click();
    await expect(
      page.getByRole('status', { name: 'Hushållsarbetets status', exact: true }),
    ).toContainText('Förslaget finns i ditt privata utkast');
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
      await expect(form).not.toBeVisible();
    }
    const relationships = await openObjectRelationships(page, 'Alex blå cykel');
    await relationships.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
    const garageId = (await read()).draft.changes.find(
      (change: { id: string; after: { name: string } }) => change.after.name === 'Garaget',
    ).id;
    await page.getByLabel('Till objekt', { exact: true }).selectOption(garageId);
    await page.getByLabel('Anteckning', { exact: true }).fill('Låst skåp');
    await stageRelationshipAndClose(page);
    const proposed = await read();
    expect(proposed.draft.relationshipTypes).toHaveLength(1);
    expect(proposed.draft.changes).toHaveLength(2);
    expect(proposed.draft.relationships).toHaveLength(1);
    const definition = proposed.draft.relationshipTypes[0];
    expect(definition.before).toBeNull();
    expect(definition.after).toMatchObject({
      id: definition.id,
      householdId: household.id,
      revision: 1,
      name: 'Förvaring',
      description: 'Var hushållets saker finns',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
      fields: [{ name: 'Anteckning', description: '', kind: 'text' }],
    });
    const bike = proposed.draft.changes.find(
      (change: { after: { name: string } }) => change.after.name === 'Alex blå cykel',
    );
    for (const [index, name, typeName] of [
      [0, 'Alex blå cykel', 'Fordon'],
      [1, 'Garaget', 'Bostad'],
    ] as const) {
      expect(proposed.draft.changes[index].before).toBeNull();
      expect(proposed.draft.changes[index].after).toMatchObject({
        name,
        typeId: proposed.types.find((type: { name: string }) => type.name === typeName).id,
        description: '',
      });
    }
    const value = {
      typeId: definition.id,
      sourceId: bike.id,
      targetId: garageId,
      knowledge: 'known',
      customValues: { [definition.after.fields[0].id]: 'Låst skåp' },
    };
    expect(proposed.draft.relationships[0].after).toEqual(value);
    expect(
      proposed.relationshipTypes.some((type: { id: string }) => type.id === definition.id),
    ).toBe(false);
    expect(proposed.objects).toEqual([]);
    expect(proposed.relationships).toEqual([]);
    await installation.restart();
    await page.reload();
    expect((await read()).draft).toEqual(proposed.draft);
    expect(
      (await read()).relationshipTypes.some((type: { id: string }) => type.id === definition.id),
    ).toBe(false);
    expect((await read()).objects).toEqual([]);
    expect((await read()).relationships).toEqual([]);
    const proposal = await readDraftProposal(page, 'Alex blå cykel → förvaras i → Garaget');
    await expect(proposal).toContainText('Låst skåp');
    await closeSupportDialog(page, 'Alex blå cykel → förvaras i → Garaget');
    const saved = await saveReviewedConflictDraft(page);
    expect(saved.status()).toBe(200);
    const saveRequest = saved.request().postDataJSON();
    const { receipt } = await saved.json();
    expect(receipt.relationshipTypes).toEqual([
      { id: definition.id, before: null, after: { ...definition.after, revision: 1 } },
    ]);
    expect(receipt.changes).toHaveLength(2);
    for (const [index, change] of proposed.draft.changes.entries()) {
      expect(receipt.changes[index].before).toBeNull();
      expect(receipt.changes[index].after).toEqual({
        ...change.after,
        id: change.id,
        householdId: household.id,
        revision: 1,
      });
      expect(receipt.changes[index].type).toEqual(change.type);
    }
    expect(receipt.relationships).toHaveLength(1);
    expect(receipt.relationships[0].before).toBeNull();
    expect(receipt.relationships[0].after).toEqual({
      ...value,
      id: proposed.draft.relationships[0].id,
      householdId: household.id,
      revision: 1,
    });
    expect(receipt.relationships[0].type).toEqual(receipt.relationshipTypes[0].after);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const current = await read();
    expect(
      current.relationshipTypes.find((type: { id: string }) => type.id === definition.id),
    ).toEqual(receipt.relationshipTypes[0].after);
    expect(current.objects).toEqual(
      receipt.changes.map((change: { after: unknown }) => change.after),
    );
    expect(current.relationships).toEqual([receipt.relationships[0].after]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    const replay = await page.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: saveRequest,
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ receipt });
    expect(await read()).toEqual(current);
    expect(current.relationships).toHaveLength(1);
    expect(current.relationships[0].id).toBe(proposed.draft.relationships[0].id);
    expect(current.relationships[0].customValues).toEqual(
      proposed.draft.relationships[0].after.customValues,
    );
    await expect(await openObjectRelationships(page, 'Alex blå cykel')).toContainText(
      'Alex blå cykel → förvaras i → Garaget',
    );
    await closeSupportDialog(page, 'Samband för Alex blå cykel');
    await expect(await openObjectRelationships(page, 'Garaget')).toContainText(
      'Garaget → innehåller → Alex blå cykel',
    );
    await closeSupportDialog(page, 'Samband för Garaget');
    await editObjectRelationship(page, 'Alex blå cykel', 'Alex blå cykel → förvaras i → Garaget');
    await expect(page.getByLabel('Anteckning', { exact: true })).toHaveValue('Låst skåp');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toEqual([receipt]);
    expect(history).toHaveLength(1);
    expect(history[0].relationshipTypes[0].after.name).toBe('Förvaring');
    expect(history[0].relationships[0].type.id).toBe(current.relationships[0].typeId);
  } finally {
    await installation.close();
  }
});

test('STY-03: members share editable prefills while private definitions and household boundaries stay protected', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const member = await createPreparedContext(browser);
  const stranger = await createPreparedContext(browser);
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
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await openTypeDefinitions(memberPage);
    await memberPage.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    const fillDefinition = async (name: string) => {
      await memberPage.getByLabel('Sambandstypens namn').fill(name);
      await memberPage.getByLabel('Sambandstypens beskrivning').fill(value.description);
      await memberPage.getByLabel('Benämning från startobjektet').fill(value.forwardLabel);
      await memberPage.getByLabel('Benämning från målobjektet').fill(value.reverseLabel);
      const response = memberPage.waitForResponse(
        (response) =>
          response.url() === `${path}/relationship-type` && response.request().method() === 'POST',
      );
      await memberPage.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
      expect((await response).status()).toBe(200);
      await expect(
        memberPage.getByRole('status', { name: 'Hushållsarbetets status', exact: true }),
      ).toContainText('Förslaget finns i ditt privata utkast');
    };
    await fillDefinition(value.name);
    const storageId = (await read(member.request)).draft.relationshipTypes[0].id;
    expect((await read()).draft).toEqual({ version: 0, changes: [] });
    expect(JSON.stringify(await read())).not.toContain('Förvaringsplats');
    await page.goto(installation.origin);
    await openTypeDefinitions(page);
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }),
    ).toHaveCount(0);
    await memberPage.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    const privateDefinition = await readDraftProposal(memberPage, 'Förvaring');
    await expect(privateDefinition).toContainText('Förvaringsplats');
    await closeSupportDialog(memberPage, 'Förvaring');
    let saved = memberPage.waitForResponse(
      (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
    );
    await saveReviewedConflictDraft(memberPage);
    expect((await saved).status()).toBe(200);
    await closeTextView(memberPage);
    const state = await read();
    expect(
      state.relationshipTypes.find((type: { id: string }) => type.id === storageId),
    ).toMatchObject(value);
    await page.reload();
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }),
    ).toBeVisible();
    const prefill = state.relationshipTypes.find((type: { id: string }) => type.id !== storageId);
    await openTypeDefinitions(memberPage);
    await memberPage.getByText('Sambandstyper och riktning', { exact: true }).click();
    await memberPage
      .getByRole('button', { name: `Ändra sambandstyp: ${prefill.name}`, exact: true })
      .click();
    await fillDefinition('Redigerad förifylld typ');
    await memberPage.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    saved = memberPage.waitForResponse(
      (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
    );
    await saveReviewedConflictDraft(memberPage);
    expect((await saved).status()).toBe(200);
    await closeTextView(memberPage);
    // A relationship starts from an independently created household object.
    expect(
      (
        await post(
          'draft',
          {
            version: (await read(member.request)).draft.version,
            id: 'member-object',
            baseRevision: null,
            value: { typeId: state.types[0].id, name: 'Medlemmens cykel', description: '' },
          },
          member.request,
        )
      ).status(),
    ).toBe(200);
    await memberPage.reload();
    await openObjectRelationships(memberPage, 'Medlemmens cykel');
    await memberPage.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await expect(
      memberPage
        .getByLabel('Sambandstyp', { exact: true })
        .getByRole('option', { name: 'Redigerad förifylld typ', exact: true }),
    ).toHaveCount(1);
    await memberPage
      .getByRole('dialog', { name: /^Samband för / })
      .getByRole('button', { name: 'Stäng dialogen', exact: true })
      .click();
    // Equal names still create separate definitions with their own identities.
    await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    await page.getByLabel('Sambandstypens namn').fill(value.name);
    await page.getByLabel('Sambandstypens beskrivning').fill(value.description);
    await page.getByLabel('Benämning från startobjektet').fill(value.forwardLabel);
    await page.getByLabel('Benämning från målobjektet').fill(value.reverseLabel);
    const staged = page.waitForResponse(
      (response) =>
        response.url() === `${path}/relationship-type` && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
    expect((await staged).status()).toBe(200);
    await expect(
      page.getByRole('status', { name: 'Hushållsarbetets status', exact: true }),
    ).toContainText('Förslaget finns i ditt privata utkast');
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    const sameNameSaved = page.waitForResponse(
      (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
    );
    await saveReviewedConflictDraft(page);
    expect((await sameNameSaved).status()).toBe(200);
    await closeTextView(page);
    await openTypeDefinitions(page);
    if (
      (await page
        .getByText('Sambandstyper och riktning', { exact: true })
        .locator('..')
        .getAttribute('open')) === null
    )
      await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }),
    ).toHaveCount(2);
    expect(
      (await read()).relationshipTypes.filter(
        (type: { name: string }) => type.name === 'Förvaring',
      ),
    ).toHaveLength(2);
    const unchanged = await read();
    for (const invalid of [
      { ...value, forwardLabel: '' },
      { ...value, reverseLabel: '' },
      { ...value, fields: null },
      { ...value, name: '' },
    ]) {
      expect(
        (
          await post('relationship-type', {
            version: 2,
            id: 'invalid',
            baseRevision: null,
            value: invalid,
          })
        ).status(),
      ).toBe(400);
    }
    expect(await read()).toEqual(unchanged);
    installation.setIdentity({
      subject: 'stranger-google',
      name: 'Kim Exempel',
      email: 'kim@example.test',
    });
    await signIn(stranger.request, installation.origin);
    expect(
      (
        await post(
          'relationship-type',
          { version: 0, id: 'intruder', baseRevision: null, value },
          stranger.request,
        )
      ).status(),
    ).toBe(403);
    expect((await stranger.request.get(path)).status()).toBe(403);
  } finally {
    await member.close();
    await stranger.close();
    await installation.close();
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
          value: { typeId: initial.types[0].id, name: 'Cykeln', description: '' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('draft', {
          version: 4,
          id: 'garage',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Garaget', description: '' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post('relationship', {
          version: 5,
          id: 'storage-edge',
          baseRevision: null,
          value: { typeId: 'storage', sourceId: 'bike', targetId: 'garage', knowledge: 'known' },
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
            value: { typeId: state.types[version].id, name, description: '' },
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
    await page.getByLabel('Från objekt').selectOption('bike');
    await page.getByLabel('Till objekt').selectOption('garage');
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
    await page.getByLabel('Från objekt').selectOption('bike');
    await page.getByLabel('Till objekt').selectOption('garage');
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
    await expect(page.getByLabel('Från objekt')).toHaveValue('bike');
    await expect(page.getByLabel('Till objekt')).toHaveValue('garage');
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
      expect((await propose('draft', id, { typeId, name: id, description: '' })).status()).toBe(
        200,
      );
    const edge = { typeId: 'storage', sourceId: 'bike', targetId: 'garage', knowledge: 'known' };
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
            endDate: { knowledge: 'known', value: '2020-01-01' },
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
      endDate: { knowledge: 'known', value: '2020-01-01' },
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
          description: '',
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
      endDate: { knowledge: 'known', value: '2020-01-01' },
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
      endDate: { knowledge: 'known', value: '2020-01-01' },
    });
  } finally {
    await member.close();
    await installation.close();
  }
});
