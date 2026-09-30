import { expect, type Locator, type Page, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import { createHousehold, openMap, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function arrange(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  const state = await read();
  for (const [version, [id, name]] of [
    ['lo', 'Lo Exempel'],
    ['kim', 'Kim Exempel'],
  ].entries()) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version,
            id,
            baseRevision: null,
            value: { name, description: '', typeId: state.types[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  expect(
    (
      await page.request.post(`${path}/save`, {
        headers: { origin },
        data: { version: 2, operationId: 'navigation-fixture' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(origin);
  await openMap(page);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await lo.click({ trial: true });
  return { lo, path, read };
}

async function center(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error('The visible object must have a position.');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('NAVIGATION-01: normal and mini navigation move independently with keyboard and cancelled dragging', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { lo } = await arrange(page, installation.origin);
    await lo.click();
    const projected = await center(lo);
    const trigger = page.getByRole('button', { name: 'Navigera', exact: true });
    await trigger.click();
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    const handle = navigation.getByRole('group', { name: 'Navigation', exact: true });
    await expect(handle).toBeFocused();
    await expect(navigation.getByRole('heading', { name: 'Flytta Lo Exempel' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: /^Flytta Lo Exempel:/ })).toHaveCount(6);
    await navigation.getByRole('button', { name: 'Visa mininavigering' }).click();
    await expect(navigation.getByRole('button', { name: 'Panorera vänster' })).toHaveAttribute(
      'title',
      'Panorera vänster',
    );
    await handle.focus();
    const before = await navigation.boundingBox();
    await handle.press('ArrowLeft');
    const moved = await navigation.boundingBox();
    expect(moved?.x).toBe((before?.x ?? 0) - 12);
    expect(await center(lo)).toEqual(projected);
    const origin = await handle.boundingBox();
    if (!origin) throw new Error('Navigation title bar must be visible.');
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(origin.x + origin.width / 2 - 70, origin.y + origin.height / 2 + 60, {
      steps: 4,
    });
    expect(await navigation.boundingBox()).not.toEqual(moved);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await navigation.boundingBox()).toEqual(moved);
    expect(await center(lo)).toEqual(projected);
    await navigation.getByText('Fönstrets placering', { exact: true }).click();
    await navigation
      .getByRole('button', { name: 'Flytta fönstret åt vänster', exact: true })
      .click();
    expect((await navigation.boundingBox())?.x).toBe((moved?.x ?? 0) - 12);
    await navigation
      .getByRole('button', { name: 'Återställ fönstrets placering', exact: true })
      .click();
    expect((await navigation.boundingBox())?.x).toBe(before?.x);
    expect(await center(lo)).toEqual(projected);
    await handle.focus();
    await handle.press('Escape');
    await expect(navigation).toBeHidden();
    await expect(trigger).toBeFocused();
  } finally {
    await installation.close();
  }
});

test('NAVIGATION-04: object details retain directed relationship access and editing through the list', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { lo, path, read } = await arrange(page, installation.origin);
    const before = await read();
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin: installation.origin },
          data: {
            version: before.draft.version,
            id: 'uses',
            baseRevision: null,
            value: {
              typeId: before.relationshipTypes.find((type) => type.name === 'Använder')?.id,
              sourceId: 'lo',
              targetId: 'kim',
              knowledge: 'known',
            },
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await lo.click();
    await page.getByRole('button', { name: 'Visa detaljer', exact: true }).click();
    const details = page.getByRole('region', { name: 'Lo Exempel', exact: true });
    await details.getByRole('button', { name: 'Visa samband i listan', exact: true }).click();
    const list = page.getByRole('list', { name: 'Samband', exact: true });
    await list
      .getByRole('button', { name: 'Lo Exempel → Använder → Kim Exempel', exact: true })
      .click();
    await list
      .getByRole('button', { name: 'Redigera Lo Exempel → Använder → Kim Exempel', exact: true })
      .click();
    await expect(page.getByLabel('Från objekt', { exact: true })).toHaveValue('lo');
    await expect(page.getByLabel('Till objekt', { exact: true })).toHaveValue('kim');
    await expect(
      page.getByRole('button', { name: 'Lägg sambandet i mitt utkast', exact: true }),
    ).toBeEnabled();
    await expect(details.getByRole('region', { name: /^Samband för/ })).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('NAVIGATION-02: navigation and unsent details retain separate usable areas in both opening orders', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { lo } = await arrange(page, installation.origin);
    for (const [width, height] of [
      [1440, 1000],
      [390, 1000],
      [320, 1000],
      [640, 500],
      [320, 250],
    ]) {
      await page.setViewportSize({ width, height });
      for (const navigationFirst of [true, false]) {
        await page.reload();
        await lo.click();
        const trigger = page.getByRole('button', { name: 'Navigera', exact: true });
        const details = page.getByRole('button', { name: 'Visa detaljer', exact: true });
        if (navigationFirst) {
          await trigger.click();
          const handle = page.getByRole('group', { name: 'Navigation', exact: true });
          if (width > 1000)
            for (let step = 0; step < 17; step++) await handle.press('Shift+ArrowLeft');
          await handle.press('Shift+ArrowDown');
          await handle.press('Shift+ArrowDown');
        }
        if (!(await details.isVisible()))
          await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
        await details.click();
        if (!navigationFirst) await trigger.click();
        const panel = page.getByRole('region', { name: 'Lo Exempel', exact: true });
        const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
        await expect(
          navigationFirst
            ? panel.getByRole('heading', { name: 'Lo Exempel', exact: true })
            : navigation.getByRole('group', { name: 'Navigation', exact: true }),
        ).toBeFocused();
        await navigation
          .getByRole('button', { name: 'Stäng navigering', exact: true })
          .click({ trial: true });
        await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
        await panel
          .getByLabel('Beskrivning', { exact: true })
          .fill('Oskickad text medan jag navigerar');
        const a = await navigation.boundingBox();
        const b = await panel.boundingBox();
        if (!a || !b) throw new Error('Both work areas must be visible.');
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true);
        if (width > 1000) {
          const handle = navigation.getByRole('group', { name: 'Navigation', exact: true });
          await handle.focus();
          await handle.press('Shift+ArrowLeft');
          expect((await navigation.boundingBox())?.x).toBe(a.x - 40);
          await page.setViewportSize({ width: width - 20, height });
          await expect.poll(async () => (await navigation.boundingBox())?.x).toBe(a.x - 20);
          await page.setViewportSize({ width, height });
          await expect(handle).toBeFocused();
          await expect.poll(() => panel.boundingBox()).toEqual(b);
          await handle.press('Shift+ArrowLeft');
        }
        await navigation
          .getByRole('button', { name: 'Flytta Lo Exempel: bakåt', exact: true })
          .click();
        await expect(page.getByText('Din personliga vy är sparad.', { exact: true })).toBeVisible();
        await navigation.getByRole('button', { name: 'Panorera höger', exact: true }).click();
        await navigation.getByRole('button', { name: 'Visa mininavigering' }).click();
        await expect(
          navigation.getByRole('button', { name: 'Visa normal navigering' }),
        ).toBeFocused();
        if (width > 1000) {
          const mini = await navigation.boundingBox();
          if (!mini) throw new Error('Mini navigation must remain visible.');
          expect(mini.x + mini.width).toBe(width - 24);
          expect(await panel.boundingBox()).toEqual(b);
        }
        await navigation.getByRole('button', { name: 'Zooma in', exact: true }).click();
        await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickad text medan jag navigerar',
        );
        await expect(panel.getByText('Flytta', { exact: true })).toHaveCount(0);
        await expect(panel.getByRole('region', { name: /^Samband för/ })).toHaveCount(0);
      }
    }
  } finally {
    await installation.close();
  }
});

test('NAVIGATION-03: six personal directions persist after restart while empty and multiple selections retain camera controls', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { lo, path, read } = await arrange(page, installation.origin);
    const shared = await read();
    await lo.click();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    const readView = async (): Promise<PersonalView> =>
      (await page.request.get(`${path}/view`)).json();
    let version = 0;
    for (const direction of ['vänster', 'höger', 'uppåt', 'nedåt', 'framåt', 'bakåt']) {
      const previous = (await readView()).positions[0];
      await navigation
        .getByRole('button', { name: `Flytta Lo Exempel: ${direction}`, exact: true })
        .click();
      await expect.poll(async () => (await readView()).positions[0]?.version).toBe(++version);
      const position = (await readView()).positions[0];
      if (direction === 'höger') expect(position.x).toBe(previous.x + 1);
      if (direction === 'uppåt') expect(position.y).toBe(previous.y + 1);
      if (direction === 'nedåt') expect(position.y).toBe(previous.y - 1);
      if (direction === 'framåt') expect(position.z).toBe(previous.z + 1);
      if (direction === 'bakåt') expect(position.z).toBe(previous.z - 1);
    }
    const saved = await readView();
    expect(await read()).toEqual(shared);
    await navigation.getByRole('button', { name: 'Stäng navigering' }).click();
    const kim = page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    await kim.click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expect(navigation.getByRole('button', { name: /^Flytta / })).toHaveCount(0);
    await expect(navigation.getByRole('button', { name: 'Panorera höger' })).toBeEnabled();
    await navigation.getByRole('button', { name: 'Stäng navigering' }).click();
    await lo.click({ modifiers: ['Control'] });
    await kim.click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expect(navigation.getByRole('button', { name: /^Flytta / })).toHaveCount(0);
    await expect(navigation.getByRole('button', { name: 'Rotera vänster' })).toBeEnabled();
    await installation.restart();
    await page.reload();
    await lo.click({ trial: true });
    expect(await readView()).toEqual(saved);
    expect(await read()).toEqual(shared);
  } finally {
    await installation.close();
  }
});

test('NAVIGATION-05: trackpad pinch zoom follows pinch speed while a Ctrl mouse-wheel notch stays limited', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { lo, read } = await arrange(page, installation.origin);
    const shared = await read();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const kim = page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    const separation = async () => {
      const [a, b] = [await center(lo), await center(kim)];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const canvas = space.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas must be visible');
    // Stay above the floating map controls and on empty space.
    const empty = { x: box.x + box.width / 2 - 75, y: box.y + box.height / 4 };
    expect(
      await canvas.evaluate((node, { x, y }) => document.elementFromPoint(x, y) === node, empty),
    ).toBe(true);
    const baseline = await separation();
    expect(baseline).toBeGreaterThan(20);
    const reset = async () => {
      await space.getByRole('button', { name: 'Återställ vy', exact: true }).click();
      await expect.poll(separation).toBeCloseTo(baseline, 0);
    };
    // Browsers send a trackpad pinch as Ctrl + wheel events with small deltas.
    const pinch = async (deltaY: number, events: number) => {
      await page.mouse.move(empty.x, empty.y);
      await page.keyboard.down('Control');
      for (let index = 0; index < events; index += 1) await page.mouse.wheel(0, deltaY);
      await page.keyboard.up('Control');
    };
    const ratioAfter = async (deltaY: number, events: number, expected: number) => {
      await reset();
      await pinch(deltaY, events);
      await expect.poll(async () => (await separation()) / baseline).toBeCloseTo(expected, 1);
      return (await separation()) / baseline;
    };
    const slow = await ratioAfter(-2, 5, Math.exp(0.1));
    const fast = await ratioAfter(-10, 5, Math.exp(0.5));
    expect(fast).toBeGreaterThan(slow * 1.3);
    // One mouse notch is far larger than a pinch event and stops at the limit.
    await ratioAfter(200, 1, Math.exp(-0.5));
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
    expect(await read()).toEqual(shared);
  } finally {
    await installation.close();
  }
});
