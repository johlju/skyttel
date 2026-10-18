import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';
import { type ResourceSample, sampleResources } from './system-resources.js';

/** Keep runner and fixture-server output beside retained browser failure traces. */
export default class DiagnosticsReporter implements Reporter {
  private log = '';
  private resources = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private previous: ResourceSample | undefined;
  private active = new Map<string, string>();

  private sample() {
    try {
      const sample = sampleResources(this.previous);
      appendFileSync(
        this.resources,
        `${JSON.stringify({ tests: [...this.active.values()], ...sample })}\n`,
      );
      this.previous = sample;
    } catch (error) {
      this.write(`Resource diagnostics unavailable: ${String(error)}\n`);
    }
  }

  private write(chunk: string | Buffer) {
    if (this.log) appendFileSync(this.log, chunk);
  }

  onBegin(config: FullConfig) {
    const directory = join(config.projects[0].outputDir, 'diagnostics');
    mkdirSync(directory, { recursive: true });
    this.log = join(directory, 'runner.log');
    writeFileSync(this.log, 'Skyttel integration diagnostics\n');
    this.resources = join(directory, 'resources.jsonl');
    writeFileSync(this.resources, '');
    this.sample();
    this.timer = setInterval(() => this.sample(), 5000);
    this.timer.unref();
  }

  onTestBegin(test: TestCase) {
    this.active.set(test.id, test.titlePath().filter(Boolean).join(' > '));
  }

  onStdOut(chunk: string | Buffer) {
    this.write(chunk);
  }

  onStdErr(chunk: string | Buffer) {
    this.write(chunk);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (['failed', 'timedOut', 'interrupted'].includes(result.status)) {
      this.sample();
      const sample = this.previous;
      const summary = sample && {
        at: sample.at,
        hostCpuBusyPercent: sample.host.cpuBusyPercent,
        cgroup: sample.cgroup,
        processes: [...sample.processes]
          .sort((a, b) => (b.rssKiB ?? 0) - (a.rssKiB ?? 0))
          .slice(0, 8),
      };
      this.write(`\nFailure resources: ${JSON.stringify(summary)}\n`);
      console.error(`Integration failure resources: ${JSON.stringify(summary)}`);
    }
    this.write(`\n${result.status}: ${test.titlePath().filter(Boolean).join(' > ')}\n`);
    for (const error of result.errors) {
      this.onError(error);
    }
    this.active.delete(test.id);
  }

  onError(error: TestError) {
    this.write(`${error.stack ?? error.message ?? error.value}\n`);
  }

  onEnd(result: FullResult) {
    clearInterval(this.timer);
    this.sample();
    this.write(`\nRun status: ${result.status}\n`);
  }
}
