import { expect, type Page, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function setup(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  const post = (route: string, data: unknown) =>
    page.request.post(`${path}/${route}`, { headers: { origin }, data });
  for (const [id, name, description] of [
    ['a', 'Lo Exempel', 'Första uppgiften'],
    ['b', 'Lo Exempel', 'Andra uppgiften'],
    ['card', 'Blått kort', ''],
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
          },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await post('save', { version: (await read()).draft.version, operationId: 'initial' })
    ).status(),
  ).toBe(200);
  const saved = await read();
  expect(
    (
      await post('draft', {
        version: saved.draft.version,
        id: 'private',
        baseRevision: null,
        value: { typeId: saved.types[0].id, name: 'Oberoende privat förslag', description: '' },
      })
    ).status(),
  ).toBe(200);
  const original = await read();
  await page.goto(origin);
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Slå samman objekt', exact: true }).click();
  const form = page.getByRole('region', { name: 'Sammanslagning', exact: true });
  await form.getByLabel('Objekt som behåller sin identitet').selectOption('a');
  await form.getByLabel('Objekt som tas in i det första').selectOption('b');
  await form.getByLabel('Välj Beskrivning').selectOption('absorbed');
  await form.getByLabel('Val för samband first').selectOption('keep');
  await form.getByLabel('Val för samband second').selectOption('keep');
  await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
  return { path, read, form, original };
}

test('SAMMANSLAGNING-06: delayed real rejection and proposal preserve newer search focus', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    const { path, read, form, original } = await setup(page, installation.origin);
    const submit = form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' });
    const search = page.getByRole('searchbox', { name: 'Sök objekt', exact: true });
    for (const outcome of ['rejected', 'proposed'] as const) {
      if (outcome === 'proposed')
        await form.getByLabel('Val för samband first').selectOption('remove');
      let received = false;
      let result: unknown;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/map/merge', async (route) => {
        const response = await route.fetch();
        result = await response.json();
        received = true;
        await held;
        await route.fulfill({ response });
      });
      await submit.focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => received).toBe(true);
      await expect(submit).toBeDisabled();
      await search.fill(outcome === 'rejected' ? 'Lo' : 'kort');
      release();
      if (outcome === 'rejected') {
        expect(result).toMatchObject({ error: 'duplicate_relationship' });
        await expect(page.getByRole('alert')).toContainText('Samma samband finns redan');
        await expect(form.getByLabel('Välj Beskrivning')).toHaveValue('absorbed');
        await expect(
          form.getByLabel('Jag bekräftar att objekten är samma företeelse'),
        ).toBeChecked();
        expect(await read()).toEqual(original);
      } else {
        await expect(page.getByRole('status')).toContainText(
          'Förslaget finns i ditt privata utkast',
        );
        expect((await read()).draft).toEqual(result);
        expect((await read()).draft.changes.map((change) => change.id)).toEqual([
          'private',
          'a',
          'b',
        ]);
        expect((await read()).objects).toEqual(original.objects);
        expect((await read()).relationships).toEqual(original.relationships);
      }
      await expect(search).toBeFocused();
      await expect(search).toHaveValue(outcome === 'rejected' ? 'Lo' : 'kort');
      const { history } = await (await page.request.get(`${path}/history`)).json();
      expect(history).toHaveLength(1);
      await page.unroute('**/map/merge');
    }
  } finally {
    release();
    await installation.close();
  }
});

test('SAMMANSLAGNING-07: lost proposal reply is read back without resubmitting or saving implicitly', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, form, original } = await setup(page, installation.origin);
    await form.getByLabel('Val för samband first').selectOption('remove');
    let submissions = 0;
    let submittedDraft: unknown;
    await page.route('**/map/merge', async (route) => {
      submissions += 1;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      submittedDraft = await response.json();
      await route.abort();
    });
    const submit = form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' });
    await submit.click();
    await expect(page.getByRole('alert')).toContainText('Ändringen kunde inte bekräftas');
    await expect(submit).toBeDisabled();
    expect(submissions).toBe(1);
    const persisted = await read();
    expect(persisted.draft).toEqual(submittedDraft);
    expect(persisted.objects).toEqual(original.objects);
    expect(persisted.relationships).toEqual(original.relationships);
    await page.route('**/map?reload=*', (route) => route.abort());
    const refresh = page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true });
    await refresh.click();
    await expect(page.getByRole('alert')).toContainText(
      'Kartan och sparförsöken kunde inte hämtas',
    );
    await expect(submit).toBeDisabled();
    expect(submissions).toBe(1);
    expect(await read()).toEqual(persisted);
    await page.unroute('**/map?reload=*');
    await refresh.click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
    await expect(draft).toContainText('Samma företeelse är uttryckligen bekräftad');
    await expect(draft).toContainText('Oberoende privat förslag');
    expect(await read()).toEqual(persisted);
    expect(submissions).toBe(1);
    await form.getByRole('button', { name: 'Stäng sammanslagningen utan att skicka' }).click();
    expect(await read()).toEqual(persisted);
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    expect(await read()).toEqual(persisted);
    expect(submissions).toBe(1);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(1);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    const saved = await read();
    expect(saved.objects.map((object) => object.id).sort()).toEqual(['a', 'card', 'private']);
    expect(saved.objects.find((object) => object.id === 'a')?.description).toBe('Andra uppgiften');
    expect(saved.relationships).toEqual([
      expect.objectContaining({ id: 'second', sourceId: 'a', targetId: 'card' }),
    ]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(2);
    expect(submissions).toBe(1);
  } finally {
    await installation.close();
  }
});
