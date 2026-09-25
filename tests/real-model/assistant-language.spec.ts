import { expect, test } from '@playwright/test';
import { type TextModelAttempt, textModel } from '../../src/server/text-assistant-model.js';
import { beginAssistant } from '../support/assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { modelMcpClient, realModelKey } from '../support/model-mcp.js';

test.beforeAll(() => {
  realModelKey();
});

test('AI-12: verklig modell skiljer nekade och hypotetiska besked från rättelse och sparande', async ({
  request,
}, testInfo) => {
  const app = await createInstallation();
  let model: Awaited<ReturnType<typeof modelMcpClient>> | undefined;
  const attempts = new Map<string, TextModelAttempt>();
  try {
    await signIn(request, app.origin);
    const created = await createHousehold(request, app.origin, 'Påhittat språkprov');
    expect(created.status()).toBe(201);
    const { household } = await created.json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const read = async () => (await request.get(path)).json();
    const initial = await read();
    const person = initial.types.find((type: { name: string }) => type.name === 'Person');
    const proposed = await request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: initial.draft.version,
        contentVersion: initial.contentVersion,
        id: 'lo-language-case',
        baseRevision: null,
        value: { typeId: person.id, name: 'Lo Exempel', description: 'Spelar piano.' },
      },
    });
    expect(proposed.status()).toBe(200);
    const baseline = await read();
    const history = await (await request.get(`${path}/history`)).json();
    const operations = await (await request.get(`${path}/operations`)).json();
    const flow = await beginAssistant(request, app.origin, 'skyttel:read skyttel:write');
    const consent = await flow.consent(household.id);
    expect(consent.status()).toBe(200);
    const tokens = await flow.exchange((await consent.json()).url);
    expect(tokens.status).toBe(200);
    model = await modelMcpClient(
      app.origin,
      (await tokens.json()).access_token,
      textModel(realModelKey(), undefined, (attempt) => attempts.set(attempt.attemptId, attempt)),
    );
    for (const message of [
      'Läs och sammanfatta hela mitt utkast utan att ändra något.',
      'Spara inte ändringarna.',
      'Vad händer om vi sparar hela utkastet?',
      'Spara senare, inte nu.',
      'Förklara vad meningen ”Spara hela utkastet” betyder. Utför den inte.',
    ]) {
      const turn = await model.turn(message);
      expect(turn.reply.trim()).not.toBe('');
      expect(turn.calls.map((call) => call.name)).not.toContain('prepare_save');
      expect(turn.calls.map((call) => call.name)).not.toContain('save_draft');
      expect(await read()).toEqual(baseline);
      expect(await (await request.get(`${path}/history`)).json()).toEqual(history);
      expect(await (await request.get(`${path}/operations`)).json()).toEqual(operations);
    }
    const saved = await model.turn(
      'Ändra namnet på Lo Exempel i mitt utkast till Lo Lind och spara hela utkastet nu. ' +
        'Det är samma person. Behåll beskrivningen.',
    );
    expect(saved.calls.some((call) => call.name === 'propose_object')).toBe(true);
    expect(saved.calls.some((call) => call.name === 'save_draft')).toBe(true);
    const after = await read();
    expect(after.objects).toEqual([
      expect.objectContaining({
        id: 'lo-language-case',
        name: 'Lo Lind',
        description: 'Spelar piano.',
      }),
    ]);
    expect(after.draft.changes).toEqual([]);
    const savedHistory = await (await request.get(`${path}/history`)).json();
    expect(savedHistory.history).toHaveLength(1);
    expect(savedHistory.history[0].changes).toEqual([
      expect.objectContaining({ after: expect.objectContaining({ name: 'Lo Lind' }) }),
    ]);
    const savedOperations = await (await request.get(`${path}/operations`)).json();
    expect(savedOperations.operations).toHaveLength(1);
    expect(savedOperations.operations[0]).toMatchObject({
      status: 'succeeded',
      receipt: savedHistory.history[0],
    });
    await app.restart();
    expect((await read()).objects).toEqual(after.objects);
    expect(await (await request.get(`${path}/history`)).json()).toEqual(savedHistory);
    expect(await (await request.get(`${path}/operations`)).json()).toEqual(savedOperations);
  } finally {
    await testInfo.attach('real-model-evidence', {
      body: JSON.stringify(
        {
          client: 'Skyttel språkprov MCP SDK client',
          model: 'gpt-5.6-terra',
          reasoning: 'low',
          executedAt: new Date().toISOString(),
          turns: model?.turns ?? [],
          attempts: [...attempts.values()],
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    await model?.close();
    await app.close();
  }
});

test('AI-08: verklig modell rättar och sparar hela familjeärendet genom MCP', async ({
  request,
}, testInfo) => {
  const app = await createInstallation();
  let model: Awaited<ReturnType<typeof modelMcpClient>> | undefined;
  const attempts = new Map<string, TextModelAttempt>();
  try {
    const household = app.seedDemo();
    await signIn(request, app.origin);
    const path = `${app.origin}/api/households/${household.id}/map`;
    const read = async () => (await request.get(path)).json();
    const before = await read();
    const operationsBefore = (await (await request.get(`${path}/operations`)).json()).operations;
    const flow = await beginAssistant(request, app.origin, 'skyttel:read skyttel:write');
    const consent = await flow.consent(household.id);
    expect(consent.status()).toBe(200);
    const tokens = await flow.exchange((await consent.json()).url);
    expect(tokens.status).toBe(200);
    model = await modelMcpClient(
      app.origin,
      (await tokens.json()).access_token,
      textModel(realModelKey(), undefined, (attempt) => attempts.set(attempt.attemptId, attempt)),
    );
    const review = await model.turn(
      'Läs hela mitt utkast. Behåll mitt förslag Lo Lind i namnkonflikten och behåll ' +
        'pianobeskrivningen. Läs Familjens Molnmusik och skilj den som står på avtalet ' +
        'från den som betalar och kortet som används. Sammanfatta hela utkastet utan att spara.',
    );
    expect(review.calls.map((call) => call.name)).not.toContain('prepare_save');
    expect(review.calls.map((call) => call.name)).not.toContain('save_draft');
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).relationships).toEqual(before.relationships);
    const saved = await model.turn(
      'Ändra priset för Familjens Molnmusik till 189 SEK per månad och spara hela utkastet nu, ' +
        'inklusive tidigare förslag om Lo Lind och inloggningsadressen musik@example.test.',
    );
    expect(saved.calls.map((call) => call.name)).toContain('propose_object');
    expect(saved.calls.map((call) => call.name)).toContain('save_draft');
    const after = await read();
    const music = after.objects.find(
      (object: { name: string }) => object.name === 'Familjens Molnmusik',
    );
    expect(music.financialFacts).toMatchObject({
      price: { knowledge: 'known', value: '189' },
      currency: { knowledge: 'known', value: 'SEK' },
      paymentInterval: { knowledge: 'known', value: 'månad' },
    });
    const lo = after.objects.find((object: { name: string }) => object.name === 'Lo Lind');
    expect(lo).toMatchObject({ description: 'Spelar piano i musikföreningen.' });
    const account = after.objects.find(
      (object: { name: string }) => object.name === 'Familjens musikkonto',
    );
    const address = after.objects.find(
      (object: { name: string }) => object.name === 'musik@example.test',
    );
    const loginType = after.relationshipTypes.find(
      (type: { name: string }) => type.name === 'Inloggningsadress',
    );
    expect(after.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: account.id,
          targetId: address.id,
          typeId: loginType.id,
        }),
      ]),
    );
    expect(after.draft.changes).toEqual([]);
    expect(after.draft.relationships ?? []).toEqual([]);
    const operations = (await (await request.get(`${path}/operations`)).json()).operations;
    const newOperations = operations.filter(
      (operation: { operationId: string }) =>
        !operationsBefore.some(
          (previous: { operationId: string }) => previous.operationId === operation.operationId,
        ),
    );
    expect(newOperations).toHaveLength(1);
    const savedOperation = newOperations[0];
    expect(savedOperation.status).toBe('succeeded');
    expect(savedOperation.receipt.changes).toHaveLength(2);
    expect(savedOperation.receipt.relationships).toHaveLength(1);
    const changedIds = new Set([music.id, lo.id]);
    expect(after.objects.filter((object: { id: string }) => !changedIds.has(object.id))).toEqual(
      before.objects.filter((object: { id: string }) => !changedIds.has(object.id)),
    );
    const changedRelationship = savedOperation.receipt.relationships[0].id;
    expect(
      after.relationships.filter((edge: { id: string }) => edge.id !== changedRelationship),
    ).toEqual(
      before.relationships.filter((edge: { id: string }) => edge.id !== changedRelationship),
    );
    await app.restart();
    expect((await read()).objects).toEqual(after.objects);
    expect((await read()).relationships).toEqual(after.relationships);
    expect((await (await request.get(`${path}/operations`)).json()).operations).toEqual(operations);
  } finally {
    await testInfo.attach('real-model-evidence', {
      body: JSON.stringify(
        {
          client: 'Skyttel språkprov MCP SDK client',
          model: 'gpt-5.6-terra',
          reasoning: 'low',
          executedAt: new Date().toISOString(),
          turns: model?.turns ?? [],
          attempts: [...attempts.values()],
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    await model?.close();
    await app.close();
  }
});
