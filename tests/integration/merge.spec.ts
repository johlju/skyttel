import { type APIRequestContext, expect, type Locator, test } from '@playwright/test';
import type { MapState, ObjectValue, SaveReceipt } from '../../src/shared/map.js';
import {
  activatePanel,
  createHousehold,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('SAMMANSLAGNING-01: explicit identities and edge choices survive restart, lost receipt and whole-save undo', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const object = async (id: string, name: string, description: string) => {
      const state = await read();
      expect(
        (
          await post('draft', {
            version: state.draft.version,
            id,
            baseRevision: state.objects.find((item) => item.id === id)?.revision ?? null,
            value: { typeId: state.types[0].id, name, description },
          })
        ).ok(),
      ).toBe(true);
    };
    const save = async (operationId: string) => {
      const response = await post('save', { version: (await read()).draft.version, operationId });
      expect(response.ok()).toBe(true);
      return (await response.json()).receipt as SaveReceipt;
    };
    await object('a', 'Lo Exempel', 'Första uppgiften');
    await object('b', 'Lo Exempel', 'Andra uppgiften');
    await object('card', 'Blått kort', '');
    for (const [id, sourceId] of [
      ['first', 'a'],
      ['second', 'b'],
    ]) {
      const state = await read();
      expect(
        (
          await post('relationship', {
            version: state.draft.version,
            id,
            baseRevision: null,
            value: {
              typeId: state.relationshipTypes[0].id,
              sourceId,
              targetId: 'card',
              knowledge: 'known',
              ...(id === 'second' ? { lifecycle: 'ended' } : {}),
            },
          })
        ).ok(),
      ).toBe(true);
    }
    await save('initial');
    await object('independent', 'Robin Exempel', 'Eget förslag');
    await page.goto(installation.origin);
    await openWorkspace(page);
    const open = async (confirmed: boolean) => {
      await page.getByRole('button', { name: 'Slå samman objekt', exact: true }).click();
      const form = page.getByRole('region', { name: 'Sammanslagning', exact: true });
      await form.getByLabel('Objekt som behåller sin identitet').selectOption('a');
      await form.getByLabel('Objekt som tas in i det första').selectOption('b');
      await expect(form).toContainText('Identitet: a');
      await expect(form).toContainText('Identitet: b');
      await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
      await form.getByLabel('Val för samband first').selectOption('keep');
      await form.getByLabel('Val för samband second').selectOption('keep');
      if (confirmed)
        await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
      return form;
    };
    let form = await open(false);
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    await expect(page.getByRole('alert')).toContainText('Samma samband finns redan');
    expect((await read()).draft.changes.map((item) => item.id)).toEqual(['independent']);
    await form.getByLabel('Val för samband first').selectOption('remove');
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Identiteten är inte bekräftad');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    expect((await read()).objects).toHaveLength(3);
    await draft.getByRole('button', { name: 'Kasta sammanslagningen för att rätta' }).click();
    await expect(draft).toContainText('Robin Exempel');
    form = await open(true);
    await form.getByLabel('Val för samband first').selectOption('remove');
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    await expect(draft).toContainText('Samma företeelse är uttryckligen bekräftad');
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    await expect(draft).toContainText('Andra uppgiften');
    let dropped = false;
    await page.route('**/map/save', async (route) => {
      if (!dropped) {
        dropped = true;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect
      .poll(async () => (await read()).objects.some((item) => item.id === 'b'))
      .toBe(false);
    await page.unroute('**/map/save');
    await page.reload();
    await openWorkspace(page);
    await expect(page.getByRole('region', { name: 'Mina sparförsök' })).toContainText('Genomfört');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(2);
    const merged = history[1] as SaveReceipt;
    await object('a', 'Senare namn', 'Andra uppgiften');
    await save('later');
    await object('private', 'Eget senare objekt', '');
    await installation.restart();
    const context = await browser.newContext({ storageState: await page.context().storageState() });
    try {
      const other = await context.newPage();
      await other.goto(installation.origin);
      await openWorkspace(other);
      await other.getByRole('button', { name: 'Visa historik', exact: true }).click();
      const group = other
        .getByRole('region', { name: 'Ändringshistorik' })
        .getByRole('article')
        .filter({ hasText: `Sparande: ${merged.operationId}` });
      await group.getByText('Visa ändringarna', { exact: true }).click();
      await group.getByText('Granskade objekt före sammanslagningen', { exact: true }).click();
      await expect(group).toContainText('Sammanslagning: identitet b tas in i a');
      await expect(group).toContainText('Manuellt upphört');
      await expect(
        group.getByText('Sammanslagning: identitet b tas in i a', { exact: false }),
      ).toBeVisible();
      await expect(
        group.getByText('Status: Manuellt upphört', { exact: true }).first(),
      ).toBeVisible();
      await group.getByRole('button', { name: 'Ångra sparandet' }).click();
      await expect(other.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
        'Eget senare objekt',
      );
      await other.getByRole('button', { name: 'Spara hela utkastet' }).click();
      await expect(other.getByRole('status')).toContainText('Sparat');
    } finally {
      await context.close();
    }
    const restored = await read();
    expect(restored.objects.find((item) => item.id === 'a')).toMatchObject({
      name: 'Senare namn',
      description: 'Första uppgiften',
    });
    expect(restored.objects.find((item) => item.id === 'b')).toMatchObject({
      name: 'Lo Exempel',
      description: 'Andra uppgiften',
    });
    expect(restored.objects.some((item) => item.id === 'private')).toBe(true);
    expect(restored.objects.some((item) => item.id === 'independent')).toBe(false);
    expect(restored.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', sourceId: 'a', targetId: 'card' }),
        expect.objectContaining({
          id: 'second',
          sourceId: 'b',
          targetId: 'card',
          lifecycle: 'ended',
        }),
      ]),
    );
  } finally {
    await installation.close();
  }
});

