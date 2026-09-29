import { expect, type Page, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openMap, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function arrange(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  const initial = await read();
  for (const [id, name] of [
    ['lo', 'Lo Exempel'],
    ['kim', 'Kim Exempel'],
    ['alex', 'Alex Exempel'],
  ]) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: {
              typeId: initial.types.find((type) => type.name === 'Person')?.id,
              name,
              description: '',
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  for (const [id, sourceId, targetId] of [
    ['lo-kim', 'lo', 'kim'],
    ['kim-alex', 'kim', 'alex'],
  ]) {
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin },
          data: {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: {
              typeId: initial.relationshipTypes.find((type) => type.name === 'Använder')?.id,
              sourceId,
              targetId,
              knowledge: 'known',
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto(origin);
  await openMap(page);
  return { path, read };
}

test('MARKERING-01: ordinary and modified clicks select objects and open details separately', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await arrange(page, installation.origin);
    const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const lo = map.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    const alex = map.getByRole('button', { name: 'Välj objekt: Alex Exempel', exact: true });
    const positions = () =>
      map.locator('.spatial-node').evaluateAll((nodes) =>
        nodes.map((node) => {
          const { x, y } = node.getBoundingClientRect();
          return { x, y };
        }),
      );
    await expect(lo).toBeVisible();
    await lo.click({ trial: true });
    const before = await positions();
    await lo.click();
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    expect(
      await lo.locator('.spatial-orb').evaluate((node) => getComputedStyle(node).outlineWidth),
    ).not.toBe(
      await kim.locator('.spatial-orb').evaluate((node) => getComputedStyle(node).outlineWidth),
    );
    await expect(lo.locator('.spatial-orb')).toHaveCSS('outline-style', 'solid');
    await expect(lo.locator('.spatial-orb')).toHaveCSS('outline-offset', '5px');
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
    await expect(map.locator('.connection.selected')).toHaveCount(1);
    await alex.click({ modifiers: ['Control'] });
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(alex).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('.workspace-context').getByText('2 markerade', { exact: true }),
    ).toBeVisible();
    await expect(map.locator('.connection.selected')).toHaveCount(2);
    await lo.click();
    await expect(alex).toHaveAttribute('aria-pressed', 'true');
    await alex.click({ modifiers: ['Meta'] });
    await expect(alex).toHaveAttribute('aria-pressed', 'false');
    await kim.click();
    await expect(lo).toHaveAttribute('aria-pressed', 'false');
    await expect(kim).toHaveAttribute('aria-pressed', 'true');
    expect(await positions()).toEqual(before);
    await lo.click({ modifiers: ['Control'] });
    await kim.dblclick();
    await expect(page.getByRole('region', { name: 'Kim Exempel', exact: true })).toBeVisible();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(2);
    await openMap(page);
    await lo.click({ modifiers: ['Control', 'Alt'] });
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toBeVisible();
    await expect(kim).toHaveAttribute('aria-pressed', 'true');
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await openMap(page);
    await alex.click({ modifiers: ['Meta', 'Alt'] });
    await expect(page.getByRole('region', { name: 'Alex Exempel', exact: true })).toBeVisible();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(3);
    expect(await positions()).toEqual(before);
    await openMap(page);
    const empty = await emptyPoint(page);
    await page.mouse.click(empty.x, empty.y);
    await alex.dblclick();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(1);
    await openMap(page);
    // Control+Option can arrive through the native context-menu path on Mac.
    await lo.click({ button: 'right', modifiers: ['Control', 'Alt'] });
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toBeVisible();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(2);
  } finally {
    await installation.close();
  }
});

test('MARKERING-03: text selection and detail controls retain work across desktop and compact panels', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await arrange(page, installation.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
    const details = tools.getByRole('button', { name: 'Visa detaljer', exact: true });
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    const panel = page.getByRole('region', { name: 'Kim Exempel', exact: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const button of await tools.locator('button:visible').all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width - 12);
      }
      await openWorkspace(page);
      await work.getByRole('button', { name: 'Avmarkera alla', exact: true }).click();
      await expect(details).toBeDisabled();
      const lo = work.getByRole('button', { name: 'Markera Lo Exempel', exact: true });
      await lo.focus();
      await page.keyboard.press('Space');
      await expect(lo).toHaveAttribute('aria-pressed', 'true');
      await work.getByRole('button', { name: 'Markera Kim Exempel', exact: true }).click();
      await expect(work.getByText('2 markerade', { exact: true })).toBeVisible();
      await expect(details).toHaveAttribute('aria-pressed', 'false');
      await details.click();
      await expect(panel.getByRole('heading', { name: 'Kim Exempel', exact: true })).toBeFocused();
      await expect(details).toHaveAttribute('aria-pressed', 'true');
      if (width === 1440)
        await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      else
        await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          `Oskickat ${width === 390 ? 1440 : 390}`,
        );
      await panel.getByLabel('Beskrivning', { exact: true }).fill(`Oskickat ${width}`);
      await openWorkspace(page);
      await expect(details).toHaveAttribute('aria-pressed', width > 700 ? 'true' : 'false');
      await work.getByRole('button', { name: 'Uppgifter för Kim Exempel', exact: true }).click();
      await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        `Oskickat ${width}`,
      );
      await expect(page.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(2);
      await page.getByLabel(/^Öppna paneler/).selectOption({ label: 'Lista och utkast' });
      await expect(details).toHaveAttribute('aria-pressed', width > 700 ? 'true' : 'false');
      await details.click();
      await panel.getByRole('button', { name: 'Stäng Kim Exempel', exact: true }).click();
      await expect(details).toHaveAttribute('aria-pressed', 'false');
      await openWorkspace(page);
      await work.getByRole('button', { name: 'Avmarkera alla', exact: true }).click();
      await expect(details).toBeDisabled();
      await expect(page.locator('.connection.selected')).toHaveCount(0);
    }
    await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
    const theme = tools.getByRole('button', { name: /^Tema:/ });
    await theme.click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await expect(theme).toBeFocused();
    await expect(page.getByRole('region', { name: 'Hushållskarta', exact: true })).toHaveAttribute(
      'data-theme',
      'dark',
    );
    const mark = work.getByRole('button', { name: 'Markera Lo Exempel', exact: true });
    await tools.getByRole('button', { name: 'Dölj verktygens namn', exact: true }).click();
    await mark.hover();
    expect(
      await mark.evaluate((button) => {
        const style = getComputedStyle(button);
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
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      }),
    ).toBeGreaterThanOrEqual(4.5);
  } finally {
    await installation.close();
  }
});

