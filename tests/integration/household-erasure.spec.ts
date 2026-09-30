import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { ErasureStatus } from '../../src/shared/household-erasure.js';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openSettings, openWorkspace, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

async function arrange(page: Page, formerImageType = false) {
  const installation = await createInstallation();
  await signIn(page.request, installation.origin);
  const { household } = await (await createHousehold(page.request, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}`;
  const headers = { origin: installation.origin };
  const read = async (): Promise<MapState> => (await page.request.get(`${path}/map`)).json();
  const post = (suffix: string, data: unknown) =>
    page.request.post(`${path}/${suffix}`, { headers, data });
  if (formerImageType)
    expect(
      (
        await post('map/object-type', {
          id: 'former-image-type',
          version: 0,
          baseRevision: null,
          value: { name: 'Tidigare bildtyp', description: '', fields: [] },
        })
      ).status(),
    ).toBe(200);
  for (const [id, name] of [
    ['lamp', 'Lampan att radera'],
    ['chair', 'Stolen att bevara'],
  ]) {
    const state = await read();
    expect(
      (
        await post('map/draft', {
          id,
          version: state.draft.version,
          baseRevision: null,
          value: {
            typeId: formerImageType && id === 'lamp' ? 'former-image-type' : state.types[0].id,
            name,
            description: '',
          },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await post('map/save', {
        version: (await read()).draft.version,
        operationId: 'mixed-original',
      })
    ).status(),
  ).toBe(200);
  for (const [id, x] of [
    ['lamp', 5],
    ['chair', -5],
  ] as const)
    expect(
      (await post('map/view/position', { id, version: 0, position: { x, y: 2, z: 1 } })).status(),
    ).toBe(200);
  const state = await read();
  const png = await sharp({ create: { width: 24, height: 18, channels: 3, background: '#123abc' } })
    .png()
    .toBuffer();
  expect(
    (
      await page.request.post(`${path}/profile-images/lamp`, {
        headers: {
          ...headers,
          'content-type': 'image/png',
          'x-skyttel-draft-version': String(state.draft.version),
          'x-skyttel-content-version': String(state.contentVersion),
          'x-skyttel-object-revision': '1',
        },
        data: png,
      })
    ).status(),
  ).toBe(200);
  const imageId = (await read()).draft.changes.find((change) => change.id === 'lamp')?.after
    ?.profileImageId;
  expect(imageId).toEqual(expect.any(String));
  expect(
    (
      await post('map/save', { version: (await read()).draft.version, operationId: 'image-save' })
    ).status(),
  ).toBe(200);
  const latest = await read();
  const chair = latest.objects.find((object) => object.id === 'chair');
  if (!formerImageType)
    expect(
      (
        await post('map/draft', {
          id: 'chair',
          version: latest.draft.version,
          baseRevision: chair?.revision,
          value: { ...chair, description: 'Oberoende privat förslag' },
        })
      ).status(),
    ).toBe(200);
  return {
    installation,
    path,
    post,
    read,
    imageId,
    administration: `${installation.origin}/households/${household.id}/administration`,
  };
}

async function reviewInBrowser(page: Page, administration: string) {
  await page.goto(administration.replace(/\/administration$/, '/settings/erasure'));
  const section = page.getByRole('region', { name: 'Permanent radering', exact: true });
  await section.getByRole('checkbox', { name: 'Lampan att radera', exact: true }).focus();
  await page.keyboard.press('Space');
  await section.getByRole('button', { name: 'Granska raderingen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(section.getByRole('region', { name: 'Omfattning att bekräfta' })).toBeVisible();
  return section;
}

async function expectErasureFocus(control: Locator) {
  await expect(control).toBeFocused();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= innerHeight &&
          box.right <= innerWidth &&
          element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          ) &&
          style.outlineStyle === 'solid' &&
          Number.parseFloat(style.outlineWidth) >= 2
        );
      }),
    )
    .toBe(true);
}

async function expectErasureText(text: Locator) {
  await expect(text).toBeVisible();
  expect(
    await text.evaluate((element) => {
      const region = element.closest('.household-erasure');
      if (!region) return false;
      const bounds = region.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()];
      return (
        lines.length > 0 &&
        lines.every(
          (line) =>
            line.left >= Math.max(0, bounds.left) &&
            line.right <= Math.min(innerWidth, bounds.right),
        )
      );
    }),
  ).toBe(true);
}

async function expectErasureContrast(control: Locator) {
  await expect(control).toBeVisible();
  const contrast = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const channels = (color.match(/\d+/g) ?? [])
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const unit = value / 255;
          return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

for (const [width, height] of [
  [1280, 900],
  [390, 900],
  [320, 900],
  [640, 500],
  [320, 250],
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`RADERING-06: dedicated Settings review can be cancelled before explicit erasure and a fresh map at ${width}x${height}px ${theme}`, async ({
      page,
    }) => {
      const fixture = await arrange(page);
      try {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const before = await fixture.read();
        const viewBefore = await (await page.request.get(`${fixture.path}/map/view`)).json();
        let executions = 0;
        page.on('request', (request) => {
          if (request.url().endsWith('/erasure/execute')) executions += 1;
        });
        await page.goto(fixture.installation.origin);
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
        const unsent = page.getByLabel('Objektets namn');
        await unsent.fill('Oskickat arbete före radering');
        await unsent.focus();
        await openSettings(page);
        const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
        const menu = navigation.getByText('Välj inställning', { exact: true });
        if (width <= 800) {
          await menu.focus();
          await page.keyboard.press('Enter');
        }
        const destination = navigation.getByRole('link', {
          name: 'Permanent radering',
          exact: true,
        });
        await expect(destination).toBeVisible();
        await destination.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/settings\/erasure$/);
        const section = page.getByRole('region', { name: 'Permanent radering', exact: true });
        const stage = section
          .getByRole('list', { name: 'Raderingens steg' })
          .locator('[aria-current="step"]');
        await expect(stage).toContainText('Välj information');
        await expect(
          section.getByRole('heading', { name: 'Permanent radering', level: 1 }),
        ).toBeFocused();
        await expectErasureFocus(
          section.getByRole('heading', { name: 'Permanent radering', level: 1 }),
        );
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        if (width <= 800) {
          await menu.focus();
          await page.keyboard.press('Enter');
        }
        await expect(destination).toHaveAttribute('aria-current', 'page');
        await destination.scrollIntoViewIfNeeded();
        await expectErasureContrast(destination);
        if (width <= 800) {
          await menu.focus();
          await page.keyboard.press('Enter');
        }
        await expect(unsent).not.toBeVisible();
        await expect(
          page.getByRole('region', { name: 'Rymdkarta', exact: true }),
        ).not.toBeVisible();
        const selected = section.getByRole('checkbox', { name: 'Lampan att radera', exact: true });
        await selected.focus();
        await expectErasureFocus(selected);
        expect((await selected.boundingBox())?.width).toBeGreaterThanOrEqual(24);
        expect((await selected.boundingBox())?.height).toBeGreaterThanOrEqual(24);
        expect((await selected.locator('..').boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Space');
        const inspect = section.getByRole('button', { name: 'Granska raderingen', exact: true });
        await inspect.focus();
        await expectErasureFocus(inspect);
        expect((await inspect.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        const scope = section.getByRole('region', { name: 'Omfattning att bekräfta' });
        await expect(scope).toBeVisible();
        await expect(stage).toContainText('Granska hela omfattningen');
        await expectErasureFocus(
          scope.getByRole('heading', { name: 'Omfattning att bekräfta', exact: true }),
        );
        await expect(
          scope.getByRole('list', { name: 'Berörda objekt', exact: true }),
        ).toContainText('Lampan att radera');
        await expect(scope).not.toContainText('Stolen att bevara');
        await expect(scope).not.toContainText('Oberoende privat förslag');
        await expect(scope).toContainText('Bildversioner: 1');
        await expect(scope).toContainText('Personliga placeringar: 1');
        await expect(scope.getByRole('list', { name: 'Berörda bildversioner' })).toContainText(
          fixture.imageId as string,
        );
        const imageIdentity = scope
          .getByRole('list', { name: 'Berörda bildversioner' })
          .getByText(fixture.imageId as string, { exact: true });
        await expectErasureText(imageIdentity);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const confirmation = scope.getByLabel('Skriv RADERA PERMANENT', { exact: true });
        const erase = scope.getByRole('button', { name: 'Radera permanent', exact: true });
        await expect(erase).toBeDisabled();
        await confirmation.focus();
        await expectErasureFocus(confirmation);
        expect((await confirmation.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await confirmation.fill('RADERA permanent');
        await expect(erase).toBeDisabled();
        await confirmation.fill('RADERA PERMANENT');
        const cancel = scope.getByRole('button', { name: 'Avbryt', exact: true });
        await cancel.focus();
        await expectErasureFocus(cancel);
        expect((await cancel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        await expect(scope).toHaveCount(0);
        await expect(stage).toContainText('Välj information');
        await expectErasureFocus(section.getByText('Välj information att radera', { exact: true }));
        await expect(selected).toBeChecked();
        expect(executions).toBe(0);
        expect(await fixture.read()).toEqual(before);
        expect(await (await page.request.get(`${fixture.path}/map/view`)).json()).toEqual(
          viewBefore,
        );
        await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(unsent).toHaveValue('Oskickat arbete före radering');
        await expect(unsent).toBeFocused();
        await openSettings(page);
        if (width <= 800) {
          await menu.focus();
          await page.keyboard.press('Enter');
        }
        await destination.focus();
        await page.keyboard.press('Enter');
        await selected.focus();
        await page.keyboard.press('Space');
        await inspect.focus();
        await page.keyboard.press('Enter');
        await expect(confirmation).toHaveValue('');
        await expect(erase).toBeDisabled();
        await confirmation.fill('RADERA PERMANENT');
        await erase.focus();
        await expectErasureFocus(erase);
        await expectErasureContrast(erase);
        expect((await erase.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        const executing = page.waitForResponse(`${fixture.path}/erasure/execute`);
        await page.keyboard.press('Enter');
        const executed = await executing;
        expect(executed.status()).toBe(200);
        const result: ErasureStatus = (await executed.json()).status;
        expect(result.phase).toBe('completed');
        await expect(
          section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
        ).toBeVisible();
        const operation = section.getByText(result.operationId, { exact: true });
        await expectErasureText(operation);
        await expect(stage).toContainText('Resultat');
        await expect(
          section.getByRole('list', { name: 'Raderingens resultat' }).getByRole('listitem'),
        ).toHaveText([
          'Objekt: 1',
          'Samband: 0',
          'Objekttyper: 0',
          'Sambandstyper: 0',
          'Bildversioner: 1',
        ]);
        expect(executions).toBe(1);
        await expect(unsent).toHaveCount(0, { timeout: 10000 });
        const current = await fixture.read();
        expect(current.contentVersion).toBe(before.contentVersion + 1);
        expect(current.objects).toEqual(before.objects.filter((object) => object.id === 'chair'));
        expect(current.draft).toEqual(before.draft);
        expect(current.types).toEqual(before.types);
        expect(current.relationshipTypes).toEqual(before.relationshipTypes);
        const readMap = section.getByRole('button', { name: 'Läs in kartan på nytt', exact: true });
        await expect(readMap).toBeFocused();
        await expectErasureFocus(readMap);
        await expectErasureContrast(readMap);
        expect((await readMap.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(fixture.administration.replace(/\/administration$/, ''));
        await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
        await expect(unsent).toHaveCount(0);
        await openWorkspace(page);
        await expect(
          page.getByRole('button', { name: 'Uppgifter för Lampan att radera', exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Uppgifter för Stolen att bevara', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
          'Oberoende privat förslag',
        );
        expect(await fixture.read()).toEqual(current);
        expect((await (await page.request.get(fixture.path)).json()).household.role).toBe(
          'administrator',
        );
      } finally {
        await fixture.installation.close();
      }
    });
  }
}

test('RADERING-01: keyboard review erases selected content and preserves unrelated work after restart', async ({
  page,
}) => {
  const fixture = await arrange(page);
  try {
    const section = await reviewInBrowser(page, fixture.administration);
    await expect(section).toContainText('kan inte ångras i Skyttel');
    await expect(section).toContainText('Redan nedladdade exporter ändras inte');
    await expect(section).toContainText('Omedelbar fysisk radering');
    const scope = section.getByRole('region', { name: 'Omfattning att bekräfta' });
    await expect(scope).toContainText('Lampan att radera');
    await expect(scope).not.toContainText('Stolen att bevara');
    await expect(scope).toContainText('Bildversioner: 1');
    await expect(scope).toContainText('Personliga placeringar: 1');
    await expect(scope.getByRole('list', { name: 'Berörda bildversioner' })).toContainText(
      fixture.imageId as string,
    );
    const erase = section.getByRole('button', { name: 'Radera permanent', exact: true });
    await expect(erase).toBeDisabled();
    expect((await fixture.read()).objects).toHaveLength(2);
    await scope.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await erase.focus();
    await page.keyboard.press('Enter');
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    await fixture.installation.restart();
    await page.reload();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    const state = await fixture.read();
    expect(state.objects.map((object) => object.id)).toEqual(['chair']);
    const view = await (await page.request.get(`${fixture.path}/map/view`)).json();
    expect(view.positions).toEqual([expect.objectContaining({ id: 'chair', x: -5, y: 2, z: 1 })]);
    expect(state.draft.changes).toEqual([
      expect.objectContaining({
        id: 'chair',
        after: expect.objectContaining({ description: 'Oberoende privat förslag' }),
      }),
    ]);
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(404);
    const { history } = await (await page.request.get(`${fixture.path}/map/history`)).json();
    expect(JSON.stringify(history)).not.toContain('Lampan att radera');
    expect(JSON.stringify(history)).toContain('Stolen att bevara');
    const prepared = await fixture.post('exports', {});
    expect(prepared.status()).toBe(201);
    const { id } = await prepared.json();
    const download = await page.request.get(`${fixture.path}/exports/${id}`);
    expect(download.status()).toBe(200);
    const archive = unzipSync(await download.body());
    const content = JSON.parse(Buffer.from(archive['content.json']).toString());
    expect(content.objects.map((object: { id: string }) => object.id)).toEqual(['chair']);
    expect(content.images).toEqual([]);
    expect(archive['images.bin']).toHaveLength(0);
    expect(JSON.stringify(content)).not.toContain('Lampan att radera');
    expect(JSON.stringify(content)).toContain('Oberoende privat förslag');
  } finally {
    await fixture.installation.close();
  }
});

test('RADERING-02: a lost completion reply is recovered from durable status without another erasure', async ({
  page,
}) => {
  const fixture = await arrange(page);
  try {
    const section = await reviewInBrowser(page, fixture.administration);
    let executions = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/erasure/execute')) executions += 1;
    });
    await page.route(
      '**/erasure/execute',
      async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        expect((await response.json()).status.phase).toBe('completed');
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Utfallet är oklart');
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    await expect(section.getByRole('checkbox')).toHaveCount(0);
    await section
      .getByRole('button', { name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll' })
      .click();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    expect(executions).toBe(1);
    expect((await fixture.read()).objects.map((object) => object.id)).toEqual(['chair']);
    await page.reload();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
  } finally {
    await fixture.installation.close();
  }
});

test('RADERING-03: a changed scope requires a new review and confirmation before erasure', async ({
  page,
}) => {
  const fixture = await arrange(page);
  try {
    const section = await reviewInBrowser(page, fixture.administration);
    const state = await fixture.read();
    const chair = state.objects.find((object) => object.id === 'chair');
    expect(
      (
        await fixture.post('map/draft', {
          id: 'chair',
          version: state.draft.version,
          baseRevision: chair?.revision,
          value: { ...chair, description: 'Senare privat förslag' },
        })
      ).status(),
    ).toBe(200);
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Granska raderingen igen');
    await expect(
      section.getByRole('button', { name: 'Radera permanent', exact: true }),
    ).toHaveCount(0);
    expect((await fixture.read()).objects).toHaveLength(2);
    await section.getByRole('button', { name: 'Granska raderingen', exact: true }).click();
    await expect(section.getByLabel('Skriv RADERA PERMANENT', { exact: true })).toHaveValue('');
    await expect(
      section.getByRole('button', { name: 'Radera permanent', exact: true }),
    ).toBeDisabled();
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    expect((await fixture.read()).draft.changes[0].after?.description).toBe(
      'Senare privat förslag',
    );
  } finally {
    await fixture.installation.close();
  }
});

test('RADERING-04: pending cleanup survives application restart and completes only after the reader releases', async ({
  page,
}) => {
  const fixture = await arrange(page);
  const reader = new Database(join(fixture.installation.directory, 'skyttel.db'), {
    readonly: true,
  });
  try {
    const section = await reviewInBrowser(page, fixture.administration);
    // This independent SQLite reader pins pre-erasure WAL pages. The UI and
    // assertions still use the running application and its public HTTP API.
    reader.exec('BEGIN');
    reader.prepare('SELECT id FROM map_object LIMIT 1').get();
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    const response = page.waitForResponse((result) => result.url().endsWith('/erasure/execute'));
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    expect((await response).status()).toBe(202);
    await expect(
      section.getByText(/Hushållets innehåll är tillfälligt otillgängligt/),
    ).toBeVisible();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    await expect(section.getByRole('checkbox')).toHaveCount(0);
    expect(await (await page.request.get(`${fixture.path}/map`)).json()).toEqual({
      error: 'content_maintenance',
    });
    expect(await (await fixture.post('exports', {})).json()).toEqual({
      error: 'content_maintenance',
    });
    await fixture.installation.restart();
    await page.reload();
    await expect(section.getByRole('button', { name: 'Försök slutföra raderingen' })).toBeVisible();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    expect((await (await page.request.get(`${fixture.path}/erasure`)).json()).status.phase).toBe(
      'cleanup',
    );
    reader.exec('ROLLBACK');
    await section.getByRole('button', { name: 'Försök slutföra raderingen' }).click();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    expect((await fixture.read()).objects.map((object) => object.id)).toEqual(['chair']);
    expect((await fixture.read()).draft.changes[0].after?.description).toBe(
      'Oberoende privat förslag',
    );
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(404);
  } finally {
    if (reader.inTransaction) reader.exec('ROLLBACK');
    reader.close();
    await fixture.installation.close();
  }
});

test('RADERING-05: erasing a former type removes its historical image from a fresh export while preserving the current object after restart', async ({
  page,
}) => {
  const fixture = await arrange(page, true);
  try {
    let state = await fixture.read();
    const lamp = state.objects.find((object) => object.id === 'lamp');
    expect(
      (
        await fixture.post('map/draft', {
          id: 'lamp',
          version: state.draft.version,
          baseRevision: lamp?.revision,
          value: {
            ...lamp,
            typeId: state.types.find((type) => type.id !== 'former-image-type')?.id,
          },
        })
      ).status(),
    ).toBe(200);
    const replacement = await sharp({
      create: { width: 24, height: 18, channels: 3, background: '#ee8800' },
    })
      .png()
      .toBuffer();
    state = await fixture.read();
    expect(
      (
        await page.request.post(`${fixture.path}/profile-images/lamp`, {
          headers: {
            origin: fixture.installation.origin,
            'content-type': 'image/png',
            'x-skyttel-content-version': String(state.contentVersion),
            'x-skyttel-draft-version': String(state.draft.version),
            'x-skyttel-object-revision': String(lamp?.revision),
          },
          data: replacement,
        })
      ).status(),
    ).toBe(200);
    state = await fixture.read();
    const currentImage = state.draft.changes[0].after?.profileImageId;
    expect(currentImage).not.toBe(fixture.imageId);
    expect(
      (
        await fixture.post('map/save', {
          version: state.draft.version,
          operationId: 'new-meaning-and-image',
        })
      ).status(),
    ).toBe(200);
    state = await fixture.read();
    const chair = state.objects.find((object) => object.id === 'chair');
    expect(
      (
        await fixture.post('map/draft', {
          id: 'chair',
          version: state.draft.version,
          baseRevision: chair?.revision,
          value: { ...chair, description: 'Oberoende privat förslag' },
        })
      ).status(),
    ).toBe(200);
    await page.goto(fixture.administration.replace(/\/administration$/, '/settings/erasure'));
    const section = page.getByRole('region', { name: 'Permanent radering', exact: true });
    await section.getByRole('checkbox', { name: 'Tidigare bildtyp', exact: true }).check();
    await section.getByRole('button', { name: 'Granska raderingen', exact: true }).click();
    const scope = section.getByRole('region', { name: 'Omfattning att bekräfta' });
    await expect(scope.getByRole('list', { name: 'Berörda objekt', exact: true })).toBeEmpty();
    await expect(scope).toContainText('Bildversioner: 1');
    await expect(scope).toContainText('Personliga placeringar: 0');
    await expect(scope.getByRole('list', { name: 'Berörda bildversioner' })).toContainText(
      fixture.imageId as string,
    );
    await expect(scope.getByRole('list', { name: 'Berörda bildversioner' })).not.toContainText(
      currentImage as string,
    );
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(200);
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    await fixture.installation.restart();
    await page.reload();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    state = await fixture.read();
    expect(state.objects).toHaveLength(2);
    expect(state.objects.find((object) => object.id === 'lamp')?.profileImageId).toBe(currentImage);
    expect(state.draft.changes).toMatchObject([
      { id: 'chair', after: { description: 'Oberoende privat förslag' } },
    ]);
    expect(state.types.some((type) => type.id === 'former-image-type')).toBe(false);
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(404);
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${currentImage}`)).status(),
    ).toBe(200);
    const { history } = await (await page.request.get(`${fixture.path}/map/history`)).json();
    expect(JSON.stringify(history)).not.toContain(fixture.imageId);
    expect(JSON.stringify(history)).toContain('Stolen att bevara');
    const view = await (await page.request.get(`${fixture.path}/map/view`)).json();
    expect(view.positions.map((position: { id: string }) => position.id).sort()).toEqual([
      'chair',
      'lamp',
    ]);
    const prepared = await fixture.post('exports', {});
    expect(prepared.status()).toBe(201);
    const { id } = await prepared.json();
    const archive = unzipSync(
      await (await page.request.get(`${fixture.path}/exports/${id}`)).body(),
    );
    const content = JSON.parse(Buffer.from(archive['content.json']).toString());
    expect(content.images.map((image: { id: string }) => image.id)).toEqual([currentImage]);
    expect(Buffer.from(archive['images.bin'])).toEqual(
      await (await page.request.get(`${fixture.path}/profile-images/${currentImage}`)).body(),
    );
    expect(JSON.stringify(content)).not.toContain(fixture.imageId);
    expect(JSON.stringify(content)).toContain('Oberoende privat förslag');
    await section.getByRole('button', { name: 'Läs in kartan på nytt', exact: true }).click();
    await page.waitForURL(fixture.administration.replace(/\/administration$/, ''));
    await openWorkspace(page);
    await page
      .getByRole('button', { name: 'Uppgifter för Lampan att radera', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Val och redigering' })
        .getByRole('img', { name: 'Profilbild för Lampan att radera' }),
    ).toHaveAttribute('src', new RegExp(`/profile-images/${currentImage}$`));
  } finally {
    await fixture.installation.close();
  }
});

