import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';
import { ModelClient } from '../../src/server/model-client.js';
import catalog from './catalog.json' with { type: 'json' };
import { scenarioUtterances } from './follow-ups.js';
import type { Catalog } from './types.js';

export const speechRecipe = {
  model: 'gpt-4o-mini-tts',
  voices: ['marin', 'cedar'],
  instructions:
    'Läs den givna texten ordagrant på tydlig, naturlig svenska med normalt samtalstempo. Uttala svenska sammansatta ord sammanhängande och egennamn omsorgsfullt. Bevara alla namn, belopp och relationer. Låt det låta som en person som ger ett uppdrag i ett samtal.',
  speeds: { marin: 1.15, cedar: 1.25 } as Record<string, number>,
  sampleRate: 24000,
  pricing: {
    checkedAt: '2026-10-12',
    inputUsdPerMillion: 0.6,
    outputUsdPerMillion: 12,
    source: 'https://developers.openai.com/api/docs/models/gpt-4o-mini-tts',
  },
};

type SpeechRecord = {
  id: string;
  voice: string;
  model: string;
  synthetic: boolean;
  text: string;
  instructions: string;
  speed: number;
  file: string;
  sha256: string;
  frames: number;
  sampleRate: number;
  channels: number;
  sampleWidth: number;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  requestId: string | null;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  costUsd: number;
  humanReview: string;
};
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function speechWav(pcm: Buffer) {
  if (!pcm.length || pcm.length % 2) throw new Error('invalid_speech_pcm');
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(speechRecipe.sampleRate, 24);
  header.writeUInt32LE(speechRecipe.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Reuse complete matching artifacts; an unfinished request requires investigation,
 * never an automatic second charge. Provider payloads remain in the output directory. */
export async function generateSpeech({
  directory,
  create,
  ids,
  voices = speechRecipe.voices,
  speed,
  progress = () => {},
}: {
  directory: string;
  create: (request: SpeechCreateParams) => Promise<Response>;
  ids?: string[];
  voices?: string[];
  speed?: number;
  progress?: (record: { id: string; voice: string; reused: boolean }) => void;
}) {
  if (
    !voices.length ||
    new Set(voices).size !== voices.length ||
    voices.some((voice) => !speechRecipe.voices.includes(voice)) ||
    (speed !== undefined && (!Number.isFinite(speed) || speed < 0.25 || speed > 4))
  )
    throw new Error('invalid_speech_settings');
  const recipe = {
    ...speechRecipe,
    voices,
    speeds: Object.fromEntries(voices.map((voice) => [voice, speed ?? speechRecipe.speeds[voice]])),
  };
  const steps = (catalog as Catalog).scenarios
    .filter((scenario) => scenario.voice)
    .flatMap((scenario) => scenarioUtterances(scenario, true));
  if (ids?.some((id) => !steps.some((step) => step.id === id)))
    throw new Error('unknown_speech_step');
  const records: SpeechRecord[] = [];
  for (const voice of recipe.voices) {
    await mkdir(resolve(directory, voice), { recursive: true });
    for (const step of steps.filter((step) => ids === undefined || ids.includes(step.id))) {
      const stem = resolve(directory, voice, step.id);
      const request = {
        model: speechRecipe.model,
        voice,
        input: step.text,
        instructions: speechRecipe.instructions,
        speed: recipe.speeds[voice],
        response_format: 'pcm' as const,
        stream_format: 'sse' as const,
      };
      let existing: SpeechRecord | undefined;
      try {
        existing = JSON.parse(await readFile(`${stem}.result.json`, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (existing) {
        const oldRequest = JSON.parse(await readFile(`${stem}.request.json`, 'utf8'));
        const bytes = await readFile(`${stem}.wav`);
        if (
          Object.entries(request).some(([key, value]) => oldRequest[key] !== value) ||
          existing.text !== step.text ||
          existing.voice !== voice ||
          existing.model !== request.model ||
          existing.sha256 !== hash(bytes) ||
          !Number.isFinite(existing.costUsd) ||
          existing.costUsd < 0
        )
          throw new Error(`speech_artifact_mismatch:${voice}/${step.id}`);
        records.push(existing);
        progress({ id: step.id, voice, reused: true });
      } else {
        await writeFile(`${stem}.request.json`, json(request), { flag: 'wx', mode: 0o600 });
        const startedAt = new Date().toISOString();
        await writeFile(`${stem}.started.json`, json({ startedAt }), { flag: 'wx' });
        const response = await create(request);
        const body = await response.text();
        await writeFile(`${stem}.events.txt`, body, { flag: 'wx', mode: 0o600 });
        const events = body
          .replaceAll('\r\n', '\n')
          .split('\n\n')
          .flatMap((block) => {
            const value = block
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n');
            return value && value !== '[DONE]' ? [JSON.parse(value)] : [];
          });
        const chunks = events
          .filter((event) => event.type === 'speech.audio.delta')
          .map((event) => Buffer.from(event.audio, 'base64'));
        const done = events.filter((event) => event.type === 'speech.audio.done');
        if (done.length !== 1 || !chunks.length || events.some((event) => event.type === 'error'))
          throw new Error('speech_incomplete');
        const pcm = Buffer.concat(chunks);
        const bytes = speechWav(pcm);
        await writeFile(`${stem}.wav`, bytes, { flag: 'wx' });
        const usage = done[0].usage;
        if (
          !usage ||
          !Number.isSafeInteger(usage.input_tokens) ||
          usage.input_tokens < 0 ||
          !Number.isSafeInteger(usage.output_tokens) ||
          usage.output_tokens <= 0
        )
          throw new Error('speech_usage_unknown');
        const costUsd =
          (usage.input_tokens * speechRecipe.pricing.inputUsdPerMillion +
            usage.output_tokens * speechRecipe.pricing.outputUsdPerMillion) /
          1_000_000;
        const record: SpeechRecord = {
          id: step.id,
          voice,
          model: request.model,
          synthetic: true,
          text: step.text,
          instructions: request.instructions,
          speed: request.speed,
          file: `${voice}/${step.id}.wav`,
          sha256: hash(bytes),
          frames: pcm.length / 2,
          sampleRate: speechRecipe.sampleRate,
          channels: 1,
          sampleWidth: 2,
          durationSeconds: pcm.length / (speechRecipe.sampleRate * 2),
          startedAt,
          endedAt: new Date().toISOString(),
          requestId: response.headers.get('x-request-id'),
          usage,
          costUsd,
          humanReview: 'pending',
        };
        await writeFile(`${stem}.result.json`, json(record), { flag: 'wx', mode: 0o600 });
        records.push(record);
        progress({ id: step.id, voice, reused: false });
      }
    }
  }
  const result = {
    synthetic: true,
    purpose: 'Human listening review; qualification requires reviewed audio fixtures.',
    recipe,
    generatorSha256: hash(await readFile(new URL(import.meta.url))),
    costUsd: records.reduce((sum, record) => sum + record.costUsd, 0),
    records,
  };
  const manifestPath = resolve(directory, `manifest.${randomUUID()}.json`);
  await writeFile(manifestPath, json(result), { flag: 'wx', mode: 0o600 });
  return { ...result, manifestPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      output: { type: 'string' },
      step: { type: 'string', multiple: true },
      voice: { type: 'string', multiple: true },
      speed: { type: 'string' },
      'env-file': { type: 'string' },
    },
  });
  if (!values.output) throw new Error('Specify --output in an ignored private directory.');
  if (values['env-file']) process.loadEnvFile(values['env-file']);
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
  const client = new ModelClient({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    logLevel: 'off',
  });
  const result = await generateSpeech({
    directory: resolve(values.output),
    ids: values.step,
    voices: values.voice,
    speed: values.speed === undefined ? undefined : Number(values.speed),
    create: client.audio.speech.create.bind(client.audio.speech),
    progress: (record) => console.log(JSON.stringify(record)),
  });
  console.log(JSON.stringify({ manifestPath: result.manifestPath }));
}
