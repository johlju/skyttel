import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { optimizationEvaluationPlan, prepareOptimizationCampaign } from './campaign.js';
import { evaluateModels } from './evaluate.js';

const [command, preparationPath, ...arguments_] = process.argv.slice(2);
if (command === 'prepare' && preparationPath && arguments_.length === 3) {
  const [evaluatorCommit, baselineDirectory, candidateDirectory] = arguments_;
  const campaign = await prepareOptimizationCampaign({
    evaluatorCommit,
    baselineDirectory,
    candidateDirectory,
  });
  await mkdir(dirname(preparationPath), { recursive: true });
  await writeFile(preparationPath, `${JSON.stringify(campaign, null, 2)}\n`, { flag: 'wx' });
  console.log(
    JSON.stringify({
      status: 'prepared_not_authorized',
      path: preparationPath,
      runs: campaign.runs.map((run) => run.id),
    }),
  );
} else if (command === 'run' && preparationPath && arguments_.length === 1) {
  const campaign = JSON.parse(await readFile(preparationPath, 'utf8')) as Awaited<
    ReturnType<typeof prepareOptimizationCampaign>
  >;
  const execution = JSON.parse(await readFile(arguments_[0], 'utf8'));
  if (
    execution.authorized !== true ||
    typeof execution.authorizationSource !== 'string' ||
    !execution.authorizationSource.trim()
  )
    throw new Error('evaluation_campaign_explicit_authorization_required');
  const fresh = await prepareOptimizationCampaign({
    evaluatorCommit: campaign.evaluatorCommit,
    baselineDirectory: campaign.applicationComparison.baseline.directory,
    candidateDirectory: campaign.applicationComparison.candidate.directory,
  });
  if (JSON.stringify(campaign) !== JSON.stringify(fresh))
    throw new Error('evaluation_campaign_preparation_changed');
  if (!['text', 'voice'].includes(execution.modality))
    throw new Error('evaluation_campaign_modality_invalid');
  const plan = optimizationEvaluationPlan({
    campaign,
    profile: execution.profile,
    modality: execution.modality,
    issue: execution.issue,
    directory: execution.directory,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    authorized: execution.authorized,
    priorUsd: execution.priorUsd,
    priorSource: execution.priorSource,
    limitUsd: execution.limitUsd,
    localVerification: execution.localVerification,
  });
  const result = await evaluateModels(plan);
  console.log(
    JSON.stringify({ status: 'recorded', directory: execution.directory, budget: result.budget }),
  );
} else {
  throw new Error(
    'Usage: campaign-driver.ts prepare OUTPUT EVALUATOR_COMMIT BASELINE_DIRECTORY CANDIDATE_DIRECTORY | run PREPARATION_JSON EXECUTION_JSON',
  );
}
