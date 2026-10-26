import type { Locator, Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openTable,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { openObjectRelationships, readTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { exposedTextLines } from '../support/object-property-reading.js';
import { verifyRestoredPersonalMove } from '../support/personal-view-reading.js';
import {
  openProperties,
  propertyRow,
  propertyValue,
  setProperty,
} from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

async function arrange(page: Page, origin: string, selection: 'pointer' | 'keyboard' = 'pointer') {
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
            value: { name, typeId: state.types[0].id },
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
  if (selection === 'keyboard') {
    await lo.focus();
    await expect(lo).toBeFocused();
  } else await lo.click({ trial: true });
  return { lo, path, read };
}

/** Prepare saved and automatic positions before the coordinate-reading journey. */
async function arrangeCoordinateReading(page: Page, origin: string) {
  const { path, read } = await arrange(page, origin);
  const state = await read();
  expect(
    (
      await page.request.post(`${path}/view/position`, {
        headers: { origin },
        data: {
          id: 'lo',
          contentVersion: state.contentVersion,
          version: 0,
          position: { x: -10000, y: 1.23456789, z: -0.001 },
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`${path}/relationship`, {
        headers: { origin },
        data: {
          version: state.draft.version,
          id: 'coordinate-reading-edge',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes.find((type) => type.name === 'Använder')?.id,
            sourceId: 'lo',
            targetId: 'kim',
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
}

for (const [caseId, width, theme] of [
  ['NAVIGATION-20', 1440, 'light'],
  ['NAVIGATION-21', 320, 'dark'],
] as const) {
  test(`${caseId}: read saved and automatic coordinates through the table in ${theme} at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      await arrangeCoordinateReading(page, installation.origin);
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      const selectLo = table.getByRole('button', { name: 'Lo Exempel', exact: true });
      await selectLo.focus();
      await selectLo.press('Enter');
      await expect(selectLo.locator('xpath=ancestor::tr')).toContainText('Markerad');
      await openMap(page);
      const trigger = page.getByRole('button', { name: 'Navigera', exact: true });
      await trigger.focus();
      await trigger.press('Enter');
      const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
      await expect(
        navigation.getByRole('group', { name: 'Navigation', exact: true }),
      ).toBeFocused();
      const coordinates = navigation.getByRole('group', { name: 'Position för Lo Exempel' });
      await expect(coordinates.getByRole('textbox', { name: 'Sidled (X)' })).toHaveValue(
        '-10000.00',
      );
      await expect(coordinates.getByRole('textbox', { name: 'Höjd (Y)' })).toHaveValue('1.23');
      await expect(coordinates.getByRole('textbox', { name: 'Djup (Z)' })).toHaveValue('0.00');
      await expect(coordinates.getByRole('textbox')).toHaveCount(3);
      const help = navigation.getByRole('button', { name: 'Om koordinater', exact: true });
      await help.focus();
      await help.press('Enter');
      await expect(help).toHaveAttribute('aria-expanded', 'true');
      await expect(navigation.getByText(/X är sidled/)).toBeVisible();
      await help.press('Escape');
      await expect(help).toHaveAttribute('aria-expanded', 'false');
      await expect(navigation).toBeVisible();
      await expect(help).toBeFocused();
      await help.press('Enter');
      await navigation.getByRole('button', { name: 'Visa mininavigering' }).click();
      await expect(navigation.getByText('Ange position', { exact: true })).toBeHidden();
      await expect(help).toBeHidden();
      await expect(navigation.getByText(/X är sidled/)).toBeHidden();
      for (const label of ['Sidled (X)', 'Höjd (Y)', 'Djup (Z)']) {
        const field = coordinates.getByRole('textbox', { name: label });
        await field.focus();
        await expect(field).toBeFocused();
        await expect(field).toBeVisible();
      }
      await navigation.getByRole('button', { name: 'Visa normal navigering' }).click();
      await expect(help).toHaveAttribute('aria-expanded', 'true');
      await expect(navigation.getByText(/X är sidled/)).toBeVisible();
      if (width === 320) {
        await page.setViewportSize({ width, height: 250 });
        const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
        await lo.focus();
        await lo.press('Shift+F10');
        await page
          .getByRole('toolbar', { name: 'Åtgärder för Lo Exempel', exact: true })
          .getByRole('button', { name: 'Visa uppgifter för Lo Exempel', exact: true })
          .click();
        const reader = page.getByRole('region', { name: 'Lo Exempel', exact: true });
        await expect(reader).toBeVisible();
        const field = coordinates.getByRole('textbox', { name: 'Sidled (X)' });
        for (const viewport of [
          { width: 320, height: 250 },
          { width: 701, height: 500 },
          { width: 800, height: 500 },
          { width: 1000, height: 500 },
        ]) {
          await page.setViewportSize(viewport);
          await expect(reader).toBeVisible();
          for (const mode of ['normal', 'mini']) {
            if (mode === 'mini')
              await navigation.getByRole('button', { name: 'Visa mininavigering' }).click();
            if (mode === 'normal')
              await expect(navigation.getByText('Ange position', { exact: true })).toBeVisible();
            else await expect(navigation.getByText('Ange position', { exact: true })).toBeHidden();
            await field.focus();
            await expect(field).toBeFocused();
            await expect
              .poll(() =>
                field.evaluate((element: HTMLInputElement) => {
                  const style = getComputedStyle(element);
                  const context = document.createElement('canvas').getContext('2d');
                  if (!context) throw new Error('Text measurement requires the browser canvas.');
                  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                  const available =
                    element.clientWidth -
                    Number.parseFloat(style.paddingLeft) -
                    Number.parseFloat(style.paddingRight);
                  return {
                    complete: context.measureText(element.value).width <= available,
                    normalText: Number.parseFloat(style.fontSize) >= 16,
                  };
                }),
              )
              .toEqual({ complete: true, normalText: true });
          }
          await navigation.getByRole('button', { name: 'Visa normal navigering' }).click();
        }
        await page.setViewportSize({ width, height: 1000 });
        await reader.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
      }
      await navigation.getByRole('button', { name: 'Stäng navigering' }).click();
      await expect(trigger).toBeFocused();

      const relationships = await openObjectRelationships(page, 'Lo Exempel');
      const edge = relationships
        .getByRole('heading', { name: 'Lo Exempel → Använder → Kim Exempel', exact: true })
        .locator('..');
      await expect(edge).toContainText('Från objektLo Exempel');
      await expect(edge).toContainText('Till objektKim Exempel');
      await relationships.getByRole('button', { name: 'Stäng samband', exact: true }).click();
      await table.getByRole('button', { name: 'Kim Exempel', exact: true }).focus();
      await page.keyboard.press('Enter');
      await openMap(page);
      await trigger.focus();
      await trigger.press('Enter');
      const automatic = navigation.getByRole('group', { name: 'Position för Kim Exempel' });
      for (const label of ['Sidled (X)', 'Höjd (Y)', 'Djup (Z)'])
        await expect(automatic.getByRole('textbox', { name: label })).toHaveValue(/^-?\d+\.\d{2}$/);
      await navigation.getByRole('button', { name: 'Stäng navigering' }).click();
      await openTable(page);
      await selectLo.click();
      await openMap(page);
      await trigger.click();
      await expect(coordinates.getByRole('textbox', { name: 'Höjd (Y)' })).toHaveValue('1.23');
    } finally {
      await installation.close();
    }
  });
}

async function center(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error('The visible object must have a position.');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function exposed(node: Locator, context = 'The native target must be exposed') {
  let observation: unknown;
  try {
    await expect
      .poll(
        async () => {
          // Re-scroll if viewport measurement changes the reader's available height.
          await node.scrollIntoViewIfNeeded();
          const measured = await node.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const points = [
              [box.left + 8, box.top + 8],
              [box.right - 8, box.top + 8],
              [box.left + 8, box.bottom - 8],
              [box.right - 8, box.bottom - 8],
              [box.left + box.width / 2, box.top + box.height / 2],
            ].map(([x, y]) => {
              const hit = document.elementFromPoint(x, y);
              return {
                x,
                y,
                owned: hit !== null && element.contains(hit),
                hit: hit?.tagName,
                hitClass: hit?.getAttribute('class'),
              };
            });
            const style = getComputedStyle(element);
            const scrollport = element.closest('.map-selection-details, .map-navigation');
            const clippingBounds = scrollport?.getBoundingClientRect();
            const clippingStyle = scrollport && getComputedStyle(scrollport);
            const insideScrollport =
              !clippingBounds ||
              !clippingStyle ||
              (box.top >= clippingBounds.top + Number.parseFloat(clippingStyle.borderTopWidth) &&
                box.bottom <=
                  clippingBounds.bottom - Number.parseFloat(clippingStyle.borderBottomWidth) &&
                box.left >=
                  clippingBounds.left + Number.parseFloat(clippingStyle.borderLeftWidth) &&
                box.right <=
                  clippingBounds.right - Number.parseFloat(clippingStyle.borderRightWidth));
            return {
              exposed:
                box.left >= 0 &&
                box.top >= 0 &&
                box.right <= innerWidth &&
                box.bottom <= innerHeight &&
                points.every((point) => point.owned) &&
                insideScrollport,
              viewport: [innerWidth, innerHeight],
              bounds: box.toJSON(),
              font: style.font,
              insideScrollport,
              scrollport: scrollport && {
                bounds: scrollport.getBoundingClientRect().toJSON(),
                clientHeight: scrollport.clientHeight,
                scrollHeight: scrollport.scrollHeight,
                scrollTop: scrollport.scrollTop,
              },
              points,
            };
          });
          observation = measured;
          return measured.exposed;
        },
        { message: context },
      )
      .toBe(true);
  } catch (error) {
    console.error('Native target exposure:', context, JSON.stringify(observation, null, 2));
    throw error;
  }
}

async function separate(first: Locator, second: Locator) {
  let observation: unknown;
  await expect
    .poll(async () => {
      const a = await first.boundingBox();
      const b = await second.boundingBox();
      const geometry = await second.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          maxHeight: style.maxHeight,
          navigationTop: style.getPropertyValue('--navigation-top'),
          noticeTop: style.getPropertyValue('--conversation-corner-top'),
        };
      });
      const measured = {
        overlap: !(
          a &&
          b &&
          (a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y)
        ),
        first: a,
        second: b,
        geometry,
      };
      observation = measured;
      return measured;
    })
    .toMatchObject({ overlap: false })
    .catch((error) => {
      console.error('Floating surface overlap:', JSON.stringify(observation));
      throw error;
    });
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
    await trigger.focus();
    await trigger.press('Enter');
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    const handle = navigation.getByRole('group', { name: 'Navigation', exact: true });
    await expect(handle).toBeFocused();
    await expect(navigation.getByRole('heading', { name: 'Flytta Lo Exempel' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: /^Flytta Lo Exempel:/ })).toHaveCount(6);
    const defaultRight = await navigation.evaluate((panel) => panel.getBoundingClientRect().right);
    await navigation.getByRole('button', { name: 'Visa mininavigering' }).click({ timeout: 5000 });
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
    await expect
      .poll(() => navigation.evaluate((panel) => panel.getBoundingClientRect().right))
      .toBe(defaultRight);
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
            },
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await lo.dblclick();
    const details = page.getByRole('region', { name: 'Lo Exempel', exact: true });
    await details.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }).click();
    const relationships = page.getByRole('dialog', { name: 'Samband för Lo Exempel', exact: true });
    const item = relationships
      .getByRole('heading', { name: 'Lo Exempel → Använder → Kim Exempel', exact: true })
      .locator('..');
    await expect(item).toContainText('Från objektLo Exempel');
    await expect(item).toContainText('Till objektKim Exempel');
    await item.getByRole('button', { name: 'Kim Exempel', exact: true }).click();
    const reader = page.getByRole('dialog', { name: 'Uppgifter för Kim Exempel', exact: true });
    await expect(reader).toContainText('Kim Exempel');
    await expect(reader).toContainText(before.types[0].name);
    await expect(
      reader.getByRole('heading', { name: 'Uppgifter för Kim Exempel', exact: true }),
    ).toBeFocused();
    await reader.getByRole('button', { name: 'Tillbaka', exact: true }).click();
    await item.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await expect(relationships.getByLabel('Från objekt', { exact: true })).toHaveValue('lo');
    await expect(relationships.getByLabel('Till objekt', { exact: true })).toHaveValue('kim');
    await setProperty(relationships, 'Uppgiftens säkerhet', 'Osäkert uppgivet');
    await expect(
      relationships.getByRole('region', { name: 'Sambandet före inskickning' }),
    ).toHaveText('Lo Exempel använder Kim Exempel');
    const response = page.waitForResponse(
      (response) =>
        response.url() === `${path}/relationship-form` && response.request().method() === 'POST',
    );
    await relationships.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(
      relationships.getByRole('heading', { name: 'Redigera samband', exact: true }),
    ).toHaveCount(0);
    await expect(item).toContainText('Osäkert uppgivet (Text)');
    await expect(item).toContainText('Uppgiftens säkerhet');
    const after = await read();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.draft.relationships).toHaveLength(1);
    expect(after.draft.relationships?.[0]).toMatchObject({
      id: 'uses',
      after: {
        sourceId: 'lo',
        targetId: 'kim',
        properties: [
          {
            id: expect.any(String),
            label: 'Uppgiftens säkerhet',
            kind: 'text' as const,
            value: 'Osäkert uppgivet',
          },
        ],
      },
    });
  } finally {
    await installation.close();
  }
});

const navigationConfigurations = [
  [1440, 1000],
  [320, 250],
  [844, 390],
  [390, 1000],
  [320, 1000],
  [700, 600],
  [640, 500],
] as const;
for (const [configuration, [width, height]] of navigationConfigurations.entries()) {
  for (const navigationFirst of [true, false]) {
    const reference = configuration === 0 && navigationFirst;
    const identity = configuration * 2 + (navigationFirst ? 0 : 1);
    const caseId = reference
      ? 'NAVIGATION-02'
      : `NAVIGATION-${String(identity + 5).padStart(2, '0')}`;
    test(`${caseId}: navigation and unsent details retain usable work at ${width}x${height} with ${navigationFirst ? 'navigation' : 'details'} first`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const installation = await createInstallation();
      try {
        await page.setViewportSize({ width, height });
        const { lo, path, read } = await arrange(page, installation.origin, 'keyboard');
        const shared = await read();
        await page.reload();
        // Initial graph placement may sit behind the protected display row.
        // Select with the native keyboard control before testing panel pointer access.
        await lo.focus();
        await lo.press('Enter');
        await expect(lo).toHaveAttribute('aria-pressed', 'true');
        const combinedNotice =
          (width === 320 && height === 250) || (width === 844 && height === 390);
        const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
        if (combinedNotice) {
          const talk = page
            .getByRole('navigation', { name: 'Kartans verktyg' })
            .getByRole('button', { name: 'Prata med Skyttel', exact: true });
          await talk.focus();
          await talk.press('Enter');
          await expect(notice).toContainText('Samtal med Skyttel är inte tillgängligt just nu.');
          await expect(talk).toBeFocused();
        }
        const trigger = page.getByRole('button', { name: 'Navigera', exact: true });
        if (navigationFirst) {
          await trigger.focus();
          await trigger.press('Enter');
          const handle = page.getByRole('group', { name: 'Navigation', exact: true });
          await handle.press('Shift+ArrowDown');
          await handle.press('Shift+ArrowDown');
        }
        await lo.focus();
        await lo.press('Shift+F10');
        const details = page
          .getByRole('toolbar', { name: 'Åtgärder för Lo Exempel', exact: true })
          .getByRole('button', { name: 'Visa uppgifter för Lo Exempel', exact: true });
        await details.focus();
        await details.press('Enter');
        if (!navigationFirst) {
          await trigger.focus();
          await trigger.press('Enter');
        }
        const panel = page.getByRole('region', { name: 'Lo Exempel', exact: true });
        const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
        await expect(
          navigationFirst
            ? panel.getByRole('heading', { name: 'Lo Exempel', exact: true })
            : navigation.getByRole('group', { name: 'Navigation', exact: true }),
        ).toBeFocused();
        const navigationClose = navigation.getByRole('button', {
          name: 'Stäng navigering',
          exact: true,
        });
        await navigationClose.focus();
        await navigationClose.click({ trial: true, timeout: 5000 });
        if (width > 1000) {
          const readingHandle = panel.getByRole('group', {
            name: 'Flytta uppgiftsfönstret för Lo Exempel',
            exact: true,
          });
          // Freestanding reading windows can be placed beside navigation.
          for (let step = 0; step < 24; step += 1) await readingHandle.press('Shift+ArrowLeft');
          await separate(navigation, panel);
        }
        await panel.getByRole('heading', { name: 'Lo Exempel', exact: true }).focus();
        await expect
          .poll(() =>
            panel.getByRole('heading', { name: 'Lo Exempel', exact: true }).evaluate((heading) => {
              const box = heading.getBoundingClientRect();
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return hit === heading || heading.contains(hit);
            }),
          )
          .toBe(true);
        if (combinedNotice) {
          await separate(notice, navigation);
          await notice.getByRole('button', { name: 'Stäng notisen', exact: true }).focus();
          await exposed(notice.locator('p'));
          await panel.getByRole('heading', { name: 'Lo Exempel', exact: true }).focus();
          const lastValue = panel.locator('dd').last();
          await expect(lastValue).not.toHaveText('');
          await lastValue.scrollIntoViewIfNeeded();
          await exposedTextLines(lastValue);
          const relationships = panel.getByRole('button', {
            name: 'Samband för Lo Exempel',
            exact: true,
          });
          await relationships.focus();
          await relationships.scrollIntoViewIfNeeded();
          await exposed(
            relationships,
            `Relationships at ${width}×${height}, navigation first: ${navigationFirst}`,
          );
          await relationships.click({ trial: true });
          await panel
            .getByRole('heading', { name: 'Lo Exempel', exact: true })
            .scrollIntoViewIfNeeded();
        }
        const a = await navigation.boundingBox();
        await page.evaluate(() => document.fonts.ready);
        await page.setViewportSize({ width: width - 1, height });
        await page.setViewportSize({ width, height });
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const b = await panel.boundingBox();
        if (!a || !b) throw new Error('Both work areas must be visible.');
        if (width > 1000) {
          const handle = navigation.getByRole('group', { name: 'Navigation', exact: true });
          await handle.focus();
          await handle.press('Shift+ArrowLeft');
          expect((await navigation.boundingBox())?.x).toBe(a.x - 40);
          await page.setViewportSize({ width: width - 20, height });
          await expect.poll(async () => (await navigation.boundingBox())?.x).toBe(a.x - 40);
          await page.setViewportSize({ width, height });
          await expect(handle).toBeFocused();
          await expect.poll(() => panel.boundingBox()).toEqual(b);
          await handle.press('Shift+ArrowLeft');
        }
        await panel.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }).focus();
        await panel.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }).click();
        const form = page.getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true });
        await openProperties(form);
        const text = `Oskickad text medan jag navigerar ${width} ${navigationFirst}`;
        await setProperty(form, 'Beskrivning', text);
        const description = propertyRow(form, 'Beskrivning').getByLabel('Värde', { exact: true });
        const unchanged = await read();
        await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
        const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
        await expect(
          loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(description).toHaveValue(text);
        expect(await read()).toEqual(unchanged);
        // A native complete form protects its input while background navigation is inactive.
        await expect(
          navigation
            .getByRole('button', { name: 'Panorera höger', exact: true })
            .click({ trial: true, timeout: 300 }),
        ).rejects.toThrow();
        const staged = page.waitForResponse(
          (response) =>
            response.url() === `${path}/object-form` && response.request().method() === 'POST',
        );
        const stage = form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true });
        await stage.focus();
        await stage.press('Space');
        expect((await staged).status()).toBe(200);
        await expect(form).toHaveCount(0);
        await expect(panel).toContainText(text);
        const beforeMove: PersonalView = await (await page.request.get(`${path}/view`)).json();
        await navigation
          .getByRole('button', { name: 'Flytta Lo Exempel: bakåt', exact: true })
          .focus();
        await navigation
          .getByRole('button', { name: 'Flytta Lo Exempel: bakåt', exact: true })
          .click();
        await expect
          .poll(async () => {
            const view: PersonalView = await (await page.request.get(`${path}/view`)).json();
            return view.positions.find((position) => position.id === 'lo')?.version;
          })
          .toBe((beforeMove.positions.find((position) => position.id === 'lo')?.version ?? 0) + 1);
        await expect(page.getByText('Din personliga vy är sparad.', { exact: true })).toBeVisible();
        await navigation.getByRole('button', { name: 'Panorera höger', exact: true }).click();
        await navigation
          .getByRole('button', { name: 'Visa mininavigering' })
          .click({ timeout: 5000 });
        await expect(
          navigation.getByRole('button', { name: 'Visa normal navigering' }),
        ).toBeFocused();
        if (width > 1000) {
          const mini = await navigation.boundingBox();
          if (!mini) throw new Error('Mini navigation must remain visible.');
          const reading = await panel.boundingBox();
          if (!reading) throw new Error('Selected information must remain visible.');
          expect(
            mini.x + mini.width <= reading.x ||
              reading.x + reading.width <= mini.x ||
              mini.y + mini.height <= reading.y ||
              reading.y + reading.height <= mini.y,
          ).toBe(true);
          expect({ x: reading.x, y: reading.y, width: reading.width }).toEqual({
            x: b.x,
            y: b.y,
            width: b.width,
          });
        }
        if (combinedNotice) {
          await expect(notice).toContainText('Samtal med Skyttel är inte tillgängligt just nu.');
          const zoom = navigation.getByRole('button', { name: 'Zooma in', exact: true });
          await zoom.focus();
          await zoom.scrollIntoViewIfNeeded();
          await exposed(zoom);
          await zoom.click();
          const pan = navigation.getByRole('button', { name: 'Panorera vänster', exact: true });
          await pan.scrollIntoViewIfNeeded();
          await exposed(pan);
          await pan.click();
          await separate(notice, navigation);
          await panel.getByRole('heading', { name: 'Lo Exempel', exact: true }).focus();
          const lastValue = panel.locator('dd').last();
          await expect(lastValue).toHaveText(`Sparat: Ej uppgivet◇ Ditt förslag: ${text} (Text)`);
          await lastValue.scrollIntoViewIfNeeded();
          await exposedTextLines(lastValue);
          await expect(panel).toContainText(text);
          await page.screenshot({
            path: `/tmp/skyttel-244/259-notice-combination-${width}x${height}-${navigationFirst ? 'navigation-first' : 'details-first'}.png`,
          });
          const unchangedAfterMoves = await read();
          const closeNotice = notice.getByRole('button', { name: 'Stäng notisen', exact: true });
          await closeNotice.focus();
          await exposed(
            closeNotice,
            `Notice close at ${width}×${height}, navigation first: ${navigationFirst}`,
          );
          await closeNotice.click({ trial: true, timeout: 5000 });
          await closeNotice.focus();
          await closeNotice.press('Space');
          await expect(notice).toHaveCount(0);
          expect(await read()).toEqual(unchangedAfterMoves);
        }
        await navigation.getByRole('button', { name: 'Zooma in', exact: true }).focus();
        await navigation.getByRole('button', { name: 'Zooma in', exact: true }).click();
        await expect(panel).toContainText(text);
        expect(
          propertyValue(
            (await read()).draft.changes.find((change) => change.id === 'lo')?.after,
            'Beskrivning',
          ),
        ).toBe(text);
        expect((await read()).objects).toEqual(shared.objects);
        expect((await read()).relationships).toEqual(shared.relationships);
        await page.screenshot({
          path: `/tmp/skyttel-244/259-navigation-${width}x${height}-${navigationFirst ? 'navigation-first' : 'details-first'}.png`,
        });
        if (reference) {
          const personal = await (await page.request.get(`${path}/view`)).json();
          const draft = await openDraftReview(page);
          await draft
            .getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true })
            .click();
          const proposal = page.getByRole('dialog', { name: 'Lo Exempel', exact: true });
          await expect(proposal).toContainText(text);
          await expect(proposal).toContainText(shared.types[0].name);
          await proposal.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
          await saveReviewedConflictDraft(page);
          await closeTextView(page);
          await openMap(page);
          await installation.restart();
          await page.reload();
          const saved = await readTableObject(page, 'Lo Exempel');
          await expect(saved.getByText(`${text} (Text)`, { exact: true })).toBeVisible();
          await expect(saved).toContainText(shared.types[0].name);
          expect((await read()).draft.changes).toEqual([]);
          expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
          const kim = await readTableObject(page, 'Kim Exempel');
          await expect(kim.locator('dd').filter({ hasText: /^Kim Exempel$/ })).toBeVisible();
          await expect(
            kim.locator('dd').filter({ hasText: new RegExp(`^${shared.types[0].name}$`) }),
          ).toBeVisible();
          await expect(
            kim
              .locator('dt')
              .filter({ hasText: /^Beskrivning$/ })
              .locator('..')
              .locator('dd'),
          ).toHaveCount(0);
          expect(shared.relationships).toEqual([]);
          for (const name of ['Lo Exempel', 'Kim Exempel']) {
            const relationships = await openObjectRelationships(page, name);
            await expect(relationships).toContainText('Inga samband finns för objektet.');
            await relationships.getByRole('button', { name: 'Stäng samband', exact: true }).click();
          }
          expect((await read()).relationships).toEqual(shared.relationships);
          await openMap(page);
          await expect(lo).toBeVisible();
          await verifyRestoredPersonalMove(
            page,
            'Lo Exempel',
            personal.positions[0],
            personal.contentVersion,
          );
        }
      } finally {
        await installation.close();
      }
    });
  }
}

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
      const rendered = await lo.getAttribute('style');
      await navigation
        .getByRole('button', { name: `Flytta Lo Exempel: ${direction}`, exact: true })
        .click();
      await expect.poll(async () => (await readView()).positions[0]?.version).toBe(++version);
      await expect.poll(() => lo.getAttribute('style')).not.toBe(rendered);
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
    await verifyRestoredPersonalMove(page, 'Lo Exempel', saved.positions[0], saved.contentVersion);
  } finally {
    await installation.close();
  }
});
