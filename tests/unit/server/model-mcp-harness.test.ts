import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { textModel as providerModel } from '../../../src/server/text-assistant-model.js';
import { beginAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { modelMcpClient, realModelKey } from '../../support/model-mcp.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

test('real model access requires an explicit switch and a private key', () => {
  expect(() => realModelKey({ OPENAI_API_KEY: 'synthetic-secret' })).toThrow(
    'SKYTTEL_REAL_MODEL_TESTS=1',
  );
  expect(() => realModelKey({ SKYTTEL_REAL_MODEL_TESTS: '1' })).toThrow('OPENAI_API_KEY');
  expect(realModelKey({ SKYTTEL_REAL_MODEL_TESTS: '1', OPENAI_API_KEY: 'synthetic-secret' })).toBe(
    'synthetic-secret',
  );
});

test('the model harness exposes an unwanted real MCP save instead of masking it with an intent filter', async () => {
  const app = await createInstallation();
  const browser = await request.newContext();
  let client: Awaited<ReturnType<typeof modelMcpClient>> | undefined;
  try {
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const initial = await (await browser.get(path)).json();
    const proposed = await browser.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: 0,
        contentVersion: initial.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Lo Exempel', description: '' },
      },
    });
    expect(proposed.status()).toBe(200);
    const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
    const accepted = await flow.consent(household.id);
    const tokens = await flow.exchange((await accepted.json()).url);
    let step = 0;
    const provider = textModel((body) => {
      expect(body.instructions).toContain('hypotetiska');
      expect(body.tools.map((tool) => tool.name)).toContain('save_draft');
      expect(
        body.input.some((item) => item.role === 'user' && item.content === 'Spara inte.'),
      ).toBe(true);
      if (step++ === 0) return [modelTool('read_my_draft', {})];
      if (step === 2) {
        const review = JSON.parse(lastToolResult(body).content[0].text);
        return [
          modelTool('save_draft', {
            version: review.version,
            contentVersion: review.contentVersion,
            operationId: 'intentionally-bad-model',
          }),
        ];
      }
      const saved = JSON.parse(lastToolResult(body).content[0].text);
      expect(saved.receipt.operationId).toBe('intentionally-bad-model');
      return [modelMessage('Sparat enligt kvittot.')];
    });
    client = await modelMcpClient(
      app.origin,
      (await tokens.json()).access_token,
      providerModel('synthetic-key', provider.provider),
    );
    const turn = await client.turn('Spara inte.');
    expect(turn.calls.map((call) => call.name)).toEqual(['read_my_draft', 'save_draft']);
    expect(turn.reply).toBe('Sparat enligt kvittot.');
    expect((await (await browser.get(path)).json()).objects).toMatchObject([
      { id: 'lo', name: 'Lo Exempel' },
    ]);
    expect((await (await browser.get(`${path}/history`)).json()).history).toHaveLength(1);
    expect(provider.requests).toHaveLength(3);
  } finally {
    await client?.close();
    await browser.dispose();
    await app.close();
  }
});
