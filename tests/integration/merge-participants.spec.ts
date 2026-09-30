import { expect, test } from '@playwright/test';
import type { MapState, ObjectValue } from '../../src/shared/map.js';
import { activatePanel, createHousehold, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('SAMMANSLAGNING-05: participant text survives merge and blocks discard until explicitly abandoned', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const propose = async (id: string, value: Partial<ObjectValue>) => {
      const state = await read();
      const before = state.objects.find((object) => object.id === id);
      expect(
        (
          await post('draft', {
            version: state.draft.version,
            id,
            baseRevision: before?.revision ?? null,
            value: { typeId: state.types[0].id, name: id, description: '', ...before, ...value },
          })
        ).status(),
      ).toBe(200);
    };
    await propose('a', { name: 'Första Lo', description: 'Första sparade uppgiften' });
    await propose('b', { name: 'Andra Lo', description: 'Andra sparade uppgiften' });
    expect(
      (
        await post('save', { version: (await read()).draft.version, operationId: 'initial' })
      ).status(),
    ).toBe(200);
    await propose('a', { description: 'Första privata uppgiften' });
    await propose('b', { description: 'Andra privata uppgiften' });
    await propose('independent', { name: 'Oberoende privat objekt' });
    const original = await read();
    await page.goto(installation.origin);
    await openWorkspace(page);
    const first = page.getByRole('region', { name: 'Första Lo', exact: true });
    const second = page.getByRole('region', { name: 'Andra Lo', exact: true });
    for (const [name, panel, text] of [
      ['Första Lo', first, 'Första oskickade texten'],
      ['Andra Lo', second, 'Andra oskickade texten'],
    ] as const) {
      await activatePanel(page, 'Lista och utkast');
      await page.getByRole('button', { name: `Uppgifter för ${name}`, exact: true }).click();
      await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      await panel.getByLabel('Beskrivning', { exact: true }).fill(text);
    }
    await activatePanel(page, 'Lista och utkast');
    await page.getByRole('button', { name: 'Slå samman objekt', exact: true }).click();
    const form = page.getByRole('region', { name: 'Sammanslagning', exact: true });
    await form.getByLabel('Objekt som behåller sin identitet').selectOption('a');
    await form.getByLabel('Objekt som tas in i det första').selectOption('b');
    await form.getByRole('combobox', { name: 'Välj Namn', exact: true }).selectOption('survivor');
    await form
      .getByRole('combobox', { name: 'Välj Beskrivning', exact: true })
      .selectOption('absorbed');
    await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
    await form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
    await expect(draft).toContainText('Samma företeelse är uttryckligen bekräftad');
    const merged = await read();
    expect(merged.objects).toEqual(original.objects);
    expect(merged.draft.changes.find((change) => change.id === 'a')?.after?.description).toBe(
      'Andra privata uppgiften',
    );
    const discard = draft.getByRole('button', { name: 'Kasta sammanslagningen för att rätta' });
    await expect(discard).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await openWorkspace(page);
    await activatePanel(page, 'Första Lo');
    await expect(first.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Första oskickade texten',
    );
    await expect(first.getByRole('alert')).toContainText('Formuläret bygger på ett äldre utkast');
    await expect(
      first.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }),
    ).toBeDisabled();
    await first.getByRole('button', { name: 'Stäng Första Lo', exact: true }).click();
    await activatePanel(page, 'Lista och utkast');
    await page.getByRole('button', { name: 'Uppgifter för Första Lo', exact: true }).click();
    await expect(first.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Första oskickade texten',
    );
    await activatePanel(page, 'Andra Lo');
    await expect(second.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Andra oskickade texten',
    );
    await expect(second.getByRole('alert')).toContainText('Formuläret bygger på ett äldre utkast');
    await expect(
      second.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }),
    ).toBeDisabled();
    const rejected = await post('draft', {
      version: merged.draft.version,
      contentVersion: merged.contentVersion,
      id: 'b',
      baseRevision: original.objects.find((object) => object.id === 'b')?.revision,
      value: {
        ...original.draft.changes.find((change) => change.id === 'b')?.after,
        description: 'Andra oskickade texten',
      },
    });
    expect(rejected.status()).toBe(409);
    expect(await rejected.json()).toMatchObject({ error: 'merge_review_required' });
    await expect(second.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Andra oskickade texten',
    );
    expect(await read()).toEqual(merged);
    await second.getByRole('button', { name: 'Stäng utan att skicka texten', exact: true }).click();
    await activatePanel(page, 'Lista och utkast');
    await expect(discard).toBeDisabled();
    await activatePanel(page, 'Första Lo');
    await expect(first.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Första oskickade texten',
    );
    await first.getByRole('button', { name: 'Stäng utan att skicka texten', exact: true }).click();
    await activatePanel(page, 'Lista och utkast');
    await expect(discard).toBeEnabled();
    await discard.click();
    await expect(draft).not.toContainText('Samma företeelse är uttryckligen bekräftad');
    const restored = await read();
    expect({
      ...restored.draft,
      changes: [...restored.draft.changes].sort((a, b) => a.id.localeCompare(b.id)),
    }).toEqual({
      ...original.draft,
      changes: [...original.draft.changes].sort((a, b) => a.id.localeCompare(b.id)),
      version: restored.draft.version,
    });
    expect(restored.objects).toEqual(original.objects);
    expect(restored.relationships).toEqual(original.relationships);
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    expect(await read()).toEqual(restored);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history).toHaveLength(1);
  } finally {
    await installation.close();
  }
});
