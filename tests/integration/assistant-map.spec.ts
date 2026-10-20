import type { MapState } from '../../src/shared/map.js';
import { closeTextView, createHousehold, openMap, signIn } from '../support/client.js';
import { openConversationText, startConversationWithText } from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

for (const viewport of [
  { caseId: 'TEXT-08', width: 1440, height: 1000 },
  { caseId: 'TEXT-10', width: 1280, height: 720 },
  { caseId: 'TEXT-11', width: 390, height: 844 },
  { caseId: 'TEXT-12', width: 640, height: 500 },
  { caseId: 'TEXT-13', width: 320, height: 250 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });
    test(`${viewport.caseId}: markering öppnar och centrerar objekt och samband före bekräftelsen`, async ({
      page,
    }, testInfo) => {
      let step = 0;
      let releaseSelection: (() => void) | undefined;
      const delayedSelection = new Promise<void>((resolve) => {
        releaseSelection = resolve;
      });
      const model = textModel(async () => {
        const turn = step++;
        if (turn === 4) await delayedSelection;
        if (turn % 2) return [modelMessage('Här är urvalet.')];
        return [
          modelTool('show_map_item', {
            kind: turn === 2 ? 'relationship' : 'object',
            id: turn === 2 ? 'uses' : 'lo',
          }),
        ];
      });
      const installation = await createInstallation(undefined, { modelFetch: model.provider });
      try {
        await signIn(page.request, installation.origin);
        const { household } = await (
          await createHousehold(page.request, installation.origin)
        ).json();
        const path = `${installation.origin}/api/households/${household.id}/map`;
        const read = async (): Promise<MapState> => (await page.request.get(path)).json();
        const initial = await read();
        for (const [id, name] of [
          ['lo', 'Lo Exempel'],
          ['music', 'Molnmusik'],
        ]) {
          expect(
            (
              await page.request.post(`${path}/draft`, {
                headers: { origin: installation.origin },
                data: {
                  version: (await read()).draft.version,
                  contentVersion: 1,
                  id,
                  baseRevision: null,
                  value: {
                    typeId: initial.types[0].id,
                    name,
                    properties: [
                      {
                        id: 'description',
                        label: 'Beskrivning',
                        kind: 'text' as const,
                        value: 'Påhittad uppgift',
                      },
                    ],
                  },
                },
              })
            ).ok(),
          ).toBe(true);
        }
        expect(
          (
            await page.request.post(`${path}/relationship`, {
              headers: { origin: installation.origin },
              data: {
                version: (await read()).draft.version,
                contentVersion: 1,
                id: 'uses',
                baseRevision: null,
                value: {
                  typeId: initial.relationshipTypes[0].id,
                  sourceId: 'lo',
                  targetId: 'music',
                },
              },
            })
          ).ok(),
        ).toBe(true);
        await page.goto(installation.origin);
        await startConversationWithText(page);
        const panel = page.getByRole('region', { name: 'Arbetsyta', exact: true });
        const textFeedback = page
          .getByRole('region', { name: 'Skriv till Skyttel', exact: true })
          .getByRole('region', { name: 'Utkastets återkoppling', exact: true });
        const acknowledgements: {
          displayed: boolean;
          kind: string;
          inspector: string | null;
          inspectorVisible: boolean;
          endpointsVisible: boolean;
          visible: boolean;
        }[] = [];
        await page.route('**/text-assistant/*/selection', async (route) => {
          const body = route.request().postDataJSON();
          const evidence = await page.evaluate((target: { kind: string; id: string }) => {
            const surface = document.querySelector('.spatial-surface');
            const node = surface?.querySelector(
              target.kind === 'object'
                ? `.spatial-node[data-object-id="${CSS.escape(target.id)}"]`
                : `.spatial-edge[data-layout-id="relationship-${CSS.escape(target.id)}"]`,
            );
            const bounds = surface?.getBoundingClientRect();
            const box = node?.getBoundingClientRect();
            const inspector = document.querySelector(
              `.map-inspector[data-selection-kind="${CSS.escape(target.kind)}"][data-selection-id="${CSS.escape(target.id)}"]`,
            );
            const detailSurface = inspector;
            const details = detailSurface?.getBoundingClientRect();
            const summary = inspector?.querySelector('p');
            const summaryBounds = summary?.getBoundingClientRect();
            const visibleBottom = innerHeight;
            const unobscured = (element: Element | null | undefined, rect: DOMRect | undefined) =>
              Boolean(
                element &&
                  rect &&
                  element.contains(
                    document.elementFromPoint(
                      rect.left + rect.width / 2,
                      rect.top + rect.height / 2,
                    ),
                  ),
              );
            const endpointsVisible = [
              'lo',
              ...(target.kind === 'relationship' ? ['music'] : []),
            ].every((id) => {
              const endpoint = surface?.querySelector(`.spatial-node[data-object-id="${id}"]`);
              const position = endpoint?.getBoundingClientRect();
              return Boolean(
                bounds &&
                  position &&
                  position.width > 0 &&
                  position.height > 0 &&
                  position.left >= bounds.left &&
                  position.right <= bounds.right &&
                  position.top >= bounds.top &&
                  position.bottom <= bounds.bottom &&
                  position.left >= 0 &&
                  position.right <= innerWidth &&
                  position.top >= 0 &&
                  position.bottom <= visibleBottom &&
                  unobscured(endpoint, position),
              );
            });
            return {
              geometry: {
                map: bounds?.toJSON(),
                selected: box?.toJSON(),
                inspector: details?.toJSON(),
              },
              inspector: inspector?.textContent ?? null,
              endpointsVisible,
              inspectorVisible: Boolean(
                details &&
                  summaryBounds &&
                  inspector?.checkVisibility() &&
                  detailSurface?.checkVisibility() &&
                  inspector.getAttribute('data-selection-id') === target.id &&
                  details.width > 0 &&
                  details.height > 0 &&
                  details.left >= 0 &&
                  details.right <= innerWidth &&
                  details.top >= 0 &&
                  details.bottom <= visibleBottom &&
                  summaryBounds.top >= details.top &&
                  summaryBounds.bottom <= details.bottom &&
                  unobscured(summary, summaryBounds),
              ),
              visible: Boolean(
                bounds &&
                  box &&
                  node?.checkVisibility() &&
                  box.width > 0 &&
                  box.left >= bounds.left &&
                  box.right <= bounds.right &&
                  box.top >= bounds.top &&
                  box.bottom <= bounds.bottom &&
                  box.top >= 0 &&
                  box.bottom <= visibleBottom &&
                  unobscured(node, box),
              ),
            };
          }, body);
          acknowledgements.push({ ...body, ...evidence });
          await testInfo.attach(`${body.kind}-display-geometry`, {
            body: JSON.stringify(evidence, null, 2),
            contentType: 'application/json',
          });
          await testInfo.attach(`${body.kind}-display`, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
          await route.continue();
        });
        const send = async (text: string) => {
          await openConversationText(page);
          const collapseTools = page.getByRole('button', {
            name: 'Dölj verktygens namn',
            exact: true,
          });
          if (await collapseTools.isVisible()) await collapseTools.click();
          await panel.getByLabel('Meddelande till Skyttel').fill(text);
          await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
        };
        await send('Visa Lo i kartan.');
        await expect.poll(() => acknowledgements.length, { timeout: 7_000 }).toBe(1);
        expect(acknowledgements[0]).toMatchObject({
          displayed: true,
          kind: 'object',
          inspector: expect.stringContaining('Lo Exempel'),
          inspectorVisible: true,
          endpointsVisible: true,
          visible: true,
        });
        await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toContainText(
          'Påhittad uppgift',
        );
        await page
          .getByRole('region', { name: 'Lo Exempel', exact: true })
          .getByRole('button', { name: 'Stäng uppgifterna', exact: true })
          .click();
        await openConversationText(page);
        await expect(textFeedback).toHaveCount(0);
        const mapStatus = page.getByRole('region', { name: 'Kartans status', exact: true });
        await expect(mapStatus).toContainText('Markerat i kartan.');
        await expect(page.locator('.spatial-node[data-object-id="lo"]')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await openMap(page);
        await page.getByRole('button', { name: 'Navigera', exact: true }).click();
        for (let index = 0; index < 16; index++)
          await page.getByRole('button', { name: 'Panorera vänster', exact: true }).click();
        await send('Visa sambandet mellan Lo och Molnmusik.');
        await expect.poll(() => acknowledgements.length, { timeout: 7_000 }).toBe(2);
        expect(acknowledgements[1]).toMatchObject({
          displayed: true,
          kind: 'relationship',
          inspector: expect.stringContaining(
            `Lo Exempel → ${initial.relationshipTypes[0].forwardLabel ?? initial.relationshipTypes[0].name} → Molnmusik`,
          ),
          inspectorVisible: true,
          endpointsVisible: true,
          visible: true,
        });
        if (viewport.width <= 700) {
          // The route records selection evidence before releasing the request.
          // Finish the turn before focusing: its reply and status change the
          // space available for native keyboard scrolling.
          await expect(
            page
              .getByRole('region', { name: 'Hela svaret som text', exact: true })
              .getByRole('article'),
          ).toHaveCount(2);
          await expect(page.locator('.conversation-row.working')).toHaveCount(0);
          const context = page.getByRole('region', { name: 'Kartans sammanhang', exact: true });
          await context.focus();
          await expect(context).toBeFocused();
          await expect
            .poll(() =>
              context.evaluate((element) => {
                const box = element.getBoundingClientRect();
                const reply = document
                  .querySelector('[aria-label="Hela svaret som text"]')
                  ?.getBoundingClientRect();
                return {
                  top: box.top,
                  bottom: box.bottom,
                  replyBottom: reply?.bottom ?? null,
                  belowReply: Boolean(reply && box.top >= reply.bottom),
                  // Native focus can round scrolling by a CSS pixel while
                  // the reply's reserved height is fractional.
                  withinViewport: box.bottom <= innerHeight + 1,
                  unobscured: element.contains(
                    document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
                  ),
                };
              }),
            )
            .toMatchObject({ belowReply: true, withinViewport: true, unobscured: true });
          await page.keyboard.press('End');
          const lastSymbol = context.getByText('Punkter: etikettens koppling');
          await expect
            .poll(() =>
              lastSymbol.evaluate((element) => {
                const box = element.getBoundingClientRect();
                return element.contains(
                  document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
                );
              }),
            )
            .toBe(true);
        }
        const before = await read();
        await send('Visa Lo igen.');
        await expect.poll(() => model.requests.length).toBe(5);
        await closeTextView(page);
        await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).focus();
        await page.keyboard.press('Enter');
        const relationshipForm = page.getByRole('dialog', {
          name: 'Samband för Lo Exempel',
          exact: true,
        });
        await expect(relationshipForm.getByLabel('Till objekt', { exact: true })).toHaveValue(
          'music',
        );
        await relationshipForm.getByLabel('Till objekt', { exact: true }).selectOption('lo');
        releaseSelection?.();
        await expect.poll(() => acknowledgements.length, { timeout: 7_000 }).toBe(3);
        expect(acknowledgements[2].displayed).toBe(false);
        await expect(relationshipForm.getByLabel('Till objekt', { exact: true })).toHaveValue('lo');
        expect(await read()).toEqual(before);
        await expect(textFeedback).toHaveCount(0);
        await expect(mapStatus).not.toContainText('Markerat i kartan.');
      } finally {
        releaseSelection?.();
        await installation.close();
      }
    });
  });
}
