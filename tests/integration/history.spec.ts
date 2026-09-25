import { type APIRequestContext, expect, test } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

async function setup(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = (route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin }, data });
  const object = async (id: string, name: string, extra = {}) => {
    const state = await read();
    const before = state.objects.find((item) => item.id === id);
    expect(
      (
        await post('draft', {
          version: state.draft.version,
          id,
          baseRevision: before?.revision ?? null,
          value: { typeId: state.types[0].id, name, description: '', ...before, ...extra },
        })
      ).ok(),
    ).toBe(true);
  };
  const save = async (operationId: string): Promise<SaveReceipt> => {
    const response = await post('save', { version: (await read()).draft.version, operationId });
    expect(response.ok()).toBe(true);
    return (await response.json()).receipt;
  };
  return { path, read, post, object, save };
}

test('HISTORIK-01: history explains a save and undo preserves independent work after restart', async ({
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
    const propose = async (id: string, name: string, description = '') => {
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
    const save = async (operationId: string): Promise<SaveReceipt> =>
      (await (await post('save', { version: (await read()).draft.version, operationId })).json())
        .receipt;
    await propose('person', 'Lo Exempel');
    await save('initial');
    await propose('person', 'Lo Lind');
    const selected = await save('name-change');
    await propose('person', 'Lo Lind', 'Oberoende beskrivning');
    await save('description');
    await propose('independent', 'Robin Exempel');
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    const group = history.getByRole('article').filter({ hasText: 'Sparande: name-change' });
    await expect(group).toContainText('Lo Exempel');
    await expect(group).toContainText('Lo Lind');
    await expect(group).toContainText('Alex Exempel');
    await expect(group).toContainText(selected.savedAt);
    await expect(history).not.toContainText('Robin Exempel');
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Lo Exempel');
    await expect(draft).toContainText('Oberoende beskrivning');
    await expect(draft).toContainText('Robin Exempel');
    expect((await read()).objects[0].name).toBe('Lo Lind');
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await expect(draft).toContainText('Inga förslag');
    expect((await read()).objects[0].name).toBe('Lo Lind');
    await expect(history.getByRole('article')).toHaveCount(3);
    await propose('independent', 'Robin Exempel');
    await page.reload();
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    await expect(draft).toContainText('Lo Exempel');
    await installation.restart();
    const context = await browser.newContext({ storageState: await page.context().storageState() });
    try {
      const second = await context.newPage();
      await second.goto(installation.origin);
      await expect(second.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
        'Oberoende beskrivning',
      );
      await second.getByRole('button', { name: 'Spara hela utkastet' }).click();
      await expect(second.getByRole('status')).toContainText('Sparat');
      await second.getByRole('button', { name: 'Visa historik', exact: true }).click();
      await expect(
        second.getByRole('region', { name: 'Ändringshistorik' }).getByRole('article'),
      ).toHaveCount(4);
    } finally {
      await context.close();
    }
    const state = await read();
    expect(state.objects.find((item) => item.id === 'person')).toMatchObject({
      name: 'Lo Exempel',
      description: 'Oberoende beskrivning',
    });
    expect(state.objects.find((item) => item.id === 'independent')?.name).toBe('Robin Exempel');
    const { history: saved } = await (await page.request.get(`${path}/history`)).json();
    expect(saved[1]).toEqual(selected);
  } finally {
    await installation.close();
  }
});

test('HISTORIK-02: deletion undo restores ended objects and relationships with their identities', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, object, save, path } = await setup(page.request, installation.origin);
    await object('person', 'Lo Exempel', { lifecycle: 'ended' });
    await object('card', 'Blått kort');
    let state = await read();
    expect(
      (
        await post('relationship', {
          version: state.draft.version,
          id: 'uses',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes.find((type) => type.name === 'Använder')?.id,
            sourceId: 'person',
            targetId: 'card',
            knowledge: 'known',
            lifecycle: 'ended',
          },
        })
      ).ok(),
    ).toBe(true);
    await save('initial');
    await page.goto(installation.origin);
    await page.getByText('Åtgärder för Lo Exempel', { exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    const removed = history[1] as SaveReceipt;
    await installation.restart();
    const context = await browser.newContext({ storageState: await page.context().storageState() });
    try {
      const second = await context.newPage();
      await second.goto(installation.origin);
      await second.getByRole('button', { name: 'Visa historik', exact: true }).click();
      const group = second
        .getByRole('region', { name: 'Ändringshistorik' })
        .getByRole('article')
        .filter({ hasText: `Sparande: ${removed.operationId}` });
      await expect(group).toContainText('Borttaget');
      await expect(group).toContainText('Manuellt upphört');
      await expect(group).toContainText('Lo Exempel → Använder → Blått kort');
      await group.getByRole('button', { name: 'Ångra sparandet' }).click();
      await expect(second.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
        'Manuellt upphört',
      );
      expect((await read()).objects.map((item) => item.id)).toEqual(['card']);
      await second.getByRole('button', { name: 'Spara hela utkastet' }).click();
      await expect(second.getByRole('status')).toContainText('Sparat');
      await expect(
        second
          .getByRole('list', { name: 'Objekt', exact: true })
          .getByRole('listitem')
          .filter({ hasText: 'Lo Exempel' }),
      ).toContainText('Upphört');
    } finally {
      await context.close();
    }
    state = await read();
    expect(state.objects.find((item) => item.id === 'person')).toMatchObject({
      lifecycle: 'ended',
      revision: 3,
    });
    expect(state.objects.find((item) => item.id === 'card')).toMatchObject({
      name: 'Blått kort',
      revision: 1,
    });
    expect(state.relationships[0]).toMatchObject({
      id: 'uses',
      sourceId: 'person',
      targetId: 'card',
      lifecycle: 'ended',
      revision: 3,
    });
    const { history: afterUndo } = await (await page.request.get(`${path}/history`)).json();
    expect(afterUndo).toHaveLength(history.length + 1);
    expect(afterUndo.slice(0, history.length)).toEqual(history);
    expect(afterUndo.at(-1).changes[0].after).toMatchObject({
      id: 'person',
      name: 'Lo Exempel',
      lifecycle: 'ended',
    });
    expect(afterUndo.at(-1).relationships[0].after).toMatchObject({
      id: 'uses',
      sourceId: 'person',
      targetId: 'card',
      lifecycle: 'ended',
    });
  } finally {
    await installation.close();
  }
});