async function focusedUncovered(target: Locator) {
  await expect(target).toBeFocused();
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.x >= 0 &&
          rect.y >= 0 &&
          rect.right <= innerWidth &&
          rect.bottom <= innerHeight &&
          (hit === element || element.contains(hit)) &&
          style.outlineStyle !== 'none' &&
          Number.parseFloat(style.outlineWidth) >= 2
        );
      }),
    )
    .toBe(true);
}

test('SAMMANSLAGNING-03: keyboard merge review survives panels and Settings with independent unsent work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, {
        headers: { origin: installation.origin },
        data,
      });
    for (const [id, name, description] of [
      ['a', 'Lo Exempel', 'Första uppgiften'],
      ['b', 'Lo Exempel', 'Andra uppgiften'],
      ['independent', 'Oberoende objekt', 'Sparad beskrivning'],
    ]) {
      const state = await read();
      expect(
        (
          await post('draft', {
            version: state.draft.version,
            id,
            baseRevision: null,
            value: { typeId: state.types[0].id, name, description },
          })
        ).status(),
      ).toBe(200);
    }
    expect(
      (
        await post('save', { version: (await read()).draft.version, operationId: 'initial' })
      ).status(),
    ).toBe(200);
    const original = await read();
    await page.goto(installation.origin);
    await openWorkspace(page);
    const launcher = page.getByRole('button', { name: 'Slå samman objekt', exact: true });
    await launcher.focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('region', { name: 'Sammanslagning', exact: true });
    await focusedUncovered(form.getByRole('heading', { name: 'Slå samman objekt', exact: true }));
    await form.getByLabel('Objekt som behåller sin identitet').selectOption('a');
    await form.getByLabel('Objekt som tas in i det första').selectOption('b');
    await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
    await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
    await page.getByRole('button', { name: 'Uppgifter för Oberoende objekt', exact: true }).click();
    const independent = page.getByRole('region', { name: 'Oberoende objekt', exact: true });
    await expect(independent).toContainText('Sparad beskrivning');
    await activatePanel(page, 'Lista och utkast');
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('absorbed');
    await expect(form.getByLabel('Jag bekräftar att objekten är samma företeelse')).toBeChecked();
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('absorbed');
    await expect(form.getByLabel('Jag bekräftar att objekten är samma företeelse')).toBeChecked();
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await openWorkspace(page);
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('absorbed');
    const cancel = form.getByRole('button', { name: 'Stäng sammanslagningen utan att skicka' });
    await cancel.focus();
    await page.keyboard.press('Enter');
    await expect(form).toHaveCount(0);
    await focusedUncovered(launcher);
    expect(await read()).toEqual(original);
    await activatePanel(page, 'Oberoende objekt');
    await independent.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await independent.getByLabel('Beskrivning', { exact: true }).fill('Oskickat arbete finns kvar');
    await expect(independent.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickat arbete finns kvar',
    );
    await activatePanel(page, 'Lista och utkast');
    await expect(launcher).toBeEnabled();
    await launcher.focus();
    await page.keyboard.press('Enter');
    await focusedUncovered(form.getByRole('heading', { name: 'Slå samman objekt', exact: true }));
    await form.getByLabel('Objekt som behåller sin identitet').selectOption('a');
    await form.getByLabel('Objekt som tas in i det första').selectOption('b');
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('');
    await expect(
      form.getByLabel('Jag bekräftar att objekten är samma företeelse'),
    ).not.toBeChecked();
    await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
    await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('absorbed');
    await expect(form.getByLabel('Jag bekräftar att objekten är samma företeelse')).toBeChecked();
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).focus();
    await page.keyboard.press('Enter');
    await focusedUncovered(page.getByRole('heading', { name: 'Hela mitt utkast', exact: true }));
    expect((await read()).objects).toEqual(original.objects);
    await expect(
      page.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    await activatePanel(page, 'Oberoende objekt');
    await expect(independent.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickat arbete finns kvar',
    );
    await independent.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const draft = await read();
    expect(draft.draft.changes).toHaveLength(3);
    expect(draft.objects).toEqual(original.objects);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    expect((await read()).objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', description: 'Andra uppgiften' }),
        expect.objectContaining({ id: 'independent', description: 'Oskickat arbete finns kvar' }),
      ]),
    );
    expect((await read()).objects).toHaveLength(2);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(2);
    expect(history.at(-1).changes).toHaveLength(3);
  } finally {
    await installation.close();
  }
});

