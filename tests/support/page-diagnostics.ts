import { writeFile } from 'node:fs/promises';
import { getHeapStatistics } from 'node:v8';
import type { Page, Request, TestInfo } from '@playwright/test';

async function bounded<T>(operation: () => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Browser diagnostic timed out after 2000ms')),
          2000,
        );
      }),
    ]);
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function address(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'unavailable';
  }
}

function message(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>]+/g, address).slice(0, 8000);
}

/** Retain errors and pending requests without headers, bodies or URL queries. */
export async function pageDiagnostics(page: Page) {
  const started = performance.now();
  const events: unknown[] = [];
  const pending = new Map<Request, { method: string; url: string; startedMs: number }>();
  const record = (kind: string, details: unknown) => {
    if (events.length === 200) events.shift();
    events.push({ elapsedMs: performance.now() - started, kind, details });
  };
  page.on('pageerror', (error) => record('pageerror', message(error.stack ?? error.message)));
  page.on('console', (entry) => {
    if (['error', 'warning'].includes(entry.type())) record(entry.type(), message(entry.text()));
  });
  page.on('crash', () => record('crash', 'Renderer crashed'));
  page.on('close', () => record('close', 'Page closed'));
  page.on('request', (request) => {
    if (pending.size < 200)
      pending.set(request, {
        method: request.method(),
        url: address(request.url()),
        startedMs: performance.now() - started,
      });
  });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => {
    record('requestfailed', { url: address(request.url()), error: request.failure()?.errorText });
    pending.delete(request);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      record('http-error', { url: address(response.url()), status: response.status() });
  });
  await page.addInitScript(() => {
    const state = {
      longTasks: [] as { startTime: number; duration: number }[],
      webglEvents: [] as { type: string; at: number }[],
    };
    Object.defineProperty(window, '__skyttelIntegrationDiagnostics', { value: state });
    for (const type of ['webglcontextlost', 'webglcontextrestored'])
      document.addEventListener(
        type,
        () => {
          if (state.webglEvents.length === 100) state.webglEvents.shift();
          state.webglEvents.push({ type, at: performance.now() });
        },
        true,
      );
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (state.longTasks.length === 100) state.longTasks.shift();
          state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ['longtask'] });
  });
  return async (info: TestInfo) => {
    if (info.status === info.expectedStatus) return;
    const [dom, browser] = await Promise.all([
      bounded(() =>
        page.evaluate(() => ({
          readyState: document.readyState,
          visibility: document.visibilityState,
          path: location.pathname,
          regions: Array.from(
            document.querySelectorAll('[role="region"], section[aria-label]'),
          ).map((element) => ({
            label: element.getAttribute('aria-label'),
            bounds: element.getBoundingClientRect().toJSON(),
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
          })),
          canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
            width: canvas.width,
            height: canvas.height,
            bounds: canvas.getBoundingClientRect().toJSON(),
          })),
          activeElement: {
            tag: document.activeElement?.tagName,
            label: document.activeElement?.getAttribute('aria-label'),
          },
          renderer: Reflect.get(window, '__skyttelIntegrationDiagnostics'),
          media: window.skyttelVoiceFixture?.diagnostics?.() ?? null,
        })),
      ),
      bounded(async () => {
        const instance = page.context().browser();
        if (!instance) return { unavailable: 'No browser connection' };
        const session = await instance.newBrowserCDPSession();
        try {
          const [processes, gpu] = await Promise.all([
            session.send('SystemInfo.getProcessInfo'),
            session.send('SystemInfo.getInfo'),
          ]);
          return { processes: processes.processInfo, gpu: gpu.gpu };
        } finally {
          await session.detach();
        }
      }),
    ]);
    const path = info.outputPath('browser-diagnostics.json');
    await writeFile(
      path,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          elapsedMs: performance.now() - started,
          elapsedTimeSource: 'runner-monotonic',
          url: address(page.url()),
          workerMemoryBytes: process.memoryUsage(),
          workerHeap: getHeapStatistics(),
          events,
          pendingRequests: [...pending.values()],
          dom,
          browser,
        },
        null,
        2,
      ),
    );
    await info.attach('browser-diagnostics', {
      path,
      contentType: 'application/json',
    });
  };
}