async function emptyPoint(page: Page) {
  return page.locator('.spatial-surface canvas').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    for (let y = bounds.top + 140; y < bounds.bottom - 160; y += 40) {
      for (let x = bounds.right - 160; x > bounds.left + 140; x -= 40) {
        if (
          [0, 2, 50, 100].every(
            (delta) => document.elementFromPoint(x + delta, y + delta) === canvas,
          )
        )
          return { x, y };
      }
    }
    throw new Error('A real unobstructed canvas target is required.');
  });
}

test('MARKERING-04: new detail panels open beside their object and retain manual positions', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await arrange(page, installation.origin);
    const node = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const object = await node.boundingBox();
    if (!object) throw new Error('The object must be visible.');
    await node.dblclick();
    const panel = page.getByRole('region', { name: 'Lo Exempel', exact: true });
    const box = await panel.boundingBox();
    if (!box) throw new Error('The object panel must be visible.');
    expect(
      Math.min(Math.abs(box.x - object.x - object.width), Math.abs(box.x + box.width - object.x)),
    ).toBeLessThanOrEqual(40);
    expect(object.y + object.height / 2).toBeGreaterThanOrEqual(box.y - 32);
    expect(object.y + object.height / 2).toBeLessThanOrEqual(box.y + box.height + 32);
    expect(box.x).toBeGreaterThanOrEqual(112);
    expect(box.y).toBeGreaterThanOrEqual(110);
    expect(box.x + box.width).toBeLessThanOrEqual(1416);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    const handle = panel.getByRole('button', { name: 'Flytta Lo Exempel', exact: true });
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    const moved = await panel.boundingBox();
    expect(moved?.y).toBeLessThan(box.y);
    await panel.getByRole('button', { name: 'Stäng Lo Exempel', exact: true }).click();
    await page.getByRole('button', { name: 'Visa detaljer', exact: true }).click();
    expect(await panel.boundingBox()).toEqual(moved);
    await page.setViewportSize({ width: 900, height: 700 });
    await expect
      .poll(async () => {
        const fitted = await panel.boundingBox();
        return (fitted?.x ?? 0) + (fitted?.width ?? 0);
      })
      .toBeLessThanOrEqual(876);
    await expect
      .poll(async () => {
        const fitted = await panel.boundingBox();
        return (fitted?.y ?? 0) + (fitted?.height ?? 0);
      })
      .toBeLessThanOrEqual(600);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect.poll(() => panel.boundingBox()).toEqual(moved);
  } finally {
    await installation.close();
  }
});

test('MARKERING-02: empty clicks clear highlighting while navigation and cancellation retain selection', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await arrange(page, installation.origin);
    const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const lo = map.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const positions = () =>
      map
        .locator('.spatial-node')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('style')));
    await lo.click();
    await openWorkspace(page);
    await page.getByLabel('Sök objekt', { exact: true }).fill('Exempel');
    const before = await positions();
    await lo.click({ button: 'right', modifiers: ['Control'] });
    await expect(lo).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Sök objekt', { exact: true })).toHaveValue('Exempel');
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
    expect(await positions()).toEqual(before);
    await lo.click({ button: 'right', modifiers: ['Control'] });
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    // Some native Control-click sequences also deliver a click after contextmenu.
    await lo.dispatchEvent('click', { ctrlKey: true, detail: 1 });
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    const target = await emptyPoint(page);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 2, target.y + 2);
    await page.mouse.up();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(0);
    await expect(map.locator('.connection.selected')).toHaveCount(0);
    await expect(page.getByLabel('Sök objekt', { exact: true })).toHaveValue('Exempel');
    await expect(page.getByRole('region', { name: 'Lista och utkast', exact: true })).toBeVisible();
    expect(await positions()).toEqual(before);
    await openMap(page);
    await lo.click();
    const drag = await emptyPoint(page);
    await page.mouse.move(drag.x, drag.y);
    await page.mouse.down();
    await page.mouse.move(drag.x + 100, drag.y + 100, { steps: 5 });
    await page.mouse.up();
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    expect(await positions()).not.toEqual(before);
    const afterDrag = await positions();
    const click = await emptyPoint(page);
    await page.mouse.click(click.x, click.y);
    await expect(lo).toHaveAttribute('aria-pressed', 'false');
    expect(await positions()).toEqual(afterDrag);
    await lo.click();
    const cancelled = await emptyPoint(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cancelled.x, y: cancelled.y }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await cdp.detach();
    await map
      .getByRole('button', {
        name: 'Välj samband: Lo Exempel → Använder → Kim Exempel',
        exact: true,
      })
      .click();
    await expect(map.locator('.connection.selected')).toHaveCount(1);
    const finalClick = await emptyPoint(page);
    await page.mouse.click(finalClick.x, finalClick.y);
    await expect(map.locator('.connection.selected')).toHaveCount(0);
  } finally {
    await installation.close();
  }
});
