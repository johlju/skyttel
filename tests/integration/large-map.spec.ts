import { expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('STORKARTA-01: dense overview keeps readable labels and every object and relationship reachable', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.seedLargeMap(user.id, household.id);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    for (let index = 0; index < 25; index += 1) {
      expect(
        (
          await page.request.post(`${path}/view/position`, {
            headers: { origin: installation.origin },
            data: { id: `large-${index}`, version: 0, position: { x: 0, y: 0, z: 0 } },
          })
        ).ok(),
      ).toBe(true);
    }
    const personal = await (await page.request.get(`${path}/view`)).json();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(installation.origin);
    await expect(page.getByText('500 objekt och 1500 samband', { exact: true })).toBeVisible();
    const labels = page.locator('.spatial-labels [data-layout-id]');
    await expect(labels.first()).toBeVisible();
    await expect
      .poll(() =>
        labels.evaluateAll((buttons) => {
          const boxes = buttons.map((button) => button.getBoundingClientRect());
          return boxes.every((a, index) =>
            boxes
              .slice(index + 1)
              .every(
                (b) =>
                  a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
              ),
          );
        }),
      )
      .toBe(true);
    await expect(page.getByText(/Alla objekt och samband finns i listan/)).toBeVisible();
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    await expect(objects.getByRole('listitem')).toHaveCount(50);
    const names = new Set<string>();
    for (let index = 1; index <= 10; index += 1) {
      await page.getByLabel('Sida för objekt', { exact: true }).selectOption(String(index));
      for (const name of await objects.getByRole('button').allTextContents()) names.add(name);
    }
    expect([...names].filter((name) => name.startsWith('Provobjekt '))).toHaveLength(500);
    const relationships = page.getByRole('list', { name: 'Samband', exact: true });
    const connections = new Set<string>();
    for (let index = 1; index <= 30; index += 1) {
      await page.getByLabel('Sida för samband', { exact: true }).selectOption(String(index));
      for (const name of await relationships.getByRole('button').allTextContents())
        connections.add(name);
    }
    expect([...connections].filter((name) => name.startsWith('Provobjekt '))).toHaveLength(1500);
    await page.getByLabel('Sök objekt', { exact: true }).fill('Provobjekt 499');
    await expect(objects.getByRole('listitem')).toHaveCount(1);
    await objects.getByRole('button', { name: 'Provobjekt 499', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets namn', { exact: true })).toHaveValue('Provobjekt 499');
    await page.getByLabel('Sök objekt', { exact: true }).fill('');
    await page
      .getByRole('navigation', { name: 'Bläddra bland objekt' })
      .getByRole('button', { name: 'Visa valt innehåll i listan' })
      .click();
    await expect(
      objects.getByRole('button', { name: 'Provobjekt 499', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Visa objektets kopplingar', exact: true }).click();
    await expect(relationships.getByRole('listitem')).not.toHaveCount(0);
    await page.getByLabel('Beskrivning', { exact: true }).fill('Oskickad text i den täta kartan');
    await page.getByLabel('Sök objekt', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Visa hela rymden', exact: true }).click();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickad text i den täta kartan',
    );
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await page.getByRole('button', { name: 'Samlad vy', exact: true }).click();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickad text i den täta kartan',
    );
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Oskickad text i den täta kartan',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    const saved: MapState = await (await page.request.get(path)).json();
    expect(saved.objects).toHaveLength(500);
    expect(saved.relationships).toHaveLength(1500);
    expect(saved.objects.find((item) => item.id === 'large-499')?.description).toBe(
      'Oskickad text i den täta kartan',
    );
    expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history.at(-1).changes[0].after.description).toBe('Oskickad text i den täta kartan');
    const anonymous = await browser.newContext();
    try {
      expect((await anonymous.request.get(path)).status()).toBe(401);
      expect((await anonymous.request.get(`${path}/view`)).status()).toBe(401);
    } finally {
      await anonymous.close();
    }
    installation.revokeMembership(user.id);
    expect((await page.request.get(path)).status()).toBe(403);
    await page.reload();
    await expect(page.getByText('500 objekt och 1500 samband', { exact: true })).not.toBeVisible();
  } finally {
    await installation.close();
  }
});
