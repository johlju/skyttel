import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, loadavg, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { type CDPSession, chromium, expect, type Page } from '@playwright/test';
import type { PersonalView } from '../src/shared/personal-view.js';
import { createBackgroundMapFixture } from '../tests/support/background-map.js';
import { openMap, openProfile, openSettings } from '../tests/support/client.js';
import { createInstallation } from '../tests/support/installation.js';
import { waitForMapScene } from '../tests/support/map-scene.js';
import { createPreparedContext } from '../tests/support/test.js';

export const backgrounds = [
  ['light', 'off'],
  ['light', 'pearl'],
  ['light', 'dawn'],
  ['light', 'ocean'],
  ['dark', 'off'],
  ['dark', 'atmosphere'],
  ['dark', 'mist'],
  ['dark', 'universe'],
  ['dark', 'ocean'],
] as const;

export async function prepareBackgroundMap(page: Page, origin: string, count: number) {
  const { path, household } = await createBackgroundMapFixture(
    page.request,
    origin,
    count,
    'measurement',
  );
  await page.goto(`${origin}/households/${household.id}`);
  await openMap(page);
  return path;
}

export async function chooseBackground(page: Page, theme: 'light' | 'dark', appearance: string) {
  const closeDetails = page.getByRole('button', { name: 'Stäng uppgifterna', exact: true });
  if (await closeDetails.isVisible()) {
    // Floating navigation can cover the window's close target. Its ordinary
    // keyboard action remains available without forcing a pointer through it.
    await closeDetails.focus();
    await closeDetails.press('Enter');
  }
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
  await openSettings(page);
  await page
    .getByRole('link', { name: /^Rymdkartan/ })
    .first()
    .click();
  const enabled = page.getByRole('checkbox', { name: 'Visa bakgrund', exact: true });
  await enabled.setChecked(appearance !== 'off');
  if (appearance !== 'off') {
    await page
      .getByLabel(theme === 'light' ? 'Bakgrund i ljust tema' : 'Bakgrund i mörkt tema', {
        exact: true,
      })
      .selectOption(appearance);
  }
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  await waitForMapScene(page);
  const navigation = page.getByRole('button', { name: 'Navigera', exact: true });
  if ((await navigation.getAttribute('aria-expanded')) !== 'true') await navigation.click();
  await page.getByRole('button', { name: 'Rotera vänster', exact: true }).focus();
  // Warm compilation, label layout, focus and compositing before measurement.
  await page.screenshot();
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? null;
}

async function observeGraphics(page: Page) {
  await page.addInitScript({
    content: `(() => {
    const resources = new Map();
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const kind of [
        'Buffer',
        'Texture',
        'Program',
        'Shader',
        'Framebuffer',
        'Renderbuffer',
        'VertexArray',
      ]) {
        const methods = prototype;
        const create = methods['create' + kind];
        const remove = methods['delete' + kind];
        if (!create || !remove) continue;
        const live = resources.get(kind) ?? new Set();
        resources.set(kind, live);
        methods['create' + kind] = function (...args) {
          const resource = Reflect.apply(create, this, args);
          if (resource && typeof resource === 'object') live.add(resource);
          return resource;
        };
        methods['delete' + kind] = function (...args) {
          if (args[0] && typeof args[0] === 'object') live.delete(args[0]);
          return Reflect.apply(remove, this, args);
        };
      }
    }
    Object.defineProperty(window, '__profileGraphicsResources', {
      value: () => Object.fromEntries([...resources].map(([kind, values]) => [kind, values.size])),
    });
  })();`,
  });
}

async function graphicsResources(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        __profileGraphicsResources: () => Record<string, number>;
      }
    ).__profileGraphicsResources(),
  );
}

type TraceEvent = {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  id?: string;
  id2?: { local?: string; global?: string };
  args?: Record<string, unknown>;
};

type Summary = { median: number | null; p95: number | null };
function presentationState(frame: { args?: Record<string, unknown> }) {
  return (frame.args?.frame_reporter as { state?: string } | undefined)?.state;
}
type ProfileSample = {
  objects: number;
  width: number;
  theme: string;
  appearance: string;
  run: number;
  response: Summary;
  presentedFrames: Summary;
  positionsPreserved: boolean;
};

