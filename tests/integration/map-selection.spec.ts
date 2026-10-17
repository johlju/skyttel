import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  createHousehold,
  openDraftReview,
  openMap,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { focusMapSearch } from '../support/object-search.js';
import { expect, test } from '../support/test.js';

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
    await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await lo.click({ modifiers: ['Control', 'Alt'] });
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toBeVisible();
    await expect(kim).toHaveAttribute('aria-pressed', 'true');
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await alex.click({ modifiers: ['Meta', 'Alt'] });
    await expect(page.getByRole('region', { name: 'Alex Exempel', exact: true })).toBeVisible();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await expect.poll(positions).toEqual(before);
    const empty = await emptyPoint(page);
    await page.mouse.click(empty.x, empty.y);
    await alex.dblclick();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    // Control+Option can arrive through the native context-menu path on Mac.
    await lo.click({ button: 'right', modifiers: ['Control', 'Alt'] });
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toBeVisible();
    await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(2);
  } finally {
    await installation.close();
  }
});

for (const width of [1440, 390, 320]) {
  const caseId = width === 1440 ? 'MARKERING-03' : width === 390 ? 'MARKERING-07' : 'MARKERING-08';
  test(`${caseId}: text selection and native details protect unsent work at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 1000 });
      const app = await arrange(page, installation.origin);
      const original = await app.read();
      const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
      for (const button of await tools.locator('button:visible').all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width - 12);
      }
      const lo = map.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
      const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
      await lo.focus();
      await page.keyboard.press('Space');
      await expect(lo).toHaveAttribute('aria-pressed', 'true');
      await kim.focus();
      await kim.click({ modifiers: ['Control'] });
      await expect(kim).toHaveAttribute('aria-pressed', 'true');
      await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(2);
      await kim.press('Shift+F10');
      await page
        .getByRole('toolbar', { name: 'Åtgärder för Kim Exempel', exact: true })
        .getByRole('button', { name: 'Visa uppgifter för Kim Exempel', exact: true })
        .click();
      const reader = page.getByRole('region', { name: 'Kim Exempel', exact: true });
      await expect(reader.getByRole('heading', { name: 'Kim Exempel', exact: true })).toBeFocused();
      await reader.getByRole('button', { name: 'Redigera Kim Exempel', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Redigera Kim Exempel', exact: true });
      await form.getByLabel('Beskrivning', { exact: true }).fill(`Oskickat ${width}`);
      await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
      await expect(
        loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        `Oskickat ${width}`,
      );
      expect(await app.read()).toEqual(original);
      await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await loss
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await expect(form).not.toBeVisible();
      await expect(
        reader.getByRole('button', { name: 'Redigera Kim Exempel', exact: true }),
      ).toBeFocused();
      await expect(map.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(2);
      await reader.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await table.getByRole('button', { name: 'Redigera Kim Exempel', exact: true }).click();
      await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue('');
      await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await table.getByRole('button', { name: 'Lo Exempel', exact: true }).focus();
      await page.keyboard.press('Space');
      await expect(table.getByRole('button', { name: 'Lo Exempel', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(
        table
          .getByRole('row')
          .filter({ has: page.getByRole('button', { name: 'Lo Exempel', exact: true }) }),
      ).toHaveAttribute('data-selected', 'true');
      const expand = tools.getByRole('button', { name: 'Visa verktygens namn', exact: true });
      if (await expand.isVisible()) await expand.click();
      const theme = tools.getByRole('button', { name: /^Tema:/ });
      await theme.click();
      await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
      await expect(theme).toBeFocused();
      await expect(
        page.getByRole('region', { name: 'Hushållskarta', exact: true }),
      ).toHaveAttribute('data-theme', 'dark');
      const themeFeedback = tools
        .getByRole('status')
        .filter({ hasText: 'Temavalet har sparats på ditt konto.' });
      await expect(themeFeedback).toBeVisible();
      await themeFeedback.getByRole('button', { name: 'Stäng temabeskedet' }).click();
      await expect(themeFeedback).toHaveCount(0);
      await tools.getByRole('button', { name: 'Dölj verktygens namn', exact: true }).click();
      const mark = table.getByRole('button', { name: 'Redigera Kim Exempel', exact: true });
      await mark.hover();
      expect(
        await mark.evaluate((button) => {
          const style = getComputedStyle(button);
          const luminance = (color: string) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Actual CSS colour conversion requires a canvas.');
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const pixel = context.getImageData(0, 0, 1, 1).data;
            if (pixel[3] !== 255)
              throw new Error('The control requires an opaque measured colour.');
            const channels = [...pixel].slice(0, 3).map((value) => {
              const unit = value / 255;
              return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const foreground = luminance(style.color),
            background = luminance(style.backgroundColor);
          return (
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
          );
        }),
      ).toBeGreaterThanOrEqual(4.5);
      expect(await app.read()).toEqual(original);
      await openDraftReview(page);
      await openTable(page);
      await mark.click({ trial: true });
      if (width === 1440) {
        const text = await page
          .getByRole('region', { name: 'Skriv till Skyttel', exact: true })
          .boundingBox();
        const action = await mark.boundingBox();
        expect(text).not.toBeNull();
        expect((action?.x ?? 0) + (action?.width ?? 0)).toBeLessThanOrEqual(text?.x ?? 0);
      }
      await page.screenshot({ path: test.info().outputPath('table-draft-dark.png') });
      await (await utilityButton(page, 'Rapporter')).click();
      await expect(page.getByRole('region', { name: 'Utkastet', exact: true })).not.toBeVisible();
      const textEntry = await utilityButton(page, 'Skriv till Skyttel');
      await expect(textEntry).toHaveAttribute('aria-expanded', 'false');
      const resumedDraft = await openDraftReview(page);
      await expect(
        resumedDraft.getByRole('button', { name: 'Visa förslaget: Kim Exempel', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('dialog', { name: 'Samtalsmedgivande', exact: true }),
      ).toHaveCount(0);
      await openTable(page);
      await mark.click({ trial: true });
      expect(await app.read()).toEqual(original);
    } finally {
      await installation.close();
    }
  });
}

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
    await focusMapSearch(page);
    const search = page.getByRole('region', { name: 'Kartans sökning och filter', exact: true });
    await search
      .getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true })
      .fill('Exempel');
    await search.getByRole('searchbox').press('Escape');
    const before = await positions();
    await lo.click({ button: 'right', modifiers: ['Control'] });
    await expect(lo).toHaveAttribute('aria-pressed', 'false');
    await expect(search.getByRole('searchbox')).toHaveValue('Exempel');
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
    await expect(search.getByRole('searchbox')).toHaveValue('Exempel');
    await expect(search).toBeVisible();
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
