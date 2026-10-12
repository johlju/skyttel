import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { privateEvaluationRecords } from '../../../scripts/model-evaluation/private-records.js';

test('private observations and calls persist incrementally without aggregating the run', {
  tags: ['technical'],
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-private-records-'));
  const records = privateEvaluationRecords(directory);
  try {
    const first = {
      kind: 'mcp_completed',
      data: { name: 'read_my_draft', result: 'Å'.repeat(50_000) },
    };
    records.observation(first);
    expect(
      gunzipSync(await readFile(join(directory, 'private-observations.jsonl.gz'))).toString(),
    ).toBe(`${JSON.stringify(first)}\n`);
    const second = { kind: 'model_action', data: { name: 'save_draft', callId: 'observed-call' } };
    records.observation(second);
    const call = {
      id: 'provider-call',
      request: { model: 'supplied' },
      response: { usage: { input_tokens: 20 } },
    };
    records.call(call);
    records.close();
    expect(
      gunzipSync(await readFile(join(directory, 'private-observations.jsonl.gz')))
        .toString()
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([first, second]);
    expect(gunzipSync(await readFile(join(directory, 'private-calls.jsonl.gz'))).toString()).toBe(
      `${JSON.stringify(call)}\n`,
    );
  } finally {
    records.close();
    await rm(directory, { recursive: true, force: true });
  }
});