async function finishFrames(cdp: CDPSession) {
  const completed = new Promise<{ stream?: string }>((resolve) =>
    cdp.once('Tracing.tracingComplete', resolve),
  );
  await cdp.send('Tracing.end');
  const { stream } = await completed;
  if (!stream) throw new Error('Chromium did not supply the frame trace');
  let json = '';
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle: stream });
    json += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  const events: TraceEvent[] = JSON.parse(json).traceEvents;
  const pipelineEvents = events
    .filter((event) => event.name === 'PipelineReporter')
    .sort((a, b) => a.ts - b.ts);
  const started = new Map<string, TraceEvent>();
  const frames: { ms: number; args?: Record<string, unknown> }[] = [];
  for (const event of pipelineEvents) {
    const key = `${event.pid}:${event.id2?.local ?? event.id2?.global ?? event.id}`;
    if (event.ph === 'b') started.set(key, event);
    if (event.ph === 'X' && event.dur) frames.push({ ms: event.dur / 1000, args: event.args });
    if (event.ph === 'e') {
      const begin = started.get(key);
      if (begin)
        frames.push({ ms: (event.ts - begin.ts) / 1000, args: { ...begin.args, ...event.args } });
      started.delete(key);
    }
  }
  return {
    frames,
    pipelineEvents,
    unfinishedAtTraceEnd: started.size,
    dropped: frames.filter((frame) => JSON.stringify(frame.args ?? {}).includes('STATE_DROPPED'))
      .length,
  };
}

