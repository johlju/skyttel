import { type APIRequestContext, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { beginAssistant, callAssistant } from '../support/assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

async function connect(actor: APIRequestContext, origin: string, householdId: string) {
  const flow = await beginAssistant(actor, origin, 'skyttel:read skyttel:write');
  const accepted = await flow.consent(householdId);
  expect(accepted.status()).toBe(200);
  const exchanged = await flow.exchange((await accepted.json()).url);
  expect(exchanged.status).toBe(200);
  const token = (await exchanged.json()).access_token;
  async function tool(name: string, args = {}, error?: string) {
    const response = await callAssistant(origin, token, name, args);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    const value = JSON.parse(body.result.content[0].text);
    if (error) expect(value.error).toBe(error);
    else expect(body.result.isError, JSON.stringify(value)).not.toBe(true);
    return value;
  }
  const versions = (review: { version: number; contentVersion: number }) => ({
    version: review.version,
    contentVersion: review.contentVersion,
  });
  async function propose(name: string, args: Record<string, unknown>, error?: string) {
    return tool(name, { ...versions(await tool('read_my_draft')), ...args }, error);
  }
  return {
    tool,
    propose,
    async object(id: string, value: Record<string, unknown>) {
      const before = (await tool('read_map', { objectId: id })).objects[0];
      return propose('propose_object', { id, baseRevision: before?.revision ?? null, value });
    },
    async save(operationId: string) {
      return (await propose('save_draft', { operationId })).receipt;
    },
    async type(id: string, value: unknown, error?: string) {
      const before = (await tool('read_type_catalog')).types.find(
        (entry: { id: string }) => entry.id === id,
      );
      return propose(
        'propose_object_type',
        { id, baseRevision: before?.revision ?? null, value },
        error,
      );
    },
  };
}

test('MCP-05: bildval och sammanslagning ångras med senare arbete kvar', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}`;
    const mcp = await connect(page.request, app.origin, household.id);
    const catalog = await mcp.tool('read_type_catalog');
    const typeId = catalog.types[0].id;
    for (const [id, name, description] of [
      ['a', 'Lo Exempel', 'Första uppgiften'],
      ['b', 'Lo Exempel', 'Andra uppgiften'],
      ['card', 'Blått kort', 'Orelaterade detaljer'],
    ])
      await mcp.object(id, { typeId, name, description });
    await mcp.save('merge-fixture');
    for (const [id, color] of [
      ['a', '#ff0000'],
      ['b', '#00ff00'],
    ]) {
      const state = await (await page.request.get(`${path}/map`)).json();
      const bytes = await sharp({
        create: { width: 10, height: 12, channels: 3, background: color },
      })
        .png()
        .toBuffer();
      expect(
        (
          await page.request.post(`${path}/profile-images/${id}`, {
            headers: {
              origin: app.origin,
              'content-type': 'image/png',
              'x-skyttel-content-version': String(state.contentVersion),
              'x-skyttel-draft-version': String(state.draft.version),
              'x-skyttel-object-revision': String(
                state.objects.find((object: { id: string }) => object.id === id).revision,
              ),
            },
            data: bytes,
          })
        ).status(),
      ).toBe(200);
    }
    for (const [id, sourceId] of [
      ['first', 'a'],
      ['second', 'b'],
    ])
      await mcp.propose('propose_relationship', {
        id,
        baseRevision: null,
        value: {
          typeId: catalog.relationshipTypes[0].id,
          sourceId,
          targetId: 'card',
          knowledge: 'known',
        },
      });
    await mcp.save('merge-images-edges');
    const original = await mcp.tool('read_map');
    let merge = await mcp.tool('read_merge_review', { survivorId: 'a', absorbedId: 'b' });
    expect(JSON.stringify(merge)).not.toContain('Orelaterade detaljer');
    const proposal = () => ({
      survivorId: 'a',
      absorbedId: 'b',
      identityConfirmed: false,
      reviewed: merge.reviewed,
      choices: { description: 'absorbed', profileImageId: 'absorbed' },
      relationships: [
        { id: 'first', action: 'remove' },
        { id: 'second', action: 'keep' },
      ],
    });
    await mcp.propose('propose_merge', proposal());
    await page.goto(app.origin);
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Identiteten är inte bekräftad');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await mcp.propose('discard_proposal', { kind: 'object', id: 'a' });
    merge = await mcp.tool('read_merge_review', { survivorId: 'a', absorbedId: 'b' });
    await mcp.propose('propose_merge', { ...proposal(), identityConfirmed: true });
    await page.reload();
    await expect(draft).toContainText('Samma företeelse är uttryckligen bekräftad');
    const merged = await mcp.save('merge-approved');
    const current = (await mcp.tool('read_map', { objectId: 'a' })).objects[0];
    const sourceImage = original.objects.find(
      (object: { id: string }) => object.id === 'b',
    ).profileImageId;
    expect(current.profileImageId).not.toBe(sourceImage);
    expect(
      await (await page.request.get(`${path}/profile-images/${current.profileImageId}`)).body(),
    ).toEqual(await (await page.request.get(`${path}/profile-images/${sourceImage}`)).body());
    await mcp.object('a', { typeId, name: 'Senare namn', description: current.description });
    await mcp.save('later-name');
    await mcp.object('independent', { typeId, name: 'Eget senare objekt', description: '' });
    await mcp.tool('read_history', { operationId: merged.operationId, userId: merged.userId });
    await mcp.propose('propose_undo', { operationId: merged.operationId, userId: merged.userId });
    await app.restart();
    await page.reload();
    await expect(draft).toContainText('Eget senare objekt');
    await expect(draft).toContainText('Första uppgiften');
    await mcp.save('undo-merge');
    await page.reload();
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    await expect(objects).toContainText('Senare namn');
    await expect(objects).toContainText('Lo Exempel');
    await expect(objects).toContainText('Eget senare objekt');
    const restored = await mcp.tool('read_map');
    expect(restored.objects.find((object: { id: string }) => object.id === 'a')).toMatchObject({
      name: 'Senare namn',
      description: 'Första uppgiften',
      profileImageId: original.objects.find((object: { id: string }) => object.id === 'a')
        .profileImageId,
    });
    expect(
      restored.objects.find((object: { id: string }) => object.id === 'b').profileImageId,
    ).toBe(sourceImage);
    expect(restored.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', sourceId: 'a' }),
        expect.objectContaining({ id: 'second', sourceId: 'b' }),
      ]),
    );
  } finally {
    await app.close();
  }
});

test('MCP-06: importerad historik ångras med färskt underlag', async ({ page }) => {
  const source = await createInstallation();
  const target = await createInstallation();
  try {
    await signIn(page.request, source.origin);
    const sourceHousehold = (await (await createHousehold(page.request, source.origin)).json())
      .household;
    const sourceMcp = await connect(page.request, source.origin, sourceHousehold.id);
    const typeId = (await sourceMcp.tool('read_type_catalog')).types[0].id;
    await sourceMcp.object('lamp', { typeId, name: 'Historisk lampa', description: '' });
    const saved = await sourceMcp.save('source-lamp');
    const sourcePath = `${source.origin}/api/households/${sourceHousehold.id}`;
    const prepared = await page.request.post(`${sourcePath}/exports`, {
      headers: { origin: source.origin },
      data: {},
    });
    expect(prepared.status()).toBe(201);
    const archive = await (
      await page.request.get(`${sourcePath}/exports/${(await prepared.json()).id}`)
    ).body();
    await signIn(page.request, target.origin);
    const targetHousehold = (await (await createHousehold(page.request, target.origin)).json())
      .household;
    const targetPath = `${target.origin}/api/households/${targetHousehold.id}`;
    const targetMcp = await connect(page.request, target.origin, targetHousehold.id);
    const old = await targetMcp.tool('read_my_draft');
    const uploaded = await page.request.post(`${targetPath}/imports`, {
      headers: {
        origin: target.origin,
        'content-type': 'application/zip',
        'x-skyttel-content-version': '1',
      },
      data: archive,
    });
    expect(uploaded.status()).toBe(201);
    expect(
      (
        await (
          await page.request.post(`${targetPath}/imports/${(await uploaded.json()).id}/confirm`, {
            headers: { origin: target.origin },
            data: { contentVersion: 1, confirmed: true },
          })
        ).json()
      ).status,
    ).toBe('completed');
    await target.restart();
    await page.goto(target.origin);
    await expect(page.getByRole('button', { name: 'Historisk lampa', exact: true })).toBeVisible();
    const selected = await targetMcp.tool('read_history', {
      operationId: saved.operationId,
      userId: saved.userId,
    });
    expect(selected.receipt.actorName).toBe('Alex Exempel');
    await targetMcp.tool(
      'propose_object_type',
      {
        version: old.version,
        contentVersion: old.contentVersion,
        id: 'manual-old-type',
        baseRevision: null,
        value: { name: 'Gammalt underlag', description: '', fields: [] },
      },
      'content_conflict',
    );
    await targetMcp.tool(
      'propose_undo',
      {
        version: old.version,
        contentVersion: old.contentVersion,
        operationId: saved.operationId,
        userId: saved.userId,
      },
      'content_conflict',
    );
    await targetMcp.propose('propose_undo', {
      operationId: saved.operationId,
      userId: saved.userId,
    });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Borttagning',
    );
    const receipt = await targetMcp.save('fresh-import-undo');
    expect(receipt.contentVersion).toBe(2);
    expect(receipt.userId).not.toBe(saved.userId);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).not.toContainText(
      'Historisk lampa',
    );
    expect((await targetMcp.tool('read_map')).objects).toEqual([]);
  } finally {
    await target.close();
    await source.close();
  }
});

test('MCP-03: typbyte och riktade samband återställs med äldre typer', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    for (const [id, name, kind] of [
      ['cycle', 'Cykel', 'text'],
      ['vehicle', 'Motorfordon', 'number'],
    ])
      await mcp.type(id, {
        name,
        description: '',
        fields: [{ id: 'serial', name: 'Nummer', description: '', kind }],
      });
    const catalog = await mcp.tool('read_type_catalog');
    await mcp.object('bike', {
      typeId: 'cycle',
      name: 'Alex blå cykel',
      description: '',
      customValues: { serial: 'SYNTH-42' },
    });
    await mcp.object('garage', { typeId: catalog.types[0].id, name: 'Garaget', description: '' });
    await mcp.propose('propose_relationship_type', {
      id: 'stored',
      baseRevision: null,
      value: {
        name: 'Förvaring',
        description: 'Sakens plats',
        forwardLabel: 'förvaras i',
        reverseLabel: 'innehåller',
      },
    });
    const edge = { typeId: 'stored', sourceId: 'bike', targetId: 'garage', knowledge: 'known' };
    await mcp.propose('propose_relationship', { id: 'parking', baseRevision: null, value: edge });
    const repeated = await mcp.propose('propose_relationship', {
      id: 'duplicate',
      baseRevision: null,
      value: edge,
    });
    expect(repeated.existingId).toBe('parking');
    expect(repeated.relationships).toHaveLength(1);
    await mcp.propose('propose_relationship', {
      id: 'second-kind',
      baseRevision: null,
      value: { ...edge, typeId: catalog.relationshipTypes[0].id },
    });
    await mcp.save('cycle-with-edges');
    const initial = await mcp.tool('read_map', { objectId: 'bike' });
    await mcp.object('bike', {
      typeId: 'vehicle',
      name: 'Alex blå cykel',
      description: '',
      customValues: { serial: 42 },
    });
    await page.goto(app.origin);
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Objekttyp: Cykel');
    await expect(draft).toContainText('Objekttyp: Motorfordon');
    await expect(draft).toContainText('Nummer: SYNTH-42');
    await expect(draft).toContainText('Nummer: 42');
    const changed = await mcp.save('type-change');
    expect((await mcp.tool('read_map', { objectId: 'bike' })).relationships).toEqual(
      initial.relationships,
    );
    await mcp.type('cycle', null);
    await mcp.save('remove-cycle-definition');
    const selected = await mcp.tool('read_history', {
      operationId: changed.operationId,
      userId: changed.userId,
    });
    expect(selected.receipt.changes[0].beforeType.name).toBe('Cykel');
    const undo = await mcp.propose('propose_undo', {
      operationId: changed.operationId,
      userId: changed.userId,
    });
    expect(undo.objectTypes[0]).toMatchObject({ id: 'cycle', before: null });
    await page.reload();
    await expect(draft).toContainText('Cykel');
    await expect(draft).toContainText('SYNTH-42');
    await mcp.save('restore-type-and-object');
    const bike = (await mcp.tool('read_map', { objectId: 'bike' })).objects[0];
    await mcp.propose('propose_object', { id: 'bike', baseRevision: bike.revision, value: null });
    const removed = await mcp.save('remove-bike');
    await mcp.type('cycle', null);
    await mcp.propose('propose_relationship_type', { id: 'stored', baseRevision: 1, value: null });
    await mcp.save('remove-unused-definitions');
    const restore = await mcp.propose('propose_undo', {
      operationId: removed.operationId,
      userId: removed.userId,
    });
    expect(restore.objectTypes[0]).toMatchObject({ id: 'cycle', before: null });
    expect(restore.relationshipTypes[0]).toMatchObject({ id: 'stored', before: null });
    await app.restart();
    await page.reload();
    await expect(draft).toContainText('Alex blå cykel');
    await expect(draft).toContainText('Förvaring');
    await mcp.save('restore-bike');
    await page.reload();
    await page.getByRole('button', { name: 'Alex blå cykel', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Nummer', { exact: true })).toHaveValue('SYNTH-42');
    await expect(page.getByText('förvaras i', { exact: false }).first()).toBeVisible();
    expect((await mcp.tool('read_map', { objectId: 'bike' })).relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'parking', sourceId: 'bike', targetId: 'garage' }),
        expect.objectContaining({ id: 'second-kind' }),
      ]),
    );
  } finally {
    await app.close();
  }
});

test('MCP-04: upphört innehåll och privata utkast skyddar typer', async ({ page, browser }) => {
  const app = await createInstallation();
  const other = await browser.newContext();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    for (const [id, name] of [
      ['ended-type', 'Upphörd typ'],
      ['private-type', 'Privat använd typ'],
      ['race-type', 'Samtidig typ'],
    ])
      await mcp.type(id, { name, description: '', fields: [] });
    await mcp.object('ended', {
      typeId: 'ended-type',
      name: 'Upphört testobjekt',
      description: '',
      lifecycle: 'ended',
    });
    await mcp.save('protected-types');
    const blocked = await mcp.type('ended-type', null, 'definition_in_use');
    expect(blocked.message).toContain('upphört');
    app.setIdentity(robin);
    await signIn(other.request, app.origin);
    const { user } = await (await other.request.get(`${app.origin}/api/bootstrap`)).json();
    const householdPath = `${app.origin}/api/households/${household.id}`;
    const { code } = await (
      await page.request.post(`${householdPath}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code },
        })
      ).ok(),
    ).toBe(true);
    const otherMcp = await connect(other.request, app.origin, household.id);
    await otherMcp.object('secret', {
      typeId: 'private-type',
      name: 'Andras privata namn',
      description: 'Privat hemlig anteckning',
    });
    const privateBlock = await mcp.type('private-type', null, 'definition_in_use');
    expect(JSON.stringify(privateBlock)).not.toMatch(
      /Andras privata namn|Privat hemlig anteckning|"secret"/,
    );
    await mcp.type('race-type', null);
    await otherMcp.object('race', {
      typeId: 'race-type',
      name: 'Senare privat användning',
      description: '',
    });
    await mcp.propose('save_draft', { operationId: 'blocked-removal' }, 'definition_in_use');
    await page.goto(app.origin);
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toContainText(
      'Upphört testobjekt',
    );
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toContainText('Upphört');
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).not.toContainText(
      'Andras privata namn',
    );
    const otherPage = await other.newPage();
    await otherPage.goto(app.origin);
    await expect(otherPage.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Andras privata namn',
    );
    await expect(otherPage.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Senare privat användning',
    );
    await app.restart();
    await otherPage.reload();
    await expect(otherPage.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Andras privata namn',
    );
    expect(
      (await (await page.request.get(`${householdPath}/map`)).json()).types.some(
        (type: { id: string }) => type.id === 'race-type',
      ),
    ).toBe(true);
  } finally {
    await other.close();
    await app.close();
  }
});

