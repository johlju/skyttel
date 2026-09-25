import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/real-model',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 600_000,
  captureGitInfo: { commit: true, diff: true },
  outputDir: 'test-results/real-model/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/real-model/results.json' }]],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
