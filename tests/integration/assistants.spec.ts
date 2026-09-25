import { expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { beginAssistant, callAssistant } from '../support/assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('AI-03: medgivandet kräver val av hushåll och AI-behandling', async ({ page }) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const flow = await beginAssistant(page.request, app.origin);
    await page.goto(flow.consentUrl.href);
    await expect(page.getByRole('heading', { name: 'Anslut extern assistent' })).toBeVisible();
    await expect(page.getByText(/Inloggad som Alex Exempel/)).toBeVisible();
    await expect(page.getByText(/Databasen i EU garanterar inte/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Godkänn läsåtkomst' })).toBeDisabled();
    await page.getByLabel('Välj hushåll').selectOption(household.id);
    await expect(page.getByRole('button', { name: 'Godkänn läsåtkomst' })).toBeDisabled();
    await page.getByRole('checkbox').check();
    const callback = page.waitForRequest('http://127.0.0.1:7777/callback**');
    await page.route('http://127.0.0.1:7777/callback**', (route) =>
      route.fulfill({ body: 'Påhittad klient' }),
    );
    await page.getByRole('button', { name: 'Godkänn läsåtkomst' }).click();
    await page.waitForURL('http://127.0.0.1:7777/callback**');
    const tokens = await flow.exchange((await callback).url());
    expect(tokens.status, await tokens.clone().text()).toBe(200);
    const { access_token } = await tokens.json();
    expect((await callAssistant(app.origin, access_token, 'read_map')).status).toBe(200);
    await page.goto(`${app.origin}/assistants`);
    await page
      .getByRole('button', { name: 'Återkalla anslutning för Påhittad textassistent' })
      .click();
    await expect(page.getByText('Inga aktiva assistentanslutningar.')).toBeVisible();
    expect((await callAssistant(app.origin, access_token, 'read_map')).status).toBe(401);
    await page.getByRole('link', { name: 'Till kartan' }).click();
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('AI-02: uttryckligt AI-val ger läsning och återkallelse stoppar gamla token', async ({
  request,
}) => {
  const app = await createInstallation();
  try {
    await signIn(request, app.origin);
    const { household } = await (await createHousehold(request, app.origin)).json();
    const flow = await beginAssistant(request, app.origin);
    const denied = await flow.consent(household.id, { externalAi: false });
    expect(denied.status()).toBe(403);
    const consent = await flow.consent(household.id);
    expect(consent.status(), await consent.text()).toBe(200);
    const callback = new URL((await consent.json()).url);
    expect(callback.searchParams.get('state')).toBe('fictional-state');
    const token = await flow.exchange(callback.href);
    expect(token.status, await token.clone().text()).toBe(200);
    const { access_token } = await token.json();
    const headers = {
      authorization: `Bearer ${access_token}`,
      accept: 'application/json, text/event-stream',
    };
    const tools = await request.post(`${app.origin}/mcp`, {
      headers,
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(tools.status(), await tools.text()).toBe(200);
    expect((await tools.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'read_map',
      'read_my_draft',
    ]);
    const read = await request.post(`${app.origin}/mcp`, {
      headers,
      data: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'read_map', arguments: {} },
      },
    });
    expect(read.status(), await read.text()).toBe(200);
    expect(JSON.parse((await read.json()).result.content[0].text)).toMatchObject({ objects: [] });
    const { connections } = await (
      await request.get(`${app.origin}/api/assistants/context`)
    ).json();
    expect(connections).toHaveLength(1);
    expect(
      (
        await request.post(`${app.origin}/api/assistants/${connections[0].id}/revoke`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post(`${app.origin}/mcp`, {
          headers,
          data: { jsonrpc: '2.0', id: 3, method: 'tools/list' },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await app.close();
  }
});

test('AI-01: OAuth krävs innan assistenten kan läsa kartan', async ({ request }) => {
  const app = await createInstallation();
  try {
    const denied = await request.post(`${app.origin}/mcp`, {
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(denied.status()).toBe(401);
    expect(denied.headers()['www-authenticate']).toContain('/.well-known/oauth-protected-resource');
    const resource = await request.get(`${app.origin}/.well-known/oauth-protected-resource`);
    expect(await resource.json()).toMatchObject({
      resource: `${app.origin}/mcp`,
      authorization_servers: [`${app.origin}/api/auth`],
      scopes_supported: ['skyttel:read', 'skyttel:write'],
    });
    await signIn(request, app.origin);
    expect((await createHousehold(request, app.origin)).status()).toBe(201);
    const cookieOnly = await request.post(`${app.origin}/mcp`, {
      headers: { origin: app.origin, accept: 'application/json, text/event-stream' },
      data: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'read_map', arguments: {} },
      },
    });
    expect(cookieOnly.status()).toBe(401);
    expect(await cookieOnly.json()).toEqual({
      error: 'unauthenticated',
      message: 'Anslutningen behöver godkännas på nytt i Skyttel.',
    });
  } finally {
    await app.close();
  }
});

test('AI-06: avgränsad läsning visar direkta samband utan orelaterade uppgifter', async ({
  request,
}) => {
  const app = await createInstallation();
  try {
    await signIn(request, app.origin);
    const { household } = await (await createHousehold(request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await request.get(path)).json();
    const post = async (route: string, data: Record<string, unknown>) => {
      const state = await read();
      const response = await request.post(`${path}/${route}`, {
        headers: { origin: app.origin },
        data: { version: state.draft.version, ...data },
      });
      expect(response.status(), await response.text()).toBe(200);
    };
    const state = await read();
    const vehicleType = state.types.find((type) => type.name === 'Fordon')?.id;
    const personType = state.types.find((type) => type.name === 'Person')?.id;
    await post('object-type', {
      id: 'unrelated-type',
      baseRevision: null,
      value: {
        name: 'Privat samling',
        description: 'Orelaterad typbeskrivning',
        fields: [{ id: 'note', name: 'Anteckning', description: 'Hemligt fält', kind: 'text' }],
      },
    });
    for (const [id, typeId, name, description] of [
      ['car', vehicleType, 'Blå bilen', 'Bilens sparade uppgifter'],
      ['kim', personType, 'Kim', 'Kims övriga detaljer'],
      ['lo', personType, 'Lo', 'Los övriga detaljer'],
      ['bike', vehicleType, 'Cykeln två steg bort', 'Cykelns uppgifter'],
      ['collection', 'unrelated-type', 'Samlingen', 'Orelaterat objekt'],
    ])
      await post('draft', {
        id,
        baseRevision: null,
        value: { typeId, name, description },
      });
    for (const [id, type, sourceId, targetId, knowledge] of [
      ['ownership', 'Äger', 'car', 'kim', 'known'],
      ['usage', 'Använder', 'lo', 'car', 'uncertain'],
      ['unknown-user', 'Används av', 'car', null, 'unknown'],
      ['second-hop', 'Använder', 'kim', 'bike', 'known'],
    ])
      await post('relationship', {
        id,
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes.find((item) => item.name === type)?.id,
          sourceId,
          targetId,
          knowledge,
        },
      });
    await post('save', { operationId: 'save-scoped-map' });
    const flow = await beginAssistant(request, app.origin);
    const consent = await flow.consent(household.id);
    expect(consent.status(), await consent.text()).toBe(200);
    const tokens = await flow.exchange((await consent.json()).url);
    expect(tokens.status, await tokens.clone().text()).toBe(200);
    const { access_token } = await tokens.json();
    for (const args of [
      { objectId: 'car' },
      { query: 'BILEN' },
      { objectId: 'car', query: 'bilen' },
    ]) {
      const response = await callAssistant(app.origin, access_token, 'read_map', args);
      expect(response.status, await response.clone().text()).toBe(200);
      const result = await response.json();
      const map = JSON.parse(result.result.content[0].text);
      expect(map.objects).toEqual([
        expect.objectContaining({ id: 'car', description: 'Bilens sparade uppgifter' }),
      ]);
      expect(map.contextObjects).toEqual([
        { id: 'kim', typeId: personType, name: 'Kim' },
        { id: 'lo', typeId: personType, name: 'Lo' },
      ]);
      expect(map.relationships.map((edge: { id: string }) => edge.id).sort()).toEqual([
        'ownership',
        'unknown-user',
        'usage',
      ]);
      expect(map.relationships).toContainEqual(
        expect.objectContaining({ id: 'unknown-user', targetId: null, knowledge: 'unknown' }),
      );
      expect(map.relationships).toContainEqual(
        expect.objectContaining({ id: 'usage', knowledge: 'uncertain' }),
      );
      expect(map.types.map((type: { name: string }) => type.name).sort()).toEqual([
        'Fordon',
        'Person',
      ]);
      expect(map.relationshipTypes.map((type: { name: string }) => type.name).sort()).toEqual([
        'Använder',
        'Används av',
        'Äger',
      ]);
      for (const excluded of ['övriga detaljer', 'Cykeln', 'Samlingen', 'Orelaterad', 'Hemligt'])
        expect(JSON.stringify(map)).not.toContain(excluded);
    }
    for (const args of [
      { query: 'ingen träff' },
      { objectId: 'missing' },
      { objectId: 'car', query: 'Samlingen' },
    ]) {
      const result = await (await callAssistant(app.origin, access_token, 'read_map', args)).json();
      expect(JSON.parse(result.result.content[0].text)).toEqual({
        objects: [],
        contextObjects: [],
        types: [],
        relationshipTypes: [],
        relationships: [],
      });
    }
    const result = await (await callAssistant(app.origin, access_token, 'read_map')).json();
    const map = JSON.parse(result.result.content[0].text);
    expect(map.objects).toHaveLength(5);
    expect(map.relationships).toHaveLength(4);
    expect(map.contextObjects).toEqual([]);
    await post('draft', {
      id: 'car',
      baseRevision: 1,
      value: {
        typeId: vehicleType,
        name: 'Rättad blå bil',
        description: 'Bilens rättade uppgifter',
      },
    });
    const draftResponse = await callAssistant(app.origin, access_token, 'read_my_draft');
    const draft = JSON.parse((await draftResponse.json()).result.content[0].text);
    expect(draft.changes).toMatchObject([
      {
        before: { description: 'Bilens sparade uppgifter' },
        after: { description: 'Bilens rättade uppgifter' },
      },
    ]);
    expect(draft.current.objects).toContainEqual(
      expect.objectContaining({ id: 'car', description: 'Bilens sparade uppgifter' }),
    );
    expect(draft.current.objects.filter((object: { id: string }) => object.id !== 'car')).toEqual([
      { id: 'kim', typeId: personType, name: 'Kim' },
      { id: 'lo', typeId: personType, name: 'Lo' },
    ]);
    for (const excluded of ['övriga detaljer', 'Cykeln', 'Samlingen', 'Orelaterad', 'Hemligt'])
      expect(JSON.stringify(draft)).not.toContain(excluded);
  } finally {
    await app.close();
  }
});

test('AI-04: inloggning följs av medgivande och ett nej bevarar kartarbete', async ({
  page,
  request,
}) => {
  const app = await createInstallation();
  try {
    await signIn(request, app.origin);
    await createHousehold(request, app.origin);
    const flow = await beginAssistant(page.request, app.origin);
    await page.goto(flow.consentUrl.href);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(page.getByRole('heading', { name: 'Anslut extern assistent' })).toBeVisible();
    await page.route('http://127.0.0.1:7777/callback**', (route) =>
      route.fulfill({ body: 'Påhittad klient' }),
    );
    const callback = page.waitForRequest('http://127.0.0.1:7777/callback**');
    await page.getByRole('button', { name: 'Nej, anslut inte' }).click();
    expect(new URL((await callback).url()).searchParams.get('error')).toBe('access_denied');
    await page.goto(`${app.origin}/assistants`);
    await expect(page.getByText('Inga aktiva assistentanslutningar.')).toBeVisible();
    await page.getByRole('link', { name: 'Till kartan' }).click();
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('AI-05: eget utkast förblir privat och återkallad åtkomst stoppar klienten', async ({
  request,
  browser,
}) => {
  const app = await createInstallation();
  const other = await browser.newContext();
  try {
    await signIn(request, app.origin);
    const { household } = await (await createHousehold(request, app.origin)).json();
    app.setIdentity(robin);
    await signIn(other.request, app.origin, 'microsoft');
    const { user } = await (await other.request.get(`${app.origin}/api/bootstrap`)).json();
    const headers = { origin: app.origin };
    const base = `${app.origin}/api/households/${household.id}`;
    const { code } = await (
      await request.post(`${base}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    await other.request.post(`${app.origin}/api/invitations/accept`, { headers, data: { code } });
    const map = await (await request.get(`${base}/map`)).json();
    for (const [actor, id, name] of [
      [request, 'alex-private', 'Alex privata förslag'],
      [other.request, 'robin-private', 'Robins privata förslag'],
    ] as const) {
      expect(
        (
          await actor.post(`${base}/map/draft`, {
            headers,
            data: {
              version: 0,
              id,
              baseRevision: null,
              value: { typeId: map.types[0].id, name, description: '' },
            },
          })
        ).status(),
      ).toBe(200);
    }
    app.seedMembership(user.id, 'other-household', 'Hushållet Eken');
    const flow = await beginAssistant(other.request, app.origin);
    const consent = await flow.consent(household.id);
    const { access_token } = await (await flow.exchange((await consent.json()).url)).json();
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );
    const client = new Client({ name: 'Påhittad textassistent', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${access_token}` } },
      }),
    );
    try {
      const draft = await client.callTool({ name: 'read_my_draft', arguments: {} });
      expect(JSON.stringify(draft)).toContain('Robins privata förslag');
      expect(JSON.stringify(draft)).not.toContain('Alex privata');
      const denied = await client.callTool({
        name: 'read_map',
        arguments: { householdId: 'other-household' },
      });
      expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied)).not.toContain('Hushållet Eken');
      expect(
        (await request.post(`${base}/members/${user.id}/revoke`, { headers, data: {} })).status(),
      ).toBe(200);
      await expect(client.callTool({ name: 'read_my_draft', arguments: {} })).rejects.toThrow();
    } finally {
      await client.close();
    }
  } finally {
    await other.close();
    await app.close();
  }
});