test('MCP-01: egna typer och frivilliga fält bevarar obesvarat och nej', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    const fields = [
      { id: 'supplier', name: 'Leverantör', description: '', kind: 'text' },
      { id: 'power', name: 'Effekt', description: 'kW', kind: 'number' },
      { id: 'installed', name: 'Installationsdatum', description: '', kind: 'date' },
      { id: 'battery', name: 'Batteri', description: '', kind: 'boolean' },
    ];
    const definition = {
      name: 'Solcellsanläggning',
      description: 'Hushållets elproduktion',
      fields,
    };
    await mcp.type('solar', definition);
    await mcp.object('roof', {
      typeId: 'solar',
      name: 'Paneler på taket',
      description: '',
      customValues: { supplier: 'Exempelsol', power: 12.5, installed: '2026-09-01' },
    });
    await mcp.object('garage', {
      typeId: 'solar',
      name: 'Paneler på garaget',
      description: '',
      customValues: { battery: false },
    });
    await page.goto(app.origin);
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Batteri: Obesvarat');
    await expect(draft).toContainText('Batteri: Nej');
    expect((await mcp.tool('read_map')).objects).toEqual([]);
    await mcp.save('solar');
    const blocked = await mcp.type(
      'solar',
      {
        ...definition,
        fields: fields.map((field) => (field.id === 'power' ? { ...field, kind: 'text' } : field)),
      },
      'field_kind_in_use',
    );
    expect(blocked.message).toContain('nytt fält');
    await mcp.type('solar', {
      ...definition,
      fields: [
        ...fields,
        { id: 'power-note', name: 'Effektanteckning', description: '', kind: 'text' },
      ],
    });
    const catalog = await mcp.tool('read_type_catalog');
    const unused = catalog.types.find((type: { name: string }) => type.name === 'Fordon');
    const person = catalog.types.find((type: { name: string }) => type.name === 'Person');
    await mcp.type(person.id, {
      name: 'Person i hushållet',
      description: 'Personer ger ingen inloggning',
      fields: [],
    });
    await mcp.type(unused.id, null);
    await mcp.save('catalog-changes');
    await app.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Paneler på taket', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('Exempelsol');
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('12.5');
    await expect(page.getByLabel('Installationsdatum', { exact: true })).toHaveValue('2026-09-01');
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Effektanteckning', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await page.getByRole('button', { name: 'Paneler på garaget', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('false');
    expect(
      (await mcp.tool('read_type_catalog')).types.map((type: { name: string }) => type.name),
    ).toContain('Person i hushållet');
    expect(
      (await mcp.tool('read_type_catalog')).types.some(
        (type: { id: string }) => type.id === unused.id,
      ),
    ).toBe(false);
  } finally {
    await app.close();
  }
});

