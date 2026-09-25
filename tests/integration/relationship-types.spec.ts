import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('STY-01: a directed definition and arbitrary endpoints share a durable draft, save and history', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const read = async () => (await page.request.get(path)).json();
    const state = await read();
    const definition = {
      name: 'Förvaring',
      description: 'Var hushållets saker finns',
      forwardLabel: 'förvaras i',
      reverseLabel: 'innehåller',
    };
    expect(
      (
        await post('relationship-type', {
          version: 0,
          id: 'storage',
          baseRevision: null,
          value: definition,
        })
      ).status(),
    ).toBe(200);
    for (const [index, id, name] of [
      [0, 'bike', 'Alex blå cykel'],
      [1, 'garage', 'Garaget'],
    ] as const) {
      expect(
        (
          await post('draft', {
            version: index + 1,
            id,
            baseRevision: null,
            value: { typeId: state.types[index].id, name, description: '' },
          })
        ).status(),
      ).toBe(200);
    }
    const value = { typeId: 'storage', sourceId: 'bike', targetId: 'garage', knowledge: 'known' };
    expect(
      (
        await post('relationship', { version: 3, id: 'bike-storage', baseRevision: null, value })
      ).status(),
    ).toBe(200);
    await installation.restart();
    const proposed = await read();
    expect(proposed.relationshipTypes.some((type: { id: string }) => type.id === 'storage')).toBe(
      false,
    );
    expect(proposed.relationships).toEqual([]);
    expect(proposed.objects).toEqual([]);
    expect(proposed.draft.relationshipTypes[0].after).toMatchObject(definition);
    expect(proposed.draft.relationships[0].after).toEqual(value);
    const saved = await post('save', { version: 4, operationId: 'storage-save' });
    expect(saved.status()).toBe(200);
    const { receipt } = await saved.json();
    expect(receipt.relationshipTypes[0]).toMatchObject({
      before: null,
      after: { id: 'storage', revision: 1, ...definition },
    });
    expect(receipt.relationships[0].type).toEqual(receipt.relationshipTypes[0].after);
    await installation.restart();
    const current = await read();
    expect(current.relationshipTypes.find((type: { id: string }) => type.id === 'storage')).toEqual(
      receipt.relationshipTypes[0].after,
    );
    expect(current.relationships).toHaveLength(1);
    expect(current.relationships[0]).toMatchObject({ id: 'bike-storage', ...value });
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    expect(await (await post('save', { version: 4, operationId: 'storage-save' })).json()).toEqual({
      receipt,
    });
  } finally {
    await installation.close();
  }
});

