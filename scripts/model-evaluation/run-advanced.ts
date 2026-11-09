import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { executeAdvancedCampaign, prepareAdvancedCampaign } from './advanced-campaign.js';

const [command, freezePath, executionPath] = process.argv.slice(2);
if (!freezePath)
  throw new Error(
    'Usage: run-advanced.ts prepare|preflight FREEZE_JSON | run FREEZE_JSON EXECUTION_JSON',
  );
if (command === 'prepare' && !executionPath) {
  const freeze = await prepareAdvancedCampaign();
  await writeFile(freezePath, `${JSON.stringify(freeze, null, 2)}\n`, { flag: 'wx' });
  console.log(
    JSON.stringify({ status: 'prepared_not_authorized', freezeSha256: freeze.freezeSha256 }),
  );
} else if (command === 'preflight' && !executionPath) {
  const freeze = JSON.parse(await readFile(freezePath, 'utf8'));
  const fresh = await prepareAdvancedCampaign();
  if (!isDeepStrictEqual(freeze, fresh)) throw new Error('evaluation_advanced_freeze_changed');
  console.log(
    JSON.stringify({
      status: 'preflight_passed_not_authorized',
      freezeSha256: freeze.freezeSha256,
      calibrationControls: freeze.judge.controlCount,
      runs: freeze.runs.map(({ id }: { id: string }) => id),
      maximumGrowthMessages: freeze.phaseB.maximumGrowthMessages,
      maximumUserMessages: freeze.phaseB.maximumUserMessages,
    }),
  );
} else if (command === 'run' && executionPath) {
  const result = await executeAdvancedCampaign(
    JSON.parse(await readFile(freezePath, 'utf8')),
    JSON.parse(await readFile(executionPath, 'utf8')),
    { apiKey: process.env.OPENAI_API_KEY },
  );
  console.log(JSON.stringify(result));
} else throw new Error('evaluation_advanced_command_invalid');
