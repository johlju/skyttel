import { expect, test } from 'vitest';
import { summarizeConversation } from '../../../src/server/conversation-summary.js';
import { textModel as createModel } from '../../../src/server/text-assistant-model.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

test('summary requests share the configured provider, preserve historical uncertainty and are bounded without tools or storage', async () => {
  const model = textModel(() => [modelMessage('Historiska fakta och obesvarad fråga.')]);
  const fetchProvider: typeof fetch = async (input, init) => {
    expect(String(input)).toBe('https://api.openai.com/v1/responses');
    expect(JSON.parse(String(init?.body)).max_output_tokens).toBe(4096);
    return model.provider(input, init);
  };
  const summary = await summarizeConversation(
    createModel('synthetic-key', fetchProvider),
    `Privat första del. ${'a'.repeat(240_000)} Sista rättelsen.`,
    new AbortController().signal,
    () => {},
  );
  expect(summary).toBe('Historiska fakta och obesvarad fråga.');
  expect(model.requests).toHaveLength(2);
  expect(
    model.requests.every(
      (request) => request.model === 'gpt-5.6-terra' && !request.store && !request.tools.length,
    ),
  ).toBe(true);
  expect(JSON.stringify(model.requests[0].input)).toContain('Privat första del.');
  expect(JSON.stringify(model.requests[1].input)).toContain('Sista rättelsen.');
  expect(JSON.stringify(model.requests[1].input)).toContain('Historiska fakta');
});

test.each([
  { name: 'empty', output: [] },
  { name: 'tool', output: [modelTool('save_draft', {})] },
  { name: 'blank', output: [modelMessage(' ')] },
  { name: 'oversized', output: [modelMessage('x'.repeat(16_001))] },
])('unusable $name provider summary cannot replace context', async ({ output }) => {
  const model = textModel(() => output);
  await expect(
    summarizeConversation(
      createModel('synthetic-key', model.provider),
      'Privat källa.',
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('invalid_context_summary');
});

test('incomplete output and lost authority after provider await cannot install a summary', async () => {
  const model = textModel(() => [modelMessage('En ofullständig sammanfattning.')]);
  const incomplete: typeof fetch = async (input, init) => {
    const body = await (await model.provider(input, init)).json();
    return Response.json({ ...body, status: 'incomplete' });
  };
  await expect(
    summarizeConversation(
      createModel('synthetic-key', incomplete),
      'Källa.',
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('invalid_context_summary');
  let allowed = true;
  const revoked: typeof fetch = async (input, init) => {
    const result = await model.provider(input, init);
    allowed = false;
    return result;
  };
  await expect(
    summarizeConversation(
      createModel('synthetic-key', revoked),
      'Källa.',
      new AbortController().signal,
      () => {
        if (!allowed) throw new Error('revoked');
      },
    ),
  ).rejects.toThrow('revoked');
});
