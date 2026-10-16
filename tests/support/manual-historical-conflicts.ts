import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { prepareStorageChoice } from './test.js';

/** Exercise the documented command loop and its actual browser, without replacing HTTP. */
export async function launchHistoricalPreparation() {
  const originalDirectories = new Set(await readdir(tmpdir()));
  const server = await chromium.launchServer({
    headless: true,
    args: ['--remote-debugging-port=0'],
  });
  const profileArgument = server
    .process()
    .spawnargs.find((argument) => argument.startsWith('--user-data-dir='));
  if (!profileArgument) throw new Error('Missing browser profile directory');
  const profile = profileArgument.slice('--user-data-dir='.length);
  let activePort = '';
  await expect
    .poll(async () => {
      activePort = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
      return activePort;
    })
    .not.toBe('');
  const [port, path] = activePort.trim().split('\n');
  const endpoint = `ws://127.0.0.1:${port}${path}`;
  const browser = await chromium.connectOverCDP(endpoint);
  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/manual-conflict-continuity.ts',
    '--headless',
    '--browser-ws',
    endpoint,
  ]);
  let output = '';
  let diagnostic = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    diagnostic += data;
  });
  const exit = new Promise<number | null>((resolve) => child.once('exit', resolve));
  const directories = new Set<string>();
  async function rememberDirectories() {
    for (const directory of await readdir(tmpdir()))
      if (directory.startsWith('skyttel-test-') && !originalDirectories.has(directory))
        directories.add(join(tmpdir(), directory));
  }
  async function wait(expected: RegExp, offset = 0) {
    try {
      await expect
        .poll(() => output.slice(offset), { timeout: 15_000, message: diagnostic })
        .toMatch(expected);
    } catch (error) {
      console.error(
        'Preparation wait failed',
        output.slice(offset),
        browser.contexts().flatMap((context) => context.pages().map((page) => page.url())),
      );
      throw error;
    }
    return output.slice(offset);
  }
  async function command(line: string, expected: RegExp) {
    const offset = output.length;
    child.stdin.write(`${line}\n`);
    const result = await wait(expected, offset);
    await rememberDirectories();
    return result;
  }
  async function result() {
    const value = await command('result', /\n}\r?\n/);
    return JSON.parse(value.slice(value.indexOf('{'), value.lastIndexOf('}') + 1));
  }
  async function fresh(preparation: string) {
    const ready = await command(
      preparation,
      new RegExp(`Ready: ${preparation}, http://127\\.0\\.0\\.1:\\d+`),
    );
    const origin = ready.match(/Ready: \S+, (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (!origin) throw new Error('Missing prepared origin');
    let page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url().startsWith(origin));
    await expect
      .poll(() => {
        page = browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((page) => page.url().startsWith(origin));
        return Boolean(page);
      })
      .toBe(true);
    if (!page) throw new Error('Missing prepared browser page');
    await prepareStorageChoice(page.context());
    await page.reload();
    return { page, origin };
  }
  async function close() {
    try {
      child.stdin.write('quit\n');
      expect(await exit).toBe(0);
      for (const directory of directories)
        await expect
          .poll(async () =>
            (await readdir(tmpdir())).includes(directory.slice(tmpdir().length + 1)),
          )
          .toBe(false);
    } finally {
      child.kill('SIGTERM');
      await browser.close();
      await server.close();
    }
  }
  try {
    await wait(/Commands:/);
    await rememberDirectories();
    return { command, result, fresh, close, child };
  } catch (error) {
    child.kill('SIGTERM');
    await exit;
    await browser.close();
    await server.close();
    throw error;
  }
}
