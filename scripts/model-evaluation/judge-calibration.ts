import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { judgeInstructions } from './judge.js';
import controls from './judge-controls.json' with { type: 'json' };
import type { EvaluationProfile } from './provider.js';

export const judgeCalibrationReferenceSchema = z
  .object({
    directory: z.string().startsWith('/'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    /** Explicit freshness window; defaults to one day for mutable model aliases. */
    maxAgeHours: z.number().positive().optional(),
  })
  .strict();
export type JudgeCalibrationReference = z.infer<typeof judgeCalibrationReferenceSchema>;

type Identity = { profile: EvaluationProfile; origin: 'provider' | 'controlled' };
const root = fileURLToPath(new URL('../../', import.meta.url));
const implementationPaths = [
  'scripts/model-evaluation/judge.ts',
  'scripts/model-evaluation/provider.ts',
  'src/server/model-client.ts',
  'package-lock.json',
];
const envelope = z.object({
  format: z.literal('skyttel-model-evaluation'),
  version: z.literal(1),
  issue: z.number().int().positive(),
  type: z.string(),
  data: z.unknown(),
});
const verdicts = z.array(
  z.object({
    id: z.string(),
    outcome: z.enum(['pass', 'fail', 'inconclusive']),
    reason: z.string().min(1).max(500),
  }),
);
const controlSchema = z.object({
  id: z.string(),
  expected: z.record(z.string(), z.string()),
  result: verdicts,
  costUsd: z.number().nonnegative(),
});
const callSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['backend', 'summary', 'judge']),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  outcome: z.string(),
  costUsd: z.number().nonnegative().nullable(),
  request: z.record(z.string(), z.unknown()),
});

export function judgeCalibrationIdentity(profile: EvaluationProfile) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider: profile.provider,
        model: profile.model,
        effort: profile.effort,
        serviceTier: profile.serviceTier,
        outputLimit: profile.maxOutputTokens,
        instructions: judgeInstructions,
        controls,
      }),
    )
    .digest('hex');
}

/** Read only original, complete calibration evidence, never a reuse chain.
 * Preparing and consuming both validate it; the digest binds the intervening plan. */
async function inspectCalibration(directory: string, identity: Identity, maxAgeHours: number) {
  try {
    return await inspectCalibrationEvidence(directory, identity, maxAgeHours);
  } catch (error) {
    if (error instanceof Error && error.message === 'evaluation_judge_calibration_expired')
      throw error;
    throw new Error('evaluation_judge_calibration_invalid', { cause: error });
  }
}

