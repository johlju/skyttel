import { createInterface } from 'node:readline';
import { chromium } from '@playwright/test';
import { createHousehold, signIn } from '../tests/support/client.js';
import {
  prepareDraftSave,
  preparePropertyDraftSave,
  registerPendingSave,
} from '../tests/support/draft-save.js';
import { createInstallation } from '../tests/support/installation.js';

// Disposable real HTTP/SQLite installation; only delivery of network responses
// is controlled. The headed browser remains available for human interaction.
let app = await createInstallation();
const browser = await chromium
  .launch({
    channel: process.argv.includes('--chrome') ? 'chrome' : undefined,
    headless: process.argv.includes('--headless'),
  })
  .catch(async (failure) => {
    await app.close();
    throw failure;
  });
const page = await browser.newPage();
console.log(
  `Browser: ${process.argv.includes('--chrome') ? 'Chrome' : 'Chromium'} ${browser.version()}`,
);
let input: ReturnType<typeof createInterface> | undefined;
process.once('SIGINT', () => input?.close());
process.once('SIGTERM', () => input?.close());
let path = '';
let hold = false;
let holdAfter = false;
let lostResponse = false;
let refreshFailure = false;
let recoveryFailure = false;
let release: (() => void) | undefined;
let holdCheck = false;
let releaseCheck: (() => void) | undefined;
let prepared = false;
async function fresh(empty: boolean, properties = false) {
  release?.();
  releaseCheck?.();
  hold = holdAfter = lostResponse = refreshFailure = recoveryFailure = false;
  holdCheck = false;
  if (prepared) {
    await page.goto('about:blank');
    await app.close();
    app = await createInstallation();
  }
  if (empty) {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    path = `${app.origin}/api/households/${household.id}/map`;
    await page.goto(`${app.origin}/households/${household.id}`);
  } else {
    const data = await (properties ? preparePropertyDraftSave : prepareDraftSave)(
      page.request,
      app.origin,
    );
    path = data.path;
    await page.goto(`${app.origin}/households/${data.household.id}`);
  }
  prepared = true;
}
try {
  await page.route('**/map/save', async (route) => {
    if (hold) {
      console.log('Save request held. Use release.');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      release = undefined;
    }
    const response = await route.fetch();
    console.log(`Save application completed: ${response.status()}`);
    if (holdAfter) {
      console.log('Application reply held after reported status. Use release or drop.');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      release = undefined;
    }
    if (lostResponse) await route.abort();
    else await route.fulfill({ response });
  });
  await page.route(/\/map(?:\?.*)?$/, (route) =>
    refreshFailure && route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  await page.route('**/text-assistant/recover', (route) =>
    recoveryFailure ? route.abort() : route.continue(),
  );
  await page.route('**/map/operations/*', async (route) => {
    if (!holdCheck || route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    console.log(`Save lookup completed: ${response.status()}. Reply held. Use release-check.`);
    await new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    releaseCheck = undefined;
    await route.fulfill({ response });
  });
  await fresh(false);
  console.log(
    'Commands: new-draft, new-property-draft, new-empty, hold, hold-after, release, drop, hold-check, release-check, lost-response, refresh-failure, network-ok, pending-attempt, result, quit',
  );
  input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const command of input) {
    if (command === 'quit') break;
    if (['new-draft', 'new-property-draft', 'new-empty'].includes(command))
      await fresh(command === 'new-empty', command === 'new-property-draft');
    else if (command === 'hold') hold = true;
    else if (command === 'hold-after') holdAfter = true;
    else if (command === 'hold-check') holdCheck = true;
    else if (command === 'release-check') {
      holdCheck = false;
      releaseCheck?.();
    } else if (command === 'release') {
      hold = holdAfter = false;
      release?.();
    } else if (command === 'drop') {
      hold = holdAfter = false;
      lostResponse = true;
      release?.();
    } else if (command === 'lost-response') lostResponse = true;
    else if (command === 'refresh-failure') refreshFailure = true;
    else if (command === 'network-ok') {
      lostResponse = refreshFailure = recoveryFailure = false;
    } else if (command === 'pending-attempt') {
      console.log(await registerPendingSave(page.request, path, crypto.randomUUID()));
      recoveryFailure = true;
      await page.reload();
    } else if (command === 'result') {
      console.log(
        JSON.stringify(
          {
            map: await (await page.request.get(path)).json(),
            operations: await (await page.request.get(`${path}/operations`)).json(),
            history: await (await page.request.get(`${path}/history`)).json(),
          },
          null,
          2,
        ),
      );
    } else console.log('Unknown command.');
  }
} finally {
  release?.();
  releaseCheck?.();
  input?.close();
  await browser.close();
  await app.close();
}
