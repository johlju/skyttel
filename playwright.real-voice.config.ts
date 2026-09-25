import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/real-voice',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  captureGitInfo: { commit: true, diff: true },
  outputDir: 'test-results/real-voice/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/real-voice/results.json' }]],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
