import { afterEach, expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import * as environments from '../../../scripts/model-evaluation/environment.js';
import { runVoiceScenario } from '../../../scripts/model-evaluation/voice-runner.js';
import { modelMessage, textModel } from '../../support/text-model.js';

afterEach(() => vi.restoreAllMocks());

test.each(['valid', 'foreign-row', 'short-tail', 'not-installed', 'empty-summary'])(
  'voice summary admission checks installation and the retained history: %s',
  { tags: ['technical'] },
  async (variant) => {
    const scenario = {
      id: 'voice-summary-admission',
      title: 'Retained source history',
      voice: true,
      steps: [{ id: 'summary', transition: 'summary' as const, expected: { requirements: [] } }],
    };
    const model = textModel(() => [modelMessage('Historiken är sammanfattad.')]);
    const environment = await environments.evaluationEnvironment(scenario, {
      modelFetch: model.provider,
    });
    const summarize = environment.installation.summarizeForEvaluation;
    vi.spyOn(environment.installation, 'summarizeForEvaluation').mockImplementation(
      async (...args) => {
        const summary = await summarize(...args);
        if (variant === 'foreign-row')
          summary.retained[0] = { role: 'user', text: 'Not in the supplied history' };
        if (variant === 'short-tail') summary.retained.pop();
        if (variant === 'not-installed') summary.installed = false;
        if (variant === 'empty-summary') summary.summary = '';
        return summary;
      },
    );
    vi.spyOn(environments, 'evaluationEnvironment').mockResolvedValue(environment);
    const result = await runVoiceScenario(
      scenario,
      { modelFetch: model.provider },
      {
        profile: 'local',
        repetition: 1,
      },
    );
    const attempt = result.attempts[0];
    if (variant === 'valid') expect(attempt.outcome).toBe('pass');
    else {
      expect(attempt.outcome).not.toBe('pass');
      expect(attempt.reason).toContain(
        variant === 'foreign-row' || variant === 'short-tail'
          ? 'evaluation_summary_tail_invalid'
          : 'evaluation_summary_installation_failed',
      );
    }
    expect(catalog.summaryHistory).toHaveLength(8);
  },
);