test('STY-03: members share editable prefills while private definitions and household boundaries stay protected', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const member = await browser.newContext();
  const stranger = await browser.newContext();
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
    expect(
      (
        await post(
          'relationship-type',
          { version: 0, id: 'storage', baseRevision: null, value },
          member.request,
        )
      ).status(),
    ).toBe(200);
    expect((await read()).draft).toEqual({ version: 0, changes: [] });
    expect(JSON.stringify(await read())).not.toContain('Förvaringsplats');
    expect(
      (await post('save', { version: 1, operationId: 'member-type' }, member.request)).status(),
    ).toBe(200);
    const state = await read();
    expect(
      state.relationshipTypes.find((type: { id: string }) => type.id === 'storage'),
    ).toMatchObject(value);
    const prefill = state.relationshipTypes.find((type: { id: string }) => type.id !== 'storage');
    expect(
      (
        await post(
          'relationship-type',
          {
            version: 2,
            id: prefill.id,
            baseRevision: prefill.revision,
            value: { ...value, name: 'Redigerad förifylld typ' },
          },
          member.request,
        )
      ).status(),
    ).toBe(200);
    expect(
      (await post('save', { version: 3, operationId: 'prefill' }, member.request)).status(),
    ).toBe(200);
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await memberPage.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await expect(
      memberPage
        .getByLabel('Sambandstyp', { exact: true })
        .getByRole('option', { name: 'Redigerad förifylld typ', exact: true }),
    ).toHaveCount(1);
    // Equal names still create separate definitions with their own identities.
    expect(
      (
        await post('relationship-type', {
          version: 0,
          id: 'other-storage',
          baseRevision: null,
          value,
        })
      ).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'same-name' })).status()).toBe(200);
    expect(
      (await read()).relationshipTypes.filter(
        (type: { name: string }) => type.name === 'Förvaring',
      ),
    ).toHaveLength(2);
    const unchanged = await read();
    for (const invalid of [
      { ...value, forwardLabel: '' },
      { ...value, reverseLabel: '' },
      { ...value, fields: [] },
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
  const member = await browser.newContext();
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
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Konflikt: sparad sambandstyp');
    await expect(review).toContainText('Los nya förklaring');
    await page.getByRole('button', { name: 'Behåll min sambandstyp' }).click();
    await expect(review).toContainText('Los nya förklaring');
    expect((await read()).objects).toEqual([]);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
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
    expect(history[2].relationshipTypes[0].before).toMatchObject({
      description: 'Los nya förklaring',
      reverseLabel: 'rymmer',
      revision: 2,
    });
    expect(history[2].relationships[0].type).toMatchObject({
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
    await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    await page.getByLabel('Sambandstypens namn').fill('Förvaring');
    await page.getByLabel('Sambandstypens beskrivning').fill('Var hushållets saker finns');
    await page.getByLabel('Benämning från startobjektet').fill('förvaras i');
    await page.getByLabel('Benämning från målobjektet').fill('innehåller');
    await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await expect(page.getByLabel('Sambandstyp', { exact: true })).toHaveValue('');
    await page.getByLabel('Från objekt').selectOption('bike');
    await page.getByLabel('Till objekt').selectOption('garage');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    expect((await (await page.request.get(path)).json()).draft.relationships).toBeUndefined();
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Benämning från målobjektet: innehåller');
    await expect(review).toContainText('Alex blå cykel → förvaras i → Garaget');
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await page.getByLabel('Från objekt').selectOption('bike');
    await page.getByLabel('Till objekt').selectOption('garage');
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Sambandet finns redan: Alex blå cykel → förvaras i → Garaget',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Förvaring (sambandstyp)');
    const originalRelationship = (await (await page.request.get(path)).json()).relationships[0];
    await page.reload();
    await page.getByRole('button', { name: 'Alex blå cykel', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Samband för Alex blå cykel' })).toContainText(
      'Alex blå cykel → förvaras i → Garaget',
    );
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await page.getByRole('button', { name: 'Garaget', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    const reverse = page.getByRole('region', { name: 'Samband för Garaget' });
    await expect(reverse).toContainText('Garaget → innehåller → Alex blå cykel');
    await reverse.getByRole('button').click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Från objekt')).toHaveValue('bike');
    await expect(page.getByLabel('Till objekt')).toHaveValue('garage');
    await page.getByRole('button', { name: 'Stäng sambandet utan att skicka' }).click();
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }).click();
    await page.getByLabel('Sambandstypens namn').fill('Plats');
    await page.getByLabel('Sambandstypens beskrivning').fill('Hushållets förvaringsplatser');
    await page.getByLabel('Benämning från startobjektet').fill('finns i');
    await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
    await expect(review).toContainText('Var hushållets saker finns');
    await expect(review).toContainText('Hushållets förvaringsplatser');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
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
  const member = await browser.newContext();
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
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Samma samband finns redan');
    await page.getByRole('button', { name: 'Använd sparat värde', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
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
    expect(history[1].relationships[0].before).toMatchObject({
      id: 'second',
      typeId: 'other',
      sourceId: 'bike',
      targetId: 'garage',
    });
    expect(history[1].relationships[0].after).toMatchObject({
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
