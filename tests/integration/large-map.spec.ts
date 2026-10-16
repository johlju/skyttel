import type { MapState } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject, readTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('STORKARTA-01: dense overview keeps readable labels and every object and relationship reachable', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
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
    await openMap(page);
    const baseline: MapState = await (await page.request.get(path)).json();
    expect(baseline.objects).toHaveLength(500);
    expect(baseline.relationships).toHaveLength(1500);
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
    await expect(
      page.getByText(/\d+ etiketter döljs för läsbarhet\./).filter({ visible: true }),
    ).toBeVisible();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Filter', exact: true }).click();
    const filter = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
    await filter.getByRole('checkbox', { name: 'Ta med upphörda', exact: true }).check();
    await filter.getByRole('button', { name: 'Stäng filter', exact: true }).click();
    const names = new Set<string>();
    const reachable = new Set<string>();
    const pages = table.getByRole('navigation', { name: 'Tabellsidor', exact: true });
    const accessibility = await page.context().newCDPSession(page);
    async function relationshipAccess() {
      const { nodes } = await accessibility.send('Accessibility.getFullAXTree');
      const region = nodes.find(
        (node) => node.role?.value === 'region' && node.name?.value === 'Hushållets tabell',
      );
      if (!region || region.ignored) return [];
      const byId = new Map(nodes.map((node) => [node.nodeId, node]));
      const pending = [...(region.childIds ?? [])];
      const entries = [];
      for (const id of pending) {
        const node = byId.get(id);
        if (!node) continue;
        pending.push(...(node.childIds ?? []));
        if (node.ignored || node.role?.value !== 'button') continue;
        if (!node.name?.value.startsWith('Samband för ')) continue;
        entries.push({
          role: node.role.value,
          name: node.name.value,
          description: node.description?.value,
          disabled:
            node.properties?.some(
              (property) => property.name === 'disabled' && property.value.value === true,
            ) ?? false,
        });
      }
      return entries;
    }
    for (let index = 1; index <= 10; index++) {
      await expect(pages).toContainText(`Sida ${index} av 10`);
      const buttons = table.locator('.household-table-row-toggle');
      await expect(buttons).toHaveCount(50);
      const expectedEntries = [];
      for (const name of await buttons.allTextContents()) {
        const clean = name.replace(/^[▾▸]/, '').trim();
        names.add(clean);
        const object = baseline.objects.find((object) => object.name === clean);
        if (!object) throw new Error(`Unknown visible object ${clean}`);
        const edges = baseline.relationships.filter(
          (edge) => edge.sourceId === object.id || edge.targetId === object.id,
        );
        expectedEntries.push({
          role: 'button',
          name: `Samband för ${clean}`,
          description: `${edges.length} samband`,
          disabled: false,
        });
        for (const edge of edges) reachable.add(edge.id);
      }
      // Chromium computes every role, name, description and enabled state in one
      // public accessibility-tree read per page instead of 100 serial assertions.
      await expect.poll(relationshipAccess).toEqual(expectedEntries);
      const sample = (await buttons.first().textContent())?.replace(/^[▾▸]/, '').trim();
      if (!sample) throw new Error('Each table page must contain a readable object');
      await table.getByRole('button', { name: `Samband för ${sample}`, exact: true }).click();
      const relations = page.getByRole('dialog', { name: `Samband för ${sample}`, exact: true });
      const object = baseline.objects.find((object) => object.name === sample);
      const edges = baseline.relationships.filter(
        (edge) => edge.sourceId === object?.id || edge.targetId === object?.id,
      );
      await expect(relations.locator('.household-read-relationships > li')).toHaveCount(
        edges.length,
      );
      await relations.getByRole('button', { name: 'Stäng samband', exact: true }).click();
      if (index < 10) await pages.getByRole('button', { name: 'Nästa', exact: true }).click();
    }
    await accessibility.detach();
    expect(names.size).toBe(500);
    expect(reachable.size).toBe(1500);
    await table
      .getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true })
      .fill('Provobjekt 499');
    await expect(table.locator('.household-table-row-toggle')).toHaveCount(1);
    const form = await editTableObject(page, 'Provobjekt 499');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Provobjekt 499');
    await form.getByLabel('Beskrivning', { exact: true }).fill('Oskickad text i den täta kartan');
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickad text i den täta kartan',
    );
    expect(await (await page.request.get(path)).json()).toEqual(baseline);
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const draft = await openDraftReview(page);
    await draft
      .getByRole('button', { name: 'Visa förslaget: Provobjekt 499', exact: true })
      .click();
    const proposal = page.getByRole('dialog', { name: 'Provobjekt 499', exact: true });
    await expect(proposal).toContainText('Oskickad text i den täta kartan');
    await proposal.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    const saved: MapState = await (await page.request.get(path)).json();
    expect(saved.objects).toHaveLength(500);
    expect(saved.relationships).toHaveLength(1500);
    expect(saved.objects.find((item) => item.id === 'large-499')?.description).toBe(
      'Oskickad text i den täta kartan',
    );
    expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history.at(-1).changes[0].after.description).toBe('Oskickad text i den täta kartan');
    await table
      .getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true })
      .fill('Provobjekt 499');
    await expect(await readTableObject(page, 'Provobjekt 499')).toContainText(
      'Oskickad text i den täta kartan',
    );
    await (await utilityButton(page, 'Rapporter')).click();
    const reports = page.getByRole('region', { name: 'Rapporter', exact: true });
    const savedChange = reports
      .getByRole('region', { name: 'Ändringshistorik', exact: true })
      .getByRole('article')
      .first();
    await expect(savedChange).toContainText('Provobjekt 499');
    await savedChange.getByText('Visa ändringarna', { exact: true }).click();
    await expect(savedChange).toContainText('Oskickad text i den täta kartan');
    await reports.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    const anonymous = await createPreparedContext(browser);
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto(installation.origin);
      await expect(
        anonymousPage.getByRole('heading', { name: 'Välkommen till Skyttel', exact: true }),
      ).toBeVisible();
      await expect(
        anonymousPage.getByRole('region', { name: 'Hushållets tabell', exact: true }),
      ).not.toBeVisible();
      await expect(anonymousPage.getByText('Provobjekt 499', { exact: true })).toHaveCount(0);
      expect((await anonymous.request.get(path)).status()).toBe(401);
      expect((await anonymous.request.get(`${path}/view`)).status()).toBe(401);
    } finally {
      await anonymous.close();
    }
    installation.revokeMembership(user.id);
    expect((await page.request.get(path)).status()).toBe(403);
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).not.toBeVisible();
  } finally {
    await installation.close();
  }
});
