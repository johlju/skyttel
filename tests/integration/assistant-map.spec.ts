import { expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });
    test('TEXT-08: markering öppnar och centrerar objekt och samband före bekräftelsen', async ({
      page,
    }, testInfo) => {
      let step = 0;
      const model = textModel(() => {
        const turn = step++;
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
                  value: { typeId: initial.types[0].id, name, description: 'Påhittad uppgift' },
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
                  knowledge: 'known',
                },
              },
            })
          ).ok(),
        ).toBe(true);
        await page.goto(installation.origin);
        const panel = page.getByRole('region', { name: 'Skyttels textassistent', exact: true });
        await panel.getByLabel(/Jag tillåter att OpenAI/).check();
        await panel.getByLabel(/Jag tillåter förslag och sparande/).check();
        await panel.getByRole('button', { name: 'Starta textassistenten', exact: true }).click();
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
            const inspector = document.querySelector('.map-inspector');
            const details = inspector?.getBoundingClientRect();
            const summary = inspector?.querySelector('p');
            const summaryBounds = summary?.getBoundingClientRect();
            const notice = document
              .querySelector('.assistant-work-indicator.is-working')
              ?.getBoundingClientRect();
            const visibleBottom = Math.min(innerHeight, notice?.top ?? innerHeight);
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
          if (body.displayed) {
            await testInfo.attach(`${body.kind}-display-geometry`, {
              body: JSON.stringify(evidence, null, 2),
              contentType: 'application/json',
            });
            await testInfo.attach(`${body.kind}-display`, {
              body: await page.screenshot(),
              contentType: 'image/png',
            });
          }
          await route.continue();
        });
        const send = async (text: string) => {
          await panel.getByLabel('Meddelande till textassistenten').fill(text);
          await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
        };
        await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
        await send('Visa Lo i kartan.');
        await expect(panel.getByRole('status')).toHaveText('Markerat i kartan.');
        expect(acknowledgements[0]).toMatchObject({
          displayed: true,
          kind: 'object',
          inspector: expect.stringContaining('Lo Exempel'),
          inspectorVisible: true,
          endpointsVisible: true,
          visible: true,
        });
        await expect(page.getByRole('region', { name: 'Val och redigering' })).toContainText(
          'Påhittad uppgift',
        );
        await page.getByText('Navigera rymden', { exact: true }).click();
        for (let index = 0; index < 16; index++)
          await page.getByRole('button', { name: 'Panorera vänster', exact: true }).click();
        await send('Visa sambandet mellan Lo och Molnmusik.');
        await expect.poll(() => acknowledgements.length).toBe(2);
        await expect(panel.getByRole('status')).toHaveText('Markerat i kartan.');
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
        await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
        await expect(page.getByLabel('Till objekt', { exact: true })).toHaveValue('music');
        await page.getByLabel('Till objekt', { exact: true }).selectOption('lo');
        await send('Visa Lo igen.');
        await expect.poll(() => acknowledgements.length).toBe(3);
        expect(acknowledgements[2].displayed).toBe(false);
        await expect(page.getByLabel('Till objekt', { exact: true })).toHaveValue('lo');
        await expect(panel.getByRole('status')).not.toContainText('Markerat');
      } finally {
        await installation.close();
      }
    });
  });
}
