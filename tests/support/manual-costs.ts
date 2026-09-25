import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function launchManualCosts() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-costs.ts']);
  const events: Record<string, unknown>[] = [];
  let changed = () => {};
  let diagnostic = '';
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.once('exit', () => {
      exited = true;
      changed();
      resolve();
    }),
  );
  const lines = createInterface({ input: child.stdout });
  child.stderr.on('data', (value) => {
    diagnostic += value;
  });
  lines.on('line', (line) => {
    diagnostic += `${line}\n`;
    try {
      events.push(JSON.parse(line));
      changed();
    } catch {
      // Keep non-JSON build/runtime diagnostics for failure reporting.
    }
  });
  function next(event: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(diagnostic)), 10_000);
      changed = () => {
        const index = events.findIndex((item) => item.event === event || item.event === 'error');
        if (index === -1 && !exited) return;
        clearTimeout(timeout);
        changed = () => {};
        const item = index === -1 ? undefined : events.splice(index, 1)[0];
        if (!item || item.event === 'error') reject(new Error(diagnostic));
        else resolve(item);
      };
      changed();
    });
  }
  async function command(line: string, event = 'changed') {
    child.stdin.write(`${line}\n`);
    return next(event);
  }
  async function close() {
    try {
      if (!exited) await command('quit', 'closed');
    } finally {
      child.kill('SIGTERM');
      await exit;
      lines.close();
    }
  }
  try {
    const ready = await next('ready');
    return {
      origin: ready.origin as string,
      directory: ready.directory as string,
      command,
      next,
      close,
    };
  } catch (error) {
    child.kill('SIGTERM');
    await exit;
    lines.close();
    throw error;
  }
}