export async function profileBackgrounds() {
  const startedAt = new Date().toISOString();
  const installations = new Set<Awaited<ReturnType<typeof createInstallation>>>();
  const samples: ProfileSample[] = [];
  const stability: {
    objects: number;
    switches: unknown[];
    resourcesStableAfterWarmup: boolean;
    idleFullPageImageIdentical: boolean;
    afterSignOut: Record<string, number>;
  }[] = [];
  const actions = Number(process.env.MAP_FRAME_SAMPLES ?? 12);
  const rounds = Number(process.env.MAP_RUNS ?? 2);
  const output =
    process.env.MAP_REPORT ??
    join(await mkdtemp(join(tmpdir(), 'skyttel-background-measurement-')), 'report.json');
  const budget: { response: Summary; presentedFrames: Summary } | null =
    process.env.MAP_CALIBRATE === '1'
      ? null
      : JSON.parse(
          await readFile(
            new URL('../docs/manual-tests/measurements/background-budget.json', import.meta.url),
            'utf8',
          ),
        );
  if (budget) {
    for (const metric of ['response', 'presentedFrames'] as const)
      for (const percentile of ['median', 'p95'] as const) {
        const value = budget[metric][percentile];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
          throw new Error(`Invalid background budget: ${metric}.${percentile}`);
      }
  }
  if (
    process.env.MAP_APPEARANCES?.split(',').some(
      (appearance) => !backgrounds.some(([, name]) => name === appearance),
    )
  )
    throw new Error('MAP_APPEARANCES must list appearance values from the background choices');
  if (!Number.isInteger(actions) || actions < 2 || !Number.isInteger(rounds) || rounds < 1)
    throw new Error('MAP_FRAME_SAMPLES must be an integer >=2; MAP_RUNS must be an integer >=1');
  const builtHtml = await readFile('dist/client/index.html', 'utf8');
  await mkdir(dirname(output), { recursive: true });
  const builtAssets = await Promise.all(
    [...builtHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(async ([, path]) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(`dist/client${path}`))
        .digest('hex'),
    })),
  );
  const browser = await chromium.launch({ headless: process.env.MAP_HEADED !== '1' });
  try {
    for (const objects of [16, 80]) {
      const installation = await createInstallation();
      installations.add(installation);
      const context = await createPreparedContext(browser);
      const page = await context.newPage();
      await observeGraphics(page);
      page.setDefaultTimeout(30_000);
      await page.setViewportSize({ width: 1440, height: 960 });
      const path = await prepareBackgroundMap(page, installation.origin, objects);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
        for (let run = 0; run < rounds; run++) {
          for (const [theme, appearance] of backgrounds) {
            if (
              process.env.MAP_APPEARANCES &&
              !process.env.MAP_APPEARANCES.split(',').includes(appearance)
            )
              continue;
            await chooseBackground(page, theme, appearance);
            const marker = page.getByRole('button', {
              name: 'Välj objekt: Provobjekt 00',
              exact: true,
            });
            await marker.focus();
            await marker.press('Shift+F10');
            await page
              .getByRole('button', { name: 'Visa uppgifter för Provobjekt 00', exact: true })
              .click();
            await expect(
              page.getByRole('region', { name: 'Provobjekt 00', exact: true }),
            ).toBeVisible();
            await page.getByRole('button', { name: 'Rotera vänster', exact: true }).focus();
            const projections = () =>
              page
                .locator('.spatial-map button[data-object-id]')
                .evaluateAll((elements) =>
                  elements.map((element) => element.getAttribute('style')),
                );
            const beforeProjection = await projections();
            let view!: PersonalView;
            await expect
              .poll(async () => {
                view = await (await page.request.get(`${path}/view`)).json();
                return {
                  enabled: view.settings.background,
                  appearance:
                    appearance === 'off'
                      ? 'off'
                      : view.settings[theme === 'light' ? 'lightBackground' : 'darkBackground'],
                };
              })
              .toEqual({ enabled: appearance !== 'off', appearance });
            const timestamps: number[] = [];
            const frame = (event: { sessionId: number; metadata: { timestamp?: number } }) => {
              if (event.metadata.timestamp) timestamps.push(event.metadata.timestamp * 1000);
              void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
            };
            cdp.on('Page.screencastFrame', frame);
            await cdp.send('Tracing.start', {
              categories: 'cc,benchmark',
              transferMode: 'ReturnAsStream',
            });
            await cdp.send('Page.startScreencast', {
              format: 'jpeg',
              quality: 30,
              maxWidth: width,
              maxHeight: 960,
              everyNthFrame: 1,
            });
            const responseMs: number[] = [];
            const pngBytes: number[] = [];
            for (let index = 0; index < actions; index++) {
              const start = performance.now();
              await page.keyboard.press('Enter');
              const image = await page.screenshot();
              responseMs.push(performance.now() - start);
              pngBytes.push(image.byteLength);
            }
            await cdp.send('Page.stopScreencast');
            cdp.off('Page.screencastFrame', frame);
            const pipeline = await finishFrames(cdp);
            if (JSON.stringify(beforeProjection) === JSON.stringify(await projections()))
              throw new Error('Navigation did not change the visible map projection');
            const presented = pipeline.frames
              .filter((frame) => presentationState(frame) === 'STATE_PRESENTED_ALL')
              .map((frame) => frame.ms);
            const partial = pipeline.frames
              .filter((frame) => presentationState(frame) === 'STATE_PRESENTED_PARTIAL')
              .map((frame) => frame.ms);
            const frameStates = Object.fromEntries(
              [...new Set(pipeline.frames.map(presentationState))].map((state) => {
                const times = pipeline.frames
                  .filter((frame) => presentationState(frame) === state)
                  .map((frame) => frame.ms);
                return [
                  state ?? 'unknown',
                  {
                    count: times.length,
                    median: percentile(times, 0.5),
                    p95: percentile(times, 0.95),
                  },
                ];
              }),
            );
            if (presented.length < 2)
              throw new Error(
                `Incomplete presented-frame trace: ${objects}/${width}/${theme}/${appearance}`,
              );
            const captureCadenceMs = timestamps
              .slice(1)
              .map((time, index) => time - timestamps[index]);
            const row = {
              objects,
              width,
              height: width === 390 ? 844 : 960,
              run: run + 1,
              theme,
              appearance,
              responseMs,
              captureCadenceMs,
              pngBytes,
              response: { median: percentile(responseMs, 0.5), p95: percentile(responseMs, 0.95) },
              captureCadence: {
                median: percentile(captureCadenceMs, 0.5),
                p95: percentile(captureCadenceMs, 0.95),
              },
              pipeline,
              presentedFrames: {
                count: presented.length,
                median: percentile(presented, 0.5),
                p95: percentile(presented, 0.95),
              },
              partialFrames: {
                count: partial.length,
                median: percentile(partial, 0.5),
                p95: percentile(partial, 0.95),
              },
              frameStates,
              panels: ['navigation', 'object details: Provobjekt 00'],
              savedSettings: view.settings,
              operation: 'Rotera vänster, ordinary navigation button activated with Enter',
              devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
              liveGraphicsResources: await graphicsResources(page),
              metrics: (await cdp.send('Performance.getMetrics')).metrics,
              positionsPreserved:
                JSON.stringify(view.positions) ===
                JSON.stringify((await (await page.request.get(`${path}/view`)).json()).positions),
            };
            samples.push(row);
            await writeFile(
              `${output}.partial.json`,
              `${JSON.stringify({ startedAt, builtAssets, samples }, null, 2)}\n`,
            );
            console.log(
              JSON.stringify({
                objects,
                width,
                run: run + 1,
                theme,
                appearance,
                response: row.response,
                captureCadence: row.captureCadence,
                presentedFrames: row.presentedFrames,
              }),
            );
          }
        }
      }
      const switches: { cycle: number; resources: Record<string, number>; heap: unknown }[] = [];
      for (let cycle = 0; cycle < 4; cycle++) {
        for (const [theme, appearance] of backgrounds)
          await chooseBackground(page, theme, appearance);
        await cdp.send('HeapProfiler.collectGarbage');
        switches.push({
          cycle: cycle + 1,
          resources: await graphicsResources(page),
          heap: await cdp.send('Runtime.getHeapUsage'),
        });
      }
      await expect(page.locator('.personal-view-toast')).toHaveCount(0, { timeout: 5000 });
      const beforeIdle = await page.screenshot();
      await page.waitForTimeout(2000);
      const idleFullPageImageIdentical = beforeIdle.equals(await page.screenshot());
      await openProfile(page);
      await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
      await expect(page.locator('.spatial-map canvas')).toHaveCount(0);
      const afterSignOut = await graphicsResources(page);
      stability.push({
        objects,
        switches,
        resourcesStableAfterWarmup: switches
          .slice(1)
          .every(
            (sample) => JSON.stringify(sample.resources) === JSON.stringify(switches[1].resources),
          ),
        idleFullPageImageIdentical,
        afterSignOut,
      });
      await context.close();
      await installation.close();
      installations.delete(installation);
    }
    const gpu = await browser.newBrowserCDPSession();
    if (builtHtml !== (await readFile('dist/client/index.html', 'utf8')))
      throw new Error('The built client changed during profiling; discard this incomplete run');
    if (!samples.length) throw new Error('No background configurations were measured');
    const violations = samples.flatMap((sample) => {
      if (!budget) return [];
      return (['response', 'presentedFrames'] as const).flatMap((metric) =>
        (['median', 'p95'] as const).flatMap((percentile) => {
          const value = sample[metric][percentile];
          const limit = budget[metric][percentile];
          return value === null || limit === null || !Number.isFinite(value) || value > limit
            ? [
                {
                  objects: sample.objects,
                  width: sample.width,
                  theme: sample.theme,
                  appearance: sample.appearance,
                  run: sample.run,
                  metric,
                  percentile,
                  value,
                  limit,
                },
              ]
            : [];
        }),
      );
    });
    const report = {
      startedAt,
      measuredAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
      uncommitted: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      builtClientHtml: await readFile('dist/client/index.html', 'utf8'),
      builtClientHtmlSha256: createHash('sha256')
        .update(await readFile('dist/client/index.html'))
        .digest('hex'),
      builtAssets,
      browser: browser.version(),
      node: process.version,
      npm: process.env.npm_config_user_agent ?? null,
      gpu: await gpu.send('SystemInfo.getInfo'),
      environment: {
        platform: platform(),
        architecture: process.arch,
        release: release(),
        cpu: cpus()[0].model,
        availableParallelism: availableParallelism(),
        totalmem: totalmem(),
        loadavg: loadavg(),
        memoryLimit: await readFile('/sys/fs/cgroup/memory.max', 'utf8').catch(() => 'unavailable'),
        cpuLimit: await readFile('/sys/fs/cgroup/cpu.max', 'utf8').catch(() => 'unavailable'),
      },
      measurement:
        'Public keyboard navigation to completed full-page PNG; capture-paced compositor screencast intervals; primary Chromium PipelineReporter spans ending STATE_PRESENTED_ALL. Partial/dropped attempts reported separately. Capture and tracing overhead included. No hardware GPU claim.',
      actions,
      rounds,
      deviceEmulation: { isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
      fullMatrix: !process.env.MAP_APPEARANCES && samples.length === 36 * rounds,
      samples,
      stability,
      budget,
      violations,
      resourcesStable: stability.every((sample) => sample.resourcesStableAfterWarmup),
      interactionsPreserved:
        samples.every((sample) => sample.positionsPreserved) &&
        stability.every((sample) => sample.idleFullPageImageIdentical),
      targetsMet: budget
        ? violations.length === 0 &&
          samples.every((sample) => sample.positionsPreserved) &&
          stability.every(
            (sample) => sample.resourcesStableAfterWarmup && sample.idleFullPageImageIdentical,
          )
        : null,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Background report: ${output}`);
    if (budget && violations.length) {
      console.error(`Background budget exceeded: ${JSON.stringify(violations)}`);
      process.exitCode = 1;
    }
    if (!report.resourcesStable) {
      console.error('Live WebGL resource counts grow after the first complete warm switch cycle');
      process.exitCode = 1;
    }
    if (!report.interactionsPreserved) {
      console.error('Navigation changed saved placements or an idle page changed without input');
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await Promise.all([...installations].map((installation) => installation.close()));
  }
}
