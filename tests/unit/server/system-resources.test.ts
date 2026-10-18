import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sampleResources } from '../../support/system-resources.js';

const { readFileSync, readdirSync } = vi.hoisted(() => ({
  readFileSync: vi.fn<(path: unknown, encoding: string) => string>(),
  readdirSync: vi.fn<(path: unknown) => string[]>(),
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync,
  readdirSync,
}));
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => '100') }));

const files = new Map<string, string>();
const tasks = new Map<string, string[]>();

function addProcess(pid: number, children: Record<string, string> = { [pid]: '' }) {
  files.set(`/proc/${pid}/status`, 'Name:\ttest\nVmRSS:\t100 kB\nThreads:\t2');
  files.set(`/proc/${pid}/stat`, `${pid} (test) S ${Array(21).fill('0').join(' ')}`);
  tasks.set(`/proc/${pid}/task`, Object.keys(children));
  for (const [tid, pids] of Object.entries(children)) {
    files.set(`/proc/${pid}/task/${tid}/children`, pids);
  }
}

beforeEach(() => {
  files.clear();
  tasks.clear();
  readFileSync.mockImplementation((path) => {
    const content = files.get(String(path));
    if (content === undefined) throw new Error('File unavailable');
    return content;
  });
  readdirSync.mockImplementation((path) => {
    const entries = tasks.get(String(path));
    if (!entries) throw new Error('Directory unavailable');
    return entries;
  });
});

afterEach(() => {
  readFileSync.mockReset();
  readdirSync.mockReset();
});

test('samples children from every thread and follows their descendants once', () => {
  const root = process.pid;
  const child = root + 100;
  const otherChild = root + 200;
  const grandchild = root + 300;
  addProcess(root, { [root]: `${child}`, [root + 1]: `${otherChild} ${child}` });
  addProcess(child);
  addProcess(otherChild, { [otherChild]: '', [otherChild + 1]: `${grandchild}` });
  addProcess(grandchild);

  expect(
    sampleResources()
      .processes.map(({ pid }) => pid)
      .sort((a, b) => a - b),
  ).toEqual([root, child, otherChild, grandchild]);
});

test('falls back to the main thread when a task directory cannot be listed', () => {
  const root = process.pid;
  const child = root + 100;
  addProcess(root, { [root]: `${child}` });
  addProcess(child);
  tasks.delete(`/proc/${root}/task`);

  expect(sampleResources().processes.map(({ pid }) => pid)).toEqual([root, child]);
});

test('continues past an unavailable thread and ignores nonpositive child values', () => {
  const root = process.pid;
  const child = root + 100;
  addProcess(root, { [root]: '', [root + 1]: '', [root + 2]: `0 -1 invalid ${child} ` });
  addProcess(child);
  files.delete(`/proc/${root}/task/${root + 1}/children`);

  expect(sampleResources().processes.map(({ pid }) => pid)).toEqual([root, child]);
  for (const pid of ['0', '-1', 'NaN']) {
    expect(readFileSync).not.toHaveBeenCalledWith(`/proc/${pid}/status`, 'utf8');
  }
});
