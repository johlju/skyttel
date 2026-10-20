import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openMap, signIn, utilityButton } from '../support/client.js';
import { openSavedHistory } from '../support/conversation-page.js';
import {
  prepareDraftSave,
  preparePropertyDraftSave,
  registerPendingSave,
} from '../support/draft-save.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('UTKAST-36: draft save opens immediately and confirms one persistent save without AI', async ({
  page,
}) => {
  const app = await createInstallation();
  let release: (() => void) | undefined;
  try {
    const { path, read, household } = await prepareDraftSave(page.request, app.origin);
    await page.route('**/map/save', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response: await route.fetch() });
    });
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    const save = draft.getByRole('button', { name: 'Spara hela utkastet', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(modal).toContainText('Sparar utkastet…');
    await expect(modal.getByRole('heading', { name: 'Spara utkastet' })).toBeFocused();
    await expect(modal.getByRole('button')).toHaveCount(1);
    await expect(modal.getByRole('button', { name: 'Stäng dialogen', exact: true })).toBeVisible();
    expect((await read()).draft.changes).toHaveLength(1);
    await expect.poll(() => typeof release).toBe('function');
    release?.();
    await expect(modal).not.toBeVisible();
    await expect(draft).toContainText('Utkastet är tomt.');
    await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
    const confirmation = page
      .locator('p[aria-hidden="true"]')
      .filter({ hasText: /^Utkastet är sparat$/ });
    await expect(confirmation).toHaveCount(1);
    const announcement = page.getByRole('status', { name: 'Sparbekräftelse', exact: true });
    await expect(announcement).toHaveText('Utkastet är sparat');
    await expect(confirmation).toHaveCount(0, { timeout: 4500 });
    await expect(announcement).toHaveText('Utkastet är sparat');
    const saved = await read();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.objects).toHaveLength(1);
    const { operations } = await (await page.request.get(`${path}/operations`)).json();
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
    await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
  } finally {
    release?.();
    await app.close();
  }
});

for (const width of [390, 320])
  test(`${width === 390 ? 'UTKAST-37' : 'UTKAST-100'}: closing a pending mobile save preserves its follow-up across map and table without stealing later focus at ${width}px`, async ({
    page,
  }) => {
    const app = await createInstallation();
    let release: (() => void) | undefined;
    try {
      const { path, household, read } = await prepareDraftSave(page.request, app.origin);
      await page.setViewportSize({ width, height: 844 });
      await page.route('**/map/save', async (route) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fulfill({ response: await route.fetch() });
      });
      await page.goto(`${app.origin}/households/${household.id}`);
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
      const close = modal.getByRole('button', { name: 'Stäng dialogen', exact: true });
      await expect(modal).toContainText('Sparar utkastet…');
      expect(await modal.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
      await openMap(page);
      const followUp = page.getByRole('button', { name: 'Visa sparandet', exact: true });
      await expect(followUp).toBeVisible();
      await followUp.click();
      await expect(modal).toContainText('Sparar utkastet…');
      await close.click();
      const table = page
        .getByRole('navigation', { name: 'Kartans verktyg' })
        .getByRole('button', { name: 'Tabell', exact: true });
      await table.click();
      await expect(followUp).toBeVisible();
      await followUp.click();
      await expect(modal).toContainText('Sparar utkastet…');
      await page.keyboard.press('Escape');
      await expect(followUp).toBeFocused();
      const search = page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true });
      await search.focus();
      await expect.poll(() => typeof release).toBe('function');
      release?.();
      await expect.poll(async () => (await read()).draft.changes.length).toBe(0);
      await expect(search).toBeFocused();
      const { history } = await (await page.request.get(`${path}/history`)).json();
      expect(history).toHaveLength(1);
    } finally {
      release?.();
      await app.close();
    }
  });

