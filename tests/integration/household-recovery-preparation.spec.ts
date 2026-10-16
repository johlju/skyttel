import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createHousehold, signIn } from '../support/client.js';
import { seedRecoveryContent } from '../support/household-recovery-reading.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

const preparation = readFileSync('docs/manual-tests/household-recovery-faults.md', 'utf8').match(
  /```javascript\n([\s\S]*?)\n```/,
)?.[1];
if (!preparation) throw new Error('Missing runnable recovery preparation');
const filesystemPreparation = [
  ...readFileSync('docs/manual-tests/household-recovery-filesystem.md', 'utf8').matchAll(
    /```sh\n([\s\S]*?)\n```/g,
  ),
][1]?.[1];
if (!filesystemPreparation) throw new Error('Missing runnable filesystem preparation');
const runShell = promisify(execFile);

for (const seeded of [false, true]) {
  test(`documented recovery delivery preparation uses real responses with ${seeded ? 'seeded' : 'empty'} content`, {
    tag: '@technical',
  }, async ({ page }) => {
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}`;
      const headers = { origin: installation.origin };
      const read = async () => (await page.request.get(`${path}/map`)).json();
      if (seeded) {
        const state = await read();
        expect(
          (
            await page.request.post(`${path}/map/draft`, {
              headers,
              data: {
                id: 'private',
                version: state.draft.version,
                baseRevision: null,
                value: { typeId: state.types[0].id, name: 'Privat prov', description: '' },
              },
            })
          ).status(),
        ).toBe(200);
      }
      const before = await read();
      const exported = await (
        await page.request.post(`${path}/exports`, { headers, data: {} })
      ).json();
      const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
      await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().startsWith(`${path}/imports`))
          writes.push(request.url());
      });
      const install = async (mode: string) => {
        page.once('dialog', (dialog) => dialog.accept(mode));
        // DevTools Console execution does not insert an inline script element.
        await page.evaluate(preparation);
      };
      await install('prepare-delay');
      const waiting = page.waitForEvent('console', {
        predicate: (message) => message.text() === 'Serverns svar väntar',
      });
      const preparing = page.evaluate(
        async ({ url, bytes, contentVersion }) => {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/zip',
              'x-skyttel-content-version': String(contentVersion),
            },
            body: new Uint8Array(bytes),
          });
          return { status: response.status, body: await response.json() };
        },
        { url: `${path}/imports`, bytes: [...archive], contentVersion: before.contentVersion },
      );
      await waiting;
      expect(await read()).toEqual(before);
      await page.keyboard.press('Alt+Shift+L');
      const ready = await preparing;
      expect(ready.status).toBe(201);
      expect(ready.body.status).toBe('ready');
      expect(
        await page.evaluate(
          async ({ url, contentVersion }) => {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ confirmed: true, contentVersion }),
            });
            return response.status;
          },
          {
            url: `${path}/imports/${ready.body.id}/confirm`,
            contentVersion: before.contentVersion,
          },
        ),
      ).toBe(200);
      const confirmed = await read();
      expect(confirmed).toEqual({
        ...before,
        contentVersion: before.contentVersion + 1,
        // Empty archives have no historical private owner to restore.
        userId: seeded ? before.userId : expect.any(String),
      });
      for (const [mode, url] of [
        ['import-status-drop', `${path}/imports/${ready.body.id}`],
        ['owner-status-drop', `${path}/content-owners`],
      ]) {
        await install(mode);
        const dropped = page.waitForEvent('console', {
          predicate: (message) => message.text() === 'Serverns svar tappat',
        });
        const result = await page.evaluate(async (address) => {
          try {
            await fetch(address);
            return 'delivered';
          } catch (failure) {
            return failure instanceof TypeError ? 'lost' : 'unexpected';
          }
        }, url);
        await dropped;
        expect(result).toBe('lost');
        expect(await page.evaluate(async (address) => (await fetch(address)).status, url)).toBe(
          200,
        );
      }
      expect(await read()).toEqual(confirmed);
      expect(writes).toEqual([`${path}/imports`, `${path}/imports/${ready.body.id}/confirm`]);
    } finally {
      await installation.close();
    }
  });
}

for (const seeded of [false, true]) {
  test(`documented filesystem preparation blocks and restores only the selected ${seeded ? 'seeded' : 'empty'} import cleanup`, {
    tag: '@technical',
  }, async ({ page }) => {
    const installation = await createInstallation();
    let readyId = '';
    const run = async (action: 'block' | 'restore' | 'check') =>
      runShell('bash', ['-c', `${filesystemPreparation}\nskyttel_recovery_files ${action}`], {
        env: {
          ...process.env,
          SKYTTEL_RECOVERY_DATABASE: join(installation.directory, 'skyttel.db'),
          SKYTTEL_RECOVERY_PREPARATION: readyId,
        },
      });
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}`;
      const headers = { origin: installation.origin };
      if (seeded) await seedRecoveryContent(page.request, path);
      const read = async () => (await page.request.get(`${path}/map`)).json();
      const before = await read();
      const exported = await (
        await page.request.post(`${path}/exports`, { headers, data: {} })
      ).json();
      const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
      await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
      await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
        name: 'skyttel.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().startsWith(`${path}/imports`))
          writes.push(request.url());
      });
      const preparing = page.waitForResponse(
        (response) =>
          response.url() === `${path}/imports` && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
      readyId = (await (await preparing).json()).id;
      expect((await run('block')).stdout).toContain('Rensningsfel förberett');
      const cancelling = page.waitForResponse(`${path}/imports/${readyId}/cancel`);
      await page.getByRole('button', { name: 'Avbryt förberedelsen', exact: true }).click();
      expect(await (await cancelling).json()).toMatchObject({
        id: readyId,
        status: 'cancel-cleanup',
      });
      await expect(page.getByText(/Förberedelsen kan inte längre användas/)).toBeVisible();
      expect(await read()).toEqual(before);
      expect((await run('restore')).stdout).toContain('Rensning tillåten');
      const cleaned = page.waitForResponse(`${path}/imports/${readyId}/cancel`);
      await page.getByRole('button', { name: 'Slutför förberedelsens rensning' }).click();
      expect(await (await cleaned).json()).toEqual({ cancelled: true });
      await expect(page.getByText(/Förberedelsen är avbruten/)).toBeVisible();
      expect((await run('check')).stdout).toContain(
        'Rätt förberedelses tillfälliga katalog är borttagen',
      );
      expect((await run('restore')).stdout).toContain('Katalogen är redan borttagen');
      expect(await read()).toEqual(before);
      expect(writes).toEqual([
        `${path}/imports`,
        `${path}/imports/${readyId}/cancel`,
        `${path}/imports/${readyId}/cancel`,
      ]);
    } finally {
      if (readyId) await run('restore');
      await installation.close();
    }
  });
}
