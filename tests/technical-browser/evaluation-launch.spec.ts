import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

test('speech evaluation launched through tsx reaches the provider after browser setup', {
  tag: '@technical',
}, async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', 'tests/support/evaluation-speech-launch.ts'],
    { timeout: 25_000 },
  );
  expect(stdout).toContain('Speech connection reached the controlled provider through tsx.');
});
