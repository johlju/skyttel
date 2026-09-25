import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

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
  await page.goto(administration);
  const section = page.getByRole('region', { name: 'Permanent radering', exact: true });
  await section.getByRole('checkbox', { name: 'Lampan att radera', exact: true }).focus();
  await page.keyboard.press('Space');
  await section.getByRole('button', { name: 'Granska raderingen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(section.getByRole('region', { name: 'Omfattning att bekräfta' })).toBeVisible();
  return section;
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
    await page.goto(fixture.administration);
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
    await page.getByRole('link', { name: 'Till hushållet', exact: true }).click();
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await page.getByRole('button', { name: 'Lampan att radera', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(
      page.getByRole('img', { name: 'Profilbild för Lampan att radera' }),
    ).toHaveAttribute('src', new RegExp(`/profile-images/${currentImage}$`));
  } finally {
    await fixture.installation.close();
  }
});
