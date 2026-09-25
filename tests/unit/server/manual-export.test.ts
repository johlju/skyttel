import { spawn } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { signIn } from '../../support/client.js';

test('manual export control proves unread server bytes and observes active demotion and revocation cleanup through public HTTP', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-export.ts']);
  const events: ReturnType<typeof JSON.parse>[] = [];
  let output = '';
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.once('exit', () => {
      exited = true;
      resolve();
    }),
  );
  child.stderr.on('data', (data) => {
    output += data;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    output += `${line}\n`;
    events.push(JSON.parse(line));
  });
  const browser = await request.newContext();
  async function next(event: string) {
    await expect
      .poll(() => events.some((item) => item.event === event || item.event === 'error') || exited, {
        timeout: 15_000,
      })
      .toBe(true);
    const index = events.findIndex((item) => item.event === event);
    expect(index, output).toBeGreaterThanOrEqual(0);
    return events.splice(index, 1)[0];
  }
  async function command(value: string, event: string) {
    child.stdin.write(`${value}\n`);
    return next(event);
  }
  try {
    const ready = await next('ready');
    await signIn(browser, ready.origin);
    const path = `${ready.origin}/api/households/${ready.householdId}/members/${ready.robinId}`;
    for (const action of ['role', 'revoke']) {
      expect(
        (
          await browser.post(`${path}/role`, {
            headers: { origin: ready.origin },
            data: { role: 'administrator' },
          })
        ).status(),
      ).toBe(200);
      const paused = await command('pause', 'paused');
      expect(paused.archiveBytes).toBeGreaterThan(16 * 1024 * 1024);
      expect(paused.receivedBytes).toBeGreaterThan(0);
      expect(paused.sourceReadBytes).toBeGreaterThan(0);
      expect(paused.sourceReadBytes).toBeLessThan(paused.archiveBytes);
      expect(paused.active).toBe(true);
      expect((await command('inspect', 'inspection')).active).toBe(true);
      expect(
        (
          await browser.post(`${path}/${action}`, {
            headers: { origin: ready.origin },
            data: action === 'role' ? { role: 'member' } : {},
          })
        ).status(),
      ).toBe(200);
      const result = await command('resume', 'result');
      expect(result.receivedBytes).toBeLessThan(result.archiveBytes);
      expect(result).toMatchObject({
        interrupted: true,
        scratchEmpty: true,
        retryStatus: 403,
        beforeExpiry: true,
      });
      expect(await readdir(ready.scratchDirectory)).toEqual([]);
    }
    await command('quit', 'closed');
    await exit;
    expect(child.exitCode).toBe(0);
    await expect(access(ready.directory)).rejects.toThrow();
    expect(output).not.toMatch(/synthetic-provider-token|session_token|set-cookie|Bearer /i);
  } finally {
    child.kill('SIGTERM');
    await exit;
    lines.close();
    await browser.dispose();
  }
}, 30_000);