test('RADERING-07: a known erasure survives Settings navigation and reload despite a newer result', async ({
  page,
  browser,
}) => {
  const fixture = await arrange(page);
  const other = await browser.newContext();
  try {
    const original = await fixture.read();
    fixture.installation.setIdentity(robin);
    await signIn(other.request, fixture.installation.origin, 'microsoft');
    const { user } = await (
      await other.request.get(`${fixture.installation.origin}/api/bootstrap`)
    ).json();
    const invitation = await fixture.post('invitations', { userId: user.id });
    expect(invitation.status()).toBe(201);
    const { code } = await invitation.json();
    expect(
      (
        await other.request.post(`${fixture.installation.origin}/api/invitations/accept`, {
          headers: { origin: fixture.installation.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await fixture.post(`members/${user.id}/role`, { role: 'administrator' })).status(),
    ).toBe(200);
    const otherPost = (suffix: string, data: unknown) =>
      other.request.post(`${fixture.path}/${suffix}`, {
        headers: { origin: fixture.installation.origin },
        data,
      });
    const otherMap: MapState = await (await other.request.get(`${fixture.path}/map`)).json();
    expect(
      (
        await otherPost('map/relationship-type', {
          id: 'later-unused-type',
          version: otherMap.draft.version,
          contentVersion: otherMap.contentVersion,
          baseRevision: null,
          value: {
            name: 'Senare tom sambandstyp',
            description: '',
            forwardLabel: 'använder',
            reverseLabel: 'används av',
            fields: [],
          },
        })
      ).status(),
    ).toBe(200);
    const otherDraft: MapState = await (await other.request.get(`${fixture.path}/map`)).json();
    expect(
      (
        await otherPost('map/save', {
          version: otherDraft.draft.version,
          contentVersion: otherDraft.contentVersion,
          operationId: 'save-unused-type',
        })
      ).status(),
    ).toBe(200);
    expect((await fixture.read()).draft).toEqual(original.draft);
    const before = await fixture.read();
    const viewBefore = await (await page.request.get(`${fixture.path}/map/view`)).json();
    const section = await reviewInBrowser(page, fixture.administration);
    let executeCount = 0;
    let resumeCount = 0;
    let firstId = '';
    let firstStatus: ErasureStatus | null = null;
    page.on('request', (request) => {
      if (request.url().endsWith('/erasure/execute')) executeCount += 1;
      if (request.url().endsWith('/erasure/resume')) resumeCount += 1;
    });
    await page.route(
      '**/erasure/execute',
      async (route) => {
        firstId = route.request().postDataJSON().operationId;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        firstStatus = (await response.json()).status;
        expect(firstStatus).toMatchObject({
          operationId: firstId,
          phase: 'completed',
          counts: { objects: 1, relationshipTypes: 0, images: 1 },
        });
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Utfallet är oklart');
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    expect(firstId).not.toBe('');
    const selection = [{ kind: 'relationshipType', id: 'later-unused-type' }];
    const reviewResponse = await otherPost('erasure/review', { selection });
    expect(reviewResponse.status()).toBe(200);
    const review = await reviewResponse.json();
    expect(review).toMatchObject({ objects: [], relationships: [], privateChanges: 0 });
    const newer = await otherPost('erasure/execute', {
      selection,
      token: review.token,
      operationId: 'later-erasure',
      confirmation: 'RADERA PERMANENT',
    });
    expect(newer.status()).toBe(200);
    const newerStatus = (await newer.json()).status;
    expect(newerStatus).toMatchObject({
      operationId: 'later-erasure',
      phase: 'completed',
      counts: { objects: 0, relationshipTypes: 1, images: 0 },
    });
    const catalogStatus = (await (await page.request.get(`${fixture.path}/erasure`)).json()).status;
    expect(catalogStatus.operationId).toBe('later-erasure');
    await test.info().attach('actual-erasure-receipts', {
      body: JSON.stringify({ firstStatus, newerStatus, catalogStatus }, null, 2),
      contentType: 'application/json',
    });
    const retained = await fixture.read();
    expect(retained.contentVersion).toBe(before.contentVersion + 2);
    expect(retained.objects).toEqual(before.objects.filter(({ id }) => id === 'chair'));
    expect(retained.draft).toEqual(before.draft);
    expect(retained.types).toEqual(before.types);
    expect(retained.relationshipTypes).toEqual(
      before.relationshipTypes.filter(({ id }) => id !== 'later-unused-type'),
    );
    const retainedView = await (await page.request.get(`${fixture.path}/map/view`)).json();
    expect(retainedView).toEqual({
      ...viewBefore,
      contentVersion: viewBefore.contentVersion + 2,
      positions: viewBefore.positions.filter(({ id }: { id: string }) => id === 'chair'),
    });
    const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
    await navigation.getByRole('link', { name: 'Översikt', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inställningar', level: 1 })).toBeFocused();
    await navigation.getByRole('link', { name: 'Permanent radering', exact: true }).click();
    await page.reload();
    const read = section.getByRole('button', {
      name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
    });
    await read.click();
    await expect(section.getByText(firstId, { exact: true })).toBeVisible();
    await expect(section.getByText('later-erasure', { exact: true })).toHaveCount(0);
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole('list', { name: 'Raderingens resultat' }).getByRole('listitem'),
    ).toHaveText([
      'Objekt: 1',
      'Samband: 0',
      'Objekttyper: 0',
      'Sambandstyper: 0',
      'Bildversioner: 1',
    ]);
    await navigation.getByRole('link', { name: 'Översikt', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inställningar', level: 1 })).toBeFocused();
    await navigation.getByRole('link', { name: 'Permanent radering', exact: true }).click();
    await read.click();
    await expect(section.getByText(firstId, { exact: true })).toBeVisible();
    await expect(section.getByText('later-erasure', { exact: true })).toHaveCount(0);
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    expect(executeCount).toBe(1);
    expect(resumeCount).toBe(0);
    expect(await fixture.read()).toEqual(retained);
    expect(await (await page.request.get(`${fixture.path}/map/view`)).json()).toEqual(retainedView);
  } finally {
    await other.close();
    await fixture.installation.close();
  }
});

test('RADERING-08: a current administrator continues the same cleanup after role loss, restart and a lost resume reply', async ({
  page,
  browser,
}) => {
  const fixture = await arrange(page);
  const other = await browser.newContext();
  const reader = new Database(join(fixture.installation.directory, 'skyttel.db'), {
    readonly: true,
  });
  try {
    const { user: initiator } = await (
      await page.request.get(`${fixture.installation.origin}/api/bootstrap`)
    ).json();
    fixture.installation.setIdentity(robin);
    await signIn(other.request, fixture.installation.origin, 'microsoft');
    const { user } = await (
      await other.request.get(`${fixture.installation.origin}/api/bootstrap`)
    ).json();
    const invitation = await fixture.post('invitations', { userId: user.id });
    expect(invitation.status()).toBe(201);
    const { code } = await invitation.json();
    expect(
      (
        await other.request.post(`${fixture.installation.origin}/api/invitations/accept`, {
          headers: { origin: fixture.installation.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await fixture.post(`members/${user.id}/role`, { role: 'administrator' })).status(),
    ).toBe(200);
    const otherPost = (suffix: string, data: unknown) =>
      other.request.post(`${fixture.path}/${suffix}`, {
        headers: { origin: fixture.installation.origin },
        data,
      });
    const otherRead = async (): Promise<MapState> =>
      (await other.request.get(`${fixture.path}/map`)).json();
    const initialOther = await otherRead();
    const chair = initialOther.objects.find(({ id }) => id === 'chair');
    expect(
      (
        await otherPost('map/draft', {
          id: 'chair',
          version: initialOther.draft.version,
          contentVersion: initialOther.contentVersion,
          baseRevision: chair?.revision,
          value: { ...chair, description: 'Robins eget privata förslag' },
        })
      ).status(),
    ).toBe(200);
    const before = await fixture.read();
    const otherBefore = await otherRead();
    const viewBefore = await (await page.request.get(`${fixture.path}/map/view`)).json();
    const section = await reviewInBrowser(page, fixture.administration);
    await expect(section).not.toContainText('Robins eget privata förslag');
    let executeCount = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/erasure/execute')) executeCount += 1;
    });
    reader.exec('BEGIN');
    reader.prepare('SELECT id FROM map_object LIMIT 1').get();
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    const executed = page.waitForResponse((response) =>
      response.url().endsWith('/erasure/execute'),
    );
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    const pendingResponse = await executed;
    expect(pendingResponse.status()).toBe(202);
    const pending: ErasureStatus = (await pendingResponse.json()).status;
    expect(pending).toMatchObject({
      phase: 'cleanup',
      counts: { objects: 1, relationships: 0, objectTypes: 0, relationshipTypes: 0, images: 1 },
    });
    await expect(section.getByText(pending.operationId, { exact: true })).toBeVisible();
    await expect(
      section.getByText(/Hushållets innehåll är tillfälligt otillgängligt/),
    ).toBeVisible();
    expect((await otherPost(`members/${initiator.id}/role`, { role: 'member' })).status()).toBe(
      200,
    );
    expect(
      (await page.request.get(`${fixture.path}/erasure/${pending.operationId}`)).status(),
    ).toBe(403);
    expect(
      (await fixture.post('erasure/resume', { operationId: pending.operationId })).status(),
    ).toBe(403);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Du kan inte administrera hushållet' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Försök slutföra raderingen' })).toHaveCount(0);

    const continuation = await other.newPage();
    const resumeBodies: unknown[] = [];
    let otherExecutions = 0;
    continuation.on('request', (request) => {
      if (request.url().endsWith('/erasure/resume')) resumeBodies.push(request.postDataJSON());
      if (request.url().endsWith('/erasure/execute')) otherExecutions += 1;
    });
    await continuation.goto(
      fixture.administration.replace(/\/administration$/, '/settings/erasure'),
    );
    const recovery = continuation.getByRole('region', { name: 'Permanent radering', exact: true });
    const resume = recovery.getByRole('button', {
      name: 'Försök slutföra raderingen',
      exact: true,
    });
    await expect(recovery.getByText(pending.operationId, { exact: true })).toBeVisible();
    await expect(resume).toBeEnabled();
    await expect(recovery.getByRole('checkbox')).toHaveCount(0);
    await expect(recovery).not.toContainText('Oberoende privat förslag');
    expect(resumeBodies).toEqual([]);
    expect(await (await other.request.get(`${fixture.path}/map`)).json()).toEqual({
      error: 'content_maintenance',
    });
    expect(await (await otherPost('exports', {})).json()).toEqual({ error: 'content_maintenance' });

    await fixture.installation.restart();
    await continuation.reload();
    await expect(recovery.getByText(pending.operationId, { exact: true })).toBeVisible();
    await expect(resume).toBeEnabled();
    const stillPending = continuation.waitForResponse((response) =>
      response.url().endsWith('/erasure/resume'),
    );
    await resume.click();
    const pendingAgain = await stillPending;
    expect(pendingAgain.status()).toBe(202);
    expect((await pendingAgain.json()).status).toEqual(pending);
    await expect(
      recovery.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    expect(await (await other.request.get(`${fixture.path}/map`)).json()).toEqual({
      error: 'content_maintenance',
    });
    expect(await (await otherPost('exports', {})).json()).toEqual({ error: 'content_maintenance' });
    reader.exec('ROLLBACK');
    let completed: ErasureStatus | null = null;
    await continuation.route(
      '**/erasure/resume',
      async (route) => {
        expect(route.request().postDataJSON()).toEqual({ operationId: pending.operationId });
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        completed = (await response.json()).status;
        expect(completed).toEqual({ ...pending, phase: 'completed' });
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await resume.click();
    await expect(recovery.getByRole('alert')).toContainText('Utfallet är oklart');
    await expect(
      recovery.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    await expect(recovery.getByRole('list', { name: 'Raderingens resultat' })).toHaveCount(0);
    const navigation = continuation.getByRole('navigation', { name: 'Inställningarnas sidor' });
    await navigation.getByRole('link', { name: 'Översikt', exact: true }).click();
    await navigation.getByRole('link', { name: 'Permanent radering', exact: true }).click();
    await continuation.reload();
    await recovery
      .getByRole('button', { name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll' })
      .click();
    await expect(recovery.getByText(pending.operationId, { exact: true })).toBeVisible();
    await expect(
      recovery.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();
    await expect(
      recovery.getByRole('list', { name: 'Raderingens resultat' }).getByRole('listitem'),
    ).toHaveText([
      'Objekt: 1',
      'Samband: 0',
      'Objekttyper: 0',
      'Sambandstyper: 0',
      'Bildversioner: 1',
    ]);
    expect(resumeBodies).toEqual([
      { operationId: pending.operationId },
      { operationId: pending.operationId },
    ]);
    expect(executeCount).toBe(1);
    expect(otherExecutions).toBe(0);
    const retained = await fixture.read();
    expect(retained.contentVersion).toBe(before.contentVersion + 1);
    expect(retained.objects).toEqual(before.objects.filter(({ id }) => id === 'chair'));
    expect(retained.draft).toEqual(before.draft);
    expect(retained.types).toEqual(before.types);
    expect(retained.relationshipTypes).toEqual(before.relationshipTypes);
    expect((await otherRead()).draft).toEqual(otherBefore.draft);
    expect(await (await page.request.get(`${fixture.path}/map/view`)).json()).toEqual({
      ...viewBefore,
      contentVersion: viewBefore.contentVersion + 1,
      positions: viewBefore.positions.filter(({ id }: { id: string }) => id === 'chair'),
    });
    expect(
      (await other.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(404);
    await test.info().attach('same-erasure-cleanup-and-resume', {
      body: JSON.stringify({ pending, completed, resumeBodies }, null, 2),
      contentType: 'application/json',
    });
  } finally {
    if (reader.inTransaction) reader.exec('ROLLBACK');
    reader.close();
    await other.close();
    await fixture.installation.close();
  }
});

test('RADERING-09: an unavailable exact attempt stays explicitly unknown after navigation and a newer result', async ({
  page,
  browser,
}) => {
  const fixture = await arrange(page);
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const before = await fixture.read();
    const viewBefore = await (await page.request.get(`${fixture.path}/map/view`)).json();
    const unusedType = before.types.find(
      (type) => !before.objects.some((object) => object.typeId === type.id),
    );
    expect(unusedType).toBeDefined();
    const section = await reviewInBrowser(page, fixture.administration);
    let firstId = '';
    let executeCount = 0;
    let resumeCount = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/erasure/execute')) executeCount += 1;
      if (request.url().endsWith('/erasure/resume')) resumeCount += 1;
    });
    await page.route(
      '**/erasure/execute',
      async (route) => {
        firstId = route.request().postDataJSON().operationId;
        // Lose transport before admission; subsequent status comes from the real server.
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await section.getByLabel('Skriv RADERA PERMANENT', { exact: true }).fill('RADERA PERMANENT');
    await section.getByRole('button', { name: 'Radera permanent', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Utfallet är oklart');
    expect(firstId).not.toBe('');
    const exactPath = `${fixture.path}/erasure/${firstId}`;
    const missingBefore = await page.request.get(exactPath);
    expect(missingBefore.status()).toBe(404);
    expect(await missingBefore.json()).toEqual({ error: 'maintenance_unavailable' });
    expect(await fixture.read()).toEqual(before);
    expect(await (await page.request.get(`${fixture.path}/map/view`)).json()).toEqual(viewBefore);

    const otherPost = (suffix: string, data: unknown) =>
      other.request.post(`${fixture.path}/${suffix}`, {
        headers: { origin: fixture.installation.origin },
        data,
      });
    const selection = [{ kind: 'objectType', id: unusedType?.id }];
    const reviewResponse = await otherPost('erasure/review', { selection });
    expect(reviewResponse.status()).toBe(200);
    const review = await reviewResponse.json();
    expect(review).toMatchObject({ objects: [], relationships: [], privateChanges: 0, images: 0 });
    const newerResponse = await otherPost('erasure/execute', {
      selection,
      token: review.token,
      operationId: 'later-known-erasure',
      confirmation: 'RADERA PERMANENT',
    });
    expect(newerResponse.status()).toBe(200);
    const newer = (await newerResponse.json()).status;
    expect(newer).toEqual({
      operationId: 'later-known-erasure',
      phase: 'completed',
      counts: { objects: 0, relationships: 0, objectTypes: 1, relationshipTypes: 0, images: 0 },
    });
    expect((await (await page.request.get(`${fixture.path}/erasure`)).json()).status).toEqual(
      newer,
    );
    const retained = await fixture.read();
    expect(retained.contentVersion).toBe(before.contentVersion + 1);
    expect(retained.objects).toEqual(before.objects);
    expect(retained.draft).toEqual(before.draft);
    expect(retained.types).toEqual(before.types.filter(({ id }) => id !== unusedType?.id));
    expect(retained.relationshipTypes).toEqual(before.relationshipTypes);
    const retainedView = await (await page.request.get(`${fixture.path}/map/view`)).json();
    expect(retainedView).toEqual({ ...viewBefore, contentVersion: viewBefore.contentVersion + 1 });
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(200);
    const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
    await navigation.getByRole('link', { name: 'Översikt', exact: true }).click();
    await navigation.getByRole('link', { name: 'Permanent radering', exact: true }).click();
    await expect(section.getByRole('alert')).toBeVisible();
    const exactRead = page.waitForResponse((response) => response.url() === exactPath);
    await page.reload();
    const missingAfter = await exactRead;
    expect(missingAfter.status()).toBe(404);
    expect(await missingAfter.json()).toEqual({ error: 'maintenance_unavailable' });
    await test.info().attach('missing-exact-and-newer-result', {
      body: JSON.stringify({ firstId, exactStatus: missingAfter.status(), newer }, null, 2),
      contentType: 'application/json',
    });
    await expect(section.getByText(firstId, { exact: true })).toBeVisible();
    await expect(section.getByText(newer.operationId, { exact: true })).toHaveCount(0);
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toHaveCount(0);
    await expect(section.getByRole('list', { name: 'Raderingens resultat' })).toHaveCount(0);
    await expect(section.getByRole('checkbox')).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Återförsök samma radering' })).toHaveCount(0);
    expect(executeCount).toBe(1);
    expect(resumeCount).toBe(0);
    expect(await fixture.read()).toEqual(retained);
    await expect(section.getByRole('alert')).toContainText(/Utfallet.*oklart/);

    const readStatus = section.getByRole('button', {
      name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
    });
    await page.route(
      exactPath,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(404);
        expect(await response.json()).toEqual({ error: 'maintenance_unavailable' });
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await readStatus.click();
    await expect(section.getByRole('alert')).toContainText('Utfallet är fortfarande oklart');
    await expect(section.getByText(firstId, { exact: true })).toBeVisible();
    await expect(section.getByRole('list', { name: 'Raderingens resultat' })).toHaveCount(0);
    await readStatus.click();
    await expect(section.getByRole('alert')).toContainText(
      'Inget bekräftat resultat hittades för ditt försök',
    );
    await expect(section.getByRole('alert')).toContainText('Utfallet är fortfarande oklart');
    await expect(section.getByText(firstId, { exact: true })).toBeVisible();
    await expect(section.getByText(newer.operationId, { exact: true })).toHaveCount(0);
    await expect(section.getByRole('list', { name: 'Raderingens resultat' })).toHaveCount(0);
    expect(executeCount).toBe(1);
    expect(resumeCount).toBe(0);
    expect(await fixture.read()).toEqual(retained);
    expect(await (await page.request.get(`${fixture.path}/map/view`)).json()).toEqual(retainedView);
  } finally {
    await other.close();
    await fixture.installation.close();
  }
});

test('RADERING-10: a retired status reply cannot replace a newer reviewed erasure after Settings navigation', async ({
  page,
}) => {
  const fixture = await arrange(page);
  let release = () => {};
  try {
    const before = await fixture.read();
    const viewBefore = await (await page.request.get(`${fixture.path}/map/view`)).json();
    const unusedType = before.types.find(
      (type) => !before.objects.some((object) => object.typeId === type.id),
    );
    expect(unusedType).toBeDefined();
    let executeCount = 0;
    let resumeCount = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/erasure/execute')) executeCount += 1;
      if (request.url().endsWith('/erasure/resume')) resumeCount += 1;
    });
    const section = await reviewInBrowser(page, fixture.administration);
    const confirmation = section.getByLabel('Skriv RADERA PERMANENT', { exact: true });
    const erase = section.getByRole('button', { name: 'Radera permanent', exact: true });
    await confirmation.fill('RADERA PERMANENT');
    const firstResponse = page.waitForResponse((response) =>
      response.url().endsWith('/erasure/execute'),
    );
    await erase.click();
    const firstResult = await firstResponse;
    expect(firstResult.status()).toBe(200);
    const first: ErasureStatus = (await firstResult.json()).status;
    expect(first).toMatchObject({ phase: 'completed', counts: { objects: 1, images: 1 } });
    await expect(section.getByText(first.operationId, { exact: true })).toBeVisible();
    await expect(
      section.getByText('Den permanenta raderingen är slutförd.', { exact: true }),
    ).toBeVisible();

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready = () => {};
    const serverRead = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let delivered = () => {};
    const responseDelivered = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    const firstPath = `${fixture.path}/erasure/${first.operationId}`;
    const catalogPath = `${fixture.path}/erasure`;
    await page.route(
      catalogPath,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        expect((await response.json()).status).toEqual(first);
        ready();
        await held;
        await route.fulfill({ response });
        delivered();
      },
      { times: 1 },
    );
    const exactReading = page.waitForResponse(firstPath);
    const reading = page.waitForRequest(catalogPath);
    const readStatus = section.getByRole('button', {
      name: 'Kontrollera raderingsstatus och läs in aktuellt innehåll',
    });
    await readStatus.click();
    const exactResponse = await exactReading;
    expect(exactResponse.status()).toBe(200);
    expect((await exactResponse.json()).status).toEqual(first);
    const retiredRequest = await reading;
    await serverRead;
    const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
    const overview = navigation.getByRole('link', { name: 'Översikt', exact: true });
    const destination = navigation.getByRole('link', { name: 'Permanent radering', exact: true });
    await overview.click();
    await destination.click();
    await section.getByRole('checkbox', { name: unusedType?.name, exact: true }).check();
    await section.getByRole('button', { name: 'Granska raderingen', exact: true }).click();
    const scope = section.getByRole('region', { name: 'Omfattning att bekräfta' });
    await expect(
      scope.getByRole('list', { name: 'Berörda objekttyper', exact: true }),
    ).toContainText(unusedType?.name as string);
    await expect(scope).toContainText('Bildversioner: 0');
    await expect(scope).not.toContainText('Oberoende privat förslag');
    await expect(confirmation).toHaveValue('');
    await expect(erase).toBeDisabled();
    await confirmation.fill('RADERA PERMANENT');
    const newerResponse = page.waitForResponse((response) =>
      response.url().endsWith('/erasure/execute'),
    );
    await erase.click();
    const newerResult = await newerResponse;
    expect(newerResult.status()).toBe(200);
    const newer: ErasureStatus = (await newerResult.json()).status;
    expect(newer.operationId).not.toBe(first.operationId);
    expect(newer).toMatchObject({
      phase: 'completed',
      counts: { objects: 0, relationships: 0, objectTypes: 1, relationshipTypes: 0, images: 0 },
    });
    await expect(section.getByText(newer.operationId, { exact: true })).toBeVisible();
    await overview.focus();
    release();
    await responseDelivered;
    await (await retiredRequest.response())?.finished();
    await expect(overview).toBeFocused();
    await expect(section.getByText(newer.operationId, { exact: true })).toBeVisible();
    await expect(section.getByText(first.operationId, { exact: true })).toHaveCount(0);
    await expect(
      section.getByRole('list', { name: 'Raderingens resultat' }).getByRole('listitem'),
    ).toHaveText([
      'Objekt: 0',
      'Samband: 0',
      'Objekttyper: 1',
      'Sambandstyper: 0',
      'Bildversioner: 0',
    ]);
    const readIds: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        [firstPath, `${fixture.path}/erasure/${newer.operationId}`].includes(request.url())
      )
        readIds.push(request.url());
    });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Inställningar', level: 1 })).toBeFocused();
    await destination.click();
    await expect(section.getByText(newer.operationId, { exact: true })).toBeVisible();
    await page.reload();
    await readStatus.click();
    await expect(section.getByText(newer.operationId, { exact: true })).toBeVisible();
    await expect(section.getByText(first.operationId, { exact: true })).toHaveCount(0);
    expect(readIds).toContain(`${fixture.path}/erasure/${newer.operationId}`);
    expect(readIds).not.toContain(firstPath);
    expect(executeCount).toBe(2);
    expect(resumeCount).toBe(0);
    const retained = await fixture.read();
    expect(retained.contentVersion).toBe(before.contentVersion + 2);
    expect(retained.objects).toEqual(before.objects.filter(({ id }) => id === 'chair'));
    expect(retained.draft).toEqual(before.draft);
    expect(retained.types).toEqual(before.types.filter(({ id }) => id !== unusedType?.id));
    expect(retained.relationshipTypes).toEqual(before.relationshipTypes);
    expect(await (await page.request.get(`${fixture.path}/map/view`)).json()).toEqual({
      ...viewBefore,
      contentVersion: viewBefore.contentVersion + 2,
      positions: viewBefore.positions.filter(({ id }: { id: string }) => id === 'chair'),
    });
    expect(
      (await page.request.get(`${fixture.path}/profile-images/${fixture.imageId}`)).status(),
    ).toBe(404);
    await test.info().attach('retired-and-current-erasure-results', {
      body: JSON.stringify({ first, newer, readIds }, null, 2),
      contentType: 'application/json',
    });
  } finally {
    release();
    await fixture.installation.close();
  }
});