test('MCP-02: daterade avtal kan rättas utan påhittade uppgifter', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const mcp = await connect(page.request, app.origin, household.id);
    const catalog = await mcp.tool('read_type_catalog');
    const type = (name: string) =>
      catalog.types.find((entry: { name: string }) => entry.name === name).id;
    for (const [id, kind, name, facts] of [
      [
        'rent',
        'Hyresavtal',
        'Hyra för lägenheten',
        { price: { knowledge: 'known', value: '9 500' }, terms: { knowledge: 'unknown' } },
      ],
      [
        'garage-rent',
        'Hyresavtal',
        'Hyra för garaget',
        { price: { knowledge: 'uncertain', value: '650' } },
      ],
      [
        'loan',
        'Låneavtal',
        'Exempellån',
        { debt: { knowledge: 'uncertain', value: '125 000,50', reportedOn: '2026-09-01' } },
      ],
      [
        'credit',
        'Kreditavtal',
        'Exempelkredit',
        {
          creditLimit: { knowledge: 'known', value: '80 000', reportedOn: '2026-08-01' },
          usedCredit: { knowledge: 'known', value: '12 500', reportedOn: '2026-09-02' },
          terms: { knowledge: 'none' },
        },
      ],
      [
        'installment',
        'Avbetalningsavtal',
        'Bilens avbetalning',
        { debt: { knowledge: 'unknown', reportedOn: '2026-09-03' } },
      ],
    ] as const)
      await mcp.object(id, { typeId: type(kind), name, description: '', financialFacts: facts });
    await mcp.object('car', {
      typeId: type('Fordon'),
      name: 'Familjens bil',
      description: '',
      identity: 'unspecified',
    });
    for (const [id, name, kind] of [
      ['home', 'Lägenheten', 'Bostad'],
      ['garage', 'Garaget', 'Garage'],
    ]) {
      await mcp.object(id, { typeId: type(kind), name, description: '' });
    }
    for (const [id, sourceId, targetId] of [
      ['home-rent-link', 'rent', 'home'],
      ['garage-rent-link', 'garage-rent', 'garage'],
    ]) {
      await mcp.propose('propose_relationship', {
        id,
        baseRevision: null,
        value: {
          typeId: catalog.relationshipTypes.find(
            (entry: { name: string }) => entry.name === 'Gäller',
          ).id,
          sourceId,
          targetId,
          knowledge: 'known',
        },
      });
    }
    await mcp.propose('propose_relationship', {
      id: 'finance-car',
      baseRevision: null,
      value: {
        typeId: catalog.relationshipTypes.find(
          (entry: { name: string }) => entry.name === 'Finansierar',
        ).id,
        sourceId: 'installment',
        targetId: 'car',
        knowledge: 'known',
      },
    });
    await page.goto(app.origin);
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('125 000,50 (Osäkert uppgivet)');
    await expect(draft).toContainText('Avtalsvillkor: Uttryckligen inget');
    await expect(draft).toContainText('Ospecificerat objekt');
    await mcp.save('agreements');
    const credit = (await mcp.tool('read_map', { objectId: 'credit' })).objects[0];
    await mcp.object('credit', {
      typeId: credit.typeId,
      name: credit.name,
      description: '',
      financialFacts: {
        ...credit.financialFacts,
        usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-20' },
      },
    });
    const receipt = await mcp.save('correct-used-credit');
    await app.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Exempelkredit', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
    await expect(page.getByLabel('Beviljat kreditutrymme', { exact: true })).toHaveValue('80 000');
    await expect(page.getByLabel('Utnyttjad kredit', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Utnyttjad kredit: datum för uppgiften')).toHaveValue(
      '2026-09-20',
    );
    await expect(page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue('');
    const selected = await mcp.tool('read_history', {
      operationId: receipt.operationId,
      userId: receipt.userId,
    });
    expect(selected.receipt.changes[0].before.financialFacts.usedCredit.value).toBe('12 500');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    for (const name of [
      'Hyra för lägenheten',
      'Hyra för garaget',
      'Exempellån',
      'Bilens avbetalning',
    ])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Bilens avbetalning → Finansierar → Familjens bil',
    );
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Hyra för lägenheten → Gäller → Lägenheten',
    );
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Hyra för garaget → Gäller → Garaget',
    );
  } finally {
    await app.close();
  }
});
