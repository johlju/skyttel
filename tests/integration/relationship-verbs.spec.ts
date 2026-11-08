import type { MapState } from '../../src/shared/map.js';
import { closeTextView, createHousehold, openTable, signIn } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editObjectRelationship, openObjectRelationships } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

test('SAMBAND-22: free verbs between non-person objects remain independent of grouping and survive restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, {
        headers: { origin: installation.origin },
        data,
      });
    for (const [id, name, kind] of [
      ['website', 'Familjens webbplats', 'Tjänst'],
      ['hosting', 'Driftplattformen', 'Företag'],
    ]) {
      const state = await read();
      expect(
        (
          await post('draft', {
            version: state.draft.version,
            id,
            baseRevision: null,
            value: { name, typeId: state.types.find((type) => type.name === kind)?.id },
          })
        ).status(),
      ).toBe(200);
    }
    await page.goto(installation.origin);
    await openTable(page);
    for (const verb of ['körs hos', 'använder']) {
      const dialog = await openObjectRelationships(page, 'Familjens webbplats');
      await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      await dialog.getByLabel('Verb', { exact: true }).fill(verb);
      await dialog.getByLabel('Till objekt', { exact: true }).selectOption('hosting');
      await expect(dialog.getByLabel('Sambandet före inskickning')).toContainText(
        `Familjens webbplats ${verb} Driftplattformen`,
      );
      await stageRelationshipAndClose(page);
    }
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    let dialog = await openObjectRelationships(page, 'Familjens webbplats');
    await expect(
      dialog.getByRole('heading', {
        name: 'Familjens webbplats → körs hos → Driftplattformen',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('heading', {
        name: 'Familjens webbplats → använder → Driftplattformen',
        exact: true,
      }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    dialog = await editObjectRelationship(
      page,
      'Familjens webbplats',
      'Familjens webbplats → körs hos → Driftplattformen',
    );
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Betalar' });
    await expect(dialog.getByLabel('Verb', { exact: true })).toHaveValue('körs hos');
    await stageRelationshipAndClose(page);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    dialog = await openObjectRelationships(page, 'Driftplattformen');
    await expect(
      dialog.getByRole('heading', {
        name: 'Familjens webbplats → körs hos → Driftplattformen',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('heading', {
        name: 'Familjens webbplats → använder → Driftplattformen',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});