test('UTKAST-38: a lost save response keeps proposals until the same durable attempt is checked from the table', async ({
  page,
}) => {
  const app = await createInstallation();
  let release: (() => void) | undefined;
  try {
    const { path, household, read, properties } = await preparePropertyDraftSave(
      page.request,
      app.origin,
    );
    const submitted: { operationId: string; version: number }[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/map/save') && request.method() === 'POST')
        submitted.push(request.postDataJSON());
    });
    await page.route('**/map/save', async (route) => {
      await route.fetch();
      await route.abort();
    });
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(modal).toContainText('Sparandet kunde inte bekräftas.');
    await expect(
      modal.getByRole('button', { name: 'Kontrollera sparandet igen', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      draft.getByRole('button', { name: 'Visa förslaget: Alex blå cykel', exact: true }),
    ).toBeVisible();
    await expect(
      draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    await expect(
      draft.getByRole('button', { name: 'Kasta hela utkastet', exact: true }),
    ).toBeDisabled();
    expect(submitted).toHaveLength(1);
    expect((await read()).objects).toHaveLength(1);
    await openMap(page);
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Tabell', exact: true })
      .click();
    const followUp = page.getByRole('button', { name: 'Visa sparandet', exact: true });
    await followUp.click();
    const details = '**/map/operations/*';
    await page.route(details, async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response: await route.fetch() });
    });
    await modal.getByRole('button', { name: 'Kontrollera sparandet igen', exact: true }).click();
    await expect(modal).toContainText('Kontrollerar sparandet…');
    await expect(modal.getByRole('button', { name: 'Stäng dialogen', exact: true })).toBeFocused();
    await expect.poll(() => typeof release).toBe('function');
    release?.();
    await expect(modal).not.toBeVisible();
    await expect(
      page.locator('p[aria-hidden="true"]').filter({ hasText: /^Utkastet är sparat$/ }),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole('region', { name: 'Hushållets tabell', exact: true })
        .getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeFocused();
    expect(submitted).toHaveLength(1);
    const { operations } = await (await page.request.get(`${path}/operations`)).json();
    expect(operations).toHaveLength(1);
    expect(operations[0].operationId).toBe(submitted[0].operationId);
    expect(operations[0].status).toBe('succeeded');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
    expect(operations[0].receipt.changes[0].after.properties).toEqual(properties);
    expect(operations[0].receipt.relationships[0].after.properties).toEqual(properties);
    await (await utilityButton(page, 'Rapporter')).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await history.getByText('Visa ändringarna', { exact: true }).click();
    const lists = history.getByRole('list', { name: 'Egenskaper i sparad ordning', exact: true });
    await expect(lists).toHaveCount(2);
    for (const list of await lists.all()) {
      await expect(list.getByRole('listitem')).toHaveText([
        'Samma: 0 (Tal)Identitet: zero',
        'Samma: Nej (Ja/nej)Identitet: false',
        'Väntar: Tomt (Datum)Identitet: typed-empty',
        'Väntar: Tomt (ingen datatyp)Identitet: untyped',
        'Anteckning: Tom text (Text)Identitet: blank',
      ]);
    }
    await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
  } finally {
    release?.();
    await app.close();
  }
});

test('UTKAST-39: a durable save attempt remains reachable after reload without a draft icon or conversation and reports a confirmed rejection', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const before: MapState = await (await page.request.get(path)).json();
    const attempt = await registerPendingSave(page.request, path, 'persisted-empty-attempt');
    // Simulate unavailable automatic recovery, using the genuine durable attempt.
    await page.route('**/text-assistant/recover', (route) => route.abort());
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Utkast', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
    const followUp = page.getByRole('button', { name: 'Visa sparandet', exact: true });
    await expect(followUp).toBeVisible();
    await followUp.click();
    const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(modal).toContainText('Sparandet kunde inte bekräftas.');
    await modal.getByRole('button', { name: 'Kontrollera sparandet igen', exact: true }).click();
    await expect(modal).toContainText('Utkastet kunde inte sparas.');
    await expect(modal.getByRole('button')).toHaveCount(1);
    const { operations } = await (await page.request.get(`${path}/operations`)).json();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: attempt.operationId,
      status: 'rejected',
      error: 'empty_draft',
    });
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
    expect(await (await page.request.get(path)).json()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(followUp).toBeFocused();
    await followUp.click();
    await expect(modal).toContainText('Utkastet kunde inte sparas.');
    await page.keyboard.press('Escape');
    await page.reload();
    await followUp.click();
    await expect(modal).toContainText('Utkastet kunde inte sparas.');
    await expect(modal.getByRole('button')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('UTKAST-40: a verified receipt closes the save dialog despite a failed map refresh and never repeats its announcement', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    const { path, household, read } = await prepareDraftSave(page.request, app.origin);
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    const mapReads = /\/map(?:\?.*)?$/;
    await page.route(mapReads, (route) =>
      route.request().method() === 'GET' ? route.abort() : route.continue(),
    );
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Spara utkastet', exact: true }),
    ).not.toBeVisible();
    await expect(draft).toContainText('Utkastet är tomt.');
    await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
    const confirmation = page
      .locator('p[aria-hidden="true"]')
      .filter({ hasText: /^Utkastet är sparat$/ });
    await expect(confirmation).toHaveCount(1);
    const announcement = page.getByRole('status', { name: 'Sparbekräftelse', exact: true });
    await expect(announcement).toHaveText('Utkastet är sparat');
    await openMap(page);
    const status = page.getByRole('region', { name: 'Kartans status', exact: true });
    await expect(status.getByRole('alert')).toContainText('kartan kunde inte hämtas');
    await expect(confirmation).toHaveCount(0, { timeout: 4500 });
    const announcedNode = await announcement.locator('span').elementHandle();
    await page.unroute(mapReads);
    await status.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await expect(status.getByRole('alert')).toHaveCount(0);
    await expect(confirmation).toHaveCount(0);
    expect(await announcedNode?.evaluate((node) => node.isConnected)).toBe(true);
    expect((await read()).draft.changes).toEqual([]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('UTKAST-101: recovery after reload completes the existing attempt and retires its unknown follow-up without AI', async ({
  page,
}) => {
  const app = await createInstallation();
  let release: (() => void) | undefined;
  try {
    const { path, household, read } = await prepareDraftSave(page.request, app.origin);
    const attempt = await registerPendingSave(page.request, path, 'persisted-draft-attempt');
    await page.route('**/text-assistant/recover', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response: await route.fetch() });
    });
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.reload();
    const followUp = page.getByRole('button', { name: 'Visa sparandet', exact: true });
    await expect(followUp).toBeVisible();
    await expect.poll(() => typeof release).toBe('function');
    release?.();
    await expect.poll(async () => (await read()).draft.changes.length).toBe(0);
    await expect(followUp).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Utkast', exact: true })).toHaveCount(0);
    const { operations } = await (await page.request.get(`${path}/operations`)).json();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ operationId: attempt.operationId, status: 'succeeded' });
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
    await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
  } finally {
    release?.();
    await app.close();
  }
});