test('HISTORIK-03: later overlaps need a fresh choice and own overlaps block atomically', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, object, save, path } = await setup(page.request, installation.origin);
    await object('person', 'Lo Exempel');
    await save('initial');
    await object('person', 'Lo Lind', { name: 'Lo Lind' });
    const selected = await save('rename');
    await object('person', 'Lo Ek', { name: 'Lo Ek' });
    await save('later');
    await object('person', 'Privat namn', { name: 'Privat namn' });
    await object('independent', 'Robin Exempel');
    const unchanged = await read();
    const readHistory = async (): Promise<SaveReceipt[]> =>
      (await (await page.request.get(`${path}/history`)).json()).history;
    const historyBefore = await readHistory();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    const group = page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .filter({ hasText: `Sparande: ${selected.operationId}` });
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    await expect(page.getByRole('alert')).toContainText('överlappar ett eget förslag');
    expect(await read()).toEqual(unchanged);
    expect(await readHistory()).toEqual(historyBefore);
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await draft
      .getByRole('article')
      .filter({ hasText: 'Ändring: Privat namn' })
      .getByRole('button', { name: 'Kasta förslaget' })
      .click();
    await expect(draft).not.toContainText('Privat namn');
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    await expect(draft).toContainText('Konflikt: sparat i kartan nu');
    await expect(draft).toContainText('Robin Exempel');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await draft.getByRole('button', { name: 'Behåll mitt förslag', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('nytt sparbesked');
    expect((await read()).objects[0].name).toBe('Lo Ek');
    expect(await readHistory()).toEqual(historyBefore);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    expect((await read()).objects.find((item) => item.id === 'person')?.name).toBe('Lo Exempel');
    expect((await read()).objects.find((item) => item.id === 'independent')?.name).toBe(
      'Robin Exempel',
    );
    const historyAfter = await readHistory();
    expect(historyAfter).toHaveLength(historyBefore.length + 1);
    expect(historyAfter.slice(0, historyBefore.length)).toEqual(historyBefore);
    expect(
      historyAfter
        .at(-1)
        ?.changes.map((change) => change.after?.id)
        .sort(),
    ).toEqual(['independent', 'person']);
  } finally {
    await installation.close();
  }
});

