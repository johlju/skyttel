import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism, cpus, freemem, loadavg, totalmem } from 'node:os';
import { join } from 'node:path';

function read(path: string) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

function counters(text: string | null) {
  const result: Record<string, number> = {};
  for (const line of text?.split('\n') ?? []) {
    const [key, value] = line.split(/\s+/);
    if (key && value && Number.isFinite(Number(value))) result[key] = Number(value);
  }
  return result;
}

function number(text: string | null) {
  return text && Number.isFinite(Number(text)) ? Number(text) : null;
}

let clockTicks: number | null | undefined;
function ticksPerSecond() {
  if (clockTicks === undefined) {
    try {
      clockTicks = number(
        execFileSync('getconf', ['CLK_TCK'], {
          encoding: 'utf8',
          timeout: 1000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim(),
      );
    } catch {
      clockTicks = null;
    }
  }
  return clockTicks;
}

type ProcessSample = {
  pid: number;
  name: string;
  rssKiB: number | null;
  peakRssKiB: number | null;
  threads: number | null;
  cpuTicks: number;
  startTicks: number;
  cpuPercentOfOneCore: number | null;
};

export type ResourceSample = {
  at: string;
  monotonicMs: number;
  host: {
    logicalCpus: number;
    availableParallelism: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    meminfo: string | null;
    loadAverage: number[];
    cpuTotalMs: number;
    cpuIdleMs: number;
    cpuBusyPercent: number | null;
    cpuPressure: string | null;
    memoryPressure: string | null;
  };
  cgroup: {
    directory: string;
    membership: string | null;
    memoryCurrentBytes: number | null;
    memoryPeakBytes: number | null;
    memoryMax: string | null;
    memoryEvents: Record<string, number>;
    memoryEventsDelta: Record<string, number>;
    cpuMax: string | null;
    cpuStat: Record<string, number>;
    cpuUsedCores: number | null;
    effectiveCpus: string | null;
  };
  clockTicksPerSecond: number | null;
  processes: ProcessSample[];
};

/** Follow the runner's workers and browser children; never read command arguments. */
function processes(previous: ResourceSample | undefined, now: number) {
  const pending = [process.pid];
  const seen = new Set<number>();
  const result: ProcessSample[] = [];
  const elapsed = previous ? (now - previous.monotonicMs) / 1000 : 0;
  const ticks = ticksPerSecond();
  while (pending.length && seen.size < 128) {
    const pid = pending.pop();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const status = read(`/proc/${pid}/status`);
    const stat = read(`/proc/${pid}/stat`);
    if (!status || !stat) continue; // A process may exit between reads.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/);
    const field = (name: string) => status.match(new RegExp(`^${name}:\\s+(.*)$`, 'm'))?.[1];
    const cpuTicks = Number(fields[11]) + Number(fields[12]);
    const startTicks = Number(fields[19]);
    const before = previous?.processes.find(
      (entry) => entry.pid === pid && entry.startTicks === startTicks,
    );
    result.push({
      pid,
      name: field('Name') ?? 'unknown',
      rssKiB: number(field('VmRSS')?.split(/\s+/)[0] ?? null),
      peakRssKiB: number(field('VmHWM')?.split(/\s+/)[0] ?? null),
      threads: number(field('Threads') ?? null),
      cpuTicks,
      startTicks,
      cpuPercentOfOneCore:
        before && ticks && elapsed > 0
          ? (100 * (cpuTicks - before.cpuTicks)) / ticks / elapsed
          : null,
    });
    let tids: string[];
    try {
      tids = readdirSync(`/proc/${pid}/task`);
    } catch {
      tids = [String(pid)];
    }
    for (const tid of tids) {
      for (const child of read(`/proc/${pid}/task/${tid}/children`)?.split(/\s+/) ?? []) {
        if (Number(child) > 0) pending.push(Number(child));
      }
    }
  }
  return result;
}

/** Raw limits/counters accompany rates so OOM and throttling evidence is reviewable. */
export function sampleResources(previous?: ResourceSample): ResourceSample {
  const now = performance.now();
  const cores = cpus();
  const total = cores.reduce(
    (sum, { times }) => sum + times.user + times.nice + times.sys + times.idle + times.irq,
    0,
  );
  const idle = cores.reduce((sum, { times }) => sum + times.idle, 0);
  const membership = read('/proc/self/cgroup');
  const relative = membership
    ?.split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3);
  const candidate = join('/sys/fs/cgroup', relative ?? '');
  const directory = read(join(candidate, 'cpu.stat')) !== null ? candidate : '/sys/fs/cgroup';
  const cgroup = (name: string) => read(join(directory, name));
  const memoryEvents = counters(cgroup('memory.events'));
  const cpuStat = counters(cgroup('cpu.stat'));
  const elapsed = previous ? now - previous.monotonicMs : 0;
  const totalDelta = previous ? total - previous.host.cpuTotalMs : 0;
  return {
    at: new Date().toISOString(),
    monotonicMs: now,
    host: {
      logicalCpus: cores.length,
      availableParallelism: availableParallelism(),
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      meminfo: read('/proc/meminfo'),
      loadAverage: loadavg(),
      cpuTotalMs: total,
      cpuIdleMs: idle,
      cpuBusyPercent:
        previous && totalDelta > 0
          ? 100 * (1 - (idle - previous.host.cpuIdleMs) / totalDelta)
          : null,
      cpuPressure: read('/proc/pressure/cpu'),
      memoryPressure: read('/proc/pressure/memory'),
    },
    cgroup: {
      directory,
      membership,
      memoryCurrentBytes: number(cgroup('memory.current')),
      memoryPeakBytes: number(cgroup('memory.peak')),
      memoryMax: cgroup('memory.max'),
      memoryEvents,
      memoryEventsDelta: Object.fromEntries(
        Object.entries(memoryEvents).map(([key, value]) => [
          key,
          previous ? value - (previous.cgroup.memoryEvents[key] ?? value) : 0,
        ]),
      ),
      cpuMax: cgroup('cpu.max'),
      cpuStat,
      cpuUsedCores:
        previous &&
        elapsed > 0 &&
        cpuStat.usage_usec !== undefined &&
        previous.cgroup.cpuStat.usage_usec !== undefined
          ? (cpuStat.usage_usec - previous.cgroup.cpuStat.usage_usec) / 1000 / elapsed
          : null,
      effectiveCpus: cgroup('cpuset.cpus.effective'),
    },
    clockTicksPerSecond: ticksPerSecond(),
    processes: processes(previous, now),
  };
}