test('SAMMANSLAGNING-02: refreshed source facts require new choices while independent changes preserve review', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (client = page.request): Promise<MapState> =>
      (await client.get(path)).json();
    const post = (client: APIRequestContext, route: string, data: unknown) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const object = async (client: APIRequestContext, id: string, value: Partial<ObjectValue>) => {
      const state = await read(client);
      const before = state.objects.find((item) => item.id === id);
      expect(
        (
          await post(client, 'draft', {
            version: state.draft.version,
            id,
            baseRevision: before?.revision ?? null,
            value: { typeId: state.types[0].id, name: id, description: '', ...before, ...value },
          })
        ).status(),
      ).toBe(200);
    };
    const save = async (client: APIRequestContext, operationId: string) => {
      expect(
        (
          await post(client, 'save', {
            version: (await read(client)).draft.version,
            operationId,
          })
        ).status(),
      ).toBe(200);
    };
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(
      `${installation.origin}/api/households/${household.id}/invitations`,
      { headers: { origin: installation.origin }, data: { userId: user.id } },
    );
    expect(invitation.status()).toBe(201);
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers: { origin: installation.origin },
          data: { code: (await invitation.json()).code },
        })
      ).status(),
    ).toBe(200);
    await object(page.request, 'a', { name: 'Lo Exempel', description: 'Första uppgiften' });
    await object(page.request, 'b', { name: 'Lo Exempel', description: 'Andra uppgiften' });
    await object(page.request, 'card', { name: 'Blått kort' });
    await object(page.request, 'independent', { name: 'Oberoende objekt' });
    for (const [id, sourceId] of [
      ['first', 'a'],
      ['second', 'b'],
    ]) {
      const state = await read();
      expect(
        (
          await post(page.request, 'relationship', {
            version: state.draft.version,
            id,
            baseRevision: null,
            value: {
              typeId: state.relationshipTypes[0].id,
              sourceId,
              targetId: 'card',
              knowledge: 'known',
            },
          })
        ).status(),
      ).toBe(200);
    }
    await save(page.request, 'initial');
    const initial = await read();
    const participantTypeId = initial.objects.find((object) => object.id === 'a')?.typeId;
    const privateTypeId = initial.types.find((type) => type.id !== participantTypeId)?.id;
    expect(privateTypeId).toBeTruthy();
    await object(page.request, 'private', { name: 'Eget privat förslag', typeId: privateTypeId });
    const privateDraft = (await read()).draft;
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Slå samman objekt', exact: true }).click();
    const form = page.getByRole('region', { name: 'Sammanslagning', exact: true });
    await form.getByLabel('Objekt som behåller sin identitet').selectOption('a');
    await form.getByLabel('Objekt som tas in i det första').selectOption('b');
    await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
    await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
    await form.getByLabel('Val för samband first').selectOption('keep');
    await form.getByLabel('Val för samband second').selectOption('keep');
    await object(other.request, 'independent', {
      description: 'En annan medlems oberoende ändring',
    });
    await save(other.request, 'independent-change');
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    await expect(page.getByRole('alert')).toContainText('Samma samband finns redan');
    expect((await read()).draft).toEqual(privateDraft);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await expect(
      form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }),
    ).toBeEnabled();
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('absorbed');
    await expect(form.getByLabel('Jag bekräftar att objekten är samma företeelse')).toBeChecked();
    await expect(form.getByLabel('Val för samband second')).toHaveValue('keep');
    await form.getByLabel('Val för samband first').selectOption('remove');
    await object(other.request, 'b', { description: 'Ändrat efter granskningen' });
    await save(other.request, 'source-change');
    const rejected = page.waitForResponse((response) => response.url() === `${path}/merge`);
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    expect(await (await rejected).json()).toMatchObject({ error: 'merge_conflict' });
    expect((await read()).draft).toEqual(privateDraft);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await expect(form).toContainText('Ändrat efter granskningen');
    await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('');
    await expect(
      form.getByLabel('Jag bekräftar att objekten är samma företeelse'),
    ).not.toBeChecked();
    await expect(form.getByLabel('Val för samband first')).toHaveValue('');
    await expect(form.getByLabel('Val för samband second')).toHaveValue('');
    await expect(
      form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }),
    ).toBeDisabled();
    await expect(form).toContainText('Underlaget för sammanslagningen har ändrats');
    expect((await read()).draft).toEqual(privateDraft);
    for (const kind of ['object-type', 'relationship', 'relationship-type'] as const) {
      await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
      await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
      await form.getByLabel('Val för samband first').selectOption('remove');
      await form.getByLabel('Val för samband second').selectOption('keep');
      const state = await read(other.request);
      const objectType = state.types.find(
        (type) => type.id === state.objects.find((object) => object.id === 'a')?.typeId,
      );
      const edge = state.relationships.find((edge) => edge.id === 'second');
      const edgeType = state.relationshipTypes.find((type) => type.id === edge?.typeId);
      if (!objectType || !edge || !edgeType)
        throw new Error('The reviewed objects and affected relationship need their definitions');
      const source =
        kind === 'object-type' ? objectType : kind === 'relationship' ? edge : edgeType;
      const value =
        kind === 'object-type'
          ? {
              name: 'Granskad objekttyp',
              description: objectType.description,
              fields: objectType.fields ?? [],
              sections: objectType.sections,
              builtins: objectType.builtins,
              propertyOrder: objectType.propertyOrder,
            }
          : kind === 'relationship'
            ? {
                typeId: edge.typeId,
                sourceId: edge.sourceId,
                targetId: edge.targetId,
                knowledge: edge.knowledge,
                customValues: edge.customValues,
                lifecycle: 'ended',
              }
            : {
                name: 'Granskad sambandstyp',
                description: edgeType.description,
                forwardLabel: edgeType.forwardLabel ?? edgeType.name,
                reverseLabel: edgeType.reverseLabel ?? edgeType.name,
                fields: edgeType.fields ?? [],
                sections: edgeType.sections,
              };
      expect(
        (
          await post(other.request, kind, {
            version: state.draft.version,
            id: source.id,
            baseRevision: source.revision,
            value,
          })
        ).status(),
      ).toBe(200);
      await save(other.request, `source-${kind}`);
      const staleReview = page.waitForResponse((response) => response.url() === `${path}/merge`);
      await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
      expect(await (await staleReview).json()).toMatchObject({ error: 'merge_conflict' });
      expect((await read()).draft).toEqual(privateDraft);
      await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
      await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('');
      await expect(
        form.getByLabel('Jag bekräftar att objekten är samma företeelse'),
      ).not.toBeChecked();
      await expect(form.getByLabel('Val för samband first')).toHaveValue('');
      await expect(form.getByLabel('Val för samband second')).toHaveValue('');
      await expect(form).toContainText('Underlaget för sammanslagningen har ändrats');
      expect((await read()).draft).toEqual(privateDraft);
    }
    await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
    await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
    await form.getByLabel('Val för samband first').selectOption('remove');
    await form.getByLabel('Val för samband second').selectOption('keep');
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
    await expect(draft).toContainText('Ändrat efter granskningen');
    expect((await read(other.request)).objects).toHaveLength(4);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    const saved = await read();
    expect(saved.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', description: 'Ändrat efter granskningen' }),
        expect.objectContaining({
          id: 'independent',
          description: 'En annan medlems oberoende ändring',
        }),
        expect.objectContaining({
          id: 'private',
          name: 'Eget privat förslag',
          typeId: privateTypeId,
        }),
      ]),
    );
    expect(saved.objects.some((item) => item.id === 'b')).toBe(false);
    expect(saved.relationships).toEqual([
      expect.objectContaining({ id: 'second', sourceId: 'a', targetId: 'card' }),
    ]);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(7);
    expect(
      history.at(-1).changes.find((change: { merge?: unknown }) => change.merge).merge.objects[1],
    ).toMatchObject({ id: 'b', description: 'Ändrat efter granskningen', revision: 2 });
  } finally {
    await other.close();
    await installation.close();
  }
});