test('HISTORIK-04: keeping saved values retains independent private facts and their conflicts', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const context = await browser.newContext();
  try {
    const { read, object, save, path } = await setup(page.request, installation.origin);
    await object('person', 'Lo');
    await save('initial');
    await object('person', 'Lo Lind', { name: 'Lo Lind' });
    const selected = await save('selected');
    installation.setIdentity(robin);
    await signIn(context.request, installation.origin);
    const { user } = await (
      await context.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await context.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    const otherEdit = async (update: Record<string, unknown>, operationId: string) => {
      const state = (await (await context.request.get(path)).json()) as MapState;
      const person = state.objects.find((item) => item.id === 'person');
      expect(
        (
          await context.request.post(`${path}/draft`, {
            headers: { origin: installation.origin },
            data: {
              version: state.draft.version,
              id: 'person',
              baseRevision: person?.revision,
              value: { ...person, ...update },
            },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await context.request.post(`${path}/save`, {
            headers: { origin: installation.origin },
            data: { version: state.draft.version + 1, operationId },
          })
        ).ok(),
      ).toBe(true);
    };
    await otherEdit({ name: 'Lo Ek' }, 'later-name');
    await object('person', 'Lo Ek', { description: 'Egen beskrivning' });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    await page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .filter({ hasText: `Sparande: ${selected.operationId}` })
      .getByRole('button', { name: 'Ångra sparandet' })
      .click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Konflikt: sparat i kartan nu');
    await otherEdit({ description: 'Senare delad beskrivning' }, 'later-description');
    await page.reload();
    await draft.getByRole('button', { name: 'Använd sparat värde', exact: true }).click();
    await expect(draft).toContainText('Egen beskrivning');
    await expect(draft).toContainText('Senare delad beskrivning');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    expect((await read()).objects[0]).toMatchObject({
      name: 'Lo Ek',
      description: 'Senare delad beskrivning',
    });
    await draft.getByRole('button', { name: 'Behåll mitt förslag', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    expect((await read()).objects[0]).toMatchObject({
      name: 'Lo Ek',
      description: 'Egen beskrivning',
    });
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history.find((item: SaveReceipt) => item.operationId === selected.operationId)).toEqual(
      selected,
    );
  } finally {
    await context.close();
    await installation.close();
  }
});

test('HISTORIK-05: restored field values require a compatible definition and a fresh save', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, object, save, path } = await setup(page.request, installation.origin);
    const typeId = (await read()).types[0].id;
    const define = async (kind: 'text' | 'number') => {
      const state = await read();
      const type = state.types.find((item) => item.id === typeId);
      expect(
        (
          await post('object-type', {
            version: state.draft.version,
            id: typeId,
            baseRevision: type?.revision,
            value: {
              ...type,
              fields: [{ id: 'serial', name: 'Serienummer', description: '', kind }],
            },
          })
        ).ok(),
      ).toBe(true);
    };
    await define('number');
    await object('valued', 'Lo Exempel', { customValues: { serial: 42 } });
    await save('numeric-object');
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id: 'valued',
          baseRevision: 1,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    const deletion = await save('delete-valued');
    await define('text');
    await save('unused-now-text');
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    const group = page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .filter({ hasText: 'Sparande: delete-valued' });
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Konflikt: sparad typdefinition');
    await expect(draft).toContainText('Serienummer: Tal');
    await expect(draft).toContainText('Serienummer: Text');
    await expect(draft).toContainText('Serienummer: 42');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await draft.getByRole('button', { name: 'Använd sparad typdefinition', exact: true }).click();
    await expect(draft).toContainText('Konflikt: sparat i kartan nu');
    await expect(draft).toContainText('Serienummer: 42');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    expect((await read()).objects).toEqual([]);
    await draft.getByRole('button', { name: 'Använd sparat värde', exact: true }).click();
    await expect(draft).toContainText('Inga förslag');
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    await draft.getByRole('button', { name: 'Behåll min typdefinition', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('nytt sparbesked');
    expect((await read()).objects).toEqual([]);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    const state = await read();
    expect(state.objects[0]).toMatchObject({ id: 'valued', customValues: { serial: 42 } });
    expect(state.types.find((type) => type.id === typeId)?.fields?.[0].kind).toBe('number');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(4);
    expect(history.find((item: SaveReceipt) => item.operationId === deletion.operationId)).toEqual(
      deletion,
    );
  } finally {
    await installation.close();
  }
});
