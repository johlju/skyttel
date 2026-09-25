import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('TYP-01: custom definitions and four optional fields share one durable save and history', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const fields = [
      { id: 'supplier', name: 'Leverantör', description: 'Namn', kind: 'text' },
      { id: 'power', name: 'Effekt', description: 'kW', kind: 'number' },
      { id: 'installed', name: 'Installationsdatum', description: '', kind: 'date' },
      { id: 'battery', name: 'Batteri', description: '', kind: 'boolean' },
    ];
    expect(
      (
        await post('object-type', {
          version: 0,
          id: 'solar',
          baseRevision: null,
          value: { name: 'Solcellsanläggning', description: 'Hushållets elproduktion', fields },
        })
      ).status(),
    ).toBe(200);
    const value = {
      typeId: 'solar',
      name: 'Paneler på taket',
      description: '',
      customValues: { supplier: 'Exempelsol', power: 12.5, installed: '2026-09-01' },
    };
    expect(
      (await post('draft', { version: 1, id: 'panels', baseRevision: null, value })).status(),
    ).toBe(200);
    await installation.restart();
    const proposed = await (await page.request.get(path)).json();
    expect(proposed.types.some((type: { id: string }) => type.id === 'solar')).toBe(false);
    expect(proposed.objects).toEqual([]);
    expect(proposed.draft.changes[0].after).toEqual(value);
    expect(proposed.draft.objectTypes[0].after.fields).toEqual(fields);
    const saved = await post('save', { version: 2, operationId: 'solar-save' });
    expect(saved.status()).toBe(200);
    const { receipt } = await saved.json();
    expect(receipt.objectTypes[0].after).toMatchObject({ id: 'solar', revision: 1, fields });
    expect(receipt.changes[0].after).toMatchObject(value);
    await installation.restart();
    const current = await (await page.request.get(path)).json();
    expect(current.objects[0].customValues).not.toHaveProperty('battery');
    expect(current.types.find((type: { id: string }) => type.id === 'solar')).toEqual(
      receipt.objectTypes[0].after,
    );
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    expect(await (await post('save', { version: 2, operationId: 'solar-save' })).json()).toEqual({
      receipt,
    });
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
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Paneler på taket');
    await page
      .getByLabel('Objekttyp', { exact: true })
      .selectOption({ label: 'Solcellsanläggning' });
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Batteri: Obesvarat');
    await expect(review).toContainText('Objekttyp: Solcellsanläggning');
    await page.reload();
    await page.getByRole('button', { name: 'Paneler på taket', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Installationsdatum', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await page.getByRole('button', { name: 'Paneler på taket', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await page.getByLabel('Leverantör', { exact: true }).fill('Exempelsol');
    await page.getByLabel('Effekt', { exact: true }).fill('12.5');
    await page.getByLabel('Installationsdatum', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Batteri', { exact: true }).selectOption('false');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(review).toContainText('Batteri: Nej');
    await expect(review).toContainText('Effekt: 12.5');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await page.getByRole('button', { name: 'Paneler på taket', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('false');
    await page.getByLabel('Leverantör', { exact: true }).fill('Ny leverantör');
    await page.getByLabel('Effekt', { exact: true }).fill('');
    await page.getByLabel('Effekt', { exact: true }).pressSequentially('-14.25');
    await page.getByLabel('Installationsdatum', { exact: true }).fill('2026-09-02');
    await page.getByLabel('Batteri', { exact: true }).selectOption('true');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(review).toContainText('Batteri: Ja');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await page.getByRole('button', { name: 'Paneler på taket', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
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
  const other = await browser.newContext();
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
    await page.goto(installation.origin);
    await expect(page.getByText('Typdefinitionen har ändrats:')).toContainText('Solkraft');
    await page.getByRole('button', { name: 'Behåll mitt förslag', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Kommentar: Privat värde',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    const saved = await read();
    expect(saved.objects[0].customValues).toEqual({ note: 'Privat värde' });
    expect(saved.types.find((type: { id: string }) => type.id === 'solar')).toMatchObject(renamed);
    const memberPage = await other.newPage();
    await memberPage.goto(installation.origin);
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await memberPage.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Solkraft' });
    await memberPage.getByLabel('Objektets namn').fill('Medlemmens paneler');
    await memberPage.getByLabel('Kommentar', { exact: true }).fill('Eget objekt');
    await memberPage.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(memberPage.getByRole('status')).toContainText('Sparat');
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await memberPage.getByLabel('Objektets namn').fill('Lo');
    await memberPage.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
    await memberPage.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(memberPage.getByRole('status')).toContainText('Sparat');
    await memberPage.getByText('Objekttyper och egna fält', { exact: true }).click();
    await memberPage.getByRole('button', { name: 'Ändra typ: Person', exact: true }).click();
    await memberPage.getByLabel('Typens namn').fill('Människa');
    await memberPage.getByLabel('Typens beskrivning').fill('En person i kartan');
    await memberPage.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await memberPage.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(memberPage.getByRole('status')).toContainText('Sparat');
    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await expect(
      memberPage
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
  const other = await browser.newContext();
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
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Konflikt: sparad typdefinition');
    await expect(review).toContainText('Annans rättelse');
    await page.getByRole('button', { name: 'Behåll min typdefinition' }).click();
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
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
    await page.getByRole('button', { name: 'Alex', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Smeknamn', { exact: true })).toHaveValue('');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(2);
    expect(history[1].objectTypes[0].before).toMatchObject({
      name: 'Personer',
      description: 'Annans rättelse',
      fields: [independentField],
      revision: 2,
    });
    expect(history[1].changes[0].type).toMatchObject({
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
  const other = await browser.newContext();
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
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Skapa ett nytt fält');
    await expect(page.getByRole('alert')).not.toContainText('Hemligt');
    expect((await read()).objects).toEqual([]);
    expect((await read()).draft).toEqual(unchanged.draft);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(1);
    expect((await read()).types.find((type: { id: string }) => type.id === 'solar').fields).toEqual(
      fields,
    );
  } finally {
    await other.close();
    await installation.close();
  }
});
