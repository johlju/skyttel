import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, loadavg, platform, release, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium, expect } from '@playwright/test';
import type { MapState, SaveReceipt } from '../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openTable,
  signIn,
} from '../tests/support/client.js';
import { editTableObject } from '../tests/support/domain-work.js';
import { createInstallation } from '../tests/support/installation.js';

if (process.env.MAP_BACKGROUNDS === '1') {
  const { profileBackgrounds } = await import('./measure-backgrounds.js');
  await profileBackgrounds();
} else {
  const installation = await createInstallation();
  const browser = await chromium.launch();
  let latestReceipt: SaveReceipt | undefined;
  const samples: {
    run: number;
    cache: string;
    openMs: number;
    searchMs: number;
    saveMs: number;
    labels: number;
    overlappingPairs: number;
  }[] = [];
  const network = {
    offline: false,
    latency: 40,
    downloadThroughput: 20_000_000 / 8,
    uploadThroughput: 5_000_000 / 8,
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await signIn(context.request, installation.origin);
    const { user } = await (
      await context.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { household } = await (
      await createHousehold(context.request, installation.origin)
    ).json();
    installation.seedLargeMap(user.id, household.id);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const storageState = await context.storageState();
    await context.close();
    if (process.env.MAP_PAUSE === '1') {
      console.log(
        `Synthetic map: ${installation.origin}. Sign in with Google; the provider is a test substitute.`,
      );
      const input = createInterface({ input: process.stdin, output: process.stdout });
      await input.question('Press Enter after manual inspection to continue measurements. ');
      input.close();
    }
    for (let run = 0; run < Number(process.env.MAP_RUNS ?? 3); run += 1) {
      const client = await browser.newContext({
        storageState,
        viewport: { width: 1440, height: 1000 },
      });
      const page = await client.newPage();
      page.setDefaultTimeout(15_000);
      const cdp = await client.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', network);
      for (const cache of ['cold', 'warm']) {
        const started = performance.now();
        await page.goto(installation.origin);
        await openMap(page);
        await page.getByRole('button', { name: 'Navigera', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Rotera vänster', exact: true }),
        ).toBeEnabled();
        const labels = page.locator('.spatial-labels [data-layout-id]');
        await expect(labels.first()).toBeVisible();
        await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
        const openMs = performance.now() - started;
        const overlaps = await labels.evaluateAll((elements) => {
          const boxes = elements.map((element) => element.getBoundingClientRect());
          let count = 0;
          for (let a = 0; a < boxes.length; a += 1)
            for (let b = a + 1; b < boxes.length; b += 1)
              if (
                boxes[a].left < boxes[b].right &&
                boxes[a].right > boxes[b].left &&
                boxes[a].top < boxes[b].bottom &&
                boxes[a].bottom > boxes[b].top
              )
                count += 1;
          return { labels: boxes.length, overlappingPairs: count };
        });
        await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
        await openTable(page);
        const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
        const searchStarted = performance.now();
        await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('Provobjekt 499');
        const found = table.getByRole('button', { name: 'Provobjekt 499', exact: true });
        await expect(found).toBeVisible();
        await expect(table.locator('.household-table-row-toggle')).toHaveCount(1);
        const searchMs = performance.now() - searchStarted;
        await editTableObject(page, 'Provobjekt 499');
        await page.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
        await page
          .getByRole('group', { name: 'Egenskap 1', exact: true })
          .getByLabel('Värde', { exact: true })
          .fill(`Påhittad rättelse ${run} ${cache}`);
        await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        const draft = await openDraftReview(page);
        const saveButton = draft.getByRole('button', { name: 'Spara hela utkastet', exact: true });
        await expect(saveButton).toBeEnabled();
        const saveStarted = performance.now();
        const committed = page.waitForResponse(
          (response) =>
            response.url() === `${path}/save` &&
            response.request().method() === 'POST' &&
            response.status() === 200,
        );
        await saveButton.click();
        const { receipt } = await (await committed).json();
        latestReceipt = receipt;
        await expect(
          page.getByRole('dialog', { name: 'Spara utkastet', exact: true }),
        ).toBeHidden();
        await expect(page.locator('.draft-save-toast')).toHaveText('Utkastet är sparat');
        const saveMs = performance.now() - saveStarted;
        const state: MapState = await (await client.request.get(path)).json();
        expect(
          state.objects
            .find((object) => object.id === 'large-499')
            ?.properties?.find(
              (property): property is Extract<typeof property, { kind: 'text' }> =>
                property.kind === 'text' && property.label === 'Beskrivning',
            )?.value,
        ).toBe(`Påhittad rättelse ${run} ${cache}`);
        const { history } = await (await client.request.get(`${path}/history`)).json();
        expect(
          history.find((entry: SaveReceipt) => entry.operationId === receipt.operationId),
        ).toEqual(receipt);
        expect(
          receipt.changes[0].after.properties?.find(
            (p: { label: string }) => p.label === 'Beskrivning',
          )?.value,
        ).toBe(`Påhittad rättelse ${run} ${cache}`);
        samples.push({ run: run + 1, cache, openMs, searchMs, saveMs, ...overlaps });
        console.log(JSON.stringify(samples.at(-1)));
        if (process.env.MAP_SCREENSHOT && run === 0 && cache === 'cold') {
          await closeTextView(page);
          await openTable(page);
          await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('');
          await openMap(page);
          await page.screenshot({ path: process.env.MAP_SCREENSHOT });
        }
      }
      await client.close();
    }
    await installation.restart();
    const verification = await browser.newContext({ storageState });
    const latest: MapState = await (await verification.request.get(path)).json();
    const { history } = await (await verification.request.get(`${path}/history`)).json();
    const finalReceipt = latestReceipt;
    if (!finalReceipt) throw new Error('At least one completed measurement save is required.');
    expect(
      history.find((entry: SaveReceipt) => entry.operationId === finalReceipt.operationId),
    ).toEqual(finalReceipt);
    expect(
      latest.objects
        .find((object) => object.id === 'large-499')
        ?.properties?.find(
          (property): property is Extract<typeof property, { kind: 'text' }> =>
            property.kind === 'text' && property.label === 'Beskrivning',
        )?.value,
    ).toBe(
      finalReceipt.changes[0].after?.properties?.find(
        (property): property is Extract<typeof property, { kind: 'text' }> =>
          property.kind === 'text' && property.label === 'Beskrivning',
      )?.value,
    );
    expect(latest.draft.changes).toHaveLength(0);
    const { operation } = await (
      await verification.request.get(`${path}/operations/${finalReceipt.operationId}`)
    ).json();
    expect(operation.status).toBe('succeeded');
    expect(operation.receipt).toEqual(finalReceipt);
    await verification.close();
    const report = {
      measuredAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
      uncommitted: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      browser: browser.version(),
      node: process.version,
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
      network,
      viewport: { width: 1440, height: 1000 },
      samples,
      durableAfterRestart: true,
      targetsMet: samples.every(
        (sample) =>
          sample.openMs <= 5000 &&
          sample.searchMs <= 1000 &&
          sample.saveMs <= 2000 &&
          sample.overlappingPairs === 0,
      ),
    };
    const reportPath =
      process.env.MAP_REPORT ??
      join(await mkdtemp(join(tmpdir(), 'skyttel-map-measurement-')), 'report.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Measurement report: ${reportPath}`);
    if (!report.targetsMet) process.exitCode = 1;
  } finally {
    await browser.close();
    await installation.close();
  }
}
