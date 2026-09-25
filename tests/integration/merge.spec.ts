import { expect, test } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

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
      await other.getByRole('button', { name: 'Visa historik', exact: true }).click();
      const group = other
        .getByRole('region', { name: 'Ändringshistorik' })
        .getByRole('article')
        .filter({ hasText: `Sparande: ${merged.operationId}` });
      await expect(group).toContainText('Sammanslagning: identitet b tas in i a');
      await expect(group).toContainText('Manuellt upphört');
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