async function inspectCalibrationEvidence(
  directory: string,
  identity: Identity,
  maxAgeHours: number,
) {
  const invalid = () => new Error('evaluation_judge_calibration_invalid');
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw invalid();
  const names = (await readdir(directory))
    .filter((name) => /^\d+-(manifest|judge_control)\.json$/.test(name))
    .sort();
  const digest = createHash('sha256');
  const records = await Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(join(directory, name));
      return { name, bytes, record: envelope.parse(JSON.parse(bytes.toString())) };
    }),
  );
  for (const { name, bytes } of records) digest.update(name).update('\0').update(bytes);
  const manifests = records.filter(({ record }) => record.type === 'manifest');
  if (manifests.length !== 1) throw invalid();
  const manifestRecord = manifests[0].record;
  const manifest = z
    .object({
      origin: z.enum(['provider', 'controlled']),
      commit: z.string().regex(/^[a-f0-9]{40}$/),
      judgeSha256: z.string(),
      judgeProfile: z.unknown(),
    })
    .parse(manifestRecord.data);
  if (
    manifest.origin !== identity.origin ||
    manifest.judgeSha256 !== judgeCalibrationIdentity(identity.profile) ||
    !isDeepStrictEqual(manifest.judgeProfile, identity.profile)
  )
    throw invalid();
  // Application changes do not invalidate the judge. Its implementation and
  // SDK/transport dependencies do, including uncommitted local changes.
  for (const path of implementationPaths) {
    const previous = execFileSync('git', ['show', `${manifest.commit}:${path}`], {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!previous.equals(await readFile(join(root, path)))) throw invalid();
  }
  const saved = records.filter(({ record }) => record.type === 'judge_control');
  if (
    saved.length !== controls.cases.length ||
    saved.some(({ record }) => record.issue !== manifestRecord.issue)
  )
    throw invalid();
  const capture = await readFile(join(directory, 'private-calls.jsonl.gz'));
  digest.update('private-calls.jsonl.gz\0').update(capture);
  const snapshots = gunzipSync(capture)
    .toString()
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line))
    .filter(
      (record) =>
        !(
          record &&
          typeof record === 'object' &&
          'kind' in record &&
          record.kind === 'voice_dispatch'
        ),
    )
    .map((record) => callSchema.parse(record));
  const calls = [...new Map(snapshots.map((call) => [call.id, call])).values()]
    .filter((call) => call.kind === 'judge')
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, controls.cases.length);
  if (calls.length !== controls.cases.length) throw invalid();
  let originalCostUsd = 0;
  for (const [index, control] of controls.cases.entries()) {
    const data = controlSchema.parse(saved[index].record.data);
    const expected = Object.fromEntries(
      Object.entries(control.expected).filter((entry) => typeof entry[1] === 'string'),
    );
    const call = calls[index];
    const request = call.request;
    if (
      data.id !== control.id ||
      !isDeepStrictEqual(data.expected, expected) ||
      data.result.length !== Object.keys(expected).length ||
      new Set(data.result.map((item) => item.id)).size !== data.result.length ||
      data.result.some((item) => expected[item.id] !== item.outcome) ||
      call.outcome !== 'completed' ||
      !Number.isFinite(call.startedAt) ||
      !Number.isFinite(call.endedAt) ||
      (call.endedAt ?? 0) < call.startedAt ||
      call.costUsd === null ||
      !Number.isFinite(call.costUsd) ||
      call.costUsd < 0 ||
      Math.abs(call.costUsd - data.costUsd) > 1e-8 ||
      request.model !== identity.profile.model ||
      !isDeepStrictEqual(request.reasoning, { effort: identity.profile.effort }) ||
      request.service_tier !== identity.profile.serviceTier ||
      request.max_output_tokens !== identity.profile.maxOutputTokens ||
      request.instructions !== judgeInstructions ||
      !isDeepStrictEqual(request.input, [
        {
          role: 'user',
          content: JSON.stringify({
            context: control.context,
            sources: control.sources,
            requirements: control.requirements,
          }),
        },
      ])
    )
      throw invalid();
    originalCostUsd += call.costUsd;
  }
  const completedAt = Math.max(...calls.map((call) => call.endedAt ?? 0));
  const ageMs = Date.now() - completedAt;
  if (ageMs < 0 || ageMs > maxAgeHours * 60 * 60 * 1000)
    throw new Error('evaluation_judge_calibration_expired');
  return {
    directory: resolve(directory),
    sha256: digest.digest('hex'),
    maxAgeHours,
    issue: manifestRecord.issue,
    commit: manifest.commit,
    judgeSha256: manifest.judgeSha256,
    origin: manifest.origin,
    completedAt: new Date(completedAt).toISOString(),
    ageMs,
    controls: saved.length,
    originalCostUsd,
    newCostUsd: 0,
    newCalls: 0,
  };
}

export async function prepareJudgeCalibration(
  directory: string,
  identity: Identity,
  maxAgeHours = 24,
): Promise<JudgeCalibrationReference> {
  const evidence = await inspectCalibration(directory, identity, maxAgeHours);
  return { directory: evidence.directory, sha256: evidence.sha256, maxAgeHours };
}

/** Invalid selected evidence stops before dispatch; never fall back to paid controls. */
export async function reuseJudgeCalibration(
  reference: JudgeCalibrationReference,
  identity: Identity,
) {
  const evidence = await inspectCalibration(
    reference.directory,
    identity,
    reference.maxAgeHours ?? 24,
  );
  if (evidence.sha256 !== reference.sha256) throw new Error('evaluation_judge_calibration_changed');
  return evidence;
}