test('UTKAST-102: a rejected stale version retains every proposal until fresh reading and creates no saved history', async ({
  page,
}) => {
  const app = await createInstallation();
  try {
    const { path, household, read } = await prepareDraftSave(page.request, app.origin);
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    const before = await read();
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin: app.origin },
          data: {
            version: before.draft.version,
            id: 'bike',
            baseRevision: null,
            value: { ...before.draft.changes[0].after, name: 'Alex nya cykelnamn' },
          },
        })
      ).status(),
    ).toBe(200);
    const newer = await read();
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(modal).toContainText('Utkastet kunde inte sparas.');
    await expect(modal).toContainText('Inget sparades av detta försök.');
    await expect(modal.getByRole('button')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
    await expect(
      draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    expect(await read()).toEqual(newer);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
    const { operations } = await (await page.request.get(`${path}/operations`)).json();
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('rejected');
    await openMap(page);
    await page
      .getByRole('region', { name: 'Kartans status', exact: true })
      .getByRole('button', { name: 'Hämta aktuellt underlag', exact: true })
      .click();
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    await expect(draft).toContainText('Alex nya cykelnamn');
    await expect(
      draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeEnabled();
    expect(await read()).toEqual(newer);
    await expect(await openSavedHistory(page)).toContainText('Inga genomförda sparanden.');
  } finally {
    await app.close();
  }
});

test('UTKAST-103: a closed pending save restores the table heading when its focused follow-up disappears', async ({
  page,
}) => {
  const app = await createInstallation();
  let release: (() => void) | undefined;
  try {
    const { household } = await prepareDraftSave(page.request, app.origin);
    await page.route('**/map/save', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response: await route.fetch() });
    });
    await page.goto(`${app.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    await page
      .getByRole('region', { name: 'Utkastet', exact: true })
      .getByRole('button', { name: 'Spara hela utkastet', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await openMap(page);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const followUp = page.getByRole('button', { name: 'Visa sparandet', exact: true });
    await followUp.click();
    await page.keyboard.press('Escape');
    await expect(followUp).toBeFocused();
    await expect.poll(() => typeof release).toBe('function');
    release?.();
    await expect(followUp).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Hushållets tabell', exact: true })
        .getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeFocused();
  } finally {
    release?.();
    await app.close();
  }
});

for (const width of [1280, 390])
  test(`${width === 1280 ? 'UTKAST-104' : 'UTKAST-105'}: Map receipt recovery restores visible draft context after its follow-up disappears at ${width}px`, async ({
    page,
  }) => {
    const app = await createInstallation();
    try {
      const { path, household } = await prepareDraftSave(page.request, app.origin);
      await page.setViewportSize({ width, height: 850 });
      await page.route('**/map/save', async (route) => {
        await route.fetch();
        await route.abort();
      });
      await page.goto(`${app.origin}/households/${household.id}`);
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
      await expect(modal).toContainText('Sparandet kunde inte bekräftas.');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
      await openMap(page);
      await expect(draft).not.toBeVisible();
      await page.getByRole('button', { name: 'Visa sparandet', exact: true }).click();
      await modal.getByRole('button', { name: 'Kontrollera sparandet igen', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(draft).toBeVisible();
      await expect(draft).toContainText('Utkastet är tomt.');
      await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
      await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
      const { operations } = await (await page.request.get(`${path}/operations`)).json();
      expect(operations).toHaveLength(1);
      expect(operations[0].status).toBe('succeeded');
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
        operations[0].receipt,
      ]);
    } finally {
      await app.close();
    }
  });
