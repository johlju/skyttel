import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { scenarioUtterances } from '../../../scripts/model-evaluation/follow-ups.js';
import { generateSpeech, speechRecipe } from '../../../scripts/model-evaluation/generate-speech.js';
import type { Catalog } from '../../../scripts/model-evaluation/types.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'skyttel-speech-'));
  directories.push(path);
  return path;
}
function response(usage: unknown = { input_tokens: 100, output_tokens: 25, total_tokens: 125 }) {
  return new Response(
    [
      { type: 'speech.audio.delta', audio: Buffer.from([0, 0, 10, 0]).toString('base64') },
      { type: 'speech.audio.done', usage },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join(''),
  );
}

test.each([undefined, [], ['kort-utan-sparande']])(
  'speech generation respects explicit step selection: %j',
  { tags: ['technical'] },
  async (ids) => {
    const create = vi.fn(async () => response());
    const result = await generateSpeech({
      directory: await directory(),
      create,
      ids,
      voices: ['marin'],
    });
    const expected =
      ids ??
      (catalog as Catalog).scenarios
        .filter((scenario) => scenario.voice)
        .flatMap((scenario) => scenarioUtterances(scenario, true))
        .map((step) => step.id);
    expect(result.records.map((record) => record.id)).toEqual(expected);
    expect(create).toHaveBeenCalledTimes(expected.length);
  },
);

test('partial generation preserves prior manifests and writes independently reviewable runs', {
  tags: ['technical'],
}, async () => {
  const output = await directory();
  const create = vi.fn(async () => response());
  const first = await generateSpeech({ directory: output, create, voices: ['marin'] });
  const original = await readFile(first.manifestPath, 'utf8');
  // A directory-wide manifest from an earlier generator must also survive.
  await writeFile(join(output, 'manifest.json'), original);
  const partial = await generateSpeech({
    directory: output,
    create,
    voices: ['marin'],
    ids: ['kort-utan-sparande'],
  });
  expect(partial.manifestPath).not.toBe(first.manifestPath);
  expect(await readFile(first.manifestPath, 'utf8')).toBe(original);
  expect(await readFile(join(output, 'manifest.json'), 'utf8')).toBe(original);
  expect(JSON.parse(await readFile(partial.manifestPath, 'utf8')).records).toEqual(partial.records);
  expect(partial.records).toHaveLength(1);
  expect(create).toHaveBeenCalledTimes(first.records.length);
});

test('speech generation reuses complete matching audio without a second provider charge', {
  tags: ['technical'],
}, async () => {
  const output = await directory();
  const create = vi.fn(async () => response());
  const options = { directory: output, create, ids: ['kort-utan-sparande'] };
  const result = await generateSpeech(options);
  expect(result.records.map((record) => record.voice)).toEqual(['marin']);
  expect(result.costUsd).toBeCloseTo(0.00036);
  const bytes = await readFile(join(output, 'marin/kort-utan-sparande.wav'));
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.readUInt32LE(24)).toBe(24000);
  expect(bytes.readUInt32LE(40)).toBe(4);
  expect(result.records[0].humanReview).toBe('pending');
  expect((await generateSpeech(options)).records).toEqual(result.records);
  expect(create).toHaveBeenCalledOnce();
});

test.each(['text', 'audio'])(
  'speech generation rejects changed %s before reusing or paying for an artifact',
  { tags: ['technical'] },
  async (variant) => {
    const output = await directory();
    const create = vi.fn(async () => response());
    const options = { directory: output, create, ids: ['kort-utan-sparande'] };
    await generateSpeech(options);
    const stem = join(output, 'marin/kort-utan-sparande');
    if (variant === 'audio') await writeFile(`${stem}.wav`, 'corrupt');
    else {
      const request = JSON.parse(await readFile(`${stem}.request.json`, 'utf8'));
      request.input = 'Annan text.';
      await writeFile(`${stem}.request.json`, JSON.stringify(request));
    }
    await expect(generateSpeech(options)).rejects.toThrow('speech_artifact_mismatch');
    expect(create).toHaveBeenCalledOnce();
  },
);

test('unknown speech usage preserves received audio and prevents automatic paid retries', {
  tags: ['technical'],
}, async () => {
  const output = await directory();
  const create = vi.fn(async () => response(null));
  const options = { directory: output, create, ids: ['kort-utan-sparande'] };
  await expect(generateSpeech(options)).rejects.toThrow('speech_usage_unknown');
  expect((await readFile(join(output, 'marin/kort-utan-sparande.wav'))).length).toBe(48);
  await expect(generateSpeech(options)).rejects.toThrow('EEXIST');
  expect(create).toHaveBeenCalledOnce();
});

test('invalid scenario selection fails before any provider call', {
  tags: ['technical'],
}, async () => {
  const create = vi.fn(async () => response());
  await expect(
    generateSpeech({ directory: await directory(), create, ids: ['missing'] }),
  ).rejects.toThrow('unknown_speech_step');
  expect(create).not.toHaveBeenCalled();
  expect(speechRecipe.voices).toEqual(['marin']);
});

test('a selected voice and speed are recorded and reused without changing other defaults', {
  tags: ['technical'],
}, async () => {
  const create = vi.fn(async () => response());
  const options = {
    directory: await directory(),
    create,
    ids: ['fragor-och-andringar'],
    voices: ['marin'],
    speed: 1.1,
  };
  const result = await generateSpeech(options);
  expect(create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ voice: 'marin', speed: 1.1 }),
  );
  expect(result.records).toHaveLength(1);
  expect(result.recipe).toMatchObject({ voices: ['marin'], speeds: { marin: 1.1 } });
  await generateSpeech(options);
  expect(create).toHaveBeenCalledOnce();
  await expect(generateSpeech({ ...options, speed: 1.2 })).rejects.toThrow(
    'speech_artifact_mismatch',
  );
  expect(create).toHaveBeenCalledOnce();
  expect(speechRecipe.speeds).toEqual({ marin: 1.15 });
});

test.each([
  { voices: ['unknown'] },
  { voices: [] },
  { voices: ['marin', 'marin'] },
  { speed: Number.NaN },
  { speed: 0 },
  { speed: 5 },
])('invalid speech settings fail before payment: %j', { tags: ['technical'] }, async (settings) => {
  const create = vi.fn(async () => response());
  await expect(
    generateSpeech({
      directory: await directory(),
      create,
      ids: ['kort-utan-sparande'],
      ...settings,
    }),
  ).rejects.toThrow('invalid_speech_settings');
  expect(create).not.toHaveBeenCalled();
});
